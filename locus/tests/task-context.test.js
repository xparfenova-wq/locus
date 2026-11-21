const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process');
const {randomUUID,randomBytes,scryptSync}=require('node:crypto');

test('existing task relationships have durable coherent edits and an explicit whole undo',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-task-context-')),file=path.join(folder,'fixture.db');
 const actor=9900950,peer=actor+1,restricted=actor+2,amount=1876532.19;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test'};
 let db,server,base,client,project,otherClient,otherProject;const cookies=new Map();
 const api=async(who,method,route,body)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(cookies.has(who)?{cookie:cookies.get(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(who,method,route,body,status=200)=>{const r=await api(who,method,route,body);assert.equal(r.status,status,route+' '+JSON.stringify(r.body).slice(0,600));return r.body;};
 const route=task=>'zadachi/'+task.nomer;
 const state=()=>JSON.stringify(['zadachi','zhurnal','versii_polej','zaprosy_konteksta_zadach','uvedomlenija'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const make=extra=>good(actor,'POST','zadachi',{nazvanie:'Synthetic existing context',napravlenie:'synapt',otvetstvennyj:peer,tip:'klientskaja',klient_id:client.id,proekt_id:project.id,...extra},201);
 const draft=async(task,change,who=actor)=>{const info=await good(who,'GET',route(task)+'/kontekst');return {versija:info.zadacha.versija,kontekst:info.kontekst,zapros_kljuch:randomUUID(),...change};};
 const start=async()=>{server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>stderr=(stderr+d).slice(-4000));base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup '+stderr)),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>{clearTimeout(timer);reject(new Error('server '+stderr));});});};
 const stop=async()=>{if(server&&server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  const password='task-context-fixture',salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [actor,peer,restricted]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,?,1,'sobstvennyj')").run(id,'Context fixture '+id,id===restricted?'bez_deneg':'polnyj');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'context-'+id,hash);}
  await start();for(const id of [actor,peer,restricted]){const r=await api(id,'POST','vhod/parol',{login:'context-'+id,parol:password});assert.equal(r.status,200);cookies.set(id,r.headers.get('set-cookie').split(';')[0]);}
  client=await good(actor,'POST','ljudi',{imja:'Context client'},201);otherClient=await good(actor,'POST','ljudi',{imja:'Other context client'},201);
  project=await good(actor,'POST','proekty',{nazvanie:'Context project',napravlenie:'synapt',klient_id:client.id,status:'idet'},201);otherProject=await good(actor,'POST','proekty',{nazvanie:'Other direction project',napravlenie:'media',klient_id:otherClient.id,status:'idet'},201);
  await t.test('read-only settings list every person and retain selected labels without a first-page limit',async()=>{
   const insert=db.prepare("INSERT INTO ljudi(imja)VALUES(?)");for(let i=0;i<230;i++)insert.run('Catalog person '+i);
   const task=await make(),before=state(),info=await good(actor,'GET',route(task)+'/kontekst');assert.equal(state(),before);assert.ok(info.spravochniki.ljudi.length>=235);assert.ok(info.spravochniki.proekty.some(p=>p.id===project.id));assert.equal(info.zadacha.proekt_id,project.id);assert.equal(typeof info.kontekst,'string');
   assert.equal((await api(null,'GET',route(task)+'/kontekst')).status,401);
  });
  await t.test('direction, client, project, goal and numeric target change together while unrelated colleague work survives',async()=>{
   const task=await make(),goal=await good(actor,'POST','celi',{nazvanie:'New direction goal',napravlenie:'media',period_id:'2026-Q4',sostojanie:'aktivna'},201),result=await good(actor,'POST','rezultaty',{cel_id:goal.id,nazvanie:'New result',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:100},201);
   const body=await draft(task,{napravlenie:'media',tip:'biznesovaja',klient_id:otherClient.id,proekt_id:otherProject.id,cel_id:goal.id,rezultat_id:result.id,plan_chislo:100,data:'2026-11-20'});
   await good(peer,'PATCH',route(task),{versija:task.versija,opisanie:'Later independent description'});
   const saved=await good(actor,'POST',route(task)+'/kontekst',body);assert.equal(saved.sostojanie,'sohraneno');assert.equal(saved.zadacha.napravlenie,'media');assert.equal(saved.zadacha.proekt_id,otherProject.id);assert.equal(saved.zadacha.rezultat_id,result.id);assert.equal(saved.zadacha.opisanie,'Later independent description');assert.equal(saved.zadacha.plan_chislo,100);
   assert.equal((await good(actor,'GET','planerka?napravlenie=media')).na_soglasovanii.length,0);
   const history=db.prepare("SELECT * FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='napravlenie' ORDER BY id DESC").get(task.id);assert.equal(history.kto,actor);assert.equal(history.bylo,'synapt');assert.equal(history.stalo,'media');
  });
  await t.test('changing a client task type preserves the client unless clearing it is explicit',async()=>{
   const task=await make();let body=await draft(task,{tip:'vnutrennjaja'});let saved=await good(actor,'POST',route(task)+'/kontekst',body);assert.equal(saved.zadacha.klient_id,client.id);
   body=await draft(task,{klient_id:null,proekt_id:null});saved=await good(actor,'POST',route(task)+'/kontekst',body);assert.equal(saved.zadacha.klient_id,null);assert.equal(saved.zadacha.proekt_id,null);
  });
  await t.test('an ordinary business task requires its numeric target on edits as well as creation',async()=>{
   const task=await make({tip:'vnutrennjaja'}),body=await draft(task,{tip:'biznesovaja'}),before=state();assert.equal((await api(actor,'POST',route(task)+'/kontekst',body)).status,400);assert.equal(state(),before);assert.equal((await api(actor,'PATCH',route(task),{versija:task.versija,tip:'biznesovaja'})).status,400);assert.equal(state(),before);
  });
  await t.test('incompatible project, client and goal reject the complete command',async()=>{
   const task=await make();for(const fields of [{proekt_id:otherProject.id},{klient_id:otherClient.id},{data:'2026-02-30'},{data:false},{data:0},{proekt_id:99999999}]){const body=await draft(task,fields),before=state();assert.equal((await api(actor,'POST',route(task)+'/kontekst',body)).status,400);assert.equal(state(),before);}
   for(const value of [false,0,true,'not a date']){const before=state();assert.equal((await api(actor,'PATCH',route(task),{versija:task.versija,data:value})).status,400);assert.equal(state(),before);}
  });
  await t.test('incomplete imported business tasks keep unrelated ordinary edits available',async()=>{
   const task=await make({tip:'biznesovaja',plan_chislo:1});db.prepare('UPDATE zadachi SET plan_chislo=NULL WHERE id=?').run(task.id);const fresh=await good(actor,'GET',route(task));const changed=await good(peer,'PATCH',route(task),{versija:fresh.versija,opisanie:'Unrelated legacy edit'});assert.equal(changed.opisanie,'Unrelated legacy edit');assert.equal(changed.plan_chislo,null);
  });
  await t.test('a saved command replays without duplicate history after a real server restart',async()=>{
   const task=await make(),body=await draft(task,{tip:'vnutrennjaja'});await good(actor,'POST',route(task)+'/kontekst',body);await stop();await start();const before=state(),again=await good(actor,'POST',route(task)+'/kontekst',body);assert.equal(again.povtor_pravki,true);assert.equal(state(),before);assert.equal((await good(peer,'GET',route(task)+'/kontekst_proverka?zapros_kljuch='+body.zapros_kljuch)).sostojanie,'ne_najdeno');assert.equal((await api(actor,'POST',route(task)+'/kontekst',{...body,tip:'produktovaja'})).status,409);assert.equal(state(),before);
  });
  await t.test('explicit cancellation prevents an undelivered command from applying later',async()=>{
   const task=await make(),body=await draft(task,{tip:'vnutrennjaja'});const cancelled=await good(actor,'POST',route(task)+'/kontekst_otmena_popytki',{zapros_kljuch:body.zapros_kljuch});assert.equal(cancelled.sostojanie,'otmeneno');const before=state();assert.equal((await api(actor,'POST',route(task)+'/kontekst',body)).status,409);assert.equal(state(),before);
  });
  await t.test('a changed task context or project blocks the old form without losing a colleague edit',async()=>{
   const task=await make(),body=await draft(task,{tip:'vnutrennjaja'});await good(peer,'PATCH',route(task),{versija:task.versija,cel_id:null,klient_id:otherClient.id,proekt_id:null});let before=state();assert.equal((await api(actor,'POST',route(task)+'/kontekst',body)).status,409);assert.equal(state(),before);
   const second=await make(),next=await draft(second,{tip:'vnutrennjaja'});const fresh=await good(actor,'GET','proekty/'+project.id);await good(peer,'PATCH','proekty/'+project.id,{versija:fresh.versija,kommentarij:'Project changed after opening task settings'});before=state();assert.equal((await api(actor,'POST',route(second)+'/kontekst',next)).status,409);assert.equal(state(),before);
  });
  await t.test('a whole undo restores the linked fields while preserving later comments and description',async()=>{
   const task=await make(),body=await draft(task,{tip:'vnutrennjaja',klient_id:null,proekt_id:null});const saved=await good(actor,'POST',route(task)+'/kontekst',body);await good(peer,'PATCH',route(task),{versija:saved.zadacha.versija,opisanie:'Keep after undo'});const comment=await good(peer,'POST','kommentarii',{zadacha_id:task.id,tekst:'Keep comment after undo'},201);
   const undoBody={zapros_kljuch:randomUUID(),pravka_kljuch:body.zapros_kljuch},undo=await good(actor,'POST',route(task)+'/kontekst_otmenit',undoBody);assert.equal(undo.sostojanie,'sohraneno');assert.equal(undo.dejstvie,'otmena');assert.equal(undo.zadacha.tip,'klientskaja');assert.equal(undo.zadacha.klient_id,client.id);assert.equal(undo.zadacha.proekt_id,project.id);assert.equal(undo.zadacha.opisanie,'Keep after undo');assert.ok(db.prepare('SELECT 1 FROM kommentarii WHERE id=?').get(comment.id));const before=state();assert.equal((await good(actor,'POST',route(task)+'/kontekst_otmenit',undoBody)).sostojanie,'sohraneno');assert.equal((await api(actor,'POST',route(task)+'/kontekst',body)).status,409);assert.equal(state(),before);
  });
  await t.test('later context changes prevent a partial undo',async()=>{
   const task=await make(),body=await draft(task,{tip:'vnutrennjaja'}),saved=await good(actor,'POST',route(task)+'/kontekst',body);await good(peer,'PATCH',route(task),{versija:saved.zadacha.versija,tip:'produktovaja'});const before=state();assert.equal((await api(actor,'POST',route(task)+'/kontekst_otmenit',{zapros_kljuch:randomUUID(),pravka_kljuch:body.zapros_kljuch})).status,409);assert.equal(state(),before);
  });
  await t.test('moving the planned day and ISO sprint is atomic; deadline may be outside that sprint',async()=>{
   const task=await make({data:'2026-11-20',sprint:47,god_sprinta:2026,srok:'2026-12-05'});
   let body=await draft(task,{sprint:48}),before=state();assert.equal((await api(actor,'POST',route(task)+'/kontekst',body)).status,400);assert.equal(state(),before);
   body=await draft(task,{sprint:48,data:'2026-11-23'});const saved=await good(actor,'POST',route(task)+'/kontekst',body);assert.equal(saved.zadacha.sprint,48);assert.equal(saved.zadacha.data,'2026-11-23');assert.equal(saved.zadacha.srok,'2026-12-05');
   const undone=await good(actor,'POST',route(task)+'/kontekst_otmenit',{zapros_kljuch:randomUUID(),pravka_kljuch:body.zapros_kljuch});assert.equal(undone.zadacha.sprint,47);assert.equal(undone.zadacha.data,'2026-11-20');assert.equal(undone.zadacha.srok,'2026-12-05');
   const cross=await make({sprint:53,god_sprinta:2026,data:'2027-01-01'}),edit=await draft(cross,{sprint:1,god_sprinta:2027,data:'2027-01-04'});await good(actor,'POST',route(cross)+'/kontekst',edit);const back=await good(actor,'POST',route(cross)+'/kontekst_otmenit',{zapros_kljuch:randomUUID(),pravka_kljuch:edit.zapros_kljuch});assert.equal(back.zadacha.sprint,53);assert.equal(back.zadacha.god_sprinta,2026);assert.equal(back.zadacha.data,'2027-01-01');
   const bad=await api(actor,'POST','zadachi',{nazvanie:'Invalid planned day',napravlenie:'synapt',otvetstvennyj:actor,sprint:47,god_sprinta:2026,data:'2026-11-23'});assert.equal(bad.status,400);
  });
  await t.test('cancelled undo is independent of its original edit, survives restart and blocks late delivery',async()=>{
   const task=await make(),body=await draft(task,{tip:'vnutrennjaja'});await good(actor,'POST',route(task)+'/kontekst',body);const undo={zapros_kljuch:randomUUID(),pravka_kljuch:body.zapros_kljuch};await good(actor,'POST',route(task)+'/kontekst_otmena_popytki',{zapros_kljuch:undo.zapros_kljuch});await stop();await start();const before=state();assert.equal((await api(actor,'POST',route(task)+'/kontekst_otmenit',undo)).status,409);assert.equal(state(),before);assert.equal((await good(actor,'GET',route(task)+'/kontekst_proverka?zapros_kljuch='+body.zapros_kljuch)).sostojanie,'sohraneno');
   const freshUndo={...undo,zapros_kljuch:randomUUID()};await good(actor,'POST',route(task)+'/kontekst_otmenit',freshUndo);const after=state();const repeats=await Promise.all([api(actor,'POST',route(task)+'/kontekst_otmenit',freshUndo),api(actor,'POST',route(task)+'/kontekst_otmenit',freshUndo)]);assert.ok(repeats.every(r=>r.status===200));assert.equal(state(),after);
  });
  await t.test('a payment task keeps its source links and its amount is absent for a member without amounts',async()=>{
   const payment=await good(actor,'POST','proekty/'+project.id+'/platezhi',{summa:amount,zhdem_do:'2026-12-05'},201),task=await good(actor,'POST','zadachi/iz_shablona',{shablon:'poluchit_oplatu',platezh_id:payment.id},201),info=await good(restricted,'GET',route(task)+'/kontekst');assert.ok(!JSON.stringify(info).includes(String(amount)));assert.ok(info.zablokirovany.includes('plan_chislo'));assert.ok(info.zablokirovany.includes('proekt_id'));assert.equal(Object.hasOwn(info.zadacha,'plan_chislo'),false);
   const body=await draft(task,{proekt_id:otherProject.id}),before=state();assert.equal((await api(actor,'POST',route(task)+'/kontekst',body)).status,400);assert.equal(state(),before);
  });
  await t.test('a receipt reads the current money permission after a real saved edit',async()=>{
   const payment=await good(actor,'POST','proekty/'+project.id+'/platezhi',{summa:amount,zhdem_do:'2026-12-05'},201),task=await good(actor,'POST','zadachi/iz_shablona',{shablon:'poluchit_oplatu',platezh_id:payment.id},201),body=await draft(task,{data:'2026-11-20'});await good(actor,'POST',route(task)+'/kontekst',body);
   db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);
   try{const checked=await good(actor,'GET',route(task)+'/kontekst_proverka?zapros_kljuch='+body.zapros_kljuch);assert.equal(checked.sostojanie,'sohraneno');assert.equal(Object.hasOwn(checked.zadacha,'plan_chislo'),false);assert.ok(!JSON.stringify(checked).includes(String(amount)));const current=await good(actor,'GET',route(task)+'/kontekst');assert.ok(!current.polja.includes('plan_chislo'));assert.ok(!JSON.stringify(current).includes(String(amount)));}finally{db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);}
  });
  await t.test('removed tasks keep a readable receipt state without exposing their old content',async()=>{
   const task=await make(),body=await draft(task,{tip:'vnutrennjaja'}),saved=await good(actor,'POST',route(task)+'/kontekst',body);await good(actor,'DELETE',route(task),{versija:saved.zadacha.versija});const result=await good(actor,'GET',route(task)+'/kontekst_proverka?zapros_kljuch='+body.zapros_kljuch);assert.equal(result.sostojanie,'udaleno');assert.equal(Object.hasOwn(result,'zadacha'),false);assert.equal((await api(actor,'GET',route(task)+'/kontekst')).status,409);
  });
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db?.close();await stop();fs.rmSync(folder,{recursive:true,force:true});}
});
