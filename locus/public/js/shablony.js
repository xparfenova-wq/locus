(() => {
 'use strict';
 const prefix=()=>`locus-template-intent:${API.ja}:`,busy=new Set(),draftPrefix=()=>`locus-template-draft:${API.ja}:`;
 const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
 const button=(text,action,marker)=>{const b=document.createElement('button');b.type='button';b.className='kn ostavit-vnutri';b.textContent=text;if(marker)b.dataset[marker]='1';b.addEventListener('click',action);return b;};
 const validBody=b=>b&&typeof b==='object'&&!Array.isArray(b);
 const dueNames={konec_nedeli:'конец этой недели',konec_sledujuschej_nedeli:'конец следующей недели'},dueKind=v=>v==null?'none':dueNames[v]?v:'days';
 function store(record){const text=JSON.stringify(record);sessionStorage.setItem(prefix()+record.key,text);if(sessionStorage.getItem(prefix()+record.key)!==text)throw new Error('Не удалось сохранить проверку в браузере. Оставь форму открытой.');notices();}
 function discard(key){sessionStorage.removeItem(prefix()+key);notices();}
 function records(){
  const result=[];for(let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i);if(!k?.startsWith(prefix()))continue;const key=k.slice(prefix().length);if(!uuid(key))continue;let r;try{r=JSON.parse(sessionStorage.getItem(k));}catch{}
   result.push(r?.actor===API.ja&&r.key===key?{...r}:{actor:API.ja,key,phase:'corrupt',kind:'create'});
  }return result;
 }
 async function request(method,route,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,route,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
 function confirmed(row,actor=API.ja){if(!row||!Number.isSafeInteger(row.id)||row.id<1||!Number.isSafeInteger(row.versija)||row.versija<1||typeof row.nazvanie!=='string'||!Array.isArray(row.podzadachi_spisok)||row.avtor!==actor)throw new Error('Сохранение шаблона не подтверждено');return row;}
 async function refresh(after,row){if(after)await after(row);else document.dispatchEvent(new CustomEvent('locus:templates-changed'));}
 function clearDraft(record){if(typeof record.draftKey==='string'&&record.draftKey.startsWith(draftPrefix()))sessionStorage.removeItem(record.draftKey);}
 async function finish(record,row,close,after){confirmed(row,record.actor);discard(record.key);clearDraft(record);close?.();O.tost('Шаблон «'+row.nazvanie+'» сохранён');try{await refresh(after,row);}catch{O.tost('Шаблон сохранён. Обнови список, чтобы увидеть его.');}return row;}
 async function send(record,close,after){
  if(busy.has(record.key))return;busy.add(record.key);notices();
  try{store({...record,phase:'unknown'});const row=await request('POST',record.route,{...record.body,zapros_kljuch:record.key});return await finish(record,confirmed(row),close,after);}
  catch(error){if(error.kod>=400&&error.kod<500&&![401,409].includes(error.kod)){discard(record.key);error.definitive=true;}throw error;}
  finally{busy.delete(record.key);notices();}
 }
 function notices(){
  let rows;try{rows=records();}catch{return;}const id='template-command-note';if(!rows.length){O.pendingCommandNote(null,id);return;}
  const note=document.createElement('aside');note.id=id;note.className='locus-session-note';note.setAttribute('role','status');
  const label=document.createElement('span');label.textContent=rows.length===1?'Шаблон: есть непроверенное сохранение':'Непроверенных сохранений шаблонов: '+rows.length;
  const action=button('проверить сохранение',()=>recover(rows[0]),'templatePendingCheck');action.disabled=busy.has(rows[0].key);note.append(label,action);O.pendingCommandNote(note,id);
 }
 function recover(record,{after}={}){
  const esc=O.ekranirovat;let close=O.modalka('Проверить сохранение шаблона','<div class="tpl-recovery"><p data-tpl-recovery-status role="status">Проверка не повторяет запись.</p><div data-tpl-recovery-draft></div><div class="tpl-actions" data-tpl-recovery-actions></div></div>');
  const root=document.querySelector('.vyb-fon:last-of-type'),status=root.querySelector('[data-tpl-recovery-status]'),actions=root.querySelector('[data-tpl-recovery-actions]'),detail=root.querySelector('[data-tpl-recovery-draft]');
  if(validBody(record.body)){detail.textContent=[record.body.nazvanie,record.body.srok_po_umolchaniju!=null?'Срок: '+(dueNames[record.body.srok_po_umolchaniju]||record.body.srok_po_umolchaniju+' дн.'):null,Array.isArray(record.body.podzadachi)?'Подзадач: '+record.body.podzadachi.length:null].filter(Boolean).join('. ');}
  const routeOk=typeof record.route==='string'&&/^\/shablony(?:\/(?:\d+|[a-z_]+)\/(?:dubl)|\/iz_zadachi)?$/.test(record.route);
  const controls=()=>root.querySelectorAll('button').forEach(b=>b.disabled=busy.has(record.key));
  const rebuild=state=>{
   actions.replaceChildren();const check=button('проверить',()=>inspect(),'templateRecoveryRead');actions.append(check);
   if(record.kind==='edit'||record.kind==='delete'){
    if(state==='present'&&validBody(record.body))actions.append(button('повторить с прочитанной версией',()=>retryMutation(),'templateRecoveryRetry'));
   }else{
    if(state==='ne_najdeno'&&routeOk&&validBody(record.body))actions.append(button('повторить добавление',()=>retry(),'templateRecoveryRetry'));
    actions.append(button('отменить добавление',()=>cancel(),'templateRecoveryCancel'));
   }controls();
  };
  async function inspect(){
   if(busy.has(record.key))return;busy.add(record.key);controls();status.textContent='Проверяю сохранение';
   try{
    if(record.kind==='edit'||record.kind==='delete'){
     let row;try{row=await request('GET','/shablony/'+record.id);}catch(error){if(error.kod===404&&record.kind==='delete'&&record.owner===record.actor){discard(record.key);status.textContent='Шаблон удалён. Созданные по нему задачи сохранены.';actions.replaceChildren();await refresh(after);return;}throw error;}
     if(record.kind==='edit'&&validBody(record.body)&&Object.entries(record.body).filter(([k])=>k!=='versija').every(([k,v])=>JSON.stringify(k==='podzadachi'?row.podzadachi_spisok:row[k])===JSON.stringify(v))){discard(record.key);status.textContent='В шаблоне сохранены введённые значения.';actions.replaceChildren(button('открыть шаблон',()=>{close();open(row,{after});}));await refresh(after,row);return;}
     status.textContent='Сейчас: «'+row.nazvanie+'», версия '+row.versija+'. Твои поля сохранены в браузере. Повтор использует прежнюю версию и не затирает конфликт.';rebuild('present');return;
    }
    const result=await request('GET','/shablony?zapros_kljuch='+encodeURIComponent(record.key));
    if(result.sostojanie==='sozdano'){const row=confirmed(result.shablon,record.actor);discard(record.key);clearDraft(record);status.textContent='Шаблон «'+row.nazvanie+'» сохранён.';actions.replaceChildren(button('открыть шаблон',()=>{close();open(row,{after});}));await refresh(after,row);}
    else if(['otmeneno','udaleno','perenesen'].includes(result.sostojanie)){discard(record.key);status.textContent=result.sostojanie==='otmeneno'?'Добавление отменено. Поздний запрос не создаст шаблон.':'Шаблон уже был создан, затем удалён или перемещён. Повтор не создаёт его заново.';actions.replaceChildren();}
    else if(result.sostojanie==='ne_najdeno'){status.textContent='Добавление не найдено. Можно явно повторить тот же запрос или отменить его.';rebuild('ne_najdeno');}
    else throw new Error('Проверка не подтвердила результат');
   }catch(error){status.textContent='Проверка не завершена. '+error.message;rebuild();}finally{busy.delete(record.key);controls();notices();}
  }
  async function retry(){try{const row=await send(record,close,after);if(row)open(row,{after});}catch(error){status.textContent=error.message;rebuild();}}
  async function cancel(){if(busy.has(record.key))return;busy.add(record.key);controls();try{const r=await request('POST','/shablony',{zapros_kljuch:record.key,otmenit_dobavlenie:true});if(r.sostojanie==='sozdano'){confirmed(r.shablon,record.actor);discard(record.key);status.textContent='Шаблон уже создан; он сохранён, отмена добавления его не удаляет.';await refresh(after,r.shablon);}else if(r.sostojanie==='otmeneno'){discard(record.key);status.textContent='Добавление отменено. Поздний запрос заблокирован.';}else throw new Error('Отмена не подтверждена');actions.replaceChildren();}catch(error){status.textContent='Отмена ещё не подтверждена. '+error.message;rebuild();}finally{busy.delete(record.key);controls();notices();}}
  async function retryMutation(){if(busy.has(record.key))return;busy.add(record.key);controls();try{await request(record.kind==='edit'?'PATCH':'DELETE','/shablony/'+record.id,record.body);busy.delete(record.key);await inspect();}catch(error){status.textContent=error.kod===409?'Шаблон изменился. Твой черновик сохранён. Открой карточку и сравни правки.':error.message;rebuild();}finally{busy.delete(record.key);controls();}}
  rebuild();if(!busy.has(record.key))void inspect();
 }
 function open(row=null,{after,defaults,task}={}){
  const actor=API.ja,edit=!row||row.mozhno_pravit===true,original=row?structuredClone(row):null,blank={nazvanie:'',tip:'vnutrennjaja',opisanie:'',srok_po_umolchaniju:'1',schitat_fakt:'net',obschij:false,podzadachi:[]};
  let model={...blank,...(row?{...row,podzadachi:[...(row.podzadachi_spisok||[])]}:defaults||{})},pending=null,working=false,staleDraft=null;
  if(row)model.srok_po_umolchaniju=row.default_due??row.srok_po_umolchaniju;
  const draftKey=draftPrefix()+(row?.id||'new');let restored=false;
  if(edit)try{const value=JSON.parse(sessionStorage.getItem(draftKey));if(value?.actor===actor&&value.body){if(!row||value.version===row.versija){model={...model,...value.body};restored=true;}else staleDraft=value;}}catch{}
  let dueMode=dueKind(model.srok_po_umolchaniju);
  const esc=O.ekranirovat,types=(window.SPRAV?.tipy||window.DANNYE?.tipy||[{kod:'vnutrennjaja',imja:'внутренняя'},{kod:'klientskaja',imja:'клиентская'},{kod:'biznesovaja',imja:'бизнесовая'},{kod:'produktovaja',imja:'продуктовая'},{kod:'kasanie',imja:'касание'}]);
  const title=row?'Шаблон «'+esc(row.nazvanie)+'»':'Новый шаблон';let close=O.modalka(title,`<div class="tpl-form" data-template-form><label>название<input id="tpl-name" maxlength="2000" autocomplete="off" value="${esc(model.nazvanie)}"><span class="tpl-name-error" data-tpl-name-error role="alert" hidden></span></label><div class="tpl-label">тип задачи</div><div class="tpl-types">${types.map(t=>`<button class="kn" type="button" data-tpl-type="${esc(t.kod)}" aria-pressed="${t.kod===model.tip}">${esc(t.imja||t.nazvanie||t.kod)}</button>`).join('')}</div><label>описание<textarea id="tpl-description" rows="4">${esc(model.opisanie||'')}</textarea></label><div class="tpl-label">срок по умолчанию</div><div class="tpl-types">${[['days','число дней'],['none','без срока'],['konec_nedeli','конец этой недели'],['konec_sledujuschej_nedeli','конец следующей недели']].map(([key,text])=>`<button type="button" class="kn" data-tpl-due="${key}" aria-pressed="${key===dueMode}">${text}</button>`).join('')}</div><label data-tpl-days-label>дней<input id="tpl-days" type="number" min="0" max="36500" step="1" value="${esc(dueMode==='days'?model.srok_po_umolchaniju??'':'')}" placeholder="без срока"></label><div class="tpl-label">что считать фактом</div><div class="tpl-facts">${[['net','ничего'],['kontakty_bazy','контакты базы'],['otpravleno','отправлено']].map(([key,text])=>`<button class="kn" type="button" data-tpl-fact="${key}" aria-pressed="${key===model.schitat_fakt}">${text}</button>`).join('')}</div><label class="tpl-share"><input id="tpl-shared" type="checkbox"${model.obschij?' checked':''}>открыть команде</label><div class="tpl-label">подзадачи</div><div data-tpl-steps></div><div class="tpl-step-add"><input id="tpl-new-step" maxlength="2000" aria-label="название новой подзадачи"><button type="button" class="kn" data-tpl-add-step>добавить подзадачу</button></div><p class="tpl-status" role="status" data-tpl-status>${restored?'Черновик восстановлен.':''}</p><div class="tpl-actions" data-tpl-actions></div></div>`,null,{poverh:true});
  const host=document.querySelector('.vyb-fon:last-of-type');host.classList.add('template-dialog');const form=host.querySelector('[data-template-form]'),q=s=>form.querySelector(s),status=q('[data-tpl-status]'),actions=q('[data-tpl-actions]');
  const body=()=>({nazvanie:q('#tpl-name').value.trim(),tip:model.tip,opisanie:q('#tpl-description').value||null,srok_po_umolchaniju:dueMode==='none'?null:dueMode==='days'?(q('#tpl-days').value===''?null:String(Number(q('#tpl-days').value))):dueMode,schitat_fakt:model.schitat_fakt,obschij:q('#tpl-shared').checked,podzadachi:[...q('[data-tpl-steps]').querySelectorAll('input')].map(e=>e.value.trim())});
  const saveDraft=()=>{if(!edit||working)return;try{sessionStorage.setItem(draftKey,JSON.stringify({actor,version:row?.versija,body:body()}));}catch{status.textContent='Черновик не удалось сохранить в браузере. Оставь форму открытой.';}};
  const freeze=()=>{form.setAttribute('aria-busy',String(working));for(const e of form.querySelectorAll('input,textarea,button'))e.disabled=working||e.dataset.tplBoundary==='1'||!!pending&&!e.closest('[data-tpl-status]')||!edit&&!e.closest('[data-tpl-actions]');};
  function drawDue(){q('[data-tpl-days-label]').hidden=dueMode!=='days';for(const b of form.querySelectorAll('[data-tpl-due]'))b.setAttribute('aria-pressed',String(b.dataset.tplDue===dueMode));}
  function drawSteps(){const area=q('[data-tpl-steps]');area.replaceChildren();model.podzadachi.forEach((text,index)=>{const line=document.createElement('div');line.className='tpl-step';const input=document.createElement('input');input.value=text;input.maxLength=2000;input.setAttribute('aria-label','подзадача '+(index+1));input.addEventListener('input',()=>{model.podzadachi[index]=input.value;saveDraft();});line.append(input);if(edit){for(const [label,delta]of [['выше',-1],['ниже',1]]){const b=button(label,()=>{[model.podzadachi[index],model.podzadachi[index+delta]]=[model.podzadachi[index+delta],model.podzadachi[index]];drawSteps();saveDraft();});b.dataset.tplBoundary=index+delta<0||index+delta>=model.podzadachi.length?'1':'0';line.append(b);}line.append(button('убрать',()=>{model.podzadachi.splice(index,1);drawSteps();saveDraft();}));}area.append(line);});freeze();}
  drawDue();drawSteps();if(!edit)q('.tpl-step-add').hidden=true;
  q('#tpl-name').addEventListener('input',()=>{if(O.estNazvanieZadachi(q('#tpl-name').value))q('[data-tpl-name-error]').hidden=true;});
  form.addEventListener('input',saveDraft);form.addEventListener('change',saveDraft);
  for(const b of form.querySelectorAll('[data-tpl-type],[data-tpl-fact]'))b.onclick=()=>{const key=b.hasAttribute('data-tpl-type')?'tip':'schitat_fakt',attr=key==='tip'?'data-tpl-type':'data-tpl-fact';model[key]=b.getAttribute(attr);for(const x of form.querySelectorAll('['+attr+']'))x.setAttribute('aria-pressed',String(x===b));saveDraft();};
  for(const b of form.querySelectorAll('[data-tpl-due]'))b.onclick=()=>{dueMode=b.dataset.tplDue;drawDue();saveDraft();};
  const addStep=()=>{const input=q('#tpl-new-step');if(!input.value.trim())return;model.podzadachi.push(input.value.trim());input.value='';drawSteps();saveDraft();input.focus();};q('[data-tpl-add-step]').onclick=addStep;q('#tpl-new-step').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addStep();}};
  if(staleDraft){status.textContent='Есть твой черновик прежней версии. Сейчас показаны сохранённые поля.';status.append(button('сравнить с моими правками',()=>{
   const labels={nazvanie:'название',opisanie:'описание',tip:'тип',srok_po_umolchaniju:'срок, дней',schitat_fakt:'что считать',obschij:'открыт команде',podzadachi:'подзадачи'},render=v=>Array.isArray(v)?v.join('\n'):v===true?'да':v===false?'нет':dueNames[v]||String(v??'без значения');
   const compareClose=O.modalka('Сравнить шаблон','<div class="tpl-compare" data-tpl-compare></div><div class="tpl-actions" data-tpl-compare-actions></div>',null,{poverh:true}),comparison=document.querySelector('.vyb-fon:last-of-type');
   for(const [key,label]of Object.entries(labels)){const block=document.createElement('section'),heading=document.createElement('strong'),actual=document.createElement('p'),mine=document.createElement('p');heading.textContent=label;actual.textContent='Сохранено: '+render(key==='podzadachi'?row.podzadachi_spisok:row[key]);mine.textContent='Мои правки: '+render(staleDraft.body[key]);block.append(heading,actual,mine);comparison.querySelector('[data-tpl-compare]').append(block);}
   comparison.querySelector('[data-tpl-compare-actions]').append(button('вернуться',compareClose),button('загрузить мои правки в форму',()=>{const d=staleDraft.body;model={...model,...d};q('#tpl-name').value=d.nazvanie||'';q('#tpl-description').value=d.opisanie||'';dueMode=dueKind(d.srok_po_umolchaniju);q('#tpl-days').value=dueMode==='days'?d.srok_po_umolchaniju??'':'';drawDue();q('#tpl-shared').checked=!!d.obschij;for(const b of form.querySelectorAll('[data-tpl-type]'))b.setAttribute('aria-pressed',String(b.dataset.tplType===model.tip));for(const b of form.querySelectorAll('[data-tpl-fact]'))b.setAttribute('aria-pressed',String(b.dataset.tplFact===model.schitat_fakt));staleDraft=null;drawSteps();saveDraft();compareClose();status.textContent='Твои правки загружены после сравнения. Сохранение отдельной кнопкой.';}));
  }));}
  if(edit)actions.append(button(row?'сохранить':'создать шаблон',async()=>{
   if(working)return;const input=body();if(!O.estNazvanieZadachi(input.nazvanie)){const error=q('[data-tpl-name-error]');error.hidden=false;error.textContent='Без названия шаблон не сохранить';q('#tpl-name').focus();return;}if(dueMode==='days'&&!q('#tpl-days').checkValidity()){status.textContent='Срок: целое число дней от 0 до 36500';return;}if(input.podzadachi.length>200){status.textContent='В шаблоне может быть до 200 подзадач';return;}if(input.podzadachi.some(s=>!O.estNazvanieZadachi(s))){status.textContent='Напиши название каждой подзадачи или убери пустую строку';return;}
   saveDraft();pending={actor,key:crypto.randomUUID(),route:'/shablony',kind:row?'edit':'create',id:row?.id,draftKey,body:row?{...input,versija:row.versija}:input,phase:'unknown'};
   try{store(pending);}catch(error){status.textContent=error.message;pending=null;return;}working=true;freeze();
   try{
    if(row){busy.add(pending.key);const result=await request('PATCH','/shablony/'+row.id,pending.body);if(result?.id!==row.id||!Array.isArray(result.podzadachi_spisok))throw new Error('Правка не подтверждена');discard(pending.key);sessionStorage.removeItem(draftKey);close();await refresh(after,result);O.tost('Шаблон сохранён');}
    else await send(pending,close,after);
   }catch(error){if(error.definitive||[400,403,404,405,410,422].includes(error.kod)||error.kod===409&&error.telo?.oshibka==='shablon_est'){if(pending)discard(pending.key);pending=null;}status.textContent=error.kod===409?'Шаблон изменился или такое название уже есть. Твои поля сохранены.':error.message;if(error.telo?.predlozhennoe_nazvanie){const proposed=error.telo.predlozhennoe_nazvanie;status.append(button('сохранить как «'+proposed+'»',()=>{q('#tpl-name').value=proposed;saveDraft();if(pending){discard(pending.key);pending=null;}actions.querySelector('[data-template-save]')?.click();}));if(error.telo.id)status.append(button('открыть существующий',async()=>{const item=await request('GET','/shablony/'+error.telo.id);close();open(item,{after});}));}
    if(row&&error.kod===409&&error.telo?.tekuschee){if(pending){discard(pending.key);pending.phase='conflict';}status.append(button('сравнить с сохранённой версией',async()=>{try{const latest=await request('GET','/shablony/'+row.id);close();open(latest,{after});}catch(e){status.append(document.createTextNode(' '+e.message));}},'templateConflictCompare'));}
    if(pending&&!error.definitive&&pending.phase!=='conflict')status.append(button('проверить сохранение',()=>recover(pending,{after}),'templateFormCheck'));}
   finally{if(pending)busy.delete(pending.key);working=false;freeze();notices();}
  },'templateSave'));
  if(row){
   actions.append(button('дублировать себе',async()=>{if(working)return;working=true;const record={actor,key:crypto.randomUUID(),kind:'create',route:'/shablony/'+row.id+'/dubl',body:{},phase:'unknown'};pending=record;freeze();try{const copy=await send(record,close,after);if(copy)open(copy,{after});}catch(error){status.textContent=error.message;status.append(button('проверить дублирование',()=>recover(record,{after})));}finally{working=false;freeze();}}));
   actions.append(button('создать задачу по шаблону',()=>{close();O.formaZadachiModalka({shablon:String(row.id)});},'templateApply'));
   if(row.mozhno_udalit)actions.append(button('удалить',()=>{
    let cancel=O.modalka('Удалить шаблон?',`<p>«${esc(row.nazvanie)}». Созданных по нему задач: ${Number(row.zadach_sozdano)||0}. Все они останутся.</p><div class="tpl-actions" data-tpl-delete-actions></div><p role="status" data-tpl-delete-status></p>`,null,{poverh:true});const modal=document.querySelector('.vyb-fon:last-of-type'),area=modal.querySelector('[data-tpl-delete-actions]');area.append(button('отмена',cancel));let deleting=false;area.append(button('удалить шаблон',async()=>{if(deleting)return;const record={actor,key:crypto.randomUUID(),id:row.id,owner:row.avtor,kind:'delete',body:{versija:row.versija},phase:'unknown'};try{store(record);}catch(e){modal.querySelector('[data-tpl-delete-status]').textContent=e.message;return;}deleting=true;area.querySelectorAll('button').forEach(b=>b.disabled=true);busy.add(record.key);try{await request('DELETE','/shablony/'+row.id,record.body);discard(record.key);sessionStorage.removeItem(draftKey);cancel();close();await refresh(after);O.tost('Шаблон удалён, задачи сохранены');}catch(error){const status=modal.querySelector('[data-tpl-delete-status]');status.textContent=error.message;status.append(button('проверить удаление',()=>recover(record,{after})));}finally{busy.delete(record.key);deleting=false;area.querySelectorAll('button').forEach(b=>b.disabled=false);notices();}},'templateDeleteConfirm'));
   },'templateDelete'));
   if(row.gotovyj)status.textContent='Готовый шаблон можно дублировать и править копию.';else if(!row.mozhno_pravit)status.textContent='Шаблон '+(row.avtor_imja||'другого участника')+'. Можно дублировать себе.';
  }
  freeze();if(edit)q('#tpl-name').focus({preventScroll:true});return {close,root:host};
 }
 const taskBusy=new Set();
 async function fromTask(task){
  if(taskBusy.has(task.nomer))return;const prior=records().find(r=>r.route==='/shablony/iz_zadachi'&&r.body?.nomer===task.nomer);if(prior){recover(prior);return;}taskBusy.add(task.nomer);
  const record={actor:API.ja,key:crypto.randomUUID(),kind:'create',route:'/shablony/iz_zadachi',body:{nomer:task.nomer},phase:'unknown'};
  try{await send(record); }catch(error){O.tost(error.message);if(!error.definitive)recover(record);}finally{taskBusy.delete(task.nomer);}
 }
 window.LocusTemplates={open,recover,notices,fromTask};notices();
})();
