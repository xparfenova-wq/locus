const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process');
const {randomBytes,scryptSync,createHash}=require('node:crypto');

test('recurrence rules reject incompatible fields and retain the authors and lifecycle of daily marks',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-repeat-rule-'));
 const file=path.join(folder,'fixture.db'),actor=9900046,peer=9900047,password='repeat-rule-fixture';
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

  await t.test('task text edits keep field authors without adding forbidden journal events',async()=>{
   for(const repeating of [false,true]){
    const row=await ok('POST','zadachi',{nazvanie:'Before field authors '+repeating,opisanie:'Old description',kljuchevaja:false,napravlenie:'synapt',otvetstvennyj:actor,...(repeating?{povtorjaetsja:true,chastota:'kazhdyj_den',povtor_s:today}:{})});
    const history=()=>db.prepare("SELECT * FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? ORDER BY id").all(row.id),beforeHistory=history();
    const changes={nazvanie:'After <b>literal</b> '+repeating,opisanie:'New <i>description</i>',kljuchevaja:true};
    const changed=await ok('PATCH','zadachi/'+row.nomer,{...changes,versija:row.versija},b);assert.deepEqual(history(),beforeHistory);
    const heads=()=>db.prepare("SELECT pole,versija,kto FROM versii_polej WHERE tablica='zadachi' AND obekt_id=? AND pole IN ('nazvanie','opisanie','kljuchevaja') ORDER BY pole").all(row.id);
    assert.equal(heads().length,3);assert.ok(heads().every(h=>h.kto===peer&&h.versija===changed.versija));
    const beforeRead=state();await ok('GET','zadachi/'+row.nomer);assert.equal(state(),beforeRead);
    const beforeConflict=state(),conflict=await api('PATCH','zadachi/'+row.nomer,{nazvanie:'Must not overwrite',versija:row.versija},a);assert.equal(conflict.status,409);assert.equal(state(),beforeConflict);assert.deepEqual(history(),beforeHistory);assert.ok(heads().every(h=>h.kto===peer));
   }
  });
  await t.test('ordinary and recurring task names require visible text without partial writes',async()=>{
   const empty=['','   ','\t\n','\u00a0\u2003','\u200b\u200d','\u0000\u0001','\u034f','\ufe0f','\u{E0100}',' \u034f\ufe0f '];
   for(const repeating of [false,true]){
    const body={nazvanie:'Visible title '+repeating,napravlenie:'synapt',otvetstvennyj:peer,...(repeating?{povtorjaetsja:true,chastota:'kazhdyj_den',povtor_s:today}:{})},row=await ok('POST','zadachi',body);
    for(const name of empty)for(const [method,route,data]of [['POST','zadachi',{...body,nazvanie:name}],['PATCH','zadachi/'+row.nomer,{nazvanie:name,versija:row.versija}]]){
     const before=state(),r=await api(method,route,data,a);assert.equal(r.status,400,JSON.stringify({method,name,r}));assert.equal(r.body.oshibka,'nazvanie обязательно');assert.equal(state(),before);
    }
    for(const name of ['  Дело <b>буквально</b>  ','Семья 👩‍👩‍👧‍👦']){const made=await ok('POST','zadachi',{...body,nazvanie:name});assert.equal(made.nazvanie,name);}
   }
  });
  await t.test('creation rejects foreign rule fields with 400 and writes nothing',async()=>{
   for(const extra of [{dni:[1,3]},{den_nedeli:2},{chastota:'budnie',dni:'[1]'},{chastota:'raz_v_nedelju',den_nedeli:2,dni:[2]},{chastota:'vybrannye_dni',dni:[1,3],den_nedeli:1}]){
    const before=state(),r=await api('POST','zadachi',fields(extra),a);assert.equal(r.status,400,JSON.stringify(r));assert.equal(state(),before);
   }
  });
  await t.test('ordinary tasks reject inactive rule settings on creation and patch without partial writes',async()=>{
   const ordinary=await ok('POST','zadachi',{nazvanie:'Ordinary rule fixture',napravlenie:'synapt',otvetstvennyj:peer,povtorjaetsja:false});
   for(const extra of [{dni:'[1,3]'},{dni:[1,3]},{den_nedeli:2},{chastota:'kazhdyj_den'},{chastota:'vybrannye_dni',dni:[1,3]}]){
    for(const [method,route,body]of [['POST','zadachi',fields({povtorjaetsja:false,chastota:null,...extra})],['PATCH','zadachi/'+ordinary.nomer,{versija:ordinary.versija,...extra}]]){
     const before=state(),r=await api(method,route,body,a);assert.equal(r.status,400,JSON.stringify(r));assert.equal(state(),before);
    }
   }
  });
  await t.test('patch rejects foreign rule fields before any task, journal or version write',async()=>{
   const row=await make();
   for(const extra of [{dni:[1,3]},{den_nedeli:2},{chastota:'budnie',den_nedeli:3}]){
    const before=state(),r=await api('PATCH','zadachi/'+row.nomer,{versija:row.versija,...extra},a);assert.equal(r.status,400,JSON.stringify(r));assert.equal(state(),before);
   }
  });
  await t.test('frequency transitions clear only inactive settings and keep the task and all marks',async()=>{
   const row=await make({chastota:'vybrannye_dni',dni:[1,2,3,4,5,6,7]});
   await ok('POST','zadachi/'+row.nomer+'/otmetki',{data:today,versija:row.versija});
   const original=marks(row.id);let current=await ok('GET','zadachi/'+row.nomer);
   for(const patch of [{chastota:'kazhdyj_den'},{chastota:'raz_v_nedelju',den_nedeli:2},{chastota:'budnie'},{chastota:'vybrannye_dni',dni:[5,1,5]}]){
    current=await ok('PATCH','zadachi/'+row.nomer,{versija:current.versija,...patch});assert.equal(current.id,row.id);assert.equal(current.nomer,row.nomer);assert.equal(current.sozdano,row.sozdano);assert.deepEqual(marks(row.id),original);
    if(current.chastota!=='vybrannye_dni')assert.equal(current.dni,null);else assert.equal(current.dni,'[1,5]');
    if(current.chastota!=='raz_v_nedelju')assert.equal(current.den_nedeli,null);
   }
  });
  await t.test('a non-assignee can mark a day and both read routes expose the actual author without writes',async()=>{
   const row=await make();await ok('POST','zadachi/'+row.nomer+'/otmetki',{data:day(-1),versija:row.versija});
   let current=await ok('GET','zadachi/'+row.nomer);await ok('POST','zadachi/'+row.nomer+'/otmetki',{data:today,status:'propushcheno',versija:current.versija},b);
   const original=marks(row.id);current=await ok('GET','zadachi/'+row.nomer);await ok('PATCH','zadachi/'+row.nomer,{versija:current.versija,otvetstvennyj:actor});assert.deepEqual(marks(row.id),original);
   const before=state();for(const route of ['zadachi/'+row.nomer,'zadachi/'+row.nomer+'/otmetki']){
    const result=await ok('GET',route),rows=result.spisok||result.otmetki;assert.equal(rows.length,2);assert.equal(rows.find(r=>r.data===day(-1)).kto,actor);assert.equal(rows.find(r=>r.data===day(-1)).kto_imja,names[actor]);assert.equal(rows.find(r=>r.data===today).kto,peer);assert.equal(rows.find(r=>r.data===today).kto_imja,names[peer]);
   }assert.equal(state(),before);
  });
  await t.test('concurrent marks at the seen version create one daily row and never overwrite the author',async()=>{
   const row=await make(),replies=await Promise.all([a,b,a,b].map(cookie=>api('POST','zadachi/'+row.nomer+'/otmetki',{data:today,versija:row.versija},cookie)));
   assert.deepEqual(replies.map(r=>r.status).sort(),[201,409,409,409]);assert.equal(marks(row.id).length,1);const original=marks(row.id),before=state();
   const stale=await api('POST','zadachi/'+row.nomer+'/otmetki',{data:today,status:'propushcheno',versija:row.versija},b);assert.equal(stale.status,409);assert.equal(state(),before);assert.deepEqual(marks(row.id),original);
  });
  await t.test('disable and re-enable retain old mark authors and start the new period today without backfill',async()=>{
   const row=await make();await ok('POST','zadachi/'+row.nomer+'/otmetki',{data:day(-7),versija:row.versija});const original=marks(row.id);let current=await ok('GET','zadachi/'+row.nomer);
   current=await ok('PATCH','zadachi/'+row.nomer,{versija:current.versija,povtorjaetsja:false});assert.equal(current.povtorjaetsja,false);assert.ok(current.srok);assert.equal(current.chastota,null);assert.equal(current.dni,null);assert.equal(current.den_nedeli,null);assert.deepEqual(marks(row.id),original);
   const before=state();assert.equal((await api('POST','zadachi/'+row.nomer+'/otmetki',{data:today},a)).status,400);assert.equal(state(),before);
   current=await ok('PATCH','zadachi/'+row.nomer,{versija:current.versija,povtorjaetsja:true,chastota:'kazhdyj_den'});assert.equal(current.povtor_s,today);assert.equal(current.srok,null);assert.equal(current.sprint,null);assert.deepEqual(current.otkrytye_dni,[]);assert.deepEqual(marks(row.id),original);assert.equal(current.otmetki[0].kto_imja,names[actor]);
  });
  await t.test('confirmed deletion and restoration keep the same task, rule and author history',async()=>{
   const row=await make();await ok('POST','zadachi/'+row.nomer+'/otmetki',{daty:[day(-2),day(-1)],versija:row.versija});const original=marks(row.id),current=await ok('GET','zadachi/'+row.nomer),before=state();
   const refused=await api('DELETE','zadachi/'+row.nomer,{versija:current.versija},a);assert.equal(refused.status,409);assert.equal(refused.body.otmetok,2);assert.equal(state(),before);
   const deleted=await ok('DELETE','zadachi/'+row.nomer,{versija:current.versija,confirm:true});assert.deepEqual(marks(row.id),original);assert.equal((await api('POST','zadachi/'+row.nomer+'/otmetki',{data:today},a)).status,404);
   const restored=await ok('POST','zadachi/'+row.nomer+'/vernut',{versija:deleted.versija});assert.equal(restored.id,row.id);const visible=await ok('GET','zadachi/'+row.nomer);assert.equal(visible.povtorjaetsja,true);assert.equal(visible.chastota,'kazhdyj_den');assert.deepEqual(marks(row.id),original);assert.ok(visible.otmetki.every(r=>r.kto_imja===names[actor]));
  });
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{if(server){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
