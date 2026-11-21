const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{execFileSync,spawn}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto'),http=require('node:http');
test('deadline morning is service-only, Moscow-based, durable across retries, changes, cleanup and restart',async()=>{
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'locus-deadline-job-')),file=path.join(dir,'fixture.db'),clock=path.join(dir,'clock.json');
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',NODE_ENV:'test',LOCUS_SERVICE_KEY:'only-deadline-fixture-key-'.repeat(3),FIXTURE_CLOCK:clock};
 const at=value=>fs.writeFileSync(clock,JSON.stringify(Date.parse(value)));let db,server,proxy,base;
 const start=async()=>{
  const code=`const fs=require('node:fs'),RealDate=Date,now=()=>JSON.parse(fs.readFileSync(process.env.FIXTURE_CLOCK,'utf8'));global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now()]));}static now(){return now();}};require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)});`;
  server=spawn(process.execPath,['-e',code],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>stderr+=d);
  const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',c=>{clearTimeout(t);reject(new Error('server '+c+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(t);resolve(String(d).trim());});});base='http://127.0.0.1:'+port;
 };
 const stop=async()=>{if(server&&server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}};
 const headers={'x-locus-service-key':env.LOCUS_SERVICE_KEY,'x-locus-chelovek':'500001'};
 const api=async(method,route,body,h={})=>{const r=await fetch(base+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...h},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await r.text();return{status:r.status,body:raw?JSON.parse(raw):null,headers:r.headers};};
 const job=body=>api('POST','uvedomlenija/po_srokam',body??{},headers);
 try{
  at('2026-11-13T21:30:00Z');execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  for(const [id,team,archived]of [[500001,1,0],[500002,1,0],[500003,1,0],[500004,0,0],[500005,1,1]])db.prepare("INSERT INTO ljudi(id,imja,komanda,arhiv,dostup) VALUES(?,?,?,?, 'polnyj')").run(id,'Deadline fixture '+id,team,archived);
  const salt=randomBytes(16).toString('hex'),password='deadline-only-fixture';db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(500001,?,?)').run('deadline-fixture',salt+':'+scryptSync(password,salt,64).toString('hex'));
                                                                               
                                                                              
  let number=50000;const fixtureInsert=db.prepare(`INSERT INTO zadachi(nomer,nazvanie,napravlenie,otvetstvennyj,srok,status,udaleno,povtorjaetsja) VALUES(?,?,'synapt',?,?,?,?,?)`);const create=(name,person,date,changes={})=>Number(fixtureInsert.run(++number,name,person,date,changes.status||'v_plane',changes.deleted||0,changes.repeat||0).lastInsertRowid);
  const due=create('Due fixture',500002,'2026-11-14'),old=create('Old overdue fixture',500002,'2026-11-12');
  create('External fixture',500004,'2026-11-14');create('Archived fixture',500005,'2026-11-14');create('Future fixture',500002,'2026-11-15');
  create('Closed fixture',500002,'2026-11-14',{status:'sdelano'});create('Someday fixture',500002,'2026-11-14',{status:'kogda_nibud'});create('Deleted fixture',500002,'2026-11-14',{deleted:1});create('Repeating fixture',500002,null,{repeat:1});
  const counts=()=>['uvedomlenija','povody_uvedomlenij','zhurnal'].map(t=>db.prepare('SELECT count(*) n FROM '+t).get().n);
  await start();const login=await api('POST','vhod/parol',{login:'deadline-fixture',parol:password});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('POST','uvedomlenija/po_srokam',{})).status,401);
  for(const body of [{},{sluzhebnyj:true}])assert.equal((await api('POST','uvedomlenija/po_srokam',body,{cookie})).status,403);
  assert.equal((await api('POST','uvedomlenija/po_srokam',{}, {'x-locus-chelovek':'500001','x-locus-service-key':'wrong-key'})).status,401);
  assert.equal((await job({den:'2000-01-01'})).status,400);assert.equal((await api('POST','uvedomlenija/po_srokam?den=2000-01-01',{},headers)).status,400);
  assert.equal((await api('POST','uvedomlenija/po_srokam',[],headers)).status,400);
  assert.equal((await api('GET','ljudi',undefined,headers)).status,401);
  const midnight=await job();assert.equal(midnight.status,200);assert.equal(midnight.body.den,'2026-11-14');assert.ok(midnight.body.otlozheno_do);assert.deepEqual(counts(),[0,0,0]);
  at('2026-11-14T05:59:59Z');assert.ok((await job()).body.otlozheno_do);assert.deepEqual(counts(),[0,0,0]);
  at('2026-11-14T06:00:00Z');const first=await job();assert.equal(first.status,200);assert.deepEqual(first.body,{den:'2026-11-14',istekaet_segodnja:1,prosrocheno:1,ubrano_prochitannyh:0});assert.deepEqual(counts(),[2,2,0]);
  const notices=db.prepare('SELECT * FROM uvedomlenija ORDER BY id').all();assert.equal(notices[0].chelovek_id,500002);assert.equal(notices[0].prochitano,0);assert.equal(notices[0].sozdano,'2026-11-14 06:00:00');
  for(const result of await Promise.all(Array.from({length:6},()=>job()))){assert.equal(result.status,200);assert.equal(result.body.istekaet_segodnja+result.body.prosrocheno,0);}assert.deepEqual(counts(),[2,2,0]);
  db.prepare('UPDATE zadachi SET otvetstvennyj=500003 WHERE id=?').run(due);assert.equal((await job()).body.istekaet_segodnja,1);assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE zadacha_id=? AND chelovek_id=500003').get(due).n,1);
  db.prepare('UPDATE zadachi SET otvetstvennyj=500002 WHERE id=?').run(due);assert.equal((await job()).body.istekaet_segodnja,0);
  db.prepare("UPDATE zadachi SET srok='2026-11-13' WHERE id=?").run(due);assert.equal((await job()).body.prosrocheno,1);assert.equal((await job()).body.prosrocheno,0);
  const workerOwn=create('Automatic reminder to worker owner',500001,'2026-11-14');assert.equal((await job()).body.istekaet_segodnja,1);assert.equal(db.prepare('SELECT chelovek_id FROM uvedomlenija WHERE zadacha_id=?').get(workerOwn).chelovek_id,500001);
                                                                                       
  create('Earlier atomic fixture',500002,'2026-11-14');const bad=create('Failing atomic fixture',500002,'2026-11-14');
  db.exec(`CREATE TRIGGER fixture_deadline_failure BEFORE INSERT ON uvedomlenija WHEN NEW.zadacha_id=${bad} BEGIN SELECT RAISE(ABORT,'deadline notification fixture failure'); END;`);const saved=counts();
  assert.equal((await job()).status,500);assert.deepEqual(counts(),saved);db.exec('DROP TRIGGER fixture_deadline_failure');assert.equal((await job()).body.istekaet_segodnja,2);assert.equal((await job()).body.istekaet_segodnja,0);
                                                                              
  const lost=create('Lost acknowledgement fixture',500002,'2026-11-14');
  proxy=http.createServer(async(req,res)=>{try{for await(const chunk of req){}const actual=await fetch(base+'/api/uvedomlenija/po_srokam',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'});assert.equal(actual.status,200);await actual.text();res.destroy();}catch(e){res.destroy(e);}});
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r));await assert.rejects(()=>fetch('http://127.0.0.1:'+proxy.address().port,{method:'POST',body:'{}'}));await new Promise(r=>proxy.close(r));proxy=null;
  assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE zadacha_id=?').get(lost).n,1);assert.equal((await job()).body.istekaet_segodnja,0);
  const beforeRestart=counts();await stop();await start();assert.equal((await job()).status,200);assert.deepEqual(counts(),beforeRestart);
  at('2026-11-14T21:30:00Z');const nextMidnight=await job();assert.equal(nextMidnight.body.den,'2026-11-15');assert.ok(nextMidnight.body.otlozheno_do);assert.deepEqual(counts(),beforeRestart);
  at('2026-11-15T06:00:00Z');const nextMorning=await job();assert.equal(nextMorning.body.istekaet_segodnja,1);assert.equal(nextMorning.body.prosrocheno,4);assert.equal((await job()).body.prosrocheno,0);
  at('2026-11-16T06:00:00Z');assert.equal((await job()).body.prosrocheno,1);assert.equal((await job()).body.prosrocheno,0);
                                                                          
  db.prepare('UPDATE uvedomlenija SET prochitano=1').run();const readBefore=counts()[0];
  const retention=db.prepare("INSERT INTO uvedomlenija(chelovek_id,tip,potok,tekst,prochitano,sozdano) VALUES(500002,'kommentarij_v_zadache','sobytija',?,?,?)");
  const expired=Number(retention.run('Expired read fixture',1,'2026-11-17 20:59:59').lastInsertRowid),boundary=Number(retention.run('Boundary read fixture',1,'2026-11-17 21:00:00').lastInsertRowid),unread=Number(retention.run('Old unread fixture',0,'2020-01-01 00:00:00').lastInsertRowid);
  at('2026-12-18T06:00:00Z');const cleaned=await job();assert.equal(cleaned.status,200);assert.equal(cleaned.body.ubrano_prochitannyh,readBefore+1);
  assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE id=?').get(expired).n,0);assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE id=?').get(boundary).n,1);assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE id=?').get(unread).n,1);
  assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE zadacha_id=?').get(old).n,0);
  at('2026-12-19T06:00:00Z');assert.equal((await job()).body.prosrocheno,0);assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE zadacha_id=?').get(old).n,0);assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija WHERE id=?').get(unread).n,1);
                                                                              
                                                                 
  db.exec('BEGIN');for(let i=0;i<5000;i++)create('Deadline load fixture '+i,500002,'2026-12-19');db.exec('COMMIT');
  const loadBefore=counts(),started=performance.now(),large=await job(),elapsed=performance.now()-started;
  assert.equal(large.status,200);assert.equal(large.body.istekaet_segodnja,5000);assert.equal(large.body.prosrocheno,0);assert.ok(elapsed<20000,'morning exceeds the production runner timeout');assert.deepEqual(counts(),[loadBefore[0]+5000,loadBefore[1]+5000,loadBefore[2]]);assert.equal((await job()).body.istekaet_segodnja,0);
  console.log(JSON.stringify({deadline_job_load_tasks:5000,elapsed_ms:Math.round(elapsed),delivered:large.body.istekaet_segodnja,duplicate_delivery:0}));
  const persisted=db.prepare('SELECT * FROM povody_uvedomlenij ORDER BY kljuch').all();execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});assert.deepEqual(db.prepare('SELECT * FROM povody_uvedomlenij ORDER BY kljuch').all(),persisted);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);assert.ok(persisted.length>0);
 }finally{if(proxy)await new Promise(r=>proxy.close(r));await stop();db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
