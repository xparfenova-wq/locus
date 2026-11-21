(()=>{
 'use strict';const API=window.API,O=window.O,CTX=window.LocusErrorContext,automaticSent=new Map();let opened=null,memoryDraft=null;
 const actor=()=>Number(API.ja),storage=()=>`locus-error-report-v1:${actor()}`;
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const button=(text,marker,fn)=>{const b=node('button',text,'kn');b.type='button';b.dataset[marker]='1';b.onclick=fn;return b;};
 function address(){const u=new URL(location.href),q=new URLSearchParams();for(const[k,v]of u.searchParams)if(['nomer','id','cel','rezultat','period','napravlenie','vkladka','sprint','god','nedelja','den'].includes(k)&&/^[\p{L}\p{N}_.,: -]{1,80}$/u.test(v))q.append(k,v);return u.pathname+(q.size?'?'+q:'');}
 function read(){if(memoryDraft?.actor===actor())return memoryDraft;const raw=sessionStorage.getItem(storage());if(!raw)return null;const r=JSON.parse(raw);if(r.actor!==actor()||typeof r.text!=='string'||r.text.length>5000||!r.context||typeof r.context.gde!=='string'||r.pending&&(typeof r.pending.zapros_kljuch!=='string'||typeof r.pending.tekst!=='string'))throw Error('Не удалось прочитать сохранённое сообщение');return r;}
 function store(r){const raw=JSON.stringify(r);sessionStorage.setItem(storage(),raw);if(sessionStorage.getItem(storage())!==raw)throw Error('Не получилось сохранить текст в браузере');}
 function verified(body,key){if(body?.avtor_id!==actor()||body.zapros_kljuch!==key)throw Error('Ответ не подтвердил этот отчёт');return body;}
 function message(result){return result.telegram==='ok'?'Сообщение записано в журнал и доставлено в Telegram':result.telegram_retry_queued?'Отправлено, записано в журнал, в Telegram пока не ушло, повторим':result.telegram==='unknown'?'Сообщение записано в журнал. Доставка в Telegram не подтверждена':'Сообщение записано в журнал. Доставка в Telegram пока не подключена';}
 async function request(method,path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{return await API.zapros(method,path,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
 async function open(context={}){
  if(opened?.isConnected)return;let record,storageError=null,busy=false;
  try{record=read()||{actor:actor(),text:'',context:context.screen?context:CTX.capture({href:location.href,title:document.title,section:window.__razdel})};}catch(e){storageError=e.message;record={actor:actor(),text:'',context:{gde:address(),nazhimala:'',oshibka:''}};}
  if(!record.pending&&!record.text.trim()&&!storageError)record.context=context.screen?context:CTX.capture({href:location.href,title:document.title,section:window.__razdel});
  memoryDraft=record;
  const close=O.modalka('Что сломалось','<div class="error-report-root"></div>',null,{poverh:true}),root=[...document.querySelectorAll('.vyb-fon')].at(-1);opened=root;
  const box=root.querySelector('.error-report-root'),label=node('label',undefined,'l-field'),area=node('textarea',undefined,'sozd-opis');area.id='osh-tekst';area.rows=5;area.maxLength=5000;area.placeholder='опиши, что произошло';area.value=record.text;label.append(node('span','Что произошло','l-label'),area);
  const note=node('p','Приложится автоматически','osh-kontekst'),summary=node('dl',undefined,'error-report-preview');for(const item of CTX.preview(record.context)){const row=node('div');row.append(node('dt',item.label),node('dd',item.value));if(item.url)row.lastElementChild.append(node('small',item.url,'osh-kontekst'));if(item.at)row.lastElementChild.append(node('small',new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(item.at))+' МСК','osh-kontekst'));if(item.code!=null)row.lastElementChild.append(node('small','код '+item.code,'osh-kontekst'));summary.append(row);}const status=node('p',storageError||'','fch-osh'),actions=node('div',undefined,'pending-command-actions');status.id='osh-osh';status.setAttribute('role','status');box.append(label,note,summary,status,actions);
  const send=button(record.pending?'проверить сохранение':'отправить','errorReportSend',submit),cancel=button('отмена','errorReportClose',close);send.id='osh-ok';actions.append(send,cancel);
  const update=()=>{area.disabled=busy;area.readOnly=!!record.pending;send.disabled=busy||!!storageError||(!record.pending&&!area.value.trim());send.textContent=record.pending?'проверить сохранение':'отправить';cancel.textContent=record.pending?'закрыть':'отмена';};
  area.oninput=()=>{record.text=area.value;try{store(record);storageError=null;status.textContent='';}catch(e){storageError=e.message;status.textContent=e.message+' — текст остаётся на этой странице, скопируй его перед перезагрузкой';}update();};
  function accept(result){if(result.log!=='ok'){partial(result);return false;}try{sessionStorage.removeItem(storage());}catch{}memoryDraft=null;record.pending=null;record.text='';close();O.tost(message(result));return true;}
  function partial(result){
   status.textContent='Не удалось записать, скопируй текст и отправь администратору'+(result?.telegram==='ok'?'. В Telegram отчёт доставлен':'. Доставка в Telegram не подтверждена');
   if(!actions.querySelector('[data-error-report-copy]'))actions.append(button('скопировать отчёт','errorReportCopy',async()=>{const content=[record.text,...CTX.preview(record.context).map(r=>r.label+': '+r.value+(r.url?'\n'+r.url:''))].join('\n\n');try{await navigator.clipboard.writeText(content);status.textContent='Отчёт скопирован. Текст остаётся здесь';}catch{area.focus();area.select();status.textContent='Не получилось скопировать автоматически. Текст выделен — скопируй его';}}));
  }
  function retryButton(){if(box.querySelector('[data-error-report-retry]'))return;actions.append(button('повторить тот же отчёт','errorReportRetry',()=>post()));}
  async function check(){
   if(!record.pending)return;busy=true;update();status.textContent='Проверяю сохранение…';
   try{const result=verified(await request('GET','/oshibki?'+new URLSearchParams({zapros_kljuch:record.pending.zapros_kljuch})),record.pending.zapros_kljuch);if(!result.found){status.textContent='Сохранённый отчёт пока не найден. Текст остаётся в браузере';retryButton();}else accept(result);}
   catch(e){status.textContent='Не удалось проверить: '+e.message;}
   finally{busy=false;update();}
  }
  async function post(){
   if(busy||!record.pending)return;busy=true;update();status.textContent='Записываю сообщение…';
   try{const result=verified(await request('POST','/oshibki',record.pending),record.pending.zapros_kljuch);accept(result);}
   catch(e){if(e.telo?.log==='failed')partial(e.telo);else status.textContent='Сохранение не подтверждено: '+e.message+'. Текст остаётся в браузере';}
   finally{busy=false;update();}
  }
  async function submit(){
   if(record.pending)return check();if(!area.value.trim())return;
   record.text=area.value;record.pending={zapros_kljuch:crypto.randomUUID(),tekst:record.text,...record.context};
   try{store(record);}catch(e){record.pending=null;storageError=e.message;status.textContent=e.message;update();return;}
   await post();
  }
  if(storageError)actions.append(button('начать новое сообщение','errorReportReset',()=>{sessionStorage.removeItem(storage());storageError=null;status.textContent='';store(record);update();}));
  update();if(record.pending)await check();else area.focus();return {root,close};
 }
 function sendAutomatic(batch){
  if(!batch.count)return;const count=batch.count;batch.count=0;
  const payload={tip:'avto',zapros_kljuch:crypto.randomUUID(),tekst:'Ошибка на странице',...batch.context,istochnik:'auto',povtorov:count,tekst_oshibki:batch.text,kod_oshibki:batch.code,oshibka:batch.text};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  fetch('/api/oshibki',{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,keepalive:true,body:JSON.stringify(payload)}).then(response=>response.text()).catch(()=>{}).finally(()=>clearTimeout(timer));
 }
 function automatic(error){
  try{
   if(!Number.isSafeInteger(actor())||actor()<1)return;
   const text=String(error.message||error.oshibka||'Не загрузился ресурс').slice(0,1000),context=O.errorContext(),code=error.code??'JS_ERROR',signature=context.screen+'|'+code+'|'+(code==='JS_ERROR'?text:''),now=Date.now();let batch=automaticSent.get(signature);
   if(!batch||now-batch.at>=60000){if(batch){clearTimeout(batch.timer);sendAutomatic(batch);}batch={text,context,code,at:now,count:1};automaticSent.set(signature,batch);sendAutomatic(batch);}else{batch.count++;if(!batch.timer)batch.timer=setTimeout(()=>{batch.timer=null;sendAutomatic(batch);},500);}
   if(automaticSent.size>100){const key=automaticSent.keys().next().value,old=automaticSent.get(key);clearTimeout(old.timer);sendAutomatic(old);automaticSent.delete(key);}
  }catch{}
 }
 window.addEventListener('pagehide',()=>{for(const batch of automaticSent.values()){clearTimeout(batch.timer);try{sendAutomatic(batch);}catch{}}});
 async function journal(){
  const close=O.modalka('Журнал ошибок','<div class="error-journal-root"></div>',null,{poverh:true}),root=[...document.querySelectorAll('.vyb-fon')].at(-1),box=root.querySelector('.error-journal-root');
  const label=node('label',undefined,'l-field'),select=node('select',undefined,'sozd-inp');label.append(node('span','Источник','l-label'),select);for(const[value,text]of [['','все записи'],['human','сообщения участников'],['auto','автоматические ошибки']]){const option=node('option',text);option.value=value;select.append(option);}
  const status=node('p','','osh-kontekst'),list=node('div',undefined,'error-journal-list'),refresh=button('обновить','errorJournalRefresh',load);status.setAttribute('role','status');box.append(label,refresh,status,list);let generation=0;
  async function load(){const id=++generation;status.textContent='Загружаю…';try{const data=await request('GET','/oshibki'+(select.value?'?istochnik='+select.value:''));if(id!==generation||!root.isConnected)return;list.replaceChildren();status.textContent=data.spisok.length?'Последние записи · '+data.spisok.length:'Записей пока нет';for(const row of data.spisok){const item=node('article',undefined,'error-journal-entry');item.append(node('strong',row.screen||row.gde),node('p',row.tekst||row.tekst_oshibki),node('p',row.istochnik==='auto'?'автоматическая ошибка':'сообщение участника','osh-kontekst'));if(row.tekst_oshibki&&row.tekst_oshibki!==row.tekst)item.append(node('p',row.tekst_oshibki));if(row.povtorov>1)item.append(node('p','Повторилось '+row.povtorov+' раз','error-repeat-count'));if(row.poslednee_dejstvie)item.append(node('p',row.poslednee_dejstvie,'osh-kontekst'));if(row.ts)item.append(node('small',new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}).format(new Date(row.ts))+' МСК','osh-kontekst'));list.append(item);}}catch(e){if(id===generation)status.textContent='Не удалось загрузить журнал: '+e.message;}}
  select.onchange=load;await load();return {root,close};
 }
 window.addEventListener('error',e=>automatic({message:e.message||('Не загрузился ресурс: '+String(e.target?.src||e.target?.href||'').split('?')[0]),code:e.message?'JS_ERROR':'RESOURCE_ERROR'}),true);
 window.addEventListener('unhandledrejection',e=>{try{automatic({message:e.reason?.message||String(e.reason||'Не удалось завершить действие'),code:'UNHANDLED_REJECTION'});}catch{}});
 document.addEventListener('locus:request-error',e=>e.detail?.serverLogged?null:automatic({message:e.detail?.message||'Запрос завершился ошибкой '+e.detail?.status,code:e.detail?.status}));
 window.LocusErrorReports={open,journal};
})();
