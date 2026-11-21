const {test}=require('node:test');
const assert=require('node:assert/strict');
const {segodnja,v_api}=require('../db/db');
const {proverit_datu}=require('../api/povtory');
test('рабочий день меняется в полночь Москвы, независимо от часового пояса процесса',()=>{
  assert.equal(segodnja(new Date('2026-11-12T20:59:59Z')),'2026-11-12');
  assert.equal(segodnja(new Date('2026-11-12T21:00:00Z')),'2026-11-13');
  assert.equal(segodnja(new Date('2026-12-31T21:00:00Z')),'2027-01-01');
});
test('календарь отличает настоящий день от нормализованной ошибочной даты',()=>{
  assert.equal(proverit_datu('2028-02-29'),'2028-02-29');
  for(const day of ['2026-02-29','2026-02-30','2026-13-01','2026-00-00',null]){
    assert.throws(()=>proverit_datu(day),/существующая дата/);
  }
});
test('повторная подготовка ответа не превращает да в нет',()=>{
  const row={povtorjaetsja:1,udaleno:0,publikacija:null};
  assert.deepEqual(v_api(v_api(row)),{povtorjaetsja:true,udaleno:false,publikacija:null});
});

const calendar=require('../api/kalendar');
test('год ISO-недели отличается от календарного года на границе декабря и января',()=>{
  for(const [day,god,nomer] of [['2025-12-29',2026,1],['2026-01-01',2026,1],
    ['2027-01-01',2026,53],['2027-01-03',2026,53],['2027-01-04',2027,1],
    ['2028-01-01',2027,52],['2029-12-31',2030,1]]){
    assert.deepEqual(calendar.iso_nedelja(day),{god,nomer},day);
  }
  assert.deepEqual(calendar.granicy_nedeli(2026,53),{nachalo:'2026-12-28',konec:'2027-01-03'});
  assert.throws(()=>calendar.granicy_nedeli(2027,53),/недель: 52/);
  assert.equal(calendar.nedel_v_godu(2026),53);
  assert.equal(calendar.nedel_v_godu(2027),52);
});
test('стрелки недели переходят между годами, календарные формы принимают оба адреса',()=>{
  assert.deepEqual(calendar.sdvinut_nedelju(2026,53,1),{god:2027,nomer:1,nachalo:'2027-01-04',konec:'2027-01-10'});
  assert.deepEqual(calendar.sdvinut_nedelju(2027,1,-1),{god:2026,nomer:53,nachalo:'2026-12-28',konec:'2027-01-03'});
  for(const value of ['2026-53','2026-W53',53]){
    assert.deepEqual(calendar.razobrat_nedelju(value,2026),{god:2026,nomer:53,nachalo:'2026-12-28',konec:'2027-01-03'});
  }
  for(const value of ['2027-53','2026-W00','2026-54','43junk'])assert.throws(()=>calendar.razobrat_nedelju(value,2026));
  assert.throws(()=>calendar.nedelja_iz_zaprosa({god:2027,sprint:'2026-53'},'2027-01-01'),/разные годы/);
});
test('диапазон недель пересекает Новый год и помечает текущую ровно один раз',()=>{
  const screens=require('../api/ekrany');
  const range=screens.sprinty({metod:'GET',zapros:{den:'2027-01-01'}}).telo;
  assert.equal(range.spisok.length,12);
  assert.ok(range.spisok.some(w=>w.god===2027));
  assert.equal(range.spisok.filter(w=>w.tekuschij).length,1);
  assert.equal(range.spisok.find(w=>w.tekuschij).god,2026);
  assert.deepEqual(screens.nedeli({metod:'GET',zapros:{den:'2027-01-01'}}).telo,
    {god:2026,nomer:53,nachalo:'2026-12-28',konec:'2027-01-03'});
});
test('расчёт недель согласуется с независимым ISO-календарём SQLite',()=>{
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');
  try{
    const query=db.prepare("SELECT strftime('%G',?) god,strftime('%V',?) nomer");
    for(let year=2020;year<=2035;year++)for(let offset=-7;offset<=7;offset++){
      const d=new Date(Date.UTC(year,0,1+offset,12)).toISOString().slice(0,10);
      const actual=calendar.iso_nedelja(d),expected=query.get(d,d);
      assert.deepEqual(actual,{god:Number(expected.god),nomer:Number(expected.nomer)},d);
    }
  }finally{db.close()}
});
