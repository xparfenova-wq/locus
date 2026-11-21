const {test}=require('node:test'),assert=require('node:assert/strict'),m=require('../api/referral-money.js');
test('decimal cents aggregate without binary float loss',()=>assert.equal(m.text(m.cents(.05)+m.cents(.1)),'0.15'));
test('one final kopeck rounding after fractional percentage and tax',()=>assert.equal(m.text(m.accrual(m.cents('123.45'),'12.5',6)),'14.51'));
test('half a kopeck rounds up',()=>assert.equal(m.text(m.accrual(m.cents('.05'.replace(/^\./,'0.')),10,0)),'0.01'));
test('unknown, malformed, negative and fractional kopecks are not zero',()=>{for(const v of [null,undefined,true,'bad',-1,'1.234',Infinity,NaN])assert.equal(m.cents(v),null,String(v));});
test('zero and one-cent exponent values are exact',()=>{assert.equal(m.cents(0),0n);assert.equal(m.cents(1e-2),1n);assert.equal(m.cents(1e-7),null);});
test('large exact totals keep every digit and withhold imprecise JSON numbers',()=>{const c=900719925474099123n;assert.equal(m.text(c),'9007199254740991.23');assert.equal(m.number(c),null);assert.equal(m.number(1234n),12.34);});
test('negative owed balance preserves overpayment',()=>assert.equal(m.text(0n-11234n),'-112.34'));
test('scale strings or invalid rates cannot become a guessed formula',()=>{for(const v of [null,'14/9/6',true,-1,101,Infinity])assert.equal(m.rate(v),null);assert.equal(m.accrual(10000n,'14/9/6',6),null);});
