const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {POKAZATELI}=require('../api/pokazateli.js');
const {polnota_formuly}=require('../api/pervaja-rol.js');
test('новый лид остаётся в первом периоде после клиента, архива и повторного обращения',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`CREATE TABLE ljudi(id INTEGER,rol_v_baze TEXT);
      CREATE TABLE sotrudnichestva(id INTEGER,chelovek_id INTEGER,napravlenie TEXT,rol TEXT,istochnik TEXT,sozdano TEXT);
      CREATE TABLE zhurnal(obekt TEXT,obekt_id INTEGER,pole TEXT,bylo TEXT,stalo TEXT,kogda TEXT);
      INSERT INTO ljudi VALUES(1,NULL),(2,NULL),(3,NULL),(4,NULL),(5,'kontaktnoe_lico');
      INSERT INTO sotrudnichestva(id,chelovek_id,napravlenie,rol,istochnik,sozdano) VALUES(1,1,'synapt','klient','rassylka','2026-01-01'),
        (2,1,'media','lid','rassylka','2027-02-01'),
        (3,2,'synapt','lid','rekomendacija','2027-02-01'),
        (4,3,'synapt','klient','rekomendacija','2027-02-01'),
        (5,4,'synapt','lid',NULL,'2027-02-01'),
        (6,5,'synapt','lid','rassylka','2027-02-01');
      INSERT INTO zhurnal VALUES
        ('sotrudnichestvo',1,'rol',NULL,'lid','2026-12-31T22:30:00Z'),
        ('sotrudnichestvo',1,'rol','lid','klient','2027-02-01 00:00:00'),
        ('sotrudnichestvo',1,'rol','klient','lid','2027-07-01 00:00:00'),
        ('sotrudnichestvo',1,'rol','lid','klient','2027-07-02 00:00:00'),
        ('sotrudnichestvo',2,'rol',NULL,'lid','2027-02-01 00:00:00'),
        ('sotrudnichestvo',3,'rol',NULL,'lid','2027-02-01 00:00:00'),
        ('sotrudnichestvo',4,'rol','lid','klient','2027-02-01 00:00:00'),
        ('sotrudnichestvo',6,'rol',NULL,'lid','2027-02-01 00:00:00');`);
    db.exec('ALTER TABLE ljudi ADD COLUMN arhiv INTEGER DEFAULT 0;ALTER TABLE sotrudnichestva ADD COLUMN arhiv INTEGER DEFAULT 0');
    const q=(formula,start,end,dir='synapt')=>POKAZATELI[formula](db,{nachalo:start,konec:end},null,dir);
    assert.equal(q('lidov','2027-01-01','2027-01-01'),1);
    assert.equal(q('lidov','2026-12-31','2026-12-31'),0);
    assert.equal(q('lidov','2027-07-01','2027-07-31'),0);
    assert.equal(q('lidov','2027-02-01','2027-02-28'),1);
    assert.equal(q('lidov','2027-02-01','2027-02-28','media'),1);
    assert.equal(q('lidov_ot_referalov','2027-01-01','2027-12-31'),1);
    assert.equal(q('novyh_klientov','2027-02-01','2027-02-28'),1);
    assert.equal(q('novyh_klientov','2027-07-01','2027-07-31'),0);
    assert.equal(q('klientov','2028-01-01','2028-12-31'),2);
    db.exec('UPDATE ljudi SET arhiv=1 WHERE id=1');
    assert.equal(q('klientov','2028-01-01','2028-12-31'),1);
    db.exec('UPDATE sotrudnichestva SET arhiv=1 WHERE id=4');
    assert.equal(q('klientov','2028-01-01','2028-12-31'),0);
    assert.equal(q('lidov','2027-01-01','2027-01-01'),1);
    assert.deepEqual(polnota_formuly(db,'lidov','synapt'),{polnaja:false,bez_istorii:2});
    assert.deepEqual(polnota_formuly(db,'lidov','media'),{polnaja:true,bez_istorii:0});
                                                                                
    db.exec(`INSERT INTO sotrudnichestva(id,chelovek_id,napravlenie,rol,istochnik,sozdano) VALUES(7,1,'synapt','lid','rekomendacija','2028-01-01');
      INSERT INTO zhurnal VALUES('sotrudnichestvo',7,'rol',NULL,'lid','2028-01-01 00:00:00');`);
    assert.equal(q('lidov_ot_referalov','2028-01-01','2028-12-31'),0);
    assert.equal(q('lidov','2028-01-01','2028-12-31'),0);
  }finally{db.close();}
});

