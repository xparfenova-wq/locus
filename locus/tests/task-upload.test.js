const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync,randomUUID}=require('node:crypto');
test('task creation uses the shared byte store and retains original attachment metadata',async t=>{
 const root=process.env.LOCUS_TASK_UPLOAD_ROOT||path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-task-upload-')),file=path.join(folder,'fixture.db'),store=path.join(folder,'files'),actor=9900180,password='task-upload-fixture';
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:store,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),LOCUS_UPLOAD_GRACE_MS:'2000',NODE_ENV:'test'};let db,server,port,cookie;
 const start=async()=>{server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup timeout')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>reject(new Error('fixture server exited')));});};
 const stop=async()=>{const done=new Promise(r=>server.once('exit',r));server.kill();await done;};
 const request=(method,route,body,headers={})=>fetch('http://127.0.0.1:'+port+route,{method,headers:{connection:'close',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body})});
 const api=async(method,route,body)=>{const r=await request(method,'/api/'+route,body===undefined?undefined:JSON.stringify(body),{'content-type':'application/json'});return {status:r.status,body:await r.json(),headers:r.headers};};
 const raw=async(name,bytes,mime='application/octet-stream')=>{const r=await request('POST','/api/fajly',bytes,{'content-type':'application/octet-stream','x-imja-fajla':encodeURIComponent(name),'x-tip-fajla':mime});const body=await r.json();return {status:r.status,body:body.telo||body};};
 const objects=()=>fs.existsSync(store)?fs.readdirSync(store).filter(n=>!n.startsWith('.')).sort():[];
 const create=async(material)=>{const payload={zapros_kljuch:randomUUID(),nazvanie:'Attached task',napravlenie:'synapt',otvetstvennyj:actor,materialy:[material]};const r=await api('POST','zadachi',payload);assert.equal(r.status,201,JSON.stringify(r.body));return {task:r.body,payload};};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex');db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup)VALUES(?,?,1,'polnyj')").run(actor,'Task upload fixture');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(actor,'task-upload-fixture',salt+':'+scryptSync(password,salt,64).toString('hex'));await start();const login=await api('POST','vhod/parol',{login:'task-upload-fixture',parol:password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  await t.test('retrying a raw upload and a multipart upload stores identical bytes once',async()=>{
   const bytes=Buffer.from('one shared object'),first=await raw('First.pdf',bytes),again=await raw('Other name.pdf',bytes);assert.equal(first.status,201);assert.equal(again.status,201);assert.equal(first.body.ssylka,again.body.ssylka);assert.equal(objects().length,1);
   const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),'Third.pdf');form.append('napravlenie','synapt');const r=await request('POST','/api/materialy',form),row=await r.json();assert.equal(r.status,201);assert.equal(row.fajl,first.body.fajl);assert.equal(objects().length,1);
  });
  await t.test('task attachments keep original Unicode name, size, MIME and one atomic row on replay',async()=>{
   const name='🙂 План #1 с подписью.pdf',bytes=Buffer.from('original task attachment'),upload=await raw(name,bytes,'application/pdf');assert.equal(upload.status,201);assert.equal(upload.body.ishodnoe_imja,name);
   const {task,payload}=await create(upload.body),row=db.prepare('SELECT * FROM materialy WHERE zadacha_id=?').get(task.id);assert.equal(row.ishodnoe_imja,name);assert.equal(row.razmer,bytes.length);assert.equal(row.tip_fajla,'application/pdf');assert.equal(row.kto_dobavil,actor);
   const d=await request('GET','/api/fajly/'+row.id+'/skachat?obekt=material');assert.equal(d.status,200);assert.ok(decodeURIComponent(d.headers.get('content-disposition')).endsWith(name));assert.equal(Buffer.from(await d.arrayBuffer()).toString(),bytes.toString());
   const replay=await api('POST','zadachi',payload);assert.equal(replay.status,200);assert.equal(replay.body.id,task.id);assert.equal(db.prepare('SELECT count(*) n FROM materialy WHERE zadacha_id=?').get(task.id).n,1);
   await stop();await start();assert.equal((await api('POST','zadachi',payload)).status,200);assert.equal(fs.readFileSync(path.join(store,row.fajl)).toString(),bytes.toString());
  });
  await t.test('a stale browser identity and anonymous requests cannot stage bytes',async()=>{
   const before=objects(),headers={'content-type':'application/octet-stream','x-imja-fajla':'stale.pdf','x-locus-page-user':String(actor-1)};
   const stale=await request('POST','/api/fajly',Buffer.from('must not stage'),headers);assert.equal(stale.status,409);assert.equal(stale.headers.get('x-locus-session-changed'),'1');assert.equal((await stale.json()).sessija_izmenilas,true);
   const anonymous=await request('POST','/api/fajly',Buffer.from('must not stage'),{...headers,cookie:''});assert.equal(anonymous.status,401);assert.deepEqual(objects(),before);
  });
  await t.test('same names with different bytes remain independent',async()=>{
   const a=await raw('Same.pdf',Buffer.from('same name alpha')),b=await raw('Same.pdf',Buffer.from('same name beta'));assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.body.ssylka,b.body.ssylka);await create(a.body);await create(b.body);
  });
  await t.test('an interrupted raw upload leaves no object or task and the server remains usable',async()=>{
   const before=objects(),http=require('node:http'),count=db.prepare('SELECT count(*) n FROM zadachi').get().n;
   await new Promise(resolve=>{const r=http.request({hostname:'127.0.0.1',port,path:'/api/fajly',method:'POST',headers:{cookie,'content-type':'application/octet-stream','x-imja-fajla':'partial.bin','content-length':6000000}});r.on('error',()=>resolve());r.write(Buffer.alloc(128000));setTimeout(()=>r.destroy(),30);});
   assert.deepEqual(objects(),before);assert.equal(db.prepare('SELECT count(*) n FROM zadachi').get().n,count);assert.equal((await request('GET','/healthz')).status,200);
  });
  await t.test('restaging postpones a previously scheduled final unlink cleanup',async()=>{
   const bytes=Buffer.from('renew staging after unlink'),uploaded=await raw('Renew.pdf',bytes),created=await create(uploaded.body),row=db.prepare('SELECT * FROM materialy WHERE zadacha_id=?').get(created.task.id);
   assert.equal((await api('DELETE','materialy/'+row.id,{versija:row.versija,pole:'zadacha_id'})).status,200);
                                                                                     
   const remaining=db.prepare('SELECT * FROM materialy WHERE id=?').get(row.id);assert.ok(remaining);assert.equal((await api('DELETE','materialy/'+row.id,{versija:remaining.versija})).status,200);
   const staged=await raw('Renewed.pdf',bytes);assert.equal(staged.status,201);await new Promise(resolve=>setTimeout(resolve,1200));assert.ok(fs.existsSync(path.join(store,staged.body.fajl)));await create(staged.body);
  });
  await t.test('MIME-only executable, empty and over-limit fail before staging',async()=>{
   const before=objects();assert.equal((await raw('innocent.bin',Buffer.from('unsafe'), 'application/x-shellscript')).status,400);assert.equal((await raw('empty.pdf',Buffer.alloc(0))).status,400);assert.equal((await raw('over.mp4',Buffer.alloc(52428801))).status,413);assert.deepEqual(objects(),before);
  });
  await t.test('abandoned staging survives a restart and is eventually collected without removing used bytes',async()=>{
   const r=await raw('Abandoned.pdf',Buffer.from('abandoned staging bytes'));assert.equal(r.status,201);assert.match(r.body.fajl,/^sha256-/);assert.ok(fs.existsSync(path.join(store,r.body.fajl)));assert.ok(fs.readdirSync(path.join(store,'.gc')).some(n=>n.endsWith('.json')));await stop();await start();
   const deadline=Date.now()+4500;while(fs.existsSync(path.join(store,r.body.fajl))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));assert.equal(fs.existsSync(path.join(store,r.body.fajl)),false);for(const row of db.prepare('SELECT * FROM materialy').all())assert.ok(fs.existsSync(path.join(store,row.fajl)));
  });
 }finally{if(server?.exitCode===null)await stop();db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
