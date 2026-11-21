const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite'),{execFileSync}=require('node:child_process');
test('profile counter migration preserves all existing answers and field history, tracks raw SQL and survives deletion and remigration',()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-profile-migration-')),file=path.join(folder,'test.db');let db;
 const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env:{...process.env,LOCUS_BAZA:file},stdio:'pipe'});
 try{
  migrate();db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  db.exec("INSERT INTO ljudi(id,imja,komanda) VALUES(500001,'Profile migration fixture',1)");
  db.prepare('INSERT INTO anketa(chelovek_id,missija,v_chem_polezna,kogda_v_seti,versija) VALUES(500001,?,?,?,17)').run('Original <b>literal</b> answer','Original work answer','Legacy retained answer');
  db.exec('DROP TRIGGER schetchik_ankety_vstavka;DROP TRIGGER schetchik_ankety_pravka;DROP TABLE schetchiki_anket;DELETE FROM migracii WHERE nomer=105');
  const rows=table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all().map(row=>({...row}));
  const original=rows('anketa'),metadata=JSON.stringify(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all());
  db.close();db=null;migrate();db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  assert.deepEqual(rows('anketa'),original);assert.equal(JSON.stringify(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all()),metadata);
  assert.equal(db.prepare('SELECT poslednjaja_versija v FROM schetchiki_anket WHERE chelovek_id=500001').get().v,17);
  db.prepare("UPDATE anketa SET missija='Direct SQL update' WHERE chelovek_id=500001").run();
  assert.equal(db.prepare('SELECT versija FROM anketa WHERE chelovek_id=500001').get().versija,18);
  assert.equal(db.prepare('SELECT poslednjaja_versija v FROM schetchiki_anket WHERE chelovek_id=500001').get().v,18);
  db.prepare('DELETE FROM anketa WHERE chelovek_id=500001').run();
  assert.equal(db.prepare('SELECT poslednjaja_versija v FROM schetchiki_anket WHERE chelovek_id=500001').get().v,18);
  db.close();db=null;migrate();db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
  assert.equal(db.prepare('SELECT poslednjaja_versija v FROM schetchiki_anket WHERE chelovek_id=500001').get().v,18);
  assert.throws(()=>db.prepare('UPDATE schetchiki_anket SET poslednjaja_versija=0 WHERE chelovek_id=500001').run(),/CHECK/);
  db.prepare('DELETE FROM ljudi WHERE id=500001').run();assert.equal(db.prepare('SELECT count(*) n FROM schetchiki_anket WHERE chelovek_id=500001').get().n,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
