const {createHash,createHmac}=require('node:crypto');
const {baza,OshibkaVvoda,Konflikt}=require('../db/db.js');
const common=()=>require('./obschij.js');
const keyHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function requestKey(value){
 if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного запроса создания аккаунта','zapros_kljuch');
 return value.toLowerCase();
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
function bodyHash(key,body,actor){return createHmac('sha256',key).update(JSON.stringify({actor,body:canonical(body)})).digest('hex');}
function find(db,actor,key){
 const rows=db.prepare("SELECT id,obekt_id,srez FROM zhurnal WHERE obekt='akkaunt' AND pole='sozdano' AND kto=? AND json_extract(srez,'$.sozdanie_akkaunta.kljuch_hesh')=? ORDER BY id DESC LIMIT 2").all(actor,keyHash(key));
 if(rows.length>1)throw new Konflikt('У запроса несколько результатов. Проверь аккаунты перед повтором.');
 return rows.length?{journal:rows[0],receipt:JSON.parse(rows[0].srez).sozdanie_akkaunta}:null;
}
function result(record,key,actor,replayed){
 const account=common().odna('akkaunty',require('./opisanija.js').OPISANIJA.akkaunty,record.journal.obekt_id,actor);
 return {...account,zapros_kljuch:key,podtverzhdeno:true,povtor_sozdanija:replayed};
}
function check(query,actor){
 for(const field of Object.keys(query))if(field!=='zapros_kljuch')throw new OshibkaVvoda('Неизвестный параметр проверки создания',field);
 const key=requestKey(query.zapros_kljuch),record=find(baza(),actor,key);
 return {zapros_kljuch:key,podtverzhdeno:Boolean(record),rezultat:record?result(record,key,actor,true):null};
}
function create(body,description,actor){
 const db=baza(),command=require('./versii.js').dejstvie(db);
 if(!command)throw new Error('Account creation requires an atomic command context');
 if(!body||typeof body!=='object'||Array.isArray(body))throw new OshibkaVvoda('Нужен объект полей аккаунта');
 const clean={...body};delete clean.zapros_kljuch;
 const key=body.zapros_kljuch===undefined?null:requestKey(body.zapros_kljuch);
 if(key){
  const prior=find(db,actor,key);
  if(prior){if(prior.receipt.telo_hesh!==bodyHash(key,clean,actor))throw new Konflikt('Ключ уже использован для другого аккаунта',{operation_key_reused:true});return result(prior,key,actor,true);}
 }
 const account=common().sozdat('akkaunty',description,clean,actor);
 if(!key)return account;
 const journal=db.prepare("SELECT id,obekt_id,srez FROM zhurnal WHERE obekt='akkaunt' AND obekt_id=? AND pole='sozdano' AND kto=? AND json_extract(srez,'$.dejstvie_id')=? ORDER BY id DESC LIMIT 1").get(account.id,actor,command);
 if(!journal)throw new Error('Account creation journal is missing');
 const context=JSON.parse(journal.srez);context.sozdanie_akkaunta={format:1,kljuch_hesh:keyHash(key),telo_hesh:bodyHash(key,clean,actor)};
 db.prepare('UPDATE zhurnal SET srez=? WHERE id=?').run(JSON.stringify(context),journal.id);
 return {...account,zapros_kljuch:key,podtverzhdeno:true,povtor_sozdanija:false};
}
module.exports={create,check};
