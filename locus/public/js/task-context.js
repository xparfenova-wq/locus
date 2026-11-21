(() => {
 'use strict';
 const API=window.API,O=window.O,model=window.LocusTaskContextModel;
 const labels={napravlenie:'направление',tip:'тип',klient_id:'клиент',proekt_id:'проект',sotrudnichestvo_id:'сотрудничество',cel_id:'цель ОКР',rezultat_id:'результат',plan_chislo:'целевое число',sprint:'спринт',god_sprinta:'год спринта',data:'плановая дата',srok:'срок'};
 const types={klientskaja:'клиентская',produktovaja:'продуктовая',biznesovaja:'бизнесовая',vnutrennjaja:'внутренняя',kasanie:'касание'};
 const roles={klient:'клиент',lid:'лид',partner:'партнёр',podrjadchik:'подрядчик',referal:'реферал'};
 const prefix=()=>`locus-task-context-v1:${API.ja}:`,draftKey=n=>prefix()+'draft:'+n,pendingKey=n=>prefix()+'pending:'+n;
 const states=new Map(),state=n=>{if(!states.has(n))states.set(n,{busy:false});return states.get(n);};
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const button=(text,marker,fn)=>{const el=node('button',text,'kn');el.type='button';el.dataset[marker]='1';el.onclick=fn;return el;};
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
 function put(key,value){const raw=JSON.stringify(value);sessionStorage.setItem(key,raw);if(sessionStorage.getItem(key)!==raw)throw new Error('Не удалось сохранить черновик. Оставь окно открытым');}
 function remove(key){sessionStorage.removeItem(key);if(sessionStorage.getItem(key)!==null)throw new Error('Не удалось обновить черновик. Проверь сохранение ещё раз');}
 function pending(number){
  const raw=sessionStorage.getItem(pendingKey(number));if(!raw)return null;let r;try{r=JSON.parse(raw);}catch{}
  if(!r||r.actor!==API.ja||r.number!==number||!Number.isSafeInteger(r.id)||r.id<1||!uuid(r.key)||!['edit','undo'].includes(r.kind)||!r.body||r.body.zapros_kljuch!==r.key)throw new Error('Не удалось прочитать незавершённую правку. Сначала проверь её');return r;
 }
 async function request(method,route,body){const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{return await API.zapros(method,route,body,{signal:c.signal});}finally{clearTimeout(timer);}}
 const route=(n,action)=>'/zadachi/'+Number(n)+'/'+action;
 const check=r=>request('GET',route(r.number,'kontekst_proverka')+'?'+new URLSearchParams({zapros_kljuch:r.key}));
 function verified(r,value){if(value?.avtor_id!==API.ja||value.nomer!==r.number||value.obekt!=='kontekst_zadachi'||!['ne_najdeno','otmeneno','udaleno','sohraneno','vozvrascheno'].includes(value.sostojanie))throw new Error('Ответ не подтвердил эту правку');if(value.sostojanie==='sohraneno'&&(value.zadacha_id!==r.id||value.zadacha?.id!==r.id||value.zadacha?.nomer!==r.number||value.dejstvie!==(r.kind==='undo'?'otmena':'pravka')))throw new Error('Ответ относится к другому действию');return value;}
 async function changed(result,after){document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena',{detail:{nomer:result.nomer}}));if(after&&result.zadacha)await after(result.zadacha);}
 function notices(){
  for(const form of document.querySelectorAll('[data-task-context-root]'))form.locusContextUpdate?.();
  let record=null,error=null;
  try{for(let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i);if(k?.startsWith(prefix()+'pending:')){record=pending(Number(k.slice((prefix()+'pending:').length)));break;}}}catch(e){error=e;}
  if(!record&&!error){O.pendingCommandNote(null,'task-context-command-note');return;}
  const aside=node('aside',undefined,'locus-session-note');aside.id='task-context-command-note';aside.setAttribute('role','status');aside.append(node('span',error?error.message:'Есть неподтверждённая правка задачи №'+record.number));
  if(record)aside.append(button('проверить сохранение','taskContextPending',()=>recover(record).catch(e=>O.tost(e.message))));O.pendingCommandNote(aside,aside.id);
 }
 async function finish(record,result,{close,after}={}){
  verified(record,result);
  if(result.sostojanie==='sohraneno'||result.sostojanie==='vozvrascheno'){
   remove(pendingKey(record.number));if(record.kind==='edit')remove(draftKey(record.number));notices();close?.();await changed(result,after);
   O.tost(result.sostojanie==='vozvrascheno'?'Эта правка уже отменена':record.kind==='undo'?'Прежние поля задачи возвращены':'Параметры задачи сохранены',record.kind==='edit'&&result.sostojanie==='sohraneno'?()=>undo(record,{after}).catch(e=>O.tost(e.message)):undefined);return true;
  }
  if(result.sostojanie==='udaleno'){remove(pendingKey(record.number));notices();close?.();O.tost('Задача удалена. Черновик правки сохранён');return true;}
  return false;
 }
 async function send(record){return request('POST',route(record.number,record.kind==='undo'?'kontekst_otmenit':'kontekst'),record.body);}
 async function undo(original,{after}={}){
  if(pending(original.number))throw new Error('Сначала проверь незавершённую правку этой задачи');
  const key=crypto.randomUUID(),record={actor:API.ja,id:original.id,number:original.number,kind:'undo',key,body:{zapros_kljuch:key,pravka_kljuch:original.key}};
  put(pendingKey(record.number),record);notices();
  try{await finish(record,await send(record),{after});}
  catch(error){if([400,403,404,409,422].includes(error.kod)){const result=verified(record,await request('POST',route(record.number,'kontekst_otmena_popytki'),{zapros_kljuch:record.key}));if(result.sostojanie==='otmeneno'){remove(pendingKey(record.number));notices();throw error;}}await recover(record,{after});}
 }
 async function recover(record,{after}={}){
  const close=O.modalka(record.kind==='undo'?'Проверка возврата полей':'Проверка сохранения задачи','<div class="task-context-recovery"></div>',null,{poverh:true});
  const root=[...document.querySelectorAll('.vyb-fon')].at(-1),box=root.querySelector('.task-context-recovery'),status=node('p','Проверяю сохранение…'),actions=node('div',undefined,'pending-command-actions');box.append(status,actions);
  async function refresh(){
   actions.replaceChildren();status.textContent='Проверяю сохранение…';
   try{
    const result=verified(record,await check(record));if(await finish(record,result,{close,after}))return;
    if(result.sostojanie==='otmeneno'){remove(pendingKey(record.number));notices();close();O.tost('Попытка отменена. Черновик сохранён');return;}
    status.textContent='Сохранение пока не найдено. Повтор возможен только по твоему выбору';
    actions.append(button(record.kind==='undo'?'повторить отмену':'повторить сохранение','taskContextRetry',async()=>{actions.replaceChildren();status.textContent='Отправляю тот же запрос…';try{await finish(record,await send(record),{close,after});}catch(e){status.textContent=e.message;actions.replaceChildren(button('проверить ещё раз','taskContextCheck',refresh));}}));
    actions.append(button('отменить попытку','taskContextCancelAttempt',async()=>{actions.replaceChildren();try{const r=verified(record,await request('POST',route(record.number,'kontekst_otmena_popytki'),{zapros_kljuch:record.key}));if(r.sostojanie==='otmeneno'){remove(pendingKey(record.number));notices();close();O.tost('Попытка отменена. Черновик сохранён');}else await finish(record,r,{close,after});}catch(e){status.textContent=e.message;actions.append(button('проверить ещё раз','taskContextCheck',refresh));}}));
   }catch(e){status.textContent='Проверка не завершилась: '+e.message;actions.replaceChildren(button('проверить ещё раз','taskContextCheck',refresh));}
  }
  await refresh();return {close,root};
 }
 function label(field,value,info){
  if(value==null||value==='')return 'без связи';const c=info.spravochniki;
  const table={napravlenie:c.napravlenija,klient_id:c.ljudi,proekt_id:c.proekty,sotrudnichestvo_id:c.sotrudnichestva,cel_id:c.celi,rezultat_id:c.rezultaty}[field];
  if(field==='tip')return types[value]||String(value);if(table){const r=table.find(r=>(r.id??r.kod)===value);return r?.nazvanie||r?.imja||(field==='sotrudnichestvo_id'&&r?roles[r.rol]||r.rol:'связь №'+value);}return String(value);
 }
 async function open(number,{after}={}){
  number=Number(number);if(state(number).busy)return;const waiting=pending(number);if(waiting)return recover(waiting,{after});
  const close=O.modalka('Параметры задачи','<div class="task-context-host"></div>',null,{poverh:true});
  const root=[...document.querySelectorAll('.vyb-fon')].at(-1);root.classList.add('task-context-modal');root.dataset.taskContextRoot='1';const host=root.querySelector('.task-context-host');
  let info,record,save,conflict=false,storageError=null;
  const status=node('p','Загружаю сохранённые поля…','task-context-status');status.setAttribute('role','status');host.append(status);
  const saveDraft=()=>{try{put(draftKey(number),record);storageError=null;}catch(e){storageError=e.message;}update();};
  const update=()=>{if(!save)return;const errors=model.errors(record,info),blocked=state(number).busy||!!pending(number);for(const el of host.querySelectorAll('[data-task-context-error]'))el.textContent=errors[el.dataset.taskContextError]||'';save.disabled=blocked||conflict||!!storageError||Object.keys(errors).length>0||model.changed(record).length===0;for(const el of host.querySelectorAll('input,select'))el.disabled=blocked||info.zablokirovany.includes(el.dataset.taskContextField);const dateInput=host.querySelector('[data-task-context-field="data"]');if(dateInput){try{const week=window.LOCUS_NEDELI.razobrat_nedelju(record.values.sprint,record.values.god_sprinta);dateInput.min=week.nachalo;dateInput.max=week.konec;}catch{dateInput.removeAttribute('min');dateInput.removeAttribute('max');}}if(storageError)status.textContent=storageError;};
  root.locusContextUpdate=update;
  function selectField(form,field,rows,empty){
   const wrap=node('label',undefined,'l-field'),caption=node('span',labels[field],'l-label'),select=node('select');select.dataset.taskContextField=field;select.className='l-select';select.setAttribute('aria-label',labels[field]);
   if(empty){const option=node('option',empty);option.value='';select.append(option);}
   const value=record.values[field];
   if(value!=null&&value!==''&&!rows.some(r=>r.id===value)){const option=node('option',label(field,value,info)+' · проверь связь');option.value=String(value);select.append(option);}
   for(const row of rows){const option=node('option',row.name);option.value=String(row.id);if(row.disabled)option.disabled=true;select.append(option);}
   select.value=value==null?'':String(value);select.onchange=()=>{record.values[field]=select.value===''?null:['napravlenie','tip'].includes(field)?select.value:Number(select.value);if(field==='tip'&&record.base.tip==='klientskaja'&&record.values.tip!=='klientskaja')record.clientChoice=null;if(field==='klient_id')record.clientChoice=record.values.klient_id?'keep':'remove';saveDraft();draw();};
   const error=node('small',undefined,'task-context-error');error.dataset.taskContextError=field;wrap.append(caption,select,error);form.append(wrap);
  }
  function inputField(form,field,type){
   if(!Object.hasOwn(record.values,field))return;
   const wrap=node('label',undefined,'l-field'),input=node('input');input.dataset.taskContextField=field;input.type=type;input.setAttribute('aria-label',labels[field]);input.value=record.values[field]??'';if(type==='text')input.inputMode=['sprint','god_sprinta'].includes(field)?'numeric':'decimal';if(field==='data'){try{const week=window.LOCUS_NEDELI.razobrat_nedelju(record.values.sprint,record.values.god_sprinta);input.min=week.nachalo;input.max=week.konec;}catch{}}
   input.addEventListener(type==='date'?'change':'input',()=>{const raw=input.value.trim();if(['plan_chislo','sprint','god_sprinta'].includes(field)){const value=Number(raw.replace(',','.'));record.values[field]=raw===''?null:Number.isFinite(value)?value:raw;}else record.values[field]=raw||null;saveDraft();});
   const error=node('small',undefined,'task-context-error');error.dataset.taskContextError=field;wrap.append(node('span',labels[field],'l-label'),input,error);form.append(wrap);
  }
  function draw(){
   host.replaceChildren(status);const intro=node('p','Выбери тип задачи и к чему она относится. Черновик сохраняется при изменении полей.');host.append(intro);
   if(info.prichina_blokirovki)host.append(node('p',info.prichina_blokirovki,'task-context-source-note'));
   const form=node('div',undefined,'l-form task-context-form'),v=record.values,c=info.spravochniki;host.append(form);
   selectField(form,'napravlenie',c.napravlenija.filter(d=>!d.arhiv||d.kod===v.napravlenie).map(d=>({id:d.kod,name:d.nazvanie+(d.arhiv?' · архив':'' )})),null);
   selectField(form,'tip',c.tipy.map(id=>({id,name:types[id]||id})),null);
   selectField(form,'klient_id',c.ljudi.filter(p=>!p.arhiv||p.id===v.klient_id).map(p=>({id:p.id,name:p.imja+(p.arhiv?' · архив':'')})),'без клиента');
   selectField(form,'proekt_id',c.proekty.filter(p=>p.napravlenie===v.napravlenie&&(!v.klient_id||p.klient_id===v.klient_id)&&(!p.arhiv&&p.status!=='zavershen'||p.id===v.proekt_id)).map(p=>({id:p.id,name:p.nazvanie+(p.arhiv||p.status==='zavershen'?' · завершён или в архиве':'')})),'без проекта');
   selectField(form,'sotrudnichestvo_id',c.sotrudnichestva.filter(s=>s.napravlenie===v.napravlenie&&(!v.klient_id||s.chelovek_id===v.klient_id)&&(!s.arhiv||s.id===v.sotrudnichestvo_id)).map(s=>({id:s.id,name:(c.ljudi.find(p=>p.id===s.chelovek_id)?.imja||'человек №'+s.chelovek_id)+': '+(roles[s.rol]||s.rol)})),'без отдельного сотрудничества');
   selectField(form,'cel_id',c.celi.filter(g=>g.napravlenie===v.napravlenie).map(g=>({id:g.id,name:g.nazvanie+(g.sostojanie==='chernovik'?' · черновик':'')})),'без цели');
   selectField(form,'rezultat_id',c.rezultaty.filter(r=>c.celi.some(g=>g.id===r.cel_id&&g.napravlenie===v.napravlenie)&&(!v.cel_id||r.cel_id===v.cel_id)).map(r=>({id:r.id,name:r.nazvanie})),'без результата');
   inputField(form,'plan_chislo','text');if(!info.zadacha.povtorjaetsja){inputField(form,'sprint','text');inputField(form,'god_sprinta','text');inputField(form,'data','date');inputField(form,'srok','date');}
   if(record.base.tip==='klientskaja'&&v.tip!=='klientskaja'&&v.klient_id===record.base.klient_id&&v.klient_id){
    const question=node('fieldset',undefined,'task-context-client-choice');question.append(node('legend','Оставить связь с клиентом?'));
    for(const [choice,text]of [['keep','оставить клиента'],['remove','убрать прямую связь с клиентом']]){const label=node('label'),radio=node('input');radio.type='radio';radio.name='task-context-client-choice';radio.value=choice;radio.checked=record.clientChoice===choice;radio.onchange=()=>{record.clientChoice=choice;if(choice==='remove')record.values.klient_id=null;saveDraft();draw();};label.append(radio,node('span',text));question.append(label);}
    const error=node('small',undefined,'task-context-error');error.dataset.taskContextError='clientChoice';question.append(error);host.append(question);
   }
   const actions=node('div',undefined,'pending-command-actions');save=button('сохранить изменения','taskContextSave',submit);actions.append(save,button('закрыть','taskContextClose',close));host.append(actions);update();
  }
  async function compare(){
   const original=record;status.textContent='Читаю сохранённые поля…';
   try{info=await request('GET',route(number,'kontekst'));const proposal=model.compare(original,info,API.ja);conflict=true;host.replaceChildren(status);status.textContent='Задача изменилась. Выбери, какие значения оставить в черновике; запись произойдёт только после сохранения';const choices=new Map();
    for(const item of proposal.conflicts){const box=node('fieldset',undefined,'task-context-conflict');box.append(node('legend',labels[item.field]));for(const [choice,text,value]of [['current','сохранённое',item.current],['mine','мой вариант',item.mine]]){const labelNode=node('label'),radio=node('input');radio.type='radio';radio.name='context-conflict-'+item.field;radio.value=choice;if(choice==='mine'&&item.locked)radio.disabled=true;radio.onchange=()=>{choices.set(item.field,value);apply.disabled=choices.size!==proposal.conflicts.length;};labelNode.append(radio,node('span',text+': '+label(item.field,value,info)));box.append(labelNode);}host.append(box);}
    const apply=button('применить выбор к черновику','taskContextRebase',()=>{for(const [field,value]of choices)proposal.record.values[field]=value;record=proposal.record;conflict=false;status.textContent='Черновик сравнен с сохранёнными полями';saveDraft();draw();});apply.disabled=proposal.conflicts.length>0;host.append(apply,button('вернуться к моему черновику','taskContextBack',()=>{record=original;conflict=true;draw();status.textContent='Сначала сравни черновик с текущими полями';host.append(button('сравнить поля','taskContextCompare',compare));update();}));
   }catch(e){status.textContent=e.message;host.append(button('повторить чтение','taskContextCompare',compare));}
  }
  async function submit(){
   if(save.disabled)return;const key=crypto.randomUUID(),operation={actor:API.ja,id:record.id,number,kind:'edit',key,body:model.payload(record,key)};
   try{put(pendingKey(number),operation);}catch(e){status.textContent=e.message;return;}
   state(number).busy=true;notices();update();status.textContent='Сохраняю изменения…';
   try{await finish(operation,await send(operation),{close,after});}
   catch(e){
    status.textContent=e.message;
    if([400,403,404,409,422].includes(e.kod)){
     try{const result=verified(operation,await request('POST',route(number,'kontekst_otmena_popytki'),{zapros_kljuch:key}));if(result.sostojanie==='otmeneno'){remove(pendingKey(number));notices();if(e.kod===409){conflict=true;host.append(button('сравнить с сохранённым','taskContextCompare',compare));}}else await finish(operation,result,{close,after});}
     catch{host.append(button('проверить сохранение','taskContextCheck',()=>recover(operation,{after})));}
    }else host.append(button('проверить сохранение','taskContextCheck',()=>recover(operation,{after})));
   }finally{state(number).busy=false;notices();if(root.isConnected)update();}
  }
  async function load(){
   host.replaceChildren(status);
   try{
    info=await request('GET',route(number,'kontekst'));if(!root.isConnected)return;if(info.zadacha?.nomer!==number||!Array.isArray(info.polja)||!Array.isArray(info.zablokirovany))throw new Error('Ответ не подтвердил задачу');
    let stored=null;try{stored=model.parse(sessionStorage.getItem(draftKey(number)),info,API.ja);}catch(e){storageError=e.message;}
    record=stored||model.create(info,API.ja);conflict=!!stored&&stored.context!==info.kontekst;status.textContent=conflict?'Есть изменения после открытия черновика. Сравни поля перед сохранением':stored?'Черновик восстановлен':'Изменения ещё не сохранены';draw();
    if(conflict)host.append(button('сравнить мой черновик','taskContextCompare',compare));
    if(storageError)host.append(button('использовать сохранённые поля','taskContextDiscardBroken',()=>{remove(draftKey(number));record=model.create(info,API.ja);storageError=null;conflict=false;draw();}));
   }catch(e){status.textContent='Не получилось загрузить задачу: '+e.message;host.append(button('повторить чтение','taskContextReload',load));}
  }
  await load();return {root,close};
 }
 window.LocusTaskContext={open,recover,notices,undo};notices();
})();
