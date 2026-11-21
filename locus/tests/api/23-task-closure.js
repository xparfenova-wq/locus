const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {nado,zapros,proverit}=require('../prover.js');
module.exports=async()=>{
  const db=new DatabaseSync(process.env.LOCUS_BAZA);
  const make=async(table,telo)=>(await nado('POST','/api/'+table,{telo})).telo;
  const get=async(task)=>(await nado('GET','/api/zadachi/'+task.nomer)).telo;
  const task=extra=>make('zadachi',{nazvanie:'Closure contract',napravlenie:'synapt',otvetstvennyj:2,...extra});
  const goal=await make('celi',{nazvanie:'Closure goal',napravlenie:'synapt',period_id:'2034-Q2',sostojanie:'aktivna'});
  const result=(tip,extra={})=>make('rezultaty',{cel_id:goal.id,nazvanie:'Closure '+tip,tip,...extra});
  const close=(method,z,extra={})=>nado(method,'/api/zadachi/'+z.nomer+(method==='POST'?'/zakryt':''),{
    telo:{versija:z.versija,...(method==='PATCH'?{status:'sdelano'}:{}),...extra}});
  try{
    for(const method of ['POST','PATCH']){
      const milestone=await result('veha'),z=await task({cel_id:goal.id,rezultat_id:milestone.id});
      const saved=(await close(method,z)).telo;
      let current=db.prepare('SELECT * FROM rezultaty WHERE id=?').get(milestone.id);
      assert.equal(current.zakryta,1);assert.equal(current.versija,milestone.versija+1);
      assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='rezultat' AND obekt_id=? AND pole='zakryta'").get(milestone.id).n,1);
      await nado('PATCH','/api/zadachi/'+z.nomer,{telo:{versija:saved.versija,status:'v_plane'}});
      current=db.prepare('SELECT * FROM rezultaty WHERE id=?').get(milestone.id);
      assert.equal(current.zakryta,0);assert.equal(current.versija,milestone.versija+2);
      proverit(method+': веха, версия и журнал закрытия/отмены',true);
    }
    const numeric=await result('chislo',{istochnik:'ruchnoj_zamer',plan:10,baza:0});
    for(const method of ['POST','PATCH']){
      for(let i=0;i<3;i++){
        const z=await task({cel_id:goal.id,rezultat_id:numeric.id});
        assert.equal((await close(method,z)).telo.predlozhit_zamer.id,numeric.id);
      }
      const parent=await task(),child=await task({roditel_id:parent.id});
      assert.equal((await get(parent)).otkrytyh_podzadach,1);
      const wrong=await zapros(method,'/api/zadachi/'+parent.nomer+(method==='POST'?'/zakryt':''),{
        telo:{versija:parent.versija,...(method==='PATCH'?{status:'sdelano'}:{ostavit_podzadachi:true}),podtverzhdeno_podzadach:0}});
      assert.equal(wrong.kod,409);assert.equal(wrong.telo.podzadach,1);
      const saved=(await close(method,parent,method==='POST'?{ostavit_podzadachi:true,podtverzhdeno_podzadach:1}:{})).telo;
      assert.equal(saved.preduprezhdenie.podzadach,1);assert.equal(saved.zakryto_podzadach||0,0);
      assert.notEqual((await get(child)).status,'sdelano');
      proverit(method+': ручной замер 3/3, предупреждение и независимая подзадача',true);
    }
    const formula=await result('chislo',{istochnik:'formula',formula:'lidov',plan:10,baza:0});
    for(let i=0;i<3;i++){
      const z=await task({cel_id:goal.id,rezultat_id:formula.id});
      assert.equal((await close('PATCH',z)).telo.predlozhit_zamer,undefined);
    }
    const money=await result('dengi',{istochnik:'ruchnoj_zamer',plan:987654,baza:0});
    const restricted=await make('ljudi',{imja:'Closure no money',dostup:'bez_deneg'});
                                                                                               
    const hidden=await task({cel_id:goal.id,rezultat_id:money.id});
    const noMoney=await nado('PATCH','/api/zadachi/'+hidden.nomer,{avtor:restricted.id,telo:{versija:hidden.versija,status:'sdelano'}});
    assert.equal(noMoney.telo.predlozhit_zamer,undefined);assert.ok(!JSON.stringify(noMoney.telo).includes('987654'));
    const linkedGoal=await task({cel_id:goal.id});
    const offered=(await close('PATCH',linkedGoal)).telo.predlozhit_zamer;
    assert.ok(offered.rezultaty.some(r=>r.id===numeric.id));assert.ok(!offered.rezultaty.some(r=>r.id===formula.id));
    proverit('формула 0/3, денежный доступ и выбор ручного результата',true);

                                                                                                 
    const faultGoal=await make('celi',{nazvanie:'Atomic closure',napravlenie:'synapt',period_id:goal.period_id,sostojanie:'aktivna'});
    const milestone=await make('rezultaty',{cel_id:faultGoal.id,nazvanie:'Atomic milestone',tip:'veha'});
    const converted=(await nado('POST','/api/okr/vehi/'+milestone.id+'/zadachi',{telo:{}})).telo;
    assert.equal(converted.cel_id,faultGoal.id);assert.equal(converted.rezultat_id,milestone.id);assert.equal(converted.versija,1);
    assert.equal(converted.nazvanie,milestone.nazvanie);
    assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='sozdano'").get(converted.id).n,1);
    const taskCount=db.prepare('SELECT count(*) n FROM zadachi').get().n;
    assert.equal((await zapros('POST','/api/okr/vehi/'+milestone.id+'/zadachi',{telo:{otvetstvennyj:999999}})).kod,400);
    assert.equal(db.prepare('SELECT count(*) n FROM zadachi').get().n,taskCount);
    proverit('веха задачей: общий POST, связи, версия, журнал, проверка ответственного',true);
    const z=await task({cel_id:faultGoal.id,rezultat_id:milestone.id});
    const journal=db.prepare('SELECT count(*) n FROM zhurnal').get().n;
    db.exec("CREATE TRIGGER fail_closure_effect BEFORE INSERT ON zhurnal WHEN NEW.obekt='rezultat' AND NEW.pole='zakryta' BEGIN SELECT RAISE(ABORT,'test closure effect'); END");
    try{
      for(const method of ['POST','PATCH']){
        const failed=await zapros(method,'/api/zadachi/'+z.nomer+(method==='POST'?'/zakryt':''),{telo:{versija:z.versija,...(method==='PATCH'?{status:'sdelano'}:{})}});
        assert.equal(failed.kod,500);assert.equal((await get(z)).status,z.status);assert.equal((await get(z)).versija,z.versija);
        assert.equal(db.prepare('SELECT versija FROM rezultaty WHERE id=?').get(milestone.id).versija,milestone.versija);
        assert.equal(db.prepare('SELECT count(*) n FROM zhurnal').get().n,journal);
      }
    }finally{db.exec('DROP TRIGGER fail_closure_effect');}
    db.prepare('UPDATE periody SET zakryt=1 WHERE id=?').run(goal.period_id);
    const frozen=(await close('POST',z)).telo;
    assert.equal(frozen.status,'sdelano');assert.equal(frozen.okr_period_zakryt,true);
    assert.equal(db.prepare('SELECT zakryta FROM rezultaty WHERE id=?').get(milestone.id).zakryta,null);
    const old=await task({cel_id:goal.id,rezultat_id:numeric.id});
    assert.equal((await close('PATCH',old)).telo.predlozhit_zamer,undefined);
    proverit('атомарный отказ обоих путей и замороженный итог закрытого периода',true);
    for(const value of ['no number','Infinity']){
      assert.equal((await zapros('POST','/api/zamery',{telo:{rezultat_id:numeric.id,znachenie:value,otkuda:'QA'}})).kod,400);
    }
    proverit('неконечный и нечисловой замер не сохраняется',true);
  }finally{db.close();}
};
