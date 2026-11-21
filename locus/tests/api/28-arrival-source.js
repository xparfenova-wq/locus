const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {nado,zapros,proverit}=require('../prover.js');
module.exports=async()=>{
 const db=new DatabaseSync(process.env.LOCUS_BAZA);db.exec('PRAGMA foreign_keys=ON');
 const make=async(table,telo)=>(await nado('POST','/api/'+table,{telo})).telo;
 const get=async(table,id)=>(await nado('GET','/api/'+table+'/'+id)).telo;
 const tables=['ljudi','kontakty','sotrudnichestva','rassylki','proekty','zadachi','uvedomlenija','zhurnal','versii_polej'];
 const snapshot=()=>Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
 try{
  const ref=await make('ljudi',{imja:'Arrival referrer fixture'});
  const campaign=await make('rassylki',{nazvanie:'Arrival correct campaign',napravlenie:'media',plan_chislo:50});
  const other=await make('rassylki',{nazvanie:'Arrival wrong direction',napravlenie:'synapt',plan_chislo:50});
  const subject=await make('ljudi',{imja:'Arrival invalid fixture'});
  const base={chelovek_id:subject.id,napravlenie:'media',rol:'lid'};
  for(const data of [
   {istochnik:'rekomendacija'},{istochnik:'rassylka'},{istochnik:'meroprijatie',istochnik_tekst:'  '},{istochnik:'svoj'},
   {istochnik:'rekomendacija',rekomendoval_id:99999999},
   {istochnik:'rekomendacija',rekomendoval_id:subject.id},
   {istochnik:'rassylka',rassylka_id:99999999},{istochnik:'rassylka',rassylka_id:other.id},
   {istochnik:'sajt',rekomendoval_id:ref.id},{istochnik:'missing_source'},
  ]){
   const before=snapshot();const response=await zapros('POST','/api/sotrudnichestva',{telo:{...base,...data}});
   assert.equal(response.kod,400,JSON.stringify(data));assert.deepEqual(snapshot(),before);
  }
  proverit('источник проверяет обязательные уточнения, существование, направление и противоречивые поля до записи',true);
  const definitions=[
   ['rekomendacija',{rekomendoval_id:ref.id}],['rassylka',{rassylka_id:campaign.id}],
   ['meroprijatie',{istochnik_tekst:'  Conference fixture  '}],['svoj',{istochnik_tekst:'  Own fixture  '}],
   ['sajt',{}],['socseti',{}],['holodnyj_kontakt',{}],
  ];
  const records=[];
  for(const [source,details] of definitions){
   const person=await make('ljudi',{imja:'Arrival valid '+source});
   const record=await make('sotrudnichestva',{chelovek_id:person.id,napravlenie:'media',rol:'lid',istochnik:source,...details});
   assert.equal(record.istochnik,source);records.push(record);
  }
  assert.equal(records.length,7);assert.equal(records[0].rekomendoval_imja,ref.imja);
  assert.equal(records[1].rassylka_nazvanie,campaign.nazvanie);
  assert.equal(records[2].istochnik_tekst,'Conference fixture');
  const ownSearch=(await nado('GET','/api/sotrudnichestva?istochnik=svoj&q=Own%20fixture')).telo;
  assert.equal(ownSearch.spisok.length,1);assert.equal(ownSearch.spisok[0].id,records[3].id);
  assert.equal(ownSearch.spisok[0].istochnik_tekst,'Own fixture');
  assert.equal(db.prepare("SELECT count(*) n FROM sotrudnichestva WHERE istochnik='rekomendacija' AND rekomendoval_id IS NULL").get().n,0);
  assert.equal(db.prepare("SELECT count(*) n FROM sotrudnichestva WHERE istochnik='rassylka' AND rassylka_id IS NULL").get().n,0);
  proverit('семь источников сохраняются с нужными связями, подписями и очищенным текстом',true);
  let before=snapshot();
  assert.equal((await zapros('PATCH','/api/sotrudnichestva/'+records[0].id,{telo:{versija:records[0].versija,chelovek_id:ref.id}})).kod,400);
  assert.deepEqual(snapshot(),before);
  assert.equal((await zapros('POST','/api/ljudi',{telo:{imja:'Arrival atomic invalid',kontakty:[{tip:'pochta',znachenie:'arrival-atomic@example.test'}],sotrudnichestvo:{napravlenie:'media',rol:'lid',istochnik:'rassylka'}}})).kod,400);
  assert.deepEqual(snapshot(),before);
  proverit('ошибка источника откатывает всю новую карточку, контакты, журнал и версии',true);
  const changed=(await nado('PATCH','/api/sotrudnichestva/'+records[0].id,{telo:{versija:records[0].versija,istochnik:'sajt'}})).telo;
  assert.equal(changed.rekomendoval_id,null);assert.equal(changed.rassylka_id,null);
  assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='sotrudnichestvo' AND obekt_id=? AND pole='istochnik'").get(changed.id).n,1);
  const seen=await get('sotrudnichestva',records[4].id);
  await nado('PATCH','/api/sotrudnichestva/'+seen.id,{telo:{versija:seen.versija,osobennosti:'Independent arrival note'}});
  const merged=(await nado('PATCH','/api/sotrudnichestva/'+seen.id,{telo:{versija:seen.versija,istochnik:'meroprijatie',istochnik_tekst:'Independent event'}})).telo;
  assert.equal(merged.osobennosti,'Independent arrival note');assert.equal(merged.istochnik_tekst,'Independent event');
  assert.equal((await zapros('PATCH','/api/sotrudnichestva/'+seen.id,{telo:{versija:seen.versija,istochnik:'socseti'}})).kod,409);
  proverit('источник меняется с журналом и очищением старой связи, другие поля сливаются, конфликт источника отклоняется',true);
  before=snapshot();
  assert.equal((await zapros('DELETE','/api/rassylki/'+campaign.id,{telo:{versija:campaign.versija}})).kod,409);
  assert.equal((await zapros('PATCH','/api/rassylki/'+campaign.id,{telo:{versija:campaign.versija,napravlenie:'synapt'}})).kod,409);
  assert.deepEqual(snapshot(),before);
  assert.throws(()=>db.prepare('UPDATE sotrudnichestva SET rassylka_id=99999999 WHERE id=?').run(records[1].id),/FOREIGN KEY/);
  assert.deepEqual(snapshot(),before);
  const preview=(await nado('GET','/api/rassylki/'+campaign.id+'/predprosmotr_udalenija')).telo;assert.equal(preview.istochnik_prihoda,1);
  proverit('связанная рассылка защищена от удаления и переноса, FK защищает прямой SQL',true);
  const legacy=await make('sotrudnichestva',{chelovek_id:subject.id,napravlenie:'media',rol:'lid'});
  db.prepare("UPDATE sotrudnichestva SET istochnik='rekomendacija' WHERE id=?").run(legacy.id);
  const old=await get('sotrudnichestva',legacy.id);
  const independent=(await nado('PATCH','/api/sotrudnichestva/'+old.id,{telo:{versija:old.versija,osobennosti:'Old source remains unknown'}})).telo;
  assert.equal(independent.istochnik,'rekomendacija');assert.equal(independent.rekomendoval_id,null);
  await nado('PATCH','/api/sotrudnichestva/'+old.id,{telo:{versija:independent.versija,istochnik:null}});
  proverit('посторонняя правка старой неполной строки не угадывает источник и не блокируется',true);
  before=snapshot();
  db.exec("CREATE TRIGGER fail_arrival_journal BEFORE INSERT ON zhurnal WHEN NEW.obekt='sotrudnichestvo' AND NEW.pole='istochnik' BEGIN SELECT RAISE(ABORT,'fixture arrival journal failure'); END");
  try{assert.equal((await zapros('PATCH','/api/sotrudnichestva/'+merged.id,{telo:{versija:merged.versija,istochnik:'socseti'}})).kod,500);assert.deepEqual(snapshot(),before);}
  finally{db.exec('DROP TRIGGER fail_arrival_journal');}
  proverit('ошибка журнала откатывает источник и версии целиком',true);
 }finally{db.close();}
};
