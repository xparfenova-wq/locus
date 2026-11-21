const {OshibkaVvoda}=require('../db/db.js');
function amount(value){
 const fail=()=>{throw new OshibkaVvoda('Число от 0 до 999 999 999','stoimost');};
 if(!['number','string'].includes(typeof value))return fail();
 if(typeof value==='number'&&(!Number.isFinite(value)||value<0||value>999999999))return fail();
 if(typeof value==='number'&&value>0&&value<0.000001)return 0;
 const parts=String(value).trim().match(/^(\d+)(?:[.,](\d+))?$/);if(!parts)return fail();
 const whole=parts[1].replace(/^0+/,'')||'0',fraction=parts[2]||'';if(whole.length>9)return fail();
 const rubles=BigInt(whole);if(rubles>999999999n||rubles===999999999n&&/[1-9]/.test(fraction))return fail();
 const cents=rubles*100n+BigInt(fraction.slice(0,2).padEnd(2,'0'))+(fraction[2]>='5'?1n:0n);
 if(cents>99999999900n)return fail();return Number(cents)/100;
}
function validate(data,db,previous={}){
 if(Object.hasOwn(data,'nazvanie')){
  if(typeof data.nazvanie!=='string'||!data.nazvanie.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,''))throw new OshibkaVvoda('Заполни Название','nazvanie');
  if(data.nazvanie.trim().length>200)throw new OshibkaVvoda('Название не длиннее 200 символов','nazvanie');
  data.nazvanie=data.nazvanie.trim();
 }
 if(Object.hasOwn(data,'stoimost')&&data.stoimost!==null)data.stoimost=amount(data.stoimost);
 for(const field of ['usluga_svoja','usluga_tekst','kommentarij'])if(Object.hasOwn(data,field)&&data[field]!==null){
  if(typeof data[field]!=='string')throw new OshibkaVvoda('Нужен текст',field);
  if(field==='usluga_svoja'&&data[field].trim().length>200)throw new OshibkaVvoda('Не длиннее 200 символов',field);
  if(!data[field].trim())data[field]=null;else if(field!=='kommentarij')data[field]=data[field].trim();
 }
 if(db&&(Object.hasOwn(data,'usluga_id')||Object.hasOwn(data,'napravlenie'))){
  const id=Object.hasOwn(data,'usluga_id')?data.usluga_id:previous.usluga_id,direction=data.napravlenie??previous.napravlenie;
  if(id!=null){const service=db.prepare('SELECT id,napravlenie,arhiv FROM uslugi WHERE id=?').get(Number(id));
   if(!service)throw new OshibkaVvoda('Услуга не найдена','usluga_id');
   if(service.napravlenie!==direction)throw new OshibkaVvoda('Услуга относится к другому направлению','usluga_id');
   if(service.arhiv&&Number(id)!==Number(previous.usluga_id))throw new OshibkaVvoda('Услуга в архиве. Выбери активную или свою.','usluga_id');
  }
 }

}
module.exports={validate,amount};
