const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
test('manual OKR facts stay valid, attributable and independent of task plans',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-okr-integrity-')),file=path.join(folder,'fixture.db'),actor=9900680,peer=actor+1;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test'};let db,server,base,cookie,goal,result;
 const api=async(method,route,body)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200)=>{const r=await api(method,route,body);assert.equal(r.status,status,route+' '+JSON.stringify(r.body));return r.body;};
 const state=()=>JSON.stringify(['celi','rezultaty','zamery','zadachi','zhurnal','versii_polej','sqlite_sequence'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const measurement=extra=>({rezultat_id:result.id,znachenie:25,data:'2026-11-18',otkuda:'Verified report',...extra});
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  for(const id of [actor,peer])db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,'polnyj',1,'sobstvennyj')").run(id,'Synthetic OKR integrity actor '+id);
  const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(actor,'okr-integrity',salt+':'+scryptSync('temporary-okr-integrity',salt,64).toString('hex'));
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>process.stderr.write(d));base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>reject(new Error('exit')));});
  const login=await api('POST','vhod/parol',{login:'okr-integrity',parol:'temporary-okr-integrity'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  goal=await good('POST','celi',{nazvanie:'Corporate verified goal',napravlenie:'synapt',period_id:'2026-Q4',sostojanie:'aktivna'},201);
  result=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Actual result',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:100},201);
  await t.test('POST and PATCH reject malformed numbers without changing any row or journal',async()=>{
   const m=await good('POST','zamery',measurement(),201);
   for(const value of [null,true,false,[],{},'', '   ','many','NaN','Infinity','1e309','1e-1000','1234567890123456',1234567890123456])for(const method of ['POST','PATCH']){
    const before=state(),r=await api(method,method==='POST'?'zamery':'zamery/'+m.id,method==='POST'?measurement({znachenie:value}):{znachenie:value});assert.equal(r.status,400,method+' '+JSON.stringify(value)+' '+JSON.stringify(r.body));assert.equal(state(),before);
   }
   for(const value of [0,-5,7.5,'7,5',123456789012345]){const row=await good('POST','zamery',measurement({znachenie:value}),201);assert.equal(row.znachenie,Number(String(value).replace(',','.')));}
  });
  await t.test('a measurement author is always the authenticated actor and cannot be forged',async()=>{
   const m=await good('POST','zamery',measurement(),201);assert.equal(m.kto,actor);
   for(const method of ['POST','PATCH'])for(const value of [peer,actor,null]){
    const before=state(),r=await api(method,method==='POST'?'zamery':'zamery/'+m.id,method==='POST'?measurement({kto:value}):{kto:value});assert.equal(r.status,400);assert.equal(r.body.oshibka,'kto ставится сам');assert.equal(state(),before);
   }
  });
  await t.test('real dates and a nonblank source are validated on both write paths',async()=>{
   const m=await good('POST','zamery',measurement(),201),future=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
   for(const patch of [{data:'2026-02-30'},{data:'2025-02-29'},{data:'2026-04-31'},{data:''},{data:null},{data:future},{otkuda:'   '},{otkuda:true},{otkuda:'x'.repeat(301)}])for(const method of ['POST','PATCH']){
    const before=state(),r=await api(method,method==='POST'?'zamery':'zamery/'+m.id,method==='POST'?measurement(patch):patch);assert.equal(r.status,400,JSON.stringify(patch)+' '+JSON.stringify(r.body));assert.equal(state(),before);
   }
   const before=state();for(const [method,body]of [['PATCH',{znachenie:27,data:'2026-11-17',otkuda:'Corrected source'}],['DELETE',{}]]){const r=await api(method,'zamery/'+m.id,body);assert.equal(r.status,400);assert.equal(state(),before);}
   const corrected=await good('POST','zamery',measurement({znachenie:27,otkuda:'  Corrected source  '}),201);assert.equal(corrected.znachenie,27);assert.equal(corrected.otkuda,'Corrected source');assert.equal(corrected.kto,actor);assert.notEqual(corrected.id,m.id);assert.equal(db.prepare('SELECT znachenie FROM zamery WHERE id=?').get(m.id).znachenie,25);
  });
  await t.test('a closed quarter cannot be changed by transferring in another measurement',async()=>{
   const g=await good('POST','celi',{nazvanie:'Closed goal boundary',napravlenie:'synapt',period_id:'2026-Q3',sostojanie:'aktivna'},201),r=await good('POST','rezultaty',{cel_id:g.id,nazvanie:'Closed manual result',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:10},201),m=await good('POST','zamery',measurement(),201);
   await good('POST','okr/zakryt/2026-Q3',{});
   for(const [method,route,body]of [['PATCH','zamery/'+m.id,{rezultat_id:r.id}],['POST','zamery',measurement({rezultat_id:r.id})],['POST','okr/zamery',measurement({rezultat_id:r.id})]]){const before=state(),response=await api(method,route,body);assert.equal(response.status,409);assert.equal(state(),before);}
  });
  await t.test('weekly movement finds the baseline beyond the twelve displayed measurements',async()=>{
   const r=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Many actual measurements',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:100},201);
   await good('POST','zamery',measurement({rezultat_id:r.id,znachenie:10,data:'2026-11-15'}),201);
   for(let i=1;i<=14;i++)await good('POST','zamery',measurement({rezultat_id:r.id,znachenie:10+i,data:'2026-11-16'}),201);
   const response=await good('GET','okr?period=2026-Q4&den=2026-11-19'),row=response.celi.find(c=>c.id===goal.id).rezultaty.find(x=>x.id===r.id);assert.equal(row.fakt,24);assert.equal(row.dvizhenie_nedeli,14);assert.equal(row.zamery.length,12);assert.equal(db.prepare('SELECT count(*) n FROM zamery WHERE rezultat_id=?').get(r.id).n,15);
  });
  await t.test('historical list and result card agree on the dated fact and its source without writing',async()=>{
   const r=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Historical exact-date fact',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:100},201);
   await good('POST','zamery',measurement({rezultat_id:r.id,znachenie:10,data:'2026-11-10',otkuda:'Earlier dated source'}),201);
   await good('POST','zamery',measurement({rezultat_id:r.id,znachenie:40,data:'2026-11-18',otkuda:'Later dated source'}),201);
   const before=state(),all=await good('GET','okr?period=2026-Q4&den=2026-11-12'),item=all.celi.find(c=>c.id===goal.id).rezultaty.find(x=>x.id===r.id),detail=await good('GET','okr/rezultat/'+r.id+'?den=2026-11-12');
   assert.equal(item.fakt,10);assert.equal(detail.fakt,10);assert.equal(detail.progress_pct,10);assert.equal(item.progress_pct,detail.progress_pct);assert.equal(detail.otkuda,'Earlier dated source');assert.equal(detail.obnovleno,'2026-11-10');assert.equal(item.zamery.length,1);assert.equal(item.zamerov,1);assert.equal(detail.zamerov,1);assert.equal(all.na_datu,'2026-11-12');assert.equal(all.istoricheskij,true);assert.equal(state(),before);
   const missing=await good('GET','okr/rezultat/'+r.id+'?den=2026-11-01');assert.equal(missing.fakt,null);assert.equal(missing.otkuda,null);assert.equal(missing.zamerov,0);assert.ok(missing.pochemu_net_fakta);
   for(const date of ['2026-02-30','wrong'])assert.equal((await api('GET','okr/rezultat/'+r.id+'?den='+date)).status,400);assert.equal(state(),before);
  });
  await t.test('new milestone creation records initial state without invented measurements',async()=>{
   const r=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Dated milestone origin',tip:'veha'},201),event=db.prepare("SELECT srez FROM zhurnal WHERE obekt='rezultat' AND obekt_id=? AND pole='sozdano' ORDER BY id DESC LIMIT 1").get(r.id),context=JSON.parse(event.srez);
   assert.equal(context.tip_rezultata,'veha');assert.equal(context.zakryta,0);assert.equal(db.prepare('SELECT count(*) n FROM zamery WHERE rezultat_id=?').get(r.id).n,0);
  });
  await t.test('actual task commands retain a historical completion in list, card and weekly OKR after reopening',async()=>{
   const g=await good('POST','celi',{nazvanie:'Historical task command count',napravlenie:'synapt',period_id:'2026-Q4',sostojanie:'aktivna'},201),r=await good('POST','rezultaty',{cel_id:g.id,nazvanie:'Dated completed tasks',tip:'chislo',istochnik:'formula',formula:'zadach_zakryto',baza:0,plan:100},201),task=await good('POST','zadachi',{nazvanie:'Actual closure and reopening commands',napravlenie:'synapt',otvetstvennyj:actor,tip:'biznesovaja',plan_chislo:1},201);
   const creation=db.prepare("SELECT srez FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='sozdano' ORDER BY id DESC LIMIT 1").get(task.id),origin=JSON.parse(creation.srez);assert.equal(origin.status_zadachi,task.status);assert.equal(origin.udaleno_zadachi,0);
   db.prepare("UPDATE zhurnal SET kogda='2026-11-01 10:00:00' WHERE obekt='zadacha' AND obekt_id=? AND pole='sozdano'").run(task.id);db.prepare("UPDATE zadachi SET sozdano='2026-11-01 10:00:00' WHERE id=?").run(task.id);
   const closed=await good('PATCH','zadachi/'+task.nomer,{versija:task.versija,status:'sdelano'});db.prepare("UPDATE zhurnal SET kogda='2026-11-10 10:00:00' WHERE obekt='zadacha' AND obekt_id=? AND pole='status' AND stalo='sdelano'").run(task.id);
   await good('PATCH','zadachi/'+task.nomer,{versija:closed.versija,status:'v_plane'});db.prepare("UPDATE zhurnal SET kogda='2026-11-18 10:00:00' WHERE obekt='zadacha' AND obekt_id=? AND pole='status' AND stalo='v_plane'").run(task.id);
   const before=state(),detail=await good('GET','okr/rezultat/'+r.id+'?den=2026-11-12'),all=await good('GET','okr?period=2026-Q4&den=2026-11-12'),week=await good('GET','planerka?napravlenie=synapt&den=2026-11-12');assert.equal(detail.fakt,1);assert.equal(all.celi.find(c=>c.id===g.id).rezultaty[0].fakt,1);assert.equal(week.svodka.celi.find(c=>c.id===g.id).rezultaty[0].fakt,1);assert.equal((await good('GET','okr/rezultat/'+r.id)).fakt,0);assert.equal(state(),before);
  });
  await t.test('an unknown baseline remains unknown in result, goal and weekly views',async()=>{
   const g=await good('POST','celi',{nazvanie:'Unknown baseline is not zero',napravlenie:'synapt',period_id:'2026-Q4',sostojanie:'aktivna'},201),r=await good('POST','rezultaty',{cel_id:g.id,nazvanie:'Unknown baseline result',tip:'chislo',istochnik:'ruchnoj_zamer',baza:null,plan:100},201);
   await good('POST','zamery',measurement({rezultat_id:r.id,znachenie:43}),201);
   const detail=await good('GET','okr/rezultat/'+r.id);assert.equal(detail.progress_pct,null);assert.equal(detail.baza_ne_zadana,true);
   const all=await good('GET','okr?period=2026-Q4'),row=all.celi.find(c=>c.id===g.id);assert.equal(row.rezultaty[0].progress_pct,null);assert.equal(row.rezultaty[0].baza_ne_zadana,true);assert.equal(row.procent,null);
   const week=await good('GET','planerka?napravlenie=synapt&den=2026-11-19&god=2026&sprint=47');assert.equal(week.svodka.celi.find(c=>c.id===g.id).procent,null);
  });
 }finally{if(server&&server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
