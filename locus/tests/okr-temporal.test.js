const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');
const NativeDate=Date;
global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-19T12:00:00Z']));}static now(){return NativeDate.parse('2026-11-19T12:00:00Z');}};
const slices=require('../api/srez-okr.js'),metrics=require('../api/metriki-akkaunta.js'),progress=require('../api/progress-okr.js');
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8'));
 db.exec("INSERT INTO periody(id,nachalo,konec)VALUES('2026-Q4','2026-10-01','2026-12-31'),('2026-Q3','2026-07-01','2026-09-30'); INSERT INTO celi(id,nazvanie,period_id,napravlenie)VALUES(1,'Synthetic dated goal','2026-Q4','media'); INSERT INTO rezultaty(id,cel_id,nazvanie,tip,istochnik,baza,plan)VALUES(1,1,'Synthetic dated result','chislo','ruchnoj_zamer',0,100)");
 return db;
}
const row=db=>db.prepare('SELECT * FROM rezultaty WHERE id=1').get();
function measure(db,day,value){db.prepare("INSERT INTO zamery(rezultat_id,data,znachenie,otkuda)VALUES(1,?,?,'Synthetic measured source')").run(day,value);}
function account(db){db.exec("INSERT INTO akkaunty(id,nazvanie)VALUES(1,'Synthetic historical account'); UPDATE rezultaty SET istochnik='akkaunt',akkaunt_id=1,metrika='podpischikov' WHERE id=1");}
test('selected-day manual facts exclude later values, preserve zero, and use stable same-day ordering',()=>{
 const db=fixture();try{
  measure(db,'2026-11-10',10);measure(db,'2026-11-12',0);measure(db,'2026-11-18',40);measure(db,'2026-11-18',41);measure(db,'2026-11-20',999);
  const past=slices.fakt(db,row(db),'2026-11-12');assert.equal(past.fakt,0);assert.equal(past.obnovleno,'2026-11-12');assert.equal(past.poslednij_zamer.znachenie,0);
  assert.equal(slices.fakt(db,row(db),'2026-11-11').fakt,10);assert.equal(slices.fakt(db,row(db)).fakt,41);assert.equal(slices.fakt(db,row(db),'2026-12-01').fakt,41);
  assert.equal(slices.fakt(db,row(db),'2026-12-01').na_datu,'2026-11-19');
 }finally{db.close();}
});
test('missing historical actuals do not become a present baseline; current known zero remains usable',()=>{
 const db=fixture();try{
  assert.equal(slices.fakt(db,row(db)).fakt,0);assert.equal(slices.fakt(db,row(db)).istochnik_fakta,'baza');
  const old=slices.fakt(db,row(db),'2026-11-12');assert.equal(old.fakt,null);assert.ok(old.pochemu);assert.equal(old.poslednij_zamer,null);assert.equal(progress.result(row(db),old.fakt),null);
  assert.throws(()=>slices.fakt(db,row(db),'2026-02-30'));assert.throws(()=>slices.fakt(db,row(db),['2026-11-12']));
 }finally{db.close();}
});
test('period-end bounds manual and account actuals even without an explicit past date',()=>{
 const db=fixture();try{
  db.exec("UPDATE celi SET period_id='2026-Q3' WHERE id=1");measure(db,'2026-09-29',20);measure(db,'2026-11-18',80);
  assert.equal(slices.fakt(db,row(db)).fakt,20);assert.equal(slices.fakt(db,row(db)).na_datu,'2026-09-30');
  account(db);db.exec("INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov)VALUES(1,'2026-09-28',100),(1,'2026-11-18',900)");assert.equal(slices.fakt(db,row(db)).fakt,100);
 }finally{db.close();}
});
test('dated formula flows stop at the selected day and quarter; current stocks stay unknown in the past',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='summa_oplat' WHERE id=1; INSERT INTO proekty(id,nazvanie,napravlenie)VALUES(1,'Synthetic own project','media'),(2,'Synthetic other project','synapt'); INSERT INTO platezhi(proekt_id,summa,oplachen_at)VALUES(1,1,'2026-11-10'),(1,1,'2026-11-18'),(2,1,'2026-11-10'),(1,1,'2026-09-10')");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);assert.equal(slices.fakt(db,row(db)).fakt,2);
  db.exec("UPDATE rezultaty SET formula='klientov' WHERE id=1");const old=slices.fakt(db,row(db),'2026-11-12');assert.equal(old.fakt,null);assert.ok(old.pochemu);assert.equal(slices.fakt(db,row(db)).fakt,0);
 }finally{db.close();}
});
test('historical publication metrics use field snapshots rather than current projections and exclude later posts',()=>{
 const db=fixture();try{
  account(db);db.prepare("INSERT INTO publikacii(id,akkaunt_id,publikacija_id,data_vyhoda,prosmotrov,lajkov,kommentariev,daty_izmerenij)VALUES('p1',1,'1','2026-11-10',900,90,90,?)").run(JSON.stringify({prosmotrov:'2026-11-18',lajkov:'2026-11-18',kommentariev:'2026-11-18'}));
  db.exec("INSERT INTO zamery_publikacij(publikacija_id,data,prosmotrov,lajkov,kommentariev)VALUES('p1','2026-11-11',100,10,0),('p1','2026-11-18',900,90,90); INSERT INTO publikacii(id,akkaunt_id,publikacija_id,data_vyhoda,prosmotrov,lajkov)VALUES('later',1,'2','2026-11-18',99999,9999)");
  const past=metrics.vse(db,1,'2026-11-12');assert.equal(past.metriki.prosmotrov_srednee.znachenie,100);assert.equal(past.metriki.prosmotrov_srednee.obnovleno,'2026-11-11');assert.equal(past.metriki.vovlechennost.znachenie,10);assert.equal(past.po_publikacijam.vsego,1);assert.equal(past.po_publikacijam.srednie,100);
  db.exec("UPDATE publikacii SET prosmotrov=999999,lajkov=99999 WHERE id='p1'");assert.deepEqual(metrics.vse(db,1,'2026-11-12'),past);
 }finally{db.close();}
});
test('partial and carried snapshots retain actual per-field dates, known zero, and unknown historical legacy values',()=>{
 const db=fixture();try{
  account(db);db.prepare('INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,ohvat,daty_izmerenij)VALUES(1,?,?,?,?)').run('2026-11-18',900,0,JSON.stringify({podpischikov:'2026-11-18',ohvat:'2026-11-11'}));
  const past=metrics.vse(db,1,'2026-11-12');assert.equal(past.metriki.podpischikov.znachenie,null);assert.deepEqual(past.metriki.ohvat,{znachenie:0,obnovleno:'2026-11-11'});
  db.exec("INSERT INTO publikacii(id,akkaunt_id,publikacija_id,data_vyhoda,prosmotrov,lajkov)VALUES('legacy',1,'1','2026-11-10',500,50)");assert.equal(metrics.vse(db,1,'2026-11-12').metriki.prosmotrov_srednee.znachenie,null);assert.equal(metrics.vse(db,1).metriki.prosmotrov_srednee.znachenie,500);
  db.prepare("INSERT INTO zamery_publikacij(publikacija_id,data,prosmotrov,lajkov,daty_izmerenij)VALUES('legacy','2026-11-18',900,0,?)").run(JSON.stringify({prosmotrov:'2026-11-18',lajkov:'2026-11-11'}));
  const historic=metrics.publikaciiNaDatu(db,1,'2026-11-12')[0];assert.equal(historic.prosmotrov,null);assert.equal(historic.lajkov,0);
 }finally{db.close();}
});
test('weekly account movement compares the same actual metric at both boundaries and preserves zero',()=>{
 const db=fixture();try{
  account(db);db.exec("INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov)VALUES(1,'2026-11-15',100),(1,'2026-11-18',120)");
  const result=row(db),now=slices.fakt(db,result);assert.equal(slices.nedelja(db,result,now,'2026-11-16'),20);assert.equal(slices.nedelja(db,result,now,'2026-11-23'),null);
  db.exec("UPDATE zamery_akkauntov SET podpischikov=100 WHERE data='2026-11-18'");assert.equal(slices.nedelja(db,result,slices.fakt(db,result),'2026-11-16'),0);
  db.exec("DELETE FROM zamery_akkauntov WHERE data='2026-11-15'");assert.equal(slices.nedelja(db,result,slices.fakt(db,result),'2026-11-16'),null);
 }finally{db.close();}
});
test('milestone history uses dated Moscow events, never a legacy current checkbox or a recycled id',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET tip='veha',zakryta=1 WHERE id=1");const result=row(db);assert.equal(slices.fakt(db,result).fakt,1);assert.equal(slices.fakt(db,result,'2026-11-12').fakt,null);assert.equal(progress.result(result,null),null);
  const event=db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kogda,srez)VALUES('rezultat',1,?,?,?,?,?)");
  event.run('sozdano',null,'да','2026-11-10 10:00:00',JSON.stringify({tip_rezultata:'veha',zakryta:0}));
  event.run('zakryta','0','1','2026-11-12 21:01:00',JSON.stringify({tip_rezultata:'veha',zakryta:1}));
  assert.equal(slices.fakt(db,result,'2026-11-12').fakt,0);assert.equal(slices.fakt(db,result,'2026-11-13').fakt,1);assert.equal(progress.result(result,0),0);
  assert.equal(slices.nedelja(db,result,slices.fakt(db,result),'2026-11-09'),null);
  event.run('sozdano',null,'да','2026-11-18 10:00:00',JSON.stringify({tip_rezultata:'veha',zakryta:1}));assert.equal(slices.fakt(db,result,'2026-11-13').fakt,null);
 }finally{db.close();}
});

