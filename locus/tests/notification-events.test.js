const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{execFileSync,spawn}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
test('system event validation, event recipients, exact destinations and atomic failures',async()=>{
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'locus-event-rules-')),file=path.join(dir,'fixture.db');
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',NODE_ENV:'test'};let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  for(const [id,name,team,archived]of [[500001,'Event author',1,0],[500002,'Event recipient',1,0],[500003,'Event participant',1,0],[500004,'External fixture',0,0],[500005,'Archived fixture',1,1]])db.prepare("INSERT INTO ljudi(id,imja,komanda,arhiv,dostup) VALUES(?,?,?,?,'polnyj')").run(id,name,team,archived);
  const password='event-rules-fixture',salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [500001,500002,500003])db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'event-'+id,hash);
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>stderr+=d);
  const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',c=>{clearTimeout(t);reject(new Error('server '+c+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(t);resolve(String(d).trim());});});
  const base='http://127.0.0.1:'+port;
  const api=async(method,route,body,cookie)=>{const r=await fetch(base+'/api/'+route,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await r.text();return{status:r.status,body:raw?JSON.parse(raw):null,headers:r.headers};};
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'event-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const author=await login(500001),recipient=await login(500002),participant=await login(500003);
  const taskResponse=await api('POST','zadachi',{nazvanie:'Event fixture <literal>',napravlenie:'synapt',otvetstvennyj:500002},author);assert.equal(taskResponse.status,201);let task=taskResponse.body;
  const notes=()=>db.prepare('SELECT * FROM uvedomlenija ORDER BY id').all();
  assert.equal(notes().at(-1).tip,'komanda_dobavila_zadachu');assert.equal(notes().at(-1).chelovek_id,500002);
  const {SOBYTIJA,uvedomit}=require('../api/sobytija-uvedomlenij.js');
  const valid={komu:500002,avtor:500001,tip:'komanda_dobavila_zadachu',potok:'pro_menja',zadacha_id:task.id,tekst:'Valid fixture'};
  const logs=[],oldError=console.error,oldWarn=console.warn;console.error=(...args)=>logs.push(args);console.warn=(...args)=>logs.push(args);
  try{
   for(const bad of [{tip:''},{tip:'unknown'},{tip:'toString'},{tip:'podzadacha_v_moej_zadache',potok:'sobytija'},{potok:null},{potok:'sobytija'},{komu:99999999},{komu:true},{komu:'Event recipient'},{zadacha_id:99999999},{zadacha_id:null},{tekst:''},{tekst:'\u2003\n'},{tekst:'null\0byte'}]){
    const before=notes();assert.throws(()=>uvedomit(db,{...valid,...bad}));assert.deepEqual(notes(),before);
   }
   for(const komu of [null,500001,500004,500005]){const before=notes();assert.equal(uvedomit(db,{...valid,komu}),null);assert.deepEqual(notes(),before);}
   const id=uvedomit(db,{...valid,tekst:'😀'.repeat(1001)}),long=db.prepare('SELECT * FROM uvedomlenija WHERE id=?').get(id);assert.equal(Array.from(long.tekst).length,1000);assert.ok(long.tekst.endsWith('…'));assert.equal(long.prochitano,0);assert.ok(logs.some(x=>String(x[1]).includes('1000')));
   for(const event of Object.values(SOBYTIJA))assert.ok(event.zagolovok&&['pro_menja','sobytija'].includes(event.potok));
  }finally{console.error=oldError;console.warn=oldWarn;}
  for(const column of ['tip','potok','tekst','chelovek_id','zadacha_id']){
   const invalid={tip:'unknown',potok:'all',tekst:' ',chelovek_id:99999999,zadacha_id:99999999}[column];
   assert.throws(()=>db.prepare(`INSERT INTO uvedomlenija(chelovek_id,tip,potok,zadacha_id,tekst) VALUES(?,?,?,?,?)`).run(...['chelovek_id','tip','potok','zadacha_id','tekst'].map(k=>k===column?invalid:{chelovek_id:500002,tip:'komanda_dobavila_zadachu',potok:'pro_menja',zadacha_id:task.id,tekst:'Valid SQL fixture'}[k])));
  }
                                                                                          
  let before=notes().length;assert.equal((await api('POST','zadachi',{nazvanie:'Own task',napravlenie:'synapt',otvetstvennyj:500001},author)).status,201);assert.equal(notes().length,before);
  task=(await api('GET','zadachi/'+task.nomer,undefined,author)).body;
  assert.equal((await api('PATCH','zadachi/'+task.nomer,{opisanie:'Description only',versija:task.versija},author)).status,200);assert.equal(notes().length,before);
  assert.equal((await api('POST','zadachi/'+task.nomer+'/uchastniki',{chelovek_id:500003},author)).status,201);assert.equal(notes().at(-1).tip,'dobavili_uchastnikom');
  task=(await api('GET','zadachi/'+task.nomer,undefined,author)).body;
  const changed=await api('PATCH','zadachi/'+task.nomer,{srok:'2099-06-15',versija:task.versija},author);assert.equal(changed.status,200);
  assert.deepEqual(notes().slice(-2).map(n=>[n.tip,n.chelovek_id]).sort(),[['izmenili_zadachu_uchastnika',500003],['pomenjali_srok',500002]].sort());
  before=notes().length;
  const sub=await api('POST','zadachi',{nazvanie:'Child fixture',napravlenie:'synapt',roditel_id:task.id,otvetstvennyj:500003},author);assert.equal(sub.status,201);assert.equal(notes().length,before+1);assert.equal(notes().at(-1).tip,'komanda_dobavila_podzadachu');
  const closed=await api('PATCH','zadachi/'+sub.body.nomer,{status:'sdelano',versija:sub.body.versija},participant);assert.equal(closed.status,200);assert.equal(notes().at(-1).tip,'zakryli_podzadachu');assert.equal(notes().at(-1).chelovek_id,500002);
  const comment=await api('POST','kommentarii',{zadacha_id:task.id,tekst:'A new ordinary comment'},author);assert.equal(comment.status,201);assert.equal(notes().at(-1).tip,'kommentarij_v_zadache');assert.equal(notes().at(-1).chelovek_id,500002);
  const project=await api('POST','proekty',{nazvanie:'Exact project <literal>',napravlenie:'synapt',klient_id:500004,status:'idet',kto_vedet:500002},author);assert.equal(project.status,201);
  const projectNote=notes().at(-1);assert.equal(projectNote.tip,'vedushim_proekta');assert.equal(projectNote.proekt_id,project.body.id);
  const projectDto=(await api('GET','uvedomlenija/'+projectNote.id,undefined,recipient)).body;assert.equal(projectDto.adres,'/proekt.html?id='+project.body.id);assert.ok(projectDto.zagolovok);
  const news=await api('POST','lenta',{tip:'novoe',chelovek_id:500001,tekst:'Exact news <literal>'},author);assert.equal(news.status,201);
  const newsNotes=notes().filter(n=>n.lenta_id===news.body.id);assert.deepEqual(newsNotes.map(n=>n.chelovek_id),[500002,500003]);assert.ok(newsNotes.every(n=>n.potok==='sobytija'&&n.prochitano===0));
  const newsDto=(await api('GET','uvedomlenija/'+newsNotes[0].id,undefined,recipient)).body;assert.equal(newsDto.adres,'/poleznoe.html?vkladka=novoe&novoe='+news.body.id);
                                                                                    
  const counts=()=>['lenta','uvedomlenija','zhurnal'].map(t=>db.prepare('SELECT count(*) n FROM '+t).get().n);const saved=counts();
  db.exec("CREATE TRIGGER fixture_news_failure BEFORE INSERT ON uvedomlenija WHEN NEW.tip='novoe' AND NEW.chelovek_id=500003 BEGIN SELECT RAISE(ABORT,'news fixture failure'); END;");
  assert.equal((await api('POST','lenta',{tip:'novoe',chelovek_id:500001,tekst:'Must roll back'},author)).status,500);assert.deepEqual(counts(),saved);db.exec('DROP TRIGGER fixture_news_failure');
  assert.equal((await api('DELETE','lenta/'+news.body.id,{versija:news.body.versija},author)).status,200);const deleted=(await api('GET','uvedomlenija/'+newsNotes[0].id,undefined,recipient)).body;assert.equal(deleted.adres,null);assert.equal(deleted.pojasnenie,'Новость удалена');assert.equal(deleted.tekst,newsNotes[0].tekst);
  db.prepare('DELETE FROM zadachi WHERE id=?').run(sub.body.id);const deletedTask=db.prepare("SELECT id FROM uvedomlenija WHERE tip='zakryli_podzadachu' ORDER BY id DESC LIMIT 1").get();assert.equal((await api('GET','uvedomlenija/'+deletedTask.id,undefined,recipient)).body.pojasnenie,'Задача удалена');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
