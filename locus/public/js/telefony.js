(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LocusTelefony=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const digits=value=>String(value??'').replace(/\D/g,'');
 const fail=(message,code)=>{throw Object.assign(new Error(message),{code});};
 function format(value,mask){
  const numbers=digits(value);let index=0,out='';
  for(const char of String(mask||'')){
   if(index>=numbers.length)break;
   if(/\d/.test(char))out+=numbers[index++];else out+=char;
  }
  return index<numbers.length?'+'+numbers:out;
 }
 function razobrat(value,catalog,options={}){
  const raw=String(value??'').trim();
  if(!raw||!digits(raw))fail('В номере нет цифр','invalid_phone');
  if(!/^\+?[\d\s()-]+$/u.test(raw))fail('В телефоне недопустимые символы','invalid_phone_chars');
  if(options.bez_maski!==undefined&&typeof options.bez_maski!=='boolean')fail('Выбери режим маски телефона','invalid_phone_options');
  const selected=options.strana==null?null:catalog.find(x=>x.kod_strany===options.strana);
  if(options.strana!==undefined&&options.strana!==null&&!selected)fail('Неизвестная страна','neizvestnaja_strana');
  const unmasked=options.bez_maski===true||(Object.hasOwn(options,'strana')&&options.strana===null);
  let numbers=digits(raw);
                                                                                 
  if(!raw.startsWith('+')&&!unmasked){
   if(selected){
    const code=digits(selected.telefonnyj_kod),length=digits(selected.mask).length;
    if(code==='7'&&numbers.length===11&&numbers.startsWith('8'))numbers='7'+numbers.slice(1);
    else if(!(numbers.startsWith(code)&&numbers.length===length))numbers=code+numbers;
   }else if(numbers.length===11&&numbers.startsWith('8'))numbers='7'+numbers.slice(1);
   else if(numbers.length===10)numbers='7'+numbers;
  }
  const candidates=catalog.slice().sort((a,b)=>b.telefonnyj_kod.length-a.telefonnyj_kod.length);
  const country=unmasked?null:selected||candidates.find(x=>numbers.startsWith(digits(x.telefonnyj_kod)));
  if(country&&!numbers.startsWith(digits(country.telefonnyj_kod)))fail('Номер не соответствует выбранному коду страны','phone_country_mismatch');
  const e164='+'+numbers,matching=country?numbers.length===digits(country.mask).length:null;
  if(options.strict&&selected&&!unmasked&&!matching)fail('Номер не соответствует маске выбранной страны','phone_mask_mismatch');
  return {strana:country?.kod_strany??null,nazvanie:country?.nazvanie??null,flag:country?.flag??null,
   telefonnyj_kod:country?.telefonnyj_kod??null,mask:country?.mask??null,
   nacionalnyj:country?numbers.slice(digits(country.telefonnyj_kod).length):numbers,e164,po_maske:matching,
   bez_maski:!country,pokaz:country&&matching?format(e164,country.mask):e164};
 }
 function pokaz(value,catalog){try{const result=razobrat(value,catalog);return result.po_maske?result.pokaz:String(value??'');}catch{return String(value??'');}}
 return {razobrat,format,pokaz};
});
