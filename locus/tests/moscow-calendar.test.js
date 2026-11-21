const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const calendar=require('../public/js/nedeli.js');

test('Moscow calendar days turn over at 21:00 UTC, including a new year',()=>{
 for(const [instant,day] of [['2026-12-31T20:59:59Z','2026-12-31'],['2026-12-31T21:00:00Z','2027-01-01'],['2027-01-01T00:00:00Z','2027-01-01'],['2026-11-14T21:30:00Z','2026-11-15']])assert.equal(calendar.den_moskvy(new Date(instant)),day);
});
test('calendar arithmetic is identical across DST, negative offsets and UTC+14',()=>{
 const modulePath=path.resolve(__dirname,'../public/js/nedeli.js'),script=`const c=require(${JSON.stringify(modulePath)});console.log(JSON.stringify([c.sdvinut_den('2026-03-08',1),c.sdvinut_den('2026-11-01',-1),c.sdvinut_den('2026-12-31',1),c.sdvinut_den('2028-02-28',1),c.sdvinut_den('2028-02-29',1),c.raznica_dnej('2026-03-07','2026-03-09'),c.den_moskvy(new Date('2026-12-31T21:30:00Z'))]))`;
 for(const TZ of ['Europe/Moscow','America/Los_Angeles','Pacific/Kiritimati','UTC'])assert.deepEqual(JSON.parse(execFileSync(process.execPath,['-e',script],{env:{...process.env,TZ},encoding:'utf8'})),['2026-03-09','2026-10-31','2027-01-01','2028-02-29','2028-03-01',2,'2027-01-01']);
});
test('invalid calendar dates and fractional shifts are rejected',()=>{
 for(const date of ['2026-02-29','2026-13-01','2026-01-32','invalid'])assert.throws(()=>calendar.sdvinut_den(date,1));
 for(const shift of [NaN,1.5,'1',Infinity])assert.throws(()=>calendar.sdvinut_den('2026-01-01',shift));
});
function browserCalendar(){
 const fixed=Date.parse('2026-12-31T21:30:00Z'),RealDate=Date;
 const sandbox={Date:class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}},Intl,URL,URLSearchParams,Headers,Request,setTimeout,clearTimeout,fetch:async()=>{throw new Error('Unexpected fetch');},document:{querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent:()=>{}}};sandbox.window=sandbox;vm.createContext(sandbox);
 for(const file of ['nedeli.js','api.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/'+file),'utf8'),sandbox);
 return sandbox.SPR;
}
test('browser dates keep literal dates while assigning UTC timestamps to Moscow days',()=>{
 const spr=browserCalendar();assert.equal(spr.segodnja(),'2027-01-01');
 for(const [instant,expected] of [['2026-12-31 20:59:59','31.12'],['2026-12-31 21:00:00','01.01'],['2026-11-14T21:30:00Z','15.11'],['2026-11-15T00:30:00+03:00','15.11'],['2026-01-01T02:30:00+09:00','31.12']])assert.equal(spr.data(instant),expected);
 assert.equal(spr.data('2026-12-31'),'31.12');assert.equal(spr.data('invalid'),'—');assert.equal(spr.vremja('invalidZ'),null);
});
