(() => {
 'use strict';
 const API=window.API,fields={nazvanie:'название',opisanie:'описание',otvetstvennyj:'ответственный',srok:'срок',sprint:'спринт',kljuchevaja:'ключевая'},busy=new Set(),writing=new Set();
 const prefix=()=>`locus-task-field-v1:${API.ja}:`,key=n=>prefix()+Number(n);
 const fail=text=>Object.assign(new Error(text),{taskEditUnknown:true});
 function value(field,input){
  if(!Object.hasOwn(fields,field))throw new Error('Неизвестное поле задачи');
  if(['nazvanie','opisanie'].includes(field)){if(typeof input!=='string')throw new Error();return input;}
  if(field==='kljuchevaja'){if(typeof input!=='boolean')throw new Error();return input;}
  if(field==='otvetstvennyj'){const n=Number(input);if(!Number.isSafeInteger(n)||n<1)throw new Error();return n;}
  if(field==='sprint'){const week=SPR.kalendar.razobrat_nedelju(input);return SPR.kalendar.kljuch_nedeli(week.god,week.nomer);}
  if(input===null)return null;SPR.kalendar.data(input);return input;
 }
 function load(number){
  let raw;
  try{
   raw=sessionStorage.getItem(key(number));if(raw===null)return null;const r=JSON.parse(raw);
   if(r.format!==1||r.actor!==API.ja||r.nomer!==Number(number)||!Number.isSafeInteger(r.versija)||r.versija<1||r.phase!=='pending'||JSON.stringify(value(r.field,r.value))!==JSON.stringify(r.value))throw new Error();
   return {raw,record:r};
  }catch{return {raw,invalid:true};}
 }
 function clear(command){
  if(command.actor!==API.ja||sessionStorage.getItem(command.key)!==command.raw)throw fail('Незавершённая правка изменилась. Проверь её ещё раз.');
  sessionStorage.removeItem(command.key);if(sessionStorage.getItem(command.key)!==null)throw fail('Браузер не снял незавершённую правку');notices();
 }
 function currentValue(row,field){return field==='sprint'?(row.sprint==null||row.god_sprinta==null?null:SPR.kalendar.kljuch_nedeli(row.god_sprinta,row.sprint)):row[field];}
 function matches(row,r){
  if(row.udaleno||row.notFound||row.versija<r.versija)return false;
  const current=currentValue(row,r.field);
  return JSON.stringify(current)===JSON.stringify(r.value);
 }
 function checked(row,number){
  if(row?.nomer!==Number(number)||!Number.isSafeInteger(row.versija)||row.versija<1)throw fail('Ответ не подтвердил задачу');return row;
 }
 async function request(method,number,body,day){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000),route='/zadachi/'+Number(number);
  try{
   try{return await API.zapros(method,route+(method==='GET'&&day?'?den='+encodeURIComponent(day):''),body,{signal:controller.signal});}
   catch(error){
    if(method==='GET'&&error.kod===410){const state=await API.zapros('GET',route+'/korzina',undefined,{signal:controller.signal});return state.udaleno?state:await API.zapros('GET',route+(day?'?den='+encodeURIComponent(day):''),undefined,{signal:controller.signal});}
    if(method==='GET'&&error.kod===404)return {nomer:Number(number),notFound:true};throw error;
   }
  }finally{clearTimeout(timer);}
 }
 async function save(task,field,input,version){
  if(load(task.nomer))throw fail('Есть неподтверждённая правка задачи');
  const record={format:1,actor:API.ja,nomer:Number(task.nomer),versija:version,field,value:value(field,input),phase:'pending'};
  if(!Number.isSafeInteger(record.nomer)||record.nomer<1||!Number.isSafeInteger(record.versija)||record.versija<1)throw new Error('Обнови задачу перед правкой');
  const command={actor:record.actor,key:key(task.nomer),raw:JSON.stringify(record)};
  try{sessionStorage.setItem(command.key,command.raw);if(sessionStorage.getItem(command.key)!==command.raw)throw new Error();}
  catch{throw new Error('Браузер не подготовил сохранение. Запрос не отправлен.');}
  notices();writing.add(command.key);
  try{
   const row=checked(await request('PATCH',task.nomer,{[field]:record.value,versija:version}),task.nomer);
   if(API.ja!==record.actor||typeof row.status!=='string'||!matches(row,record))throw fail('Правка не подтверждена');clear(command);return row;
  }catch(error){
   if(API.ja!==record.actor)throw fail('Доступ изменился. Проверь правку после входа.');
   if(error.kod===409){error.taskEditCommand=command;if(!error.telo?.tekuschee)error.taskEditUnknown=true;throw error;}
   if(error.kod>=400&&error.kod<500){clear(command);throw error;}
   throw fail('Результат сохранения ещё не подтверждён.');
  }finally{writing.delete(command.key);document.dispatchEvent(new CustomEvent('locus:task-field-settled',{detail:{key:command.key}}));}
 }
 function display(field,v){
  if(v==null)return 'не задано';
  if(field==='otvetstvennyj')return (SPR.dannye.ljudi||[]).find(p=>p.id===v)?.imja||'Коллега вне текущего справочника';
  if(field==='kljuchevaja')return v?'да':'нет';
  if(field==='sprint'){const week=SPR.kalendar.razobrat_nedelju(v);return week.nomer+' / '+week.god;}
  if(field==='srok')return SPR.data(v)+'.'+String(v).slice(0,4);return String(v);
 }
 function mount(task,root,{after}){
  const state=load(task.nomer);if(!state)return ()=>{};
  const actor=API.ja,command={actor,key:key(task.nomer),raw:state.raw};
  root.inert=true;root.dataset.taskFieldPending='1';root.setAttribute('aria-busy','false');
  const header=root.closest('.vyb-fon')?.querySelector('.vyb-g');if(header){header.setAttribute('aria-disabled','true');header.tabIndex=-1;}
  const panel=document.createElement('div');panel.className='pv-command';panel.dataset.taskFieldPendingPanel='1';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');
  const note=document.createElement('p');note.textContent=state.invalid?'Не удалось прочитать незавершённую правку. Проверь состояние задачи.':'Результат правки ещё не подтверждён. Проверка только прочитает сохранённые данные.';
  panel.append(note);
  if(!state.invalid){const wanted=document.createElement('p');wanted.textContent='Твой вариант, '+fields[state.record.field]+': '+display(state.record.field,state.record.value);panel.append(wanted);}
  const current=document.createElement('p'),actions=document.createElement('div');actions.className='pv-command-actions';
  const check=document.createElement('button');check.type='button';check.className='kn';check.textContent='проверить сохранение';check.dataset.taskFieldCheck='1';
  const keep=document.createElement('button');keep.type='button';keep.className='kn';keep.textContent='оставить текущее состояние';keep.dataset.taskFieldKeep='1';keep.hidden=true;actions.append(check,keep);panel.append(current,actions);root.before(panel);
  const inspect=async accept=>{
   if(busy.has(command.key)||writing.has(command.key))return;busy.add(command.key);check.disabled=keep.disabled=true;
   try{
    const row=await request('GET',task.nomer,undefined,task.den_vybora);if(!row.notFound)checked(row,task.nomer);
    if(API.ja!==actor||sessionStorage.getItem(command.key)!==command.raw)throw fail('Правка или доступ изменились');
    if(accept||!state.invalid&&matches(row,state.record)){clear(command);await after();O.tost('Текущее состояние задачи загружено');return;}
    note.textContent='Сейчас сохранены другие данные. Повторной записи не было.';
    current.textContent=row.notFound?'Задача не найдена':row.udaleno?'Задача сейчас в корзине':state.invalid?'Текущее состояние прочитано. Можно снять повреждённую правку.':'Сейчас в системе, '+fields[state.record.field]+': '+display(state.record.field,currentValue(row,state.record.field));keep.hidden=false;
   }catch{note.textContent='Не удалось проверить сохранение. Правка осталась в браузере; повтори проверку.';}
   finally{busy.delete(command.key);check.disabled=keep.disabled=false;}
  };
  const settled=event=>{if(event.detail?.key!==command.key)return;check.disabled=keep.disabled=writing.has(command.key);try{if(API.ja===actor&&sessionStorage.getItem(command.key)===null)after().catch(()=>{note.textContent='Сохранение завершено. Обнови карточку, чтобы увидеть результат.';});}catch{}};
  document.addEventListener('locus:task-field-settled',settled);check.disabled=keep.disabled=writing.has(command.key);
  check.onclick=()=>inspect(false);keep.onclick=()=>inspect(true);notices();return ()=>{document.removeEventListener('locus:task-field-settled',settled);panel.remove();};
 }
 function notices(){
  document.querySelectorAll('[data-task-field-note]').forEach(n=>n.remove());O.pendingCommandNote(null,'task-field-note-clean');
  try{
   const numbers=[];for(let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i);if(k?.startsWith(prefix())){const tail=k.slice(prefix().length);if(/^\d+$/.test(tail)&&Number.isSafeInteger(Number(tail))&&Number(tail)>0)numbers.push(Number(tail));}}
   for(const number of numbers){const node=document.createElement('div');node.className='task-creation-form-note';node.dataset.taskFieldNote='1';const text=document.createElement('span');text.textContent='У задачи '+number+' есть неподтверждённая правка.';const open=document.createElement('button');open.type='button';open.className='kn';open.textContent='проверить';open.onclick=()=>O.otkrytZadachu(number).catch(()=>O.tost('Не удалось открыть задачу'));node.append(text,open);O.pendingCommandNote(node,'task-field-note-'+API.ja+'-'+number);}
  }catch{}
 }
 window.LocusTaskEdit={save,clear,mount,notices};
})();
