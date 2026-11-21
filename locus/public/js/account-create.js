(function(){
'use strict';
const STORE='locus-account-creation-v1';
const PLATFORMS={telegram:'Telegram',instagram:'Instagram',vk:'ВКонтакте',youtube:'YouTube',dzen:'Дзен',tiktok:'TikTok'};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
function records(){const raw=sessionStorage.getItem(STORE);if(!raw)return{};const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Не удалось прочитать черновик аккаунта. Проверь список аккаунтов перед новым созданием.');return value;}
function trashURL(context={}){const query=new URLSearchParams();if(Number.isSafeInteger(Number(context.klient_id))&&Number(context.klient_id)>0){query.set('tip','klient');query.set('klient_id',String(context.klient_id));}else if(typeof context.napravlenie==='string'&&context.napravlenie){query.set('tip','napravlenie');query.set('napravlenie',context.napravlenie);}else if(!context.all)return null;const suffix=query.toString();return '/akkaunty-udalennye.html'+(suffix?'?'+suffix:'');}
function mount({host,scope,context,projects=[],people=[],knownIds=[],platform=null,onCreated,onAddCooperation,open=false}){
 if(host.locusAccountCreate)return host.locusAccountCreate;
 const storageKey=String(API.ja)+':'+scope;
 let record=null,busy=false,storageError=null;
 try{const saved=records()[storageKey];if(saved?.actor===API.ja&&saved.scope===scope&&['draft','pending','unknown','confirmed'].includes(saved.phase)&&saved.draft&&typeof saved.draft==='object')record=saved;if(record&&record.phase!=='draft'&&(!uuid(record.key)||!record.body))throw new Error('Черновик сохранения повреждён. Проверь аккаунты перед новым созданием.');}catch(error){storageError=error;}
 try{if(record?.phase==='confirmed'&&!record.result?.udalen&&record.result?.scopeFits!==false&&knownIds.includes(record.result?.id)){const all=records();delete all[storageKey];sessionStorage.setItem(STORE,JSON.stringify(all));record=null;}}catch(error){storageError=error;}
 const button=document.createElement('button');button.type='button';button.className='kn';button.dataset.accountAdd='1';button.textContent='добавить аккаунт';
 const form=document.createElement('form');form.className='l-form account-create';form.noValidate=true;form.hidden=true;form.dataset.accountCreate='1';
 form.innerHTML='<fieldset><legend class="account-create-heading">Новый аккаунт</legend>'
  +'<label class="l-field"><span class="l-label">Площадка</span><select class="l-select" name="ploshadka" required><option value="">не выбрана</option></select></label>'
  +'<label class="l-field"><span class="l-label">Имя канала без адреса</span><input name="nazvanie" autocomplete="off" required><span class="account-create-counter" data-counter="nazvanie"></span></label>'
  +'<label class="l-field l-field-wide"><span class="l-label">Ссылка, если уже есть</span><input name="ssylka" type="url" autocomplete="off"><span class="account-create-counter" data-counter="ssylka"></span></label>'
  +'<label class="l-field" data-account-project><span class="l-label">Проект клиента</span><select class="l-select" name="proekt_id"><option value="">не выбран</option></select></label>'
  +'<label class="l-field"><span class="l-label">Кто ведёт</span><select class="l-select" name="vladelec"><option value="">не назначен</option></select></label>'
  +'<div class="l-field" data-account-binding><span class="l-label">Привязка</span><span data-account-binding-name></span></div>'
  +'<div class="l-field"><span class="l-label">Сбор</span><span>публичные цифры</span></div>'
  +'<label class="l-field l-field-wide"><span class="l-label">Заметка</span><textarea name="zametka" rows="3"></textarea><span class="account-create-counter" data-counter="zametka"></span></label>'
  +'</fieldset><div class="account-create-status l-field-wide" role="status" aria-live="polite"></div>'
  +'<div class="account-create-actions l-field-wide"><button class="kn tmn" type="submit" data-account-save>сохранить</button><button class="kn" type="button" data-account-check hidden>проверить создание</button><button class="kn" type="button" data-account-retry hidden>повторить этот запрос</button><button class="kn" type="button" data-account-storage-retry hidden>повторить подготовку</button><button class="kn" type="button" data-account-close>закрыть</button></div>';
 const actions=document.createElement('div');actions.className='account-create-actions';actions.append(button);const trash=trashURL(context);if(trash){const link=document.createElement('a');link.className='account-create-link';link.dataset.accountTrashLink='1';link.href=trash;link.target='_blank';link.rel='noopener noreferrer';link.textContent='удалённые аккаунты';actions.append(link);}host.append(actions,form);
 const field=name=>form.elements.namedItem(name),status=form.querySelector('[role=status]'),fieldset=form.querySelector('fieldset'),save=form.querySelector('[data-account-save]'),check=form.querySelector('[data-account-check]'),retry=form.querySelector('[data-account-retry]');
 const option=(value,label)=>{const item=document.createElement('option');item.value=String(value);item.textContent=label;return item;};
 for(const [value,label]of Object.entries(PLATFORMS))field('ploshadka').append(option(value,label));
 const eligibleProjects=projects.filter(p=>!p.arhiv&&p.klient_id===context.klient_id);
 for(const project of eligibleProjects)field('proekt_id').append(option(project.id,project.nazvanie));
 for(const person of people.filter(p=>p.komanda&&!p.arhiv))field('vladelec').append(option(person.id,person.imja));
 form.querySelector('[data-account-project]').hidden=!context.klient_id;
 form.querySelector('[data-account-binding]').hidden=Boolean(context.klient_id);
 form.querySelector('[data-account-binding-name]').textContent=context.nazvanie||context.napravlenie||'';
 const initialProject=context.proekt_id||eligibleProjects.filter(p=>!context.napravlenie||p.napravlenie===context.napravlenie).length===1&&eligibleProjects.find(p=>!context.napravlenie||p.napravlenie===context.napravlenie)?.id;
 const initial={ploshadka:PLATFORMS[platform]?platform:'',nazvanie:'',ssylka:'',vladelec:'',proekt_id:initialProject?String(initialProject):'',zametka:''};
 const values=()=>Object.fromEntries(Object.keys(initial).map(name=>[name,field(name).value]));
 for(const [name,value]of Object.entries(record?.draft||initial))if(field(name)&&typeof value==='string')field(name).value=value;
 function persist(next){const all=records();all[storageKey]=next;sessionStorage.setItem(STORE,JSON.stringify(all));record=next;}
 function message(text){status.replaceChildren();status.textContent=text||'';}
 function errorMessage(error){return error?.message||'Не удалось выполнить действие. Попробуй ещё раз.';}
 function update(){
  const locked=record&&record.phase!=='draft';fieldset.disabled=busy||Boolean(locked)||Boolean(storageError);form.setAttribute('aria-busy',String(busy));
  button.textContent=locked&&record.phase!=='confirmed'?'проверить создание аккаунта':'добавить аккаунт';
  save.hidden=Boolean(locked);save.disabled=busy||Boolean(storageError)||context.klient_id&&!eligibleProjects.length;
  check.hidden=!locked||record.phase==='confirmed'||busy;check.disabled=busy;retry.disabled=busy;form.querySelector('[data-account-close]').disabled=busy;form.querySelector('[data-account-storage-retry]').hidden=!storageError;
  if(locked)retry.hidden=true;
  for(const [name,max]of [['nazvanie',200],['ssylka',500],['zametka',1000]]){
   const count=Array.from(field(name).value).length,invalid=count>max;field(name).setAttribute('aria-invalid',String(invalid));const counter=form.querySelector('[data-counter='+name+']');counter.textContent=count+' / '+max;counter.classList.toggle('account-create-invalid',invalid);if(invalid)save.disabled=true;
  }
 }
 function draft(){return{actor:API.ja,scope,phase:'draft',draft:values()};}
 function show(){form.hidden=false;button.hidden=true;update();if(record?.phase==='confirmed')confirmedMessage();else if(record&&record.phase!=='draft')message('Сохранение ещё не подтверждено. Сначала проверь создание.');else if(storageError)message(errorMessage(storageError));else if(context.klient_id&&!eligibleProjects.length){message('У клиента пока нет активного проекта. Добавь клиентское сотрудничество в нужном направлении.');if(onAddCooperation){const action=document.createElement('button');action.type='button';action.className='kn';action.textContent='добавить сотрудничество';action.addEventListener('click',onAddCooperation);status.append(' ',action);}}else {field('nazvanie').focus({preventScroll:true});field('nazvanie').scrollIntoView({block:'center'});}}
 function confirmedMessage(){message(record.result.udalen?'Аккаунт был создан, затем удалён. Новый аккаунт не создавался.':record.result.scopeFits===false?'Аккаунт создан, но его привязку или площадку нужно проверить.':'Аккаунт создан.');const link=document.createElement('a');link.href='/akkaunt.html?id='+record.result.id;link.textContent='открыть аккаунт';link.className='account-create-link';status.append(' ',link);}
 async function confirmed(result){
  if(result?.podtverzhdeno!==true||result.zapros_kljuch!==record.key||!Number.isSafeInteger(result.id)||result.id<1)throw new Error('Ответ не подтвердил создание аккаунта. Проверь сохранение.');
  const scopeFits=result.ploshadka===record.body.ploshadka&&(context.klient_id?eligibleProjects.some(p=>p.id===result.proekt_id):result.napravlenie===context.napravlenie&&result.proekt_id==null);persist({...record,phase:'confirmed',result:{id:result.id,udalen:Boolean(result.udalen),scopeFits}});update();confirmedMessage();
  try{await onCreated?.(result);}catch{message('Аккаунт создан, но список не обновился. Обнови страницу перед новым созданием.');const link=document.createElement('a');link.href='/akkaunt.html?id='+result.id;link.textContent='открыть аккаунт';link.className='account-create-link';status.append(' ',link);}
 }
 function validate(){
  const v=values(),name=v.nazvanie.trim();if(!name)return'Укажите название';if(/^https?:/i.test(name))return'Нужно имя без адреса';if(Array.from(name).length>200)return'Название не длиннее 200 знаков';if(!PLATFORMS[v.ploshadka])return'Выбери площадку';
  if(v.ssylka.trim()){let url;try{url=new URL(v.ssylka.trim());}catch{}if(url?.protocol!=='https:'||!url.hostname||url.username||url.password)return'Нужна полная ссылка с https';if(Array.from(v.ssylka.trim()).length>500)return'Ссылка не длиннее 500 знаков';}
  if(Array.from(v.zametka).length>1000)return'Заметка не длиннее 1000 знаков';if(context.klient_id&&!eligibleProjects.some(p=>p.id===Number(v.proekt_id)))return'Выбери активный проект клиента';return null;
 }
 function payload(){const v=values();return{ploshadka:v.ploshadka,nazvanie:v.nazvanie.trim(),ssylka:v.ssylka.trim()||null,zametka:v.zametka.trim()||null,vladelec:v.vladelec?Number(v.vladelec):null,uroven:'public',...(context.klient_id?{proekt_id:Number(v.proekt_id)}:{napravlenie:context.napravlenie})};}
 async function send(){
  if(busy||storageError)return;if(record&&record.phase!=='draft')return;
  const invalid=validate();if(invalid){message(invalid);return;}
  try{persist({...draft(),key:crypto.randomUUID(),body:payload(),phase:'pending'});}catch(error){storageError=error;message('Черновик не сохранился в браузере. Запрос не отправлен.');update();return;}
  await post();
 }
 async function post(){
  if(busy||!record?.key||record.phase==='confirmed')return;busy=true;retry.hidden=true;window.LocusControls?.close();update();message('Сохраняю аккаунт…');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const result=await API.zapros('POST','/akkaunty',{...record.body,zapros_kljuch:record.key},{signal:controller.signal});await confirmed(result);}
  catch(error){
   if(error.kod>=400&&error.kod<500&&!error.telo?.operation_key_reused){
    try{persist(draft());}catch(storage){storageError=storage;}
    const data=error.telo;message(data?.oshibka==='akkaunt_est'?'Такой аккаунт уже есть.':errorMessage(error));if(data?.oshibka==='akkaunt_est'&&Number.isSafeInteger(data.id)){const link=document.createElement('a');link.href='/akkaunt.html?id='+data.id;link.className='account-create-link';link.textContent='открыть существующий аккаунт';status.append(' ',link);}
   }else{try{persist({...record,phase:'unknown'});}catch(storage){storageError=storage;}message('Сохранение ещё не подтверждено. Проверь создание перед повтором.');}
  }finally{clearTimeout(timer);busy=false;update();}
 }
 async function verify(){
  if(busy||!record?.key||record.phase==='confirmed')return;busy=true;retry.hidden=true;update();message('Проверяю создание…');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const result=await API.zapros('GET','/akkaunty/proverka?zapros_kljuch='+encodeURIComponent(record.key),undefined,{signal:controller.signal});if(result.zapros_kljuch!==record.key||typeof result.podtverzhdeno!=='boolean')throw new Error('Проверка не подтвердила запрос');if(result.podtverzhdeno)await confirmed(result.rezultat);else{persist({...record,phase:'unknown'});message('Создание пока не найдено. Можно повторить этот же запрос.');retry.hidden=false;}}
  catch(error){message('Не удалось проверить создание. '+errorMessage(error));}
  finally{clearTimeout(timer);busy=false;update();if(record?.phase==='unknown'&&status.textContent.startsWith('Создание пока не найдено.'))retry.hidden=false;}
 }
 form.addEventListener('submit',event=>{event.preventDefault();send();});
 form.addEventListener('input',()=>{if(record&&record.phase!=='draft')return;try{persist(draft());storageError=null;}catch(error){storageError=error;}message(storageError?'Не удалось сохранить черновик в браузере.':null);update();});
 form.addEventListener('change',()=>{if(record&&record.phase!=='draft')return;try{persist(draft());storageError=null;}catch(error){storageError=error;}update();});
 button.addEventListener('click',show);check.addEventListener('click',verify);retry.addEventListener('click',post);
 form.querySelector('[data-account-storage-retry]').addEventListener('click',()=>{try{persist(record||draft());storageError=null;message(null);}catch(error){storageError=error;message(errorMessage(error));}update();});
 form.querySelector('[data-account-close]').addEventListener('click',()=>{if(busy)return;if(record?.phase==='confirmed'){try{const all=records();delete all[storageKey];sessionStorage.setItem(STORE,JSON.stringify(all));record=null;for(const [name,value]of Object.entries(initial))field(name).value=value;}catch(error){storageError=error;message(errorMessage(error));update();return;}}form.hidden=true;button.hidden=false;update();button.focus({preventScroll:true});});
 update();if(open||record&&record.phase!=='draft')show();
 const api={show,verify,get phase(){return record?.phase||'draft';}};host.locusAccountCreate=api;return api;
}
window.LocusAccountCreate={mount,platforms:PLATFORMS,trashURL};
})();
