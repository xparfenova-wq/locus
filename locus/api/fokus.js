const {createHash,createHmac,randomUUID}=require('node:crypto');
const {baza,v_api,OshibkaVvoda,NeNajdeno,NetDostupa,Konflikt,v_odnoj_tranzakcii}=require('../db/db.js');
const calendar=require('./kalendar.js'),time=require('../public/js/focus-time.js');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const moment=()=>new Date().toISOString().replace('T',' ').replace('Z','');
function fields(value,allowed){for(const key of Object.keys(value||{}))if(!allowed.includes(key))throw new OshibkaVvoda('Неизвестное поле таймера',key);}
function positive(value,field){if(typeof value==='boolean'||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new OshibkaVvoda('Нужен номер записи',field);return Number(value);}
function actor(ctx){const id=positive(ctx.avtor,'avtor');for(const value of [ctx.telo?.chelovek_id,ctx.zapros?.chelovek_id])if(value!==undefined&&positive(value,'chelovek_id')!==id)throw new NetDostupa('Личные сессии доступны только их владельцу');return id;}
function key(value){if(!uuid(value))throw new OshibkaVvoda('Обнови страницу перед действием таймера','zapros_kljuch');return createHash('sha256').update(value.toLowerCase()).digest('hex');}
function digest(value,operation,body){return createHmac('sha256',value.toLowerCase()).update(JSON.stringify({operation,body:Object.fromEntries(Object.keys(body).filter(k=>k!=='zapros_kljuch').sort().map(k=>[k,body[k]]))})).digest('hex');}
function receipt(db,id,value){return db.prepare('SELECT * FROM zaprosy_fokusa WHERE avtor=? AND kljuch_hesh=?').get(id,key(value));}
function proof(db,saved){
 if(!saved.operacija)return {sostojanie:'otmeneno'};
 const stored=JSON.parse(saved.itog_json),current=db.prepare('SELECT * FROM fokus_sessii WHERE id=?').get(saved.sessija_id),removed=!current||current.chelovek_id!==saved.avtor||current.identifikator!==saved.identifikator||current.nachalo!==stored.sessija.nachalo;
 return {sostojanie:'sohraneno',operacija:saved.operacija,udaleno:removed,sessija:stored.sessija,...(!removed?{tekuschaja:present(current)}:{})};
}
function present(row){const out={...time.describe(v_api(row)),po_limitu:require('./fokus-limit.js').automatic(row)};try{out.dlinnaja=!row.konec&&Date.now()-time.instant(row.nachalo)>43200000;}catch{out.dlinnaja=false;}return out;}
function day(row){try{return calendar.den_moskvy(new Date(time.instant(row.konec||row.nachalo)));}catch{return null;}}
function minutes(rows){let total=0;for(const row of rows){try{total+=time.active(row);}catch{return null;}}return Math.round(total/60000);}
function credited(row){return !!row.konec&&row.zachtena===1&&row.rezhim==='fokus';}
function ownRows(db,id){return db.prepare('SELECT * FROM fokus_sessii WHERE chelovek_id=? ORDER BY id DESC').all(id);}
function todayRows(db,id){const today=calendar.den_moskvy();return ownRows(db,id).filter(row=>day(row)===today).map(present);}
function ranking(db,week){
 const people=db.prepare("SELECT l.id,l.imja,l.foto FROM ljudi l JOIN nastrojki n ON n.chelovek_id=l.id WHERE l.komanda=1 AND COALESCE(l.arhiv,0)=0 AND n.pokazyvat_v_rejtinge_fokusa=1").all();
 const rows=db.prepare("SELECT * FROM fokus_sessii WHERE konec IS NOT NULL AND zachtena=1 AND rezhim='fokus'").all(),results=[];
 for(const person of people){const sessions=rows.filter(row=>row.chelovek_id===person.id&&day(row)>=week.nachalo&&day(row)<=week.konec);if(!sessions.length)continue;results.push({chelovek_id:person.id,imja:person.imja,foto:person.foto,sessij:sessions.length,minut:minutes(sessions)});}
 return results.sort((a,b)=>(b.minut??-1)-(a.minut??-1)||b.sessij-a.sessij||a.imja.localeCompare(b.imja,'ru'));
}
function read(ctx){
 const db=baza(),id=actor(ctx);fields(ctx.zapros,['chelovek_id','den','nedelja','god','sprint','period']);if(ctx.zapros.period!==undefined&&ctx.zapros.period!=='nedelja')throw new OshibkaVvoda('Рейтинг считается за неделю','period');
 const today=ctx.zapros.den||calendar.den_moskvy();calendar.data(today);const week=calendar.nedelja_iz_zaprosa(ctx.zapros,today),rating=ranking(db,week);
 if(ctx.kljuch==='rejting')return {telo:{nedelja:week.nomer,god:week.god,nachalo:week.nachalo,konec:week.konec,spisok:rating}};
 const rows=ownRows(db,id),open=rows.filter(row=>!row.konec),valid=rows.filter(credited),daily=valid.filter(row=>day(row)===today),weekly=valid.filter(row=>day(row)>=week.nachalo&&day(row)<=week.konec),days=new Set(valid.map(day).filter(Boolean));
 let streak=0,current=days.has(today)?today:calendar.sdvinut_den(today,-1);while(days.has(current)){streak++;current=calendar.sdvinut_den(current,-1);}
 return {telo:{pokazyvat_v_rejtinge_fokusa:db.prepare('SELECT pokazyvat_v_rejtinge_fokusa value FROM nastrojki WHERE chelovek_id=?').get(id)?.value===1,teper:moment(),idet:open.length>0,sessija:open.length?present(open[0]):null,drugie_otkrytye:open.slice(1).map(present),segodnja_sessij:daily.length,segodnja_minut:minutes(daily),za_sprint_sessij:weekly.length,za_sprint_minut:minutes(weekly),god:week.god,nedelja:week.nomer,nachalo_nedeli:week.nachalo,konec_nedeli:week.konec,dnej_podrjad:streak,rezhimy:Object.entries(time.lengths).map(([kod,minut])=>({kod,minut})),rejting:rating,poslednie:rows.filter(row=>row.konec).sort((a,b)=>{try{return time.instant(b.nachalo)-time.instant(a.nachalo);}catch{return b.id-a.id;}}).slice(0,10).map(present)}};
}
function check(ctx,cancel=false){
 const db=baza(),id=actor(ctx),body=cancel?ctx.telo:ctx.zapros;fields(body,['zapros_kljuch','chelovek_id']);
 const run=()=>{let r=receipt(db,id,body.zapros_kljuch);if(cancel&&!r){db.prepare('INSERT INTO zaprosy_fokusa(avtor,kljuch_hesh,sozdano)VALUES(?,?,?)').run(id,key(body.zapros_kljuch),moment());r=receipt(db,id,body.zapros_kljuch);}return {telo:r?proof(db,r):{sostojanie:'ne_najdeno'}};};
 return cancel?v_odnoj_tranzakcii(db,run):run();
}
function validateTask(db,id,owner){return id==null?null:require('./fokus-zadacha.js').ownTask(db,{id},owner).id;}
function change(ctx){
 const db=baza(),id=actor(ctx),body=ctx.telo||{},operation=ctx.kljuch;
 return v_odnoj_tranzakcii(db,()=>{
  fields(body,operation==='start'?['chelovek_id','zapros_kljuch','rezhim','zadacha_id']:['chelovek_id','zapros_kljuch','id','versija','identifikator','otkryta_s']);
  const saved=receipt(db,id,body.zapros_kljuch);if(saved){if(!saved.operacija)throw new Konflikt('Попытка отменена. Начни новое действие',{action_cancelled:true});if(saved.operacija!==operation||saved.zapros_hesh!==digest(body.zapros_kljuch,operation,body))throw new Konflikt('Под ключом отправлено другое действие',{operation_key_reused:true});return {telo:proof(db,saved)};}
  let row;const now=moment();
  if(operation==='start'){
   if(!Object.hasOwn(time.lengths,body.rezhim))throw new OshibkaVvoda('Выбери фокус, перерыв или длинный перерыв','rezhim');
   if(db.prepare('SELECT id FROM fokus_sessii WHERE chelovek_id=? AND konec IS NULL').get(id))throw new Konflikt('Сессия уже идёт. Прочитай текущий таймер');
   const task=validateTask(db,body.zadacha_id,id),result=db.prepare('INSERT INTO fokus_sessii(chelovek_id,zadacha_id,rezhim,nachalo,zachtena,identifikator)VALUES(?,?,?,?,0,?)').run(id,task,body.rezhim,now,randomUUID());row=db.prepare('SELECT * FROM fokus_sessii WHERE id=?').get(result.lastInsertRowid);
  }else{
   const session=positive(body.id,'id');row=db.prepare('SELECT * FROM fokus_sessii WHERE id=? AND chelovek_id=?').get(session,id);if(!row)throw new NeNajdeno('Своей сессии с таким номером нет');
   if(positive(body.versija,'versija')!==row.versija||body.identifikator!==row.identifikator||body.otkryta_s!==row.nachalo)throw new Konflikt('Таймер уже изменился. Прочитай текущее состояние');
   if(row.konec)throw new Konflikt('Эта сессия уже закрыта. Новая не изменена');
   const policy=require('./fokus-limit.js');
   if(['pause','resume'].includes(operation)&&policy.due(db,row))throw new Konflikt('Истёк предел сессии. Прочитай состояние после автоматического завершения');
   if(['stop','reset'].includes(operation)&&policy.closeDue(db,row))row=db.prepare('SELECT * FROM fokus_sessii WHERE id=?').get(session);
   else{
   let pause=row.pauza_ms,paused=row.pauza_s,end=null,credit=0;
   if(operation==='pause'){if(paused)throw new Konflikt('Таймер уже на паузе');time.active(row);paused=now;}
   else if(operation==='resume'){if(!paused)throw new Konflikt('Таймер уже идёт');time.active(row);pause+=Math.max(0,time.instant(now)-time.instant(paused));paused=null;}
   else{
    end=now;if(operation!=='reset'){const active=time.active(row),wall=time.instant(now)-time.instant(row.nachalo);credit=active>=time.lengths[row.rezhim]*60000&&wall<=86400000?1:0;}
    if(paused){try{pause+=Math.max(0,time.instant(now)-time.instant(paused));}catch{if(operation!=='reset')throw new Konflikt('Не подтверждено время паузы');}paused=null;}
   }
   db.prepare('UPDATE fokus_sessii SET pauza_s=?,pauza_ms=?,konec=?,zachtena=?,versija=versija+1,identifikator=COALESCE(identifikator,?) WHERE id=?').run(paused,pause,end,credit,randomUUID(),session);row=db.prepare('SELECT * FROM fokus_sessii WHERE id=?').get(session);
   }
  }
  const result={sessija:present(row)};db.prepare('INSERT INTO zaprosy_fokusa(avtor,kljuch_hesh,operacija,zapros_hesh,sessija_id,identifikator,itog_json,sozdano)VALUES(?,?,?,?,?,?,?,?)').run(id,key(body.zapros_kljuch),operation,digest(body.zapros_kljuch,operation,body),row.id,row.identifikator,JSON.stringify(result),now);
  return {kod:operation==='start'?201:200,telo:proof(db,receipt(db,id,body.zapros_kljuch))};
 });
}
function handle(ctx){
 if(ctx.metod==='GET'){if(ctx.kljuch==='proverka')return check(ctx);if(!ctx.kljuch||ctx.kljuch==='rejting')return read(ctx);}
 if(ctx.metod==='POST'){if(ctx.kljuch==='otmena_popytki')return check(ctx,true);if(['start','pause','resume','stop','reset'].includes(ctx.kljuch))return change(ctx);}
 throw Object.assign(new Error('Метод таймера не поддерживается'),{kod:405});
}
module.exports={handle,todayRows,present};
