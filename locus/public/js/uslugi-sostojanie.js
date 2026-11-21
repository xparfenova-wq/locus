(() => {
 'use strict';
 const kinds=['sozdanie','pravka','zamena','porjadok'],states=new Map(),callbacks=new Map(),settledKeys=new Set();
 const prefix=()=>`locus-service-intent:${API.ja}:`,draftPrefix=()=>`locus-service-draft:${API.ja}:`;
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
 const positive=value=>Number.isSafeInteger(value)&&value>0;
 const scope=r=>r&&kinds.includes(r.kind)&&typeof r.direction==='string'&&r.direction&&Number.isSafeInteger(r.id)&&(['sozdanie','porjadok'].includes(r.kind)?r.id===0:r.id>0)&&uuid(r.key)&&r.actor===API.ja;
 const storageKey=r=>prefix()+[encodeURIComponent(r.direction),r.kind,r.id,r.key].join(':');
 const draftKey=r=>draftPrefix()+(r.kind==='sozdanie'?'new:'+encodeURIComponent(r.direction):'edit:'+r.id);
 function state(direction){const id=API.ja+':'+direction;if(!states.has(id))states.set(id,{busy:false,views:new Set()});return states.get(id);}
 function records(direction){
  const rows=[];for(let i=0;i<sessionStorage.length;i++){
   const name=sessionStorage.key(i);if(!name?.startsWith(prefix()))continue;
   const parts=name.slice(prefix().length).split(':');if(parts.length!==4)continue;
   let r;try{r=JSON.parse(sessionStorage.getItem(name));}catch{}
   let dir;try{dir=decodeURIComponent(parts[0]);}catch{continue;}
   const envelope={direction:dir,kind:parts[1],id:Number(parts[2]),key:parts[3],actor:API.ja};if(!scope(envelope))continue;
   if(!r||r.actor!==envelope.actor||r.kind!==envelope.kind||r.id!==envelope.id||r.direction!==envelope.direction||r.key!==envelope.key)r={...envelope,body:null,corrupt:true};
   if(direction===undefined||r.direction===direction)rows.push(r);
  }return rows;
 }
 function store(r){if(!scope(r))throw new Error('Не удалось подготовить проверку услуги');const text=JSON.stringify(r);try{sessionStorage.setItem(storageKey(r),text);if(sessionStorage.getItem(storageKey(r))!==text)throw new Error();}catch{throw new Error('Не удалось сохранить проверку в браузере. Оставь форму открытой.');}}
 function discard(r){sessionStorage.removeItem(storageKey(r));}
 function validBody(r){
  if(!scope(r)||!r.body||typeof r.body!=='object'||Array.isArray(r.body))return false;
  const b=r.body,fields=['nazvanie','opisanie','cena','ssylka'],allowed=r.kind==='sozdanie'?[...fields,'napravlenie']:r.kind==='pravka'?[...fields,'versija','arhiv','reshenie','confirm','vlijanie_token']:r.kind==='zamena'?['na_id','novaja_usluga_id','versija','versija_zameny','confirm','vlijanie_token']:['porjadok','versii'];
  if(!Object.keys(b).every(k=>allowed.includes(k)))return false;
  if(r.kind==='sozdanie'&&(b.napravlenie!==r.direction||typeof b.nazvanie!=='string'||!O.estNazvanieZadachi(b.nazvanie)||b.nazvanie.length>200))return false;
  if(['pravka','zamena'].includes(r.kind)&&!positive(b.versija))return false;
  if(r.kind==='pravka'&&!['nazvanie','opisanie','cena','ssylka','arhiv'].some(k=>Object.hasOwn(b,k)))return false;
  if(Object.hasOwn(b,'nazvanie')&&(typeof b.nazvanie!=='string'||!O.estNazvanieZadachi(b.nazvanie)))return false;
  for(const [key,max]of [['nazvanie',200],['opisanie',2000],['ssylka',500]])if(Object.hasOwn(b,key)&&b[key]!==null&&(typeof b[key]!=='string'||b[key].length>max))return false;
  if(Object.hasOwn(b,'cena')&&b.cena!==null&&(!['number','string'].includes(typeof b.cena)||!/^\d+(?:[.,]\d+)?$/.test(String(b.cena))||Number(String(b.cena).replace(',','.'))>999999999))return false;
  if(Object.hasOwn(b,'arhiv')&&typeof b.arhiv!=='boolean')return false;
  if(Object.hasOwn(b,'reshenie')&&!['vo_vseh','tolko_v_novyh'].includes(b.reshenie))return false;
  if(Object.hasOwn(b,'confirm')&&b.confirm!==true)return false;
  if(Object.hasOwn(b,'vlijanie_token')&&(typeof b.vlijanie_token!=='string'||!/^[0-9a-f]{64}$/.test(b.vlijanie_token)))return false;
  if(r.kind==='zamena'&&(!positive(b.na_id??b.novaja_usluga_id)||!positive(b.versija_zameny)||b.confirm!==true))return false;
  if(r.kind==='porjadok'&&(!Array.isArray(b.porjadok)||!b.porjadok.every(positive)||new Set(b.porjadok).size!==b.porjadok.length||!b.versii||Array.isArray(b.versii)||typeof b.versii!=='object'||Object.keys(b.versii).length!==b.porjadok.length||!b.porjadok.every(id=>positive(b.versii[id]))))return false;
  return true;
 }
 const route=r=>r.kind==='sozdanie'?'/uslugi':r.kind==='porjadok'?'/napravlenija/'+encodeURIComponent(r.direction)+'/uslugi':'/uslugi/'+r.id+(r.kind==='zamena'?'/zamena':'');
 const method=r=>['pravka','porjadok'].includes(r.kind)?'PATCH':'POST';
 function button(text,click,marker){const node=document.createElement('button');node.type='button';node.className='kn';node.textContent=text;if(marker)node.dataset[marker]='1';node.addEventListener('click',click);return node;}
 async function request(method,path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,path,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
 function service(row,direction){if(!row||!positive(row.id)||!positive(row.versija)||typeof row.nazvanie!=='string'||row.napravlenie!==direction||typeof row.arhiv!=='boolean'&&row.arhiv!==null)throw new Error('Результат услуги не подтверждён');return row;}
 function list(rows,direction){if(!Array.isArray(rows)||new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Список услуг не подтверждён');rows.forEach(r=>service(r,direction));return rows;}
 function direct(r,result){if(r.kind==='porjadok'){list(result?.spisok,r.direction);return result;}const row=r.kind==='zamena'?result?.vstala:result;service(row,r.direction);if(r.kind==='pravka'&&row.id!==r.id||r.kind==='zamena'&&row.id!==(r.body.na_id??r.body.novaja_usluga_id))throw new Error('Сохранена другая услуга');if(r.kind==='zamena'&&(result.udalena?.id!==r.id||!Number.isSafeInteger(result.proektov)||result.proektov<0))throw new Error('Замена проектов не подтверждена');if(r.kind==='sozdanie'&&(!Number.isSafeInteger(result.proektov_perevedeno)||result.proektov_perevedeno<0))throw new Error('Перевод проектов не подтверждён');return result;}
 function proof(r,result){
  if(!result||!['ne_najdeno','otmeneno','sohraneno'].includes(result.sostojanie))throw new Error('Результат проверки не подтверждён');
  if(result.sostojanie==='ne_najdeno')return result;
  if(result.dejstvie!==r.kind||result.usluga_id!==r.id||result.napravlenie!==r.direction)throw new Error('Проверка относится к другой услуге');
  if(result.sostojanie==='sohraneno'){
   if(!result.itog||typeof result.udaleno!=='boolean')throw new Error('Результат проверки неполный');
   if(r.kind==='porjadok'){list(result.spisok,r.direction);if(!Array.isArray(result.itog.porjadok)||!result.itog.porjadok.every(positive)||new Set(result.itog.porjadok).size!==result.itog.porjadok.length)throw new Error('Порядок не подтверждён');}
   else if(!result.udaleno){const row=service(result.usluga,r.direction);if(!positive(result.itog.versija_posle)||result.itog.versija_posle>row.versija||r.kind==='pravka'&&row.id!==r.id||r.kind==='zamena'&&validBody(r)&&row.id!==(r.body.na_id??r.body.novaja_usluga_id))throw new Error('Версия сохранения не подтверждена');}
   if(r.kind==='sozdanie'&&(!Number.isSafeInteger(result.itog.proektov_perevedeno)||result.itog.proektov_perevedeno<0)||r.kind==='zamena'&&(!Number.isSafeInteger(result.itog.proektov)||result.itog.proektov<0))throw new Error('Связанные проекты не подтверждены');
  }return result;
 }
 function update(direction){const s=state(direction);for(const view of [...s.views]){if(!view.root.isConnected)s.views.delete(view);else view.render();}notices();}
 function notices(){
  let rows;try{rows=records();}catch(error){const note=document.createElement('aside');note.className='locus-session-note';note.textContent='Проверка браузера недоступна. Оставь открытые формы на месте.';O.pendingCommandNote(note,'service-command-note');return;}
  if(!rows.length){O.pendingCommandNote(null,'service-command-note');return;}
  const r=rows[0],note=document.createElement('aside'),text=document.createElement('span');note.className='locus-session-note';note.id='service-command-note';note.setAttribute('role','status');text.textContent='Есть непроверенное действие с услугой'+(r.title?' «'+r.title+'»':'')+'.';const check=button('проверить действие',()=>recover(r),'servicePending');check.disabled=state(r.direction).busy;note.append(text,check);O.pendingCommandNote(note,note.id);
 }
 async function refresh(r,result,options){try{if(options.after)await options.after(result);else document.dispatchEvent(new CustomEvent('locus:services-changed',{detail:{direction:r.direction}}));}catch{O.tost('Услуга сохранена. Обнови список, чтобы увидеть текущие данные.');}}
 function clearSavedDraft(r){try{sessionStorage.removeItem(draftKey(r));}catch{O.tost('Услуга сохранена. Старый черновик остался в браузере.');}}
 async function settle(r,result,options){
  discard(r);const settledKey=r.actor+':'+r.key;if(settledKeys.has(settledKey)){update(r.direction);return;}settledKeys.add(settledKey);if(result.sostojanie==='sohraneno'){if(!result.udaleno&&r.kind!=='porjadok')clearSavedDraft(r);try{options.onSaved?.(result);}catch{O.tost('Услуга сохранена. Обнови экран.');}await refresh(r,result,options);}
  else try{await options.onCancelled?.();}catch{O.tost('Попытка отменена. Обнови экран, чтобы увидеть текущие данные.');}callbacks.delete(r.key);update(r.direction);
 }
 async function execute(command,options={}){
  if(state(command.direction).busy)return {busy:true};let existing;try{existing=records(command.direction)[0];}catch{throw new Error('Не удалось проверить незавершённые действия в браузере');}
  if(existing){recover(existing);return {pending:true};}
  const r={...command,actor:API.ja,key:crypto.randomUUID(),phase:'prepared'};if(!validBody(r))throw new Error('Проверь поля услуги перед сохранением');
  const s=state(r.direction);s.busy=true;update(r.direction);
  try{
   store(r);callbacks.set(r.key,options);update(r.direction);
   const result=direct(r,await request(method(r),route(r),{...r.body,zapros_kljuch:r.key}));
   await new Promise(resolve=>setTimeout(resolve,300));
   discard(r);settledKeys.add(r.actor+':'+r.key);if(r.kind!=='porjadok')clearSavedDraft(r);try{options.onSaved?.(result);}catch{O.tost('Услуга сохранена. Обнови экран.');}callbacks.delete(r.key);await refresh(r,result,options);return {saved:true,result};
  }catch(error){
   let pending=false;try{pending=records(r.direction).some(x=>x.key===r.key);}catch{}
   if(pending){try{store({...r,phase:'unknown'});}catch{}error.serviceIntent=r;error.serviceUnknown=true;}
   throw error;
  }finally{s.busy=false;update(r.direction);}
 }
 function recover(r,options=callbacks.get(r.key)||{}){
  if(!scope(r))return;const close=O.modalka('Проверить действие услуги','<p data-service-intent-title></p><p role="status" data-service-recovery-status>Проверка читает результат без повторного сохранения.</p><div class="tpl-actions" data-service-recovery-actions></div>',null,{poverh:true}),root=document.querySelector('.vyb-fon:last-of-type'),status=root.querySelector('[data-service-recovery-status]'),area=root.querySelector('[data-service-recovery-actions]');root.classList.add('services-modal');let missing=false;
  root.querySelector('[data-service-intent-title]').textContent=r.title?'Услуга «'+r.title+'»':validBody(r)?'Поля действия сохранены в браузере.':'Поля не читаются. Доступны проверка и отмена попытки.';
  const view={root,render:()=>area.querySelectorAll('button').forEach(node=>node.disabled=state(r.direction).busy)};state(r.direction).views.add(view);
  function controls(){area.replaceChildren(button('проверить',inspect,'serviceIntentRead'));if(missing&&validBody(r))area.append(button('повторить эту попытку',retry,'serviceIntentRetry'));area.append(button('отменить попытку',cancel,'serviceIntentCancel'));view.render();}
  function done(){area.replaceChildren(button('закрыть',close,'serviceRecoveryClose'));}
  async function inspect(){if(state(r.direction).busy)return;missing=false;state(r.direction).busy=true;update(r.direction);try{const result=proof(r,await request('GET','/uslugi/proverka?zapros_kljuch='+encodeURIComponent(r.key)));if(result.sostojanie==='ne_najdeno'){missing=true;status.textContent=validBody(r)?'Действие пока не найдено. Можно явно повторить ту же попытку или отменить её.':'Действие пока не найдено. Поля не читаются; можно отменить попытку.';controls();}else{await settle(r,result,options);status.textContent=result.sostojanie==='otmeneno'?'Попытка отменена. Поздний запрос не изменит услуги. Черновик сохранён.':result.udaleno?'Действие выполнено, затем услуга была удалена. Повтор не создаёт её заново.':'Действие сохранено. Показаны текущие данные услуги.';done();}}catch(error){status.textContent='Проверка не завершена. '+error.message;controls();}finally{state(r.direction).busy=false;update(r.direction);}}
  async function retry(){if(!missing||!validBody(r)||state(r.direction).busy)return;missing=false;state(r.direction).busy=true;update(r.direction);try{const result=direct(r,await request(method(r),route(r),{...r.body,zapros_kljuch:r.key}));discard(r);if(settledKeys.has(r.actor+':'+r.key)){status.textContent='Действие уже сохранено. Повтор не меняет его заново.';done();return;}settledKeys.add(r.actor+':'+r.key);if(r.kind!=='porjadok')clearSavedDraft(r);try{options.onSaved?.(result);}catch{O.tost('Услуга сохранена. Обнови экран.');}callbacks.delete(r.key);await refresh(r,result,options);status.textContent='Действие сохранено. Показаны текущие данные услуги.';done();}catch(error){status.textContent='Сохранение ещё не подтверждено. '+error.message;controls();}finally{state(r.direction).busy=false;update(r.direction);}}
  async function cancel(){if(state(r.direction).busy)return;missing=false;state(r.direction).busy=true;update(r.direction);try{const result=proof(r,await request('POST','/uslugi/otmena_dejstvija',{zapros_kljuch:r.key,dejstvie:r.kind,usluga_id:r.id,napravlenie:r.direction}));if(!['sohraneno','otmeneno'].includes(result.sostojanie))throw new Error('Отмена не подтверждена');await settle(r,result,options);status.textContent=result.sostojanie==='otmeneno'?'Попытка отменена. Поздний запрос не изменит услуги. Черновик сохранён.':'Действие уже успело сохраниться. Отмена попытки его не откатывает.';done();}catch(error){status.textContent='Отмена ещё не подтверждена. '+error.message;controls();}finally{state(r.direction).busy=false;update(r.direction);}}
  controls();inspect();return close;
 }
 function subscribe(direction,view){state(direction).views.add(view);view.render();return()=>state(direction).views.delete(view);}
 function storeDraft(r,value){const key=draftKey({...r,actor:API.ja}),text=JSON.stringify(value);try{sessionStorage.setItem(key,text);if(sessionStorage.getItem(key)!==text)throw new Error();}catch{throw new Error('Не удалось сохранить черновик. Оставь форму открытой.');}}
 const api={execute,recover,records,notices,subscribe,busy:dir=>state(dir).busy,pending:dir=>records(dir).length>0,request,service,list,validBody,storeDraft,loadDraft:r=>JSON.parse(sessionStorage.getItem(draftKey(r))||'null'),clearDraft:r=>sessionStorage.removeItem(draftKey(r))};
 window.LocusServiceState=api;notices();document.addEventListener('locus:session-restored',()=>{notices();for(const view of states.values())for(const item of view.views)if(item.root.isConnected)item.render();});
})();
