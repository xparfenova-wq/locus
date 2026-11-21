(function(){
 'use strict';
 function mount({root,API,O,calendar,today}){
  const actor=Number(API.ja),model=LocusScheduleModel,esc=O.ekranirovat,names=['пн','вт','ср','чт','пт','сб','вс'];
  let week=calendar.razobrat_nedelju(new URL(location.href).searchParams.get('nedelja')||calendar.kljuch_nedeli(...(()=>{const w=calendar.iso_nedelja(today);return[w.god,w.nomer];})()),calendar.iso_nedelja(today).god),data=null,loading=false,error='',blocked=false,sequence=0;
  const weekKey=()=>calendar.kljuch_nedeli(week.god,week.nomer),hours=v=>v===null?'время не указано':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:20}).format(v)+' '+O.skolko(v,'час','часа','часов');
  function interval(row){if(!row)return 'не заполнено';const d=model.read(row);if(d.off)return 'не работаю';if(d.slots===null)return hours(d.hours)+' — '+(d.reason||'время не распределено');if(!d.slots.length)return hours(d.hours);const parts=[],fmt=n=>String(Math.floor(n)).padStart(2,'0')+':'+(n%1?'30':'00');let first=d.slots[0],end=first+.5;for(const n of d.slots.slice(1)){if(n===end)end+=.5;else{parts.push(fmt(first)+'–'+fmt(end));first=n;end=n+.5;}}parts.push(fmt(first)+'–'+fmt(end));return parts.join(', ');}
  const commands=LocusScheduleCommands.create({API,O,onUnconfirmed:e=>{error=e.message;render();},onSaved:async({item,cleanupFailed})=>{if(item.week!==weekKey())return;await load();if(cleanupFailed){error='График сохранён. Проверка в браузере ещё не завершена';render();}},onCancelled:async({item})=>{if(item.week!==weekKey())return;if(item.kind==='otmenit'){await load();error=blocked?'Попытка отмены остановлена. Не удалось обновить неделю':'Попытка отмены остановлена. График обновлён без повторной записи';render();return;}lastCancelled=item.kind==='sohranit'?item:null;error='Попытка отменена. Несохранённый текст можно открыть и скопировать';render();}});
  function pending(){try{return commands.pending(actor,weekKey());}catch(e){error=e.message;blocked=true;return null;}}
  async function load(){const token=++sequence,target=weekKey();loading=true;render();try{const r=await API.zapros('GET','/moe_prostranstvo/grafik?'+new URLSearchParams({nedelja:target}));if(token!==sequence||target!==weekKey())return;if(r.chelovek_id!==actor||r.god!==week.god||r.nedelja!==week.nomer||!Array.isArray(r.dni)||r.dni.some(d=>d.chelovek_id!==actor))throw Error('Ответ относится к другому графику');commands.seedLast(actor,target,r.poslednee_dejstvie);data=r;error='';blocked=false;}catch(e){if(token===sequence){error='Не удалось прочитать неделю. '+e.message;blocked=true;}}finally{if(token===sequence){loading=false;render();}}}
  async function navigate(next){if(loading||commands.isBusy())return;if(pending()){O.tost('Сначала проверь результат сохранения этой недели');return;}week=next;data=null;const url=new URL(location.href);url.searchParams.set('nedelja',weekKey());history.replaceState(null,'',url);await load();}
  function picker(){
   const months=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
                                                                       
                                                                
   const initialMonth=Number(calendar.sdvinut_den(week.nachalo,3).slice(5,7));
   const close=O.modalka('Период графика','<form class="l-form" data-cab-schedule-week-form novalidate><label class="l-field"><span class="l-label">год</span><select data-schedule-year>'+Array.from({length:9},(_,i)=>week.god+i-4).filter(y=>y>=1900&&y<=9999).map(y=>'<option value="'+y+'"'+(y===week.god?' selected':'')+'>'+y+'</option>').join('')+'</select></label><label class="l-field"><span class="l-label">месяц</span><select data-schedule-month>'+months.map((name,i)=>'<option value="'+(i+1)+'"'+(i+1===initialMonth?' selected':'')+'>'+name+'</option>').join('')+'</select></label><label class="l-field l-field-wide"><span class="l-label">неделя</span><select data-schedule-week></select></label><div class="l-field-wide schedule-command-buttons"><button type="submit" class="kn tmn">применить</button><button type="button" class="kn" data-schedule-week-close>отмена</button></div></form>');
   const dialog=document.querySelector('.vyb-fon:last-of-type');dialog.classList.add('schedule-week-picker');
   const form=dialog.querySelector('form'),year=form.querySelector('[data-schedule-year]'),month=form.querySelector('[data-schedule-month]'),select=form.querySelector('[data-schedule-week]');
   function options(){
    const y=Number(year.value),m=Number(month.value),preferred=Number(select.value)||week.nomer,values=[];
    for(let n=1;n<=53;n++){
     let w;try{w=calendar.razobrat_nedelju(calendar.kljuch_nedeli(y,n),y);}catch{continue;}
     if(Number(calendar.sdvinut_den(w.nachalo,3).slice(5,7))===m)values.push(w);
    }
    const selected=values.reduce((best,w)=>Math.abs(w.nomer-preferred)<Math.abs(best.nomer-preferred)?w:best,values[0]);
    select.innerHTML=values.map(w=>'<option value="'+w.nomer+'"'+(w===selected?' selected':'')+'>неделя '+w.nomer+' — '+SPR.period(w.nachalo,w.konec)+'</option>').join('');
    window.LocusControls?.scan(form);
   }
   year.onchange=options;month.onchange=options;options();form.querySelector('[data-schedule-week-close]').onclick=close;
   form.onsubmit=event=>{event.preventDefault();const next=calendar.razobrat_nedelju(calendar.kljuch_nedeli(Number(year.value),Number(select.value)),Number(year.value));close();navigate(next);};
   window.LocusControls?.scan(form);
  }
  function edit(den){if(!data||blocked||loading||pending())return;const row=data.dni.find(r=>r.den===den),day=model.draft(row,den),target=weekKey(),context=data.kontekst;
   LocusScheduleDayForm.open({O,day,label:names[den-1]+', '+SPR.denMesjac(calendar.sdvinut_den(week.nachalo,den-1)),formatHours:hours,submitLabel:'сохранить день',hint:'Сохраним только изменённые поля этого дня',onApply:async local=>{
    if(target!==weekKey()||Number(API.ja)!==actor)throw Error('Контекст недели изменился. Открой день заново');const delta=model.changes(local);if(!delta)return;
    if(row?.id)delta.identichnost=row.identichnost;
    try{const out=await commands.send('sohranit',{chelovek_id:actor,nedelja:target,kontekst:context,dni:[delta]},row?[row]:[]);if(!out.refreshFailed)O.tost('День сохранён');}
    catch(e){error=e.message;render();if(e.kod===409)error='День изменился в другой вкладке. Текст остался в форме — скопируй его и обнови неделю';throw Error(error);}
   }});
  }
  async function copy(){if(!data||blocked||loading||pending())return;const target=weekKey(),context=data.kontekst,source=calendar.sdvinut_nedelju(week.god,week.nomer,-1),iz=calendar.kljuch_nedeli(source.god,source.nomer);loading=true;render();
   try{const p=await API.zapros('GET','/grafik/predprosmotr?'+new URLSearchParams({chelovek_id:actor,nedelja:target,iz}));if(target!==weekKey()||p.kontekst!==context)throw Error('Контекст недели изменился');const out=await commands.send('kopirovat',{chelovek_id:actor,iz,v:target,kontekst:context,istochnik_kontekst:p.istochnik_kontekst});O.tost(out.result.skopirovano?'Дополнили неделю отсутствующими днями':'Заполненные дни остались прежними');}
   catch(e){error=e.message;}finally{loading=false;render();}
  }
  function draft(item){const rows=item?.body?.dni;if(!rows)return;const close=O.modalka('Несохранённые правки','<div class="schedule-draft-copy">'+rows.map(row=>'<section><b>'+esc(names[row.den-1])+'</b><p>'+esc(interval({...item.before?.find(r=>r.den===row.den),...row}))+'</p>'+('zametka'in row?'<label class="l-field"><span class="l-label">текст заметки</span><textarea readonly>'+esc(row.zametka||'')+'</textarea></label>':'')+'</section>').join('')+'</div>');return close;}
  let lastCancelled=null;
  function render(){const item=pending(),sum=data?.dni.reduce((s,r)=>s+(model.read(r).hours||0),0)||0,disabled=loading||blocked||!!item;
   root.innerHTML='<div class="cabinet-schedule" aria-busy="'+loading+'"><div class="schedule-week-header"><button type="button" class="kn" data-cab-schedule-step="-1" aria-label="предыдущая неделя"'+(disabled?' disabled':'')+'>←</button><button type="button" class="fil-b" data-cab-schedule-picker'+(disabled?' disabled':'')+'>спринт '+week.nomer+' / '+week.god+'<span>'+esc(SPR.period(week.nachalo,week.konec))+'</span></button><button type="button" class="kn" data-cab-schedule-step="1" aria-label="следующая неделя"'+(disabled?' disabled':'')+'>→</button></div><p data-cab-schedule-total>'+hours(sum)+'</p><p class="schedule-error" role="status" data-cab-schedule-status>'+esc(error)+'</p>'+(item?'<div class="schedule-command-buttons"><button type="button" class="kn" data-cab-schedule-check>проверить сохранение</button><button type="button" class="kn" data-cab-schedule-draft>посмотреть мои правки</button></div>':lastCancelled?'<button type="button" class="kn" data-cab-schedule-draft>посмотреть мои несохранённые правки</button>':'')+(commands.last(actor,weekKey())?'<button type="button" class="kn" data-schedule-undo'+(disabled?' disabled':'')+'>отменить моё сохранение</button>':'')+'<div class="schedule-cabinet-days" tabindex="0" role="region" aria-label="Мой график по дням">'+names.map((name,i)=>{const row=data?.dni.find(r=>r.den===i+1);return '<section class="schedule-day-card" data-cab-schedule-day="'+(i+1)+'"><b>'+name+'</b><p data-cab-schedule-summary>'+esc(interval(row))+'</p>'+(row?.zametka?'<p class="schedule-note-preview">'+esc(row.zametka)+'</p>':'')+'<button type="button" class="kn" data-cab-schedule-edit="'+(i+1)+'"'+(disabled||!data?' disabled':'')+'>изменить день</button></section>';}).join('')+'</div><div class="schedule-command-buttons"><button type="button" class="kn" data-cab-schedule-copy'+(disabled||!data?' disabled':'')+'>Как на прошлой неделе</button><button type="button" class="kn" data-cab-schedule-refresh'+(loading?' disabled':'')+'>обновить неделю</button></div></div>';
   root.querySelectorAll('[data-cab-schedule-step]').forEach(b=>b.onclick=()=>navigate(calendar.sdvinut_nedelju(week.god,week.nomer,Number(b.dataset.cabScheduleStep))));root.querySelector('[data-cab-schedule-picker]').onclick=picker;root.querySelectorAll('[data-cab-schedule-edit]').forEach(b=>b.onclick=()=>edit(Number(b.dataset.cabScheduleEdit)));root.querySelector('[data-cab-schedule-copy]').onclick=copy;root.querySelector('[data-schedule-undo]')?.addEventListener('click',()=>commands.undo(actor,weekKey(),'Мой график'));root.querySelector('[data-cab-schedule-refresh]').onclick=load;root.querySelector('[data-cab-schedule-check]')?.addEventListener('click',()=>commands.recover(actor,weekKey()));root.querySelector('[data-cab-schedule-draft]')?.addEventListener('click',()=>draft(item||lastCancelled));
  }
  load();return {load,navigate,get week(){return week;}};
 }
 window.LocusCabinetSchedule={mount};
})();
