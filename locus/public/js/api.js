                                                                  
                                                                 

(function () {
'use strict';

                                                               
                                                                            
const JA=Number.isSafeInteger(window.LocusSessija?.chelovek_id)&&window.LocusSessija.chelovek_id>0?window.LocusSessija.chelovek_id:null;

let loginEpoch=0,sessionChanged=false,reloginDialog=null;
function clearExpiredSession(){
  document.querySelectorAll('.locus-session-expired,.locus-session-restored').forEach(e=>e.remove());
  if(reloginDialog?.open)reloginDialog.close();
}
function openRelogin(){
  if(sessionChanged)return;
  if(!reloginDialog){
    reloginDialog=document.createElement('dialog');reloginDialog.className='locus-relogin';
    reloginDialog.setAttribute('aria-labelledby','locus-relogin-title');
    reloginDialog.innerHTML='<form class="l-form"><h2 id="locus-relogin-title">Снова войти в Локус</h2>'
      +'<p>Введённый текст остаётся на этой странице. После входа повтори сохранение.</p>'
      +'<label class="l-field"><span class="l-label">Логин</span><input name="login" autocomplete="username" required></label>'
      +'<label class="l-field"><span class="l-label">Пароль</span><input name="parol" type="password" autocomplete="current-password" required></label>'
      +'<p class="locus-relogin-error" role="status" aria-live="polite"></p>'
      +'<div class="locus-relogin-actions"><button class="kn" type="button" data-relogin-cancel>пока закрыть</button>'
      +'<button class="kn tmn" type="submit">войти</button></div></form>';
    document.body.appendChild(reloginDialog);
    const form=reloginDialog.querySelector('form'),password=form.elements.parol,status=form.querySelector('.locus-relogin-error'),submit=form.querySelector('[type=submit]');
    let pending=false;
    const close=()=>{reloginDialog.close();password.value='';};
    form.querySelector('[data-relogin-cancel]').addEventListener('click',close);
    reloginDialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    });
    reloginDialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(pending)return;
      pending=true;submit.disabled=true;form.setAttribute('aria-busy','true');status.textContent='Входим…';
      try{
        const response=await fetch('/api/vhod/parol',{method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({login:form.elements.login.value,parol:password.value,prodlit_dlja:JA})});
        const data=await response.json().catch(()=>null);
        if(!response.ok)throw new Error(data?.oshibka||'Вход не выполнен. Попробуй ещё раз.');
        if(data?.chelovek?.id!==JA)throw new Error('Вход не совпал с участником этой страницы.');
        loginEpoch++;clearExpiredSession();status.textContent='';
        document.dispatchEvent(new CustomEvent('locus:session-restored'));
        const text='Вход восстановлен. Повтори сохранение в открытой форме.';
        if(window.O?.tost){
          window.O.tost(text);document.querySelector('.tost')?.classList.add('locus-session-restored');
        }else{
          const message=document.createElement('div');message.className='tost locus-session-restored';message.setAttribute('role','status');message.textContent=text;document.body.appendChild(message);setTimeout(()=>message.remove(),6000);
        }
      }catch(error){status.textContent=error instanceof TypeError?'Не получилось связаться с Локусом. Проверь соединение и попробуй снова.':error.message;}
      finally{password.value='';pending=false;submit.disabled=false;form.removeAttribute('aria-busy');}
    });
  }
  if(!reloginDialog.open)reloginDialog.showModal();
}
function showExpiredSession(){
  if(!JA||sessionChanged||document.querySelector('.locus-session-expired'))return;
  document.querySelector('.locus-session-restored')?.remove();
  const note=document.createElement('aside');note.className='locus-session-note locus-session-expired';note.setAttribute('role','status');
  const text=document.createElement('span');text.textContent='Сессия закончилась. Введённый текст остаётся в открытых полях.';
  const button=document.createElement('button');button.type='button';button.className='kn';button.textContent='войти снова';button.addEventListener('click',openRelogin);
  note.append(text,button);document.body.appendChild(note);
}

                                                                             
                                                                         
                                                                                 
const fetchSession=window.fetch.bind(window);
const responseActions=new WeakMap();
window.fetch=function(input,options){
  const epoch=loginEpoch;
  const action=window.O?.lastActionSnapshot?.()||null;
  let url;
  try{url=new URL(input instanceof Request?input.url:input,location.href);}catch{return fetchSession(input,options);}
  if(JA&&url.origin===location.origin&&url.pathname.startsWith('/api/')){
    const headers=new Headers(input instanceof Request?input.headers:undefined);
    new Headers(options?.headers).forEach((value,name)=>headers.set(name,value));
    headers.set('x-locus-page-user',String(JA));
    try{const context=window.O?.errorContext?.();if(context){let encoded=encodeURIComponent(JSON.stringify(context));if(encoded.length>4096)encoded=encodeURIComponent(JSON.stringify({screen:context.screen,url:context.url,obekt:context.obekt,entity_num:context.entity_num}));if(encoded.length<=4096)headers.set('x-locus-context',encoded);}}catch{}
    options={...options,headers};
  }
  return fetchSession(input,options).then(response=>{
    responseActions.set(response,action);
    const ownApi=url.origin===location.origin&&url.pathname.startsWith('/api/');
    if(ownApi&&response.headers.get('x-locus-session-changed')==='1'){
      sessionChanged=true;clearExpiredSession();document.dispatchEvent(new CustomEvent('locus:session-changed'));
    }
    if(ownApi&&response.status>=500&&url.pathname!=='/api/oshibki')document.dispatchEvent(new CustomEvent('locus:request-error',{detail:{status:response.status,action,serverLogged:response.headers.get('x-locus-error-logged')==='1',message:'Запрос '+url.pathname+' завершился ошибкой '+response.status}}));
    if(ownApi&&response.status===401&&!/^\/api\/vhod(?:\/|$)/.test(url.pathname)&&epoch===loginEpoch)showExpiredSession();
    return response;
  });
};

