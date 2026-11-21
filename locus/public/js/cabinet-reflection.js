(()=>{
 'use strict';
 function mount({root,actor,calendar,today,onHeader}){
  const current=calendar.iso_nedelja(today),currentKey=calendar.kljuch_nedeli(current.god,current.nomer),params=new URLSearchParams(location.search),requested=params.get('nedelja');
  let week=requested?calendar.razobrat_nedelju(requested,current.god):current,key=calendar.kljuch_nedeli(week.god,week.nomer),catalog=[],rows=[],state=null,loading=false,error='',catalogError='',unassigned=0,filter=null,epoch=0,catalogEpoch=0,switched=false,boundKey=null,writerOpening=false,subscribed=false;
  const facets=()=>window.LocusFeedText?.facets||[],context=()=>({actor,kind:'refleksija',week:key});
  root.innerHTML='<div class="kr-spisok" id="kr-spisok"></div><div class="kab-rf-fon" aria-hidden="true"></div><form class="rf-vvod kab-rf kab-rf-niz" data-cabinet-reflection-form><div class="vvod-pd" data-cabinet-reflection-facets></div><div class="vvod-stroka"><textarea class="vvod-p" id="kb-tekst" rows="1" disabled placeholder="как прошёл спринт"></textarea><button type="submit" class="vvod-slat" id="kb-slat" disabled aria-label="отправить рефлексию">↑</button></div><p data-cabinet-reflection-status role="status" aria-live="polite"></p><span data-cabinet-reflection-counter></span><div class="pending-command-actions" data-cabinet-reflection-drafts></div></form>';
  const list=root.querySelector('#kr-spisok'),form=root.querySelector('form'),field=form.querySelector('textarea'),save=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]'),counter=form.querySelector('[data-cabinet-reflection-counter]'),choices=form.querySelector('[data-cabinet-reflection-facets]'),draftActions=form.querySelector('[data-cabinet-reflection-drafts]');let choice='poluchilos';
  const message=value=>{status.textContent=value||'';},button=(text,fn,marker)=>{const b=document.createElement('button');b.type='button';b.className='kn ostavit-vnutri';b.textContent=text;b.dataset[marker]='1';b.onclick=fn;return b;};
  function own(){if(switched||actor!==API.ja)throw new Error('Аккаунт сменился. Открой страницу заново');}
  async function request(path){own();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros('GET',path,undefined,{signal:controller.signal});}finally{clearTimeout(timer);}}
  function update(){
   if(switched||actor!==API.ja){field.value='';field.disabled=true;form.inert=true;list.replaceChildren();draftActions.replaceChildren();choices.replaceChildren();document.getElementById('kab-r4')?.replaceChildren();const title=document.getElementById('kr-sprint'),dates=document.getElementById('kr-daty');if(title)title.textContent='';if(dates)dates.textContent='';message('Аккаунт сменился. Открой страницу заново');save.disabled=true;return;}
   let locked=true;try{locked=!state||state.busy()||state.pending()||state.draftBlocked(context());}catch{}
   const prefix=facets().find(f=>f[0]===choice)?.[2],length=field.value.trim()?Array.from((prefix||'')+field.value.trim()).length:0;
   save.disabled=locked||!field.value.trim()||!prefix||length>5000;counter.textContent=length?length+' / 5000':'';counter.classList.toggle('over-limit',length>5000);
   form.querySelectorAll('[data-cabinet-facet]').forEach(b=>b.classList.toggle('on',b.dataset.cabinetFacet===choice));
  }
  function fitComposer(){if(root.hidden||!form.getClientRects().length)return;const space=Math.max(160,innerHeight-form.getBoundingClientRect().top+28);list.style.paddingBottom=space+'px';const fade=root.querySelector('.kab-rf-fon');if(fade)fade.style.height=(space+20)+'px';}
  new ResizeObserver(fitComposer).observe(form);addEventListener('resize',fitComposer);window.visualViewport?.addEventListener('resize',fitComposer);
  function resize(){field.style.height='auto';field.style.height=Math.min(field.scrollHeight,160)+'px';fitComposer();}
  function capture(){own();if(!state||boundKey!==key)return;try{state.save(context(),field.value,choice);message(field.value?'Черновик сохранён':'');renderDraftActions();update();return true;}catch(e){message(e.message);renderDraftActions();update();return false;}}
  function draftDialog(){
   let raw;try{raw=state.rawDraft(context());}catch(e){message(e.message);return;}
   O.modalka('Сохранённый черновик','<p>Скопируй нужный текст перед заменой.</p><textarea readonly class="cabinet-draft-copy">'+O.ekranirovat(raw||'')+'</textarea>',null,{poverh:true});
  }
  function resetDraft(){
   const c=context(),raw=field.value,facet=choice;let previous;try{previous=state.rawDraft(c);}catch(e){message(e.message);return;}
   let saved=previous||'';try{const decoded=JSON.parse(previous);if(typeof decoded?.raw==='string')saved=decoded.raw;}catch{}
   const close=O.modalka('Сверить и заменить черновик','<p>Сравни варианты перед заменой.</p><label>Сейчас сохранено<textarea readonly class="cabinet-draft-copy">'+O.ekranirovat(saved)+'</textarea></label><label>Новый вариант<textarea readonly class="cabinet-draft-copy">'+O.ekranirovat(raw)+'</textarea></label><button type="button" class="kn ostavit-vnutri" data-cabinet-reset-draft>заменить черновик</button>',null,{poverh:true}),b=document.querySelector('[data-cabinet-reset-draft]');
   b.onclick=()=>{try{own();if(key!==c.week)throw new Error('Открыта другая неделя. Вернись к нужному черновику');if(state.rawDraft(c)!==previous){close();message('Сохранённый черновик изменился в другой вкладке. Сверь новые варианты перед заменой');renderDraftActions();return;}state.resetDraft(c);state.save(c,raw,facet);close();bindDraft();}catch(e){message(e.message);}};
  }

  function renderDraftActions(){
   draftActions.replaceChildren();if(!state||switched)return;
   try{
    if(state.draftBlocked(context())){message(state.draftProblem(context()));draftActions.append(button('посмотреть сохранённое',draftDialog,'cabinetDraftInspect'),button('заменить черновик',resetDraft,'cabinetDraftReset'));}
    const variants=state.variants(context());if(variants.length)draftActions.append(button('сохранённые версии',()=>{
     const c=context(),close=O.modalka('Сохранённые версии черновика',variants.map((row,i)=>'<section><textarea readonly class="cabinet-draft-copy">'+O.ekranirovat(row.raw)+'</textarea><button type="button" class="kn ostavit-vnutri" data-cabinet-variant="'+i+'">выбрать эту версию</button></section>').join(''),null,{poverh:true});
     document.querySelectorAll('[data-cabinet-variant]').forEach(b=>b.onclick=()=>{try{own();state.selectVariant(c,variants[Number(b.dataset.cabinetVariant)].key);close();if(key===c.week)bindDraft();}catch(e){message(e.message);}});
    },'cabinetDraftVariants'));
    if(state.pending()){const b=button('проверить отправку',()=>{try{state.recover(state.records()[0]);}catch(e){message(e.message);}},'cabinetFeedPending');b.disabled=state.busy();draftActions.append(b);message(state.busy()?'Отправляю запись…':'Отправка ещё не подтверждена. Проверь результат перед повтором.');}
   }catch(e){message(e.message);}
  }
  function bindDraft(){
   if(!state||switched)return;own();boundKey=key;message('');let draft=null;try{draft=state.draft(context());}catch(e){message(e.message);}
   field.value=draft?.raw||'';choice=draft?.choice||'poluchilos';field.disabled=false;
   if(!facets().some(f=>f[0]===choice)){message('Выбери грань для сохранённого текста');if(!field.value)choice='poluchilos';}
   renderDraftActions();update();resize();
  }
  function availableWeeks(){return [...new Set([...catalog.map(w=>w.kljuch),currentKey,key])].sort();}
  function renderHeader(){
   const title=document.getElementById('kr-sprint'),dates=document.getElementById('kr-daty');if(title)title.textContent='спринт '+week.nomer+' / '+week.god;
   if(dates){const bounds=calendar.granicy_nedeli(week.god,week.nomer);dates.textContent=SPR.period(bounds.nachalo,bounds.konec);}
   const keys=availableWeeks(),back=document.querySelector('[data-kr="-1"]'),forward=document.querySelector('[data-kr="1"]');
   back?.classList.toggle('vykl',!keys.some(k=>k<key));forward?.classList.toggle('vykl',!keys.some(k=>k>key&&k<=currentKey));
   const r4=document.getElementById('kab-r4');if(!r4)return;r4.replaceChildren();
   for(const [code,label]of [['','все'],...facets().map(f=>[f[0],f[1]])]){const n=code?rows.filter(r=>LocusFeedText.facet(r.tekst)===code).length:rows.length,b=document.createElement('button');b.type='button';b.className='fil-b'+((filter||'')===code?' on':'');b.textContent=label+(n?' '+n:'');b.dataset.krGran=code;b.onclick=()=>{filter=(filter||'')===code?null:code||null;renderList();renderHeader();};r4.append(b);}
  }
  function redrawHeader(){onHeader?.();renderHeader();}
  function renderList(){
   if(switched)return;list.replaceChildren();
   if(loading){const p=document.createElement('p');p.className='kr-pusto';p.textContent='Загружаю записи…';list.append(p);}
   if(error||catalogError){const p=document.createElement('div');p.className='kr-pusto';p.setAttribute('role','alert');p.append((error||catalogError)+' ',button('повторить чтение',reload,'cabinetReflectionReload'));list.append(p);}
   if(unassigned){const note=document.createElement('p');note.className='kr-pusto';note.textContent='Записей без подтверждённой недели: '+unassigned+'. Их период нужно сверить отдельно.';list.append(note);}
   const visible=filter?rows.filter(r=>LocusFeedText.facet(r.tekst)===filter):rows;
   for(const row of visible){const article=document.createElement('article');article.className='kr-k';article.dataset.cabinetReflectionId=String(row.id);const header=document.createElement('div');header.className='kr-k-v';const facet=facets().find(f=>f[0]===LocusFeedText.facet(row.tekst));if(facet){const label=document.createElement('span');label.className='kr-gran';label.textContent=facet[1];header.append(label);}const when=document.createElement('span');when.className='kr-kogda';let date=String(row.sozdano||'');if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(date))date=date.replace(' ','T')+'Z';const instant=new Date(date);when.textContent=Number.isFinite(instant.getTime())?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short'}).format(instant):'дата не указана';header.append(when);const text=document.createElement('div');text.className='kr-k-t';text.textContent=facet&&String(row.tekst).startsWith(facet[2])?String(row.tekst).slice(facet[2].length):row.tekst;article.append(header,text);list.append(article);}
   if(!loading&&!error&&!catalogError&&!visible.length){const p=document.createElement('div');p.className='kr-pusto';p.textContent=filter?'Под этой гранью записей нет':'Ты пока не делилась рефлексией';list.append(p);}
  }
  async function loadCatalog(){
   const ticket=++catalogEpoch;
   try{const value=await request('/lenta/nedeli?chelovek_id='+actor);if(switched||ticket!==catalogEpoch)return;if(value.chelovek_id!==actor||!Array.isArray(value.spisok)||value.vsego!==value.spisok.length||!Number.isSafeInteger(value.zapisej_bez_podtverzhdennoj_nedeli))throw new Error('Список недель получен не полностью');for(const row of value.spisok){const w=calendar.razobrat_nedelju(row.kljuch,current.god);if(w.god!==row.god||w.nomer!==row.nedelja)throw new Error('Период записи не подтверждён');}catalog=value.spisok;unassigned=value.zapisej_bez_podtverzhdennoj_nedeli;catalogError='';}catch(e){if(!switched&&ticket===catalogEpoch)catalogError='Не удалось загрузить недели. '+e.message;}if(ticket===catalogEpoch&&!switched){redrawHeader();renderList();}
  }
  async function loadRows(){
   const ticket=++epoch,selected=key;loading=true;error='';rows=[];renderList();renderHeader();
   try{let cursor=null,all=[],total=null;do{const data=await request('/lenta/potok?razdel=refleksija&chelovek_id='+actor+'&nedelja='+encodeURIComponent(selected)+'&na_stranice=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(ticket!==epoch||key!==selected||switched)return;if(!Array.isArray(data.spisok)||!Number.isSafeInteger(data.vsego)||typeof data.esche!=='boolean'||data.esche&&typeof data.sledujuschaja!=='string'||!data.esche&&data.sledujuschaja!==null||data.spisok.some(r=>r.chelovek_id!==actor||r.tip!=='refleksija'||calendar.kljuch_nedeli(r.god_sprinta,r.sprint)!==selected))throw new Error('Записи получены не полностью');if(total===null)total=data.vsego;if(data.vsego!==total)throw new Error('Состав записей изменился. Повтори чтение');all.push(...data.spisok);cursor=data.sledujuschaja;}while(cursor);if(new Set(all.map(r=>r.id)).size!==all.length||all.length!==total)throw new Error('Записи получены не полностью');rows=all;}catch(e){if(ticket===epoch&&!switched)error='Не удалось загрузить записи. '+e.message;}finally{if(ticket===epoch){loading=false;renderList();renderHeader();}}
  }
  async function reload(){await Promise.all([loadCatalog(),loadRows()]);}
  function navigate(step){if(switched||!state)return;const keys=availableWeeks(),next=step<0?[...keys].reverse().find(k=>k<key):keys.find(k=>k>key&&k<=currentKey);if(!next||!capture())return;key=next;week=calendar.razobrat_nedelju(key,current.god);filter=null;const address=new URL(location.href);address.searchParams.set('nedelja',key);history.replaceState(history.state,'',address);bindDraft();redrawHeader();void loadRows();}
  field.oninput=capture;form.onsubmit=async event=>{event.preventDefault();update();if(save.disabled)return;try{own();await state.submit(context(),field.value,choice);}catch(e){message(e.message);}finally{update();renderDraftActions();}};
  field.addEventListener('input',resize);field.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();if(!save.disabled)form.requestSubmit();}});
  document.addEventListener('locus:feed-changed',()=>{if(switched)return;if(state)bindDraft();void reload();});document.addEventListener('locus:session-changed',()=>{switched=true;++epoch;++catalogEpoch;update();});document.addEventListener('locus:session-restored',()=>{if(actor!==API.ja){switched=true;++epoch;++catalogEpoch;update();}else if(!switched)void reload();});
  function startWriter(){if(writerOpening||switched)return;writerOpening=true;draftActions.replaceChildren();message('Открываю ввод…');O.feedUi().then(value=>{if(!root.isConnected)return;state=value;choices.replaceChildren();for(const facet of facets()){const b=document.createElement('button');b.type='button';b.className='vvod-p1';b.dataset.cabinetFacet=facet[0];b.textContent=facet[1];b.onclick=()=>{choice=facet[0];capture();field.focus();};choices.append(b);}O.lentaVbok(choices);bindDraft();if(!subscribed){state.subscribe(()=>{if(root.isConnected){update();renderDraftActions();}});subscribed=true;}void reload();}).catch(e=>{message('Не удалось открыть ввод. '+e.message);draftActions.replaceChildren(button('повторить открытие',startWriter,'cabinetReflectionOpen'));}).finally(()=>{writerOpening=false;});}
  startWriter();
  redrawHeader();return {navigate,renderHeader,reload};
 }
 window.LocusCabinetReflection={mount};
})();
