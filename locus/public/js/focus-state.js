(() => {
 'use strict';
 const prefix=()=>`locus-focus-intent:${API.ja}:`,uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),positive=v=>Number.isSafeInteger(v)&&v>0;
 let busy=false,anchor=null;const subscribers=new Set(),callbacks=new Map();
 const storageKey=r=>`locus-focus-intent:${r.actor}:`+r.key;
 function persist(name,value){const raw=JSON.stringify(value);try{sessionStorage.setItem(name,raw);if(sessionStorage.getItem(name)!==raw)throw new Error();}catch{throw new Error('Браузер не сохранил проверку. Действие не отправлено; оставь вкладку открытой');}}
 function records(){const rows=[];for(let i=0;i<sessionStorage.length;i++){const name=sessionStorage.key(i);if(!name?.startsWith(prefix()))continue;const key=name.slice(prefix().length);if(!uuid(key))throw new Error('Не читается проверка таймера. Оставь вкладку открытой');let r;try{r=JSON.parse(sessionStorage.getItem(name));}catch{}if(!r||r.actor!==API.ja||r.key!==key)r={actor:API.ja,key,body:null};rows.push(r);}return rows;}
 async function request(method,path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,path,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
 function button(text,action,marker){const n=document.createElement('button');n.type='button';n.className='kn';n.textContent=text;if(marker)n.dataset[marker]='1';n.onclick=action;return n;}
 function valid(r){const b=r?.body;if(!b||!['start','pause','resume','stop','reset'].includes(r.operation))return false;if(r.operation==='start')return Object.hasOwn(window.LocusFocusTime.lengths,b.rezhim);return positive(b.id)&&positive(b.versija)&&(b.identifikator===null||uuid(b.identifikator))&&typeof b.otkryta_s==='string';}
 function proof(r,value){
  if(!value||!['sohraneno','ne_najdeno','otmeneno'].includes(value.sostojanie))throw new Error('Результат таймера не подтверждён');
  if(r.actor!==API.ja)throw new Error('Сессия входа изменилась. Вернись под своим пользователем');
  if(value.sostojanie==='sohraneno'){
   if(!r.operation&&['start','pause','resume','stop','reset'].includes(value.operacija))r.operation=value.operacija;
   const s=value.sessija;if(value.operacija!==r.operation||typeof value.udaleno!=='boolean'||!s||s.chelovek_id!==API.ja||!positive(s.id)||!positive(s.versija)||!uuid(s.identifikator)||typeof s.nachalo!=='string'||typeof s.zachtena!=='boolean'||r.body&&r.operation!=='start'&&s.id!==r.body.id)throw new Error('Подтверждение таймера неполное');
   if(['stop','reset'].includes(r.operation)?typeof s.konec!=='string':s.konec!==null)throw new Error('Не подтверждено состояние сессии');
   if(r.operation==='pause'&&(s.pauza!==true||typeof s.pauza_s!=='string')||r.operation==='resume'&&(s.pauza!==false||s.pauza_s!==null)||r.operation==='reset'&&s.zachtena!==false)throw new Error('Не подтверждено действие с таймером');
  }return value;
 }
 function acceptRoot(value){
  if(!value||typeof value.idet!=='boolean'||!Array.isArray(value.rezhimy)||typeof value.teper!=='string')throw new Error('Не получено состояние таймера');
  if(value.sessija){const s=value.sessija;if(s.chelovek_id!==API.ja||!positive(s.id)||!positive(s.versija)||s.aktivno_ms!==null&&(!Number.isFinite(s.aktivno_ms)||s.aktivno_ms<0))throw new Error('Не подтверждено время таймера');anchor={id:s.id,version:s.versija,ms:s.aktivno_ms,at:performance.now(),running:value.idet&&!s.pauza&&!s.konec};}else anchor=null;
  return value;
 }
 function elapsed(value){const s=value?.sessija;if(!value?.idet||!s)return 0;if(!anchor||anchor.id!==s.id||anchor.version!==s.versija)acceptRoot(value);if(anchor.ms===null)return null;return anchor.ms+(anchor.running?Math.max(0,performance.now()-anchor.at):0);}
 function update(){for(const fn of subscribers)try{fn();}catch{}notices();}
 async function refresh(r,options={}){if(options.after)await options.after();else document.dispatchEvent(new CustomEvent('locus:focus-changed'));}
 async function finish(r,value,options=callbacks.get(r.key)||{}){
  try{sessionStorage.removeItem(storageKey(r));}catch{O.tost('Результат известен, но браузер не убрал проверку таймера');}callbacks.delete(r.key);update();
  try{await refresh(r,options);}catch{O.tost('Действие подтверждено. Обнови таймер для текущих данных');return;}
  if(value.sostojanie==='otmeneno'){O.tost('Попытка отменена. Таймер можно открыть заново');return;}
  const s=value.sessija,changed=value.tekuschaja&&value.tekuschaja.versija!==s.versija,message=value.udaleno?'Действие было сохранено, исходная сессия удалена':changed?'Действие подтверждено. Состояние таймера уже менялось':r.operation==='start'?'Пошло время':r.operation==='pause'?'Таймер на паузе':r.operation==='resume'?'Таймер продолжен':r.operation==='reset'?'Сброшено без зачёта сессии':s.zachtena?(s.rezhim==='fokus'?'Засчитано '+s.minut+' мин':'Перерыв завершён'):'Сессия прервана, в зачёт не идёт';O.tost(message);
 }
 async function execute(operation,value,options={}){
  if(busy)return {busy:true};const pending=records()[0];if(pending){recover(pending,options);return {pending:true};}
  const body=operation==='start'?{rezhim:value.rezhim,...(value.zadacha_id?{zadacha_id:value.zadacha_id}:{})}:{id:value.id,versija:value.versija,identifikator:value.identifikator,otkryta_s:value.nachalo},r={actor:API.ja,key:crypto.randomUUID(),operation,body};if(!valid(r))throw new Error('Обнови таймер перед действием');
  persist(storageKey(r),r);busy=true;callbacks.set(r.key,options);update();
  try{const result=proof(r,await request('POST','/fokus/'+operation,{...body,zapros_kljuch:r.key}));if(result.sostojanie!=='sohraneno')throw new Error('Действие не подтверждено');await finish(r,result,options);return {saved:true,result};}catch(error){O.tost(error.kod&&error.kod<500?error.message+'. Проверь действие и текущее состояние таймера':'Результат таймера ещё не подтверждён. Проверь действие перед повтором');return {unknown:true,error};}finally{busy=false;update();}
 }
 function recover(r,options=callbacks.get(r.key)||{}){
  if(busy||r.actor!==API.ja)return;let missing=false;
  const close=O.modalka('Проверить действие таймера','<p>Проверка прочитает результат. Она не запускает и не останавливает таймер повторно.</p><p role="status" data-focus-proof-status></p><div class="tpl-actions" data-focus-proof-actions></div>',null,{poverh:true}),root=document.querySelector('.vyb-fon:last-of-type'),status=root.querySelector('[data-focus-proof-status]'),actions=root.querySelector('[data-focus-proof-actions]');root.classList.add('focus-recovery-modal');
  function controls(){actions.replaceChildren(button('проверить',inspect,'focusCheck'),button('отменить попытку',cancel,'focusCancel'));if(missing&&valid(r))actions.append(button('повторить тот же запрос',retry,'focusRetry'));actions.querySelectorAll('button').forEach(n=>n.disabled=busy);}
  async function run(fn){if(busy)return;busy=true;update();controls();try{await fn();}catch(error){status.textContent='Проверка не завершена. '+error.message;}finally{busy=false;update();controls();}}
  async function accept(value){if(value.sostojanie==='ne_najdeno'){missing=true;status.textContent='Действие не найдено. Можно отменить попытку или отдельно повторить тот же запрос.';return;}await finish(r,value,options);close();}
  async function inspect(){missing=false;await run(async()=>accept(proof(r,await request('GET','/fokus/proverka?zapros_kljuch='+r.key))));}
  async function cancel(){missing=false;await run(async()=>{const value=proof(r,await request('POST','/fokus/otmena_popytki',{zapros_kljuch:r.key}));if(value.sostojanie==='ne_najdeno')throw new Error('Отмена не подтверждена');await accept(value);});}
  async function retry(){if(!missing||!valid(r))return;missing=false;await run(async()=>accept(proof(r,await request('POST','/fokus/'+r.operation,{...r.body,zapros_kljuch:r.key}))));}
  controls();inspect();return close;
 }
 function notices(){let pending;try{pending=records()[0];}catch(error){const note=document.createElement('aside');note.className='locus-session-note';note.textContent=error.message;O.pendingCommandNote(note,'locus-focus-note');return;}document.getElementById('locus-focus-note')?.remove();if(!pending)return;const note=document.createElement('aside');note.className='locus-session-note';note.id='locus-focus-note';note.setAttribute('role','status');note.append(document.createTextNode('Действие таймера ещё не проверено. '),button('проверить результат',()=>recover(pending),'focusPending'));note.querySelector('button').disabled=busy;O.pendingCommandNote(note,note.id);}
 window.LocusFocusState={acceptRoot,elapsed,execute,recover,records,notices,busy:()=>busy,pending:()=>records().length>0,subscribe:fn=>{subscribers.add(fn);fn();}};notices();document.addEventListener('locus:session-restored',update);
})();
