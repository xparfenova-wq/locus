const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),model=require('../public/js/period-plan-state.js');
class Store{constructor(){this.data=new Map();}get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,v);}removeItem(k){this.data.delete(k);}}
test('period drafts stay isolated by actor, goal, period and tab; acknowledgement cannot erase newer work',()=>{
 const store=new Store(),tab=randomUUID(),other=randomUUID(),state=model.create(store,1,tab),peer=model.create(store,2,tab),second=model.create(store,1,other);
 const draft=state.saveDraft(7,'2026',{rows:[1]}),quarter=state.saveDraft(7,'2026-Q1',{rows:[2]});assert.deepEqual(state.draft(7,'2026').rows,[1]);assert.deepEqual(state.draft(7,'2026-Q1').rows,[2]);assert.equal(peer.draft(7,'2026'),null);
 const key=randomUUID(),intent={key,actor:1,goal:7,period:'2026',kind:'plan',body:{zapros_kljuch:key},draftKey:draft.storageKey,draftRevision:draft.revision},proof={obekt:'plany_periodov_okr',avtor_id:1,cel_id:7,zapros_kljuch:key,sostojanie:'sohraneno',dejstvie:'plan'};state.reserve(intent);
 state.saveDraft(7,'2026',{rows:[3]});second.saveDraft(7,'2026',{rows:[4]});assert.equal(state.finish(intent,proof).draftRetained,true);assert.deepEqual(state.draft(7,'2026').rows,[3]);assert.deepEqual(second.draft(7,'2026').rows,[4]);assert.deepEqual(state.draft(7,'2026-Q1').rows,quarter.rows);assert.equal(state.pending().length,0);
});
test('wrong identities and outcomes cannot confirm a pending period command',()=>{
 const store=new Store(),state=model.create(store,1,randomUUID()),key=randomUUID(),intent={key,actor:1,goal:7,period:'2026',kind:'otmena',body:{zapros_kljuch:key}},proof={obekt:'plany_periodov_okr',avtor_id:1,cel_id:7,zapros_kljuch:key,sostojanie:'sohraneno',dejstvie:'otmena'};state.reserve(intent);
 for(const change of [{avtor_id:2},{cel_id:8},{zapros_kljuch:randomUUID()},{sostojanie:'ne_najdeno'},{dejstvie:'plan'},{obekt:'pravka_celi'}])assert.throws(()=>state.finish(intent,{...proof,...change}));assert.equal(state.pending().length,1);state.finish(intent,proof);assert.equal(state.pending().length,0);
});
test('storage refusal prevents a new command and malformed pending data cannot be replayed',()=>{
 const store=new Store(),state=model.create(store,1,randomUUID()),key=randomUUID(),intent={key,actor:1,goal:7,kind:'plan',body:{zapros_kljuch:key}};store.setItem=()=>{throw Error('quota');};assert.throws(()=>state.reserve(intent));assert.equal(state.pending().length,0);
 const bad=new Store();bad.setItem('locus-period-plans-v1:1:pending:'+key,JSON.stringify({...intent,goal:0}));assert.throws(()=>model.create(bad,1,randomUUID()).pending());
});
