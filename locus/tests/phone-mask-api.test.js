const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
test('phone masks use canonical storage, coherent confirmation and atomic writes through authenticated HTTP',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-phone-mask-')),file=path.join(folder,'test.db'),actor=830001,password='phone-mask-fixture-only',env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test'};let db,server,serial=0;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,'Phone mask actor',1,'polnyj')").run(actor);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(actor,'phone-mask',hash);
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>stderr+=d);const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json(),headers:r.headers};};const login=await api('POST','vhod/parol',{login:'phone-mask',parol:password});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const owner=()=>{const id=840000+(++serial);db.prepare('INSERT INTO ljudi(id,imja) VALUES(?,?)').run(id,'Phone mask owner '+id);return id;};
  const create=(id,value,extra={})=>api('POST','kontakty',{chelovek_id:id,tip:'telefon',znachenie:value,force:true,...extra},cookie);
  const state=()=>JSON.stringify(['kontakty','zhurnal','versii_polej'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
  await t.test('national input with a selected country is stored internationally and returned with a derived mask',async()=>{
   for(const [strana,value,canonical,display] of [['ru','9161234567','+79161234567','+7 (916) 123-45-67'],['us','5551234567','+15551234567','+1 (555) 123-4567'],['de','15112345678','+4915112345678','+49 151 12345678']]){
    const id=owner(),q=new URLSearchParams({podtverdit_chelovek_id:String(id),tip:'telefon',znachenie:value,strana}),check=await api('GET','kontakty/duplikaty?'+q,undefined,cookie);assert.equal(check.status,200);assert.equal(check.body.znachenie,canonical);const r=await create(id,value,{strana});assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.znachenie,canonical);assert.equal(r.body.pokaz,display);assert.equal(db.prepare('SELECT znachenie FROM kontakty WHERE id=?').get(r.body.id).znachenie,canonical);const confirm=await api('GET','kontakty/duplikaty?'+q,undefined,cookie);assert.equal(confirm.body.spisok[0].id,r.body.id);assert.equal(confirm.body.znachenie_norm,r.body.znachenie_norm);
   }
   assert.equal(db.prepare("SELECT count(*) n FROM pragma_table_info('kontakty') WHERE name IN ('strana','bez_maski')").get().n,0);
  });
  await t.test('maskless input still has canonical storage and its read confirmation finds the same row',async()=>{
   const id=owner(),raw='00 11 22 (33) 44',r=await create(id,raw,{bez_maski:true});assert.equal(r.status,201);assert.equal(r.body.znachenie,'+0011223344');assert.equal(r.body.pokaz,r.body.znachenie);const q=new URLSearchParams({podtverdit_chelovek_id:String(id),tip:'telefon',znachenie:raw,bez_maski:'true'}),check=await api('GET','kontakty/duplikaty?'+q,undefined,cookie);assert.equal(check.status,200);assert.equal(check.body.spisok[0].id,r.body.id);const before=state(),again=await create(id,'0011223344',{strana:null});assert.equal(again.status,409);assert.equal(state(),before);
  });
  await t.test('explicit international prefixes survive both storage and duplicate comparison',async()=>{
   for(const value of ['+4912345678','+81234567890']){const r=await create(owner(),value);assert.equal(r.status,201);assert.equal(r.body.znachenie,value);assert.equal(r.body.znachenie_norm,value.slice(1));}
  });
  await t.test('invalid selection, mask length, or phone-only fields reject before all business writes',async()=>{
   const id=owner();for(const body of [{znachenie:'+7'},{znachenie:'+49'},{strana:'de',znachenie:'+79161234567'},{strana:'de',znachenie:'+4912345678'},{strana:'unknown',znachenie:'+79161234567'},{bez_maski:'true',znachenie:'0011223344'}]){const before=state(),r=await create(id,body.znachenie,body);assert.equal(r.status,422,JSON.stringify(r.body));assert.equal(state(),before);}
   const before=state();assert.equal((await api('POST','kontakty',{chelovek_id:id,tip:'pochta',znachenie:'mask@example.test',strana:'de'},cookie)).status,400);assert.equal(state(),before);
   const row=(await create(id,'+79161234567')).body,stable=state();assert.equal((await api('PATCH','kontakty/'+row.id,{versija:row.versija,osnovnoj:true,osnovnoj_kontekst:row.osnovnoj_kontekst,strana:'unknown'},cookie)).status,400);assert.equal(state(),stable);
  });
  await t.test('formatted PATCH and selected-country validation preserve the normal row version contract',async()=>{
   const id=owner(),row=(await create(id,'+79161234567')).body,r=await api('PATCH','kontakty/'+row.id,{versija:row.versija,znachenie:'15112345678',strana:'de',force:true},cookie);assert.equal(r.status,200);assert.equal(r.body.znachenie,'+4915112345678');assert.equal(r.body.pokaz,'+49 151 12345678');assert.equal(r.body.versija,row.versija+1);const before=state();assert.equal((await api('PATCH','kontakty/'+row.id,{versija:r.body.versija,znachenie:'+49 1234',strana:'de'},cookie)).status,422);assert.equal(state(),before);
  });
  await t.test('parser and phone data never bypass authentication',async()=>{
   assert.equal((await api('POST','kontakty/razbor',{raw:'+49 151 12345678'})).status,401);assert.equal((await api('GET','kontakty/duplikaty?podtverdit_chelovek_id='+owner()+'&tip=telefon&znachenie=%2B79161234567')).status,401);
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{if(server){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
