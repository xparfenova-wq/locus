const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync,createHash}=require('node:crypto');
test('contact boundary errors preserve data and expose the documented codes',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-contact-validation-')),file=path.join(folder,'test.db'),first=740001,second=740002,password='contact-validation-fixture';
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(first),NODE_ENV:'test'};let db,server,personNumber=741000,serial=0;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [first,second]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'Validation actor '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'validation-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-4000));const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup: '+stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('fixture exited '+code+' '+stderr));});server.stdout.once('data',data=>{clearTimeout(timer);resolve(String(data).trim());});});
  const api=async(method,route,body,cookie)=>{const response=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:await response.json(),headers:response.headers};};
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'validation-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];},a=await login(first),b=await login(second);
  const owner=()=>{const id=++personNumber;db.prepare('INSERT INTO ljudi(id,imja) VALUES(?,?)').run(id,'Validation owner '+id);return id;};
  const create=async(id,tip='telefon',extra={})=>{const znachenie=tip==='telefon'?'+79918'+String(++serial).padStart(6,'0'):'validation-'+(++serial)+'@example.test',r=await api('POST','kontakty',{chelovek_id:id,tip,znachenie,...extra},a);assert.equal(r.status,201,JSON.stringify(r.body));return r.body;};
  const get=async id=>(await api('GET','kontakty/'+id,undefined,a)).body;
  const state=()=>createHash('sha256').update(JSON.stringify(['kontakty','zhurnal','versii_polej','otmeny_kontaktov'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()))).digest('hex');
  await t.test('missing, null, empty and whitespace contacts return 422 without a row or field history',async()=>{
   const id=owner();for(const tip of ['telefon','pochta'])for(const value of [undefined,null,'',' \t '])for(const nested of [false,true]){const body={chelovek_id:id,tip,...(value===undefined?{}:{znachenie:value})},before=state(),r=await api('POST',nested?'ljudi/'+id+'/kontakty':'kontakty',body,a);assert.equal(r.status,422);assert.equal(r.body.kod,'pustoe_znachenie_kontakta');assert.equal(r.body.pole,'znachenie');assert.equal(state(),before);}
  });
  await t.test('invalid phone characters and email are rejected with no partial data',async()=>{
   const id=owner();for(const [tip,znachenie,code] of [['telefon','+7 916 ABC-45-67','invalid_phone_chars'],['telefon','7+9161234567','invalid_phone_chars'],['pochta','sokolov.mail.ru','invalid_email']]){const before=state(),r=await api('POST','kontakty',{chelovek_id:id,tip,znachenie},a);assert.equal(r.status,422);assert.equal(r.body.kod,code);assert.equal(r.body.pole,'znachenie');assert.equal(state(),before);}assert.equal((await create(id,'pochta')).tip,'pochta');
  });
  await t.test('own formatted duplicates include the existing ID and cannot be forced or patched over',async()=>{
   const id=owner(),old=await create(id),other=await create(id),formatted=old.znachenie.replace(/^(\+\d)(\d{3})(\d{3})(\d{2})(\d{2})$/,'$1 ($2) $3-$4-$5');
   for(const force of [undefined,true]){const before=state(),r=await api('POST','kontakty',{chelovek_id:id,tip:'telefon',znachenie:formatted,...(force===undefined?{}:{force})},a);assert.equal(r.status,409);assert.equal(r.body.kod,'dubl_kontakta');assert.equal(r.body.id,old.id);assert.equal(r.body.pole,'znachenie');assert.equal(state(),before);}
   const before=state(),r=await api('PATCH','kontakty/'+other.id,{versija:other.versija,znachenie:formatted},a);assert.equal(r.status,409);assert.equal(r.body.kod,'dubl_kontakta');assert.equal(r.body.id,old.id);assert.equal(state(),before);assert.equal(db.prepare('SELECT count(*) n FROM kontakty WHERE chelovek_id=?').get(id).n,2);
  });
  await t.test('the duplicate preview separates the owner from other owners without weakening their warning',async()=>{
   const id=owner(),old=await create(id),peer=owner(),denied=await api('POST','kontakty',{chelovek_id:peer,tip:'telefon',znachenie:old.znachenie},a);assert.equal(denied.status,409);assert.equal(denied.body.dubli[0].chelovek_id,id);await create(peer,'telefon',{znachenie:old.znachenie,force:true});
   const r=await api('GET','kontakty/duplikaty?tip=telefon&znachenie='+encodeURIComponent(old.znachenie)+'&chelovek_id='+id,undefined,a);assert.equal(r.status,200);assert.deepEqual(r.body.svoi.map(x=>x.id),[old.id]);assert.equal(r.body.vsego,1);assert.equal(r.body.spisok[0].chelovek_id,peer);
  });
  await t.test('parallel selections, including reaffirming the old primary, return one documented conflict',async()=>{
   for(const pair of [[1,2],[0,1],[1,0]]){const id=owner(),records=[await create(id),await create(id),await create(id)],seen=await Promise.all(pair.map(i=>get(records[i].id))),mark=(row,cookie)=>api('PATCH','kontakty/'+row.id,{versija:row.versija,osnovnoj:true,osnovnoj_kontekst:row.osnovnoj_kontekst},cookie),replies=await Promise.all([mark(seen[0],a),mark(seen[1],b)]);assert.deepEqual(replies.map(x=>x.status).sort(),[200,409]);const conflict=replies.find(x=>x.status===409);assert.equal(conflict.body.kod,'primary_conflict');assert.equal(conflict.body.primary_group_changed,true);assert.equal(db.prepare("SELECT count(*) n FROM kontakty WHERE chelovek_id=? AND tip='telefon' AND osnovnoj=1").get(id).n,1);}
  });
  await t.test('an explicit empty PATCH is rejected and does not silently delete a contact',async()=>{
   const id=owner(),row=await create(id),before=state(),r=await api('PATCH','kontakty/'+row.id,{versija:row.versija,znachenie:''},a);assert.equal(r.status,422);assert.equal(r.body.kod,'pustoe_znachenie_kontakta');assert.equal(state(),before);assert.equal((await get(row.id)).znachenie,row.znachenie);
  });
 }finally{if(server&&server.exitCode===null){const ended=new Promise(resolve=>server.once('exit',resolve));server.kill();await ended;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
