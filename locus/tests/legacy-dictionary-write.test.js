const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {plan,getTarget,apply}=require('../ops/legacy-dictionaries.cjs');
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'locus-import-')),file=path.join(dir,'target.db');
  execFileSync(process.execPath,['db/migrate.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,LOCUS_BAZA:file},stdio:'pipe'});
  const db=new DatabaseSync(file);db.exec("PRAGMA foreign_keys=ON;INSERT INTO ljudi(id,imja,imja_norm,komanda,dostup,chto_eto,versija) VALUES(1,'Operator','operator',1,'polnyj','chelovek',1);INSERT OR IGNORE INTO napravlenija(kod,nazvanie) VALUES('media','Media'),('synapt','Synapt')");
  const source={crm_contact:[{id:'crm-alice',name:'Alice A',tg:'@alice_fixture',company:''}],base_person:[{id:'base-alice',name:'Alice',tg:'@alice_fixture',email:'alice@example.test',phone:'+79991234567 ext 123'}],
    out_blog:[{id:'company',company:'Fixture company',nick:'Company',email:'info@example.test',dm_name:'Manager',tg_dm:'@manager_fixture'}],
    med_acc:[{id:'own',platform:'telegram',handle:'fixture_own',url:'https://t.me/fixture_own',dir:'media',active:1},{id:'client',platform:'instagram',handle:'fixture_client',dir:'it',proj_id:'unconfirmed-project'}]};
  return {dir,file,db,source,close(){db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
function counts(db){return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>[r.name,db.prepare('SELECT count(*) n FROM "'+r.name+'"').get().n]));}
test('dictionary import keeps provenance, roles and raw contacts; repeat adds nothing and never imports state or credentials',()=>{
  const f=fixture();try{
    const before=counts(f.db),preview=plan(f.source,getTarget(f.db)),result=apply(f.source,f.db,preview.plan_sha256,1);
    assert.equal(result.created_people,3);assert.equal(result.created_accounts,1);assert.equal(result.mappings_added,5);assert.equal(result.review_accounts,1);
    const manager=f.db.prepare("SELECT * FROM ljudi WHERE imja='Manager'").get();assert.equal(manager.rol_v_baze,'kontaktnoe_lico');assert.equal(manager.komanda,0);assert.equal(manager.dostup,'bez_deneg');
    const company=f.db.prepare("SELECT * FROM ljudi WHERE imja='Fixture company'").get();assert.equal(company.rol_v_baze,'sobstvennyj');assert.equal(company.jurlico,1);
    const ids=f.db.prepare("SELECT chelovek_id FROM import_svjazi WHERE tablica IN ('crm_contact','base_person')").all();assert.equal(new Set(ids.map(r=>r.chelovek_id)).size,1);
    assert.equal(f.db.prepare("SELECT count(*) n FROM kontakty WHERE znachenie=?").get('+79991234567 ext 123').n,0);
    assert.ok(f.db.prepare("SELECT zametka FROM ljudi WHERE id=?").get(ids[0].chelovek_id).zametka.includes('+79991234567 ext 123'));
    const after=counts(f.db);for(const table of ['sotrudnichestva','proekty','zadachi','dokumenty','platezhi','vhod','sessii','celi','rezultaty'])assert.equal(after[table],before[table],table);
    const next=plan(f.source,getTarget(f.db)),again=apply(f.source,f.db,next.plan_sha256,1);
    assert.equal(again.created_people+again.created_accounts+again.created_contacts+again.mappings_added,0);assert.deepEqual(counts(f.db),after);
    assert.equal(f.db.prepare("SELECT count(*) n FROM versii_polej WHERE tablica=''").get().n,0);
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{f.close();}
});
test('stale preview and changed source never overwrite a peer or imported person',()=>{
  const f=fixture();try{
    const stale=plan(f.source,getTarget(f.db));f.db.exec("INSERT INTO ljudi(imja,imja_norm,versija) VALUES('Peer','peer',1)");const before=counts(f.db);
    assert.throws(()=>apply(f.source,f.db,stale.plan_sha256,1),/stale/);assert.deepEqual(counts(f.db),before);
    const fresh=plan(f.source,getTarget(f.db));apply(f.source,f.db,fresh.plan_sha256,1);
    const alice=f.db.prepare("SELECT chelovek_id FROM import_svjazi WHERE tablica='base_person'").get().chelovek_id;
    f.db.prepare("UPDATE ljudi SET imja='Peer edited Alice' WHERE id=?").run(alice);
    f.source.base_person[0].name='Changed in old system';const changed=plan(f.source,getTarget(f.db));assert.ok(changed.groups.some(g=>g.action==='review_source_changed'));
    const after=counts(f.db);const result=apply(f.source,f.db,changed.plan_sha256,1);assert.equal(result.created_people,0);assert.equal(result.mappings_added,0);
    assert.equal(f.db.prepare('SELECT imja FROM ljudi WHERE id=?').get(alice).imja,'Peer edited Alice');assert.deepEqual(counts(f.db),after);
  }finally{f.close();}
});
test('a mid-import fault rolls back people, contacts, journal, mappings and field metadata together',()=>{
  const f=fixture();try{
    const preview=plan(f.source,getTarget(f.db)),before=counts(f.db),metadata=f.db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all();
    f.db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON import_svjazi WHEN NEW.tablica='base_person' BEGIN SELECT RAISE(ABORT,'fixture mapping failure'); END");
    assert.throws(()=>apply(f.source,f.db,preview.plan_sha256,1),/fixture mapping failure/);
    assert.deepEqual(counts(f.db),before);assert.deepEqual(f.db.prepare('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').all(),metadata);
  }finally{f.close();}
});
test('mapping constraints reject missing, nonexistent or two target references',()=>{
  const f=fixture();try{
    const insert=f.db.prepare("INSERT INTO import_svjazi(istochnik,tablica,staryj_id,chast,chelovek_id,akkaunt_id,sha256,ishodnye_dannye,sozdano) VALUES('fixture','base_person',?,'person',?,?,'hash','{}','2030-01-01')");
    assert.throws(()=>insert.run('none',null,null),/CHECK/);assert.throws(()=>insert.run('missing',999999,null),/FOREIGN KEY/);
    f.db.exec("INSERT INTO akkaunty(id,ploshadka,nazvanie,uroven,napravlenie) VALUES(1,'telegram','fixture','public','media')");
    assert.throws(()=>insert.run('both',1,1),/CHECK/);insert.run('one',1,null);
    assert.throws(()=>f.db.prepare('DELETE FROM ljudi WHERE id=1').run(),/FOREIGN KEY/);
  }finally{f.close();}
});
