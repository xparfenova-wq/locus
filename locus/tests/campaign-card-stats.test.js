const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
test('campaign cards share current-source counts with the summary and meeting without inventing historical membership',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-campaign-card-stats-')),database=path.join(folder,'fixture.db'),env={...process.env,LOCUS_BAZA:database,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'1',LOCUS_ADMIN_IDS:'61',NODE_ENV:'test'};let db,server,base;
 const api=async(method,route,body)=>{const response=await fetch(base+'/api/'+route,{method,headers:{'content-type':'application/json','x-locus-chelovek':'61'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.ok(response.ok,route+' '+JSON.stringify(value));return value;};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(database);db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(61,'Synthetic stats owner',1,'polnyj',1)").run();
  for(const id of [71,72,73,74,75])db.prepare('INSERT INTO ljudi(id,imja,rol_v_baze)VALUES(?,?,?)').run(id,'Synthetic stats contact '+id,id===75?'kontaktnoe_lico':'sobstvennyj');
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>stderr=(stderr+d).slice(-3000));base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(stderr)),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  await t.test('an empty campaign and its durable creation receipt contain actual zero counts',async()=>{
   const key=randomUUID(),empty=await api('POST','rassylki',{zapros_kljuch:key,nazvanie:'Synthetic empty card',napravlenie:'synapt',plan_chislo:100,vybor_bazy:'nikogo'});
   for(const row of [empty,await api('GET','rassylki/'+empty.id),(await api('GET','rassylki/proverka?zapros_kljuch='+key)).obekt].filter(Boolean)){assert.equal(row.razmer_bazy,0);assert.equal(row.otpravleno,0);}
  });
  const source=Number(db.prepare("INSERT INTO bazy(nazvanie,napravlenie,chto_vnutri)VALUES('Synthetic live source','synapt','chelovek')").run().lastInsertRowid);
  for(const id of [71,72,73,74,75])db.prepare('INSERT INTO bazy_ljudi(baza_id,kto)VALUES(?,?)').run(source,id);
  const archived=db.prepare('SELECT id FROM bazy_ljudi WHERE baza_id=? AND kto=74').get(source);db.prepare("INSERT INTO arhiv_strok_baz(stroka_id,arhiv,avtor,kogda)VALUES(?,1,61,datetime('now'))").run(archived.id);
  const campaign=Number(db.prepare("INSERT INTO rassylki(nazvanie,napravlenie,baza_id,status)VALUES('Synthetic live card','synapt',?,'idet')").run(source).lastInsertRowid);
  for(const[id,status]of [[71,'otpravleno'],[72,'otvetil'],[74,'otpravleno']])db.prepare("INSERT INTO rassylka_ljudi(rassylka_id,chelovek_id,status,otpravleno_at,otvet_at)VALUES(?,?,?,date('now'),?)").run(campaign,id,status,status==='otvetil'?new Date().toISOString().slice(0,10):null);
  const state=()=>JSON.stringify(['rassylki','bazy_ljudi','arhiv_strok_baz','rassylka_ljudi','rassylka_kasanija','zhurnal'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
  await t.test('active source includes raw additions and excludes archived and contact-only rows consistently',async()=>{
   const before=state(),card=await api('GET','rassylki/'+campaign),summary=await api('GET','rassylki/'+campaign+'/svodka'),meeting=await api('GET','planerka?napravlenie=synapt'),listed=(await api('GET','rassylki?na_stranice=200')).spisok.find(c=>c.id===campaign),inMeeting=meeting.biznes.rassylki.find(c=>c.id===campaign);
   for(const row of [card,summary,listed,inMeeting]){assert.ok(row);assert.equal(row.razmer_bazy,3);assert.equal(row.otpravleno,2);}
   assert.equal(card.url,base+'/rassylki/'+campaign);assert.equal(summary.kontaktov_v_baze,3);assert.equal(summary.otvetili,1);assert.equal(inMeeting.voronka.v_baze,3);assert.equal(inMeeting.voronka.otpravleno,2);assert.equal(state(),before);assert.equal(db.prepare('SELECT count(*) n FROM rassylka_ljudi WHERE rassylka_id=? AND chelovek_id=73').get(campaign).n,0);
  });
  await t.test('completed campaigns retain their saved recipients instead of rewriting the past from the current base',async()=>{
   db.prepare("UPDATE rassylki SET status='zavershena' WHERE id=?").run(campaign);const before=state(),card=await api('GET','rassylki/'+campaign),summary=await api('GET','rassylki/'+campaign+'/svodka');assert.equal(card.razmer_bazy,3);assert.equal(card.otpravleno,3);assert.equal(summary.kontaktov_v_baze,3);assert.equal(summary.otpravleno,card.otpravleno);assert.equal(state(),before);
  });
 }finally{if(server&&server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
