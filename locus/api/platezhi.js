const {baza,v_api,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,NetDostupa,Konflikt}=require('../db/db.js');
const versions=require('./versii.js'),receipt=require('./zapros-platezha.js');
const dependencies=['proekt_id','summa','oplachen_at','zhdem_do'];
function summa(value,field='summa'){
 if(!['number','string'].includes(typeof value))throw new OshibkaVvoda('Нужна положительная сумма, не больше двух знаков после запятой',field);
 const parts=String(value).trim().match(/^(\d+)(?:[.,](\d{1,2}))?$/);
 if(!parts)throw new OshibkaVvoda('Нужна положительная сумма, не больше двух знаков после запятой',field);
                                                                     
                                                                        
 const whole=parts[1].replace(/^0+/,'')||'0';
 if(whole.length>14)throw new OshibkaVvoda('Нужна конечная положительная сумма',field);
 const cents=BigInt(whole)*100n+BigInt((parts[2]||'').padEnd(2,'0'));
 if(cents<=0n||cents>BigInt(Number.MAX_SAFE_INTEGER))throw new OshibkaVvoda('Нужна конечная положительная сумма',field);
 const n=Number(cents)/100,stored=String(n).match(/^(\d+)(?:\.(\d{1,2}))?$/);
 if(!stored||BigInt(stored[1])*100n+BigInt((stored[2]||'').padEnd(2,'0'))!==cents)throw new OshibkaVvoda('Сумма слишком велика для точного сохранения копеек',field);
 return n;
}
function data(value,field){
 const d=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00Z'):null;
 if(!d||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new OshibkaVvoda('Нужна существующая дата ГГГГ-ММ-ДД',field);
 return value;
}
function proveritDannye(d){
 if(Object.hasOwn(d,'summa'))d.summa=summa(d.summa);
 for(const field of ['zhdem_do','vystavlen_at','oplachen_at'])if(d[field]!==undefined&&d[field]!==null&&d[field]!=='')d[field]=data(d[field],field);
}
function prava(db,actor){if(!require('./dengi-dostup.js').vidit(db,actor))throw new NetDostupa('Суммы недоступны');}
function nomer(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new OshibkaVvoda('Нужен номер платежа','id');return n;}
function odna(db,id){const row=db.prepare('SELECT * FROM platezhi WHERE id=?').get(id);if(!row)throw new NeNajdeno('Платежа нет');return row;}
function otvet(row){return {...v_api(row),status:row.oplachen_at?'prishlo':'zhdem'};}
function parametry(body,allowed){for(const field of Object.keys(body))if(!allowed.includes(field))throw new OshibkaVvoda('Неизвестный параметр платежа',field);}
function zapisat(db,row,fields,actor){return require('./obschij.js').pravit('platezhi',require('./opisanija.js').OPISANIJA.platezhi,row.id,{versija:row.versija,...fields},actor);}
function proverka({kljuch,zapros,metod,avtor}){
 if(metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});const db=baza();prava(db,avtor);parametry(zapros,['zapros_kljuch']);return {telo:receipt.proverit(db,avtor,nomer(kljuch),zapros.zapros_kljuch)};
}
function prishlo({kljuch,telo,metod,avtor,segodnja}){
 if(metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});
 const db=baza();return v_odnoj_tranzakcii(db,()=>{
  prava(db,avtor);parametry(telo,['versija','zapros_kljuch','summa_fakt','summa','data','oplachen_at','reshenie','platezh_id']);
  const id=nomer(kljuch);if(telo.platezh_id!==undefined&&nomer(telo.platezh_id)!==id)throw new OshibkaVvoda('Платёж не совпадает с адресом','platezh_id');const old=receipt.povtor(db,avtor,id,'prishlo',telo);if(old)return {telo:old};
  const before=odna(db,id);versions.proverit(db,'platezhi',before,telo.versija,dependencies);
  if(before.oplachen_at)throw new Konflikt('Платёж уже отмечен пришедшим. Обнови список.');
  if(Object.hasOwn(telo,'summa_fakt')&&Object.hasOwn(telo,'summa'))throw new OshibkaVvoda('Укажи сумму один раз','summa_fakt');
  if(Object.hasOwn(telo,'data')&&Object.hasOwn(telo,'oplachen_at'))throw new OshibkaVvoda('Укажи дату один раз','data');
  const paid=summa(Object.hasOwn(telo,'summa_fakt')?telo.summa_fakt:Object.hasOwn(telo,'summa')?telo.summa:before.summa,'summa_fakt'),day=data(Object.hasOwn(telo,'data')?telo.data:Object.hasOwn(telo,'oplachen_at')?telo.oplachen_at:segodnja(),'data'),expected=summa(before.summa),remainder=Math.round((expected-paid)*100)/100;
  if(telo.reshenie!==undefined&&!['otdelnoj_strokoj','spisat'].includes(telo.reshenie))throw new OshibkaVvoda('Выбери, что делать с остатком','reshenie');
  if(remainder>0&&!telo.reshenie)throw Object.assign(new Konflikt('Выбери, что делать с остатком'),{dannye:{kod:'nuzhen_vybor',ostatok:remainder,varianty:['otdelnoj_strokoj','spisat']}});
  const tasks=db.prepare("SELECT * FROM zadachi WHERE platezh_id=? AND status NOT IN ('sdelano','kogda_nibud') AND (udaleno IS NULL OR udaleno=0)").all(id);
  zapisat(db,before,{summa:paid,oplachen_at:day},avtor);
  let created=null;
  if(remainder>0&&telo.reshenie==='otdelnoj_strokoj')created=require('./obschij.js').sozdat('platezhi',require('./opisanija.js').OPISANIJA.platezhi,{proekt_id:before.proekt_id,summa:remainder,zhdem_do:before.zhdem_do,vystavlen_at:before.vystavlen_at,naznachenie:(before.naznachenie||'платёж')+', остаток'},avtor);
  for(const task of tasks){db.prepare("UPDATE zadachi SET status='sdelano',versija=versija+1 WHERE id=?").run(task.id);require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'status',task.status,'sdelano',avtor,task);}
  const current=odna(db,id),result={...otvet(current),zakryto_zadach:tasks.length,ostatok_id:created?.id??null,otmena_dostupna:true};
  receipt.zapomnit(db,avtor,id,'prishlo',telo,result,{platezh:{summa:before.summa,oplachen_at:before.oplachen_at,versija:current.versija},ostatok:created?{id:created.id,versija:created.versija}:null,zadachi:tasks.map(row=>({id:row.id,status:row.status,versija:db.prepare('SELECT versija FROM zadachi WHERE id=?').get(row.id).versija}))});
  return {telo:result};
 });
}
function otmenit({kljuch,telo,metod,avtor}){
 if(metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});
 const db=baza();return v_odnoj_tranzakcii(db,()=>{
  prava(db,avtor);parametry(telo,['versija','zapros_kljuch','otmenit_zapros']);const id=nomer(kljuch),old=receipt.povtor(db,avtor,id,'otmenit_prishlo',telo);if(old)return {telo:old};
  const current=odna(db,id);versions.proverit(db,'platezhi',current,telo.versija,dependencies);
  if(telo.otmenit_zapros!==undefined){
   const original=receipt.najti(db,avtor,telo.otmenit_zapros);if(!original||original.platezh_id!==id||original.dejstvie!=='prishlo')throw new NeNajdeno('Исходная платёжная команда не найдена');
   const inverse=JSON.parse(original.obratno);versions.proverit(db,'platezhi',current,inverse.platezh.versija,dependencies);
   if(!current.oplachen_at)throw new Konflikt('Отметка уже снята. Обнови список.');
   let remainder;
   if(inverse.ostatok){remainder=odna(db,inverse.ostatok.id);versions.proverit(db,'platezhi',remainder,inverse.ostatok.versija,Object.keys(remainder));if(db.prepare('SELECT 1 FROM zadachi WHERE platezh_id=? LIMIT 1').get(remainder.id))throw new Konflikt('У остатка уже появилась задача. Общая отмена не применена.');}
   const tasks=inverse.zadachi.map(old=>{const row=db.prepare('SELECT * FROM zadachi WHERE id=?').get(old.id);if(!row)throw new Konflikt('Связанная задача уже удалена');versions.proverit(db,'zadachi',row,old.versija,Object.keys(row));return {old,row};});
   zapisat(db,current,{summa:inverse.platezh.summa,oplachen_at:inverse.platezh.oplachen_at},avtor);
   if(remainder)require('./obschij.js').udalit('platezhi',require('./opisanija.js').OPISANIJA.platezhi,remainder.id,avtor,{versija:remainder.versija});
   for(const {old,row} of tasks){db.prepare('UPDATE zadachi SET status=?,versija=versija+1 WHERE id=?').run(old.status,row.id);require('./obschij.js').v_zhurnal(db,'zadachi',row.id,'status',row.status,old.status,avtor,row);}
  }else if(current.oplachen_at)zapisat(db,current,{oplachen_at:null},avtor);
  const result=otvet(odna(db,id));receipt.zapomnit(db,avtor,id,'otmenit_prishlo',telo,result,{});return {telo:result};
 });
}
module.exports={prishlo,otmenit,proverka,proveritDannye,dependencies,summa,data};
