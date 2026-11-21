const {test}=require('node:test'),assert=require('node:assert/strict'),view=require('../public/js/archive-view.js');
test('archive dates retain their stored Moscow day, including leap days, with no rollover or timezone guess',()=>{
 assert.equal(view.day('2026-10-15'),'15.10.2026');assert.equal(view.day('2024-02-29'),'29.02.2024');
 for(const value of['2026-02-29','2026-04-31','2026-10-15T23:59:00Z','15.10.2026','',null,undefined])assert.equal(view.day(value),null);
});
test('unknown legacy archive dates remain explicitly unknown and active records have no archive badge',()=>{
 assert.deepEqual(view.describe({arhiv:true,arhiv_s:null}),{label:'в архиве · дата неизвестна',date:null});
 assert.equal(view.describe({arhiv:0,arhiv_s:'2026-10-15',vozvrat_s:'2026-10-23'}),null);assert.equal(view.describe({arhiv:'anything'}),null);
});
test('archive history names only confirmed flag transitions and retains unfamiliar evidence for the generic renderer',()=>{
 for(const [before,after]of[[0,1],['0','1'],[false,true]])assert.equal(view.transition({pole:'arhiv',bylo:before,stalo:after}),'перенос в архив');
 assert.equal(view.transition({pole:'arhiv',bylo:'1',stalo:'0'}),'возврат из архива');
 for(const row of[{pole:'arhiv',bylo:'да: причина',stalo:'нет'},{pole:'arhiv',bylo:1,stalo:1},{pole:'udaleno',bylo:0,stalo:1}])assert.equal(view.transition(row),null);
});
test('archive stamps expose the exact scope and stored day without rendering untrusted date markup',()=>{
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const html=view.html({arhiv:true,arhiv_s:'2026-10-15'},esc,{tablica:'sotrudnichestva',id:17});assert.match(html,/data-archive-table="sotrudnichestva" data-archive-id="17" data-archive-date="2026-10-15"/);assert.match(html,/15\.10\.2026/);
 const unknown=view.html({arhiv:1,arhiv_s:'<img src=x onerror=alert(1)>'},esc,{tablica:'untrusted"',id:17});assert.match(unknown,/data-archive-date-unknown="1"/);assert.ok(!unknown.includes('<img'));assert.ok(!unknown.includes('untrusted'));assert.equal(view.html({arhiv:false},esc),'');
});
