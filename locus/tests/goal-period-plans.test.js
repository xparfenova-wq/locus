const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,randomUUID,scryptSync}=require('node:crypto');

test('explicit period targets preserve one goal, recover commands and protect history',async t=>{
 const root=process.env.LOCUS_APP_ROOT||path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-goal-decomposition-')),file=path.join(folder,'fixture.db'),actor=9900810,peer=actor+1,restricted=actor+2;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test',LOCUS_REPORT_WORKER:'0',LOCUS_REPORT_BOT_TOKEN:'',LOCUS_REPORT_CHAT_ID:''};
 let db,server,base,diagnostic="";const cookies=new Map(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()),year=today.slice(0,4);
 const api=async(method,route,body,who=actor)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(cookies.has(who)?{cookie:cookies.get(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,who=actor)=>{const r=await api(method,route,body,who);assert.equal(r.status,status,route+' '+JSON.stringify(r.body)+(r.status>=500?' '+diagnostic.slice(-2500):''));return r.body;};
 const state=()=>JSON.stringify(['celi','rezultaty','zadachi','zhurnal','versii_polej','uvedomlenija','povody_uvedomlenij','sqlite_sequence','plany_periodov_okr','zaprosy_planov_okr'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const make=async(extra={})=>{const goal=await good('POST','celi',{nazvanie:'Synthetic annual goal',napravlenie:'synapt',period_id:year,sostojanie:'aktivna',...extra},201),result=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic measurable annual outcome',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:500},201);return {goal,result,route:'celi/'+goal.id+'/po_kvartalam'};};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync('temporary-decomposition',salt,64).toString('hex');
  for(const id of [actor,peer,restricted]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,?,1,'sobstvennyj')").run(id,'Synthetic decomposition member '+id,id===restricted?'bez_deneg':'polnyj');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'decomposition-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>{diagnostic+=String(d);});
  base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>{clearTimeout(timer);reject(new Error('fixture stopped'));});});
  for(const id of [actor,peer,restricted]){const r=await api('POST','vhod/parol',{login:'decomposition-'+id,parol:'temporary-decomposition'},id);assert.equal(r.status,200);cookies.set(id,r.headers.get('set-cookie').split(';')[0]);}

  const proposal=async(id,period=year)=>good('GET','celi/'+id+'/plany_periodov?period='+period);
  const command=(p,values,key=randomUUID())=>({period:p.period,kontekst:p.kontekst,zapros_kljuch:key,stroki:p.rezultaty.map((row,i)=>({rezultat_id:row.rezultat_id,po_periodam:values?.[i]??row.po_periodam}))});
  const submit=(id,body)=>good('POST','celi/'+id+'/plany_periodov',body);
  await t.test('year to quarter to month keeps identity, explicit zero and independent upper targets',async()=>{
   const {goal,result}=await make(),root=JSON.stringify(db.prepare('SELECT * FROM rezultaty WHERE id=?').get(result.id)),before=state(),p=await proposal(goal.id);assert.equal(state(),before);
   assert.deepEqual(p.periody,[1,2,3,4].map(n=>year+'-Q'+n));assert.deepEqual(p.rezultaty[0].po_periodam,['125','125','125','125']);
   const saved=await submit(goal.id,command(p,[['100','100','100','180']]));assert.equal(saved.sverka[0].raznica,'20');assert.equal(db.prepare('SELECT count(*) n FROM celi WHERE id=?').get(goal.id).n,1);
   const q=await proposal(goal.id,year+'-Q4');assert.deepEqual(q.rezultaty[0].po_periodam,['60','60','60']);await submit(goal.id,command(q,[['0','50','130']]));
   assert.equal(db.prepare('SELECT plan FROM plany_periodov_okr WHERE rezultat_id=? AND period_id=?').get(result.id,year+'-Q4').plan,'180');assert.equal(JSON.stringify(db.prepare('SELECT * FROM rezultaty WHERE id=?').get(result.id)),root);
   const month=await good('GET','okr?nomer='+goal.id+'&okno='+year+'-10');assert.equal(month.id,goal.id);assert.equal(month.srez_perioda.rezultaty[0].plan,0);assert.equal(month.srez_perioda.rezultaty[0].plan_na_okno_zadan,true);
   const updated=await proposal(goal.id);await submit(goal.id,command(updated,[['1','2','3','4']]));assert.equal(db.prepare('SELECT plan FROM plany_periodov_okr WHERE rezultat_id=? AND period_id=?').get(result.id,year+'-11').plan,'50');
   assert.equal(JSON.stringify(db.prepare('SELECT * FROM rezultaty WHERE id=?').get(result.id)),root);
  });
  await t.test('default rounding is exact and an unknown parent never invents a zero plan',async()=>{
   const {goal}=await make({period_id:year+'-Q4'}),p=await proposal(goal.id,year+'-Q4');assert.deepEqual(p.rezultaty[0].po_periodam,['167','167','166']);assert.equal(p.rezultaty[0].plan,'500');
   const annual=await make(),q=await proposal(annual.goal.id,year+'-Q4');assert.equal(q.rezultaty[0].plan,null);assert.deepEqual(q.rezultaty[0].po_periodam,[null,null,null]);const before=state();assert.equal((await api('POST','celi/'+annual.goal.id+'/plany_periodov',command(q))).status,400);assert.equal(state(),before);
   const saved=await submit(annual.goal.id,command(q,[['0','0','0']]));assert.equal(saved.sverka[0].plan,null);assert.equal(saved.sverka[0].raznica,null);
  });
  await t.test('same command is durable after a lost response; different body and cancelled late arrival cannot write',async()=>{
   const {goal}=await make(),p=await proposal(goal.id),body=command(p),first=await submit(goal.id,body),before=state();
   const again=await submit(goal.id,body);assert.equal(again.povtor_sohranenija,true);assert.equal(state(),before);assert.deepEqual(again.sverka,first.sverka);
   const receipt=await good('GET','celi/'+goal.id+'/plany_periodov_proverka?zapros_kljuch='+body.zapros_kljuch);assert.equal(receipt.sostojanie,'sohraneno');
   const changed=structuredClone(body);changed.stroki[0].po_periodam[0]='1';assert.equal((await api('POST','celi/'+goal.id+'/plany_periodov',changed)).status,409);assert.equal(state(),before);
   const late=command(await proposal(goal.id));await good('POST','celi/'+goal.id+'/plany_periodov_otmena_popytki',{zapros_kljuch:late.zapros_kljuch});const after=state();assert.equal((await api('POST','celi/'+goal.id+'/plany_periodov',late)).status,409);assert.equal(state(),after);
   assert.equal((await good('GET','celi/'+goal.id+'/plany_periodov_proverka?zapros_kljuch='+late.zapros_kljuch)).sostojanie,'otmeneno');
  });
  await t.test('stale forms, changed result source, closed child and a late DB failure do not partially apply a batch',async()=>{
   const {goal,result}=await make(),p=await proposal(goal.id);await submit(goal.id,command(p));let before=state();assert.equal((await api('POST','celi/'+goal.id+'/plany_periodov',command(p,[['1','2','3','4']]))).status,409);assert.equal(state(),before);
   const next=await proposal(goal.id);await good('PATCH','rezultaty/'+result.id,{versija:result.versija,plan:1000});before=state();assert.equal((await api('POST','celi/'+goal.id+'/plany_periodov',command(next))).status,409);assert.equal(state(),before);
   db.prepare('INSERT INTO periody(id,zakryt)VALUES(?,1) ON CONFLICT(id)DO UPDATE SET zakryt=1').run(year+'-Q2');try{before=state();assert.equal((await api('POST','celi/'+goal.id+'/plany_periodov',command(await proposal(goal.id)))).status,409);assert.equal(state(),before);}finally{db.prepare('UPDATE periody SET zakryt=0 WHERE id=?').run(year+'-Q2');}
   const failure=command(await proposal(goal.id),[['1','2','3','4']]);db.exec("CREATE TRIGGER fixture_plan_failure BEFORE UPDATE ON plany_periodov_okr WHEN NEW.period_id LIKE '%-Q2' BEGIN SELECT RAISE(ABORT,'synthetic late plan failure');END");
   try{before=state();assert.equal((await api('POST','celi/'+goal.id+'/plany_periodov',failure)).status,500);assert.equal(state(),before);}finally{db.exec('DROP TRIGGER fixture_plan_failure');}await submit(goal.id,failure);
  });
  await t.test('manual state and period movement are distinct; a missing starting observation remains unknown',async()=>{
   const {goal,result}=await make(),p=await proposal(goal.id);await submit(goal.id,command(p));
   await good('POST','zamery',{rezultat_id:result.id,znachenie:40,data:year+'-09-30',otkuda:'Synthetic starting observation'},201);
   await good('POST','zamery',{rezultat_id:result.id,znachenie:90,data:year+'-10-31',otkuda:'Synthetic ending observation'},201);
   let s=(await good('GET','okr?nomer='+goal.id+'&okno='+year+'-Q4')).srez_perioda.rezultaty[0];assert.equal(s.fakt,90);assert.equal(s.dvizhenie_perioda,50);assert.equal(s.plan,125);assert.equal(s.progress_pct,40);
   s=(await good('GET','okr?nomer='+goal.id+'&okno='+year+'-Q3')).srez_perioda.rezultaty[0];assert.equal(s.dvizhenie_perioda,null);assert.ok(s.pochemu_net_dvizhenija);
  });
  await t.test('private goals, peer writers and money restrictions include nested plans and receipts',async()=>{
   const {goal,result}=await make(),p=await proposal(goal.id),body=command(p);await submit(goal.id,body);
   assert.equal((await api('GET','celi/'+goal.id+'/plany_periodov?period='+year,undefined,peer)).status,403);
   assert.equal((await api('POST','celi/'+goal.id+'/plany_periodov',command(p),peer)).status,403);
   await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic protected money',tip:'dengi',istochnik:'ruchnoj_zamer',plan:987654321,baza:0},201);
   const money=await proposal(goal.id);await submit(goal.id,command(money));assert.equal((await api('GET','celi/'+goal.id+'/plany_periodov?period='+year,undefined,restricted)).status,403);
   const view=await good('GET','okr?nomer='+goal.id+'&okno='+year+'-Q1',undefined,200,restricted);assert.ok(!JSON.stringify(view).includes('246913581'));
   db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);try{const receipt=await good('GET','celi/'+goal.id+'/plany_periodov_proverka?zapros_kljuch='+body.zapros_kljuch);assert.equal(receipt.sostojanie,'sohraneno');assert.equal(receipt.dannye_skryty,true);assert.ok(!receipt.sverka);}finally{db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);}
   const draft=await make({sostojanie:'chernovik'});assert.equal((await api('GET','celi/'+draft.goal.id+'/plany_periodov?period='+year,undefined,peer)).status,404);
  });
  await t.test('deleting and undoing a goal restores explicit period plans, and a changed plan invalidates deletion preview',async()=>{
   const {goal}=await make(),p=await proposal(goal.id);await submit(goal.id,command(p));let preview=await good('GET','celi/'+goal.id),count=db.prepare('SELECT count(*) n FROM plany_periodov_okr').get().n;
   await submit(goal.id,command(await proposal(goal.id),[['1','2','3','4']]));const before=state();assert.equal((await api('DELETE','celi/'+goal.id,{versija:preview.versija,kontekst_udalenija:preview.kontekst_udalenija,zapros_kljuch:randomUUID()})).status,409);assert.equal(state(),before);
   preview=await good('GET','celi/'+goal.id);const remove=await good('DELETE','celi/'+goal.id,{versija:preview.versija,kontekst_udalenija:preview.kontekst_udalenija,zapros_kljuch:randomUUID()});assert.equal(db.prepare('SELECT count(*) n FROM plany_periodov_okr').get().n,count-4);
   await good('POST','otmena',{dejstvie_id:remove.otmena_dejstvie_id});assert.equal(db.prepare('SELECT count(*) n FROM plany_periodov_okr').get().n,count);assert.deepEqual((await proposal(goal.id)).rezultaty[0].po_periodam,['1','2','3','4']);
  });
  await t.test('a complete plan command can be undone once; lost undo response is durable and later edits are never overwritten',async()=>{
   const {goal}=await make(),first=command(await proposal(goal.id));await submit(goal.id,first);
   const undo={zapros_kljuch:randomUUID(),ishodnyj_kljuch:first.zapros_kljuch},route='celi/'+goal.id+'/plany_periodov_otmenit';
   const response=await good('POST',route,undo);assert.equal(response.otmeneno,true);assert.equal(db.prepare('SELECT count(*) n FROM plany_periodov_okr p JOIN rezultaty r ON r.id=p.rezultat_id WHERE r.cel_id=?').get(goal.id).n,0);
   const before=state();assert.equal((await good('POST',route,undo)).povtor_sohranenija,true);assert.equal(state(),before);assert.equal((await api('POST',route,{...undo,zapros_kljuch:randomUUID()})).status,409);assert.equal(state(),before);
   const second=command(await proposal(goal.id));await submit(goal.id,second);const third=command(await proposal(goal.id),[['1','2','3','4']]);await submit(goal.id,third);let stateBefore=state();assert.equal((await api('POST',route,{zapros_kljuch:randomUUID(),ishodnyj_kljuch:second.zapros_kljuch})).status,409);assert.equal(state(),stateBefore);
   await good('POST',route,{zapros_kljuch:randomUUID(),ishodnyj_kljuch:third.zapros_kljuch});assert.deepEqual((await proposal(goal.id)).rezultaty[0].po_periodam,['125','125','125','125']);
   stateBefore=state();assert.equal((await api('POST',route,{zapros_kljuch:randomUUID(),ishodnyj_kljuch:second.zapros_kljuch})).status,409);assert.equal(state(),stateBefore);
   const journal=db.prepare("SELECT id FROM zhurnal WHERE pole='plan_perioda' AND obekt_id IN(SELECT id FROM rezultaty WHERE cel_id=?) ORDER BY id DESC LIMIT 1").get(goal.id);assert.equal((await api('POST','otmena',{zhurnal:[journal.id]})).status,409);assert.equal(state(),stateBefore);
  });
  await t.test('malformed, foreign and incomplete payloads never create partial or rounded plans',async()=>{
   const {goal,result}=await make(),foreign=await make(),p=await proposal(goal.id),base=command(p);
   const invalid=[{...base,unknown:1},{...base,stroki:[]},{...base,stroki:null},{...base,stroki:[null]},...['',null,true,{},'NaN','1e-1000','0.10000000000000001',-1].map(value=>({...base,stroki:[{rezultat_id:result.id,po_periodam:[value,1,1,1]}]})),{...base,stroki:[{rezultat_id:foreign.result.id,po_periodam:[1,1,1,1]}]},{...base,stroki:[{rezultat_id:result.id,po_periodam:[1,1,1]}]},{...base,period:String(Number(year)+1)}];
   for(const body of invalid){const before=state();assert.equal((await api('POST','celi/'+goal.id+'/plany_periodov',body)).status,400,JSON.stringify(body));assert.equal(state(),before);}
   assert.equal((await api('GET','celi/'+goal.id+'/plany_periodov?period='+year+'&period='+year)).status,400);
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}fs.rmSync(folder,{recursive:true,force:true});}
});
