const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {nado,proverit}=require('../prover.js');
const cal=require('../../api/kalendar.js');
module.exports=async function(){
  const person=(await nado('POST','/api/ljudi',{telo:{imja:'Workload eight weeks oracle',komanda:true}})).telo;
  const den='2026-11-16',week=cal.iso_nedelja(den);
                                                                       
  const db=new DatabaseSync(process.env.LOCUS_BAZA);
  try{
    const insert=db.prepare("INSERT INTO zadachi(nomer,nazvanie,napravlenie,otvetstvennyj,status,sprint,god_sprinta,udaleno,versija) VALUES(?,'Workload API fixture','synapt',?,?,?,?,0,1)");
    const event=db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,stalo,kogda) VALUES('zadacha',?,'status','sdelano',?)");
    let number=800000;
    for(const [i,count] of [6,9,8,0,11,7,8,10].entries()){
      const w=cal.sdvinut_nedelju(week.god,week.nomer,i-8);
      for(let n=0;n<count;n++){
        const row=insert.run(++number,person.id,'sdelano',w.nomer,w.god);
        event.run(row.lastInsertRowid,w.nachalo+' 12:00:00');
      }
    }
    for(let i=0;i<13;i++)insert.run(++number,person.id,'v_plane',week.nomer,week.god);
    const hint=(await nado('GET','/api/ljudi/'+person.id+'/zagruzka?den='+den)).telo;
    assert.equal(hint.mediana_zakrytyh,8);assert.equal(hint.zadach_nedeli,13);
    assert.equal(hint.est_grafik,false);assert.equal(hint.zapolneno_dnej,0);assert.equal(hint.podskazka,'');
    const graph=db.prepare('INSERT INTO grafik(chelovek_id,god,nedelja,den,chasov,ne_rabotaju) VALUES(?,?,?,?,?,?)');
    graph.run(person.id,week.god,week.nomer,1,null,0);
    let scheduled=(await nado('GET','/api/ljudi/'+person.id+'/zagruzka?den='+den)).telo;
    assert.equal(scheduled.est_grafik,false);assert.equal(scheduled.podskazka,'');
    graph.run(person.id,week.god,week.nomer,2,0,1);
    scheduled=(await nado('GET','/api/ljudi/'+person.id+'/zagruzka?den='+den)).telo;
    assert.equal(scheduled.est_grafik,true);assert.equal(scheduled.zapolneno_dnej,1);assert.equal(scheduled.chasov,0);assert.ok(scheduled.podskazka.includes('0 часов'));
    graph.run(person.id,week.god,week.nomer,3,19.5,0);
    graph.run(person.id,week.god-1,week.nomer,3,40,0);
    graph.run(person.id,week.god,week.nomer-1,3,38,0);
    scheduled=(await nado('GET','/api/ljudi/'+person.id+'/zagruzka?nedelja='+cal.kljuch_nedeli(week.god,week.nomer))).telo;
    assert.equal(scheduled.chasov,19.5);assert.equal(scheduled.zapolneno_dnej,2);assert.equal(scheduled.zadach_nedeli,13);assert.equal(scheduled.mediana_zakrytyh,8);assert.ok(scheduled.podskazka.includes('19,5 часа'));
    proverit('график в подсказке отличает отсутствие, неизвестные часы и явный ноль; сумма ограничена человеком/ISO-годом/неделей',true);
    const overload=(await nado('GET','/api/podskazki/peregruz?den='+den,{avtor:person.id})).telo;
    assert.equal(overload.mediana,8);assert.equal(overload.predel,12);assert.equal(overload.otkryto,13);
    assert.equal(overload.peregruzheny.find(p=>p.chelovek_id===person.id).mediana,8);
    let insights=(await nado('GET','/api/insajty?den='+den)).telo.insajty;
    assert.ok(insights.some(i=>i.povod==='peregruz'&&i.prichina.includes(person.imja)&&i.prichina.includes('13')));
    db.prepare("UPDATE zadachi SET status='kogda_nibud' WHERE nomer=?").run(number);
    const atLimit=(await nado('GET','/api/podskazki/peregruz?den='+den,{avtor:person.id})).telo;
    assert.equal(atLimit.otkryto,12);assert.ok(!atLimit.peregruzheny.some(p=>p.chelovek_id===person.id));
    insights=(await nado('GET','/api/insajty?den='+den)).telo.insajty;
    assert.ok(!insights.some(i=>i.povod==='peregruz'&&i.prichina.includes(person.imja)));
    proverit('форма, подсказка и инсайт используют личную медиану, граница 12/13 верна',true);
  }finally{db.close();}
};
