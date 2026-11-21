(function(){
 'use strict';
 function podkljuchit(input,container,settings={}){
  container.innerHTML='<button type="button" class="kn phone-country" aria-label="Выбрать страну телефона" disabled>страна</button><span class="phone-mask-hint" role="status" aria-live="polite"></span>';
  const button=container.querySelector('button'),hint=container.querySelector('.phone-mask-hint');
  let countries=[],country=null,active=false,ready=false,unmasked=false,failed=false,disposed=false,sequence=0,pasteVersion=0,loading=null,pickerOpen=false,closePicker=null,busy=false;
  const valid=()=>!disposed&&active&&input.isConnected&&!input.disabled&&!input.readOnly;
  const codeOf=c=>c?.telefonnyj_kod?.replace(/\D/g,'')||'';
  const describe=()=>{
   button.textContent=country&&!unmasked?[country.flag,country.telefonnyj_kod].filter(Boolean).join(' '):ready||failed?'Без маски':'страна';
   button.disabled=busy||input.disabled||input.readOnly||(!ready&&!failed);
   hint.textContent=failed?'Маска не загрузилась. Введи номер с + и кодом страны.':unmasked||!country?'Без маски: цифры, плюс, скобки, пробелы и дефисы.':'Маска: '+country.mask;
   if(active)input.placeholder=country&&!unmasked?country.mask:'+код страны и номер';
  };
  const setValue=value=>{
   const previous=input.value,pos=input.selectionStart??previous.length,atEnd=pos===previous.length,kept=previous.slice(0,pos).replace(/\D/g,'').length;
   input.value=value;
   let index=0,count=0;while(index<value.length&&count<kept){if(/\d/.test(value[index]))count++;index++;}
   try{input.setSelectionRange(atEnd?value.length:index,atEnd?value.length:index);}catch{}
  };
  const options=()=>{
   if(failed&&!input.value.trim().startsWith('+'))throw Object.assign(new Error('Введи номер с + и кодом страны'),{kod:400});
   return unmasked||!country?{bez_maski:true}:{strana:country.kod_strany};
  };
  const changed=()=>input.dispatchEvent(new Event('input',{bubbles:true}));
  const format=event=>{
   sequence++;if(event?.inputType!=='insertFromPaste')pasteVersion++;if(!valid()||!ready||unmasked||!input.value.trim())return;
   try{
    const raw=input.value,explicit=raw.trim().startsWith('+'),numbers=raw.replace(/\D/g,'');
    const keep=country&&(!explicit||numbers.startsWith(codeOf(country)));
    const result=LocusTelefony.razobrat(raw,countries,keep?{strana:country.kod_strany}:{});
    country=countries.find(x=>x.kod_strany===result.strana)||null;
    if(country)setValue(LocusTelefony.format(result.e164,country.mask));
    describe();
   }catch{}
  };
  const load=()=>{
   if(ready)return Promise.resolve();
   if(loading)return loading;
   loading=API.maskiTelefonov().then(data=>{
    if(disposed)return;countries=data.countries;ready=true;failed=false;
    if(settings.existing){
     try{const parsed=LocusTelefony.razobrat(input.value,countries);country=parsed.po_maske?countries.find(x=>x.kod_strany===parsed.strana):null;}catch{country=null;}
     unmasked=!country;
    }else if(!country&&!unmasked)country=countries.find(x=>x.kod_strany===data.defaults.strana_po_umolchaniju);
    if(valid()){
     if(!settings.existing&&!input.value.trim()&&!unmasked)input.value=country.telefonnyj_kod;
     format();describe();if(!settings.existing){input.focus();try{input.setSelectionRange(input.value.length,input.value.length);}catch{}}
    }
   }).catch(error=>{if(disposed)return;failed=true;unmasked=true;country=null;describe();if(error.telo?.sessija_izmenilas)return;})
    .finally(()=>{loading=null;});return loading;
  };
  const choose=selected=>{
   if(!valid())return;
   const raw=input.value,oldCode=codeOf(country),numbers=raw.replace(/\D/g,''),canFormat=/^\+?[\d\s()-]*$/u.test(raw);
   const national=raw.trim().startsWith('+')&&oldCode&&numbers.startsWith(oldCode)?numbers.slice(oldCode.length):numbers;
   country=selected;unmasked=!selected;
   if(selected&&canFormat)setValue(LocusTelefony.format(selected.telefonnyj_kod+national,selected.mask));
   describe();changed();input.focus();
  };
  const open=async()=>{
   if(!valid())return;await load();if(!valid())return;
   if(pickerOpen)return;pickerOpen=true;
   let searchSequence=0,timer;
   const close=O.modalka('Страна телефона','<label class="l-field phone-country-search"><span class="l-label">страна или код</span><input class="sozd-vvod" type="search" data-phone-country-search autocomplete="off" placeholder="например, Германия или +49"></label><div class="phone-country-options" data-phone-country-options></div><p class="phone-mask-hint" data-phone-country-status role="status"></p><button type="button" class="kn phone-country-unmasked" data-phone-unmasked>Без маски</button>',null,{poverh:true,priZakrytii:()=>{pickerOpen=false;closePicker=null;searchSequence++;clearTimeout(timer);}});closePicker=close;
   const root=document.querySelector('.vyb-fon:not([hidden])'),search=root.querySelector('[data-phone-country-search]'),list=root.querySelector('[data-phone-country-options]'),status=root.querySelector('[data-phone-country-status]');
   const draw=rows=>{
    list.replaceChildren();for(const row of rows){const item=document.createElement('button');item.type='button';item.className='kn phone-country-option';item.dataset.phoneCountry=row.kod_strany;item.textContent=[row.flag,row.nazvanie,row.telefonnyj_kod].filter(Boolean).join(' ');item.onclick=()=>{close();choose(row);};list.append(item);}
    status.textContent=rows.length?'':failed?'Список стран не загрузился. Можно выбрать «Без маски».':'Страна не найдена. Можно выбрать «Без маски».';
   };
   const find=async()=>{
    const seq=++searchSequence,q=search.value.trim();
    try{const response=await API.spisok('kontakty/strany',{q});if(seq!==searchSequence||!search.isConnected||search.value.trim()!==q)return;draw(response.spisok||[]);}
    catch(error){if(seq===searchSequence&&search.isConnected)status.textContent='Не загрузились страны: '+error.message;}
   };
   root.querySelector('[data-phone-unmasked]').onclick=()=>{close();choose(null);};
   search.oninput=()=>{searchSequence++;clearTimeout(timer);timer=setTimeout(find,120);};
   draw(countries);search.focus();
  };
  const pasted=event=>{
   if(!valid())return;const pastedText=event.clipboardData?.getData('text'),ticket=++pasteVersion;
   const before=input.value,start=input.selectionStart??0,end=input.selectionEnd??0,fullSelection=start===0&&end===before.length;
   const digits=pastedText?.replace(/\D/g,'')||'',code=codeOf(country),nationalLength=country?country.mask.replace(/\D/g,'').length-code.length:null;
   const emptyNational=before.replace(/\D/g,'').length<=code.length;
   const wholeNumber=Boolean(pastedText&&(pastedText.trim().startsWith('+')||fullSelection||emptyNational||(nationalLength&&digits.length>=nationalLength)));
   setTimeout(async()=>{
    if(!valid()||ticket!==pasteVersion)return;const raw=wholeNumber?pastedText:input.value,seen=input.value,seq=++sequence;
    let opts={};try{
     if(unmasked)opts={bez_maski:true};else if(country&&(!raw.trim().startsWith('+')||raw.replace(/\D/g,'').startsWith(codeOf(country))))opts={strana:country.kod_strany};
     const result=await API.razobratTelefon(raw,opts);
     if(!valid()||seq!==sequence||input.value!==seen)return;
     if(!unmasked){country=countries.find(x=>x.kod_strany===result.strana)||null;if(country)setValue(LocusTelefony.format(result.e164,country.mask));}
     describe();
    }catch(error){if(valid()&&seq===sequence&&!error.telo?.sessija_izmenilas)hint.textContent=error.message;}
   },0);
  };
  button.addEventListener('click',open);input.addEventListener('input',format);input.addEventListener('paste',pasted);
  const observer=new MutationObserver(()=>{if(!disposed)describe();});observer.observe(input,{attributes:true,attributeFilter:['readonly','disabled']});
  return {
   setActive(value){active=Boolean(value);sequence++;pasteVersion++;container.hidden=!active;if(active){input.type='tel';input.inputMode='tel';if(ready){if(!input.value.trim()&&!unmasked)input.value=country?.telefonnyj_kod||'';format();describe();}else load();}},
   async parametry(proverit=false){if(!ready&&!failed)await load();if(disposed)throw Object.assign(new Error('Форма закрыта'),{kod:400});const opts=options();if(proverit&&ready)LocusTelefony.razobrat(input.value,countries,{...opts,strict:true});return opts;},
   estNomer(){return input.value.replace(/\D/g,'').length>(country&&!unmasked?codeOf(country).length:0);},
   uderzhatFocus(target){return pickerOpen||container.contains(target)||input===target;},
   neIzmenilsja(value,original){try{return ready&&LocusTelefony.razobrat(value,countries,options()).e164===LocusTelefony.razobrat(original,countries).e164;}catch{return false;}},
   blokirovat(value){busy=Boolean(value);sequence++;pasteVersion++;describe();},
   dispose(){disposed=true;active=false;sequence++;pasteVersion++;observer.disconnect();closePicker?.();input.removeEventListener('input',format);input.removeEventListener('paste',pasted);button.removeEventListener('click',open);},
  };
 }
 window.LocusTelefonInput={podkljuchit};
})();
