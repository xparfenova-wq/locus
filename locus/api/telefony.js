const {OshibkaVvoda}=require('../db/db');
const core=require('../public/js/telefony');
const STRANY = [
  { kod_strany: 'ru', nazvanie: 'Россия', telefonnyj_kod: '+7', flag: '🇷🇺', mask: '+7 (999) 123-45-67' },
  { kod_strany: 'kz', nazvanie: 'Казахстан', telefonnyj_kod: '+7', flag: '🇰🇿', mask: '+7 (700) 123-45-67' },
  { kod_strany: 'by', nazvanie: 'Беларусь', telefonnyj_kod: '+375', flag: '🇧🇾', mask: '+375 29 123-45-67' },
  { kod_strany: 'ua', nazvanie: 'Украина', telefonnyj_kod: '+380', flag: '🇺🇦', mask: '+380 50 123-45-67' },
  { kod_strany: 'us', nazvanie: 'США', telefonnyj_kod: '+1', flag: '🇺🇸', mask: '+1 (555) 123-4567' },
  { kod_strany: 'de', nazvanie: 'Германия', telefonnyj_kod: '+49', flag: '🇩🇪', mask: '+49 151 12345678' },
  { kod_strany: 'gb', nazvanie: 'Великобритания', telefonnyj_kod: '+44', flag: '🇬🇧', mask: '+44 7400 123456' },
  { kod_strany: 'fr', nazvanie: 'Франция', telefonnyj_kod: '+33', flag: '🇫🇷', mask: '+33 6 12 34 56 78' },
  { kod_strany: 'it', nazvanie: 'Италия', telefonnyj_kod: '+39', flag: '🇮🇹', mask: '+39 312 345 6789' },
  { kod_strany: 'es', nazvanie: 'Испания', telefonnyj_kod: '+34', flag: '🇪🇸', mask: '+34 612 345 678' },
  { kod_strany: 'nl', nazvanie: 'Нидерланды', telefonnyj_kod: '+31', flag: '🇳🇱', mask: '+31 6 12345678' },
  { kod_strany: 'pl', nazvanie: 'Польша', telefonnyj_kod: '+48', flag: '🇵🇱', mask: '+48 512 345 678' },
  { kod_strany: 'tr', nazvanie: 'Турция', telefonnyj_kod: '+90', flag: '🇹🇷', mask: '+90 532 123 45 67' },
  { kod_strany: 'ae', nazvanie: 'ОАЭ', telefonnyj_kod: '+971', flag: '🇦🇪', mask: '+971 50 123 4567' },
  { kod_strany: 'il', nazvanie: 'Израиль', telefonnyj_kod: '+972', flag: '🇮🇱', mask: '+972 50 123 4567' },
  { kod_strany: 'ge', nazvanie: 'Грузия', telefonnyj_kod: '+995', flag: '🇬🇪', mask: '+995 555 12 34 56' },
  { kod_strany: 'am', nazvanie: 'Армения', telefonnyj_kod: '+374', flag: '🇦🇲', mask: '+374 77 123456' },
  { kod_strany: 'uz', nazvanie: 'Узбекистан', telefonnyj_kod: '+998', flag: '🇺🇿', mask: '+998 90 123 45 67' },
  { kod_strany: 'cn', nazvanie: 'Китай', telefonnyj_kod: '+86', flag: '🇨🇳', mask: '+86 131 2345 6789' },
  { kod_strany: 'in', nazvanie: 'Индия', telefonnyj_kod: '+91', flag: '🇮🇳', mask: '+91 98765 43210' },
  { kod_strany: 'br', nazvanie: 'Бразилия', telefonnyj_kod: '+55', flag: '🇧🇷', mask: '+55 11 91234-5678' },
  { kod_strany: 'rs', nazvanie: 'Сербия', telefonnyj_kod: '+381', flag: '🇷🇸', mask: '+381 60 1234567' },
  { kod_strany: 'th', nazvanie: 'Таиланд', telefonnyj_kod: '+66', flag: '🇹🇭', mask: '+66 81 234 5678' },
  { kod_strany: 'cy', nazvanie: 'Кипр', telefonnyj_kod: '+357', flag: '🇨🇾', mask: '+357 96 123456' },
];
function razobrat(value,options={}){try{return core.razobrat(value,STRANY,options);}catch(cause){const error=new OshibkaVvoda(cause.message,'znachenie');error.kod=422;error.dannye={kod:cause.code||'invalid_phone'};throw error;}}
function parametry(source={},query=false){
 const options={};if(source.strana!==undefined)options.strana=typeof source.strana==='string'?source.strana.toLowerCase():source.strana;
 if(source.bez_maski!==undefined){const value=source.bez_maski;options.bez_maski=query&&['true','1','false','0'].includes(value)?['true','1'].includes(value):value;}
 return options;
}
module.exports={STRANY:Object.freeze(STRANY.map(Object.freeze)),razobrat,parametry,pokaz:value=>core.pokaz(value,STRANY),format:core.format};
