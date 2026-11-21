const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync,createHash,randomUUID}=require('node:crypto');
test('material upload, shared bytes, receipts, downloads and binding ownership',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-materials-')),file=path.join(folder,'fixture.db'),store=path.join(folder,'files'),actor=9900166,peer=9900167,password='material-snapshot-fixture';
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),LOCUS_FAJLY:store,NODE_ENV:'test'};
 let db,server,port,cookieA,cookieB;
 const start=async()=>{server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup timeout')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>reject(new Error('fixture server exited')));});};
 const stop=async()=>{server.kill();await new Promise(r=>server.once('exit',r));};
 const request=async(method,route,body,cookie=cookieA,extraHeaders={})=>{const multipart=body instanceof FormData;return fetch('http://127.0.0.1:'+port+route,{method,headers:{connection:'close',...(cookie?{cookie}:{}),...(!multipart&&body!==undefined?{'content-type':'application/json'}:{}),...extraHeaders},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)})});};
 const api=async(method,route,body,cookie=cookieA)=>{const r=await request(method,'/api/'+route,body,cookie);return{status:r.status,body:await r.json(),headers:r.headers};};
 const ok=async(method,route,body,cookie=cookieA)=>{const r=await api(method,route,body,cookie);assert.ok(r.status<400,route+': '+r.status+' '+JSON.stringify(r.body));return r.body;};
 const upload=async(name,bytes,fields={},cookie=cookieA,mime='application/octet-stream')=>{const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),name);for(const [key,value]of Object.entries({napravlenie:'synapt',zapros_kljuch:randomUUID(),...fields}))form.append(key,String(value));return api('POST','materialy',form,cookie);};
 const counts=()=>['materialy','dokumenty','zaprosy_materialov','zhurnal'].map(table=>db.prepare('SELECT count(*) n FROM '+table).get().n);
 const objects=()=>fs.existsSync(store)?fs.readdirSync(store).filter(name=>!name.startsWith('.')).sort():[];
 const digest=b=>createHash('sha256').update(b).digest('hex');
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  for(const id of [actor,peer]){const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO ljudi(id,imja,komanda,dostup)VALUES(?,?,1,?)').run(id,'Material fixture '+id,'polnyj');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'material-'+id,salt+':'+scryptSync(password,salt,64).toString('hex'));}
  await start();for(const id of [actor,peer]){const login=await api('POST','vhod/parol',{login:'material-'+id,parol:password});assert.equal(login.status,200);if(id===actor)cookieA=login.headers.get('set-cookie').split(';')[0];else cookieB=login.headers.get('set-cookie').split(';')[0];}
  await t.test('file bytes, original UTF-8 name, headers and another team member download',async()=>{
   const bytes=Buffer.from('working material'),r=await upload('Макет главной.psd',bytes);assert.equal(r.status,201);assert.equal(r.body.ishodnoe_imja,'Макет главной.psd');assert.equal(r.body.kto_dobavil,actor);
   const d=await request('GET','/api/fajly/'+r.body.id+'/skachat?obekt=material',undefined,cookieB);assert.equal(d.status,200);assert.equal(d.headers.get('content-length'),String(bytes.length));assert.ok(d.headers.get('content-disposition').startsWith("attachment; filename*=UTF-8''"));assert.ok(decodeURIComponent(d.headers.get('content-disposition')).endsWith('Макет главной.psd'));assert.equal(digest(Buffer.from(await d.arrayBuffer())),digest(bytes));
   const anonymous=await request('GET','/api/fajly/'+r.body.id+'/skachat?obekt=material',undefined,null);assert.equal(anonymous.status,401);
   assert.equal(db.prepare("SELECT kto FROM versii_polej WHERE tablica='materialy' AND obekt_id=? AND pole=''").get(r.body.id).kto,actor);
  });
  await t.test('missing local bytes remain explicit in API and browser navigation',async()=>{
   const row=await ok('POST','materialy',{nazvanie:'Missing source',napravlenie:'synapt',fajl:'/fajly/missing-source.pdf'});assert.equal(row.fajl_dostupen,false);
   const before=counts(),route='/api/fajly/'+row.id+'/skachat?obekt=material';
   const machine=await request('GET',route);assert.equal(machine.status,404);assert.equal((await machine.json()).kod,'file_missing');
   const html=await request('GET',route,undefined,cookieA,{accept:'text/html',referer:'http://127.0.0.1:'+port+'/proekt.html?id=1&x=%22'});assert.equal(html.status,404);assert.match(html.headers.get('content-type'),/text\/html/);const body=await html.text();assert.ok(body.includes('Файл пока недоступен'));assert.ok(body.includes('id=1&amp;x=%22'));assert.ok(!body.includes('href="http://127.0.0.1:'+port+'/proekt.html?id=1&x='));
   const foreign=await request('GET',route,undefined,cookieA,{accept:'text/html',referer:'https://example.invalid/'});assert.ok((await foreign.text()).includes('href="/zadachi.html"'));assert.deepEqual(counts(),before);
  });
  await t.test('receipt replay and read-only inspection survive a server restart',async()=>{
   const key=randomUUID(),bytes=Buffer.from('receipt content'),first=await upload('Makefile',bytes,{zapros_kljuch:key}),before=counts();assert.equal(first.status,201);await stop();await start();
   const receipt=await ok('GET','materialy/proverka?zapros_kljuch='+key);assert.equal(receipt.material.id,first.body.id);assert.deepEqual(counts(),before);
   const replay=await upload('Makefile',bytes,{zapros_kljuch:key});assert.equal(replay.status,200);assert.equal(replay.body.id,first.body.id);assert.deepEqual(counts(),before);
   const other=await ok('GET','materialy/proverka?zapros_kljuch='+key,undefined,cookieB);assert.equal(other.sostojanie,'ne_najdeno');
   const changed=await upload('Makefile',Buffer.from('changed'),{zapros_kljuch:key});assert.equal(changed.status,409);assert.deepEqual(counts(),before);
  });
  await t.test('file cleanup resumes after restarting between unlink and the scheduled removal',async()=>{
   const uploadResult=await upload('restart-cleanup.txt',Buffer.from('restart cleanup bytes'));assert.equal(uploadResult.status,201);const row=uploadResult.body;
   await ok('DELETE','materialy/'+row.id,{versija:row.versija});assert.ok(fs.existsSync(path.join(store,row.fajl)));await stop();await start();
   const deadline=Date.now()+4000;while(fs.existsSync(path.join(store,row.fajl))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));assert.equal(fs.existsSync(path.join(store,row.fajl)),false);
  });
  await t.test('the real backup lock retains snapshotted bytes while a material is unlinked',async()=>{
   const bytes=Buffer.from('coherent backup bytes'),result=await upload('coherent.txt',bytes);assert.equal(result.status,201);const row=result.body,snapshot=path.join(folder,'before-unlink.db');db.prepare('VACUUM INTO ?').run(snapshot);
   const script="import importlib.util,pathlib,sys; s=importlib.util.spec_from_file_location('ops',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nwith m.operation_lock(pathlib.Path(sys.argv[2])):\n print('locked',flush=True);sys.stdin.read()";
   const lock=spawn('python3',['-c',script,path.join(root,'ops/locus_ops.py'),folder],{env,stdio:['pipe','pipe','pipe']});
   try{
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('backup lock fixture timeout')),5000);lock.stdout.once('data',()=>{clearTimeout(timeout);resolve();});lock.once('exit',()=>reject(new Error('backup lock fixture exited')));});
    await ok('DELETE','materialy/'+row.id,{versija:row.versija});
    const blocked=JSON.parse(execFileSync('python3',[path.join(root,'ops/file_gc.py'),row.fajl],{cwd:root,env,encoding:'utf8'}));assert.equal(blocked.reason,'busy');assert.ok(fs.existsSync(path.join(store,row.fajl)));
    const saved=path.join(folder,'snapshotted-file');fs.copyFileSync(path.join(store,row.fajl),saved);const old=new DatabaseSync(snapshot,{readOnly:true});assert.equal(old.prepare('SELECT fajl FROM materialy WHERE id=?').get(row.id).fajl,row.fajl);old.close();assert.equal(digest(fs.readFileSync(saved)),digest(bytes));
    lock.stdin.end();await new Promise(resolve=>lock.once('exit',resolve));
    const removed=JSON.parse(execFileSync('python3',[path.join(root,'ops/file_gc.py'),row.fajl],{cwd:root,env,encoding:'utf8'}));assert.equal(removed.deleted,true);assert.equal(digest(fs.readFileSync(saved)),digest(bytes));
   }finally{if(lock.exitCode===null){lock.kill();await new Promise(resolve=>lock.once('exit',resolve));}}
  });
  await t.test('identical bytes share storage; equal names with different bytes stay independent',async()=>{
   const bytes=Buffer.from('shared bytes'),a=await upload('договор.pdf',bytes),b=await upload('другой.pdf',bytes,{},cookieB),c=await upload('договор.pdf',Buffer.from('different bytes'));
   assert.notEqual(a.body.id,b.body.id);assert.equal(a.body.fajl,b.body.fajl);assert.notEqual(a.body.fajl,c.body.fajl);
   const before=objects();await ok('DELETE','materialy/'+a.body.id,{versija:a.body.versija});await new Promise(r=>setTimeout(r,1100));assert.deepEqual(objects(),before);
   const download=await request('GET','/api/fajly/'+b.body.id+'/skachat?obekt=material');assert.equal(download.status,200);assert.equal(digest(Buffer.from(await download.arrayBuffer())),digest(bytes));
   await ok('DELETE','materialy/'+b.body.id,{versija:b.body.versija});
   const deadline=Date.now()+10000;
   while(objects().includes(b.body.fajl)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
   assert.ok(!objects().includes(b.body.fajl),'unreferenced bytes must be collected within the bounded wait');
  });
  await t.test('one row can have several bindings and removal preserves the remaining places',async()=>{
   const row=await ok('POST','materialy',{nazvanie:'Brief',ssylka:'https://example.org/brief',napravlenie:'synapt',chelovek_id:peer,zapros_kljuch:randomUUID()});
   const missing=await api('DELETE','materialy/'+row.id,{versija:row.versija});assert.equal(missing.status,400);
   const unlinked=await ok('DELETE','materialy/'+row.id,{pole:'chelovek_id',versija:row.versija});assert.equal(unlinked.remaining_links,1);assert.equal(db.prepare('SELECT chelovek_id FROM materialy WHERE id=?').get(row.id).chelovek_id,null);assert.equal(db.prepare('SELECT napravlenie FROM materialy WHERE id=?').get(row.id).napravlenie,'synapt');
  });
  await t.test('author or owner may edit and unlink; another member receives 403 without changes',async()=>{
   const own=await upload('peer.txt',Buffer.from('peer ownership'),{},cookieB),before=counts();
   const denied=await api('PATCH','materialy/'+own.body.id,{nazvanie:'changed',versija:own.body.versija},cookieA);assert.equal(denied.status,200);
   const admin=await ok('POST','materialy',{nazvanie:'Owner link',ssylka:'https://example.org/owner',napravlenie:'synapt'});
   const wrong=await api('DELETE','materialy/'+admin.id,{versija:admin.versija},cookieB);assert.equal(wrong.status,403);assert.ok(db.prepare('SELECT id FROM materialy WHERE id=?').get(admin.id));
  });
  await t.test('failed journal or missing binding rolls back row, receipt and newly staged bytes',async()=>{
   const before=counts(),files=objects();db.exec("CREATE TRIGGER fail_material_journal BEFORE INSERT ON zhurnal WHEN NEW.obekt='material' BEGIN SELECT RAISE(ABORT,'fixture journal failure'); END");
   const r=await upload('rollback.txt',Buffer.from('must rollback'));assert.equal(r.status,500);assert.deepEqual(counts(),before);assert.deepEqual(objects(),files);db.exec('DROP TRIGGER fail_material_journal');
   const missing=await upload('missing.txt',Buffer.from('no binding'),{chelovek_id:2147483000});assert.equal(missing.status,400);assert.deepEqual(counts(),before);assert.deepEqual(objects(),files);
  });
  await t.test('empty, executable and over-limit uploads leave no row or object',async()=>{
   const before=counts(),files=objects();for(const extension of ['exe','app','sh','bat','cmd']){const r=await upload('setup.'+extension,Buffer.from('fixture'));assert.equal(r.status,400);assert.equal(r.body.kod,'ispolnjaemyj_fajl');}
   assert.equal((await upload('empty',Buffer.alloc(0))).body.kod,'file_empty');
   const tooBig=await upload('video.mp4',Buffer.alloc(52428801));assert.equal(tooBig.status,413);assert.equal(tooBig.body.kod,'fajl_slishkom_bolshoj');assert.deepEqual(counts(),before);assert.deepEqual(objects(),files);
  });
  await t.test('an interrupted multipart upload leaves no row, receipt or file and the server stays usable',async()=>{
   const before=counts(),files=objects(),http=require('node:http'),boundary='locus-cancel-fixture';
   await new Promise(resolve=>{const request=http.request({hostname:'127.0.0.1',port,path:'/api/materialy',method:'POST',headers:{cookie:cookieA,'content-type':'multipart/form-data; boundary='+boundary,'content-length':6000000}});request.on('error',()=>resolve());request.write('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="partial.bin"\r\nContent-Type: application/octet-stream\r\n\r\n');request.write(Buffer.alloc(128000));setTimeout(()=>request.destroy(),30);});
   await new Promise(resolve=>setTimeout(resolve,30));assert.deepEqual(counts(),before);assert.deepEqual(objects(),files);assert.equal((await request('GET','/healthz')).status,200);
  });
  await t.test('confirmed cancellation prevents a late upload; cancelling an already saved request preserves it',async()=>{
   const key=randomUUID(),before=db.prepare('SELECT count(*) n FROM materialy').get().n,files=objects();
   const cancelled=await ok('POST','materialy/otmena',{zapros_kljuch:key,tablica:'materialy'});assert.equal(cancelled.sostojanie,'otmeneno');
   const late=await upload('late.txt',Buffer.from('cancelled bytes'),{zapros_kljuch:key});assert.equal(late.status,409);assert.equal(late.body.kod,'zapros_otmenen');assert.equal(db.prepare('SELECT count(*) n FROM materialy').get().n,before);assert.deepEqual(objects(),files);
   const otherKey=randomUUID(),saved=await upload('saved.txt',Buffer.from('saved before cancel'),{zapros_kljuch:otherKey});assert.equal(saved.status,201);
   const result=await ok('POST','materialy/otmena',{zapros_kljuch:otherKey});assert.equal(result.sostojanie,'sozdano');assert.equal(result.material.id,saved.body.id);
  });
  await t.test('document multipart keeps its own bytes and legal fields; invalid dates and the last binding are rejected',async()=>{
   const form=new FormData();for(const [key,value]of Object.entries({nazvanie:'Agreement',napravlenie:'synapt',tip:'dogovor',nomer:'17/11',data:'2027-10-12',zapros_kljuch:randomUUID()}))form.append(key,value);form.append('file',new Blob([Buffer.from('document bytes')],{type:'application/pdf'}),'Договор.pdf');
   const doc=await api('POST','dokumenty',form);assert.equal(doc.status,201,JSON.stringify(doc.body));const download=await request('GET','/api/fajly/'+doc.body.id+'/skachat?obekt=dokument');assert.equal(download.status,200);assert.equal(Buffer.from(await download.arrayBuffer()).toString(),'document bytes');assert.ok(decodeURIComponent(download.headers.get('content-disposition')).endsWith('Договор.pdf'));
   for(const [date,status]of [['1990-10-12',201],['1899-10-12',400],['20267-10-12',400],['2026-02-30',400]]){const r=await api('POST','dokumenty',{nazvanie:'Dated document',tip:'akt',data:date,napravlenie:'synapt',ssylka:'https://example.org/date'});assert.equal(r.status,status,date);}
   const orphan=await api('PATCH','dokumenty/'+doc.body.id,{napravlenie:null,versija:doc.body.versija});assert.equal(orphan.status,400);assert.equal(db.prepare('SELECT napravlenie FROM dokumenty WHERE id=?').get(doc.body.id).napravlenie,'synapt');
  });
  await t.test('exact 50 MiB limit and ordinary opaque formats work without adding an extension',async()=>{
   const max=await upload('Video.mp4',Buffer.alloc(52428800,7));assert.equal(max.status,201);assert.equal(max.body.razmer,52428800);
   for(const name of ['scene.psd','archive.zip','photo.heic','movie.mp4','plan.dwg','Makefile']){const r=await upload(name,Buffer.from('opaque '+name));assert.equal(r.status,201,name);const download=await request('GET','/api/fajly/'+r.body.id+'/skachat?obekt=material');assert.equal(download.status,200);assert.ok(decodeURIComponent(download.headers.get('content-disposition')).endsWith(name));await download.arrayBuffer();}
  });
 }finally{if(server?.exitCode===null)await stop();db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
