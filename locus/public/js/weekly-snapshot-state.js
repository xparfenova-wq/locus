(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusWeeklySnapshotState=value;})(globalThis,function(){
 'use strict';
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 const scope=v=>v&&typeof v.napravlenie==='string'&&v.napravlenie.length>0&&v.napravlenie.length<=100&&Number.isInteger(v.god)&&v.god>=1000&&v.god<=9999&&Number.isInteger(v.nedelja)&&v.nedelja>=1&&v.nedelja<=53;
 function identity(item,result){return result?.obekt==='snimok_planerki'&&result.avtor_id===item.actor&&result.napravlenie===item.napravlenie&&result.god===item.god&&result.nedelja===item.nedelja&&result.zapros_kljuch===item.key;}
 function confirmed(item,result){return identity(item,result)&&result.sostojanie==='sohraneno'&&result.dejstvie===item.kind;}
 function create(storage,actor,tab){
  if(!Number.isSafeInteger(actor)||actor<1||!uuid(tab))throw Error('Не удалось определить участника и вкладку');
  const prefix='locus-weekly-v1:'+actor+':',pendingPrefix=prefix+'pending:',lastKey=s=>prefix+'last:'+encodeURIComponent(s.napravlenie)+':'+s.god+':'+s.nedelja;
  const read=k=>{const text=storage.getItem(k);if(text===null)return null;try{return JSON.parse(text);}catch{throw Error('Не удалось прочитать проверку сохранения недели');}};
  function write(k,v){try{const text=JSON.stringify(v);storage.setItem(k,text);if(storage.getItem(k)!==text)throw Error();}catch{throw Error('Браузер не сохранил проверку. Пересчёт не отправлен');}}
  function valid(v){return v&&v.actor===actor&&uuid(v.key)&&uuid(v.tab)&&scope(v)&&['pereschitat','otmenit'].includes(v.kind)&&v.body?.zapros_kljuch===v.key&&Object.keys(v.body).every(k=>['zapros_kljuch',v.kind==='pereschitat'?'kontekst':'ishodnyj_kljuch'].includes(k))&&(v.kind==='pereschitat'?/^[a-f0-9]{64}$/.test(v.body.kontekst):uuid(v.body.ishodnyj_kljuch));}
  function pending(){const list=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(pendingPrefix))continue;const v=read(k);if(!valid(v)||k!==pendingPrefix+v.key)throw Error('Проверка сохранения повреждена. Повтор автоматически не отправлен');list.push(v);}return list.sort((a,b)=>a.created-b.created);}
  function reserve(value){const v={...value,tab,created:Date.now()};if(!valid(v))throw Error('Не удалось подготовить сохранение недели');const k=pendingPrefix+v.key,old=read(k);if(old&&JSON.stringify(old.body)!==JSON.stringify(v.body))throw Error('Под этим ключом другое действие');write(k,v);return v;}
  function finish(item,result){if(!confirmed(item,result))throw Error('Ответ не подтвердил именно это сохранение');if(item.kind==='pereschitat'&&!result.net_izmenenij&&!result.vernuto)write(lastKey(item),{key:item.key,actor,...{napravlenie:item.napravlenie,god:item.god,nedelja:item.nedelja}});else if(item.kind==='otmenit'&&read(lastKey(item))?.key===item.body.ishodnyj_kljuch||result.vernuto&&read(lastKey(item))?.key===item.key)storage.removeItem(lastKey(item));storage.removeItem(pendingPrefix+item.key);}
  function reject(value){if(!uuid(value))throw Error('Нужен ключ попытки');storage.removeItem(pendingPrefix+value);}
  function last(s){if(!scope(s))throw Error('Нужна неделя');const v=read(lastKey(s));if(v&&(!uuid(v.key)||v.actor!==actor||!scope(v)))throw Error('Не удалось прочитать последнее сохранение');return v;}
  return {pending,reserve,finish,reject,last};
 }
 return {create,identity,confirmed};
});
