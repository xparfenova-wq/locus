const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('view windows use actual dated formula, account and milestone sources',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-window-sources-')),file=path.join(folder,'fixture.db');
 const previous=process.env.LOCUS_BAZA;process.env.LOCUS_BAZA=file;
 let db;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env:{...process.env,LOCUS_BAZA:file},stdio:'pipe'});db=require('../db/db.js').baza();
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()),year=String(Number(today.slice(0,4))-1),actor=9900830,model=require('../api/okno-celej.js');
  db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(?,'Synthetic window source actor',1,'polnyj',1)").run(actor);
  db.prepare("INSERT INTO periody(id,tip,nachalo,konec,zakryt)VALUES(?,'god',?,?,0)").run(year,year+'-01-01',year+'-12-31');
  const goalId=Number(db.prepare("INSERT INTO celi(nazvanie,napravlenie,period_id,sostojanie,versija)VALUES('Synthetic dated source goal','synapt',?,'aktivna',1)").run(year).lastInsertRowid),goal=db.prepare('SELECT * FROM celi WHERE id=?').get(goalId);
  const result=(source,extra={})=>{const fields={cel_id:goalId,nazvanie:'Synthetic '+source,tip:'chislo',istochnik:source,baza:0,plan:100,versija:1,...extra};const keys=Object.keys(fields);return Number(db.prepare('INSERT INTO rezultaty('+keys.join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(key=>fields[key])).lastInsertRowid);};
  const view=(id,month)=>model.srez(db,goal,year+'-'+month,today).rezultaty.find(row=>row.id===id);
  await t.test('dated payments are summed inside the selected month and empty months are known zero',()=>{
   const project=Number(db.prepare("INSERT INTO proekty(nazvanie,napravlenie)VALUES('Synthetic window project','synapt')").run().lastInsertRowid),id=result('formula',{formula:'summa_oplat',tip:'dengi'});
   for(const [date,amount]of [[year+'-09-20',1000],[year+'-10-05',125],[year+'-10-31',250]])db.prepare('INSERT INTO platezhi(proekt_id,summa,oplachen_at)VALUES(?,?,?)').run(project,amount,date);
   assert.equal(view(id,'10').fakt,375);assert.equal(view(id,'11').fakt,0);assert.equal(view(id,'10').plan,null);assert.equal(db.prepare('SELECT plan FROM rezultaty WHERE id=?').get(id).plan,100);
  });
  await t.test('a timed zero account measurement remains zero and later observations do not leak backwards',()=>{
   const account=Number(db.prepare("INSERT INTO akkaunty(ploshadka,nazvanie,napravlenie,aktiven,uroven)VALUES('telegram','Synthetic timed account','synapt',1,'svoj')").run().lastInsertRowid),id=result('akkaunt',{akkaunt_id:account,metrika:'podpischikov'});
   for(const [date,count]of [[year+'-10-10',0],[year+'-11-10',250]])db.prepare('INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,daty_izmerenij)VALUES(?,?,?,?)').run(account,date,count,JSON.stringify({podpischikov:date}));
   assert.equal(view(id,'10').fakt,0);assert.equal(view(id,'10').obnovleno,year+'-10-10');assert.equal(view(id,'11').fakt,250);assert.equal(view(id,'09').fakt,null);
   db.exec('ALTER TABLE zamery_akkauntov RENAME TO fixture_saved_account_measurements');try{const failure=view(id,'10');assert.equal(failure.fakt,null);assert.ok(failure.pochemu_net_fakta.includes('Не удалось прочитать'));}finally{db.exec('ALTER TABLE fixture_saved_account_measurements RENAME TO zamery_akkauntov');}
  });
  await t.test('a milestone uses its dated state, including a later reopening',()=>{
   const id=result('ruchnoj_zamer',{tip:'veha',zakryta:0});
   for(const [date,field,closed]of [[year+'-09-01 09:00:00','sozdano',0],[year+'-10-15 09:00:00','zakryta',1],[year+'-11-05 09:00:00','zakryta',0]])db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,stalo,kto,kogda,srez)VALUES('rezultat',?,?,?,?,?,?)").run(id,field,String(closed),actor,date,JSON.stringify({tip_rezultata:'veha',zakryta:closed}));
   assert.equal(view(id,'10').fakt,1);assert.equal(view(id,'11').fakt,0);assert.equal(view(id,'08').fakt,null);
  });
  await t.test('a current state without a historical observation cannot supply an old monthly fact',()=>{
   const id=result('formula',{formula:'klientov'}),snapshot=view(id,'10');assert.equal(snapshot.fakt,null);assert.ok(snapshot.pochemu_net_fakta.includes('не зафиксировано'));
  });
 }finally{db?.close();if(previous===undefined)delete process.env.LOCUS_BAZA;else process.env.LOCUS_BAZA=previous;fs.rmSync(folder,{recursive:true,force:true});}
});
