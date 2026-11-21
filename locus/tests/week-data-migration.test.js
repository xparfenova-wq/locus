const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../db/migracii/098-gody-nedelnyh-dannyh.sql'),'utf8');
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE grafik(id INTEGER PRIMARY KEY,chelovek_id INTEGER,nedelja INTEGER,den INTEGER,chasov INTEGER);
    CREATE TABLE lenta(id INTEGER PRIMARY KEY,sprint INTEGER,sozdano TEXT);
    CREATE TABLE snimki_planerki(napravlenie TEXT,nedelja INTEGER,dannye TEXT,sozdano TEXT,pereschitan TEXT,
      PRIMARY KEY(napravlenie,nedelja));
    CREATE TABLE rassylka_plan(id INTEGER,rassylka_id INTEGER,nedelja INTEGER,plan_soobshenij INTEGER,
      plan_otvetov INTEGER,plan_soglasij INTEGER,plan_publikacij INTEGER,rabochih_dnej INTEGER,po_ljudjam TEXT,
      PRIMARY KEY(rassylka_id,nedelja));
    INSERT INTO grafik VALUES(1,2,43,3,7);
    INSERT INTO lenta VALUES(1,53,'2026-12-31 22:00:00');
    INSERT INTO snimki_planerki VALUES('synapt',1,'{"god":2026,"untouched":"payload"}','2027-01-01 23:59:00',NULL);`);
  return db;
}
test('расширение ключей годом сохраняет исходные значения и позволяет два одинаковых номера недель',()=>{
  const db=fixture();try{
    db.exec('BEGIN');db.exec(sql);db.exec('COMMIT');
    assert.deepEqual({...db.prepare('SELECT * FROM grafik').get()},{id:1,chelovek_id:2,nedelja:43,den:3,chasov:7,god:2026});
    assert.equal(db.prepare('SELECT god_sprinta FROM lenta').get().god_sprinta,2026);
    const snapshot=db.prepare('SELECT * FROM snimki_planerki').get();
    assert.equal(snapshot.dannye,'{"god":2026,"untouched":"payload"}');assert.equal(snapshot.god,2026);
    db.exec("INSERT INTO snimki_planerki(napravlenie,nedelja,god,dannye) VALUES('synapt',1,2027,'new');");
    assert.equal(db.prepare('SELECT count(*) n FROM snimki_planerki').get().n,2);
  }finally{db.close();}
});
for(const kind of ['grafik','rassylka_plan'])test('неизвестный старый год останавливает миграцию целиком: '+kind,()=>{
  const db=fixture();try{
    if(kind==='grafik')db.exec('UPDATE grafik SET nedelja=1');
    else db.exec('INSERT INTO rassylka_plan(rassylka_id,nedelja,plan_soobshenij) VALUES(1,1,100)');
    const tables=['grafik','lenta','snimki_planerki','rassylka_plan'];
    const state=()=>JSON.stringify(tables.map(t=>db.prepare('SELECT * FROM '+t).all()));
    const before=state();db.exec('BEGIN');assert.throws(()=>db.exec(sql),/CHECK constraint failed/);db.exec('ROLLBACK');
    assert.equal(state(),before);
    assert.ok(!db.prepare('PRAGMA table_info(grafik)').all().some(c=>c.name==='god'));
  }finally{db.close();}
});
