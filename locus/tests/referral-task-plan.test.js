const {test}=require('node:test'),assert=require('node:assert/strict'),{defaults}=require('../api/referral-task-plan.js');
test('Monday in Moscow uses the end of the following week',()=>assert.equal(defaults('2026-11-23').srok,'2026-12-06'));
test('ISO week and year boundary does not move the deadline into the old year',()=>assert.equal(defaults('2026-12-31').srok,'2027-01-10'));
test('suggested month is an explicit editable range, with real leap day',()=>{const r=defaults('2028-02-25');assert.equal(r.period_from,'2028-02-01');assert.equal(r.period_to,'2028-02-29');assert.match(r.period_nazvanie,/февраль.*2028/);});
test('invalid calendar day is rejected',()=>assert.throws(()=>defaults('2026-02-30')));
