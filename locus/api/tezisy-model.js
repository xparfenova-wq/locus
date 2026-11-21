const {OshibkaVvoda}=require('../db/db.js');
const owns=(row,field)=>Object.hasOwn(row||{},field);
function year(value){
 if(!['string','number'].includes(typeof value)||!/^\d{4}$/.test(String(value))||Number(value)<2000||Number(value)>2100)throw new OshibkaVvoda('Укажи год от 2000 до 2100','god');
 return String(value);
}
function validate(data,before,raw=data){
 const out={...data};
 if(!before||owns(raw,'god')){
  out.god=year(raw.god);
 }
 if(!before||owns(raw,'tekst')){
  const text=raw.tekst;if(typeof text!=='string'||!text.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,''))throw new OshibkaVvoda('Напиши тезис','tekst');
  if(Array.from(text).length>5000)throw new OshibkaVvoda('Тезис может содержать до 5 000 знаков','tekst');
  out.tekst=text;
 }
 if(owns(raw,'porjadok')){
  const order=raw.porjadok;if(!['number','string'].includes(typeof order)||!/^\d+$/.test(String(order))||!Number.isSafeInteger(Number(order)))throw new OshibkaVvoda('Порядок тезиса — целое число от нуля','porjadok');
  out.porjadok=Number(order);
 }
 return out;
}
module.exports={validate,year};
