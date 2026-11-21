(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LocusFocusTime=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const lengths={fokus:25,pereryv:5,dolgij_pereryv:15};
 function invalid(){throw Object.assign(new Error('Не подтверждено время сессии. Сбрось её или проверь историю'),{kod:409});}
 function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value))invalid();
  const parts=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value),day=Date.parse(parts[1]+'T12:00:00Z');if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==parts[1]||Number(parts[2])>23||Number(parts[3])>59||Number(parts[4])>59)invalid();
  const text=value.replace(' ','T'),number=Date.parse(text+(/Z$|[+-]\d{2}:\d{2}$/.test(text)?'':'Z'));
  if(!Number.isFinite(number))invalid();return number;
 }
 function active(row,now=Date.now()){
  const start=instant(row.nachalo),end=row.konec?instant(row.konec):now,paused=row.pauza_ms??0;
  if(!Number.isSafeInteger(paused)||paused<0||!Number.isFinite(end))invalid();
  const current=row.pauza_s?Math.max(0,end-instant(row.pauza_s)):0;
  if(row.konec&&(end<start||paused+current>end-start||row.pauza_s&&(instant(row.pauza_s)<start||instant(row.pauza_s)>end)))invalid();
  return Math.max(0,end-start-paused-current);
 }
 function describe(row,now=Date.now()){
  let ms,error;try{ms=active(row,now);}catch(e){ms=null;error=e.message;}
  return {...row,aktivno_ms:ms,dlina_minut:lengths[row.rezhim]||25,idet_minut:ms===null?null:Math.floor(ms/60000),minut:ms===null?null:Math.round(ms/60000),pauza:!!row.pauza_s,...(error?{oshibka_vremeni:error}:{})};
 }
 return {lengths,instant,active,describe};
});
