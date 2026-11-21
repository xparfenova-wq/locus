                                                                                 
(()=>{
 'use strict';let current;
 function mount(host,{API,O,onChanged,beforeDelete}){
  if(current?.host===host)return current;
  const actor=Number(API.ja),prefix='locus-okr-deletion:'+actor+':',busy=new Set(),dialogs=new Map();let sequence=0,message='';
  const slot=r=>prefix+r.kind+':'+r.key;
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
  function records(){const out=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;const raw=localStorage.getItem(key);let r;try{r=JSON.parse(raw);}catch{throw new Error('Не удалось прочитать сохранённую проверку удаления');}if(r.actor!==actor||!uuid(r.key)||!['delete','restore'].includes(r.kind)||!['celi','rezultaty'].includes(r.table)||!Number.isSafeInteger(r.id)||r.id<1||slot(r)!==key||!['pending','unknown','absent'].includes(r.phase)||typeof r.title!=='string'||!r.body||typeof r.body!=='object'||Array.isArray(r.body)||(r.kind==='delete'&&(r.body.zapros_kljuch!==r.key||!Number.isSafeInteger(r.body.versija)||typeof r.body.kontekst_udalenija!=='string'))||(r.kind==='restore'&&r.body.dejstvie_id!==r.key))throw new Error('Сохранённое действие нужно проверить');out.push({...r,raw});}return out;}
  function write(r){const key=slot(r),raw=localStorage.getItem(key);if(raw!==(r.raw??null))throw new Error('Действие обновилось в другой вкладке. Проверь его ещё раз');const next=JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='raw')));localStorage.setItem(key,next);if(localStorage.getItem(key)!==next)throw new Error('Браузер не сохранил проверку');r.raw=next;}
  function clear(r){if(localStorage.getItem(slot(r))!==r.raw)throw new Error('Проверка обновилась в другой вкладке');localStorage.removeItem(slot(r));}
  const button=(text,action,tag)=>{const b=document.createElement('button');b.type='button';b.className='kn ostavit-vnutri';b.textContent=text;b.dataset[tag]='1';b.addEventListener('click',()=>Promise.resolve(action()).catch(e=>{message=e.message;render();}));return b;};
  const root=document.createElement('div'),pending=document.createElement('div'),deleted=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('div'),status=document.createElement('p');root.className='okr-deletion-state';status.setAttribute('role','status');summary.textContent='Удалённые цели и результаты';deleted.append(summary,list);root.append(pending,deleted,status);host.replaceChildren(root);
  const label=r=>(r.table==='celi'?'цели':'результата')+' «'+r.title+'»';
  async function refresh(action){try{await onChanged?.(action);}catch{message='Действие сохранено. Не удалось обновить экран: обнови страницу.';}await refreshList();render();}
  function controls(container,r){container.replaceChildren();const p=document.createElement('p');p.textContent=(r.kind==='delete'?'Удаление ':'Восстановление ')+label(r)+' пока не подтверждено.';container.append(p,button(r.kind==='delete'?'проверить удаление':'проверить восстановление',()=>check(r),'okrDeleteCheck'));if(r.phase==='absent')container.append(button(r.kind==='delete'?'повторить удаление':'повторить восстановление',()=>send(r,true),'okrDeleteRepeat'));for(const b of container.querySelectorAll('button'))b.disabled=busy.has(slot(r));}
  function render(){
   if(!host.isConnected)return;pending.replaceChildren();status.textContent=message;
   try{for(const r of records()){const box=document.createElement('div');box.className='okr-deletion-pending';controls(box,r);pending.append(box);const dialog=dialogs.get(r.key);if(dialog?.root.isConnected){const area=dialog.root.querySelector('[data-okr-delete-recovery]');if(area)controls(area,r);dialog.root.querySelector('.vyb-g')?.setAttribute('aria-disabled','true');}}}catch(e){status.textContent=e.message;}
  }
  async function accepted(r,result){
   const latest=localStorage.getItem(slot(r));if(latest!==null){const live=JSON.parse(latest);if(live.actor!==r.actor||live.kind!==r.kind||live.table!==r.table||live.id!==r.id||JSON.stringify(live.body)!==JSON.stringify(r.body))throw new Error('Действие подтверждено, но сохранённая проверка другой вкладки отличается');r.raw=latest;clear(r);}
   dialogs.get(r.key)?.close();dialogs.delete(r.key);await refresh({kind:r.kind,table:r.table,id:r.id,result});
   if(r.kind==='delete'){
    if(result.otmeneno)O.tost('Это удаление уже отменено');
    else O.tost((r.table==='celi'?'Цель удалена':'Результат удалён'),()=>restore({dejstvie_id:r.key,obekt:r.table,id:r.id,nazvanie:r.title}));
   }else O.tost(result.sostojanie==='vosstanovleno'?'Данные восстановлены вместе с замерами и связями':result.sostojanie==='pozdnee_udaleno'?'Восстановление было выполнено раньше; затем запись удалили снова':'Восстановление было выполнено раньше; запись изменилась');
  }
  function validate(result,r,direct=false){
   if(!result||result.id!==r.id)throw new Error('Ответ не подтвердил исходную запись');
   if(direct&&r.kind==='delete'){if(result.udalenie_podtverzhdeno!==true||result.otmena_dejstvie_id!==r.key)throw new Error('Удаление ещё не подтверждено');return;}
   if(result.tip!=='udalenie_okr'||result.najdeno!==true||result.obekt!==r.table||typeof result.otmeneno!=='boolean')throw new Error('Ответ не подтвердил действие');
  }
  async function send(r,retry=false){
   if(busy.has(slot(r)))return false;
   if(r.raw&&!retry){message='Сначала проверь предыдущее действие';render();return false;}
   if(retry&&r.phase!=='absent')throw new Error('Сначала прочитай результат предыдущей попытки');
   if(Number(API.ja)!==actor)throw new Error('В браузере сменился участник. Обнови страницу');
   r.phase='pending';write(r);busy.add(slot(r));render();
   try{if(r.kind==='delete')beforeDelete?.(r);const result=await API.zapros(r.kind==='delete'?'DELETE':'POST',r.kind==='delete'?'/'+r.table+'/'+r.id:'/otmena',r.body);validate(result,r,true);if(r.kind==='restore'&&!result.otmeneno)throw new Error('Восстановление ещё не подтверждено');await accepted(r,result);return true;}
   catch(e){if(Number.isInteger(e.kod)&&e.kod<500){try{clear(r);}catch{}message=e.message;const dialog=dialogs.get(r.key);if(dialog?.root.isConnected){dialog.root.querySelector('.vyb-g')?.setAttribute('aria-disabled','true');const area=dialog.root.querySelector('[data-okr-delete-recovery]');area.replaceChildren();const p=document.createElement('p');p.textContent=e.message;area.append(p,button('обновить состав',()=>{dialog.close();return confirm(r.table,r.id);},'okrDeleteRefresh'));}}else{message='Результат пока не подтверждён. Проверь его перед повтором.';try{r.phase='unknown';write(r);}catch{}}render();return false;}
   finally{busy.delete(slot(r));render();}
  }
  async function check(r){
   if(busy.has(slot(r)))return;busy.add(slot(r));render();
   try{const result=await API.zapros('GET','/otmena?dejstvie_id='+encodeURIComponent(r.key));if(result?.najdeno===false){r.phase='absent';write(r);message='Действие пока не найдено. Автоматического повтора не было.';return;}validate(result,r);if(r.kind==='delete'||result.otmeneno)await accepted(r,result);else{r.phase='absent';write(r);message='Восстановление не выполнено. Его можно повторить отдельно.';}}
   catch(e){message='Не удалось подтвердить результат: '+e.message;}
   finally{busy.delete(slot(r));render();}
  }
  async function removeKnown(table,row){
   if(!row||!Number.isSafeInteger(row.id)||!Number.isSafeInteger(row.versija)||typeof row.kontekst_udalenija!=='string')throw new Error('Обнови запись перед удалением');
   const existing=records().find(r=>r.kind==='delete'&&r.table===table&&r.id===row.id);if(existing){await check(existing);return false;}
   const key=crypto.randomUUID(),r={actor,key,kind:'delete',table,id:row.id,title:String(row.nazvanie||''),body:{versija:row.versija,kontekst_udalenija:row.kontekst_udalenija,zapros_kljuch:key}};return send(r);
  }
  async function confirm(table,id){
   const row=await API.odna(table,id),counts=row.svjazano_pri_udalenii;if(!counts||typeof row.kontekst_udalenija!=='string')throw new Error('Обнови карточку перед удалением');
   const existing=records().find(r=>r.kind==='delete'&&r.table===table&&r.id===id);if(existing){await check(existing);return;}
   const key=crypto.randomUUID(),r={actor,key,kind:'delete',table,id,title:String(row.nazvanie||''),body:{versija:row.versija,kontekst_udalenija:row.kontekst_udalenija,zapros_kljuch:key}};
   const close=O.modalka('Удалить '+(table==='celi'?'цель':'результат')+' «'+r.title+'»',`<p>Вместе с записью удалятся ${Number(counts.rezultatov)} результатов и ${Number(counts.zamerov)} замеров${counts.periodnyh_planov?", а также периодные планы: "+Number(counts.periodnyh_planov):""}. Связанные задачи останутся, их связи с удалёнными записями снимутся.</p><p>При отмене вернутся прежние данные, история и связи.</p><div data-okr-delete-recovery role="status"></div><div class="fch-niz"><button type="button" class="kn ostavit-vnutri" data-okr-delete-cancel>оставить как есть</button></div>`,null,{poverh:true,podskazka:'удалить',gotovo:()=>send(r)}),dialog=document.querySelector('.vyb-fon:last-of-type');dialog.dataset.okrDeleteKey=key;dialogs.set(key,{root:dialog,close});dialog.querySelector('[data-okr-delete-cancel]').onclick=close;
  }
  async function restore(row){
   const existing=records().find(r=>r.kind==='restore'&&r.key===row.dejstvie_id);if(existing){await check(existing);return;}
   const r={actor,key:row.dejstvie_id,kind:'restore',table:row.obekt,id:row.id,title:String(row.nazvanie||''),body:{dejstvie_id:row.dejstvie_id}};await send(r);
  }
  async function refreshList(cursor=null){
   const generation=++sequence;try{const result=await API.zapros('GET','/otmena?obekt=okr&skolko=10'+(cursor?'&posle='+cursor:''));if(generation!==sequence||!host.isConnected)return;if(!Array.isArray(result?.spisok)||!Number.isSafeInteger(result.vsego))throw new Error('Список удалений не подтверждён');if(!cursor)list.replaceChildren();summary.textContent='Удалённые цели и результаты · '+result.vsego;
    list.querySelector('[data-okr-delete-more]')?.remove();for(const row of result.spisok){if(!uuid(row.dejstvie_id)||!['celi','rezultaty'].includes(row.obekt))throw new Error('Данные удаления не подтверждены');const item=document.createElement('div'),name=document.createElement('span');item.className='okr-deleted-row';name.textContent=row.nazvanie;item.append(name,button('восстановить',()=>restore(row),'okrDeletedRestore'));list.append(item);}if(result.prodolzhit)list.append(button('показать ещё',()=>refreshList(result.prodolzhit),'okrDeleteMore'));if(!result.vsego)list.append(document.createTextNode(result.skryto?.includes('dengi')?'Часть удалений скрыта по правам доступа.':'Удалённых записей нет.'));deleted.hidden=!result.vsego&&!result.skryto?.length;
   }catch(e){if(generation===sequence){message='Не удалось прочитать удаления: '+e.message;status.textContent=message;list.append(button('повторить чтение',()=>refreshList(),'okrDeleteListRetry'));}}
  }
  window.addEventListener('storage',e=>{if(e.key===null||e.key?.startsWith(prefix))render();});render();refreshList();current={host,confirm,removeKnown,restore,refresh:refreshList};return current;
 }
 window.LocusOkrDelete={mount,removeKnown:(table,row)=>{if(!current)throw new Error('Обнови раздел ОКР');return current.removeKnown(table,row);}};
})();
