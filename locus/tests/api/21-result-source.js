const assert=require('node:assert/strict');
const {nado,zapros,proverit}=require('../prover.js');
module.exports=async()=>{
  const make=async(t,telo)=>(await nado('POST','/api/'+t,{telo})).telo;
  const get=async(t)=>(await nado('GET','/api/'+t)).telo;
  const g=await make('celi',{nazvanie:'Result source contract',napravlenie:'synapt',period_id:'2013-Q2',sostojanie:'aktivna'});
  let r=await make('rezultaty',{cel_id:g.id,nazvanie:'Switch sources',istochnik:'formula',formula:'lidov',baza:0,plan:10});
  for(const body of [{formula:'not_a_metric'},{istochnik:'akkaunt'},{istochnik:'ruchnoj_zamer',formula:'lidov'},
    {istochnik:'formula',akkaunt_id:999},{istochnik:null}]){
    const res=await zapros('PATCH','/api/rezultaty/'+r.id,{telo:{versija:r.versija,...body}});
    assert.equal(res.kod,400,JSON.stringify(body));
    const current=await get('rezultaty/'+r.id);assert.equal(current.versija,r.versija);assert.equal(current.formula,'lidov');
  }
  r=(await nado('PATCH','/api/rezultaty/'+r.id,{telo:{versija:r.versija,istochnik:'ruchnoj_zamer'}})).telo;
  assert.equal(r.formula,null);assert.equal(r.akkaunt_id,null);assert.equal(r.metrika,null);
  const account=await make('akkaunty',{nazvanie:'Switch source account',ploshadka:'telegram',uroven:'public',napravlenie:'synapt'});
  r=(await nado('PATCH','/api/rezultaty/'+r.id,{telo:{versija:r.versija,istochnik:'akkaunt',akkaunt_id:account.id,metrika:'podpischikov'}})).telo;
  assert.equal((await get('okr/rezultat/'+r.id)).fakt,null);
  for(const body of [{metrika:'not_a_metric'},{akkaunt_id:null},{formula:'lidov'}]){
    assert.equal((await zapros('PATCH','/api/rezultaty/'+r.id,{telo:{versija:r.versija,...body}})).kod,400);
    assert.equal((await get('rezultaty/'+r.id)).versija,r.versija);
  }
  r=(await nado('PATCH','/api/rezultaty/'+r.id,{telo:{versija:r.versija,istochnik:'formula',formula:'lidov'}})).telo;
  assert.equal(r.akkaunt_id,null);assert.equal(r.metrika,null);
  for(const formula of ['constructor','toString','__proto__'])assert.equal((await zapros('POST','/api/rezultaty',{telo:{cel_id:g.id,nazvanie:'Invalid name',plan:10,istochnik:'formula',formula}})).kod,400);
  for(const formula of ['constructor','toString','__proto__','DELETE FROM ljudi','SELECT count(*) FROM ljudi']){
    assert.equal((await zapros('POST','/api/rezultaty/proverit_formulu',{telo:{formula}})).kod,422);
  }
  assert.equal((await zapros('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'x'.repeat(2001)}})).kod,400);
  const alias=(await nado('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'novyh_lidov',napravlenie:'synapt'}})).telo;
  const canonical=(await nado('POST','/api/rezultaty/proverit_formulu',{telo:{formula:'lidov',napravlenie:'synapt'}})).telo;
  assert.equal(alias.znachenie,canonical.znachenie);
  const veha=await make('rezultaty',{cel_id:g.id,nazvanie:'Milestone no source',tip:'veha'});
  assert.equal(veha.istochnik,null);
  assert.equal((await zapros('PATCH','/api/rezultaty/'+veha.id,{telo:{versija:veha.versija,istochnik:'formula',formula:'lidov'}})).kod,400);
  const target=await make('celi',{nazvanie:'Full result target',napravlenie:'synapt',period_id:'2013-Q2',sostojanie:'aktivna'});
  for(let i=0;i<5;i++)await make('rezultaty',{cel_id:target.id,nazvanie:'Target result '+i,plan:10});
  const moved=await nado('PATCH','/api/rezultaty/'+r.id,{telo:{versija:r.versija,cel_id:target.id}});
  assert.match(moved.telo.podskazka,/шести|6 результатов/);
  assert.equal((await get('rezultaty/'+r.id)).cel_id,target.id);
  proverit('источник результата: одинаковая проверка POST/PATCH, очистка связей, атомарный отказ и рекомендательный размер цели',true);
};
