const {createHash,createHmac}=require('node:crypto');
const {baza,seichas,v_odnoj_tranzakcii,OshibkaVvoda,Konflikt}=require('../db/db.js');
const versions=require('./versii.js');
const dates=['arhiv','arhiv_s','vozvrat_s'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function svjazi(db,table,field,id,versioned=true){
 const columns=versioned?'id,versija':'rowid,*';return db.prepare('SELECT '+columns+' FROM '+table+' WHERE '+field+'=? ORDER BY rowid').all(id);
}
function zadachaScope(db,id,format=1){return hash([
 svjazi(db,'zadachi','roditel_id',id),svjazi(db,'materialy','zadacha_id',id),svjazi(db,'kommentarii','zadacha_id',id),
 svjazi(db,'referalnye_zadachi','zadacha_id',id,false),svjazi(db,'zadacha_uchastniki','zadacha_id',id,false),svjazi(db,'otmetki_povtora','zadacha_id',id,false),svjazi(db,'fokus_sessii','zadacha_id',id,false),
 ...(format>=2?[svjazi(db,'sostavy_voln','zadacha_id',id,false),svjazi(db,'uchastniki_voln','zadacha_id',id,false),svjazi(db,'porjadki_voln','zadacha_id',id,false),svjazi(db,'rassylka_kasanija','zadacha_id',id,false),svjazi(db,'rassylka_ljudi','zadacha_id',id,false)]:[]),
]);}
function campaignScope(db,id){
 const related=[];for(const {name}of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
  const table='"'+name.replaceAll('"','""')+'"',columns=db.prepare('PRAGMA table_info('+table+')').all();if(!columns.some(c=>c.name==='rassylka_id'))continue;
  related.push([name,db.prepare('SELECT rowid,*,'+columns.map(c=>'typeof("'+c.name.replaceAll('"','""')+'")').join(',')+' FROM '+table+' WHERE rassylka_id=? ORDER BY rowid').all(id)]);
 }
 return hash([db.prepare('SELECT * FROM rassylki WHERE id=?').get(id),related]);
}
function chelovekScope(db,id){return hash([
 svjazi(db,'zadachi','klient_id',id),svjazi(db,'sotrudnichestva','chelovek_id',id),svjazi(db,'proekty','klient_id',id),svjazi(db,'kontakty','chelovek_id',id),
]);}
function uuid(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ действия','dejstvie_id');return value.toLowerCase();}
function najti(db,actor,command){
 command=uuid(command);
 const row=db.prepare("SELECT * FROM zhurnal WHERE obekt='zadacha' AND pole='sozdano' AND kto=? AND json_type(srez,'$.otmena_sozdanija')='object' AND (json_extract(srez,'$.dejstvie_id')=? OR json_extract(srez,'$.otmena_sozdanija.otmeneno.dejstvie_id')=?) ORDER BY id DESC LIMIT 1").get(actor,command,command);
 if(!row)return null;const context=JSON.parse(row.srez);return {row,context,snapshot:context.otmena_sozdanija,command:context.dejstvie_id};
}
function requestKey(value){
 if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного запроса создания задачи','zapros_kljuch');
 return value.toLowerCase();
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
function requestHash(key,body,actor){return createHmac('sha256',key).update(JSON.stringify({actor,body:canonical(body)})).digest('hex');}
function byRequest(db,actor,key){
 const rows=db.prepare("SELECT * FROM zhurnal WHERE obekt='zadacha' AND pole='sozdano' AND kto=? AND json_extract(srez,'$.otmena_sozdanija.zapros.kljuch_hesh')=? ORDER BY id DESC LIMIT 2").all(actor,hash(key));
 if(rows.length>1)throw new Konflikt('У запроса несколько результатов. Проверь задачи перед повтором.');
 if(!rows.length)return null;const row=rows[0],context=JSON.parse(row.srez);return {row,context,snapshot:context.otmena_sozdanija,command:context.dejstvie_id};
}
function dbOriginal(record){const row=baza().prepare('SELECT id,nomer FROM zadachi WHERE id=?').get(record.snapshot.zadacha_id);return row&&row.nomer===record.snapshot.nomer?row:null;}
function creationResult(record,key,actor,replayed){
 const original=dbOriginal(record),row=original?require('./obschij.js').odna('zadachi',require('./opisanija.js').OPISANIJA.zadachi,record.snapshot.nomer,actor):{id:record.snapshot.zadacha_id,nomer:record.snapshot.nomer,nazvanie:'Ранее созданная задача',udaleno:true,kartochka_otsutstvuet:true};
 return {...row,otmena_dejstvie_id:record.command,zapros_kljuch:key,podtverzhdeno:true,povtor_sozdanija:replayed,sozdanie_otmeneno:Boolean(record.snapshot.otmeneno)};
}
function proverit_sozdanie(query,actor){
 for(const key of Object.keys(query))if(key!=='zapros_kljuch')throw new OshibkaVvoda('Неизвестный параметр проверки создания',key);
 const key=requestKey(query.zapros_kljuch),record=byRequest(baza(),actor,key);
 return {zapros_kljuch:key,podtverzhdeno:Boolean(record),rezultat:record?creationResult(record,key,actor,true):null};
}
function sozdat(body,opisanie,actor,options={}){
 const db=baza(),command=versions.dejstvie(db);if(!command)throw new Error('Creation requires an atomic command context');
 if(!body||typeof body!=='object'||Array.isArray(body))throw new OshibkaVvoda('Нужен объект полей задачи');
 const clean={...body};delete clean.zapros_kljuch;
 const key=body.zapros_kljuch===undefined?null:requestKey(body.zapros_kljuch);
 if(options.requiredKey&&!key)throw new OshibkaVvoda('Обнови форму перед сохранением копии','zapros_kljuch');
 const request=options.request??clean;
 if(key){const prior=byRequest(db,actor,key);if(prior){if(prior.snapshot.zapros.telo_hesh!==requestHash(key,request,actor))throw new Konflikt('Ключ уже использован для другой задачи',{operation_key_reused:true});return creationResult(prior,key,actor,true);}}
 const payload=options.prepare?options.prepare():clean;
 const boundary=db.prepare('SELECT COALESCE(max(id),0) id FROM zadachi').get().id,campaignBoundary=db.prepare('SELECT COALESCE(max(id),0) id FROM rassylki').get().id;
 const people=new Map(db.prepare('SELECT * FROM ljudi WHERE arhiv=1').all().map(p=>[p.id,p]));
 const result=options.create?options.create(payload):require('./kampanija-iz-zadachi.js').requested(payload)?require('./kampanija-iz-zadachi.js').create(db,payload,actor):require('./obschij.js').sozdat('zadachi',opisanie,payload,actor);
 if(options.afterCreate)options.afterCreate(result);
 const tasks=db.prepare('SELECT * FROM zadachi WHERE id>? ORDER BY id').all(boundary);
 const changed=[];
 for(const current of db.prepare('SELECT * FROM ljudi WHERE COALESCE(arhiv,0)=0').all()){const before=people.get(current.id);if(!before)continue;changed.push({id:current.id,versija:current.versija,bylo:Object.fromEntries(dates.filter(field=>Object.hasOwn(before,field)).map(field=>[field,before[field]])),svjazi:chelovekScope(db,current.id)});}
 const snapshot={format:2,zadacha_id:result.id,nomer:result.nomer,zadachi:tasks.map(row=>({id:row.id,versija:row.versija,svjazi:zadachaScope(db,row.id,2)})),ljudi:changed,rassylki:db.prepare('SELECT id,versija FROM rassylki WHERE id>? ORDER BY id').all(campaignBoundary).map(c=>({...c,svjazi:campaignScope(db,c.id)}))};
 if(key)snapshot.zapros={format:1,kljuch_hesh:hash(key),telo_hesh:requestHash(key,request,actor)};
 const journal=db.prepare("SELECT * FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='sozdano' AND kto=? AND json_extract(srez,'$.dejstvie_id')=? ORDER BY id DESC LIMIT 1").get(result.id,actor,command);
 if(!journal)throw new Error('Creation journal is missing');const context=JSON.parse(journal.srez);context.otmena_sozdanija=snapshot;db.prepare('UPDATE zhurnal SET srez=? WHERE id=?').run(JSON.stringify(context),journal.id);
 return {...result,otmena_dejstvie_id:command,...(key?{zapros_kljuch:key,podtverzhdeno:true,povtor_sozdanija:false,sozdanie_otmeneno:false}:{})};
}
function rezultat(record,done){const s=record.snapshot;return {dejstvie_id:record.command,najdeno:true,otmeneno:done,zadacha_id:s.zadacha_id,nomer:s.nomer,vernuto:done?s.zadachi.length+s.ljudi.length:0};}
function proverit(query,actor){
 for(const key of Object.keys(query))if(key!=='dejstvie_id')throw new OshibkaVvoda('Неизвестный параметр проверки отмены',key);
 const command=uuid(query.dejstvie_id),record=najti(baza(),actor,command);return record?rezultat(record,Boolean(record.snapshot.otmeneno)):{dejstvie_id:command,najdeno:false,otmeneno:false,vernuto:0};
}
function otmenit(record,actor){
 const db=baza();return v_odnoj_tranzakcii(db,()=>{
  if(db.prepare("SELECT 1 FROM zaprosy_referalnyh_zadach WHERE json_extract(itog_json,'$.dejstvie_id')=? AND udaleno=1").get(record.command))throw new Konflikt('Исходные задачи физически удалены. Отмена не применяется к повторно использованному номеру');
  if(record.snapshot.otmeneno)return {...rezultat(record,true),ranche:true};
  const s=record.snapshot,taskRows=s.zadachi.map(old=>{
   const row=db.prepare('SELECT * FROM zadachi WHERE id=?').get(old.id);if(!row)throw new Konflikt('Созданной задачи больше нет. Проверь карточку.');
   versions.proverit(db,'zadachi',row,old.versija,Object.keys(row));if(zadachaScope(db,row.id,s.format||1)!==old.svjazi)throw new Konflikt('Связанные данные задачи изменились. Отмена не применена.');return row;
  }),people=s.ljudi.map(old=>{
   const row=db.prepare('SELECT * FROM ljudi WHERE id=?').get(old.id);if(!row)throw new Konflikt('Карточка человека изменилась. Отмена не применена.');
   versions.proverit(db,'ljudi',row,old.versija,Object.keys(old.bylo));if(chelovekScope(db,row.id)!==old.svjazi)throw new Konflikt('У человека появилась другая работа. Отмена не применена.');return {row,old};
  });
  const campaigns=(s.rassylki||[]).map(old=>{const row=db.prepare('SELECT * FROM rassylki WHERE id=?').get(old.id);if(!row)throw new Konflikt('Созданной рассылки больше нет. Отмена не применяется');versions.proverit(db,'rassylki',row,old.versija,Object.keys(row));if(campaignScope(db,row.id)!==old.svjazi)throw new Konflikt('Связанные данные рассылки изменились. Отмена не применяется');return row;});
  const common=require('./obschij.js'),opis=require('./opisanija.js').OPISANIJA.zadachi;
  for(const row of [...taskRows].reverse())common.udalit('zadachi',opis,row.nomer,actor,{versija:row.versija});
  for(const row of campaigns){common.v_zhurnal(db,'rassylki',row.id,'udaleno',0,1,actor,row);db.prepare('DELETE FROM rassylki WHERE id=?').run(row.id);}
  for(const {row,old} of people){const fields=Object.keys(old.bylo);db.prepare('UPDATE ljudi SET '+fields.map(f=>f+'=?').join(',')+' WHERE id=?').run(...fields.map(f=>old.bylo[f]),row.id);common.v_zhurnal(db,'ljudi',row.id,'arhiv',String(row.arhiv??0),String(old.bylo.arhiv??0),actor,row);}
  s.otmeneno={dejstvie_id:versions.dejstvie(db),kogda:seichas(),kto:actor};record.context.otmena_sozdanija=s;db.prepare('UPDATE zhurnal SET srez=? WHERE id=?').run(JSON.stringify(record.context),record.row.id);
  return rezultat(record,true);
 });
}
module.exports={sozdat,najti,proverit,otmenit,proverit_sozdanie};
