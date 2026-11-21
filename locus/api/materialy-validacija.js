const {OshibkaVvoda}=require('../db/db.js');
const PREDEL=52428800;
const EXECUTABLE=/^(application\/(?:x-msdownload|x-msdos-program|x-executable|x-sh|x-shellscript|x-bat|x-ms-installer)|text\/x-(?:shellscript|script\.(?:sh|bat)))$/i;
function error(text,field,code,details={}){const e=new OshibkaVvoda(text,field);e.dannye={kod:code,soobshchenie:text,...details};return e;}
function validate(d){
 if(d.ssylka!=null&&d.ssylka!==''){
  const value=String(d.ssylka).trim();let valid=false;
  if(value.startsWith('/fajly/')&&!/[\u0000-\u0020\\]/.test(value)){
   try{const pathname=decodeURIComponent(value.slice('/fajly/'.length));valid=!!pathname&&!pathname.includes('/')&&!pathname.includes('\\')&&pathname!=='.'&&pathname!=='..'&&!/[\u0000-\u001f\u007f]/.test(pathname);}catch{}
  }else{try{const url=new URL(value);valid=['https:','http:'].includes(url.protocol)&&!!url.hostname&&!/[\u0000-\u0020\u007f]/.test(value);}catch{}}
  if(!valid)throw error('Нужен полный адрес с https:// в начале','ssylka','nevernaja_shema_ssylki');
  d.ssylka=value;
 }
 if(d.razmer!=null){
  const bytes=Number(d.razmer);
  if(typeof d.razmer==='boolean'||!Number.isSafeInteger(bytes)||bytes<0)throw error('Размер файла должен быть целым числом байт','razmer','nevernyj_razmer_fajla');
  if(bytes>PREDEL){const e=error('файл больше 50 МБ, приложите ссылкой','razmer','fajl_slishkom_bolshoj',{predel_bajt:PREDEL,fakticheski_bajt:bytes});e.kod=413;throw e;}
  d.razmer=bytes;
 }
 const name=String(d.fajl||'').trim(),extension=name.split(/[\\/]/).pop().split('.').pop().toLowerCase(),mime=String(d.tip_fajla||'').split(';')[0].trim();
 if((name.includes('.')&&['exe','app','sh','bat','cmd'].includes(extension))||EXECUTABLE.test(mime))throw error('исполняемые файлы не принимаются','fajl','ispolnjaemyj_fajl');
}
module.exports={validate,PREDEL};
