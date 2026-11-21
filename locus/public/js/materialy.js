(function(){
 'use strict';
 const LIMIT=52428800,types={dogovor:'договор',dopnik:'допник',akt:'акт',schet:'счёт',nda:'НДА',doverennost:'доверенность',drugoe:'другое'};
 const scope=(bindings,kind)=>'locus-material-v1:'+API.ja+':'+kind+':'+JSON.stringify(Object.fromEntries(Object.entries(bindings).sort()));
 const size=n=>n<1048576?Math.ceil(n/1024)+' КБ':(n/1048576).toLocaleString('ru-RU',{maximumFractionDigits:1})+' МБ';
 function pending(key){try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return {broken:true};}}
 function remember(key,value){try{sessionStorage.setItem(key,JSON.stringify(value));if(sessionStorage.getItem(key)!==JSON.stringify(value))throw new Error('storage');}catch{throw new Error('Браузер не смог сохранить черновик. Данные остались в форме, добавление не началось.');}}
 function send(table,payload,file,onProgress,onXHR){
  return new Promise((resolve,reject)=>{
   const xhr=new XMLHttpRequest();onXHR(xhr);xhr.open('POST','/api/'+table);xhr.timeout=180000;
   xhr.setRequestHeader('x-locus-page-user',String(API.ja));xhr.setRequestHeader('x-locus-chelovek',String(API.ja));
   xhr.upload.onprogress=e=>onProgress(e.lengthComputable?Math.min(99,Math.round(e.loaded/e.total*100)):null);
   xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);data=data.telo||data;}catch{return reject(new Error('Ответ не подтверждён'));}
    if(xhr.status>=200&&xhr.status<300)return resolve(data);
    reject(Object.assign(new Error(data.oshibka||data.soobshchenie||'Не удалось добавить материал'),{definitive:xhr.status>=400&&xhr.status<500,kod:xhr.status}));};
   xhr.onerror=xhr.ontimeout=xhr.onabort=()=>reject(new Error('Результат запроса пока не подтверждён'));
   if(file){const form=new FormData();for(const [key,value]of Object.entries(payload))if(value!=null)form.append(key,String(value));form.append('file',file,file.name||'Фото-'+SPR.segodnja()+'.jpg');xhr.send(form);}
   else{xhr.setRequestHeader('content-type','application/json');xhr.send(JSON.stringify(payload));}
  });
 }
 function form({bindings,kind='material',file:initialFile,contextLabel='',after=async()=>{}}){
  const existing=document.getElementById('mf-name');if(existing){existing.focus();return existing.closest('.vyb-fon').locusClose;}
  const table=kind==='dokument'?'dokumenty':'materialy',storageKey=scope(bindings,kind),saved=pending(storageKey);
  let file=initialFile||null,requestKey=saved?.key||crypto.randomUUID(),busy=false,xhr=null,uncertain=!!saved,closed=false;
  const close=O.modalka(kind==='dokument'?'новый документ':'новый материал',
   '<div class="okno-kanon material-form"><div id="mf-context" class="material-context"></div><label class="material-field">название<input class="sozd-vvod" id="mf-name" autocomplete="off"></label>'+
   (kind==='dokument'?'<label class="material-field">тип<select id="mf-type">'+Object.entries(types).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label class="material-field">номер<input id="mf-number"></label><label class="material-field">дата<input type="date" id="mf-date"></label>':'')+
   '<label class="material-field">ссылка<input type="url" id="mf-url" placeholder="https://" autocomplete="off"></label>'+
   '<div class="material-file-actions"><button type="button" class="kn" id="mf-file">выбрать файл</button><button type="button" class="kn material-mobile" id="mf-camera">сделать фото</button><button type="button" class="kn material-mobile" id="mf-gallery">галерея</button></div>'+
   '<input type="file" id="mf-file-input" hidden><input type="file" id="mf-camera-input" accept="image/*" capture="environment" hidden><input type="file" id="mf-gallery-input" accept="image/*" hidden>'+
   '<div id="mf-selected" class="material-meta"></div><details id="mf-bindings"><summary>привязать ещё</summary><div id="mf-bindings-fields"></div><p id="mf-bindings-status" role="status"></p></details><progress id="mf-progress" max="100" value="0" hidden></progress><span id="mf-progress-text" role="status"></span>'+
   '<div id="mf-error" class="fch-osh" role="alert"></div><div class="fch-niz"><button type="button" class="kn" id="mf-cancel" hidden>отменить загрузку</button><button type="button" class="kn" id="mf-check" hidden>проверить результат</button><button type="button" class="kn tmn" id="mf-save">добавить</button></div></div>',null,
   {poverh:true,priZakrytii:()=>{closed=true;if(busy)xhr?.abort();}});
  const root=document.getElementById('mf-name').closest('.material-form'),q=id=>root.querySelector('#mf-'+id),status=q('error');
  q('context').textContent=contextLabel;
  const additional={};for(const field of ['chelovek_id','proekt_id','napravlenie'])if(!bindings[field]&&saved?.payload?.[field])additional[field]=saved.payload[field];
  let bindingRead=false;
  q('bindings').addEventListener('toggle',async()=>{
   if(!q('bindings').open||bindingRead||busy||uncertain)return;bindingRead=true;q('bindings-status').textContent='загружаются варианты';
   try{
    for(const [field,table,label,title]of [['chelovek_id','ljudi','человек','imja'],['proekt_id','proekty','проект','nazvanie'],['napravlenie','napravlenija','направление','nazvanie']]){
     if(bindings[field])continue;const rows=[],seen=new Set();let page=1;
     for(;;){const response=await API.spisok(table,{na_stranice:200,stranica:page});if(!Array.isArray(response.spisok))throw new Error('Не подтверждён справочник');for(const row of response.spisok){const id=field==='napravlenie'?row.kod:row.id;if(seen.has(id))throw new Error('Повтор страницы справочника');seen.add(id);rows.push(row);}if(rows.length>=response.vsego||response.spisok.length===0)break;if(++page>100)throw new Error('Справочник загружен не целиком');}
     if(closed)return;const wrap=document.createElement('label');wrap.className='material-field';wrap.textContent=label;const select=document.createElement('select');select.id='mf-binding-'+field;select.setAttribute('aria-label',label);const empty=document.createElement('option');empty.value='';empty.textContent='не привязывать';select.append(empty);
     for(const row of rows){const option=document.createElement('option');option.value=String(field==='napravlenie'?row.kod:row.id);option.textContent=String(row[title]||row.id);select.append(option);}select.value=String(additional[field]||'');select.disabled=busy||uncertain;select.onchange=()=>{if(select.value)additional[field]=field==='napravlenie'?select.value:Number(select.value);else delete additional[field];};wrap.append(select);q('bindings-fields').append(wrap);
    }
    q('bindings-status').textContent='Файл хранится в одной копии.';
   }catch(e){bindingRead=false;q('bindings-fields').replaceChildren();q('bindings-status').textContent='Не удалось загрузить варианты. Закройте и снова раскройте этот список.';}
  });
  if(saved?.payload){q('name').value=saved.payload.nazvanie||'';q('url').value=saved.payload.ssylka||'';if(kind==='dokument'){q('type').value=saved.payload.tip||'drugoe';q('date').value=saved.payload.data||'';q('number').value=saved.payload.nomer||'';}}
  else if(kind==='dokument')q('date').value=SPR.segodnja();
  function frozen(value){for(const e of root.querySelectorAll('input,select,#mf-file,#mf-camera,#mf-gallery'))e.disabled=value;}
  function validate({clear=false}={}){
   if(uncertain||busy){q('save').disabled=true;return;}
   let message='';const url=q('url').value.trim();
   if(file){if(!file.size)message='Файл пустой, 0 байт. Проверьте выбранный файл.';else if(file.size>LIMIT)message='Файл '+size(file.size)+', можно до 50 МБ. Сожмите файл или вставьте ссылку.';else if(/\.(exe|app|sh|bat|cmd)$/i.test(file.name))message='исполняемые файлы не принимаются';}
   else if(url){try{if(!['https:','http:'].includes(new URL(url).protocol))throw 0;}catch{message='Нужен полный адрес со https:// в начале';}}
   if(message||clear)status.textContent=message;q('save').disabled=!!message||!q('name').value.trim()||(!file&&!url)||(kind==='dokument'&&!q('date').value);
  }
  function choose(value){file=value;if(!file)return;q('url').value='';if(!q('name').value.trim())q('name').value=file.name||'Фото '+SPR.segodnja();q('selected').textContent=(file.name||'Фото')+', '+size(file.size);validate();}
  for(const button of ['file','camera','gallery']){q(button).onclick=()=>q(button+'-input').click();q(button+'-input').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(f)choose(f);};}
  q('url').addEventListener('input',()=>{if(q('url').value.trim()){file=null;q('selected').textContent='';}validate();});
  root.addEventListener('input',()=>validate({clear:true}));
  const inspect=async()=>{
   if(busy)return;busy=true;q('check').disabled=true;status.textContent='Проверяем сохранённый запрос…';
   try{const receipt=await API.odna('materialy','proverka?zapros_kljuch='+encodeURIComponent(requestKey));
    if(receipt.sostojanie==='sozdano'||receipt.sostojanie==='otmeneno'){sessionStorage.removeItem(storageKey);close();await after();return;}
    if(receipt.sostojanie==='udaleno'){sessionStorage.removeItem(storageKey);status.textContent='Этот материал уже добавили и удалили. Закройте окно, чтобы начать новое добавление.';q('check').hidden=true;return;}
    status.textContent='Запись пока не найдена. Можно повторить добавление.';uncertain=false;frozen(false);q('check').hidden=true;
   }catch(e){status.textContent=e.message;}finally{busy=false;q('check').disabled=false;validate();}
  };
  q('check').onclick=inspect;q('cancel').onclick=async()=>{
   xhr?.abort();q('cancel').disabled=true;
   try{const result=await API.dejstvie('/materialy/otmena',{zapros_kljuch:requestKey,tablica:table});
    if(result.sostojanie==='otmeneno'){sessionStorage.removeItem(storageKey);busy=false;close();await after();O.tost('Загрузка отменена');}
    else{uncertain=true;q('check').hidden=false;status.textContent='Материал успел сохраниться. Проверьте результат перед удалением.';}
   }catch(e){status.textContent=e.message;q('check').hidden=false;}
  };
  q('save').onclick=async()=>{
   if(busy||uncertain||q('save').disabled)return;
   const payload={...additional,...bindings,nazvanie:q('name').value.trim(),zapros_kljuch:requestKey,...(!file?{ssylka:q('url').value.trim()}:{}),...(kind==='dokument'?{tip:q('type').value,nomer:q('number').value||null,data:q('date').value}:{})};
   try{remember(storageKey,{key:requestKey,payload,file:file?{name:file.name,size:file.size}:null});}catch(e){status.textContent=e.message;return;}
   busy=true;frozen(true);q('save').disabled=true;status.textContent='';q('progress').hidden=!file;q('cancel').hidden=!file;
   try{await send(table,payload,file,p=>{if(closed)return;q('progress').value=p??0;q('progress-text').textContent=p===null?'файл загружается':p+'%';},value=>xhr=value);
    sessionStorage.removeItem(storageKey);busy=false;close();await after();O.tost(kind==='dokument'?'Документ добавлен':'Материал добавлен');
   }catch(e){if(e.definitive){sessionStorage.removeItem(storageKey);requestKey=crypto.randomUUID();frozen(false);uncertain=false;}else{uncertain=true;q('check').hidden=false;}if(!closed)status.textContent=e.message;
   }finally{busy=false;if(!closed){q('cancel').hidden=true;validate();}}
  };
  if(file)choose(file);
  if(saved){frozen(true);q('check').hidden=false;status.textContent='Есть запрос с неподтверждённым результатом. Сначала проверим его, чтобы не добавить дубль.';}
  validate();q('name').focus();return close;
 }
 function addedTime(value){
  if(!value)return {text:'дата не указана',title:''};
  const raw=String(value).replace(' ','T'),date=new Date(/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(raw)?raw:raw+'Z');
  if(Number.isNaN(date.getTime()))return {text:'дата не указана',title:String(value)};
  const day=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(d);
  const time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(date);
  const full=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(date);
  return {text:day(date)===day(new Date())?'сегодня '+time:full,title:full,iso:date.toISOString()};
 }
 function panel(root,{table,key,kind='material',bindings,contextLabel='',task=false,countTarget,addTarget}){
  root.locusPanel?.dispose();const documentKind=kind==='dokument',storageKey=scope(bindings,kind).replace('locus-material-v1:','locus-material-view-v1:');
  let state={};try{state=JSON.parse(sessionStorage.getItem(storageKey)||'{}')||{};}catch{}
  let disposed=false,generation=0,debounce=null,rows=[],shown=10,loaded=false;
  root.classList.add('material-panel');root.dataset.materialPanel=kind;
  const title=documentKind?'документы':'материалы',empty=documentKind?'документов пока нет':'материалов пока нет';
  const content='<div class="material-panel-tools"><input type="search" class="material-panel-search" aria-label="искать '+title+'" placeholder="поиск">'+(documentKind?'<select class="material-panel-type" aria-label="тип документа"><option value="">все типы</option>'+Object.entries(types).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select>':'')+'</div><div class="material-panel-status" role="status"></div><div class="material-panel-columns" hidden></div><div class="material-list"></div><button type="button" class="kn material-panel-more" hidden>показать ещё</button>'+(addTarget?'':'<div class="material-panel-footer"><button type="button" class="kn material-panel-add">добавить '+(documentKind?'документ':'материал')+'</button></div>');
  root.innerHTML=task?content:'<details class="material-panel-details"><summary><span class="b-l">'+title+'</span><span class="n material-panel-count">…</span><span class="material-panel-arrow" aria-hidden="true">⌄</span></summary><div class="material-panel-body">'+content+'</div></details>';
  const details=root.querySelector('details'),search=root.querySelector('.material-panel-search'),filter=root.querySelector('.material-panel-type'),status=root.querySelector('.material-panel-status'),list=root.querySelector('.material-list'),columns=root.querySelector('.material-panel-columns'),more=root.querySelector('.material-panel-more'),tools=root.querySelector('.material-panel-tools');
  const counter=countTarget||root.querySelector('.material-panel-count'),add=addTarget||root.querySelector('.material-panel-add');if(!addTarget&&root.dataset.materialAddId)add.id=root.dataset.materialAddId;
  if(counter)counter.textContent='…';search.value=typeof state.query==='string'?state.query:'';if(filter)filter.value=typeof state.type==='string'?state.type:'';
  const persist=()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({query:search.value,type:filter?.value||'',open:details?.open}));}catch{}};
  if(details){details.open=typeof state.open==='boolean'?state.open:innerWidth>760;details.addEventListener('toggle',persist);window.addEventListener('pagehide',persist);}
  function render(){
   list.replaceChildren();columns.replaceChildren();columns.hidden=!rows.length;
   for(const name of documentKind?['название','тип','номер','дата','кто добавил','когда']:['название','кто добавил','когда']){const cell=document.createElement('span');cell.textContent=name;columns.append(cell);}
   if(!rows.length){const text=document.createElement('div');text.className='net';text.textContent=search.value.trim()||filter?.value?'ничего не нашлось':empty;list.append(text);}
   for(const row of rows.slice(0,shown)){
    const item=document.createElement('div');item.className='material-row'+(documentKind?' material-document-row':'');item.dataset.material=String(row.id);
    const label=document.createElement('div');label.className='material-name';label.innerHTML=O.materialLink(row,kind,Object.keys(bindings)[0]);const entry=label.querySelector('.material-entry');if(entry)entry.locusAfter=load;
    if(row.fajl_dostupen===false){const note=document.createElement('div');note.className='material-unavailable';note.textContent='исходный файл пока недоступен';label.append(note);}else if(row.razmer){const bytes=document.createElement('div');bytes.className='material-meta';bytes.textContent=size(row.razmer);label.append(bytes);}
    item.append(label);
    if(documentKind){const raw=String(row.data||row.data_dokumenta||''),documentDate=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw)?raw.split('-').reverse().join('.'):raw||'—';for(const value of [types[row.tip]||row.tip||'—',row.nomer||'—',documentDate]){const cell=document.createElement('span');cell.className='material-document-field';cell.textContent=value;item.append(cell);}}
    const author=document.createElement('span');author.className='material-author';const name=row.kto_dobavil_imja||row.avtor||(window.SPR?.dannye?.ljudi||[]).find(x=>x.id===row.kto_dobavil)?.imja||'участник';
    const avatar=document.createElement('span');avatar.className='material-avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=name.trim().split(/[ ]+/).slice(0,2).map(x=>[...x][0]||'').join('').toUpperCase();author.append(avatar);
    const profile=document.createElement('span');profile.innerHTML=O.profilCheloveka(row.kto_dobavil,name);author.append(profile);item.append(author);
    const time=addedTime(row.kogda_dobavlen||row.sozdano),date=document.createElement('time');date.className='material-added';date.textContent=time.text;date.title=time.title;if(time.iso)date.dateTime=time.iso;item.append(date);list.append(item);
   }
   more.hidden=rows.length<=shown;more.textContent='показать ещё '+Math.min(10,Math.max(0,rows.length-shown));tools.hidden=!rows.length&&!search.value&&!filter?.value;
   O.zaschititVneshnieSsylki(list);
  }
  async function load(){
   const serial=++generation;status.replaceChildren();status.textContent=loaded?'обновляются записи':title+' загружаются';
   const parameters=new URLSearchParams({obekt:kind});if(search.value.trim())parameters.set('q',search.value.trim());if(filter?.value)parameters.set('tip',filter.value);let timer;
   try{const result=await Promise.race([API.odna(table,encodeURIComponent(String(key))+'/materialy?'+parameters),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('timeout')),12000))]);
    if(disposed||serial!==generation||!root.isConnected)return;const data=result[documentKind?'dokumenty':'materialy'];if(!Array.isArray(data)||data.some(x=>!Number.isSafeInteger(x.id)||typeof x.nazvanie!=='string'))throw new Error('Неверный список материалов');
    rows=data;loaded=true;if(counter)counter.textContent=String(data.length);status.replaceChildren();render();
   }catch(e){if(disposed||serial!==generation||!root.isConnected)return;status.textContent='Не удалось загрузить '+title+(loaded?'. Показаны прежние записи.':'');if(!loaded&&counter)counter.textContent='—';const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.textContent='повторить загрузку';retry.onclick=load;status.append(retry);
   }finally{clearTimeout(timer);}
  }
  const schedule=()=>{generation++;shown=10;persist();clearTimeout(debounce);debounce=setTimeout(load,180);};search.addEventListener('input',schedule);filter?.addEventListener('change',schedule);
  more.onclick=()=>{shown+=10;render();};
  add.onclick=()=>{if(disposed)return;form({bindings,kind,contextLabel,after:async()=>{search.value='';if(filter)filter.value='';shown=10;if(details)details.open=true;persist();await load();}});};
  root.locusPanel={refresh:load,dispose(){persist();disposed=true;generation++;clearTimeout(debounce);window.removeEventListener('pagehide',persist);}};load();return root.locusPanel;
 }
 function mountTask(root,{task}){
  const slot=root.querySelector('#kz-materialy');if(!slot)return {dispose(){}};
  return panel(slot,{table:'zadachi',key:task.nomer,bindings:{zadacha_id:task.id},contextLabel:task.nazvanie,task:true,countTarget:root.querySelector('#kz-materialy-count'),addTarget:root.querySelector('#kz-materialy-add')});
 }
 function mountEntity({materialRoot,documentRoot,table,key,bindings,contextLabel}){
  const mounted=[];if(materialRoot?.isConnected)mounted.push(panel(materialRoot,{table,key,bindings,contextLabel}));if(documentRoot?.isConnected)mounted.push(panel(documentRoot,{table,key,bindings,contextLabel,kind:'dokument'}));
  return {refresh:()=>Promise.all(mounted.map(x=>x.refresh())),dispose(){mounted.forEach(x=>x.dispose());}};
 }
 let permissions;
 async function controls(root){
  for(const image of root.querySelectorAll('[data-material-domain-icon]:not([data-icon-ready])')){
   image.dataset.iconReady='1';const fallback=image.parentElement.querySelector('.material-icon-fallback');
   const show=()=>{if(image.naturalWidth){image.hidden=false;if(fallback)fallback.hidden=true;}};
   image.addEventListener('load',show,{once:true});image.addEventListener('error',()=>{image.hidden=true;if(fallback)fallback.hidden=false;},{once:true});if(image.complete)show();
  }
  const allowed=await(permissions||(permissions=API.odna('materialy','vozmozhnosti').catch(e=>{permissions=null;throw e;})));
  for(const entry of root.querySelectorAll('.material-entry:not([data-material-controls])')){
   const row=JSON.parse(entry.dataset.materialRecord),kind=entry.dataset.materialKind,table=kind==='dokument'?'dokumenty':'materialy';entry.dataset.materialControls='1';
   const source=String(row.ssylka||'');if(!row.fajl&&!source.startsWith('/fajly/')){const anchor=entry.querySelector('a.material-title');if(anchor){anchor.target='_blank';anchor.rel='noopener noreferrer';}}
   if(row.kto_dobavil!==API.ja&&!allowed.mozhno_vse)continue;
   const after=async()=>{if(entry.locusAfter)return entry.locusAfter();if(document.body.locusMaterialsRefresh)return document.body.locusMaterialsRefresh();location.reload();};
   const edit=document.createElement('button');edit.type='button';edit.className='kn material-edit';edit.title='изменить материал';edit.setAttribute('aria-label',edit.title);edit.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m16 3 5 5L8 21H3v-5L16 3Z M13 6l5 5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';edit.onclick=()=>editForm(row,kind,after);
   const remove=document.createElement('button');remove.type='button';remove.className='kn material-remove';remove.title='убрать материал';remove.setAttribute('aria-label',remove.title);remove.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';remove.onclick=async()=>{
    remove.disabled=true;try{
     const linked=await API.odna('fajly',row.id+'/privjazki?obekt='+kind),field=entry.dataset.materialBinding;
     const remaining=linked.privjazki.filter(x=>!(x.zapis_id===row.id&&x.obekt===kind&&(!field||x.pole===field)));
     const note=remaining.length?'Файл останется: '+remaining.map(x=>x.nazvanie).join(', ')+'.':'Это последнее место. Файл будет удалён из Локуса.';
     const close=O.modalka('убрать '+(kind==='dokument'?'документ':'материал'),'<p>'+O.ekranirovat(note)+'</p><div id="mr-error" role="alert"></div><div class="fch-niz"><button type="button" class="kn" id="mr-keep">оставить</button><button type="button" class="kn tmn" id="mr-remove">убрать</button></div>',null,{poverh:true});
     document.getElementById('mr-keep').onclick=close;document.getElementById('mr-remove').onclick=async e=>{e.target.disabled=true;try{await API.udalit(table,row.id,{versija:row.versija,...(field?{pole:field}:{})});close();await after();}catch(error){document.getElementById('mr-error').textContent=error.message;e.target.disabled=false;}};
    }catch(e){O.tost(e.message);}finally{remove.disabled=false;}
   };entry.append(edit,remove);
  }
 }
 function editForm(row,kind,after){
  const table=kind==='dokument'?'dokumenty':'materialy',isFile=!!row.fajl||String(row.ssylka||'').startsWith('/fajly/');
  const close=O.modalka('изменить '+(kind==='dokument'?'документ':'материал'),'<div class="material-form"><label class="material-field">название<input id="me-name"></label>'+(!isFile?'<label class="material-field">ссылка<input type="url" id="me-url"></label>':'')+(kind==='dokument'?'<label class="material-field">тип<select id="me-type">'+Object.entries(types).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label class="material-field">номер<input id="me-number"></label><label class="material-field">дата<input type="date" id="me-date"></label>':'')+'<div id="me-error" role="alert"></div><div class="fch-niz"><button type="button" class="kn" id="me-check" hidden>проверить результат</button><button type="button" class="kn tmn" id="me-save">сохранить</button></div></div>',null,{poverh:true});
  const q=id=>document.getElementById('me-'+id);q('name').value=row.nazvanie||'';if(!isFile)q('url').value=row.ssylka||'';if(kind==='dokument'){q('type').value=row.tip;q('number').value=row.nomer||'';q('date').value=row.data||'';}
  let busy=false,desired;
  q('save').onclick=async()=>{if(busy)return;desired={nazvanie:q('name').value.trim(),...(!isFile?{ssylka:q('url').value.trim()}:{}),...(kind==='dokument'?{tip:q('type').value,nomer:q('number').value||null,data:q('date').value}:{})};if(!desired.nazvanie)return;
   busy=true;q('save').disabled=true;try{await API.pravit(table,row.id,{...desired,versija:row.versija});close();await after();}catch(e){q('error').textContent=e.message;q('check').hidden=false;}finally{busy=false;}
  };
  q('check').onclick=async()=>{if(busy)return;busy=true;try{const actual=await API.odna(table,row.id);if(desired&&Object.entries(desired).every(([k,v])=>actual[k]===v)){close();await after();}else q('error').textContent='Сохранение не подтверждено или запись изменена. Ваш текст остался в полях. Откройте актуальную запись перед новой правкой.';}catch(e){q('error').textContent=e.message;}finally{busy=false;}};
 }
 window.LocusMaterialy={form,mountTask,mountEntity,controls};
})();
