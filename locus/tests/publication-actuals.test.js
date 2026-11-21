const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,randomUUID}=require('node:crypto');
test('publication reach is a protected observed value and unknown service data preserves the previous measurement',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-publication-actuals-')),file=path.join(folder,'fixture.db'),actor=9900702,key=randomBytes(32).toString('hex');
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'1',LOCUS_ADMIN_IDS:String(actor),LOCUS_KLJUCH_SBORA:key,NODE_ENV:'test'};let db,server,port,task;
 const api=async(method,route,body)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json','x-locus-chelovek':String(actor)},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
 const good=async(method,route,body,status=200)=>{const r=await api(method,route,body);assert.equal(r.status,status,route+' '+JSON.stringify(r.body));return r.body;};
 const state=()=>JSON.stringify(['zadachi','zhurnal','versii_polej','sqlite_sequence'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const payload=extra=>({nazvanie:'Synthetic protected publication reach',napravlenie:'media',otvetstvennyj:actor,tip:'biznesovaja',publikacija:true,ploshadka:'telegram',format:'post',data_vyhoda:'2026-11-18',...extra});
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(?,?,1,'polnyj',1)").run(actor,'Synthetic publication actuals actor');
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>process.stderr.write(d));port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>reject(new Error('exit')));});
  task=await good('POST','zadachi',payload(),201);
  await t.test('human and wrong-key POST or PATCH reject even null and zero without changing rows or history',async()=>{
   for(const value of [null,0,5000,true,'5000'])for(const credential of [undefined,'wrong-collector-key'])for(const method of ['POST','PATCH']){
    const before=state(),body={ohvat:value,...(credential?{kljuch_sbora:credential}:{}),...(method==='PATCH'?{versija:task.versija}:{})},response=await api(method,method==='POST'?'zadachi':'zadachi/'+task.nomer,method==='POST'?payload(body):body);assert.equal(response.status,400);assert.equal(response.body.oshibka,'ohvat подтягивается замером');assert.equal(state(),before);
   }
  });
  await t.test('a valid collector capability writes an exact known value and zero; malformed values write nothing',async()=>{
   for(const value of [5000,0]){task=await good('PATCH','zadachi/'+task.nomer,{versija:task.versija,ohvat:value,kljuch_sbora:key});assert.equal(task.ohvat,value);}
   for(const value of [-1,true,false,'5000','many',1.5,[],{},Number.MAX_SAFE_INTEGER+1]){const before=state();assert.equal((await api('PATCH','zadachi/'+task.nomer,{versija:task.versija,ohvat:value,kljuch_sbora:key})).status,400);assert.equal(state(),before);}
  });
  await t.test('unknown service data keeps the old number, exact version and history; a changed neighbouring field still applies',async()=>{
   const before=state(),version=task.versija,empty=await good('PATCH','zadachi/'+task.nomer,{versija:version,ohvat:null,kljuch_sbora:key});assert.equal(empty.ohvat,0);assert.equal(empty.versija,version);assert.equal(state(),before);
   task=await good('PATCH','zadachi/'+task.nomer,{versija:version,ohvat:null,nazvanie:'Synthetic independent title',kljuch_sbora:key});assert.equal(task.ohvat,0);assert.equal(task.nazvanie,'Synthetic independent title');
   for(const patch of [{versija:true,ohvat:null,kljuch_sbora:key},{versija:task.versija,ohvat:null,kljuch_sbora:key,unknown:'bad'}]){const saved=state();assert.equal((await api('PATCH','zadachi/'+task.nomer,patch)).status,400);assert.equal(state(),saved);}
  });
  await t.test('reach cannot be attached to an ordinary task and task copies do not inherit an actual measurement',async()=>{
   const ordinary=await good('POST','zadachi',{nazvanie:'Synthetic ordinary task',napravlenie:'media',otvetstvennyj:actor},201);
   for(const value of [null,0,100]){const before=state();assert.equal((await api('PATCH','zadachi/'+ordinary.nomer,{versija:ordinary.versija,ohvat:value,kljuch_sbora:key})).status,400);assert.equal(state(),before);}
   const draft=await good('GET','zadachi/'+task.nomer+'/dubl?versija='+task.versija);assert.equal(Object.hasOwn(draft.chernovik,'ohvat'),false);
   const copy=await good('POST','zadachi/'+task.nomer+'/dubl',{versija:task.versija,zapros_kljuch:randomUUID()},201);assert.equal(copy.ohvat,null);assert.equal(copy.publikacija,true);
  });
 }finally{if(server&&server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
