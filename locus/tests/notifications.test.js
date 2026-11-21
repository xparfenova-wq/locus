const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');

test('private notifications use authenticated recipients, real task numbers, confirmed read state and complete pagination',async()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-notices-')),file=path.join(folder,'test.db');
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',NODE_ENV:'test'},password='only-a-notification-fixture';let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const [id,name]of[[500001,'Notice author fixture'],[500002,'Notice recipient fixture']]){
   db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,name);
   db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'notice-'+id,hash);
  }
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',d=>{stderr+=d;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const base='http://127.0.0.1:'+port;
  const api=async(method,route,body,cookie)=>{const r=await fetch(base+'/api/'+route,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),headers:r.headers};};
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'notice-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const author=await login(500001),recipient=await login(500002);
  assert.equal((await api('GET','uvedomlenija')).status,401);
  const task=(await api('POST','zadachi',{nazvanie:'Task title <literal> & emoji 😀',napravlenie:'synapt',otvetstvennyj:500001},author)).body;
  assert.notEqual(task.id,task.nomer);
  assert.equal((await api('POST','kommentarii',{zadacha_id:task.id,tekst:'@Notice_recipient_fixture please review'},author)).status,201);
  const r=await api('GET','uvedomlenija',undefined,recipient);assert.equal(r.status,200);const notice=r.body.spisok[0];
  assert.equal(notice.chelovek_id,500002);assert.equal(notice.zadacha_nomer,task.nomer);assert.equal(notice.zadacha_nazvanie,task.nazvanie);assert.equal(notice.adres,'/synapt/'+task.nomer);
  const link=await fetch(base+notice.adres,{headers:{cookie:recipient},redirect:'manual'});assert.equal(link.status,200);assert.equal(link.headers.get('location'),null);assert.ok((await link.text()).includes('/js/task-route-model.js'));
  for(const q of ['?chelovek_id=500001','?chelovek_id=500001&potok=sobytija'])assert.equal((await api('GET','uvedomlenija'+q,undefined,recipient)).status,403);
  assert.equal((await api('GET','uvedomlenija?chelovek_id=500002',undefined,recipient)).status,200);
  for(const q of ['?chelovek_id=abc','?potok=bogus','?stranica=-1','?stranica=9007199254740991','?na_stranice=foo','?prochitano=да'])assert.equal((await api('GET','uvedomlenija'+q,undefined,recipient)).status,400);
  assert.equal((await api('GET','uvedomlenija/'+notice.id,undefined,author)).status,403);
  const before=()=>JSON.stringify(db.prepare('SELECT * FROM uvedomlenija WHERE id=?').get(notice.id));let saved=before();
  for(const body of [{prochitano:'да'},{prochitano:1},{prochitano:false,chelovek_id:500001},{sozdano:'yesterday'},{tekst:'rewrite'},{}]){
   assert.equal((await api('PATCH','uvedomlenija/'+notice.id,body,recipient)).status,400);assert.equal(before(),saved);
  }
  assert.equal((await api('PATCH','uvedomlenija/'+notice.id,{prochitano:true},author)).status,403);assert.equal(before(),saved);
  assert.equal((await api('PATCH','uvedomlenija/'+notice.id,{prochitano:null},recipient)).status,200);assert.equal(before(),saved);
  assert.equal((await api('PATCH','uvedomlenija/'+notice.id,{prochitano:true},recipient)).status,200);assert.equal(db.prepare('SELECT prochitano FROM uvedomlenija WHERE id=?').get(notice.id).prochitano,1);
  assert.equal((await api('GET','uvedomlenija',undefined,recipient)).body.neprochitanyh_pro_menja,0);
  assert.equal((await api('PATCH','uvedomlenija/'+notice.id,{prochitano:false},recipient)).status,200);
  assert.equal((await api('GET','uvedomlenija',undefined,recipient)).body.neprochitanyh_pro_menja,1);
  const insert=db.prepare("INSERT INTO uvedomlenija(chelovek_id,tip,potok,tekst,prochitano,sozdano) VALUES(?,CASE WHEN ?='sobytija' THEN 'kommentarij_v_zadache' ELSE 'komanda_dobavila_zadachu' END,?,?,?,datetime('now'))");
  for(let i=0;i<125;i++)insert.run(500002,'sobytija','sobytija','Event '+i,0);
  for(let i=0;i<115;i++)insert.run(500002,'pro_menja','pro_menja','Action '+i,1);
  insert.run(500001,'pro_menja','pro_menja','Other private notice',0);
  const all=await api('GET','uvedomlenija?na_stranice=100',undefined,recipient);assert.equal(all.body.vsego,241);assert.equal(all.body.neprochitanyh,126);assert.equal(all.body.neprochitanyh_pro_menja,1);assert.equal(all.body.prochitannyh,115);
  const read=await api('GET','uvedomlenija?prochitano=1&na_stranice=100',undefined,recipient),next=await api('GET','uvedomlenija?prochitano=1&na_stranice=100&stranica=2',undefined,recipient);
  assert.equal(read.body.spisok.length,100);assert.equal(next.body.spisok.length,15);assert.equal(new Set([...read.body.spisok,...next.body.spisok].map(x=>x.id)).size,115);
  assert.equal((await api('GET','uvedomlenija?potok=sobytija',undefined,recipient)).body.neprochitanyh,125);
  assert.equal((await api('POST','uvedomlenija',{tekst:'manual'},recipient)).status,403);
  assert.equal((await api('POST','uvedomlenija/prochitat_vse?chelovek_id=500001',{},recipient)).status,403);
  assert.equal((await api('POST','uvedomlenija/prochitat_vse',{chelovek_id:500001},recipient)).status,403);
  assert.equal((await api('POST','uvedomlenija/prochitat_vse',{},recipient)).status,200);
  assert.equal((await api('GET','uvedomlenija',undefined,recipient)).body.neprochitanyh,0);
  assert.equal((await api('GET','uvedomlenija',undefined,author)).body.neprochitanyh,1);
  db.prepare('UPDATE zadachi SET udaleno=1 WHERE id=?').run(task.id);
  const deleted=await api('GET','uvedomlenija/'+notice.id,undefined,recipient);assert.equal(deleted.body.adres,null);assert.equal(deleted.body.pojasnenie,'Задача удалена');
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}fs.rmSync(folder,{recursive:true,force:true});}
});
