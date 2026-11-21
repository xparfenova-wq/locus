(function(){
 'use strict';
 const positive=v=>Number.isSafeInteger(v)&&v>0,uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 const memory=new Map(),blockedDrafts=new Set(),draftProblems=new Map(),subscribers=new Set();let busy=false;const editorInstance=crypto.randomUUID();
 const actor=()=>API.ja,prefix=()=>`locus-feed-intent:${actor()}:`,intentKey=r=>`locus-feed-intent:${r.actor}:${r.key}`;
 function context(value){if(value?.actor!==undefined&&value.actor!==actor())throw new Error('Аккаунт сменился. Переоткрой страницу перед отправкой');if(!value||!['zapis','refleksija'].includes(value.kind)||value.kind==='refleksija'&&!/^\d{4}-W\d{2}$/.test(value.week))throw new Error('Не подтверждена неделя черновика');return {kind:value.kind,week:value.kind==='refleksija'?value.week:null};}
 const draftKey=value=>{const c=context(value);return `locus-feed-draft:${actor()}:${c.kind}:${c.week||'all'}`;};
 function write(storage,key,value){const raw=JSON.stringify(value);try{storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw new Error();}catch{throw new Error('Черновик не сохранился в браузере. Оставь текст открытым и повтори сохранение.');}}
 function validDraft(row,c){return row?.v===1&&row.actor===actor()&&row.kind===c.kind&&row.week===c.week&&typeof row.raw==='string'&&(row.choice===null||typeof row.choice==='string')&&uuid(row.revision);}
 const shadowPointer=c=>draftKey(c)+':shadow';
 const variantPrefix=c=>draftKey(c)+':variant:';
 function shadow(value,row){const c=context(value),pointer=shadowPointer(c);let id=sessionStorage.getItem(pointer),prior;try{prior=uuid(id)?JSON.parse(localStorage.getItem(variantPrefix(c)+id)||'null'):null;}catch{}if(!uuid(id)||prior?.editor!==editorInstance)id=crypto.randomUUID();write(localStorage,variantPrefix(c)+id,{...row,editor:editorInstance});sessionStorage.setItem(pointer,id);if(sessionStorage.getItem(pointer)!==id)throw new Error('Браузер не запомнил сохранённую версию черновика');}
 function variants(value){const c=context(value),prefix=variantPrefix(c),out=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix)||!uuid(key.slice(prefix.length)))continue;try{const row=JSON.parse(localStorage.getItem(key));if(validDraft(row,c))out.push({key,...row});}catch{}}return out;}
 function selectVariant(value,key){const c=context(value),row=variants(c).find(row=>row.key===key);if(!row)throw new Error('Сохранённая версия не найдена');const {key:unused,...saved}=row;memory.set(draftKey(c),saved);blockedDrafts.add(draftKey(c));draftProblems.set(draftKey(c),'Выбрана сохранённая версия. Сверь её с текущим черновиком перед заменой.');sessionStorage.setItem(shadowPointer(c),key.slice(variantPrefix(c).length));return saved;}
 function draft(value){
  const c=context(value),key=draftKey(c);if(memory.has(key))return memory.get(key);
  try{const id=sessionStorage.getItem(shadowPointer(c));if(uuid(id)){const saved=JSON.parse(localStorage.getItem(variantPrefix(c)+id)||'null');if(validDraft(saved,c)){memory.set(key,saved);blockedDrafts.add(key);draftProblems.set(key,'Есть отдельная сохранённая версия этой вкладки. Сверь черновики перед заменой.');return saved;}}}catch{}
  let raw;try{raw=localStorage.getItem(key);}catch{blockedDrafts.add(key);throw new Error('Браузер не даёт прочитать черновик. Введённый текст останется на экране.');}
  if(raw===null){const empty={v:1,actor:actor(),...c,raw:'',choice:c.kind==='refleksija'?'poluchilos':null,revision:null};memory.set(key,empty);return empty;}
  let row;try{row=JSON.parse(raw);}catch{blockedDrafts.add(key);throw new Error('Черновик повреждён. Сохрани его текст отдельно перед очисткой.');}
  if(row?.v!==1||row.actor!==actor()||row.kind!==c.kind||row.week!==c.week||typeof row.raw!=='string'||row.choice!==null&&typeof row.choice!=='string'||!uuid(row.revision)){blockedDrafts.add(key);throw new Error('Не подтверждён сохранённый черновик. Он не удалён.');}
  memory.set(key,row);return row;
 }
 function save(value,raw,choice){
  const c=context(value),key=draftKey(c);if(!memory.has(key))try{draft(c);}catch{blockedDrafts.add(key);}const row={v:1,actor:actor(),...c,raw:String(raw),choice:choice||null,revision:crypto.randomUUID()};
  const previous=memory.get(key);
  if(!blockedDrafts.has(key))try{const stored=localStorage.getItem(key),disk=stored===null?null:JSON.parse(stored);if((disk?.revision??null)!==(previous?.revision??null)){blockedDrafts.add(key);draftProblems.set(key,'Черновик изменился или был отправлен в другой вкладке. Сверь сохранённое содержимое перед заменой.');}}catch{blockedDrafts.add(key);draftProblems.set(key,'Не удалось прочитать прежний черновик. Сверь сохранённое содержимое перед заменой.');}
  memory.set(key,row);if(blockedDrafts.has(key)){shadow(c,row);throw new Error(draftProblems.get(key)||'Старый черновик не прочитан. Текст сохранён отдельной версией; сверить черновики можно перед отправкой.');}write(localStorage,key,row);return row;
 }
 function records(){
  const found=[];try{for(let i=0;i<sessionStorage.length;i++){const key=sessionStorage.key(i);if(!key?.startsWith(prefix()))continue;const id=key.slice(prefix().length);if(!uuid(id))throw new Error();let row;try{row=JSON.parse(sessionStorage.getItem(key));}catch{}if(!row||row.actor!==actor()||row.key!==id)row={v:1,actor:actor(),key:id,body:null,damaged:true};found.push(row);}}catch{throw new Error('Не удалось прочитать проверку записи. Новая отправка заблокирована.');}return found;
 }
 function valid(row){return row?.v===1&&row.actor===actor()&&uuid(row.key)&&row.body&&row.body.chelovek_id===actor()&&['zapis','refleksija'].includes(row.body.tip)&&typeof row.body.tekst==='string'&&row.body.tekst.trim()&&(!row.body.sprint||typeof row.body.sprint==='string');}
 function proof(value){
  if(!value||!['ne_najdeno','otmeneno','udaleno','perenesen','sozdano'].includes(value.sostojanie))throw new Error('Не получен результат добавления');
  if(value.sostojanie==='sozdano'){const row=value.zapis;if(!positive(value.id)||!row||row.id!==value.id||row.chelovek_id!==actor()||!positive(row.versija)||typeof row.tekst!=='string'||!['zapis','refleksija','princip','novoe'].includes(row.tip))throw new Error('Подтверждение записи неполное');}
  if(['udaleno','perenesen'].includes(value.sostojanie)&&!positive(value.id))throw new Error('Не подтверждена исходная запись');return value;
 }
 async function request(method,path,body){return API.zapros(method,path,body);}
 function update(){for(const fn of subscribers)try{fn();}catch{}notices();}
 async function finish(record,result){
  let cleared=false;
  if(result.sostojanie==='sozdano'&&record.draft){
   const key=draftKey(record.draft);let current=draft(record.draft);
   if(current.revision===record.draft.revision&&current.raw===record.draft.raw){try{const stored=localStorage.getItem(key),disk=stored===null?null:JSON.parse(stored);if(disk?.revision===record.draft.revision){localStorage.removeItem(key);if(localStorage.getItem(key)!==null)throw new Error();}memory.delete(key);cleared=true;}catch{throw new Error('Запись сохранена, но браузер не обновил черновик. Проверь результат ещё раз.');}}
  }
  try{sessionStorage.removeItem(intentKey(record));if(sessionStorage.getItem(intentKey(record))!==null)throw new Error();}catch{throw new Error('Результат известен, но браузер не убрал проверку. Повтори проверку.');}
  document.dispatchEvent(new CustomEvent('locus:feed-changed',{detail:{context:record.draft||null,result,cleared}}));update();
  let undoBusy=false;
  const undo=result.sostojanie==='sozdano'&&result.zapis.versija===1?async()=>{if(undoBusy)return;undoBusy=true;try{await request('DELETE','/lenta/'+result.id,{versija:result.zapis.versija});O.tost('Добавление отменено');}catch(error){O.tost('Не удалось подтвердить отмену. '+error.message);}finally{document.dispatchEvent(new CustomEvent('locus:feed-changed',{detail:{result:null}}));}}:undefined;
  O.tost(result.sostojanie==='sozdano'?'Запись сохранена':result.sostojanie==='otmeneno'?'Попытка отменена, черновик оставлен':'Исходная запись уже удалена или изменена. Черновик оставлен',undo);
 }
 async function submit(value,raw,choice){
  if(busy||records().length)throw new Error('Сначала проверь предыдущее добавление');
  const c=context(value),text=String(raw).trim();if(!text)throw new Error('Напиши пару слов');
  const options=c.kind==='refleksija'?LocusFeedText.facets:LocusFeedText.kinds,selected=choice?options.find(row=>row[0]===choice):null;if(choice&&!selected)throw new Error('Не подтверждён выбранный тип записи');
  const body={chelovek_id:actor(),tip:c.kind,tekst:(selected?.[2]||'')+text,...(c.week?{sprint:c.week}:{})};if(Array.from(body.tekst).length>5000)throw new Error('В записи должно быть не больше 5000 символов вместе с подписью');
  const saved=save(c,raw,choice),record={v:1,actor:actor(),key:crypto.randomUUID(),body,draft:saved};write(sessionStorage,intentKey(record),record);busy=true;update();
  try{const row=await request('POST','/lenta',{...body,zapros_kljuch:record.key});if(!row?.povtor_sozdanija&&(row?.tekst!==body.tekst||row?.tip!==body.tip))throw new Error('Не подтверждён отправленный текст');await finish(record,proof({sostojanie:'sozdano',id:row?.id,zapis:row}));return {saved:true};}
  catch(error){O.tost('Результат отправки не подтверждён. Сначала проверь запись. '+(error.kod&&error.kod<500?error.message:''));return {unknown:true};}finally{busy=false;update();}
 }
 function button(label,fn,name){const node=document.createElement('button');node.type='button';node.className='kn';node.dataset[name]='';node.textContent=label;node.onclick=fn;return node;}
 function recover(record){
  if(busy||record.actor!==actor())return;let missing=false;
  const close=O.modalka('Проверить отправку записи','<p>Проверка читает результат и не отправляет запись повторно.</p><p role="status" data-feed-proof-status></p><div class="tpl-actions" data-feed-proof-actions></div>',null,{poverh:true}),root=document.querySelector('.vyb-fon:last-of-type'),status=root.querySelector('[data-feed-proof-status]'),actions=root.querySelector('[data-feed-proof-actions]');root.classList.add('feed-recovery-modal');
  function controls(){actions.replaceChildren(button('проверить',inspect,'feedCheck'),button('отменить попытку',cancel,'feedCancel'));if(missing&&valid(record))actions.append(button('повторить тот же запрос',retry,'feedRetry'));actions.querySelectorAll('button').forEach(n=>n.disabled=busy);}
  async function accept(value){if(value.sostojanie==='ne_najdeno'){missing=true;status.textContent='Запись не найдена. Можно отменить попытку или отдельно повторить тот же запрос.';return;}await finish(record,value);close();}
  async function run(fn){if(busy)return;busy=true;update();controls();try{await fn();}catch(error){status.textContent='Проверка не завершена. '+error.message;}finally{busy=false;update();controls();}}
  async function inspect(){missing=false;await run(async()=>accept(proof(await request('GET','/lenta/proverka?zapros_kljuch='+record.key))));}
  async function cancel(){missing=false;await run(async()=>accept(proof(await request('POST','/lenta/otmena_popytki',{zapros_kljuch:record.key}))));}
  async function retry(){if(!missing||!valid(record))return;missing=false;await run(async()=>{const row=await request('POST','/lenta',{...record.body,zapros_kljuch:record.key});await accept(proof({sostojanie:'sozdano',id:row?.id,zapis:row}));});}
  controls();inspect();return close;
 }
 function notices(){
  let pending;try{pending=records()[0];}catch(error){const note=document.createElement('aside');note.className='locus-session-note';note.textContent=error.message;O.pendingCommandNote(note,'locus-feed-note');return;}
  document.getElementById('locus-feed-note')?.remove();if(!pending)return;const note=document.createElement('aside');note.className='locus-session-note';note.id='locus-feed-note';note.setAttribute('role','status');note.append(document.createTextNode('Отправка записи ещё не проверена. '),button('проверить результат',()=>recover(pending),'feedPending'));note.querySelector('button').disabled=busy;O.pendingCommandNote(note,note.id);
 }
 function resetDraft(value){const key=draftKey(value),row=memory.get(key),pointer=shadowPointer(value),id=sessionStorage.getItem(pointer);if(row)write(localStorage,key,row);else{localStorage.removeItem(key);if(localStorage.getItem(key)!==null)throw new Error('Браузер не очистил старый черновик');}if(uuid(id))localStorage.removeItem(variantPrefix(value)+id);sessionStorage.removeItem(pointer);blockedDrafts.delete(key);draftProblems.delete(key);return row||draft(value);}
 window.LocusFeedState={draft,save,resetDraft,variants,selectVariant,draftBlocked:value=>blockedDrafts.has(draftKey(value)),draftProblem:value=>draftProblems.get(draftKey(value))||'Старый черновик не прочитан. Сверь сохранённое содержимое перед заменой.',rawDraft:value=>localStorage.getItem(draftKey(value)),submit,recover,records,notices,pending:()=>records().length>0,busy:()=>busy,subscribe:fn=>{subscribers.add(fn);fn();}};notices();document.addEventListener('locus:session-restored',update);
})();
