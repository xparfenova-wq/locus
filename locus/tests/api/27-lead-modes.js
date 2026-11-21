const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {nado,zapros,proverit}=require('../prover.js');
module.exports=async()=>{
 const db=new DatabaseSync(process.env.LOCUS_BAZA),make=async(table,telo)=>(await nado('POST','/api/'+table,{telo})).telo;
 try{
  const people=[];
  for(const [label,date] of [['new','2004-05-11 09:00:00'],['worked','2004-01-01 09:00:00'],['idle','2004-01-02 09:00:00']]){
   const person=await make('ljudi',{imja:'Lead modes API '+label});
   const s=await make('sotrudnichestva',{chelovek_id:person.id,napravlenie:'media',rol:'lid'});
   db.prepare('UPDATE sotrudnichestva SET sozdano=? WHERE id=?').run(date,s.id);
   db.prepare("UPDATE zhurnal SET kogda=? WHERE obekt='sotrudnichestvo' AND obekt_id=?").run(date,s.id);people.push(person);
  }
  const task=await make('zadachi',{nazvanie:'Lead modes work API',napravlenie:'media',tip:'klientskaja',klient_id:people[1].id,otvetstvennyj:2});
  db.prepare("UPDATE zadachi SET sozdano='2004-05-12 09:00:00' WHERE id=?").run(task.id);
  db.prepare("UPDATE zhurnal SET kogda='2004-05-12 09:00:00' WHERE obekt='zadacha' AND obekt_id=?").run(task.id);
  const goal=await make('celi',{nazvanie:'Lead mode API period',napravlenie:'media',period_id:'2004-Q2',sostojanie:'aktivna'});
  const one=await make('rezultaty',{cel_id:goal.id,nazvanie:'Only new API',istochnik:'formula',formula:'lidov',plan:10});
  const all=await make('rezultaty',{cel_id:goal.id,nazvanie:'All worked API',istochnik:'formula',formula:'lidov',plan:10,schitat_lidov:'vse'});
  assert.equal(one.schitat_lidov,'tolko_novye');assert.equal(db.prepare('SELECT schitat_lidov FROM rezultaty WHERE id=?').get(one.id).schitat_lidov,'tolko_novye');
  for(const [r,wanted] of [[one,1],[all,2]]){
   const card=(await nado('GET','/api/okr/rezultat/'+r.id)).telo;
   const screen=(await nado('GET','/api/okr?period=2004-Q2')).telo.rezultaty.find(row=>row.id===r.id);
   const preview=(await nado('POST','/api/rezultaty/proverit_formulu',{telo:{formula:r.formula,cel_id:goal.id,schitat_lidov:r.schitat_lidov}})).telo;
   assert.equal(card.fakt,wanted);assert.equal(screen.fakt,wanted);assert.equal(preview.znachenie,wanted);
   assert.equal(card.schitat_lidov,r.schitat_lidov);assert.deepEqual(preview.polnota_dannyh,card.polnota_dannyh);
  }
  const meeting=(await nado('GET','/api/planerka?napravlenie=media&sprint=2004-20')).telo;
  assert.equal(meeting.svodka.celi.find(row=>row.id===goal.id).rezultaty.find(row=>row.id===all.id).fakt,2);
  assert.equal(meeting.ustarevshie_zamery.filter(row=>[one.id,all.id].includes(row.rezultat_id)).length,0);
  assert.equal(meeting.lidy.novyh,1);assert.equal(meeting.lidy.prezhnih,1);assert.equal(meeting.lidy.vsego,2);
  proverit('режим новых по умолчанию; все учитывает работу; карточка, экран, проверка и планёрка согласованы',true);
  const before=await nado('GET','/api/rezultaty/'+all.id);
  const changed=(await nado('PATCH','/api/rezultaty/'+all.id,{telo:{versija:before.telo.versija,schitat_lidov:'tolko_novye'}})).telo;
  assert.equal((await nado('GET','/api/okr/rezultat/'+all.id)).telo.fakt,1);
  assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='rezultat' AND obekt_id=? AND pole='schitat_lidov'").get(all.id).n,1);
  assert.equal((await zapros('PATCH','/api/rezultaty/'+all.id,{telo:{versija:before.telo.versija,schitat_lidov:'vse'}})).kod,409);
  assert.equal((await zapros('PATCH','/api/rezultaty/'+all.id,{telo:{versija:changed.versija,schitat_lidov:'anything'}})).kod,400);
  assert.equal((await zapros('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'lidov',cel_id:goal.id,schitat_lidov:'anything'}})).kod,400);
  assert.equal((await zapros('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'zadach_zakryto',cel_id:goal.id,schitat_lidov:'vse'}})).kod,400);
  const manual=(await nado('PATCH','/api/rezultaty/'+all.id,{telo:{versija:changed.versija,istochnik:'ruchnoj_zamer'}})).telo;assert.equal(manual.schitat_lidov,null);
  proverit('смена режима версионна и записана в журнал; неверный режим отклонён, другой источник очищает выбор',true);
  const oldLead=db.prepare('SELECT * FROM sotrudnichestva WHERE chelovek_id=?').get(people[2].id);
  await nado('PATCH','/api/sotrudnichestva/'+oldLead.id,{telo:{versija:oldLead.versija,rol:'klient'}});
  db.prepare("UPDATE zhurnal SET kogda='2004-05-13 09:00:00' WHERE obekt='sotrudnichestvo' AND obekt_id=? AND pole='rol' AND bylo='lid' AND stalo='klient'").run(oldLead.id);
  assert.equal((await nado('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'lidov',cel_id:goal.id,schitat_lidov:'vse'}})).telo.znachenie,3);
  proverit('прежний лид, ставший клиентом в периоде, учитывается как подтверждённая работа',true);
  const seen=(await nado('GET','/api/rezultaty/'+one.id)).telo;
  db.prepare('UPDATE rezultaty SET schitat_lidov=NULL WHERE id=?').run(one.id);
  const independent=(await nado('PATCH','/api/rezultaty/'+one.id,{telo:{versija:seen.versija,plan:20}})).telo;
  assert.equal(independent.plan,20);assert.equal(independent.schitat_lidov,null);
  proverit('правка плана старой строки не переписывает чужой выбор лидов и не создаёт ложный конфликт',true);
 }finally{db.close();}
};
