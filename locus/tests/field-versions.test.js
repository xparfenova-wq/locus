const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');

test('field versions track raw SQL, recursive triggers, rollback, keys and historical boundaries',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'locus-fields-')),file=path.join(dir,'test.db');
  const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,LOCUS_BAZA:file},stdio:'pipe'});
  let db;
  try{
    migrate();db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
    const get=id=>db.prepare('SELECT * FROM zadachi WHERE id=?').get(id);
    const meta=id=>db.prepare("SELECT * FROM versii_polej WHERE tablica='zadachi' AND obekt_id=? ORDER BY pole").all(id);
    for(const recursive of [0,1]){
      db.exec('PRAGMA recursive_triggers='+recursive);
      const inserted=db.prepare("INSERT INTO zadachi(nomer,nazvanie,napravlenie,otvetstvennyj,status) VALUES(?,'Original','synapt',1,'v_plane')").run(32000+recursive);
      const id=Number(inserted.lastInsertRowid);assert.equal(get(id).versija,1);
      db.prepare("UPDATE zadachi SET nazvanie='First' WHERE id=?").run(id);assert.equal(get(id).versija,2);
      assert.equal(meta(id).find(r=>r.pole==='nazvanie').versija,2);
      db.prepare("UPDATE zadachi SET opisanie='Description',versija=versija+1 WHERE id=?").run(id);assert.equal(get(id).versija,3);
      assert.equal(meta(id).find(r=>r.pole==='nazvanie').versija,2);assert.equal(meta(id).find(r=>r.pole==='opisanie').versija,3);assert.equal(meta(id).find(r=>r.pole==='*').versija,1);
      db.prepare('UPDATE zadachi SET versija=0 WHERE id=?').run(id);assert.equal(get(id).versija,3);
      const before=meta(id);
      db.exec("CREATE TRIGGER qa_fail_field BEFORE INSERT ON versii_polej WHEN NEW.tablica='zadachi' AND NEW.pole='nazvanie' BEGIN SELECT RAISE(ABORT,'field metadata failure'); END");
      try{assert.throws(()=>db.prepare("UPDATE zadachi SET nazvanie='Partial' WHERE id=?").run(id),/field metadata failure/);}
      finally{db.exec('DROP TRIGGER qa_fail_field');}
      assert.equal(get(id).nazvanie,'First');assert.equal(get(id).versija,3);assert.deepEqual(meta(id),before);
      db.prepare('DELETE FROM zadachi WHERE id=?').run(id);assert.equal(meta(id).length,0);
    }
    db.exec("INSERT INTO ljudi(id,imja) VALUES(500001,'Field key fixture'); INSERT INTO anketa(chelovek_id,kak_obraschatsja) VALUES(500001,'Original'); UPDATE anketa SET kak_obraschatsja='Changed' WHERE chelovek_id=500001");
    assert.equal(db.prepare('SELECT versija FROM anketa WHERE chelovek_id=500001').get().versija,2);
    assert.equal(db.prepare("SELECT versija FROM versii_polej WHERE tablica='anketa' AND obekt_id=500001 AND pole='kak_obraschatsja'").get().versija,2);
    db.prepare("UPDATE versii_polej SET kto=500001 WHERE tablica='anketa' AND obekt_id=500001 AND pole='kak_obraschatsja'").run();
    const historical=db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all();
    db.close();db=null;migrate();db=new DatabaseSync(file);
    assert.deepEqual(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all(),historical);
                                                                                    
    for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'versii_%'").all())db.exec('DROP TRIGGER "'+name+'"');
    db.exec("DROP TABLE versii_polej;DELETE FROM migracii WHERE nomer=100;UPDATE ljudi SET versija=7 WHERE id=500001");
    db.close();db=null;migrate();db=new DatabaseSync(file);
    assert.equal(db.prepare("SELECT versija FROM versii_polej WHERE tablica='ljudi' AND obekt_id=500001 AND pole='*'").get().versija,7);
    assert.equal(db.prepare('SELECT versija FROM ljudi WHERE id=500001').get().versija,7);
    const rows=db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all();db.close();db=null;
    migrate();db=new DatabaseSync(file);assert.deepEqual(db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all(),rows);
    assert.equal(Object.values(db.prepare('PRAGMA integrity_check').get())[0],'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n,86);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name='zaprosy_planov_kampanij_delete'").get().n,1);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name='zaprosy_istochnikov_publikacij_udalenie'").get().n,1);
    for(const name of ['versii_tezisy_insert','versii_tezisy_update','versii_tezisy_delete'])assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name=?").get(name).n,1);
    for(const name of ['versii_nastroek_insert','versii_nastroek_update','versii_nastroek_delete'])assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name=?").get(name).n,1);
  }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
