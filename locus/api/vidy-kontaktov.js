const {OshibkaVvoda}=require('../db/db.js');
const CATALOG=[
 ['telegram','Телеграм','text'],['telefon','Телефон','tel'],['pochta','Почта','email'],
 ['sajt','Сайт','url'],['instagram','Instagram','text'],['youtube','YouTube','url'],
 ['vk','ВКонтакте','url'],['linkedin','LinkedIn','url'],['drugoe','Другое','text'],
].map(([znachenie,nazvanie,podskazka_vvoda])=>Object.freeze({znachenie,nazvanie,podskazka_vvoda,
 dejstvija:Object.freeze(znachenie==='drugoe'?['kopirovat']:['kopirovat','otkryt'])}));
const VIDY=Object.freeze(CATALOG.map(row=>row.znachenie));
function proverit(kind){
 const row=CATALOG.find(item=>item.znachenie===kind);
 if(!row){const error=new OshibkaVvoda('Неизвестный вид контакта','tip');error.dannye={kod:'neizvestnyj_vid_kontakta'};throw error;}
 return row;
}
function dto(row){
 const kind=CATALOG.find(item=>item.znachenie===row.tip),link=kind&&row.tip!=='drugoe'?ssylka(row):null;
 const direct=['telefon','pochta','telegram'].includes(row.tip);
 return {tip_nazvanie:kind?.nazvanie||'Другой контакт',podskazka_vvoda:kind?.podskazka_vvoda||'text',
  pokaz:row.tip==='telefon'?require('./telefony').pokaz(row.znachenie):row.znachenie,
  dejstvija:kind?[...kind.dejstvija]:['kopirovat'],url:direct?null:link,deeplink:direct?link:null,
  ...(!kind?{neizvestnyj_tip:true}:{})};
}
function ssylka(row){
 const value=String(row.znachenie||'').trim();
 if(row.tip==='telefon')return /^\d+$/.test(row.znachenie_norm||'')?'tel:+'+row.znachenie_norm:null;
 if(row.tip==='pochta')return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)?'mailto:'+encodeURIComponent(value):null;
 if(row.tip==='telegram'&&/^[a-z0-9_]+$/i.test(row.znachenie_norm||''))return 'https://t.me/'+row.znachenie_norm;
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{}
 if(!value||/[\s\u0000-\u001f\u007f<>"\\]/u.test(value)||/^[a-z][a-z\d+.-]*:/i.test(value))return null;
 const handles={instagram:'https://www.instagram.com/',youtube:'https://www.youtube.com/@',vk:'https://vk.com/',linkedin:'https://www.linkedin.com/in/'};
 if(handles[row.tip]&&/^@?[a-z\d_.-]+$/i.test(value)&&! /^(www\.)?(instagram\.com|youtube\.com|vk\.com|linkedin\.com)$/i.test(value)){return handles[row.tip]+value.replace(/^@/,'');}
 try{const url=new URL(value.startsWith('//')?'https:'+value:'https://'+value);return url.hostname.includes('.')&&['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
module.exports={CATALOG:Object.freeze(CATALOG),VIDY,proverit,dto,ssylka};
