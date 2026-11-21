const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,randomUUID,scryptSync}=require('node:crypto');

test('weekly goals retain all calendar scopes and explicit targets without rewriting snapshots',async t=>{
 const root=process.env.LOCUS_APP_ROOT||path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-goal-decomposition-')),file=path.join(folder,'fixture.db'),actor=9900810,peer=actor+1,restricted=actor+2;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test',LOCUS_REPORT_WORKER:'0',LOCUS_REPORT_BOT_TOKEN:'',LOCUS_REPORT_CHAT_ID:''};
 let db,server,base,diagnostic="";const cookies=new Map(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()),year=today.slice(0,4);
 const api=async(method,route,body,who=actor)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(cookies.has(who)?{cookie:cookies.get(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,who=actor)=>{const r=await api(method,route,body,who);assert.equal(r.status,status,route+' '+JSON.stringify(r.body)+(r.status>=500?' '+diagnostic.slice(-2500):''));return r.body;};
 const state=()=>JSON.stringify(['celi','rezultaty','zadachi','zhurnal','versii_polej','uvedomlenija','povody_uvedomlenij','sqlite_sequence','zamery','zamery_akkauntov','snimki_planerki','plany_periodov_okr','zaprosy_planov_okr'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const make=async(extra={})=>{const goal=await good('POST','celi',{nazvanie:'Synthetic annual goal',napravlenie:'synapt',period_id:year,sostojanie:'aktivna',...extra},201),result=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic measurable annual outcome',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:500},201);return {goal,result,route:'celi/'+goal.id+'/po_kvartalam'};};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync('temporary-decomposition',salt,64).toString('hex');
  for(const id of [actor,peer,restricted]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,?,1,'sobstvennyj')").run(id,'Synthetic decomposition member '+id,id===restricted?'bez_deneg':'polnyj');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'decomposition-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>{diagnostic+=String(d);});
  base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>{clearTimeout(timer);reject(new Error('fixture stopped'));});});
  for(const id of [actor,peer,restricted]){const r=await api('POST','vhod/parol',{login:'decomposition-'+id,parol:'temporary-decomposition'},id);assert.equal(r.status,200);cookies.set(id,r.headers.get('set-cookie').split(';')[0]);}

  const setPlans=async(goal,period,values)=>{const p=await good('GET','celi/'+goal+'/plany_periodov?period='+period);return good('POST','celi/'+goal+'/plany_periodov',{period,kontekst:p.kontekst,zapros_kljuch:randomUUID(),stroki:p.rezultaty.map((r,i)=>({rezultat_id:r.rezultat_id,po_periodam:values[i]}))});};
  const week=async(w=47,y=2026,who=actor)=>good('GET','planerka?napravlenie=synapt&nedelja='+w+'&god='+y+'&den=2026-11-20',undefined,200,who);
  await t.test('an invalid calendar date is refused even before any goals exist',async()=>{
   for(const day of ['2026-02-30','2026-13-01','not-a-date']){const before=state(),r=await api('GET','planerka?napravlenie=synapt&nedelja=47&god=2026&den='+day);assert.equal(r.status,400);assert.equal(state(),before);}
  });
  await t.test('one week includes its annual, quarterly and monthly goals and excludes unrelated periods',async()=>{
   const annual=await make({period_id:'2026'}),quarter=await make({period_id:'2026-Q4'}),month=await make({period_id:'2026-11'}),outside=await make({period_id:'2026-10'}),draft=await make({period_id:'2026',sostojanie:'chernovik'});
   const before=state(),report=await week(),ids=report.svodka.celi.map(c=>c.id);assert.ok(ids.includes(annual.goal.id),'annual goal disappeared');assert.ok(ids.includes(quarter.goal.id));assert.ok(ids.includes(month.goal.id),'monthly goal disappeared');assert.ok(!ids.includes(outside.goal.id));assert.ok(!ids.includes(draft.goal.id));assert.equal(state(),before);
  });
  await t.test('ISO week 53 intersects both calendar years without borrowing Q1 of its ISO year',async()=>{
   const values=['2026','2027','2026-Q4','2027-Q1','2026-12','2027-01','2026-Q1','2027-02'],goals=[];for(const p of values)goals.push(await make({period_id:p}));
   const report=await week(53,2026),ids=report.svodka.celi.map(c=>c.id);for(const [i,p]of values.entries())assert.equal(ids.includes(goals[i].goal.id),i<6,p);assert.equal(report.svodka.period,'2027-Q1');
  });
  await t.test('manual weekly movement and month/quarter/year targets share the original result and preserve unknown versus zero',async()=>{
   const {goal,result}=await make({period_id:'2026'});await setPlans(goal.id,'2026',[['100','100','100','180']]);await setPlans(goal.id,'2026-Q4',[['50','50','80']]);
   for(const [data,znachenie]of [['2026-09-30',40],['2026-10-31',70],['2026-11-18',90]])await good('POST','zamery',{rezultat_id:result.id,znachenie,data,otkuda:'Synthetic common source '+data},201);
   const before=state(),report=await week(),row=report.svodka.celi.find(c=>c.id===goal.id).rezultaty.find(r=>r.id===result.id),v=row.razrezy;assert.equal(row.fakt,90);assert.equal(row.plan,500);
   for(const key of ['nedelja','mesjac','kvartal','god']){assert.equal(v[key].id,result.id);assert.equal(v[key].cel_id,goal.id);assert.equal(v[key].fakt,90);}
   assert.deepEqual([v.nedelja.dvizhenie_perioda,v.mesjac.dvizhenie_perioda,v.kvartal.dvizhenie_perioda,v.god.dvizhenie_perioda],[20,20,50,90]);assert.deepEqual([v.mesjac.plan,v.kvartal.plan,v.god.plan],[50,180,500]);assert.deepEqual([v.mesjac.progress_pct,v.kvartal.progress_pct,v.god.progress_pct],[40,27.8,18]);assert.equal(state(),before);
   const unknown=await make({period_id:'2026'});await good('POST','zamery',{rezultat_id:unknown.result.id,znachenie:7,data:'2026-11-18',otkuda:'Synthetic unknown initial observation'},201);const u=(await week()).svodka.celi.find(c=>c.id===unknown.goal.id).rezultaty[0].razrezy;assert.equal(u.nedelja.dvizhenie_perioda,null);assert.equal(u.mesjac.dvizhenie_perioda,null);assert.ok(u.mesjac.pochemu_net_dvizhenija);assert.equal(u.god.dvizhenie_perioda,7);
   const zero=await make({period_id:'2026'});for(const data of ['2026-09-30','2026-10-31','2026-11-15','2026-11-18'])await good('POST','zamery',{rezultat_id:zero.result.id,znachenie:0,data,otkuda:'Synthetic verified zero'},201);const z=(await week()).svodka.celi.find(c=>c.id===zero.goal.id).rezultaty[0].razrezy;for(const key of ['nedelja','mesjac','kvartal','god'])assert.equal(z[key].dvizhenie_perioda,0);
  });
  await t.test('independent monthly goals do not borrow a quarter or annual target from similarly named goals',async()=>{
   const month=await make({period_id:'2026-11'}),q=await make({period_id:'2026-Q4'});assert.equal(month.goal.nazvanie,q.goal.nazvanie);const view=(await week()).svodka.celi.find(c=>c.id===month.goal.id).rezultaty[0].razrezy;assert.equal(view.mesjac.plan,500);assert.equal(view.kvartal.plan,null);assert.equal(view.god.plan,null);assert.equal(view.kvartal.plan_na_okno_zadan,false);
  });
  await t.test('a saved weekly snapshot keeps its old facts and targets after new measurements and plan edits',async()=>{
   const {goal,result}=await make({period_id:'2026'});await setPlans(goal.id,'2026',[['100','100','100','180']]);await setPlans(goal.id,'2026-Q4',[['50','50','80']]);for(const [data,znachenie]of [['2026-10-31',70],['2026-11-18',90]])await good('POST','zamery',{rezultat_id:result.id,znachenie,data,otkuda:'Synthetic snapshot observation'},201);
   const route='planerka/snimok?napravlenie=synapt&nedelja=47&god=2026',saved=await good('POST',route,{},201),original=JSON.stringify(saved.dannye),pick=p=>p.svodka.celi.find(c=>c.id===goal.id).rezultaty[0];assert.equal(pick(saved.dannye).fakt,90);assert.equal(pick(saved.dannye).razrezy.mesjac.plan,50);
   await good('POST','zamery',{rezultat_id:result.id,znachenie:100,data:'2026-11-20',otkuda:'Synthetic later observation'},201);await setPlans(goal.id,'2026-Q4',[['50','30','100']]);const current=pick(await week());assert.equal(current.fakt,100);assert.equal(current.razrezy.mesjac.plan,30);const before=state(),reread=await good('GET',route);assert.equal(JSON.stringify(reread.dannye),original);assert.equal(state(),before);
  });
  await t.test('flow and account sources use dated intervals and observations across all scopes',async()=>{
   const {goal}=await make({period_id:'2026'}),money=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic dated flow',tip:'dengi',istochnik:'formula',formula:'summa_oplat',baza:0,plan:2000},201),project=Number(db.prepare("INSERT INTO proekty(nazvanie,napravlenie)VALUES('Synthetic scope project','synapt')").run().lastInsertRowid);
   for(const [date,amount]of [['2026-09-30',1000],['2026-10-02',100],['2026-11-03',100],['2026-11-18',200]])db.prepare('INSERT INTO platezhi(proekt_id,summa,oplachen_at)VALUES(?,?,?)').run(project,amount,date);
   const account=Number(db.prepare("INSERT INTO akkaunty(ploshadka,nazvanie,napravlenie,aktiven,uroven)VALUES('telegram','Synthetic weekly account','synapt',1,'svoj')").run().lastInsertRowid),metric=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic account scopes',tip:'chislo',istochnik:'akkaunt',akkaunt_id:account,metrika:'podpischikov',baza:0,plan:500},201);
   for(const [date,count]of [['2026-09-30',50],['2026-10-31',100],['2026-11-15',160],['2026-11-18',200]])db.prepare('INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,daty_izmerenij)VALUES(?,?,?,?)').run(account,date,count,JSON.stringify({podpischikov:date}));
   const before=state(),rows=(await week()).svodka.celi.find(c=>c.id===goal.id).rezultaty,f=rows.find(r=>r.id===money.id).razrezy,a=rows.find(r=>r.id===metric.id).razrezy;assert.deepEqual(['nedelja','mesjac','kvartal','god'].map(k=>f[k].dvizhenie_perioda),[200,300,400,1400]);assert.deepEqual(['nedelja','mesjac','kvartal','god'].map(k=>a[k].dvizhenie_perioda),[40,100,150,200]);assert.equal(state(),before);
  });
  await t.test('milestone states respect dated closing and reopening across weekly views',async()=>{
   const {goal}=await make({period_id:'2026'}),milestone=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic dated weekly milestone',tip:'veha'},201);
   db.prepare('DELETE FROM zhurnal WHERE obekt=? AND obekt_id=?').run('rezultat',milestone.id);
   for(const [date,field,value]of [['2026-09-01 09:00:00','sozdano',0],['2026-10-15 09:00:00','zakryta',1],['2026-11-05 09:00:00','zakryta',0]])db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,stalo,kto,kogda,srez)VALUES('rezultat',?,?,?,?,?,?)").run(milestone.id,field,String(value),actor,date,JSON.stringify({tip_rezultata:'veha',zakryta:value}));
   const before=state(),oct=(await week(43)).svodka.celi.find(c=>c.id===goal.id).rezultaty.find(r=>r.id===milestone.id),nov=(await week()).svodka.celi.find(c=>c.id===goal.id).rezultaty.find(r=>r.id===milestone.id);
   for(const key of ['nedelja','mesjac','kvartal','god']){assert.equal(oct.razrezy[key].fakt,1);assert.equal(nov.razrezy[key].fakt,0);}assert.equal(oct.razrezy.nedelja.dvizhenie_perioda,0);assert.equal(nov.razrezy.kvartal.dvizhenie_perioda,0);assert.equal(state(),before);
  });
  await t.test('future calendar windows never borrow a current absolute value or a known zero',async()=>{
   const {goal,result}=await make({period_id:'2027'});const before=state(),row=(await week(1,2027)).svodka.celi.find(c=>c.id===goal.id).rezultaty.find(r=>r.id===result.id);
   for(const key of ['nedelja','mesjac','kvartal','god']){assert.equal(row.razrezy[key].fakt,null);assert.equal(row.razrezy[key].dvizhenie_perioda,null);assert.equal(row.razrezy[key].dostupno,false);}assert.equal(state(),before);
  });
  await t.test('financial nested scopes stay hidden in live and saved reports, and invalid dates never write state',async()=>{
   const {goal}=await make({period_id:'2026'}),money=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic protected scope',tip:'dengi',istochnik:'ruchnoj_zamer',baza:0,plan:987654321},201);await good('POST','zamery',{rezultat_id:money.id,znachenie:123456789,data:'2026-11-18',otkuda:'Synthetic private source scope'},201);const current=await week(47,2026,restricted);assert.ok(!JSON.stringify(current).includes('123456789'));assert.ok(!JSON.stringify(current).includes('987654321'));assert.ok(!JSON.stringify(current).includes('Synthetic private source scope'));assert.deepEqual(current.svodka.celi.find(c=>c.id===goal.id).rezultaty.find(r=>r.id===money.id).skryto,['dengi']);
   const route='planerka/snimok?napravlenie=synapt&nedelja=46&god=2026';await good('POST',route,{},201);const hidden=await good('GET',route,undefined,200,restricted);assert.ok(!JSON.stringify(hidden).includes('987654321'));db.prepare("UPDATE rezultaty SET tip='chislo' WHERE id=?").run(money.id);for(const report of [await week(47,2026,restricted),await good('GET',route,undefined,200,restricted)]){const text=JSON.stringify(report);assert.ok(!text.includes('987654321'));assert.ok(!text.includes('123456789'));assert.ok(!text.includes('Synthetic private source scope'));}for(const bad of ['2026-02-30','2026-13-01','not-a-date']){const before=state();assert.equal((await api('GET','planerka?napravlenie=synapt&nedelja=47&god=2026&den='+bad)).status,400);assert.equal(state(),before);}
  });
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}fs.rmSync(folder,{recursive:true,force:true});}
});
