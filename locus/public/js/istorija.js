(function(){
 'use strict';
 const labels={publikacija_nastrojki:'настройки публикации',ohvat:'охват',ohvat_zamer:'замер охвата',publikacija_istochnik:'источник публикации',data_vyhoda:'дата выхода',status:'статус',stadija:'стадия',rol:'роль',otvetstvennyj:'ответственный',kto_vedet:'ведущий',srok:'срок',sprint:'спринт',god_sprinta:'год спринта',napravlenie:'направление',cel_id:'цель',proekt_id:'проект',klient_id:'клиент',chelovek_id:'человек',sotrudnichestvo_id:'сотрудничество',nazvanie:'название',imja:'имя',sozdano:'создание',udaleno:'удаление',arhiv:'архив',sostojanie:'состояние',stoimost:'стоимость',summa:'сумма',oplacheno:'оплата',vyplacheno:'выплачено',nalog:'налог',procent:'процент',procent_shkala:'шкала процентов',plan:'план',fakt:'факт',plan_chislo:'целевое число',znachenie:'значение',tip:'тип',rezultat_id:'результат',otmetka:'отметка',kasanie:'общение',uchastnik:'участник',fajl:'файл',ssylka:'ссылка',kontakt_id:'контакт по направлению',rekomendoval_id:'кто рекомендовал',istochnik:'источник',istochnik_tekst:'уточнение источника',usluga_id:'услуга',aktiven:'активность',dostup:'доступ',rol_v_baze:'тип записи',privodit_klientov:'приводит клиентов',poslednjaja_zadacha:'последняя задача'};
 function date(value){
  if(!value)return 'дата неизвестна';const raw=String(value).replace(' ','T'),instant=new Date(/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(raw)?raw:raw+'Z');
  return Number.isFinite(instant.getTime())?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(instant)+' МСК':'дата неизвестна';
 }
 function mount(root,{obekt,id}){
  root.locusHistory?.dispose();root.classList.add('entity-history');root.dataset.entityHistory=obekt+':'+id;
  root.innerHTML='<div class="b-l entity-history-title">история событий <span class="entity-history-count">…</span></div><div class="entity-history-list"></div><div class="entity-history-status" role="status"></div><div class="entity-history-actions"><button type="button" class="kn" data-history-toggle hidden>вся история</button><button type="button" class="kn" data-history-more hidden>показать ещё</button><button type="button" class="kn" data-history-retry hidden>повторить загрузку</button></div>';
  const list=root.querySelector('.entity-history-list'),status=root.querySelector('.entity-history-status'),counter=root.querySelector('.entity-history-count'),toggle=root.querySelector('[data-history-toggle]'),more=root.querySelector('[data-history-more]'),retry=root.querySelector('[data-history-retry]');
  let rows=[],total=0,next=null,loaded=false,busy=false,expanded=false,disposed=false,serial=0,lastAppend=false,needsRefresh=false;
  const word=value=>value==null||value===''?'—':String(value);
  function render(){
   list.replaceChildren();counter.textContent=loaded?String(total):'…';
   for(const row of (expanded?rows:rows.slice(0,3))){
    const item=document.createElement('div');item.className='entity-history-row';item.dataset.historyEvent=String(row.id);
    const text=document.createElement('div');text.className='entity-history-text';const label=labels[row.pole]||'изменение';
    const before=O.znachenieSlovami(row.pole,row.bylo),after=O.znachenieSlovami(row.pole,row.stalo),subject=row.predmet_nazvanie?row.chto+' '+(row.predmet_nomer?'№'+row.predmet_nomer+': ':'')+row.predmet_nazvanie:row.chto;text.textContent=[subject,label].filter(Boolean).join(': ')+((row.bylo!=null||row.stalo!=null)?': '+word(before)+' → '+word(after):'');
    const meta=document.createElement('div');meta.className='entity-history-meta';const time=document.createElement('span');time.textContent=date(row.kogda);meta.append(time,document.createTextNode(', '));
    const author=document.createElement(Number.isSafeInteger(row.kto)&&row.kto>0?'a':'span');author.textContent=row.kto_imja||(row.pole==='ohvat_zamer'&&row.kto==null?'сборщик статистики':'автор неизвестен');if(author.tagName==='A')author.href='/klient.html?id='+row.kto;meta.append(author);item.append(text,meta);if(row.kontekst_ne_podtverzhden){const note=document.createElement('div');note.className='entity-history-meta';note.textContent='Прежняя связь не подтверждена; показана текущая.';item.append(note);}list.append(item);
   }
   if(loaded&&!rows.length){const empty=document.createElement('div');empty.className='net';empty.textContent='событий пока нет';list.append(empty);}
   toggle.hidden=!loaded||total<=3;toggle.textContent=expanded?'свернуть':'вся история, '+total;toggle.disabled=busy;
   more.hidden=!expanded||!next||needsRefresh;more.disabled=busy;retry.disabled=busy;
   root.dispatchEvent(new CustomEvent('locus:history-layout',{bubbles:true}));
  }
  async function load(append=false){
   if(disposed||busy)return;busy=true;lastAppend=append;retry.hidden=true;status.textContent=loaded?'история обновляется':'история загружается';render();let timeout;
   const request=++serial,query=new URLSearchParams({obekt,obekt_id:String(id),skolko:expanded?'50':'3',svjazannye:'1'});if(append&&next)query.set('prodolzhit',next);
   try{
    const response=await Promise.race([API.zapros('GET','/zhurnal?'+query),new Promise((_,reject)=>timeout=setTimeout(()=>reject(new Error('timeout')),12000))]);
    if(disposed||request!==serial||!root.isConnected)return;
    if(!response||!Array.isArray(response.spisok)||!Number.isSafeInteger(response.vsego)||response.vsego<response.spisok.length||!(response.prodolzhit===null||typeof response.prodolzhit==='string')||response.spisok.some(row=>!Number.isSafeInteger(row.id)||typeof row.obekt!=='string'))throw new Error('Неверная история');
    if(append&&response.spisok.some(row=>rows.some(old=>old.id===row.id)))throw new Error('Повтор страницы истории');
    rows=append?[...rows,...response.spisok]:response.spisok;total=response.vsego;next=response.prodolzhit;loaded=true;needsRefresh=false;status.textContent='';
   }catch(error){
    if(disposed||request!==serial||!root.isConnected)return;
    needsRefresh=error.kod===409;status.textContent=needsRefresh?'История изменилась. Обновите её.':loaded?'Не удалось загрузить историю. Уже показанные события сохранены.':'Не удалось загрузить историю.';retry.textContent=needsRefresh?'обновить историю':'повторить загрузку';retry.hidden=false;if(!loaded)counter.textContent='—';
   }finally{clearTimeout(timeout);busy=false;if(!disposed&&root.isConnected){render();if(!loaded&&status.textContent)counter.textContent='—';}}
  }
  toggle.onclick=()=>{expanded=!expanded;render();if(expanded&&next&&rows.length===3)load(true);};more.onclick=()=>load(true);retry.onclick=()=>load(needsRefresh?false:lastAppend);
  const controller={refresh:()=>load(false),dispose(){disposed=true;serial++;}};root.locusHistory=controller;load();return controller;
 }
 window.LocusIstorija={mount};
})();
