const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite'),{spawnSync}=require('node:child_process');
function fixture(){
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-membership-migration-')),file=path.join(folder,'test.db');
 const migrate=()=>spawnSync(process.execPath,['db/migrate.js'],{cwd:root,env:{...process.env,LOCUS_BAZA:file},encoding:'utf8'});assert.equal(migrate().status,0);const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
 db.exec("INSERT INTO ljudi(id,imja,komanda) VALUES(500001,'Migration colleague fixture',1),(500002,'Second colleague fixture',1);INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,otvetstvennyj,status) VALUES(500001,8123,'Migration task fixture','synapt',500001,'v_plane')");
 db.exec('DROP TABLE zadacha_uchastniki;DELETE FROM migracii WHERE nomer=107;CREATE TABLE zadacha_uchastniki(zadacha_id INTEGER,chelovek_id INTEGER,PRIMARY KEY(zadacha_id,chelovek_id))');
 return{db,migrate,close(){db.close();fs.rmSync(folder,{recursive:true,force:true});}};
}
test('membership migration preserves legacy pairs and order, assigns no invented date, and cascades only physical deletion',()=>{
 const f=fixture(),db=f.db;
 try{
  db.exec('INSERT INTO zadacha_uchastniki(rowid,zadacha_id,chelovek_id) VALUES(7,500001,500002),(99,500001,500001)');const old=db.prepare('SELECT rowid AS original_rowid,zadacha_id,chelovek_id FROM zadacha_uchastniki ORDER BY rowid').all(),history=JSON.stringify(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all());
  const migrated=f.migrate();assert.equal(migrated.status,0,migrated.stderr);assert.deepEqual(db.prepare('SELECT rowid AS original_rowid,zadacha_id,chelovek_id FROM zadacha_uchastniki ORDER BY rowid').all(),old);assert.ok(db.prepare('SELECT dobavleno FROM zadacha_uchastniki').all().every(r=>r.dobavleno===null));assert.equal(JSON.stringify(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all()),history);
  db.exec('DELETE FROM zadacha_uchastniki WHERE id=99');const inserted=db.prepare('INSERT INTO zadacha_uchastniki(zadacha_id,chelovek_id) VALUES(500001,500001)').run();assert.equal(Number(inserted.lastInsertRowid),100);assert.ok(db.prepare('SELECT dobavleno FROM zadacha_uchastniki WHERE id=100').get().dobavleno);
  assert.equal(f.migrate().status,0);assert.equal(db.prepare('SELECT count(*) n FROM zadacha_uchastniki').get().n,2);
  db.exec('DELETE FROM ljudi WHERE id=500002');assert.equal(db.prepare('SELECT count(*) n FROM zadacha_uchastniki').get().n,1);
  db.exec('DELETE FROM zadachi WHERE id=500001');assert.equal(db.prepare('SELECT count(*) n FROM zadacha_uchastniki').get().n,0);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.close();}
});
test('unresolved legacy membership preserves raw identifiers and types in an audit table without guessing a colleague',()=>{
 for(const invalid of [null,999999999,'missing-legacy-person']){
  const f=fixture(),db=f.db;
  try{
   db.prepare('INSERT INTO zadacha_uchastniki(rowid,zadacha_id,chelovek_id) VALUES(99,500001,?)').run(invalid);const old=db.prepare('SELECT rowid,zadacha_id,chelovek_id,typeof(chelovek_id) value_type FROM zadacha_uchastniki').get();const result=f.migrate();assert.equal(result.status,0,result.stderr);
   const archived=db.prepare('SELECT staryj_rowid,zadacha_id_istochnika,chelovek_id_istochnika,typeof(chelovek_id_istochnika) value_type FROM nerazobrannye_svjazi').get();assert.equal(archived.staryj_rowid,old.rowid);assert.equal(archived.zadacha_id_istochnika,old.zadacha_id);assert.equal(archived.chelovek_id_istochnika,old.chelovek_id);assert.equal(archived.value_type,old.value_type);
   assert.equal(db.prepare('SELECT count(*) n FROM zadacha_uchastniki').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE nomer=107').get().n,1);const fresh=db.prepare('INSERT INTO zadacha_uchastniki(zadacha_id,chelovek_id) VALUES(500001,500001)').run();assert.equal(Number(fresh.lastInsertRowid),100);assert.equal(f.migrate().status,0);assert.equal(db.prepare('SELECT count(*) n FROM nerazobrannye_svjazi').get().n,1);
  }finally{f.close();}
 }
});
test('an archival write failure aborts the entire membership migration without discarding the original relation',()=>{
 const f=fixture(),db=f.db;
 try{
  db.exec("INSERT INTO zadacha_uchastniki(zadacha_id,chelovek_id) VALUES(500001,999999999);CREATE TRIGGER fixture_archive_failure BEFORE INSERT ON nerazobrannye_svjazi BEGIN SELECT RAISE(ABORT,'fixture archive rejection'); END;");const old=JSON.stringify(db.prepare('SELECT rowid,* FROM zadacha_uchastniki').all());assert.notEqual(f.migrate().status,0);assert.equal(JSON.stringify(db.prepare('SELECT rowid,* FROM zadacha_uchastniki').all()),old);assert.equal(db.prepare('SELECT count(*) n FROM nerazobrannye_svjazi').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE nomer=107').get().n,0);
 }finally{f.close();}
});
