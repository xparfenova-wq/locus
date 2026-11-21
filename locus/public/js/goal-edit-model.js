(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusGoalEditModel=value;})(globalThis,function(){
 'use strict';
 const fields=['nazvanie','opisanie','napravlenie','period_id','tezis_id'];
 const validUUID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
 const normalized=(row,field)=>field==='nazvanie'?String(row?.[field]??'').trim():String(row?.[field]??'');
 function merge(base,draft,current){const values={},conflicts=[];for(const field of fields){const before=normalized(base,field),mine=normalized(draft,field),theirs=normalized(current,field);if(mine===before)values[field]=theirs;else{values[field]=mine;if(theirs!==before&&theirs!==mine)conflicts.push(field);}}return {values,conflicts};}
 function changed(base,draft){return Object.fromEntries(fields.filter(f=>normalized(base,f)!==normalized(draft,f)).map(f=>[f,f==='tezis_id'?(draft[f]===''||draft[f]==null?null:Number(draft[f])):f==='nazvanie'?String(draft[f]).trim():draft[f]]));}
 function confirmed(intent,result){return validUUID(intent.key)&&result?.zapros_kljuch===intent.key.toLowerCase()&&result.obekt==='pravka_celi'&&result.avtor_id===intent.actor&&result.cel_id===intent.goal&&result.sostojanie==='sohraneno'&&result.dejstvie===intent.kind&&Number.isSafeInteger(result.versija_sohranenija)&&result.versija_sohranenija>=1;}
 function create(storage,actor,tab){
  if(!Number.isSafeInteger(actor)||actor<1||!validUUID(tab))throw Error('Не удалось определить владельца черновика');
  const prefix='locus-goal-edit-v1:'+actor+':',draftPrefix=prefix+'draft:',pendingPrefix=prefix+'pending:',ackPrefix=prefix+'ack:';
  function keys(prefix){const result=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix))result.push(key);}return result;}
  function read(key){const raw=storage.getItem(key);if(raw===null)return null;try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return {...value,storageKey:key};}catch{throw Error('Не удалось прочитать черновик цели. Сохрани введённый текст перед закрытием');}}
  function write(key,value){try{const raw=JSON.stringify(value);storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error();return {...value,storageKey:key};}catch{throw Error('Не удалось сохранить черновик в браузере. Скопируй текст перед закрытием');}}
  function goalID(value){if(!Number.isSafeInteger(value)||value<1)throw Error('Нужен номер цели');return value;}
  function draft(goal){const list=keys(draftPrefix+goalID(goal)+':').map(read).filter(v=>v&&!storage.getItem(ackPrefix+v.revision)).sort((a,b)=>b.updated-a.updated);return list.find(v=>v.tab===tab)||list[0]||null;}
  function saveDraft(goal,value){return write(draftPrefix+goalID(goal)+':'+tab,{...value,goal,tab,revision:crypto.randomUUID(),updated:Date.now()});}
  function pending(){return keys(pendingPrefix).map(read).map(v=>{if(!validUUID(v.key)||!['pravka','otmena'].includes(v.kind)||v.actor!==actor||!Number.isSafeInteger(v.goal)||v.goal<1||!v.body||typeof v.body!=='object'||v.storageKey!==pendingPrefix+v.key.toLowerCase())throw Error('Не удалось прочитать ожидающее изменение цели');return v;}).sort((a,b)=>a.created-b.created);}
  function reserve(value){if(!validUUID(value.key)||value.actor!==actor||!['pravka','otmena'].includes(value.kind))throw Error('Не удалось подготовить изменение цели');goalID(value.goal);const key=pendingPrefix+value.key.toLowerCase(),old=read(key);if(old&&JSON.stringify(old.body)!==JSON.stringify(value.body))throw Error('Под этим ключом сохранены другие изменения');return write(key,{...value,created:old?.created||Date.now()});}
  function finish(intent,result){if(!confirmed(intent,result))throw Error('Ответ не подтвердил именно это изменение цели');const value=read(pendingPrefix+intent.key.toLowerCase());if(!value)return {draftRetained:false};let retained=false;
   if(value.draftKey&&value.draftRevision){if(!value.draftKey.startsWith(draftPrefix+value.goal+':'))throw Error('Черновик относится к другой цели');write(ackPrefix+value.draftRevision,{revision:value.draftRevision});const current=read(value.draftKey);retained=!!current&&current.revision!==value.draftRevision;}
   storage.removeItem(pendingPrefix+intent.key.toLowerCase());return {draftRetained:retained};
  }
  function reject(value){if(!validUUID(value))throw Error('Нужен ключ изменения');storage.removeItem(pendingPrefix+value.toLowerCase());}
  function discardDraft(goal){storage.removeItem(draftPrefix+goalID(goal)+':'+tab);}
  return {draft,saveDraft,pending,reserve,finish,reject,discardDraft};
 }
 return {fields,merge,changed,confirmed,create};
});
