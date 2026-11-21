const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,randomUUID,scryptSync}=require('node:crypto');

test('weekly confirmation, receipt, history, undo and Sunday close are whole-record commands',async t=>{
 const root=process.env.LOCUS_APP_ROOT||path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-weekly-commands-')),file=path.join(folder,'fixture.db'),clock=path.join(folder,'clock'),actor=9900890,peer=actor+1,restricted=actor+2;
 const serviceKey=randomBytes(32).toString('hex'),env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),LOCUS_SERVICE_KEY:serviceKey,NODE_ENV:'test',LOCUS_REPORT_WORKER:'0',LOCUS_REPORT_BOT_TOKEN:'',LOCUS_REPORT_CHAT_ID:''};
 fs.writeFileSync(clock,'2026-11-20T12:00:00Z');
 let db,server,base,diagnostic='';const cookies=new Map();
 const api=async(method,route,body,who=actor,service=false)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(service?{'x-locus-service-key':serviceKey,'x-locus-chelovek':String(who)}:cookies.has(who)?{cookie:cookies.get(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,who=actor,service=false)=>{const r=await api(method,route,body,who,service);assert.equal(r.status,status,route+' '+JSON.stringify(r.body)+(r.status>=500?' '+diagnostic.slice(-2000):''));return r.body;};
 const snapshot=()=>JSON.stringify(['snimki_planerki','zaprosy_snimkov_planerki','zhurnal','sqlite_sequence','celi','rezultaty','zamery','zadachi','uvedomlenija','povody_uvedomlenij'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const q='?napravlenie=synapt&nedelja=42&god=2026',route=action=>'planerka/'+action+q,preview=()=>good('GET',route('snimok_predprosmotr')),body=p=>({zapros_kljuch:randomUUID(),kontekst:p.kontekst}),submit=b=>good('POST',route('snimok'),b);
 const stop=async()=>{if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}};
 const start=async()=>{
  const script="const fs=require('node:fs'),R=Date;global.Date=class extends R{constructor(...a){super(...(a.length?a:[fs.readFileSync("+JSON.stringify(clock)+",'utf8').trim()]));}static now(){return new R(fs.readFileSync("+JSON.stringify(clock)+",'utf8').trim()).getTime();}};require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})";
  server=spawn(process.execPath,['-e',script],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>{diagnostic+=String(d);});
  base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>{clearTimeout(timer);reject(new Error('fixture stopped'));});});
 };
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),password=salt+':'+scryptSync('temporary-weekly',salt,64).toString('hex');
  for(const id of [actor,peer,restricted]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,?,1,'sobstvennyj')").run(id,'Synthetic weekly member '+id,id===restricted?'bez_deneg':'polnyj');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'weekly-'+id,password);}
  await start();for(const id of [actor,peer,restricted]){const r=await api('POST','vhod/parol',{login:'weekly-'+id,parol:'temporary-weekly'},id);assert.equal(r.status,200);cookies.set(id,r.headers.get('set-cookie').split(';')[0]);}
  const goal=await good('POST','celi',{nazvanie:'Synthetic weekly annual goal',napravlenie:'synapt',period_id:'2026',sostojanie:'aktivna'},201),result=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic weekly number',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:100},201);
  const measure=(value,date)=>good('POST','zamery',{rezultat_id:result.id,znachenie:value,data:date,otkuda:'Synthetic confirmed weekly source'},201),pick=p=>p.svodka.celi.find(c=>c.id===goal.id).rezultaty.find(r=>r.id===result.id);
  await measure(10,'2026-10-11');await measure(20,'2026-10-14');
  const project=Number(db.prepare("INSERT INTO proekty(nazvanie,napravlenie)VALUES('Synthetic private weekly payment','synapt')").run().lastInsertRowid);db.prepare("INSERT INTO platezhi(proekt_id,summa,oplachen_at)VALUES(?,987654321,'2026-10-14')").run(project);
  let first,firstResult,previousText;
  await t.test('preview is read-only; first confirmation and exact replay retain one receipt',async()=>{
   const before=snapshot(),p=await preview();assert.equal(p.predyduschaja,null);assert.equal(pick(p.novaja).fakt,20);assert.equal(snapshot(),before);first=body(p);firstResult=await submit(first);assert.equal(firstResult.sozdan,true);assert.equal(firstResult.sostojanie,'sohraneno');assert.equal(firstResult.sobytie_id,null);
   const saved=snapshot();assert.equal((await submit(first)).povtor_sohranenija,true);assert.equal(snapshot(),saved);assert.equal((await api('POST',route('snimok'),{...first,kontekst:'different'})).status,409);assert.equal(snapshot(),saved);
  });
  await t.test('recalculation confirms old versus new and journals exact former JSON once',async()=>{
   previousText=db.prepare("SELECT dannye FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").get().dannye;await measure(35,'2026-10-16');const p=await preview();assert.equal(pick(p.predyduschaja).fakt,20);assert.equal(pick(p.novaja).fakt,35);
   const recalc=await submit(body(p)),event=db.prepare('SELECT * FROM zhurnal WHERE id=?').get(recalc.sobytie_id);assert.equal(event.bylo,previousText);assert.equal(pick(JSON.parse(event.stalo)).fakt,35);assert.equal(JSON.parse(event.srez).snimok_planerki.nedelja,42);assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='snimok_planerki'").get().n,1);
   const before=snapshot();assert.equal((await api('POST','otmena',{zhurnal:[event.id]})).status,409);assert.equal(snapshot(),before);
  });
  await t.test('changed sources and a concurrent confirmation invalidate preview without partial writes',async()=>{
   const stale=body(await preview());await measure(40,'2026-10-17');let before=snapshot();assert.equal((await api('POST',route('snimok'),stale)).status,409);assert.equal(snapshot(),before);
   const p=await preview(),one=body(p),two=body(p);await submit(one);before=snapshot();assert.equal((await api('POST',route('snimok'),two)).status,409);assert.equal(snapshot(),before);
  });
  await t.test('cancelled attempts block late saves; a cancel after save reports the saved outcome',async()=>{
   const late=body(await preview());const cancelled=await good('POST',route('snimok_otmena_popytki'),{zapros_kljuch:late.zapros_kljuch});assert.equal(cancelled.sostojanie,'otmeneno');const before=snapshot();assert.equal((await api('POST',route('snimok'),late)).status,409);assert.equal(snapshot(),before);
   assert.equal((await good('POST',route('snimok_otmena_popytki'),{zapros_kljuch:first.zapros_kljuch})).sostojanie,'sohraneno');assert.equal(snapshot(),before);
  });
  await t.test('proof survives process restart and revoked money access without exposing report numbers',async()=>{
   await stop();await start();db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);try{const proof=await good('GET',route('snimok_proverka')+'&zapros_kljuch='+first.zapros_kljuch);assert.equal(proof.sostojanie,'sohraneno');assert.equal(proof.sobytie_id,firstResult.sobytie_id);assert.equal(proof.novaja,undefined);assert.equal((await api('GET',route('snimok_predprosmotr'))).status,403);}finally{db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);}
   assert.equal((await good('GET',route('snimok_proverka')+'&zapros_kljuch='+first.zapros_kljuch,undefined,200,peer)).sostojanie,'ne_najdeno');
  });
  await t.test('undo restores the whole previous record and timestamps; replay and ABA cannot erase later work',async()=>{
   const old=db.prepare("SELECT * FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").get(),save=body(await preview());await submit(save);const undo={zapros_kljuch:randomUUID(),ishodnyj_kljuch:save.zapros_kljuch};await good('POST',route('snimok_otmenit'),undo);assert.deepEqual(db.prepare("SELECT * FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").get(),old);let before=snapshot();assert.equal((await good('POST',route('snimok_otmenit'),undo)).povtor_sohranenija,true);assert.equal(snapshot(),before);
   assert.equal((await good('GET',route('snimok_proverka')+'&zapros_kljuch='+save.zapros_kljuch)).vernuto,true);
   const stale=body(await preview()),intermediate=body(await preview());await submit(intermediate);await good('POST',route('snimok_otmenit'),{zapros_kljuch:randomUUID(),ishodnyj_kljuch:intermediate.zapros_kljuch});before=snapshot();assert.equal((await api('POST',route('snimok'),stale)).status,409);assert.equal(snapshot(),before);
   assert.equal((await api('POST',route('snimok_otmenit'),{zapros_kljuch:randomUUID(),ishodnyj_kljuch:first.zapros_kljuch})).status,409);assert.equal(snapshot(),before);
  });
  await t.test('a late receipt failure rolls back snapshot and journal as well as the command',async()=>{
   const b=body(await preview());db.exec("CREATE TRIGGER fixture_receipt_failure BEFORE INSERT ON zaprosy_snimkov_planerki BEGIN SELECT RAISE(ABORT,'synthetic receipt failure');END");try{const before=snapshot();assert.equal((await api('POST',route('snimok'),b)).status,500);assert.equal(snapshot(),before);}finally{db.exec('DROP TRIGGER fixture_receipt_failure');}await submit(b);
  });
  await t.test('readers cannot recalculate; history is scoped and its old and new private values are filtered',async()=>{
   for(const who of [peer,restricted])assert.equal((await api('GET',route('snimok_predprosmotr'),undefined,who)).status,403);
   let history=await good('GET',route('snimok_istorija'));assert.ok(history.spisok.length>=1);for(const row of history.spisok){const s=JSON.parse(row.srez).snimok_planerki;assert.equal(s.napravlenie,'synapt');assert.equal(s.god,2026);assert.equal(s.nedelja,42);}
   assert.deepEqual((await good('GET','planerka/snimok_istorija?napravlenie=media&nedelja=42&god=2026')).spisok,[]);assert.deepEqual((await good('GET',route('snimok_istorija')+'&do_id=1')).spisok,[]);
   assert.ok(!JSON.stringify(await good('GET',route('snimok_istorija'),undefined,200,restricted)).includes('987654321'));
   db.prepare("UPDATE celi SET sostojanie='chernovik' WHERE id=?").run(goal.id);try{history=await good('GET',route('snimok_istorija'),undefined,200,peer);assert.ok(!JSON.stringify(history).includes('Synthetic weekly annual goal'));}finally{db.prepare("UPDATE celi SET sostojanie='aktivna' WHERE id=?").run(goal.id);}
  });
  await t.test('malformed, duplicate and cross-year command scopes never write or return a foreign receipt',async()=>{
   const p=await preview(),valid=body(p),invalid=[{...valid,unknown:1},{...valid,zapros_kljuch:'bad'},{...valid,kontekst:null}];for(const b of invalid){const before=snapshot();assert.ok([400,409].includes((await api('POST',route('snimok'),b)).status));assert.equal(snapshot(),before);}
   for(const address of [route('snimok_predprosmotr')+'&god=2026','planerka/snimok_predprosmotr?napravlenie=synapt&nedelja=42',route('snimok_predprosmotr')+'&unknown=1'])assert.equal((await api('GET',address)).status,400);
   assert.equal((await api('GET','planerka/snimok_proverka?napravlenie=synapt&nedelja=42&god=2025&zapros_kljuch='+first.zapros_kljuch)).status,409);
   assert.equal((await api('GET','planerka/snimok_predprosmotr?napravlenie=synapt&nedelja=47&god=2026')).status,409);
  });
  await t.test('legacy first captures still work, but repeating the old POST never overwrites a saved report',async()=>{
   const target='planerka/snimok?napravlenie=media&nedelja=1&god=2027';await good('POST',target,{},201,restricted);const before=snapshot();const old=await good('POST',target,{});assert.equal(old.bez_izmenenij,true);assert.equal(snapshot(),before);
  });
  await t.test('first-capture undo removes only the snapshot; history pages are bounded and never overlap',async()=>{
   const suffix='?napravlenie=media&nedelja=40&god=2026',p=await good('GET','planerka/snimok_predprosmotr'+suffix),b=body(p);await good('POST','planerka/snimok'+suffix,b);await good('POST','planerka/snimok_otmenit'+suffix,{zapros_kljuch:randomUUID(),ishodnyj_kljuch:b.zapros_kljuch});assert.equal((await api('GET','planerka/snimok'+suffix)).status,404);assert.ok(db.prepare('SELECT id FROM rezultaty WHERE id=?').get(result.id));
   for(let i=0;i<21;i++)await submit(body(await preview()));const page1=await good('GET',route('snimok_istorija')),page2=await good('GET',route('snimok_istorija')+'&do_id='+page1.sledujuschij);assert.equal(page1.spisok.length,20);assert.ok(page2.spisok.length);assert.ok(page1.spisok.every(a=>page2.spisok.every(b=>b.id<a.id)));
  });
  await t.test('Sunday service closes a partial current-week capture once and refuses early or ordinary requests',async()=>{
   const target='planerka/snimok?napravlenie=synapt&nedelja=47&god=2026';await good('POST',target,{},201);assert.equal((await api('GET','planerka/snimok_predprosmotr?napravlenie=synapt&nedelja=47&god=2026')).status,409);let before=snapshot();assert.equal((await api('POST',target,{},actor,true)).status,409);assert.equal(snapshot(),before);
   fs.writeFileSync(clock,'2026-11-22T20:59:00Z');const r=await good('POST',target,{},200,actor,true);assert.equal(r.avtomaticheski,true);assert.ok(r.sobytie_id);const saved=db.prepare("SELECT * FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=47").get();assert.equal(JSON.parse(saved.dannye).den,'2026-11-22');before=snapshot();assert.equal((await good('POST',target,{},200,actor,true)).povtor_sohranenija,true);assert.equal(snapshot(),before);
   const hist=await good('GET','planerka/snimok_istorija?napravlenie=synapt&nedelja=47&god=2026');assert.equal(JSON.parse(hist.spisok[0].srez).snimok_planerki.dejstvie,'zavershit_nedelju');
  });
  await t.test('a finished or unknown legacy capture is preserved, and automatic retry cannot undo a manual correction',async()=>{
   const target='planerka/snimok?napravlenie=media&nedelja=46&god=2026';await good('POST',target,{},201);db.prepare("UPDATE snimki_planerki SET dannye=json_remove(dannye,'$.den') WHERE napravlenie='media' AND god=2026 AND nedelja=46").run();const row=db.prepare("SELECT * FROM snimki_planerki WHERE napravlenie='media' AND god=2026 AND nedelja=46").get();const r=await good('POST',target,{},200,actor,true);assert.equal(r.net_izmenenij,true);assert.deepEqual(db.prepare("SELECT * FROM snimki_planerki WHERE napravlenie='media' AND god=2026 AND nedelja=46").get(),row);
   fs.writeFileSync(clock,'2026-11-23T07:00:00Z');const s='?napravlenie=synapt&nedelja=47&god=2026',p=await good('GET','planerka/snimok_predprosmotr'+s);await good('POST','planerka/snimok'+s,body(p));const before=snapshot();await good('POST','planerka/snimok'+s,{},200,actor,true);assert.equal(snapshot(),before);
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db?.close();await stop();fs.rmSync(folder,{recursive:true,force:true});}
});
