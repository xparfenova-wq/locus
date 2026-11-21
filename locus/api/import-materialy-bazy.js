                                                                           
                                                                               
const {baza,OshibkaVvoda,NeNajdeno}=require('../db/db.js');
const tables=['materialy','dokumenty'];
function read(db,table,id,actor){if(!tables.includes(table)||!Number.isSafeInteger(Number(id))||Number(id)<1)throw new OshibkaVvoda('Нужен материал или документ с номером','materialy');const row=require('./obschij.js').odna(table,require('./opisanija.js').OPISANIJA[table],Number(id),actor),m=require('./materialy-vid.js').present(row);return {vid:'est',tablica:table,id:m.id,nazvanie:m.nazvanie,ssylka:m.ssylka??null,fajl:m.fajl??null,sozdano:m.sozdano??null,versija:m.versija,fajl_dostupen:m.fajl_dostupen};}
function matches(db,url,original=url){return db.prepare("SELECT 'materialy' tablica,id FROM materialy WHERE ssylka IN (?,?) UNION ALL SELECT 'dokumenty' tablica,id FROM dokumenty WHERE ssylka IN (?,?) ORDER BY tablica,id").all(url,original,url,original);}
function parseEntry(db,value,actor){
 let label=null,text=value;if(value&&typeof value==='object'&&!Array.isArray(value)){
  for(const key of Object.keys(value))if(!['tablica','id','ssylka','nazvanie'].includes(key))throw new OshibkaVvoda('Неизвестное поле вложения','materialy');
  if(value.id!==undefined){const found=read(db,value.tablica,value.id,actor);if(value.ssylka!==undefined&&value.ssylka!==found.ssylka)throw new OshibkaVvoda('Ссылка не совпадает с указанным номером вложения','materialy');return found;}text=value.ssylka;label=value.nazvanie??null;
 }
 if(typeof text!=='string'||!text.trim())throw new OshibkaVvoda('В материалах нужна ссылка на файл','materialy');text=text.trim();if(text.length>20000)throw new OshibkaVvoda('Ссылка на материал слишком длинная','materialy');const separator=text.lastIndexOf(' — ');if(separator>=0){label=label||text.slice(0,separator).trim();text=text.slice(separator+3).trim();}
 if(text.startsWith('/api/fajly/')){
  const url=new URL(text,'https://locus.invalid'),match=/^\/api\/fajly\/([1-9]\d*)\/skachat$/.exec(url.pathname);if(!match||!['material','dokument'].includes(url.searchParams.get('obekt'))||url.hash)throw new OshibkaVvoda('Проверь внутреннюю ссылку на файл','materialy');for(const key of url.searchParams.keys())if(!['obekt','fajl'].includes(key)||url.searchParams.getAll(key).length!==1)throw new OshibkaVvoda('Проверь параметры ссылки на файл','materialy');const found=read(db,url.searchParams.get('obekt')==='dokument'?'dokumenty':'materialy',Number(match[1]),actor);if(url.searchParams.has('fajl')&&url.searchParams.get('fajl')!==(found.fajl||found.ssylka||''))throw new OshibkaVvoda('Номер вложения относится к другому исходнику. Сверь файл перед импортом','materialy');return found;
 }
 if(text.startsWith('/fajly/')){
  let key;try{key=decodeURIComponent(text.slice(7));}catch{throw new OshibkaVvoda('Не удалось прочитать имя вложения','materialy');}const rows=db.prepare("SELECT 'materialy' tablica,id FROM materialy WHERE fajl=? OR ssylka=? UNION ALL SELECT 'dokumenty' tablica,id FROM dokumenty WHERE fajl=? OR ssylka=?").all(key,text,key,text);if(rows.length!==1)throw new OshibkaVvoda('У старой ссылки не найден единственный исходник. Выбери существующий файл или оставь ссылку в своём поле','materialy');return read(db,rows[0].tablica,rows[0].id,actor);
 }
 let url;try{url=new URL(text);}catch{throw new OshibkaVvoda('В материалах нужна полная ссылка HTTP или HTTPS. Путь к файлу без исходника можно сохранить в своём поле','materialy');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new OshibkaVvoda('В материалах нужна ссылка HTTP или HTTPS без логина и пароля','materialy');const canonical=url.href,existing=matches(db,canonical,text);if(existing.length>1)throw new OshibkaVvoda('Эта ссылка относится к нескольким вложениям. Выбери конкретный файл в базе','materialy');if(existing.length)return read(db,existing[0].tablica,existing[0].id,actor);
 if(label!==null&&typeof label!=='string')throw new OshibkaVvoda('Название материала должно быть текстом','materialy');let name=label;try{name=name||decodeURIComponent(url.pathname.split('/').filter(Boolean).pop()||'')||url.hostname;}catch{name=name||url.hostname;}name=require('./bazy-pravki.js').importApi.text(name,'materialy',{required:true,max:2000});let fileHint=url.pathname.split('/').pop()||'';try{fileHint=decodeURIComponent(fileHint);}catch{}require('./materialy-validacija.js').validate({nazvanie:name,ssylka:canonical,fajl:fileHint});return {vid:'novyj',tablica:'materialy',ssylka:canonical,nazvanie:name};
}
function prepare(db,value,actor){
 if(value==null||value==='')return[];let list=value;if(typeof value==='string'){const text=value.trim();if(text.startsWith('[')){try{list=JSON.parse(text);}catch{throw new OshibkaVvoda('Не удалось прочитать список вложений','materialy');}}else list=text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);}if(!Array.isArray(list)||list.length>100)throw new OshibkaVvoda('В одной строке допускается до 100 ссылок на вложения','materialy');const result=[],seen=new Set();for(const entry of list){const item=parseEntry(db,entry,actor),key=item.vid==='est'?item.tablica+':'+item.id:'url:'+item.ssylka;if(!seen.has(key)){seen.add(key);result.push(item);}}return result;
}
function apply(db,ctx,member,plans){let added=0,created=0;
 for(const item of plans){let table=item.tablica,id=item.id;if(item.vid==='novyj'){
   const current=matches(db,item.ssylka);if(current.length>1)throw new OshibkaVvoda('У ссылки появилось несколько вложений. Повтори сверку','materialy');if(current.length){table=current[0].tablica;id=current[0].id;}else{const saved=require('./materialy-komandy.js').create('materialy',{chelovek_id:member.kto,nazvanie:item.nazvanie,ssylka:item.ssylka},ctx.avtor);id=saved.id;created++;}
  }
  if(db.prepare('SELECT 1 FROM vklady_baz WHERE stroka_id=? AND tablica=? AND material_id=?').get(member.id,table,id))continue;const core=require('./bazy-pravki.js'),fresh=core.present(db,'stroka',db.prepare('SELECT * FROM bazy_ljudi WHERE id=?').get(member.id));core.attachments({...ctx,metod:'POST',telo:{stroka_id:member.id,tablica:table,material_id:id,versii:fresh.versii}});added++;
 }
 return {dobavleno_svjazej:added,novyh_materialov:created};
}
module.exports={prepare,apply};
