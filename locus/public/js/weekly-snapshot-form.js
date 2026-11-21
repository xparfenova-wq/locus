(function(){
 'use strict';
 function create({API,O,onSaved}){
  const actor=Number(API.ja),model=LocusWeeklySnapshotState,esc=O.ekranirovat;let tab,unavailable=false,busy=false,host,report,active=null;
  try{tab=sessionStorage.getItem('locus-weekly-tab-v1');if(!/^[0-9a-f-]{36}$/i.test(tab||'')){tab=crypto.randomUUID();sessionStorage.setItem('locus-weekly-tab-v1',tab);if(sessionStorage.getItem('locus-weekly-tab-v1')!==tab)throw Error();}}catch{tab=crypto.randomUUID();unavailable=true;}
  const state=model.create({get length(){return localStorage.length;},key:i=>localStorage.key(i),getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)},actor,tab),scope=p=>({napravlenie:p.napravlenie,god:Number(p.god),nedelja:Number(p.nedelja)}),same=(a,b)=>a&&b&&a.napravlenie===b.napravlenie&&a.god===b.god&&a.nedelja===b.nedelja;
  const query=s=>'?'+new URLSearchParams(scope(s)),route=(action,s)=>'/planerka/'+action+query(s),label=s=>'спринт '+s.nedelja+' / '+s.god;
  function identity(){if(Number(API.ja)!==actor)throw Error('Участник сменился. Обнови страницу');}
  const text=e=>e?.message||'Не удалось прочитать сохранение недели';
  function date(raw){if(!raw)return 'дата не сохранена';const value=String(raw).replace(' ','T'),d=new Date(value+(/(?:Z|[+-]\d\d:\d\d)$/.test(value)?'':'Z'));return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d):'дата не подтверждена';}
  const number=v=>v===null||v===undefined?'—':String(v);
  function versions(before,after,caption,afterTitle='После пересчёта'){
   const status={sdelano:'сделано',v_plane:'в плане',v_processe:'в процессе',prosrochena:'просрочено',idet:'идёт',pauza:'пауза',zavershen:'завершён'};
   function card(p,title,when){
    if(!p)return '<section class="weekly-version"><h3>'+title+'</h3><p>Снимка нет</p></section>';
    function rows(items,format){if(!Array.isArray(items))return '<p class="weekly-command-status">Не сохранено в этой версии</p>';if(!items.length)return '<p class="weekly-command-status">Нет записей</p>';return items.map(row=>'<div class="weekly-version-row">'+format(row)+'</div>').join('');}
    const names=items=>rows(items,r=>esc(r.nazvanie||r.imja||r.tekst||r.tema||r.proekt_nazvanie||'Запись')+(r.status?' <span class="weekly-version-value">'+esc(status[r.status]||r.status)+'</span>':''));
    const section=(title,html)=>'<section class="weekly-version-section"><h4>'+title+'</h4>'+html+'</section>';
    const periods=r=>r.skryto?.includes('dengi')?'':r.razrezy?Object.entries(r.razrezy).map(([key,v])=>{
     const label=({nedelja:'За неделю',mesjac:'Месяц',kvartal:'Квартал',god:'Год'})[key]||key;
     if(!v||typeof v!=='object')return '<span class="weekly-version-value">'+esc(label)+': нет данных</span>';
     const isWeek=key==='nedelja',movement=isWeek||!!v.plan_perioda,value=movement?v.dvizhenie_perioda:v.fakt;
     const shown=isWeek?(value==null?'нет данных':(value>0?'+':'')+number(value)):r.tip==='veha'?(v.fakt==null?'нет данных':v.fakt?'закрыта':'не закрыта'):number(value)+' / '+number(v.plan);
     const note=isWeek?(value==null?v.pochemu_net_dvizhenija||v.pochemu_net_fakta||'Движение неизвестно':'движение за неделю'):movement?'движение':r.tip==='veha'?'состояние':'значение на конец окна';
     return '<span class="weekly-version-value" data-weekly-preview-scope="'+esc(key)+'">'+esc(label)+': '+esc(shown)+' · '+esc(note)+'</span>';
    }).join(''):'<span class="weekly-version-value">Периодные срезы не сохранены</span>';
    const goals=rows(p.svodka?.celi,c=>'<b>'+esc(c.nazvanie||'Цель')+'</b>'+rows(c.rezultaty,r=>'<span data-weekly-preview-result="'+esc(String(r.id??''))+'">'+esc(r.nazvanie||'Результат')+'<span class="weekly-version-value">'+(r.skryto?.includes('dengi')?'скрыто':'Факт '+esc(number(r.fakt))+' / план '+esc(number(r.plan)))+'</span>'+periods(r)+'</span>'));
    const summary=[['Закрыто задач',p.svodka?.zakryto],['Открыто задач',p.svodka?.otkryto],['Просрочено',p.svodka?.prosrocheno],['Публикаций',p.svodka?.publikacij]].map(([title,value])=>'<p>'+title+': <span class="weekly-version-value">'+esc(number(value))+'</span></p>').join('');
    const money=p.dengi?.skryto?'Суммы скрыты':p.dengi?'Получено за неделю: '+number(p.dengi.prishlo_za_nedelju)+' ₽':'Сведения не сохранены';
    return '<section class="weekly-version"><h3>'+title+'</h3><p class="weekly-command-status">'+esc(when)+'</p>'+section('Сводка',summary)+section('Цели и результаты',goals)+section('Бизнес','<h4>Проекты</h4>'+names(p.biznes?.proekty)+'<h4>Задачи</h4>'+names(p.biznes?.zadachi))+section('Клиенты',names(Array.isArray(p.klienty)?p.klienty:p.klienty?.spisok))+section('Продукт',names(p.produkt))+section('Контент',names(Array.isArray(p.kontent)?p.kontent:p.kontent?.zadachi))+section('Прочее',names(p.prochee))+section('Обратная связь',names(p.obratnaja_svjaz))+section('Деньги','<p>'+esc(money)+'</p>'+rows(p.dopolnenija?.platezhi,r=>esc(p.biznes?.proekty?.find(project=>project.id===r.proekt_id)?.nazvanie||'Платёж')+'<span class="weekly-version-value">'+esc(p.dengi?.skryto?'Сумма скрыта':number(r.summa)+' ₽')+' · '+esc(r.oplachen_at?'Оплачен '+String(r.oplachen_at).slice(0,10):'Ожидается')+'</span>'))+section('Соцсети',rows(p.dopolnenija?.socseti,r=>esc(r.nazvanie||'Аккаунт')+'<span class="weekly-version-value">Подписчиков '+esc(number(r.podpischikov))+' · изменение '+esc(number(r.delta))+'</span>'))+section('Рассылки',rows(p.rassylki,r=>esc(r.nazvanie||'Рассылка')+'<span class="weekly-version-value">Отправлено за неделю '+esc(number(r.za_nedelju_otpravleno))+' · ответов '+esc(number(r.otvetili))+'</span>'))+section('Заметки',names(p.dopolnenija?.insajty))+section('Ресурс команды',rows(p.dopolnenija?.tokeny,r=>esc(r.imja||'Участник')+'<span class="weekly-version-value">'+esc(number(r.resurs))+'</span>'))+'</section>';
   }
   return '<div class="weekly-versions">'+card(before,'Сохранено',caption||'Прежняя версия')+card(after,afterTitle,after?.den?'Данные на '+after.den:'Новая версия')+'</div>';
  }
  function closeActive(){active?.close();active=null;}
  function modal(title,body,s,restricted=false){closeActive();const close=O.modalka(title,body),root=document.querySelector('.vyb-fon:last-of-type');root.querySelector('.vyb-ob').classList.add('weekly-command-modal');active={close,root,scope:scope(s),restricted,visibility:report?.istochnik_otcheta?.vidimost};return {root,close};}
  function mount(root,p){host=root;report=p;
   if(active?.root.isConnected&&(!same(active.scope,scope(p))||active.visibility!==p.istochnik_otcheta?.vidimost||active.restricted&&!p.istochnik_otcheta?.mozhno_pereschitat||active.moneyHidden!==undefined&&active.moneyHidden!==!!p.dengi?.skryto))closeActive();
   root.replaceChildren();const actions=document.createElement('div');actions.className='weekly-actions';
   const button=(title,action,attribute)=>{const b=document.createElement('button');b.type='button';b.className='kn';b.textContent=title;b.dataset[attribute]='1';b.onclick=action;actions.append(b);};
   if(p.istochnik_otcheta?.mozhno_pereschitat)button(p.istochnik_otcheta.vid==='snimok'?'пересчитать неделю':'зафиксировать неделю',()=>open(scope(p)),'weeklyRecalculate');
   button('история недели',()=>history(scope(p)),'weeklyHistory');root.append(actions);
   try{for(const item of state.pending()){const line=document.createElement('div'),note=document.createElement('span'),b=document.createElement('button');line.className='weekly-command-actions';note.textContent='Сохранение не подтверждено: '+label(item)+' ';b.type='button';b.className='kn';b.textContent='проверить';b.dataset.weeklyPending=item.key;b.onclick=()=>recover(item);line.append(note,b);root.append(line);}}
   catch(e){const p=document.createElement('p');p.className='weekly-command-status';p.textContent=text(e);root.append(p);}
  }
  const refresh=()=>{if(host?.isConnected&&report)mount(host,report);};
  function finish(item,result){if(!model.confirmed(item,result))throw Error('Ответ не подтвердил именно эту неделю');let local=false;try{state.finish(item,result);}catch{local=true;}refresh();return {item,result,local};}
  async function changed(outcome){
   try{await onSaved?.();}catch{O.tost('Снимок сохранён. Обнови страницу, чтобы прочитать его');return;}
   O.tost(outcome.local?'Снимок сохранён. Проверка в браузере ещё не завершена':outcome.item.kind==='otmenit'?'Прежний снимок возвращён':outcome.result.vernuto?'Этот пересчёт уже отменён':'Неделя сохранена');
  }
  async function request(method,path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,path,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
  async function send(kind,s,body){
   identity();if(unavailable)throw Error('Разреши хранилище вкладки и обнови страницу перед сохранением');if(busy)throw Error('Сохранение уже идёт');
   const key=crypto.randomUUID(),item=state.reserve({key,actor,...scope(s),kind,body:{...body,zapros_kljuch:key}});refresh();busy=true;
   try{return finish(item,await request('POST',route(kind==='otmenit'?'snimok_otmenit':'snimok',s),item.body));}
   catch(e){if(e.kod>=400&&e.kod<500&&![401,403,404].includes(e.kod)){state.reject(key);refresh();throw e;}throw Object.assign(Error('Ответ не подтверждён. Проверим сохранение'),{pending:true,item,cause:e});}finally{busy=false;}
  }
  function guard(){try{identity();if(busy)throw Error('Предыдущее сохранение ещё идёт');const list=state.pending();if(list.length){recover(list[0]);return false;}return true;}catch(e){O.tost(text(e));return false;}}
  function recover(item){
   const {root,close}=modal('Проверить сохранение · '+label(item),'<div class="weekly-command"><p>Проверяем результат предыдущей попытки</p><p class="weekly-command-status" role="status" aria-live="polite" data-weekly-status></p><div class="weekly-command-actions"><button type="button" class="kn" data-weekly-check>проверить</button><button type="button" class="kn" data-weekly-retry hidden>повторить эту попытку</button><button type="button" class="kn" data-weekly-cancel>отменить попытку</button></div></div>',item),status=root.querySelector('[data-weekly-status]');let checking=false;
   async function run(action){if(checking)return;checking=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{identity();const result=action==='retry'?await request('POST',route(item.kind==='otmenit'?'snimok_otmenit':'snimok',item),item.body):action==='cancel'?await request('POST',route('snimok_otmena_popytki',item),{zapros_kljuch:item.key,dejstvie:item.kind}):await request('GET',route('snimok_proverka',item)+'&zapros_kljuch='+item.key);
     if(!model.identity(item,result))throw Error('Ответ относится к другой попытке');
     if(result.sostojanie==='sohraneno'){const outcome=finish(item,result);close();await changed(outcome);return;}
     if(result.sostojanie==='otmeneno'){state.reject(item.key);refresh();close();O.tost('Попытка отменена. Снимок не менялся');return;}
     if(result.sostojanie!=='ne_najdeno')throw Error('Не удалось подтвердить исход');status.textContent='Сохранение пока не найдено. Можно повторить ту же попытку или отменить её';root.querySelector('[data-weekly-retry]').hidden=false;
    }catch(e){status.textContent=text(e);status.dataset.error='1';if(action==='retry'&&e.kod>=400&&e.kod<500&&![401,403,404].includes(e.kod)){state.reject(item.key);refresh();status.textContent+=' — открой новое сравнение';root.querySelector('[data-weekly-retry]').hidden=true;}}
    finally{checking=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}
   }
   root.querySelector('[data-weekly-check]').onclick=()=>run('check');root.querySelector('[data-weekly-retry]').onclick=()=>run('retry');root.querySelector('[data-weekly-cancel]').onclick=()=>run('cancel');run('check');
  }
  async function undo(item){if(!guard())return;const {root,close}=modal('Вернуть прежний снимок · '+label(item),'<div class="weekly-command"><p>Вернём версию до этого пересчёта. Исходные задачи, замеры и платежи сохранят свои текущие значения</p><p class="weekly-command-status" role="status" data-weekly-status></p><div class="weekly-command-actions"><button class="kn" type="button" data-weekly-undo-confirm>вернуть прежний снимок</button></div></div>',item,true);root.querySelector('[data-weekly-undo-confirm]').onclick=async e=>{if(busy)return;e.target.disabled=true;try{const outcome=await send('otmenit',item,{ishodnyj_kljuch:item.key});close();await changed(outcome);}catch(error){if(error.pending)recover(error.item);else{root.querySelector('[data-weekly-status]').textContent=text(error);e.target.disabled=false;}}};}
  async function open(s){
   if(!guard())return;const {root,close}=modal('Пересчёт недели · '+label(s),'<div class="weekly-command"><p class="weekly-command-status" role="status" aria-live="polite" data-weekly-status>Читаем сохранённую версию и текущие источники</p><div data-weekly-versions></div><div class="weekly-command-actions"><button type="button" class="kn" data-weekly-refresh>обновить сравнение</button><button type="button" class="kn" data-weekly-confirm disabled>подтвердить и сохранить</button></div></div>',s,true),status=root.querySelector('[data-weekly-status]'),content=root.querySelector('[data-weekly-versions]'),confirm=root.querySelector('[data-weekly-confirm]');let p,loading=false;
   async function load(note=''){loading=true;confirm.disabled=true;content.replaceChildren();status.textContent=note||'Читаем сравнение';try{const next=await request('GET',route('snimok_predprosmotr',s));identity();if(!root.isConnected)return;p=next;content.innerHTML=versions(p.predyduschaja,p.novaja,date(p.pereschitan||p.sozdano));status.textContent=note||'Проверь обе версии. До подтверждения сохранённые числа остаются прежними';delete status.dataset.error;confirm.disabled=busy;}catch(e){status.textContent=text(e);status.dataset.error='1';}finally{loading=false;}}
   root.querySelector('[data-weekly-refresh]').onclick=()=>{if(!busy&&!loading)load();};
   confirm.onclick=async()=>{if(loading||busy||!p||!guard())return;confirm.disabled=true;try{const outcome=await send('pereschitat',s,{kontekst:p.kontekst});close();await changed(outcome);}catch(e){if(e.pending)recover(e.item);else if(e.kod===409)await load('Данные изменились. Сравнение обновлено — проверь его перед новым подтверждением');else{status.textContent=text(e);status.dataset.error='1';if([401,403,404].includes(e.kod))content.replaceChildren();else confirm.disabled=false;}}};
   try{const last=state.last(s);if(last){const b=document.createElement('button');b.type='button';b.className='kn';b.textContent='отменить последний пересчёт';b.dataset.weeklyUndo='1';b.onclick=()=>undo(last);root.querySelector('.weekly-command-actions').append(b);}}catch(e){status.textContent=text(e);}
   await load();
  }
  async function history(s){
   const {root}=modal('История недели · '+label(s),'<div class="weekly-command"><p class="weekly-command-status" role="status" aria-live="polite" data-weekly-status>Читаем историю</p><div data-weekly-history-list></div><button type="button" class="kn" data-weekly-history-more hidden>показать предыдущие изменения</button></div>',s),host=root.querySelector('[data-weekly-history-list]'),status=root.querySelector('[data-weekly-status]'),more=root.querySelector('[data-weekly-history-more]');active.moneyHidden=!!report?.dengi?.skryto;let cursor=null,loading=false;
   async function load(){if(loading)return;loading=true;more.disabled=true;try{const page=await request('GET',route('snimok_istorija',s)+(cursor?'&do_id='+cursor:''));identity();if(!root.isConnected)return;status.textContent=page.spisok?.length?'':'Изменений этой недели пока нет';for(const row of page.spisok||[]){const block=document.createElement('section');block.className='weekly-history-row';const description=document.createElement('p'),b=document.createElement('button');let context;try{context=JSON.parse(row.srez)?.snimok_planerki;}catch{}const title=context?.dejstvie==='otmenit_pereschet'?'Отмена пересчёта':context?.dejstvie==='zavershit_nedelju'?'Завершение недели':'Пересчёт';description.textContent=title+' · '+(row.kto_imja||'Участник')+' · '+date(row.kogda);b.type='button';b.className='kn';b.textContent='сравнить версии';b.dataset.weeklyHistoryVersions=String(row.id);b.onclick=()=>{let before,after;try{before=row.bylo?JSON.parse(row.bylo):null;after=row.stalo?JSON.parse(row.stalo):null;}catch{O.tost('Не удалось прочитать версии');return;}modal(title+' · '+label(s),'<div class="weekly-command">'+versions(before,after,date(context?.do?.pereschitan||context?.do?.sozdano),'После изменения')+'</div>',s);active.moneyHidden=!!report?.dengi?.skryto;};block.append(description,b);host.append(block);}cursor=page.sledujuschij;more.hidden=!cursor;
    }catch(e){status.textContent=text(e);if([401,403,404].includes(e.kod))host.replaceChildren();}finally{loading=false;more.disabled=false;}}
   more.onclick=load;await load();
  }
  window.addEventListener('storage',refresh);document.addEventListener('locus:session-changed',closeActive);document.addEventListener('locus:session-expired',closeActive);
  return {mount,open,history,recover,invalidate:closeActive};
 }
 window.LocusWeeklySnapshot={create};
})();
