(function(){
 'use strict';let number=0;
 function open({O,day,label,onApply,formatHours=n=>n==null?'часы не указаны':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:20}).format(n)+' ч',submitLabel='применить к графику',hint='Изменения сохранятся вместе с графиком недели'}){
  const m=LocusScheduleModel,local=m.clone(day),esc=O.ekranirovat,id='schedule-day-'+(++number),ticks=Array.from({length:28},(_,i)=>8+i/2),clock=n=>Math.floor(n)+':'+(n%1?'30':'00');
  const close=O.modalka(label,'<form class="l-form" data-schedule-day-form novalidate><p class="l-field-wide schedule-day-hint" data-schedule-day-original></p><div class="l-field-wide"><button type="button" class="fil-b" role="checkbox" data-schedule-day-off>не работаю</button></div><div class="l-field-wide schedule-time-grid" aria-label="время на связи">'+ticks.map(t=>'<button type="button" class="fil-b" aria-pressed="false" data-schedule-time="'+t+'">'+clock(t)+'</button>').join('')+'</div><p class="l-field-wide schedule-day-hint" data-schedule-day-hours></p><label class="l-field l-field-wide"><span class="l-label">Заметка к дню</span><textarea rows="3" aria-describedby="'+id+'-count '+id+'-error" data-schedule-day-note></textarea><small class="schedule-day-hint" id="'+id+'-count" data-schedule-day-count></small></label><p class="l-field-wide schedule-error" id="'+id+'-error" role="status" data-schedule-day-error></p><p class="l-field-wide schedule-day-hint">'+esc(hint)+'</p><div class="l-field-wide schedule-day-actions"><button type="submit" class="kn" data-schedule-day-apply>'+esc(submitLabel)+'</button></div></form>');
  const root=document.querySelector('.vyb-fon:last-of-type'),form=root.querySelector('form'),field=form.querySelector('textarea'),status=form.querySelector('[data-schedule-day-error]'),original=form.querySelector('[data-schedule-day-original]'),off=form.querySelector('[data-schedule-day-off]');let busy=false;
  field.value=local.note;
  function render(){
   original.textContent=local.baseline.slots===null?formatHours(local.baseline.hours)+' сохранено. '+(local.baseline.reason||'Распределение по времени неизвестно'):'';
   off.setAttribute('aria-checked',String(local.off));off.classList.toggle('on',local.off);
   form.querySelectorAll('[data-schedule-time]').forEach(b=>{const selected=local.slots.has(Number(b.dataset.scheduleTime));b.setAttribute('aria-pressed',String(selected));b.classList.toggle('on',selected);b.disabled=local.off||busy;});
   const hours=m.currentHours(local),replace=local.slotsTouched&&local.baseline.slots===null&&hours!==local.baseline.hours;
   form.querySelector('[data-schedule-day-hours]').textContent=formatHours(hours)+(replace?' — заменим прежнее число часов при сохранении':'');
   form.querySelector('[data-schedule-day-count]').textContent=field.value.length+' / 500';const invalid=field.value.length>500&&field.value!==local.baseline.note;field.setAttribute('aria-invalid',String(invalid));if(invalid)status.textContent='В заметке может быть до 500 символов';else if(status.textContent==='В заметке может быть до 500 символов')status.textContent='';
  }
  off.onclick=()=>{status.textContent='';m.setOff(local,!local.off);render();};
  form.querySelectorAll('[data-schedule-time]').forEach(b=>{b.onclick=()=>{if(local.off||busy)return;status.textContent='';const slots=new Set(local.slots),value=Number(b.dataset.scheduleTime);if(slots.has(value))slots.delete(value);else slots.add(value);m.setSlots(local,slots);render();};});
  field.oninput=()=>{status.textContent='';m.setNote(local,field.value);render();};
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;
   try{m.setNote(local,field.value);m.changes(local);}catch(e){status.textContent=e.message;return;}
   busy=true;form.setAttribute('aria-busy','true');form.querySelectorAll('button,textarea').forEach(e=>e.disabled=true);
   try{await onApply(local);close();}
   catch(e){status.textContent=e.message||'Не удалось применить изменения. Текст остался в форме';}
   finally{busy=false;if(root.isConnected){form.removeAttribute('aria-busy');form.querySelectorAll('button,textarea').forEach(e=>e.disabled=false);render();}}
  };render();return {close,root};
 }
 window.LocusScheduleDayForm={open};
})();
