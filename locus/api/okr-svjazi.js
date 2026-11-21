const {OshibkaVvoda,NeNajdeno}=require('../db/db.js');
function id(value,field){if(!['number','string'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new OshibkaVvoda('Нужен существующий номер',field);return Number(value);}
function goalKey(alias='zadachi'){
 if(!/^[a-z_]+$/.test(alias))throw new TypeError('Invalid SQL task alias');
 return `COALESCE(${alias}.cel_id,(SELECT linked_result.cel_id FROM rezultaty linked_result WHERE linked_result.id=${alias}.rezultat_id))`;
}
function goal(db,value,actor){
 const number=id(value,'cel'),scope=require('./pravila-otveta.js').vidimost('celi',actor??null,'c.');
 const row=db.prepare('SELECT c.* FROM celi c WHERE c.id=? AND '+scope.sql).get(number,...scope.args);if(!row)throw new NeNajdeno('Цель недоступна');return row;
}
module.exports={id,goalKey,goal};
