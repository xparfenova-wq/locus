const {OshibkaVvoda}=require('../db/db.js');
                                                                             
                                                                                
const workflowNames=new Map([['rassylka','Отправить рассылку'],['rassylka_plan','План рассылки'],['sledujuschee_kasanie','Следующее касание']]);
function find(db,value){
 const key=String(value),numeric=/^(?:shablon_)?\d+$/.test(key);
 if(numeric)return db.prepare('SELECT * FROM shablony WHERE id=?').get(Number(key.replace('shablon_','')))||null;
 const code=key==='send_kp'?'otpravit_kp':key,exact=db.prepare('SELECT * FROM shablony WHERE kod=?').get(code);if(exact)return exact;
 const names=db.prepare('SELECT * FROM shablony WHERE nazvanie=? LIMIT 2').all(key);if(names.length>1)throw new OshibkaVvoda('Выбери один из одноимённых шаблонов','shablon');return names[0]||null;
}
function describe(db,key,actor){
 if(key==null)return null;
 let source;try{source=find(db,key);}catch{}
 if(source){try{if(actor!=null)require('./shablony.js').readable(db,source.id,actor);return {nazvanie:source.nazvanie,dostupen:true};}catch{return {nazvanie:'Личный шаблон',dostupen:false};}}
 return workflowNames.has(String(key))?{nazvanie:workflowNames.get(String(key)),dostupen:true}:{nazvanie:'Шаблон больше недоступен',dostupen:false};
}
module.exports={find,describe,workflowNames};
