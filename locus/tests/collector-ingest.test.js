const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
test('collector authentication is narrow and bundles are atomic, idempotent and ordered by observation time',async()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-collector-')),file=path.join(folder,'test.db');
 const key='fixture-collector-key-000000000001',service='fixture-other-service-key-0000000001';let server,db;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_KLJUCH_SBORA:key,LOCUS_SERVICE_KEY:service,NODE_ENV:'test'};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  db.prepare("INSERT INTO akkaunty(id,nazvanie,ploshadka,ssylka,uroven,aktiven,udalen,zametka) VALUES(500001,'Collector fixture','instagram','https://www.instagram.com/collector_fixture/','graph',1,0,'hidden fixture note')").run();
  db.prepare("INSERT INTO akkaunty(id,nazvanie,ploshadka,uroven,aktiven) VALUES(500002,'Inactive fixture','telegram','public',0)").run();
  server=spawn(process.execPath,['-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',data=>{stderr+=data;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server start timeout '+stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code+' '+stderr));});server.stdout.once('data',data=>{clearTimeout(timer);resolve(String(data).trim());});});
  const base='http://127.0.0.1:'+port;
  const api=async(method,url,body,headers={})=>{const response=await fetch(base+url,{method,headers:{'content-type':'application/json','x-locus-sborschik':key,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
  for(const url of ['/api/ljudi','/api/zadachi','/api/platezhi','/api/nastrojki','/api/akkaunty/500001/metriki'])assert.equal((await api('GET',url)).status,401,url);
  assert.equal((await api('POST','/api/zadachi',{})).status,401);
  let response=await api('GET','/api/akkaunty');assert.equal(response.status,200);assert.equal(response.body.spisok.length,1);
  const account=response.body.spisok[0];assert.equal(account.id,500001);assert.ok(!JSON.stringify(response.body).includes('hidden fixture note'));
  assert.deepEqual(Object.keys(account).sort(),['id','nazvanie','ploshadka','ssylka','uroven','vladelec','aktiven','zaproshen','akkaunt_sha256'].sort());
  const route='/api/akkaunty/500001/prinjat_sbor';
  const make=(id,time,fields={})=>({kljuch_zapuska:'collector-contract-fixture-'+id,akkaunt_sha256:account.akkaunt_sha256,data:'2001-05-02',kogda:'2001-05-02T'+time+'Z',uroven:'public',uspeh:true,
   snimok:{podpischikov:100},publikacii:[{publikacija_id:'9007199254740993',ssylka:'https://www.instagram.com/p/fixture/',data_vyhoda:'2001-05-02',format:'post',prosmotrov:100,lajkov:10,kommentariev:0}],...fields});
  const state=()=>JSON.stringify(['akkaunty','zamery_akkauntov','publikacii','zamery_publikacij','zapuski_sbora','zhurnal','versii_polej'].map(table=>[table,db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()]));
  for(const reach of [0,5000]){const before=state(),invalid=make('public-post-reach-'+reach,'08:30:00');invalid.publikacii[0].ohvat=reach;const rejected=await api('POST',route,invalid);assert.equal(rejected.status,400,'public post observations cannot claim private reach');assert.equal(state(),before);}
  const packet=make('first','09:00:00',{snimok:{podpischikov:100,extra:{title:'Fresh title',feed:'open'}}});
  packet.publikacii[0].zagolovok='🌿'.repeat(300);
  assert.equal((await api('POST',route,packet,{'x-locus-sborschik':'wrong'})).status,401);
  assert.equal((await api('POST',route,packet,{'x-locus-sborschik':'','x-locus-service-key':service})).status,401);
  assert.equal((await api('POST',route,packet,{Origin:'https://example.invalid'})).status,403);
  response=await api('POST',route,packet);assert.equal(response.status,201,JSON.stringify(response.body));assert.equal(response.body.poluchen,1);
  assert.equal(db.prepare('SELECT zagolovok FROM akkaunty WHERE id=500001').get().zagolovok,'Fresh title');
  assert.equal(db.prepare('SELECT publikacija_id FROM publikacii').get().publikacija_id,'9007199254740993');
  assert.equal(db.prepare('SELECT typeof(publikacija_id) t FROM publikacii').get().t,'text');
  assert.equal(db.prepare('SELECT zagolovok FROM publikacii').get().zagolovok,'🌿'.repeat(300));
  assert.equal(db.prepare('SELECT count(*) n FROM zamery_publikacij').get().n,1);
  assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='zamer_akkaunta' AND kto IS NOT NULL").get().n,0);
  const after=state();response=await api('POST',route,Object.fromEntries(Object.entries(packet).reverse()));assert.equal(response.status,200);assert.equal(response.body.povtor,true);assert.equal(state(),after);
  response=await api('POST',route,{...packet,snimok:{podpischikov:999}});assert.equal(response.status,409);assert.equal(state(),after);
  response=await api('POST',route,make('older','08:00:00',{snimok:{podpischikov:90,extra:{title:'Stale title',oldKnownFact:0}},publikacii:[{publikacija_id:'9007199254740993',prosmotrov:50,lajkov:5}]}));assert.equal(response.status,201);
  assert.deepEqual(JSON.parse(db.prepare('SELECT extra FROM zamery_akkauntov').get().extra),{title:'Fresh title',feed:'open',oldKnownFact:0});
  assert.equal(db.prepare('SELECT zagolovok FROM akkaunty WHERE id=500001').get().zagolovok,'Fresh title');
  response=await api('POST',route,make('private-stats','09:30:00',{uroven:'graph',snimok:{ohvat:420,extra:{profileViews:0,title:null}},publikacii:[{publikacija_id:'9007199254740993',ohvat:420}]}));assert.equal(response.status,201);
  assert.deepEqual(JSON.parse(db.prepare('SELECT extra FROM zamery_akkauntov').get().extra),{title:'Fresh title',feed:'open',oldKnownFact:0,profileViews:0});
  const postMeta=JSON.parse(db.prepare('SELECT daty_izmerenij FROM publikacii').get().daty_izmerenij);assert.equal(postMeta._uroven.ohvat,'graph');assert.equal(postMeta._uroven.prosmotrov,'public');assert.match(postMeta._akkaunt.ohvat,/^[a-f0-9]{64}$/);
  const historical=require('../api/metriki-akkaunta.js').publikacijaPoId(db,'500001_9007199254740993','2001-05-02',postMeta._akkaunt.ohvat);assert.equal(historical.ohvat,420);assert.equal(JSON.parse(historical.daty_izmerenij)._uroven.ohvat,'graph');assert.equal(JSON.parse(historical.daty_izmerenij)._kogda.ohvat,'2001-05-02T09:30:00.000Z');

  assert.equal(db.prepare('SELECT zagolovok FROM akkaunty WHERE id=500001').get().zagolovok,'Fresh title');
  assert.equal(db.prepare('SELECT podpischikov FROM zamery_akkauntov').get().podpischikov,100);assert.equal(db.prepare('SELECT prosmotrov FROM publikacii').get().prosmotrov,100);assert.equal(db.prepare('SELECT prosmotrov FROM zamery_publikacij').get().prosmotrov,100);
  response=await api('POST',route,make('next-day','09:00:00',{data:'2001-05-03',kogda:'2001-05-03T09:00:00Z',snimok:{summa_prosmotrov:500},publikacii:[]}));assert.equal(response.status,201);
  response=await api('POST',route,make('late-day','10:00:00',{snimok:{podpischikov:110},publikacii:[]}));assert.equal(response.status,201);
  const oldEnvironment=process.env.LOCUS_BAZA;process.env.LOCUS_BAZA=file;
  try{const result=require('../api/metriki-akkaunta.js').vse(db,500001,'2001-05-03');assert.equal(result.metriki.podpischikov.znachenie,110);assert.equal(result.metriki.podpischikov.obnovleno,'2001-05-02');}finally{if(oldEnvironment===undefined)delete process.env.LOCUS_BAZA;else process.env.LOCUS_BAZA=oldEnvironment;}
  response=await api('POST',route,make('new-title','11:00:00',{data:'2001-05-03',kogda:'2001-05-03T11:00:00Z',snimok:{podpischikov:110,extra:{title:'New title'}},publikacii:[]}));assert.equal(response.status,201);assert.equal(db.prepare('SELECT zagolovok FROM akkaunty WHERE id=500001').get().zagolovok,'New title');
  response=await api('POST',route,make('empty-title','12:00:00',{data:'2001-05-03',kogda:'2001-05-03T12:00:00Z',snimok:{podpischikov:110,extra:{title:' '}},publikacii:[]}));assert.equal(response.status,201);assert.equal(db.prepare('SELECT zagolovok FROM akkaunty WHERE id=500001').get().zagolovok,'New title');
  response=await api('POST',route,make('stale-title-later-arrival','09:30:00',{snimok:{podpischikov:105,extra:{title:'Old day title'}},publikacii:[]}));assert.equal(response.status,201);assert.equal(db.prepare('SELECT zagolovok FROM akkaunty WHERE id=500001').get().zagolovok,'New title');
  response=await api('POST',route,make('failed-title-run','13:00:00',{uspeh:false,snimok:undefined,publikacii:[],primechanie:'fixture unavailable'}));assert.equal(response.status,201);assert.equal(db.prepare('SELECT zagolovok FROM akkaunty WHERE id=500001').get().zagolovok,'New title');
  let before=state();response=await api('POST',route,make('bad-post','11:00:00',{publikacii:[{publikacija_id:'one',prosmotrov:10},{publikacija_id:'two',lajkov:null}]}));assert.equal(response.status,400);assert.equal(state(),before);
  response=await api('POST',route,make('future-post','11:00:00',{publikacii:[{publikacija_id:'future',data_vyhoda:'2999-01-01',prosmotrov:99}]}));assert.equal(response.status,400);assert.equal(state(),before);
  db.exec("CREATE TRIGGER fail_collector_run BEFORE INSERT ON zapuski_sbora BEGIN SELECT RAISE(ABORT,'fixture collector run failure'); END");
  try{response=await api('POST',route,make('run-fault','11:00:00'));assert.equal(response.status,500);assert.equal(state(),before);}finally{db.exec('DROP TRIGGER fail_collector_run');}
  db.prepare("UPDATE akkaunty SET ssylka='https://www.instagram.com/changed_fixture/' WHERE id=500001").run();
  before=state();response=await api('POST',route,make('stale-binding','11:00:00'));assert.equal(response.status,409);assert.equal(state(),before);
  response=await api('POST',route,packet);assert.equal(response.status,200,'an already accepted retry remains accepted after reconfiguration');
  assert.equal(db.prepare("SELECT count(*) n FROM versii_polej WHERE tablica=''").get().n,0);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{
  if(server&&server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}
  db?.close();fs.rmSync(folder,{recursive:true,force:true});
 }
});
