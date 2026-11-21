(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusFocusTask=value;})(globalThis,function(){
 'use strict';
 const positive=v=>typeof v!=='boolean'&&/^[1-9]\d*$/.test(String(v))&&Number.isSafeInteger(Number(v));
 function create({actor,readActor,request,onChange}){
  let epoch=0,pending=null,current={kind:'none',active:false,scope:null},key=null,closed=false;
  const paint=state=>{current=state;onChange(state);};
  function select({scope=null,active=false,session=null},force=false){
   const field=scope&&Object.keys(scope)[0],valid=!scope||Object.keys(scope).length===1&&['id','nomer'].includes(field)&&positive(scope[field]);
   const next=JSON.stringify([actor,scope,active,session]);
   if(!closed&&readActor()===actor&&key===next&&(!force||pending)){onChange(current);return pending?.promise;}
   key=next;const id=++epoch;pending?.controller.abort();pending=null;
   if(closed||readActor()!==actor){paint({kind:'error',active,scope,error:'Аккаунт сменился. Открой страницу заново'});return;}
   if(!valid){paint({kind:'error',active,scope,error:'Не удалось определить задачу по этой ссылке'});return;}
   if(!scope){paint({kind:'none',active,scope:null});return;}
   paint({kind:'loading',active,scope});const controller=new AbortController();
   const same=()=>!closed&&id===epoch&&readActor()===actor;
   const promise=Promise.resolve().then(()=>request(scope,{signal:controller.signal})).then(data=>{
    if(!same())return;const task=data?.zadacha;
    if(!task||!positive(task.id)||!positive(task.nomer)||Number(task[field])!==Number(scope[field])||task.nazvanie!=null&&typeof task.nazvanie!=='string')throw Error('Связь с задачей прочитана не полностью');
    paint({kind:'ready',active,scope,task});
   }).catch(error=>{if(same())paint({kind:'error',active,scope,error:'Не удалось подтвердить привязку задачи. '+error.message});}).finally(()=>{if(id===epoch)pending=null;});
   pending={controller,promise};return promise;
  }
  return {select,state:()=>current,canStart:()=>!closed&&readActor()===actor&&!current.active&&['none','ready'].includes(current.kind),startTask(){if(!this.canStart())throw Error('Сначала проверь привязку или открой фокус без задачи');return current.kind==='ready'?Number(current.task.id):undefined;},dispose(){closed=true;epoch++;pending?.controller.abort();pending=null;}};
 }
 function link(task){const a=document.createElement('a');a.href='/zadachi.html?nomer='+Number(task.nomer);a.textContent=task.nazvanie||'Задача №'+task.nomer;return a;}
 function button(label,action){const b=document.createElement('button');b.type='button';b.className='kn';b.textContent=label;b.onclick=action;return b;}
 let timer=null,timerHost=null,timerChange=null,timerInput=null,timerEvents=false;
 function clearRequested(){const url=new URL(location.href);url.searchParams.delete('zadacha');history.replaceState(history.state,'',url.pathname+url.search+url.hash);timerInput={scope:null,active:false,session:null};timer.select(timerInput);}
 function drawTimer(state){
  const host=timerHost;if(!host?.isConnected)return;host.replaceChildren();
  if(state.kind==='none'){timerChange?.();return;}
  const p=document.createElement('p');p.dataset.focusTaskStatus='1';host.append(p);
  if(state.kind==='ready'){
   p.append(document.createTextNode(state.active?'Текущая сессия по задаче: ':'Фокус по задаче: '),link(state.task));
   const note=document.createElement('p');note.className='focus-task-caption';note.textContent='Время фокус-сессии отразится в карточке задачи';host.append(note);
  }else p.textContent=state.kind==='loading'?'Проверяем привязку задачи…':state.error;
  if(state.kind==='error')host.append(button('проверить привязку',()=>timer.select(timerInput,true)));
  if(!state.active)host.append(button('без привязки к задаче',clearRequested));timerChange?.();
 }
 function mountTimer({root,session,onChange}){
  if(!root?.isConnected)return;timerHost=root;timerChange=onChange;
  if(!timer)timer=create({actor:API.ja,readActor:()=>API.ja,onChange:drawTimer,request:(scope,options)=>API.zapros('GET','/fokus/zadacha?'+new URLSearchParams(scope),undefined,options)});
  const params=new URLSearchParams(location.search),active=!!session;
  const scope=active?(session.zadacha_id?{id:session.zadacha_id}:null):params.has('zadacha')?{nomer:params.get('zadacha')}:null;
  timerInput={scope,active,session:session?.id??null};timer.select(timerInput);
  if(!timerEvents){timerEvents=true;const refresh=()=>{if(timerHost?.isConnected&&!document.hidden)timer.select(timerInput,true);};addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);}
 }
 function cardContent(root,task){
  root.replaceChildren();
  if(task.fokus?.sessij){const p=document.createElement('p');p.dataset.taskFocusSummary='1';p.textContent='На задачу потрачено '+task.fokus.podskazka+' за всё время';root.append(p);}
  if(task.mozhno_privjazat_fokus&&!task.udaleno){const a=document.createElement('a');a.className='kn';a.dataset.taskFocusOpen='1';a.href='/poleznoe.html?vkladka=fokus&zadacha='+Number(task.nomer);a.target='_blank';a.rel='noopener';a.title='Открыть таймер по этой задаче в новой вкладке';a.textContent='фокус по задаче';root.append(a);}
 }
 function previewCard({root,state=''}){
  root.className='task-focus';const empty=/пуст/.test(state),unknown=/ошиб|непол/.test(state);
  cardContent(root,{nomer:9901,mozhno_privjazat_fokus:true,fokus:{sessij:empty?0:4,podskazka:unknown?'4 сессии, время уточняется (известно 1 ч 15 мин)':'4 сессии, 1 ч 40 мин'}});
  const a=root.querySelector('a');if(a){a.href='#';a.removeAttribute('target');a.title='Образец перехода в таймер';a.onclick=event=>event.preventDefault();}return root;
 }
 function mountCard({root,task}){
  const actor=API.ja,number=task.nomer;let closed=false,busy=false,controller=null;
  const own=()=>!closed&&root.isConnected&&API.ja===actor;cardContent(root,task);
  async function refresh(){
   if(!own()||busy||document.hidden)return;busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
   try{const fresh=await API.zapros('GET','/zadachi/'+number,undefined,{signal:controller.signal});if(!own())return;if(fresh.nomer!==number||fresh.id!==task.id||!fresh.fokus)throw Error('Данные задачи прочитаны не полностью');task=fresh;cardContent(root,task);}
   catch(error){if(own()){cardContent(root,task);const note=document.createElement('p');note.className='focus-task-caption';note.textContent='Показано последнее подтверждение. Не удалось обновить время по задаче.';root.append(note,button('обновить время',refresh));}}
   finally{clearTimeout(timeout);busy=false;controller=null;}
  }
  const visible=()=>{if(!document.hidden)refresh();};addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
  return ()=>{closed=true;controller?.abort();removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
 }
 return {create,mountTimer,mountCard,previewCard,canStart:()=>timer?.canStart()??!new URLSearchParams(location.search).has('zadacha'),startTask:()=>{if(timer)return timer.startTask();if(new URLSearchParams(location.search).has('zadacha'))throw Error('Сначала проверь привязку задачи');return undefined;}};
});
