const {OshibkaVvoda}=require('../db/db.js'),money=require('./referral-money.js');
function bad(message,field,code=400){const error=new OshibkaVvoda(message,field);error.kod=code;throw error;}
function validate(db,patch,before={}){
 const current={...before,...patch},referral=current.rol==='referal'||current.rol==='klient'&&current.privodit_klientov===1;
 for(const field of ['procent','procent_shkala','nalog','vyplacheno']){
  if(!Object.hasOwn(patch,field)||patch[field]===null||Object.is(patch[field],before[field]))continue;
  if(!referral)bad('Это финансовое условие реферального сотрудничества',field,422);
  const value=patch[field];
  if(field==='procent'){
   const f=money.fraction(value);if(!f)bad('Процент: число от 0 до 100',field);
   if(f.n<0n||f.n>100n*f.d)bad('Процент: число от 0 до 100',field,422);
   const n=Number(String(value).replace(',','.')),stored=money.fraction(n);
   if(!stored||stored.n*f.d!==f.n*stored.d)bad('Процент не помещается точно в числовое поле',field);
   patch[field]=typeof value==='string'&&!value.includes(',')?value:n;
  }
  if(field==='procent_shkala'&&(typeof value!=='string'||[...value].length>300))bad('Шкала процентов: текст до 300 знаков',field);
  if(field==='vyplacheno'){
   const f=money.fraction(value);if(f&&f.n<0n)bad('Выплачено: сумма не меньше 0',field,422);
   const cents=money.cents(value),n=money.number(cents);if(cents===null||n===null)bad('Выплачено: точная сумма от 0, до двух знаков после запятой',field);patch[field]=typeof value==='string'&&!value.includes(',')?value:n;
  }
 }
 const moved=Object.hasOwn(patch,'chelovek_id')&&Number(patch.chelovek_id)!==Number(before.chelovek_id);
 if(current.dogovor_id!=null&&(moved||Object.hasOwn(patch,'dogovor_id')&&!Object.is(patch.dogovor_id,before.dogovor_id))){
  const id=current.dogovor_id,person=Number(current.chelovek_id);
  const doc=typeof id==='number'&&Number.isSafeInteger(id)&&id>0?db.prepare(`SELECT d.id FROM dokumenty d LEFT JOIN proekty p ON p.id=d.proekt_id
   WHERE d.id=? AND (d.chelovek_id=? OR d.chelovek_id IS NULL AND p.klient_id=?)`).get(id,person,person):null;
  if(!doc)bad('Выбери документ этого человека или сними прежнюю привязку','dogovor_id');
 }
}
module.exports={validate};
