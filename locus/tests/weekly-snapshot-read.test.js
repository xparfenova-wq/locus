const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,randomUUID,scryptSync}=require('node:crypto');

test('past weekly reads retain saved reports and distinguish absence from failure',async t=>{
 const root=process.env.LOCUS_APP_ROOT||path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-goal-decomposition-')),file=path.join(folder,'fixture.db'),actor=9900870,peer=actor+1,restricted=actor+2;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test',LOCUS_REPORT_WORKER:'0',LOCUS_REPORT_BOT_TOKEN:'',LOCUS_REPORT_CHAT_ID:''};
 let db,server,base,diagnostic="";const cookies=new Map(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()),year=today.slice(0,4);
 const api=async(method,route,body,who=actor)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(cookies.has(who)?{cookie:cookies.get(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,who=actor)=>{const r=await api(method,route,body,who);assert.equal(r.status,status,route+' '+JSON.stringify(r.body)+(r.status>=500?' '+diagnostic.slice(-2500):''));return r.body;};
 const state=()=>JSON.stringify(['celi','rezultaty','zadachi','zhurnal','versii_polej','uvedomlenija','povody_uvedomlenij','sqlite_sequence','zamery','zamery_akkauntov','snimki_planerki','plany_periodov_okr','zaprosy_planov_okr','platezhi','akkaunty','sostojanija'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const make=async(extra={})=>{const goal=await good('POST','celi',{nazvanie:'Synthetic annual goal',napravlenie:'synapt',period_id:year,sostojanie:'aktivna',...extra},201),result=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic measurable annual outcome',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:500},201);return {goal,result,route:'celi/'+goal.id+'/po_kvartalam'};};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync('temporary-decomposition',salt,64).toString('hex');
  for(const id of [actor,peer,restricted]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,?,1,'sobstvennyj')").run(id,'Synthetic decomposition member '+id,id===restricted?'bez_deneg':'polnyj');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'decomposition-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>{diagnostic+=String(d);});
  base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>{clearTimeout(timer);reject(new Error('fixture stopped'));});});
  for(const id of [actor,peer,restricted]){const r=await api('POST','vhod/parol',{login:'decomposition-'+id,parol:'temporary-decomposition'},id);assert.equal(r.status,200);cookies.set(id,r.headers.get('set-cookie').split(';')[0]);}


  const reportRoute='planerka?napravlenie=synapt&nedelja=42&god=2026',snapshotRoute='planerka/snimok?napravlenie=synapt&nedelja=42&god=2026';
  const {goal,result}=await make({period_id:'2026-Q4'}),pick=p=>p.svodka.celi.find(c=>c.id===goal.id).rezultaty.find(r=>r.id===result.id);
  await t.test('a past report without a snapshot is explicitly a reconstruction and GET never creates one',async()=>{
   const before=state(),report=await good('GET',reportRoute);assert.equal(report.istochnik_otcheta.vid,'ne_zafiksirovano');assert.equal(report.istochnik_otcheta.tolko_chtenie,true);assert.equal(state(),before);assert.equal((await api('GET',snapshotRoute)).status,404);
  });
  await t.test('the main past report retains the saved facts after a later backdated observation',async()=>{
   for(const [data,znachenie]of [['2026-10-11',10],['2026-10-14',20]])await good('POST','zamery',{rezultat_id:result.id,data,znachenie,otkuda:'Synthetic saved weekly source'},201);
   const saved=await good('POST',snapshotRoute,{},201);assert.equal(pick(saved.dannye).fakt,20);const original=db.prepare("SELECT dannye FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").get().dannye;
   await good('POST','zamery',{rezultat_id:result.id,data:'2026-10-16',znachenie:30,otkuda:'Synthetic late correction'},201);const before=state(),report=await good('GET',reportRoute);assert.equal(pick(report).fakt,20);assert.equal(report.istochnik_otcheta.vid,'snimok');assert.equal(report.istochnik_otcheta.tolko_chtenie,true);assert.equal(db.prepare("SELECT dannye FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").get().dannye,original);assert.equal(state(),before);
   const dated=await good('GET',reportRoute+'&den=2026-10-16');assert.equal(pick(dated).fakt,30);assert.equal(dated.istochnik_otcheta.vid,'srez_na_datu');
  });
  await t.test('snapshot lookup never substitutes another direction or ISO year',async()=>{
   const other=await good('POST','planerka/snimok?napravlenie=media&nedelja=42&god=2026',{},201);assert.equal(other.dannye.napravlenie,'media');const before=state();assert.equal((await api('GET','planerka/snimok?nedelja=42&god=2026')).status,400);assert.equal((await api('GET','planerka/snimok?napravlenie=synapt&nedelja=42&god=2025')).status,404);assert.equal(state(),before);
  });
  await t.test('corrupt saved JSON and a storage failure are errors, never empty or live fallback reports',async()=>{
   const original=db.prepare("SELECT dannye FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").get().dannye;
   for(const text of ['invalid JSON','{}',JSON.stringify({...JSON.parse(original),napravlenie:'media'})]){
    db.prepare("UPDATE snimki_planerki SET dannye=? WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").run(text);const before=state();assert.equal((await api('GET',reportRoute)).status,503);assert.equal((await api('GET',snapshotRoute)).status,503);assert.equal(state(),before);
   }
   db.prepare("UPDATE snimki_planerki SET dannye=? WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").run(original);db.exec('ALTER TABLE snimki_planerki RENAME TO fixture_saved_weekly_reports');try{assert.equal((await api('GET',reportRoute)).status,503);assert.equal((await api('GET',snapshotRoute)).status,503);}finally{db.exec('ALTER TABLE fixture_saved_weekly_reports RENAME TO snimki_planerki');}
  });
  await t.test('payment insight text cannot expose an amount in live or saved supplemental blocks',async()=>{
   const project=Number(db.prepare("INSERT INTO proekty(nazvanie,napravlenie)VALUES('Synthetic private finance project','synapt')").run().lastInsertRowid);db.prepare("INSERT INTO platezhi(proekt_id,summa,vystavlen_at)VALUES(?,987654321,'2026-09-01')").run(project);
   const route='planerka/snimok?napravlenie=synapt&nedelja=43&god=2026';await good('POST',route,{},201);
   const full=await good('GET',route);assert.ok(full.dannye.dopolnenija.insajty.some(r=>r.finansovyj_insajt));
   for(const target of ['insajty?napravlenie=synapt',route,'planerka?napravlenie=synapt&nedelja=43&god=2026']){
    const before=state(),response=await good('GET',target,undefined,200,restricted),text=JSON.stringify(response);assert.doesNotMatch(text,/987.?654.?321/u);assert.ok(!text.includes('Synthetic private finance project')||!text.includes('оплату'));assert.equal(state(),before);
   }
  });
  await t.test('account state, team resources and payment details are part of the frozen weekly record',async()=>{
   const account=Number(db.prepare("INSERT INTO akkaunty(ploshadka,nazvanie,napravlenie,aktiven,uroven)VALUES('telegram','Synthetic preserved account name','synapt',1,'svoj')").run().lastInsertRowid);
   for(const[data,count]of[['2026-11-01',100],['2026-11-05',150]])db.prepare('INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,daty_izmerenij)VALUES(?,?,?,?)').run(account,data,count,JSON.stringify({podpischikov:data}));
   db.prepare('INSERT INTO sostojanija(chelovek_id,den,resurs)VALUES(?,?,?)').run(actor,'2026-11-04',70);
   const route='planerka/snimok?napravlenie=synapt&nedelja=45&god=2026';const saved=await good('POST',route,{},201),original=JSON.stringify(saved.dannye);assert.equal(saved.dannye.dopolnenija.socseti.find(r=>r.id===account).podpischikov,150);assert.equal(saved.dannye.dopolnenija.socseti.find(r=>r.id===account).delta,50);assert.equal(saved.dannye.dopolnenija.tokeny.find(r=>r.chelovek_id===actor).resurs,70);
   db.prepare('INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,daty_izmerenij)VALUES(?,?,?,?)').run(account,'2026-11-07',200,JSON.stringify({podpischikov:'2026-11-07'}));db.prepare('INSERT INTO sostojanija(chelovek_id,den,resurs)VALUES(?,?,?)').run(actor,'2026-11-06',20);db.prepare("UPDATE akkaunty SET nazvanie='Synthetic later account name' WHERE id=?").run(account);
   const before=state(),report=await good('GET','planerka?napravlenie=synapt&nedelja=45&god=2026');assert.equal(report.dopolnenija.socseti.find(r=>r.id===account).podpischikov,150);assert.equal(report.dopolnenija.socseti.find(r=>r.id===account).nazvanie,'Synthetic preserved account name');assert.equal(report.dopolnenija.tokeny.find(r=>r.chelovek_id===actor).resurs,70);assert.equal(JSON.stringify((await good('GET',route)).dannye),original);assert.equal(state(),before);
   const future=await good('GET','planerka?napravlenie=synapt&nedelja=1&god=2027');assert.deepEqual(future.dopolnenija.socseti,[]);assert.deepEqual(future.dopolnenija.tokeny,[]);assert.deepEqual(future.dopolnenija.platezhi,[]);
  });
  await t.test('a legacy saved JSON is not augmented with current period views',async()=>{
   const record=db.prepare("SELECT dannye FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").get(),data=JSON.parse(record.dannye);for(const goal of data.svodka.celi)for(const row of goal.rezultaty)delete row.razrezy;const text=JSON.stringify(data);db.prepare("UPDATE snimki_planerki SET dannye=? WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").run(text);const before=state(),report=await good('GET',reportRoute);assert.equal(pick(report).razrezy,undefined);assert.equal(pick(report).fakt,20);assert.equal(state(),before);
  });
  await t.test('outgoing task projections never refresh recurring states, links or child counters inside a saved report',async()=>{
   const ordinary=await good('POST','zadachi',{nazvanie:'Synthetic frozen parent',napravlenie:'synapt',otvetstvennyj:actor,tip:'produktovaja',sprint:'2026-W42'},201),repeating=await good('POST','zadachi',{nazvanie:'Synthetic old recurring state',napravlenie:'synapt',otvetstvennyj:actor,tip:'produktovaja',povtorjaetsja:true,chastota:'kazhdyj_den',povtor_s:'2026-10-12'},201);
   const record=db.prepare("SELECT dannye FROM snimki_planerki WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").get(),data=JSON.parse(record.dannye),one=db.prepare('SELECT * FROM zadachi WHERE id=?').get(ordinary.id),two=db.prepare('SELECT * FROM zadachi WHERE id=?').get(repeating.id);one.otkrytyh_podzadach=0;two.status='sdelano';two.den_vybora='2026-10-18';data.produkt=[one,two];const original=JSON.stringify(data);db.prepare("UPDATE snimki_planerki SET dannye=? WHERE napravlenie='synapt' AND god=2026 AND nedelja=42").run(original);
   db.prepare("INSERT INTO zadachi(nomer,nazvanie,napravlenie,otvetstvennyj,roditel_id,status)VALUES((SELECT max(nomer)+1 FROM zadachi),'Synthetic later child','synapt',?,?,'v_plane')").run(actor,ordinary.id);
   const before=state(),stored=await good('GET',snapshotRoute),report=await good('GET',reportRoute);delete report.istochnik_otcheta;delete stored.dannye.istochnik_otcheta;assert.deepEqual(report,stored.dannye);assert.equal(report.produkt[0].otkrytyh_podzadach,0);assert.equal(report.produkt[1].status,'sdelano');assert.equal(report.produkt[1].den_vybora,'2026-10-18');assert.equal(state(),before);
  });
  await t.test('a private goal cannot survive as an aggregate percentage in an older shared snapshot',async()=>{
   db.prepare("UPDATE celi SET sostojanie='chernovik' WHERE id=?").run(goal.id);
   const before=state(),report=await good('GET',reportRoute,undefined,200,peer);assert.equal(report.svodka.celi.some(c=>c.id===goal.id),false);assert.equal(report.svodka.procent_celej,null);assert.equal(report.svodka.celi_skryty,true);assert.equal(state(),before);
  });
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}fs.rmSync(folder,{recursive:true,force:true});}
});
