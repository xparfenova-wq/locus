const {createHash}=require('node:crypto');
const {OshibkaVvoda,Konflikt,seichas}=require('../db/db.js');
const hash=value=>createHash('sha256').update(value).digest('hex');
function kljuch(value){
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного запроса создания задачи','zapros_kljuch');
 return hash(value.toLowerCase());
}
function najti(db,avtor,value){return db.prepare('SELECT * FROM zaprosy_zadach WHERE avtor=? AND kljuch_hesh=?').get(avtor,kljuch(value));}
function proverit(db,avtor,person,value){
 const row=najti(db,avtor,value);if(row&&row.chelovek_id!==person)throw new Konflikt('Ключ относится к другому человеку',{operation_key_reused:true});
 return {podtverzhdeno:Boolean(row),rezultat:row?JSON.parse(row.otvet):null};
}
function otpechatok(person,body){
 const clean=Object.fromEntries(Object.keys(body).filter(key=>key!=='zapros_kljuch').sort().map(key=>[key,body[key]]));
 return hash(JSON.stringify({chelovek_id:person,telo:clean}));
}
function povtor(db,avtor,person,body){
 if(body.zapros_kljuch===undefined)return null;
 const row=najti(db,avtor,body.zapros_kljuch);if(!row)return null;
 if(row.chelovek_id!==person||row.zapros_hesh!==otpechatok(person,body))throw new Konflikt('Ключ уже использован для другой задачи',{operation_key_reused:true});
 return JSON.parse(row.otvet);
}
function zapomnit(db,avtor,person,body,result){
 if(body.zapros_kljuch===undefined)return;
 db.prepare('INSERT INTO zaprosy_zadach(avtor,kljuch_hesh,chelovek_id,zapros_hesh,otvet,sozdano) VALUES(?,?,?,?,?,?)').run(avtor,kljuch(body.zapros_kljuch),person,otpechatok(person,body),JSON.stringify(result),seichas());
}
module.exports={proverit,povtor,zapomnit};
