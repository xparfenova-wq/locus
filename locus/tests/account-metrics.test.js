const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');
const NativeDate=Date;global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-14T12:00:00Z']));}static now(){return NativeDate.parse('2026-11-14T12:00:00Z');}};
const metrics=require('../api/metriki-akkaunta.js');
function fixture(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8'));db.prepare("INSERT INTO akkaunty(id,nazvanie) VALUES(1,'Metric fixture')").run();return db;}
function post(db,id,views,likes,comments,date='2026-11-14',format='post'){
 db.prepare('INSERT INTO publikacii(id,akkaunt_id,publikacija_id,data_vyhoda,prosmotrov,lajkov,kommentariev,format) VALUES(?,1,?,?,?,?,?,?)').run('metric-'+id,id,date,views,likes,comments,format);
}
test('views use the median and engagement uses a sum ratio over exactly fourteen of twenty known pairs',()=>{
 const db=fixture();try{
  const views=[400,450,500,520,480,12000];views.forEach((v,i)=>post(db,i,v,10*(i+1),i));
  let result=metrics.vse(db,1,'2026-11-14');assert.equal(result.metriki.prosmotrov_srednee.znachenie,490);assert.equal(result.metriki.vovlechennost.znachenie,1.6);
  for(let i=6;i<14;i++)post(db,i,100,10,0);
  for(let i=14;i<20;i++)post(db,i,null,9000,1000);
  result=metrics.vse(db,1,'2026-11-14');assert.equal(result.metriki.vovlechennost.znachenie,2);
  assert.equal(result.metriki.vovlechennost.publikacij_v_schete,14);assert.equal(result.metriki.vovlechennost.publikacij_vsego,20);
  assert.equal(result.po_publikacijam.vovlechennost,2);assert.equal(result.po_publikacijam.vovl_po,14);
  assert.equal(result.metriki.vovlechennost.obnovleno,null,'a publishing date is not an invented measurement date');
 }finally{db.close();}
});
test('thirty Moscow calendar days include timestamps at both boundaries and exclude tomorrow and day thirty-one',()=>{
 const db=fixture();try{
  post(db,1,10,0,0,'2026-10-15T21:00:00Z');
  post(db,2,20,0,0,'2026-11-14T20:59:59Z');
  post(db,3,9999,99,0,'2026-10-15T20:59:59Z');
  post(db,4,9999,99,0,'2026-11-14T21:00:00Z');
  post(db,5,9999,99,0,'not a date');
  const result=metrics.vse(db,1,'2026-11-14').metriki;
  assert.equal(result.prosmotrov_srednee.znachenie,15);assert.equal(result.prosmotrov_srednee.publikacij_v_schete,2);assert.equal(result.vovlechennost.znachenie,0);
 }finally{db.close();}
});
test('a carried reach keeps its true date; growth ignores missing historical subscribers and future snapshots',()=>{
 const db=fixture();try{
  const insert=db.prepare('INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,ohvat,daty_izmerenij) VALUES(1,?,?,?,?)');
  insert.run('2026-11-07',100,null,null);insert.run('2026-11-13',110,420,null);
  insert.run('2026-11-14',120,420,JSON.stringify({podpischikov:'2026-11-14',ohvat:'2026-11-13'}));insert.run('2026-11-15',99999,99999,null);
  let result=metrics.vse(db,1,'2026-11-14').metriki;
  assert.deepEqual(result.ohvat,{znachenie:420,obnovleno:'2026-11-13'});assert.equal(result.podpischikov.znachenie,120);assert.equal(result.prirost_podpischikov.znachenie,20);
  assert.equal(result.ohvat_k_podpischikam.raznye_daty,true);assert.equal(result.ohvat_k_podpischikam.obnovleno,'2026-11-13');
  db.prepare("UPDATE zamery_akkauntov SET podpischikov=NULL WHERE data='2026-11-07'").run();result=metrics.vse(db,1,'2026-11-14').metriki;assert.equal(result.prirost_podpischikov.znachenie,null);
 }finally{db.close();}
});
test('real zero is known, empty measurements stay unknown, and a half-integer median is exact',()=>{
 const db=fixture();try{
  assert.equal(metrics.vse(db,1,'2026-11-14').metriki.prosmotrov_srednee.znachenie,null);
  post(db,1,0,0,0);assert.equal(metrics.vse(db,1,'2026-11-14').metriki.prosmotrov_srednee.znachenie,0);
  assert.equal(metrics.vse(db,1,'2026-11-14').metriki.vovlechennost.znachenie,null);
  assert.equal(metrics.mediana([1,2,null]),1.5);
 }finally{db.close();}
});
test('aggregate measurement dates come from actual observed fields, not the publication date or an unrelated account snapshot',()=>{
 const db=fixture();try{
  post(db,1,100,10,0);post(db,2,100,10,0);
  db.prepare('INSERT INTO zamery_publikacij(publikacija_id,data,prosmotrov,lajkov) VALUES(?,?,?,?)').run('metric-1','2026-11-13',100,10);
  db.prepare('INSERT INTO zamery_publikacij(publikacija_id,data,prosmotrov,lajkov) VALUES(?,?,?,?)').run('metric-2','2026-11-14',100,10);
  const result=metrics.vse(db,1,'2026-11-14').metriki;
  assert.equal(result.prosmotrov_srednee.obnovleno,'2026-11-13');assert.equal(result.vovlechennost.obnovleno,'2026-11-13');
 }finally{db.close();}
});
