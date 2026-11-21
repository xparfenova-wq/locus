(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusArchiveView=value;})(globalThis,function(){
 'use strict';
 function day(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value?value.slice(8)+'.'+value.slice(5,7)+'.'+value.slice(0,4):null;
 }
 const flag=value=>[true,1,'1','true'].includes(value)?true:[false,0,'0','false'].includes(value)?false:null;
 function describe(row){if(flag(row?.arhiv)!==true)return null;const date=day(row.arhiv_s);return {label:date?'в архиве с '+date:'в архиве · дата неизвестна',date:date?row.arhiv_s:null};}
 function html(row,escape,scope){
  const value=describe(row);if(!value)return '';
  const identity=scope&&['ljudi','sotrudnichestva'].includes(scope.tablica)&&Number.isSafeInteger(scope.id)&&scope.id>0?' data-archive-table="'+scope.tablica+'" data-archive-id="'+scope.id+'"':'';
  return '<span class="archive-stamp" data-archive-stamp'+identity+(value.date?' data-archive-date="'+value.date+'"':' data-archive-date-unknown="1"')+'>'+escape((scope?.subject?scope.subject+' ':'')+value.label)+'</span>';
 }
 function transition(row){
  if(row?.pole!=='arhiv')return null;const before=flag(row.bylo),after=flag(row.stalo);
  return before!==null&&after!==null&&before!==after?(after?'перенос в архив':'возврат из архива'):null;
 }
 return {day,describe,html,transition};
});