async function zapros(metod, put, telo, options={}) {
  const otvet = await fetch('/api' + put, {
    method: metod,
    headers: { 'content-type': 'application/json' },
    signal: options.signal,
    body: telo === undefined ? undefined : JSON.stringify(telo),
  });
  const dannye = await otvet.json().catch(() => null);
  if (otvet.status >= 400) {
    const e = new Error((dannye && dannye.oshibka) || 'ошибка ' + otvet.status);
    e.kod = otvet.status; e.telo = dannye;
    if(!put.startsWith('/oshibki'))document.dispatchEvent(new CustomEvent('locus:request-failed',{detail:{status:otvet.status,message:e.message,action:responseActions.get(otvet)||null}}));
    throw e;
  }
  return dannye;
}

const API = {
  spisok: (chto, filtry = {}) => {
    const q = new URLSearchParams(
      Object.entries(filtry).filter(([, v]) => v !== null && v !== undefined && v !== '')
    ).toString();
    return zapros('GET', `/${chto}${q ? '?' + q : ''}`);
  },
  odna:   (chto, kljuch) => zapros('GET', `/${chto}/${kljuch}`),
  sozdat: (chto, telo) => chto==='zadachi'?API.sozdatZadachu(telo):['celi','rezultaty','zamery'].includes(chto)?API.sozdatOkr(chto,telo):zapros('POST', `/${chto}`, telo),
                                                                
                                                              
                                                  
  pravit: (chto, kljuch, telo) =>
    zapros('PATCH', kljuch === '' || kljuch === null || kljuch === undefined
      ? `/${chto}` : `/${chto}/${kljuch}`, telo),
  udalit: (chto, kljuch, telo) =>
    zapros('DELETE', kljuch === '' || kljuch === null || kljuch === undefined
      ? `/${chto}` : `/${chto}/${kljuch}`, telo),
  dejstvie: (put, telo) => zapros('POST', put, telo),
                                                              
                                       
  zapros,
  ekran: (imja, filtry = {}) => {
    const q = new URLSearchParams(
      Object.entries(filtry).filter(([, v]) => v !== null && v !== undefined && v !== '')
    ).toString();
    return zapros('GET', `/${imja}${q ? '?' + q : ''}`);
  },
};

                                                                             
const creationStorage=()=>`locus-task-creation-intent:${JA}`;
let creationIntent=null,creationBusy=false,creationPromise=null;
const creationUUID=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
const creationBody=value=>JSON.stringify(ordered(value));
function creationStore(){try{if(creationIntent)sessionStorage.setItem(creationStorage(),JSON.stringify({...creationIntent,result:undefined}));else sessionStorage.removeItem(creationStorage());return true;}catch{return false;}}
function creationChanged(){document.dispatchEvent(new CustomEvent('locus:task-creation-pending'));}
function creationRestore(){
 try{const s=JSON.parse(sessionStorage.getItem(creationStorage()));if(s?.actor===JA&&(!s.route||s.route==='/zadachi'||/^\/zadachi\/[1-9]\d*\/dubl$/.test(s.route))&&creationUUID(s.key)&&s.body&&typeof s.body==='object'&&!Array.isArray(s.body)&&['pending','unknown','not_found','confirmed'].includes(s.phase))creationIntent={...s,phase:s.phase==='not_found'?'not_found':'unknown'};}catch{}
}
function creationUnknown(error,matches=true){return Object.assign(new Error('Результат создания ещё не подтверждён. Проверь задачу перед повтором.'),{taskCreationUnknown:true,creationIntentMatches:matches,creationKey:creationIntent?.key,cause:error});}
function creationResult(result,intent){
 if(!result||result.podtverzhdeno!==true||result.zapros_kljuch!==intent.key||!Number.isSafeInteger(result.id)||result.id<1||!Number.isSafeInteger(result.nomer)||result.nomer<1||!creationUUID(result.otmena_dejstvie_id)||typeof result.udaleno!=='boolean'||typeof result.sozdanie_otmeneno!=='boolean')throw new Error('Ответ не подтвердил создание задачи');return result;
}
async function creationRequest(method,intent){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{return await zapros(method,method==='GET'?'/zadachi/proverka?zapros_kljuch='+encodeURIComponent(intent.key):(intent.route||'/zadachi'),method==='GET'?undefined:{...intent.body,zapros_kljuch:intent.key},{signal:controller.signal});}finally{clearTimeout(timer);}
}
API.nepodtverzhdennoeSozdanie=()=>creationIntent?{actor:creationIntent.actor,key:creationIntent.key,body:JSON.parse(JSON.stringify(creationIntent.body)),phase:creationIntent.phase,busy:creationBusy}:null;
API.prinjatSozdanie=key=>{if(creationIntent?.key!==key||creationIntent.phase!=='confirmed'||!creationIntent.result)throw new Error('Создание ещё не подтверждено');const result=creationIntent.result,accepted={actor:creationIntent.actor,key:creationIntent.key,body:JSON.parse(JSON.stringify(creationIntent.body)),result};creationIntent=null;creationStore();creationChanged();document.dispatchEvent(new CustomEvent('locus:task-creation-confirmed',{detail:accepted}));return result;};
async function sendCreation(){
 const intent=creationIntent;creationBusy=true;intent.phase='pending';creationStore();creationChanged();
 try{const result=creationResult(await creationRequest('POST',intent),intent);intent.result=result;intent.phase='confirmed';creationStore();return result;}
 catch(error){if(error.kod!==undefined&&error.kod<500){creationIntent=null;creationStore();throw error;}intent.phase='unknown';creationStore();throw creationUnknown(error);}
 finally{creationBusy=false;creationChanged();}
}
API.sozdatZadachu=async (body,options={})=>{
 const route=options.route||'/zadachi';if(route!=='/zadachi'&&!/^\/zadachi\/[1-9]\d*\/dubl$/.test(route))throw new Error('Неверный запрос копии');
 const requestKey=options.key??body.zapros_kljuch;const clean=JSON.parse(JSON.stringify(body));delete clean.zapros_kljuch;
 if(creationIntent){
  const matches=(!requestKey||requestKey===creationIntent.key)&&route===(creationIntent.route||'/zadachi')&&creationBody(clean)===creationBody(creationIntent.body);
  if(matches&&creationIntent.phase==='confirmed')return creationIntent.result;
  if(matches&&creationBusy&&creationPromise)return creationPromise;
  throw creationUnknown(null,matches);
 }
 if(!JA||sessionChanged)throw new Error('Обнови вход перед созданием задачи');
 if(requestKey!==undefined&&!creationUUID(requestKey))throw new Error('Неверный ключ копии');
 creationIntent={actor:JA,key:requestKey||API.kljuchZaprosa(),body:clean,route,phase:'pending'};
 if(!creationStore()){creationIntent=null;throw Object.assign(new Error('Не удалось подготовить проверку создания. Задача не отправлена.'),{taskCreationNotSent:true});}
 creationPromise=sendCreation();
 try{return await creationPromise;}finally{creationPromise=null;}
};
API.proveritSozdanieZadachi=async key=>{
 const intent=creationIntent;if(!intent||intent.key!==key||creationBusy)throw new Error('Проверка создания уже выполняется');creationBusy=true;creationChanged();
 try{const data=await creationRequest('GET',intent);if(!data||data.zapros_kljuch!==key||typeof data.podtverzhdeno!=='boolean'||data.podtverzhdeno===false&&data.rezultat!==null)throw new Error('Ответ не подтвердил результат создания');if(data.podtverzhdeno){intent.result=creationResult(data.rezultat,intent);intent.phase='confirmed';}else intent.phase='not_found';creationStore();return data;}
 finally{creationBusy=false;creationChanged();}
};
API.povtoritSozdanieZadachi=async key=>{if(!creationIntent||creationIntent.key!==key||creationBusy||creationIntent.phase!=='not_found')throw new Error('Сначала проверь результат создания');return sendCreation();};
creationRestore();

                                                                          
const okrCreateStorage=()=>`locus-okr-creation-intent:${JA}`;
let okrCreateIntent=null,okrCreateBusy=false;
const okrCreateFields={celi:'cel',rezultaty:'rezultat',zamery:'zamer'},okrCreateParents={celi:null,rezultaty:'cel_id',zamery:'rezultat_id'};
function okrCreateChanged(){document.dispatchEvent(new CustomEvent('locus:okr-creation-pending'));}
function okrCreateStore(){try{if(okrCreateIntent)sessionStorage.setItem(okrCreateStorage(),JSON.stringify({...okrCreateIntent,result:undefined}));else sessionStorage.removeItem(okrCreateStorage());return true;}catch{return false;}}
function okrCreateLoad(){try{const r=JSON.parse(sessionStorage.getItem(okrCreateStorage()));if(r?.actor===JA&&creationUUID(r.key)&&Object.hasOwn(okrCreateFields,r.table)&&r.body&&typeof r.body==='object'&&!Array.isArray(r.body)&&['pending','unknown','absent','confirmed','udaleno','perenesen','otmeneno'].includes(r.phase))okrCreateIntent={...r,maybeApplied:true,phase:['absent','udaleno','perenesen','otmeneno'].includes(r.phase)?r.phase:'unknown'};}catch{}}
function okrCreateError(cause){return Object.assign(new Error('Создание ещё не подтверждено. Проверь результат перед повтором.'),{okrCreationUnknown:true,creationKey:okrCreateIntent?.key,cause});}
function okrCreateRow(row,r){if(!row||!Number.isSafeInteger(row.id)||row.id<1)throw new Error('Ответ не подтвердил созданную запись');const parent=okrCreateParents[r.table];if(parent&&Number(row[parent])!==Number(r.body[parent]))throw new Error('Ответ относится к другому владельцу');return row;}
async function okrCreateRequest(method,r,cancel=false){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const parent=okrCreateParents[r.table],route='/'+r.table+(method==='GET'?'?zapros_kljuch='+encodeURIComponent(r.key)+(parent?'&'+parent+'='+encodeURIComponent(r.body[parent]):''):'');return await zapros(method,route,method==='GET'?undefined:cancel?{zapros_kljuch:r.key,otmenit_dobavlenie:true,...(parent?{[parent]:r.body[parent]}:{})}:{...r.body,zapros_kljuch:r.key},{signal:controller.signal});}finally{clearTimeout(timer);}}
API.nepodtverzhdennoeSozdanieOkr=()=>okrCreateIntent?{key:okrCreateIntent.key,table:okrCreateIntent.table,phase:okrCreateIntent.phase,busy:okrCreateBusy}:null;
API.prinjatSozdanieOkr=(key,{recovered=true}={})=>{const r=okrCreateIntent;if(!r||r.key!==key||r.phase!=='confirmed'||!r.result||okrCreateBusy||r.actor!==JA)throw new Error('Создание ещё не подтверждено');const result=r.result;okrCreateIntent=null;okrCreateStore();okrCreateChanged();if(recovered)document.dispatchEvent(new CustomEvent('locus:okr-creation-confirmed',{detail:{key,table:r.table,result}}));return result;};
async function okrCreateSend(){const r=okrCreateIntent;if(!r||okrCreateBusy||r.actor!==JA)throw new Error('Обнови участника или дождись проверки');const earlierUnknown=r.maybeApplied===true||r.phase==='absent';okrCreateBusy=true;r.phase='pending';if(!okrCreateStore()){okrCreateBusy=false;throw new Error('Браузер не сохранил проверку. Создание не отправлено');}okrCreateChanged();try{r.result=okrCreateRow(await okrCreateRequest('POST',r),r);r.phase='confirmed';okrCreateStore();return r.result;}catch(error){if(!earlierUnknown&&error.kod>=400&&error.kod<500&&![401,403,404,410].includes(error.kod)){okrCreateIntent=null;okrCreateStore();throw error;}r.phase='unknown';r.maybeApplied=true;okrCreateStore();throw okrCreateError(error);}finally{okrCreateBusy=false;okrCreateChanged();}}
API.sozdatOkr=async(table,input)=>{const body=JSON.parse(JSON.stringify(input)),key=body.zapros_kljuch||crypto.randomUUID();delete body.zapros_kljuch;if(!Object.hasOwn(okrCreateFields,table)||!creationUUID(key))throw new Error('Нужен ключ одного добавления');if(okrCreateIntent)throw okrCreateError();okrCreateIntent={actor:JA,key,table,body,phase:'pending',maybeApplied:false};await okrCreateSend();return API.prinjatSozdanieOkr(key,{recovered:false});};
function okrCreateProof(proof,r){if(!proof||proof.obekt!==r.table||proof.avtor_id!==r.actor||!['ne_najdeno','sozdano','udaleno','perenesen','otmeneno'].includes(proof.sostojanie))throw new Error('Проверка не подтвердила результат');if(proof.sostojanie==='sozdano'){if(proof.dannye_skryty===true){const parent=okrCreateParents[r.table],scope=parent?Number(r.body[parent]):r.actor;if(!Number.isSafeInteger(proof.zapis_id)||proof.zapis_id<1||proof.vladelec_id!==scope||proof[okrCreateFields[r.table]]!==undefined||!Array.isArray(proof.skryto)||!proof.skryto.length)throw new Error('Закрытый результат не подтверждён');r.result={id:proof.zapis_id,dannye_skryty:true,skryto:proof.skryto.slice()};}else{r.result=okrCreateRow(proof[okrCreateFields[r.table]],r);if(proof.zapis_id!==r.result.id)throw new Error('Номер квитанции не совпал');}r.phase='confirmed';}else r.phase=proof.sostojanie==='ne_najdeno'?'absent':proof.sostojanie;okrCreateStore();return proof;}
API.proveritSozdanieOkr=async key=>{const r=okrCreateIntent;if(!r||r.key!==key||okrCreateBusy||r.actor!==JA)throw new Error('Дождись проверки');okrCreateBusy=true;okrCreateChanged();try{return okrCreateProof(await okrCreateRequest('GET',r),r);}finally{okrCreateBusy=false;okrCreateChanged();}};
API.povtoritSozdanieOkr=async key=>{if(okrCreateIntent?.key!==key||okrCreateIntent.phase!=='absent')throw new Error('Сначала прочитай результат создания');return okrCreateSend();};
API.otmenitSozdanieOkr=async key=>{const r=okrCreateIntent;if(!r||r.key!==key||r.actor!==JA||okrCreateBusy||r.phase!=='absent')throw new Error('Сначала проверь, что запись не создана');okrCreateBusy=true;r.phase='unknown';okrCreateStore();okrCreateChanged();try{return okrCreateProof(await okrCreateRequest('POST',r,true),r);}finally{okrCreateBusy=false;okrCreateChanged();}};
API.zakrytProverkuSozdanijaOkr=key=>{if(okrCreateBusy||okrCreateIntent?.key!==key||okrCreateIntent.actor!==JA||!['udaleno','perenesen','otmeneno'].includes(okrCreateIntent.phase))throw new Error('Сначала получи окончательный результат');okrCreateIntent=null;okrCreateStore();okrCreateChanged();};
okrCreateLoad();

                                                                     
                                                                        
                                                           
API.sozdatKontakt=async function(input){
  const telo={...input};let preparedValue=telo.znachenie;
  const resultOf=(row,gruppa,uzheByl,predvaritelnoByl=false)=>{
    const {osnovnaja_gruppa,...kontakt}=row;
    return {kontakt,gruppa:gruppa||osnovnaja_gruppa,uzheByl,predvaritelnoByl};
  };
  const check=async(predvaritelno=false)=>{
    const result=await API.spisok('kontakty/duplikaty',{
      podtverdit_chelovek_id:telo.chelovek_id,tip:telo.tip,znachenie:telo.znachenie,
      ...(telo.tip==='telefon'?{...(telo.strana!=null?{strana:telo.strana}:{}),...(telo.bez_maski!==undefined||telo.strana===null?{bez_maski:telo.bez_maski??true}:{})}:{})});
    if(result.chelovek_id!==Number(telo.chelovek_id)||result.tip!==telo.tip||!Array.isArray(result.spisok)
      ||result.vsego!==result.spisok.length||result.spisok.length>1)throw new Error('Не удалось однозначно подтвердить контакт. Обнови карточку.');
    const row=result.spisok[0];
    if(telo.tip==='telefon'){if(typeof result.znachenie!=='string'||!/^\+\d+$/.test(result.znachenie))throw new Error('Не подтверждён международный формат телефона');preparedValue=result.znachenie;}
    if(row&&(row.chelovek_id!==Number(telo.chelovek_id)||row.tip!==telo.tip||row.znachenie_norm!==result.znachenie_norm
      ||!Number.isSafeInteger(row.id)||!Number.isSafeInteger(row.versija)))throw new Error('Не удалось подтвердить владельца контакта.');
    return row?resultOf(row,result.osnovnaja_gruppa,true,predvaritelno):null;
  };
  const before=await check(true);if(before)return before;
  try{return resultOf(await API.sozdat('kontakty',{...telo,znachenie:preparedValue}),null,false);}
  catch(error){
    if(error.telo?.sessija_izmenilas||error.kod===401||error.kod===403)throw error;
    if(error.kod!==undefined&&error.kod!==409&&error.kod<500)throw error;
    try{const row=await check();if(row)return row;}catch(checkError){
      if(checkError.kod===401||checkError.kod===403||checkError.telo?.sessija_izmenilas)throw checkError;
    }
    throw error;
  }
};

