const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');

test('HTML identity comes from the authenticated session and stale page requests cannot read or write under another account',async()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-identity-')),file=path.join(folder,'test.db');
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:'500001',NODE_ENV:'test'},password='only-an-identity-fixture';let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [500001,500002]){
   db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'Identity fixture '+id);
   db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'identity-'+id,hash);
  }
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',d=>{stderr+=d;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const base='http://127.0.0.1:'+port;
  const request=(method,route,body,cookie,headers={})=>fetch(base+route,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
  const login=async id=>{const r=await request('POST','/api/vhod/parol',{login:'identity-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const first=await login(500001),second=await login(500002);
  const anonymous=await request('GET','/login');assert.equal(anonymous.status,200);const noSession=await anonymous.text();assert.ok(noSession.includes('Object.freeze({"chelovek_id":null,"error_log_owner":false})'));
  assert.equal((await request('GET','/kabinet.html')).status,302);
  for(const [cookie,id] of [[first,500001],[second,500002]]){
   for(const route of ['/kabinet.html','/poleznoe.html','/zadachi.html','/unknown-identity-fixture.html','/login']){
    const r=await request('GET',route,undefined,cookie,{'x-locus-chelovek':String(id===500001?500002:500001)}),html=await r.text();
    assert.equal(r.status,route.includes('unknown-')?404:200);assert.ok(r.headers.get('cache-control').includes('no-store'));
    assert.ok(html.includes('Object.freeze({"chelovek_id":'+id+',"error_log_owner":'+(id===500001)+'})'));assert.ok(!html.includes(cookie.split('=')[1]));
    const nonce=r.headers.get('content-security-policy').match(/nonce-([^']+)/)[1];
    assert.ok(html.includes('<script nonce="'+nonce+'">Object.defineProperty'));
   }
  }
  const count=()=>['zadachi','kontakty','zhurnal','uvedomlenija'].map(t=>db.prepare('SELECT count(*) n FROM '+t).get().n),before=count();
  for(const stale of ['500001','61','NaN']){
   const r=await request('POST','/api/zadachi',{nazvanie:'Must never be created',napravlenie:'synapt',otvetstvennyj:500001},second,{'x-locus-page-user':stale});
   assert.equal(r.status,409);assert.equal(r.headers.get('x-locus-session-changed'),'1');assert.equal((await r.json()).sessija_izmenilas,true);assert.deepEqual(count(),before);
   assert.equal((await request('GET','/api/nastrojki',undefined,second,{'x-locus-page-user':stale})).status,409);
  }
  const who=await request('GET','/api/vhod',undefined,second,{'x-locus-page-user':'500001'});assert.equal(who.status,200);assert.equal((await who.json()).chelovek.id,500002);
  const own=await request('GET','/api/nastrojki',undefined,second,{'x-locus-page-user':'500002'});assert.equal(own.status,200);assert.equal((await own.json()).chelovek_id,500002);
                                                                            
  assert.equal((await request('GET','/api/nastrojki',undefined,second)).status,200);
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}fs.rmSync(folder,{recursive:true,force:true});}
});
