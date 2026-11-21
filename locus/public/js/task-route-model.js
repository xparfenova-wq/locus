(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusTaskRoute=value;})(globalThis,function(){
 'use strict';
 const reserved=new Set(['api','ljudi','proekty','rassylki','okr','celi','akkaunty','planerka','poleznoe','zadachi','fajly','js','css']);
 const entities={ljudi:{table:'ljudi',page:'klient.html',param:'id'},proekty:{table:'proekty',page:'proekt.html',param:'id'},rassylki:{table:'rassylki',page:'rassylka.html',param:'id'},okr:{table:'celi',page:'okr.html',param:'cel'},celi:{table:'celi',page:'okr.html',param:'cel'}};
 function entity(value){try{const u=new URL(value,'https://locus.invalid'),m=u.pathname.match(/^\/([a-z]+)\/([1-9]\d*)\/?$/);return m&&entities[m[1]]&&Number.isSafeInteger(Number(m[2]))?{...entities[m[1]],id:Number(m[2]),section:m[1]}:null;}catch{return null;}}
 function direct(value){try{const u=new URL(value,'https://locus.invalid'),m=u.pathname.match(/^\/([a-z][a-z0-9_-]*)\/([1-9]\d*)\/?$/i);return m&&!reserved.has(m[1])&&Number.isSafeInteger(Number(m[2]))?{direction:m[1],number:Number(m[2])}:null;}catch{return null;}}
 function query(value){const u=new URL(value,'https://locus.invalid'),q=new URLSearchParams(u.search),task=direct(u),record=entity(u);if(task){q.set('nomer',String(task.number));q.set('napravlenie',task.direction);}else if(record)q.set(record.param,String(record.id));return q;}
 function path(direction,number){return /^[a-z][a-z0-9_-]*$/i.test(direction||'')&&Number.isSafeInteger(Number(number))&&Number(number)>0?'/'+direction+'/'+Number(number):null;}
 function list(value){const u=new URL(value,'https://locus.invalid'),task=direct(u),q=query(u);q.delete('nomer');if(task)u.pathname='/zadachi.html';u.search=q.toString();u.hash='';return u.pathname+u.search;}
 return {direct,query,path,list,entity};
});
