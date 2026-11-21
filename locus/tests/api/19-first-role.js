const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {nado,zapros,proverit}=require('../prover.js');
module.exports=async()=>{
  const make=async(t,telo)=>(await nado('POST','/api/'+t,{telo})).telo;
  const db=new DatabaseSync(process.env.LOCUS_BAZA);
  try{
    const person=await make('ljudi',{imja:'First role API fixture'});
    const s=await make('sotrudnichestva',{chelovek_id:person.id,napravlenie:'synapt',rol:'lid',istochnik:'rekomendacija',rekomendoval_id:2});
    const initial=db.prepare("SELECT * FROM zhurnal WHERE obekt='sotrudnichestvo' AND obekt_id=? AND pole='rol'").all(s.id);
    assert.equal(initial.length,1);assert.equal(initial[0].bylo,null);assert.equal(initial[0].stalo,'lid');
                                                                                
    db.prepare("UPDATE zhurnal SET kogda='2011-04-01 00:00:00' WHERE id=?").run(initial[0].id);
    const goal=await make('celi',{nazvanie:'First lead period',napravlenie:'synapt',period_id:'2011-Q2',sostojanie:'aktivna'});
    const r=await make('rezultaty',{cel_id:goal.id,nazvanie:'First lead count',istochnik:'formula',formula:'lidov',baza:0,plan:10});
    const card=async()=>(await nado('GET','/api/okr/rezultat/'+r.id)).telo;
    assert.equal((await card()).fakt,1,'initial period card');
    const changed=(await nado('PATCH','/api/sotrudnichestva/'+s.id,{telo:{versija:s.versija,rol:'klient'}})).telo;
    assert.equal((await card()).fakt,1,'after client card');
    await nado('PATCH','/api/sotrudnichestva/'+s.id,{telo:{versija:changed.versija,rol:'lid'}});
    assert.equal((await card()).fakt,1,'repeat card');
    const screen=(await nado('GET','/api/okr?period=2011-Q2')).telo;
    assert.equal(screen.rezultaty.find(x=>x.id===r.id).fakt,1,'screen');
    const preview=(await nado('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'lidov',cel_id:goal.id,period_id:goal.period_id}})).telo;
    assert.equal(preview.znachenie,1,'preview');
    assert.equal((await nado('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'lidov',cel_id:goal.id}})).telo.znachenie,1);
    assert.equal((await zapros('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'lidov',cel_id:goal.id,period:'2012-Q2'}})).kod,400);
    assert.deepEqual(preview.polnota_dannyh,(await card()).polnota_dannyh);
    const count=db.prepare('SELECT count(*) n FROM sotrudnichestva').get().n;
    db.exec("CREATE TRIGGER fail_initial_role BEFORE INSERT ON zhurnal WHEN NEW.obekt='sotrudnichestvo' AND NEW.pole='rol' AND NEW.bylo IS NULL BEGIN SELECT RAISE(ABORT,'test initial role'); END");
    try{
      assert.equal((await zapros('POST','/api/sotrudnichestva',{telo:{chelovek_id:person.id,napravlenie:'media',rol:'lid'}})).kod,500);
      assert.equal(db.prepare('SELECT count(*) n FROM sotrudnichestva').get().n,count);
    }finally{db.exec('DROP TRIGGER fail_initial_role');}
    proverit('первый переход роли: журнал, квартал, повтор, все три ответа и атомарный отказ',true);
  }finally{db.close();}
};
