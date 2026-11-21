(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusPeriodPlanState=value;})(globalThis,function(){
 'use strict';
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 function confirmed(intent,result){return result?.obekt==='plany_periodov_okr'&&result.avtor_id===intent.actor&&result.cel_id===intent.goal&&result.zapros_kljuch===intent.key&&result.sostojanie==='sohraneno'&&result.dejstvie===intent.kind;}
 function create(storage,actor,tab){
  if(!Number.isSafeInteger(actor)||actor<1||!uuid(tab))throw Error('Не удалось определить владельца черновика');
  const prefix='locus-period-plans-v1:'+actor+':',draftPrefix=prefix+'draft:',pendingPrefix=prefix+'pending:',ackPrefix=prefix+'ack:';
  function scope(goal,period){if(!Number.isSafeInteger(goal)||goal<1||!/^\d{4}(?:-Q[1-4])?$/.test(period))throw Error('Нужны цель и период планирования');return goal+':'+period+':';}
  function keys(prefix){const result=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix))result.push(key);}return result;}
  function read(key){const raw=storage.getItem(key);if(raw===null)return null;try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return {...value,storageKey:key};}catch{throw Error('Не удалось прочитать черновик планов. Скопируй значения перед закрытием');}}
  function write(key,value){try{const raw=JSON.stringify(value);storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error();return {...value,storageKey:key};}catch{throw Error('Не удалось сохранить черновик в браузере. Скопируй значения перед закрытием');}}
  function draft(goal,period){const rows=keys(draftPrefix+scope(goal,period)).map(read).filter(v=>v&&!storage.getItem(ackPrefix+v.revision)).sort((a,b)=>b.updated-a.updated);return rows.find(v=>v.tab===tab)||rows[0]||null;}
  function saveDraft(goal,period,value){return write(draftPrefix+scope(goal,period)+tab,{...value,goal,period,tab,revision:crypto.randomUUID(),updated:Date.now()});}
  function pending(){return keys(pendingPrefix).map(read).map(v=>{if(!uuid(v.key)||!['plan','otmena'].includes(v.kind)||v.actor!==actor||!Number.isSafeInteger(v.goal)||v.goal<1||!v.body||v.body.zapros_kljuch!==v.key||v.storageKey!==pendingPrefix+v.key)throw Error('Не удалось прочитать ожидающее сохранение планов');return v;}).sort((a,b)=>a.created-b.created);}
  function reserve(value){if(!uuid(value.key)||value.actor!==actor||!['plan','otmena'].includes(value.kind)||value.body?.zapros_kljuch!==value.key)throw Error('Не удалось подготовить сохранение планов');if(!Number.isSafeInteger(value.goal)||value.goal<1)throw Error('Нужна цель');const key=pendingPrefix+value.key,old=read(key);if(old&&JSON.stringify(old.body)!==JSON.stringify(value.body))throw Error('Под этим ключом другие планы');return write(key,{...value,created:old?.created||Date.now()});}
  function finish(intent,result){if(!confirmed(intent,result))throw Error('Ответ не подтвердил именно эти планы');const value=read(pendingPrefix+intent.key);if(!value)return {draftRetained:false};let retained=false;
   if(value.draftKey&&value.draftRevision){if(!value.draftKey.startsWith(draftPrefix+scope(value.goal,value.period)))throw Error('Черновик относится к другому периоду');write(ackPrefix+value.draftRevision,{revision:value.draftRevision});const current=read(value.draftKey);retained=!!current&&current.revision!==value.draftRevision;}
   const historyKey=prefix+'last:'+scope(value.goal,value.period);
   if(value.kind==='plan'&&result.sohraneno>0)write(historyKey,{key:value.key,kind:value.kind,goal:value.goal,period:value.period,actor});
   if(value.kind==='otmena'&&read(historyKey)?.key===value.body.ishodnyj_kljuch)storage.removeItem(historyKey);
   storage.removeItem(pendingPrefix+intent.key);return {draftRetained:retained};
  }
  function reject(key){if(!uuid(key))throw Error('Нужен ключ попытки');storage.removeItem(pendingPrefix+key);}
  function discardDraft(goal,period){storage.removeItem(draftPrefix+scope(goal,period)+tab);}
  function last(goal,period){return read(prefix+'last:'+scope(goal,period));}
  return {draft,saveDraft,pending,reserve,finish,reject,discardDraft,last};
 }
 return {create,confirmed};
});
