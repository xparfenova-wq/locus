const {OshibkaVvoda,segodnja}=require('../db/db.js');
function number(value){
 if(!['string','number'].includes(typeof value))throw new OshibkaVvoda('Введи число','znachenie');
 const text=String(value).trim().replace(',','.');
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)||!Number.isFinite(Number(text)))throw new OshibkaVvoda('Введи конечное число','znachenie');
                                                                          
                                                                     
 const digits=text.split(/[eE]/)[0].replace(/\D/g,'').replace(/^0+/,'');
 if(digits&&Number(text)===0)throw new OshibkaVvoda('Число слишком мало для точного хранения','znachenie');
 if(digits.length>15||Math.abs(Number(text))>999999999999999)throw new OshibkaVvoda('Число не длиннее 15 знаков','znachenie');
 return Number(text);
}
function validate(data,before,raw={}){
 if(Object.hasOwn(raw,'kto'))throw new OshibkaVvoda('kto ставится сам','kto');
 if(Object.hasOwn(raw,'znachenie'))data.znachenie=number(raw.znachenie);
 if(Object.hasOwn(raw,'data')){
  require('./kalendar.js').data(raw.data,'data');
  if(raw.data>segodnja())throw new OshibkaVvoda('Дата фактического замера не может быть в будущем','data');
 }
 if(Object.hasOwn(raw,'otkuda')){
  if(typeof raw.otkuda!=='string'||!raw.otkuda.trim())throw new OshibkaVvoda('Укажи, откуда взято число','otkuda');
  data.otkuda=raw.otkuda.trim();
  if(data.otkuda.length>300)throw new OshibkaVvoda('Источник не длиннее 300 знаков','otkuda');
 }
}
module.exports={number,validate};
