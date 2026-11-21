(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusStrategyModel=value;})(globalThis,function(){
 'use strict';
 const fields=['napravlenie','god','tekst'],kinds=['sozdat','pravka','udalit','porjadok'];
 const validUUID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
 function confirmed(intent,response){
  if(response?.sostojanie!=='sohraneno'||response.dejstvie!==intent.kind||response.oblast!==intent.scope)return false;
  const result=response.itog,body=intent.body||{};
  if(intent.kind==='porjadok')return Array.isArray(result)&&Array.isArray(body.spisok)&&result.length===body.spisok.length&&result.every((row,index)=>row.id===body.spisok[index].id&&row.porjadok===index&&Number.isSafeInteger(row.versija)&&row.versija>=1);
  if(!result||!Number.isSafeInteger(result.id)||result.id<1||!Number.isSafeInteger(result.versija)||result.versija<1)return false;
  if(intent.kind!=='sozdat'&&intent.scope!=='tezis:'+result.id)return false;
  if(intent.kind==='udalit')return result.udaleno===true;
  return ['napravlenie','god','tekst','porjadok','udaleno'].every(field=>!Object.hasOwn(body,field)||String(result[field])===String(body[field]));
 }
 function merge(base,draft,current){const values={},conflicts=[];for(const key of fields){const before=String(base?.[key]??''),mine=String(draft?.[key]??''),theirs=String(current?.[key]??'');if(mine===before)values[key]=theirs;else{values[key]=mine;if(theirs!==before&&theirs!==mine)conflicts.push(key);}}return {values,conflicts};}
 function create(storage,actor,tab){
  if(!Number.isSafeInteger(actor)||actor<1||!validUUID(tab))throw new Error('Не удалось определить владельца черновика');
  const draftPrefix='locus-strategy-draft-v1:'+actor+':',pendingPrefix='locus-strategy-pending-v1:'+actor+':',ackPrefix='locus-strategy-ack-v1:'+actor+':';
  function keys(prefix){const result=[];for(let index=0;index<storage.length;index++){const key=storage.key(index);if(key?.startsWith(prefix))result.push(key);}return result;}
  function read(key){const raw=storage.getItem(key);if(raw===null)return null;try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return {...value,storageKey:key};}catch{throw new Error('Не удалось прочитать сохранённый черновик стратегии');}}
  function write(key,value){try{storage.setItem(key,JSON.stringify(value));if(storage.getItem(key)!==JSON.stringify(value))throw new Error();}catch{throw new Error('Не удалось сохранить черновик в этом браузере. Скопируй текст перед закрытием');}return {...value,storageKey:key};}
  function draftKey(scope){if(typeof scope!=='string'||!scope||scope.length>200)throw new Error('Не удалось определить страницу черновика');return draftPrefix+encodeURIComponent(scope)+':'+tab;}
  function drafts(scope){const prefix=draftPrefix+encodeURIComponent(scope)+':';return keys(prefix).map(read).filter(value=>value&&!storage.getItem(ackPrefix+value.revision)).sort((a,b)=>(b.updated||0)-(a.updated||0));}
  function draft(scope){const list=drafts(scope);return list.find(item=>item.tab===tab)||list[0]||null;}
  function saveDraft(scope,value){return write(draftKey(scope),{...value,scope,tab,revision:crypto.randomUUID(),updated:Date.now()});}
  function pending(){return keys(pendingPrefix).map(key=>{const value=read(key);if(!value)return null;if(!validUUID(value.key)||key!==pendingPrefix+value.key.toLowerCase()||!kinds.includes(value.kind)||typeof value.scope!=='string'||!value.body||typeof value.body!=='object')throw new Error('Не удалось прочитать ожидающее изменение стратегии');return value;}).filter(Boolean).sort((a,b)=>a.created-b.created);}
  function reserve(value){
   if(!validUUID(value.key)||!kinds.includes(value.kind)||typeof value.scope!=='string'||!value.body||typeof value.body!=='object')throw new Error('Не удалось подготовить изменение стратегии');
   const key=pendingPrefix+value.key.toLowerCase(),old=read(key);
   if(old&&JSON.stringify(old.body)!==JSON.stringify(value.body))throw new Error('Под этим ключом сохранены другие изменения');
   return write(key,{...value,created:old?.created||Date.now()});
  }
  function finish(key){
   if(!validUUID(key))throw new Error('Не удалось определить сохранённое изменение');const storageKey=pendingPrefix+key.toLowerCase(),value=read(storageKey);if(!value)return {draftRetained:false};
   let retained=false;
   if(value.draftKey&&value.draftRevision){write(ackPrefix+value.draftRevision,{revision:value.draftRevision});const current=read(value.draftKey);retained=!!current&&current.revision!==value.draftRevision;}
   storage.removeItem(storageKey);return {draftRetained:retained};
  }
  function reject(key){if(!validUUID(key))throw new Error('Не удалось определить изменение');storage.removeItem(pendingPrefix+key.toLowerCase());}
  function discardDraft(scope){storage.removeItem(draftKey(scope));}
  return {draft,drafts,saveDraft,pending,reserve,finish,reject,discardDraft};
 }
 return {create,merge,validUUID,confirmed};
});
