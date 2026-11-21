const crypto=require('node:crypto');
const GLOBE='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#777782" stroke-width="1.4"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" stroke="#777782" stroke-width="1.4"/></svg>';
const FIGMA='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36"><path d="M6 36a6 6 0 0 0 6-6v-6H6a6 6 0 0 0 0 12Z" fill="#0acf83"/><path d="M0 18a6 6 0 0 1 6-6h6v12H6a6 6 0 0 1-6-6Z" fill="#a259ff"/><path d="M0 6a6 6 0 0 1 6-6h6v12H6a6 6 0 0 1-6-6Z" fill="#f24e1e"/><path d="M12 0h6a6 6 0 0 1 0 12h-6Z" fill="#ff7262"/><circle cx="18" cy="18" r="6" fill="#1abcfe"/></svg>';
const DRIVE='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m9 2 6 0 9 16-6 0Z" fill="#fbbc04"/><path d="m9 2 6 10-6 10H3l-3-5Z" fill="#34a853"/><path d="M9 12h12l3 6-3 4H3Z" fill="#4285f4"/></svg>';
const cache=new Map();
function domain(value){
 if(typeof value!=='string'||value.length>253)return null;
 try{const url=new URL('https://'+value);return url.hostname&&url.host===value.toLowerCase()&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash?url.hostname.toLowerCase():null;}catch{return null;}
}
function icon(host){
 const normalized=domain(host);if(!normalized)return null;
 if(cache.has(normalized))return cache.get(normalized);
 const name=normalized.startsWith('www.')?normalized.slice(4):normalized;
 const svg=name==='figma.com'?FIGMA:['drive.google.com','docs.google.com'].includes(name)?DRIVE:GLOBE;
 const buffer=Buffer.from(svg),result={buffer,etag:'"'+crypto.createHash('sha256').update(buffer).digest('hex')+'"'};
 if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(normalized,result);return result;
}
function shorten(value,limit=255){
 const name=String(value||'');if(Buffer.byteLength(name)<=limit)return name;
 const match=name.match(/\.[\p{L}\p{N}]{1,16}$/u),extension=match?match[0]:'',body=extension?name.slice(0,-extension.length):name,budget=limit-Buffer.byteLength(extension)-3;
 let prefix='',size=0;for(const char of body){const bytes=Buffer.byteLength(char);if(size+bytes>budget)break;prefix+=char;size+=bytes;}
 return prefix+'…'+extension;
}
function present(row){
 if(!row||typeof row!=='object')return row;
 let host=null;try{const url=new URL(row.ssylka);if(['https:','http:'].includes(url.protocol))host=url.hostname;}catch{}
 const local=!!row.fajl||String(row.ssylka||'').startsWith('/fajly/');
 return {...row,host,favicon_url:host?'/api/favicon?host='+encodeURIComponent(host):null,
  fajl_dostupen:local?require('./materialy-komandy.js').available(row):null,
  razmer_bajt:row.razmer??null,kljuch_fajla:row.fajl||null,imja_na_ekrane:shorten(row.nazvanie),
  kto_dobavil_imja:row.avtor||row.kto_dobavil_imja||null,kogda_dobavlen:row.sozdano||null};
}
function unavailablePage(headers){
 let back='/zadachi.html';
 try{const url=new URL(headers.referer);if(['http:','https:'].includes(url.protocol)&&url.host===headers.host&&!url.username&&!url.password)back=url.href;}catch{}
 const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Файл пока недоступен — Locus</title><link rel="stylesheet" href="/css/obschij.css"></head><body><main class="file-unavailable-page"><h1>Файл пока недоступен</h1><p>Вернитесь к записи, чтобы проверить вложение или прикрепить исходник.</p><a class="kn" href="'+escape(back)+'">вернуться к записи</a></main></body></html>';
}
module.exports={icon,present,shorten,unavailablePage};
