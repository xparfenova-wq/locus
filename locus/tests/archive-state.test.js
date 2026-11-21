const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),model=require('../public/js/archive-state.js');
class Store{constructor(){this.data=new Map();}get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,v);}removeItem(k){this.data.delete(k);}}
const intent=()=>{const key=randomUUID();return {key,actor:1,tablica:'sotrudnichestva',id:7,person:8,kind:'arhiv',body:{tablica:'sotrudnichestva',id:7,arhiv:true,versija:1,kontekst:'a'.repeat(64),zapros_kljuch:key}};};
const proof=i=>({obekt:'arhiv',avtor_id:i.actor,tablica:i.tablica,id:i.id,chelovek_id:i.person,zapros_kljuch:i.key,sostojanie:'sohraneno',dejstvie:i.kind,arhiv:true,versija_sohranenija:2,zapis_suschestvuet:true});
test('archive confirmations require the actor, target, parent, command, action and actual saved outcome',()=>{
 const storage=new Store(),state=model.create(storage,1,randomUUID()),peer=model.create(storage,2,randomUUID()),i=intent();state.reserve(i);assert.equal(peer.pending().length,0);for(const change of[{avtor_id:2},{tablica:'ljudi'},{id:8},{chelovek_id:9},{zapros_kljuch:randomUUID()},{sostojanie:'ne_najdeno'},{dejstvie:'otmenit'},{arhiv:false},{versija_sohranenija:null},{zapis_suschestvuet:undefined}])assert.throws(()=>state.finish(i,{...proof(i),...change}));assert.equal(state.pending().length,1);state.finish(i,proof(i));assert.equal(state.pending().length,0);assert.equal(state.last(i).key,i.key);
 const undo={...i,key:randomUUID(),kind:'otmenit'};undo.body={tablica:i.tablica,id:i.id,zapros_kljuch:undo.key,ishodnyj_kljuch:i.key};state.reserve(undo);state.finish(undo,{...proof(undo),arhiv:false,otmeneno:true,versija_sohranenija:3});assert.equal(state.last(i),null);
});
test('recovery cannot offer to undo a removed or moved incarnation',()=>{
 for(const result of[{zapis_suschestvuet:false},{perenesen:true},{vernuto:true}]){const storage=new Store(),state=model.create(storage,1,randomUUID()),i=intent();state.reserve(i);state.finish(i,{...proof(i),...result});assert.equal(state.last(i),null);assert.equal(state.pending().length,0);}
});
test('storage refusal and unexpected business fields prevent a new archive command',()=>{
 const storage=new Store(),state=model.create(storage,1,randomUUID()),i=intent();storage.setItem=()=>{throw Error('quota');};assert.throws(()=>state.reserve(i));assert.equal(state.pending().length,0);
 const broken=new Store();broken.setItem('locus-archive-v1:1:pending:'+i.key,JSON.stringify({...i,tab:randomUUID(),body:{...i.body,passport:'not allowed'}}));assert.throws(()=>model.create(broken,1,randomUUID()).pending());
});
