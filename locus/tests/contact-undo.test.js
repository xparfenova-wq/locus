const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');

test('contact undo uses the original author-bound snapshot and survives an unacknowledged restore',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-contact-undo-')),file=path.join(folder,'test.db'),hook=path.join(folder,'drop-ack');
 const first=740001,second=740002,password='contact-undo-fixture',env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(first),NODE_ENV:'test'};let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [first,second]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'ContactUndo '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'undo-'+id,hash);}
  const child=`const fs=require('node:fs'),http=require('node:http'),original=http.ServerResponse.prototype.end;http.ServerResponse.prototype.end=function(...args){if(this.req.url==='/api/kontakty/otmena'&&fs.existsSync(${JSON.stringify(hook)})){fs.unlinkSync(${JSON.stringify(hook)});this.destroy();return this;}return original.apply(this,args);};require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)});`;
  let port;
  const start=async()=>{
   server=spawn(process.execPath,['-e',child],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>{stderr+=d;});port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  };await start();
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json(),headers:r.headers};};
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'undo-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};const cookie=await login(first),foreign=await login(second);
  const create=async value=>{const r=await api('POST','kontakty',{chelovek_id:first,tip:'telefon',znachenie:value},cookie);assert.equal(r.status,201);return r.body;};
  const remove=async row=>{const r=await api('DELETE','kontakty/'+row.id,{versija:row.versija},cookie);assert.equal(r.status,200);assert.equal(r.body.deleted,true);assert.match(r.body.token_otmeny,/^[a-f0-9]{64}$/);return r.body.token_otmeny;};
  const undo=(token,auth=cookie)=>api('POST','kontakty/otmena',{token_otmeny:token},auth);
  const snapshot=()=>JSON.stringify(['kontakty','zhurnal','versii_polej'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));
  await t.test('same id, raw value and order return with one principal and a fresh version; token cannot forge a snapshot',async()=>{
   const original=await create('+79997400001'),next=await create('+79997400002'),token=await remove(original);assert.equal(db.prepare('SELECT osnovnoj FROM kontakty WHERE id=?').get(next.id).osnovnoj,1);
   const missing=await api('DELETE','kontakty/'+original.id,{versija:original.versija},cookie);assert.equal(missing.status,404);assert.equal(missing.body.kod,'kontakt_ne_najden');const before=snapshot();
   assert.equal((await undo(token,foreign)).status,404);assert.equal((await api('POST','kontakty/otmena',{token_otmeny:token,stroka:original},cookie)).status,400);assert.equal((await api('POST','kontakty/otmena',{stroka:original},cookie)).status,400);assert.equal(snapshot(),before);
   const result=await undo(token);assert.equal(result.status,200);for(const key of ['id','chelovek_id','tip','znachenie','porjadok','znachenie_norm'])assert.equal(result.body[key],original[key]);assert.equal(result.body.versija,original.versija+1);assert.equal(db.prepare("SELECT count(*) n FROM kontakty WHERE chelovek_id=? AND tip='telefon' AND osnovnoj=1").get(first).n,1);assert.equal(db.prepare('SELECT osnovnoj FROM kontakty WHERE id=?').get(next.id).osnovnoj,0);
   const restored=snapshot();assert.equal((await undo(token)).status,200);assert.equal(snapshot(),restored);assert.equal((await api('PATCH','kontakty/'+original.id,{versija:original.versija,znachenie:'+79997409999'},cookie)).status,409);
   const newToken=await remove(result.body);assert.equal((await undo(token)).status,409);assert.equal((await undo(newToken)).status,200);
  });
  await t.test('hashed receipt and authenticated session survive an actual server process restart',async()=>{
   const row=await create('+79997400123'),token=await remove(row),stored=db.prepare('SELECT token_hesh FROM otmeny_kontaktov WHERE slepok LIKE ?').get('%'+row.znachenie+'%');assert.ok(stored);assert.notEqual(stored.token_hesh,token);
   const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;server=null;await start();const restored=await undo(token);assert.equal(restored.status,200);assert.equal(restored.body.id,row.id);assert.equal((await api('GET','otmeny_kontaktov',undefined,cookie)).status,404);
  });
  await t.test('a lost 200 acknowledgement can be checked with the same token without a new row or journal event',async()=>{
   const row=await create('+79997400003'),token=await remove(row);fs.writeFileSync(hook,'fixture-only');await assert.rejects(()=>undo(token));assert.ok(db.prepare('SELECT 1 FROM kontakty WHERE id=?').get(row.id));const committed=snapshot();const retry=await undo(token);assert.equal(retry.status,200);assert.equal(retry.body.id,row.id);assert.equal(snapshot(),committed);
  });
  await t.test('failed restore journal rolls back the contact and principal changes, retaining a usable token',async()=>{
   const current=db.prepare('SELECT * FROM kontakty WHERE chelovek_id=? AND osnovnoj=1').get(first),token=await remove(current),before=snapshot();db.exec("CREATE TRIGGER fail_contact_restore BEFORE INSERT ON zhurnal WHEN NEW.obekt='kontakt' AND NEW.pole='udaleno' AND NEW.stalo='нет' BEGIN SELECT RAISE(ABORT,'fixture restore journal failure'); END");
   try{assert.equal((await undo(token)).status,500);assert.equal(snapshot(),before);}finally{db.exec('DROP TRIGGER fail_contact_restore');}assert.equal((await undo(token)).status,200);
  });
  await t.test('a later edit or a recreated contact is never overwritten by old undo',async()=>{
   const row=await create('+79997400004'),token=await remove(row),restored=await undo(token);assert.equal(restored.status,200);assert.equal((await api('PATCH','kontakty/'+row.id,{versija:restored.body.versija,znachenie:'+79997400005'},cookie)).status,200);const before=snapshot();assert.equal((await undo(token)).status,409);assert.equal(snapshot(),before);
   const another=await create('+79997400006'),anotherToken=await remove(another);await create(another.znachenie);const state=snapshot();assert.equal((await undo(anotherToken)).status,409);assert.equal(snapshot(),state);
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{if(server){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});

test('undo snapshot expires after thirty seconds without accepting a client-supplied record',()=>{
 const {sozdatHranilische}=require('../api/otmena-kontakta.js');let time=1000;const store=sozdatHranilische(()=>time),db=new DatabaseSync(':memory:');
 try{db.exec("CREATE TABLE kontakty(id INTEGER,chelovek_id INTEGER,tip TEXT,osnovnoj INTEGER);CREATE TABLE zhurnal(id INTEGER PRIMARY KEY,obekt TEXT,obekt_id INTEGER,pole TEXT,stalo TEXT);INSERT INTO zhurnal VALUES(1,'kontakt',1,'udaleno','да')");db.exec("CREATE TABLE ljudi(id INTEGER PRIMARY KEY);INSERT INTO ljudi VALUES(1)");db.exec(fs.readFileSync(path.resolve(__dirname,'../db/migracii/112-otmeny-kontaktov.sql'),'utf8'));db.exec(fs.readFileSync(path.resolve(__dirname,'../db/migracii/113-proverka-udalenija-kontakta.sql'),'utf8'));const token=store.zapomnit(db,{id:1,chelovek_id:1,tip:'telefon',osnovnoj:0},1);time+=30001;assert.throws(()=>store.vernut(db,{token_otmeny:token},1),/Окно отмены прошло/);assert.equal(db.prepare('SELECT count(*) n FROM kontakty').get().n,0);}finally{db.close();}
});