test('saved weekly observations supply old states only from their real capture date and matching result source',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET tip='veha',zakryta=1 WHERE id=1");
  const save=db.prepare("INSERT INTO snimki_planerki(napravlenie,god,nedelja,dannye,sozdano)VALUES('media',2026,?,?,?)"),packet=result=>JSON.stringify({svodka:{celi:[{id:1,rezultaty:[{id:1,cel_id:1,...result}]}]}});
  save.run(46,packet({tip:'veha',fakt:0}),'2026-11-15 20:59:03');
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,null);assert.equal(slices.fakt(db,row(db),'2026-11-16').fakt,0);
  save.run(45,packet({tip:'veha',fakt:1}),'2026-11-18 10:00:00');assert.equal(slices.fakt(db,row(db),'2026-11-16').fakt,0,'a late capture is not assigned to its nominal past week');
  db.exec("UPDATE rezultaty SET tip='chislo',istochnik='formula',formula='klientov' WHERE id=1");assert.equal(slices.fakt(db,row(db),'2026-11-16').fakt,null);
  save.run(44,packet({tip:'chislo',istochnik:'formula',formula:'klientov',fakt:0}),'2026-11-15 20:59:03');const known=slices.fakt(db,row(db),'2026-11-16');assert.equal(known.fakt,0);assert.equal(known.obnovleno,'2026-11-15');
  db.exec("UPDATE celi SET napravlenie='synapt' WHERE id=1");assert.equal(slices.fakt(db,row(db),'2026-11-16').fakt,null,'a different direction cannot borrow the old count');db.exec("UPDATE celi SET napravlenie='media' WHERE id=1");
  db.exec("INSERT INTO zhurnal(obekt,obekt_id,pole,stalo,kogda)VALUES('rezultat',1,'sozdano','да','2026-11-15 21:00:00')");assert.equal(slices.fakt(db,row(db),'2026-11-16').fakt,null,'a same-day capture before a new creation epoch is not inherited');
  db.exec("UPDATE rezultaty SET formula='klientov_ot_referalov' WHERE id=1");assert.equal(slices.fakt(db,row(db),'2026-11-16').fakt,null,'another definition cannot borrow the old count');
 }finally{db.close();}
});
test('payment facts and publication formula dates obey Moscow day boundaries',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='summa_oplat' WHERE id=1; INSERT INTO proekty(id,nazvanie,napravlenie)VALUES(1,'Synthetic boundary project','media'); INSERT INTO platezhi(proekt_id,summa,oplachen_at)VALUES(1,10,'2026-11-12T20:59:59Z'),(1,20,'2026-11-12T21:00:00Z')");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,10);assert.equal(slices.fakt(db,row(db),'2026-11-13').fakt,30);
  db.exec("UPDATE rezultaty SET formula='publikacij_vyshlo' WHERE id=1; INSERT INTO zadachi(nomer,nazvanie,napravlenie,status,publikacija,data_vyhoda,otvetstvennyj)VALUES(1,'Synthetic boundary publication','media','sdelano',1,'2026-11-12T21:00:00Z',1)");
  db.exec("UPDATE zadachi SET sozdano='2026-11-01' WHERE nomer=1; INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kogda)SELECT 'zadacha',id,'status','v_plane','sdelano','2026-11-12 10:00:00' FROM zadachi WHERE nomer=1");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,0);assert.equal(slices.fakt(db,row(db),'2026-11-13').fakt,1);
 }finally{db.close();}
});
test('a later task reopening or second completion cannot rewrite the selected-day completion count',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='zadach_zakryto' WHERE id=1; INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,status,otvetstvennyj,sozdano)VALUES(1,1,'Synthetic reopened work','media','v_plane',1,'2026-11-01'); INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kogda)VALUES('zadacha',1,'status','v_plane','sdelano','2026-11-10 12:00:00'),('zadacha',1,'status','sdelano','v_plane','2026-11-18 12:00:00')");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);assert.equal(slices.fakt(db,row(db)).fakt,0);
  db.exec("UPDATE zadachi SET status='sdelano' WHERE id=1; INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kogda)VALUES('zadacha',1,'status','v_plane','sdelano','2026-11-19 12:00:00')");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);assert.equal(slices.fakt(db,row(db)).fakt,1);
 }finally{db.close();}
});
test('historical task deletion and missing state history never turn an unknown count into zero',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='zadach_zakryto' WHERE id=1; INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,status,otvetstvennyj,sozdano,udaleno)VALUES(1,1,'Synthetic subsequently deleted work','media','sdelano',1,'2026-11-01',1); INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kogda)VALUES('zadacha',1,'status','v_plane','sdelano','2026-11-10 12:00:00'),('zadacha',1,'udaleno','0','1','2026-11-18 12:00:00')");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);assert.equal(slices.fakt(db,row(db),'2026-11-18').fakt,0);
  db.exec("INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,status,otvetstvennyj,sozdano)VALUES(2,2,'Synthetic legacy state without evidence','media','v_plane',1,'2026-11-01')");
  const unknown=slices.fakt(db,row(db),'2026-11-12');assert.equal(unknown.fakt,null);assert.ok(unknown.pochemu);
  db.exec("UPDATE zadachi SET napravlenie='synapt' WHERE id=2");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);
  db.exec("INSERT INTO zhurnal(obekt,obekt_id,pole,stalo,kogda)VALUES('zadacha',1,'sozdano','да','2026-11-18 10:00:00')");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,0,'a recycled task id is a new epoch');
 }finally{db.close();}
});
test('initial task context establishes a new open state without inventing a close from later observation',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='zadach_zakryto' WHERE id=1; INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,status,otvetstvennyj,sozdano)VALUES(1,1,'Synthetic recorded origin','media','sdelano',1,'2026-11-01')");
  const event=db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kogda,srez)VALUES('zadacha',1,?,?,?,?,?)");
  event.run('sozdano',null,'да','2026-11-01 10:00:00',JSON.stringify({status_zadachi:'v_plane',udaleno_zadachi:0}));assert.equal(slices.fakt(db,row(db),'2026-11-02').fakt,0);
  event.run('status','v_plane','sdelano','2026-11-03 10:00:00',JSON.stringify({status_zadachi:'sdelano',udaleno_zadachi:0}));event.run('nazvanie','Previous','Current','2026-11-15 10:00:00',JSON.stringify({status_zadachi:'sdelano',udaleno_zadachi:0}));
  assert.equal(slices.fakt(db,row(db),'2026-11-16').fakt,1);const snapshot=slices.fakt(db,row(db),'2026-11-16');assert.equal(slices.nedelja(db,row(db),snapshot,'2026-11-16'),0);
 }finally{db.close();}
});

