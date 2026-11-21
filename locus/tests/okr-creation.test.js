const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomUUID,randomBytes,scryptSync}=require('node:crypto');
test('OKR creation receipts survive retries, cancellation, deletion and current access changes',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-okr-creation-')),file=path.join(folder,'fixture.db'),actor=9900720,peer=actor+1;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test'};let db,server,base,cookie,other;
 const api=async(method,route,body,auth=cookie)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(auth?{cookie:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,auth=cookie)=>{const r=await api(method,route,body,auth);assert.equal(r.status,status,route+' '+JSON.stringify(r.body));return r.body;};
 const state=()=>JSON.stringify(['celi','rezultaty','zamery','zadachi','zhurnal','versii_polej','zaprosy_okr','sqlite_sequence'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const start=async()=>{server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>process.stderr.write(d));base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>reject(new Error('exit')));});};
 const stop=async()=>{if(server&&server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}};
 const goal=extra=>({nazvanie:'Verified creation goal',napravlenie:'synapt',period_id:'2026-Q4',sostojanie:'aktivna',...extra});
 const result=g=>({cel_id:g.id,nazvanie:'Verified creation result',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:100});
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync('temporary-okr-creation',salt,64).toString('hex');
  for(const id of [actor,peer]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,'polnyj',1,'sobstvennyj')").run(id,'Synthetic OKR creation actor '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'okr-creation-'+id,hash);}
  await start();for(const id of [actor,peer]){const r=await api('POST','vhod/parol',{login:'okr-creation-'+id,parol:'temporary-okr-creation'},null);assert.equal(r.status,200);if(id===actor)cookie=r.headers.get('set-cookie').split(';')[0];else other=r.headers.get('set-cookie').split(';')[0];}
  await t.test('goal, result and measurement each have one durable result across both route aliases',async()=>{
   const gbody=goal({zapros_kljuch:randomUUID()}),g=await good('POST','celi',gbody,201),rbody={...result(g),zapros_kljuch:randomUUID()},r=await good('POST','okr/rezultaty',rbody,201),mbody={rezultat_id:r.id,znachenie:17,otkuda:'Verified source',zapros_kljuch:randomUUID()},m=await good('POST','zamery',mbody,201);
   await stop();await start();
   for(const [table,body,row,field,parent]of [['celi',gbody,g,'cel',''],['rezultaty',rbody,r,'rezultat','&cel_id='+g.id],['zamery',mbody,m,'zamer','&rezultat_id='+r.id]]){
    const before=state(),replayed=await good('POST','okr/'+table,body);assert.equal(replayed.id,row.id);assert.equal(replayed.povtor_sozdanija,true);assert.equal(state(),before);
    const proof=await good('GET',table+'?zapros_kljuch='+body.zapros_kljuch+parent);assert.equal(proof.sostojanie,'sozdano');assert.equal(proof.avtor_id,actor);assert.equal(proof.zapis_id,row.id);assert.equal(proof[field].id,row.id);assert.equal(state(),before);
    const changed=await api('POST',table,{...body,...(table==='zamery'?{znachenie:18}:{nazvanie:'Different request'})});assert.equal(changed.status,409);assert.equal(changed.body.operation_key_reused,true);assert.equal(state(),before);
   }
  });
  await t.test('one actor cannot reuse a key for another parent or resource',async()=>{
   const a=await good('POST','celi',goal(),201),b=await good('POST','celi',goal(),201),body={...result(a),zapros_kljuch:randomUUID()};await good('POST','rezultaty',body,201);const before=state();assert.equal((await api('POST','rezultaty',{...body,cel_id:b.id})).status,409);assert.equal((await api('POST','celi',goal({zapros_kljuch:body.zapros_kljuch}))).status,409);assert.equal(state(),before);
  });
  await t.test('a cancelled unused key prevents a late original request from creating',async()=>{
   const g=await good('POST','celi',goal(),201),key=randomUUID(),body={...result(g),zapros_kljuch:key};const cancelled=await good('POST','rezultaty',{cel_id:g.id,zapros_kljuch:key,otmenit_dobavlenie:true});assert.equal(cancelled.sostojanie,'otmeneno');const before=state(),r=await api('POST','rezultaty',body);assert.equal(r.status,409);assert.equal(r.body.creation_cancelled,true);assert.equal(state(),before);
  });
  await t.test('actor isolation prevents another participant reading a creation outcome',async()=>{
   const key=randomUUID(),g=await good('POST','celi',goal({zapros_kljuch:key,sostojanie:'chernovik'}),201),before=state(),check=await good('GET','celi?zapros_kljuch='+key,undefined,200,other);assert.equal(check.sostojanie,'ne_najdeno');assert.ok(!JSON.stringify(check).includes(g.nazvanie));assert.equal(state(),before);
   assert.equal((await api('POST','rezultaty',{...result(g),zapros_kljuch:randomUUID()},other)).status,404);assert.equal(state(),before);
  });
  await t.test('a deleted creation is terminal; graph undo reveals the same original identity',async()=>{
   const key=randomUUID(),body=goal({zapros_kljuch:key}),g=await good('POST','celi',body,201),preview=await good('GET','celi/'+g.id),del=randomUUID();await good('DELETE','celi/'+g.id,{versija:preview.versija,kontekst_udalenija:preview.kontekst_udalenija,zapros_kljuch:del});const before=state(),proof=await good('GET','celi?zapros_kljuch='+key);assert.equal(proof.sostojanie,'udaleno');assert.equal((await api('POST','celi',body)).status,410);assert.equal(state(),before);await good('POST','otmena',{dejstvie_id:del});assert.equal((await good('GET','celi?zapros_kljuch='+key)).cel.id,g.id);
  });
  await t.test('own creation proof survives permission loss without returning financial values',async()=>{
   const g=await good('POST','celi',goal(),201),key=randomUUID(),body={...result(g),tip:'dengi',plan:876543219,zapros_kljuch:key},r=await good('POST','rezultaty',body,201),measureKey=randomUUID(),m=await good('POST','zamery',{rezultat_id:r.id,znachenie:876543218,otkuda:'Protected source',zapros_kljuch:measureKey},201);
   db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);try{
    const before=state();for(const [table,parent,requestKey,row,field]of [['rezultaty','cel_id='+g.id,key,r,'rezultat'],['okr/zamery','rezultat_id='+r.id,measureKey,m,'zamer']]){
     const proof=await good('GET',table+'?zapros_kljuch='+requestKey+'&'+parent);assert.equal(proof.sostojanie,'sozdano');assert.equal(proof.avtor_id,actor);assert.equal(proof.zapis_id,row.id);assert.equal(proof.dannye_skryty,true);assert.equal(proof[field],undefined);assert.ok(!JSON.stringify(proof).includes('87654321'));assert.ok(!JSON.stringify(proof).includes('Protected source'));assert.equal(state(),before);
    }
    assert.equal((await api('POST','rezultaty',body)).status,403);assert.equal((await api('GET','zamery?rezultat_id='+r.id)).status,403);assert.equal(state(),before);
    const unrelated=await good('POST','celi',goal({nazvanie:'Ordinary work after access change',zapros_kljuch:randomUUID()}),201);assert.ok(unrelated.id);
   }finally{db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);}
   assert.equal((await good('GET','rezultaty?zapros_kljuch='+key+'&cel_id='+g.id)).rezultat.id,r.id);
  });
  await t.test('an undelivered fact can be cancelled after access loss and never arrives late',async()=>{
   const g=await good('POST','celi',goal(),201),r=await good('POST','rezultaty',{...result(g),tip:'dengi'},201),key=randomUUID(),body={rezultat_id:r.id,znachenie:42,otkuda:'Late monetary source',zapros_kljuch:key};db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);
   try{const before=state(),proof=await good('GET','zamery?zapros_kljuch='+key+'&rezultat_id='+r.id);assert.equal(proof.sostojanie,'ne_najdeno');assert.equal(state(),before);const cancelled=await good('POST','okr/zamery',{rezultat_id:r.id,zapros_kljuch:key,otmenit_dobavlenie:true});assert.equal(cancelled.sostojanie,'otmeneno');assert.equal(db.prepare('SELECT count(*) n FROM zamery WHERE rezultat_id=?').get(r.id).n,0);}finally{db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);}
   const before=state(),late=await api('POST','zamery',body);assert.equal(late.status,409);assert.equal(late.body.creation_cancelled,true);assert.equal(state(),before);
  });
  await t.test('a receipt reveals no private parent data and cannot cross actor or scope',async()=>{
   const g=await good('POST','celi',goal(),201,other),key=randomUUID(),r=await good('POST','rezultaty',{...result(g),nazvanie:'Record later made private',zapros_kljuch:key},201);db.prepare("UPDATE celi SET sostojanie='chernovik' WHERE id=?").run(g.id);
   const before=state(),proof=await good('GET','rezultaty?zapros_kljuch='+key+'&cel_id='+g.id);assert.equal(proof.zapis_id,r.id);assert.equal(proof.dannye_skryty,true);assert.equal(proof.rezultat,undefined);assert.ok(!JSON.stringify(proof).includes('Record later made private'));assert.equal((await api('GET','rezultaty/'+r.id)).status,404);assert.equal((await good('GET','rezultaty?zapros_kljuch='+key+'&cel_id='+g.id,undefined,200,other)).sostojanie,'ne_najdeno');
   assert.equal((await api('GET','rezultaty?zapros_kljuch='+key+'&cel_id='+(g.id+1))).status,409);assert.equal((await api('GET','rezultaty?zapros_kljuch='+key+'&cel_id='+g.id+'&cel_id='+g.id)).status,400);
   assert.equal((await api('POST','rezultaty',{zapros_kljuch:randomUUID(),cel_id:g.id,otmenit_dobavlenie:true,plan:2})).status,400);assert.equal(state(),before);
  });
  await t.test('receipt access stays actor-scoped across restart and rejects business fields in cancellation',async()=>{
   const g=await good('POST','celi',goal(),201),r=await good('POST','rezultaty',{...result(g),tip:'dengi'},201),key=randomUUID(),body={rezultat_id:r.id,znachenie:876543210,otkuda:'Private restart source',zapros_kljuch:key};const m=await good('POST','zamery',body,201);db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);
   try{await stop();await start();const before=state(),proof=await good('GET','okr/zamery?zapros_kljuch='+key+'&rezultat_id='+r.id);assert.equal(proof.avtor_id,actor);assert.equal(proof.zapis_id,m.id);assert.equal(proof.dannye_skryty,true);assert.equal(proof.zamer,undefined);const foreign=await good('GET','zamery?zapros_kljuch='+key+'&rezultat_id='+r.id,undefined,200,other);assert.equal(foreign.avtor_id,peer);assert.equal(foreign.sostojanie,'ne_najdeno');assert.equal(foreign.zapis_id,undefined);
    assert.equal((await api('GET','zamery?zapros_kljuch='+key+'&rezultat_id='+r.id,undefined,null)).status,401);
    for(const input of [{rezultat_id:r.id,zapros_kljuch:randomUUID(),otmenit_dobavlenie:true,znachenie:1},{rezultat_id:r.id,zapros_kljuch:'invalid',otmenit_dobavlenie:true},{rezultat_id:true,zapros_kljuch:randomUUID(),otmenit_dobavlenie:true}])assert.equal((await api('POST','zamery',input)).status,400);
    assert.equal((await api('POST','zamery',null)).status,400);assert.equal((await api('POST','celi',null)).status,400);assert.equal(state(),before);
   }finally{db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);}
  });
  await t.test('numeric plans are positive finite values; missing bases and milestones remain genuinely empty',async()=>{
   const g=await good('POST','celi',goal(),201),r=await good('POST','rezultaty',result(g),201),m=await good('POST','rezultaty',{cel_id:g.id,nazvanie:'Milestone has no numeric fields',tip:'veha'},201);assert.equal(m.plan,null);assert.equal(m.baza,null);
   for(const plan of [0,-5,null,true,false,[],{},'','Infinity','1e309']){const before=state(),response=await api('PATCH','rezultaty/'+r.id,{versija:r.versija,plan});assert.equal(response.status,422,JSON.stringify(plan));assert.equal(state(),before);}
   const before=state();assert.equal((await api('PATCH','rezultaty/'+m.id,{versija:m.versija,plan:10})).status,422);assert.equal((await api('POST','rezultaty',{cel_id:g.id,nazvanie:'No numeric plan'})).status,422);assert.equal(state(),before);
   const updated=await good('PATCH','rezultaty/'+r.id,{versija:r.versija,plan:150000});assert.equal(updated.plan,150000);
   const unknown=await good('POST','rezultaty',{cel_id:g.id,nazvanie:'Missing baseline',plan:100},201);assert.equal(unknown.baza,null);assert.equal(unknown.progress_pct,null);assert.equal(unknown.baza_ne_zadana,true);
  });
  await t.test('the sixth result is saved with guidance and the incomplete goal is explicit',async()=>{
   const g=await good('POST','celi',goal(),201);let last;for(let i=1;i<=6;i++){last=await good('POST','rezultaty',{...result(g),nazvanie:'Focus result '+i},201);assert.equal(last.nepolnaja,i<2);if(i===1)assert.equal((await good('GET','okr?period=2026-Q4')).celi.find(c=>c.id===g.id).nepolnaja,true);}
   assert.match(last.podskazka,/6 результатов/);assert.equal(db.prepare('SELECT count(*) n FROM rezultaty WHERE cel_id=?').get(g.id).n,6);assert.equal((await good('GET','okr?period=2026-Q4')).celi.find(c=>c.id===g.id).nepolnaja,false);
  });
  await t.test('all measurement pages preserve provenance and exclude later inserts from one reading snapshot',async()=>{
   const g=await good('POST','celi',goal(),201),r=await good('POST','rezultaty',result(g),201),ids=[];for(let i=0;i<45;i++)ids.push((await good('POST','zamery',{rezultat_id:r.id,znachenie:i,data:i%2?'2026-11-17':'2026-11-16',otkuda:'Source '+i},201)).id);
   const route='okr/zamery?istoriya=1&rezultat_id='+r.id+'&skolko=13',before=state(),first=await good('GET',route);assert.equal(state(),before);assert.equal(first.vsego,45);assert.equal(first.spisok.length,13);assert.equal(first.spisok[0].kto,actor);assert.ok(first.spisok[0].kto_imja.includes(String(actor)));const later=await good('POST','zamery',{rezultat_id:r.id,znachenie:99,data:'2026-11-15',otkuda:'Inserted after first page'},201);
   const readState=state(),all=[...first.spisok];let cursor=first.prodolzhit;while(cursor){const next=await good('GET',route+'&prodolzhit='+cursor);assert.equal(next.vsego,45);all.push(...next.spisok);cursor=next.prodolzhit;}assert.equal(state(),readState);assert.equal(new Set(all.map(x=>x.id)).size,45);assert.deepEqual(all.map(x=>x.id).sort((a,b)=>a-b),ids);assert.ok(!all.some(x=>x.id===later.id));assert.ok(all.every(x=>x.otkuda.startsWith('Source ')));
   for(const suffix of ['&prodolzhit=invalid','&skolko=101','&skolko=0'])assert.equal((await api('GET','okr/zamery?istoriya=1&rezultat_id='+r.id+suffix)).status,400);
   const money=await good('POST','rezultaty',{...result(g),tip:'dengi'},201);db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);try{assert.equal((await api('GET','okr/zamery?istoriya=1&rezultat_id='+money.id)).status,403);assert.equal((await good('GET',route)).vsego,46);}finally{db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);}
  });
  await t.test('a financial result cannot expose historical amounts by changing its type',async()=>{
   const g=await good('POST','celi',goal(),201),r=await good('POST','rezultaty',{...result(g),tip:'dengi',plan:876543210},201),m=await good('POST','zamery',{rezultat_id:r.id,znachenie:876543211,otkuda:'Synthetic historical amount'},201);
   const changed=await good('PATCH','rezultaty/'+r.id,{versija:r.versija,plan:876543212});
   const before=state(),attempt=await api('PATCH','rezultaty/'+r.id,{versija:changed.versija,tip:'chislo',plan:100,baza:0});
   if(process.env.LOCUS_OKR_FINDING){db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(peer);const journal=await api('GET','zhurnal?obekt=rezultat&obekt_id='+r.id+'&skolko=100',undefined,other),measurements=await api('GET','zamery?rezultat_id='+r.id,undefined,other);fs.writeFileSync(process.env.LOCUS_OKR_FINDING,JSON.stringify({fixtureOnly:true,productionWrites:0,reclassificationStatus:attempt.status,restrictedJournalStatus:journal.status,restrictedHistoryLeaksSyntheticAmount:JSON.stringify(journal.body).includes('876543210'),restrictedMeasurementStatus:measurements.status,restrictedMeasurementLeaksSyntheticAmount:JSON.stringify(measurements.body).includes('876543211')},null,2));}
   assert.equal(attempt.status,409,'reclassifying a monetary history must be an explicit new result');assert.equal(state(),before);
   db.prepare("UPDATE rezultaty SET tip='chislo',plan=100 WHERE id=?").run(r.id);db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(peer);
   const measurements=await api('GET','zamery?rezultat_id='+r.id,undefined,other),journal=await api('GET','zhurnal?obekt=rezultat&obekt_id='+r.id+'&skolko=100',undefined,other);assert.equal(measurements.status,403);assert.ok(!JSON.stringify(journal.body).includes('876543210'));assert.ok(!JSON.stringify(journal.body).includes('876543212'));assert.equal((await api('GET','rezultaty/'+r.id,undefined,other)).status,403);
  });
  await t.test('failure to persist a receipt rolls back the record and journal',async()=>{
   const key=randomUUID(),before=state();db.exec("CREATE TRIGGER fixture_creation_receipt_failure BEFORE INSERT ON zaprosy_okr BEGIN SELECT RAISE(ABORT,'fixture receipt failure');END");try{assert.equal((await api('POST','celi',goal({zapros_kljuch:key}))).status,500);assert.equal(state(),before);}finally{db.exec('DROP TRIGGER fixture_creation_receipt_failure');}assert.equal((await good('GET','celi?zapros_kljuch='+key)).sostojanie,'ne_najdeno');
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{await stop();db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