test('все лиды: только подтверждённая работа в периоде, без дублей, посторонних направлений и исторических клиентов',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE ljudi(id INTEGER,rol_v_baze TEXT);
   CREATE TABLE sotrudnichestva(id INTEGER,chelovek_id INTEGER,napravlenie TEXT,rol TEXT,istochnik TEXT,sozdano TEXT,poslednee_obshenie TEXT);
   CREATE TABLE zhurnal(obekt TEXT,obekt_id INTEGER,pole TEXT,bylo TEXT,stalo TEXT,kogda TEXT);
   CREATE TABLE zadachi(id INTEGER,klient_id INTEGER,sotrudnichestvo_id INTEGER,napravlenie TEXT,sozdano TEXT,shablon TEXT,srok TEXT,udaleno INTEGER);
   CREATE TABLE rassylki(id INTEGER,napravlenie TEXT);
   CREATE TABLE rassylka_kasanija(chelovek_id INTEGER,rassylka_id INTEGER,kogda TEXT);
   CREATE TABLE nastrojki_sistemy(chasovoj_pojas TEXT);INSERT INTO nastrojki_sistemy VALUES('Europe/Moscow');`);
  const person=(id,first='2011-01-02',role='lid',contact=false)=>{
   db.prepare('INSERT INTO ljudi VALUES(?,?)').run(id,contact?'kontaktnoe_lico':'sobstvennyj');
   db.prepare("INSERT INTO sotrudnichestva VALUES(?,?,'media',?,NULL,?,NULL)").run(id,id,role,first);
   db.prepare("INSERT INTO zhurnal VALUES('sotrudnichestvo',?,'rol',NULL,'lid',?)").run(id,first);
  };
  person(1,'2011-04-02');for(let id=2;id<=12;id++)person(id,'2011-01-02',id===11||id===12?'klient':'lid',id===7);
  person(13,'2011-03-31T22:30:00Z');person(17,'2011-01-02','klient');
  db.exec("INSERT INTO zhurnal VALUES('sotrudnichestvo',17,'rol','lid','klient','2011-05-15')");
  const task=(id,dir='media',date='2011-05-03',deleted=0,due=null)=>db.prepare('INSERT INTO zadachi VALUES(?,?,NULL,?,?,NULL,?,?)').run(id,id,dir,date,due,deleted);
  task(2);task(7);task(8,'synapt');task(9,'media','2011-05-03',1);task(10,'media','2011-03-03',0,'2011-05-03');task(11);task(12);
  db.exec(`INSERT INTO zhurnal VALUES('sotrudnichestvo',4,'stadija','ne_pisali','napisali','2011-05-04');
   UPDATE sotrudnichestva SET poslednee_obshenie='2011-05-05' WHERE id=5;
   INSERT INTO rassylki VALUES(1,'media');INSERT INTO rassylka_kasanija VALUES(6,1,'2011-05-06');
   INSERT INTO zhurnal VALUES('sotrudnichestvo',11,'rol','lid','klient','2011-02-01'),('sotrudnichestvo',12,'rol','lid','klient','2011-07-01');
   INSERT INTO sotrudnichestva VALUES(14,2,'media','lid',NULL,'2011-04-10',NULL);
   INSERT INTO zhurnal VALUES('sotrudnichestvo',14,'rol',NULL,'lid','2011-04-10');`);
  const period={nachalo:'2011-04-01',konec:'2011-06-30'},q=mode=>POKAZATELI.lidov(db,period,null,'media',mode);
  assert.equal(q('tolko_novye'),2);assert.equal(q('vse'),8);
  assert.deepEqual(require('../api/pervaja-rol.js').lidy_perioda(db,period,'media'),{novyh:2,prezhnih:6,vsego:8,polnota_dannyh:{polnaja:true,bez_istorii:0}});
  db.exec("UPDATE nastrojki_sistemy SET chasovoj_pojas='UTC'");assert.equal(q('tolko_novye'),1);assert.equal(q('vse'),7);
                                                                        
  person(15,null);assert.deepEqual(polnota_formuly(db,'lidov','media'),{polnaja:false,bez_istorii:1});assert.equal(q('vse'),7);
  person(16,'2011-02-31');assert.deepEqual(polnota_formuly(db,'lidov','media'),{polnaja:false,bez_istorii:2});assert.equal(q('vse'),7);
 }finally{db.close();}
});
