const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {nado,zapros,proverit}=require('../prover');
module.exports=async()=>{
  const make=async(table,telo)=>(await nado('POST','/api/'+table,{telo})).telo;
  const client=await make('ljudi',{imja:'Aggregate client'});
  const member=await make('ljudi',{imja:'Aggregate participant',komanda:true});
  const project=await make('proekty',{nazvanie:'Aggregate project',klient_id:client.id,napravlenie:'synapt',status:'idet'});
  const task=await make('zadachi',{nazvanie:'Aggregate parent',tip:'klientskaja',napravlenie:'synapt',
    otvetstvennyj:2,klient_id:client.id,proekt_id:project.id,sprint:48,uchastniki:[member.id],
    materialy:[{nazvanie:'Brief',ssylka:'https://example.com/brief'}],podzadachi:[{nazvanie:'Aggregate child'}]});
  const child=(await nado('GET','/api/zadachi?roditel_id='+task.id)).telo.spisok[0];
  assert.equal(task.podzadachi.length,1);
  assert.equal(child.klient_id,client.id);assert.equal(child.proekt_id,project.id);
  assert.equal(child.sprint,48);assert.equal(child.tip,'klientskaja');
  assert.equal((await nado('GET',`/api/zadachi/${task.nomer}/uchastniki`)).telo.spisok[0].chelovek_id,member.id);
  assert.equal((await nado('GET','/api/materialy?zadacha_id='+task.id)).telo.spisok.length,1);
  assert.ok((await nado('GET','/api/zhurnal?obekt=zadacha&obekt_id='+child.id)).telo.spisok.some(r=>r.pole==='sozdano'));
  const db=new DatabaseSync(process.env.LOCUS_BAZA);
  const counts=()=>Object.fromEntries(['zadachi','materialy','zadacha_uchastniki','zhurnal','uvedomlenija']
    .map(table=>[table,db.prepare('SELECT count(*) n FROM '+table).get().n]));
  const before=counts();
  db.exec(`CREATE TRIGGER aggregate_child_failure BEFORE INSERT ON zhurnal
    WHEN NEW.obekt='zadacha' AND NEW.pole='sozdano' AND
      EXISTS(SELECT 1 FROM zadachi WHERE id=NEW.obekt_id AND nazvanie='Audit failing child')
    BEGIN SELECT RAISE(ABORT,'aggregate_child_failure');END`);
  try{
    const failed=await zapros('POST','/api/zadachi',{telo:{nazvanie:'Must roll back',napravlenie:'synapt',otvetstvennyj:2,
      uchastniki:[member.id],materialy:[{nazvanie:'Must roll back',ssylka:'https://example.com/file'}],
      podzadachi:[{nazvanie:'Audit failing child'}]}});
    assert.equal(failed.kod,500);assert.deepEqual(counts(),before);
  }finally{db.exec('DROP TRIGGER aggregate_child_failure');}
  const invalid=await zapros('POST','/api/zadachi',{telo:{nazvanie:'Invalid participant',napravlenie:'synapt',
    otvetstvennyj:2,uchastniki:[999999999]}});
  assert.ok(invalid.kod>=400&&invalid.kod<500);assert.deepEqual(counts(),before);
  const business=await make('zadachi',{nazvanie:'Business parent',tip:'biznesovaja',plan_chislo:10,
    napravlenie:'synapt',otvetstvennyj:2,podzadachi:[{nazvanie:'Business step'}]});
  const step=(await nado('GET','/api/zadachi?roditel_id='+business.id)).telo.spisok[0];
  assert.equal(step.tip,'biznesovaja');assert.equal(step.plan_chislo,null);
  await make('zadachi',{nazvanie:'Independent child direction',napravlenie:'media',otvetstvennyj:2,roditel_id:business.id});
  db.close();
  proverit('whole task saves references, participants, materials, children and their journal atomically',true);
};
