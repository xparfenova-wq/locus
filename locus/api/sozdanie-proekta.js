const {baza,OshibkaVvoda}=require('../db/db.js');
const receipts=require('./zapros-sozdanija.js'),common=require('./obschij.js');
function handle(ctx){
 const {metod,kljuch,dejstvie,avtor,zapros={},telo={}}=ctx;if(kljuch||dejstvie)return null;
 const db=baza(),description=require('./opisanija.js').OPISANIJA.proekty;
 const present=row=>common.odna('proekty',description,row.id,avtor);
 if(metod==='GET'&&Object.hasOwn(zapros,'zapros_kljuch')){
  for(const key of Object.keys(zapros))if(key!=='zapros_kljuch')throw new OshibkaVvoda('Проверка создания принимает только ключ',key);
  return {telo:receipts.check(db,avtor,'proekty',avtor,zapros.zapros_kljuch,present)};
 }
 if(metod==='POST'){
  if(telo.otmenit_dobavlenie===true){
   for(const key of Object.keys(telo))if(!['zapros_kljuch','otmenit_dobavlenie'].includes(key))throw new OshibkaVvoda('Отмена принимает только ключ',key);
   return {telo:receipts.cancel(db,avtor,'proekty',avtor,telo.zapros_kljuch,present)};
  }
  const body={...telo};delete body.zapros_kljuch;
  return {kod:201,telo:receipts.create(db,avtor,'proekty',avtor,telo.zapros_kljuch,body,()=>common.sozdat('proekty',description,body,avtor),present)};
 }
 return null;
}
module.exports={handle};
