const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),model=require('../public/js/strategy-model.js');
function storage(){const rows=new Map();return {get length(){return rows.size;},key:index=>[...rows.keys()][index]??null,getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,String(value)),removeItem:key=>rows.delete(key)};}
test('different tabs and actors keep their own strategy drafts and uncertain commands',()=>{
 const disk=storage(),one=model.create(disk,61,randomUUID()),two=model.create(disk,61,randomUUID()),peer=model.create(disk,63,randomUUID()),scope='tezis:4';
 const a=one.saveDraft(scope,{fields:{tekst:'Первый черновик\n\nс абзацами'}}),b=two.saveDraft(scope,{fields:{tekst:'Другой черновик'}});assert.equal(one.draft(scope).fields.tekst,a.fields.tekst);assert.equal(two.draft(scope).fields.tekst,b.fields.tekst);assert.equal(peer.draft(scope),null);
 const key=randomUUID(),key2=randomUUID();one.reserve({key,kind:'pravka',scope,body:{tekst:'Первый черновик'},draftKey:a.storageKey,draftRevision:a.revision});two.reserve({key:key2,kind:'pravka',scope,body:{tekst:'Другой черновик'},draftKey:b.storageKey,draftRevision:b.revision});assert.equal(one.pending().length,2);assert.equal(peer.pending().length,0);
 one.finish(key);assert.equal(one.pending().length,1);assert.equal(two.draft(scope).fields.tekst,b.fields.tekst);assert.equal(one.drafts(scope).length,1);two.reject(key2);assert.equal(one.pending().length,0);assert.equal(two.draft(scope).fields.tekst,b.fields.tekst);
});
test('late acknowledgements never erase a newer draft written after the request',()=>{
 const disk=storage(),store=model.create(disk,61,randomUUID()),scope='tezis:4',old=store.saveDraft(scope,{fields:{tekst:'Отправленный текст'}}),key=randomUUID();store.reserve({key,kind:'pravka',scope,body:{tekst:'Отправленный текст'},draftKey:old.storageKey,draftRevision:old.revision});store.saveDraft(scope,{fields:{tekst:'Новая работа после отправки'}});assert.equal(store.finish(key).draftRetained,true);assert.equal(store.draft(scope).fields.tekst,'Новая работа после отправки');
});
test('three-way comparison keeps independent changes and calls out competing text',()=>{
 const base={napravlenie:'synapt',god:'2026',tekst:'Базовый текст'},draft={...base,tekst:'Мой текст'},current={...base,god:'2027'};assert.deepEqual(model.merge(base,draft,current),{values:{napravlenie:'synapt',god:'2027',tekst:'Мой текст'},conflicts:[]});const conflict=model.merge(base,draft,{...current,tekst:'Текст коллеги'});assert.equal(conflict.values.tekst,'Мой текст');assert.deepEqual(conflict.conflicts,['tekst']);
});
test('storage failure prevents reserving an untracked mutation and corrupt pending data is explicit',()=>{
 const disk=storage(),tab=randomUUID(),store=model.create(disk,61,tab),key=randomUUID();disk.setItem=()=>{throw Error('quota');};assert.throws(()=>store.reserve({key,kind:'sozdat',scope:'god:synapt:2026',body:{tekst:'Keep this'}}),/Не удалось сохранить/);assert.deepEqual(store.pending(),[]);
 const corrupt=storage();corrupt.setItem('locus-strategy-pending-v1:61:'+key,'{');assert.throws(()=>model.create(corrupt,61,tab).pending(),/прочитать/);
});
test('an acknowledgement marks one immutable draft revision without deleting concurrent work',()=>{
 const disk=storage(),store=model.create(disk,61,randomUUID()),scope='tezis:4',draft=store.saveDraft(scope,{fields:{tekst:'Отправленная версия'}}),key=randomUUID();store.reserve({key,kind:'pravka',scope,body:{tekst:'Отправленная версия'},draftKey:draft.storageKey,draftRevision:draft.revision});
 const original=disk.getItem;let armed=true;disk.getItem=name=>{const value=original(name);if(armed&&name===draft.storageKey){armed=false;store.saveDraft(scope,{fields:{tekst:'Параллельная новая работа'}});}return value;};store.finish(key);assert.equal(store.draft(scope).fields.tekst,'Параллельная новая работа');assert.deepEqual(store.pending(),[]);
});
test('a confirmed outcome matches the intended object, fields and complete order',()=>{
 const intent={kind:'pravka',scope:'tezis:4',body:{tekst:'Мой текст',versija:2}},response={sostojanie:'sohraneno',dejstvie:'pravka',oblast:'tezis:4',itog:{id:4,versija:3,tekst:'Мой текст'}};assert.equal(model.confirmed(intent,response),true);for(const bad of [{...response,oblast:'tezis:5'},{...response,itog:{...response.itog,id:5}},{...response,itog:{...response.itog,tekst:'Чужой текст'}},{...response,itog:null}])assert.equal(model.confirmed(intent,bad),false);
 const order={kind:'porjadok',scope:'god:synapt:2026',body:{spisok:[{id:4},{id:7}]}},done={sostojanie:'sohraneno',dejstvie:'porjadok',oblast:order.scope,itog:[{id:4,porjadok:0,versija:3},{id:7,porjadok:1,versija:2}]};assert.equal(model.confirmed(order,done),true);assert.equal(model.confirmed(order,{...done,itog:done.itog.slice().reverse()}),false);
});
