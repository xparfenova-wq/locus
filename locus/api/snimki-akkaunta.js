const {OshibkaVvoda,segodnja}=require('../db/db.js');
const POLJA=['podpischikov','publikacij_vsego','summa_prosmotrov','ohvat','vovlechennost'];
function daty(row){
 try{const value=JSON.parse(row?.daty_izmerenij||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
 catch{return {};}
}
function dataPolja(row,field){
 const date=daty(row)[field];
 try{require('./kalendar.js').data(date,'data');if(date<=row.data)return date;}catch{}
 return row.data;
}
function momentPolja(row,field){
 const value=daty(row)._kogda?.[field];
 return typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
}
function poslednee(rows,field,cutoff='9999-12-31'){
 const rank=row=>[dataPolja(row,field),momentPolja(row,field)?'1':'0',momentPolja(row,field)||'',row.data||''].join('|');
 return rows.filter(row=>typeof row[field]==='number'&&Number.isFinite(row[field])&&row[field]>=0&&dataPolja(row,field)<=cutoff).sort((a,b)=>rank(b).localeCompare(rank(a)))[0];
}
function podgotovit(d,db){
 if(d.data===undefined)d.data=segodnja();
 require('./kalendar.js').data(d.data,'data');
 if(!Number.isSafeInteger(d.akkaunt_id)||!db.prepare('SELECT 1 FROM akkaunty WHERE id=?').get(d.akkaunt_id)){
  throw new OshibkaVvoda('аккаунта нет','akkaunt_id');
 }
 let measured=0;
 for(const field of POLJA)if(Object.hasOwn(d,field)){
  const value=d[field];
  if(value===null)throw new OshibkaVvoda('неизвестное измерение передаётся отсутствием поля',field);
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||field!=='vovlechennost'&&!Number.isSafeInteger(value)){
   throw new OshibkaVvoda('измерение — число от нуля',field);
  }
  measured++;
 }
 if(!measured)throw new OshibkaVvoda('нет измеренных чисел','podpischikov');
 if(d.extra!==undefined){
  if(d.extra===null)throw new OshibkaVvoda('неизвестное поле не передаётся','extra');
  try{const value=typeof d.extra==='string'?JSON.parse(d.extra):d.extra;if(!value||typeof value!=='object')throw new Error();if(Object.hasOwn(value,'title')&&(typeof value.title!=='string'||!value.title.trim()))delete value.title;d.extra=JSON.stringify(value);}
  catch{throw new OshibkaVvoda('extra — JSON объекта или списка','extra');}
 }
 const previous=db.prepare('SELECT * FROM zamery_akkauntov WHERE akkaunt_id=? AND data<=? ORDER BY data DESC').all(d.akkaunt_id,d.data);
 const dates={},times={};
 const context=require('./vremja-sbora.js').tekuschee();
 const stamp=context?.kogda||(d.data===segodnja()?new Date().toISOString():null);
 if(context&&context.data!==d.data)throw new OshibkaVvoda('дата снимка не совпадает с пакетом','data');
 for(const field of POLJA){
  const known=poslednee(previous,field,d.data),oldStamp=known&&momentPolja(known,field);
  const stale=known&&dataPolja(known,field)===d.data&&oldStamp&&(!stamp||oldStamp>stamp);
  if(Object.hasOwn(d,field)&&!stale){dates[field]=d.data;if(stamp)times[field]=stamp;continue;}
  if(known){d[field]=known[field];dates[field]=dataPolja(known,field);if(oldStamp)times[field]=oldStamp;}
 }
 const extras=previous.map(row=>{try{return {row,value:JSON.parse(row.extra)};}catch{return null;}}).filter(item=>item?.value&&typeof item.value==='object'&&!Array.isArray(item.value));
 const incoming=d.extra===undefined?null:JSON.parse(d.extra);
 if(incoming&&!Array.isArray(incoming)||incoming===null&&extras.length){
  const merged={},keys=new Set([...extras.flatMap(item=>Object.keys(item.value)),...Object.keys(incoming&&!Array.isArray(incoming)?incoming:{})]);
  for(const key of keys){
   const field='extra:'+key;
   const known=extras.filter(item=>item.value[key]!==null&&item.value[key]!==undefined)
    .sort((a,b)=>[dataPolja(b.row,field),momentPolja(b.row,field)||''].join('|').localeCompare([dataPolja(a.row,field),momentPolja(a.row,field)||''].join('|')))[0];
   const oldStamp=known&&momentPolja(known.row,field);
   const stale=known&&dataPolja(known.row,field)===d.data&&oldStamp&&(!stamp||oldStamp>stamp);
   if(incoming&&!Array.isArray(incoming)&&Object.hasOwn(incoming,key)&&incoming[key]!==null&&!stale){merged[key]=incoming[key];dates[field]=d.data;if(stamp)times[field]=stamp;}
   else if(known){merged[key]=known.value[key];dates[field]=dataPolja(known.row,field);if(oldStamp)times[field]=oldStamp;}
  }
  d.extra=JSON.stringify(merged);
 }else if(d.extra===undefined){const known=previous.find(row=>row.extra!==null);if(known)d.extra=known.extra;}
 if(Object.keys(times).length)dates._kogda=times;
 d.daty_izmerenij=JSON.stringify(dates);
}
function povtornaja(d,db){
 if(!db.prepare('SELECT 1 FROM zamery_akkauntov WHERE akkaunt_id=? AND data=?').get(d.akkaunt_id,d.data))return false;
 const fields=Object.keys(d).filter(field=>!['akkaunt_id','data'].includes(field));
 db.prepare('UPDATE zamery_akkauntov SET '+fields.map(field=>'"'+field+'"=?').join(',')+' WHERE akkaunt_id=? AND data=?').run(...fields.map(field=>d[field]),d.akkaunt_id,d.data);
 return true;
}
module.exports={POLJA,daty,dataPolja,momentPolja,poslednee,podgotovit,povtornaja};
