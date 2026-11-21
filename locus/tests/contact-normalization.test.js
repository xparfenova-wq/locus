const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
const {norma_kontakta}=require('../api/normalizacija-kontakta.js');

test('contact aliases, cross-owner warnings and explicit force share one comparison key',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-contact-norm-')),file=path.join(folder,'test.db');
 const first=710001,second=710002,password='contact-normalization-fixture',env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(first),NODE_ENV:'test'};let db,server;
 try{
  const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});migrate();db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [first,second]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'ContactNorm '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'norm-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>{stderr+=d;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup '+stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
  const signed=await api('POST','vhod/parol',{login:'norm-'+first,parol:password});assert.equal(signed.status,200);const cookie=signed.headers.get('set-cookie').split(';')[0];
  const create=(tip,znachenie,owner=first,extra={})=>api('POST','kontakty',{chelovek_id:owner,tip,znachenie,...extra},cookie);
  const query=(data,auth=cookie)=>api('GET','kontakty/duplikaty?'+new URLSearchParams(data),undefined,auth);
  const snapshot=()=>JSON.stringify(['ljudi','kontakty','zhurnal','versii_polej','sotrudnichestva'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));
  await t.test('Telegram public links and email case match their literal handles without rewriting input',async()=>{
   const email=await create('pochta',' Ivan@Mail.RU ');assert.equal(email.status,201);assert.equal(email.body.znachenie_norm,'ivan@mail.ru');
   const original=await create('telegram','@Nick');assert.equal(original.status,201);assert.equal(original.body.znachenie_norm,'nick');
   for(const value of ['t.me/nick','https://t.me/NICK','http://t.me/Nick/','https://t.me/Nick?start=fixture#anchor']){
    assert.equal(norma_kontakta(value,'telegram'),'nick');const r=await query({tip:'telegram',znachenie:value});assert.equal(r.status,200);assert.equal(r.body.spisok[0].id,original.body.id);
    const duplicate=await create('telegram',value,second);assert.equal(duplicate.status,409);assert.equal(duplicate.body.dubl_chego,first);
   }
   assert.equal(norma_kontakta('https://t.me/+PrivateInvite','telegram'),'https://t.me/+privateinvite');
   assert.equal((await query({tip:'pochta',znachenie:'ivan@mail.ru'})).body.spisok[0].id,email.body.id);
  });
  await t.test('cross-owner creation requires explicit boolean force; same-owner constraint remains active',async()=>{
   const phone=await create('telefon','+7 (999) 712-34-56');assert.equal(phone.status,201);
   const before=snapshot(),blocked=await create('telefon','8 (999) 712-34-56',second);assert.equal(blocked.status,409);assert.equal(blocked.body.dubl_chego,first);assert.equal(blocked.body.dubli[0].chelovek_id,first);assert.equal(snapshot(),before);
   for(const force of ['true',1,null,{}]){assert.equal((await create('telefon','89997123456',second,{force})).status,400);assert.equal(snapshot(),before);}
   const forced=await create('telefon','89997123456',second,{force:true});assert.equal(forced.status,201);assert.equal(forced.body.znachenie_norm,phone.body.znachenie_norm);assert.equal((await create('telefon','89997123456',second,{force:true})).status,409);
   const reordered=await api('PATCH','kontakty/'+forced.body.id,{versija:forced.body.versija,porjadok:55},cookie);assert.equal(reordered.status,200);
   const own=await query({tip:'telefon',znachenie:'9997123456',chelovek_id:second});assert.equal(own.status,200);assert.deepEqual(own.body.vladelcy,[first]);assert.equal(own.body.spisok[0].id,phone.body.id);
  });
  await t.test('PATCH enforces duplicate intent atomically and force never bypasses a same-owner collision',async()=>{
   const row=await create('telegram','@OtherPatch',second);assert.equal(row.status,201);const before=snapshot();
   const body={versija:row.body.versija,znachenie:'t.me/Nick'};assert.equal((await api('PATCH','kontakty/'+row.body.id,body,cookie)).status,409);assert.equal(snapshot(),before);
   assert.equal((await api('PATCH','kontakty/'+row.body.id,{...body,force:true},cookie)).status,200);
   const fresh=db.prepare('SELECT * FROM kontakty WHERE id=?').get(row.body.id),state=snapshot();assert.equal((await api('PATCH','kontakty/'+row.body.id,{versija:fresh.versija,chelovek_id:first,force:true},cookie)).status,409);assert.equal(snapshot(),state);
  });
  await t.test('new people cannot bypass the duplicate stop through nested contacts or force',async()=>{
   const before=snapshot();const result=await api('POST','ljudi',{imja:'Must roll back duplicate new person',kontakty:[{tip:'telegram',znachenie:'https://t.me/Nick'}]},cookie);assert.equal(result.status,409);assert.equal(snapshot(),before);
   const forced=await api('POST','ljudi',{imja:'Nested force is forbidden',kontakty:[{tip:'telegram',znachenie:'@Nick',force:true}]},cookie);assert.equal(forced.status,400);assert.equal(snapshot(),before);
  });
  await t.test('duplicate reads remain authenticated, typed, owner-excluding and read-only',async()=>{
   const before=snapshot();assert.equal((await query({tip:'telegram',znachenie:'@Nick'},null)).status,401);assert.equal((await query({tip:'invalid',znachenie:'@Nick'})).status,400);
   assert.equal((await create('sajt','@Nick')).status,201);const found=await query({tip:'telegram',znachenie:'@Nick'});assert.ok(found.body.spisok.length===2&&found.body.spisok.every(row=>row.tip==='telegram'));
   const stable=snapshot();const report=await query({});assert.equal(report.status,200);const actual=db.prepare("SELECT znachenie_norm,count(DISTINCT chelovek_id) n FROM kontakty WHERE znachenie_norm IS NOT NULL AND znachenie_norm<>'' GROUP BY znachenie_norm HAVING n>1").all();assert.equal(report.body.vsego,actual.length);assert.equal(snapshot(),stable);assert.notEqual(snapshot(),before);
  });
  await t.test('migration repairs only derived ASCII keys with parser parity and unchanged versions',async()=>{
   const values=['@NormLegacy','t.me/NormLegacy','https://t.me/NormLegacy/','http://t.me/NormLegacy?start=1#anchor','https://t.me/Nick/123','https://t.me/+Invite',' @Mixed_Case ','https://t.me/','https://t.me/name//'];const ids=[];
   for(const [i,value] of values.entries()){const owner=720000+i;db.prepare('INSERT INTO ljudi(id,imja) VALUES(?,?)').run(owner,'Legacy '+i);ids.push(Number(db.prepare("INSERT INTO kontakty(chelovek_id,tip,znachenie,znachenie_norm,versija) VALUES(?,'telegram',?,?,7)").run(owner,value,'old-legacy-'+i).lastInsertRowid));}
   const old=db.prepare('SELECT * FROM kontakty ORDER BY id').all(),meta=db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all();db.exec('DELETE FROM migracii WHERE nomer=111');migrate();
   for(const [i,id] of ids.entries()){const row=db.prepare('SELECT * FROM kontakty WHERE id=?').get(id);assert.equal(row.znachenie_norm,norma_kontakta(values[i],'telegram'));const original=old.find(x=>x.id===id);assert.deepEqual({...row,znachenie_norm:original.znachenie_norm},{...original});}
   assert.deepEqual(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all(),meta);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  });
 }finally{if(server){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});

test('normalization upgrade refuses a same-owner alias collision without merging records',()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-norm-collision-')),file=path.join(folder,'test.db'),env={...process.env,LOCUS_BAZA:file};let db;
 try{
  const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});migrate();db=new DatabaseSync(file);db.exec('DELETE FROM migracii WHERE nomer=111');db.prepare("INSERT INTO ljudi(id,imja) VALUES(730001,'Alias collision fixture')").run();
  const insert=db.prepare("INSERT INTO kontakty(chelovek_id,tip,znachenie,znachenie_norm) VALUES(730001,'telegram',?,?)");insert.run('@Alias_Collision','@alias_collision');insert.run('t.me/Alias_Collision','t.me/alias_collision');
  const before=db.prepare('SELECT * FROM kontakty ORDER BY id').all(),metadata=db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all(),catalog=db.prepare('SELECT * FROM migracii ORDER BY nomer').all();assert.throws(migrate,/111-normalizacija-telegram.sql отменена/);
  assert.deepEqual(db.prepare('SELECT * FROM kontakty ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all(),metadata);assert.deepEqual(db.prepare('SELECT * FROM migracii ORDER BY nomer').all(),catalog);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
