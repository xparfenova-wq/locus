                                                                                
                                                                                
const {createHash,randomUUID,createHmac}=require('node:crypto');
const {baza,OshibkaVvoda,NeNajdeno,Konflikt,NetDostupa,v_odnoj_tranzakcii,seichas}=require('../db/db.js');
const resources={celi:'cel',rezultaty:'rezultat'},hash=v=>createHash('sha256').update(v).digest('hex');
function key(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного удаления','zapros_kljuch');return value.toLowerCase();}
function stored(value){
 if(typeof value==='bigint')return value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):{$locus_sqlite:'integer',value:String(value)};
 if(typeof value==='number'&&!Number.isFinite(value))return {$locus_sqlite:'real',value:String(value)};
 if(ArrayBuffer.isView(value))return {$locus_sqlite:'blob',value:Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString('base64')};
 return value;
}
function native(value){if(value&&typeof value==='object'&&value.$locus_sqlite){if(value.$locus_sqlite==='integer')return BigInt(value.value);if(value.$locus_sqlite==='real')return Number(value.value);if(value.$locus_sqlite==='blob')return Buffer.from(value.value,'base64');}return value;}
function rows(db,sql,...args){const statement=db.prepare(sql);statement.setReadBigInts(true);return statement.all(...args).map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,stored(v)])));}
function event(db,table,id){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt=? AND obekt_id=? AND pole='sozdano'").get(resources[table]||({zamery:'zamer',zadachi:'zadacha'})[table],id)?.id??null;}
function graph(db,table,id){
 if(!resources[table])throw new OshibkaVvoda('Нужна цель или результат');
 const root=rows(db,'SELECT * FROM '+table+' WHERE id=?',id)[0];if(!root)throw new NeNajdeno('Записи больше нет');
 const goal=table==='celi'?root:rows(db,'SELECT * FROM celi WHERE id=?',root.cel_id)[0];if(!goal)throw new NeNajdeno('Цели больше нет');
 const results=table==='celi'?rows(db,'SELECT * FROM rezultaty WHERE cel_id=? ORDER BY id',id):[root],ids=results.map(r=>r.id);
 const measurements=ids.length?rows(db,'SELECT * FROM zamery WHERE rezultat_id IN('+ids.map(()=>'?').join(',')+') ORDER BY id',...ids):[];
 const tasks=rows(db,'SELECT * FROM zadachi WHERE '+(table==='celi'?'cel_id=? OR rezultat_id IN(SELECT id FROM rezultaty WHERE cel_id=?)':'rezultat_id=?')+' ORDER BY id',...(table==='celi'?[id,id]:[id]));
 const periodPlans=ids.length?rows(db,'SELECT * FROM plany_periodov_okr WHERE rezultat_id IN('+ids.map(()=>'?').join(',')+') ORDER BY rezultat_id,period_id',...ids):[];
 return {format:1,table,id,root,goal,results,measurements,tasks,periodPlans,money:results.some(r=>require('./dengi-okr.js').isMoney(db,r)),epochs:[...results.map(r=>['rezultaty',r.id,event(db,'rezultaty',r.id)]),...measurements.map(r=>['zamery',r.id,event(db,'zamery',r.id)])],creation:event(db,table,id),goal_creation:event(db,'celi',goal.id)};
}
function fingerprint(g){return hash(JSON.stringify({table:g.table,id:g.id,root:[g.root.id,g.root.versija,g.creation],goal:[g.goal.id,g.goal.versija,g.goal.period_id,g.goal.napravlenie,g.goal_creation],results:g.results.map(r=>[r.id,r.versija]),measurements:g.measurements.map(r=>r.id),tasks:g.tasks.map(r=>[r.id,r.versija]),periodPlans:g.periodPlans||[]}));}
function preview(db,table,row){const g=graph(db,table,row.id);return {kontekst_udalenija:fingerprint(g),svjazano_pri_udalenii:{rezultatov:g.results.length,zamerov:g.measurements.length,zadach:g.tasks.length,periodnyh_planov:g.periodPlans.length}};}
function open(db,g){
 const current=db.prepare('SELECT * FROM celi WHERE id=?').get(g.goal.id),period=current?.period_id??g.goal.period_id;
 if(period&&db.prepare('SELECT zakryt FROM periody WHERE id=?').get(String(period))?.zakryt)throw new Konflikt('Период закрыт, цели, результаты и замеры доступны только для чтения');
 if(g.table==='rezultaty'&&(!current||event(db,'celi',g.goal.id)!==g.goal_creation||current.period_id!==g.goal.period_id||current.napravlenie!==g.goal.napravlenie))throw new Konflikt('Цель изменилась. Восстановление результата не применено');
}
function rights(db,g,actor){
 if(!require('./dengi-dostup.js').vidit(db,actor)&&(g.money||g.results.some(r=>require('./dengi-okr.js').isMoney(db,r))))throw new NetDostupa('У тебя доступ без денег');
 require('./pravila-otveta.js').proverit(db,{tablica:'celi',kljuch:g.goal.id,metod:'GET',avtor:actor,telo:{},zapros:{}});
}
function find(db,actor,value){
 const normalized=key(value),digest=hash(normalized),safe='CASE WHEN json_valid(srez) THEN srez ELSE NULL END';
 const row=db.prepare("SELECT * FROM zhurnal WHERE kto=? AND json_type("+safe+",'$.otmena_okr')='object' AND (json_extract("+safe+",'$.otmena_okr.kljuch_hesh')=? OR json_extract("+safe+",'$.dejstvie_id')=?) ORDER BY id DESC LIMIT 1").get(actor,digest,normalized);
 if(!row)return null;const context=JSON.parse(row.srez);return {row,context,snapshot:context.otmena_okr};
}
function proof(db,record,value){
 const s=record.snapshot,current=db.prepare('SELECT id FROM '+s.table+' WHERE id=?').get(s.id),original=current&&event(db,s.table,s.id)===s.creation;
 const goal=db.prepare('SELECT period_id,napravlenie FROM celi WHERE id=?').get(s.goal.id)||s.goal;
 return {tip:'udalenie_okr',cel_id:s.goal.id,period_id:goal.period_id,napravlenie:goal.napravlenie,dejstvie_id:value,najdeno:true,udaleno:!current,otmeneno:!!s.vernuto,obekt:s.table,id:s.id,vernuto:s.vernuto?s.results.length+s.measurements.length+(s.table==='celi'?1:0):0,sostojanie:s.vernuto?(original?'vosstanovleno':current?'zapis_zamenena':'pozdnee_udaleno'):current?'nomer_zanjat':'udaleno',svjazano:{rezultatov:s.results.length,zamerov:s.measurements.length,zadach:s.tasks.length}};
}
function check(query,actor){
 if(Object.keys(query).some(k=>k!=='dejstvie_id'))throw new OshibkaVvoda('Нужен только ключ действия','dejstvie_id');
 const db=baza(),record=find(db,actor,query.dejstvie_id);if(!record)return null;rights(db,record.snapshot,actor);return proof(db,record,query.dejstvie_id);
}
function list(query,actor){
 if(query.obekt!=='okr'||Object.keys(query).some(k=>!['obekt','posle','skolko'].includes(k)))throw new OshibkaVvoda('Нужен список удалений ОКР');
 const last=query.posle===undefined?Number.MAX_SAFE_INTEGER:Number(query.posle),limit=query.skolko===undefined?10:Number(query.skolko);
 if(!Number.isSafeInteger(last)||last<1||!Number.isSafeInteger(limit)||limit<1||limit>50)throw new OshibkaVvoda('Некорректная страница удалений');
 const db=baza(),safe='CASE WHEN json_valid(srez) THEN srez ELSE NULL END',path=field=>"json_extract("+safe+",'$.otmena_okr."+field+"')";
 const all=db.prepare("SELECT id zhurnal_id,kogda,json_extract("+safe+",'$.dejstvie_id') dejstvie_id,"+path('table')+" obekt,"+path('id')+" id,"+path('root.nazvanie')+" nazvanie,"+path('money')+" financial,json_array_length("+safe+",'$.otmena_okr.results') rezultatov,json_array_length("+safe+",'$.otmena_okr.measurements') zamerov,json_array_length("+safe+",'$.otmena_okr.tasks') zadach FROM zhurnal WHERE kto=? AND json_type("+safe+",'$.otmena_okr')='object' AND "+path('vernuto')+" IS NULL ORDER BY zhurnal.id DESC").all(actor);
 const money=require('./dengi-dostup.js').vidit(db,actor),visible=all.filter(r=>money||!r.financial),page=visible.filter(r=>r.zhurnal_id<last).slice(0,limit),more=page.length&&visible.some(r=>r.zhurnal_id<page.at(-1).zhurnal_id);
 return {spisok:page.map(({financial,...row})=>row),vsego:visible.length,prodolzhit:more?page.at(-1).zhurnal_id:null,skryto:!money&&all.some(r=>r.financial)?['dengi']:[]};
}
function remove(table,id,body,actor){
 const db=baza();return v_odnoj_tranzakcii(db,()=>{
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['versija','kontekst_udalenija','zapros_kljuch'].includes(k)))throw new OshibkaVvoda('Нужны версия, подтверждённый состав и ключ удаления');
  const value=body.zapros_kljuch===undefined?randomUUID():key(body.zapros_kljuch),signature=createHmac('sha256',value).update(JSON.stringify({table,id:Number(id),version:body.versija,context:body.kontekst_udalenija})).digest('hex'),old=find(db,actor,value);
  if(old){const s=old.snapshot;if(s.table!==table||s.id!==Number(id)||s.request!==signature)throw new Konflikt('Ключ использован для другого удаления',{operation_key_reused:true});rights(db,s,actor);return {...proof(db,old,value),udalenie_podtverzhdeno:true,povtor_udalenija:true,otmena_dejstvie_id:value};}
  if(db.prepare("SELECT 1 FROM zhurnal WHERE kto=? AND json_extract(CASE WHEN json_valid(srez) THEN srez ELSE NULL END,'$.dejstvie_id')=? LIMIT 1").get(actor,value))throw new Konflikt('Ключ уже использован другим действием',{operation_key_reused:true});
  const g=graph(db,table,Number(id));rights(db,g,actor);open(db,g);
  if(body.zapros_kljuch===undefined)throw new OshibkaVvoda('Подготовь ключ одного удаления и обнови состав цели','zapros_kljuch');
  if(body.versija===undefined||typeof body.kontekst_udalenija!=='string')throw new OshibkaVvoda('Обнови состав цели перед удалением','kontekst_udalenija');
  if(body.kontekst_udalenija!==undefined&&body.kontekst_udalenija!==fingerprint(g))throw new Konflikt('Цель, замеры или связанные задачи изменились. Проверь состав перед удалением',{sostav_okr_izmenilsja:true});
  const description=require('./opisanija.js').OPISANIJA[table],result=require('./obschij.js').udalit(table,description,Number(id),actor,{versija:body.versija});
  g.tasks=g.tasks.map(before=>({before,after:db.prepare('SELECT id,nomer,versija,cel_id,rezultat_id FROM zadachi WHERE id=?').get(before.id)}));
  const row=db.prepare("SELECT * FROM zhurnal WHERE obekt=? AND obekt_id=? AND pole='udaleno' AND kto=? ORDER BY id DESC LIMIT 1").get(resources[table],Number(id),actor);if(!row)throw new Error('Deletion journal missing');
  const context=JSON.parse(row.srez);context.otmena_okr={...g,kljuch_hesh:hash(value),request:signature};db.prepare('UPDATE zhurnal SET srez=? WHERE id=?').run(JSON.stringify(context),row.id);
  return {...result,otmena_dejstvie_id:value,udalenie_podtverzhdeno:true,svjazano:{rezultatov:g.results.length,zamerov:g.measurements.length,zadach:g.tasks.length}};
 });
}
function insert(db,table,row,actor){
 const allowed=new Set(db.prepare('PRAGMA table_info('+table+')').all().map(r=>r.name));if(Object.keys(row).some(k=>!allowed.has(k)))throw new Konflikt('Схема изменилась. Восстановление требует проверки');
 const data={...row};if(Object.hasOwn(data,'versija'))data.versija=Number(data.versija||1)+1;
 if(table==='plany_periodov_okr')data.izmenenie_id=randomUUID();
 const keys=Object.keys(data);db.prepare('INSERT INTO '+table+'('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>native(data[k])));
 if(Object.hasOwn(data,'versija'))require('./versii.js').zapomnit(db,table,data.id,0,actor);
}
function undo(body,actor){
 if(!body||typeof body!=='object'||Object.keys(body).some(k=>k!=='dejstvie_id'))return null;
 if(body.dejstvie_id===undefined)return null;
 const db=baza(),record=find(db,actor,body.dejstvie_id);if(!record)return null;
 return v_odnoj_tranzakcii(db,()=>{
  const s=record.snapshot;rights(db,s,actor);
  if(s.table==='celi'&&!require('./celi-model.js').canEdit(db,s.goal,actor))throw new NetDostupa('Цель восстанавливают ведущий направления и владельцы Локуса');
  if(s.vernuto)return {...proof(db,record,body.dejstvie_id),ranche:true};
  open(db,s);
  if(event(db,s.table,s.id)!==s.creation||(s.epochs||[]).some(([table,id,created])=>event(db,table,id)!==created))throw new Konflikt('Запись с таким номером создавалась заново. Старое удаление не отменяется');
  for(const [table,list]of [[s.table==='celi'?'celi':'rezultaty',[s.root]],['rezultaty',s.table==='celi'?s.results:[]],['zamery',s.measurements]])for(const row of list)if(db.prepare('SELECT 1 FROM '+table+' WHERE id=?').get(row.id))throw new Konflikt('Исходный номер уже занят. Восстановление не применено');
  const fields=['cel_id','rezultat_id','napravlenie','klient_id','proekt_id','roditel_id','status','povtorjaetsja','udaleno'];
  for(const task of s.tasks){const row=db.prepare('SELECT * FROM zadachi WHERE id=?').get(task.before.id);if(!row||!task.after||row.nomer!==task.after.nomer)throw new Konflikt('Связанная задача удалена или заменена. Восстановление не применено');require('./versii.js').proverit(db,'zadachi',row,task.after.versija,fields);if(row.cel_id!==task.after.cel_id||row.rezultat_id!==task.after.rezultat_id)throw new Konflikt('Связи задач изменились. Восстановление не применено');}
  if(s.table==='celi')insert(db,'celi',s.root,actor);
  for(const row of s.results)insert(db,'rezultaty',row,actor);
  for(const row of s.measurements)insert(db,'zamery',row,actor);
  for(const row of s.periodPlans||[])insert(db,'plany_periodov_okr',row,actor);
  const common=require('./obschij.js'),description=require('./opisanija.js').OPISANIJA.zadachi;
  for(const task of s.tasks)common.pravit('zadachi',description,task.after.nomer,{versija:task.after.versija,cel_id:task.before.cel_id,rezultat_id:task.before.rezultat_id},actor);
  common.v_zhurnal(db,s.table,s.id,'udaleno','да','нет',actor,s.root);
  s.vernuto={kogda:seichas(),kto:actor,dejstvie_id:require('./versii.js').dejstvie(db)};record.context.otmena_okr=s;db.prepare('UPDATE zhurnal SET srez=? WHERE id=?').run(JSON.stringify(record.context),record.row.id);
  return proof(db,record,body.dejstvie_id);
 });
}
                                                                               
                                                                              
function deletedGoalRoute(db,id,who){
 if(db.prepare('SELECT id FROM celi WHERE id=?').get(id))return null;
 const safe='CASE WHEN json_valid(srez) THEN srez ELSE NULL END',row=db.prepare("SELECT srez FROM zhurnal WHERE kto=? AND json_extract("+safe+",'$.otmena_okr.table')='celi' AND json_extract("+safe+",'$.otmena_okr.id')=? AND json_extract("+safe+",'$.otmena_okr.vernuto') IS NULL ORDER BY id DESC LIMIT 1").get(who,id);
 if(!row)return null;const snapshot=JSON.parse(row.srez).otmena_okr;try{rights(db,snapshot,who);}catch(error){if(error.kod===403||error.kod===404)return null;throw error;}
 return '/okr.html?'+new URLSearchParams({period:snapshot.goal.period_id,napravlenie:snapshot.goal.napravlenie});
}
module.exports={preview,check,list,remove,undo,deletedGoalRoute};
