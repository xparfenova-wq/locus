(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusErrorContext=value;})(globalThis,function(){
 'use strict';
 const routes=typeof module==='object'&&module.exports?require('./task-route-model.js'):globalThis.LocusTaskRoute;
 const sections={'zadachi.html':'Задачи','prostranstvo.html':'Пространство','napravlenija.html':'Направления','proekt.html':'Проект','klient.html':'Человек','rassylka.html':'Рассылка','okr.html':'ОКР','poleznoe.html':'Полезное','kabinet.html':'Кабинет'};
 const queryKeys=new Set(['nomer','id','cel','rezultat','period','napravlenie','vkladka','sprint','god','nedelja','den']);
 const nullable=v=>typeof v==='string'&&v.trim()?v.trim():null;
 function safeURL(value,base='https://locus.invalid'){
  try{const u=new URL(value||'/',base);if(!['http:','https:'].includes(u.protocol))return null;const query=new URLSearchParams();for(const[k,v]of u.searchParams)if(queryKeys.has(k)&&/^[\p{L}\p{N}_.,: -]{1,80}$/u.test(v))query.append(k,v);return u.origin+u.pathname.slice(0,300)+(query.size?'?'+query:'');}catch{return null;}
 }
 function iso(value){try{if(value==null)return null;const d=new Date(value);return Number.isFinite(d.getTime())?d.toISOString():null;}catch{return null;}}
 function infer(url){
  const p=url.pathname.split('/').filter(Boolean),q=url.searchParams,number=v=>/^\d+$/.test(String(v??''))&&Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
  const record=routes?.entity(url),task=routes?.direct(url);
  if(record)return {obekt:({ljudi:'chelovek',proekty:'proekt',rassylki:'rassylka',celi:'cel'})[record.table],entity_num:record.id,direction:q.get('napravlenie')};
  if(task)return {obekt:'zadacha',entity_num:task.number,direction:task.direction};
  if(q.get('nomer')||p.length===2&&number(p[1])&&!['ljudi','proekty','rassylki','okr','celi','akkaunty'].includes(p[0]))return {obekt:'zadacha',entity_num:number(q.get('nomer')||p[1]),direction:q.get('napravlenie')||p[0]};
  const table={'klient.html':'chelovek','ljudi':'chelovek','proekt.html':'proekt','proekty':'proekt','rassylka.html':'rassylka','rassylki':'rassylka','okr':'cel','celi':'cel'};
  const kind=table[p[0]]||(p[0]==='okr.html'&&q.get('cel')?'cel':null),id=number(q.get('id')||q.get('cel')||p[1]);
  if(kind&&id)return {obekt:kind,entity_num:id,direction:q.get('napravlenie')};
  return {obekt:null,entity_num:null,direction:q.get('napravlenie')};
 }
 function capture({href,title='',section='',task=null,action=null,error=null,now=Date.now()}={}){
  let page;try{page=new URL(href||'https://locus.invalid/');}catch{page=new URL('https://locus.invalid/');}
  let entity=infer(page),url=safeURL(page.href),originalURL=url,screen=nullable(section)||sections[page.pathname.split('/').pop()]||nullable(title)||'Локус';
  if(task&&Number.isSafeInteger(task.number)&&task.number>0&&/^[a-z][a-z0-9_-]*$/i.test(task.direction||'')){entity={obekt:'zadacha',entity_num:task.number,direction:task.direction};url=page.origin+'/'+encodeURIComponent(task.direction)+'/'+task.number;screen=(nullable(task.directionName)||task.direction)+', задача '+task.number;}
  else if(entity.entity_num)screen=screen+', '+({'zadacha':'задача','chelovek':'человек','proekt':'проект','rassylka':'рассылка','cel':'цель'}[entity.obekt]||'запись')+' '+entity.entity_num;
  const errorTime=iso(error?.at),errorRecent=errorTime&&now-Date.parse(errorTime)>=0&&now-Date.parse(errorTime)<=300000,errorText=errorRecent?nullable(error?.text):null;
  if(errorRecent&&error.action)action=error.action;
  const actionTime=iso(action?.at);
  const actionRecent=actionTime&&now-Date.parse(actionTime)>=0&&now-Date.parse(actionTime)<=1800000;
  const friendly=actionRecent?nullable(action.text):null,id=actionRecent?nullable(action.id):null;
  const machine=id?'click:'+id+(entity.entity_num?':'+entity.entity_num:''):friendly?'click:'+friendly:null;
  return {screen,url,obekt:entity.obekt,entity_num:entity.entity_num,poslednee_dejstvie:machine,poslednee_dejstvie_ts:actionRecent?actionTime:null,tekst_oshibki:errorText,kod_oshibki:errorText?(error.code??null):null,gde:page.pathname+(new URL(originalURL||page.href).search||''),nazhimala:friendly||'',oshibka:errorText||''};
 }
 function preview(context){return [{label:'Экран',value:context.screen||context.gde||'Экран не определён',url:context.url||null},{label:'Последнее действие',value:context.nazhimala||context.poslednee_dejstvie||'Действий пока не было',at:context.poslednee_dejstvie_ts||null},{label:'Текст ошибки',value:context.tekst_oshibki||context.oshibka||'Текста ошибки нет',code:context.kod_oshibki??null}];}
 return {capture,preview,safeURL,iso,infer};
});
