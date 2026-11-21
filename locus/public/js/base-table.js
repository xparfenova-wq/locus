(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LocusBaseTable=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const exportMarker='Выгрузка базы Локуса';
 const guarded=value=>/^\s*[=+@-]/.test(value)||value.startsWith("'");
 function exportCsv(columns,rows,tailColumns=[]){return [[exportMarker,JSON.stringify(tailColumns)],columns,...rows].map(row=>row.map(value=>{const text=String(value??'');return '"'+(guarded(text)?"'"+text:text).replaceAll('"','""')+'"';}).join(';')).join('\r\n');}
 function decodeExport(table){
  const marked=table.rows[0]?.[0]===exportMarker&&table.rows[0].slice(2).every(value=>value==='');
  const rows=marked?table.rows.slice(1).map(row=>row.map(value=>value.startsWith("'")&&guarded(value.slice(1))?value.slice(1):value)):table.rows;
  if(!rows.length)throw new Error('В таблице нет заголовка');if(rows.length>5001)throw new Error('За один раз можно загрузить до 5000 строк с заголовком');
  const tailColumns={};if(marked){let saved;try{saved=JSON.parse(table.rows[0][1]||'[]');}catch{throw new Error('Не удалось прочитать названия своих полей выгрузки');}if(!Array.isArray(saved)||saved.length>256)throw new Error('Проверь названия своих полей выгрузки');const keys=new Set();for(const item of saved){const index=rows[0].indexOf(item?.imja);if(index<0||rows[0].lastIndexOf(item.imja)!==index||typeof item.kljuch!=='string'||!item.kljuch.trim()||Array.from(item.kljuch).length>200||['__proto__','constructor','prototype'].includes(item.kljuch)||keys.has(item.kljuch)||Object.hasOwn(tailColumns,index))throw new Error('Проверь названия своих полей выгрузки');keys.add(item.kljuch);tailColumns[index]=item.kljuch;}}
  return {...table,rows,protected_text_decoded:marked,svoi_kolonki:tailColumns};
 }
 function parse(text,{delimiter=null,maxRows=5001,maxColumns=256}={}){
  if(typeof text!=='string'||text.length>8388608)throw new Error('Таблица должна быть текстом размером до 8 МБ');if(text.charCodeAt(0)===0xfeff)text=text.slice(1);if(text.includes('\0'))throw new Error('В таблице есть недопустимые символы');
  if(delimiter!==null&&![';',',','\t'].includes(delimiter))throw new Error('Неизвестный разделитель');
  if(delimiter===null){const scores=new Map([[';',0],[',',0],['\t',0]]);let quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted){if(c==='\n'||c==='\r')break;if(scores.has(c))scores.set(c,scores.get(c)+1);}}delimiter=[...scores].sort((a,b)=>b[1]-a[1])[0][0];}
  const rows=[];let row=[],cell='',quoted=false,closed=false,started=false;
  function field(){row.push(cell);if(row.length>maxColumns)throw new Error('В таблице больше '+maxColumns+' колонок');cell='';closed=false;started=false;}
  function line(){field();if(row.some(v=>v!=='')){rows.push(row);if(rows.length>maxRows)throw new Error('За один раз можно загрузить до '+(maxRows-1)+' строк с заголовком');}row=[];}
  for(let i=0;i<text.length;i++){
   const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
   if(c===delimiter){field();continue;}if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();continue;}
   if(c==='"'){if(started||cell)throw new Error('Кавычка должна открывать отдельную ячейку');quoted=true;started=true;continue;}
   if(closed){if(c===' '||c==='\t'&&delimiter!=='\t')continue;throw new Error('После закрывающей кавычки должен быть разделитель');}
   cell+=c;started=true;
  }
  if(quoted)throw new Error('Закрой кавычки в последней ячейке');if(cell||row.length||started||closed)line();if(!rows.length)throw new Error('Таблица пуста');const columns=Math.max(...rows.map(r=>r.length));return {delimiter,rows:rows.map(r=>Array.from({length:columns},(_,i)=>r[i]??'')),columns};
 }
 return {parse,exportCsv,decodeExport};
});
