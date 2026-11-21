const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function browserAPI(){const window={fetch:async()=>{throw new Error('Unexpected fetch');}},document={querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent:()=>{}},sandbox={window,document,crypto:require('node:crypto').webcrypto,URL,URLSearchParams,Headers,Request,Intl,console,setTimeout,clearTimeout};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/api.js'),'utf8'),sandbox);return window.API;}
const row={id:1,chelovek_id:2,tip:'telefon',znachenie:'+79161234567',znachenie_norm:'79161234567',versija:1};
test('phone creation posts the preflight canonical value and confirms a lost reply without replay',async()=>{
 const api=browserAPI(),input={chelovek_id:2,tip:'telefon',znachenie:'15112345678',strana:'de'};let reads=0,writes=0;
 api.spisok=async(route,params)=>{reads++;assert.equal(params.znachenie,'15112345678');assert.equal(params.strana,'de');return{chelovek_id:2,tip:'telefon',znachenie:'+4915112345678',znachenie_norm:'4915112345678',vsego:reads===1?0:1,spisok:reads===1?[]:[{...row,znachenie:'+4915112345678',znachenie_norm:'4915112345678'}]};};
 api.sozdat=async(table,body)=>{writes++;assert.equal(body.znachenie,'+4915112345678');assert.equal(body.strana,'de');throw new TypeError('lost reply');};
 const result=await api.sozdatKontakt(input);assert.equal(result.kontakt.id,1);assert.equal(result.uzheByl,true);assert.equal(writes,1);assert.equal(reads,2);assert.equal(input.znachenie,'15112345678');
});
test('formatted phone PATCH is compared canonically when its acknowledgement is lost',async()=>{
 const api=browserAPI();let writes=0,reads=0,parses=0;api.razobratTelefon=async value=>{parses++;assert.equal(value,'+49 151 12345678');return{e164:'+4915112345678'};};api.pravit=async(table,id,body)=>{writes++;assert.equal(body.znachenie,'+4915112345678');assert.equal(body.versija,1);throw new TypeError('lost');};api.odna=async()=>{reads++;return{...row,znachenie:'+4915112345678',versija:2};};assert.equal((await api.pravitZnachenieKontakta(row,'+49 151 12345678')).versija,2);assert.equal(writes,1);assert.equal(reads,1);assert.equal(parses,1);
});
test('a phone parse failure or caller attempt to replace the reviewed version sends no PATCH',async()=>{
 const api=browserAPI();let writes=0;api.pravit=async()=>{writes++;};api.razobratTelefon=async()=>{throw Object.assign(new Error('invalid phone'),{kod:422});};await assert.rejects(()=>api.pravitZnachenieKontakta(row,'letters'),e=>e.kod===422);await assert.rejects(()=>api.pravitZnachenieKontakta(row,'+79161234567',{versija:999}),e=>e.kod===400);assert.equal(writes,0);
});
test('canonical text in a different owner never confirms a phone PATCH',async()=>{
 const api=browserAPI();let writes=0;api.razobratTelefon=async()=>({e164:'+4915112345678'});api.pravit=async()=>{writes++;throw new TypeError('lost');};api.odna=async()=>({...row,chelovek_id:3,znachenie:'+4915112345678',versija:2});await assert.rejects(()=>api.pravitZnachenieKontakta(row,'+49 151 12345678'),e=>e.kod===409&&e.telo.scope_changed);assert.equal(writes,1);
});
