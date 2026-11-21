const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');

test('contact creation and result confirmation preserve owner, type and uniqueness',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-contact-create-')),file=path.join(folder,'test.db');
 const first=700101,second=700102,password='contact-create-fixture-only',env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(first),NODE_ENV:'test'};let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [first,second]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'ContactCreate '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'contact-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>{stderr+=d;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup '+stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
  const signed=await api('POST','vhod/parol',{login:'contact-'+first,parol:password});assert.equal(signed.status,200);const cookie=signed.headers.get('set-cookie').split(';')[0];
  const create=(tip,znachenie,who=first)=>api('POST','kontakty',{chelovek_id:who,tip,znachenie},cookie);
  const check=(tip,value,who=first,auth=cookie)=>api('GET','kontakty/duplikaty?'+new URLSearchParams({podtverdit_chelovek_id:who,tip,znachenie:value}),undefined,auth);
  await t.test('concurrent equal POSTs create one contact with unchanged principal and order',async()=>{
   const responses=await Promise.all(Array.from({length:5},()=>create('pochta','Contact-Create@example.test')));
   assert.deepEqual(responses.map(x=>x.status).sort(),[201,409,409,409,409]);
   const good=responses.find(x=>x.status===201).body;assert.equal(good.osnovnoj,true);assert.equal(good.porjadok,1);assert.equal(good.versija,1);
   for(const r of responses.filter(x=>x.status===409)){assert.equal(r.body.pole,'znachenie');assert.ok(r.body.oshibka.includes('уже есть'));}
   const r=await check('pochta',' contact-create@EXAMPLE.test ');assert.equal(r.status,200);assert.equal(r.body.vsego,1);assert.equal(r.body.spisok[0].id,good.id);assert.equal(r.body.spisok[0].versija,1);
   assert.equal(db.prepare('SELECT count(*) n FROM kontakty WHERE chelovek_id=?').get(first).n,1);
  });
  await t.test('confirmation uses exactly the write normalization for international phones',async()=>{
   const r=await create('telefon','(916) 123-45-67');assert.equal(r.status,201);assert.equal(r.body.znachenie,'+79161234567');
   for(const value of ['9161234567','8 (916) 123-45-67','+7 916 123 45 67']){const found=await check('telefon',value);assert.equal(found.status,200);assert.equal(found.body.spisok[0].id,r.body.id);}
   assert.equal((await create('telefon','89161234567')).status,409);
  });
  await t.test('same value of another owner or type is never confirmation of the requested contact',async()=>{
   const foreign=await create('telegram','@only_foreign',second);assert.equal(foreign.status,201);
   assert.equal((await check('telegram','@only_foreign')).body.vsego,0);
   assert.equal((await create('sajt','@only_foreign')).status,201);
   assert.equal((await check('telegram','@only_foreign')).body.vsego,0);
   assert.equal((await check('telegram','@ONLY_FOREIGN',second)).body.spisok[0].id,foreign.body.id);
  });
  await t.test('confirmation requires authentication, strict scope and valid nonblank values',async()=>{
   assert.equal((await check('pochta','x@example.test',first,null)).status,401);
   for(const id of ['0','-1','1.5','1e3','9007199254740993'])assert.equal((await check('pochta','x@example.test',id)).status,400);
   assert.equal((await check('pochta','x@example.test',99999999)).status,404);
   for(const [tip,value,status] of [['wrong','x',400],['pochta','',422],['pochta','invalid',422],['telefon','invalid',422],['telegram','@',400]])assert.equal((await check(tip,value)).status,status);
   const extra=await api('GET','kontakty/duplikaty?podtverdit_chelovek_id='+first+'&tip=pochta&znachenie=x%40example.test&chelovek_id='+second,undefined,cookie);assert.equal(extra.status,400);
  });
  await t.test('database constraint covers direct writes and PATCH without rewriting the legacy blank row',async()=>{
   const legacy=Number(db.prepare("INSERT INTO kontakty(chelovek_id,tip,znachenie,znachenie_norm) VALUES(?,'telefon','legacy-no-number','')").run(first).lastInsertRowid);
   const before=db.prepare('SELECT * FROM kontakty WHERE id=?').get(legacy);
   const duplicate=(await check('pochta','contact-create@example.test')).body.spisok[0];
   assert.throws(()=>db.prepare('INSERT INTO kontakty(chelovek_id,tip,znachenie,znachenie_norm) VALUES(?,?,?,?)').run(first,'pochta','same',duplicate.znachenie_norm),/UNIQUE/);
   const another=await create('pochta','second-contact-create@example.test');assert.equal(another.status,201);
   const changed=await api('PATCH','kontakty/'+another.body.id,{versija:another.body.versija,znachenie:'CONTACT-CREATE@example.test'},cookie);assert.equal(changed.status,409);
   assert.equal(db.prepare('SELECT znachenie,versija FROM kontakty WHERE id=?').get(another.body.id).znachenie,another.body.znachenie);
   assert.deepEqual(db.prepare('SELECT * FROM kontakty WHERE id=?').get(legacy),before);
   assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  });
 }finally{if(server){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}if(db)db.close();fs.rmSync(folder,{recursive:true,force:true});}
});

test('contact uniqueness upgrade refuses old duplicates without deleting or choosing a record',()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-contact-upgrade-')),file=path.join(folder,'test.db'),env={...process.env,LOCUS_BAZA:file};let db;
 try{
  const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});migrate();db=new DatabaseSync(file);
  db.exec('DROP INDEX idx_kontakty_chelovek_tip_norm; DELETE FROM migracii WHERE nomer=110');
  db.prepare("INSERT INTO ljudi(id,imja) VALUES(700199,'Old duplicate fixture')").run();
  const insert=db.prepare("INSERT INTO kontakty(chelovek_id,tip,znachenie,znachenie_norm) VALUES(700199,'pochta',?,'old-duplicate@example.test')");insert.run('old-duplicate@example.test');insert.run('OLD-DUPLICATE@example.test');
  const before=db.prepare('SELECT * FROM kontakty ORDER BY id').all(),catalog=db.prepare('SELECT * FROM migracii ORDER BY nomer').all();assert.throws(migrate,/110-kontakty-bez-povtora.sql отменена/);
  assert.deepEqual(db.prepare('SELECT * FROM kontakty ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT * FROM migracii ORDER BY nomer').all(),catalog);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='idx_kontakty_chelovek_tip_norm'").get().n,0);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
