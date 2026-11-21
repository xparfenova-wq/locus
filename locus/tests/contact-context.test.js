const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),crypto=require('node:crypto');

test('a stale contact form cannot cross an owner or type change, while disjoint edits still merge',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-contact-context-')),file=path.join(folder,'test.db'),first=780001,second=780002,password='contact-context-fixture';
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(first),NODE_ENV:'test'};let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=crypto.randomBytes(16).toString('hex'),hash=salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
  for(const id of [first,second]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'Context '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'context-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>{stderr+=d;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json(),headers:r.headers};};
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'context-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};const a=await login(first),b=await login(second);
  let serial=0;const create=async(tip='pochta',value)=>{const r=await api('POST','kontakty',{chelovek_id:first,tip,znachenie:value||'context-'+(++serial)+'@example.test'},a);assert.equal(r.status,201);return r.body;};
  const patch=(row,body,cookie=a)=>api('PATCH','kontakty/'+row.id,{versija:row.versija,...body},cookie);
  const state=()=>JSON.stringify(['kontakty','zhurnal','versii_polej'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));
  await t.test('unchanged value does not authorize a stale form to edit a new owner',async()=>{
   const row=await create(),moved=await patch(row,{chelovek_id:second},b);assert.equal(moved.status,200);const before=state();
   for(const fields of [{znachenie:'foreign-edit@example.test'},{porjadok:12},{osnovnoj:true},{chelovek_id:first,force:true}]){const blocked=await patch(row,fields);assert.equal(blocked.status,409);assert.ok(blocked.body.izmenennye_polja.includes('chelovek_id'));assert.equal(state(),before);}
   assert.equal((await patch(moved.body,{znachenie:'fresh-owner@example.test'},b)).status,200);
  });
  await t.test('a changed type is checked before validating input with the new type',async()=>{
   const row=await create('drugoe','context@example.test');assert.equal((await patch(row,{tip:'pochta'},b)).status,200);const before=state();
   const blocked=await patch(row,{versija:String(row.versija),znachenie:'plain old-type text'});assert.equal(blocked.status,409);assert.ok(blocked.body.izmenennye_polja.includes('tip'));assert.equal(state(),before);
  });
  await t.test('changing the owner back still invalidates the earlier context',async()=>{
   const row=await create(),moved=await patch(row,{chelovek_id:second},b),back=await patch(moved.body,{chelovek_id:first},b);assert.equal(back.status,200);const before=state();assert.equal((await patch(row,{znachenie:'stale-roundtrip@example.test'})).status,409);assert.equal(state(),before);
  });
  await t.test('order changes merge with an independently edited contact value',async()=>{
   const row=await create();assert.equal((await patch(row,{porjadok:29},b)).status,200);const merged=await patch(row,{znachenie:'merged-context@example.test'});assert.equal(merged.status,200);assert.equal(merged.body.porjadok,29);assert.equal(merged.body.znachenie,'merged-context@example.test');
  });
  await t.test('a genuinely changed value remains a conflict and invalid versions never write',async()=>{
   const row=await create();assert.equal((await patch(row,{znachenie:'other-context@example.test'},b)).status,200);const before=state();assert.equal((await patch(row,{znachenie:'my-context@example.test'})).status,409);assert.equal(state(),before);
   for(const versija of [undefined,0,true,'invalid']){assert.equal((await patch(row,{versija,znachenie:'invalid@example.test'})).status,400);assert.equal(state(),before);}
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{if(server){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});

function browserAPI(){
 const window={fetch:async()=>{throw new Error('Unexpected fetch');}},document={querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent:()=>{}};
 const sandbox={window,document,crypto:crypto.webcrypto,URL,URLSearchParams,Headers,Request,Intl,console,setTimeout,clearTimeout};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/api.js'),'utf8'),sandbox);return window.API;
}
const row={id:1,chelovek_id:2,tip:'pochta',znachenie:'old@example.test',versija:1};
test('a lost PATCH reply is confirmed by a read without a second write',async()=>{
 const api=browserAPI();let writes=0,reads=0;api.pravit=async()=>{writes++;throw new TypeError('lost reply');};api.odna=async()=>{reads++;return{...row,znachenie:'new@example.test',versija:2};};assert.equal((await api.pravitZnachenieKontakta(row,'new@example.test')).versija,2);assert.equal(writes,1);assert.equal(reads,1);
});
test('an already matching value on conflict succeeds without prompting or replaying',async()=>{
 const api=browserAPI();let writes=0;api.pravit=async()=>{writes++;throw Object.assign(new Error('conflict'),{kod:409,telo:{tekuschee:{...row,znachenie:'new@example.test',versija:2}}});};assert.equal((await api.pravitZnachenieKontakta(row,'new@example.test')).versija,2);assert.equal(writes,1);
});
test('matching text in a different owner or kind never confirms a contact write',async()=>{
 for(const fields of [{chelovek_id:3},{tip:'drugoe'}]){const api=browserAPI();api.pravit=async()=>{throw new TypeError('lost');};api.odna=async()=>({...row,...fields,znachenie:'new@example.test',versija:2});await assert.rejects(()=>api.pravitZnachenieKontakta(row,'new@example.test'),e=>e.kod===409&&e.telo.scope_changed);}
});
test('auth failures do not read or replay writes and a real different value stays a conflict',async()=>{
 for(const error of [{kod:401},{kod:403},{kod:409,telo:{sessija_izmenilas:true}},{kod:409,telo:{tekuschee:{...row,znachenie:'someone-else@example.test',versija:2}}}]){const api=browserAPI();let reads=0;api.pravit=async()=>{throw error;};api.odna=async()=>{reads++;return row;};await assert.rejects(()=>api.pravitZnachenieKontakta(row,'new@example.test'),e=>e===error);assert.equal(reads,0);}
});
test('a contact delete check keeps the original request key, version and scope',async()=>{
 const api=browserAPI(),key=api.kljuchZaprosa();assert.match(key,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);let sent;api.udalit=async(table,id,body)=>{sent={table,id,body};return{deleted:true};};await api.udalitKontakt(row,{zapros_kljuch:key,proverit:true});assert.equal(sent.body.zapros_kljuch,key);assert.equal(sent.body.versija,1);assert.equal(sent.body.chelovek_id,2);assert.equal(sent.body.tip,'pochta');assert.equal(sent.body.proverit,true);assert.throws(()=>api.udalitKontakt(row,{proverit:true}));
});
