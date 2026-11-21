(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusInsights=value;})(globalThis,function(){
 'use strict';
 const prefix='locus-insight-attempt-v1:';
 function create({API,storage,actor=API.ja,uuid=()=>crypto.randomUUID()}){
  const rows=new Map(),listeners=new Set(),own=()=>API.ja===actor;
  const storeKey=key=>prefix+actor+':'+key;
  function row(key){if(!rows.has(key)){let record=null,error='';try{const raw=storage.getItem(storeKey(key));if(raw){record=JSON.parse(raw);if(record.v!==1||record.actor!==actor||record.kljuch!==key||typeof record.zapros_kljuch!=='string'||!/^[0-9a-f-]{36}$/i.test(record.zapros_kljuch))throw Error();}}catch{error='Не удалось прочитать сохранённую попытку. Новое действие пока не отправляется.';record=null;}rows.set(key,{record,status:error?'blocked':record?'check':'ready',message:error,hidden:false});}return rows.get(key);}
  const emit=()=>{if(own())for(const listener of listeners)listener();};
  function save(key,r){storage.setItem(storeKey(key),JSON.stringify(r));if(storage.getItem(storeKey(key))!==JSON.stringify(r))throw Error('Попытка не сохранилась');}
  function consume(key,r,result){
   if(!result||!['otlozheno','otmeneno','ne_najdeno'].includes(result.sostojanie)||(result.sostojanie!=='ne_najdeno'&&result.kljuch!==key)||result.sostojanie==='otlozheno'&&(typeof result.aktiven!=='boolean'||typeof result.otlozhen_do!=='string'))throw Error('Ответ не подтверждён');
   if(result.sostojanie==='ne_najdeno'){r.status='retry';r.message='Откладывание пока не подтверждено. Можно повторить эту же попытку.';return;}
   r.hidden=result.sostojanie==='otlozheno'&&result.aktiven;r.status='ready';r.message=r.hidden?'Скрыто для тебя на неделю':result.sostojanie==='otlozheno'?'Срок отсрочки закончился. Можно отложить заново.':'Попытка отменена';r.record=null;
   try{storage.removeItem(storeKey(key));}catch{r.message+='; подтверждение сохранено на сервере';}
  }
  async function request(method,path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,path,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
  async function check(key){const r=row(key);if(!own()||r.status==='busy'||!r.record)return;r.status='busy';emit();try{const result=await request('GET','/insajty/proverka?zapros_kljuch='+encodeURIComponent(r.record.zapros_kljuch));if(own())consume(key,r,result);}catch{if(own()){r.status='check';r.message='Не удалось проверить откладывание. Сначала проверим состояние попытки.';}}finally{emit();}}
  async function send(key,retry=false){const r=row(key);if(!own()||r.status==='busy'||r.hidden||r.status==='blocked')return;if(r.record&&!retry)return check(key);if(retry&&r.status!=='retry')return;
   if(!r.record){const record={v:1,actor,kljuch:key,zapros_kljuch:uuid()};try{save(key,record);r.record=record;}catch{r.status='ready';r.message='Не удалось сохранить попытку в браузере. Ничего не отправлено. Проверь доступ к хранилищу и повтори.';emit();return;}}
   r.status='busy';r.message='Сохраняем отсрочку';emit();
   try{const result=await request('POST','/insajty/otlozhit',{kljuch:key,zapros_kljuch:r.record.zapros_kljuch});if(own())consume(key,r,result);}
   catch(error){if(own()){r.status='check';r.message='Ответ не получен. Проверяем, сохранилась ли отсрочка.';emit();await check(key);}}
   finally{emit();}
  }
  async function cancel(key){const r=row(key);if(!own()||r.status==='busy'||!r.record)return;r.status='busy';emit();try{const result=await request('POST','/insajty/otmena_popytki',{kljuch:key,zapros_kljuch:r.record.zapros_kljuch});if(own())consume(key,r,result);}catch{if(own()){r.status='check';r.message='Не удалось подтвердить отмену. Сначала проверим её исход.';}}finally{emit();}}
  return {snapshot:key=>({...row(key)}),hide:key=>send(key),retry:key=>send(key,true),check,cancel,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
 }
 let mounted=null;const expanded=new Map();
 const labels={perenesena_tretij_raz:'перенос',visit_bez_podzadach:'висит',zakryto_bolshe_obychnogo:'рывок',peregruz:'перегруз',net_zakrytyh_za_nedelju:'стоит',prosrochki:'просрочки',davno_ne_obschalis:'тишина',proekt_bez_zakrytyh:'проект',platezh_zhdem:'оплата',cel_pod_ugrozoj:'угроза',cel_bez_zadach:'цель',zamer_ustarel:'замер'};
 function surface({host,rows,editable=false,scope='preview',model,previewState=''}){
  let alive=true;const own=()=>alive&&host.isConnected;
  function button(text,fn,attribute){const b=document.createElement('button');b.type='button';b.className='kn';b.textContent=text;if(attribute)b.setAttribute(attribute,'');b.onclick=fn;return b;}
  function render(){if(!own())return;const source=rows.filter(item=>!model?.snapshot(item.kljuch).hidden),open=expanded.get(scope)===true,shown=open?source:source.slice(0,5);host.replaceChildren();host.classList.add('insights');
   const title=document.createElement('div');title.className='blk-z insights-title';title.append(document.createTextNode('инсайты Locus'));const count=document.createElement('span');count.className='n';count.textContent=', '+source.length;title.append(count);host.append(title);
   if(!source.length){const empty=document.createElement('p');empty.className='insights-note';empty.textContent='Актуальных инсайтов пока нет';host.append(empty);}
   for(const item of shown){const line=document.createElement('article');line.className='insights-row';line.dataset.insightKey=item.kljuch||'';const link=document.createElement('a');link.className='ins-s insights-link';link.href=/^\/(?!\/)/.test(item.adres||'')?item.adres:'#';const tag=document.createElement('span');tag.className='ks';tag.textContent=labels[item.tip]||'инсайт';const text=document.createElement('span');text.className='ins-t';text.textContent=item.tekst;link.append(tag,text);line.append(link);
    if(editable){const s=model?.snapshot(item.kljuch)||{status:previewState==='проверка'?'check':'ready',message:previewState==='ошибка'?'Не удалось сохранить отсрочку. Можно повторить.':'',record:null},actions=document.createElement('div');actions.className='insights-actions';const hide=button(s.status==='busy'?'сохраняем':'не сейчас',()=>model?.hide(item.kljuch),'data-insight-hide');hide.disabled=s.status==='busy'||s.status==='check'||s.status==='blocked'||s.status==='retry';hide.title='скрыть для себя на неделю';hide.setAttribute('aria-label','Не сейчас: скрыть этот инсайт для себя на неделю');hide.setAttribute('aria-busy',String(s.status==='busy'));actions.append(hide);
     if(['check','retry'].includes(s.status)){actions.append(button('проверить',()=>model?.check(item.kljuch),'data-insight-check'));if(s.status==='retry')actions.append(button('повторить попытку',()=>model?.retry(item.kljuch),'data-insight-retry'));actions.append(button('отменить попытку',()=>model?.cancel(item.kljuch),'data-insight-cancel'));}
     if(s.message){const note=document.createElement('p');note.className='insights-note';note.setAttribute('role','status');note.textContent=s.message;line.append(note);}line.append(actions);
    }host.append(line);
   }
   if(source.length>5){const more=button(open?'свернуть':'ещё '+(source.length-5),()=>{expanded.set(scope,!open);render();},'data-insights-more');more.setAttribute('aria-expanded',String(open));host.append(more);}
  }
  render();const unsubscribe=model?.subscribe(render);return {stop(){alive=false;unsubscribe?.();}};
 }
 function mount(options){mounted?.stop();if(!options.host)return;const controller=create({API,storage:localStorage});mounted=surface({...options,model:controller});return mounted;}
 function preview({host,state}){const rows=Array.from({length:7},(_,n)=>({kljuch:String(n).padStart(64,'0'),tip:'visit_bez_podzadach',tekst:'Задача «Проверить рабочий сценарий '+(n+1)+'» три недели без уточнения шагов',adres:'#'}));return surface({host,rows,editable:true,scope:'preview-'+state,previewState:/провер|потерян/.test(state)?'проверка':/ошиб/.test(state)?'ошибка':''});}
 return {create,mount,preview};
});
