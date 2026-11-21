(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.LocusGoalWindow=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function parse(value){
  const text=String(value??'').trim().toUpperCase();
  const match=text.match(/^([1-9]\d{3})(?:-Q([1-4])|-(0[1-9]|1[0-2]))?$/);
  if(!match)throw new TypeError('Выбери год, квартал или месяц');
  return {id:text,year:Number(match[1]),kind:match[2]?'kvartal':match[3]?'mesjac':'god',quarter:match[2]?Number(match[2]):null,month:match[3]?Number(match[3]):null};
 }
 function shifted(value,step){
  if(!Number.isSafeInteger(step))throw new TypeError('Нужен целый шаг периода');
  const current=parse(value);let year=current.year,month=current.month,quarter=current.quarter;
  if(current.kind==='god')year+=step;
  else if(current.kind==='mesjac'){const index=year*12+month-1+step;year=Math.floor(index/12);month=index-year*12+1;}
  else{const index=year*4+quarter-1+step;year=Math.floor(index/4);quarter=index-year*4+1;}
  return parse(current.kind==='god'?String(year):current.kind==='mesjac'?year+'-'+String(month).padStart(2,'0'):year+'-Q'+quarter).id;
 }
 function choose(value,kind,today){
  if(!['god','kvartal','mesjac'].includes(kind))throw new TypeError('Неизвестный вид периода');
  const current=parse(value),actual=parse(String(today).slice(0,7));
  const first=current.month??(current.quarter?(current.quarter-1)*3+1:1),last=current.month??(current.quarter?current.quarter*3:12);
  const month=actual.month>=first&&actual.month<=last?actual.month:first;
  return kind==='god'?String(current.year):kind==='kvartal'?current.year+'-Q'+Math.ceil(month/3):current.year+'-'+String(month).padStart(2,'0');
 }
 function selected(goal,requested){
  const view=goal?.srez_perioda;
  const id=Number(goal?.id);
  if(!Number.isSafeInteger(id)||id<1||!view||Number(view.id)!==id||!view.okno||!Array.isArray(view.rezultaty))return null;
  try{parse(view.okno.period);}catch{return null;}
  if(Array.isArray(goal.rezultaty)){
   const ids=new Set(goal.rezultaty.map(row=>row.id)),seen=new Set();
   if(view.rezultaty.length!==ids.size)return null;
   for(const row of view.rezultaty){if(!ids.has(row.id)||Number(row.cel_id)!==id||seen.has(row.id))return null;seen.add(row.id);}
  }
  if(requested&&view.okno.period!==parse(requested).id)return null;
  return view;
 }
 return {parse,shifted,choose,selected};
});