let contactKindsPromise=null;
API.vidyKontaktov=function(){
  if(!contactKindsPromise)contactKindsPromise=API.spisok('kontakty/vidy').then(result=>{
    const kinds=result.spisok;
    if(!Array.isArray(kinds)||!kinds.length||new Set(kinds.map(x=>x.znachenie)).size!==kinds.length
      ||kinds.some(x=>typeof x.znachenie!=='string'||typeof x.nazvanie!=='string'||!['text','tel','email','url'].includes(x.podskazka_vvoda)))throw new Error('Не загрузились виды контактов');
    return kinds.map(x=>({kod:x.znachenie,imja:x.nazvanie,podskazka_vvoda:x.podskazka_vvoda}));
  }).catch(error=>{contactKindsPromise=null;throw error;});
  return contactKindsPromise;
};
API.proveritGruppuKontaktov=function(group,owner,kind){
  if(group?.chelovek_id!==owner||group.tip!==kind||!/^[a-f0-9]{64}$/.test(group.kontekst||'')
    ||!Array.isArray(group.spisok)||new Set(group.spisok.map(x=>x.id)).size!==group.spisok.length
    ||group.spisok.filter(x=>x.osnovnoj).length>1||group.spisok.some(x=>x.chelovek_id!==owner||x.tip!==kind
      ||!Number.isSafeInteger(x.id)||!Number.isSafeInteger(x.versija)||x.versija<1||x.osnovnoj_kontekst!==group.kontekst
      ||typeof x.znachenie!=='string'))throw new Error('Не удалось подтвердить состояние контактов. Обнови карточку.');
  return group;
};
API.gruppaKontaktov=async function(owner,kind){
  return API.proveritGruppuKontaktov((await API.spisok('ljudi/'+owner+'/kontakty',{tip:kind})).osnovnaja_gruppa,owner,kind);
};
API.proveritPorjadokKontaktov=function(snapshot,owner){
  if(snapshot?.chelovek_id!==owner||!/^[a-f0-9]{64}$/.test(snapshot.kontekst||'')||!Array.isArray(snapshot.spisok)
    ||new Set(snapshot.spisok.map(x=>x.id)).size!==snapshot.spisok.length||snapshot.spisok.some(x=>x.chelovek_id!==owner
      ||!Number.isSafeInteger(x.id)||!Number.isSafeInteger(x.versija)||x.versija<1||typeof x.tip!=='string'||typeof x.znachenie!=='string'))throw new Error('Не удалось подтвердить порядок контактов');
  return snapshot;
};
API.zaprosPorjadkaSrokom=async function(method,path,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{return await API.zapros(method,path,body,{signal:controller.signal});}finally{clearTimeout(timer);}
};
API.porjadokKontaktov=async function(owner,options={}){const value=options.srokom?await API.zaprosPorjadkaSrokom('GET','/kontakty/porjadok?chelovek_id='+encodeURIComponent(owner)):await API.spisok('kontakty/porjadok',{chelovek_id:owner});return API.proveritPorjadokKontaktov(value,owner);};
                                                                               
                                                             
API.snimokPorjadkaPoStrokam=async function(owner,rows){
  const frozen=rows.map(row=>({...row})).sort((a,b)=>(a.porjadok??-Infinity)-(b.porjadok??-Infinity)||a.id-b.id);
  const bytes=new TextEncoder().encode(JSON.stringify([owner,frozen.map(x=>[x.id,x.versija,x.tip,x.porjadok])]));
  const kontekst=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return API.proveritPorjadokKontaktov({chelovek_id:owner,kontekst,spisok:frozen},owner);
};
API.sohranitPorjadokKontaktov=async function(snapshot,ids,options={}){
  try{const value=options.poCheloveku?await API.zaprosPorjadkaSrokom('PATCH','/ljudi/'+snapshot.chelovek_id+'/kontakty/porjadok',{kontekst:snapshot.kontekst,porjadok:ids}):await API.dejstvie('/kontakty/porjadok',{chelovek_id:snapshot.chelovek_id,kontekst:snapshot.kontekst,porjadok:ids});return {snimok:API.proveritPorjadokKontaktov(value,snapshot.chelovek_id),podtverzhdeno:true};}
  catch(error){
    if(error.telo?.sessija_izmenilas||error.kod===401||error.kod===403||error.kod<500)throw error;
    try{const snimok=await API.porjadokKontaktov(snapshot.chelovek_id,{srokom:!!options.poCheloveku});return {snimok,podtverzhdeno:snimok.spisok.map(x=>x.id).join(',')===ids.join(','),provereno:true};}
    catch(readError){throw Object.assign(new Error('Сохранение порядка не подтверждено. Проверь результат.'),{orderUnknown:true,cause:readError});}
  }
};
                                                                             
