const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
const mentions=require('../public/js/upominanija.js');

test('mention resolution respects word boundaries, full names, ambiguity and active team membership',()=>{
 const people=[{id:1,imja:'Аня Первая',komanda:true},{id:2,imja:'Аня Вторая',komanda:1},
  {id:3,imja:'Анна',komanda:1},{id:4,imja:'Клиент',komanda:0},{id:5,imja:'Бывший',komanda:1,arhiv:1}];
 assert.deepEqual(mentions.kandidaty('Аня',people).map(x=>x.id),[1,2]);
 assert.deepEqual(mentions.kandidaty('АНЯ_ПЕРВАЯ',people).map(x=>x.id),[1]);
 assert.deepEqual(mentions.kandidaty('Ан',people),[]);
 assert.deepEqual(mentions.kandidaty('Клиент',people),[]);
 assert.deepEqual(mentions.kandidaty('Бывший',people),[]);
 const text='😀 mail@Анна — @АНЯ_ПЕРВАЯ и @Анна';
 const found=mentions.razobrat(text,people);assert.equal(found.length,2);
 for(const item of found)assert.equal(text.slice(item.nachalo,item.konec),'@'+item.label);
 assert.equal(mentions.dlina('😀'.repeat(5000)),5000);
  assert.deepEqual(mentions.razobrat('https://example.test/@Анна https://example.test/?q=@Аня',people),[]);
});

test('mention positions survive surrounding edits and comment time follows the primary specification',()=>{
 const before='😀 @Анна text',ref={chelovek_id:7,nachalo:3,konec:8};
 assert.deepEqual(mentions.perenesti(before,'Prefix '+before,[ref]),[{...ref,nachalo:10,konec:15}]);
 assert.deepEqual(mentions.perenesti(before,before+' appended',[ref]),[ref]);
 assert.deepEqual(mentions.perenesti(before,'😀 @Анна changed',[ref]),[ref]);
 assert.deepEqual(mentions.perenesti(before,'😀 @Аннушка text',[ref]),[]);
 assert.deepEqual(mentions.perenesti(before,'@Анна text',[ref]),[{...ref,nachalo:0,konec:5}]);
 const now=Date.UTC(2026,10,14,17);
 assert.equal(mentions.vremja('2026-11-14 17:00:00',now).tekst,'только что');
 assert.equal(mentions.vremja('2026-11-14 16:39:00',now).tekst,'21 минуту назад');
 assert.equal(mentions.vremja('2026-11-14 15:00:00',now).tekst,'2 часа назад');
 assert.equal(mentions.vremja('2026-11-13 17:00:00',now).tekst,'13.11.2026 20:00');
 assert.equal(mentions.vremja('2026-11-14 16:59:00',now).polnoe,'14.11.2026 19:59');
});

