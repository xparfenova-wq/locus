(() => {
'use strict';
const API=window.API,actor=()=>API.ja,pendingKey=()=>`locus-publication-source-v1:${actor()}`,lastKey=n=>`locus-publication-last-v1:${actor()}:${n}`;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v),positive=v=>Number.isSafeInteger(v)&&v>0;
let busy=false;const listeners=new Set();
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,mark,fn){const b=node('button',text,'kn');b.type='button';b.dataset[mark]='1';b.onclick=fn;return b;}
function read(){try{const raw=sessionStorage.getItem(pendingKey());if(!raw)return null;const r=JSON.parse(raw);if(r.format!==1||r.actor!==actor()||!positive(r.id)||!positive(r.nomer)||!uuid(r.key)||!['change','undo'].includes(r.kind)||r.action!==undefined&&r.action!=='settings'||!['pending','absent','confirmed','terminal'].includes(r.phase)||r.kind==='change'&&(r.body?.zadacha_id!==r.id||r.body?.zapros_kljuch!==r.key)||r.kind==='undo'&&r.body?.dejstvie_id!==r.key)throw new Error();return r;}catch{return {invalid:true};}}
function store(r){sessionStorage.setItem(pendingKey(),JSON.stringify(r));if(sessionStorage.getItem(pendingKey())!==JSON.stringify(r))throw new Error('Браузер не сохранил проверку операции.');}
function same(r){const live=read();if(actor()!==r.actor||live?.key!==r.key||live?.kind!==r.kind||live?.id!==r.id)throw new Error('Незавершённая операция изменилась. Проверь её отдельно.');}
function clear(r){same(r);sessionStorage.removeItem(pendingKey());if(sessionStorage.getItem(pendingKey())!==null)throw new Error('Браузер не снял незавершённую операцию.');}
function notify(){notices();for(const fn of listeners)fn();}
async function request(method,route,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{return await API.zapros(method,route,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
const route=r=>'/zadachi/'+r.nomer;
function checked(result,r){
 if(r.kind==='change'){if(!result||result.avtor_id!==r.actor||result.zadacha_id!==r.id||result.nomer!==r.nomer||result.obekt!=='publikacija_istochnik'||!['ne_najdeno','sohraneno','otmeneno','udaleno'].includes(result.sostojanie))throw new Error('Ответ не подтвердил эту операцию с источником.');}
 else if(!result||result.tip!=='istochnik_publikacii'||result.dejstvie_id!==r.key||result.zadacha_id!==r.id||result.nomer!==r.nomer||result.najdeno!==true||typeof result.otmeneno!=='boolean'||typeof result.otmena_otmenena!=='boolean')throw new Error('Ответ не подтвердил отмену этого источника.');
 if(r.kind==='change'&&result.podtverzhdenie&&!!result.podtverzhdenie.nastrojki!==(r.action==='settings'))throw new Error('Ответ не подтвердил нужный вид правки публикации.');
 return result;
}
function remember(r,ack){if(!uuid(ack?.dejstvie_id)||!ack.izmeneno||ack.otmeneno)return;const saved={actor:r.actor,id:r.id,nomer:r.nomer,action:ack.dejstvie_id,settings:r.action==='settings'};sessionStorage.setItem(lastKey(r.nomer),JSON.stringify(saved));if(sessionStorage.getItem(lastKey(r.nomer))!==JSON.stringify(saved))throw new Error('Не удалось сохранить доступ к отмене. Проверь результат ещё раз.');}
function last(task){try{const r=JSON.parse(sessionStorage.getItem(lastKey(task.nomer)));return r?.actor===actor()&&r.id===task.id&&r.nomer===task.nomer&&uuid(r.action)?r:null;}catch{return null;}}
async function finish(result,r){
 same(r);checked(result,r);
 if(r.kind==='change'&&result.sostojanie==='ne_najdeno'||r.kind==='undo'&&!result.otmeneno&&!result.otmena_otmenena&&!result.udaleno){r.phase='absent';store(r);notify();return false;}
 r.phase='confirmed';store(r);
 if(r.kind==='change'&&result.sostojanie==='sohraneno')remember(r,result.podtverzhdenie);
 if(r.kind==='undo'&&(result.otmeneno||result.udaleno))sessionStorage.removeItem(lastKey(r.nomer));
 if(r.kind==='undo'&&result.otmena_otmenena)sessionStorage.removeItem(lastKey(r.nomer));
 if(r.action==='settings'){const module=await settingsReady();module.settle(r,result);}
 clear(r);notify();document.dispatchEvent(new CustomEvent('locus:publication-source-changed',{detail:{id:r.id,nomer:r.nomer,nastrojki:r.action==='settings'||!!r.undoSettings}}));
 const ack=result.podtverzhdenie;
 O.tost(r.kind==='undo'?(result.otmeneno?(r.undoSettings?'Настройки публикации возвращены.':'Прежний источник возвращён.'):'Возврат источника отменён.'):result.sostojanie==='sohraneno'?(ack?.otmeneno?'Правка публикации была отменена.':r.action==='settings'?'Настройки публикации сохранены.':'Источник сохранён.'):result.sostojanie==='otmeneno'?'Попытка сохранения отменена.':'Исходная задача удалена.',r.kind==='change'&&ack?.izmeneno&&!ack.otmeneno?()=>startUndo({id:r.id,nomer:r.nomer},ack.dejstvie_id,r.action==='settings'):undefined);
 return true;
}
async function operate(r,mode){
 if(busy)throw new Error('Дождись текущей проверки.');same(r);busy=true;notify();
 try{
  let result;
  if(mode==='check')result=await request('GET',r.kind==='change'?route(r)+'/publikacija_istochnik_proverka?'+new URLSearchParams({zadacha_id:r.id,zapros_kljuch:r.key}):'/otmena?dejstvie_id='+encodeURIComponent(r.key));
  else if(mode==='cancel')result=await request('POST',r.kind==='change'?route(r)+'/publikacija_istochnik_otmena_popytki':'/otmena',r.kind==='change'?{zadacha_id:r.id,zapros_kljuch:r.key}:{dejstvie_id:r.key,otkaz:true});
  else{
   if(mode==='repeat'&&r.phase!=='absent')throw new Error('Сначала проверь результат прежнего запроса.');
   r.phase='pending';store(r);result=await request('POST',r.kind==='change'?route(r)+(r.action==='settings'?'/publikacija_nastrojki':'/publikacija_istochnik'):'/otmena',r.body);
  }
  return await finish(checked(result,r),r);
 }catch(error){same(r);notify();throw error;}finally{busy=false;notify();}
}
async function begin(r,prepare){if(read())throw new Error('Сначала проверь предыдущую операцию с публикацией.');store(r);try{prepare?.();}finally{notify();}return operate(r,'send');}
function startUndo(task,action,undoSettings=false){return begin({format:1,actor:actor(),id:task.id,nomer:task.nomer,key:action,kind:'undo',undoSettings,phase:'pending',body:{dejstvie_id:action}});}
let settingsPromise=null;
const settingsBridge={actor,read,begin,request,recovery,notify,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
function settingsReady(){
 if(window.LocusPublicationSettings){window.LocusPublicationSettings.init(settingsBridge);return Promise.resolve(window.LocusPublicationSettings);}
 if(!settingsPromise)settingsPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/task-publication-settings.js';script.onload=()=>{if(!window.LocusPublicationSettings){settingsPromise=null;return reject(new Error('Настройки публикации не загрузились.'));}window.LocusPublicationSettings.init(settingsBridge);resolve(window.LocusPublicationSettings);};script.onerror=()=>{settingsPromise=null;script.remove();reject(new Error('Не удалось загрузить настройки публикации.'));};document.head.append(script);});return settingsPromise;
}
async function settings(task,options={}){return (await settingsReady()).open(task,options);}
function settingsNotices(){return settingsReady().then(module=>module.notices());}
function settingsDraft(task){try{return !!sessionStorage.getItem('locus-publication-settings-draft-v1:'+actor()+':'+task.id);}catch{return false;}}
let noticeObserver=null;
function placeNotice(){
 const note=document.getElementById('publication-source-pending-note');if(!note){if(read())notices();return;}
 const modal=[...document.querySelectorAll('.vyb-fon:not([hidden])')].at(-1),inRecovery=!!modal?.querySelector('[data-publication-recovery]');
 if(note.hidden!==inRecovery)note.hidden=inRecovery;
 const target=modal?.querySelector('.vyb-t');
 if(target){note.classList.add('publication-pending-inline');if(note.parentElement!==target)target.prepend(note);}
 else{note.classList.remove('publication-pending-inline');let stack=document.getElementById('pending-command-notes');if(!stack){stack=node('div',undefined,'pending-command-notes');stack.id='pending-command-notes';document.body.append(stack);}if(note.parentElement!==stack)stack.append(note);}
}
function notices(){
 if(window.LocusPublicationSettings)window.LocusPublicationSettings.notices();else if(read()?.action==='settings')settingsNotices().catch(()=>{});
 const id='publication-source-pending-note';document.getElementById(id)?.remove();const r=read();let stack=document.getElementById('pending-command-notes');
 if(r){if(!stack){stack=node('div',undefined,'pending-command-notes');stack.id='pending-command-notes';document.body.append(stack);}const note=node('aside',undefined,'locus-session-note');note.id=id;note.setAttribute('role','status');note.append(node('span',r.invalid?'Не удалось прочитать проверку источника публикации.':(r.action==='settings'?'Настройки публикации, задача ':'Источник публикации, задача ')+r.nomer+': результат ещё не подтверждён.'));if(!r.invalid){const b=button('проверить','publicationRecoveryOpen',recovery);b.disabled=busy;note.append(b);}stack.append(note);}
 if(stack&&!stack.children.length)stack.remove();
 if(r){placeNotice();if(!noticeObserver){noticeObserver=new MutationObserver(placeNotice);noticeObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});}}else{noticeObserver?.disconnect();noticeObserver=null;}
}
function recovery(){
 const r=read();if(!r||r.invalid)return;
 const close=O.modalka(r.action==='settings'?'Проверить настройки публикации':'Проверить источник публикации','<div data-publication-recovery><p data-publication-recovery-status role="status" aria-live="polite"></p><div class="pending-command-actions" data-publication-recovery-actions></div></div>',null,{poverh:true});
 const root=document.querySelector('[data-publication-recovery]'),status=root.querySelector('[data-publication-recovery-status]'),actions=root.querySelector('[data-publication-recovery-actions]');
 status.textContent='Задача '+r.nomer+'. Проверка читает подтверждение прежней операции и не повторяет сохранение.';
 const draw=()=>{if(!root.isConnected){listeners.delete(draw);return;}const live=read();actions.replaceChildren();if(!live||live.key!==r.key){status.textContent='Результат подтверждён. Карточка показывает текущий источник.';actions.append(button('закрыть','publicationRecoveryClose',()=>{close();for(const form of document.querySelectorAll('[data-publication-settings-key]'))if(form.dataset.publicationSettingsKey===r.key&&form.dataset.publicationSettingsDone==='1')form.locusSettingsClose?.();}));return;}if(live.invalid)return;
  const run=async mode=>{status.textContent='Проверяю…';try{const done=await operate(read(),mode);status.textContent=done?'Результат подтверждён.':live.kind==='undo'?'Возврат ещё не подтверждён. Можно повторить его или окончательно отказаться от возврата.':'Сохранение не найдено. Можно повторить прежний запрос или отменить эту попытку.';}catch(error){status.textContent=error.message||'Ответ не получен. Проверь результат.';}draw();};
  actions.append(button('проверить результат','publicationRecoveryCheck',()=>run('check')));
  if(live.phase==='absent'){actions.append(button('повторить прежний запрос','publicationRecoveryRepeat',()=>run('repeat')),button(live.kind==='undo'?'не возвращать источник':'отменить попытку','publicationRecoveryCancel',()=>run('cancel')));}
  for(const b of actions.children)b.disabled=busy;
 };listeners.add(draw);draw();
}
function safeLink(url){try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password?parsed.href:null;}catch{return null;}}
function day(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('.'):value||'не указана';}
function mount(task,slot){
 let disposed=false,sequence=0,current=null;slot.dataset.publicationTask=String(task.nomer);
 const refresh=async()=>{const token=++sequence;try{const info=await request('GET','/zadachi/'+task.nomer+'/publikacija_istochnik');if(disposed||token!==sequence)return;if(info.zadacha_id!==task.id||info.nomer!==task.nomer)throw new Error('Ответ относится к другой задаче.');current=info;draw();}catch(error){if(disposed||token!==sequence)return;slot.replaceChildren(node('p',error.message,'kz-kom-net'),button('повторить загрузку','publicationRefresh',refresh));}};
 function draw(){if(disposed||!current)return;slot.replaceChildren();const info=current;if(!info.publikacija){slot.append(node('div','публикация','kz-sek'),button(settingsDraft(task)?'продолжить настройку публикации':'сделать публикацией','publicationSettings',()=>settings(task,{makePublication:true}).catch(error=>O.tost(error.message))));const previous=last(task);if(previous){const undo=button(previous.settings?'отменить правку настроек':'отменить смену источника','publicationUndo',()=>startUndo(task,previous.action,!!previous.settings).catch(error=>O.tost(error.message)));undo.disabled=!!read()||busy;slot.append(undo);}if(read())slot.append(button('проверить сохранение','publicationRecoveryOpen',recovery));return;}const heading=node('div','публикация','kz-sek'),details=node('div',undefined,'task-publication-details');slot.append(heading,details);details.append(node('p',info.akkaunt?'Аккаунт: '+info.akkaunt.nazvanie:'Аккаунт не выбран.'));
  details.append(node('p','Дата выхода задачи: '+day(info.data_vyhoda),'kz-kom-net'));if(info.nuzhno_podtverdit_datu)details.append(node('p','В источнике дата выхода: '+day(info.data_istochnika),'kz-kom-net'));
  if(info.istochnik){const p=node('p','Источник: '),href=safeLink(info.istochnik.ssylka),title=info.istochnik.nazvanie||'Публикация';if(href){const a=node('a',title,'kz-ssyl');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.dataset.publicationSourceLink='1';p.append(a);}else p.append(node('span',title));details.append(p);}else details.append(node('p',info.svjazan?'Связанная публикация сейчас недоступна.':'Источник ещё не связан.'));
  const value=info.ohvat==null?'Охват: —. Подтверждённого замера пока нет.':(info.ohvat_podtverzhden?'Подтверждённый охват: ':'Ранее сохранённый охват: ')+new Intl.NumberFormat('ru-RU').format(info.ohvat);const reach=node('p',value);reach.dataset.publicationReach='1';details.append(reach);
  if(info.ohvat_data)details.append(node('p','замер от '+day(info.ohvat_data),'kz-kom-net'));
  if(info.pochemu)details.append(node('p',info.pochemu,'kz-kom-net'));
  if(info.ohvat_oshibka)details.append(node('p','замер не удался, '+day(info.ohvat_oshibka.data)+'. Прежнее значение сохранено.','kz-kom-net'));
  else if(info.poslednij_sbor?.uspeh===0)details.append(node('p','Последнее обновление не удалось. Прежний замер сохранён.','kz-kom-net'));
  if(info.akkaunt?.uroven==='public')details.append(node('p','Публичные просмотры не заменяют охват из личной статистики.','kz-kom-net'));
  const actions=node('div',undefined,'pending-command-actions');details.append(actions);actions.append(button('обновить сведения','publicationRefresh',refresh));if(!info.udaleno)actions.append(button(settingsDraft(task)?'продолжить настройку публикации':'изменить настройки публикации','publicationSettings',()=>settings(task).catch(error=>O.tost(error.message))));
  if(!info.udaleno){const choose=button(info.nuzhno_podtverdit_datu?'подтвердить дату публикации':info.svjazan?'выбрать другую публикацию':'связать публикацию','publicationChoose',()=>picker(task,info).catch(error=>O.tost(error.message)));choose.disabled=!!read()||busy||!info.akkaunt;actions.append(choose);
   if(info.svjazan){const detach=button('отсоединить источник','publicationDetach',()=>detachDialog(task,info));detach.disabled=!!read()||busy;actions.append(detach);}
   const previous=last(task);if(previous){const undo=button(previous.settings?'отменить правку настроек':'отменить смену источника','publicationUndo',()=>startUndo(task,previous.action,!!previous.settings).catch(error=>O.tost(error.message)));undo.disabled=!!read()||busy;actions.append(undo);}
  }
  if(read())actions.append(button('проверить сохранение','publicationRecoveryOpen',recovery));
 }
 const change=event=>{if(event.detail?.id===task.id){refresh();slot.closest('#kz')?.querySelector('#kz-history')?.locusHistory?.refresh();}};document.addEventListener('locus:publication-source-changed',change);listeners.add(draw);refresh();
 return {refresh,dispose(){disposed=true;sequence++;listeners.delete(draw);document.removeEventListener('locus:publication-source-changed',change);}};
}
async function change(task,info,post,confirm=false){const key=crypto.randomUUID();return begin({format:1,actor:actor(),id:task.id,nomer:task.nomer,key,kind:'change',phase:'pending',body:{zadacha_id:task.id,versija:info.versija,kontekst_istochnika:info.kontekst_istochnika,publikacija_id:post?.id??null,...(post?{kontekst_publikacii:post.kontekst_publikacii}:{}),...(confirm?{podtverdit_datu:true}:{}),zapros_kljuch:key}});}
function detachDialog(task,info){
 const close=O.modalka('Отсоединить публикацию','<div data-publication-detach-dialog><p>Источник и его охват исчезнут из текущей карточки. История замеров сохранится. Прежний источник можно вернуть отменой.</p><p role="status" data-publication-detach-status></p><button type="button" class="kn" data-publication-detach-confirm>отсоединить</button></div>',null,{poverh:true}),root=document.querySelector('[data-publication-detach-dialog]'),b=root.querySelector('button');
 b.onclick=async()=>{if(read())return recovery();b.disabled=true;try{await change(task,info,null);close();}catch(error){root.querySelector('[role=status]').textContent=error.message;b.textContent='проверить сохранение';b.onclick=recovery;}finally{b.disabled=false;}};
}
async function picker(task){
 const info=await request('GET','/zadachi/'+task.nomer+'/publikacija_istochnik');if(info.zadacha_id!==task.id||info.udaleno||read())throw new Error('Проверь текущее состояние задачи перед выбором публикации.');
 const close=O.modalka('Связать вышедшую публикацию','<div class="task-publication-picker" data-publication-picker><p data-publication-picker-account></p><form data-publication-search><label>Найти публикацию<input type="search" maxlength="200" data-publication-query></label><button type="submit" class="kn">найти</button></form><p role="status" aria-live="polite" data-publication-picker-status></p><div data-publication-options></div><button type="button" class="kn" data-publication-more hidden>ещё публикации</button><div data-publication-preview hidden></div><button type="button" class="kn tmn" data-publication-save disabled>связать</button></div>',null,{poverh:true});
 const root=document.querySelector('[data-publication-picker]'),status=root.querySelector('[role=status]'),list=root.querySelector('[data-publication-options]'),more=root.querySelector('[data-publication-more]'),preview=root.querySelector('[data-publication-preview]'),save=root.querySelector('[data-publication-save]'),form=root.querySelector('form'),input=root.querySelector('input');let selected=null,cursor=null,generation=0,search='',confirmation=null,saving=false;
 root.querySelector('[data-publication-picker-account]').textContent='Аккаунт: '+(info.akkaunt?.nazvanie||'не выбран');
 const pick=post=>{if(saving||read())return;selected=post;preview.hidden=false;preview.replaceChildren(node('p','Выбрано: '+post.nazvanie),node('p','Фактическая дата выхода: '+day(post.data)));if(info.ohvat_data&&post.data>info.ohvat_data)preview.append(node('p','Прежний замер датирован раньше выхода. Актуальный охват появится после нового замера.','kz-kom-net'));confirmation=null;if(post.data!==info.data_vyhoda){const label=node('label'),box=node('input');box.type='checkbox';box.dataset.publicationConfirmDate='1';label.append(box,document.createTextNode(' Подтверждаю изменение даты задачи с '+day(info.data_vyhoda)+' на '+day(post.data)));preview.append(label);confirmation=box;box.onchange=()=>{save.disabled=!box.checked;};}save.disabled=!!confirmation;};
 async function load(append=false){const token=++generation;status.textContent='Загружаю публикации…';more.disabled=true;const q=new URLSearchParams({poisk:search,skolko:30});if(append&&cursor)q.set('prodolzhit',cursor);try{const result=await request('GET','/zadachi/'+task.nomer+'/publikacija_vybor?'+q);if(!root.isConnected||token!==generation)return;if(result.zadacha_id!==task.id||!Array.isArray(result.spisok))throw new Error('Список публикаций не подтверждён.');if(!append)list.replaceChildren();for(const post of result.spisok){const item=button(post.nazvanie+' · '+day(post.data),'publicationOption',()=>pick(post));item.dataset.publicationId=post.id;list.append(item);}cursor=result.prodolzhit;more.hidden=!cursor;status.textContent=result.vsego?'Найдено публикаций: '+result.vsego:'Публикаций пока нет. После сбора статистики обнови список.';}catch(error){if(root.isConnected&&token===generation)status.textContent=error.message;}finally{if(root.isConnected&&token===generation)more.disabled=false;}}
 form.onsubmit=event=>{event.preventDefault();if(saving)return;search=input.value.trim();cursor=null;load();};more.onclick=()=>load(true);
 save.onclick=async()=>{if(!selected||saving)return;if(read())return recovery();if(confirmation&&!confirmation.checked)return;saving=true;for(const b of root.querySelectorAll('button,input'))b.disabled=true;try{await change(task,info,selected,!!confirmation?.checked);close();}catch(error){status.textContent=error.message;save.textContent='проверить сохранение';save.disabled=false;save.onclick=recovery;}};
 if(info.nuzhno_podtverdit_datu&&info.istochnik)pick(info.istochnik);
 await load();
}
window.LocusTaskPublication={mount,notices,recovery,settings,settingsNotices};notices();
})();
