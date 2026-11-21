                                                                                  
                                                                            
const {OshibkaVvoda,NeNajdeno,Konflikt,v_odnoj_tranzakcii}=require('../db/db.js');
const time=require('./vremja-obschenija.js');
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const snapshot=row=>row.srez===null?null:parse(row.srez);
function cursorRead(value){
 if(typeof value!=='string'||value.length>1600||!/^[\w-]+$/.test(value))throw new OshibkaVvoda('Некорректная страница истории','prodolzhit');
 const data=parse(Buffer.from(value,'base64url').toString('utf8'));
 if(!data||data.v!==1||!positive(data.person)||!positive(data.actor)||!Number.isSafeInteger(data.head)||data.head<0||!Number.isSafeInteger(data.taskHead)||data.taskHead<0||typeof data.money!=='boolean'||!(data.role===null||positive(data.role))||typeof data.scope!=='string'||!/^[a-f0-9]{64}$/.test(data.scope)||typeof data.last!=='string'||data.last.length>100)throw new OshibkaVvoda('Некорректная страница истории','prodolzhit');
 return data;
}
function chitat(db,person,query={},actor){return v_odnoj_tranzakcii(db,()=>vnutri(db,person,query,actor));}
function vnutri(db,person,query,actor){
 person=positive(person);if(!person||!db.prepare('SELECT 1 FROM ljudi WHERE id=?').get(person))throw new NeNajdeno('Человека нет');
 const limit=query.skolko===undefined?100:positive(query.skolko);if(!limit||limit>500)throw new OshibkaVvoda('Количество записей от 1 до 500','skolko');
 const role=query.sotrudnichestvo_id===undefined?null:positive(query.sotrudnichestvo_id);if(query.sotrudnichestvo_id!==undefined&&!role)throw new OshibkaVvoda('Некорректное сотрудничество','sotrudnichestvo_id');
 const money=db.prepare('SELECT dostup FROM ljudi WHERE id=?').get(actor)?.dostup==='polnyj';
 const currentHead=db.prepare('SELECT COALESCE(MAX(id),0) n FROM zhurnal').get().n,currentTaskHead=db.prepare('SELECT COALESCE(MAX(id),0) n FROM zadachi').get().n;
 const page=query.prodolzhit===undefined?null:cursorRead(query.prodolzhit);
 if(page&&(page.person!==person||page.actor!==actor||page.money!==money||page.role!==role||page.head>currentHead||page.taskHead>currentTaskHead))throw new Konflikt('История изменилась. Обнови её.',{istorija_obnovit:true});
 const head=page?.head??currentHead,taskHead=page?.taskHead??currentTaskHead;
 const roles=db.prepare('SELECT id,chelovek_id,napravlenie,rol FROM sotrudnichestva WHERE chelovek_id=?').all(person),roleMap=new Map(roles.map(r=>[r.id,r]));
 const tasks=db.prepare(`SELECT id,nomer,nazvanie,klient_id,sotrudnichestvo_id,napravlenie,status,udaleno FROM zadachi WHERE id<=? AND
  (klient_id=? OR (klient_id IS NULL AND sotrudnichestvo_id IN (SELECT id FROM sotrudnichestva WHERE chelovek_id=?)))`).all(taskHead,person,person),taskMap=new Map(tasks.map(r=>[r.id,r]));
                                                                                        
 const journal=db.prepare(`SELECT z.*,l.imja kto_imja FROM zhurnal z LEFT JOIN ljudi l ON l.id=z.kto WHERE z.id<=? AND (
  (z.srez IS NOT NULL AND (json_extract(z.srez,'$.chelovek_id')=? OR json_extract(z.srez,'$.chelovek_id_do')=?)) OR
  (z.srez IS NULL AND ((z.obekt='chelovek' AND z.obekt_id=?) OR
   (z.obekt='sotrudnichestvo' AND z.obekt_id IN (SELECT id FROM sotrudnichestva WHERE chelovek_id=?)) OR
   (z.obekt='zadacha' AND z.obekt_id IN (SELECT id FROM zadachi WHERE id<=? AND (klient_id=? OR (klient_id IS NULL AND sotrudnichestvo_id IN (SELECT id FROM sotrudnichestva WHERE chelovek_id=?))))) OR
   (z.obekt='proekt' AND z.obekt_id IN (SELECT id FROM proekty WHERE klient_id=?)) OR
   (z.obekt='kontakt' AND z.obekt_id IN (SELECT id FROM kontakty WHERE chelovek_id=?))))) ORDER BY z.id`).all(head,person,person,person,person,taskHead,person,person,person,person);
 const eventTaskIds=[...new Set(journal.filter(j=>j.obekt==='zadacha').map(j=>j.obekt_id))];
                                                                                        
 if(eventTaskIds.length){const extra=db.prepare(`SELECT id,nomer,nazvanie,klient_id,sotrudnichestvo_id,napravlenie,status,udaleno FROM zadachi WHERE id<=? AND id IN (SELECT obekt_id FROM zhurnal WHERE obekt='zadacha' AND id<=? AND srez IS NOT NULL AND (json_extract(srez,'$.chelovek_id')=? OR json_extract(srez,'$.chelovek_id_do')=?))`).all(taskHead,head,person,person);for(const row of extra)taskMap.set(row.id,row);}
 const ids=[...new Set([...taskMap.keys(),...eventTaskIds])],seen=new Set(journal.map(j=>j.id));
 if(ids.length){for(const row of db.prepare("SELECT z.*,l.imja kto_imja FROM zhurnal z LEFT JOIN ljudi l ON l.id=z.kto WHERE z.id<=? AND z.obekt='zadacha' AND z.obekt_id IN (SELECT value FROM json_each(?))").all(head,JSON.stringify(ids))){if(!seen.has(row.id))journal.push(row);}journal.sort((a,b)=>a.id-b.id);}
                                                                                     
 const changed=new Set(db.prepare(`SELECT DISTINCT obekt,obekt_id FROM zhurnal WHERE (obekt='zadacha' AND pole IN ('klient_id','sotrudnichestvo_id','napravlenie')) OR (obekt='sotrudnichestvo' AND pole IN ('chelovek_id','napravlenie','rol') AND COALESCE(bylo,'')<>'') OR (obekt='proekt' AND pole IN ('klient_id','napravlenie'))`).all().map(r=>r.obekt+':'+r.obekt_id));
 for(const row of db.prepare("SELECT DISTINCT tablica,obekt_id FROM versii_polej WHERE (tablica='zadachi' AND pole IN ('klient_id','sotrudnichestvo_id','napravlenie')) OR (tablica='sotrudnichestva' AND pole IN ('chelovek_id','napravlenie','rol')) OR (tablica='proekty' AND pole IN ('klient_id','napravlenie'))").all())changed.add(({zadachi:'zadacha',sotrudnichestva:'sotrudnichestvo',proekty:'proekt'})[row.tablica]+':'+row.obekt_id);
 const projects=new Map(db.prepare('SELECT id,klient_id,napravlenie,nazvanie FROM proekty WHERE klient_id=?').all(person).map(r=>[r.id,r]));
 const {DENEZHNYE,TABLICA_OBEKTA,PODPIS_OBEKTA}=require('./obschij.js'),events=[],taskState=new Map(),closureCount=new Map(),now=Date.now();
 function context(j){
  const saved=snapshot(j);if(saved)return saved;
  const row=j.obekt==='zadacha'?taskMap.get(j.obekt_id):j.obekt==='sotrudnichestvo'?roleMap.get(j.obekt_id):j.obekt==='proekt'?projects.get(j.obekt_id):null;
  const result={chelovek_id:person,kontekst_ne_podtverzhden:changed.has(j.obekt+':'+j.obekt_id)};
  if(row){result.napravlenie=row.napravlenie;result.nazvanie=row.nazvanie;result.nomer=row.nomer;
   if(j.obekt==='sotrudnichestvo'){result.sotrudnichestvo_id=row.id;result.rol=row.rol;}
   if(j.obekt==='zadacha'&&row.sotrudnichestvo_id){const s=roleMap.get(row.sotrudnichestvo_id);if(s&&s.napravlenie===row.napravlenie){result.sotrudnichestvo_id=s.id;result.rol=s.rol;if(changed.has('sotrudnichestvo:'+s.id))result.kontekst_ne_podtverzhden=true;}else result.svjaz_ne_podtverzhdena=true;}
  }return result;
 }
 function base(j,ctx){
  const date=time.prochitat(j.kogda),valid=date&&date.moment<=now+1000;
  return {kljuch:'j:'+j.id,zhurnal_id:j.id,obekt:j.obekt,obekt_id:j.obekt_id,pole:j.pole,bylo:j.bylo,stalo:j.stalo,kto:j.kto,kto_imja:j.kto_imja??null,kogda:valid?j.kogda:null,moment:valid?date.moment:null,data_neizvestna:!valid,vremja_neizvestno:valid?String(j.kogda).trim().length===10:true,
   chto:PODPIS_OBEKTA[j.obekt]||j.obekt,napravlenie:ctx.napravlenie??null,sotrudnichestvo_id:ctx.sotrudnichestvo_id??null,rol:ctx.rol??null,kontekst_ne_podtverzhden:!!ctx.kontekst_ne_podtverzhden,svjaz_ne_podtverzhdena:!!ctx.svjaz_ne_podtverzhdena};
 }
 function closed(j,ctx,key,unknown=false){
  if(ctx.chelovek_id!==person)return;
  const task=taskMap.get(j.obekt_id);events.push({...base(j,ctx),kljuch:key||'j:'+j.id,tip:'zadachi',id:j.obekt_id,nomer:ctx.nomer??task?.nomer??null,nazvanie:ctx.nazvanie??task?.nazvanie??'Задача',udaleno:!task||!!task.udaleno,...(unknown?{kto:null,kto_imja:null,kogda:null,moment:null,data_neizvestna:true,vremja_neizvestno:true}:{})});
 }
 for(const j of journal){
  if(!money&&(DENEZHNYE[TABLICA_OBEKTA[j.obekt]]||[]).includes(j.pole))continue;
  const ctx=context(j),after=ctx.chelovek_id===person,before=ctx.chelovek_id_do===person;
  if(j.obekt==='zadacha'){
   const state=taskState.get(j.obekt_id),status=j.pole==='status',annotation=j.pole==='kasanie'&&j.stalo==='отмечено',isClose=status&&j.stalo==='sdelano';
   if(status&&j.bylo==='sdelano'&&state!==true&&!closureCount.get(j.obekt_id))closed(j,ctx.do||ctx,'gap:'+j.id,true);
   if(isClose||annotation){
    if(state!==true){closed(j,ctx);closureCount.set(j.obekt_id,(closureCount.get(j.obekt_id)||0)+1);}taskState.set(j.obekt_id,true);
    continue;
   }
   if(status)taskState.set(j.obekt_id,j.stalo==='sdelano');
  }
  if(!after&&!before)continue;
                                                                                 
  const shown=after?ctx:ctx.do||{...ctx,chelovek_id:person,sotrudnichestvo_id:null,rol:null};
  events.push({...base(j,shown),tip:'izmenenie',...(j.obekt==='zadacha'?{nomer:ctx.nomer??taskMap.get(j.obekt_id)?.nomer??null,nazvanie:ctx.nazvanie??taskMap.get(j.obekt_id)?.nazvanie??null}:{})});
 }
                                                                                    
 const futureStatus=new Map();for(const row of db.prepare(`SELECT obekt_id,bylo FROM zhurnal WHERE id>? AND obekt='zadacha' AND pole='status' ORDER BY id`).all(head)){if(!futureStatus.has(row.obekt_id))futureStatus.set(row.obekt_id,row.bylo);}
 for(const task of tasks){const atHead=futureStatus.has(task.id)?futureStatus.get(task.id):task.status;if(atHead==='sdelano'&&!closureCount.get(task.id))closed({id:0,obekt:'zadacha',obekt_id:task.id,pole:'status',bylo:null,stalo:'sdelano',kto:null,kogda:null},context({obekt:'zadacha',obekt_id:task.id,srez:null}),'legacy:'+task.id,true);}
                                                                               
                                                                                 
 const contacts=db.prepare('SELECT id,tip FROM kontakty WHERE chelovek_id=? ORDER BY id').all(person);
 const scope=require('node:crypto').createHash('sha256').update(JSON.stringify([roles.map(r=>[r.id,r.napravlenie,r.rol]).sort((a,b)=>a[0]-b[0]),tasks.map(t=>[t.id,t.klient_id,t.sotrudnichestvo_id,t.napravlenie,futureStatus.has(t.id)?futureStatus.get(t.id):t.status]).sort((a,b)=>a[0]-b[0]),[...projects.values()].map(r=>[r.id,r.napravlenie]).sort((a,b)=>a[0]-b[0]),contacts])).digest('hex');
 if(page&&page.scope!==scope)throw new Konflikt('Связи в истории изменились. Обнови её.',{istorija_obnovit:true});
 const moment=row=>row.kogda?time.prochitat(row.kogda).moment:-Infinity;
 events.sort((a,b)=>moment(b)-moment(a)||(b.zhurnal_id??0)-(a.zhurnal_id??0)||a.kljuch.localeCompare(b.kljuch));
 if(role&&!roleMap.has(role)&&!events.some(e=>e.sotrudnichestvo_id===role))throw new NeNajdeno('У человека нет такого сотрудничества');
 const visible=role?events.filter(e=>e.sotrudnichestvo_id===role):events;
 const start=page?visible.findIndex(e=>e.kljuch===page.last)+1:0;if(page&&start===0)throw new Konflikt('История изменилась. Обнови её.',{istorija_obnovit:true});
 const list=visible.slice(start,start+limit),more=start+list.length<visible.length;
 const po_roljam=Object.fromEntries(roles.map(r=>{const own=events.filter(e=>e.sotrudnichestvo_id===r.id);return[r.id,{spisok:own.slice(0,3),vsego:own.length}];}));
 return {spisok:list,vsego:visible.length,po_roljam,prodolzhit:more?Buffer.from(JSON.stringify({v:1,person,actor,money,role,head,taskHead,scope,last:list.at(-1).kljuch})).toString('base64url'):null};
}
module.exports={chitat};