test('historical mailing replies and sends survive later refusals and resets without borrowing another wave',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='otvetili_na_rassylku' WHERE id=1; INSERT INTO rassylki(id,nazvanie,napravlenie)VALUES(1,'Synthetic dated campaign','media'); INSERT INTO rassylka_ljudi(rassylka_id,chelovek_id,status,otpravleno_at,otvet_at)VALUES(1,1,'otkaz','2026-11-10','2026-11-18'); INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,kogda,chto)VALUES(1,1,'2026-11-10','otpravleno'),(1,1,'2026-11-11','otvetil'),(1,1,'2026-11-18','otkaz')");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);assert.equal(slices.fakt(db,row(db)).fakt,0);
  db.exec("UPDATE rezultaty SET formula='otkazalis' WHERE id=1");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,0);assert.equal(slices.fakt(db,row(db)).fakt,1);
  db.exec("UPDATE rezultaty SET formula='pisem_otpravleno' WHERE id=1; INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,kogda,chto)VALUES(1,1,'2026-11-18','ne_otpravleno'); UPDATE rassylka_ljudi SET status='ne_otpravleno',otpravleno_at=NULL,otvet_at=NULL");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);assert.equal(slices.fakt(db,row(db)).fakt,0);
  db.exec("INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,zadacha_id,kogda,chto)VALUES(1,1,99,'2026-11-10','otpravleno'),(1,1,99,'2026-11-18','otvetil')");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,2);db.exec("UPDATE rezultaty SET formula='otvetili_na_rassylku' WHERE id=1");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);
 }finally{db.close();}
});
test('legacy mailing dates establish known sends while missing reply or wave history remains unknown',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='pisem_otpravleno' WHERE id=1; INSERT INTO rassylki(id,nazvanie,napravlenie)VALUES(1,'Synthetic legacy campaign','media'); INSERT INTO rassylka_ljudi(rassylka_id,chelovek_id,status,otpravleno_at,otvet_at)VALUES(1,1,'otvetil','2026-11-10','2026-11-18')");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);db.exec("UPDATE rezultaty SET formula='otvetili_na_rassylku' WHERE id=1");const unknown=slices.fakt(db,row(db),'2026-11-12');assert.equal(unknown.fakt,null);assert.ok(unknown.pochemu);
  db.exec("UPDATE rassylka_ljudi SET otvet_at='2026-11-11'");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,1);
  db.exec("INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,status,otvetstvennyj,rassylka_id)VALUES(99,99,'Synthetic legacy wave without roster','media','v_plane',1,1); UPDATE rassylka_ljudi SET zadacha_id=99; UPDATE rezultaty SET formula='pisem_otpravleno' WHERE id=1");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,null,'a global carried status cannot establish a missing wave');
 }finally{db.close();}
});
test('dated mailing events use Moscow boundaries and malformed dates do not become known zeros',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='pisem_otpravleno' WHERE id=1; INSERT INTO rassylki(id,nazvanie,napravlenie)VALUES(1,'Synthetic boundary campaign','media'); INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,kogda,chto)VALUES(1,1,'2026-11-12T21:00:00Z','otpravleno')");
  assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,0);assert.equal(slices.fakt(db,row(db),'2026-11-13').fakt,1);
  db.exec("INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,kogda,chto)VALUES(1,2,'2026-02-30','otpravleno')");assert.equal(slices.fakt(db,row(db),'2026-11-13').fakt,null);
 }finally{db.close();}
});