API.vybratOsnovnojKontakt=async function(record){
  try{
    const result=await API.pravit('kontakty',record.id,{versija:record.versija,osnovnoj:true,osnovnoj_kontekst:record.osnovnoj_kontekst});
    return {gruppa:API.proveritGruppuKontaktov(result.osnovnaja_gruppa,record.chelovek_id,record.tip),podtverzhdeno:true};
  }catch(error){
    if(error.telo?.sessija_izmenilas||error.kod===401||error.kod===403||error.kod===409||error.kod===404||error.kod<500)throw error;
    try{
      const gruppa=await API.gruppaKontaktov(record.chelovek_id,record.tip);
      return {gruppa,podtverzhdeno:gruppa.spisok.some(x=>x.id===record.id&&x.osnovnoj),provereno:true};
    }catch(readError){
      const unknown=new Error('Выбор основного контакта не подтверждён. Проверь результат.');
      unknown.primaryUnknown=true;unknown.cause=readError;throw unknown;
    }
  }
};

API.kljuchZaprosa=function(){
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
};
API.oshibkaKontekstaKontakta=function(){
  return Object.assign(new Error('Контакт теперь относится к другому человеку или виду. Текст остался в поле; обнови данные контакта.'),
    {kod:409,telo:{scope_changed:true}});
};
                                                                          
                                                                               
API.parametryTelefona=function(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(x=>!['strana','bez_maski'].includes(x)))throw Object.assign(new Error('Нужны только страна и режим маски телефона'),{kod:400});
  return {...(Object.hasOwn(options,'strana')?{strana:options.strana}:{}),...(Object.hasOwn(options,'bez_maski')?{bez_maski:options.bez_maski}:{})};
};
let phoneCatalogPromise=null;
API.maskiTelefonov=function(){
  if(!phoneCatalogPromise)phoneCatalogPromise=Promise.all([API.spisok('kontakty/maski'),API.spisok('kontakty/po_umolchaniju')]).then(([result,defaults])=>{
    const countries=result.spisok;
    if(!Array.isArray(countries)||!countries.length||countries.some(x=>typeof x.kod_strany!=='string'||typeof x.nazvanie!=='string'||typeof x.mask!=='string'||typeof x.telefonnyj_kod!=='string')||!countries.some(x=>x.kod_strany===defaults.strana_po_umolchaniju))throw new Error('Не загрузился список стран');
    return {countries,defaults};
  }).catch(error=>{phoneCatalogPromise=null;throw error;});return phoneCatalogPromise;
};
API.razobratTelefon=(value,options={})=>API.dejstvie('/kontakty/razbor',{raw:value,...API.parametryTelefona(options)});
function proverenKontaktZnachenija(row,record){
  if(row?.id!==record.id||row.chelovek_id!==record.chelovek_id||row.tip!==record.tip)throw API.oshibkaKontekstaKontakta();
  if(!Number.isSafeInteger(row.versija)||row.versija<1)throw Object.assign(new Error('Не удалось подтвердить версию контакта.'),{kod:502});
  return row;
}
API.proveritZnachenieKontakta=async function(record,desired){
  const kontakt=proverenKontaktZnachenija(await API.odna('kontakty',record.id),record);
  return {kontakt,podtverzhdeno:kontakt.znachenie===desired};
};
API.pravitZnachenieKontakta=async function(record,value,options={}){
  const phoneOptions=API.parametryTelefona(options),desired=record.tip==='telefon'?(await API.razobratTelefon(value,phoneOptions)).e164:String(value).trim();
  if(record.tip==='telefon'&&(typeof desired!=='string'||!/^\+\d+$/.test(desired)))throw Object.assign(new Error('Не подтверждён международный формат телефона'),{kod:502});
  const check=row=>proverenKontaktZnachenija(row,record);
  try{return check(await API.pravit('kontakty',record.id,{znachenie:desired,versija:record.versija,...phoneOptions}));}
  catch(error){
    if(error.telo?.sessija_izmenilas||error.kod===401||error.kod===403||error.telo?.scope_changed)throw error;
    if(error.kod===409&&error.telo?.tekuschee){
      const current=check(error.telo.tekuschee);
      if(current.znachenie===desired)return current;
      throw error;
    }
    if(error.kod!==undefined&&error.kod<500)throw error;
    try{
      const current=check(await API.odna('kontakty',record.id));
      if(current.znachenie===desired)return current;
    }catch(readError){
      if(readError.kod===401||readError.kod===403||readError.kod===404||readError.telo?.sessija_izmenilas||readError.telo?.scope_changed)throw readError;
    }
    throw Object.assign(new Error('Сохранение контакта не подтверждено. Проверь результат.'),{contactValueUnknown:true,desiredValue:desired,cause:error});
  }
};
API.udalitKontakt=function(record,options={}){
  if(options.proverit&&!options.zapros_kljuch)throw new Error('Для проверки нужен исходный запрос удаления.');
  return API.udalit('kontakty',record.id,{versija:record.versija,chelovek_id:record.chelovek_id,tip:record.tip,
    zapros_kljuch:options.zapros_kljuch||API.kljuchZaprosa(),...(options.proverit?{proverit:true}:{})});
};

                                                                   
                                                                 
                                                                  
                                                
