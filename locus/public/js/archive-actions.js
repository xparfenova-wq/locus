(function(){
 'use strict';let application;
 function create({API,O,onSaved}){
  if(application)return application;
  const actor=Number(API.ja),model=LocusArchiveState,esc=O.ekranirovat,busy=new Set();let tab,unavailable=false,currentModal;
  try{tab=sessionStorage.getItem('locus-archive-tab-v1');if(!/^[a-f0-9-]{36}$/i.test(tab||'')){tab=crypto.randomUUID();sessionStorage.setItem('locus-archive-tab-v1',tab);if(sessionStorage.getItem('locus-archive-tab-v1')!==tab)throw Error();}}catch{tab=crypto.randomUUID();unavailable=true;}
  const state=model.create({get length(){return localStorage.length;},key:i=>localStorage.key(i),getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)},actor,tab);
  const scope=s=>({tablica:s.tablica,id:s.id}),query=s=>new URLSearchParams(scope(s)).toString(),text=e=>e?.message||'Не удалось проверить действие архива';
  function identity(){if(Number(API.ja)!==actor)throw Error('Участник сменился. Обнови страницу');}
  function closeCurrent(){currentModal?.close();currentModal=null;}
  function modal(title,html){closeCurrent();const close=O.modalka(title,html),root=document.querySelector('.vyb-fon:last-of-type');currentModal={root,close};return {root,close};}
  async function request(method,route,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,route,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
  function mount(){
   let rows;try{rows=state.pending();}catch(e){const note=document.createElement('aside');note.className='locus-session-note';note.textContent=text(e);O.pendingCommandNote(note,'archive-pending-note');document.querySelectorAll('[data-person-archive],[data-role-archive]').forEach(b=>b.disabled=true);return;}
   const personPending=new Set(rows.map(r=>r.person));for(const b of document.querySelectorAll('[data-person-archive],[data-role-archive]')){b.disabled=busy.has(Number(b.dataset.archivePerson))||personPending.has(Number(b.dataset.archivePerson));b.setAttribute('aria-disabled',String(b.disabled));}
   if(!rows.length){O.pendingCommandNote(null,'archive-pending-note');return;}
   const item=rows[0],note=document.createElement('aside'),label=document.createElement('span'),button=document.createElement('button');note.className='locus-session-note';note.setAttribute('role','status');label.textContent='Есть неподтверждённое действие с архивом';button.type='button';button.className='kn';button.textContent='проверить';button.dataset.archivePending=item.key;button.onclick=()=>recover(item);button.disabled=busy.has(item.person);note.append(label,button);O.pendingCommandNote(note,'archive-pending-note');
  }
  function finish(item,result){if(!model.confirmed(item,result))throw Error('Ответ не подтвердил именно эту карточку');let cleanupFailed=false;try{state.finish(item,result);}catch{cleanupFailed=true;}mount();return {item,result,cleanupFailed};}
  async function changed(outcome){
   try{await onSaved?.(outcome.result);}catch{O.tost('Действие сохранено. Обнови карточку, чтобы увидеть его');return;}
   const r=outcome.result,message=outcome.cleanupFailed?'Действие сохранено. Проверка в браузере ещё не завершена':!r.zapis_suschestvuet?'Действие было сохранено. Исходную карточку затем удалили':r.perenesen?'Действие было сохранено. Сотрудничество затем перенесли':r.vernuto?'Это действие уже отменено':r.izmeneno_posle&&r.arhiv!==r.arhiv_tekuschij?'Действие сохранено. После него архив уже изменили':outcome.item.kind==='otmenit'?'Прежнее состояние архива возвращено':r.arhiv?'Запись перенесена в архив':'Запись возвращена из архива';
   O.tost(message);
  }
  function guard(person){try{identity();if(busy.has(person))throw Error('Предыдущее действие ещё идёт');const old=state.pending().find(r=>r.person===person);if(old){recover(old);return false;}return true;}catch(e){O.tost(text(e));return false;}}
  async function send(kind,s,person,body){
   identity();if(unavailable)throw Error('Не удалось подготовить проверку в этой вкладке. Обнови страницу и попробуй снова');if(busy.has(person))throw Error('Предыдущее действие ещё идёт');
   const key=crypto.randomUUID(),item=state.reserve({key,actor,...scope(s),person,kind,body:{...scope(s),...body,zapros_kljuch:key}});busy.add(person);mount();
   try{return finish(item,await request('POST',kind==='arhiv'?'/arhiv':'/arhiv/otmenit',item.body));}
   catch(e){if(e.kod>=400&&e.kod<500&&![401,403,404].includes(e.kod)){state.reject(key);mount();throw e;}throw Object.assign(Error('Ответ не подтверждён. Проверим результат перед повтором'),{pending:true,item,cause:e});}
   finally{busy.delete(person);mount();}
  }
  function recover(item){
   const {root,close}=modal('Проверить действие архива','<div class="archive-action-form"><p>Проверяем результат предыдущей попытки</p><p class="archive-action-status" role="status" aria-live="polite" data-archive-status></p><div class="archive-action-buttons"><button type="button" class="kn" data-archive-check>проверить</button><button type="button" class="kn" data-archive-retry hidden>повторить эту попытку</button><button type="button" class="kn" data-archive-cancel>отменить попытку</button><button type="button" class="kn" data-archive-reopen hidden>новое подтверждение</button></div></div>'),status=root.querySelector('[data-archive-status]');let checking=false;
   async function run(action){if(checking)return;checking=true;busy.add(item.person);mount();root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{identity();const result=action==='retry'?await request('POST',item.kind==='arhiv'?'/arhiv':'/arhiv/otmenit',item.body):action==='cancel'?await request('POST','/arhiv/otmena_popytki',{...scope(item),zapros_kljuch:item.key,dejstvie:item.kind}):await request('GET','/arhiv/proverka?'+query(item)+'&zapros_kljuch='+item.key);
     if(!model.identity(item,result))throw Error('Ответ относится к другой карточке');
     if(result.sostojanie==='sohraneno'){const outcome=finish(item,result);close();await changed(outcome);return;}
     if(result.sostojanie==='otmeneno'){state.reject(item.key);mount();close();O.tost('Попытка отменена');return;}
     if(result.sostojanie!=='ne_najdeno')throw Error('Не удалось подтвердить исход');status.textContent='Сохранение пока не найдено. Можно повторить ту же попытку или отменить её';root.querySelector('[data-archive-retry]').hidden=false;
    }catch(e){status.textContent=text(e);status.dataset.error='1';if(action==='retry'&&e.kod>=400&&e.kod<500&&![401,403,404].includes(e.kod)){state.reject(item.key);mount();status.textContent+=' — подготовь новое подтверждение';root.querySelector('[data-archive-retry]').hidden=true;root.querySelector('[data-archive-reopen]').hidden=false;}}
    finally{checking=false;busy.delete(item.person);mount();root.querySelectorAll('button').forEach(b=>b.disabled=false);}
   }
   root.querySelector('[data-archive-check]').onclick=()=>run('check');root.querySelector('[data-archive-retry]').onclick=()=>run('retry');root.querySelector('[data-archive-cancel]').onclick=()=>run('cancel');root.querySelector('[data-archive-reopen]').onclick=()=>open(item,item.person);run('check');
  }
  function undo(item){
   if(!guard(item.person))return;const {root,close}=modal('Вернуть прежнее состояние архива','<div class="archive-action-form"><p>Вернём состояние и даты до твоего последнего действия. Остальные изменения карточки сохранятся</p><p class="archive-action-status" role="status" data-archive-status></p><div class="archive-action-buttons"><button type="button" class="kn" data-archive-undo-confirm>вернуть прежнее состояние</button></div></div>');root.querySelector('[data-archive-undo-confirm]').onclick=async event=>{if(!guard(item.person))return;event.target.disabled=true;try{const outcome=await send('otmenit',item,item.person,{ishodnyj_kljuch:item.key});close();await changed(outcome);}catch(e){if(e.pending)recover(e.item);else{root.querySelector('[data-archive-status]').textContent=text(e);root.querySelector('[data-archive-status]').dataset.error='1';event.target.disabled=false;}}};
  }
  async function open(s,expectedPerson){
   if(document.querySelector('[data-pravim="1"]')){O.tost('Сначала заверши текущую правку карточки');return;}if(expectedPerson&&!guard(expectedPerson))return;
   let p;try{identity();p=await request('GET','/arhiv/predprosmotr?'+query(s));if(!guard(p.chelovek_id))return;if(expectedPerson&&p.chelovek_id!==expectedPerson)throw Error('Сотрудничество теперь относится к другому человеку. Обнови карточку');}catch(e){O.tost(text(e));return;}
   const initial={person:p.chelovek_id,napravlenie:p.napravlenie,rol:p.rol},desired=!p.arhiv,person=p.chelovek_id;
   const title=(desired?'Убрать в архив':'Вернуть из архива')+(s.tablica==='sotrudnichestva'?' сотрудничество':' человека');
   const {root,close}=modal(title,'<div class="archive-action-form"><div data-archive-summary></div><p class="archive-action-status" role="status" aria-live="polite" data-archive-status></p><div class="archive-action-buttons"><button type="button" class="kn" data-archive-refresh>обновить сведения</button><button type="button" class="kn" data-archive-confirm></button></div></div>'),status=root.querySelector('[data-archive-status]'),summary=root.querySelector('[data-archive-summary]'),confirm=root.querySelector('[data-archive-confirm]');let loading=false,moved=false,unreadable=false;
   function render(){
    if(unreadable){summary.replaceChildren();confirm.disabled=true;return;}
    const caption=s.tablica==='ljudi'?(desired?'Человек исчезнет из рабочих списков всех направлений. Контакты, задачи, документы и история сохранятся':'Человек вернётся в рабочие списки. Отдельно архивированные сотрудничества сохранят своё состояние'):(desired?'Это сотрудничество исчезнет из рабочих списков выбранного направления. Другие направления человека сохранятся':'Это сотрудничество вернётся в рабочие списки направления');
    summary.innerHTML='<p><b>'+esc(p.imja)+'</b>'+(s.tablica==='sotrudnichestva'?' · '+esc(p.napravlenie_imja||p.napravlenie):'')+'</p><p>'+caption+'</p><p class="archive-action-status">Открытых задач: '+p.otkrytyh_zadach+' · активных проектов: '+p.aktivnyh_proektov+'</p>'+(s.tablica==='sotrudnichestva'&&p.chelovek_v_arhive?'<p>Сам человек остаётся в архиве. Для его появления в активных списках нужно также вернуть карточку человека</p>':'');
    confirm.textContent=desired?'подтвердить архив':'вернуть из архива';confirm.disabled=loading||busy.has(person)||p.arhiv===desired||moved;
   }
   async function refresh(note=''){
    if(loading||busy.has(person))return;loading=true;confirm.disabled=true;status.textContent='Читаем актуальные сведения';
    try{const next=await request('GET','/arhiv/predprosmotr?'+query(s));identity();if(!root.isConnected)return;p=next;unreadable=false;moved=p.chelovek_id!==initial.person||p.napravlenie!==initial.napravlenie||p.rol!==initial.rol;status.textContent=moved?'Контекст сотрудничества изменился. Обнови карточку и открой подтверждение заново':p.arhiv===desired?'Карточка уже в выбранном состоянии. Новое действие не требуется':note||'Сведения обновлены. Проверь их перед подтверждением';delete status.dataset.error;}
    catch(e){status.textContent=text(e);status.dataset.error='1';unreadable=true;}
    finally{loading=false;if(root.isConnected)render();}
   }
   root.querySelector('[data-archive-refresh]').onclick=()=>refresh();confirm.onclick=async()=>{if(loading||moved||p.arhiv===desired||!guard(person))return;confirm.disabled=true;try{const outcome=await send('arhiv',s,person,{arhiv:desired,versija:p.versija,kontekst:p.kontekst});close();await changed(outcome);}catch(e){if(e.pending)recover(e.item);else if(e.kod===409)await refresh('Сведения изменились. Проверь актуальное подтверждение перед новым действием');else{status.textContent=text(e);status.dataset.error='1';if([401,403,404].includes(e.kod)){summary.replaceChildren();moved=true;}else render();}}};
   try{const last=state.last(s);if(last&&last.person===person){const button=document.createElement('button');button.type='button';button.className='kn';button.textContent='отменить моё последнее действие';button.dataset.archiveUndo='1';button.onclick=()=>undo(last);root.querySelector('.archive-action-buttons').append(button);}}catch(e){status.textContent=text(e);}
   render();
  }
  document.addEventListener('locus:session-changed',closeCurrent);window.addEventListener('storage',mount);application={open,recover,mount,state};return application;
 }
 window.LocusArchiveActions={create};
})();
