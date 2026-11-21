const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
test('campaign-source migration preserves old rows and field versions and installs the same FK on upgrade',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-arrival-')),file=path.join(folder,'test.db');let db;
 const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,LOCUS_BAZA:file},stdio:'pipe'});
 try{
  migrate();db=new DatabaseSync(file);
  db.exec("INSERT INTO ljudi(id,imja) VALUES(500001,'Arrival migration fixture'); INSERT INTO sotrudnichestva(id,chelovek_id,napravlenie,rol) VALUES(500001,500001,'media','lid')");
  const freshFK=db.prepare('PRAGMA foreign_key_list(sotrudnichestva)').all().map(r=>[r.table,r.from,r.to,r.on_update,r.on_delete]);
  assert.ok(freshFK.some(r=>r[0]==='rassylki'&&r[1]==='rassylka_id'));
  db.exec('PRAGMA foreign_keys=OFF;DROP INDEX idx_sotr_istochnik_rassylka');
  for(const action of ['insert','update','delete'])db.exec('DROP TRIGGER versii_sotrudnichestva_'+action);
  db.exec('ALTER TABLE sotrudnichestva DROP COLUMN rassylka_id;DELETE FROM migracii WHERE nomer=102');
  const original=db.prepare('SELECT * FROM sotrudnichestva ORDER BY id').all();
  const metadata=db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all();
  db.close();db=null;migrate();db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_list(sotrudnichestva)').all().map(r=>[r.table,r.from,r.to,r.on_update,r.on_delete]),freshFK);
  const migrated=db.prepare('SELECT * FROM sotrudnichestva ORDER BY id').all();
  assert.deepEqual(migrated.map(({rassylka_id,...row})=>row),original.map(row=>({...row})));assert.ok(migrated.every(row=>row.rassylka_id===null));
  assert.deepEqual(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all(),metadata);
  assert.throws(()=>db.prepare('UPDATE sotrudnichestva SET rassylka_id=99999999 WHERE id=500001').run(),/FOREIGN KEY/);
  assert.equal(db.prepare('SELECT versija FROM sotrudnichestva WHERE id=500001').get().versija,1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
