const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
test('task membership validates active colleagues, preserves order beyond twenty and rolls back notification failures',async()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-participants-')),file=path.join(folder,'test.db'),env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',NODE_ENV:'test'};let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  for(let i=0;i<207;i++)db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(500000+i,'Participant fixture '+String(207-i).padStart(3,'0'));
  db.exec("INSERT INTO ljudi(id,imja,komanda,arhiv) VALUES(600001,'External fixture',0,0),(600002,'Archived fixture',1,1)");
  const password='participant-fixture-only',salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(500000,?,?)').run('participant-fixture',hash);
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>{stderr+=d;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr)),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await r.text();return{status:r.status,body:raw?JSON.parse(raw):null,raw,headers:r.headers};};
  const login=await api('POST','vhod/parol',{login:'participant-fixture',parol:password}),cookie=login.headers.get('set-cookie').split(';')[0];
  const task=(await api('POST','zadachi',{nazvanie:'Membership fixture',napravlenie:'synapt',otvetstvennyj:500000},cookie)).body;assert.notEqual(task.id,task.nomer);const route='zadachi/'+task.nomer+'/uchastniki';
  const count=()=>['zadacha_uchastniki','uvedomlenija','zhurnal','zadachi'].map(t=>db.prepare('SELECT count(*) n FROM '+t).get().n);
  assert.equal((await api('POST',route,{chelovek_id:500001})).status,401);
  for(const invalid of [undefined,null,{},true,0,-1,'500001suffix',500001.5]){const before=count();assert.equal((await api('POST',route,invalid===undefined?{}:{chelovek_id:invalid},cookie)).status,400);assert.deepEqual(count(),before);}
  for(const invalid of [600001,600002,999999999]){const before=count();assert.equal((await api('POST',route,{chelovek_id:invalid},cookie)).status,422);assert.deepEqual(count(),before);}
  assert.equal((await api('POST','zadachi/999999999/uchastniki',{chelovek_id:500001},cookie)).status,404);
  const order=[];
  for(let i=1;i<=205;i++){const r=await api('POST',route,{chelovek_id:500000+i},cookie);assert.equal(r.status,201);assert.equal(r.body.chelovek_id,500000+i);assert.ok(r.body.dobavleno);order.push(r.body.chelovek_id);}
  const listed=await api('GET',route,undefined,cookie);assert.equal(listed.status,200);assert.deepEqual(listed.body.spisok.map(p=>p.chelovek_id),order);
  let before=count();const duplicate=await api('POST',route,{chelovek_id:500001},cookie);assert.equal(duplicate.status,409);assert.equal(duplicate.body.uchastnik_uzhe_est,true);assert.deepEqual(count(),before);
  const remove=await api('DELETE',route+'/500001',undefined,cookie);assert.equal(remove.status,204);assert.equal(remove.raw,'');before=count();assert.equal((await api('DELETE',route+'/500001',undefined,cookie)).status,204);assert.deepEqual(count(),before);
  assert.equal((await api('POST',route,{chelovek_id:500001},cookie)).status,201);const reordered=(await api('GET',route,undefined,cookie)).body.spisok.map(p=>p.chelovek_id);assert.deepEqual(reordered,[...order.slice(1),500001]);
  assert.equal((await api('DELETE',route+'/500001',{chelovek_id:500002},cookie)).status,400);
  db.exec("CREATE TRIGGER fixture_notification_failure BEFORE INSERT ON uvedomlenija WHEN NEW.tip='dobavili_uchastnikom' BEGIN SELECT RAISE(ABORT,'fixture notification failure'); END;");before=count();
  assert.equal((await api('POST',route,{chelovek_id:500206},cookie)).status,500);assert.deepEqual(count(),before);
  assert.equal((await api('POST','zadachi',{nazvanie:'Atomic aggregate membership',napravlenie:'synapt',otvetstvennyj:500000,uchastniki:[500206]},cookie)).status,500);assert.deepEqual(count(),before);db.exec('DROP TRIGGER fixture_notification_failure');
  before=count();assert.equal((await api('POST','zadachi',{nazvanie:'External aggregate rejected',napravlenie:'synapt',otvetstvennyj:500000,uchastniki:[600001]},cookie)).status,422);assert.deepEqual(count(),before);
  for(const invalid of [true,null,'500001suffix']){before=count();assert.equal((await api('POST','zadachi',{nazvanie:'Malformed aggregate rejected',napravlenie:'synapt',otvetstvennyj:500000,uchastniki:[invalid]},cookie)).status,400);assert.deepEqual(count(),before);}
                                                                                            
  db.prepare('UPDATE zadachi SET udaleno=1 WHERE id=?').run(task.id);before=count();assert.equal((await api('GET',route,undefined,cookie)).status,404);assert.equal((await api('DELETE',route+'/500001',undefined,cookie)).status,404);assert.deepEqual(count(),before);db.prepare('UPDATE zadachi SET udaleno=0 WHERE id=?').run(task.id);assert.equal((await api('GET',route,undefined,cookie)).body.spisok.length,205);
  assert.throws(()=>db.prepare('INSERT INTO zadacha_uchastniki(zadacha_id,chelovek_id) VALUES(999999999,500001)').run(),/FOREIGN KEY/);
  assert.throws(()=>db.prepare('INSERT INTO zadacha_uchastniki(zadacha_id,chelovek_id) VALUES(?,999999999)').run(task.id),/FOREIGN KEY/);
  assert.equal(db.prepare('SELECT count(*) n FROM (SELECT zadacha_id,chelovek_id,count(*) n FROM zadacha_uchastniki GROUP BY 1,2 HAVING n>1)').get().n,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}fs.rmSync(folder,{recursive:true,force:true});}
});
