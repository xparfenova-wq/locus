const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,randomUUID,scryptSync}=require('node:crypto');

test('goal decomposition validates the complete batch and preserves its parent',async t=>{
 const root=process.env.LOCUS_APP_ROOT||path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-goal-decomposition-')),file=path.join(folder,'fixture.db'),actor=9900810,peer=actor+1,restricted=actor+2;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test',LOCUS_REPORT_WORKER:'0',LOCUS_REPORT_BOT_TOKEN:'',LOCUS_REPORT_CHAT_ID:''};
 let db,server,base;const cookies=new Map(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()),year=today.slice(0,4);
 const api=async(method,route,body,who=actor)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(cookies.has(who)?{cookie:cookies.get(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,who=actor)=>{const r=await api(method,route,body,who);assert.equal(r.status,status,route+' '+JSON.stringify(r.body));return r.body;};
 const state=()=>JSON.stringify(['celi','rezultaty','zadachi','zhurnal','versii_polej','uvedomlenija','povody_uvedomlenij','sqlite_sequence'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const make=async(extra={})=>{const goal=await good('POST','celi',{nazvanie:'Synthetic annual goal',napravlenie:'synapt',period_id:year,sostojanie:'aktivna',...extra},201),result=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic measurable annual outcome',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:500},201);return {goal,result,route:'celi/'+goal.id+'/po_kvartalam'};};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync('temporary-decomposition',salt,64).toString('hex');
  for(const id of [actor,peer,restricted]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,?,1,'sobstvennyj')").run(id,'Synthetic decomposition member '+id,id===restricted?'bez_deneg':'polnyj');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'decomposition-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',()=>{});
  base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>{clearTimeout(timer);reject(new Error('fixture stopped'));});});
  for(const id of [actor,peer,restricted]){const r=await api('POST','vhod/parol',{login:'decomposition-'+id,parol:'temporary-decomposition'},id);assert.equal(r.status,200);cookies.set(id,r.headers.get('set-cookie').split(';')[0]);}

  await t.test('default and custom quarters keep the year plan and report differences by result',async()=>{
   for(const custom of [null,[100,100,100,180]]){
    const {goal,result,route}=await make(),parent=JSON.stringify(db.prepare('SELECT * FROM celi WHERE id=?').get(goal.id)),original=JSON.stringify(db.prepare('SELECT * FROM rezultaty WHERE id=?').get(result.id));
    const before=state(),proposal=await good('GET',route);assert.equal(state(),before);assert.deepEqual(proposal.rezultaty[0].po_kvartalam,[125,125,125,125]);
    const response=await good('POST',route,custom?{stroki:[{rezultat_id:result.id,po_kvartalam:custom}]}:{},201);assert.equal(response.sozdano,4);assert.equal(response.raznica,custom?20:0);assert.equal(response.sverka[0].rezultat_id,result.id);
    const plans=response.kvartaly.map(({cel_id,period},i)=>{const child=db.prepare('SELECT * FROM celi WHERE id=?').get(cel_id);assert.equal(child.period_id,year+'-Q'+(i+1));assert.equal(child.napravlenie,goal.napravlenie);assert.equal(child.period_id,period);assert.equal(db.prepare("SELECT kto FROM zhurnal WHERE obekt='cel' AND obekt_id=? AND pole='sozdano'").get(cel_id).kto,actor);return db.prepare('SELECT plan FROM rezultaty WHERE cel_id=?').get(cel_id).plan;});
    assert.deepEqual(plans,custom||[125,125,125,125]);assert.equal(JSON.stringify(db.prepare('SELECT * FROM celi WHERE id=?').get(goal.id)),parent);assert.equal(JSON.stringify(db.prepare('SELECT * FROM rezultaty WHERE id=?').get(result.id)),original);
    const childResult=db.prepare('SELECT * FROM rezultaty WHERE cel_id=?').get(response.kvartaly[0].cel_id);await good('PATCH','rezultaty/'+childResult.id,{versija:childResult.versija,plan:42});assert.equal(db.prepare('SELECT plan FROM rezultaty WHERE id=?').get(result.id).plan,500);
   }
  });
  await t.test('fractional quarter plans report an exact zero difference',async()=>{
   const {result,route}=await make();await good('PATCH','rezultaty/'+result.id,{versija:result.versija,plan:0.3});
   const response=await good('POST',route,{stroki:[{rezultat_id:result.id,po_kvartalam:['0.1','0.2',0,0]}]},201);assert.equal(response.sozdano,2);assert.equal(response.raznica,0);assert.equal(response.sverka[0].summa,0.3);assert.equal(response.sverka[0].plan,0.3);assert.equal(db.prepare('SELECT plan FROM rezultaty WHERE id=?').get(result.id).plan,0.3);
  });
  await t.test('an explicit zero allocation is allowed, reports the whole gap and creates no invented goals',async()=>{
   const {result,route}=await make(),before=state(),response=await good('POST',route,{stroki:[{rezultat_id:result.id,po_kvartalam:[0,'0',0,'0']} ]},201);assert.equal(response.sozdano,0);assert.deepEqual(response.kvartaly,[]);assert.equal(response.sverka[0].summa,0);assert.equal(response.raznica,500);assert.equal(state(),before);
  });
  await t.test('invalid rows never become zero, disappear or create partial quarters',async()=>{
   const {result,route}=await make(),foreign=await make();
   const bodies=[{stroki:null},{stroki:[]},{stroki:{}},{unknown:1},...[
    null,true,{},'', '  ','many','1e-1000','0.10000000000000001',-1,1000000000000000
   ].map(value=>({stroki:[{rezultat_id:result.id,po_kvartalam:[value,100,100,100]}]})),
    ...[[1],[1,2,3],[1,2,3,4,5]].map(values=>({stroki:[{rezultat_id:result.id,po_kvartalam:values}]})),
    {stroki:[null]},{stroki:[{rezultat_id:foreign.result.id,po_kvartalam:[1,2,3,4]}]},
    {stroki:[{rezultat_id:result.id,po_kvartalam:[1,2,3,4]},{rezultat_id:result.id,po_kvartalam:[1,2,3,4]}]},
    {stroki:[{rezultat_id:result.id,po_kvartalam:[1,2,3,4],unknown:1}]}];
   for(const body of bodies){const before=state(),r=await api('POST',route,body);assert.equal(r.status,400,JSON.stringify(body)+' '+JSON.stringify(r.body));assert.equal(state(),before);}
  });
  await t.test('a late storage failure rolls back all created goals, results and journal entries',async()=>{
   const {route}=await make(),before=state();db.exec("CREATE TRIGGER fixture_quarter_failure BEFORE INSERT ON celi WHEN NEW.period_id LIKE '%-Q2' BEGIN SELECT RAISE(ABORT,'fixture second quarter failure');END");
   try{assert.equal((await api('POST',route,{})).status,500);assert.equal(state(),before);}finally{db.exec('DROP TRIGGER fixture_quarter_failure');}
   assert.equal((await good('POST',route,{},201)).sozdano,4);
  });
  await t.test('archived and closed source goals stay read only and private goals stay private',async()=>{
   const {goal,route}=await make();await good('PATCH','celi/'+goal.id,{versija:goal.versija,sostojanie:'arhiv'});
   for(const action of [route,'celi/'+goal.id+'/dekompozicija']){const before=state();assert.equal((await api('POST',action,action===route?{}:{zadachi:[{nazvanie:'Synthetic archived link'}]})).status,409);assert.equal(state(),before);}
   const closed=await make();assert.equal(db.prepare('UPDATE periody SET zakryt=1 WHERE id=?').run(year).changes,1);assert.equal(db.prepare('SELECT zakryt FROM periody WHERE id=?').get(year).zakryt,1);
   try{for(const action of [closed.route,'celi/'+closed.goal.id+'/dekompozicija']){const before=state(),response=await api('POST',action,action===closed.route?{}:{zadachi:[{nazvanie:'Synthetic closed link'}]});assert.equal(response.status,409,action+' '+JSON.stringify(response.body));assert.equal(state(),before);}}finally{db.prepare('UPDATE periody SET zakryt=0 WHERE id=?').run(year);}
   const draft=await make({sostojanie:'chernovik'});for(const method of ['GET','POST']){const before=state();assert.equal((await api(method,draft.route,method==='POST'?{}:undefined,peer)).status,404);assert.equal(state(),before);}
   const money=await make();await good('POST','rezultaty',{cel_id:money.goal.id,nazvanie:'Synthetic financial outcome',tip:'dengi',istochnik:'ruchnoj_zamer',baza:0,plan:500},201);const before=state();assert.equal((await api('POST',money.route,{},restricted)).status,403);assert.equal(state(),before);
  });
  await t.test('goal task batches use normal planning, authors, numbering, links and atomic validation',async()=>{
   const {goal}=await make(),route='celi/'+goal.id+'/dekompozicija';
   const response=await good('POST',route,{zadachi:[{nazvanie:'Synthetic planned team task'},{nazvanie:'Synthetic peer task',otvetstvennyj:peer}]},201);assert.equal(response.sozdano,2);
   for(const task of response.zadachi){assert.equal(task.cel_id,goal.id);assert.equal(task.napravlenie,'synapt');assert.equal(task.kto_dobavil,actor);assert.ok(task.nomer>=1000&&task.nomer<=9999);assert.ok(Number.isInteger(task.sprint));assert.ok(Number.isInteger(task.god_sprinta));assert.equal(db.prepare("SELECT kto FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='sozdano'").get(task.id).kto,actor);}
   assert.equal(response.zadachi[0].otvetstvennyj,actor);assert.equal(response.zadachi[1].otvetstvennyj,peer);
   for(const invalid of [{nazvanie:''},{nazvanie:'Synthetic wrong direction',napravlenie:'media'},{nazvanie:'Synthetic wrong parent',cel_id:goal.id},{nazvanie:'Synthetic bad week',sprint:99},{nazvanie:'Synthetic missing owner',otvetstvennyj:999999999},null]){const before=state();const r=await api('POST',route,{zadachi:[{nazvanie:'Synthetic first valid task'},invalid]});assert.equal(r.status,400,JSON.stringify(r.body));assert.equal(state(),before);}
  });
  await t.test('a numeric legacy annual id still enforces read only metadata, measurements and deletion',async()=>{
   const {goal,result}=await make(),seen=await good('GET','celi/'+goal.id),row=db.prepare('SELECT period_id,typeof(period_id) kind FROM celi WHERE id=?').get(goal.id);assert.equal(row.kind,'integer');
   db.prepare('UPDATE periody SET zakryt=1 WHERE id=?').run(year);
   try{
    for(const [method,route,body]of [
     ['PATCH','celi/'+goal.id,{versija:goal.versija,nazvanie:'Synthetic must stay unchanged'}],
     ['POST','zamery',{rezultat_id:result.id,znachenie:50,data:today,otkuda:'Synthetic forbidden closed-year measurement'}],
     ['POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic closed-year result',baza:0,plan:10}],
     ['DELETE','celi/'+goal.id,{versija:seen.versija,kontekst_udalenija:seen.kontekst_udalenija,zapros_kljuch:randomUUID()}]
    ]){const before=state(),r=await api(method,route,body);assert.equal(r.status,409,method+' '+route+' '+JSON.stringify(r.body));assert.equal(state(),before);}
    const editor=await good('GET','celi/'+goal.id+'/redaktor');assert.equal(editor.prava?.mozhno_pravit??editor.prava_celi?.mozhno_pravit,false);
   }finally{db.prepare('UPDATE periody SET zakryt=0 WHERE id=?').run(year);}
   assert.equal(db.prepare('SELECT period_id FROM celi WHERE id=?').get(goal.id).period_id,row.period_id);
  });
  await t.test('a past annual fact stops at the year end instead of borrowing a newer measurement',async()=>{
   const previous=String(Number(year)-1),{goal,result}=await make({period_id:previous}),end=previous+'-12-31';
   for(const [data,znachenie]of [[end,25],[year+'-01-01',75]])await good('POST','zamery',{rezultat_id:result.id,znachenie,data,otkuda:'Synthetic dated annual report'},201);
   const before=state(),snapshot=await good('GET','okr/rezultat/'+result.id+'?den='+today);assert.equal(snapshot.na_datu,end);assert.equal(snapshot.fakt,25);assert.equal(snapshot.progress_pct,5);assert.equal(snapshot.zamerov,1);assert.equal(state(),before);assert.equal(db.prepare('SELECT count(*) n FROM zamery WHERE rezultat_id=?').get(result.id).n,2);assert.equal(db.prepare('SELECT typeof(period_id) kind FROM celi WHERE id=?').get(goal.id).kind,'integer');
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}fs.rmSync(folder,{recursive:true,force:true});}
});
