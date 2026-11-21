const {test}=require('node:test'),assert=require('node:assert/strict'),model=require('../public/js/goal-window-model.js');
test('view navigation retains the selected year and crosses exact calendar boundaries',()=>{
 assert.equal(model.shifted('2026-12',1),'2027-01');assert.equal(model.shifted('2026-01',-1),'2025-12');assert.equal(model.shifted('2026-Q4',1),'2027-Q1');assert.equal(model.shifted('2026-Q1',-1),'2025-Q4');assert.equal(model.shifted(2026,1),'2027');assert.equal(model.parse('2026-q4').id,'2026-Q4');
});
test('switching the view kind keeps its year and uses a month within that view',()=>{
 assert.equal(model.choose('2025','mesjac','2026-11-20'),'2025-11');assert.equal(model.choose('2025-Q2','mesjac','2026-11-20'),'2025-04');assert.equal(model.choose('2025-10','kvartal','2026-11-20'),'2025-Q4');assert.equal(model.choose('2025-10','god','2026-11-20'),'2025');
});
test('a stale or different goal response cannot become the selected view',()=>{
 const view={id:7,okno:{period:'2026-10'},rezultaty:[]};assert.equal(model.selected({id:7,srez_perioda:view},'2026-10'),view);assert.equal(model.selected({id:8,srez_perioda:view}),null);assert.equal(model.selected({id:7,srez_perioda:view},'2026-11'),null);assert.equal(model.selected({id:7,srez_perioda:{...view,rezultaty:null}}),null);
 assert.equal(model.selected({id:0,srez_perioda:{...view,id:0}}),null);assert.equal(model.selected({id:7,srez_perioda:{...view,okno:{period:'invalid'}}}),null);
 const result={id:1,cel_id:7};assert.equal(model.selected({id:7,rezultaty:[result],srez_perioda:{...view,rezultaty:[{id:2,cel_id:7}]}}),null);assert.equal(model.selected({id:7,rezultaty:[result],srez_perioda:{...view,rezultaty:[result,result]}}),null);
});
test('malformed navigation does not silently become another period',()=>{
 for(const value of ['','2026-13','2026-Q5',true,null,{},'26'])assert.throws(()=>model.parse(value));assert.throws(()=>model.shifted('9999',1));assert.throws(()=>model.shifted('1000',-1));assert.throws(()=>model.shifted('2026',0.5));assert.throws(()=>model.choose('2026','week','2026-11-20'));
});