test('comments protect authors, validate text and resolve mentions atomically under real authenticated sessions',async()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-comments-')),file=path.join(folder,'test.db');
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',NODE_ENV:'test'},password='only-a-comment-fixture';let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  const people=[[500001,'Sender fixture',1,0],[500002,'MentionFixture One',1,0],[500003,'MentionFixture Two',1,0],
    [500004,'ExternalFixture Client',0,0],[500005,'ArchivedFixture',1,1]];
  for(const [id,name,team,archived] of people){
   db.prepare("INSERT INTO ljudi(id,imja,komanda,arhiv,dostup) VALUES(?,?,?,?,'polnyj')").run(id,name,team,archived);
   if(id<500004)db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'comment-'+id,hash);
  }
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',data=>{stderr+=data;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup '+stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),headers:r.headers};};
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'comment-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const owner=await login(500001),other=await login(500003);
                                                                                      
  db.exec('BEGIN');
  for(let i=0;i<310;i++)db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,0,'polnyj')").run(100000+i,'External directory fixture '+i);
  for(let i=0;i<205;i++)db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(501000+i,'Team directory fixture '+i);
  db.exec('COMMIT');
  const directory=await api('GET','ekran_zadach',undefined,owner);assert.equal(directory.status,200,JSON.stringify(directory.body));
  const teamIds=directory.body.ljudi.map(row=>row.id);
  for(const id of [500001,500002,500003,501000,501204])assert.ok(teamIds.includes(id),'missing teammate '+id);
  const expected=db.prepare('SELECT count(*) n FROM ljudi WHERE komanda=1 AND arhiv IS NOT 1').get().n;
  assert.equal(teamIds.length,expected);assert.ok(directory.body.ljudi.every(row=>row.komanda&&!row.arhiv));
  const task=(await api('POST','zadachi',{nazvanie:'Comment contract fixture',napravlenie:'synapt',otvetstvennyj:500001},owner)).body;
  const add=text=>api('POST','kommentarii',{zadacha_id:task.id,tekst:text},owner);
  const counts=()=>['kommentarii','uvedomlenija','zadacha_uchastniki','zhurnal'].map(table=>db.prepare('SELECT count(*) n FROM '+table).get().n);
  for(const text of ['','  \n\t',null,123,{},'x'.repeat(5001),'😀'.repeat(5001),'bad\ud800symbol']){
   const before=counts();assert.equal((await add(text)).status,400);assert.deepEqual(counts(),before);
  }
  const long=await add('😀'.repeat(5000));assert.equal(long.status,201);assert.equal(mentions.dlina(long.body.tekst),5000);
  let before=counts(),r=await add('@MentionFixture choose carefully');assert.equal(r.status,422);assert.deepEqual(counts(),before);
  assert.ok(r.body.oshibka.includes('MentionFixture One'));assert.ok(r.body.oshibka.includes('MentionFixture Two'));
  r=await add('@ExternalFixture @ArchivedFixture mail@MentionFixture_One @Men');assert.equal(r.status,201);
  assert.equal(db.prepare("SELECT count(*) n FROM uvedomlenija WHERE tip='upomjanuli_v_kommentarii'").get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM zadacha_uchastniki').get().n,0);
  const literal='  <script>globalThis.commentXss=1</script> & "quote" 😀\nhttps://example.test/a?q=1&x=2  ';
  r=await api('POST','kommentarii',{zadacha_id:task.id,chelovek_id:500003,tekst:literal},owner);
  assert.equal(r.status,201);const comment=r.body;assert.equal(comment.chelovek_id,500001);assert.equal(comment.tekst,literal);
  const row=()=>JSON.stringify(db.prepare('SELECT * FROM kommentarii WHERE id=?').get(comment.id));
  const original=row();before=counts();
  assert.equal((await api('PATCH','kommentarii/'+comment.id,{tekst:'Foreign edit'},other)).status,403);
  assert.equal((await api('DELETE','kommentarii/'+comment.id,undefined,other)).status,403);
  assert.equal(row(),original);assert.deepEqual(counts(),before);
  for(const body of [{chelovek_id:500003},{zadacha_id:task.id},{tekst:'x'.repeat(5001)},{tekst:'   '},{tekst:'@MentionFixture ambiguous'}]){
   assert.ok([400,422].includes((await api('PATCH','kommentarii/'+comment.id,body,owner)).status));assert.equal(row(),original);
  }
  assert.equal((await api('PATCH','kommentarii/'+comment.id,{tekst:'Missing version'},owner)).status,400);
  assert.equal((await api('DELETE','kommentarii/'+comment.id,undefined,owner)).status,400);
  r=await api('PATCH','kommentarii/'+comment.id,{versija:comment.versija,tekst:'Own revised literal < > & 😀'},owner);
  assert.equal(r.status,200);assert.equal(r.body.sozdano,comment.sozdano);assert.equal(r.body.chelovek_id,500001);
  const revisedVersion=r.body.versija;assert.ok(r.body.izmeneno);assert.ok(revisedVersion>comment.versija);
  assert.equal((await api('PATCH','kommentarii/'+comment.id,{versija:comment.versija,tekst:'Stale own edit'},owner)).status,409);
  assert.equal((await api('DELETE','kommentarii/'+comment.id,{versija:comment.versija},owner)).status,409);
  assert.equal((await api('DELETE','kommentarii/'+comment.id,{versija:comment.versija},other)).status,403);
  r=await add('@MentionFixture_One @MentionFixture_One @Sender_fixture');assert.equal(r.status,201);
  const bound=r.body;assert.deepEqual(bound.upominanija.map(ref=>ref.chelovek_id),[500002,500002,500001]);
  assert.deepEqual(db.prepare("SELECT chelovek_id FROM uvedomlenija WHERE tip='upomjanuli_v_kommentarii'").all().map(x=>x.chelovek_id),[500002]);
  assert.deepEqual(db.prepare('SELECT chelovek_id FROM zadacha_uchastniki ORDER BY chelovek_id').all().map(x=>x.chelovek_id),[500001,500002]);
  db.prepare('UPDATE ljudi SET imja=? WHERE id=500002').run('Renamed fixture');
  db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(502000,'MentionFixture One',1,'polnyj')").run();
  const notificationsBeforeRename=db.prepare("SELECT count(*) n FROM uvedomlenija WHERE tip='upomjanuli_v_kommentarii'").get().n;
  before=counts();r=await api('PATCH','kommentarii/'+bound.id,{versija:bound.versija,tekst:'Prefix '+bound.tekst+' suffix'},owner);
  assert.equal(r.status,422);assert.deepEqual(counts(),before);
  r=await api('PATCH','kommentarii/'+bound.id,{versija:bound.versija,tekst:'Prefix '+bound.tekst+' suffix',upominanija:bound.upominanija.map(ref=>({...ref,nachalo:ref.nachalo+7,konec:ref.konec+7}))},owner);
  assert.equal(r.status,200);assert.deepEqual(r.body.upominanija.map(ref=>ref.chelovek_id),[500002,500002,500001]);
  assert.equal(db.prepare("SELECT count(*) n FROM uvedomlenija WHERE tip='upomjanuli_v_kommentarii'").get().n,notificationsBeforeRename);
  for(const [text,refs] of [
    ['@MentionFixture_One forged',[{chelovek_id:500003,nachalo:0,konec:19}]],
    ['@ExternalFixture_Client',[{chelovek_id:500004,nachalo:0,konec:23}]],
    ['https://example.test/@MentionFixture_Two',[{chelovek_id:500003,nachalo:21,konec:40}]],
  ]){const before=counts();assert.equal((await api('POST','kommentarii',{zadacha_id:task.id,tekst:text,upominanija:refs},owner)).status,400);assert.deepEqual(counts(),before);}
  r=await api('POST','kommentarii',{zadacha_id:task.id,tekst:'@MentionFixture chosen explicitly',upominanija:[{chelovek_id:500003,nachalo:0,konec:15}]},owner);
  assert.equal(r.status,201);assert.equal(r.body.upominanija[0].chelovek_id,500003);
  const newest=await api('GET','kommentarii?zadacha_id='+task.id+'&sortirovka=id_desc&na_stranice=2',undefined,owner);
  assert.equal(newest.status,200);assert.equal(newest.body.spisok[0].id,r.body.id);assert.equal(newest.body.spisok.length,2);
  const older=await api('GET','kommentarii?zadacha_id='+task.id+'&sortirovka=id_desc&do_id='+newest.body.spisok[1].id,undefined,owner);
  assert.equal(older.status,200);assert.ok(older.body.spisok.every(row=>row.id<newest.body.spisok[1].id));
  const legacy=db.prepare("INSERT INTO kommentarii(zadacha_id,chelovek_id,tekst,sozdano) VALUES(?,500001,'@MentionFixture_Two legacy text','2001-01-01 00:00:00')").run(task.id);
  const oldNotify=db.prepare("SELECT count(*) n FROM uvedomlenija WHERE tip='upomjanuli_v_kommentarii'").get().n;
  r=await api('PATCH','kommentarii/'+legacy.lastInsertRowid,{versija:1,tekst:'Prefix @MentionFixture_Two legacy text suffix'},owner);
  assert.equal(r.status,200);assert.deepEqual(r.body.upominanija,[]);
  assert.equal(db.prepare("SELECT count(*) n FROM uvedomlenija WHERE tip='upomjanuli_v_kommentarii'").get().n,oldNotify);
  r=await api('PATCH','kommentarii/'+r.body.id,{versija:r.body.versija,tekst:'Prefix @MentionFixture_Two legacy text suffix @Renamed_fixture'},owner);
  assert.equal(r.status,200);assert.deepEqual(r.body.upominanija.map(ref=>ref.chelovek_id),[500002]);
  assert.equal(db.prepare("SELECT count(*) n FROM uvedomlenija WHERE tip='upomjanuli_v_kommentarii'").get().n,oldNotify+1);
  const again=await api('PATCH','kommentarii/'+r.body.id,{versija:r.body.versija,tekst:r.body.tekst+'!',upominanija:r.body.upominanija},owner);
  assert.equal(again.status,200);assert.equal(db.prepare("SELECT count(*) n FROM uvedomlenija WHERE tip='upomjanuli_v_kommentarii'").get().n,oldNotify+1);
                                                                                         
  db.exec("CREATE TRIGGER fixture_fail_mention BEFORE INSERT ON uvedomlenija WHEN NEW.tip='upomjanuli_v_kommentarii' BEGIN SELECT RAISE(ABORT,'fixture rejection'); END;");
  before=counts();assert.equal((await add('@MentionFixture_Two atomic failure')).status,500);assert.deepEqual(counts(),before);
  db.exec('DROP TRIGGER fixture_fail_mention');
  assert.equal((await api('POST','kommentarii',{zadacha_id:99999999,tekst:'Missing task'},owner)).status,404);
  db.prepare('UPDATE zadachi SET udaleno=1 WHERE id=?').run(task.id);
  before=counts();assert.equal((await add('Deleted task')).status,409);assert.deepEqual(counts(),before);
  assert.equal((await api('PATCH','kommentarii/'+comment.id,{tekst:'Deleted task edit'},owner)).status,409);
  assert.equal((await api('DELETE','kommentarii/'+comment.id,{versija:revisedVersion},owner)).status,200);
  assert.equal(db.prepare('SELECT 1 FROM kommentarii WHERE id=?').get(comment.id),undefined);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{
  db?.close();if(server&&server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}
  fs.rmSync(folder,{recursive:true,force:true});
 }
});
