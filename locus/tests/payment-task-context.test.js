const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process');
const {randomUUID,randomBytes,scryptSync}=require('node:crypto');

test('payment tasks preserve source context and current financial access',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-payment-task-'));
 const file=path.join(folder,'fixture.db'),actor=9900620,peer=actor+1,amount=1876543.21;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test'};
 let db,server,base,cookie,restricted,project,payment,client,created,keyed;
 const api=async(method,route,body,auth=cookie)=>{
  const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(auth?{cookie:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,body:await r.json(),headers:r.headers};
 };
 const good=async(method,route,body,status=200,auth=cookie)=>{
  const r=await api(method,route,body,auth);assert.equal(r.status,status,route+' '+JSON.stringify(r.body));return r.body;
 };
 const graph=()=>JSON.stringify(['zadachi','zhurnal','versii_polej','uvedomlenija','platezhi','proekty','sqlite_sequence'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const noMoney=row=>{assert.ok(!JSON.stringify(row).includes(String(amount)));for(const field of ['summa','plan_chislo','fakt','fakt_nedeli','procent','progress_pct'])assert.equal(Object.hasOwn(row,field),false,field);assert.ok(row.skryto.includes('dengi'));};
 const payload=()=>({nazvanie:'Collect source payment',tip:'klientskaja',napravlenie:'synapt',klient_id:client.id,proekt_id:project.id,platezh_id:payment.id,otvetstvennyj:actor});
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync('temporary-payment-task',salt,64).toString('hex');
  for(const id of [actor,peer]){
   db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,?,1,'sobstvennyj')").run(id,'Synthetic payment task actor '+id,id===actor?'polnyj':'bez_deneg');
   db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'payment-task-'+id,hash);
  }
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>process.stderr.write(d));
  base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>reject(new Error('exit')));});
  for(const id of [actor,peer]){const r=await api('POST','vhod/parol',{login:'payment-task-'+id,parol:'temporary-payment-task'},null);assert.equal(r.status,200);if(id===actor)cookie=r.headers.get('set-cookie').split(';')[0];else restricted=r.headers.get('set-cookie').split(';')[0];}
  client=await good('POST','ljudi',{imja:'Synthetic payment client'},201);
  project=await good('POST','proekty',{nazvanie:'Synthetic payment project',napravlenie:'synapt',klient_id:client.id,status:'idet'},201);
  payment=await good('POST','proekty/'+project.id+'/platezhi',{summa:amount,zhdem_do:'2026-12-05',naznachenie:'Synthetic expected payment'},201);

  await t.test('prefill is read-only and hides only financial data',async()=>{
   const before=graph(),full=await good('GET','platezhi/'+payment.id+'/shablon_zadachi'),hidden=await good('GET','platezhi/'+payment.id+'/shablon_zadachi',undefined,200,restricted);
   assert.equal(full.zagotovka.summa,amount);assert.equal(hidden.summa_skryta,true);assert.equal(Object.hasOwn(hidden.zagotovka,'summa'),false);
   assert.equal(full.zagotovka.srok,'2026-12-05');assert.equal(hidden.zagotovka.proekt_id,project.id);assert.equal(graph(),before);
  });
  await t.test('the literal payment prefill can be submitted once without renaming its amount',async()=>{
   const draft=(await good('GET','platezhi/'+payment.id+'/shablon_zadachi')).zagotovka;
   const request={...draft,zapros_kljuch:randomUUID()},count=db.prepare('SELECT count(*) n FROM zadachi').get().n;
   const row=await good('POST','zadachi',request,201);
   assert.equal(row.summa,amount);assert.equal(row.plan_chislo,amount);assert.equal(row.nomer_proekta,project.id);assert.equal(row.srok,draft.srok);
   assert.equal((await good('POST','zadachi',request)).id,row.id);
   assert.equal(db.prepare('SELECT count(*) n FROM zadachi').get().n,count+1);
   const read=await good('GET','zadachi/'+row.nomer);assert.equal(read.summa,amount);assert.equal(read.nomer_proekta,project.id);
  });
  await t.test('payment amount alias cannot disagree with its source or the canonical target',async()=>{
   for(const change of [{summa:amount+1},{summa:amount,plan_chislo:1},{summa:amount,platezh_id:null}]){
    const before=graph(),r=await api('POST','zadachi',{...payload(),...change});
    assert.ok([400,409].includes(r.status),JSON.stringify(r.body));assert.equal(graph(),before);
   }
  });
  await t.test('payment date overrides template default while an explicit date remains editable',async()=>{
   created=await good('POST','zadachi/iz_shablona',{shablon:'poluchit_oplatu',platezh_id:payment.id},201);
   assert.equal(created.srok,'2026-12-05');assert.equal(created.tip,'klientskaja');assert.equal(created.plan_chislo,amount);assert.equal(created.summa,amount);assert.equal(created.nomer_proekta,project.id);assert.equal(created.proekt_id,project.id);assert.equal(created.klient_id,client.id);
   const explicit=await good('POST','zadachi/iz_shablona',{shablon:'poluchit_oplatu',platezh_id:payment.id,srok:'2026-12-07'},201);assert.equal(explicit.srok,'2026-12-07');
   const alias=await good('POST','zadachi/iz_shablona',{shablon:'poluchit_oplatu',platezh_id:payment.id,summa:String(amount)},201);assert.equal(alias.summa,amount);assert.equal(alias.plan_chislo,amount);
  });
  await t.test('the payment template requires an actual payment before creating any work',async()=>{
   const before=graph();for(const route of ['zadachi','zadachi/iz_shablona']){
    const r=await api('POST',route,{shablon:'poluchit_oplatu',nazvanie:'Must choose actual payment',tip:'klientskaja',napravlenie:'synapt',klient_id:client.id,otvetstvennyj:actor,plan_chislo:1});assert.equal(r.status,400);assert.equal(r.body.pole,'platezh_id');assert.equal(graph(),before);
   }
  });
  await t.test('restricted actor can create work without receiving or writing the amount',async()=>{
   const row=await good('POST','zadachi/iz_shablona',{shablon:'poluchit_oplatu',platezh_id:payment.id},201,restricted);noMoney(row);
   assert.equal(db.prepare('SELECT plan_chislo FROM zadachi WHERE id=?').get(row.id).plan_chislo,amount);
   assert.equal(row.otvetstvennyj,peer);assert.equal(row.srok,payment.zhdem_do);
   const generic=await good('POST','zadachi',{...payload(),otvetstvennyj:peer,zapros_kljuch:randomUUID()},201,restricted);noMoney(generic);
  });
  await t.test('wrong project even for the same client rejects the whole creation',async()=>{
   const second=await good('POST','proekty',{nazvanie:'Synthetic same-client other project',napravlenie:'synapt',klient_id:client.id,status:'idet'},201);
   for(const override of [{proekt_id:second.id},{klient_id:peer},{napravlenie:'media'}])for(const route of ['zadachi','zadachi/iz_shablona']){
    const before=graph(),r=await api('POST',route,{...(route==='zadachi'?{...payload(),zapros_kljuch:randomUUID()}:{shablon:'poluchit_oplatu',platezh_id:payment.id}),...override});assert.equal(r.status,400,JSON.stringify(r.body));assert.equal(graph(),before);
   }
  });
  await t.test('restricted money writes fail without modifying tasks or receipts',async()=>{
   for(const [method,route,body]of [
    ['POST','zadachi',{...payload(),plan_chislo:amount,zapros_kljuch:randomUUID()}],
    ['POST','zadachi',{...payload(),summa:amount,zapros_kljuch:randomUUID()}],
    ['POST','zadachi/iz_shablona',{shablon:'poluchit_oplatu',platezh_id:payment.id,plan_chislo:amount}],
    ['POST','zadachi/iz_shablona',{shablon:'poluchit_oplatu',platezh_id:payment.id,summa:amount}],
    ['PATCH','zadachi/'+created.nomer,{versija:created.versija,plan_chislo:12}],
    ['PATCH','zadachi/'+created.nomer,{versija:created.versija,platezh_id:null,plan_chislo:12}],
   ]){const before=graph(),r=await api(method,route,body,restricted);assert.equal(r.status,403,JSON.stringify(r.body));assert.equal(graph(),before);}
   const renamed=await good('PATCH','zadachi/'+created.nomer,{versija:created.versija,nazvanie:'Payment follow-up'},200,restricted);noMoney(renamed);created=await good('GET','zadachi/'+created.nomer);
  });
  await t.test('ordinary numeric business work stays visible and writable',async()=>{
   const row=await good('POST','zadachi',{nazvanie:'Count actual contacts',tip:'biznesovaja',napravlenie:'synapt',otvetstvennyj:peer,plan_chislo:23},201,restricted);
   assert.equal(row.plan_chislo,23);const changed=await good('PATCH','zadachi/'+row.nomer,{versija:row.versija,plan_chislo:24},200,restricted);assert.equal(changed.plan_chislo,24);
  });
  await t.test('payment binding cannot be silently removed or moved by ordinary task edits',async()=>{
   const another=await good('POST','proekty/'+project.id+'/platezhi',{summa:50,zhdem_do:'2026-12-06'},201);
   for(const patch of [{platezh_id:null},{platezh_id:another.id},{proekt_id:null},{klient_id:peer},{napravlenie:'media'}]){
    const before=graph(),r=await api('PATCH','zadachi/'+created.nomer,{versija:created.versija,...patch});assert.ok([400,409].includes(r.status),JSON.stringify(r.body));assert.equal(graph(),before);
   }
  });
  await t.test('lists, search, space, project and week views share the same money policy',async()=>{
   noMoney(await good('GET','zadachi/'+created.nomer,undefined,200,restricted));
   for(const route of ['zadachi?proekt_id='+project.id,'poisk?q=Payment','moe_prostranstvo','planerka?napravlenie=synapt','proekty/'+project.id+'/otkrytye_zadachi']){
    const r=await api('GET',route,undefined,restricted);assert.equal(r.status,200,route+' '+JSON.stringify(r.body));assert.ok(!JSON.stringify(r.body).includes(String(amount)),route);
   }
   assert.equal((await api('GET','zadachi/'+created.nomer+'/fakt',undefined,restricted)).status,403);
   assert.equal((await api('GET','zadachi?plan_chislo='+amount,undefined,restricted)).status,403);
  });
  await t.test('creation proof and replay use current access after the actor is restricted',async()=>{
   keyed={...payload(),shablon:'poluchit_oplatu',zapros_kljuch:randomUUID()};const saved=await good('POST','zadachi',keyed,201);assert.equal(saved.plan_chislo,amount);
   db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);
   try{
    noMoney(await good('GET','zadachi/'+saved.nomer));
    noMoney((await good('GET','zadachi/proverka?zapros_kljuch='+keyed.zapros_kljuch)).rezultat);
    noMoney(await good('POST','zadachi',keyed));
   }finally{db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);}
  });
  await t.test('copy drafts never detach a payment amount into unclassified work',async()=>{
   for(const auth of [cookie,restricted]){
    const r=await good('GET','zadachi/'+created.nomer+'/dubl?versija='+created.versija,undefined,200,auth);assert.equal(Object.hasOwn(r.chernovik,'plan_chislo'),false);assert.equal(r.chernovik.proekt_id,null);
   }
  });
  await t.test('a payment changed after prefill rejects the old draft with no partial writes',async()=>{
   const p=await good('POST','proekty/'+project.id+'/platezhi',{summa:100,zhdem_do:'2026-12-08'},201),draft=(await good('GET','platezhi/'+p.id+'/shablon_zadachi')).zagotovka;
   await good('PATCH','platezhi/'+p.id,{versija:p.versija,summa:125,zhdem_do:'2026-12-09'});
   const request={...payload(),platezh_id:p.id,platezh_kontekst:draft.platezh_kontekst,zapros_kljuch:randomUUID()},before=graph(),stale=await api('POST','zadachi',request);
   assert.equal(stale.status,409);assert.equal(stale.body.platezh_izmenilsja,true);assert.equal(graph(),before);
   const current=(await good('GET','platezhi/'+p.id+'/shablon_zadachi')).zagotovka;
   const row=await good('POST','zadachi',{...request,platezh_kontekst:current.platezh_kontekst,srok:'2026-12-12'},201);assert.equal(row.plan_chislo,125);assert.equal(row.srok,'2026-12-12');
  });
  await t.test('source version ABA and a different actor cannot reuse a viewed payment context',async()=>{
   const p=await good('POST','proekty/'+project.id+'/platezhi',{summa:200,zhdem_do:'2026-12-10'},201),draft=(await good('GET','platezhi/'+p.id+'/shablon_zadachi')).zagotovka;
   const request={...payload(),platezh_id:p.id,platezh_kontekst:draft.platezh_kontekst,zapros_kljuch:randomUUID()},before=graph();
   assert.equal((await api('POST','zadachi',request,restricted)).status,409);assert.equal(graph(),before);
   db.prepare('UPDATE platezhi SET summa=201 WHERE id=?').run(p.id);db.prepare('UPDATE platezhi SET summa=200 WHERE id=?').run(p.id);
   const after=graph(),r=await api('POST','zadachi',request);assert.equal(r.status,409);assert.equal(graph(),after);
  });
  await t.test('project context changes also reject a stale payment task draft',async()=>{
   const draft=(await good('GET','platezhi/'+payment.id+'/shablon_zadachi')).zagotovka,old=await good('GET','proekty/'+project.id);
   await good('PATCH','proekty/'+project.id,{versija:old.versija,nazvanie:'Renamed while payment form was open'});
   const before=graph(),r=await api('POST','zadachi',{...payload(),platezh_kontekst:draft.platezh_kontekst,zapros_kljuch:randomUUID()});assert.equal(r.status,409);assert.equal(graph(),before);
  });
  await t.test('serialized history and physically removed tasks retain financial classification',async()=>{
   const historyRow={id:created.id,nomer:created.nomer,platezh_id:payment.id,plan_chislo:amount,fakt:amount,referalnaja_zadacha:null};
   db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kto,kogda,srez)VALUES('zadacha',?,'plan_chislo','0',?,?,datetime('now'),?)").run(created.id,String(amount),actor,JSON.stringify({denezhnaja_zadacha:true,dannye:historyRow}));
   db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kto,kogda,srez)VALUES('zadacha',?,'status','v_plane','v_processe',?,datetime('now'),?)").run(created.id,actor,JSON.stringify({denezhnaja_zadacha:true,dannye:historyRow}));
   for(const removed of [false,true]){
    if(removed)db.prepare('DELETE FROM zadachi WHERE id=?').run(created.id);
    const r=await good('GET','zhurnal?obekt=zadacha&obekt_id='+created.id,undefined,200,restricted);assert.ok(!JSON.stringify(r).includes(String(amount)));assert.ok(r.spisok.every(row=>row.pole!=='plan_chislo'));
    const full=await good('GET','zhurnal?obekt=zadacha&obekt_id='+created.id);assert.ok(JSON.stringify(full).includes(String(amount)));
   }
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{
  if(server&&server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}
  db?.close();fs.rmSync(folder,{recursive:true,force:true});
 }
});
