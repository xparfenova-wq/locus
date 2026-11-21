const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite'),{spawnSync}=require('node:child_process');
function fixture(){
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-comments-migration-')),file=path.join(folder,'test.db');
 const migrate=()=>spawnSync(process.execPath,['db/migrate.js'],{cwd:root,env:{...process.env,LOCUS_BAZA:file},encoding:'utf8'});
 assert.equal(migrate().status,0);const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
 db.exec("INSERT INTO ljudi(id,imja,komanda) VALUES(500001,'Comment migration fixture',1)");
 db.exec("INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,tip,status,sprint,god_sprinta,srok,otvetstvennyj) VALUES(500001,8123,'Comment migration task','synapt','vnutrennjaja','v_plane',46,2026,'2026-11-15',500001)");
 db.exec("DROP TABLE kommentarii;DELETE FROM versii_polej WHERE tablica='kommentarii';DELETE FROM migracii WHERE nomer=106;CREATE TABLE kommentarii(id INTEGER PRIMARY KEY AUTOINCREMENT,zadacha_id INTEGER,chelovek_id INTEGER,tekst TEXT,sozdano TEXT)");
 return {db,file,migrate,close:()=>{db.close();fs.rmSync(folder,{recursive:true,force:true});}};
}
for(const keepRow of [true,false])test('comment migration preserves literal history and never reuses deleted comment IDs; legacy row '+keepRow,()=>{
 const f=fixture(),db=f.db,literal='  Legacy @Comment_migration_fixture < > & "quotes" 😀\nsecond line  ';
 try{
  if(keepRow)db.prepare('INSERT INTO kommentarii(id,zadacha_id,chelovek_id,tekst,sozdano) VALUES(42,500001,500001,?,?)').run(literal,'2001-02-03 04:05:06');
  db.exec("INSERT INTO kommentarii(id,zadacha_id,chelovek_id,tekst,sozdano) VALUES(999,500001,500001,'Deleted high ID','2001-02-03 04:05:06');DELETE FROM kommentarii WHERE id=999");
  const history=JSON.stringify(db.prepare("SELECT * FROM versii_polej WHERE tablica<>'kommentarii' ORDER BY tablica,obekt_id,pole").all());
  const old=db.prepare('SELECT rowid,id,zadacha_id,chelovek_id,tekst,sozdano FROM kommentarii ORDER BY id').all();
  const result=f.migrate();assert.equal(result.status,0,result.stderr);
  assert.deepEqual(db.prepare('SELECT rowid,id,zadacha_id,chelovek_id,tekst,sozdano FROM kommentarii ORDER BY id').all(),old);
  for(const row of db.prepare('SELECT * FROM kommentarii').all()){assert.equal(row.upominanija,'[]');assert.equal(row.izmeneno,null);assert.equal(row.versija,1);}
  assert.equal(db.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get('kommentarii').seq,999);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM versii_polej WHERE tablica<>'kommentarii' ORDER BY tablica,obekt_id,pole").all()),history);
  assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM zadacha_uchastniki').get().n,0);
  const fresh=db.prepare("INSERT INTO kommentarii(zadacha_id,chelovek_id,tekst,sozdano) VALUES(500001,500001,'New comment','2026-11-14 00:00:00')").run();assert.equal(Number(fresh.lastInsertRowid),1000);
  const rows=JSON.stringify(db.prepare('SELECT rowid,* FROM kommentarii ORDER BY id').all());
  const again=f.migrate();assert.equal(again.status,0,again.stderr);assert.equal(JSON.stringify(db.prepare('SELECT rowid,* FROM kommentarii ORDER BY id').all()),rows);
  assert.throws(()=>db.prepare("INSERT INTO kommentarii(zadacha_id,chelovek_id,tekst,sozdano) VALUES(999999,500001,'orphan','2001-01-01')").run(),/FOREIGN KEY/);
  assert.throws(()=>db.prepare("INSERT INTO kommentarii(zadacha_id,chelovek_id,tekst,sozdano) VALUES(500001,999999,'orphan','2001-01-01')").run(),/FOREIGN KEY/);
  for(const value of ['','   ','x'.repeat(5001)])assert.throws(()=>db.prepare("INSERT INTO kommentarii(zadacha_id,chelovek_id,tekst,sozdano) VALUES(500001,500001,?,'2001-01-01')").run(value),/CHECK/);
  db.prepare('UPDATE kommentarii SET tekst=? WHERE id=1000').run('Raw SQL update');assert.equal(db.prepare('SELECT versija FROM kommentarii WHERE id=1000').get().versija,2);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.close();}
});
test('invalid legacy comments stop the migration without truncating text or marking it applied',()=>{
 for(const invalid of ['long','orphan','null-author']){
  const f=fixture(),db=f.db;
  try{
   db.prepare('INSERT INTO kommentarii(id,zadacha_id,chelovek_id,tekst,sozdano) VALUES(42,?,?,?,?)')
    .run(invalid==='orphan'?999999:500001,invalid==='null-author'?null:500001,invalid==='long'?'x'.repeat(5001):'Legacy literal','2001-02-03 04:05:06');
   const before=JSON.stringify(db.prepare('SELECT rowid,* FROM kommentarii').all());
   const result=f.migrate();assert.notEqual(result.status,0);assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE nomer=106').get().n,0);
   assert.equal(JSON.stringify(db.prepare('SELECT rowid,* FROM kommentarii').all()),before);
   assert.equal(db.prepare('PRAGMA table_info(kommentarii)').all().length,5);
  }finally{f.close();}
 }
});
