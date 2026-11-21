const {OshibkaVvoda,Konflikt,NetDostupa}=require('../db/db.js');
const links=['platezh_id','proekt_id','klient_id','napravlenie'];
function input(db,body,actor){
                                                                       
                                                                              
 if(!Object.hasOwn(body,'summa'))return body;
 if(!require('./dengi-dostup.js').vidit(db,actor))throw new NetDostupa('У тебя доступ без денег');
 const id=Number(body.platezh_id);
 if(!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('Выбери платёж, по которому нужна задача','platezh_id');
 const payment=db.prepare('SELECT summa FROM platezhi WHERE id=?').get(id);
 if(!payment)throw new OshibkaVvoda('Платежа нет. Обнови проект','platezh_id');
 const amount=require('./platezhi.js').summa(body.summa);
 if(amount!==payment.summa)throw new Konflikt('Сумма платежа изменилась. Обнови данные платежа перед созданием задачи',{platezh_izmenilsja:true});
 if(Object.hasOwn(body,'plan_chislo')&&require('./platezhi.js').summa(body.plan_chislo,'plan_chislo')!==amount)throw new OshibkaVvoda('Сумма и план задачи должны совпадать с платежом','plan_chislo');
 const result={...body,plan_chislo:amount};delete result.summa;return result;
}
function context(db,payment,project,actor){
                                                                              
                                                                             
 const creation=(kind,id)=>db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt=? AND obekt_id=? AND pole='sozdano'").get(kind,id)?.id??null;
 return require('node:crypto').createHash('sha256').update(JSON.stringify({actor,access:require('./dengi-dostup.js').vidit(db,actor),payment:[payment.id,payment.versija,creation('platezh',payment.id)],project:[project.id,project.versija,creation('proekt',project.id)]})).digest('hex');
}
function prepare(db,data,before,seen,actor){
 const paymentId=data.platezh_id??before?.platezh_id;
 if(before?.platezh_id&&Object.hasOwn(data,'platezh_id')&&data.platezh_id!==before.platezh_id)throw new Konflikt('Платёж закреплён за этой задачей. Для другого платежа создай новую задачу');
 if(paymentId==null){if(seen!==undefined||!before&&data.shablon==='poluchit_oplatu')throw new OshibkaVvoda('Выбери платёж, по которому нужна задача','platezh_id');return;}
 if(!Number.isSafeInteger(Number(paymentId))||Number(paymentId)<1)throw new OshibkaVvoda('Выбери платёж','platezh_id');
                                                                        
                                                                               
 if(before&&!links.some(key=>Object.hasOwn(data,key)))return;
 const payment=db.prepare('SELECT * FROM platezhi WHERE id=?').get(paymentId);
 if(!payment)throw new OshibkaVvoda('Платежа нет. Обнови проект','platezh_id');
 const project=db.prepare('SELECT * FROM proekty WHERE id=?').get(payment.proekt_id);
 if(!project)throw new OshibkaVvoda('У платежа нет действующего проекта','platezh_id');
 if(seen!==undefined&&(typeof seen!=='string'||seen!==context(db,payment,project,actor)))throw new Konflikt('Платёж или проект изменились. Обнови данные платежа перед созданием задачи',{platezh_izmenilsja:true});
 if(data.rassylka_id||data.povtorjaetsja||data.publikacija)throw new OshibkaVvoda('Задача по платежу создаётся отдельно от рассылок, повторов и публикаций','platezh_id');
 for(const [key,value]of Object.entries({proekt_id:project.id,klient_id:project.klient_id,napravlenie:project.napravlenie})){
  if(Object.hasOwn(data,key)&&data[key]!==value)throw new OshibkaVvoda('Задача должна относиться к проекту, клиенту и направлению платежа',key);
  data[key]=value;
 }
 if(!before){
  data.platezh_id=payment.id;
  if(data.srok===undefined)data.srok=payment.zhdem_do;
  if(data.plan_chislo===undefined)data.plan_chislo=payment.summa;
 }
}
module.exports={prepare,context,input};
