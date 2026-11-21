const {test}=require('node:test'),assert=require('node:assert/strict'),m=require('../public/js/schedule-model.js');
const row=(values={})=>({id:12,versija:3,den:1,chasov:4,s_kakogo:'15:00',do_kakogo:'19:00',zametka:'После основной работы',ne_rabotaju:false,...values});
test('known legacy windows retain exact half-hour coordinates and a separate original representation',()=>{
 const r=row(),d=m.draft(r,1);assert.equal(d.baseline.kind,'range');assert.deepEqual([...d.slots],[15,15.5,16,16.5,17,17.5,18,18.5]);assert.equal(m.changes(d),null);assert.equal(d.original.s_kakogo,'15:00');assert.deepEqual(r,row());
});
test('duration-only days preserve24hours, quarter-hours and zero without invented starting times',()=>{
 for(const value of[24,8,0.25,0]){const d=m.draft(row({chasov:value,s_kakogo:null,do_kakogo:null}),1);assert.equal(d.baseline.kind,'duration');assert.deepEqual([...d.slots],[]);assert.equal(m.currentHours(d),value);assert.equal(m.changes(d),null);}
 assert.equal(m.read(null).hours,null);
});
test('ambiguous or damaged stored layouts remain readable as unknown and never silently round or deduplicate',()=>{
 for(const data of[{chasov:6},{s_kakogo:'15:15'},{s_kakogo:'8,8.5,8.5',do_kakogo:'9',chasov:1.5},{s_kakogo:'8.5oops',chasov:0.5},{s_kakogo:'8,9',chasov:4}]){const d=m.draft(row(data),1);assert.equal(d.baseline.kind,'invalid');assert.deepEqual([...d.slots],[]);assert.equal(m.changes(d),null);}
});
test('old whole-hour lists and newer half-hour lists use the saved duration to disambiguate',()=>{
 assert.deepEqual(m.read(row({s_kakogo:'8,9',chasov:2})).slots,[8,8.5,9,9.5]);assert.deepEqual(m.read(row({s_kakogo:'8,9',chasov:1})).slots,[8,9]);assert.deepEqual(m.read(row({s_kakogo:'8,8.5',chasov:1})).slots,[8,8.5]);
});
test('changing another day emits nothing for retained windows, unknown coordinates and notes',()=>{
 const days=[m.draft(row(),1),m.draft(row({chasov:8,s_kakogo:null,do_kakogo:null}),2),m.draft(row({chasov:24,s_kakogo:null,do_kakogo:null,zametka:null}),3),m.draft(null,5)];m.setSlots(days[3],[8]);const bodies=days.map(m.changes).filter(Boolean);assert.deepEqual(bodies,[{den:5,ne_rabotaju:false,chasov:0.5,s_kakogo:'8',do_kakogo:'8.5'}]);
});
test('a notes-only change never submits unrelated hours, coordinates or a normalized old window',()=>{
 for(const r of[row(),row({chasov:24,s_kakogo:null,do_kakogo:null})]){const d=m.draft(r,1);m.setNote(d,'Другая заметка');assert.deepEqual(m.changes(d),{den:1,id:12,versija:3,zametka:'Другая заметка'});}
});
test('intentional coordinate changes retain original notes and reverting a known selection emits no write',()=>{
 const d=m.draft(row(),1);m.setSlots(d,[16,16.5]);const changed=m.changes(d);assert.equal(changed.chasov,1);assert.equal(changed.zametka,undefined);m.setSlots(d,d.baseline.slots);assert.equal(m.changes(d),null);
});
test('new notes require a planned day and invalid versions or notes fail before any request',()=>{
 const d=m.draft(null,1);m.setNote(d,'Пока не знаю');assert.throws(()=>m.changes(d),/Сначала/);m.setOff(d,true);assert.equal(m.changes(d).ne_rabotaju,true);m.setNote(d,'a'.repeat(501));assert.throws(()=>m.changes(d),/500/);
 const stale=m.draft(row({versija:null}),1);m.setNote(stale,'Обновить');assert.throws(()=>m.changes(stale),/Обнови/);
});
test('legacy off markers are interpreted as state and cleared only when intentionally returning the day',()=>{
 const d=m.draft(row({chasov:0,s_kakogo:'',do_kakogo:'',zametka:'ne_rabotaju'}),1);assert.equal(d.off,true);assert.equal(d.note,'');assert.equal(m.changes(d),null);m.setOff(d,false);m.setSlots(d,[10,10.5]);assert.equal(m.changes(d).zametka,null);
});
test('an untouched overlong old note remains retained when another day is saved',()=>{
 const d=m.draft(row({zametka:'a'.repeat(501)}),1);assert.equal(m.changes(d),null);m.setSlots(d,[16,16.5]);assert.equal(m.changes(d).zametka,undefined);assert.equal(d.original.zametka.length,501);
});
test('a cancelled day form cannot mutate the matrix draft, its coordinate set or notes',()=>{
 const source=m.draft(row(),1),copy=m.clone(source);m.setSlots(copy,[9,9.5]);m.setNote(copy,'Черновик формы');m.setOff(copy,true);assert.deepEqual([...source.slots],[15,15.5,16,16.5,17,17.5,18,18.5]);assert.equal(source.note,'После основной работы');assert.equal(source.off,false);assert.equal(m.changes(source),null);
});
