(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusArchiveState=value;})(globalThis,function(){
 'use strict';
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v),positive=v=>Number.isSafeInteger(v)&&v>0;
 const scope=v=>v&&['ljudi','sotrudnichestva'].includes(v.tablica)&&positive(v.id);
 function identity(item,result){return result?.obekt==='arhiv'&&result.avtor_id===item.actor&&result.tablica===item.tablica&&result.id===item.id&&result.zapros_kljuch===item.key;}
 const confirmed=(item,result)=>identity(item,result)&&result.sostojanie==='sohraneno'&&result.dejstvie===item.kind&&result.chelovek_id===item.person&&typeof result.arhiv==='boolean'&&positive(result.versija_sohranenija)&&typeof result.zapis_suschestvuet==='boolean'&&(item.kind==='arhiv'?result.arhiv===item.body.arhiv:result.otmeneno===true);
 function create(storage,actor,tab){
  if(!positive(actor)||!uuid(tab))throw Error('Не удалось определить участника и вкладку');
  const prefix='locus-archive-v1:'+actor+':',pendingPrefix=prefix+'pending:',lastKey=s=>prefix+'last:'+s.tablica+':'+s.id;
  function read(k){const value=storage.getItem(k);if(value===null)return null;try{return JSON.parse(value);}catch{throw Error('Не удалось прочитать проверку действия архива');}}
  function write(k,v){try{const value=JSON.stringify(v);storage.setItem(k,value);if(storage.getItem(k)!==value)throw Error();}catch{throw Error('Браузер не сохранил проверку. Действие не отправлено');}}
  function valid(v){
   if(!v||v.actor!==actor||!uuid(v.key)||!uuid(v.tab)||!scope(v)||!positive(v.person)||v.tablica==='ljudi'&&v.person!==v.id||!['arhiv','otmenit'].includes(v.kind))return false;
   const b=v.body;if(!b||b.tablica!==v.tablica||b.id!==v.id||b.zapros_kljuch!==v.key)return false;
   const allowed=['tablica','id','zapros_kljuch',...(v.kind==='arhiv'?['arhiv','versija','kontekst']:['ishodnyj_kljuch'])];if(Object.keys(b).some(k=>!allowed.includes(k)))return false;
   return v.kind==='arhiv'?typeof b.arhiv==='boolean'&&positive(b.versija)&&typeof b.kontekst==='string'&&/^[a-f0-9]{64}$/.test(b.kontekst):uuid(b.ishodnyj_kljuch);
  }
  function pending(){const out=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(pendingPrefix))continue;const v=read(k);if(!valid(v)||k!==pendingPrefix+v.key)throw Error('Проверка действия повреждена. Повтор автоматически не отправлен');out.push(v);}return out.sort((a,b)=>a.created-b.created);}
  function reserve(value){const v={...value,tab,created:Date.now()};if(!valid(v))throw Error('Не удалось подготовить действие архива');const k=pendingPrefix+v.key,old=read(k);if(old&&JSON.stringify(old.body)!==JSON.stringify(v.body))throw Error('Под этим ключом другое действие');write(k,v);return v;}
  function finish(item,result){
   if(!confirmed(item,result))throw Error('Ответ не подтвердил именно эту карточку');
   if(item.kind==='arhiv'&&!result.vernuto&&result.zapis_suschestvuet&&!result.perenesen)write(lastKey(item),{actor,key:item.key,tablica:item.tablica,id:item.id,person:item.person,arhiv:result.arhiv});
   else if(item.kind==='otmenit'&&read(lastKey(item))?.key===item.body.ishodnyj_kljuch||result.vernuto&&read(lastKey(item))?.key===item.key)storage.removeItem(lastKey(item));
   storage.removeItem(pendingPrefix+item.key);
  }
  function reject(v){if(!uuid(v))throw Error('Нужен ключ попытки');storage.removeItem(pendingPrefix+v);}
  function last(s){if(!scope(s))throw Error('Нужна карточка');const v=read(lastKey(s));if(v&&(!scope(v)||v.actor!==actor||!uuid(v.key)||!positive(v.person)||typeof v.arhiv!=='boolean'))throw Error('Не удалось прочитать последнее действие');return v;}
  return {pending,reserve,finish,reject,last};
 }
 return {create,identity,confirmed};
});
