const {test}=require('node:test'),assert=require('node:assert/strict'),window=require('../api/okno-celej.js');
test('a view window intersects the original goal period without changing its identity',()=>{
 const actual=window.granicy(2026,'2026-10','2026-11-20');assert.deepEqual(actual,{period:'2026-10',nachalo:'2026-10-01',konec:'2026-10-31',na_datu:'2026-10-31',dostupno:true,pochemu:null});
 const quarter=window.granicy('2026-Q4','2026','2026-11-20');assert.equal(quarter.nachalo,'2026-10-01');assert.equal(quarter.konec,'2026-12-31');assert.equal(quarter.na_datu,'2026-11-20');
});
test('a future or unrelated window is explicitly unavailable rather than a fabricated zero',()=>{
 const future=window.granicy('2026','2026-12','2026-11-20');assert.equal(future.dostupno,false);assert.ok(future.pochemu.includes('ещё'));const outside=window.granicy('2026','2025-10','2026-11-20');assert.equal(outside.dostupno,false);assert.ok(outside.pochemu.includes('не пересекается'));const missing=window.granicy(null,'2026-10','2026-11-20');assert.equal(missing.dostupno,false);assert.ok(missing.pochemu.includes('не указан'));
});
test('invalid view periods and dates are rejected without normalizing them into a different request',()=>{
 for(const value of ['','2026-Q5','2026-13','26',true,{},null])assert.throws(()=>window.granicy('2026',value,'2026-11-20'));assert.throws(()=>window.granicy('2026','2026-Q4','2026-02-30'));
});
