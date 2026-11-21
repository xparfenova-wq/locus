const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process');
const {randomBytes,scryptSync,createHash}=require('node:crypto');

test('task trash state supports authenticated read-only recovery without financial fields',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-trash-read-'));
 const file=path.join(folder,'fixture.db'),actor=9900058,peer=9900059,password='repeat-rule-fixture';
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),LOCUS_FAJLY:path.join(folder,'files'),NODE_ENV:'test'};
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
 const day=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 let db,server,serial=0;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const names={[actor]:'Автор <b data-repeat-author>буквально</b>',[peer]:'Другой участник'};
  for(const id of [actor,peer]){
   const salt=randomBytes(16).toString('hex');
   db.prepare('INSERT INTO ljudi(id,imja,komanda,dostup)VALUES(?,?,1,?)').run(id,names[id],'polnyj');
   db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'repeat-'+id,salt+':'+scryptSync(password,salt,64).toString('hex'));
  }
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup timeout')),10000);server.stdout.once('data',data=>{clearTimeout(timer);resolve(String(data).trim());});server.once('exit',()=>reject(new Error('fixture server exited')));});
  const api=async(method,route,body,cookie)=>{
   const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   return{status:r.status,body:await r.json(),headers:r.headers};
  };
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'repeat-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const a=await login(actor),b=await login(peer);
  const ok=async(method,route,body,cookie=a)=>{const r=await api(method,route,body,cookie);assert.ok(r.status<400,route+' '+r.status+' '+JSON.stringify(r.body));return r.body;};
  const fields=extra=>({nazvanie:'Repeat rule '+(++serial),napravlenie:'synapt',otvetstvennyj:peer,povtorjaetsja:true,chastota:'kazhdyj_den',povtor_s:day(-7),...extra});
  const make=extra=>ok('POST','zadachi',fields(extra));
  const state=()=>createHash('sha256').update(JSON.stringify(['zadachi','otmetki_povtora','zhurnal','uvedomlenija','versii_polej','sqlite_sequence'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()))).digest('hex');
  const marks=id=>db.prepare('SELECT * FROM otmetki_povtora WHERE zadacha_id=? ORDER BY data').all(id);

  const task=await make();
  await ok('POST','zadachi/'+task.nomer+'/otmetki',{data:today,versija:task.versija},b);
  db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=?").run(peer);
  const expectedMarks=marks(task.id),route='zadachi/'+task.nomer+'/korzina';
  await t.test('anonymous is refused and the endpoint accepts only GET without business writes',async()=>{
   const before=state();assert.equal((await api('GET',route)).status,401);assert.equal((await api('POST',route,{},a)).status,405);assert.equal(state(),before);
  });
  await t.test('active state has exact identity/version/authors and exposes no financial or editing fields',async()=>{
   const before=state(),value=await ok('GET',route,undefined,b);
   assert.deepEqual(Object.keys(value).sort(),['id','nomer','nazvanie','napravlenie','versija','udaleno','otmetki'].sort());assert.equal(value.id,task.id);assert.equal(value.nomer,task.nomer);assert.equal(value.udaleno,false);assert.equal(value.otmetki.length,1);assert.equal(value.otmetki[0].kto,peer);assert.equal(value.otmetki[0].kto_imja,names[peer]);
   await Promise.all(Array.from({length:8},()=>ok('GET',route)));assert.equal(state(),before);
  });
  await t.test('deleted task is readable only through recovery state and restores with exact marks',async()=>{
   const current=await ok('GET',route),deleted=await ok('DELETE','zadachi/'+task.nomer,{confirm:true,versija:current.versija});const before=state();
   assert.equal((await api('GET','zadachi/'+task.nomer,undefined,a)).status,410);assert.equal((await api('GET','zadachi?arhivnye=1&nomer='+task.nomer,undefined,a)).status,410);
   const trash=await ok('GET',route,undefined,b);assert.equal(trash.udaleno,true);assert.equal(trash.versija,deleted.versija);assert.equal(trash.id,task.id);assert.equal(trash.nomer,task.nomer);assert.equal(trash.otmetki[0].kto,peer);assert.equal(state(),before);assert.deepEqual(marks(task.id),expectedMarks);
   await ok('POST','zadachi/'+task.nomer+'/vernut',{versija:trash.versija});const restored=await ok('GET',route);assert.equal(restored.udaleno,false);assert.equal(restored.id,task.id);assert.equal(restored.nomer,task.nomer);assert.deepEqual(marks(task.id),expectedMarks);assert.equal((await api('GET','zadachi/'+task.nomer,undefined,a)).status,200);
  });
  await t.test('invalid and missing task numbers are rejected without writes',async()=>{
   const before=state();for(const number of ['0','-1','1.2','wrong'])assert.equal((await api('GET','zadachi/'+number+'/korzina',undefined,a)).status,400,number);assert.equal((await api('GET','zadachi/999999999/korzina',undefined,a)).status,404);assert.equal(state(),before);
  });
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{if(server){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