const HOZJAEVA = [61, 62];
function porjadok_ispolnitelej(spisok) {
                                                              
                                                              
                                                    
  const ves = (l) => (l.id === JA ? 0 : HOZJAEVA.includes(l.id) ? 2 : 1);
                                                                        
                                            
  return spisok.slice().sort((a, b) => ves(a) - ves(b));
}

                                                          
let spravochniki = null;
                                                          
                                                                  
                                                            
                                                          
                                                                 
                                                            
                                                     
const STATUSY_ZADACHI = [
  { kod: 'v_plane', imja: 'в плане' },
  { kod: 'v_processe', imja: 'в процессе' },
  { kod: 'na_soglasovanii', imja: 'на согласовании' },
  { kod: 'sdelano', imja: 'сделано' },
  { kod: 'kogda_nibud', imja: 'когда-нибудь' },
];
const TIPY_ZADACHI = [
  { kod: 'klientskaja', imja: 'клиентские' },
  { kod: 'produktovaja', imja: 'продуктовые' },
  { kod: 'biznesovaja', imja: 'бизнесовые' },
  { kod: 'vnutrennjaja', imja: 'внутренние' },
];

const KLJUCH_SPRAV = 'locus-sprav-v4:'+String(JA);                                            
const ZHIZN_SPRAV = 10 * 60 * 1000;

