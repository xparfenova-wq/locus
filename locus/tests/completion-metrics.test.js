const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {POKAZATELI}=require('../api/pokazateli.js');
test('закрытые задачи считаются по последнему фактическому закрытию в Москве, с отбором направления',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`CREATE TABLE zadachi(id INTEGER,status TEXT,udaleno INTEGER,napravlenie TEXT,srok TEXT);
      CREATE TABLE zhurnal(obekt TEXT,obekt_id INTEGER,pole TEXT,stalo TEXT,kogda TEXT);
      INSERT INTO zadachi VALUES(1,'sdelano',0,'synapt','2026-01-01'),
        (2,'sdelano',0,'media','2027-01-01'),(3,'sdelano',0,'synapt','2027-01-01'),
        (4,'sdelano',1,'synapt','2027-01-01'),(5,'v_rabote',0,'synapt','2027-01-01');
      INSERT INTO zhurnal VALUES('zadacha',1,'status','sdelano','2026-06-01 12:00:00'),
        ('zadacha',1,'status','sdelano','2026-12-31T22:30:00Z'),
        ('zadacha',2,'status','sdelano','2027-01-01 12:00:00'),
        ('zadacha',4,'status','sdelano','2027-01-01 12:00:00'),
        ('zadacha',5,'status','sdelano','2027-01-01 12:00:00');`);
    const count=(start,end)=>POKAZATELI.zadach_zakryto(db,{nachalo:start,konec:end},null,'synapt');
    assert.equal(count('2027-01-01','2027-01-01'),1);
    assert.equal(count('2026-12-31','2026-12-31'),0);
    assert.equal(count('2026-01-01','2026-01-01'),0);
    assert.equal(count('2026-06-01','2026-06-01'),0);
  }finally{db.close();}
});
