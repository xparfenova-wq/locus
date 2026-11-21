(function(){
'use strict';
const STORE='locus-task-copy-drafts-v1',busy=new Set(),uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function records(){try{const value=JSON.parse(sessionStorage.getItem(STORE)||'{}');if(!value||typeof value!=='object'||Array.isArray(value))return{};return Object.fromEntries(Object.entries(value).filter(([key,r])=>uuid(key)&&r?.actor===API.ja&&r.body&&typeof r.body==='object'&&!Array.isArray(r.body)));}catch{return{};}}
function write(value){sessionStorage.setItem(STORE,JSON.stringify(value));}
function load(key){if(!uuid(key))return null;return records()[key]||null;}
function discard(key){const all=records();delete all[key];write(all);}
function update(key,body){
 const all=records(),record=all[key];if(!record)return;
 const missing=[];const clean={...body,materialy:(body.materialy||[]).filter(m=>{if(m.fajl&&typeof m.fajl!=='string'){missing.push(m.nazvanie||m.fajl.name||'файл');return false;}return true;})};
 record.body=JSON.parse(JSON.stringify(clean));record.missingUploads=[...new Set([...(record.missingUploads||[]).filter(name=>!body.materialy?.some(m=>m.nazvanie===name&&(typeof m.fajl==='string'||m.ssylka))), ...missing])];write(all);
}
function omitMissing(key){const all=records();if(all[key]){all[key].missingUploads=[];write(all);}}
async function resume(key){
 const record=load(key);if(!record)throw new Error('Черновик копии недоступен. Открой исходную задачу и нажми «дублировать» ещё раз.');
 const identity=await API.ekran('vhod',{});if(!identity.voshel||identity.chelovek?.id!==record.actor||(identity.chelovek.dostup??null)!==record.access)throw new Error('Права доступа изменились. Открой исходную задачу и подготовь копию заново.');
 if(typeof O.applyTaskCopyDraft!=='function')throw new Error('Форма ещё не готова. Обнови страницу.');
 O.applyTaskCopyDraft(key);return record;
}
async function open(source,{close,active}={}){
 if(busy.has(source.nomer))return;busy.add(source.nomer);
 const hasDraft=()=>{const form=document.querySelector('#sozd');return form?.dataset.locusDraft==='1'&&(form.classList.contains('on')||form.classList.contains('vstroen'));};
 try{
  if(hasDraft())throw new Error('Сначала заверши открытую задачу, чтобы сохранить введённый текст.');
  const data=await API.ekran('zadachi/'+source.nomer+'/dubl',{versija:source.versija});
  if(active&&!active())return;
  if(hasDraft())throw new Error('В форме появился новый черновик. Копия его не заменит.');
  if(data?.ishodnaja?.nomer!==source.nomer||data.ishodnaja.versija!==source.versija||typeof data.chernovik?.nazvanie!=='string'||['klient_id','proekt_id','sotrudnichestvo_id'].some(k=>data.chernovik[k]!==null))throw new Error('Ответ не подтвердил исходную задачу. Обнови карточку.');
  if(data.dostup_snimok?.actor!==API.ja)throw new Error('Не удалось подтвердить доступ к копии.');
  const key=crypto.randomUUID(),all=records();all[key]={actor:API.ja,access:data.dostup_snimok.dostup??null,source:data.ishodnaja,body:data.chernovik,missingUploads:[]};write(all);
  close?.();
  if(innerWidth<=760||typeof O.applyTaskCopyDraft!=='function'){location.href='/sozdat.html?kopija='+encodeURIComponent(key);return;}
  const address=new URL(location.href);address.searchParams.delete('nomer');address.searchParams.set('kopija',key);address.hash='';history.replaceState(history.state,'',address);
  await resume(key);
 }catch(error){O.tost(error.message||'Не удалось подготовить копию задачи.');}
 finally{busy.delete(source.nomer);}
}
window.LocusTaskCopy={open,resume,load,update,discard,omitMissing};
})();
