const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {nado,zapros,proverit,ADRES}=require('../prover.js');
module.exports=async()=>{
 const db=new DatabaseSync(process.env.LOCUS_BAZA);
 const make=async(table,body)=>(await nado('POST','/api/'+table,{telo:body})).telo;
 const get=async(url)=>(await nado('GET','/api/'+url)).telo;
 const post=async(body)=>{const r=await fetch(ADRES+'/api/zamery_akkauntov',{method:'POST',headers:{'content-type':'application/json','x-locus-chelovek':'2'},body:JSON.stringify({kljuch_sbora:process.env.LOCUS_KLJUCH_SBORA,...body})});return {status:r.status,body:await r.json()};};
 const state=()=>JSON.stringify(['zamery_akkauntov','zhurnal','versii_polej'].map(table=>[table,db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()]));
 try{
  const account=await make('akkaunty',{nazvanie:'Collector daily measurement fixture',ploshadka:'telegram',uroven:'public',napravlenie:'media'});
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const shift=n=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),base={akkaunt_id:account.id};
  assert.equal((await zapros('POST','/api/zamery_akkauntov',{telo:{...base,data:day,podpischikov:100}})).kod,403);
  for(const body of [{data:day,ohvat:null},{data:'2026-02-30',podpischikov:1},{data:day,podpischikov:'100'},{data:day,podpischikov:-1},{data:day,podpischikov:true},{data:day},{data:day,podpischikov:1,daty_izmerenij:'{}'}]){
   const before=state();assert.equal((await post({...base,...body})).status,400,JSON.stringify(body));assert.equal(state(),before);
  }
  proverit('снимок: только сборщик; null, неверная дата, неверные числа и подмена дат отклоняются до записи',true);
  assert.equal((await post({...base,data:shift(-1),podpischikov:100,ohvat:420,extra:{source:'private fixture'}})).status,201);
  const first=await post({...base,data:day,podpischikov:110});assert.equal(first.status,201);assert.equal(first.body.ohvat,420);
  assert.equal(JSON.parse(first.body.daty_izmerenij).ohvat,shift(-1));assert.equal(JSON.parse(first.body.daty_izmerenij).podpischikov,day);
  assert.deepEqual(await get('akkaunty/'+account.id+'/pokazatel?metrika=ohvat'),{akkaunt_id:account.id,metrika:'ohvat',znachenie:420,obnovleno:shift(-1)});
  proverit('неизвестный охват сохраняет прежнее число и настоящую дату, подписчики обновляются',true);
  const count=db.prepare('SELECT count(*) n FROM zamery_akkauntov WHERE akkaunt_id=?').get(account.id).n;
  const rowid=db.prepare('SELECT rowid FROM zamery_akkauntov WHERE akkaunt_id=? AND data=?').get(account.id,day).rowid,journal=db.prepare('SELECT count(*) n FROM zhurnal').get().n;
  const repeat=await post({...base,data:day,podpischikov:120});assert.equal(repeat.status,201);assert.equal(repeat.body.podpischikov,120);assert.equal(repeat.body.ohvat,420);
  assert.equal(db.prepare('SELECT count(*) n FROM zamery_akkauntov WHERE akkaunt_id=?').get(account.id).n,count);assert.equal(db.prepare('SELECT rowid FROM zamery_akkauntov WHERE akkaunt_id=? AND data=?').get(account.id,day).rowid,rowid);assert.equal(db.prepare('SELECT count(*) n FROM zhurnal').get().n,journal);
  proverit('повтор за день обновляет одну строку без конфликта, дубля и ложного создания в журнале',true);
  assert.equal((await post({...base,data:shift(-3),podpischikov:90})).status,201);
  assert.equal(db.prepare('SELECT ohvat FROM zamery_akkauntov WHERE akkaunt_id=? AND data=?').get(account.id,shift(-3)).ohvat,null);
  assert.equal((await post({...base,data:day,ohvat:0})).body.ohvat,0);assert.equal((await get('akkaunty/'+account.id+'/pokazatel?metrika=ohvat')).znachenie,0);
  proverit('ноль остаётся известным нулём, ранний сбор не берёт измерение из будущего',true);
  const before=state();db.exec("CREATE TRIGGER fail_snapshot_fixture BEFORE UPDATE ON zamery_akkauntov BEGIN SELECT RAISE(ABORT,'fixture snapshot failure'); END");
  try{assert.equal((await post({...base,data:day,podpischikov:999})).status,500);assert.equal(state(),before);}finally{db.exec('DROP TRIGGER fail_snapshot_fixture');}
  proverit('ошибка обновления откатывает снимок, журнал и версии целиком',true);
  const insert=db.prepare('INSERT INTO publikacii(id,akkaunt_id,publikacija_id,data_vyhoda,prosmotrov,lajkov,kommentariev) VALUES(?,?,?,?,?,?,?)');
  [400,450,500,520,480,12000].forEach((v,i)=>insert.run('metric-api-'+i,account.id,i,day,v,10*(i+1),i));
  let calculated=await get('akkaunty/'+account.id+'/metriki');assert.equal(calculated.prosmotrov_srednee,490);assert.equal(calculated.vovlechennost,1.6);
  for(let i=6;i<14;i++)insert.run('metric-api-'+i,account.id,i,day,100,10,0);
  for(let i=14;i<20;i++)insert.run('metric-api-'+i,account.id,i,day,null,9000,1000);
  calculated=await get('akkaunty/'+account.id+'/metriki');assert.equal(calculated.vovlechennost,2);assert.equal(calculated.metriki.vovlechennost.publikacij_v_schete,14);assert.equal(calculated.metriki.vovlechennost.publikacij_vsego,20);assert.equal(calculated.po_publikacijam.vovlechennost,2);
  for(const [key,value] of Object.entries(calculated.metriki))assert.equal((await get('akkaunty/'+account.id+'/pokazatel?metrika='+key)).znachenie,value.znachenie,key);
  proverit('медиана490 и вовлечённость по14из20 считаются на сервере, восемь показателей совпадают с предпросмотром',true);
  const goal=await make('celi',{nazvanie:'Engagement single calculation fixture',napravlenie:'media',period_id:'2005-Q2',sostojanie:'aktivna'});
  const result=await make('rezultaty',{cel_id:goal.id,nazvanie:'Engagement fixture',istochnik:'akkaunt',akkaunt_id:account.id,metrika:'vovlechennost',baza:0,plan:10});
  assert.equal((await get('okr/rezultat/'+result.id)).fakt,null);assert.equal((await get('okr?period=2005-Q2')).rezultaty.find(r=>r.id===result.id).fakt,null);
  const currentGoal=await make('celi',{nazvanie:'Current account actual fixture',napravlenie:'media',period_id:day.slice(0,4)+'-Q'+(Math.floor((Number(day.slice(5,7))-1)/3)+1),sostojanie:'aktivna'});
  const currentResult=await make('rezultaty',{cel_id:currentGoal.id,nazvanie:'Current engagement fixture',istochnik:'akkaunt',akkaunt_id:account.id,metrika:'vovlechennost',baza:0,plan:10});
  assert.equal((await get('okr/rezultat/'+currentResult.id)).fakt,2);
  assert.equal((await zapros('GET','/api/akkaunty/99999999/metriki')).kod,404);
  proverit('карточка и экран ОКР используют тот же факт аккаунта, несуществующий аккаунт отдаёт404',true);
  const requests=db.prepare('SELECT count(*) n FROM zapuski_sbora WHERE akkaunt_id=?').get(account.id).n;
  const queued=(await nado('POST','/api/akkaunty/'+account.id+'/sobrat',{telo:{}})).telo;
  const again=(await nado('POST','/api/akkaunty/'+account.id+'/sobrat',{telo:{}})).telo;
  assert.equal(queued.zapros_id,again.zapros_id);assert.equal(again.povtor,true);assert.equal(db.prepare('SELECT count(*) n FROM zapuski_sbora WHERE akkaunt_id=?').get(account.id).n,requests+1);
  await nado('PATCH','/api/akkaunty/'+account.id,{telo:{versija:(await get('akkaunty/'+account.id)).versija,aktiven:false}});
  const canceled=db.prepare('SELECT * FROM zapuski_sbora WHERE id=?').get(queued.zapros_id);assert.equal(canceled.uspeh,0);assert.ok(canceled.primechanie.includes('остановлен'));assert.ok(canceled.zaprosheno);
  assert.equal((await zapros('POST','/api/akkaunty/'+account.id+'/sobrat',{telo:{}})).kod,409);
  proverit('ручной сбор не дублируется, остановка отменяет очередь и запрещает новый запрос',true);
 }finally{db.close();}
};
