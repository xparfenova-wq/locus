const {createHash}=require('node:crypto');
const {OshibkaVvoda,Konflikt,seichas}=require('../db/db.js');
const hash=value=>createHash('sha256').update(value).digest('hex');
function kljuch(value){
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного платёжного действия','zapros_kljuch');
 return hash(value.toLowerCase());
}
function najti(db,avtor,value){return db.prepare('SELECT * FROM zaprosy_platezhej WHERE avtor=? AND kljuch_hesh=?').get(avtor,kljuch(value));}
function otpechatok(id,action,body){return hash(JSON.stringify({platezh_id:id,dejstvie:action,telo:Object.fromEntries(Object.keys(body).filter(k=>k!=='zapros_kljuch').sort().map(k=>[k,body[k]]))}));}
function povtor(db,avtor,id,action,body){
 const row=najti(db,avtor,body.zapros_kljuch);if(!row)return null;
 if(row.platezh_id!==id||row.dejstvie!==action||row.zapros_hesh!==otpechatok(id,action,body))throw new Konflikt('Ключ уже использован для другого платёжного действия',{operation_key_reused:true});
 return JSON.parse(row.otvet);
}
function proverit(db,avtor,id,key){
 const row=najti(db,avtor,key);if(row&&row.platezh_id!==id)throw new Konflikt('Ключ относится к другому платежу',{operation_key_reused:true});
 return {podtverzhdeno:Boolean(row),dejstvie:row?.dejstvie??null,rezultat:row?JSON.parse(row.otvet):null};
}
function zapomnit(db,avtor,id,action,body,result,inverse){
 db.prepare('INSERT INTO zaprosy_platezhej(avtor,kljuch_hesh,platezh_id,dejstvie,zapros_hesh,otvet,obratno,sozdano) VALUES(?,?,?,?,?,?,?,?)').run(avtor,kljuch(body.zapros_kljuch),id,action,otpechatok(id,action,body),JSON.stringify(result),JSON.stringify({...inverse,server_command:require('./versii.js').dejstvie(db)}),seichas());
}
module.exports={najti,povtor,proverit,zapomnit};