test('unreadable source and oversized exact integers remain unknown without hiding another result',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET istochnik='formula',formula='summa_oplat' WHERE id=1; INSERT INTO proekty(id,nazvanie,napravlenie)VALUES(1,'Synthetic numeric range project','media')");db.prepare("INSERT INTO platezhi(proekt_id,summa,oplachen_at)VALUES(1,?,'2026-11-12')").run(9007199254740993n);
  const large=slices.fakt(db,row(db));assert.equal(large.fakt,null);assert.ok(large.pochemu);assert.equal(slices.nedelja(db,row(db),large,'2026-11-16'),null);
  db.exec('DROP TABLE platezhi');const unreadable=slices.fakt(db,row(db));assert.equal(unreadable.fakt,null);assert.ok(unreadable.pochemu);
  measure(db,'2026-11-12',10);db.exec("UPDATE rezultaty SET istochnik='ruchnoj_zamer',formula=NULL WHERE id=1");assert.equal(slices.fakt(db,row(db),'2026-11-12').fakt,10);
 }finally{db.close();}
});
test('malformed saved report structures never invent a historic milestone state',()=>{
 const db=fixture();try{
  db.exec("UPDATE rezultaty SET tip='veha',zakryta=1 WHERE id=1");const insert=db.prepare("INSERT INTO snimki_planerki(napravlenie,god,nedelja,dannye,sozdano)VALUES('media',2026,?,?,'2026-11-10 10:00:00')");
  for(const [i,payload]of ['not JSON',JSON.stringify({svodka:{celi:{}}}),JSON.stringify({svodka:{celi:[{id:1,rezultaty:{}}]}})].entries())insert.run(i+1,payload);
  const past=slices.fakt(db,row(db),'2026-11-12');assert.equal(past.fakt,null);assert.ok(past.pochemu);
 }finally{db.close();}
});
