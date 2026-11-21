const {test}=require('node:test'),assert=require('node:assert/strict'),decimal=require('../public/js/decimal-plan.js');
test('decimal plan sums and differences do not invent floating point remainders',()=>{
 assert.equal(decimal.sum(['0.1','0.2']),'0.3');assert.equal(decimal.subtract('500',decimal.sum(['0.1',125,125,125])),'124.9');assert.equal(decimal.subtract('0.3',decimal.sum(['0.1','0.2'])),'0');assert.equal(decimal.format('124.9'),'124,9');
});
test('plan arithmetic preserves large exact totals, tiny values, comma input and signs',()=>{
 assert.equal(decimal.sum(['999999999999999','999999999999999','999999999999999','999999999999999']),'3999999999999996');assert.equal(decimal.format('3999999999999996'),'3 999 999 999 999 996');assert.equal(decimal.sum(['1e-20','2e-20']),'0.00000000000000000003');assert.equal(decimal.sum(['1,25','-0.25']),'1');assert.equal(decimal.sum(['0e-10000000','-0.0000']),'0');assert.equal(decimal.subtract('1e3','500.5'),'499.5');assert.equal(decimal.sum([]),'0');
});
test('invalid decimal values cannot become zero in plan arithmetic',()=>{
 for(const value of ['',null,undefined,{},[],true,'NaN','Infinity','0x10','many','1e-1000','1e99999'])assert.throws(()=>decimal.sum([value]));
});
test('explicit period rounding allocates earlier units and never invents a residual or negative child',()=>{
 assert.deepEqual(decimal.split('500',3),['167','167','166']);assert.deepEqual(decimal.split('500',4),['125','125','125','125']);assert.deepEqual(decimal.split('2',4),['1','1','0','0']);assert.deepEqual(decimal.split('0.3',3),['0.1','0.1','0.1']);assert.deepEqual(decimal.split('0',4),['0','0','0','0']);
 for(const value of ['0','1','2','500','999999999999999','0.03','1e-20'])for(const n of [3,4]){const parts=decimal.split(value,n);assert.equal(decimal.sum(parts),decimal.sum([value]));assert.ok(parts.every(p=>Number(p)>=0));}
 assert.throws(()=>decimal.split('-1',3));for(const n of [0,0.5,13,null])assert.throws(()=>decimal.split('1',n));
});
