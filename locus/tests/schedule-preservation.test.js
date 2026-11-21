const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
test('schedule day edits preserve retained legacy values and merge independent days atomically',async t=>{
 const root=process.env.LOCUS_SCHEDULE_ROOT||path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-schedule-preservation-')),file=path.join(folder,'fixture.db'),actor=9901900,peer=actor+1;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_GRAFIK_ADMIN_IDS:String(peer),NODE_ENV:'test',LOCUS_REPORT_WORKER:'0',LOCUS_REPORT_BOT_TOKEN:'',LOCUS_REPORT_CHAT_ID:''};let db,server,base,diagnostic='';const cookies=new Map();
 const api=async(method,url,body,who=actor)=>{const r=await fetch(base+'/api/'+url,{method,headers:{connection:'close','content-type':'application/json',...(cookies.has(who)?{cookie:cookies.get(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const batch=(dni,who=actor,owner=actor)=>api('POST','grafik/sohranit',{chelovek_id:owner,nedelja:'2026-W43',dni},who),day=n=>db.prepare('SELECT * FROM grafik WHERE chelovek_id=? AND god=2026 AND nedelja=43 AND den=?').get(actor,n);
 const hash=()=>JSON.stringify(['grafik','zhurnal','versii_polej','sqlite_sequence'].map(n=>db.prepare('SELECT rowid,* FROM '+n+' ORDER BY rowid').all()));
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),password=salt+':'+scryptSync('temporary-schedule',salt,64).toString('hex');
  for(const id of[actor,peer]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,'polnyj',1,'sobstvennyj')").run(id,'Synthetic schedule member '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'schedule-'+id,password);}
  const insert=db.prepare('INSERT INTO grafik(chelovek_id,god,nedelja,den,chasov,s_kakogo,do_kakogo,zametka)VALUES(?,2026,43,?,?,?,?,?)');insert.run(actor,1,4,'15:00','19:00','После основной работы');insert.run(actor,2,8,null,null,'По договорённости');insert.run(actor,3,24,null,null,null);
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',d=>diagnostic+=String(d));base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('schedule fixture startup '+diagnostic.slice(-500))),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>{clearTimeout(timer);reject(Error('schedule fixture stopped'));});});
  for(const id of[actor,peer]){const r=await api('POST','vhod/parol',{login:'schedule-'+id,parol:'temporary-schedule'},id);assert.equal(r.status,200);cookies.set(id,r.headers.get('set-cookie').split(';')[0]);}
  await t.test('a saved receipt without its payload signature cannot enter the ledger',()=>{
   assert.throws(()=>db.prepare("INSERT INTO zaprosy_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,sohraneno,rezultat_json,sozdano)VALUES(?,?,?,?,?,'sohranit',1,'{}','2026-11-21')").run(actor,'f'.repeat(64),actor,2026,43),/CHECK constraint/);
  });
  await t.test('a committed keyed edit is exactly once and receipts reveal no hours or notes',async()=>{
   const {randomUUID}=require('node:crypto'),key=randomUUID();const preview=(await api('GET','grafik/predprosmotr?chelovek_id='+actor+'&nedelja=2026-W43')).body,d=preview.spisok.find(r=>r.den===1);
   const body={chelovek_id:actor,nedelja:'2026-W43',kontekst:preview.kontekst,zapros_kljuch:key,dni:[{den:1,id:d.id,versija:d.versija,identichnost:d.identichnost,zametka:'Synthetic private receipt note'}]};
   let r=await api('POST','grafik/sohranit',body);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.sostojanie,'sohraneno');assert.equal(r.body.izmeneno_dnej,1);
   const before=hash();r=await api('POST','grafik/sohranit',body);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.povtor_dejstvija,true);assert.equal(hash(),before);
   r=await api('GET','grafik/proverka?chelovek_id='+actor+'&nedelja=2026-W43&zapros_kljuch='+key);assert.equal(r.status,200);assert.equal(r.body.sostojanie,'sohraneno');for(const word of['Synthetic private','zametka','chasov','s_kakogo'])assert.ok(!JSON.stringify(r.body).includes(word));
   assert.ok(!JSON.stringify(db.prepare('SELECT * FROM zaprosy_grafika').all()).includes('Synthetic private'));assert.equal(hash(),before);
   const alien=await api('GET','grafik/proverka?chelovek_id='+actor+'&nedelja=2026-W43&zapros_kljuch='+key,undefined,peer);assert.equal(alien.body.sostojanie,'ne_najdeno');
   assert.equal((await api('POST','grafik/sohranit',{...body,dni:[{...body.dni[0],zametka:'Reused key'}]})).status,409);assert.equal(hash(),before);
  });
  await t.test('cancelled undelivered attempts block late arrival after proof and allow neither source nor owner reuse',async()=>{
   const key=require('node:crypto').randomUUID(),p=(await api('GET','grafik/predprosmotr?nedelja=2026-W43')).body,d=p.spisok.find(r=>r.den===2),b={chelovek_id:actor,nedelja:'2026-W43',kontekst:p.kontekst,zapros_kljuch:key,dni:[{den:2,id:d.id,versija:d.versija,identichnost:d.identichnost,zametka:'Late request'}]};
   const before=hash();const proof=await api('GET','grafik/proverka?nedelja=2026-W43&zapros_kljuch='+key);assert.equal(proof.body.sostojanie,'ne_najdeno');assert.equal(hash(),before);
   let r=await api('POST','grafik/otmena_popytki',{chelovek_id:actor,nedelja:'2026-W43',zapros_kljuch:key,dejstvie:'sohranit'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.sostojanie,'otmeneno');assert.equal(hash(),before);r=await api('POST','grafik/sohranit',b);assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(hash(),before);
   assert.equal((await api('GET','grafik/proverka?nedelja=2026-W44&zapros_kljuch='+key)).status,409);assert.equal((await api('POST','grafik/otmena_popytki',{nedelja:'2026-W43',zapros_kljuch:key,dejstvie:'kopirovat'})).status,409);
  });
  await t.test('receipt failure rolls back both edited rows and field history',async()=>{
   const p=(await api('GET','grafik/predprosmotr?nedelja=2026-W43')).body,d=p.spisok[0],before=hash();db.exec("CREATE TRIGGER test_schedule_receipt_failure BEFORE INSERT ON zaprosy_grafika WHEN NEW.sohraneno=1 BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END");
   try{const r=await api('POST','grafik/sohranit',{nedelja:'2026-W43',kontekst:p.kontekst,zapros_kljuch:require('node:crypto').randomUUID(),dni:[{den:d.den,id:d.id,versija:d.versija,identichnost:d.identichnost,zametka:'Should roll back'}]});assert.equal(r.status,500,JSON.stringify(r.body));assert.equal(hash(),before);}finally{db.exec('DROP TRIGGER test_schedule_receipt_failure');}
  });
  await t.test('identity guards prevent writing a replacement or moved day and owner',async()=>{
   const p=(await api('GET','grafik/predprosmotr?nedelja=2026-W43')).body,d=p.spisok[0],make=()=>({nedelja:'2026-W43',kontekst:p.kontekst,zapros_kljuch:require('node:crypto').randomUUID(),dni:[{den:d.den,id:d.id,versija:d.versija,identichnost:d.identichnost,zametka:'Wrong identity'}]});
   const before=hash();assert.equal((await api('POST','grafik/sohranit',{...make(),kontekst:'0'.repeat(64)})).status,409);assert.equal(hash(),before);
   const body=make();body.dni[0].identichnost='0'.repeat(64);assert.equal((await api('POST','grafik/sohranit',body)).status,409);assert.equal(hash(),before);
   assert.equal((await api('POST','grafik/sohranit',{...make(),chelovek_id:peer})).status,403);assert.equal(hash(),before);
   assert.equal((await api('GET','grafik/proverka?nedelja=2026-W43&nedelja=2026-W44&zapros_kljuch='+require('node:crypto').randomUUID())).status,400);
  });
  await t.test('real creation epochs reject a reused row number and a replaced owner even in the same second',async()=>{
   const p=(await api('GET','grafik/predprosmotr?nedelja=2026-W43')).body,d=p.spisok.find(r=>r.den===1),body={nedelja:'2026-W43',kontekst:p.kontekst,zapros_kljuch:require('node:crypto').randomUUID(),dni:[{den:1,id:d.id,versija:d.versija,identichnost:d.identichnost,zametka:'Do not apply to replacement'}]};
   db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,stalo,kto,kogda)VALUES('grafik',?,'sozdano','Synthetic replacement epoch',?,datetime('now'))").run(d.id,actor);const before=hash();assert.equal((await api('POST','grafik/sohranit',body)).status,409);assert.equal(hash(),before);
   const current=(await api('GET','grafik/predprosmotr?nedelja=2026-W43')).body;body.dni[0].identichnost=current.spisok.find(r=>r.den===1).identichnost;body.zapros_kljuch=require('node:crypto').randomUUID();db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,stalo,kto,kogda)VALUES('chelovek',?,'sozdano','Synthetic owner replacement epoch',?,datetime('now'))").run(actor,actor);const after=hash();assert.equal((await api('POST','grafik/sohranit',body)).status,409);assert.equal(hash(),after);
  });
  await t.test('copy across ISO years retains raw legacy windows, duration-only days and target edits, repeats do not copy later source additions',async()=>{
   const add=db.prepare('INSERT INTO grafik(chelovek_id,god,nedelja,den,chasov,s_kakogo,do_kakogo,zametka,ne_rabotaju)VALUES(?,2026,53,?,?,?,?,?,?)');add.run(actor,1,4,'15:00','19:00','Year boundary window',0);add.run(actor,2,24,null,null,'Duration only',0);add.run(actor,3,0,null,null,'Off day',1);
   db.prepare('INSERT INTO grafik(chelovek_id,god,nedelja,den,chasov,zametka)VALUES(?,2027,1,1,7,?)').run(actor,'Keep this existing target');const existing=db.prepare('SELECT * FROM grafik WHERE chelovek_id=? AND god=2027 AND nedelja=1 AND den=1').get(actor);
   const p=(await api('GET','grafik/predprosmotr?nedelja=2027-W01&iz=2026-W53')).body,b={chelovek_id:actor,iz:'2026-W53',v:'2027-W01',kontekst:p.kontekst,istochnik_kontekst:p.istochnik_kontekst,zapros_kljuch:require('node:crypto').randomUUID()};let r=await api('POST','grafik/kopirovat',b);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.skopirovano,2);assert.equal(r.body.propuscheno,1);assert.deepEqual(db.prepare('SELECT * FROM grafik WHERE id=?').get(existing.id),existing);const copy=db.prepare('SELECT * FROM grafik WHERE chelovek_id=? AND god=2027 AND nedelja=1 AND den=2').get(actor);assert.equal(copy.chasov,24);assert.equal(copy.s_kakogo,null);assert.equal(copy.zametka,'Duration only');assert.equal(db.prepare('SELECT ne_rabotaju FROM grafik WHERE chelovek_id=? AND god=2027 AND nedelja=1 AND den=3').get(actor).ne_rabotaju,1);
   add.run(actor,4,1,'8','9','Added later',0);const before=hash();r=await api('POST','grafik/kopirovat',b);assert.equal(r.status,200);assert.equal(r.body.povtor_dejstvija,true);assert.equal(hash(),before);assert.equal((await api('POST','grafik/kopirovat',{...b,zapros_kljuch:require('node:crypto').randomUUID()})).status,409);assert.equal(hash(),before);
  });
  await t.test('malformed keyed day ids and weekday values return input errors without creating a receipt',async()=>{
   const p=(await api('GET','grafik/predprosmotr?nedelja=2026-W43')).body,d=p.spisok[0],before=hash();for(const delta of[{id:{bad:true}},{id:true},{id:1.25},{id:'1e2'},{den:0},{den:'1'}]){const r=await api('POST','grafik/sohranit',{nedelja:'2026-W43',kontekst:p.kontekst,zapros_kljuch:require('node:crypto').randomUUID(),dni:[{den:d.den,id:d.id,versija:d.versija,identichnost:d.identichnost,zametka:'Invalid input',...delta}]});assert.equal(r.status,400,JSON.stringify(r.body));assert.equal(hash(),before);}
  });
  await t.test('an explicit six-hour request in15:00–19:00 is rejected rather than silently becoming four',async()=>{
   const before=hash(),r=await api('POST','grafik',{chelovek_id:actor,nedelja:'2026-W43',den:4,chasov:6,s_kakogo:'15:00',do_kakogo:'19:00'});assert.equal(r.status,400,JSON.stringify(r.body));assert.equal(hash(),before);
  });
  await t.test('notes-only changes retain the exact old window, end, hours and their field history',async()=>{
   const before=day(1),versions=db.prepare("SELECT * FROM versii_polej WHERE tablica='grafik' AND obekt_id=? AND pole IN('chasov','s_kakogo','do_kakogo') ORDER BY pole").all(before.id);
   const r=await batch([{den:1,id:before.id,versija:before.versija,zametka:'Новая заметка'}]);assert.equal(r.status,200,JSON.stringify(r.body));const after=day(1);for(const key of['s_kakogo','do_kakogo','chasov'])assert.equal(after[key],before[key],key);assert.equal(after.zametka,'Новая заметка');assert.deepEqual(db.prepare("SELECT * FROM versii_polej WHERE tablica='grafik' AND obekt_id=? AND pole IN('chasov','s_kakogo','do_kakogo') ORDER BY pole").all(before.id),versions);
  });
  await t.test('saving Friday leaves every field of the other three retained days unchanged',async()=>{
   const before=[1,2,3].map(day),r=await batch([{den:5,chasov:0.5,s_kakogo:'8',do_kakogo:'8.5',ne_rabotaju:false}]);assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual([1,2,3].map(day),before);assert.equal(day(5).chasov,0.5);assert.equal(r.body.spisok.length,1);
  });
  await t.test('notes may be cleared to null, but overlong text cannot change a retained duration',async()=>{
   let d=day(2);let r=await batch([{den:2,id:d.id,versija:d.versija,zametka:''}]);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(day(2).zametka,null);assert.equal(day(2).chasov,8);assert.equal(day(2).s_kakogo,null);d=day(2);const before=hash();r=await batch([{den:2,id:d.id,versija:d.versija,zametka:'a'.repeat(501)}]);assert.equal(r.status,400);assert.equal(hash(),before);
  });
  await t.test('only the configured schedule editor can edit somebody else, and independent days are retained',async()=>{
   const before=hash();assert.equal((await batch([{den:1,chasov:1}],actor,peer)).status,403);assert.equal(hash(),before);const d=day(3),r=await batch([{den:3,id:d.id,versija:d.versija,zametka:'Явная правка редактора'}],peer);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(day(3).chasov,24);assert.equal(day(3).s_kakogo,null);
  });
  await t.test('a stale changed day rolls back the entire sparse batch and all earlier day edits',async()=>{
   const stale=day(2);assert.equal((await batch([{den:2,id:stale.id,versija:stale.versija,zametka:'Другая правка'}],peer)).status,200);const five=day(5),before=hash();const r=await batch([{den:5,id:five.id,versija:five.versija,chasov:1,s_kakogo:'8,8.5',do_kakogo:'9'},{den:2,id:stale.id,versija:stale.versija,zametka:'Устаревшая правка'}]);assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(hash(),before);
  });
 }finally{if(server?.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
