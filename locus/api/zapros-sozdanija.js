                                                                             
                                                                             
const {createHash,createHmac}=require('node:crypto');
const {OshibkaVvoda,Konflikt,seichas}=require('../db/db.js');
const hash=value=>createHash('sha256').update(value).digest('hex');
function key(value){
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного добавления','zapros_kljuch');
 return hash(value.toLowerCase());
}
const resources=Object.freeze({celi:{receipts:'zaprosy_okr',event:'cel',parent:null,field:'cel'},rezultaty:{receipts:'zaprosy_okr',event:'rezultat',parent:'cel_id',field:'rezultat'},zamery:{receipts:'zaprosy_okr',event:'zamer',parent:'rezultat_id',field:'zamer'},rassylki:{receipts:'zaprosy_kampanij',event:'rassylka',parent:null,field:'rassylka'},lenta:{receipts:'zaprosy_lenty',event:'zapis',parent:'chelovek_id',field:'zapis'},proekty:{receipts:'zaprosy_proektov',event:'proekt',parent:null,field:'proekt'},platezhi:{receipts:'zaprosy_sozdanija',event:'platezh',parent:'proekt_id',field:'platezh'},shablony:{receipts:'zaprosy_shablonov',event:'shablon',parent:'avtor',field:'shablon'}});
function scope(table,parent){if(!Object.hasOwn(resources,table)||!Number.isSafeInteger(parent)||parent<1)throw new OshibkaVvoda('Нужен владелец добавления');return resources[table];}
function creation(db,id,table){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt=? AND obekt_id=? AND pole='sozdano'").get(resources[table].event,id)?.id;}
function saved(db,actor,table,parent,value){
 const resource=scope(table,parent);const row=db.prepare('SELECT * FROM '+resource.receipts+' WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));
 if(row&&(row.tablica!==table||row.vladelec_id!==parent))throw new Konflikt('Ключ относится к другому добавлению',{operation_key_reused:true});
 return row;
}
function check(db,actor,table,parent,value,present){
 const receipt=saved(db,actor,table,parent,value);if(!receipt)return {sostojanie:'ne_najdeno'};
 if(!receipt.zapis_id)return {sostojanie:'otmeneno'};
 if(receipt.udaleno===1)return {sostojanie:'udaleno',id:receipt.zapis_id};
 const resource=resources[table],row=db.prepare('SELECT * FROM '+table+' WHERE id=?').get(receipt.zapis_id);
 if(!row||creation(db,row.id,table)!==receipt.sobytie_id)return {sostojanie:'udaleno',id:receipt.zapis_id};
 if(resource.parent!==null&&row[resource.parent]!==parent)return {sostojanie:'perenesen',id:receipt.zapis_id};
 return {sostojanie:'sozdano',id:row.id,[resource.field]:present(row)};
}
function create(db,actor,table,parent,value,body,fn,present){
 scope(table,parent);if(value!==undefined)key(value);
 const digest=value===undefined?null:createHmac('sha256',value.toLowerCase()).update(JSON.stringify({table,parent,body:Object.fromEntries(Object.keys(body).sort().map(k=>[k,body[k]]))})).digest('hex');
 if(value!==undefined){
  const receipt=saved(db,actor,table,parent,value);
  if(receipt){
   if(!receipt.zapis_id)throw new Konflikt('Добавление отменено. Начни новое действие',{creation_cancelled:true});
   if(receipt.zapros_hesh!==digest)throw new Konflikt('Под этим ключом уже отправлены другие данные',{operation_key_reused:true});
   const current=check(db,actor,table,parent,value,present);
   if(current.sostojanie!=='sozdano')throw Object.assign(new Error((table==='platezhi'?'Платёж':table==='proekty'?'Проект':table==='lenta'?'Запись':table==='rassylki'?'Кампания':'Шаблон')+' уже был добавлен и затем удалён или перенесён'),{kod:410,dannye:current});
   return {...current[resources[table].field],povtor_sozdanija:true};
  }
 }
 const row=fn(),result=present(row);
 if(value!==undefined)db.prepare('INSERT INTO '+resources[table].receipts+'(avtor,kljuch_hesh,tablica,vladelec_id,zapros_hesh,zapis_id,sobytie_id,sozdano)VALUES(?,?,?,?,?,?,?,?)').run(actor,key(value),table,parent,digest,row.id,creation(db,row.id,table),seichas());
 return result;
}
function cancel(db,actor,table,parent,value,present){
 if(!saved(db,actor,table,parent,value))db.prepare('INSERT INTO '+resources[table].receipts+'(avtor,kljuch_hesh,tablica,vladelec_id,zapis_id,sozdano)VALUES(?,?,?,?,0,?)').run(actor,key(value),table,parent,seichas());
 return check(db,actor,table,parent,value,present);
}
module.exports={create,check,cancel};
