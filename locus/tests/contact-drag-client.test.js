const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto,createHash}=require('node:crypto');
function browserAPI(){const window={fetch:async()=>{throw new Error('Unexpected fetch');}},document={querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent:()=>{}},delays=[],cleared=[],sandbox={window,document,crypto:webcrypto,TextEncoder,AbortController,URL,URLSearchParams,Headers,Request,Intl,console,setTimeout:(fn,delay)=>{delays.push(delay);return setTimeout(fn,2);},clearTimeout:id=>{cleared.push(id);clearTimeout(id);}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/api.js'),'utf8'),sandbox);return {api:window.API,delays,cleared};}
const row=(id,order)=>({id,chelovek_id:2,tip:'pochta',znachenie:'fixture-'+id+'@example.test',versija:1,porjadok:order}),snapshot={chelovek_id:2,kontekst:'a'.repeat(64),spisok:[row(1,1),row(2,2)]};
test('drag hashes exactly the displayed rows and freezes versions before asynchronous hashing',async()=>{
 const {api}=browserAPI(),rows=[row(2,2),row(1,null)],expected=createHash('sha256').update(JSON.stringify([2,[[1,1,'pochta',null],[2,1,'pochta',2]]])).digest('hex');const pending=api.snimokPorjadkaPoStrokam(2,rows);rows[1].versija=999;const value=await pending;assert.equal(value.kontekst,expected);assert.equal(value.spisok[0].versija,1);assert.equal(rows[0].id,2);assert.equal(rows[1].versija,999);
});
test('foreign rows cannot form a displayed contact order snapshot',async()=>{
 const {api}=browserAPI();await assert.rejects(()=>api.snimokPorjadkaPoStrokam(2,[{...row(1,1),chelovek_id:3}]),/подтвердить порядок/);
});
test('a hung drag PATCH aborts and checks with one read without repeating the write',async()=>{
 const {api,delays,cleared}=browserAPI(),calls=[];api.zapros=async(method,path,body,options)=>{calls.push({method,path,body});assert.ok(options.signal instanceof AbortSignal);if(method==='PATCH')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'}))));return{...snapshot,spisok:[row(2,1),row(1,2)]};};
 const value=await api.sohranitPorjadokKontaktov(snapshot,[2,1],{poCheloveku:true});assert.equal(value.podtverzhdeno,true);assert.deepEqual(calls.map(x=>x.method),['PATCH','GET']);assert.equal(calls[0].path,'/ljudi/2/kontakty/porjadok');assert.equal(calls[0].body.kontekst,snapshot.kontekst);assert.deepEqual(delays,[15000,15000]);assert.equal(cleared.length,2);
});
test('a hung write followed by a hung read remains unknown and both requests release timers',async()=>{
 const {api,delays,cleared}=browserAPI(),calls=[];api.zapros=async(method,path,body,options)=>{calls.push(method);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('timeout'))));};await assert.rejects(()=>api.sohranitPorjadokKontaktov(snapshot,[2,1],{poCheloveku:true}),e=>e.orderUnknown===true);assert.deepEqual(calls,['PATCH','GET']);assert.deepEqual(delays,[15000,15000]);assert.equal(cleared.length,2);
});
test('validation, access and version conflicts never trigger a read or an automatic write retry',async()=>{
 for(const kod of [400,401,403,409]){const {api}=browserAPI(),calls=[];api.zapros=async method=>{calls.push(method);throw Object.assign(new Error('rejected'),{kod});};await assert.rejects(()=>api.sohranitPorjadokKontaktov(snapshot,[2,1],{poCheloveku:true}),e=>e.kod===kod);assert.deepEqual(calls,['PATCH']);}
});
test('a missing write reply and a different confirmed order require a new explicit gesture',async()=>{
 const {api}=browserAPI(),calls=[];api.zapros=async method=>{calls.push(method);if(method==='PATCH')throw new TypeError('lost reply');return snapshot;};const value=await api.sohranitPorjadokKontaktov(snapshot,[2,1],{poCheloveku:true});assert.equal(value.podtverzhdeno,false);assert.deepEqual(calls,['PATCH','GET']);
});