function sprav_iz_pamjati() {
  try {
    const syroe = sessionStorage.getItem(KLJUCH_SPRAV);
    if (!syroe) return null;
    const { kogda, dannye } = JSON.parse(syroe);
    if (!kogda || Date.now() - kogda > ZHIZN_SPRAV) return null;
    return dannye;
  } catch { return null; }
}

function sprav_v_pamjat(dannye) {
  try {
    sessionStorage.setItem(KLJUCH_SPRAV,
      JSON.stringify({ kogda: Date.now(), dannye }));
  } catch {                                                   }
}

                                                          
                                                         
async function vkljuchitSvojKursor() {
  try {
    const n = await zapros('GET', '/nastrojki');
    if (n && n.svoj_kursor) document.body.dataset.kursor = 'svoj';
  } catch {                                        }
}

async function zagruzit() {
  if (spravochniki) return spravochniki;
                                                      
  vkljuchitSvojKursor();
  const iz_pamjati = sprav_iz_pamjati();
  if (iz_pamjati) { spravochniki = iz_pamjati; return spravochniki; }
  const [napr, ljudi] = await Promise.all([
    API.spisok('napravlenija'),
    vsjaKomanda(),
  ]);
  spravochniki = {
                                                                          
                                                                              
    napravlenija: (napr.spisok || []).filter((n) => !n.arhiv).map((n) => ({
      kod: n.kod, imja: (n.nazvanie || n.kod).split(/[,(]/)[0].trim(),
      nazvanie: n.nazvanie, cvet: n.cvet || 'var(--t3)', porjadok: n.porjadok,
                                                                      
                                                                       
      norma_dnej: n.norma_dnej,
    })),
                                                                        
                                                                        
                                                                        
                                                                    
                                                                   
                                            
    ljudi: porjadok_ispolnitelej((ljudi.spisok || []).map((l) => ({
      id: l.id, imja: l.imja, foto: l.foto, rol: l.rol_v_baze,
      komanda: l.komanda, arhiv: l.arhiv,
                                                                   
      pol: l.pol,
    }))),
    statusy: STATUSY_ZADACHI,
    tipy: TIPY_ZADACHI,
  };
  sprav_v_pamjat(spravochniki);
  return spravochniki;
}

async function vsjaKomanda(){
  const spisok=[];
  for(let stranica=1;;stranica++){
    const result=await API.spisok('ljudi',{komanda:1,na_stranice:200,stranica});
    spisok.push(...result.spisok);
    if(stranica>=result.stranic)break;
  }
  return {spisok};
}

                                                                     
                                                                   
                                                     
function iz_ekrana(e) {
  if (!e || !e.napravlenija) return null;
  spravochniki = {
    napravlenija: (e.napravlenija || []).filter((n) => !n.arhiv).map((n) => ({
      kod: n.kod, imja: (n.nazvanie || n.kod).split(/[,(]/)[0].trim(),
      nazvanie: n.nazvanie, cvet: n.cvet || 'var(--t3)', porjadok: n.porjadok,
      norma_dnej: n.norma_dnej,
    })),
    ljudi: porjadok_ispolnitelej((e.ljudi || []).map((l) => ({
      id: l.id, imja: l.imja, foto: l.foto, rol: l.rol_v_baze,
      komanda: l.komanda, arhiv: l.arhiv,
                                                                      
                                                             
      pol: l.pol,
    }))),
    statusy: STATUSY_ZADACHI,
    tipy: TIPY_ZADACHI,
  };
  sprav_v_pamjat(spravochniki);
  return spravochniki;
}

                                                                      
                                                                   
                                           
function cvetNapravlenija(kod) {
  const n = ((spravochniki || {}).napravlenija || []).find((x) => x.kod === kod);
  return (n && n.cvet) || 'var(--t3)';
}

                     
function denMesjac(iso) {
  if (!iso) return '—';
  const text=String(iso),date=/^\d{4}-\d{2}-\d{2}$/.test(text)?text:null;
  const parsed=date?null:vremja(text);
  if(!date&&!parsed)return '—';
  const [, m, d] = (date||window.LOCUS_NEDELI.den_moskvy(parsed)).split('-');
  return `${d}.${m}`;
}

                                                        
                                                                  
                                                             
                                                       
function vremja(iso) {
  if (!iso) return null;
  const s = String(iso).trim();
  if (!s) return null;
                                 
  const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)?s:s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

                                                               
                                                                
                                                    
  
                                                               
                                                     
const MESJACY_KOR = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
                     'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function period(ot, do_) {
  if (!ot || !do_) return '';
  const a = new Date(String(ot).slice(0, 10) + 'T00:00:00');
  const b = new Date(String(do_).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}-${b.getDate()} ${MESJACY_KOR[b.getMonth()]}`
    : `${a.getDate()} ${MESJACY_KOR[a.getMonth()]} – ${b.getDate()} ${MESJACY_KOR[b.getMonth()]}`;
}

                                                             
                                                                     
function dlja_ekrana(z) {
  const chel = (spravochniki.ljudi || []).find((l) => l.id === z.otvetstvennyj);
  return {
    ...z,
    id: z.id, nomer: z.nomer, nazvanie: z.nazvanie, napravlenie: z.napravlenie,
    status: z.status, tip: z.tip, versija: z.versija,
    otvetstvennyj: chel ? chel.imja : '—', foto: chel ? chel.foto : null,
    srok: denMesjac(z.srok), srok_iso: z.srok,
    prosrocheno: prosrochena(z), publikacija: !!z.publikacija, sprint: z.sprint,
    roditel_id: z.roditel_id || null, kljuchevaja: !!z.kljuchevaja,
  };
}

                                                 
function prosrochena(z) {
  if (z.povtorjaetsja) return z.dnej_bez_otmetki > 0;
  if (!z.srok || z.status === 'sdelano' || z.status === 'kogda_nibud') return false;
  return String(z.srok).slice(0, 10) < segodnja();
}

function segodnja() { return window.LOCUS_NEDELI.den_moskvy(); }

                                                            
                                                               
                                                      
                                            
API.ja = JA;
window.API = API;
                                                                    
                                                               
                                        
window.JA = JA;
window.SPR = { zagruzit, iz_ekrana, vkljuchitSvojKursor, cvetNapravlenija, denMesjac, data: denMesjac, period, vremja,
               prosrochena, dlja_ekrana, ja: JA, porjadok_ispolnitelej,
               segodnja, kalendar: window.LOCUS_NEDELI,
               get dannye() { return spravochniki; } };
})();
