const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process');
const {randomBytes,scryptSync}=require('node:crypto');

test('a team day keeps tasks, measured goals, notifications and weekly snapshots consistent across directions',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-team-day-'));
 const file=path.join(folder,'fixture.db'),owner=9900910,worker=owner+1,reviewer=owner+2;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(owner),NODE_ENV:'test'};
 let db,server,base;const cookies=new Map();
 const api=async(actor,method,route,data,status=200)=>{
  const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(cookies.has(actor)?{cookie:cookies.get(actor)}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const value=await r.json();assert.equal(r.status,status,route+' '+JSON.stringify(value).slice(0,600));return {value,headers:r.headers};
 };
 const good=async(actor,method,route,data,status=200)=>(await api(actor,method,route,data,status)).value;
 const tasks=value=>value&&typeof value==='object'?[...(value.nomer&&value.nazvanie?[value]:[]),...Object.values(value).flatMap(tasks)]:[];
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});
  db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  const password='temporary-team-day',salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [owner,worker,reviewer]){
   db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,'polnyj',1,'sobstvennyj')").run(id,'Team-day fixture '+id);
   db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'team-day-'+id,hash);
  }
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',d=>stderr=(stderr+d).slice(-4000));
  base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('startup '+stderr)),10000);
   server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});
   server.once('exit',()=>{clearTimeout(timer);reject(new Error('server exit '+stderr));});
  });
  for(const id of [owner,worker,reviewer]){
   const r=await api(id,'POST','vhod/parol',{login:'team-day-'+id,parol:password});
   cookies.set(id,r.headers.get('set-cookie').split(';')[0]);
  }
  const {segodnja}=require('../db/db.js'),calendar=require('../api/kalendar.js'),day=segodnja(),week=calendar.iso_nedelja(day);
  const quarter=day.slice(0,4)+'-Q'+Math.ceil(Number(day.slice(5,7))/3),sprint=week.god+'-W'+String(week.nomer).padStart(2,'0');
  const directions=db.prepare('SELECT kod FROM napravlenija WHERE COALESCE(arhiv,0)=0 ORDER BY porjadok,kod').all();
  assert.ok(directions.length>=8);
  for(const {kod}of directions)await t.test('team day in '+kod,async()=>{
   const client=await good(owner,'POST','ljudi',{imja:'Team-day client '+kod},201);
   await good(owner,'POST','sotrudnichestva',{chelovek_id:client.id,napravlenie:kod,rol:'klient',stadija:'v_rabote'},201);
   const project=await good(owner,'POST','proekty',{nazvanie:'Team-day project '+kod,napravlenie:kod,klient_id:client.id,kto_vedet:worker,status:'idet'},201);
   const goal=await good(owner,'POST','celi',{nazvanie:'Team-day goal '+kod,napravlenie:kod,period_id:quarter,sostojanie:'aktivna'},201);
   const milestone=await good(owner,'POST','rezultaty',{cel_id:goal.id,nazvanie:'Team-day milestone '+kod,tip:'veha'},201);
   const numeric=await good(owner,'POST','rezultaty',{cel_id:goal.id,nazvanie:'Team-day measurement '+kod,tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:10},201);
   const milestoneTask=await good(owner,'POST','okr/vehi/'+milestone.id+'/zadachi',{otvetstvennyj:worker},201);
   const clientTask=await good(owner,'POST','zadachi',{nazvanie:'Team-day client work '+kod,napravlenie:kod,otvetstvennyj:worker,tip:'klientskaja',klient_id:client.id,proekt_id:project.id,cel_id:goal.id,rezultat_id:numeric.id,sprint:week.nomer,god_sprinta:week.god,srok:day},201);
   const note=db.prepare("SELECT id FROM uvedomlenija WHERE zadacha_id=? AND chelovek_id=? AND tip='komanda_dobavila_zadachu'").get(clientTask.id,worker);
   assert.ok(note);
   assert.equal((await good(worker,'GET','uvedomlenija/'+note.id)).adres,'/'+kod+'/'+clientTask.nomer);
   const initial=await good(worker,'GET','zadachi/'+clientTask.nomer);
   await good(worker,'PATCH','zadachi/'+clientTask.nomer,{versija:initial.versija,status:'v_processe'});
   await good(reviewer,'POST','kommentarii',{zadacha_id:clientTask.id,tekst:'Team-day review '+kod},201);
   const commentNote=db.prepare("SELECT id FROM uvedomlenija WHERE zadacha_id=? AND chelovek_id=? AND tip='kommentarij_v_zadache'").get(clientTask.id,worker);
   assert.ok(commentNote);
   const seen=await good(worker,'GET','zadachi/'+clientTask.nomer);
   await good(owner,'PATCH','zadachi/'+clientTask.nomer,{versija:seen.versija,opisanie:'Owner context '+kod});
   const changed=await good(worker,'PATCH','zadachi/'+clientTask.nomer,{versija:seen.versija,status:'na_soglasovanii'});
   assert.equal(changed.opisanie,'Owner context '+kod);assert.equal(changed.status,'na_soglasovanii');
   const current=await good(worker,'GET','zadachi/'+milestoneTask.nomer);
   await good(worker,'PATCH','zadachi/'+milestoneTask.nomer,{versija:current.versija,status:'sdelano'});
   const measurement=await good(worker,'POST','zamery',{rezultat_id:numeric.id,data:day,znachenie:3,otkuda:'Team-day verified source '+kod},201);
   assert.equal(measurement.kto,worker);
   let projection=await good(reviewer,'GET','okr?period='+quarter+'&napravlenie='+kod);
   assert.equal(projection.celi.find(g=>g.id===goal.id).procent,65);
   const route='planerka?napravlenie='+kod+'&nedelja='+sprint;
   const weekly=await good(reviewer,'GET',route);
   assert.ok(tasks(weekly).some(z=>z.nomer===milestoneTask.nomer&&z.status==='sdelano'));
   assert.ok(tasks(weekly.na_soglasovanii).some(z=>z.nomer===clientTask.nomer));
   assert.ok(tasks(weekly).every(z=>z.napravlenie===kod));
   await good(owner,'POST','planerka/snimok?napravlenie='+kod+'&nedelja='+sprint,undefined,201);
   const saved=await good(reviewer,'GET','planerka/snimok?napravlenie='+kod+'&nedelja='+sprint);
   await good(reviewer,'POST','zamery',{rezultat_id:numeric.id,data:day,znachenie:7,otkuda:'Team-day later source '+kod},201);
   const closed=await good(worker,'GET','zadachi/'+milestoneTask.nomer);
   await good(worker,'PATCH','zadachi/'+milestoneTask.nomer,{versija:closed.versija,status:'v_plane'});
   projection=await good(owner,'GET','okr?period='+quarter+'&napravlenie='+kod);
   assert.equal(projection.celi.find(g=>g.id===goal.id).procent,35);
   assert.deepEqual(await good(owner,'GET','planerka/snimok?napravlenie='+kod+'&nedelja='+sprint),saved);
   const ownSpace=await good(worker,'GET','moe_prostranstvo');
   assert.ok(tasks(ownSpace).some(z=>z.nomer===milestoneTask.nomer));
   const final=await good(reviewer,'GET','zadachi/'+clientTask.nomer);
   assert.equal(final.status,'na_soglasovanii');assert.equal(final.opisanie,'Owner context '+kod);
   const history=await good(owner,'GET','zhurnal?obekt=zadacha&obekt_id='+clientTask.id);
   assert.ok(history.spisok.some(e=>e.kto===owner));assert.ok(history.spisok.some(e=>e.kto===worker));
  });
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{
  db?.close();
  if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}
  fs.rmSync(folder,{recursive:true,force:true});
 }
});
