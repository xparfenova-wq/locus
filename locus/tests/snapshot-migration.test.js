const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
test('snapshot date migration leaves old measurements, rowids and field-version history unchanged',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-snapshot-')),file=path.join(folder,'test.db');let db;
 const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,LOCUS_BAZA:file},stdio:'pipe'});
 try{
  migrate();db=new DatabaseSync(file);db.prepare("INSERT INTO akkaunty(id,nazvanie) VALUES(500001,'Snapshot migration fixture')").run();
  db.prepare("INSERT INTO zamery_akkauntov(akkaunt_id,data,podpischikov,ohvat) VALUES(500001,'2026-11-13',100,420)").run();
  db.exec('ALTER TABLE zamery_akkauntov DROP COLUMN daty_izmerenij;DELETE FROM migracii WHERE nomer=103');
  const old=JSON.stringify(db.prepare('SELECT rowid,* FROM zamery_akkauntov ORDER BY rowid').all());
  const versions=JSON.stringify(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all());
  db.close();db=null;migrate();db=new DatabaseSync(file);
  const rows=db.prepare('SELECT rowid,* FROM zamery_akkauntov ORDER BY rowid').all();
  assert.equal(JSON.stringify(rows.map(({daty_izmerenij,...row})=>row)),old);assert.ok(rows.every(row=>row.daty_izmerenij===null));
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all()),versions);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
