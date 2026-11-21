const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync,randomUUID}=require('node:crypto');
test('project creation has one durable actor-scoped result through retries and the client lifecycle',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-project-')),file=path.join(folder,'fixture.db'),actor=9900520,peer=9900521,client=9900522,password='project-fixture',env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test'};let db,server,port,cookie,other;
 const start=async()=>{server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',c=>process.stderr.write(c));port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('project startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>reject(new Error('project exited')));});};
 const stop=async()=>{if(!server||server.exitCode!==null)return;const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;};
 const api=async(method,route,body,auth=cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(auth?{cookie:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,auth=cookie)=>{const r=await api(method,route,body,auth);assert.equal(r.status,status,route+' '+JSON.stringify(r.body));return r.body;};
 const read=(key,auth=cookie)=>good('GET','proekty?zapros_kljuch='+key,undefined,200,auth),count=()=>db.prepare('SELECT count(*) n FROM proekty').get().n;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');for(const id of [actor,peer]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(?,?,1,'polnyj',1)").run(id,'Project actor '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'project-'+id,hash);}db.prepare("INSERT INTO ljudi(id,imja,komanda,aktiven,rol_v_baze)VALUES(?,'Project client',0,1,'sobstvennyj')").run(client);
  await start();const login=async id=>{const r=await api('POST','vhod/parol',{login:'project-'+id,parol:password},null);assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};cookie=await login(actor);other=await login(peer);
  let project,key=randomUUID(),body={nazvanie:'One project <b>literal</b>',napravlenie:'synapt',klient_id:client,kto_vedet:peer,status:'idet',stoimost:12345.67,zapros_kljuch:key};
  await t.test('five simultaneous posts create one project, history event and assignment notice',async()=>{
   const before=count(),rows=await Promise.all(Array.from({length:5},()=>good('POST','proekty',body,201)));project=rows[0];assert.ok(rows.every(x=>x.id===project.id));assert.equal(count(),before+1);assert.equal(project.stoimost,12345.67);assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='proekt' AND obekt_id=? AND pole='sozdano'").get(project.id).n,1);assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE proekt_id=? AND chelovek_id=?').get(project.id,peer).n,1);assert.equal((await read(key)).proekt.id,project.id);
  });
  await t.test('receipt is actor scoped, key cannot change body or appear twice in a query',async()=>{
   assert.equal((await read(key,other)).sostojanie,'ne_najdeno');assert.equal((await api('POST','proekty',{...body,nazvanie:'Changed'})).status,409);assert.equal((await api('GET','proekty?zapros_kljuch='+key+'&zapros_kljuch='+randomUUID())).status,400);assert.equal((await api('GET','proekty?zapros_kljuch='+key+'&q=x')).status,400);
   const receipt=db.prepare('SELECT * FROM zaprosy_proektov WHERE zapis_id=?').get(project.id);assert.equal(receipt.vladelec_id,actor);assert.equal(receipt.tablica,'proekty');assert.ok(receipt.sobytie_id>0);assert.ok(!JSON.stringify(receipt).includes(key));assert.ok(!JSON.stringify(receipt).includes('12345.67'));
  });
  await t.test('invalid creation rolls back records, receipts, journal and notifications',async()=>{
   const tables=['proekty','zaprosy_proektov','zhurnal','uvedomlenija'],before=tables.map(name=>db.prepare('SELECT count(*) n FROM '+name).get().n);
   for(const patch of [{klient_id:null},{klient_id:99999999},{status:'unknown'},{nazvanie:''},{nazvanie:'   '},{nazvanie:'\u200b'},{nazvanie:[]},{id:123},{kto_dobavil:peer},{stoimost:'not money'}])assert.equal((await api('POST','proekty',{...body,zapros_kljuch:randomUUID(),...patch})).status,400,JSON.stringify(patch));
   assert.deepEqual(tables.map(name=>db.prepare('SELECT count(*) n FROM '+name).get().n),before);
  });
  await t.test('project title accepts200 and rejects201 without truncating or changing old values',async()=>{
   const title='a'.repeat(200),row=await good('POST','proekty',{...body,nazvanie:title,zapros_kljuch:randomUUID()},201);assert.equal(row.nazvanie,title);assert.equal((await api('POST','proekty',{...body,nazvanie:title+'x',zapros_kljuch:randomUUID()})).status,400);assert.equal((await api('PATCH','proekty/'+row.id,{versija:row.versija,nazvanie:title+'x'})).status,400);assert.equal((await good('GET','proekty/'+row.id)).nazvanie,title);
  });
  await t.test('project cost accepts zero, maximum and rounded fractional kopecks, rejects out-of-range or nonnumeric values on create and edit',async()=>{
   for(const [amount,expected] of [[0,0],['0.00',0],['999999999',999999999],['1500.505',1500.51],['1500.5051',1500.51],['0.001',0]]){const row=await good('POST','proekty',{...body,stoimost:amount,zapros_kljuch:randomUUID()},201);assert.equal(row.stoimost,expected);}
   const before=db.prepare('SELECT * FROM proekty WHERE id=?').get(project.id);
   for(const amount of [false,'','-1',5000000000,'1000000000','999999999.01','NaN',{},'90071992547409.91']){
    assert.equal((await api('POST','proekty',{...body,stoimost:amount,zapros_kljuch:randomUUID()})).status,400,JSON.stringify(amount));assert.equal((await api('PATCH','proekty/'+project.id,{versija:project.versija,stoimost:amount})).status,400,JSON.stringify(amount));
   }
   assert.deepEqual(db.prepare('SELECT * FROM proekty WHERE id=?').get(project.id),before);
  });
  await t.test('cancel reserves an unseen key and refuses late original requests without creating',async()=>{
   const value=randomUUID(),before=count();assert.equal((await good('POST','proekty',{zapros_kljuch:value,otmenit_dobavlenie:true})).sostojanie,'otmeneno');assert.equal((await read(value)).sostojanie,'otmeneno');for(let i=0;i<3;i++)assert.equal((await api('POST','proekty',{...body,zapros_kljuch:value})).status,409);assert.equal(count(),before);
   assert.equal((await good('POST','proekty',{zapros_kljuch:key,otmenit_dobavlenie:true})).proekt.id,project.id);assert.ok(db.prepare('SELECT id FROM proekty WHERE id=?').get(project.id));
  });
  await t.test('service price is copied once, manual price and subsequent project state survive receipt replay',async()=>{
   const response=await good('POST','uslugi',{nazvanie:'Fixture service',napravlenie:'synapt',cena:2500},201);const service=response.id;
   let row=await good('POST','proekty',{nazvanie:'Service copy',napravlenie:'synapt',klient_id:client,status:'idet',usluga_id:service,zapros_kljuch:randomUUID()},201);assert.equal(row.stoimost,2500);await good('PATCH','uslugi/'+service,{versija:response.versija,cena:9000});assert.equal((await good('GET','proekty/'+row.id)).stoimost,2500);
   project=await good('PATCH','proekty/'+project.id,{versija:project.versija,status:'pauza',stoimost:777.77,arhiv:true});const before=count(),again=await good('POST','proekty',body,201);assert.equal(again.id,project.id);assert.equal(again.status,'pauza');assert.equal(again.arhiv,true);assert.equal(again.stoimost,777.77);assert.equal(count(),before);assert.ok((await api('DELETE','proekty/'+project.id,{versija:project.versija})).status>=400);assert.equal((await read(key)).sostojanie,'sozdano');
  });
  await t.test('downgraded money access is enforced on old receipts and new creation',async()=>{
   db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(actor);const checked=await read(key);assert.equal(Object.hasOwn(checked.proekt,'stoimost'),false);assert.equal((await api('POST','proekty',{...body,zapros_kljuch:randomUUID()})).status,403);
   const row=await good('POST','proekty',{nazvanie:'No money actor',napravlenie:'synapt',klient_id:client,status:'idet',zapros_kljuch:randomUUID()},201);assert.equal(Object.hasOwn(row,'stoimost'),false);db.prepare("UPDATE ljudi SET dostup='polnyj' WHERE id=?").run(actor);
  });
  await t.test('a deleted id reused by SQL cannot be mistaken for the previously created project',async()=>{
   const value=randomUUID(),row=await good('POST','proekty',{nazvanie:'Reuse fixture',napravlenie:'synapt',klient_id:client,status:'idet',zapros_kljuch:value},201);db.prepare('DELETE FROM proekty WHERE id=?').run(row.id);db.prepare("INSERT INTO proekty(id,nazvanie,napravlenie,klient_id,status)VALUES(?,'Different raw row','synapt',?,'idet')").run(row.id,client);assert.equal((await read(value)).sostojanie,'udaleno');const before=count();assert.equal((await api('POST','proekty',{nazvanie:'Reuse fixture',napravlenie:'synapt',klient_id:client,status:'idet',zapros_kljuch:value})).status,410);assert.equal(count(),before);
  });
  await t.test('restart and remigration retain receipt, current project state and authenticated session',async()=>{
   const rows=db.prepare('SELECT * FROM zaprosy_proektov ORDER BY avtor,kljuch_hesh').all();await stop();execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});await start();assert.deepEqual(db.prepare('SELECT * FROM zaprosy_proektov ORDER BY avtor,kljuch_hesh').all(),rows);assert.equal((await read(key)).proekt.id,project.id);assert.equal((await good('POST','proekty',body,201)).stoimost,777.77);
  });
 }finally{await stop();db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
