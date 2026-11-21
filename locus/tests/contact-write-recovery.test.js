const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function api(){const window={fetch:async()=>{throw new Error('Unexpected fetch');}},document={querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent:()=>{}},sandbox={window,document,crypto:require('node:crypto').webcrypto,URL,URLSearchParams,Headers,Request,Intl,console,setTimeout,clearTimeout};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/api.js'),'utf8'),sandbox);return window.API;}
const row={id:1,chelovek_id:2,tip:'pochta',znachenie:'old@example.test',versija:1};
test('an unconfirmed contact PATCH exposes a read-only recovery state without replaying',async()=>{
 for(const readable of [false,true]){const a=api();let writes=0,reads=0;a.pravit=async()=>{writes++;throw new TypeError('lost reply');};a.odna=async()=>{reads++;if(!readable)throw new TypeError('offline');return {...row,versija:2,znachenie:'other@example.test'};};await assert.rejects(()=>a.pravitZnachenieKontakta(row,'new@example.test'),e=>e.contactValueUnknown===true&&e.desiredValue==='new@example.test');assert.equal(writes,1);assert.equal(reads,1);assert.equal(row.versija,1);}
});
test('a later contact value check reads the exact ID and never writes, with either stored result',async()=>{
 for(const matches of [true,false]){const a=api();let reads=0;a.pravit=()=>{throw new Error('must never PATCH');};a.odna=async(table,id)=>{assert.equal(table,'kontakty');assert.equal(id,row.id);reads++;return {...row,versija:2,znachenie:matches?'new@example.test':'other@example.test'};};const result=await a.proveritZnachenieKontakta(row,'new@example.test');assert.equal(result.podtverzhdeno,matches);assert.equal(result.kontakt.versija,2);assert.equal(reads,1);}
});
test('read-only contact value recovery rejects another owner, kind, ID or an invalid version',async()=>{
 for(const fields of [{id:3},{chelovek_id:3},{tip:'drugoe'},{versija:0},{versija:'2'},{versija:Number.MAX_SAFE_INTEGER+1}]){const a=api();a.odna=async()=>({...row,znachenie:'new@example.test',...fields});await assert.rejects(()=>a.proveritZnachenieKontakta(row,'new@example.test'),e=>e.kod===409||e.kod===502);}
});
test('known validation, identity and permission failures remain terminal without a confirmation read',async()=>{
 for(const error of [{kod:400},{kod:422},{kod:401},{kod:403},{kod:409,telo:{sessija_izmenilas:true}},{kod:409,telo:{scope_changed:true}}]){const a=api();let reads=0;a.pravit=async()=>{throw error;};a.odna=async()=>{reads++;return row;};await assert.rejects(()=>a.pravitZnachenieKontakta(row,'new@example.test'),e=>e===error&&!e.contactValueUnknown);assert.equal(reads,0);}
});
test('phone recovery carries the prepared international value and does not parse or write again',async()=>{
 const a=api();let parses=0,writes=0;a.razobratTelefon=async()=>{parses++;return {e164:'+4915112345678'};};a.pravit=async()=>{writes++;throw new TypeError('lost reply');};a.odna=async()=>{throw new TypeError('offline');};const phone={...row,tip:'telefon',znachenie:'+79161234567'};let failure;try{await a.pravitZnachenieKontakta(phone,'+49 151 12345678');}catch(e){failure=e;}assert.equal(failure.contactValueUnknown,true);assert.equal(failure.desiredValue,'+4915112345678');a.odna=async()=>({...phone,versija:2,znachenie:failure.desiredValue});assert.equal((await a.proveritZnachenieKontakta(phone,failure.desiredValue)).podtverzhdeno,true);assert.equal(writes,1);assert.equal(parses,1);
});
