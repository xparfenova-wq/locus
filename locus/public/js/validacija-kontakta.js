(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LocusValidacijaKontakta=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const fail=(message,code,status=422)=>{throw Object.assign(new Error(message),{code,status});};
 function proverit(kind,value){
  const text=String(value??'').trim();
  if(!text)fail('Нужно значение контакта','pustoe_znachenie_kontakta');
  if(text.length>255)fail('Контакт: от 1 до 255 символов','contact_length',400);
  if(kind==='telefon'){
   if(/[^\d+\s()-]/u.test(text))fail('В телефоне только цифры','invalid_phone_chars');
   if(!/\d/.test(text))fail('В номере нет цифр','invalid_phone');
   if(!/^\+?[\d\s()-]+$/u.test(text))fail('Плюс может стоять только в начале телефона','invalid_phone_chars');
  }
  if(kind==='pochta'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))fail('В почте нужен символ собачки и адрес домена','invalid_email');
  return text;
 }
 const tekstDublya=kind=>kind==='telefon'?'Такой телефон уже есть у этого человека':kind==='pochta'?'Такая почта уже есть у этого человека':'Такой контакт уже есть у этого человека';
 return {proverit,tekstDublya};
});
