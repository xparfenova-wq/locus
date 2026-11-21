const {baza,v_api,OshibkaVvoda,NeNajdeno,Konflikt}=require('../db/db.js');
function id(value,field){
  if(typeof value==='boolean'||value===null||!['number','string'].includes(typeof value)||!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))throw new OshibkaVvoda(field+': нужен положительный целый номер',field);
  return Number(value);
}
function uchastniki({kljuch,telo={},metod,avtor,svjazannyj_id}){
 const db=baza(),number=id(kljuch,'nomer'),task=db.prepare('SELECT id,nomer,nazvanie FROM zadachi WHERE nomer=? AND udaleno IS NOT 1').get(number);
 if(!task)throw new NeNajdeno('задача не найдена');
 const select='SELECT u.id,u.zadacha_id,u.chelovek_id,u.dobavleno,l.imja,l.foto,l.inicialy FROM zadacha_uchastniki u JOIN ljudi l ON l.id=u.chelovek_id';
 if(metod==='GET'&&svjazannyj_id===undefined){
  const rows=db.prepare(select+' WHERE u.zadacha_id=? ORDER BY u.id').all(task.id);return{telo:{spisok:rows.map(v_api),vsego:rows.length}};
 }
 if(metod==='DELETE'&&svjazannyj_id!==undefined){
  if(Object.keys(telo).length)throw new OshibkaVvoda('участник задаётся адресом, тело удаления должно быть пустым','chelovek_id');
  const person=id(svjazannyj_id,'chelovek_id'),row=db.prepare(select+' WHERE u.zadacha_id=? AND u.chelovek_id=?').get(task.id,person);
  if(row){db.prepare('DELETE FROM zadacha_uchastniki WHERE zadacha_id=? AND chelovek_id=?').run(task.id,person);require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'uchastnik',row.imja,null,avtor);}
  return{kod:204};
 }
 if(metod!=='POST'||svjazannyj_id!==undefined)throw Object.assign(new Error('доступны список, добавление и удаление участника по адресу'),{kod:405});
 if(Object.keys(telo).some(key=>key!=='chelovek_id'))throw new OshibkaVvoda('для добавления нужен только chelovek_id','chelovek_id');
 const person=id(telo.chelovek_id,'chelovek_id'),member=db.prepare('SELECT id,imja,komanda,arhiv FROM ljudi WHERE id=?').get(person);
 if(!member||member.komanda!==1||member.arhiv===1)throw Object.assign(new OshibkaVvoda('участник должен быть действующим коллегой из команды','chelovek_id'),{kod:422});
 const existing=db.prepare(select+' WHERE u.zadacha_id=? AND u.chelovek_id=?').get(task.id,person);
 if(existing)throw new Konflikt('коллега уже участвует в задаче',{uchastnik_uzhe_est:true,uchastnik:v_api(existing)});
 db.prepare('INSERT INTO zadacha_uchastniki(zadacha_id,chelovek_id) VALUES(?,?)').run(task.id,person);
 require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'uchastnik',null,member.imja,avtor);
 const {uvedomit,POTOKI,kto_dobavil_slovami}=require('./opisanija.js');
 uvedomit(db,{komu:person,avtor,tip:'dobavili_uchastnikom',potok:POTOKI.pro_menja,zadacha_id:task.id,tekst:kto_dobavil_slovami(db,avtor,'вас в участники')+': '+task.nazvanie});
 return{kod:201,telo:v_api(db.prepare(select+' WHERE u.zadacha_id=? AND u.chelovek_id=?').get(task.id,person))};
}
module.exports={uchastniki};
