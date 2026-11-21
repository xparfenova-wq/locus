(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusScheduleModel=value;})(globalThis,function(){
 'use strict';
 const flag=v=>v===true||v===1||v==='1',tick=v=>typeof v==='number'&&Number.isFinite(v)&&v>=8&&v<=21.5&&Number.isInteger(v*2);
 function hours(v){if(v==null||v===''||typeof v==='boolean'||!['number','string'].includes(typeof v))return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=24?n:null;}
 function clock(v){const m=typeof v==='string'&&/^(\d{1,2}):(00|30)$/.exec(v);return m?Number(m[1])+Number(m[2])/60:null;}
 function read(row){
  if(!row)return {kind:'empty',slots:[],hours:null,note:'',off:false,reason:null};
  const n=hours(row.chasov),rawNote=row.zametka==null?'':String(row.zametka),off=flag(row.ne_rabotaju)||(rawNote==='ne_rabotaju'&&n===0&&!String(row.s_kakogo||'').trim());
  const base={hours:n,note:off&&rawNote==='ne_rabotaju'?'':rawNote,off,slots:null,reason:null};
  if(off)return {...base,kind:'off',slots:[],hours:0};
  const raw=row.s_kakogo==null?'':String(row.s_kakogo).trim(),end=row.do_kakogo==null?'':String(row.do_kakogo).trim();
  const invalid=reason=>({...base,kind:'invalid',reason});
  if(!raw)return end?invalid('Начало интервала не сохранено'):n===null?invalid('Число часов не подтверждено'):{...base,kind:'duration',reason:'Часы сохранены без распределения по времени'};
  if(raw.includes(':')){
   const start=clock(raw),stop=clock(end);if(start===null||stop===null||start<8||stop>22||stop<=start)return invalid('Сохранённое окно нельзя показать получасовыми клетками');
   if(n!==stop-start)return invalid('Число часов не совпадает с сохранённым окном');
   return {...base,kind:'range',slots:Array.from({length:(stop-start)*2},(_,i)=>start+i/2)};
  }
  const tokens=raw.split(',');if(tokens.some(v=>!/^\d+(?:\.\d+)?$/.test(v.trim())))return invalid('Разметка часов требует проверки');
  const cells=tokens.map(Number).sort((a,b)=>a-b);if(cells.some(v=>!tick(v))||new Set(cells).size!==cells.length)return invalid('Разметка часов требует проверки');
  if(cells.every(v=>Number.isInteger(v))&&n===cells.length)return {...base,kind:'legacy_hours',slots:cells.flatMap(v=>[v,v+0.5])};
  if(n!==cells.length/2)return invalid('Число часов не совпадает с разметкой');
  return {...base,kind:'slots',slots:cells};
 }
 function draft(row,den){const parsed=read(row);return {den,original:row?Object.freeze({...row}):null,baseline:parsed,slots:new Set(parsed.slots||[]),note:parsed.note,off:parsed.off,slotsTouched:false,noteTouched:false,offTouched:false};}
 function clone(day){return {...day,slots:new Set(day.slots)};}
 function setSlots(day,values){const cells=[...values];if(cells.some(v=>!tick(v)))throw Error('Отметь получасовые клетки с 8:00 до 22:00');day.slots=new Set(cells);day.slotsTouched=true;return day;}
 function setOff(day,value){if(typeof value!=='boolean')throw Error('Нужно состояние рабочего дня');day.off=value;day.offTouched=true;return day;}
 function setNote(day,value){if(typeof value!=='string')throw Error('Нужен текст заметки');day.note=value;day.noteTouched=true;return day;}
 function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
 function currentHours(day){return day.off?0:day.slotsTouched?day.slots.size/2:day.baseline.hours;}
 function changes(day){
  if(!Number.isInteger(day.den)||day.den<1||day.den>7)throw Error('Нужен день недели');
  if(typeof day.note!=='string'||day.noteTouched&&day.note!==day.baseline.note&&day.note.length>500)throw Error('В заметке может быть до 500 символов');
  const slots=[...day.slots].sort((a,b)=>a-b);if(slots.some(v=>!tick(v)))throw Error('Разметка времени не подтверждена');
  const before=day.baseline,offChanged=day.offTouched&&day.off!==before.off;
  const slotsChanged=day.slotsTouched&&!day.off&&(before.slots===null?(slots.length>0||before.hours!==0):!same(slots,before.slots));
  const fields={};
  if(offChanged||slotsChanged){fields.ne_rabotaju=day.off;fields.chasov=day.off?0:slots.length/2;fields.s_kakogo=day.off?'':slots.join(',');fields.do_kakogo=day.off||!slots.length?'':String(slots.at(-1)+0.5);}
  if(day.noteTouched&&day.note!==before.note)fields.zametka=day.note;
  else if(offChanged&&!day.off&&day.original?.zametka==='ne_rabotaju')fields.zametka=null;
  if(!Object.keys(fields).length)return null;
  if(!day.original&&!day.off&&!slots.length)throw Error('Сначала отметь часы или выбери «Не работаю», затем добавь заметку');
  if(day.original&&(!Number.isSafeInteger(day.original.id)||day.original.id<1||!Number.isSafeInteger(day.original.versija)||day.original.versija<1))throw Error('Обнови сохранённый день перед правкой');
  return {den:day.den,...(day.original?{id:day.original.id,versija:day.original.versija}:{}),...fields};
 }
 return {read,draft,clone,setSlots,setOff,setNote,currentHours,changes};
});
