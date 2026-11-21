const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
test('profiles allow optional self creation, share active questions and protect ownership and concurrent answers',async()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-profile-')),file=path.join(folder,'test.db');
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',NODE_ENV:'test'},password='only-a-profile-fixture';let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [500001,500002]){
   db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,pol) VALUES(?, ?,1,'polnyj','m')").run(id,'Profile fixture '+id);
   db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'profile-'+id,hash);
  }
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',data=>{stderr+=data;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup '+stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),headers:r.headers};};
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'profile-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const owner=await login(500001),other=await login(500002);
  let result=await api('POST','anketa',{},owner);assert.equal(result.status,200);assert.equal(result.body.chelovek_id,500001);
  assert.equal((await api('GET','ljudi/500001/anketa',undefined,other)).body.zapolneno,0);
  result=await api('POST','anketa',{missija:'One optional answer'},other);assert.equal(result.status,200);assert.equal(result.body.chelovek_id,500002);
  const schema=require('../public/js/anketa.js');assert.equal(schema.polja.length,15);
  db.prepare('UPDATE anketa SET kogda_v_seti=?,kak_obraschatsja=?,format_svjazi=? WHERE chelovek_id=500001').run('legacy time','legacy name','legacy format');
  let current=(await api('GET','anketa/500001',undefined,owner)).body;
  const answers=Object.fromEntries(schema.polja.map(([key],i)=>[key,'Answer '+i+' <b> & "literal"\nnext line']));
  result=await api('PATCH','anketa/500001',{versija:current.versija,...answers},owner);assert.equal(result.status,200);current=result.body;
  let read=(await api('GET','ljudi/500001/anketa',undefined,other)).body;
  assert.equal(read.vsego_polej,15);assert.equal(read.zapolneno,15);assert.deepEqual(read.bloki.map(row=>row.pole),schema.polja.map(([key])=>key));
  assert.ok(read.bloki[0].podpis.endsWith('полезен'));assert.equal(read.bloki.find(row=>row.pole==='kakaja_ja').podpis,'какой я');
  for(const block of read.bloki)assert.equal(block.znachenie,answers[block.pole]);
  assert.equal(current.kogda_v_seti,'legacy time');assert.ok(!read.bloki.some(row=>schema.legacy.includes(row.pole)));
  const before=JSON.stringify(db.prepare('SELECT * FROM anketa WHERE chelovek_id IN (500001,500002) ORDER BY chelovek_id').all());
  for(const [method,route,body,cookie] of [
   ['POST','anketa',{chelovek_id:500001,missija:'Foreign'},other],
   ['PATCH','anketa/500001',{versija:current.versija,missija:'Foreign'},other],
   ['PATCH','anketa/500001',{versija:current.versija,chelovek_id:500002},owner]]){
    assert.equal((await api(method,route,body,cookie)).status,403);
  }
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM anketa WHERE chelovek_id IN (500001,500002) ORDER BY chelovek_id').all()),before);
  result=await api('POST','anketa',{unknown_profile_field:'bad'},owner);assert.equal(result.status,400);assert.ok(result.body.oshibka.includes('unknown_profile_field'));
  result=await api('POST','anketa',{missija:'Second tab created a profile'},owner);assert.equal(result.status,409);assert.equal(result.body.tekuschee.missija,current.missija);
  const initialVersion=current.versija;
  result=await api('PATCH','anketa/500001',{versija:initialVersion,missija:'First window'},owner);assert.equal(result.status,200);
  result=await api('PATCH','anketa/500001',{versija:initialVersion,desert:'Other independent window'},owner);assert.equal(result.status,200);
  assert.equal(result.body.missija,'First window');assert.equal(result.body.desert,'Other independent window');
  result=await api('PATCH','anketa/500001',{versija:initialVersion,missija:'Stale overwrite'},owner);assert.equal(result.status,409);assert.equal(result.body.tekuschee.missija,'First window');
  current=(await api('GET','anketa/500001',undefined,owner)).body;
  const noOp=await api('POST','anketa',{},owner);assert.equal(noOp.status,200);assert.equal(noOp.body.versija,current.versija);
  result=await api('PATCH','anketa/500001',{versija:current.versija,chitaju:'   ',smotrju:null},owner);assert.equal(result.status,200);
  read=(await api('GET','ljudi/500001/anketa',undefined,other)).body;assert.equal(read.zapolneno,13);assert.ok(!read.bloki.some(row=>['chitaju','smotrju'].includes(row.pole)));
  const deletedVersion=(await api('GET','anketa/500001',undefined,owner)).body.versija;
  assert.equal((await api('DELETE','anketa/500001',{versija:deletedVersion},owner)).status,200);
  assert.equal(db.prepare('SELECT count(*) n FROM anketa WHERE chelovek_id=500001').get().n,0);
  result=await api('POST','anketa',{missija:'Fresh profile after deletion'},owner);assert.equal(result.status,200);assert.ok(result.body.versija>deletedVersion);
  for(const oldVersion of [1,deletedVersion])assert.equal((await api('PATCH','anketa/500001',{versija:oldVersion,missija:'Old deleted tab'},owner)).status,409);
  assert.equal((await api('GET','anketa/500001',undefined,owner)).body.missija,'Fresh profile after deletion');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{
  db?.close();if(server&&server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}
  fs.rmSync(folder,{recursive:true,force:true});
 }
});
