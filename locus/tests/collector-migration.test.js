const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
function fixture(){
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-collector-migration-')),file=path.join(folder,'test.db');
 const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env:{...process.env,LOCUS_BAZA:file},stdio:'pipe'});
 migrate();const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=OFF');
 for(const table of ['zamery_publikacij','publikacii','zamery_akkauntov'])db.exec('DROP TABLE '+table);
 db.exec(fs.readFileSync(path.join(__dirname,'fixtures/collector-before-104.sql'),'utf8'));
 db.exec('DROP INDEX idx_sbor_kljuch;ALTER TABLE zapuski_sbora DROP COLUMN kljuch_zapuska;ALTER TABLE zapuski_sbora DROP COLUMN sha256;ALTER TABLE zapuski_sbora DROP COLUMN zaprosheno;DELETE FROM migracii WHERE nomer=104');
 db.prepare("INSERT INTO akkaunty(id,nazvanie) VALUES(500001,'Collector migration fixture')").run();
 db.prepare('INSERT INTO publikacii(rowid,id,akkaunt_id,publikacija_id,prosmotrov) VALUES(42,?,?,?,100)').run('500001_9007199254740993',500001,'9007199254740993');
 db.prepare('INSERT INTO publikacii(rowid,id,akkaunt_id,publikacija_id,prosmotrov) VALUES(43,?,?,?,0)').run('500001_AbC_12',500001,'AbC_12');
 db.prepare('INSERT INTO zamery_publikacij(rowid,publikacija_id,data,prosmotrov) VALUES(17,?,?,100)').run('500001_9007199254740993','2001-05-02');
 db.prepare('INSERT INTO zamery_akkauntov(rowid,akkaunt_id,data,podpischikov,ohvat,daty_izmerenij) VALUES(23,500001,?,100,420,?)').run('2001-05-02',JSON.stringify({podpischikov:'2001-05-02',ohvat:'2001-05-01'}));
 db.prepare("INSERT INTO zapuski_sbora(id,kogda,akkaunt_id,uroven,primechanie) VALUES(7,'2001-05-02 09:00:00',500001,'public','запуск поставлен в очередь вручную')").run();
 return {db,folder,file,migrate};
}
test('collector migration keeps rowids, exact upstream IDs, old measurements and field metadata and installs real references',()=>{
 const f=fixture();let db=f.db;try{
  const rows=table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all().map(row=>({...row}));
  const oldPosts=db.prepare('SELECT rowid,id,akkaunt_id,CAST(publikacija_id AS TEXT) publikacija_id,ssylka,data_vyhoda,format,zagolovok,prosmotrov,lajkov,kommentariev,peresylok,sohranenij,ohvat,extra FROM publikacii ORDER BY rowid').all().map(row=>({...row}));
  const oldSnapshots=rows('zamery_akkauntov'),oldPostSnapshots=rows('zamery_publikacij'),oldRuns=rows('zapuski_sbora');
  const versions=JSON.stringify(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all());
  db.close();db=null;f.migrate();db=new DatabaseSync(f.file);db.exec('PRAGMA foreign_keys=ON');
  assert.deepEqual(rows('publikacii').map(({daty_izmerenij,...row})=>row),oldPosts);
  assert.deepEqual(rows('zamery_akkauntov'),oldSnapshots);assert.deepEqual(rows('zamery_publikacij').map(({daty_izmerenij,...row})=>row),oldPostSnapshots);
  assert.deepEqual(rows('zapuski_sbora').map(({kljuch_zapuska,sha256,zaprosheno,...row})=>row),oldRuns);
  assert.equal(db.prepare("SELECT publikacija_id FROM publikacii WHERE rowid=42").get().publikacija_id,'9007199254740993');
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all()),versions);
  assert.throws(()=>db.prepare('UPDATE publikacii SET akkaunt_id=99999999 WHERE rowid=42').run(),/FOREIGN KEY/);
  assert.throws(()=>db.prepare("UPDATE zamery_publikacij SET publikacija_id='missing' WHERE rowid=17").run(),/FOREIGN KEY/);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db?.close();fs.rmSync(f.folder,{recursive:true,force:true});}
});
test('a legacy orphan stops the entire collector migration instead of guessing a replacement',()=>{
 const f=fixture();let db=f.db;try{
  db.prepare("UPDATE publikacii SET akkaunt_id=99999999 WHERE rowid=42").run();
  const before=db.prepare('SELECT rowid,id,akkaunt_id,CAST(publikacija_id AS TEXT) upstream FROM publikacii ORDER BY rowid').all();db.close();db=null;
  assert.throws(f.migrate,/migration|FOREIGN|связи|миграция/);db=new DatabaseSync(f.file);
  assert.deepEqual(db.prepare('SELECT rowid,id,akkaunt_id,CAST(publikacija_id AS TEXT) upstream FROM publikacii ORDER BY rowid').all(),before);
  assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE nomer=104').get().n,0);assert.ok(!db.prepare('PRAGMA table_info(zapuski_sbora)').all().some(row=>row.name==='kljuch_zapuska'));
 }finally{db?.close();fs.rmSync(f.folder,{recursive:true,force:true});}
});
