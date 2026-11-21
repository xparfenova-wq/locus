const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const {nagruzka,mediana}=require('../api/nagruzka.js');
const cal=require('../api/kalendar.js');
test('личная медиана: пустые недели исключены, минимум четыре и порог строго больше 1,5',()=>{
  assert.equal(mediana([6,9,8,0,11,7,8,10]),8);
  assert.equal(mediana([3,4,5,6]),4.5);
  assert.equal(mediana([3,4,5,0,0]),null);
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8'));
    db.function('locus_today',()=> '2026-11-16');
    db.exec("INSERT INTO nastrojki_sistemy(chasovoj_pojas,nedel_v_okne) VALUES('Europe/Moscow',8)");
    db.exec("INSERT INTO ljudi(id,imja,komanda) VALUES(1,'История восемь недель',1),(2,'Мало истории',1)");
    const den='2026-11-16',week=cal.iso_nedelja(den);
    const insert=db.prepare("INSERT INTO zadachi(nazvanie,napravlenie,otvetstvennyj,status,sprint,god_sprinta,udaleno) VALUES('Workload fixture','synapt',?,?,?,2026,0)");
    const event=db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,stalo,kogda) VALUES('zadacha',?,'status','sdelano',?)");
    for(const [person,counts] of [[1,[6,9,8,0,11,7,8,10]],[2,[2,4,3,0,0,0,0,0]]]){
      for(let i=0;i<counts.length;i++){
        const w=cal.sdvinut_nedelju(week.god,week.nomer,i-8);
        for(let n=0;n<counts[i];n++){
          const row=insert.run(person,'sdelano',w.nomer);
          event.run(row.lastInsertRowid,w.nachalo+' 12:00:00');
        }
      }
      for(let i=0;i<13;i++)insert.run(person,'v_plane',week.nomer);
    }
    let result=nagruzka(db,{den});
    const mine=result.find(x=>x.id===1),little=result.find(x=>x.id===2);
    assert.equal(mine.mediana,8);assert.equal(mine.porog,12);assert.equal(mine.otkryto,13);assert.equal(mine.peregruz,true);
    assert.equal(mine.nepustyh_nedel,7);assert.equal(little.mediana,null);assert.equal(little.peregruz,false);
    db.exec("UPDATE zadachi SET status='kogda_nibud' WHERE id=(SELECT max(id) FROM zadachi WHERE otvetstvennyj=1)");
    assert.equal(nagruzka(db,{den,chelovek_id:1})[0].peregruz,false);
    db.exec("UPDATE nastrojki_sistemy SET porog_peregruza='3'");
    assert.equal(nagruzka(db,{den,chelovek_id:1})[0].porog,24);assert.equal(nagruzka(db,{den,chelovek_id:1})[0].peregruz,false);
    db.exec('UPDATE nastrojki_sistemy SET porog_peregruza=NULL');
    const late=insert.run(1,'sdelano',week.nomer);
    event.run(late.lastInsertRowid,'2026-11-15 22:30:00');
    assert.equal(nagruzka(db,{den,chelovek_id:1})[0].po_nedeljam.at(-1).zakryto,10);
    db.exec("UPDATE nastrojki_sistemy SET chasovoj_pojas='UTC'");
    assert.equal(nagruzka(db,{den,chelovek_id:1})[0].po_nedeljam.at(-1).zakryto,11);
    db.exec("UPDATE nastrojki_sistemy SET chasovoj_pojas='Europe/Moscow',nedel_v_okne=4");
    result=nagruzka(db,{den,chelovek_id:1})[0];
    assert.equal(result.mediana,9);assert.equal(result.nedel_v_okne,4);
  }finally{db.close();}
});
