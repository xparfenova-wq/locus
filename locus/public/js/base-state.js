(()=>{
 'use strict';
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),actor=API.ja,prefix='locus-base-intent:'+actor+':',draftPrefix='locus-base-draft:'+actor+':';
 let busy=false,switched=false;const callbacks=new Map(),views=new Set();
 function own(){if(switched||actor!==API.ja)throw new Error('Аккаунт сменился. Открой страницу заново');}
 function persist(storage,name,raw){try{storage.setItem(name,raw);if(storage.getItem(name)!==raw)throw new Error();}catch{throw new Error('Браузер не сохранил данные. Запрос не отправлен; оставь форму открытой');}return raw;}
 function scopeName(scope){if(typeof scope!=='string'||!/^(base-new|base-[1-9]\d*|member-new-[1-9]\d*|member-[1-9]\d*|stage-new-[1-9]\d*|stage-[1-9]\d*|order-[1-9]\d*|import-[1-9]\d*)$/.test(scope))throw new Error('Не подтверждён контекст черновика');return draftPrefix+scope;}
 function raw(scope){own();try{return localStorage.getItem(scopeName(scope));}catch{throw new Error('Сохранённый черновик не читается. Не закрывай форму');}}
 function draft(scope){const value=raw(scope);if(value===null)return {raw:null,data:null};let r;try{r=JSON.parse(value);}catch{}if(!r||r.version!==1||r.actor!==actor||r.scope!==scope||!r.data||typeof r.data!=='object'||Array.isArray(r.data))throw Object.assign(new Error('Сохранённый черновик повреждён. Сверь его перед заменой'),{draftBlocked:true,raw:value});return {raw:value,data:r.data};}
 function save(scope,data,expected){own();const current=raw(scope);if(current!==expected)throw Object.assign(new Error('Черновик изменился в другой вкладке. Сравни варианты перед заменой'),{draftBlocked:true,raw:current});return persist(localStorage,scopeName(scope),JSON.stringify({version:1,actor,scope,data}));}
 function records(){own();const rows=[];try{for(let i=0;i<sessionStorage.length;i++){const name=sessionStorage.key(i);if(!name?.startsWith(prefix))continue;const key=name.slice(prefix.length);if(!uuid(key))throw new Error();let r;try{r=JSON.parse(sessionStorage.getItem(name));}catch{}rows.push(r&&r.actor===actor&&r.key===key?r:{actor,key,body:null});}}catch{throw new Error('Сохранённое действие не читается. Новая запись заблокирована');}return rows;}
 async function request(method,route,body){own();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,route,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
 function update(){for(const fn of views)try{fn();}catch{}notices();}
 function button(label,fn,marker){const b=document.createElement('button');b.type='button';b.className='kn ostavit-vnutri';b.textContent=label;b.dataset[marker]='1';b.onclick=fn;return b;}
 async function accept(r,value){
  own();if(!value||!['vypolneno','otmeneno'].includes(value.sostojanie))throw new Error('Сервер ещё не подтвердил результат');
  if(value.sostojanie==='vypolneno'){
   if(!value.ack||!['baza','stroka','status'].includes(value.ack.vid)||!Number.isSafeInteger(value.ack.id)||value.ack.id<1||r.action&&value.dejstvie!==r.action)throw new Error('Сервер вернул другое действие');
   if(r.target&&value.ack.id!==r.target)throw new Error('Сервер вернул другую запись');if(value.resultat&&value.resultat.id!==value.ack.id)throw new Error('Номер результата не совпал');
  }
  try{sessionStorage.removeItem(prefix+r.key);if(sessionStorage.getItem(prefix+r.key)!==null)throw new Error();}catch{throw new Error('Результат известен, но браузер не убрал проверку. Повтори проверку');}
  if(value.sostojanie==='vypolneno'&&r.scope&&typeof r.draftRaw==='string')try{if(raw(r.scope)===r.draftRaw)localStorage.removeItem(scopeName(r.scope));}catch{O.tost('Правка подтверждена; черновик остался в браузере');}
  const cb=callbacks.get(r.key);callbacks.delete(r.key);update();document.dispatchEvent(new CustomEvent('locus:base-changed',{detail:{result:value}}));if(cb)await cb(value);return value;
 }
 async function execute({scope,method,route,body,action,target=null,draftRaw,onSaved}){
  own();if(busy||records().length)throw new Error('Сначала проверь прежнее действие');if(!['POST','PATCH','DELETE'].includes(method)||!/^\/bazy(?:\/[1-9]\d*)?(?:\/(?:ljudi|statusy|porjadok_statusov|materialy|zagruzka|sostojanie_stroki))?$/.test(route))throw new Error('Неверное действие базы');
  if(scope&&raw(scope)!==draftRaw)throw new Error('Черновик изменился перед сохранением. Сравни варианты');
  const key=crypto.randomUUID(),r={actor,key,method,route,body,scope,draftRaw,action,target};if(new TextEncoder().encode(JSON.stringify({...body,zapros_kljuch:key})).byteLength>2*1024*1024)throw new Error('В запросе слишком много текста. Раздели таблицу на меньшие файлы; запрос не отправлен');persist(sessionStorage,prefix+key,JSON.stringify(r));if(onSaved)callbacks.set(key,onSaved);busy=true;update();
  try{await request(method,route,{...body,zapros_kljuch:key});return await accept(r,await request('GET','/bazy/proverka?zapros_kljuch='+encodeURIComponent(key)));}
  catch(error){if([400,409,422].includes(error.kod)){try{const result=await request('POST','/bazy/otmena_popytki',{zapros_kljuch:key});if(result.sostojanie==='vypolneno')return await accept(r,result);await accept(r,result);}catch(cancelError){throw Object.assign(new Error('Результат отклонённого запроса ещё не проверен. '+cancelError.message),{baseUncertain:true,cause:error});}throw error;}throw Object.assign(new Error('Сохранение ещё не подтверждено. Проверь результат. '+error.message),{baseUncertain:true,cause:error});}
  finally{busy=false;update();}
 }
 function valid(r){return ['POST','PATCH','DELETE'].includes(r.method)&&typeof r.route==='string'&&/^\/bazy(?:\/[1-9]\d*)?(?:\/(?:ljudi|statusy|porjadok_statusov|materialy|zagruzka|sostojanie_stroki))?$/.test(r.route)&&r.body&&typeof r.body==='object'&&!Array.isArray(r.body);}
 function recover(r){
  own();if(busy)return;let missing=false;const close=O.modalka('Проверить сохранение базы','<p role="status" data-base-proof-status></p><div class="pending-command-actions" data-base-proof-actions></div>',null,{poverh:true}),root=document.querySelector('.vyb-fon:last-of-type'),status=root.querySelector('[data-base-proof-status]'),area=root.querySelector('[data-base-proof-actions]');
  async function run(fn){if(busy||switched)return;busy=true;update();controls();try{const result=await fn();own();if(result.sostojanie==='ne_najdeno'){missing=true;status.textContent='Действие не найдено. Можно отменить попытку или явно повторить прежний запрос.';}else{await accept(r,result);close();O.tost(result.sostojanie==='otmeneno'?'Попытка отменена':'Сохранение подтверждено');}}catch(e){if(!switched)status.textContent=e.message;}finally{busy=false;update();if(root.isConnected)controls();}}
  function inspect(){missing=false;return run(()=>request('GET','/bazy/proverka?zapros_kljuch='+encodeURIComponent(r.key)));}
  function controls(){area.replaceChildren();if(switched){root.querySelectorAll('input,textarea').forEach(n=>n.value='');status.textContent='Аккаунт сменился. Открой страницу заново';return;}area.append(button('проверить',inspect,'baseProofCheck'),button('отменить попытку',()=>run(()=>request('POST','/bazy/otmena_popytki',{zapros_kljuch:r.key})),'baseProofCancel'));if(missing&&valid(r))area.append(button('повторить тот же запрос',()=>run(async()=>{await request(r.method,r.route,{...r.body,zapros_kljuch:r.key});return request('GET','/bazy/proverka?zapros_kljuch='+encodeURIComponent(r.key));}),'baseProofRetry'));area.querySelectorAll('button').forEach(b=>b.disabled=busy);}
  const render=()=>{if(!root.isConnected)views.delete(render);else controls();};views.add(render);controls();void inspect();return close;
 }
 function notices(){O.pendingCommandNote(null,'locus-base-note');if(switched)return;let r;try{r=records()[0];}catch(e){const n=document.createElement('aside');n.className='locus-session-note';n.textContent=e.message;O.pendingCommandNote(n,'locus-base-note');return;}if(!r)return;const n=document.createElement('aside');n.className='locus-session-note';n.append('Сохранение базы ещё не проверено. ',button('проверить результат',()=>recover(r),'basePending'));n.querySelector('button').disabled=busy;O.pendingCommandNote(n,'locus-base-note');}
 document.addEventListener('locus:session-changed',()=>{switched=true;update();});document.addEventListener('locus:session-restored',()=>{if(actor!==API.ja)switched=true;update();});
 window.LocusBaseState={draft,raw,save,execute,recover,records,notices,busy:()=>busy,pending:()=>records().length>0,subscribe:fn=>{views.add(fn);return()=>views.delete(fn);}};notices();
})();
