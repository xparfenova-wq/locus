(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusContextHintsModel=value;})(globalThis,function(){
 'use strict';
 const hints=Object.freeze([
  {kod:'zadachi',title:'Задачи',text:'Выбирай спринт и направление, чтобы видеть нужные задачи. Галочка в строке отмечает задачу сделанной; карточка хранит её обсуждение и материалы.'},
  {kod:'ljudi',title:'Люди',text:'У человека одна карточка и несколько ролей. Фильтры помогают найти клиента, коллегу или реферала; в карточке собраны контакты и история сотрудничества.'},
  {kod:'planerka',title:'Планёрка',text:'Выбери направление и неделю для общей сводки. Цели, задачи и факты связаны с теми же данными, которые команда ведёт в остальных разделах.'},
  {kod:'poleznoe',title:'Полезное',text:'Здесь знания команды, рефлексия, принципы и рабочие инструменты. Переключай вкладки в меню; график и шаблоны доступны здесь же.'},
 ].map(hint=>Object.freeze(hint)));
 const codes=Object.freeze([...hints.map(h=>h.kod),...Array.from({length:7},(_,i)=>'shag_'+(i+1))]);
 function tokens(value){
  if(value==null||value==='')return [];
  if(Array.isArray(value))return value.filter(v=>typeof v==='string');
  if(typeof value!=='string')return [];
  if(value.trim().startsWith('[')){try{const v=JSON.parse(value);if(Array.isArray(v))return v.filter(v=>typeof v==='string');}catch{}}
  return value.split(',').map(v=>v.trim()).filter(Boolean);
 }
 function normalise(value){
  let list=value;
  if(value==null||value==='')list=[];
  else if(typeof value==='string'){
   if(value.trim().startsWith('[')){try{list=JSON.parse(value);}catch{throw Error('Нужен список кодов подсказок');}}
   else list=value.split(',').map(v=>v.trim());
  }
  if(!Array.isArray(list)||list.some(v=>typeof v!=='string'||!codes.includes(v)))throw Error('Нужен список кодов подсказок из доступного перечня');
  return [...new Set(list)].join(',');
 }
                                                                            
 function append(raw,code){
  if(!hints.some(h=>h.kod===code))throw Error('Такой подсказки нет');
  if(tokens(raw).includes(code))return raw;
  if(raw==null||raw==='')return code;
  if(typeof raw!=='string')throw Error('Сохранённые отметки подсказок не читаются');
  if(raw.trim().startsWith('[')){
   let list;try{list=JSON.parse(raw);}catch{}
   if(!Array.isArray(list)||list.some(v=>typeof v!=='string'))throw Error('Сохранённые отметки подсказок не читаются');
   return JSON.stringify([...list,code]);
  }
  return raw+','+code;
 }
 return {hints,codes,tokens,normalise,append};
});
