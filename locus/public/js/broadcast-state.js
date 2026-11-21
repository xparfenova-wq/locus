(()=>{
 'use strict';
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v),positive=v=>Number.isSafeInteger(v)&&v>0;
 const prefix=()=>`locus-broadcast-intent:${API.ja}:`,storageKey=r=>`locus-broadcast-intent:${r.actor}:${r.id}:${r.key}`;
 let busy=false,switched=false;const callbacks=new Map(),subscribers=new Set();
 function persist(name,value){const raw=JSON.stringify(value);try{sessionStorage.setItem(name,raw);if(sessionStorage.getItem(name)!==raw)throw new Error();}catch{throw new Error('Браузер не сохранил действие. Запрос не отправлен; оставь форму открытой');}}
 function records(){const out=[];try{for(let i=0;i<sessionStorage.length;i++){const name=sessionStorage.key(i);if(!name?.startsWith(prefix()))continue;const [scope,key,...extra]=name.slice(prefix().length).split(':');const id=Number(scope);if(extra.length||!positive(id)||!uuid(key))throw new Error();let r;try{r=JSON.parse(sessionStorage.getItem(name));}catch{}if(!r||r.actor!==API.ja||r.key!==key||r.id!==id)r={actor:API.ja,key,id,body:null};out.push(r);}}catch{throw new Error('Не удалось прочитать проверку рассылки. Новое действие заблокировано');}return out;}
 function valid(r){
 const b=r.body;if(switched||r.actor!==API.ja||!positive(r.id)||!b||typeof b!=='object'||Array.isArray(b))return false;
 if(r.operation==='volna')return typeof b.vybor_versija==='string'&&(r.append===true?positive(b.zadacha_id)&&b.komu==='vsja_baza':['vsja_baza','ne_otvetili','otvetili','svoja'].includes(b.komu));
 return r.operation==='otmetka'&&Array.isArray(b.chelovek_ids)&&b.chelovek_ids.length>0&&b.chelovek_ids.every(positive)&&['ne_otpravleno','otpravleno','otvetil','otkaz'].includes(b.status)&&b.versii&&typeof b.versii==='object'&&!Array.isArray(b.versii);
 }
 function result(r,value){
  if(switched||r.actor!==API.ja)throw new Error('Аккаунт сменился. Вернись под своим пользователем перед проверкой');
  if(!value||typeof value!=='object')throw new Error('Ответ рассылки неполный');const expected=valid(r)?r.body:null;
  if(r.operation==='volna'){if(r.append===true&&(value.dopolnenie!==true||!positive(value.dobavleno)||expected&&value.zadacha_id!==expected.zadacha_id))throw new Error('Дополнение исходной отправки не подтверждено');if(!positive(value.zadacha_id)||!positive(value.nomer)||!positive(value.plan)||!positive(value.nomer_volny)||typeof value.nazvanie!=='string'||!['vsja_baza','ne_otvetili','otvetili','svoja'].includes(value.komu)||expected&&value.komu!==expected.komu)throw new Error('Создание волны не подтверждено');}
  else if(r.operation==='otmetka'){if(!Number.isSafeInteger(value.obnovleno)||value.obnovleno<1||!['ne_otpravleno','otpravleno','otvetil','otkaz'].includes(value.status)||typeof value.kogda!=='string'||value.zadacha_id!==null&&!positive(value.zadacha_id)||expected&&(value.status!==expected.status||value.zadacha_id!==(expected.zadacha_id||null)||value.obnovleno!==expected.chelovek_ids.length))throw new Error('Отметки не подтверждены');}
  else throw new Error('Не подтверждён вид действия');return value;
 }
 function proof(r,value){if(switched||r.actor!==API.ja)throw new Error('Аккаунт сменился. Вернись под своим пользователем');if(!value||!['ne_najdeno','otmeneno','udaleno','vypolneno'].includes(value.sostojanie))throw new Error('Результат действия не получен');if(value.sostojanie==='vypolneno'){if(!valid(r)&&['volna','otmetka'].includes(value.dejstvie))r.operation=value.dejstvie;if(value.rezultat?.dopolnenie===true)r.append=true;if(value.dejstvie!==r.operation||value.istoricheskoe_podtverzhdenie!==true)throw new Error('Вид подтверждения не совпадает');result(r,value.rezultat);}return value;}
 async function request(method,path,body){if(switched)throw new Error('Аккаунт сменился. Переоткрой страницу');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,path,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
 function route(r){return '/rassylki/'+r.id+'/'+(r.operation==='volna'?(r.append===true?'dopolnit_volnu':'volna'):'kontakty');}
 function method(r){return r.operation==='volna'?'POST':'PATCH';}
 function update(){for(const fn of subscribers)try{fn();}catch{}notices();}
 function button(text,fn,marker){const node=document.createElement('button');node.type='button';node.className='kn';node.textContent=text;node.dataset[marker]='1';node.onclick=fn;return node;}
 async function finish(r,value,options=callbacks.get(r.key)||{}){
  try{sessionStorage.removeItem(storageKey(r));if(sessionStorage.getItem(storageKey(r))!==null)throw new Error();}catch{throw new Error('Результат известен, но браузер не убрал проверку. Повтори проверку');}
  if(value.sostojanie==='vypolneno'&&r.operation==='volna'&&!r.append&&typeof r.draftRaw==='string'){const name=`locus-broadcast-draft:${r.actor}:${r.id}`;try{if(sessionStorage.getItem(name)===r.draftRaw)sessionStorage.removeItem(name);}catch{O.tost('Волна сохранена, черновик остался в браузере');}}
  callbacks.delete(r.key);update();document.dispatchEvent(new CustomEvent('locus:broadcast-changed',{detail:{id:r.id,operation:r.operation,result:value.sostojanie==='vypolneno'?value.rezultat:null}}));
  if(value.sostojanie==='vypolneno'){if(options.onSaved)try{await options.onSaved(value.rezultat);}catch{O.tost('Сохранение подтверждено. Обнови страницу для текущих данных');return;}O.tost(r.append?'Исходная отправка дополнена':r.operation==='volna'?'Волна сохранена':'Отметки сохранены');}
  else{if(options.onCancelled)await options.onCancelled();O.tost(value.sostojanie==='udaleno'?'Действие было сохранено, исходная волна уже удалена':'Попытка отменена. Проверь текущие данные перед новым действием');}
 }
 async function execute(value,options={}){
  if(switched)throw new Error('Аккаунт сменился. Переоткрой страницу');if(busy)return {busy:true};const pending=records()[0];if(pending){recover(pending);return {pending:true};}
  const r={v:1,actor:value.actor,key:crypto.randomUUID(),id:value.id,operation:value.operation,body:value.body,...(value.append===true?{append:true}:{})};if(r.operation==='volna'&&!r.append)r.draftRaw=sessionStorage.getItem(`locus-broadcast-draft:${r.actor}:${r.id}`);if(!valid(r))throw new Error('Обнови рассылку перед действием');
  persist(storageKey(r),r);busy=true;callbacks.set(r.key,options);update();
  try{const saved=result(r,await request(method(r),route(r),{...r.body,zapros_kljuch:r.key}));await finish(r,{sostojanie:'vypolneno',dejstvie:r.operation,rezultat:saved,istoricheskoe_podtverzhdenie:true},options);return {saved:true,result:saved};}
  catch(error){O.tost('Результат ещё не подтверждён. Проверь действие перед повтором. '+(error.kod&&error.kod<500?error.message:''));return {unknown:true,error};}
  finally{busy=false;update();}
 }
 function recover(r){
  if(busy||switched||r.actor!==API.ja)return;let missing=false;
  const close=O.modalka('Проверить действие рассылки','<p>Проверка прочитает результат сохранения. Подтверждённое действие не выполняется повторно.</p><p role="status" data-broadcast-proof-status></p><div class="pending-command-actions" data-broadcast-proof-actions></div>',null,{poverh:true}),root=document.querySelector('.vyb-fon:last-of-type'),status=root.querySelector('[data-broadcast-proof-status]'),actions=root.querySelector('[data-broadcast-proof-actions]');root.classList.add('broadcast-recovery-modal');
  function controls(){actions.replaceChildren(button('проверить',inspect,'broadcastCheck'));if(positive(r.id))actions.append(button('отменить попытку',cancel,'broadcastCancel'));if(missing&&valid(r))actions.append(button('повторить тот же запрос',retry,'broadcastRetry'));actions.querySelectorAll('button').forEach(n=>n.disabled=busy);}
  async function run(fn){if(busy)return;busy=true;update();controls();try{await fn();}catch(error){status.textContent='Проверка не завершена. '+error.message;}finally{busy=false;update();controls();}}
  async function accept(value){if(value.sostojanie==='ne_najdeno'){missing=true;status.textContent='Действие не найдено. Можно отменить попытку или отдельно повторить прежний запрос.';return;}await finish(r,value);close();}
  async function inspect(){missing=false;await run(async()=>{if(!positive(r.id))throw new Error('Не подтверждена исходная рассылка. Сохранённая проверка оставлена в браузере');await accept(proof(r,await request('GET','/rassylki/'+r.id+'/proverka_dejstvija?zapros_kljuch='+r.key)));});}
  async function cancel(){missing=false;await run(async()=>{const value=proof(r,await request('POST','/rassylki/'+r.id+'/otmena_dejstvija',{zapros_kljuch:r.key}));if(value.sostojanie==='ne_najdeno')throw new Error('Отмена не подтверждена');await accept(value);});}
  async function retry(){if(!missing||!valid(r))return;missing=false;await run(async()=>{const value=result(r,await request(method(r),route(r),{...r.body,zapros_kljuch:r.key}));await accept({sostojanie:'vypolneno',dejstvie:r.operation,rezultat:value,istoricheskoe_podtverzhdenie:true});});}
  controls();inspect();return close;
 }
 function notices(){if(switched){O.pendingCommandNote(null,'locus-broadcast-note');return;}let r;try{r=records()[0];}catch(error){const note=document.createElement('aside');note.className='locus-session-note';note.textContent=error.message;O.pendingCommandNote(note,'locus-broadcast-note');return;}O.pendingCommandNote(null,'locus-broadcast-note');if(!r)return;const note=document.createElement('aside');note.className='locus-session-note';note.setAttribute('role','status');note.append(document.createTextNode('Действие рассылки ещё не проверено. '),button('проверить результат',()=>recover(r),'broadcastPending'));note.querySelector('button').disabled=busy;O.pendingCommandNote(note,'locus-broadcast-note');}
 window.LocusBroadcastState={execute,recover,records,notices,persist,busy:()=>busy,sessionChanged:()=>switched,pending:()=>records().length>0,subscribe:fn=>{subscribers.add(fn);fn();}};notices();document.addEventListener('locus:session-restored',update);document.addEventListener('locus:session-changed',()=>{switched=true;callbacks.clear();update();});
})();
