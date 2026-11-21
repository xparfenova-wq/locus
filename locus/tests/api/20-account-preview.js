const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {nado,zapros,proverit}=require('../prover.js');
module.exports=async()=>{
  const db=new DatabaseSync(process.env.LOCUS_BAZA);
  const make=async(t,telo)=>(await nado('POST','/api/'+t,{telo})).telo;
  const get=async(t)=>(await nado('GET','/api/'+t)).telo;
  try{
    const a=await make('akkaunty',{nazvanie:'Account preview fixture',ploshadka:'telegram',uroven:'public',napravlenie:'synapt'});
    assert.equal((await get('akkaunty/'+a.id+'/pokazatel?metrika=podpischikov')).znachenie,null);
    assert.equal((await zapros('GET','/api/akkaunty/'+a.id+'/pokazatel?metrika=sql')).kod,400);
    assert.equal((await zapros('GET','/api/akkaunty/99999999/pokazatel?metrika=ohvat')).kod,404);
    const g=await make('celi',{nazvanie:'Missing account data',napravlenie:'synapt',period_id:'2012-Q2',sostojanie:'aktivna'});
    const r=await make('rezultaty',{cel_id:g.id,nazvanie:'Subscribers unknown',istochnik:'akkaunt',akkaunt_id:a.id,metrika:'podpischikov',baza:40,plan:100});
    const card=await get('okr/rezultat/'+r.id);assert.equal(card.fakt,null);assert.equal(card.progress_pct,null);
    let screen=await get('okr?period=2012-Q2');let goal=screen.celi.find(c=>c.id===g.id);
    assert.equal(goal.procent,null);assert.equal(goal.status_celi,'net_dannyh');
    assert.equal(goal.rezultaty[0].fakt,null);assert.equal(goal.rezultaty[0].progress_pct,null);
    db.prepare('INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,ohvat) VALUES(?,?,?,?)').run(a.id,'2012-05-02',50,null);
    db.prepare('INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,ohvat) VALUES(?,?,?,?)').run(a.id,'2012-04-25',null,null);
    assert.equal((await get('akkaunty/'+a.id+'/pokazatel?metrika=podpischikov')).znachenie,50);
    assert.equal((await get('akkaunty/'+a.id+'/pokazatel?metrika=prirost_podpischikov')).znachenie,null);
    assert.equal((await get('akkaunty/'+a.id+'/pokazatel?metrika=ohvat_k_podpischikam')).znachenie,null);
    screen=await get('okr?period=2012-Q2');goal=screen.celi.find(c=>c.id===g.id);
    assert.equal(goal.rezultaty[0].fakt,50);assert.equal(goal.procent,17);
    proverit('метрика аккаунта: предпросмотр, отсутствие данных, нет ложного нуля, единый факт',true);
  }finally{db.close();}
};
