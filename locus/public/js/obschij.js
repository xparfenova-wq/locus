                                                                
                     

(function () {
'use strict';
let hoverPointer=null;
document.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')hoverPointer={x:event.clientX,y:event.clientY};},true);
const initialCopyKey=new URLSearchParams(location.search).get('kopija');
let historyModule;
function entityHistory(root,options){
  if(!root?.isConnected)return;root.textContent='история загружается';
  if(!historyModule)historyModule=window.LocusIstorija?Promise.resolve(window.LocusIstorija):new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/istorija.js';script.onload=()=>resolve(window.LocusIstorija);script.onerror=()=>{historyModule=null;script.remove();reject(new Error('Не удалось загрузить историю.'));};document.head.append(script);});
  historyModule.then(module=>{if(root.isConnected)module.mount(root,options);}).catch(error=>{if(!root.isConnected)return;const message=document.createElement('p');message.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.textContent='повторить загрузку';retry.onclick=()=>entityHistory(root,options);root.replaceChildren(message,retry);});
}
let materialModule;
let templateModule;
function templatesUi(){if(window.LocusTemplates)return Promise.resolve(window.LocusTemplates);if(!templateModule)templateModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/shablony.js';script.onload=()=>resolve(window.LocusTemplates);script.onerror=()=>{templateModule=null;script.remove();reject(new Error('Не удалось загрузить шаблоны. Повтори открытие.'));};document.head.append(script);});return templateModule;}
function materialsUi(){
  if(window.LocusMaterialy)return Promise.resolve(window.LocusMaterialy);
  if(!materialModule)materialModule=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/js/materialy.js';
    script.onload=()=>resolve(window.LocusMaterialy);
    script.onerror=()=>{materialModule=null;script.remove();reject(new Error('Не загрузились материалы. Повторите открытие карточки.'));};
    document.head.append(script);
  });
  return materialModule;
}
function materialBlocks(options){
  const roots=[options.materialRoot,options.documentRoot].filter(root=>root?.isConnected);
  for(const [index,root]of roots.entries())root.textContent=(index===0?'материалы':'документы')+' загружаются';
  materialsUi().then(module=>{if(roots.some(root=>root.isConnected))module.mountEntity(options);}).catch(()=>{
    for(const root of roots){if(!root.isConnected)continue;const note=document.createElement('p');note.className='material-panel-status';note.textContent='Не удалось загрузить этот раздел.';const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.textContent='повторить загрузку';retry.onclick=()=>materialBlocks(options);root.replaceChildren(note,retry);}
  });
}
function materialLink(row,kind='material',binding){
  const full=String(row.nazvanie||row.ishodnoe_imja||'файл'),name=ekranirovat(full),display=String(row.imja_na_ekrane||full),local=row.fajl||String(row.ssylka||'').startsWith('/fajly/');
  let href='',external=false;
  if(local&&row.fajl_dostupen!==false&&Number.isSafeInteger(row.id)&&row.id>0)href='/api/fajly/'+row.id+'/skachat?obekt='+kind;
  else if(row.ssylka){try{const url=new URL(row.ssylka);if(['https:','http:'].includes(url.protocol)){href=url.href;external=true;}}catch{}}
  const extension=(display.match(/[.][A-Za-z0-9]{1,16}$/)||[''])[0],stem=extension?display.slice(0,-extension.length):display;
  const globe='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.3"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" stroke="currentColor" stroke-width="1.3"/></svg>';
  const paper='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h9l5 5v13H5V3Zm9 0v6h5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  const icon=local?'<span class="material-icon">'+paper+'</span>':external?'<span class="material-icon"><span class="material-icon-fallback">'+globe+'</span><img data-material-domain-icon src="/api/favicon?host='+encodeURIComponent(new URL(href).hostname)+'" alt="" hidden></span>':'';
  const text=icon+'<span class="material-title-text"><span class="material-title-stem">'+ekranirovat(stem)+'</span><span class="material-title-extension">'+ekranirovat(extension)+'</span></span>';
  const title=!href?'<span class="material-title" title="'+name+'">'+text+'</span>':'<a class="material-title" title="'+name+'" href="'+ekranirovat(href)+'"'+(external?' target="_blank" rel="noopener noreferrer"':'')+'>'+text+'</a>';
  return '<span class="material-entry" data-material-record="'+ekranirovat(JSON.stringify(row))+'" data-material-kind="'+kind+'"'+(binding?' data-material-binding="'+binding+'"':'')+'>'+title+'</span>';
}

document.addEventListener('locus:session-changed',()=>{
  if(document.querySelector('.locus-session-note'))return;
  const note=document.createElement('aside');note.className='locus-session-note';note.setAttribute('role','alert');
  const text=document.createElement('span');text.textContent='В браузере вошли под другим участником. Сохрани текст из открытых полей и обнови страницу.';
  const button=document.createElement('button');button.type='button';button.className='kn';button.textContent='обновить страницу';button.addEventListener('click',()=>location.reload());
  note.append(text,button);document.body.append(note);
});

                                                                            
if(!document.querySelector('script[data-locus-controls]')){
  const controls=document.createElement('script');controls.src='/js/controls.js';
  controls.dataset.locusControls='1';document.head.append(controls);
}
if(!window.KALENDAR&&!document.querySelector('script[src="/js/kalendar.js"]')){
  const calendar=document.createElement('script');calendar.src='/js/kalendar.js';calendar.dataset.locusCalendar='1';document.head.append(calendar);
}
if(!window.LocusSuggestions&&!document.querySelector('script[src="/js/suggestions.js"]')){
  const suggestions=document.createElement('script');suggestions.src='/js/suggestions.js';document.head.append(suggestions);
}
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||!['Enter',' '].includes(event.key))return;
  const action=event.target.closest('a[role=button],.dsk-k[role=button],.gal-b[role=checkbox]');
  if(action){event.preventDefault();if(action.getAttribute('aria-disabled')!=='true'&&!action.hasAttribute('disabled'))action.click();}
});

let accountCreateModule;
function accountCreate(){
 if(window.LocusAccountCreate)return Promise.resolve(window.LocusAccountCreate);
 if(!accountCreateModule)accountCreateModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/account-create.js';script.onload=()=>resolve(window.LocusAccountCreate);script.onerror=()=>{accountCreateModule=null;script.remove();reject(new Error('Не загрузилась форма аккаунта. Обнови страницу.'));};document.head.append(script);});
 return accountCreateModule;
}
let repeatModule;
let taskStateModule;
let mentionsModule;
let commentsModule;
let participantsModule;
function uchastnikiUi(){
  if(window.LocusUchastniki)return Promise.resolve(window.LocusUchastniki);
  if(!participantsModule)participantsModule=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/js/uchastniki.js';
    script.onload=()=>resolve(window.LocusUchastniki);
    script.onerror=()=>{participantsModule=null;script.remove();reject(new Error('Не загрузились участники. Открой задачу ещё раз'));};
    document.head.append(script);
  });
  return participantsModule;
}
function kommentariiUi(){
  if(window.LocusKommentarii)return Promise.resolve(window.LocusKommentarii);
  if(!commentsModule)commentsModule=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/js/kommentarii.js';
    script.onload=()=>resolve(window.LocusKommentarii);
    script.onerror=()=>{commentsModule=null;script.remove();reject(new Error('Не загрузилось обсуждение. Открой задачу ещё раз'));};
    document.head.append(script);
  });
  return commentsModule;
}
function upominanija(){
  if(window.LocusUpominanija)return Promise.resolve(window.LocusUpominanija);
  if(!mentionsModule)mentionsModule=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/js/upominanija.js';
    script.onload=()=>resolve(window.LocusUpominanija);
    script.onerror=()=>{mentionsModule=null;script.remove();reject(new Error('Не загрузились комментарии. Открой задачу ещё раз'));};
    document.head.append(script);
  });
  return mentionsModule;
}
let taskChildrenModule;
function taskChildren(){
 if(window.LocusTaskChildren)return Promise.resolve(window.LocusTaskChildren);
 if(!taskChildrenModule)taskChildrenModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/task-children.js';script.onload=()=>resolve(window.LocusTaskChildren);script.onerror=()=>{taskChildrenModule=null;script.remove();reject(new Error('Не загрузился список подзадач'));};document.head.append(script);});
 return taskChildrenModule;
}
let taskEditModule;
function taskEdits(){
 if(window.LocusTaskEdit)return Promise.resolve(window.LocusTaskEdit);
 if(!taskEditModule)taskEditModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/task-edit.js';script.onload=()=>resolve(window.LocusTaskEdit);script.onerror=()=>{taskEditModule=null;script.remove();reject(new Error('Не загрузилась проверка сохранения задачи. Открой карточку ещё раз'));};document.head.append(script);});
 return taskEditModule;
}
let taskPublicationModule;
let errorReportsModule;
function errorReportsUi(){
  if(window.LocusErrorReports)return Promise.resolve(window.LocusErrorReports);
  const load=(name,key)=>window[key]?Promise.resolve(window[key]):new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+name;script.onload=()=>window[key]?resolve(window[key]):reject(new Error('Не загрузилась форма отчёта'));script.onerror=()=>reject(new Error('Не загрузилась форма отчёта'));document.head.append(script);});
  if(!errorReportsModule)errorReportsModule=load('error-context.js','LocusErrorContext').then(()=>load('error-report.js','LocusErrorReports')).catch(error=>{errorReportsModule=null;throw error;});
  return errorReportsModule;
}

let taskContextModule;
function taskContextUi(){
 if(window.LocusTaskContext)return Promise.resolve(window.LocusTaskContext);
 if(!taskContextModule){
  const load=(file,globalName)=>new Promise((resolve,reject)=>{if(window[globalName])return resolve(window[globalName]);const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[globalName]?resolve(window[globalName]):reject(new Error('Параметры задачи не загрузились'));script.onerror=()=>{script.remove();reject(new Error('Не удалось загрузить параметры задачи. Повтори открытие'));};document.head.append(script);});
  taskContextModule=load('task-context-model.js','LocusTaskContextModel').then(()=>load('task-context.js','LocusTaskContext')).catch(error=>{taskContextModule=null;throw error;});
 }
 return taskContextModule;
}
let strategyModule;
function strategyUi(){
 if(window.LocusStrategyEditor)return Promise.resolve(window.LocusStrategyEditor);
 if(!strategyModule){const load=(file,name)=>window[name]?Promise.resolve():new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[name]?resolve():reject(new Error('Не удалось открыть редактор стратегии'));script.onerror=()=>{script.remove();reject(new Error('Не удалось загрузить редактор стратегии. Повтори открытие'));};document.head.append(script);});strategyModule=load('strategy-model.js','LocusStrategyModel').then(()=>load('strategy-editor.js','LocusStrategyEditor')).then(()=>window.LocusStrategyEditor).catch(error=>{strategyModule=null;throw error;});}
 return strategyModule;
}
function taskPublication(){
 if(window.LocusTaskPublication)return Promise.resolve(window.LocusTaskPublication);
 if(!taskPublicationModule)taskPublicationModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/task-publication.js';script.onload=()=>resolve(window.LocusTaskPublication);script.onerror=()=>{taskPublicationModule=null;script.remove();reject(new Error('Не загрузились сведения публикации. Открой карточку ещё раз'));};document.head.append(script);});
 return taskPublicationModule;
}
function taskState() {
  if(window.LocusTaskState)return Promise.resolve(window.LocusTaskState);
  if(!taskStateModule)taskStateModule=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/js/task-state.js';
    script.onload=()=>resolve(window.LocusTaskState);
    script.onerror=()=>{taskStateModule=null;script.remove();reject(new Error('Не загрузились действия задачи'));};
    document.head.append(script);
  });
  return taskStateModule;
}
async function smenitStatusZadachi(...args) {
  try { return await (await taskState()).status(...args); } catch(error) { tost(error.message); }
}
function razreshitKonflikt(error,{label='поле',local='',current='',heading='Правка не применена',ownLabel='сохранить мой вариант',loadLabel='загрузить сохранённое',intro='Твой текст сохранён.',allowOwn=true,lead}={}) {
  return new Promise(resolve=>{
    let choice=null;
    const data=error.telo||{},when=data.kogda ? new Date(String(data.kogda).replace(' ','T').replace(/Z?$/,'Z')) : null;
    const who=lead!==undefined?ekranirovat(String(lead)):data.kto_imja ? 'Правка: '+ekranirovat(data.kto_imja)+', '+ekranirovat(label) : 'Это поле уже изменили';
    const time=when && !Number.isNaN(when.getTime()) ? ' '+when.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}) : '';
    const close=modalka(heading, '<p>'+who+ekranirovat(time)+'. '+ekranirovat(intro)+'</p>'
      +'<div class="l-form"><label class="l-field l-field-wide"><span class="l-label">сейчас в системе</span>'
      +'<textarea readonly rows="3">'+ekranirovat(String(current??''))+'</textarea></label>'
      +'<label class="l-field l-field-wide"><span class="l-label">твой вариант</span>'
      +'<textarea readonly rows="3">'+ekranirovat(String(local??''))+'</textarea></label></div>'
      +'<div class="fch-niz"><button type="button" class="kn ostavit-vnutri" data-conflict-load>'+ekranirovat(loadLabel)+'</button>'
      +(allowOwn?'<button type="button" class="kn ostavit-vnutri" data-conflict-own>'+ekranirovat(ownLabel)+'</button>':'')+'</div>',null,
      {poverh:true,priZakrytii:()=>resolve(choice)});
    const root=document.querySelector('.vyb-fon:not([hidden])');
    root.querySelector('[data-conflict-load]').onclick=()=>{choice='load';close();};
    const own=root.querySelector('[data-conflict-own]');if(own)own.onclick=()=>{choice='own';close();};
  });
}
let updating = false, updateRequested = false;
async function obnovitEkran() {
  updateRequested = true;
  if (updating || typeof window.OPROS !== 'function') return;
  updating = true;
  try { while (updateRequested) { updateRequested = false; await window.OPROS(); } }
  finally { updating = false; }
}
document.addEventListener('locus:zadacha-izmenena', () => {
  obnovitEkran().catch(error => tost('Не обновился список: ' + error.message));
});
let taskAccountModule;
function taskAccounts(){
 if(window.LocusTaskAccount)return Promise.resolve(window.LocusTaskAccount);
 if(!taskAccountModule)taskAccountModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/task-account.js';script.onload=()=>resolve(window.LocusTaskAccount);script.onerror=()=>{taskAccountModule=null;script.remove();reject(new Error('Не загрузился выбор аккаунтов'));};document.head.append(script);});
 return taskAccountModule;
}
let taskCopyModule;
function taskCopy(){
  if(window.LocusTaskCopy)return Promise.resolve(window.LocusTaskCopy);
  if(!taskCopyModule)taskCopyModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/task-copy.js';script.onload=()=>resolve(window.LocusTaskCopy);script.onerror=()=>{taskCopyModule=null;script.remove();reject(new Error('Не загрузилась форма копии'));};document.head.append(script);});
  return taskCopyModule;
}
function povtory() {
  if (window.LocusPovtory) return Promise.resolve(window.LocusPovtory);
  if (!repeatModule) repeatModule = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/js/povtory.js';
    script.onload = () => resolve(window.LocusPovtory);
    script.onerror = () => { repeatModule = null; script.remove(); reject(new Error('Не загрузились повторения')); };
    document.head.append(script);
  });
  return repeatModule;
}
document.addEventListener('click', e => {
  const button = e.target.closest('[data-pv-days]');
  if (!button) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const day = button.closest('[data-pv-date]')?.dataset.pvDate;
  povtory().then(async module => module.days(await API.odna('zadachi', button.dataset.pvDays + (day ? '?den=' + day : ''))))
    .catch(error => tost(error.message));
}, true);

                                                                    
                                                    
const D = new Proxy({}, {
  get: (_, p) => (window.DANNYE || {})[p],
});

                                                                 
                                                                    
                                                                      
const RAZDELY = [
  ['Пространство', '/prostranstvo.html'],
  ['Задачи', '/zadachi.html'],
                                                            
                                                             
                                                               
  ['Планёрка', '/planerka.html'],
  ['Люди', '/ljudi.html'],
  ['Направления', '/napravlenija.html'],
  ['Полезное', '/poleznoe.html'],
];

                                                                  
                                                                    
                                                                
  
                                                                    
                                                                  
                                                                      
                                                                   
                                                               
                                                                    
                                       
const PODRAZDELY_PROSTRANSTVA = [
  ['дела', '/prostranstvo.html'],
  ['про меня', '/kabinet.html'],
];

                                                                        
                                         
                                                              
                                                            
                                                             
                                               
const ZNACHKI_RAZDELOV = {
            
  'Уведомления': '<path d="M11 3.2a4.6 4.6 0 0 0-4.6 4.6v3L4.8 13.2h12.4L15.6 10.8v-3A4.6 4.6 0 0 0 11 3.2Z"/>'
    + '<path d="M9 15.6a2 2 0 0 0 4 0"/>',
              
  'Пространство': '<path d="M11 7.4a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>'
    + '<path d="M3.6 19.4v-1.2a5.4 5.4 0 0 1 5.4-5.4h4a5.4 5.4 0 0 1 5.4 5.4v1.2"/>',
                       
  'Задачи': '<path d="M4 4.6h14M4 11h14M4 17.4h9"/>',
                 
  'ОКР': '<path d="M4 18V9.4M9.8 18V4.6M15.6 18v-6"/>',
                   
  'Планёрка': '<rect x="2.8" y="6" width="11.4" height="10" rx="2.2"/>'
    + '<path d="m14.2 10 5-2.6v7.2l-5-2.6z"/>',
               
  'Люди': '<path d="M8.2 10a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z"/>'
    + '<path d="M2.6 18.4v-.8a4.6 4.6 0 0 1 4.6-4.6h2a4.6 4.6 0 0 1 4.6 4.6v.8"/>'
    + '<path d="M15 5a2.6 2.6 0 0 1 0 5M16.4 13.2a4.4 4.4 0 0 1 3 4.2v1"/>',
                       
  'Направления': '<circle cx="7" cy="7" r="3.4"/><circle cx="15.4" cy="7" r="3.4"/>'
    + '<circle cx="7" cy="15.4" r="3.4"/><circle cx="15.4" cy="15.4" r="3.4"/>',
             
  'Полезное': '<path d="M8 17.4h6M9 20h4"/>'
    + '<path d="M11 2.6a6 6 0 0 0-3.4 10.9c.5.4.8 1 .8 1.6v.3h5.2v-.3c0-.6.3-1.2.8-1.6A6 6 0 0 0 11 2.6Z"/>',
};

const VSE_RAZDELY = [
  ['Пространство', '/prostranstvo.html'],
  ['Задачи', '/zadachi.html'],
  ['Планёрка', '/planerka.html'],
  ['Люди', '/ljudi.html'],
  ['Направления', '/napravlenija.html'],
  ['Полезное', '/poleznoe.html'],
                                                                    
                                                                 
                                                
  ['Уведомления', '/uvedomlenija.html'],
];

                                                                
                                                              
                                                                  
const KLJUCH_PILJULI = 'locus-niz-razdely';
                                                      
const KLJUCH_SVOJO_NAPR = 'locus-svojo-napravlenie';
                                                                  
                                                                     
                                                                    
                                   
                                                            
                                  
const VIDNO_LJUDEJ = (typeof matchMedia === 'function'
  && matchMedia('(max-width:760px)').matches) ? 2 : 10;
const VIDNO_NAPRAVLENIJ = (typeof matchMedia === 'function'
  && matchMedia('(max-width:760px)').matches) ? 3 : 6;

function svojo_napravlenie() {
                                                                
                                                                  
  if (NASTROJKI && NASTROJKI.prioritetnoe_napravlenie) {
                                                                     
    return NASTROJKI.prioritetnoe_napravlenie === 'net'
      ? null : NASTROJKI.prioritetnoe_napravlenie;
  }
  try { return localStorage.getItem(KLJUCH_SVOJO_NAPR) || null; }
  catch { return null; }
}
function sohranit_svojo_napravlenie(kod) {
  try {
    if (kod) localStorage.setItem(KLJUCH_SVOJO_NAPR, kod);
    else localStorage.removeItem(KLJUCH_SVOJO_NAPR);
  } catch {                              }
}
const PILJULJA_PO_UMOLCHANIJU = ['Пространство', 'Задачи', 'Планёрка', 'Люди'];

                                                           
                                                           
                                                                  
                                              
let NASTROJKI = null;

async function zagruzit_nastrojki() {
  if (NASTROJKI) return NASTROJKI;
  try {
    const r = await fetch('/api/nastrojki', {
      headers: { 'x-locus-chelovek': String(window.JA || 61) },
    });
    NASTROJKI = r.ok ? await r.json() : {};
  } catch { NASTROJKI = {}; }
  return NASTROJKI;
}

                                                           
                                                                
                                                            
                                                                   
                                                                
                                                                  
                                                             
                                                                
const PALITRY_LOKUSA = [
  { kod: 'firmennaja', imja: 'фирменная',
    cveta: ['#92FF5F', '#BFF2F0', '#FF7036', '#0F3B27', '#CFF1D2'] },
  { kod: 'spokojnaja', imja: 'спокойная',
    cveta: ['#7182CB', '#16a3a1', '#d9c33a', '#1D2121', '#9a9aa3'] },
  { kod: 'teplaja', imja: 'тёплая',
    cveta: ['#F86015', '#19532B', '#FFCA26', '#D42518', '#9ABC04'] },
  { kod: 'nebo', imja: 'небо',
    cveta: ['#788CE3', '#92BAD5', '#DFF478', '#17243F', '#C9CDD8'] },
  { kod: 'sad', imja: 'сад',
    cveta: ['#3A8F5D', '#7285C1', '#F1F046', '#DB7C56', '#EFB4D8'] },
  { kod: 'indigo', imja: 'индиго',
    cveta: ['#303A95', '#F8982E', '#D8E022', '#2A2313', '#A9D7F3'] },
];
const STATUSY_PALITRY = ['v_processe', 'v_plane', 'na_soglasovanii',
  'sdelano', 'kogda_nibud'];
function primenitPalitru(cveta) {
  const koren = document.documentElement;
  (cveta || []).slice(0, 5).forEach((c, i) => {
    if (!/^#[0-9a-f]{3,8}$/i.test(String(c))) return;
    koren.style.setProperty(`--pal-${i + 1}`, c);
    koren.style.setProperty(`--st-${STATUSY_PALITRY[i]}`, c);
  });
}

                                                                    
                                                          
const PERSONAL_COLOR_PROPERTIES=new Set();
function primenit_svoi_cveta(n) {
  const cv=n&&n.svoi_cveta&&typeof n.svoi_cveta==='object'&&!Array.isArray(n.svoi_cveta)?n.svoi_cveta:{};
  const koren=document.documentElement;for(const name of PERSONAL_COLOR_PROPERTIES)koren.style.removeProperty(name);PERSONAL_COLOR_PROPERTIES.clear();
  primenitPalitru(PALITRY_LOKUSA[0].cveta);
  const pal=PALITRY_LOKUSA.find(p=>p.kod===cv.palitra);
  if(pal)primenitPalitru(pal.cveta);else if(Array.isArray(cv.primenennaja_palitra))primenitPalitru(cv.primenennaja_palitra);else if(Array.isArray(cv.svoja_palitra))primenitPalitru(cv.svoja_palitra);
  for(const [kind,prefix]of [['status','--st-'],['napravlenie','--npr-']])for(const [kod,cvet]of Object.entries(cv[kind]||{}))if(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(cvet))){const name=prefix+kod;koren.style.setProperty(name,cvet);PERSONAL_COLOR_PROPERTIES.add(name);}
}

                                                              
                                                             
                                                         
const est_razdel = (r) => VSE_RAZDELY.some(([x]) => x === r);
function razdely_piljuli() {
                                                              
  const s_servera = NASTROJKI && NASTROJKI.razdely_menju;
  if (Array.isArray(s_servera) && s_servera.length) {
    const zhivye = [...new Set(s_servera.filter(est_razdel))];
    if (zhivye.length) return zhivye.slice(0, 4);
  }
  try {
    const s = localStorage.getItem(KLJUCH_PILJULI);
    const spisok = s ? JSON.parse(s) : null;
    if (Array.isArray(spisok) && spisok.length) {
                                                                
      const zhivye = [...new Set(spisok.filter(est_razdel))];
      if (zhivye.length) return zhivye.slice(0, 4);
    }
  } catch {                                          }
  return PILJULJA_PO_UMOLCHANIJU;
}

function sohranit_razdely_piljuli(spisok) {
  const nabor = spisok.slice(0, 4);
  try { localStorage.setItem(KLJUCH_PILJULI, JSON.stringify(nabor)); }
  catch {                                                             }
                                                
  if (NASTROJKI) NASTROJKI.razdely_menju = nabor;
  fetch('/api/nastrojki', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json',
               'x-locus-chelovek': String(window.JA || 61) },
    body: JSON.stringify({ razdely_menju: nabor }),
  }).catch(() => {                                        });
}

function znachok(razdel, px = 19) {
  const put = ZNACHKI_RAZDELOV[razdel] || '';
  return `<svg viewBox="0 0 22 22" width="${px}" height="${px}" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
    stroke-linejoin="round">${put}</svg>`;
}

                                                                  
                                                         
                                                               
function vidimye_razdely_piljuli(tekuschij) {
  const izbrannye = razdely_piljuli();
  let mest = 5;
  if (window.innerWidth <= 760) {
                                                                 
                                                                 
    const css = getComputedStyle(document.documentElement);
    const px = (imja) => parseFloat(css.getPropertyValue(imja));
    const shirina = document.documentElement.clientWidth || window.innerWidth;
    const zazor = px('--niz-zazor');
    mest = Math.max(1, Math.floor((shirina - px('--niz-boka')
      - px('--niz-obramlenie') + zazor) / (px('--niz-tap') + zazor)) - 1);
  }
  const vidimye = izbrannye.slice(0, mest);
  if (est_razdel(tekuschij) && !vidimye.includes(tekuschij)) {
    if (vidimye.length >= mest) vidimye.pop();
    vidimye.push(tekuschij);
  }
  return vidimye;
}

function nizhnjaja(tekuschij) {
  const v_piljule = vidimye_razdely_piljuli(tekuschij);
  const punkt = ([imja, put]) =>
    `<a href="${put}"${imja === tekuschij ? ' class="on"' : ''}
        aria-label="${imja}" title="${imja}">${znachok(imja)}</a>`;
                                                                  
  const vidimye = v_piljule
    .map((r) => VSE_RAZDELY.find(([x]) => x === r)).filter(Boolean);
                                                           
                                       
                                                                
                                                              
                                                                 
                                                               
                                                              
                                                                   
  return `<nav class="niz" aria-label="Разделы" data-razdel="${est_razdel(tekuschij) ? tekuschij : ''}" data-vidimye="${v_piljule.join('|')}">`
    + vidimye.map(punkt).join('')
    + `<a class="niz-esche" data-esche="1" role="button" tabindex="0" aria-label="ещё" title="ещё" aria-expanded="false" aria-controls="niz-vyp">
        <svg viewBox="0 0 22 22" width="19" height="19" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
          stroke-linejoin="round"><path d="m5.6 13.4 5.4-5.4 5.4 5.4"/></svg>
      </a>`
    + '</nav>';
}

function obnovitNiz() {
  const niz = document.querySelector('.niz');
  if (!niz) return;
  const tekuschij = window.__razdel || niz.dataset.razdel || '';
  if (niz.dataset.razdel === (est_razdel(tekuschij) ? tekuschij : '')
      && niz.dataset.vidimye === vidimye_razdely_piljuli(tekuschij).join('|')) return;
  const fokus = niz.contains(document.activeElement)
    ? document.activeElement.getAttribute('aria-label') : null;
  const raskryt = !!niz.querySelector('[data-esche].otkryt');
  niz.outerHTML = nizhnjaja(tekuschij);
  privjazatNizEsche();
  if (raskryt && window.innerWidth <= 760) document.querySelector('[data-esche]')?.click();
  if (fokus) {
    const knopki = [...document.querySelectorAll('.niz a')];
    (knopki.find(a => a.getAttribute('aria-label') === fokus)
      || document.querySelector('[data-esche]'))?.focus({ preventScroll: true });
  }
}

function znakSvg(px, cveta) {
  const t = [[6, 20], [14, 8], [22, 17]];
  return `<svg class="znk" viewBox="0 0 28 28" width="${px}" height="${px}">` +
    `<path d="M 6 20 L 14 8 L 22 17" fill="none" stroke="currentColor" ` +
    `stroke-width="1.4" stroke-linecap="round" opacity=".28"/>` +
    t.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${cveta[i]}"/>`).join('') +
    '</svg>';
}

                                                                  
                                                                    
                                                                      
                                                                 
                                                                  
function chipy_so_strelkoj(punkty, dannye_atribut) {
  const vsego = punkty.length;
  const chipy = punkty.map((p, i) =>
    `<a class="npr-ch${p.on ? ' on' : ''}${
      i >= VIDNO_NAPRAVLENIJ ? ' npr-skryt' : ''}"
       ${dannye_atribut}="${ekranirovat(p.kod)}">${ekranirovat(p.imja)}</a>`).join('');
  if (vsego <= VIDNO_NAPRAVLENIJ) return chipy;
  return chipy + `<a class="npr-ch npr-esche" data-napr-esche="1"
      aria-label="ещё пункты">
      <svg viewBox="0 0 22 22" width="13" height="13" fill="none"
        stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
        stroke-linejoin="round"><path d="m5.6 13.4 5.4-5.4 5.4 5.4"/></svg>
    </a>`;
}

function menju(tekuschij, { napravlenija = false, vtoroj = null, ljudi = false,
                            period = null, sprint = null, dejstvie = null,
                            chisla = null, bez_vseh = false,
                                                                      
                                                                          
                                                           
                            podrazdely = null, podrazdel = null,
                                                                         
                                                                     
                                                                       
                                                                 
                            bez_formy = false, mobilnyj_period = false } = {}) {
  setTimeout(()=>{paymentRestore();restoreTaskCreationUndo();creationNote();okrCreationNote();},0);
  const r1vnutri = RAZDELY.map(([imja, put]) =>
    `<a class="${imja === tekuschij ? 'on' : ''}" href="${put}">${imja}</a>`).join('');
                                                                  
                                                                   
  const cveta = (D.napravlenija || []).slice(0, 3)
    .map((n) => n.cvet).filter(Boolean);
  const znak = `<a class="men-znk" href="/prostranstvo.html" aria-label="Locus">` +
    znakSvg(22, cveta.length === 3 ? cveta : ['#7182CB', '#FF6716', '#FFC93C']) +
    `<b>Locus</b></a>`;
                                                                   
                                                                   
                                                                 
                               
                                                                 
                                                                 
                                                          
                                                             
                                                               
                                                         
  const plus_verh = '';
  const r1 = `<div class="men-r1-obj">${znak}` +
    (sprint ? periodnik(sprint, 'sprint') : '') +
    `<div class="men-r">${r1vnutri}</div>` +
    (period ? periodnik(period) : '')
    + '<span class="men-inf" id="men-inf"></span>'
    + kolokol() + plus_verh + '</div>';

  const mobilePeriod=mobilnyj_period?'<div class="men-mobile-period">'
    +(sprint?periodnik(sprint,'sprint'):'')
    +(dejstvie?'<div class="men-mobile-period-kind">'+dejstvie+'</div>':'')+'</div>':'';
  let r2 = '';
  if (podrazdely) {
                                                                         
                                                              
    const sp = podrazdely.map(([imja, put]) =>
      `<a class="npr-ch${imja === podrazdel ? ' on' : ''}" href="${put}">${imja}</a>`).join('');
    r2 = `<div class="men-r2-obj"><div class="npr-chipy">${sp}</div>` +
      (dejstvie ? `<span class="men-r2-dejstvie">${dejstvie}</span>` : '') + '</div>';
  } else if (napravlenija) {
                                                                    
                                                                   
                                                                 
    const skolko_u = (kod) => chisla ? (chisla[kod] ?? 0)
      : D.zadachi.filter((z) => z.napravlenie === kod).length;
    const vse = chisla
      ? Object.values(chisla).reduce((a, b) => a + b, 0)
      : D.zadachi.length;
                                                              
                                                                  
                                                                  
                                                    
      
                                                                    
                                                            
                                                                    
                                                                
                                                               
    const svojo = svojo_napravlenie();
    const prioritetnye = (NASTROJKI && Array.isArray(NASTROJKI.prioritetnye_napravlenija))
      ? NASTROJKI.prioritetnye_napravlenija : [];
    const ves = (kod) => (kod === svojo ? 0
      : prioritetnye.includes(kod) ? 1 + prioritetnye.indexOf(kod) : 1000);
    const uporjadochennye = [...D.napravlenija]
      .map((n, i) => ({ n, i }))
      .sort((a, b) => (ves(a.n.kod) - ves(b.n.kod)) || (a.i - b.i))
      .map((x) => x.n);
    const imja_napr = (n) =>
      (n.imja || n.nazvanie || n.kod).split(/[,(]/)[0].trim();
    const vse_chipy = (bez_vseh ? []
      : [{ kod: '', imja: 'все' }])
      .concat(uporjadochennye.map((n) => ({ kod: n.kod, imja: imja_napr(n) })));
                                                             
                                                              
                                                               
    const chipy = vse_chipy.map((n, i) =>
      `<a class="npr-ch${n.kod === '' ? ' on' : ''}${
        i >= VIDNO_NAPRAVLENIJ ? ' npr-skryt' : ''}" data-napr="${ekranirovat(n.kod)}">${ekranirovat(n.imja)}</a>`)
      .join('')
      + (vse_chipy.length > VIDNO_NAPRAVLENIJ
        ? `<a class="npr-ch npr-esche" data-napr-esche="1" aria-label="ещё направления">
            <svg viewBox="0 0 22 22" width="13" height="13" fill="none"
              stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
              stroke-linejoin="round"><path d="m5.6 13.4 5.4-5.4 5.4 5.4"/></svg>
          </a>` : '');
    r2 = `<div class="men-r2-obj"><div class="npr-chipy">${chipy}</div>` +
      (dejstvie ? `<span class="men-r2-dejstvie">${dejstvie}</span>` : '') + '</div>';
  } else if (vtoroj) {
                                                                
                                                          
                                                      
    const sp = chipy_so_strelkoj(vtoroj.map((v, i) => {
      const [imja, kod] = Array.isArray(v) ? v : [v, v];
      return { kod, imja, on: i === 0 };
    }), 'data-vtoroj');
                                                                        
    r2 = `<div class="men-r2-obj"><div class="npr-chipy">${sp}</div>` +
      (dejstvie ? `<span class="men-r2-dejstvie">${dejstvie}</span>` : '') + '</div>';
  }

                                                                  
                                                                
                                                                 
  const r3 = ljudi && NASTROJKI?.panel_ljudej !== false && NASTROJKI?.panel_ljudej !== 0
    ? `<div class="men-r3">` +
      `<a class="chel on" data-chel="">все</a>` +
                                                               
                                                              
                                            
      D.ljudi.map((l, i) =>
        `<a class="chel${i >= VIDNO_LJUDEJ ? ' npr-skryt' : ''}"
            data-chel="${l.id}">${avatar(l, 18)}${ekranirovat(l.imja)}</a>`).join('') +
      (D.ljudi.length > VIDNO_LJUDEJ
        ? `<a class="chel npr-esche" data-napr-esche="1" aria-label="ещё люди">
            <svg viewBox="0 0 22 22" width="13" height="13" fill="none"
              stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
              stroke-linejoin="round"><path d="m5.6 13.4 5.4-5.4 5.4 5.4"/></svg>
          </a>` : '') +
      `</div>`
    : '';

                                                               
                                                                 
                                                           
                                                         
                                                
  const kompakt = (r2 || r3)
    ? '<div class="men-kompakt" id="men-kompakt"></div>' : '';
  window.__razdel = tekuschij || '';
                                                                
                                                   
  const plus_vnizu = bez_formy
    ? '<a class="plav" role="button" tabindex="0" aria-label="создать задачу" id="plav-sozd" title="создать задачу">+</a>' : '';
                                                                
                                                             
  return `<div class="men">${r1}${kompakt}${r2}${r3}${mobilePeriod}</div>`
         + nizhnjaja(tekuschij)
         + `<a class="inf-plav" id="inf-plav-niz"
             aria-label="что это за экран" title="что это за экран">i</a>`
         + uvedomlenija()
         + (bez_formy ? plus_vnizu : plavajuschaja() + formaZadachi());
}

                                                             
                                                                   
                                                                 
                                                             

                                                              
                                                        
const POJASNENIJA_EKRANA = {
  'Пространство': 'Твой рабочий стол: задачи этого спринта, карточка создания слева, итоги дня внизу. Чипы над списком режут его: добавлено командой, участвую, на сегодня, просроченные',
  'Задачи': 'Все задачи команды за спринт. Сводка сверху фильтрует по клику, чипы сужают список, вид меняется списком, динамикой или доской. Строка с галочкой закрывает задачу',
  'ОКР': 'Цели периода и их результаты. Процент слева это факт, рядом ожидаемый по календарю. Раскрой цель, чтобы увидеть результаты, замеры и задачи',
  'Планёрка': 'Сводка направления за спринт: цели, клиенты, деньги, контент. Плитка просроченного ведёт к задачам, «сравнить недели» живёт слева в шапке',
  'Люди': 'Лиды, клиенты и рефералы. Чипы ролей и рассылок режут список, фильтры справа тоньше. Строка ведёт в карточку человека',
  'Направления': 'Карточка направления: контекст, стратегия, проекты, клиенты, контент-план, соцсети. Направление выбирается сверху, вкладки под ним',
  'Полезное': 'Общее знание команды: лента находок, рефлексия по спринтам, принципы, анкеты, график, фокус, шаблоны, журнал',
  'Кабинет': 'Твои настройки: данные, анкета про себя, уведомления, вид меню, сессии',
};


                                                
                                                                
                                                                 
                                                                  
                                                                
let UVED = [];
let UVED_COUNT=0, UVED_LOADED=false, UVED_ERROR='', UVED_REQUEST=0;
const UVED_PENDING=new Map();

                                                                   
function kogda_prishlo(iso) {
  if (!iso) return '';
  const d = window.SPR?.vremja ? SPR.vremja(iso) : new Date(String(iso).replace(' ', 'T') + 'Z');
  if (!d) return '';
  if (Number.isNaN(d.getTime())) return '';
  const minut = Math.floor((Date.now() - d.getTime()) / 60000);
  const chasy = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  if (minut < 1) return 'только что';
  if (minut < 60) return `${minut} ${skolko(minut, 'минуту', 'минуты', 'минут')} назад`;
  const today=SPR.segodnja(),day=SPR.kalendar.den_moskvy(d);
  if(day===today)return `сегодня в ${chasy}`;
  if(day===SPR.kalendar.sdvinut_den(today,-1))return `вчера в ${chasy}`;
  return `${SPR.data(day)} в ${chasy}`;
}

                                                              
                            
function tekstUvedomlenija(u) {
  const text=String(u.tekst||u.zagolovok||'уведомление'),title=String(u.zadacha_nazvanie||u.proekt_nazvanie||'');
  return ekranirovat(text)+(title&&!text.includes(title)?'<span class="uved-zadacha">'+ekranirovat(title)+'</span>':'');
}

async function zagruzit_uvedomlenija() {
  const sequence=++UVED_REQUEST;
  try {
    const o = await API.spisok('uvedomlenija');
    if(sequence!==UVED_REQUEST)return;
    if(!Array.isArray(o.spisok)||!Number.isSafeInteger(o.neprochitanyh_pro_menja))throw new Error('сервер не вернул уведомления');
    UVED_COUNT=o.neprochitanyh_pro_menja;UVED_LOADED=true;UVED_ERROR='';
    UVED = (o.spisok || []).map((u) => ({
      ...u,
      novoe: !u.prochitano,
      im: u.tekst || 'уведомление',
      p: kogda_prishlo(u.sozdano),
      adres: u.adres,
    }));
  } catch(e) {if(sequence===UVED_REQUEST)UVED_ERROR='Не удалось обновить уведомления. Повтори загрузку';}
}

function otmetitUvedomlenie(id,prochitano){
  if(UVED_PENDING.has(id))return UVED_PENDING.get(id);
  const request=API.pravit('uvedomlenija',id,{prochitano}).then(result=>{
    if(result?.prochitano!==prochitano)throw new Error('сервер не подтвердил отметку');
    document.dispatchEvent(new CustomEvent('locus:uvedomlenija-izmeneny'));return result;
  }).finally(()=>UVED_PENDING.delete(id));
  UVED_PENDING.set(id,request);return request;
}

function znakiUvedomlenij(){
  const count=UVED_COUNT;
  document.querySelectorAll('#kolokol .kolokol-n,.niz .kolokol-n,.niz-vyp .kolokol-n,[data-esche] .esche-tochka').forEach(e=>e.remove());
  if(count){
    const badge='<span class="kolokol-n">'+(count>9?'9+':count)+'</span>';
    document.getElementById('kolokol')?.insertAdjacentHTML('beforeend',badge);
    document.querySelectorAll('.niz a[href="/uvedomlenija.html"],.niz-vyp a[href="/uvedomlenija.html"]').forEach(e=>e.insertAdjacentHTML('beforeend',badge));
    if(!document.querySelector('.niz a[href="/uvedomlenija.html"]'))document.querySelector('[data-esche]')?.insertAdjacentHTML('beforeend','<span class="esche-tochka"></span>');
  }
}
function narisovatUvedomlenija(){
  znakiUvedomlenij();
  const popup=document.getElementById('uved');
  if(popup){const element=document.createElement('div');element.innerHTML=uvedomlenija();popup.innerHTML=element.firstElementChild.innerHTML;raskrytieUvedomlenij();}
}
async function obnovitUvedomlenija(){await zagruzit_uvedomlenija();narisovatUvedomlenija();}
document.addEventListener('locus:uvedomlenija-izmeneny',()=>obnovitUvedomlenija());
setInterval(()=>{if(!document.hidden&&document.getElementById('kolokol'))obnovitUvedomlenija();},30000);

function kolokol() {
  const novyh = UVED_COUNT;
  return `<a class="kolokol" id="kolokol" role="button" tabindex="0" title="уведомления" aria-label="уведомления">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.4a3.5 3.5 0 0 0-3.5 3.5v2.3L3.3 10.6h9.4L11.5 8.2V5.9A3.5 3.5 0 0 0 8 2.4Z"
        stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M6.5 12.1a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1.2"/>
    </svg>
    ${novyh ? `<span class="kolokol-n">${novyh > 9 ? '9+' : novyh}</span>` : ''}
  </a><a class="kolokol inf-verh" id="inf-plav" title="что это за экран"
    aria-label="что это за экран">i</a>`;
}

                                                                
                                                                   
                
let POSLEDNEE_NAZHATIE = '',LAST_REPORT_ACTION=null,LAST_REPORT_ERROR=null;
try{const last=JSON.parse(sessionStorage.getItem('locus-last-action:'+API.ja)||'null');if(last?.actor===API.ja&&typeof last.text==='string'&&Number.isFinite(last.at)&&Date.now()-last.at>=0&&Date.now()-last.at<1800000){POSLEDNEE_NAZHATIE=last.text.slice(0,80);LAST_REPORT_ACTION={text:POSLEDNEE_NAZHATIE,id:typeof last.id==='string'?last.id:null,at:last.at};}}catch{}
let POSLEDNJAJA_OSHIBKA = '';
document.addEventListener('click', (e) => {
  const t = e.target.closest('a, button, [data-chip]');
  if (e.isTrusted && t && !t.closest('.error-report-root,[data-error-report-open]') && !['inf-plav','inf-plav-niz'].includes(t.id)){POSLEDNEE_NAZHATIE = (t.getAttribute('aria-label') || t.textContent || t.className || '').replace(/\s+/g,' ').trim().slice(0, 80);const attribute=[...t.attributes].find(a=>a.name.startsWith('data-')&&!a.name.endsWith('-id'))?.name.slice(5),rawId=t.id||attribute||'control',id=({'sozd-sozdat':'sohranit_zadachu','task-context-save':'sohranit_zadachu'})[rawId]||rawId.replace(/[^a-z0-9_-]/gi,'_').slice(0,80);LAST_REPORT_ACTION={text:POSLEDNEE_NAZHATIE,id,at:Date.now()};try{sessionStorage.setItem('locus-last-action:'+API.ja,JSON.stringify({actor:API.ja,...LAST_REPORT_ACTION}));}catch{}}
}, true);
                                                                   
                                                              
document.addEventListener('click', (e) => {
  const a = e.target.closest('#menju a.on, .niz a.on');
  if (!a) return;
  const put = (a.getAttribute('href') || '').split('?')[0];
  if (put && put === location.pathname) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});
function rememberReportError(text,code,action){POSLEDNJAJA_OSHIBKA=String(text||'').slice(0,1500);LAST_REPORT_ERROR={text:POSLEDNJAJA_OSHIBKA,code:code??null,at:Date.now(),action:action||LAST_REPORT_ACTION};}
window.addEventListener('error',e=>rememberReportError(e.message||'Не загрузился ресурс',e.message?'JS_ERROR':'RESOURCE_ERROR'),true);
window.addEventListener('unhandledrejection',e=>{try{rememberReportError(e.reason?.message||String(e.reason||'Не удалось завершить действие'),'UNHANDLED_REJECTION');}catch{}});
document.addEventListener('locus:request-failed',e=>rememberReportError(e.detail?.message,e.detail?.status,e.detail?.action));
document.addEventListener('locus:request-error',e=>rememberReportError(e.detail?.message,e.detail?.status,e.detail?.action));
function reportContext(){
 const model=window.LocusErrorContext;
 if(!model)return {gde:location.pathname+location.search,nazhimala:POSLEDNEE_NAZHATIE,oshibka:POSLEDNJAJA_OSHIBKA};
 const card=document.querySelector('[data-task-card-number]'),direction=card?.dataset.taskCardDirection;
 const task=card&&direction?{number:Number(card.dataset.taskCardNumber),direction,directionName:naprPoKodu(direction)?.imja||direction}:null;
 return model.capture({href:location.href,title:document.title,section:window.__razdel,task,action:LAST_REPORT_ACTION,error:LAST_REPORT_ERROR});
}

function oknoSlomalos() {
  return errorReportsUi().then(module=>module.open(reportContext())).catch(error=>tost(error.message));
}

function raskrytieUvedomlenij(){
 requestAnimationFrame(()=>document.querySelectorAll('#uved.on [data-uved-popup-ob]').forEach(row=>{
  const text=row.querySelector('.uved-im'),button=row.querySelector('[data-uved-expand]');
  if(button?.getAttribute('aria-expanded')==='false')button.hidden=text.scrollHeight<=text.clientHeight+1;
 }));
}
window.addEventListener('resize',raskrytieUvedomlenij);
function uvedomlenija() {
  return `<div class="uved" id="uved">
    <div class="uved-sh">уведомления<a href="/uvedomlenija.html">все уведомления</a></div>
    ${UVED_ERROR?'<div class="uved-net" role="status">'+ekranirovat(UVED_ERROR)+' <button type="button" data-uved-retry>обновить</button></div>':''}
    ${UVED.length ? UVED.map((u) => `<div class="uved-ob" data-uved-popup-ob="${u.id}"><a class="uved-s${u.novoe ? '' : ' proch'}"
      ${u.adres?'href="'+ekranirovat(u.adres)+'"':'role="button" tabindex="0"'} data-uved="${u.id}">
      <span class="uved-t"></span>
      <span class="uved-n"><span class="uved-im uved-clamp" id="uved-tekst-${u.id}">${tekstUvedomlenija(u)}</span>
        <div class="uved-p">${ekranirovat(u.pojasnenie||u.p)}</div></span>
    </a><button type="button" class="uved-expand" data-uved-expand="${u.id}" aria-expanded="false" aria-controls="uved-tekst-${u.id}" hidden>показать целиком</button></div>`).join('')
      : '<div class="uved-net">'+(UVED_LOADED?'уведомлений пока нет':UVED_ERROR?'уведомления не загружены':'загрузка уведомлений')+'</div>'}
  </div>`;
}

                                                                
                                            
function lentaVbok(l) {
  if (!l || l.dataset.lenta) return;
  l.dataset.lenta = '1';
  const kraj = () => {
    const est = l.scrollWidth > l.clientWidth + 1;
    l.classList.toggle('perepoln', est);
    l.classList.toggle('v-konce',
      !est || l.scrollLeft + l.clientWidth >= l.scrollWidth - 2);
  };
  l.addEventListener('scroll', kraj, { passive: true });
  l.addEventListener('wheel', (e) => {
    if (l.scrollWidth <= l.clientWidth + 1
        || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    l.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  kraj();
  requestAnimationFrame(kraj);
}

                                           
function plavajuschaja() {
  return '<a class="plav" role="button" tabindex="0" aria-label="создать задачу" id="plav" title="создать задачу">+</a>';
}

                                
                                                               
                                                             
                                                                  
                                                                     
                                                               
                                                                     
                                                          
const TIPY_ZADACHI_FORMA = [
  { kod: 'vnutrennjaja', imja: 'внутренняя' },
  { kod: 'klientskaja', imja: 'клиентская' },
  { kod: 'produktovaja', imja: 'продуктовая' },
  { kod: 'biznesovaja', imja: 'бизнесовая' },
  { kod: 'rassylka', imja: 'рассылка' },
  { kod: 'kasanie', imja: 'касание' },
];


                                                            
                                                               
                                                            
const IKONKI_POLEJ = {
  kljuch: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 14V2.6M4 3h7.6l-1.7 2.6 1.7 2.6H4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  napravlenie: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 3h10M3 8h10M3 13h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  tip: '<svg viewBox="0 0 16 16" fill="none"><rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.4" stroke="currentColor" stroke-width="1.3"/></svg>',
  chel: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.6" r="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M3.2 13.2c0-2.4 2.1-3.8 4.8-3.8s4.8 1.4 4.8 3.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  uchast: '<svg viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5.6" r="2.3" stroke="currentColor" stroke-width="1.3"/><path d="M2 13c0-2.1 1.8-3.3 4-3.3s4 1.2 4 3.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11 4.2a2.3 2.3 0 0 1 0 4.4M12 9.9c1.4.4 2.4 1.5 2.4 3.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  status: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.4" stroke="currentColor" stroke-width="1.3"/><path d="M5.8 8.1l1.6 1.6 3-3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  srok: '<svg viewBox="0 0 16 16" fill="none"><rect x="2.6" y="3.6" width="10.8" height="9.8" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M5.4 2.2v2.6M10.6 2.2v2.6M2.6 6.8h10.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  sprint: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2.6v5.4l3.4 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="8" r="5.4" stroke="currentColor" stroke-width="1.3"/></svg>',
  cel: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.4" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.3"/></svg>',
  klient: '<svg viewBox="0 0 16 16" fill="none"><path d="M2.6 13.4V6.2l5.4-3.6 5.4 3.6v7.2" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.4 13.4V9.4h3.2v4" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  proekt: '<svg viewBox="0 0 16 16" fill="none"><path d="M2.6 5.2a1.6 1.6 0 0 1 1.6-1.6h2.4l1.4 1.8h3.8a1.6 1.6 0 0 1 1.6 1.6v4.8a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V5.2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  chislo: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 12.4V8.6M6.4 12.4V4.8M9.8 12.4v-5M13.2 12.4V3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};


                                                                  
                                                              
                                                    
function poljaZadachi() {
  const D = window.DANNYE || {};
  const napr = D.napravlenija || [];
  const ljudi = D.ljudi || [];
  const statusy = D.statusy || [];
                                                                  
                                                                
                                                          
                                                
  const vyp = (id, podpis, { objazatelno = false } = {}) =>
    `<span class="sozd-lbl">${podpis}${
      objazatelno ? '<i class="sozd-ob" title="обязательное">*</i>' : ''}</span>` +
    `<a class="sozd-pole" id="${id}"><span class="sozd-t"></span>` +
    `<span class="str"></span></a>`;
  const str_polja = (kljuch, podpis, telo) =>
    `<span class="sozd-p vyp">${telo}</span>`;
  return `
    <!-- Кикера «новая задача, направление» больше нет: её слова
         28.10 «вот эта подпись новая задача и синапт — убери,
         вообще не должно быть такого» -->
    <!-- Сегменты задач: основная и подзадачи вкладками, не полем.
         Её слова 28.10 «подзадача подразумевает дополнительную
         вкладку, сегментированный переключатель». Строит и ведёт
         vkljuchitFormuZadachi -->
    <!-- Верх в одну строку при любом числе подзадач: сегменты
         листаются вбок, справа «ключевая» той же высоты.
         «Публикация» стоит у своих полей под сеткой. Её слова 29.10:
         «чтобы ничего не переносилось на следующую строку» -->
    <div class="sozd-verh">
      <div class="sozd-segmenty" id="sozd-segmenty" hidden></div>
      <!-- Ключевая задача: её слова 29.10 «чтобы можно было помечать» -->
      <span class="sozd-pub-tumbler" id="sozd-klj-kn"
        role="switch" aria-checked="false">
        <span class="pere"><span class="pere-b"></span></span>
        <span class="sozd-pub-slovo">ключевая</span>
      </span>
      <input type="checkbox" id="sozd-klj" hidden>
    </div>

    <!-- Название крупным, линией, с подсказкой «Задача» внутри:
         её слова 28.10 поздно — «название должно остаться крупным,
         там просто линия и просто подсказка задача». Остальные
         поля одним кеглем, без подсказок, с подписями сверху -->
    <input class="sozd-vvod" id="sozd-imja" placeholder="Задача">
    <!-- Ошибка у места, где её чинят: под названием, не в подвале -->
    <div class="sozd-osh" id="sozd-osh" hidden></div>

    <div class="sozd-polja">
      ${str_polja('napravlenie', 'направление', vyp('sozd-napr', 'направление', { objazatelno: true }))}
      ${str_polja('tip', 'тип', vyp('sozd-tip', 'тип'))}
      ${str_polja('chel', 'ответственный', vyp('sozd-chel', 'ответственный',
        { objazatelno: true })+'<span class="sozd-zagr" id="sozd-zagr" hidden></span>')}
      ${str_polja('status', 'статус', vyp('sozd-status', 'статус'))}
      ${str_polja('srok', 'срок', `<span class="sozd-lbl">срок</span>
        <label class="sozd-pole pole-daty zapolnen" id="sozd-srok-o">
        <input type="date" id="sozd-srok" aria-label="срок">
        <a class="data-ub" data-chistit="sozd-srok"
          title="убрать дату" hidden>×</a>
        <span class="str"></span></label>`)}
      ${str_polja('sprint', 'спринт', vyp('sozd-sprint', 'спринт'))}
      ${str_polja('uchast', 'участники', vyp('sozd-uchast', 'участники'))}
      ${str_polja('cel', 'цель', vyp('sozd-cel', 'цель ОКР'))}

      <!-- Клиент, проект и целевое число раскрываются по типу -->
      <span class="sozd-p vyp pole-klienta" hidden>
        ${vyp('sozd-klient', 'клиент')}</span>
      <span class="sozd-p vyp pole-proekta" hidden>
        ${vyp('sozd-proekt', 'проект')}</span>
      <span class="sozd-p pole-chisla" hidden>
        <span class="sozd-lbl">целевое число</span>
        <label class="sozd-pole"><input type="number" id="sozd-chislo"
          aria-label="целевое число"></label></span>
    </div>
    <div class="sozd-pub-rjad pv-new">
      <label class="pv-new-toggle"><input type="checkbox" id="sozd-repeat">повторять</label>
      <label id="sozd-repeat-start-o" hidden>начиная с <span class="pv-date pole-daty"><input type="date" id="sozd-repeat-start" aria-label="начало повторения"></span></label>
      <label id="sozd-repeat-frequency-o" hidden>частота
        <select id="sozd-repeat-frequency">
          <option value="kazhdyj_den">каждый день</option><option value="budnie">будние</option>
          <option value="raz_v_nedelju">раз в неделю</option><option value="vybrannye_dni">выбранные дни</option>
        </select></label>
      <div class="pv-week" id="sozd-repeat-days" hidden>${['пн','вт','ср','чт','пт','сб','вс'].map((name,i) =>
        `<label class="pv-new-day"><input type="checkbox" value="${i+1}">${name}</label>`).join('')}</div>
    </div>
    <div class="sozd-pub-rjad">
      <span class="sozd-pub-tumbler" id="sozd-pub-kn"
        role="switch" aria-checked="false">
        <span class="pere"><span class="pere-b"></span></span>
        <span class="sozd-pub-slovo">публикация</span>
      </span>
      <input type="checkbox" id="sozd-pub" hidden>
    </div>
    <div class="sozd-polja pole-publikacii" id="sozd-pub-polja" hidden>
      <span class="sozd-publication-note" id="sozd-publication-note" role="status" hidden></span>
      ${str_polja('ploshadka', 'площадка', vyp('sozd-ploshadka', 'площадка'))}
      ${str_polja('format', 'формат', vyp('sozd-format', 'формат'))}
      ${str_polja('rubrika', 'рубрика', '<span class="sozd-lbl">рубрика</span><label class="sozd-pole"><input type="text" id="sozd-rubrika" aria-label="рубрика" list="sozd-rubric-list"><datalist id="sozd-rubric-list"></datalist></label>')}
      ${str_polja('akkaunt', 'аккаунт', vyp('sozd-akkaunt', 'аккаунт'))}
      <span class="sozd-account-hint" id="sozd-account-hint" role="status" hidden></span>
      ${str_polja('vyhod', 'дата выхода', `<span class="sozd-lbl">дата выхода</span>
        <label class="sozd-pole pole-daty zapolnen">
        <input type="date" id="sozd-vyhod" aria-label="дата выхода">
        <span class="str"></span></label>`)}
    </div>

    <span class="sozd-lbl">описание</span>
    <textarea class="sozd-opis" id="sozd-opis" rows="1"></textarea>
    <span class="sozd-lbl">ссылка на файл</span>
    <label class="sozd-pole sozd-ssyl"><input type="url" id="sozd-ssylka"
      aria-label="ссылка на файл"></label>

    <span class="sozd-lbl">комментарий</span>
    <textarea class="sozd-opis sozd-komm" id="sozd-komm" rows="1"></textarea>

    <!-- Подзадачи — вкладки сверху (sozd-segmenty), не строки.
         Кнопка живёт там же: «+» в ряду сегментов -->
    <div class="sozd-pz" id="sozd-pz" hidden></div>

    <div class="sozd-fajly" id="sozd-fajly"></div>
    <input type="file" id="sozd-fajl-vvod" multiple hidden>
    <!-- Низ по референсу: слева скрепка и «использовать шаблон»
         (она зовёт его «дублировать», переехал из верхнего угла —
         её слова 28.10 «пусть будет внизу»), справа «Сохранить
         шаблон». Список шаблонов раскрывается вверх -->
    <div class="sozd-niz">
      <a class="sozd-dej" id="sozd-fajl" title="прикрепить файл">
        <svg viewBox="0 0 20 20" fill="none"><path d="M13.4 6.6 7.9 12.1a1.9 1.9 0 0 0 2.7 2.7l5.5-5.5a3.7 3.7 0 0 0-5.3-5.3L5.3 9.5a5.5 5.5 0 0 0 7.8 7.8l1.6-1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <span class="rast"></span>
      <span class="vyp sozd-shb-v2"><a class="kn sozd-shb" id="sozd-isp-shablon">
        использовать шаблон<span class="str"></span></a></span>
      <a class="kn" id="sozd-shablon">Сохранить шаблон</a>
    </div>`;
}

                                                                   
                                                                   
                                                            
function formaZadachi() {
                                                        
                                                       
                                         
                                                                 
                                                               
                                                           
                                                             
                                                            
  return `<div class="sozd" id="sozd">
    <div class="sozd-o">
      <div class="sozd-k">
        ${poljaZadachi()}</div>
      <!-- Кнопки за пределами карточки, кругляшками: крестик
           закрывает, галочка создаёт задачу сразу закрытой,
           стрелка создаёт обычную -->
      <div class="sozd-kn">
        <!-- Крестик за пределами карточки, как у всех модалок:
             её слова 27.10 — «мы тысячу раз сфиксировали, что
             крестик должен быть за пределами самой карточки» -->
        <a role="button" tabindex="0" class="sozd-kn-k sozd-x-kn" id="sozd-krest" aria-label="закрыть">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></a>
        <a role="button" tabindex="0" class="sozd-kn-k" id="sozd-gotovo"
           title="создать и сразу закрыть" aria-label="создать выполненной">
          <svg viewBox="0 0 18 18" fill="none"><path d="M4 9.2l3.3 3.3L14 5.6"
            stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
            stroke-linejoin="round"/></svg></a>
        <a role="button" tabindex="0" class="sozd-kn-k tmn" id="sozd-sozdat"
           title="создать задачу" aria-label="создать">
          <svg viewBox="0 0 18 18" fill="none"><path d="M9 14.5V3.5M9 3.5L4.4 8.1M9 3.5l4.6 4.6"
            stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
            stroke-linejoin="round"/></svg></a>
      </div>
    </div>
  </div>`;
}

                                                                 
                                                                
                                      
function kartaSozdanija({ s_knopkoj = false } = {}) {
                                                              
                                                                      
                                                                 
                                                               
                                                           
  const polja = s_knopkoj
    ? poljaZadachi().replace('<a class="kn" id="sozd-shablon">Сохранить шаблон</a>',
      `<a class="kn" id="sozd-shablon">Сохранить шаблон</a>
      <a role="button" tabindex="0" class="sozd-kn-k tmn sozd-niz-sozd" id="sozd-sozdat"
         title="создать задачу" aria-label="создать">
        <svg viewBox="0 0 18 18" fill="none"><path d="M9 14.5V3.5M9 3.5L4.4 8.1M9 3.5l4.6 4.6"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
          stroke-linejoin="round"/></svg></a>`)
    : poljaZadachi();
  return `<div class="sozd vstroen" id="sozd">
    <div class="sozd-o">
      <div class="sozd-k">${polja}</div>
    </div>
  </div>`;
}

                                                                            
                                                                             
                                                   
function rjadUezzhaet() {
                                                             
                                                     
  return;
                                            
  const r3 = document.querySelector('.men-r3');
  if (!r3) return;
  r3.style.transition = 'opacity .18s, max-height .18s, margin .18s';
                                                               
                                                          
  let opora = window.scrollY;
  let sprjatan = false;
                                                                     
                                                                 
                                                              
  r3.style.overflowY = 'hidden';
  r3.style.overflowX = 'auto';

  window.addEventListener('scroll', () => {
    const stalo = window.scrollY;
    const sdvig = stalo - opora;
    if (Math.abs(sdvig) < 12) return;

    const vniz = sdvig > 0 && stalo > 60;
    opora = stalo;
    if (vniz === sprjatan) return;
    sprjatan = vniz;

    r3.style.opacity = vniz ? '0' : '1';
    r3.style.maxHeight = vniz ? '0' : '48px';
    r3.style.pointerEvents = vniz ? 'none' : '';
  }, { passive: true });
}

                                                                        
                                                                  
                                                                 
                                                      
function privjazatKompakt() {
                                                           
                                                               
                                                                
                                                             
  document.getElementById('men-kompakt')?.remove();
  return;
                                     
  const mesto = document.getElementById('men-kompakt');
  if (!mesto || mesto.dataset.gotov) return;
  mesto.dataset.gotov = '1';
  const rjad2 = document.querySelector('.men .npr-chipy');
  const rjad3 = document.querySelector('.men .men-r3');
  let html = '';
  if (rjad2) html += '<span class="vyp kmp-v"><a class="fil-b kmp-kn" id="kmp-r2"></a></span>';
  if (rjad3) html += '<span class="vyp kmp-v"><a class="fil-b kmp-kn" id="kmp-r3"></a></span>';
  if (!html) { mesto.remove(); return; }
  mesto.innerHTML = html;

  const privjazat = (id, rjad, selektor, pusto) => {
    const kn = document.getElementById(id);
    if (!kn) return;
    const punkty = [...rjad.querySelectorAll(selektor)]
      .filter((e) => !e.classList.contains('npr-esche'))
      .map((e, i) => ({ el: e, kod: String(i),
                        imja: (e.textContent || '').trim() || pusto }));
    if (!punkty.length) { kn.closest('.kmp-v')?.remove(); return; }
    const tekuschij = () => {
      const on = punkty.find((x) => x.el.classList.contains('on'));
                                                                
                                           
      if (!on || on.imja === 'все') return pusto;
      return on.imja;
    };
    const podpisat_kn = () => {
      kn.innerHTML = `${tekuschij()}<span class="str"></span>`;
    };
    podpisat_kn();
    const sp = vypadajuschij(kn,
      punkty.map((x) => ({ kod: x.kod, imja: x.imja })),
      String(punkty.findIndex((x) => x.el.classList.contains('on'))));
    sp.addEventListener('click', (ev) => {
      const v = ev.target.closest('.vyp-p');
      if (!v) return;
      const x = punkty[Number(v.dataset.kod)];
      if (!x) return;
      x.el.click();
      setTimeout(() => {
        podpisat_kn();
        sp.querySelectorAll('.vyp-p').forEach((e2) =>
          e2.classList.toggle('on', e2 === v));
      }, 120);
    });
  };
  if (rjad2) privjazat('kmp-r2', rjad2, 'a.npr-ch', 'направление');
  if (rjad3) privjazat('kmp-r3', rjad3, '.chel[data-chel]', 'люди');

                                                              
                                                           
                                                              
                                 
  const dej = document.querySelector('.men .men-r2-dejstvie');
  if (dej) {
    const dom = dej.parentElement;
    const peremestit = () => {
      if (matchMedia('(max-width:760px)').matches) {
        if (dej.parentElement !== mesto) mesto.appendChild(dej);
      } else if (dej.parentElement !== dom) dom.appendChild(dej);
    };
    peremestit();
    addEventListener('resize', peremestit);
  }
}

                                                           
                                                               
                                                            
                                     
let projectEditModule;
let projectActionModule;
function projectActionUi(){if(window.LocusProjectActions)return Promise.resolve(window.LocusProjectActions);if(!projectActionModule)projectActionModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/proekt-dejstvija.js';script.onload=()=>resolve(window.LocusProjectActions);script.onerror=()=>{projectActionModule=null;script.remove();reject(new Error('Не удалось загрузить действия проекта'));};document.head.append(script);});return projectActionModule;}
function projectEditUi(){if(window.LocusProjectEdit)return Promise.resolve(window.LocusProjectEdit);if(!projectEditModule)projectEditModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/proekt-pravka.js';script.onload=()=>resolve(window.LocusProjectEdit);script.onerror=()=>{projectEditModule=null;script.remove();reject(new Error('Не удалось загрузить редактор проекта'));};document.head.append(script);});return projectEditModule;}
let servicesModule;
function servicesUi(){
 if(window.LocusServices)return Promise.resolve(window.LocusServices);
 if(!servicesModule){const load=(file,name)=>window[name]?Promise.resolve():new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[name]?resolve():reject(new Error('Не удалось открыть услуги'));script.onerror=()=>{script.remove();reject(new Error('Не удалось загрузить услуги. Повтори открытие.'));};document.head.append(script);});servicesModule=load('uslugi-sostojanie.js','LocusServiceState').then(()=>load('uslugi.js','LocusServices')).then(()=>window.LocusServices).catch(error=>{servicesModule=null;throw error;});}
 return servicesModule;
}
let feedModule;
function feedUi(){
 if(window.LocusFeedState)return Promise.resolve(window.LocusFeedState);
 if(!feedModule){const load=(file,name)=>window[name]?Promise.resolve():new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[name]?resolve():reject(new Error('Не загрузилась отправка записи'));script.onerror=()=>{script.remove();reject(new Error('Не загрузилась отправка записи. Повтори открытие'));};document.head.append(script);});feedModule=load('feed-text.js','LocusFeedText').then(()=>load('feed-state.js','LocusFeedState')).then(()=>window.LocusFeedState).catch(error=>{feedModule=null;throw error;});}return feedModule;
}
let cabinetReflectionModule;
function cabinetReflectionUi(){
 if(window.LocusCabinetReflection)return Promise.resolve(window.LocusCabinetReflection);
 if(!cabinetReflectionModule)cabinetReflectionModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/cabinet-reflection.js';script.onload=()=>window.LocusCabinetReflection?resolve(window.LocusCabinetReflection):reject(new Error('Не загрузилась личная рефлексия'));script.onerror=()=>{script.remove();reject(new Error('Не загрузилась личная рефлексия. Повтори открытие'));};document.head.append(script);}).catch(error=>{cabinetReflectionModule=null;throw error;});return cabinetReflectionModule;
}
let contextHintsModule;
function contextHintsUi(){
 if(window.LocusContextHints)return Promise.resolve(window.LocusContextHints);
 if(!contextHintsModule){
  const style=document.createElement('link');style.rel='stylesheet';style.href='/css/context-hints.css';if(!document.querySelector('link[href="/css/context-hints.css"]'))document.head.append(style);
  const load=(file,name)=>window[name]?Promise.resolve():new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[name]?resolve():reject(Error('Не загрузилась подсказка раздела'));script.onerror=()=>{script.remove();reject(Error('Не загрузилась подсказка раздела'));};document.head.append(script);});
  contextHintsModule=load('context-hints-model.js','LocusContextHintsModel').then(()=>load('context-hints.js','LocusContextHints')).then(()=>window.LocusContextHints).catch(error=>{contextHintsModule=null;throw error;});
 }
 return contextHintsModule;
}
let taskWorkloadModule;
function taskWorkloadUi(){
 if(window.LocusTaskWorkload)return Promise.resolve(window.LocusTaskWorkload);
 if(!taskWorkloadModule)taskWorkloadModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/task-workload.js';script.onload=()=>window.LocusTaskWorkload?resolve(window.LocusTaskWorkload):reject(new Error('Не загрузилась подсказка загрузки'));script.onerror=()=>{script.remove();reject(new Error('Не загрузилась подсказка загрузки'));};document.head.append(script);}).catch(error=>{taskWorkloadModule=null;throw error;});
 return taskWorkloadModule;
}
let campaignModule;
let baseImportModule=null;
let taskCampaignFormModule=null;
function taskCampaignFormUi(){if(window.LocusTaskCampaignForm)return Promise.resolve(window.LocusTaskCampaignForm);if(!taskCampaignFormModule)taskCampaignFormModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/task-campaign-form.js';script.onload=()=>window.LocusTaskCampaignForm?resolve(window.LocusTaskCampaignForm):reject(new Error('Раздел рассылки не загрузился'));script.onerror=()=>{taskCampaignFormModule=null;script.remove();reject(new Error('Не удалось загрузить выбор рассылки. Повтори открытие формы'));};document.head.append(script);});return taskCampaignFormModule;}
function baseImportUi(){
 if(window.LocusBaseImport)return Promise.resolve(window.LocusBaseImport);
 if(!baseImportModule)baseImportModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/base-import.js';script.onload=()=>window.LocusBaseImport?resolve(window.LocusBaseImport):reject(new Error('Не загрузился импорт'));script.onerror=()=>{script.remove();reject(new Error('Не загрузился импорт. Повтори открытие'));};document.head.append(script);}).catch(error=>{baseImportModule=null;throw error;});return baseImportModule;
}
let baseModule=null;
function baseUi(){
 if(window.LocusBaseState)return Promise.resolve(window.LocusBaseState);
 if(!baseModule)baseModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/base-state.js';script.onload=()=>window.LocusBaseState?resolve(window.LocusBaseState):reject(new Error('Не загрузилось сохранение базы'));script.onerror=()=>{script.remove();reject(new Error('Не загрузилось сохранение базы. Повтори открытие'));};document.head.append(script);}).catch(error=>{baseModule=null;throw error;});return baseModule;
}
function campaignUi(){
 if(window.LocusCampaignCreate)return Promise.resolve(window.LocusCampaignCreate);
 if(!campaignModule)campaignModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/campaign-create.js';script.onload=()=>window.LocusCampaignCreate?resolve(window.LocusCampaignCreate):reject(new Error('Не загрузилось создание кампании'));script.onerror=()=>{script.remove();reject(new Error('Не загрузилось создание кампании. Повтори открытие'));};document.head.append(script);}).catch(error=>{campaignModule=null;throw error;});return campaignModule;
}
let preferencesModule;
function preferencesUi(){if(window.LocusPreferencesState)return Promise.resolve(window.LocusPreferencesState);if(!preferencesModule){const load=(file,name)=>window[name]?Promise.resolve():new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[name]?resolve():reject(new Error('Не загрузились настройки'));script.onerror=()=>{script.remove();reject(new Error('Не загрузились настройки. Повтори открытие'));};document.head.append(script);});preferencesModule=load('preferences-model.js','LocusPreferencesModel').then(()=>load('preferences-state.js','LocusPreferencesState')).then(()=>window.LocusPreferencesState).catch(error=>{preferencesModule=null;throw error;});}return preferencesModule;}
let campaignPlanModule;
function campaignPlanUi(){if(window.LocusCampaignPlan)return Promise.resolve(window.LocusCampaignPlan);if(!campaignPlanModule)campaignPlanModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/campaign-plan.js';script.onload=()=>window.LocusCampaignPlan?resolve(window.LocusCampaignPlan):reject(new Error('Не загрузилось изменение плана'));script.onerror=()=>{script.remove();reject(new Error('Не загрузилось изменение плана. Повтори открытие'));};document.head.append(script);}).catch(error=>{campaignPlanModule=null;throw error;});return campaignPlanModule;}
let broadcastModule;
function broadcastUi(){
 if(window.LocusBroadcastState)return Promise.resolve(window.LocusBroadcastState);
 if(!broadcastModule)broadcastModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/broadcast-state.js';script.onload=()=>window.LocusBroadcastState?resolve(window.LocusBroadcastState):reject(new Error('Не загрузилась проверка рассылки'));script.onerror=()=>{script.remove();reject(new Error('Не загрузилась проверка рассылки. Повтори открытие'));};document.head.append(script);}).catch(error=>{broadcastModule=null;throw error;});return broadcastModule;
}
let focusTaskModule;
function focusTaskUi(){
 if(window.LocusFocusTask)return Promise.resolve(window.LocusFocusTask);
 if(!focusTaskModule){const style=document.createElement('link');style.rel='stylesheet';style.href='/css/focus-task.css';if(!document.querySelector('link[href="/css/focus-task.css"]'))document.head.append(style);
  focusTaskModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/focus-task.js';script.onload=()=>window.LocusFocusTask?resolve(window.LocusFocusTask):reject(Error('Не загрузилась связь с фокусом'));script.onerror=()=>{script.remove();reject(Error('Не загрузилась связь с фокусом'));};document.head.append(script);}).catch(error=>{focusTaskModule=null;throw error;});
 }return focusTaskModule;
}
let focusModule;
function focusUi(){
 if(window.LocusFocusState)return Promise.resolve(window.LocusFocusState);
 if(!focusModule){const load=(file,name)=>window[name]?Promise.resolve():new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[name]?resolve():reject(new Error('Не загрузился таймер'));script.onerror=()=>{script.remove();reject(new Error('Не загрузился таймер. Повтори открытие'));};document.head.append(script);});focusModule=load('focus-time.js','LocusFocusTime').then(()=>load('focus-state.js','LocusFocusState')).then(()=>window.LocusFocusState).catch(error=>{focusModule=null;throw error;});}return focusModule;
}
let referralTasksModule;
function referralTasksUi(){if(window.LocusReferralTasks)return Promise.resolve(window.LocusReferralTasks);if(!referralTasksModule)referralTasksModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/referral-tasks.js';script.onload=()=>resolve(window.LocusReferralTasks);script.onerror=()=>{referralTasksModule=null;script.remove();reject(new Error('Не загрузились задачи реферала'));};document.head.append(script);});return referralTasksModule;}
let referralPayoutLinkModule;
function referralPayoutLinkUi(){if(window.LocusReferralPayoutLink)return Promise.resolve(window.LocusReferralPayoutLink);if(!referralPayoutLinkModule)referralPayoutLinkModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/referral-payout-link.js';script.onload=()=>resolve(window.LocusReferralPayoutLink);script.onerror=()=>{referralPayoutLinkModule=null;script.remove();reject(new Error('Не загрузилась связь выплаты с задачей'));};document.head.append(script);});return referralPayoutLinkModule;}

let referralPayoutModule;
function referralPayoutUi(){
 if(window.LocusReferralPayoutUi)return Promise.resolve(window.LocusReferralPayoutUi);
 if(!referralPayoutModule){const load=(file,name)=>window[name]?Promise.resolve():new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[name]?resolve():reject(new Error('Не удалось открыть отметку выплаты'));script.onerror=()=>{script.remove();reject(new Error('Не удалось загрузить форму выплаты. Повтори открытие'));};document.head.append(script);});referralPayoutModule=load('referral-payout-state.js','LocusReferralPayoutState').then(()=>load('referral-payout-undo.js','LocusReferralPayoutUndo')).then(()=>load('referral-payout.js','LocusReferralPayoutUi')).then(()=>window.LocusReferralPayoutUi).catch(error=>{referralPayoutModule=null;throw error;});}
 return referralPayoutModule;
}
let referralTermsModule;
function referralTermsUi(){
 if(window.LocusReferralTermsUi)return Promise.resolve(window.LocusReferralTermsUi);
 if(!referralTermsModule){const load=(file,name)=>window[name]?Promise.resolve():new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/'+file;script.onload=()=>window[name]?resolve():reject(new Error('Не удалось открыть условия реферала'));script.onerror=()=>{script.remove();reject(new Error('Не удалось загрузить форму условий. Повтори открытие'));};document.head.append(script);});referralTermsModule=load('referral-terms-state.js','LocusReferralTermsState').then(()=>load('referral-terms-recovery.js','LocusReferralTermsRecovery')).then(()=>load('referral-terms-undo.js','LocusReferralTermsUndo')).then(()=>load('referral-terms.js','LocusReferralTermsUi')).then(()=>window.LocusReferralTermsUi).catch(error=>{referralTermsModule=null;throw error;});}
 return referralTermsModule;
}
let projectCreateModule;
function projectCreateUi(){if(window.LocusProjectCreate)return Promise.resolve(window.LocusProjectCreate);if(!projectCreateModule)projectCreateModule=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/js/sozdanie-proekta.js';script.onload=()=>resolve(window.LocusProjectCreate);script.onerror=()=>{projectCreateModule=null;script.remove();reject(new Error('Не удалось загрузить создание проекта. Повтори открытие.'));};document.head.append(script);});return projectCreateModule;}
async function formaProekta(kontekst={},priGotovo){try{return (await projectCreateUi()).open(kontekst,priGotovo);}catch(error){tost(error.message);}}

                                                        
                                                              
                                                                 
                                                                
function mobRjad1() {
  if (window.innerWidth > 760) return;
  const r1 = document.querySelector('.men-r1-obj');
  const rjad = document.querySelector('.men .npr-chipy');
  if (!r1 || !rjad || document.getElementById('r1-chip')) return;
  const chipy = [...rjad.querySelectorAll('a')]
    .filter((e) => !e.classList.contains('npr-esche'));
  if (!chipy.length) return;
  const ob = document.createElement('span');
  ob.className = 'vyp r1-vyp';
  ob.innerHTML = '<a class="fil-b r1-chip" id="r1-chip">'
    + '<span class="r1-t"></span><span class="str"></span></a>';
  r1.insertBefore(ob, document.getElementById('men-inf') || null);
  const kn = ob.querySelector('#r1-chip');
  const imja_chipa = (e) => (e.textContent || '').trim();
  const podpis = () => {
    const on = chipy.find((e) => e.classList.contains('on')) || chipy[0];
    const t2 = kn.querySelector('.r1-t');
    if (t2) t2.textContent = imja_chipa(on);
  };
  podpis();
  vypadajuschij(kn, chipy.map((e, i) =>
    ({ kod: String(i), imja: imja_chipa(e) })), '')
    .addEventListener('click', (ev) => {
      const pnt = ev.target.closest('.vyp-p'); if (!pnt) return;
      const cel = chipy[Number(pnt.dataset.kod)];
      if (!cel) return;
      cel.click();
      if (!cel.getAttribute('href')) setTimeout(podpis, 60);
    });
  new MutationObserver(podpis).observe(rjad,
    { attributes: true, subtree: true, attributeFilter: ['class'] });
  document.body.dataset.r1Chip = '1';
}

                                                             
                                                                 
                                                               
                                                              
const KROSH_KLJUCH = 'locus-put';
const KROSH_IMENA = {
  '/prostranstvo.html': 'Пространство', '/zadachi.html': 'Задачи',
  '/planerka.html': 'Планёрка', '/ljudi.html': 'Люди',
  '/napravlenija.html': 'Направления', '/poleznoe.html': 'Полезное',
  '/okr.html': 'ОКР', '/uvedomlenija.html': 'Уведомления',
  '/kabinet.html': 'Про меня', '/klient.html': 'Карточка',
  '/proekt.html': 'Проект', '/rassylka.html': 'Рассылка',
  '/sozdat.html': 'Новая задача', '/brendbuk.html': 'Брендбук',
  '/okna.html': 'Окна',
};
                                                          
                                                               
function krosh_stek() {
  try { return JSON.parse(localStorage.getItem(KROSH_KLJUCH) || '[]'); }
  catch { return []; }
}
function krosh_pisat(stek) {
  try { localStorage.setItem(KROSH_KLJUCH, JSON.stringify(stek.slice(-7))); }
  catch {                      }
}
let KROSH_ZHDET = null;                                                 
function vkljuchitKroshki() {
  const u = location.pathname + location.search;
                                                              
                                                                 
                                                            
  if (location.pathname === '/prostranstvo.html' || location.pathname === '/kabinet.html') {
    krosh_pisat([{ t: KROSH_IMENA[location.pathname] || 'Пространство', u }]);
    document.querySelector('.krosh')?.remove();
    return;
  }
  const imja = KROSH_ZHDET
    || KROSH_IMENA[location.pathname] || document.title || 'Экран';
  let stek = krosh_stek();
  const uzhe = stek.findIndex((s) => s.u === u);
  const put_iz = (s) => String(s.u).split('?')[0];
  if (uzhe >= 0) stek = stek.slice(0, uzhe + 1);                     
                                                                      
                                                                     
  else if (stek.length && put_iz(stek[stek.length - 1]) === location.pathname) {
    stek[stek.length - 1] = { t: imja, u };
  } else stek.push({ t: imja, u });
                                                             
  stek = stek.filter((s, i, a) => i === a.length - 1 || put_iz(a[i + 1]) !== put_iz(s));
  krosh_pisat(stek);
                                                               
                                                                
  const proshlye = stek.slice(0, -1).slice(-6);
  document.querySelector('.krosh')?.remove();
  if (!proshlye.length) return;
  const rjad = document.createElement('nav');
  rjad.className = 'krosh';
  rjad.setAttribute('aria-label', 'путь');
  rjad.innerHTML = proshlye.map((s) =>
    `<a href="${ekranirovat(s.u)}">${ekranirovat(s.t)}</a>`).join('<i>/</i>')
    + `<i>/</i><b>${ekranirovat(imja)}</b>`;
                                                              
                                                                
                                                             
                                                          
  const kuda = document.querySelector('.wrap .kol')
    || document.querySelector('.wrap > div')
    || document.querySelector('.wrap');
                                                                   
                                                                    
  const svoj_rjad = kuda?.querySelector(':scope > .uv-sh');
  if (svoj_rjad) svoj_rjad.after(rjad);
  else kuda?.insertBefore(rjad, kuda.firstChild);
}
                                                            
function kroshkiPodpis(imja) {
  KROSH_ZHDET = imja;
  const u = location.pathname + location.search;
  const stek = krosh_stek();
  const svoj = stek.find((s) => s.u === u);
  if (svoj) { svoj.t = imja; krosh_pisat(stek); }
  const b = document.querySelector('.krosh b');
  if (b) b.textContent = imja;
}

function vkljuchitSkvoznoe_bazovyj(priSozdanii) {
  rjadUezzhaet();
                                                               
                                                             
                                                                   
                                                                      
  if (!window.__opros_zapuschen) {
    window.__opros_zapuschen = true;
    setInterval(() => {
      if (document.hidden) return;
      if (typeof window.OPROS !== 'function') return;
      const ak = document.activeElement;
      if (ak && (ak.tagName === 'INPUT' || ak.tagName === 'TEXTAREA'
                 || ak.isContentEditable)) return;
      if (document.querySelector('.vyb-fon, .plt-fon, .sozd.on, .plk, .vyp.otkryt, .l-select-popup, .zs[aria-busy=true], .dsk-k[aria-busy=true], [data-pravim="1"], [data-locus-dragging="1"]')) return;
      obnovitEkran().catch(() => {});
    }, 30000);
  }
  privjazatKompakt();
                                                              
                                                               
                                                               
                                                              
  privjazatInf(document.getElementById('inf-plav'));
  privjazatInf(document.getElementById('inf-plav-niz'));
  mobRjad1();
  vkljuchitKroshki();
                                                            
  document.getElementById('plav-sozd')?.addEventListener('click', () => {
                                                             
                                                               
                                            
    if (window.innerWidth <= 760
        && !location.pathname.includes('sozdat')) {
      const q = new URLSearchParams(kontekstEkrana()).toString();
      location.href = '/sozdat.html' + (q ? '?' + q : '');
      return;
    }
    const sozd = document.getElementById('sozd');
    if (!sozd) return;
    sozd.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => sozd.querySelector('#sozd-imja')?.focus(), 350);
  });
                                                       
                                                               
                                              
  if (!document.body.dataset.niz_kolokol_slushatel) {
    document.body.dataset.niz_kolokol_slushatel = '1';
    document.addEventListener('click', (e) => {
      const kn = e.target.closest('#niz-kolokol');
      if (!kn) return;
      e.preventDefault(); e.stopPropagation();
                                                          
                                                   
      document.querySelector('.niz-vyp')?.classList.remove('vidno');
      document.querySelector('[data-esche]')?.classList.remove('otkryt');
      document.getElementById('uved')?.classList.toggle('on');raskrytieUvedomlenij();
    }, true);
  }
  const kol = document.getElementById('kolokol');
  const uv = document.getElementById('uved');
  if (kol && uv) {
    kol.addEventListener('click', (e) => { e.stopPropagation(); uv.classList.toggle('on');raskrytieUvedomlenij(); });
                                                               
                                                               
                                                            
                                                               
    if (!document.body.dataset.uved_slushatel) {
      document.body.dataset.uved_slushatel = '1';
      document.addEventListener('click', (e) => {
        const uv2 = document.getElementById('uved');
        const kol2 = document.getElementById('kolokol');
        if (!uv2) return;
        if (!uv2.contains(e.target) && !(kol2 && kol2.contains(e.target))
            && !e.target.closest('#niz-kolokol')) uv2.classList.remove('on');
      });
    }
    if(!uv.dataset.uvedBound){
      uv.dataset.uvedBound='1';
      uv.addEventListener('click',async e=>{
        if(e.target.closest('[data-uved-retry]')){e.preventDefault();await obnovitUvedomlenija();return;}
        const expand=e.target.closest('[data-uved-expand]');
        if(expand){e.preventDefault();const open=expand.getAttribute('aria-expanded')!=='true';expand.setAttribute('aria-expanded',String(open));expand.textContent=open?'свернуть':'показать целиком';expand.closest('[data-uved-popup-ob]').querySelector('.uved-im').classList.toggle('uved-clamp',!open);return;}
        const link=e.target.closest('[data-uved]');
        if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;
        e.preventDefault();const id=Number(link.dataset.uved);
        if(link.getAttribute('aria-busy')==='true')return;
        link.setAttribute('aria-busy','true');
        try{await otmetitUvedomlenie(id,true);if(link.getAttribute('href'))location.assign(link.href);}
        catch(error){tost('Отметка не подтверждена: '+error.message);}
        finally{link.removeAttribute('aria-busy');}
      });
    }
  }
  obnovitUvedomlenija();

  const hintCode={'/zadachi.html':'zadachi','/ljudi.html':'ljudi','/planerka.html':'planerka','/poleznoe.html':'poleznoe'}[location.pathname];
  if(hintCode)contextHintsUi().then(module=>module.mount({code:hintCode,anchor:document.getElementById('menju')})).catch(()=>{});
  vkljuchitFormuZadachi(priSozdanii);
}

                                                             
                                              
function privjazatInf(inf_kn) {
  if (inf_kn && !inf_kn.dataset.gotov) {
    inf_kn.dataset.gotov = '1';
    let plashka = null, fonchik = null, tajmer = null, pinned = false;
    const soderzhimoe = () => {
      const svojo = document.querySelector('.pz-inf-telo');
      if (svojo && svojo.innerHTML.trim()) return svojo.innerHTML;
      const razdel = window.__razdel || '';
      const tekst = POJASNENIJA_EKRANA[razdel]
        || 'Это экран Locus. Разделы внизу, создание задачи справа';
      return `<h4>${razdel || 'Что это'}</h4><p>${tekst}</p>`;
    };
    const pokazat = () => {
      clearTimeout(tajmer); tajmer = null;
      if (plashka) return;
      fonchik = document.createElement('div');
      fonchik.className = 'inf-fon';
      plashka = document.createElement('div');
      plashka.className = 'inf-plashka';
      inf_kn.setAttribute('aria-expanded','true');
      plashka.innerHTML = soderzhimoe();
      const report=document.createElement('button');report.type='button';report.className='kn';report.dataset.errorReportOpen='1';report.textContent='сообщить об ошибке';report.addEventListener('click',()=>{sprjatat();oknoSlomalos();});plashka.append(report);
      if(window.LocusSessija?.error_log_owner){const journal=document.createElement('button');journal.type='button';journal.className='kn';journal.dataset.errorJournalOpen='1';journal.textContent='журнал ошибок';journal.onclick=()=>{sprjatat();errorReportsUi().then(m=>m.journal()).catch(e=>tost(e.message));};plashka.append(journal);}
      document.body.appendChild(fonchik);
      document.body.appendChild(plashka);
      const b = inf_kn.getBoundingClientRect();
      const sh = Math.min(380, window.innerWidth - 32);
      plashka.style.width = `${sh}px`;
      plashka.style.left = `${Math.max(16,
        Math.min(Math.round(b.right - sh), window.innerWidth - sh - 16))}px`;
                                                          
      if (b.top > window.innerHeight / 2) {
        plashka.style.top = `${Math.max(16,
          Math.round(b.top - plashka.offsetHeight - 14))}px`;
      } else {
        plashka.style.top = `${Math.round(b.bottom + 14)}px`;
      }
      plashka.addEventListener('mouseenter', () => {
        clearTimeout(tajmer); tajmer = null;
      });
      plashka.addEventListener('mouseleave', sprjatat_pozhe);
    };
    const sprjatat = () => {
      plashka?.remove(); fonchik?.remove();
      plashka = null; fonchik = null;pinned=false;inf_kn.setAttribute('aria-expanded','false');
    };
    const sprjatat_pozhe = () => {
      if(pinned||plashka?.contains(document.activeElement))return;
      clearTimeout(tajmer);
      tajmer = setTimeout(sprjatat, 160);
    };
    inf_kn.addEventListener('mouseenter',()=>{if(matchMedia('(hover:hover)').matches)pokazat();});
    inf_kn.addEventListener('mouseleave', sprjatat_pozhe);
    inf_kn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (plashka&&pinned) sprjatat(); else {pokazat();pinned=true;}
    });
    document.addEventListener('click', (e) => {
      if (plashka && !plashka.contains(e.target)
          && !inf_kn.contains(e.target)) sprjatat();
    });
  }
}

                                                          
                                                                 
                                                                 
                                                                  
                                                                    
let VYBOR = {};

function sbrositVybor() {
                                                                   
                                                            
                                                      
                                 
  VYBOR = { status: 'v_plane', tip: 'vnutrennjaja', uchastniki: [],
            otvetstvennyj: (window.API && API.ja) || null };
}

                                                                       
                                                             
                                                                  
                                                              
function pokazatPoTipu(korob) {
  if (!korob) return;
  const tip = VYBOR.tip || 'vnutrennjaja';
  const klientu = tip === 'klientskaja' || tip === 'kasanie';
  const svjazana=!!(VYBOR.klient_id||VYBOR.proekt_id||VYBOR.klient_vybran_rukami);
  korob.querySelector('.pole-klienta')?.toggleAttribute('hidden', !klientu&&!svjazana);
  korob.querySelector('.pole-proekta')?.toggleAttribute('hidden', !klientu&&!svjazana);
  korob.querySelector('.pole-chisla')?.toggleAttribute('hidden', !['biznesovaja','rassylka'].includes(tip));
                                                                 
  korob.querySelector('#sozd-klient')
    ?.classList.toggle('nuzhno', tip === 'klientskaja');
  korob.querySelector('.pole-chisla')
    ?.classList.toggle('nuzhno', ['biznesovaja','rassylka'].includes(tip));
}

                                                                   
                                                              
                                                        
let DOGRUZKA = null;
async function dogruzitSpravochniki() {
  if (DOGRUZKA) return DOGRUZKA;
  const allPages=async table=>{const spisok=[],seen=new Set();let pages=1;for(let page=1;page<=pages;page++){const part=await API.spisok(table,{na_stranice:200,stranica:page,sortirovka:'id_asc'});if(!Array.isArray(part.spisok))throw new Error('Не удалось подтвердить полный справочник');if(part.stranic===undefined&&part.vsego===part.spisok.length)return part;if(!Number.isSafeInteger(part.stranic)||part.stranic<1)throw new Error('Не удалось подтвердить полный справочник');pages=part.stranic;for(const row of part.spisok)if(!seen.has(row.id)){seen.add(row.id);spisok.push(row);}}return{spisok,vsego:spisok.length};};
  DOGRUZKA = (async () => {
    const D = window.DANNYE || (window.DANNYE = {});
    try {
      const [ljudi, proekty, celi, shablony] = await Promise.all([
        allPages('ljudi'),
        allPages('proekty'),
        allPages('celi'),
        allPages('shablony'),
      ]);
                                                                 
                                                          
      D.klienty = (ljudi.spisok || []).filter((l) => !l.komanda)
        .map((l) => ({ kod: String(l.id), imja: l.imja }));
      D.proekty_vse=(proekty.spisok||[]).map(p=>({kod:String(p.id),imja:p.nazvanie,napravlenie:p.napravlenie,klient_id:p.klient_id,status:p.status,arhiv:p.arhiv}));
      D.proekty=D.proekty_vse.filter(p=>!p.arhiv&&p.status!=='zavershen');
      D.celi = (celi.spisok || []).map((c) => ({
        kod: String(c.id), imja: c.nazvanie || c.formulirovka,
        napravlenie: c.napravlenie }));
      D.shablony = shablony.spisok || [];D.spravochniki_oshibka=false;
    } catch (e) {
                                                                 
                                         
      D.klienty = D.klienty || []; D.proekty = D.proekty || [];
      D.celi = D.celi || []; D.shablony = D.shablony || [];D.spravochniki_oshibka=true;DOGRUZKA=null;
    }
    return D;
  })();
  return DOGRUZKA;
}

                                                               
                                            
                                                           
                                                                 
                                                      
function kontekstEkrana() {
  const a = window.LocusTaskRoute.query(location.href),entity=window.LocusTaskRoute.entity(location.href);
  const k = {};
  const kod = a.get('napravlenie');
  if (kod && (D.napravlenija || []).some((n) => n.kod === kod)) k.napravlenie = kod;
  const id = a.get('id');
  if (id && (location.pathname.includes('klient')||entity?.table==='ljudi')) k.klient_id = id;
  if (id && (location.pathname.includes('proekt')||entity?.table==='proekty')) k.proekt_id = id;
  const week = a.get('sprint');
  if (week && week !== 'vse') k.sprint = week;
  else if (D.nedelja?.god && D.nedelja?.nomer) {
    k.sprint = SPR.kalendar.kljuch_nedeli(D.nedelja.god,D.nedelja.nomer);
  }
  return k;
}

function vkljuchitFormuZadachi(priSozdanii) {
  const sozd = document.getElementById('sozd');
  if (!sozd) return;
  const vstroena = sozd.classList.contains('vstroen');
  let workloadOpen=vstroena,workloadController=null,workloadReady=null;
  let draftRevision=0,accountController=null,childBaseline=null,childParent=null,campaignController=null,campaignReady=null;
  let paymentState=null,paymentGeneration=0,paymentDateEdited=false,paymentApplying=false;
  const creationGates=new Set();
  sozd.locusSetCreationGate=(name,blocked)=>{
    if(blocked)creationGates.add(name);else creationGates.delete(name);
    for(const id of ['sozd-sozdat','sozd-gotovo']){const control=sozd.querySelector('#'+id);if(control){control.inert=creationGates.size>0;control.setAttribute('aria-disabled',String(creationGates.size>0));}}
  };
  const childSignature=()=>JSON.stringify({
    selection:Object.fromEntries(['napravlenie','otvetstvennyj','tip','status','sprint','god_sprinta','klient_id','proekt_id','cel_id','uchastniki','ploshadka','format','akkaunt_id'].map(key=>[key,VYBOR[key]??null])),
    fields:[...sozd.querySelectorAll('input:not([type=file]),textarea,select')].map(node=>[node.id,node.type==='checkbox'?node.checked:node.value]),
    files:fajly_formy.map(file=>[file.nazvanie,file.ssylka,file.fajl?.size]),children:SEGMENTY_PZ,
  });
  const touchDraft=()=>{sozd.dataset.locusDraft='1';draftRevision++;};
  for(const event of ['input','change'])sozd.addEventListener(event,()=>touchDraft());
  sozd.addEventListener('click',event=>{if(event.target.closest('.sozd-pole,.sozd-vvod'))touchDraft();});
  const defaultCreation=!priSozdanii;
  if(defaultCreation)priSozdanii=async(imja,polja)=>{
    const created=await API.sozdat('zadachi',{...polja,nazvanie:imja,otvetstvennyj:polja.otvetstvennyj?Number(polja.otvetstvennyj):API.ja});
    toastCreatedTask(created,{posle:refreshAfterTaskCreation});
  };
                                                                 
                                                                  
                                                         
                               
  if (!vstroena && sozd.parentElement !== document.body) {
    document.body.appendChild(sozd);
  }
  sbrositVybor();

  const pole = (id) => sozd.querySelector('#' + id);
  const osh = pole('sozd-osh');
  let copyKey=null,copyBase=null;
  const frozenCreationParts=new Map();
  const freezePendingCreation=enabled=>{if(enabled){for(const node of sozd.querySelector('.sozd-k').children)if(node!==osh&&!node.hasAttribute('data-task-creation-form-note')){if(!frozenCreationParts.has(node))frozenCreationParts.set(node,node.inert);node.inert=true;}}else{for(const [node,inert] of frozenCreationParts)node.inert=inert;frozenCreationParts.clear();}};
  const pokazatOshibku = (t) => {
    if (!osh) { tost(t); return; }
    osh.textContent = t; osh.hidden = false;osh.setAttribute('role','status');osh.setAttribute('aria-live','polite');
  };
  const snjatOshibku = () => { if (osh) { osh.hidden = true; osh.textContent = ''; } };
  let uploadController=null;
  const uploadBox=document.createElement('div');uploadBox.id='sozd-upload';uploadBox.className='sozd-upload';uploadBox.hidden=true;uploadBox.setAttribute('role','status');
  uploadBox.innerHTML='<span id="sozd-upload-label"></span><progress id="sozd-upload-progress" max="100" value="0"></progress><button type="button" class="kn" id="sozd-upload-cancel">отменить загрузку</button>';
  sozd.querySelector('.sozd-k').append(uploadBox);pole('sozd-upload-cancel').onclick=()=>{uploadController?.abort();};
  const repeatVisibility = () => {
    const enabled = Boolean(pole('sozd-repeat')?.checked);
    for (const id of ['sozd-srok','sozd-sprint','sozd-status']) {
      const row = pole(id)?.closest('.sozd-p'); if (row) row.hidden = enabled;
    }
    if (pole('sozd-gotovo')) pole('sozd-gotovo').hidden = enabled;
    if (pole('sozd-repeat-frequency-o')) pole('sozd-repeat-frequency-o').hidden = !enabled;
    if(pole('sozd-repeat-start-o'))pole('sozd-repeat-start-o').hidden=!enabled;
    if(enabled&&!pole('sozd-repeat-start').value)pole('sozd-repeat-start').value=SPR.segodnja();
    pole('sozd-repeat-start')?.classList.toggle('pusto',!pole('sozd-repeat-start').value);
    const frequency = pole('sozd-repeat-frequency')?.value;
    if (pole('sozd-repeat-days')) pole('sozd-repeat-days').hidden = !enabled || !['raz_v_nedelju','vybrannye_dni'].includes(frequency);
    if (frequency === 'raz_v_nedelju') {
      const checked = [...sozd.querySelectorAll('#sozd-repeat-days input:checked')];
      checked.slice(1).forEach(input => { input.checked = false; });
      if (!checked.length) sozd.querySelector('#sozd-repeat-days input').checked = true;
    }
  };
  pole('sozd-repeat')?.addEventListener('change', repeatVisibility);
  pole('sozd-repeat-frequency')?.addEventListener('change', repeatVisibility);
  sozd.querySelectorAll('#sozd-repeat-days input').forEach(input => input.addEventListener('change', () => {
    if (pole('sozd-repeat-frequency').value === 'raz_v_nedelju' && input.checked) {
      sozd.querySelectorAll('#sozd-repeat-days input').forEach(other => { if (other !== input) other.checked = false; });
    }
  }));

                                                             
  const ochistit = () => {
    workloadController?.reset();
    queueMicrotask(refreshWorkload);
    resetPayment();
    accountController?.reset();
    childBaseline=null;delete sozd.dataset.childCreation;
    if(copyKey){window.LocusTaskCopy?.discard(copyKey);const address=new URL(location.href);if(address.searchParams.get('kopija')===copyKey){address.searchParams.delete('kopija');history.replaceState(history.state,'',address);}}copyKey=null;copyBase=null;delete sozd.dataset.copyKey;
    fajly_formy=[];pole('sozd-fajly')?.replaceChildren();
    freezePendingCreation(false);delete sozd.dataset.pendingCreationKey;delete sozd.dataset.creationAttemptKey;
    sozd.dataset.locusDraft='0';
    sbrositVybor();campaignController?.reset();
    if (pole('sozd-repeat')) pole('sozd-repeat').checked = false;
    if(pole('sozd-repeat-start'))pole('sozd-repeat-start').value='';
    if(pole('sozd-repeat-frequency'))pole('sozd-repeat-frequency').value='kazhdyj_den';
    sozd.querySelectorAll('#sozd-repeat-days input').forEach(e=>e.checked=false);
    if(pole('sozd-pub')){pole('sozd-pub').checked=false;pole('sozd-pub').dispatchEvent(new Event('change'));}
    if(pole('sozd-vyhod'))pole('sozd-vyhod').value='';
    repeatVisibility();
    const klj = pole('sozd-klj');
    if (klj) klj.checked = false;
    const klj_kn = pole('sozd-klj-kn');
    if (klj_kn) {
      klj_kn.setAttribute('aria-checked', 'false');
      klj_kn.classList.remove('on');
      klj_kn.querySelector('.pere')?.classList.remove('on');
    }
    ['sozd-imja', 'sozd-opis', 'sozd-srok', 'sozd-chislo','sozd-komm','sozd-ssylka','sozd-rubrika'].forEach((id) => {
      const p = pole(id); if (p) p.value = '';
    });
    const pz_k = pole('sozd-pz'); if (pz_k) { pz_k.innerHTML = ''; pz_k.hidden = true; }
                                               
    SEGMENTY_PZ.length = 0;
    SEGMENT_AKTIVNYJ = -1;
    narisovatSegmenty();
    pereriosovatVkladku();
    const shb_kn = pole('sozd-isp-shablon');
    if (shb_kn) {
      shb_kn.innerHTML = 'использовать шаблон<span class="str"></span>';
      shb_kn.classList.remove('vybrano', 'on');
    }
    sozd.querySelectorAll('.sozd-polja .sozd-pole')
      .forEach((b) => b.classList.remove('vybrano'));
                                                               
                                            
                                                         
                                                                   
                                                      
    podpisat('sozd-tip', '');
    podpisat('sozd-status', '');
    podpisat('sozd-napr', '');
    const ja = (D.ljudi || []).find((x) => x.id === ((window.API && API.ja)));
                                                               
                                                         
    podpisat('sozd-chel', ja ? ja.imja : '', false);
    podpisat('sozd-uchast', '');
    podpisat('sozd-sprint', '');
    podpisat('sozd-cel', '');
    podpisat('sozd-klient', '');
    podpisat('sozd-proekt', '');
    for(const id of ['sozd-ploshadka','sozd-format','sozd-akkaunt']){podpisat(id,'');for(const option of pole(id)?.closest('.vyp')?.querySelectorAll('[role=option]')||[]){option.classList.remove('on');option.setAttribute('aria-selected','false');}}
    for(const id of ['sozd-srok','sozd-vyhod','sozd-repeat-start']){const input=pole(id);input?.classList.toggle('pusto',!input.value);}
    pole('sozd-srok-o')?.classList.remove('zapolnen');
    snjatOshibku();
    pokazatPoTipu(sozd);
  };

                                                                 
                                                            
                                                
  function podpisat(id, tekst, vybrano = false) {
    const b = pole(id);
    if (!b) return;
    const t = b.querySelector('.sozd-t');
    if (t) { t.textContent = tekst; b.classList.toggle('vybrano', vybrano); }
    else { b.innerHTML = ekranirovat(tekst) + '<span class="str"></span>'; }
  }

  const paymentBox=document.createElement('section');paymentBox.className='task-payment-context';paymentBox.hidden=true;paymentBox.setAttribute('aria-label','платёж задачи');pole('sozd-osh').after(paymentBox);
  const paymentPins=new Map();
  function pinPayment(enabled){
    for(const id of ['sozd-napr','sozd-proekt','sozd-klient','sozd-tip','sozd-isp-shablon','sozd-pub-kn','sozd-repeat']){
      const control=pole(id);if(!control)continue;
      if(enabled){if(!paymentPins.has(control))paymentPins.set(control,{inert:control.inert,disabled:control.disabled});control.inert=true;if('disabled'in control)control.disabled=true;control.setAttribute('aria-disabled','true');}
      else if(paymentPins.has(control)){const previous=paymentPins.get(control);control.inert=previous.inert;if('disabled'in control)control.disabled=previous.disabled;control.removeAttribute('aria-disabled');}
    }
    if(!enabled)paymentPins.clear();
  }
  function resetPayment(){paymentGeneration++;paymentState=null;paymentDateEdited=false;paymentBox.hidden=true;paymentBox.replaceChildren();pinPayment(false);sozd.locusSetCreationGate('payment',false);}
  pole('sozd-srok')?.addEventListener('input',()=>{if(paymentState&&!paymentApplying)paymentDateEdited=true;});
  pole('sozd-srok')?.addEventListener('change',()=>{if(paymentState&&!paymentApplying)paymentDateEdited=true;});
  function drawPayment(){
    paymentBox.hidden=!paymentState;paymentBox.replaceChildren();if(!paymentState)return;
    if(!paymentState.id){
      sozd.locusSetCreationGate('payment',true);
      const label=document.createElement('p');label.setAttribute('role','status');label.dataset.paymentTaskStatus='1';label.textContent=paymentState.error||(paymentState.loading?'Загружаю платежи проекта':'Выбери проект и платёж: из него подставятся сумма и срок.');paymentBox.append(label);
      if(paymentState.payments){const select=document.createElement('select');select.dataset.paymentTaskChoice='1';select.setAttribute('aria-label','платёж для задачи');select.append(new Option('выбери платёж',''));for(const p of paymentState.payments)select.append(new Option((p.naznachenie||'платёж')+' · ждём '+SPR.data(p.zhdem_do)+(p.summa==null?'':' · '+new Intl.NumberFormat('ru-RU').format(p.summa)+' ₽'),String(p.id)));select.onchange=()=>{if(Number(VYBOR.proekt_id)!==paymentState.project){paymentState={id:null,error:'Проект изменился. Прочитай его платежи заново.'};drawPayment();return;}if(select.value)void loadPayment(Number(select.value));};paymentBox.append(select);}
      const read=document.createElement('button');read.type='button';read.className='kn';read.dataset.paymentTaskList='1';read.textContent='прочитать платежи проекта';read.disabled=paymentState.loading;read.onclick=readPaymentList;paymentBox.append(read);return;
    }
    const label=document.createElement('p');label.setAttribute('role','status');label.dataset.paymentTaskStatus='1';
    const p=paymentState.prefill;
    label.textContent=paymentState.error||(paymentState.loading?'Загружаю данные платежа':p?'Задача по платежу'+(p.summa==null?' · сумма скрыта':' · '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(p.summa)+' ₽')+' · ждём '+SPR.data(p.srok):'Данные платежа не подтверждены');
    paymentBox.append(label);
    if(!paymentState.loading){const refresh=document.createElement('button');refresh.type='button';refresh.className='kn';refresh.dataset.paymentTaskRefresh='1';refresh.textContent='обновить данные платежа';refresh.addEventListener('click',()=>loadPayment(paymentState.id));paymentBox.append(refresh);}
    sozd.locusSetCreationGate('payment',paymentState.loading||!!paymentState.error||!p);
  }
  async function readPaymentList(){
    const project=Number(VYBOR.proekt_id),generation=++paymentGeneration;
    if(!project){paymentState={id:null,error:'Сначала выбери проект в поле ниже.'};drawPayment();return;}
    paymentState={id:null,loading:true,error:''};drawPayment();
    try{const result=await API.odna('proekty',project+'/platezhi');if(generation!==paymentGeneration)return;if(project!==Number(VYBOR.proekt_id))throw new Error('Проект изменился. Прочитай его платежи заново.');if(!Array.isArray(result.spisok))throw new Error('Список платежей не подтверждён');const payments=result.spisok.filter(row=>!row.oplachen_at);paymentState={id:null,project,payments,error:payments.length?'':'В этом проекте нет ожидаемых платежей или они скрыты по твоему доступу.'};}
    catch(error){if(generation===paymentGeneration)paymentState={id:null,error:error.message};}
    finally{if(generation===paymentGeneration)drawPayment();}
  }
  async function loadPayment(id){
    snjatOshibku();
    const generation=++paymentGeneration,expectedProject=paymentState?.expectedProject||Number(VYBOR.proekt_id)||null;paymentState={id:Number(id),expectedProject,prefill:paymentState?.id===Number(id)?paymentState.prefill:null,loading:true,error:''};pinPayment(true);drawPayment();
    try{
      const result=await API.odna('platezhi',Number(id)+'/shablon_zadachi');if(generation!==paymentGeneration)return;
      const p=result.zagotovka;
      if(!p||p.platezh_id!==Number(id)||!p.proekt_id||!p.klient_id||!p.napravlenie||!p.srok||typeof p.platezh_kontekst!=='string')throw new Error('Данные платежа неполные. Обнови проект.');
      if(expectedProject&&p.proekt_id!==expectedProject)throw new Error('Платёж теперь относится к другому проекту. Вернись к проекту и обнови его.');
      paymentApplying=true;
      VYBOR.klient_id=Number(p.klient_id);VYBOR.proekt_id=String(p.proekt_id);VYBOR.napravlenie=p.napravlenie;VYBOR.tip='klientskaja';VYBOR.shablon='poluchit_oplatu';delete VYBOR.campaign_template_role;
      if(!pole('sozd-imja').value.trim())pole('sozd-imja').value=p.nazvanie;
      if(!paymentDateEdited){pole('sozd-srok').value=p.srok;pole('sozd-srok').dispatchEvent(new Event('change',{bubbles:true}));}
      paymentApplying=false;
      pole('sozd-chislo').value='';
      podpisat('sozd-tip','клиентская',true);podpisat('sozd-napr',naprPoKodu(p.napravlenie).imja,true);
      const data=await dogruzit_kogda_nado();if(generation!==paymentGeneration)return;
      const known=data||window.DANNYE||{};
      const project=(known.proekty_vse||known.proekty||[]).find(row=>Number(row.kod)===p.proekt_id),client=(known.klienty||[]).find(row=>Number(row.kod)===p.klient_id);
      podpisat('sozd-proekt',project?.imja||'проект платежа',true);podpisat('sozd-klient',client?.imja||'клиент платежа',true);
      pokazatPoTipu(sozd);paymentState={id:Number(id),expectedProject:p.proekt_id,prefill:p,loading:false,error:''};
      await campaignReady;campaignController?.sync();
    }catch(error){if(generation===paymentGeneration)paymentState={...paymentState,loading:false,error:'Не удалось прочитать платёж: '+error.message};}
    finally{paymentApplying=false;if(generation===paymentGeneration)drawPayment();}
  }

  const otkryt = (kontekst = {}) => {
                                                                 
                                                              
                                                 
    if (!vstroena && window.innerWidth <= 760
        && !location.pathname.includes('sozdat')) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(kontekst)) {
        if (v != null && v !== '') q.set(k, String(v));
      }
      location.href = '/sozdat.html' + (q.size ? '?' + q.toString() : '');
      return;
    }
    if (!vstroena) {
      sozd.locusOpener=document.activeElement;sozd.classList.add('on');
      semantikaOkna(sozd,sozd.querySelector('.sozd-k'));
    }
    workloadOpen=true;workloadController?.reset();queueMicrotask(refreshWorkload);
    creationNote();
    setTimeout(()=>{if((vstroena||sozd.classList.contains('on'))&&!sozd.contains(document.activeElement)&&!document.querySelector('.vyp.otkryt,.l-select-popup,.vyb-fon:not([inert])'))pole('sozd-imja')?.focus();},50);
  };
  const zakryt = () => {
    const after=sozd.locusChildClosed;delete sozd.locusChildClosed;
    if(!vstroena){workloadOpen=false;sozd.classList.remove('on','sozd-podzadacha');}
    ochistit();
    if(childParent?.node.isConnected)childParent.node.inert=childParent.inert;
    childParent=null;
    if(!vstroena&&sozd.locusOpener?.isConnected)sozd.locusOpener.focus?.({preventScroll:true});
    Promise.resolve(after?.()).catch(error=>tost('Не удалось обновить подзадачи: '+error.message));
  };
  let closeQuestion=false;
  const requestClose=(leave=zakryt)=>{
    if(creating||sozd.dataset.pendingCreationKey){if(sozd.dataset.pendingCreationKey)taskCreationStatus();return;}
    if(closeQuestion)return;
    if(sozd.dataset.childCreation==='1'&&estNazvanieZadachi(pole('sozd-imja')?.value)){void sozdat();return;}
    if(!estNazvanieZadachi(pole('sozd-imja')?.value)&&(sozd.dataset.childCreation==='1'?childSignature()!==childBaseline:sozd.dataset.locusDraft==='1')){
      closeQuestion=true;
      const close=modalka('Без названия задачу не сохранить. Закрыть и потерять?',
        '<div class="pending-command-actions"><button type="button" class="kn ostavit-vnutri" data-draft-discard>закрыть</button><button type="button" class="kn ostavit-vnutri" data-draft-return>вернуться</button></div>',null,{poverh:true,priZakrytii:()=>{closeQuestion=false;}});
      document.querySelector('[data-draft-return]').addEventListener('click',close);
      document.querySelector('[data-draft-discard]').addEventListener('click',()=>{close();zakryt();if(leave!==zakryt)leave();});
      return;
    }
    zakryt();if(leave!==zakryt)leave();
  };
  sozd.locusRequestClose=requestClose;sozd.locusClose=()=>requestClose();
  if(vstroena)sozd.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('.vyb-fon')){event.preventDefault();event.stopPropagation();requestClose(sozd.locusCreationReturn||zakryt);}});

                                                             
                                                       
                                                                   
                                                            
  document.getElementById('plav')?.addEventListener('click', () => {
    window.O.formaZadachiModalka(kontekstEkrana());
  });
  pole('sozd-krest')?.addEventListener('click',()=>requestClose());
                                                                
                                                                    
                                                                
                                                                
  window.O = window.O || {};
  window.O.formaZadachiModalka = (kontekst = {}) => {
    otkryt(kontekst);
    if (window.innerWidth <= 760
        && !location.pathname.includes('sozdat') && !vstroena) return;
    if (kontekst.klient_id) {
      VYBOR.klient_id = Number(kontekst.klient_id);
      const kl = pole('sozd-klient');
      if (kl) kl.closest('.sozd-p')?.removeAttribute('hidden');
                                                                      
                                                              
      const podpisat_kl = (DD) => {
        const iz_klientov = ((DD || window.DANNYE || {}).klienty || [])
          .find((k) => String(k.kod) === String(kontekst.klient_id));
        const chel = (D.ljudi_vse || D.ljudi || [])
          .find((x) => x.id === Number(kontekst.klient_id));
        const imja = (iz_klientov && iz_klientov.imja) || (chel && chel.imja);
        podpisat('sozd-klient', imja || 'клиент', !!imja);
      };
      podpisat_kl();
      dogruzit_kogda_nado().then(podpisat_kl);
    }
    if (kontekst.napravlenie) {
      VYBOR.napravlenie = kontekst.napravlenie;
      const n = (D.napravlenija || []).find((x) => x.kod === kontekst.napravlenie);
      podpisat('sozd-napr', n ? n.imja : kontekst.napravlenie, true);
    }
    if (kontekst.sprint) {
      const w=SPR.kalendar.razobrat_nedelju(kontekst.sprint,
        Number(kontekst.god_sprinta) || SPR.kalendar.iso_nedelja(SPR.segodnja()).god);
      VYBOR.sprint=SPR.kalendar.kljuch_nedeli(w.god,w.nomer);
      VYBOR.god_sprinta=w.god;
      podpisat('sozd-sprint',`${w.nomer} / ${w.god}, ${SPR.period(w.nachalo,w.konec)}`,true);
    }
                                                                    
                                      
    if (kontekst.tip) {
      VYBOR.tip = kontekst.tip;
      const t = TIPY_ZADACHI_FORMA.find((x) => x.kod === kontekst.tip);
      podpisat('sozd-tip', t ? t.imja : kontekst.tip, true);
      const sozd_el = document.getElementById('sozd');
      if (sozd_el && typeof pokazatPoTipu === 'function') pokazatPoTipu(sozd_el);
    }
                                                                    
                                                            
                                   
    if (kontekst.publikacija) {
      const gal = pole('sozd-pub');
      if (gal && !gal.checked) { gal.checked = true;
        gal.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    if (kontekst.data_vyhoda) {
      const dv = pole('sozd-vyhod');
      if (dv) { dv.value = kontekst.data_vyhoda;
        dv.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    if (kontekst.nazvanie) {
      const im = pole('sozd-imja');
      if (im) im.value = kontekst.nazvanie;
    }
    if (kontekst.srok) {
      const sr = pole('sozd-srok');
      if (sr) { sr.value = kontekst.srok;
        sr.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    if (kontekst.otvetstvennyj) {
      VYBOR.otvetstvennyj = String(kontekst.otvetstvennyj);
      const ch = (D.ljudi || []).find((x) => x.id === Number(kontekst.otvetstvennyj));
      podpisat('sozd-chel', ch ? ch.imja : 'ответственный', !!ch);
    }
                                                                 
                                                            
    if (kontekst.roditel_id) {
      VYBOR.roditel_id = Number(kontekst.roditel_id);sozd.dataset.childCreation='1';
      if(!vstroena){
        const parent=document.querySelector('.vyb-fon:not([hidden]):not([inert])');
        if(parent){childParent={node:parent,inert:parent.inert};parent.inert=true;sozd.classList.add('sozd-podzadacha');document.body.append(sozd);}
      }
      narisovatSegmenty();
    }
                                                                
                                                              
                                               
                                                            
                                                         
    if (kontekst.proekt_id) {
      VYBOR.proekt_id = String(kontekst.proekt_id);
      const podpisat_pr = (DD) => {
        const pr = ((DD || window.DANNYE || {}).proekty_vse || (DD || window.DANNYE || {}).proekty || [])
          .find((x) => String(x.kod) === String(kontekst.proekt_id));
        podpisat('sozd-proekt', pr ? pr.imja+(pr.arhiv?' (в архиве)':pr.status==='zavershen'?' (завершён)':'') : 'проект выбран', true);
        if (!pr) return;
        if (pr.klient_id && !VYBOR.klient_id&&!VYBOR.klient_vybran_rukami) {
          VYBOR.klient_id = String(pr.klient_id);
          const im = ((DD || window.DANNYE || {}).klienty || [])
            .find((k) => k.kod === String(pr.klient_id));
          if (im) podpisat('sozd-klient', im.imja, true);
        }
        if (pr.napravlenie && !VYBOR.napravlenie) {
          VYBOR.napravlenie = pr.napravlenie;
          podpisat('sozd-napr', naprPoKodu(pr.napravlenie).imja, true);
        }
        pokazatPoTipu(sozd);
      };
      podpisat_pr();
      dogruzit_kogda_nado().then(podpisat_pr);
    }
    if (kontekst.cel_id) {
      VYBOR.cel_id = Number(kontekst.cel_id);
      const podpisat_cel = () => {
        const c = ((window.DANNYE || {}).celi || [])
          .find((x) => String(x.kod) === String(kontekst.cel_id));
        podpisat('sozd-cel', c ? c.imja : 'цель выбрана', true);
      };
      podpisat_cel();
      dogruzit_kogda_nado().then(podpisat_cel);
    }
    if(kontekst.shablon&&!kontekst.platezh_id){const revision=draftRevision;dogruzit_kogda_nado().then(async()=>{const row=await API.odna('shablony',kontekst.shablon);if(revision!==draftRevision){pokazatOshibku('Поля изменились во время загрузки шаблона. Выбери шаблон ещё раз, чтобы применить его.');return;}primenitShablon(row);}).catch(error=>pokazatOshibku('Шаблон не загружен: '+error.message));}
    if(kontekst.platezh_id)void loadPayment(kontekst.platezh_id);
    if(sozd.dataset.childCreation==='1')childBaseline=childSignature();
  };

                                                                       
                                                       
  let fajly_formy = [];
                                                    
  pole('sozd-srok')?.addEventListener('change', () => {
    pole('sozd-srok-o')?.classList.toggle('zapolnen',
      Boolean(pole('sozd-srok')?.value));
  });

  let creating = false;
  sozd.locusResumeCreation=async key=>{if(sozd.dataset.pendingCreationKey!==key)return false;delete sozd.dataset.pendingCreationKey;freezePendingCreation(false);await sozdat();return true;};
  const sozdat = async (status_srazu = null) => {
    if (creating) return;
    if(sozd.dataset.pendingCreationKey){taskCreationStatus();return;}
    snjatOshibku();
    if(paymentState&&(paymentState.loading||paymentState.error||!paymentState.prefill)){pokazatOshibku('Сначала обнови данные платежа');return;}
    if(pole('sozd-pub')?.checked){
      if(!VYBOR.ploshadka){pokazatOshibku('Выбери площадку публикации');return;}
      if(!pole('sozd-vyhod').value){pokazatOshibku('Укажи дату выхода публикации');return;}
      if(!VYBOR.format){pokazatOshibku('Выбери формат публикации');return;}
    }
    if(Array.from(pole('sozd-rubrika').value).length>100){pokazatOshibku('Рубрика не длиннее 100 символов');return;}
    if((pole('sozd-pub')?.checked||VYBOR.akkaunt_id!=null||copyBase?.akkaunt_id!=null)&&!accountLocked()){const revision=draftRevision,scope=accountContext().scope;try{await ensureAccounts();}catch(error){pokazatOshibku(error.message);return;}if(creating)return;if(revision!==draftRevision||scope!==accountContext().scope){pokazatOshibku('Поля изменились во время загрузки аккаунтов. Проверь выбор и сохрани ещё раз.');return;}}
    if(copyKey){const missing=(window.LocusTaskCopy.load(copyKey)?.missingUploads||[]).filter(name=>!fajly_formy.some(m=>m.nazvanie===name&&m.fajl));if(missing.length){showMissingUploads(missing);return;}}
    const imja = (pole('sozd-imja')?.value || '').trim();
    if (!estNazvanieZadachi(imja)) { pokazatOshibku('Напиши, что нужно сделать'); return; }
                                                                    
                                                               
                                                                 
    if (!VYBOR.napravlenie) {
      pokazatOshibku('Выбери направление: без него задачу негде искать'); return;
    }
    if (!VYBOR.otvetstvennyj) {
      pokazatOshibku('Выбери ответственного: задача без хозяина не делается'); return;
    }
    const tip = VYBOR.tip || 'vnutrennjaja',collectingBase=tip!=='rassylka'&&(VYBOR.campaign_template_role==='sobrat_bazu'||VYBOR.shablon==='sobrat_bazu');
    if(tip==='rassylka'||collectingBase){try{await campaignReady;if(!campaignController)throw new Error('Выбор рассылки не загружен. Повтори открытие формы');if(pole('sozd-repeat')?.checked)throw new Error('Для рассылки сними повтор: каждая волна создаётся отдельной задачей');if(status_srazu==='sdelano')throw new Error('Сначала создай открытую отправку; факты отмечаются в рассылке');}catch(e){pokazatOshibku(e.message);return;}}
    if (tip === 'klientskaja' && !VYBOR.klient_id) {
      pokazatOshibku('У клиентской задачи клиент обязателен'); return;
    }
    const chislo = (pole('sozd-chislo')?.value || '').trim();
    if (['biznesovaja','rassylka'].includes(tip) && !pole('sozd-pub')?.checked && !chislo) {
      pokazatOshibku('У бизнесовой задачи целевое число обязательно'); return;
    }
    const opisanie = (pole('sozd-opis')?.value || '').trim();
                                                                  
                                
    const ssylka_fajla = (pole('sozd-ssylka')?.value || '').trim();
    if (ssylka_fajla && !/^https?:/.test(ssylka_fajla)) {
      pokazatOshibku('Ссылка на файл должна начинаться с http'); return;
    }
    const srok = pole('sozd-srok')?.value || '';
    if(paymentState&&!srok){pokazatOshibku('Укажи срок задачи по платежу');return;}
    if (ssylka_fajla && !fajly_formy.some(file => file.ssylka === ssylka_fajla)) {
      fajly_formy.push({ nazvanie: ssylka_fajla.split('/').pop() || 'файл',
                         ssylka: ssylka_fajla });
    }
    const polja = {
      ...(copyBase?{...copyBase,opisanie:'',publikacija:false,kljuchevaja:false,srok:null,sprint:null,god_sprinta:null,klient_id:null,proekt_id:null,sotrudnichestvo_id:null,cel_id:null,plan_chislo:null,uchastniki:[],materialy:[],podzadachi:[],kommentarii:[],povtorjaetsja:false,povtor_s:null,chastota:null,dni:null,den_nedeli:null}:{}),
      nazvanie: imja,
      ...(opisanie ? { opisanie } : {}),
      ...(VYBOR.napravlenie ? { napravlenie: VYBOR.napravlenie } : {}),
      tip,
      ...(status_srazu ? { status: status_srazu }
        : VYBOR.status ? { status: VYBOR.status } : {}),
                                                    
      ...(pole('sozd-pub')?.checked ? { publikacija: true } : {}),
      ...(pole('sozd-klj')?.checked ? { kljuchevaja: true } : {}),
      ...(srok ? { srok } : {}),
      ...(VYBOR.otvetstvennyj ? { otvetstvennyj: VYBOR.otvetstvennyj } : {}),
      ...(VYBOR.klient_id ? { klient_id: Number(VYBOR.klient_id) } : {}),
      ...(VYBOR.proekt_id ? { proekt_id: Number(VYBOR.proekt_id) }
        : VYBOR.proekt_vybran_rukami ? { proekt_id: null } : {}),
      ...(VYBOR.cel_id ? { cel_id: Number(VYBOR.cel_id) } : {}),
      ...(VYBOR.sprint ? (() => {
        const w=SPR.kalendar.razobrat_nedelju(VYBOR.sprint,VYBOR.god_sprinta
          || D.nedelja?.god || SPR.kalendar.iso_nedelja(SPR.segodnja()).god);
        return {sprint:w.nomer,god_sprinta:w.god};
      })() : {}),
      ...(chislo ? { plan_chislo: Number(chislo) } : {}),
      ...(VYBOR.uchastniki && VYBOR.uchastniki.length
        ? { uchastniki: VYBOR.uchastniki.slice() } : {}),
      ...(fajly_formy.length ? { materialy: fajly_formy.slice() } : {}),
      ...(pole('sozd-komm')?.value.trim()?{kommentarii:[{tekst:pole('sozd-komm').value.trim()}]}:{}),
                                                                  
      ...(VYBOR.shablon ? { shablon: VYBOR.shablon } : {}),
                                                                    
                                                              
                                       
      ...(VYBOR.roditel_id ? { roditel_id: Number(VYBOR.roditel_id) } : {}),
      ...(paymentState?.prefill?{platezh_id:paymentState.id,platezh_kontekst:paymentState.prefill.platezh_kontekst}:{}),
    };
                                                                  
                                     
    sohranitAktivnyjSegment();
    if(SEGMENTY_PZ.some(s=>!(s.nazvanie||'').trim())){pokazatOshibku('Напиши названия подзадач или убери пустые вкладки.');return;}
    const pz_formy = SEGMENTY_PZ.map(s=>({...s,nazvanie:s.nazvanie.trim()}));
    if (pz_formy.length) polja.podzadachi = pz_formy;
    if(copyBase||pole('sozd-pub')?.checked)polja.akkaunt_id=VYBOR.akkaunt_id!=null?Number(VYBOR.akkaunt_id):null;
    if(pole('sozd-pub')?.checked){for(const key of ['ploshadka','format','akkaunt_id'])if(VYBOR[key]!=null)polja[key]=key==='akkaunt_id'?Number(VYBOR[key]):VYBOR[key];polja.rubrika=pole('sozd-rubrika').value.trim()||null;polja.data_vyhoda=pole('sozd-vyhod')?.value||null;}
    if (pole('sozd-repeat')?.checked) {
      polja.povtorjaetsja = true;
      polja.povtor_s=pole('sozd-repeat-start').value;
      polja.chastota = pole('sozd-repeat-frequency').value;
      const days = [...sozd.querySelectorAll('#sozd-repeat-days input:checked')].map(input => Number(input.value));
      if (polja.chastota === 'raz_v_nedelju') polja.den_nedeli = days[0];
      if (polja.chastota === 'vybrannye_dni') polja.dni = days;
      if (['raz_v_nedelju','vybrannye_dni'].includes(polja.chastota) && !days.length) {
        pokazatOshibku('Выбери дни повторения'); return;
      }
      delete polja.srok; delete polja.sprint; delete polja.god_sprinta; delete polja.status;
    }
    const selectedProject=(window.DANNYE?.proekty_vse||[]).find(row=>Number(row.kod)===polja.proekt_id);
    if(selectedProject?.arhiv||selectedProject?.status==='zavershen'){pokazatOshibku(selectedProject.arhiv?'Проект в архиве. Верни его из архива или выбери другой.':'Проект завершён. Верни его в работу или выбери другой.');return;}
    for(const material of polja.materialy||[])if(material.fajl instanceof Blob){const error=proveritZagruzkuFajla(material.fajl);if(error){pokazatOshibku(error);return;}}
    const lockedParts=[...sozd.querySelectorAll('.sozd-k>:not(#sozd-upload),.sozd-kn,:scope>.str-kn')].map(node=>({node,inert:node.inert}));
    creating = true;for(const {node} of lockedParts)node.inert=true;sozd.setAttribute('aria-busy','true');
    try {
    if(tip==='rassylka'||collectingBase)campaignController.validate({...polja,rassylka_id:VYBOR.rassylka_id,vid_volny:VYBOR.vid_volny});
    if (polja.materialy) {
      for (const m of polja.materialy) {
        if (m.fajl instanceof Blob) {
          uploadController=new AbortController();uploadBox.hidden=false;const filename=m.fajl.name||m.nazvanie||'файл';pole('sozd-upload-label').textContent='Загружается '+filename;pole('sozd-upload-progress').value=0;requestAnimationFrame(()=>{if(uploadController)uploadBox.scrollIntoView({block:'center'});});
          const za = await zagruzitFajl(m.fajl,{signal:uploadController.signal,onProgress:value=>{if(value===null)pole('sozd-upload-progress').removeAttribute('value');else pole('sozd-upload-progress').value=value;pole('sozd-upload-label').textContent=filename+(value===null?' загружается':', '+value+'%');}});
          if (!za?.ssylka) throw new Error('Файл не загрузился');
          delete m.fajl;
          for(const field of ['ssylka','fajl','razmer','tip_fajla','ishodnoe_imja'])if(za[field]!==undefined)m[field]=za[field];
          uploadBox.hidden=true;uploadController=null;
        }
      }
    }
    if(tip==='rassylka'){polja.rol_v_rassylke='otpravit';polja.vid_volny=VYBOR.vid_volny;if(copyKey)polja.srok=null;else delete polja.srok;if(VYBOR.campaign_template_role!=='otpravit'||['rassylka','rassylka_plan','otpravit_rassylku'].includes(VYBOR.shablon))delete polja.shablon;if(VYBOR.vid_volny==='suschestvuet'){polja.rassylka_id=VYBOR.rassylka_id;polja.vybor_versija=VYBOR.campaign_preview?.token;}else delete polja.rassylka_id;if(copyKey)polja.versija=window.LocusTaskCopy.load(copyKey)?.source.versija;campaignController.prepare(polja);}
    if(collectingBase){polja.rol_v_rassylke='sobrat_bazu';polja.rassylka_id=VYBOR.rassylka_id;delete polja.srok;campaignController.prepare(polja);}
    if (priSozdanii) {
                                                            
                                                  
      if(copyKey){
        const record=window.LocusTaskCopy.load(copyKey);if(!record)throw new Error('Черновик копии недоступен');
        window.LocusTaskCopy.update(copyKey,polja);
        const created=await API.sozdatZadachu({...polja,versija:record.source.versija},{route:'/zadachi/'+record.source.nomer+'/dubl',key:copyKey});
        if(vstroena&&sozd.locusCreationReturn){const back=setTimeout(sozd.locusCreationReturn,650);toastCreatedTask(created,{posle:async()=>{clearTimeout(back);sozd.locusCreationReturn();}});}else toastCreatedTask(created,{posle:refreshAfterTaskCreation});
      }else await priSozdanii(imja, polja);
                                                                              
      await new Promise(resolve=>setTimeout(resolve,300));
      document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena', { detail: { sozdana: true } }));
      if (vstroena) ochistit(); else zakryt();
      sozd.dispatchEvent(new CustomEvent('locus:task-created-form-closed'));
      if(defaultCreation)await refreshAfterTaskCreation();
    } else {
      tost('Это пример формы, задача не сохранена');
    }
    } catch (e) {
      if(paymentState&&e.telo?.platezh_izmenilsja){paymentState.error='Платёж или проект изменились. Текст задачи сохранён. Обнови данные платежа.';drawPayment();}
      if(tip==='rassylka'||collectingBase)campaignController?.rejected(e);
      const intent=API.nepodtverzhdennoeSozdanie?.();
      if(intent?.phase==='confirmed'&&sozd.dataset.creationAttemptKey===intent.key){
        const saved=API.prinjatSozdanie(intent.key);if(vstroena)ochistit();else zakryt();toastCreatedTask(saved,{posle:refreshAfterTaskCreation});tost(`Задача ${saved.nomer} сохранена. Список не обновился: обнови экран после текущей правки.`);
      }else{
        pokazatOshibku(e.taskCreationUnknown?'Сохранение ещё не подтверждено. Проверь задачу перед повтором.':'Не получилось: '+e.message);
        if(e.taskCreationUnknown){
          if(e.creationIntentMatches){sozd.dataset.pendingCreationKey=e.creationKey;}
          const button=document.createElement('button');button.type='button';button.className='kn';button.textContent='проверить создание';button.dataset.taskCreationInlineCheck='1';button.addEventListener('click',taskCreationStatus);osh?.append(' ',button);
        }
      }
    }
    finally { uploadController=null;uploadBox.hidden=true;creating = false;for(const {node,inert} of lockedParts)node.inert=inert;if(sozd.dataset.pendingCreationKey){freezePendingCreation(true);const active=document.activeElement;if(!document.querySelector('.vyb-fon')&&(!active?.matches('input,textarea,[contenteditable=true]')||sozd.contains(active)))osh?.querySelector('[data-task-creation-inline-check]')?.focus({preventScroll:true});}sozd.removeAttribute('aria-busy'); }
  };
                                                                
                                                              
                                                               
                                                           
                                                             
                                                      
  let SEGMENTY_PZ = [];
  let SEGMENT_AKTIVNYJ = -1;                        

  const glavnaja_gotova = () =>
    (pole('sozd-imja')?.value || '').trim()
    && VYBOR.napravlenie && VYBOR.otvetstvennyj;

                                                             
                                                          
  const pereriosovatVkladku = () => {
    const pz = SEGMENT_AKTIVNYJ >= 0;
    sozd.querySelectorAll(
      '.sozd-polja, .sozd-gal, .sozd-opis, .sozd-ssyl, .sozd-fajly, .sozd-zagr, .sozd-pub-rjad')
      .forEach((e) => { e.classList.toggle('sgm-skryto', pz); });
    sozd.querySelectorAll('.sozd-lbl').forEach((e) => {
      if (!e.closest('#sozd-pz')) e.classList.toggle('sgm-skryto', pz);
    });
    const im = pole('sozd-imja');
    if (im) im.classList.toggle('sgm-skryto', pz);
    const k = pole('sozd-pz');
    if (!k) return;
    k.hidden = !pz;
    if (pz) {
      k.innerHTML = `<span class="sozd-lbl">Задача<i class="sozd-ob"
          title="обязательное">*</i></span>
        <input class="sozd-vvod" id="sozd-pz-imja" value="${
          ekranirovat(SEGMENTY_PZ[SEGMENT_AKTIVNYJ]?.nazvanie || '')}">`;
      const v = k.querySelector('#sozd-pz-imja');
      v?.addEventListener('input', () => {
        if (SEGMENTY_PZ[SEGMENT_AKTIVNYJ]) {
          SEGMENTY_PZ[SEGMENT_AKTIVNYJ].nazvanie = v.value;
        }
      });
      v?.focus();
    } else {
      k.innerHTML = '';
    }
  };

  const sohranitAktivnyjSegment = () => {
    const v = document.getElementById('sozd-pz-imja');
    if (v && SEGMENTY_PZ[SEGMENT_AKTIVNYJ]) {
      SEGMENTY_PZ[SEGMENT_AKTIVNYJ].nazvanie = v.value;
    }
  };

  const narisovatSegmenty = () => {
    const r = pole('sozd-segmenty');
    if (!r) return;
    r.hidden = Boolean(VYBOR.roditel_id);
    if(r.hidden)return;
                                                               
                                                               
    r.innerHTML = `<span class="sgm-lenta"><a class="sgm${
        SEGMENT_AKTIVNYJ === -1 ? ' on' : ''}" data-sgm="-1">Основная задача</a>`
      + SEGMENTY_PZ.map((s, i) =>
        `<a class="sgm${SEGMENT_AKTIVNYJ === i ? ' on' : ''}" data-sgm="${i}">
          Подзадача ${i + 1}<span class="sgm-x" data-sgm-x="${i}"
            title="убрать подзадачу">×</span></a>`).join('')
      + `</span><a class="sgm sgm-plus" data-sgm-dob="1"
          title="добавить подзадачу" aria-label="добавить подзадачу">+${
          SEGMENTY_PZ.length ? '' : '<span class="sgm-plus-label"> подзадача</span>'}</a>`;
    const lenta = r.querySelector('.sgm-lenta');
    const aktivnyj = r.querySelector('.sgm.on');
    lenta?.classList.toggle('sgm-fit',Boolean(aktivnyj&&lenta.clientWidth<aktivnyj.offsetWidth+26));
    if (lenta && aktivnyj) {
      const left=aktivnyj.offsetLeft,right=left+aktivnyj.offsetWidth;
      if(left<lenta.scrollLeft)lenta.scrollLeft=left;
      else if(right>lenta.scrollLeft+lenta.clientWidth)lenta.scrollLeft=right-lenta.clientWidth;
    }
    lentaVbok(lenta);
  };
  narisovatSegmenty();

  pole('sozd-segmenty')?.addEventListener('click', (ev) => {
    const x = ev.target.closest('[data-sgm-x]');
    if (x) {
      ev.stopPropagation();
      touchDraft();SEGMENTY_PZ.splice(Number(x.dataset.sgmX), 1);
      SEGMENT_AKTIVNYJ = -1;
      narisovatSegmenty(); pereriosovatVkladku();
      return;
    }
    if (ev.target.closest('[data-sgm-dob]')) {
      if (!glavnaja_gotova()) {
        pokazatOshibku('Подзадачу можно создать, когда у основной задачи '
          + 'появилось название, направление и свой ответственный');
        return;
      }
      snjatOshibku();
      sohranitAktivnyjSegment();
      SEGMENTY_PZ.push({ nazvanie: '' });
      SEGMENT_AKTIVNYJ = SEGMENTY_PZ.length - 1;
      narisovatSegmenty(); pereriosovatVkladku();
      return;
    }
    const s = ev.target.closest('[data-sgm]');
    if (!s) return;
    sohranitAktivnyjSegment();
    SEGMENT_AKTIVNYJ = Number(s.dataset.sgm);
    narisovatSegmenty(); pereriosovatVkladku();
  });

  const dobavitPzStroku = (tekst = '') => {
    touchDraft();
    SEGMENTY_PZ.push({ nazvanie: tekst });
    narisovatSegmenty();
  };

                                                                   
                                                              
  pole('sozd-shablon')?.addEventListener('click',async()=>{
    sohranitAktivnyjSegment();const name=pole('sozd-imja').value.trim();if(!name){pokazatOshibku('Без названия шаблон не сохранить');return;}
    const defaults={nazvanie:name,tip:VYBOR.tip==='rassylka'?'biznesovaja':VYBOR.tip||'vnutrennjaja',opisanie:pole('sozd-opis').value||null,podzadachi:SEGMENTY_PZ.map(s=>s.nazvanie),schitat_fakt:VYBOR.campaign_template_role==='sobrat_bazu'||VYBOR.shablon==='sobrat_bazu'?'kontakty_bazy':VYBOR.tip==='rassylka'?'otpravleno':'net',obschij:false,srok_po_umolchaniju:pole('sozd-srok').value?String(Math.max(0,Math.round((Date.parse(pole('sozd-srok').value)-Date.parse(SPR.segodnja()))/86400000))):null};
    try{(await templatesUi()).open(null,{defaults});}catch(error){pokazatOshibku(error.message);}
  });

                                                               
                                                            
  const primenitShablon = (sh) => {
    if (!sh) return;
    if(paymentState)resetPayment();
    VYBOR.shablon = sh.kod || String(sh.id);
    if(sh.rol_rassylki)VYBOR.campaign_template_role=sh.rol_rassylki;else delete VYBOR.campaign_template_role;
    const im = pole('sozd-imja');
    if (im && !im.value.trim()) im.value = sh.nazvanie || '';
    const op = pole('sozd-opis');
    if (op && sh.opisanie && !op.value.trim()) {
      op.value = sh.opisanie;
      op.dispatchEvent(new Event('input'));
    }
    if (sh.tip) {
      VYBOR.tip = sh.rol_rassylki==='otpravit'||sh.kod==='otpravit_rassylku'?'rassylka':sh.tip;
      const t = TIPY_ZADACHI_FORMA.find((x) => x.kod === VYBOR.tip);
      podpisat('sozd-tip', t ? t.imja : VYBOR.tip, true);
      pokazatPoTipu(sozd);
    }
                                                         
    const v=String(sh.default_due??sh.srok_po_umolchaniju??'');
    const dat_p = pole('sozd-srok');
    if (dat_p && v && v !== 'bez_sroka'&&!sh.nuzhna_rassylka) {
      const today=SPR.segodnja();let day=today;
      if (v === 'zavtra') day=SPR.kalendar.sdvinut_den(today,1);
      else if(v==='konec_nedeli'||v==='konec_sledujuschej_nedeli'){let w=SPR.kalendar.iso_nedelja(today);if(v==='konec_sledujuschej_nedeli')w=SPR.kalendar.sdvinut_nedelju(w.god,w.nomer,1);day=SPR.kalendar.granicy_nedeli(w.god,w.nomer).konec;}
      else if (v !== 'segodnja' && !Number.isNaN(parseFloat(v))) {
        day=SPR.kalendar.sdvinut_den(today,Math.round(parseFloat(v)));
      }
      dat_p.value = day;
      dat_p.dispatchEvent(new Event('change'));
    }
                                                    
    const k = pole('sozd-pz');
    if (k) {
      k.innerHTML='';SEGMENTY_PZ=[];SEGMENT_AKTIVNYJ=-1;
      for (const nazv of (sh.podzadachi_spisok || [])) dobavitPzStroku(nazv);
    }
    if(sh.nuzhna_rassylka&&dat_p)dat_p.value='';
    if(sh.kod==='poluchit_oplatu'){VYBOR.tip='klientskaja';podpisat('sozd-tip','клиентская',true);pokazatPoTipu(sozd);paymentState={id:null,error:''};drawPayment();}
    campaignReady.then(()=>campaignController?.sync({choose:VYBOR.tip==='rassylka'}));
  };

  pole('sozd-sozdat')?.addEventListener('click', () => sozdat());
                                                             
                                                            
                           
  pole('sozd-gotovo')?.addEventListener('click', () => sozdat('sdelano'));

                                                                
                                                               
                                                
  pole('sozd-pub-kn')?.addEventListener('click', () => {
    const gal = pole('sozd-pub');
    if (!gal) return;
    gal.checked = !gal.checked;
    gal.dispatchEvent(new Event('change', { bubbles: true }));
  });
                                                              
                                                           
                               
  pole('sozd-ssylka')?.addEventListener('input', () => {
    const v = pole('sozd-ssylka');
    const t = (v.value || '').trim();
    const kriva = !!t && !/^https?:\/\/\S+\.\S+/.test(t);
    const ob = v.closest('.sozd-pole');
    ob?.classList.toggle('nevalidno', kriva);
    let hint = ob?.nextElementSibling;
    const nash = hint && hint.classList?.contains('sozd-ssyl-hint');
    if (kriva && !nash) {
      ob?.insertAdjacentHTML('afterend',
        '<div class="sozd-ssyl-hint">не похоже на ссылку: нужен адрес с http</div>');
    } else if (!kriva && nash) hint.remove();
  });
  pole('sozd-klj-kn')?.addEventListener('click', () => {
    const gal = pole('sozd-klj');
    if (!gal) return;
    touchDraft();
    gal.checked = !gal.checked;
    const kn = pole('sozd-klj-kn');
    kn.setAttribute('aria-checked', String(gal.checked));
    kn.querySelector('.pere')?.classList.toggle('on', gal.checked);
    kn.classList.toggle('on', gal.checked);
  });
  pole('sozd-pub')?.addEventListener('change', () => {
    const blok = pole('sozd-pub-polja');
    const vkl = pole('sozd-pub').checked;
    if (blok) blok.hidden = !vkl;
    const kn = pole('sozd-pub-kn');
    if (kn) {
      kn.setAttribute('aria-checked', String(vkl));
      kn.querySelector('.pere')?.classList.toggle('on', vkl);
      kn.classList.toggle('on', vkl);
    }
  });

                                                                 
                                                                  
                                                              
                                                               

                                                                    
                                                                   
                                                              
                              
                                                                
                                                                   
                                      
  const razmer_slovami = (b) => {
    if (!b && b !== 0) return '';
    if (b < 1024) return `${b} Б`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
    return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  };
  const narisovat_fajly = () => {
    const mesto = pole('sozd-fajly');
    if (!mesto) return;
    mesto.innerHTML = fajly_formy.map((f, i) =>
      `<div class="sozd-fajl-s">
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none"><path d="M13.4 6.6 7.9 12.1a1.9 1.9 0 0 0 2.7 2.7l5.5-5.5a3.7 3.7 0 0 0-5.3-5.3L5.3 9.5a5.5 5.5 0 0 0 7.8 7.8l1.6-1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="sozd-fajl-im">${ekranirovat(f.nazvanie||'файл')}</span>
        ${f.razmer ? `<span class="sozd-fajl-rz">${razmer_slovami(f.razmer)}</span>` : ''}
        <a data-ubrat-fajl="${i}" title="убрать файл">×</a></div>`).join('');
  };
  pole('sozd-fajly')?.addEventListener('click', (e) => {
    const ub = e.target.closest('[data-ubrat-fajl]');
    if (!ub) return;
    touchDraft();fajly_formy.splice(Number(ub.dataset.ubratFajl), 1);
    narisovat_fajly();
  });
                                                              
                                                                  
                                                                 
                                                         
                                                   
  pole('sozd-fajl')?.addEventListener('click', () => {
    pole('sozd-fajl-vvod')?.click();
  });
  pole('sozd-fajl-vvod')?.addEventListener('change', (e) => {
    for (const f of e.target.files || []) {
      fajly_formy.push({
        nazvanie: f.name,
        razmer: f.size,
                                                                
                                                                
        fajl: f,
      });
    }
    e.target.value = '';
    narisovat_fajly();
    const invalid=fajly_formy.find(f=>f.fajl instanceof Blob&&proveritZagruzkuFajla(f.fajl));if(invalid)pokazatOshibku(proveritZagruzkuFajla(invalid.fajl));
  });

  pole('sozd-imja')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sozdat();
  });

                                                                  
                                                                 
                                           
  const vyh = pole('sozd-vyhod');
  if (vyh) {
    const pusto_vyh = () => vyh.classList.toggle('pusto', !vyh.value);
    pusto_vyh();
    ['input', 'change', 'blur'].forEach((s) => vyh.addEventListener(s, pusto_vyh));
  }
  const dat = pole('sozd-srok');
  if (dat) {
    const ub = sozd.querySelector('[data-chistit="sozd-srok"]');
    const otmetit = () => {
      dat.classList.toggle('pusto', !dat.value);
      if (ub) ub.hidden = !dat.value;
    };
    otmetit();
    dat.addEventListener('input', otmetit);
    dat.addEventListener('change', otmetit);
                                                               
    dat.addEventListener('blur', otmetit);
                                                              
                                                          
                                                  
    ub?.addEventListener('mousedown', (e) => e.preventDefault());
    ub?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      dat.value = '';
      dat.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
                                                            
  pole('sozd-opis')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sozdat(); }
  });
                                                                  
                                                     
  ['sozd-opis', 'sozd-komm'].forEach((id) => {
    const e = pole(id);
    if (!e) return;
    e.addEventListener('input', () => {
      e.style.height = 'auto';
      e.style.height = `${e.scrollHeight}px`;
    });
  });

                                    
  const D = window.DANNYE || {};
                                                                
                                                            
  const odin = (id, punkty, kljuch, { srazu = null, posle = null } = {}) => {
    const b = pole(id);
    if (!b) return;
                                                                     
                                                                    
                                                            
                                                             
                                                      
    const napisat = (tekst, vybrano) => {
      const t = b.querySelector('.sozd-t');
      if (t) { t.textContent = tekst; b.classList.toggle('vybrano', vybrano); }
      else { b.innerHTML = `${ekranirovat(tekst)}<span class="str"></span>`;
             b.classList.toggle('on', vybrano); }
    };
    if (srazu) {
      const p0 = punkty.find((x) => String(x.kod) === String(srazu));
                                                              
                                                   
      if (p0) napisat(p0.korotko || p0.imja, false);
    }
    vypadajuschij(b, punkty, srazu).addEventListener('click', (ev) => {
      const p = ev.target.closest('.vyp-p'); if (!p) return;
      const kod = p.dataset.kod || null;
      VYBOR[kljuch] = kod;touchDraft();
      if(kljuch==='status')publicationWarning();
      napisat(p.dataset.korotko || p.textContent.trim(), !!kod);
      snjatOshibku();
      if (posle) posle(kod);
      if(['napravlenie','tip','klient_id','proekt_id','ploshadka'].includes(kljuch)&&accountController&&(pole('sozd-pub')?.checked||VYBOR.akkaunt_id!=null))accountController.refresh().catch(()=>{});
    });
  };

  const publicationLabels={telegram:'Telegram',instagram:'Instagram',vk:'ВКонтакте',youtube:'YouTube',dzen:'Дзен',tiktok:'TikTok',post:'пост',rils:'рилс',karusel:'карусель',storis:'сторис',video:'видео'};
  let publicationData=null,publicationPromise=null;
  const publicationFieldsReady=ready=>{for(const id of ['sozd-ploshadka','sozd-format']){const button=pole(id);button.classList.toggle('zhdjot',!ready);button.setAttribute('role','combobox');button.setAttribute('aria-busy',String(!ready));button.setAttribute('aria-disabled',String(!ready));}};
  publicationFieldsReady(false);
  const publicationLoadStatus=document.createElement('div');publicationLoadStatus.className='sozd-account-hint';publicationLoadStatus.hidden=true;publicationLoadStatus.setAttribute('role','status');publicationLoadStatus.dataset.publicationLoadStatus='1';pole('sozd-publication-note').after(publicationLoadStatus);
  const accountContext=()=>{const ctx={tip:VYBOR.tip||'vnutrennjaja',napravlenie:VYBOR.napravlenie||null,klient_id:VYBOR.klient_id?Number(VYBOR.klient_id):null,proekt_id:VYBOR.proekt_id?Number(VYBOR.proekt_id):null,ploshadka:VYBOR.ploshadka||null,akkaunt_id:VYBOR.akkaunt_id!=null?Number(VYBOR.akkaunt_id):null};return{...ctx,scope:JSON.stringify([ctx.tip,ctx.napravlenie,ctx.klient_id,ctx.proekt_id,ctx.ploshadka])};};
  const accountLocked=()=>{const intent=API.nepodtverzhdennoeSozdanie?.();return Boolean(intent&&intent.key===(sozd.dataset.creationAttemptKey||copyKey));};
  const publicationName=(key,value)=>key==='akkaunt_id'?accountController?.label(value)||String(value):publicationLabels[value]||String(value);
  const preparePublication=()=>publicationPromise||(publicationPromise=Promise.all([API.ekran('spravochniki'),taskAccounts()]).then(([spr,module])=>{
    publicationData={fields:spr.publikacii_polja};if(!publicationData.fields)throw new Error('Обнови страницу: не загрузились поля публикации');
    for(const [id,key,list]of [['sozd-ploshadka','ploshadka',publicationData.fields.ploshadki],['sozd-format','format',publicationData.fields.formaty]])odin(id,[{kod:'',imja:'не выбрано'},...list.map(k=>({kod:k,imja:publicationName(key,k)}))],key);
    pole('sozd-rubric-list').replaceChildren(...(publicationData.fields.rubriki||[]).map(value=>{const option=document.createElement('option');option.value=value;return option;}));
    accountController=module.mount({button:pole('sozd-akkaunt'),hint:pole('sozd-account-hint'),read:accountContext,select:id=>{VYBOR.akkaunt_id=id;},platform:kod=>{VYBOR.ploshadka=kod;podpisat('sozd-ploshadka',publicationName('ploshadka',kod),true);},dirty:touchDraft,locked:accountLocked});
    for(const key of ['ploshadka','format','akkaunt_id'])if(VYBOR[key]!=null)podpisat(key==='akkaunt_id'?'sozd-akkaunt':'sozd-'+key,publicationName(key,VYBOR[key]),true);
    publicationFieldsReady(true);publicationLoadStatus.replaceChildren();publicationLoadStatus.hidden=true;
  }).catch(error=>{publicationPromise=null;publicationFieldsReady(false);throw error;}));
  const ensureAccounts=async options=>{await preparePublication();return accountController.refresh(options);};
  const loadPublication=()=>ensureAccounts().catch(error=>{publicationLoadStatus.hidden=false;publicationLoadStatus.textContent='Не загрузились поля публикации. '+error.message;const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.dataset.publicationRetry='1';retry.textContent='повторить загрузку';retry.onclick=()=>{retry.disabled=true;loadPublication();};publicationLoadStatus.append(' ',retry);});
  const publicationWarning=()=>{const note=pole('sozd-publication-note'),date=pole('sozd-vyhod').value;note.hidden=!(pole('sozd-pub').checked&&date&&date<SPR.segodnja()&&(VYBOR.status||'v_plane')==='v_plane');note.textContent='Дата уже прошла';};
  for(const event of ['input','change','click'])sozd.addEventListener(event,()=>queueMicrotask(publicationWarning));
  pole('sozd-pub').addEventListener('change',()=>{if(pole('sozd-pub').checked)loadPublication();});

  odin('sozd-napr', (D.napravlenija || [])
    .map((x) => ({ kod: x.kod, imja: x.imja, cvet: x.cvet })), 'napravlenie',{posle:()=>campaignController?.sync()});
  odin('sozd-tip', TIPY_ZADACHI_FORMA, 'tip',
    { posle: () => {if(VYBOR.campaign_template_role==='otpravit'&&VYBOR.tip!=='rassylka'||(VYBOR.campaign_template_role==='sobrat_bazu'||VYBOR.shablon==='sobrat_bazu')&&VYBOR.tip==='rassylka'){delete VYBOR.campaign_template_role;delete VYBOR.shablon;}pokazatPoTipu(sozd);if(VYBOR.tip==='rassylka'&&!campaignController)campaignReady=connectCampaign();else campaignController?.sync({choose:VYBOR.tip==='rassylka'});} });
                                                                 
                                                                      
                                                                    
                                                                   
                                                                     
                                                              
                                                         
  const workloadContext=()=>{
    const calendar=SPR.kalendar;
    const week=VYBOR.sprint?calendar.razobrat_nedelju(VYBOR.sprint,VYBOR.god_sprinta||calendar.iso_nedelja(SPR.segodnja()).god):calendar.iso_nedelja(SPR.segodnja());
    return {active:workloadOpen&&sozd.isConnected&&(vstroena||sozd.classList.contains('on')),actor:API.ja,person:VYBOR.otvetstvennyj,week:calendar.kljuch_nedeli(week.god,week.nomer)};
  };
  const drawWorkload=({kind,text='',overloaded=false})=>{
    const node=pole('sozd-zagr');if(!node)return;
    node.textContent=text;node.hidden=kind!=='ready';node.classList.toggle('peregruz',overloaded);
    node.setAttribute('role','status');node.setAttribute('aria-live','polite');
  };
  function refreshWorkload(){
    if(!workloadContext().active){workloadController?.reset();return;}
    if(workloadController)return workloadController.refresh();
    drawWorkload({kind:'loading'});
    if(!workloadReady)workloadReady=taskWorkloadUi().then(module=>{
      workloadController=module.create({readContext:workloadContext,onChange:drawWorkload,
        request:(scope,options)=>API.zapros('GET',`/ljudi/${scope.person}/zagruzka?nedelja=${scope.week}`,undefined,options)});
      return workloadController;
    }).catch(()=>{workloadReady=null;drawWorkload({kind:'error'});return null;});
    return workloadReady.then(controller=>controller?.refresh());
  }
  window.addEventListener('focus',refreshWorkload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWorkload();});
  window.addEventListener('pagehide',()=>{workloadOpen=false;workloadController?.reset();});
  window.addEventListener('pageshow',event=>{if(event.persisted){workloadOpen=vstroena||sozd.classList.contains('on');refreshWorkload();}});
  odin('sozd-chel', (D.ljudi || [])
    .map((x) => ({ kod: String(x.id), imja: x.imja })), 'otvetstvennyj',
    { srazu: String((window.API && API.ja) || ''),
      posle: refreshWorkload });
                                                              
                                                       
  odin('sozd-status', (D.statusy || [])
    .map((x) => ({ kod: x.kod, imja: x.imja, cvet: x.cvet })), 'status');
                                                             
  const cal = SPR.kalendar;
  odin('sozd-sprint', () => [-1,0,1,2,3].map(offset => {
    const currentWeek = D.nedelja?.god && D.nedelja?.nomer ? D.nedelja : cal.iso_nedelja(SPR.segodnja());
    const w = cal.sdvinut_nedelju(currentWeek.god,currentWeek.nomer,offset);
    const dates = SPR.period(w.nachalo,w.konec);
    return {kod:cal.kljuch_nedeli(w.god,w.nomer),korotko:`${w.nomer}, ${dates}`,
      imja:`спринт ${w.nomer} / ${w.god}, ${dates}`};
  }), 'sprint', {posle:refreshWorkload});

                                                                
                                                             
  const uch = pole('sozd-uchast');
  if (uch) {
    const sp = vypadajuschij(uch, (D.ljudi || [])
      .map((x) => ({ kod: String(x.id), imja: x.imja })), null);
                                                                  
                                                                
                                                         
    const risovat_uchastnikov = () => {
      const n = VYBOR.uchastniki.length;
      const imena = VYBOR.uchastniki
        .map((id2) => (D.ljudi || []).find((x) => x.id === id2))
        .filter(Boolean)
        .map((x) => `<span class="uch-teg">${ekranirovat(x.imja)}<span class="uch-x"
          data-uch-x="${x.id}" title="убрать">×</span></span>`).join('');
      uch.innerHTML = (n ? `<span class="uch-lenta">${imena}</span>`
        : '<span class="sozd-t"></span>') + '<span class="str"></span>';
      uch.classList.toggle('on', !!n);
      uch.classList.toggle('vybrano', !!n);
      const l = uch.querySelector('.uch-lenta');
      if (l) { l.scrollLeft = l.scrollWidth; lentaVbok(l); }
      sp.querySelectorAll('.vyp-p').forEach((p) => p.classList.toggle('on',
        VYBOR.uchastniki.includes(Number(p.dataset.kod))));
    };
    uch.locusRefresh=risovat_uchastnikov;
    uch.addEventListener('click', (ev) => {
      const x = ev.target.closest('[data-uch-x]');
      if (!x) return;
      ev.stopPropagation(); ev.preventDefault();
      touchDraft();
      const i = VYBOR.uchastniki.indexOf(Number(x.dataset.uchX));
      if (i >= 0) VYBOR.uchastniki.splice(i, 1);
      risovat_uchastnikov();
      sp.parentElement.classList.remove('otkryt');
    }, true);
    sp.addEventListener('click', (ev) => {
      const p = ev.target.closest('.vyp-p'); if (!p) return;
      ev.stopPropagation();
      touchDraft();
      const kod = p.dataset.kod;
      const i = VYBOR.uchastniki.indexOf(Number(kod));
      if (i >= 0) VYBOR.uchastniki.splice(i, 1);
      else VYBOR.uchastniki.push(Number(kod));
      risovat_uchastnikov();
                                                            
      sp.parentElement.classList.add('otkryt');
    });
  }

                                                                 
                                                                   
                                                
  ['sozd-klient', 'sozd-proekt', 'sozd-cel'].forEach((id) => {
    const b = pole(id); if (b) {b.classList.add('zhdjot');b.setAttribute('role','combobox');b.setAttribute('aria-busy','true');b.setAttribute('aria-disabled','true');}
  });
                                                                   
                                                                 
                                                           
                                                              
                                                        
  let dogruzka = null;
  const dogruzit_kogda_nado=()=>dogruzka||(dogruzka=dogruzitSpravochniki().then(DD=>{if(DD.spravochniki_oshibka)dogruzka=null;return DD;}));
                                                            
                                    
  const kogda = vstroena ? dogruzit_kogda_nado()
    : new Promise((gotovo) => {
        const nachat = () => {if(!vstroena&&window.innerWidth<=760&&!location.pathname.includes('sozdat'))return;gotovo(dogruzit_kogda_nado());};
        document.getElementById('plav')?.addEventListener('click', nachat, { once: true });
        sozd.addEventListener('locus:copy-open',nachat,{once:true});
        document.addEventListener('keydown', function po_n(e) {
          if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
            document.removeEventListener('keydown', po_n); nachat();
          }
        });
      });
  const dictionaryNote=document.createElement('div');dictionaryNote.className='sozd-osh';dictionaryNote.id='sozd-dictionary-note';dictionaryNote.hidden=true;dictionaryNote.setAttribute('role','status');dictionaryNote.setAttribute('aria-live','polite');osh.after(dictionaryNote);
  const primenitSpravochniki=DD=>{
    if(DD.spravochniki_oshibka){dictionaryNote.hidden=false;dictionaryNote.textContent='Не удалось загрузить списки людей и проектов. Повтори загрузку.';const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.textContent='повторить загрузку';retry.addEventListener('click',()=>{retry.disabled=true;dogruzit_kogda_nado().then(primenitSpravochniki);});dictionaryNote.append(' ',retry);return;}
    dictionaryNote.hidden=true;dictionaryNote.replaceChildren();
    ['sozd-klient', 'sozd-proekt', 'sozd-cel'].forEach((id) => {
      const b=pole(id);if(b){b.classList.remove('zhdjot');b.setAttribute('aria-busy','false');b.setAttribute('aria-disabled','false');}
    });
    odin('sozd-klient', [{kod:'',imja:'без клиента'}].concat(DD.klienty || []), 'klient_id',
      {posle:()=>{VYBOR.klient_vybran_rukami=true;pokazatPoTipu(sozd);}});
                                                                 
                                               
    odin('sozd-proekt', [{kod:'',imja:'без проекта'},...(DD.proekty||[])], 'proekt_id', { posle: (kod) => {
      VYBOR.proekt_vybran_rukami = true;
      const pr = (DD.proekty || []).find((x) => x.kod === kod);
      if (pr && pr.klient_id && !VYBOR.klient_id&&!VYBOR.klient_vybran_rukami) {
        VYBOR.klient_id = String(pr.klient_id);
        const im = (DD.klienty || []).find((k) => k.kod === String(pr.klient_id));
        if (im) podpisat('sozd-klient', im.imja);
        pole('sozd-klient')?.classList.add('on');
      }
      if (pr && pr.napravlenie && !VYBOR.napravlenie) {
        VYBOR.napravlenie = pr.napravlenie;
        podpisat('sozd-napr', naprPoKodu(pr.napravlenie).imja);
        pole('sozd-napr')?.classList.add('on');
      }
      pokazatPoTipu(sozd);
    } });
                                                             
                                                      
    odin('sozd-cel', [{ kod: '', imja: 'без цели' }]
      .concat(DD.celi || []), 'cel_id');
                                                          
    const sh_punkty = (DD.shablony || []).map((x) => ({
      kod: String(x.id), imja: x.nazvanie }));
    if (sh_punkty.length) {
      odin('sozd-isp-shablon', sh_punkty, 'shablon_vybor', { posle: (kod) => {
        const sh = (DD.shablony || []).find((x) => String(x.id) === String(kod));
        primenitShablon(sh);
      } });
    }
  };
  kogda.then(primenitSpravochniki);

  function showMissingUploads(missing){pokazatOshibku('Прикрепи заново файлы: '+missing.join(', '));const omit=document.createElement('button');omit.type='button';omit.className='kn';omit.textContent='создать без этих файлов';omit.addEventListener('click',()=>{window.LocusTaskCopy.omitMissing(copyKey);snjatOshibku();});osh.append(' ',omit);}
  window.O.applyTaskCopyDraft=key=>{
    const record=window.LocusTaskCopy.load(key);if(!record)throw new Error('Черновик копии недоступен');
    if(copyKey===key)copyKey=null;ochistit();copyKey=key;copyBase=JSON.parse(JSON.stringify(record.body));sozd.dataset.copyKey=key;const address=new URL(location.href);address.searchParams.set('kopija',key);history.replaceState(history.state,'',address);
    VYBOR.klient_vybran_rukami=true;sozd.dispatchEvent(new Event('locus:copy-open'));
    window.O.formaZadachiModalka(copyBase);
    for(const name of ['cel_id','rezultat_id','data','ne_v_itogi','ploshadka','format','rubrika','akkaunt_id'])if(copyBase[name]!=null)VYBOR[name]=copyBase[name];
    VYBOR.uchastniki=(copyBase.uchastniki||[]).slice();pole('sozd-uchast')?.locusRefresh?.();
    for(const [id,value]of Object.entries({'sozd-opis':copyBase.opisanie||'','sozd-chislo':copyBase.plan_chislo??'','sozd-vyhod':copyBase.data_vyhoda||'','sozd-rubrika':copyBase.rubrika||'','sozd-komm':copyBase.kommentarii?.map(c=>c.tekst).join('\n')||''}))if(pole(id)){pole(id).value=value;pole(id).dispatchEvent(new Event('input'));}
    for(const name of ['ploshadka','format','akkaunt_id'])if(copyBase[name]!=null)podpisat(name==='akkaunt_id'?'sozd-akkaunt':'sozd-'+name,publicationName(name,copyBase[name]),true);
    ensureAccounts({preserveScope:accountContext().scope}).catch(error=>pokazatOshibku(error.message));
    pole('sozd-klj').checked=Boolean(copyBase.kljuchevaja);pole('sozd-klj-kn').setAttribute('aria-checked',String(Boolean(copyBase.kljuchevaja)));pole('sozd-klj-kn').classList.toggle('on',Boolean(copyBase.kljuchevaja));pole('sozd-klj-kn').querySelector('.pere')?.classList.toggle('on',Boolean(copyBase.kljuchevaja));
    fajly_formy=(copyBase.materialy||[]).map(m=>({...m}));narisovat_fajly();
    SEGMENTY_PZ=(copyBase.podzadachi||[]).map(c=>JSON.parse(JSON.stringify(c)));SEGMENT_AKTIVNYJ=-1;narisovatSegmenty();pereriosovatVkladku();
    pole('sozd-repeat').checked=Boolean(copyBase.povtorjaetsja);pole('sozd-repeat-frequency').value=copyBase.chastota||'kazhdyj_den';pole('sozd-repeat-start').value=copyBase.povtor_s||SPR.segodnja();
    const days=Array.isArray(copyBase.dni)?copyBase.dni:typeof copyBase.dni==='string'?JSON.parse(copyBase.dni):[copyBase.den_nedeli];sozd.querySelectorAll('#sozd-repeat-days input').forEach(e=>e.checked=days.includes(Number(e.value)));repeatVisibility();
    touchDraft();publicationWarning();
    if(record.missingUploads?.length)showMissingUploads(record.missingUploads);
    const pending=API.nepodtverzhdennoeSozdanie?.();if(pending?.key===copyKey){sozd.dataset.creationAttemptKey=copyKey;sozd.dataset.pendingCreationKey=copyKey;freezePendingCreation(true);pokazatOshibku('Сохранение копии ещё не подтверждено. Проверь создание.');const check=document.createElement('button');check.type='button';check.className='kn';check.textContent='проверить создание';check.dataset.taskCreationInlineCheck='1';check.addEventListener('click',taskCreationStatus);osh.append(' ',check);}
    creationNote();
  };
  const persistCopy=()=>{if(!copyKey||creating||sozd.dataset.pendingCreationKey)return;sohranitAktivnyjSegment();const body={...copyBase,nazvanie:pole('sozd-imja').value,opisanie:pole('sozd-opis').value,tip:VYBOR.tip,status:VYBOR.status,napravlenie:VYBOR.napravlenie,otvetstvennyj:VYBOR.otvetstvennyj,klient_id:VYBOR.klient_id?Number(VYBOR.klient_id):null,proekt_id:VYBOR.proekt_id?Number(VYBOR.proekt_id):null,cel_id:VYBOR.cel_id?Number(VYBOR.cel_id):null,uchastniki:VYBOR.uchastniki.slice(),materialy:fajly_formy,podzadachi:SEGMENTY_PZ,plan_chislo:pole('sozd-chislo').value?Number(pole('sozd-chislo').value):null,srok:pole('sozd-srok').value||null,publikacija:pole('sozd-pub').checked,kljuchevaja:pole('sozd-klj').checked,data_vyhoda:pole('sozd-vyhod').value||null,povtorjaetsja:pole('sozd-repeat').checked,povtor_s:pole('sozd-repeat-start').value||null,chastota:pole('sozd-repeat-frequency').value,dni:[...sozd.querySelectorAll('#sozd-repeat-days input:checked')].map(e=>Number(e.value)),kommentarii:pole('sozd-komm').value.trim()?[{tekst:pole('sozd-komm').value.trim()}]:[]};body.den_nedeli=body.dni[0]??null;body.rubrika=pole('sozd-rubrika').value.trim()||null;for(const k of ['ploshadka','format','akkaunt_id'])body[k]=VYBOR[k]??null;if(VYBOR.sprint){const week=SPR.kalendar.razobrat_nedelju(VYBOR.sprint,VYBOR.god_sprinta);body.sprint=week.nomer;body.god_sprinta=week.god;}else{body.sprint=null;body.god_sprinta=null;}try{window.LocusTaskCopy.update(copyKey,body);}catch{pokazatOshibku('Черновик не удалось сохранить в браузере. Оставь эту страницу открытой.');}};
  for(const event of ['input','change','click'])sozd.addEventListener(event,()=>queueMicrotask(persistCopy));
  window.addEventListener('pagehide',persistCopy);
  const savedCopy=initialCopyKey||new URLSearchParams(location.search).get('kopija');if(savedCopy&&!location.pathname.includes('sozdat'))taskCopy().then(module=>module.resume(savedCopy)).catch(error=>tost(error.message));
  const campaignSnapshot=()=>{sohranitAktivnyjSegment();const names=new Set(fajly_formy.map(m=>m.fajl instanceof Blob?m.fajl.name:m.ishodnoe_imja||m.nazvanie));return {selection:{...VYBOR},labels:Object.fromEntries([...sozd.querySelectorAll('a.sozd-pole[id]')].map(n=>[n.id,n.querySelector('.sozd-t')?.textContent||''])),fields:[...sozd.querySelectorAll('input[id]:not([type=file]),textarea[id],select[id]')].map(n=>({id:n.id,label:n.getAttribute('aria-label')||n.closest('.sozd-p,.sozd-opis,.sozd-ssyl,.sozd-kom')?.querySelector('.sozd-lbl')?.textContent||({'sozd-imja':'Название','sozd-opis':'Описание','sozd-komm':'Комментарий'}[n.id])||n.id,value:n.value,checked:n.type==='checkbox'?n.checked:undefined})),files:[...fajly_formy,...(VYBOR.campaign_missing_files||[]).filter(m=>!names.has(m.fajl?.name))],children:SEGMENTY_PZ};};
  const restoreCampaignSnapshot=snapshot=>{
    VYBOR={...snapshot.selection};delete VYBOR.campaign_preview;const missingFiles=snapshot.files.filter(m=>m.fajl?.missingUpload);if(missingFiles.length)VYBOR.campaign_missing_files=missingFiles;else delete VYBOR.campaign_missing_files;
    for(const entry of snapshot.fields){const node=[...sozd.querySelectorAll('input[id]:not([type=file]),textarea[id],select[id]')].find(n=>n.id===entry.id);if(!node)continue;if(node.type==='checkbox')node.checked=entry.checked===true;else node.value=String(entry.value??'');}
    fajly_formy=snapshot.files.filter(m=>!m.fajl?.missingUpload).map(m=>({...m}));narisovat_fajly();SEGMENTY_PZ=snapshot.children.map(child=>({...child}));SEGMENT_AKTIVNYJ=-1;narisovatSegmenty();pereriosovatVkladku();
    for(const node of sozd.querySelectorAll('[id]'))node.locusRefresh?.();for(const [id,label]of Object.entries(snapshot.labels||{}))if(pole(id)?.matches('a.sozd-pole'))podpisat(id,String(label),Boolean(label));podpisat('sozd-tip',VYBOR.tip==='rassylka'?'рассылка':TIPY_ZADACHI_FORMA.find(t=>t.kod===VYBOR.tip)?.imja||VYBOR.tip,true);const direction=(D.napravlenija||[]).find(d=>d.kod===VYBOR.napravlenie);if(direction)podpisat('sozd-napr',direction.imja||direction.nazvanie||direction.kod,true);repeatVisibility();pokazatPoTipu(sozd);touchDraft();queueMicrotask(refreshWorkload);
  };
  const connectCampaign=()=>taskCampaignFormUi().then(module=>{campaignController=module.mount({root:sozd,selection:()=>VYBOR,capture:campaignSnapshot,restore:restoreCampaignSnapshot,clear:ochistit,requestKey:()=>copyKey,requestRoute:()=>copyKey?'/zadachi/'+window.LocusTaskCopy.load(copyKey)?.source.nomer+'/dubl':'/zadachi',onChange:touchDraft,error:pokazatOshibku});return campaignController;}).catch(e=>{if(VYBOR.tip==='rassylka'||VYBOR.shablon==='sobrat_bazu'||VYBOR.campaign_template_role==='sobrat_bazu'){pokazatOshibku(e.message);const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.textContent='повторить загрузку выбора рассылки';retry.dataset.taskCampaignModuleRetry='1';retry.onclick=()=>{retry.disabled=true;campaignReady=connectCampaign();};osh?.append(retry);}return null;});campaignReady=connectCampaign();
  pokazatPoTipu(sozd);
  if(vstroena)queueMicrotask(refreshWorkload);
}

                                
                                                                     
                                                                    
                                                                   
                                                   
  
                                                                 
                                                                
                                                            
                                                                
const EST_NAVEDENIE = () => {
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
  catch { return false; }
};

                                                                 
                                                               
                                                           
function postavitSpisokMobile(obertka) {
  const sp = obertka.querySelector('.vyp-sp');
  if (!sp || !obertka.classList.contains('otkryt')) return;
  const anchor=obertka.querySelector(':scope>[aria-haspopup=listbox]')||obertka;
  const b=anchor.getBoundingClientRect(),view=window.visualViewport;
  const left=view?.offsetLeft||0,top=view?.offsetTop||0;
  const width=view?.width||innerWidth,height=view?.height||innerHeight;
  if(!b.width||!b.height||b.bottom<top||b.top>top+height){obertka.locusClose?.();return;}
  sp.style.position = 'fixed';
  sp.style.zIndex = '500';
  sp.style.width = 'max-content';
  sp.style.minWidth=Math.min(190,width-32)+'px';sp.style.maxWidth=Math.max(1,width-32)+'px';
  const below=top+height-b.bottom-14,above=b.top-top-14;
  const upwards=below<Math.min(sp.scrollHeight,300)&&above>below;
  sp.style.maxHeight=Math.max(44,Math.min(300,upwards?above:below))+'px';
  sp.style.bottom='auto';sp.style.right='auto';sp.style.left='0px';sp.style.top='0px';
                                                                            
                                                                            
  const origin=sp.getBoundingClientRect();
  const x=Math.max(left+16,Math.min(b.left,left+width-origin.width-16));
  const y=Math.max(top+8,Math.min(upwards?b.top-origin.height-6:b.bottom+6,top+height-origin.height-8));
  sp.style.left=(x-origin.left)+'px';sp.style.top=(y-origin.top)+'px';
}

                                                                    
                                                         
                                                                    
                                                          
const PAUZA_UHODA = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hover-close-delay'))||120;
                                                                 
                                                       
const PAUZA_VHODA = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hover-open-delay'))||90;

function navedenie(obertka, otkryt_ishodnyj, zakryt) {
  let vhod = null, uhod = null, hoverBlock=hoverPointer;
  const otmenit_tajmery = () => {
    clearTimeout(vhod); clearTimeout(uhod); vhod = null; uhod = null;
  };
                                                                          
                                                                     
  obertka.addEventListener('pointerdown', otmenit_tajmery, true);
  const otkryt = () => {
    if (!obertka.isConnected) return;
    otkryt_ishodnyj();
                                                          
                                                 
    postavit_spisok();
  };
                                                                 
                                                              
                                                            
  let zakryto_klikom = false;

  const postavit_spisok = () => postavitSpisokMobile(obertka);

  const po_navedeniju = (event) => {
    if (!EST_NAVEDENIE() || zakryto_klikom) return;
    if(hoverBlock&&event&&event.clientX===hoverBlock.x&&event.clientY===hoverBlock.y)return;
    hoverBlock=null;
    if (uhod) { clearTimeout(uhod); uhod = null; }
    if (vhod) clearTimeout(vhod);
    vhod = setTimeout(otkryt, PAUZA_VHODA);
  };

  obertka.addEventListener('mouseenter', po_navedeniju);
                                                               
                                                               
                                              
  obertka.addEventListener('mousemove', (event) => {
    if (obertka.classList.contains('otkryt')) return;
    po_navedeniju(event);
  });
  obertka.addEventListener('mouseleave', () => {
    hoverBlock=null;
    if (!EST_NAVEDENIE()) return;
    if (vhod) { clearTimeout(vhod); vhod = null; }
    zakryto_klikom = false;
                                                                   
                                            
    uhod = setTimeout(() => {
      uhod = null;
      if (!obertka.matches(':hover') && !obertka.querySelector('.vyp-sp')?.matches(':hover')) zakryt();
    }, PAUZA_UHODA);
  });
                                                                  
  obertka.addEventListener('click', () => {
    if (vhod) { clearTimeout(vhod); vhod = null; }
    zakryto_klikom = !obertka.classList.contains('otkryt');
  });
}

                                                                    
function vkljuchitStatusy(priSmene, gde = document) {
  gde.querySelectorAll('.pill.men').forEach((pl) => {
                                                              
                                                                   
                                             
    if (pl.parentElement?.classList.contains('vyp')) return;
    const o = document.createElement('span');
    o.className = 'vyp';
    pl.parentNode.insertBefore(o, pl);
    o.appendChild(pl);
    const spisok = vypadajuschij(pl, window.DANNYE.statusy, pl.dataset.status);
    spisok.addEventListener('click', (e) => {
      const p = e.target.closest('.vyp-p'); if (!p) return;
      e.stopPropagation();
      if (priSmene) priSmene(pl.closest('.zs'), p.dataset.kod);
    });
  });
}

function vkljuchitDejstvijaZadach(gde, after) {
  if (!gde) return;
  vkljuchitStatusy((row, status) => smenitStatusZadachi(row, status, after), gde);
  gde.querySelectorAll('.zs .gal-b').forEach(check => {
    if (check.locusTaskAction) return;
    check.locusTaskAction = true;
    check.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const row = check.closest('.zs');
      zakrytZadachu(Number(row.dataset.nomer), row, after);
    });
  });
}

function periodnik(tekst, vid = 'period') {
  const [glavnoe, tiho] = tekst;
                                                                 
                                                             
                                    
  const kljuch = vid === 'sprint' ? 'data-sprint' : 'data-period';
  return `<span class="ned ned-${vid}"><a class="str l" ${kljuch}="-1"
    aria-label="предыдущий"></a><b>${glavnoe}</b>` +
    `<span class="nd">${tiho}</span>` +
    `<a class="str r" ${kljuch}="1" aria-label="следующий"></a></span>`;
}

                                                        
                                                       
                          
  
                                                                
                                               
const RAZVERNUTO = new Set();

function garmoshka(kljuch, imja, skolko_vsego, vnutri, { srazu = false } = {}) {
  const otkryt = srazu || RAZVERNUTO.has(kljuch);
  return `<div class="grm${otkryt ? ' otkr' : ''}" data-grm="${kljuch}">
    <a class="grm-z">
      <span class="grm-im">${imja}</span>
      <i></i>
      ${skolko_vsego != null ? `<span class="n">${skolko_vsego}</span>` : ''}
      <span class="grm-str"></span>
    </a>
    <div class="grm-t">${vnutri}</div>
  </div>`;
}

                                                                    
function vkljuchitGarmoshki() {
  if (vkljuchitGarmoshki.est) return;
  vkljuchitGarmoshki.est = true;
  document.addEventListener('click', (ev) => {
    const z = ev.target.closest('.grm-z');
    if (!z) return;
    const g = z.closest('.grm');
    const kljuch = g.dataset.grm;
    const bylo = g.classList.contains('otkr');
    g.classList.toggle('otkr', !bylo);
    if (bylo) RAZVERNUTO.delete(kljuch); else RAZVERNUTO.add(kljuch);
  });
}

                                                         
                                                               
function spisokSPredelom(stroki, predel = 10, kljuch = '') {
  if (stroki.length <= predel) return stroki.join('');
  const vidno = stroki.slice(0, predel).join('');
  const ostalnoe = stroki.slice(predel).join('');
  return `${vidno}<div class="esche" data-esche-spisok="${kljuch}">
      <a class="fil-b">показать ещё ${stroki.length - predel}</a>
    </div><div class="esche-t" hidden>${ostalnoe}</div>`;
}

function vkljuchitEscheSpisok() {
  if (vkljuchitEscheSpisok.est) return;
  vkljuchitEscheSpisok.est = true;
  document.addEventListener('click', (ev) => {
    const k = ev.target.closest('[data-esche-spisok]');
    if (!k) return;
    const skrytoe = k.nextElementSibling;
    if (skrytoe && skrytoe.classList.contains('esche-t')) {
      skrytoe.hidden = false;
      k.remove();
    }
  });
}

                                                      
                                                               
                                             
  
                                                                       
function skolko(n, odna, dve, mnogo) {
  const o = Math.abs(n) % 10;
  const s = Math.abs(n) % 100;
  if (s >= 11 && s <= 14) return mnogo;
  if (o === 1) return odna;
  if (o >= 2 && o <= 4) return dve;
  return mnogo;
}

                                              
const SLOVA = {
  zadacha: ['задача', 'задачи', 'задач'],
  chelovek: ['человек', 'человека', 'человек'],
  klient: ['клиент', 'клиента', 'клиентов'],
  lid: ['лид', 'лида', 'лидов'],
  cel: ['цель', 'цели', 'целей'],
  rezultat: ['результат', 'результата', 'результатов'],
  proekt: ['проект', 'проекта', 'проектов'],
  den: ['день', 'дня', 'дней'],
  zapis: ['запись', 'записи', 'записей'],
  otkrytaja: ['открытая', 'открытые', 'открытых'],
};

                                                             
function skolkoSlovo(n, kljuch) {
  const f = SLOVA[kljuch];
  if (!f) return String(n);
  return `${n} ${skolko(n, f[0], f[1], f[2])}`;
}

                                                                  
                                                               
                                                            
  
                                                                 
                                                                       
function istochnikPrihoda({prefix,napravlenie,znachenie={}}){
  const types=[['rekomendacija','рекомендация'],['rassylka','рассылка'],
    ['meroprijatie','мероприятие'],['sajt','сайт'],['socseti','соцсети'],
    ['holodnyj_kontakt','холодный контакт'],['svoj','свой источник']];
  let root,source=znachenie.istochnik||'',knownGeneration=0,knownTimer;
  const refs={
    rekomendacija:znachenie.rekomendoval_id?{id:znachenie.rekomendoval_id,imja:znachenie.rekomendoval_imja}:null,
    rassylka:znachenie.rassylka_id?{id:znachenie.rassylka_id,nazvanie:znachenie.rassylka_nazvanie,napravlenie:znachenie.napravlenie}:null,
  };
  const texts={meroprijatie:source==='meroprijatie'?znachenie.istochnik_tekst||'':'',
    svoj:source==='svoj'?znachenie.istochnik_tekst||'':''};
  const field=name=>root.querySelector('#'+prefix+'-'+name);
  function render(){
    knownGeneration++;field('ist-known').hidden=true;field('ist-known').innerHTML='';
    if(refs.rassylka?.napravlenie&&refs.rassylka.napravlenie!==napravlenie())refs.rassylka=null;
    field('ist-ref-p').hidden=!['rekomendacija','rassylka'].includes(source);
    field('ist-dop-p').hidden=!['meroprijatie','svoj'].includes(source);
    field('ist-ref-l').textContent=source==='rassylka'?'какая рассылка':'кто порекомендовал';
    const selected=refs[source];
    field('ist-ref').textContent=selected?(selected.imja||selected.nazvanie||'#'+selected.id):
      source==='rassylka'?'выбрать рассылку':'выбрать человека';
    field('ist-ref').title=field('ist-ref').textContent;
    field('ist-dop-l').textContent=source==='svoj'?'свой источник':'какое мероприятие';
    field('ist-dop').value=texts[source]||'';
    field('ist-dop').placeholder=source==='svoj'?'написать или выбрать сохранённый':'название мероприятия';
  }
  async function known(){
    const seq=++knownGeneration;if(source!=='svoj'||!root.isConnected)return;
    const list=field('ist-known'),query=field('ist-dop').value.trim();
    try{
      const response=await API.spisok('sotrudnichestva',{istochnik:'svoj',q:query,na_stranice:50});
      if(seq!==knownGeneration||source!=='svoj'||!root.isConnected)return;
      const norm=value=>String(value).toLowerCase().replace(/ё/g,'е');
      const items=[...new Set((response.spisok||[]).map(row=>String(row.istochnik_tekst||'').trim()))]
        .filter(value=>value&&norm(value).includes(norm(query))).slice(0,10);
      list.hidden=!items.length;
      list.innerHTML=items.map((value,index)=>`<a class="vyp-p" role="button" tabindex="0" data-source-text="${index}">${ekranirovat(value)}</a>`).join('');
      list.onclick=event=>{
        const item=event.target.closest('[data-source-text]');if(!item)return;
        texts.svoj=items[Number(item.dataset.sourceText)];field('ist-dop').value=texts.svoj;list.hidden=true;
      };
    }catch{if(seq===knownGeneration)list.hidden=true;}
  }
  function pick(){
    if(source==='rassylka'&&!napravlenie()){tost('Сначала выбери направление');return;}
    const type=source,table=type==='rekomendacija'?'ljudi':'rassylki';
    let selected=refs[type],generation=0,timer;
    modalka(type==='rekomendacija'?'Кто порекомендовал':'Какая рассылка',`
      <div class="okno-kanon">
        <input class="sozd-vvod" id="is-search" placeholder="найти по имени или названию"
          aria-label="поиск источника" autocomplete="off">
        <div id="is-results"></div><div class="fch-niz"><span class="fch-osh" id="is-error"></span></div>
      </div>`,null,{poverh:true,podskazka:'выбрать источник',gotovo:()=>{
        if(!selected)throw new Error('Выбери запись из базы');
        refs[type]=selected;render();
      }});
    const input=document.getElementById('is-search'),results=document.getElementById('is-results');
    const search=async()=>{
      const seq=++generation;
      try{
        const response=await API.spisok(table,{q:input.value.trim(),na_stranice:20,
          ...(table==='ljudi'?{vse_roli:1}:{napravlenie:napravlenie()})});
        if(seq!==generation||!results.isConnected)return;
        const items=response.spisok||[];
        results.innerHTML=items.length?items.map(item=>
          `<a class="vyp-p${selected?.id===item.id?' on':''}" role="button" tabindex="0"
            data-source-id="${item.id}" aria-pressed="${selected?.id===item.id}">${ekranirovat([
              item.imja||item.nazvanie,table==='ljudi'?[item.gorod,item.primary_phone_pokaz||item.primary_phone||item.primary_email].filter(Boolean).join(', '):''
            ].filter(Boolean).join(' — '))}</a>`).join(''):
          '<div class="net">ничего не найдено</div>';
        results.onclick=event=>{
          const item=event.target.closest('[data-source-id]');if(!item)return;
          selected=items.find(row=>row.id===Number(item.dataset.sourceId));
          results.querySelectorAll('[data-source-id]').forEach(row=>{
            row.classList.toggle('on',row===item);row.setAttribute('aria-pressed',String(row===item));
          });
        };
      }catch(error){if(seq===generation&&results.isConnected)document.getElementById('is-error').textContent=error.message;}
    };
    input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,200);});
    search();input.focus();
  }
  return {
    html:`<label class="fch-p"><span class="fch-l">откуда</span>
      <select class="fch-v" id="${prefix}-ist" aria-label="откуда пришёл"><option value="">не знаю</option>
        ${types.map(([code,label])=>`<option value="${code}"${source===code?' selected':''}>${label}</option>`).join('')}
      </select></label>
      <div class="fch-p" id="${prefix}-ist-ref-p" hidden><span class="fch-l" id="${prefix}-ist-ref-l"></span>
        <button type="button" class="fch-v" id="${prefix}-ist-ref"></button></div>
      <label class="fch-p" id="${prefix}-ist-dop-p" hidden><span class="fch-l" id="${prefix}-ist-dop-l"></span>
        <input class="fch-v" id="${prefix}-ist-dop" autocomplete="off"></label>
      <div id="${prefix}-ist-known" hidden></div>`,
    podkljuchit(element){
      root=element;
      field('ist').addEventListener('change',()=>{source=field('ist').value;render();});
      field('ist-ref').addEventListener('click',pick);
      field('ist-dop').addEventListener('input',()=>{
        texts[source]=field('ist-dop').value;clearTimeout(knownTimer);knownTimer=setTimeout(known,180);
      });
      field('ist-dop').addEventListener('focus',known);
      render();
      for(const [type,table] of [['rekomendacija','ljudi'],['rassylka','rassylki']]){
        const original=refs[type];if(!original?.id)continue;
        API.odna(table,original.id).then(item=>{
          if(refs[type]===original&&root.isConnected){refs[type]=item;render();}
        }).catch(()=>{});
      }
    },
    obnovitNapravlenie(){render();},
    telo(){
      if(source==='rekomendacija'&&!refs.rekomendacija)throw new Error('Выбери, кто порекомендовал');
      if(source==='rassylka'&&!refs.rassylka)throw new Error('Выбери рассылку');
      const text=(texts[source]||'').trim();
      if(['meroprijatie','svoj'].includes(source)&&!text)throw new Error(source==='svoj'?'Укажи свой источник':'Укажи мероприятие');
      return {istochnik:source||null,rekomendoval_id:source==='rekomendacija'?refs.rekomendacija.id:null,
        rassylka_id:source==='rassylka'?refs.rassylka.id:null,
        istochnik_tekst:['meroprijatie','svoj'].includes(source)?text:null};
    },
  };
}

async function formaCheloveka(kontekst = {}, gotovo) {
  const napr = (window.DANNYE || {}).napravlenija || [];
  const ROLI = [['lid', 'лид'], ['klient', 'клиент'], ['referal', 'реферал']];
  const contactContext = kontekst.kontakt_dlja || null;
  const arrival=contactContext?null:istochnikPrihoda({prefix:'fch',napravlenie:()=>document.getElementById('fch-napr')?.value||''});

                                                                  
                                                                  
                                                              
                                         
  const pole_f = (id, podpis, vnutri) => `<label class="fch-p">
    <span class="fch-l">${podpis}</span>${vnutri}</label>`;
  const vvod_f = (id, podskazka, tip = 'text') =>
    `<input class="fch-v" id="${id}" type="${tip}"
       placeholder="${podskazka}" autocomplete="off">`;
  const zakryt = modalka(contactContext ? 'Новое контактное лицо' : 'Новый человек', `
    <div class="fch">
      ${pole_f('fch-imja', 'имя',
        vvod_f('fch-imja', 'как называем в разговоре'))}
      <div class="fch-dubli" id="fch-dubli"></div>
      <div class="fch-dve">
        ${contactContext ? '' : `
        ${pole_f('fch-napr', 'направление', `
          <select class="fch-v" aria-label="направление" id="fch-napr">
            <option value="">без направления</option>
            ${napr.map((n) => `<option value="${n.kod}"${
              n.kod === kontekst.napravlenie ? ' selected' : ''}>${n.imja}</option>`).join('')}
          </select>`)}
        ${pole_f('fch-rol', 'роль', `
          <select class="fch-v" aria-label="роль" id="fch-rol">
            ${kontekst.vybrat_rol?'<option value="" selected>выбери роль</option>':''}
            ${ROLI.map(([k, i]) => `<option value="${k}"${
              !kontekst.vybrat_rol && k === (kontekst.rol || 'lid') ? ' selected' : ''}>${i}</option>`).join('')}
          </select>`)}
        `}
        ${pole_f('fch-tg', 'телеграм', vvod_f('fch-tg', '@имя'))}
        ${pole_f('fch-pochta', 'почта', vvod_f('fch-pochta', 'имя@почта.ру'))}
        ${pole_f('fch-telefon', 'телефон', vvod_f('fch-telefon', '+7 …', 'tel'))}
        ${pole_f('fch-gorod', 'город', vvod_f('fch-gorod', 'где живёт'))}
        ${pole_f('fch-nisha', 'ниша', vvod_f('fch-nisha', 'чем занимается'))}
      </div>
      ${arrival?`<div id="fch-source-group">${arrival.html}</div>`:''}
      ${pole_f('fch-zametka', 'заметка',
        vvod_f('fch-zametka', 'что важно помнить'))}
      <div class="fch-niz"><span class="fch-osh" id="fch-osh"></span></div>
    </div>`, null, {
    gotovo: () => zavesti(),
    znak: '+', podskazka: 'завести человека',
  });

  const imja = document.getElementById('fch-imja');
  const dubli = document.getElementById('fch-dubli');
  const osh = document.getElementById('fch-osh');
  setTimeout(() => imja.focus(), 30);

  if(arrival){
    const root=imja.closest('.vyb-fon');arrival.podkljuchit(root);
    const update=()=>{
      const direction=document.getElementById('fch-napr').value;
      document.getElementById('fch-source-group').hidden=!direction;
      document.getElementById('fch-rol').closest('label').hidden=!direction;
      arrival.obnovitNapravlenie();
    };
    document.getElementById('fch-napr').addEventListener('change',update);update();
  }

                                                                  
                              
  let tajmer;
  imja.addEventListener('input', () => {
    clearTimeout(tajmer);
    const chto = imja.value.trim();
    if (chto.length < 3) { dubli.innerHTML = ''; return; }
    tajmer = setTimeout(async () => {
      try {
        const o = await API.spisok('ljudi', { q: chto, na_stranice: 5, vse_roli: 1 });
        const najdeno = o.spisok || [];
                                                                
                                                            
        const sotr = await Promise.all(najdeno.map((l) =>
          API.spisok('sotrudnichestva', { chelovek_id: l.id }).catch(() => null)));
        const ROLI_SLOVA = { lid: 'лид', klient: 'клиент', referal: 'реферал' };
        const napr_imja = (kod) =>
          (napr.find((n) => n.kod === kod) || {}).imja || kod || '';
        const kontekst_str = (i) => {
          const s = (sotr[i] && sotr[i].spisok) || [];
          if (!s.length) return '';
          return `<span class="fch-d-k">${s.slice(0, 2).map((x) =>
            [ROLI_SLOVA[x.rol] || x.rol, napr_imja(x.napravlenie)]
              .filter(Boolean).join(' ')).join(', ')}</span>`;
        };
                                                                 
                                      
        const bezopasno = chto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const podsvet = (s) => ekranirovat(s)
          .replace(new RegExp(`(${bezopasno})`, 'i'), '<b>$1</b>');
        dubli.innerHTML = najdeno.length
          ? `<div class="fch-d-z">уже есть, может это они:</div>` +
            najdeno.map((l, i) =>
              `<a class="fch-d" href="/klient.html?id=${l.id}">${
                podsvet(l.imja)}${kontekst_str(i)}</a>`).join('')
          : '';
      } catch { dubli.innerHTML = ''; }
    }, 280);
  });

  async function zavesti() {
    const znachenie = imja.value.trim();
    if (!znachenie) {
      osh.textContent = 'нужно имя';
      throw new Error('нужно имя');
    }
    osh.textContent = '';
    const p = (id) => (document.getElementById(id)?.value || '').trim();
    try {
      const kod = document.getElementById('fch-napr')?.value || '';
      const related = {};
      if(kod&&!contactContext&&!document.getElementById('fch-rol').value)throw new Error('Выбери роль нового человека');
      if (contactContext) related.kontakt_dlja = contactContext;
      else if (kod) related.sotrudnichestvo = {
        napravlenie: kod, rol: document.getElementById('fch-rol').value,
        ...arrival.telo(),
      };
      const body = {
        imja: znachenie, ...related,
        ...(p('fch-gorod') ? { gorod: p('fch-gorod') } : {}),
        ...(p('fch-nisha') ? { nisha: p('fch-nisha') } : {}),
        ...(p('fch-zametka') ? { zametka: p('fch-zametka') } : {}),
        kontakty: [['telegram', p('fch-tg')], ['pochta', p('fch-pochta')],
          ['telefon', p('fch-telefon')]].filter(([,v])=>v).map(([tip,znachenie])=>({tip,znachenie})),
      };
      let novyj;
      for (;;) {
        try { novyj = await API.sozdat('ljudi', body); break; }
        catch (error) {
          if (!contactContext || error.kod !== 409 || !error.telo?.tekuschee) throw error;
          const live = error.telo.tekuschee;
          const choice = await razreshitKonflikt(error, { label: 'контакт по направлению',
            local: znachenie, current: live.kontakt_id ? 'выбран другой человек' : 'сам человек' });
          if (choice === 'load') { zakryt(); if (gotovo) await gotovo(null); return; }
          if (choice !== 'own') throw Object.assign(new Error('Ввод сохранён в форме'), {locusCancelled:true});
          body.kontakt_dlja = { ...contactContext, versija: live.versija };
        }
      }
                                                                
                                            
      if (gotovo) { try { await gotovo(novyj); } catch { tost('Человек сохранён. Обнови список'); } }
      tost(`${novyj.imja} заведён`, contactContext ? null : async () => {
        await API.udalit('ljudi', novyj.id);
        if (gotovo) await gotovo(null);
      });
    } catch (e) {
      const tekst = e.message;
      osh.textContent = tekst;
      throw new Error(tekst);
    }
  }

  imja.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.querySelector('.vyb-kn .vyb-g')?.click();
    }
  });
}

                                                         
                                                                
                                                           
let otobrat_cheloveka = null;
function vkljuchitLjudej(otobrat) {
  otobrat_cheloveka = otobrat;
  if (vkljuchitLjudej.est) return;
  vkljuchitLjudej.est = true;
  document.addEventListener('click', (ev) => {
    const chel = ev.target.closest('[data-chel]');
    if (!chel || !otobrat_cheloveka) return;
    ev.preventDefault();
    const byl = chel.classList.contains('on');
    document.querySelectorAll('[data-chel]').forEach((e) => e.classList.remove('on'));
                                                             
                                     
    const kod = byl ? '' : chel.dataset.chel;
    document.querySelector(`[data-chel="${kod}"]`)?.classList.add('on');
    otobrat_cheloveka(kod ? Number(kod) : null);
  });
}

                                                             
                                                          
                                               
let smenit_period = null;
                                                               
                                                 
function vkljuchitVtoroj(vybran, smenit) {
  document.querySelectorAll('[data-vtoroj]').forEach((e) => {
    e.classList.toggle('on', e.dataset.vtoroj === vybran);
    e.addEventListener('click', () => {
                                                                     
                                                                   
                           
      if (e.classList.contains('on')) return;
      smenit(e.dataset.vtoroj);
    });
  });
}

                                                             
                                                              
                                                             
let smenit_sprint = null;
function vkljuchitSprint(pri) {
  smenit_sprint = pri;
  if (vkljuchitSprint.est) return;
  vkljuchitSprint.est = true;
  document.addEventListener('click', (ev) => {
    const str = ev.target.closest('[data-sprint]');
    if (!str || !smenit_sprint) return;
    ev.preventDefault();
    ev.stopPropagation();
    smenit_sprint(Number(str.dataset.sprint));
  });
}

function vkljuchitPeriod(smenit) {
  smenit_period = smenit;
  if (vkljuchitPeriod.est) return;
  vkljuchitPeriod.est = true;
  document.addEventListener('click', (ev) => {
    const str = ev.target.closest('[data-period]');
    if (!str || !smenit_period) return;
    ev.preventDefault();
    ev.stopPropagation();
    smenit_period(Number(str.dataset.period));
  });
}

function avatar(chel, px = 22) {
                                                                   
                                                       
  if (chel && chel.foto) {
    return `<span class="av" style="width:${px}px;height:${px}px">` +
      `<img src="${ekranirovat(chel.foto)}" alt=""></span>`;
  }
  return `<span class="av net" style="width:${px}px;height:${px}px"></span>`;
}

function chelovekPoImeni(imja) {
  return D.ljudi.find((l) => l.imja === imja) || { imja, foto: null };
}

function naprPoKodu(kod) {
  const n = D.napravlenija.find((x) => x.kod === kod);
  if (!n) return { imja: kod, cvet: 'var(--t3)' };
                                                                      
  return { ...n, imja: n.imja || n.nazvanie || n.kod, cvet: n.cvet || 'var(--t3)' };
}

function statusPoKodu(kod) {
  if (kod === 'prosrochena') return { imja: 'просрочено', cvet: 'var(--t3)' };
  return D.statusy.find((s) => s.kod === kod) || { imja: kod, cvet: '#8b8d98' };
}

                 
                                                                   
function plashka(kod, menjaetsja) {
  const s = statusPoKodu(kod);
  return `<span class="pill st-${kod}${menjaetsja ? ' men' : ''}" data-status="${kod}">${s.imja}</span>`;
}

                                                                            
                                                                
                                                               
                                                                       
                                                                  
                                                           
function sPodzadachami(spisok) {
  const est = new Set((spisok || []).map((z) => z.id));
  const deti = new Map();
  const verh = [];
  for (const z of spisok || []) {
    if (z.roditel_id && est.has(z.roditel_id)) {
      if (!deti.has(z.roditel_id)) deti.set(z.roditel_id, []);
      deti.get(z.roditel_id).push(z);
    } else verh.push(z);
  }
  const out = [];
  const po_kljuchu = verh.filter((z) => z.kljuchevaja)
    .concat(verh.filter((z) => !z.kljuchevaja));
  for (const z of po_kljuchu) {
    out.push(z);
    for (const d of deti.get(z.id) || []) out.push(d);
  }
  return out;
}

function mozhnoOtmetitPovtor(z) {
  if (!z.povtorjaetsja) return true;
  if (z.buduschij_den) return false;
  if (z.otmecheno || Number(z.dnej_bez_otmetki) > 0) return true;
  if (typeof z.mozhno_otmetit === 'boolean') return z.mozhno_otmetit;
  if (!Array.isArray(z.dni_dlja_otmetki)) return true;                                                         
  const day = z.den_vybora || SPR.segodnja();
  return z.dni_dlja_otmetki.some(item => item.data === day);
}
function prichinaNedostupnogoPovtora(z) {
  if (z.buduschij_den) return 'День ещё не наступил';
  if (z.povtor_s && z.povtor_s > (z.den_vybora || SPR.segodnja())) {
    return 'Повторение начнётся ' + SPR.data(z.povtor_s)
      + (z.povtor_s.slice(0,4) === SPR.segodnja().slice(0,4) ? '' : '.' + z.povtor_s.slice(0,4));
  }
  return 'В этот день отметка не предусмотрена';
}

function estNazvanieZadachi(value) { return typeof value === 'string' && Boolean(value.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,'')); }

function referralTaskAmount(task){
 const context=task?.referalnaja_zadacha,amount=context?.summa;
 if(context?.vid!=='vyplata'||typeof amount!=='number'||!Number.isFinite(amount)||amount<=0)return '';
 const text=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(amount)+' ₽';
 return '<span class="referral-task-amount" data-referral-task-amount="'+Number(task.nomer)+'">'+ekranirovat(text)+'</span>';
}

function strokaZadachi(z, { podzadacha = false, bezNapravlenija = false,
                            bez_otvetstvennogo = false } = {}) {
  if (z.roditel_id) podzadacha = true;
  const n = naprPoKodu(z.napravlenie);
  const chel = chelovekPoImeni(z.otvetstvennyj);
  const sdelano = z.status === 'sdelano';
                                                                         
                                                                  
                                     
  const imja_napr = (n.imja || z.napravlenie).split(/[,(]/)[0].trim();
  const podpis_bez = podzadacha || bezNapravlenija
    ? (z.podpis || '')
    : imja_napr + (z.podpis ? ', ' + z.podpis : '');
                                                          
  const podpis = z.kljuchevaja
    ? [podpis_bez, 'ключевая'].filter(Boolean).join(', ') : podpis_bez;
                                                              
                                                             
                                                              
                                                            
    
                                                                  
                                                                   
                                                                    
                                  
  const srok_i_sprint = z.povtorjaetsja ? '' : z.srok || '';
                                                                
                                                   
  const prog = !z.referalnaja_zadacha && z.fakt !== undefined && z.fakt !== null && z.plan_chislo
    ? `<div class="zs-prog">${z.fakt_tekuschaja_baza?'в базе сейчас: ':z.fakt_nepolnyj?'подтверждено ':''}${z.fakt} из ${z.plan_chislo}${z.fakt_nepolnyj?', данные неполные':''}${z.fakt_tekuschaja_baza?'':', '}${z.fakt_tekuschaja_baza?'':z.fakt_nedeli
        ? '+' + z.fakt_nedeli + ' за неделю'
        : (z.fakt_nepolnyj?'<span>за неделю нет подтверждённых отправок</span>':'<span class="stop">на этой неделе без движения</span>')}</div>`
    : '';
  const repeatAvailable = mozhnoOtmetitPovtor(z);
  const repeat = z.povtorjaetsja ? `<span class="pv-badge">повтор</span>${z.podpis_propuskov
    ? `<button type="button" class="pv-missed" data-pv-days="${z.nomer}">${ekranirovat(z.podpis_propuskov)}</button>` : ''}${!repeatAvailable
      ? `<span class="pv-day-note">${ekranirovat(prichinaNedostupnogoPovtora(z))}</span>` : ''}` : '';
  return `<div class="zs${podzadacha ? ' pdz' : ''}${sdelano ? ' sdel' : ''}${z.podsvetka ? ' pv-warning' : ''}${
    z.kljuchevaja ? ' klj' : ''}" data-nomer="${z.nomer}" data-versija="${z.versija || ''}"
    data-open-children="${Number(z.otkrytyh_podzadach) || 0}"
    data-povtor="${z.povtorjaetsja ? 1 : 0}" data-pv-marked="${z.otmecheno ? 1 : 0}"
    data-pv-future="${z.buduschij_den ? 1 : 0}" data-pv-missed="${Number(z.dnej_bez_otmetki) || 0}"
    data-pv-can-mark="${repeatAvailable ? 1 : 0}"
    data-pv-date="${z.den_vybora || ''}" data-napr="${z.napravlenie}" data-status="${z.status}" data-tip="${z.tip}">
    <span class="gal-b${sdelano ? ' on' : ''}" role="checkbox" tabindex="${repeatAvailable ? 0 : -1}"
      aria-checked="${sdelano}" aria-disabled="${!repeatAvailable}" aria-label="Выполнена задача ${z.nomer}"></span>
    <span class="zs-n">${ekranirovat(z.nazvanie)}${referralTaskAmount(z)}<div class="zs-p">${podpis}${repeat}</div>${prog}</span>
    <span>${plashka(z.status, !z.povtorjaetsja)}</span>
    <span class="dt${z.prosrocheno ? ' pr' : ''}">${srok_i_sprint}</span>
    ${bez_otvetstvennogo ? '<span></span>' : avatar(chel, 22)}
  </div>`;
}

                           
                                                                   
                                                                 
                                         
                                                                      
                                                                   
const POLJA_PO_RUSSKI = {
  status: 'статус', otvetstvennyj: 'ответственного', srok: 'срок',
  sprint: 'спринт', napravlenie: 'направление', cel_id: 'цель',
  udaleno: 'удаление', tip: 'тип', klient_id: 'клиента',
  proekt_id: 'проект', nazvanie: 'название', opisanie: 'описание', kljuchevaja: 'ключевая', plan_chislo: 'целевое число', plan_perioda: 'план периода',
  sozdano: 'создание', otmetka: 'отметку', kasanie: 'касание',
  uchastnik: 'участника',
};
function polePoRusski(kod) { return POLJA_PO_RUSSKI[kod] || kod; }

                                                                    
                                                
function znachenieSlovami(pole, znach) {
  if (znach === null || znach === undefined || znach === '') return '—';
  if(pole==='ohvat_zamer'){try{const r=JSON.parse(znach);return Number.isSafeInteger(r.znachenie)&&r.znachenie>=0?new Intl.NumberFormat('ru-RU').format(r.znachenie)+(typeof r.data==='string'?' (замер от '+r.data.split('-').reverse().join('.')+')':''):'замер недоступен';}catch{return 'замер недоступен';}}
  if(pole==='plan_perioda'){try{const p=JSON.parse(znach);return String(p.period)+': '+(p.plan===null?'план не задан':String(p.plan));}catch{return 'план периода';}}
  if(pole==='publikacija_istochnik'){if(znach==='отсоединено')return 'источник отсоединён';try{const r=JSON.parse(znach);return r.vosstanovleno?'прежний источник возвращён':r.nazvanie||'выбранная публикация';}catch{return 'публикация';}}
  const D = window.DANNYE || {};
  if (pole === 'status') {
    return ((D.statusy || []).find((s) => s.kod === znach) || {}).imja || znach;
  }
  if (pole === 'napravlenie') return naprPoKodu(znach).imja || znach;
  if (pole === 'tip') {
    return (TIPY_ZADACHI_FORMA.find((t) => t.kod === znach) || {}).imja || znach;
  }
  if (pole === 'otvetstvennyj') {
    return ((D.ljudi || []).find((l) => String(l.id) === String(znach)) || {}).imja || znach;
  }
  if (pole === 'srok') return SPR.data(znach) || znach;
  if (pole === 'udaleno' || pole === 'kljuchevaja') return String(znach) === '1' || znach === true ? 'да' : 'нет';
  return znach;
}

                          
                                                                       
                                                                    
                                                     
  
                                                                    
                                                                   
                                                                  
                                                  
                                                                    
                                                                       
                                                               
                                                
function imja_klienta(id) {
  if (!id) return '';
  const D = window.DANNYE || {};
  if (D.klienty_po_id && D.klienty_po_id.get) return D.klienty_po_id.get(id) || '';
  return ((D.ljudi_vse || []).find((k) => k.id === id) || {}).imja || '';
}
function nazvanie_proekta(id) {
  if (!id) return '';
  const D = window.DANNYE || {};
  if (D.proekty_po_id && D.proekty_po_id.get) return D.proekty_po_id.get(id) || '';
  return '';
}

                                                                   
                                                                
                   
  
                                                                 
                                                                 
                                                                  
                                                                     
function ssylka_na_rassylku(z) {
  if (!z.rassylka_id) return '';
  const D = window.DANNYE || {};
  const imja = (D.rassylki_po_id && D.rassylki_po_id.get
    ? D.rassylki_po_id.get(z.rassylka_id) : '') || 'перейти к рассылке';
  return `<a class="kz-ssyl" href="/rassylka.html?id=${z.rassylka_id}">${ekranirovat(imja)}</a>`;
}

                                                                 
                                                            
                                      
function porjadok_ispolnitelej_punkty(D) {
  return (D.ljudi || []).filter(l => !l.arhiv).map(l => ({ kod: String(l.id), imja: l.imja }));
}

                                                         
                                                        
function ekranirovat(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

                                                      
                                                                 
                                       
function profilCheloveka(id,label){
  const number=Number(id),safe=ekranirovat(label);
  return Number.isSafeInteger(number)&&number>0
    ? `<a class="chel-profil" href="/poleznoe.html?vkladka=komanda&amp;chelovek_id=${number}">${safe}</a>` : safe;
}
async function otkrytZadachu(nomer, den = null, sourceAddress = null) {
  if (!nomer) return;
  const requestedHash=Number(window.LocusTaskRoute.query(location.href).get('nomer'))===Number(nomer)?location.hash:'';
  const day = den || new URLSearchParams(location.search).get('den');
  let vybrannyjDen = null;
  if (day) {
    try { SPR.kalendar.data(day); vybrannyjDen = day; }
    catch { tost('Не удалось открыть день: нужна существующая дата'); return; }
  }
  const incomingAddress=location.href,directTask=window.LocusTaskRoute.direct(incomingAddress),parentReturn=document.querySelector('[data-task-return-address]')?.dataset.taskReturnAddress;
  document.querySelector('.vyb-fon')?.locusZakryt?.();
  if(directTask)history.replaceState(null,'',incomingAddress);
                                                                           
                                                                            
  const source=sourceAddress?new URL(sourceAddress,location.href):null;
  if(source&&source.origin!==location.origin)throw new Error('Нужен адрес внутри Локуса');
  const returnAddress=directTask?(parentReturn||window.LocusTaskRoute.list(incomingAddress)):source?source.pathname+source.search+source.hash:null;
  const bylo_adres = location.search;
  const p = new URLSearchParams(location.search);
  if(!directTask)p.set('nomer', String(nomer));else{p.delete('nomer');p.delete('napravlenie');}
  if (vybrannyjDen) p.set('den', vybrannyjDen); else p.delete('den');
  history.replaceState(null, '', location.pathname + '?' + p + requestedHash);

  const byl_title = document.title;
  const vernut_adres = () => {
    const nazad = new URLSearchParams(bylo_adres);
    nazad.delete('nomer'); nazad.delete('den');
    history.replaceState(null, '',returnAddress||
      location.pathname + (nazad.toString() ? '?' + nazad : ''));
                                                             
    document.title = byl_title;
  };
                                                                 
                                                               
  let tekuschaja = null,focusTaskCleanup=null,commentsCleanup=null,participants=null,taskEditCleanup=null,childrenUi=null,materialUi=null,publicationUi=null,publicationChanged=null,publicationDirty=false;
  const zakryt_modalku = modalka(`Задача ${nomer}`,
    '<div class="kz" id="kz"><div class="pusto-p">грузится</div></div>',
    null,
    { polnyj: true, priZakrytii: ()=>{focusTaskCleanup?.();commentsCleanup?.();participants?.dispose();taskEditCleanup?.();childrenUi?.dispose();materialUi?.dispose();publicationUi?.dispose();if(publicationChanged)document.removeEventListener('locus:publication-source-changed',publicationChanged);vernut_adres();if(publicationDirty)obnovitEkran().catch(error=>tost('Не обновился список: '+error.message));},
      gotovo: async () => {
        if (!tekuschaja) throw new Error('карточка ещё грузится');
        if (tekuschaja.udaleno) { tost('Сначала восстанови задачу из корзины'); return false; }
        if (tekuschaja.povtorjaetsja) return (await povtory()).toggle(tekuschaja);
        if (tekuschaja.status === 'sdelano') throw new Error('уже сделана');
        const saved = await (await taskState()).completeCard(tekuschaja,{after:async()=>{document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena',{detail:{nomer}}));await otkrytZadachu(nomer,vybrannyjDen);}});
        if (!saved) return false;
        tost(`задача ${nomer} закрыта`);
        document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena',
          { detail: { nomer } }));
      } });
                                                                 
                                                                   
  const zakryt = zakryt_modalku;
  const mesto = document.getElementById('kz');
  try {
    await Promise.all([upominanija(),kommentariiUi(),uchastnikiUi(),taskEdits()]);
    const route = nomer + (vybrannyjDen ? '?den=' + vybrannyjDen : '');
    let z;
    try { z = await API.odna('zadachi', route); }
    catch (error) {
      if (error.kod !== 410) throw error;
      z = await API.odna('zadachi', Number(nomer) + '/korzina');
      if (z?.nomer !== Number(nomer) || !Number.isSafeInteger(z.versija) || z.versija < 1) throw error;
      if (!z.udaleno) z = await API.odna('zadachi', route);
    }
    if (!mesto.isConnected) return;
    tekuschaja = z;
    mesto.dataset.taskCardNumber=String(nomer);mesto.dataset.taskCardDirection=z.napravlenie;
    if(returnAddress){mesto.dataset.taskReturnAddress=returnAddress;const current=new URL(location.href);current.pathname=window.LocusTaskRoute.path(z.napravlenie,Number(nomer));current.searchParams.delete('nomer');current.searchParams.delete('napravlenie');history.replaceState(null,'',current.pathname+current.search+current.hash);}
    if (z.udaleno) {
      const repeat = await povtory(); if (!mesto.isConnected) return;
      repeat.mountTrash(z, mesto, async () => {
        document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena', { detail: { nomer } }));
        await otkrytZadachu(nomer, vybrannyjDen);
      });
      taskEditCleanup=window.LocusTaskEdit.mount(z,mesto,{after:async()=>{document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena',{detail:{nomer}}));await otkrytZadachu(nomer,vybrannyjDen);}});return;
    }
                                                               
                                                                 
                                                                
    const isSubtask=z.roditel_id!==null&&z.roditel_id!==undefined;
    const [uchastniki, kommentarii] = await Promise.all([
      API.zapros('GET',`/zadachi/${nomer}/uchastniki`).catch(error=>({oshibka:error.message})),
                                       
      API.spisok('kommentarii',{zadacha_id:z.id,na_stranice:50,sortirovka:'id_desc'}).catch(error=>({oshibka:error.message})),
    ]);
    const D = window.DANNYE || {};
    const chel = (D.ljudi || []).find((l) => l.id === z.otvetstvennyj);
    const tip = (TIPY_ZADACHI_FORMA.find((t) => t.kod === z.tip) || {}).imja || z.tip || '';
    const napr = naprPoKodu(z.napravlenie);
                                                                   
                                                
                                                              
                                                            
                                                             
                                   
    const IK = { 'направление': 'napravlenie', 'тип': 'tip',
                 'статус': 'status', 'спринт': 'sprint', 'срок': 'srok',
                 'дата': 'srok', 'ответственный': 'chel',
                 'участники': 'uchast', 'клиент': 'klient',
                 'проект': 'proekt', 'цель': 'cel',
                 'целевое число': 'chislo', 'рассылка': 'napravlenie',
                 'отложено почему': 'tip' };
    const str = (imja, znach) => (znach === null || znach === undefined || znach === ''
      ? '' : `<div class="kz-s">
              <span class="kz-p"><i class="kz-ik">${
                IKONKI_POLEJ[IK[imja] || imja] || ''}</i>${imja}</span>
              <span class="kz-z">${znach}</span></div>`);
                                                              
                                                                  
                                                                 
                                     
    const prav = (imja, kljuch, znach, vid) =>
      `<div class="kz-s">
        <span class="kz-p"><i class="kz-ik">${
          IKONKI_POLEJ[IK[imja] || imja] || ''}</i>${imja}</span>
        <span class="kz-z kz-pr" data-pole="${kljuch}" data-vid="${vid}"
          tabindex="0">${znach === null || znach === undefined || znach === ''
            ? '<i class="kz-pusto">добавить</i>' : znach}</span></div>`;
                                                                       
                                               
    document.title = `${z.nazvanie} – Locus`;
                                                                    
    const adres_kartochki = `${location.origin}/${z.napravlenie || 'zadachi'}/${z.nomer}`;
    const createdAt = SPR.vremja(z.sozdano);
    const createdDay = createdAt ? SPR.kalendar.den_moskvy(createdAt).split('-').reverse().join('.') : null;
    mesto.innerHTML =
      (z.roditel?`<a class="kn kz-parent" data-task-parent href="/${encodeURIComponent(z.roditel.napravlenie)}/${Number(z.roditel.nomer)}">${ekranirovat((naprPoKodu(z.roditel.napravlenie).imja||z.roditel.napravlenie)+', '+z.roditel.nazvanie+(z.roditel.udaleno?' (в корзине)':''))}</a>`:'') +
      `<div class="kz-address" data-task-canonical-url>${ekranirovat(z.url||location.origin+window.LocusTaskRoute.path(z.napravlenie,z.nomer))}</div><div class="kz-zag"><span class="kz-nazvanie" contenteditable="true" role="textbox" aria-label="название задачи">${ekranirovat(z.nazvanie)}</span><a class="kz-kop" data-kop-adres="${
        adres_kartochki}" title="скопировать ссылку"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></a></div>` +
      `<div class="kz-opis" contenteditable="true" role="textbox" aria-label="описание задачи" data-placeholder="добавить описание">${ekranirovat(z.opisanie || '')}</div>` +
      `<div class="task-focus" data-task-focus-host>${z.fokus?.sessij?'<p data-task-focus-summary>На задачу потрачено '+ekranirovat(z.fokus.podskazka)+' за всё время</p>':''}${z.mozhno_privjazat_fokus?'<a class="kn" data-task-focus-open href="/poleznoe.html?vkladka=fokus&amp;zadacha='+Number(z.nomer)+'" target="_blank" rel="noopener" title="Открыть таймер по этой задаче в новой вкладке">фокус по задаче</a>':''}</div>` +
      `<div class="kz-polja">` +
        str('направление', ekranirovat(napr.imja || z.napravlenie)) +
        str('тип', ekranirovat(tip)) +
        (z.povtorjaetsja ? str('статус', plashka(z.status, false)) : prav('статус', 'status', plashka(z.status, false)
          + (z.pohozhe_gotovo
            ? '<span class="kz-gotovo">похоже, готово</span>' : ''), 'spisok')) +
        (z.povtorjaetsja ? '' : prav('спринт', 'sprint', z.sprint
          ? `${z.sprint} / ${z.god_sprinta}` : null, 'nedelja')) +
        `<div class="kz-s"><span class="kz-p"><i class="kz-ik">${IKONKI_POLEJ.kljuch}</i>ключевая</span>
          <span class="kz-z"><span class="sozd-pub-tumbler kz-klj${z.kljuchevaja ? ' on' : ''}"
            role="switch" aria-checked="${z.kljuchevaja ? 'true' : 'false'}" tabindex="0">
            <span class="pere${z.kljuchevaja ? ' on' : ''}"><span class="pere-b"></span></span>
          </span></span></div>` +
        (z.povtorjaetsja ? '' : prav('срок', 'srok', z.srok ? SPR.data(z.srok) : '', 'data')) +
        str('дата', z.data ? SPR.data(z.data) : '') +
        prav('ответственный', 'otvetstvennyj', ekranirovat(chel ? chel.imja : ''), 'spisok') +
                                                                     
                                                                     
                                                                     
                                                                      
                                                               
                                                                      
                       
                                                               
                                                                  
                           
        str('клиент', z.klient_id
          ? `<a class="kz-klient-ss" href="/klient.html?id=${z.klient_id}">${
              ekranirovat(z.klient_imja || imja_klienta(z.klient_id) || 'клиент')}</a>`
          : ekranirovat(z.klient_imja || '')) +
        str('проект', ekranirovat(z.proekt_nazvanie || nazvanie_proekta(z.proekt_id))) +
        str('цель', ekranirovat(z.cel_nazvanie || (z.cel_id
          ? ((D.celi || []).find((c) => c.kod === String(z.cel_id)) || {}).imja : ''))) +
        (z.referalnaja_zadacha?'':str('целевое число', z.plan_chislo)) +
        (z.referalnaja_zadacha?str('период расчёта',ekranirovat(z.referalnaja_zadacha.period_s+' — '+z.referalnaja_zadacha.period_po))+(Object.hasOwn(z.referalnaja_zadacha,'summa')&&z.referalnaja_zadacha.summa!=null?str('сумма выплаты',ekranirovat(String(z.referalnaja_zadacha.summa)+' ₽')):''):'') +
                                                                     
                                                                
                                           
        (!z.referalnaja_zadacha && z.fakt !== undefined && z.fakt !== null && z.plan_chislo
          ? (z.fakt_nepolnyj?str('прогресс',`подтверждено ${z.fakt} из ${z.plan_chislo}; данные прежней волны неполные`):str('прогресс', `<span class="kz-prog">
              <span class="kz-prog-p"><i style="width:${
                Math.max(2, Math.min(100, Math.round((z.fakt / z.plan_chislo) * 100)))
              }%"></i></span>
              <span class="kz-prog-n">${z.fakt_tekuschaja_baza?'в базе сейчас: ':''}${z.fakt} из ${z.plan_chislo}</span>
              ${z.fakt_tekuschaja_baza?'':z.fakt_nedeli
                ? `<span class="kz-prog-ned">+${z.fakt_nedeli} за неделю</span>`
                : '<span class="kz-prog-ned stop">на этой неделе без движения</span>'}
            </span>`))
          : '') +
        str('отложено почему', ekranirovat(z.pochemu_otlozheno)) +
        str('рассылка', ssylka_na_rassylku(z)) +
      `</div>` +
        '<div class="kz-s kz-uchast-row" hidden><span class="kz-p"><i class="kz-ik">'+IKONKI_POLEJ.uchast+'</i>участники</span><span class="kz-z kz-uchastniki"></span></div>' +
      (z.publikacija?'<section id="kz-publication" aria-label="Публикация"><p class="kz-kom-net">сведения публикации загружаются</p></section>':'<div class="kz-s"><span class="kz-p">публикация</span><span class="kz-z"><button type="button" class="kn" data-task-publication-enable>сделать публикацией</button></span></div><section id="kz-publication" aria-label="Публикация" hidden></section>') +
      (isSubtask?'':`<div class="kz-sek">подзадачи<span class="n" id="kz-pz-schet"></span></div>
      <div id="kz-pz-list"><div class="kz-kom-net">подзадачи загружаются</div></div>
      <div class="kz-pz-vvod">
        <input id="kz-pz-pole" placeholder="что ещё нужно сделать внутри">
        <a class="kn" id="kz-pz-dat">Добавить</a>
      </div>
      <a class="kz-pz-vse" id="kz-pz-vse">подзадача со всеми полями</a>`) +
                                                                 
                                                     
      '<div class="kz-sek">материалы<span class="n" id="kz-materialy-count"></span></div><div id="kz-materialy"></div><button type="button" class="kn" id="kz-materialy-add">добавить материал</button>' +
      `<div class="kz-sek">комментарии<span class="n" id="kz-kom-schet">${kommentarii?.vsego||''}</span></div>` +
      '<div class="kz-kom" id="kz-kom"></div>' +
      `<div class="kz-kom-vvod">
        <textarea id="kz-kom-pole" rows="1" aria-label="комментарий" aria-describedby="kz-kom-dlina kz-kom-oshibka"
          placeholder="написать, @ позовёт человека"></textarea>
        <button type="button" class="kn tmn" id="kz-kom-dat" aria-label="отправить комментарий" disabled>Отправить</button>
      </div>` +
      '<div class="kz-kom-pod"><span id="kz-kom-oshibka" role="alert"></span><span id="kz-kom-dlina">0 / 5000</span></div>' +
      '<div id="kz-history"></div>' +
      (z.shablon_istochnik?`<div class="kz-kom-net" data-task-template-source>Шаблон: ${ekranirovat(z.shablon_istochnik.nazvanie)}</div>`:'')+
      (createdDay ? `<div class="kz-kom-net" data-task-created>Создана <time datetime="${createdAt.toISOString()}">${createdDay}</time></div>` : '');

                                                               
                                                                    
                                
    let versija = z.versija;
    const refresh = async () => {
      document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena', { detail: { nomer } }));
      await otkrytZadachu(nomer, vybrannyjDen);
    };
    const repeat = await povtory();
    if (!mesto.isConnected) return;
    repeat.mountCard(z, mesto, { after: refresh, duplicate:()=>taskCopy().then(module=>module.open(tekuschaja||z,{close:zakryt_modalku,active:()=>mesto.isConnected})).catch(error=>tost(error.message)), removed: async () => {
      zakryt_modalku();
      document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena', { detail: { nomer } }));
    } });
    const templateButton=document.createElement('button');templateButton.type='button';templateButton.className='kn';templateButton.dataset.taskSaveTemplate='1';templateButton.textContent='сохранить как шаблон';templateButton.onclick=()=>templatesUi().then(m=>m.fromTask(tekuschaja||z)).catch(error=>tost(error.message));mesto.querySelector('.pv-footer')?.append(templateButton);
    const contextButton=document.createElement('button');contextButton.type='button';contextButton.className='kn';contextButton.dataset.taskContextOpen='1';contextButton.textContent='параметры задачи';try{if(sessionStorage.getItem('locus-task-context-v1:'+API.ja+':pending:'+Number(nomer)))contextButton.textContent='проверить сохранение параметров';}catch{}contextButton.onclick=()=>taskContextUi().then(module=>module.open(nomer,{after:async current=>{const active=document.querySelector('[data-task-card-number="'+Number(nomer)+'"]');if(!active||active.closest('.vyb-fon')?.hidden)return;if(/^\/[^/]+\/\d+\/?$/.test(location.pathname)){const url=new URL(location.href);url.pathname='/'+encodeURIComponent(current.napravlenie)+'/'+Number(nomer);history.replaceState(null,'',url.pathname+url.search+url.hash);}await otkrytZadachu(nomer);}})).catch(error=>tost(error.message));mesto.querySelector('.pv-footer')?.append(contextButton);const reportButton=document.createElement('button');reportButton.type='button';reportButton.className='kn';reportButton.dataset.errorReportOpen='1';reportButton.textContent='сообщить об ошибке';reportButton.onclick=oknoSlomalos;mesto.querySelector('.pv-footer')?.append(reportButton);
    if(z.referalnaja_zadacha?.svjazannaja_vyplata&&Object.hasOwn(z.referalnaja_zadacha,'summa')){const unlink=document.createElement('button');unlink.type='button';unlink.className='kn';unlink.dataset.taskUnlinkPayout='1';unlink.textContent='снять связь с выплатой';unlink.onclick=()=>referralPayoutLinkUi().then(m=>m.open(nomer,{after:refresh})).catch(error=>tost(error.message));mesto.querySelector('.pv-footer')?.append(unlink);}
    let saving=false;
    const sohranit = async (kljuch, znachenie) => {
      if(saving)return;
      saving=true;
      const previousInert=mesto.inert, header=mesto.closest('.vyb-fon')?.querySelector('.vyb-g');
      const previousDisabled=header?.getAttribute('aria-disabled');
      const previousTab=header?.getAttribute('tabindex');
      mesto.inert=true; mesto.setAttribute('aria-busy','true');
      if(header){header.setAttribute('aria-disabled','true');header.tabIndex=-1;}
      const savingNote=document.createElement('div');savingNote.className='pv-command';savingNote.setAttribute('role','status');savingNote.textContent='Сохраняется изменение задачи';mesto.before(savingNote);
      try {
        const state=kljuch==='status' ? await taskState() : null;
        let o,expected=versija;
        for(;;){
          try{
            o=state ? await state.patch({...z,versija:expected},znachenie,{after:refresh})
              : await window.LocusTaskEdit.save(z,kljuch,znachenie,expected);
            break;
          }catch(error){
            if(error.kod!==409 || !error.telo?.tekuschee)throw error;
            const live=error.telo.tekuschee;
            const choice=await razreshitKonflikt(error,{label:polePoRusski(kljuch),local:znachenieSlovami(kljuch,znachenie),current:znachenieSlovami(kljuch,live[kljuch])});
            if(choice==='load'){if(error.taskEditCommand)window.LocusTaskEdit.clear(error.taskEditCommand);zakryt_modalku();await otkrytZadachu(nomer, vybrannyjDen);return;}
            if(choice!=='own'){if(error.taskEditCommand){taskEditCleanup?.();taskEditCleanup=window.LocusTaskEdit.mount(z,mesto,{after:refresh});}return;}
            if(error.taskEditCommand)window.LocusTaskEdit.clear(error.taskEditCommand);
            expected=live.versija;
          }
        }
        if(!o){zakryt_modalku();await otkrytZadachu(nomer, vybrannyjDen);return;}
        versija = o && o.versija !== undefined ? o.versija : versija;
        document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena', { detail: { nomer } }));
        if (!mesto.isConnected) return;
        zakryt_modalku();
        await otkrytZadachu(nomer, vybrannyjDen);
        if(state)state.effects(o,async()=>document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena',{detail:{nomer}})));
      } catch (err) {
        if(err.taskEditUnknown){taskEditCleanup?.();taskEditCleanup=window.LocusTaskEdit.mount(z,mesto,{after:refresh});}
        else tost('Не сохранилось: ' + err.message);
      } finally {
        saving=false;savingNote.remove();
        if(mesto.isConnected&&mesto.dataset.taskFieldPending!=='1'){mesto.inert=previousInert;mesto.removeAttribute('aria-busy');if(header){if(previousDisabled===null)header.removeAttribute('aria-disabled');else header.setAttribute('aria-disabled',previousDisabled);if(previousTab===null)header.removeAttribute('tabindex');else header.setAttribute('tabindex',previousTab);}}
      }
    };

    for (const [selector, field] of [['.kz-nazvanie','nazvanie'],['.kz-opis','opisanie']]) {
      const input = mesto.querySelector(selector);
      const initial = String(z[field] || '');
      input.addEventListener('blur', () => {
        const value = (field === 'opisanie' ? input.innerText : input.textContent).trim();
        if (field === 'nazvanie' && !estNazvanieZadachi(value)) { input.textContent = initial; tost('Пустое название не сохранено'); return; }
        if (value !== initial) sohranit(field, value);
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.stopPropagation(); event.preventDefault(); input.textContent = initial; input.blur();
        } else if (event.key === 'Enter' && (field === 'nazvanie' || event.ctrlKey || event.metaKey)) {
          event.preventDefault(); input.blur();
        }
      });
    }

    mesto.querySelector('.kz-klj')?.addEventListener('click', () =>
      sohranit('kljuchevaja', !z.kljuchevaja));
    mesto.addEventListener('click', (e) => {
      const pole = e.target.closest('.kz-pr');
      if (!pole || pole.classList.contains('pravim')) return;
      pole.classList.add('pravim');
      const kljuch = pole.dataset.pole;
      const vid = pole.dataset.vid;

      if (vid === 'spisok' || vid === 'nedelja') {
        const D = window.DANNYE || {};
        const baseWeek = vid === 'nedelja' && z.sprint
          ? {god:z.god_sprinta,nomer:z.sprint} : SPR.kalendar.iso_nedelja(SPR.segodnja());
        const punkty = vid === 'nedelja' ? Array.from({length:9},(_,i)=>{
          const w=SPR.kalendar.sdvinut_nedelju(baseWeek.god,baseWeek.nomer,i-4);
          return {kod:SPR.kalendar.kljuch_nedeli(w.god,w.nomer),
            imja:`спринт ${w.nomer} / ${w.god}, ${SPR.period(w.nachalo,w.konec)}`};
        }) : kljuch === 'status'
          ? (D.statusy || []).map((s) => ({ kod: s.kod, imja: s.imja }))
          : porjadok_ispolnitelej_punkty(D);
        const znach = vid === 'nedelja' ? SPR.kalendar.kljuch_nedeli(baseWeek.god,baseWeek.nomer)
          : kljuch === 'status' ? z.status
          : (z.otvetstvennyj == null ? null : String(z.otvetstvennyj));
        const obertka = document.createElement('span');
        obertka.className = 'vyp';
        obertka.innerHTML = '<a class="fil-b"><span class="str"></span></a>';
        pole.replaceChildren(obertka);
        const knopka = obertka.querySelector('.fil-b');
        vypadajuschij(knopka, punkty, znach).addEventListener('click', (ev) => {
          const pn = ev.target.closest('.vyp-p');
          if (!pn) return;
          sohranit(kljuch, pn.dataset.kod || null);
        });
                                                                        
                                                                    
                                                                     
        setTimeout(() => knopka.click(), 0);
        return;
      }

      const vvod = document.createElement('input');
      vvod.type = vid === 'data' ? 'date' : (vid === 'chislo' ? 'number' : 'text');
      vvod.className = 'kz-pr-vvod';
      vvod.value = vid === 'data' ? (z.srok || '')
        : (z[kljuch] === null || z[kljuch] === undefined ? '' : String(z[kljuch]));
      pole.replaceChildren(vvod);
      vvod.focus();
      const zavershit = (sohranjat) => {
        if (!sohranjat) {
          zakryt_modalku();
          otkrytZadachu(nomer, vybrannyjDen);
          return;
        }
        const v = vvod.value.trim();
        sohranit(kljuch, v === '' ? null : (vid === 'chislo' ? Number(v) : v));
      };
      vvod.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); zavershit(true); }
        if (ev.key === 'Escape') { ev.preventDefault(); zavershit(false); }
      });
      vvod.addEventListener('blur', () => zavershit(true), { once: true });
    });
    mesto.addEventListener('keydown', event => {
      if (event.target.matches('.kz-pr') && ['Enter',' '].includes(event.key)) {
        event.preventDefault(); event.target.click();
      }
    });

                                                                
                                                  
    let creatingChild=false;
    const childDefaults=async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{const data=await API.zapros('GET','/zadachi/'+nomer+'/zagotovka_podzadachi',undefined,{signal:controller.signal});const row=data?.zagotovka;
        if(!row||row.roditel_id!==z.id||data.roditel?.id!==z.id||data.roditel?.nomer!==Number(nomer)||typeof row.napravlenie!=='string'||!Number.isSafeInteger(row.otvetstvennyj))throw new Error('Не удалось подтвердить поля и родителя подзадачи');return row;
      }catch(error){if(controller.signal.aborted)throw new Error('Не удалось загрузить поля подзадачи. Повтори попытку.');throw error;}finally{clearTimeout(timer);}
    };
    const dobavit_podzadachu = async () => {
      if(creatingChild||isSubtask)return;
      const pole = document.getElementById('kz-pz-pole');
      const imja = (pole?.value || '').trim();
      if (!estNazvanieZadachi(imja)) { tost('Напиши название подзадачи'); return; }
      creatingChild=true;pole.disabled=true;const add=document.getElementById('kz-pz-dat');add?.setAttribute('aria-disabled','true');
      try {
        const zag = await childDefaults();
        if(!mesto.isConnected)return;
        const created = await API.sozdat('zadachi', {
          ...Object.fromEntries(Object.entries(zag)
            .filter(([k, v]) => v !== null && v !== undefined && k !== 'uchastniki')),
          nazvanie: imja,
        });
        pole.value = '';
        zakryt_modalku();
        await otkrytZadachu(nomer, vybrannyjDen);
        toastCreatedTask(created,{posle:async()=>{await otkrytZadachu(nomer, vybrannyjDen);}});
      } catch (err) { tost(err.taskCreationUnknown?'Создание подзадачи ещё не подтверждено. Проверь сохранение.':'Не добавилось: '+err.message); }
      finally{creatingChild=false;if(pole.isConnected)pole.disabled=false;if(add?.isConnected)add.removeAttribute('aria-disabled');}
    };
    document.getElementById('kz-pz-dat')?.addEventListener('click', dobavit_podzadachu);
                                                                
                                                                     
    document.getElementById('kz-pz-vse')?.addEventListener('click', async () => {
      if(creatingChild||isSubtask)return;creatingChild=true;const button=document.getElementById('kz-pz-vse');button.setAttribute('aria-disabled','true');
      try{const defaults=await childDefaults();if(!mesto.isConnected)return;
      if (window.O && O.formaZadachiModalka) {
        O.formaZadachiModalka(defaults);
        if(window.innerWidth>760)document.getElementById('sozd').locusChildClosed=()=>childrenUi?.refresh();
      }else throw new Error('Форма создания ещё не готова. Открой карточку ещё раз');
      }catch(error){tost(error.message);}finally{creatingChild=false;if(button.isConnected)button.removeAttribute('aria-disabled');}
    });
    mesto.querySelector('[data-task-parent]')?.addEventListener('click',event=>{event.preventDefault();otkrytZadachu(z.roditel.nomer,vybrannyjDen).catch(error=>tost(error.message));});
                                                                     
                                          
                                                    
    const jakor = location.hash.match(/^#p(\d+)$/);
    const jakor_k = location.hash.match(/^#k-?(\d+)$/);
    if (jakor_k) {
      const kom = mesto.querySelector(`[data-kom="${jakor_k[1]}"]`);
      if (kom) setTimeout(() => {
        kom.scrollIntoView({ block: 'center', behavior: 'smooth' });
        kom.style.transition = 'background .4s';
        kom.style.background = 'var(--pole)';
        setTimeout(() => { kom.style.background = ''; }, 2200);
      }, 150);
    }
                                                                    
                                                                   
    const kl_ss = mesto.querySelector('.kz-klient-ss');
    if (kl_ss && z.klient_id && /^клиент$/.test(kl_ss.textContent.trim())) {
      fetch(`/api/ljudi/${z.klient_id}`,
        { headers: { 'x-locus-chelovek': String(window.JA || 61) } })
        .then((r) => r.json()).then((o) => { if (o && o.imja) kl_ss.textContent = o.imja; })
        .catch(() => {});
    }
                                         
    mesto.querySelector('.kz-kop')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      kopirovat(ev.currentTarget.dataset.kopAdres, 'Ссылка скопирована');
    });
    document.getElementById('kz-pz-pole')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); dobavit_podzadachu(); }
    });

                                                                 
                                                                
    participants=window.LocusUchastniki.mount(mesto,{taskNumber:nomer,initial:uchastniki});
    commentsCleanup=window.LocusKommentarii.mount(mesto,{taskId:z.id,initial:kommentarii,onRefresh:()=>participants.refresh()});
    const connectTaskFocus=()=>focusTaskUi().then(module=>{if(mesto.isConnected)focusTaskCleanup=module.mountCard({root:mesto.querySelector('[data-task-focus-host]'),task:z});}).catch(()=>{const root=mesto.querySelector('[data-task-focus-host]');if(root?.isConnected&&!root.querySelector('[data-focus-module-retry]')){const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.dataset.focusModuleRetry='1';retry.textContent='повторить загрузку счётчика';retry.onclick=()=>{retry.remove();connectTaskFocus();};root.append(retry);}});connectTaskFocus();
    taskEditCleanup=window.LocusTaskEdit.mount(z,mesto,{after:refresh});
    mesto.querySelector('[data-task-publication-enable]')?.addEventListener('click',()=>taskPublication().then(module=>module.settings(z,{makePublication:true})).catch(error=>tost(error.message)));
    publicationChanged=event=>{if(event.detail?.id!==z.id)return;publicationDirty=true;if(!mesto.isConnected||publicationUi)return;taskPublication().then(module=>{const slot=mesto.querySelector('#kz-publication');if(!slot?.isConnected||publicationUi)return;slot.hidden=false;const enable=mesto.querySelector('[data-task-publication-enable]');if(enable)enable.closest('.kz-s').hidden=true;publicationUi=module.mount(z,slot);}).catch(error=>tost(error.message));};document.addEventListener('locus:publication-source-changed',publicationChanged);
    if(z.publikacija)taskPublication().then(module=>{const slot=mesto.querySelector('#kz-publication');if(slot?.isConnected)publicationUi=module.mount(z,slot);}).catch(error=>{const slot=mesto.querySelector('#kz-publication');if(slot)slot.textContent=error.message;});
    entityHistory(mesto.querySelector('#kz-history'),{obekt:'zadacha',id:z.id});
    materialsUi().then(module=>{if(mesto.isConnected)materialUi=module.mountTask(mesto,{task:z});}).catch(error=>{
      const slot=mesto.querySelector('#kz-materialy');if(slot)slot.textContent=error.message;
    });
    const mountChildren=async()=>{
      if(isSubtask||!mesto.isConnected)return;
      try{const module=await taskChildren();if(!mesto.isConnected)return;childrenUi?.dispose();childrenUi=module.mount(mesto,{task:z,day:vybrannyjDen||z.den_vybora});await childrenUi.refresh();
        if(jakor&&Number.isSafeInteger(Number(jakor[1]))){await childrenUi.reveal(Number(jakor[1]));const row=mesto.querySelector('.zs[data-nomer="'+Number(jakor[1])+'"]');if(row)setTimeout(()=>{if(!row.isConnected)return;row.scrollIntoView({block:'center',behavior:'smooth'});row.style.background='var(--pole)';setTimeout(()=>row.style.background='',2200);},150);}
      }catch{const slot=mesto.querySelector('#kz-pz-list');if(!slot?.isConnected)return;const note=document.createElement('p');note.className='kz-kom-net';note.dataset.taskChildrenStatus='1';note.setAttribute('role','status');note.textContent='Не удалось загрузить список подзадач';const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.dataset.taskChildrenRetry='1';retry.textContent='повторить загрузку';retry.onclick=()=>mountChildren();slot.replaceChildren(note,retry);}
    };
    await mountChildren();

  } catch (e) {
    mesto.innerHTML = `<div class="pusto-p">не открылась: ${e.message}</div>`;
  }
  return zakryt;
}

                                                                  
                                                                  
                                                        
                                                              
                                                 
function vkljuchitOtkrytieZadach(gde) {
  const korob = gde || document;
  if (korob.dataset && korob.dataset.otkrytie) return;
  if (korob.dataset) korob.dataset.otkrytie = '1';
  korob.addEventListener('click', (e) => {
                                                                    
                                                 
    if (e.target.closest('.gal-b, .pill.men, .vyp-sp')) return;
    const s = e.target.closest('.zs');
    if (!s) return;
    const nomer = Number(s.dataset.nomer);
    if (nomer) otkrytZadachu(nomer, s.dataset.pvDate || null);
  });
}

                                  
function vkljuchitNapravlenija(pererisovat, vybrano) {
                                                                 
                                                                   
                                                                
  if (vybrano !== undefined) {
    document.querySelectorAll('.npr-ch').forEach((x) =>
      x.classList.toggle('on', (x.dataset.napr || '') === String(vybrano || '')));
  }
  document.querySelectorAll('.npr-ch').forEach((ch) => {
    ch.addEventListener('click', () => {
      document.querySelectorAll('.npr-ch').forEach((x) => x.classList.remove('on'));
      ch.classList.add('on');
      pererisovat(ch.dataset.napr || null);
    });
  });
}

                    
function vypadajuschij(knopka, punkty, vybrano) {
                                                                   
                                                               
                                            
  if (!knopka) return document.createElement('div');
  if(knopka.locusVyp){knopka.locusVyp.update(punkty,vybrano);return knopka.locusVyp.list;}
                                                                   
                                                            
  const obertka = knopka.parentElement;
  obertka.classList.add('vyp');
  const spisok = document.createElement('div');
  spisok.className = 'vyp-sp';
  spisok.id='locus-list-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  spisok.setAttribute('role','listbox');
  spisok.setAttribute('aria-hidden','true');
  const accessibleLabel=knopka.getAttribute('aria-label')||obertka.querySelector('.sozd-lbl,.fch-l')?.textContent.trim()||knopka.title||knopka.textContent.trim()||'Варианты';
  spisok.setAttribute('aria-label',accessibleLabel);knopka.setAttribute('aria-label',accessibleLabel);
  knopka.setAttribute('role',knopka.tagName==='BUTTON'?'button':'combobox');knopka.tabIndex=0;
  knopka.setAttribute('aria-haspopup','listbox');knopka.setAttribute('aria-expanded','false');
  knopka.setAttribute('aria-controls',spisok.id);
  const isSelected=kod=>Array.isArray(vybrano)?(kod===''&&!vybrano.length)||vybrano.includes(kod):kod===vybrano;
  const narisovat = () => {spisok.setAttribute('aria-multiselectable',String(Array.isArray(vybrano))); spisok.innerHTML = (typeof punkty === 'function' ? punkty() : punkty).map((p) =>
    `<a class="vyp-p${isSelected(p.kod) ? ' on' : ''}" role="option" tabindex="-1" aria-selected="${isSelected(p.kod)}" data-kod="${ekranirovat(String(p.kod || ''))}"${
      p.korotko ? ` data-korotko="${ekranirovat(String(p.korotko))}"` : ''}>` +

    `${ekranirovat(p.imja)}${isSelected(p.kod) ? '<span class="gal">' +
      '<svg viewBox="0 0 12 12" fill="none"><path d="M2.4 6.3l2.5 2.5 4.7-5"' +
      ' stroke="currentColor" stroke-width="1.6" stroke-linecap="round"' +
      ' stroke-linejoin="round"/></svg></span>' : ''}</a>`).join(''); };
  narisovat();
  obertka.appendChild(spisok);

  let keyboardOpen=false;
  const zakryt = () => { keyboardOpen=false;obertka.classList.remove('otkryt'); knopka.classList.remove('otkryt');knopka.setAttribute('aria-expanded','false');spisok.setAttribute('aria-hidden','true');spisok.querySelectorAll('.vyp-p').forEach(p=>p.tabIndex=-1); };
  obertka.locusClose=zakryt;
  knopka.locusVyp={list:spisok,update:(items,value)=>{punkty=items;vybrano=value;narisovat();}};
                                                                 
                                 
  const otkryt = () => {
    if ((knopka.getAttribute('aria-disabled') === 'true'||knopka.matches(':disabled')||knopka.closest('[inert]'))) return;
    window.KALENDAR?.zakryt?.();
    window.LocusControls?.close();
    window.LocusSuggestions?.close();
    if (typeof punkty === 'function') narisovat();
    document.querySelectorAll('.vyp.otkryt').forEach((v) => {
      if (v === obertka) return;
      if(v.locusClose){v.locusClose();return;}
      v.classList.remove('otkryt');
      v.querySelector('.fil-b')?.classList.remove('otkryt');
    });
    obertka.classList.add('otkryt'); knopka.classList.add('otkryt');
    knopka.setAttribute('aria-expanded','true');
    spisok.setAttribute('aria-hidden','false');
  };
                                                                 
                                                                
                                                                
                                                                  
                                                         
  knopka.addEventListener('click', (e) => {
    e.stopPropagation();
    if ((knopka.getAttribute('aria-disabled') === 'true'||knopka.matches(':disabled')||knopka.closest('[inert]'))) return;
    keyboardOpen=false;
    otkryt();
    postavitSpisokMobile(obertka);
  });
                                                                  
  navedenie(obertka,()=>{if(!keyboardOpen)otkryt();},()=>{if(!keyboardOpen)zakryt();});
  const options=()=>[...spisok.querySelectorAll('.vyp-p')];
  function focusOption(index){const items=options();if(!items.length)return;const i=(index+items.length)%items.length;items.forEach((x,n)=>x.tabIndex=n===i?0:-1);items[i].focus();items[i].scrollIntoView({block:'nearest'});}
  knopka.addEventListener('keydown',event=>{
    if((knopka.getAttribute('aria-disabled')==='true'||knopka.matches(':disabled')||knopka.closest('[inert]')))return;
    if(!['ArrowDown','ArrowUp','Enter',' '].includes(event.key))return;
    event.preventDefault();event.stopPropagation();otkryt();postavitSpisokMobile(obertka);
    keyboardOpen=true;
    const selected=options().findIndex(x=>x.classList.contains('on'));
    focusOption(selected<0?(event.key==='ArrowUp'?options().length-1:0):selected);
  });
  spisok.addEventListener('keydown',event=>{
    if(event.target.closest('input,textarea,[contenteditable]'))return;
    const items=options(),index=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      if(event.key==='Enter'||event.key===' '){knopka.focus();items[index]?.click();}
      else focusOption(event.key==='Home'?0:event.key==='End'?items.length-1:index+(event.key==='ArrowDown'?1:-1));
    }
  });
  obertka.addEventListener('focusout',()=>queueMicrotask(()=>{if(!obertka.contains(document.activeElement))zakryt();}));
                                                                           
                                                                       
  spisok.addEventListener('mousedown',event=>{if(event.target.closest('.vyp-p'))event.preventDefault();});
                                                                 
                                                               
                                                               
  spisok.addEventListener('click', (e) => {
    const p = e.target.closest('.vyp-p');
    if (p && p.classList.contains('on')) {
                                                       
      p.dataset.snjat = '1';
      setTimeout(() => { delete p.dataset.snjat; }, 0);
    }
    zakryt();
  });
                                                                 
                                                                
                                                                   
                                                    
                                                                   
  if (!document.body.dataset.vyp_esc) {
    document.body.dataset.vyp_esc = '1';
    const reposition=()=>document.querySelectorAll('.vyp.otkryt').forEach(postavitSpisokMobile);
    window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);
    window.visualViewport?.addEventListener('resize',reposition);
    document.addEventListener('click',event=>{
      document.querySelectorAll('.vyp.otkryt').forEach(v=>{if(!v.contains(event.target))v.locusClose?.();});
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const active=[...document.querySelectorAll('.vyp.otkryt')];
      if(!active.length)return;
      e.preventDefault();e.stopImmediatePropagation();
      active.forEach((v) => {
        if(v.locusClose){v.locusClose();v.querySelector('[aria-haspopup=listbox]')?.focus();return;}
        v.classList.remove('otkryt');
        v.querySelector('.fil-b, .sozd-pole')?.classList.remove('otkryt');
      });
    },true);
  }
  return spisok;
}

                 
                                                       
                                                                    
function razmestitTost(t) {
  if(!t?.isConnected)return;
  const modal=document.querySelector('.vyb-fon:not([hidden])');
  t.classList.remove('tost-sverhu','tost-v-okne');t.style.removeProperty('top');t.style.removeProperty('bottom');
  if(t.parentElement!==document.body)document.body.append(t);
  if(!modal){const stack=document.getElementById('pending-command-notes')?.getBoundingClientRect();if(stack?.height)t.style.bottom=(innerHeight-stack.top+12)+'px';return;}
  const rect=modal.querySelector('.vyb-ob').getBoundingClientRect();
  const viewport=window.visualViewport,top=(viewport?.offsetTop||0)+12;
  const bottom=(viewport?.offsetTop||0)+(viewport?.height||innerHeight);
  const height=t.getBoundingClientRect().height;
  if(rect.top-top>=height+12){t.classList.add('tost-sverhu');t.style.top=top+'px';}
  else if(bottom-rect.bottom>=height+24){t.classList.add('tost-sverhu');t.style.top=(rect.bottom+12)+'px';}
  else {
                                                                                 
                                                                           
    t.classList.add('tost-v-okne');
    modal.querySelector('.vyb').insertBefore(t,modal.querySelector('.vyb-t'));
  }
}
window.addEventListener('resize',()=>razmestitTost(document.querySelector('.tost')));
window.visualViewport?.addEventListener('resize',()=>razmestitTost(document.querySelector('.tost')));
document.addEventListener('pointerdown',event=>{if(event.target.closest('[data-opl]')&&paymentDraft())event.preventDefault();},true);

function tost(tekst, otmena, options={}) {
  document.querySelector('.tost')?.remove();
  const t = document.createElement('div');
  t.className = 'tost';
  t.setAttribute('role','status');
  t.innerHTML = '<span></span>' + (otmena ? '<a role="button" tabindex="0">отменить</a>' : '');
  t.querySelector('span').textContent=String(tekst);
  if(otmena)t.querySelector('a').textContent=options.label||'отменить';
  document.body.appendChild(t);
  razmestitTost(t);
  let used=false;
  if (otmena) t.querySelector('a').addEventListener('click', async () => {
    if(used)return;used=true;t.remove();
    try{await otmena();}catch(error){tost('Отмена не применена: '+error.message);}
  });

  let tajmer = setTimeout(() => t.remove(), options.ms||6000);
  t.addEventListener('mouseenter', () => { clearTimeout(tajmer); tajmer = null; });
  t.addEventListener('mouseleave', () => { tajmer = setTimeout(() => t.remove(), 2000); });
}

                                                                   
                                                
  
                                                               
                                                                
                                                                
                                
  
                                                               
                                                                   
                                                           
function tostSoSchetom(tekst, sekund = 5) {
  document.querySelector('.tost')?.remove();
  const t = document.createElement('div');
  t.className = 'tost tost-schet';
  t.setAttribute('role','status');
  t.innerHTML = '<span></span><a class="tost-otm">отменить</a>' +
    `<span class="tost-ch" aria-hidden="true">${sekund}</span>`;
  t.querySelector('span').textContent=String(tekst);
  document.body.appendChild(t);
  razmestitTost(t);

  return new Promise((gotovo) => {
    let ostalos = sekund;
    const ch = t.querySelector('.tost-ch');
    let shag = null;

    const ubrat = () => { clearInterval(shag); t.remove(); };
    t.querySelector('.tost-otm').addEventListener('click', () => {
      ubrat(); gotovo(false);
    });
                                                                    
                                                 
    t.addEventListener('mouseenter', () => clearInterval(shag));
    t.addEventListener('mouseleave', () => { shag = zapustit(); });

    const zapustit = () => setInterval(() => {
      ostalos -= 1;
      if (ostalos > 0) { ch.textContent = ostalos; return; }
      ubrat(); gotovo(true);
    }, 1000);
    shag = zapustit();
  });
}

                                                          
                                                              
                                                          
                                                             
  
                                                               
                                                              
                                                
  
                                                                  
                                                                 
                                                               
                                                             
function vspyshka(tekst) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const st = document.createElement('div');
  st.className = 'vsp';
  st.innerHTML = `<span class="vsp-k"><svg viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="21" stroke="currentColor" stroke-width="2.6"
        class="vsp-krug"/>
      <path d="M15.5 24.6l6.2 6.2 10.8-11.4" stroke="currentColor"
        stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"
        class="vsp-gal"/></svg></span>
    <span class="vsp-t">${tekst}</span>`;
  document.body.appendChild(st);
  requestAnimationFrame(() => st.classList.add('on'));
  setTimeout(() => {
    st.classList.remove('on');
    setTimeout(() => st.remove(), 400);
  }, 1500);
}

                                                                
                                                              
                                                             
function plashkaKasanija(pl) {
  if (!pl || !pl.chelovek_id) return;
  document.querySelector('.plk')?.remove();
  const st = document.createElement('div');
  st.className = 'plk';
  st.innerHTML = `<div class="plk-v">Создать задачу
      «<span class="plk-im" contenteditable="true" spellcheck="false"
        title="нажми и перепиши название">${pl.nazvanie}</span>»?
      <span class="plk-srok">до ${SPR.data(pl.srok)}</span></div>
    <div class="plk-kn">
      <a class="kn tmn" data-plk="sozdat">создать</a>
      <a class="kn" data-plk="ne_nuzhno">не нужно</a></div>`;
  document.body.appendChild(st);
  requestAnimationFrame(() => st.classList.add('on'));
  const ubrat = () => { st.classList.remove('on'); setTimeout(() => st.remove(), 350); };
                                                                  
                                                              
                                                         
  const im = st.querySelector('.plk-im');
  im.addEventListener('focus', () => {
    if (im.dataset.pravili) return;
    im.dataset.pravili = '1';
    const r = document.createRange();
    r.selectNodeContents(im);
    const v = window.getSelection();
    v.removeAllRanges(); v.addRange(r);
  });
  im.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      st.querySelector('[data-plk="sozdat"]')?.click();
    }
  });
  st.querySelector('[data-plk="sozdat"]').addEventListener('click', async () => {
    const nazvanie = st.querySelector('.plk-im').textContent.trim() || pl.nazvanie;
    try {
      await API.dejstvie(`/ljudi/${pl.chelovek_id}/kasanija`,
        { srok: pl.srok, nazvanie });
      tost(`Задача «${nazvanie}» создана`);
    } catch (e) { tost('Не получилось: ' + e.message); }
    ubrat();
  });
  st.querySelector('[data-plk="ne_nuzhno"]').addEventListener('click', async () => {
                                                            
    try { await API.dejstvie('/plashki/skryt', { o_kom_id: pl.chelovek_id }); }
    catch {                                       }
    ubrat();
  });
}

async function zakrytZadachu(...args) {
  try { return await (await taskState()).close(...args); }
  catch(error) { tost(error.message); }
}

                                                             
                                                      
function ugasitStroku(stroka) {
  if (!stroka) return Promise.resolve();
  return new Promise((gotovo) => {
    stroka.classList.add('zs-uhodit');
    const konec = () => gotovo();
    stroka.addEventListener('transitionend', konec, { once: true });
                                                           
                                                  
    setTimeout(konec, 460);
  });
}

                                                   
  
                                                                       
                                                                    
                                                                  
                                                                  
                                                                  
                                                    
function proveritZagruzkuFajla(f){
  if(!f.size)return 'Файл пустой, 0 байт. Проверьте выбранный файл.';
  if(f.size>52428800)return 'Файл больше 50 МБ. Сожмите файл или приложите ссылкой.';
  if(/\.(exe|app|sh|bat|cmd)$/i.test(f.name||'')||/^(application\/(x-msdownload|x-msdos-program|x-executable|x-sh|x-shellscript|x-bat|x-ms-installer)|text\/x-(shellscript|script\.(sh|bat)))$/i.test(f.type||''))return 'исполняемые файлы не принимаются';
  return null;
}
async function zagruzitFajl(f,{signal,onProgress=()=>{}}={}) {
  const invalid=proveritZagruzkuFajla(f);if(invalid)throw new Error(invalid);
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest(),abort=()=>xhr.abort(),finish=(callback,value)=>{signal?.removeEventListener('abort',abort);callback(value);};
    if(signal?.aborted)return reject(new Error('Загрузка отменена. Задача не создана.'));
    xhr.open('POST','/api/fajly');xhr.timeout=180000;
    for(const [header,value]of Object.entries({'content-type':'application/octet-stream','x-locus-chelovek':String(API.ja),'x-locus-page-user':String(API.ja),'x-imja-fajla':encodeURIComponent(f.name||'файл'),'x-tip-fajla':f.type||'application/octet-stream'}))xhr.setRequestHeader(header,value);
    xhr.upload.onprogress=e=>onProgress(e.lengthComputable?Math.min(99,Math.round(e.loaded/e.total*100)):null);
    xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{return finish(reject,new Error('Не удалось подтвердить загрузку файла. Поля сохранены, можно повторить добавление.'));}
      if(xhr.status>=200&&xhr.status<300){onProgress(100);finish(resolve,data.telo||data);}else finish(reject,new Error(data.oshibka||data.soobshchenie||'Файл не загрузился'));};
    xhr.onerror=xhr.ontimeout=()=>finish(reject,new Error('Не удалось подтвердить загрузку файла. Поля сохранены, можно повторить добавление.'));
    xhr.onabort=()=>finish(reject,new Error('Загрузка отменена. Задача не создана.'));
    signal?.addEventListener('abort',abort,{once:true});xhr.send(f);
  });
}

async function kopirovat(tekst, udalos = 'Скопировано') {
  try {
    if (!navigator.clipboard) throw new Error('буфер недоступен');
    await navigator.clipboard.writeText(tekst);
    tost(udalos);
    return 'ok';
  } catch (e) {
    modalka('Скопируй вручную', `
      <div class="kop-r">Браузер не дал записать в буфер</div>
      <textarea class="kop-p" rows="3" readonly>${ekranirovat(tekst)}</textarea>`,
    () => {
      const p = document.querySelector('.kop-p');
      if (p) { p.focus(); p.select(); }
    });
    return 'ruchnoj';
  }
}

// Шапка экрана без названия раздела: оно уже в меню сверху.
                                                   
function shapka({ obekt = '', dopolnenie = '', sprava = '' } = {}) {
  return `<div class="sh">
    <div class="sh-t">
      ${obekt ? `<span class="sh-o">${obekt}</span>` : ''}
      ${dopolnenie ? `<span class="sh-d">${dopolnenie}</span>` : ''}
    </div>
    ${sprava ? `<span style="margin-left:auto">${sprava}</span>` : ''}
  </div>`;
}

                        
  
                                                            
                                                      
  
                                                              
                                                               
          
function palitra() {
  if (document.querySelector('.plt-fon')) return;
  const fon = document.createElement('div');
  fon.className = 'plt-fon';
  fon.innerHTML = `<div class="plt-ok">
    <input class="plt-p" placeholder="найти задачу, человека, проект" autofocus>
    <div class="plt-r"></div>
  </div>`;
  document.body.appendChild(fon);

  const pole = fon.querySelector('.plt-p');
  const spisok = fon.querySelector('.plt-r');
  let vybran = 0, najdeno = [];

  const zakryt = () => { fon.remove(); document.removeEventListener('keydown', upravlenie); };

                                                       
                                 

  const VIDY = { chelovek: 'человек', zadacha: 'задача',
                 proekt: 'проект', cel: 'цель', razdel: 'раздел',
                 sozdat: 'новая' };

  function narisovat() {
    spisok.innerHTML = najdeno.length
      ? najdeno.map((n, i) =>
          `<a class="plt-s${i === vybran ? ' on' : ''}" data-i="${i}">
            <span class="plt-im">${n.imja}</span>
            <span class="plt-v">${VIDY[n.chto] || n.chto}</span>
          </a>`).join('')
      : '<div class="plt-net">ничего не нашлось</div>';
    spisok.querySelectorAll('[data-i]').forEach((e) =>
      e.addEventListener('click', () => perejti(najdeno[+e.dataset.i])));
  }

  function perejti(n) {
    if (!n) return;
    zakryt();
    if (n.chto === 'sozdat' && n.razobrano) {
      const rz = n.razobrano;
      if (window.O && O.formaZadachiModalka) {
        O.formaZadachiModalka({
          nazvanie: rz.nazvanie,
          ...(rz.srok ? { srok: rz.srok } : {}),
          ...(rz.otvetstvennyj ? { otvetstvennyj: rz.otvetstvennyj } : {}),
          ...(rz.napravlenie ? { napravlenie: rz.napravlenie } : {}),
        });
      }
      return;
    }
    location.href = n.adres;
  }

  function pokazat_razdely() {
    najdeno = RAZDELY.map(([imja, adres]) => ({ chto: 'razdel', imja, adres }));
    vybran = 0;
    narisovat();
  }
  pokazat_razdely();

  let tajmer;
  pole.addEventListener('input', () => {
    clearTimeout(tajmer);
    const chto = pole.value.trim();
    if (chto.length < 2) { pokazat_razdely(); return; }
                                                              
                             
    tajmer = setTimeout(async () => {
      try {
        const o = await API.ekran('poisk', { chto });
        const razdely = RAZDELY
          .filter(([imja]) => imja.toLowerCase().includes(chto.toLowerCase()))
          .map(([imja, adres]) => ({ chto: 'razdel', imja, adres }));
        najdeno = [...razdely, ...(o.najdeno || [])];
                                                                     
                                                                
                                                      
        if (chto.length > 3) {
          try {
            const r = await API.spisok('zagotovka_zadachi', { stroka: chto });
            const rz = r && r.razobrano;
            if (rz && rz.nazvanie) {
              const podpis = [rz.nazvanie,
                rz.srok ? SPR.data(rz.srok) : null,
                rz.otvetstvennyj_imja || null,
                rz.napravlenie ? naprPoKodu(rz.napravlenie).imja : null]
                .filter(Boolean).join(', ');
              najdeno.push({ chto: 'sozdat', imja: `создать задачу: ${podpis}`,
                             razobrano: rz });
            }
          } catch {                                     }
        }
        vybran = 0;
        narisovat();
      } catch {                                                        }
    }, 220);
  });

  function upravlenie(e) {
    if (e.key === 'Escape') { zakryt(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      vybran = Math.min(vybran + 1, najdeno.length - 1); narisovat();
      spisok.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      vybran = Math.max(vybran - 1, 0); narisovat();
      spisok.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { e.preventDefault(); perejti(najdeno[vybran]); }
  }
  document.addEventListener('keydown', upravlenie);
  fon.addEventListener('click', (e) => { if (e.target === fon) zakryt(); });
  setTimeout(() => pole.focus(), 20);
}

                                                         
                                                              
function vkljuchitEsche() {
                                                                 
                                                        
  document.querySelectorAll('[data-napr-esche]').forEach((k) => {
    k.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rjad = k.closest('.npr-chipy, .men-r3');
      if (!rjad) return;
                                                                    
                                                                
                          
        
                                                                  
                                                             
                                                                   
                                                                 
                                                          
      if (window.innerWidth > 760) {
        const skryty = rjad.classList.toggle('vse-napravlenija');
        k.classList.toggle('otkryt', skryty);
        return;
      }
      spisok_rjada(k, rjad);
    });
  });

                                                               
                                                     
  function spisok_rjada(knopka, rjad) {
    let vyp = rjad.__vyp;
    if (vyp && vyp.classList.contains('vidno')) {
      vyp.classList.remove('vidno');
      knopka.classList.remove('otkryt');
      return;
    }
    if (!vyp) {
      vyp = document.createElement('nav');
      vyp.className = 'rjad-vyp';
      document.body.appendChild(vyp);
      rjad.__vyp = vyp;
                               
      document.addEventListener('click', (ev) => {
        if (!vyp.classList.contains('vidno')) return;
        if (ev.target.closest('.rjad-vyp, [data-napr-esche]')) return;
        vyp.classList.remove('vidno');
        knopka.classList.remove('otkryt');
      });
    }
                                                    
    const skrytye = [...rjad.querySelectorAll('.npr-skryt')];
    if (!skrytye.length) return;
    vyp.innerHTML = '';
    for (const p of skrytye) {
      const a = document.createElement('a');
      a.textContent = p.textContent.trim();
      a.className = p.classList.contains('on') ? 'on' : '';
      a.addEventListener('click', () => {
        vyp.classList.remove('vidno');
        knopka.classList.remove('otkryt');
        p.click();
      });
      vyp.appendChild(a);
    }
    vyp.classList.add('vidno');
    knopka.classList.add('otkryt');
                                              
    const b = knopka.getBoundingClientRect();
    const levo = Math.round(b.left + b.width / 2 - vyp.offsetWidth / 2);
    const predel = window.innerWidth - vyp.offsetWidth - 12;
    vyp.style.left = `${Math.max(12, Math.min(levo, predel))}px`;
    vyp.style.top = `${Math.round(b.bottom + 6)}px`;
  }

                                                               
  const plus_v_shapke = document.getElementById('plav-verh');
  if (plus_v_shapke && !plus_v_shapke.dataset.gotov) {
    plus_v_shapke.dataset.gotov = '1';
    plus_v_shapke.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector('.plav')?.click()
        || document.getElementById('sozd')?.classList.add('on');
    });
  }

  privjazatNizEsche();
}

                                                                  
                                                                       
                                                                    
                                                                      
let niz_esche_slushateli = null;
function privjazatNizEsche() {
  niz_esche_slushateli?.abort();
  niz_esche_slushateli = new AbortController();
  const slushatel = { signal: niz_esche_slushateli.signal };
  document.querySelector('.niz-vyp')?.remove();
  const knopka_esche = document.querySelector('[data-esche]');
  if (knopka_esche) {
    const v_piljule = [...document.querySelectorAll('.niz a[href]')]
      .map(a => a.getAttribute('aria-label'));
    const ostalnye = VSE_RAZDELY.filter(([r]) => !v_piljule.includes(r));
    const vyp = document.createElement('nav');
    vyp.className = 'niz-vyp';
    vyp.id = 'niz-vyp';
    vyp.inert = true;
    vyp.setAttribute('aria-label', 'Остальные разделы');
                                                                     
                                                            
                                                       
    vyp.innerHTML = ostalnye.map(([imja, put]) =>
      `<a href="${put}" class="${put === '/uvedomlenija.html' ? 'niz-kolokol' : ''}"
         aria-label="${imja}" title="${imja}">${znachok(imja)}</a>`).join('');
    document.body.appendChild(vyp);
    znakiUvedomlenij();

    const postavit = () => {
                                                                       
      const b = knopka_esche.getBoundingClientRect();
      vyp.style.maxHeight = `${Math.max(44, Math.floor(b.top - 20))}px`;
                                                             
                                
      const levo = Math.round(b.left + b.width / 2 - vyp.offsetWidth / 2);
      const predel = window.innerWidth - vyp.offsetWidth - 12;
      vyp.style.left = `${Math.max(12, Math.min(levo, predel))}px`;
      vyp.style.top = `${Math.round(b.top - vyp.offsetHeight - 8)}px`;
    };
    const zakryt = () => {
      vyp.classList.remove('vidno');
      vyp.inert = true;
      knopka_esche.classList.remove('otkryt');
      knopka_esche.setAttribute('aria-expanded', 'false');
    };
    knopka_esche.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (vyp.classList.contains('vidno')) { zakryt(); return; }
      vyp.classList.add('vidno');
      vyp.inert = false;
      knopka_esche.classList.add('otkryt');
      knopka_esche.setAttribute('aria-expanded', 'true');
      postavit();
    }, slushatel);
    knopka_esche.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); knopka_esche.click();
      }
    }, slushatel);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && vyp.classList.contains('vidno')) {
        e.preventDefault(); zakryt(); knopka_esche.focus({ preventScroll: true });
      }
    }, slushatel);
                                                  
    document.addEventListener('click', (e) => {
      if (!vyp.classList.contains('vidno')) return;
      if (e.target.closest('.niz-vyp, [data-esche]')) return;
      zakryt();
    }, slushatel);
    window.addEventListener('resize', () => {
      if (vyp.classList.contains('vidno')) postavit();
    }, slushatel);
  }
}

                                                              
                                           
  
                                                                 
                                                                   
                                                                  
const PRYZHKI = {
  m: ['Моё', '/prostranstvo.html'],
  z: ['Задачи', '/zadachi.html'],
  o: ['ОКР', '/okr.html'],
  l: ['Люди', '/ljudi.html'],
  p: ['Планёрка', '/planerka.html'],
  n: ['Направления', '/napravlenija.html'],
  v: ['Полезное', '/poleznoe.html'],
  k: ['Про меня', '/kabinet.html'],
};

function vkljuchitKlavishi() {
  let zhdjom_bukvu = null;

  document.addEventListener('keydown', (e) => {
    const v_pole = /^(input|textarea|select)$/i.test(e.target.tagName)
      || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); palitra(); return;
    }
                                                                     
                                                               
    if (v_pole || e.metaKey || e.ctrlKey || e.altKey) return;

                                                               
    if (e.key === '/') { e.preventDefault(); palitra(); return; }

    const bukva = (e.key || '').toLowerCase();

                                    
    if (zhdjom_bukvu) {
      clearTimeout(zhdjom_bukvu);
      zhdjom_bukvu = null;
      const kuda = PRYZHKI[bukva];
      if (kuda) { e.preventDefault(); location.href = kuda[1]; return; }
                                                                
      tost('G и буква: ' + Object.entries(PRYZHKI)
        .map(([b, [imja]]) => b.toUpperCase() + ' ' + imja).join(', '));
      return;
    }

    if (bukva === 'g') {
      e.preventDefault();
      zhdjom_bukvu = setTimeout(() => { zhdjom_bukvu = null; }, 1500);
    }
  });
}

                                                                 
                                                                
                                              
                                                                   
                                                                   
                                                                    
                                                              
                                                            
  
                                                                 
                                                            
                                                            
                                                          
                  
                                                     
                                                             

function semantikaOkna(root,dialog,title=null){
  if(title)title.id='locus-dialog-'+(Date.now())+'-'+Math.random().toString(36).slice(2);
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  if(title)dialog.setAttribute('aria-labelledby',title.id);else dialog.setAttribute('aria-label','Новая задача');
  dialog.tabIndex=-1;
  if(root.locusDialogTrap)return;root.locusDialogTrap=true;

  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!e.defaultPrevented&&root.locusClose){e.preventDefault();e.stopPropagation();root.locusClose();return;}
    const action=e.target.closest('.vyb-kn [role=button],.sozd-kn [role=button]');
    if(action&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();action.click();return;}
    if(e.key!=='Tab')return;
    const items=[...root.querySelectorAll('button,a[href],[tabindex],input,textarea,select')]
      .filter(x=>x!==dialog&&!x.matches(':disabled')&&x.tabIndex>=0&&!x.closest('[inert],[aria-hidden=true]')&&x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden');
    if(!items.length){e.preventDefault();dialog.focus();return;}
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog)){e.preventDefault();first.focus();}
  });

}

function modalka(zagolovok, vnutri, posle, dejstvija) {
  const childForm=document.querySelector('.sozd.on.sozd-podzadacha:not([hidden])');
  const backgroundParent=childForm?document.querySelector('.vyb-fon:not([hidden])'):null;
  const previous = childForm||document.querySelector('.vyb-fon:not([hidden])');
  const notice=document.querySelector('.tost');
  if(notice && previous?.contains(notice))document.body.append(notice);
  const stacked = Boolean(previous && (dejstvija?.poverh||childForm));
  const opener=stacked ? document.activeElement : (previous?.locusOpener||document.activeElement);
  if (stacked) { previous.inert=true;previous.hidden=true; }
  else if (previous?.locusZakryt) previous.locusZakryt(); else previous?.remove();
  if(backgroundParent)backgroundParent.hidden=true;
  const fon = document.createElement('div');
  fon.className = 'vyb-fon';
  fon.locusOpener=opener;
                                                              
                                                       
  if (dejstvija && dejstvija.polnyj) fon.classList.add('polnyj');
                                                           
                                                           
                                                          
  fon.innerHTML = `<div class="vyb-ob">
    <div class="vyb">
      <div class="vyb-sh"><span class="vyb-z">${ekranirovat(zagolovok)}</span></div>
      ${dejstvija && dejstvija.pojasnenie
        ? `<div class="vyb-pojasnenie">${dejstvija.pojasnenie}</div>` : ''}
      <div class="vyb-t">${vnutri}</div>
    </div>
    <div class="vyb-kn">
      <a class="vyb-x" role="button" tabindex="0" aria-label="закрыть" title="закрыть">✕</a>
      ${dejstvija && dejstvija.gotovo
        ? `<a class="vyb-g" role="button" tabindex="0" aria-label="${(dejstvija.podskazka || 'сделано')}"
             title="${(dejstvija.podskazka || 'сделано')}">${
             dejstvija.znak || '✓'}</a>` : ''}
    </div>
  </div>`;
  document.body.appendChild(fon);
  razmestitTost(document.querySelector('.tost'));
  const dialog=fon.querySelector('.vyb'),title=fon.querySelector('.vyb-z');
  semantikaOkna(fon,dialog,title);

  let closed = false;
  const zakryt = () => {
    if (closed) return;
    closed = true;
    const notice=fon.querySelector('.tost');
    if(notice)document.body.append(notice);
    fon.remove();
    if (stacked && previous.isConnected) { previous.inert=false;previous.hidden=false; }
    if(backgroundParent?.isConnected)backgroundParent.hidden=false;
    razmestitTost(document.querySelector('.tost'));
    document.removeEventListener('keydown', po_esc);
    dejstvija?.priZakrytii?.();
    if(opener?.isConnected)opener.focus?.({preventScroll:true});
  };
  fon.locusZakryt = zakryt;
  fon.locusClose=zakryt;
  function po_esc(e) { if (e.key === 'Escape' && !fon.inert) zakryt(); }
  document.addEventListener('keydown', po_esc);
  fon.addEventListener('click', (e) => { if (e.target === fon) zakryt(); });
  fon.querySelector('.vyb-x').addEventListener('click', zakryt);

  const gal = fon.querySelector('.vyb-g');
  if (gal && dejstvija && dejstvija.gotovo) {
    gal.addEventListener('click', async () => {
      if(gal.classList.contains('idet')||gal.getAttribute('aria-disabled')==='true')return;
      gal.classList.add('idet');
      const content=fon.querySelector('.vyb-t');content.inert=true;
      try {
        const result=await dejstvija.gotovo();
        if(result===false){content.inert=false;gal.classList.remove('idet');return;}
        gal.classList.add('sdelano'); zakryt();
      }
      catch (e) { content.inert=false;gal.classList.remove('idet'); tost(e.message || 'не вышло'); }
    });
  }

                                                                 
                                                            
                                                       
                                                      
  const vnutrennie = fon.querySelectorAll(
    '.vyb-t .fch-niz .kn:not(.ostavit-vnutri), '
    + '.vyb-t .mod-niz .kn:not(.ostavit-vnutri)');
  if (vnutrennie.length === 1 && !(dejstvija && dejstvija.gotovo)) {
    const kn = vnutrennie[0];
    kn.style.display = 'none';
    const podpis = kn.textContent.trim().toLowerCase() || 'сделано';
    const krug = document.createElement('a');
    krug.className = 'vyb-g';
    krug.title = podpis;
    krug.setAttribute('aria-label', podpis);
    krug.setAttribute('role','button');krug.tabIndex=0;
    krug.textContent = /доб|завес|создат|заплан/i.test(podpis) ? '+' : '✓';
    fon.querySelector('.vyb-kn')?.appendChild(krug);
    krug.addEventListener('click', () => kn.click());
  }

  if (posle) posle(zakryt);
  queueMicrotask(()=>{if(fon.isConnected&&!fon.contains(document.activeElement))dialog.focus({preventScroll:true});});
  return zakryt;
}

                                                             
                                                             
function ponumerovat(koren = document) {
  const stroki = koren.querySelectorAll(
    '.zs,.cel,.rez,.pr-k,.sv-e,.npr-zag,.itg .p');
  stroki.forEach((e, i) => { e.style.setProperty('--n', Math.min(i, 16)); });
}

                                                              
                                                               
                                         
                                                           
                                                                  
let taskAddressOpened = false;
function otkryt_zadachu_iz_adresa() {
  if (taskAddressOpened) return;
  const n = Number(window.LocusTaskRoute.query(location.href).get('nomer'));
  if (Number.isInteger(n) && n > 0) {
    taskAddressOpened = true;
    setTimeout(() => otkrytZadachu(n), 120);
  }
}


                                                                      
                                                                       
                                                                 
                                                               
                                                                
                                                
                                                         
                                                                
                                                                 
function vkljuchitKnopkuFiltrov() {
                                                               
                                                                      
                                                            
                                                       
  const pometit = () => {
    for (const r of document.querySelectorAll('.fil-r')) {
      r.classList.remove('pod-knopkoj', 'raskryt');
    }
    document.querySelectorAll('[data-fil-kn]').forEach((k) => k.remove());
    document.querySelector('.fil-fon')?.remove();
  };
  pometit();
  new MutationObserver(pometit).observe(document.body, {childList:true, subtree:true});
  addEventListener('resize', pometit);
  if (document.body.dataset.fil_kn) return;
  document.body.dataset.fil_kn = '1';
  document.addEventListener('click', (e) => {
    const kn = e.target.closest('[data-fil-kn]');
    if (kn) {
      const rjad = document.querySelector(
        `.fil-r[data-filtry="${kn.dataset.filKn}"]`) || document.querySelector('.fil-r');
      if (rjad) {
        const otkryt = rjad.classList.toggle('raskryt');
        rjad.classList.toggle('pod-knopkoj', !otkryt);
        kn.classList.toggle('on', otkryt);
                                                                
                                                          
        document.querySelector('.fil-fon')?.remove();
        if (otkryt) {
          const fon = document.createElement('div');
          fon.className = 'fil-fon';
          document.body.appendChild(fon);
        }
        zamerit_niz();
      }
      return;
    }
                                              
    const vnutri = e.target.closest('.fil-r');
    if (!vnutri) {
      document.querySelectorAll('.fil-r.raskryt').forEach((r) => {
        r.classList.remove('raskryt');
      });
      document.querySelectorAll('[data-fil-kn].on').forEach((k) => {
        k.classList.remove('on');
      });
      document.querySelector('.fil-fon')?.remove();
    }
  });
}

                                                          
                                                           
                                                              
                                                              
                                                          
                                                                
                                                           
                                                                
                                                               
                                                                
                                                             
                           
function vkljuchitPeretaskivanie(rjad, razdel = 'filtrov') {
  if (!rjad || rjad.dataset.peretaskivanie) return;
  rjad.dataset.peretaskivanie = '1';

  let vzjat = null, tajmer = null, nachalo_x = 0, posle_perenosa = false;

  const kljuchi = () => [...rjad.querySelectorAll('[data-chip]')]
    .map((e) => e.dataset.chip);

  const sohranit = () => {
    try {
      localStorage.setItem(`locus-porjadok-${razdel}`, JSON.stringify(kljuchi()));
    } catch {                                                     }
  };

  const otpustit = () => {
    clearTimeout(tajmer); tajmer = null;
    if (!vzjat) return;
    vzjat.classList.remove('taschim');
    vzjat = null;
    sohranit();
    document.body.style.userSelect = '';
  };

  const vzjat_chip = (el) => {
    vzjat = el;
    posle_perenosa = true;
    el.classList.add('taschim');
    document.body.style.userSelect = 'none';
    if (navigator.vibrate) navigator.vibrate(12);
  };

  const dvizhenie = (x) => {
    if (!vzjat) return;
                                                
    for (const el of rjad.querySelectorAll('[data-chip]')) {
      if (el === vzjat) continue;
      const b = el.getBoundingClientRect();
      const seredina = b.left + b.width / 2;
      if (x > seredina && el.compareDocumentPosition(vzjat)
          & Node.DOCUMENT_POSITION_PRECEDING) {
        el.after(vzjat); return;
      }
      if (x < seredina && el.compareDocumentPosition(vzjat)
          & Node.DOCUMENT_POSITION_FOLLOWING) {
        el.before(vzjat); return;
      }
    }
  };

  rjad.addEventListener('pointerdown', (e) => {
    posle_perenosa = false;
    const el = e.target.closest('[data-chip]');
    if (!el) return;
    nachalo_x = e.clientX;
                                                                
                                                                  
    tajmer = setTimeout(() => vzjat_chip(el), 450);
  });
  rjad.addEventListener('pointermove', (e) => {
    if (!vzjat) {
                                                                   
      if (tajmer && Math.abs(e.clientX - nachalo_x) > 8) {
        clearTimeout(tajmer); tajmer = null;
      }
      return;
    }
    e.preventDefault();
    dvizhenie(e.clientX);
  });
  for (const s of ['pointerup', 'pointercancel', 'pointerleave']) {
    rjad.addEventListener(s, otpustit);
  }
                                                                         
                                                                  
  rjad.addEventListener('touchmove', e => { if (vzjat) e.preventDefault(); }, { passive: false });
  rjad.addEventListener('contextmenu', e => { if (vzjat) e.preventDefault(); });
  rjad.addEventListener('click', e => {
    if (!posle_perenosa) return;
    posle_perenosa = false; e.preventDefault(); e.stopImmediatePropagation();
  }, true);
}

                                                                
                                                                 
function porjadokChipov(razdel, po_umolchaniju, est_chip) {
  try {
    const svoj = JSON.parse(localStorage.getItem(`locus-porjadok-${razdel}`) || 'null');
    if (Array.isArray(svoj) && svoj.length) {
      return svoj.filter((k) => est_chip(k))
        .concat(po_umolchaniju.filter((k) => !svoj.includes(k)));
    }
  } catch {                                             }
  return po_umolchaniju;
}

function zamerit_niz() {
  const niz = document.querySelector('.men-niz');
  const pil = document.querySelector('.niz');
  let v = 0;
  if (pil) v += pil.getBoundingClientRect().height + 16;
  if (niz) v += niz.getBoundingClientRect().height;
                                                                  
                                                      
  v = Math.round(v) + 8;
  document.documentElement.style.setProperty('--niz-vysota', `${v || 136}px`);
                                                                    
                                                    
  const fil = document.querySelector('.fil-r');
  const vsego = v + (fil ? Math.round(fil.getBoundingClientRect().height) + 10 : 0);
  document.documentElement.style.setProperty('--zapas-niza', `${vsego}px`);
  zamerit_menju();
}

                                                                
                                                            
                                                            
                                                               
function zamerit_menju() {
  const pil = document.querySelector('.men-r2-obj .npr-chipy, .men-r2-obj .men-r2');
  if (!pil) return;
  const w = pil.getBoundingClientRect().width;
  if (w > 0) {
    document.documentElement.style.setProperty('--pil-pol', `${Math.round(w / 2)}px`);
  }
}

function otmetitVlezaet() {
  for (const r of document.querySelectorAll(
    '.men-niz .men-r3, .men-niz .npr-chipy, .fil-r')) {
    r.classList.toggle('vlezaet', r.scrollWidth <= r.clientWidth + 1);
  }
}

function vkljuchitSkvoznoe(...a) {
  vkljuchitSkvoznoe_bazovyj(...a);
  otkryt_zadachu_iz_adresa();
  vkljuchitKlavishi();
  vkljuchitEsche();
  vkljuchitGarmoshki();
  vkljuchitEscheSpisok();
                                                                   
                                                                    
  vkljuchitOtkrytieZadach();
  otmetitVlezaet();
  zamerit_niz();
  vkljuchitKnopkuFiltrov();
                                                            
                                    
  if (!document.querySelector('.niz-tuman')) {
    const t = document.createElement('div');
    t.className = 'niz-tuman';
    document.body.appendChild(t);
  }
  addEventListener('resize', () => { obnovitNiz(); otmetitVlezaet(); zamerit_niz(); });
                                                              
                                                             
                                                   
  if (typeof ResizeObserver === 'function') {
    const nabl = new ResizeObserver(() => { zamerit_niz(); otmetitVlezaet(); });
    for (const s of ['.men-niz', '.niz', '.fil-r']) {
      const el = document.querySelector(s);
      if (el) nabl.observe(el);
    }
                                                                 
    new MutationObserver(() => {
      for (const s of ['.men-niz', '.niz', '.fil-r']) {
        const el = document.querySelector(s);
        if (el && !el.dataset.pod_nabljudeniem) {
          el.dataset.pod_nabljudeniem = '1';
          nabl.observe(el);
        }
      }
      zamerit_niz();
    }).observe(document.body, { childList: true, subtree: true });
  }
                                                               
                                                            
                                    
  zagruzit_nastrojki().then((n) => {
    primenit_svoi_cveta(n);
                                                             
                                                             
                                                             
                                                              
                                                               
                                                           
    if (n.svoj_kursor === true || n.svoj_kursor === 1) {
      document.documentElement.dataset.kursor = 'sistemnyj';
    }
    obnovitNiz();
  });
}


                                                                   
                                                              
                                                                
                                                              
                                                                 
                                 
const taskCreationCallbacks=new Map();let pendingTaskUndo=null,taskUndoBusy=false;
const taskUndoStorage=()=>`locus-task-creation-undo:${API.ja}`,taskToastStorage=()=>`locus-task-created-toast:${API.ja}`;
function pendingCommandNote(node,id){
 document.getElementById(id)?.remove();let stack=document.getElementById('pending-command-notes');
 if(node){node.id=id;if(!stack){stack=document.createElement('div');stack.id='pending-command-notes';stack.className='pending-command-notes';document.body.appendChild(stack);}stack.appendChild(node);}
 if(stack&&!stack.children.length)stack.remove();
 razmestitTost(document.querySelector('.tost'));
}
function okrCreationNote(){
 const intent=API.nepodtverzhdennoeSozdanieOkr?.();
 for(const root of document.querySelectorAll('[data-okr-creation-key]')){
  const own=intent?.key===root.dataset.okrCreationKey;
  for(const node of root.querySelectorAll('input,select,textarea')){if(own&&!node.hasAttribute('data-okr-was-disabled')){node.dataset.okrWasDisabled=node.disabled?'1':'0';node.disabled=true;}else if(!own&&node.hasAttribute('data-okr-was-disabled')){node.disabled=node.dataset.okrWasDisabled==='1';delete node.dataset.okrWasDisabled;}}
  const submit=root.querySelector('.vyb-g');if(submit){if(own)submit.setAttribute('aria-disabled','true');else submit.removeAttribute('aria-disabled');}
  let area=root.querySelector('[data-okr-create-recovery]');if(!own){area?.remove();continue;}
  if(!area){area=document.createElement('div');area.dataset.okrCreateRecovery='1';area.className='okr-create-recovery';const text=document.createElement('p');text.textContent='Сохранение ещё не подтверждено. Проверка сохранит введённые поля.';const check=document.createElement('button');check.type='button';check.className='kn ostavit-vnutri';check.textContent='проверить создание';check.onclick=okrCreationStatus;area.append(text,check);(root.querySelector('.vyb-t')||root).append(area);}area.querySelector('button').disabled=intent.busy;
 }
 if(!intent){pendingCommandNote(null,'okr-creation-command-note');return;}
 const note=document.createElement('aside');note.className='locus-session-note';note.setAttribute('role','status');const text=document.createElement('span');text.textContent='Создание '+({celi:'цели',rezultaty:'результата',zamery:'замера'}[intent.table])+' ещё не подтверждено.';const check=document.createElement('button');check.type='button';check.className='kn';check.dataset.okrCreationCheck='1';check.textContent='проверить создание';check.disabled=intent.busy;check.onclick=okrCreationStatus;note.append(text,check);pendingCommandNote(note,'okr-creation-command-note');
}
function sozdanieOkrFormy(root,key,after){root.dataset.okrCreationKey=key;root.locusOkrCreated=after;root.locusOkrCancelled=()=>{if(root.classList.contains('vyb-fon'))root.locusZakryt();else root.dataset.okrCreationKey=crypto.randomUUID();};okrCreationNote();}
document.addEventListener('locus:okr-creation-pending',okrCreationNote);
document.addEventListener('locus:okr-creation-confirmed',async event=>{const {key,result}=event.detail;const root=[...document.querySelectorAll('[data-okr-creation-key]')].find(r=>r.dataset.okrCreationKey===key);try{if(root?.locusOkrCreated)await root.locusOkrCreated(result);else if(typeof window.OPROS==='function')await window.OPROS();tost(result.dannye_skryty?'Создание подтверждено. Подробности закрыты по текущим правам.':'Создание подтверждено');}catch{tost('Запись сохранена. Не удалось обновить экран: обнови страницу.');}});
function okrCreationStatus(){
 const intent=API.nepodtverzhdennoeSozdanieOkr?.();if(!intent)return;
 const close=modalka('Проверить создание',`<p data-okr-create-status role="status">Проверка читает сохранённый результат. Новую запись она не создаёт.</p><div class="okr-create-actions"><button type="button" class="kn ostavit-vnutri" data-okr-create-check>проверить результат</button><button type="button" class="kn ostavit-vnutri" data-okr-create-repeat hidden>повторить исходное создание</button><button type="button" class="kn ostavit-vnutri" data-okr-create-cancel hidden>не создавать</button><button type="button" class="kn ostavit-vnutri" data-okr-create-dismiss hidden>закрыть проверку</button></div>`,null,{poverh:true}),root=document.querySelector('.vyb-fon:last-of-type'),status=root.querySelector('[data-okr-create-status]');
 const controls=()=>{const live=API.nepodtverzhdennoeSozdanieOkr();for(const b of root.querySelectorAll('button'))b.disabled=live?.busy||false;root.querySelector('[data-okr-create-repeat]').hidden=live?.phase!=='absent';root.querySelector('[data-okr-create-cancel]').hidden=live?.phase!=='absent';root.querySelector('[data-okr-create-dismiss]').hidden=!['udaleno','perenesen','otmeneno'].includes(live?.phase);};
 async function run(fn){for(const b of root.querySelectorAll('button'))b.disabled=true;try{await fn();const live=API.nepodtverzhdennoeSozdanieOkr();if(live?.phase==='confirmed'){close();API.prinjatSozdanieOkr(intent.key);return;}status.textContent=live?.phase==='absent'?'Запись не найдена. Можно отдельно повторить прежний запрос или отказаться от создания.':live?.phase==='udaleno'?'Запись была создана, затем удалена. Повтор новой записи не создаёт.':live?.phase==='perenesen'?'Запись была создана, затем перенесена. Повтор новой записи не создаёт.':live?.phase==='otmeneno'?'Создание отменено. Поздний исходный запрос запись не добавит.':'Результат ещё не подтверждён.';}catch(error){status.textContent=error.message;}finally{controls();}}
 root.querySelector('[data-okr-create-check]').onclick=()=>run(()=>API.proveritSozdanieOkr(intent.key));root.querySelector('[data-okr-create-repeat]').onclick=()=>run(()=>API.povtoritSozdanieOkr(intent.key));root.querySelector('[data-okr-create-cancel]').onclick=()=>run(()=>API.otmenitSozdanieOkr(intent.key));root.querySelector('[data-okr-create-dismiss]').onclick=()=>{const own=[...document.querySelectorAll('[data-okr-creation-key]')].find(r=>r.dataset.okrCreationKey===intent.key);API.zakrytProverkuSozdanijaOkr(intent.key);close();own?.locusOkrCancelled?.();};controls();
}
function zamer({rez,choices=rez?[rez]:[],znachenie='',onChanged}){
 if(!choices.length)throw new Error('Выбери результат');const key=crypto.randomUUID(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
 const close=modalka('Новый замер'+(choices.length===1?': '+choices[0].nazvanie:''),`<div class="l-form" data-measurement-form>${choices.length>1?'<label class="l-field l-field-wide"><span class="l-label">результат</span><select id="zamer-result">'+choices.map(r=>'<option value="'+Number(r.id)+'">'+ekranirovat(r.nazvanie)+'</option>').join('')+'</select></label>':''}<label class="l-field"><span class="l-label">число</span><input id="zamer-value" inputmode="decimal" value="${ekranirovat(znachenie)}" aria-describedby="zamer-value-error" required><small class="l-field-error" id="zamer-value-error" aria-live="polite" hidden></small></label><label class="l-field"><span class="l-label">дата факта</span><input id="zamer-date" type="date" value="${today}" max="${today}" aria-describedby="zamer-date-error" required><small class="l-field-error" id="zamer-date-error" aria-live="polite" hidden></small></label><label class="l-field l-field-wide"><span class="l-label">откуда взяли число</span><input id="zamer-source" maxlength="300" placeholder="Amo CRM, отчёт за октябрь" aria-describedby="zamer-source-hint zamer-source-error" required><small class="l-field-hint" id="zamer-source-hint">До 300 знаков. Автор запишется автоматически.</small><small class="l-field-error" id="zamer-source-error" aria-live="polite" hidden></small></label><p class="l-field-wide">Предыдущие замеры сохранятся. Уточнение записывается новой строкой.</p></div>`,null,{poverh:true,podskazka:'записать замер',gotovo:async()=>{
  clearErrors();
  const raw=fields.znachenie.value.trim().replace(',','.'),source=fields.otkuda.value.trim(),date=fields.data.value;let invalid=false;
  if(!raw||!Number.isFinite(Number(raw))){fieldError('znachenie','Введи число, чтобы сохранить замер');invalid=true;}
  if(!source){fieldError('otkuda','Укажи источник, чтобы цифру можно было проверить');invalid=true;}
  if(!date){fieldError('data','Выбери дату факта');invalid=true;}
  if(invalid){focusError();return false;}
  try{
                                                                            
                                                                              
   await API.sozdat('zamery',{zapros_kljuch:key,rezultat_id:Number(root.querySelector('#zamer-result')?.value||choices[0].id),znachenie:raw,otkuda:source,data:date});await finish();
  }catch(error){if(error.kod===400&&fields[error.telo?.pole]){fieldError(error.telo.pole,error.message);focusError();return false;}throw error;}
 }}),root=document.querySelector('.vyb-fon:last-of-type');
 const fields={znachenie:root.querySelector('#zamer-value'),data:root.querySelector('#zamer-date'),otkuda:root.querySelector('#zamer-source')};
 function fieldError(name,message){const input=fields[name],note=root.querySelector('#'+input.id+'-error');input.setAttribute('aria-invalid','true');note.textContent=message;note.hidden=false;}
 function clearError(input){input.removeAttribute('aria-invalid');const note=root.querySelector('#'+input.id+'-error');note.textContent='';note.hidden=true;}
 function clearErrors(){Object.values(fields).forEach(clearError);}
 function focusError(){setTimeout(()=>{if(root.isConnected)root.querySelector('[aria-invalid=true]')?.focus({preventScroll:false});},0);}
 for(const input of Object.values(fields))input.addEventListener('input',()=>clearError(input));
 async function finish(){close();try{await onChanged?.();tost('Замер записан');}catch{tost('Замер записан. Не удалось обновить экран: обнови страницу.');}}
 sozdanieOkrFormy(root,key,finish);root.querySelector('#zamer-value').focus();return close;
}

function creationNote(){
 const intent=API.nepodtverzhdennoeSozdanie?.();
 if(intent?.busy&&intent.phase==='pending'){const form=document.querySelector('.sozd[aria-busy="true"]');if(form)form.dataset.creationAttemptKey=intent.key;}
 const form=document.querySelector('.sozd'),oldInfo=form?.querySelector('[data-task-creation-form-note]');
 if(intent&&form&&(form.classList.contains('on')||form.classList.contains('vstroen'))&&form.dataset.creationAttemptKey!==intent.key){
   if(!oldInfo){const info=document.createElement('div');info.dataset.taskCreationFormNote='1';info.className='task-creation-form-note';const text=document.createElement('span');text.textContent='Есть незавершённое сохранение задачи. Проверка сохранит текущий черновик.';const button=document.createElement('button');button.type='button';button.className='kn';button.dataset.taskCreationForeignCheck='1';button.textContent='проверить создание';button.addEventListener('click',taskCreationStatus);info.append(text,button);form.querySelector('.sozd-k').insertBefore(info,form.querySelector('#sozd-osh'));}
 }else oldInfo?.remove();
 if(!intent){pendingCommandNote(null,'task-creation-command-note');return;}
 const note=document.createElement('aside');note.id='task-creation-command-note';note.className='locus-session-note';note.setAttribute('role','status');
 const text=document.createElement('span');text.textContent=`Задача «${String(intent.body.nazvanie||'новая задача').slice(0,80)}»: ${intent.phase==='confirmed'?'создание подтверждено':'сохранение ещё не подтверждено'}.`;
 const button=document.createElement('button');button.type='button';button.className='kn';button.textContent='проверить создание';button.dataset.taskCreationCheck='1';button.disabled=intent.busy;button.addEventListener('pointerdown',event=>{if(document.querySelector('[data-pravim="1"]'))event.preventDefault();});button.addEventListener('click',taskCreationStatus);note.append(text,button);pendingCommandNote(note,note.id);
}
document.addEventListener('locus:task-creation-pending',creationNote);
async function finishTaskCreation(key,close){
 const form=document.getElementById('sozd'),own=form?.dataset.pendingCreationKey===key;close();
 if(own&&form.locusResumeCreation){await form.locusResumeCreation(key);return;}
 const result=API.prinjatSozdanie(key);toastCreatedTask(result,{posle:refreshAfterTaskCreation});
 if(form?.locusCreationReturn&&!taskUndoHasDraft()){setTimeout(()=>{if(!taskUndoHasDraft())form.locusCreationReturn();},650);return;}
 if(!taskUndoHasDraft()&&!document.querySelector('.vyb-fon'))await refreshAfterTaskCreation();
}
function taskCreationStatus(){
 const intent=API.nepodtverzhdennoeSozdanie?.();if(!intent)return;
 if(document.querySelector('[data-pravim="1"]')){tost('Сначала заверши текущую правку');return;}
 document.querySelector('.tost')?.remove();
 const close=modalka('Проверить создание задачи','<p id="task-creation-title"></p><p id="task-creation-description" class="task-creation-description"></p><p id="task-creation-status" role="status" aria-live="polite">Проверка только читает результат сохранения.</p><div class="pending-command-actions"><button type="button" class="kn" data-task-creation-read>проверить</button><button type="button" class="kn" data-task-creation-retry hidden>повторить сохранение</button></div>'),status=document.getElementById('task-creation-status'),check=document.querySelector('[data-task-creation-read]'),retry=document.querySelector('[data-task-creation-retry]');
 document.getElementById('task-creation-title').textContent=intent.body.nazvanie||'Новая задача';document.getElementById('task-creation-description').textContent=intent.body.opisanie||'';
 const controls=()=>{const current=API.nepodtverzhdennoeSozdanie?.();check.disabled=retry.disabled=!!current?.busy;retry.hidden=current?.key!==intent.key||current.phase!=='not_found';};
 check.addEventListener('click',async()=>{check.disabled=true;try{const result=await API.proveritSozdanieZadachi(intent.key);if(result.podtverzhdeno){await finishTaskCreation(intent.key,close);return;}status.textContent='Сохранение пока не найдено. Можно повторить его с прежними данными.';}catch(error){status.textContent='Проверка не завершена. '+error.message;}finally{controls();}});
 retry.addEventListener('click',async()=>{retry.disabled=true;try{await API.povtoritSozdanieZadachi(intent.key);await finishTaskCreation(intent.key,close);}catch(error){status.textContent=error.taskCreationUnknown?'Результат ещё неизвестен. Проверь создание.':'Сохранение не применено: '+error.message;}finally{controls();}});controls();
}
function taskUndoStore(){try{if(pendingTaskUndo)sessionStorage.setItem(taskUndoStorage(),JSON.stringify(pendingTaskUndo));else sessionStorage.removeItem(taskUndoStorage());return true;}catch{return false;}}
function taskUndoNote(){
 if(!pendingTaskUndo){pendingCommandNote(null,'task-creation-undo-note');return;}
 const note=document.createElement('aside');note.id='task-creation-undo-note';note.className='locus-session-note';note.setAttribute('role','status');const text=document.createElement('span');text.textContent=pendingTaskUndo.count>1?'Создание задач: отмена ещё не подтверждена.':`Задача ${pendingTaskUndo.nomer}: отмена ещё не подтверждена.`;
 const button=document.createElement('button');button.type='button';button.className='kn';button.dataset.taskCreationUndoCheck='1';button.textContent='проверить отмену';button.disabled=taskUndoBusy;button.addEventListener('pointerdown',event=>{if(document.querySelector('[data-pravim="1"]'))event.preventDefault();});button.addEventListener('click',taskUndoStatus);note.append(text,button);pendingCommandNote(note,note.id);
}
function taskUndoHasDraft(){
 if(document.querySelector('[data-pravim="1"],.sozd.on,[data-locus-draft="1"]'))return true;
 return [...document.querySelectorAll('.vyb-fon input:not([readonly]):not([type=hidden]),.vyb-fon textarea,.vyb-fon [contenteditable=true]')].some(e=>e.getClientRects().length);
}
async function refreshAfterTaskCreation(){
 if(document.querySelector('[data-pravim="1"],.vyb-fon,.sozd.on')||document.activeElement?.matches('input,textarea,[contenteditable=true]'))return false;
 if(typeof window.OPROS==='function'){await obnovitEkran();return true;}
 location.reload();return true;
}
function validTaskUndo(result,intent){
 if(!result||result.dejstvie_id!==intent.command||typeof result.najdeno!=='boolean'||typeof result.otmeneno!=='boolean'||result.najdeno&&(result.zadacha_id!==intent.id||result.nomer!==intent.nomer))throw new Error('Ответ не подтвердил отмену задачи');return result;
}
async function taskUndoRequest(method,intent){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{return await API.zapros(method,method==='GET'?'/otmena?dejstvie_id='+encodeURIComponent(intent.command):'/otmena',method==='GET'?undefined:{dejstvie_id:intent.command},{signal:controller.signal});}finally{clearTimeout(timer);}
}
async function taskUndoFinish(result,intent){
 const callbacks=taskCreationCallbacks.get(intent.command);pendingTaskUndo=null;taskUndoStore();taskCreationCallbacks.delete(intent.command);callbacks?.close?.();taskUndoNote();
 try{sessionStorage.setItem(taskToastStorage(),JSON.stringify({...intent,state:'undone',time:Date.now()}));}catch{}
 const currentModal=document.querySelector('.vyb-fon:not([hidden])');let refreshed=!taskUndoHasDraft()&&(!currentModal||currentModal===callbacks?.origin);try{if(refreshed){if(callbacks?.posle)await callbacks.posle();else refreshed=await refreshAfterTaskCreation();}}catch{refreshed=false;}
 tost((result.ranche?'Отмена была сохранена ранее.':intent.count>1?'Создание задач отменено.':'Создание задачи отменено.')+(refreshed?'':' Заверши текущую правку и обнови экран.'));
}
async function taskUndoSend(intent){
 if(pendingTaskUndo&&pendingTaskUndo.command!==intent.command)throw new Error('Сначала проверь предыдущую отмену задачи');
 if(taskUndoBusy)return;pendingTaskUndo={...intent,phase:'pending'};if(!taskUndoStore()){pendingTaskUndo=null;throw new Error('Не удалось подготовить проверку. Отмена не отправлена.');}taskUndoBusy=true;taskUndoNote();
 let result;
 try{result=validTaskUndo(await taskUndoRequest('POST',intent),intent);if(!result.otmeneno)throw new Error('Отмена ещё не подтверждена');}
 catch(error){if(error.kod!==undefined&&error.kod<500){pendingTaskUndo=null;taskUndoStore();throw error;}pendingTaskUndo.phase='unknown';taskUndoStore();return;}
 finally{taskUndoBusy=false;taskUndoNote();}
 await taskUndoFinish(result,intent);
}
async function taskUndoCheck(status){
 if(taskUndoBusy||!pendingTaskUndo)return;const intent=pendingTaskUndo;taskUndoBusy=true;taskUndoNote();
 try{const result=validTaskUndo(await taskUndoRequest('GET',intent),intent);if(result.otmeneno){await taskUndoFinish(result,intent);return;}if(!result.najdeno)throw new Error('Не найден снимок создания задачи. Проверь карточку.');intent.phase='not_done';taskUndoStore();status.textContent='Отмена пока не найдена. Её можно повторить отдельным действием.';}
 catch(error){status.textContent='Проверка не завершена. '+error.message;}
 finally{taskUndoBusy=false;taskUndoNote();}
}
function taskUndoStatus(){
 if(!pendingTaskUndo)return;if(taskUndoHasDraft()){tost('Сначала заверши текущую правку');return;}
 const close=modalka('Проверить отмену задачи','<p id="task-create-undo-status" role="status" aria-live="polite">Проверка только читает результат отмены.</p><div class="pending-command-actions"><button type="button" class="kn" data-task-create-check>проверить</button><button type="button" class="kn" data-task-create-retry hidden>повторить отмену</button></div>'),status=document.getElementById('task-create-undo-status'),check=document.querySelector('[data-task-create-check]'),retry=document.querySelector('[data-task-create-retry]'),intent=pendingTaskUndo;
 const previous=taskCreationCallbacks.get(intent.command)||{};if(previous.origin&&!previous.origin.isConnected){previous.posle=null;previous.origin=null;}taskCreationCallbacks.set(intent.command,{...previous,close});const controls=()=>{check.disabled=retry.disabled=taskUndoBusy;retry.hidden=!pendingTaskUndo||pendingTaskUndo.phase!=='not_done';};
 check.addEventListener('click',async()=>{check.disabled=true;await taskUndoCheck(status);controls();});retry.addEventListener('click',async()=>{retry.disabled=true;try{await taskUndoSend(intent);if(pendingTaskUndo)status.textContent='Результат ещё неизвестен. Проверь отмену.';}catch(error){status.textContent='Отмена не применена. '+error.message;}controls();});controls();
}
function toastCreatedTask(record,{posle=null,notice=null,count=1}={}){
 if(!Number.isSafeInteger(record?.id)||!Number.isSafeInteger(record.nomer))throw new Error('Ответ не подтвердил создание. Проверь список задач перед повтором.');
 const historical=record.udaleno||record.sozdanie_otmeneno;
 const intent={actor:API.ja,id:record.id,nomer:record.nomer,count,command:record.otmena_dejstvie_id,state:historical?'historical':'created',notice:notice??(historical?(record.kartochka_otsutstvuet?`Задача ${record.nomer} была создана ранее, затем её карточку удалили`:`Задача ${record.nomer} была создана ранее и сейчас находится в корзине`):record.vernulsja_iz_arhiva?.tost||`Задача ${record.nomer} ${record.povtor_sozdanija?'уже создана':'создана'}`),time:Date.now()};
 if(typeof intent.command!=='string'){tost(intent.notice);return;}
 taskCreationCallbacks.set(intent.command,{posle,origin:document.querySelector('.vyb-fon:not([hidden])')});
 const reveal=()=>{intent.time=Date.now();try{sessionStorage.setItem(taskToastStorage(),JSON.stringify(intent));}catch{}showTaskCreationToast(intent,5000);const pending=API.nepodtverzhdennoeSozdanie?.();if(pending&&pending.key===record.zapros_kljuch&&pending.phase==='confirmed')API.prinjatSozdanie(pending.key);};
 const form=document.querySelector('.sozd[aria-busy="true"]');if(form)form.addEventListener('locus:task-created-form-closed',reveal,{once:true});else reveal();
}
function showTaskCreationToast(intent,ms){
 if(intent.state==='undone'){tost('Создание задачи было отменено',null,{ms});return;}
 if(intent.state==='historical'){tost(intent.notice,null,{ms});return;}
 tost(intent.notice,async()=>{if(taskUndoHasDraft()){tost('Сначала заверши текущую правку');return;}await taskUndoSend(intent);},{ms});
}
function restoreTaskCreationUndo(){
 if(!API.ja)return;
 try{const saved=JSON.parse(sessionStorage.getItem(taskUndoStorage()));if(saved?.actor===API.ja&&Number.isSafeInteger(saved.id)&&Number.isSafeInteger(saved.nomer)&&typeof saved.command==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(saved.command)&&['pending','unknown','not_done'].includes(saved.phase)){pendingTaskUndo={...saved,phase:saved.phase==='not_done'?'not_done':'unknown'};taskUndoNote();}}
 catch{}
 if(pendingTaskUndo)return;
 if(API.nepodtverzhdennoeSozdanie?.())return;
 try{const saved=JSON.parse(sessionStorage.getItem(taskToastStorage())),age=Date.now()-saved?.time;if(saved?.actor===API.ja&&age>=0&&age<5000&&['created','undone','historical'].includes(saved.state)){if(saved.state==='undone'||typeof saved.command==='string')showTaskCreationToast(saved,5000-age);}else sessionStorage.removeItem(taskToastStorage());}catch{}
}

const paymentCommands=new Map(),paymentBusy=new Set(),paymentCallbacks=new Map(),paymentDetailsAccess=new Map();
const paymentPrefix=()=>`locus-payment-intent:${API.ja}:`;
function paymentStore(intent){
 try{const key=paymentPrefix()+intent.payment;if(intent.phase==='done')sessionStorage.removeItem(key);else sessionStorage.setItem(key,JSON.stringify(intent));return true;}catch{return false;}
}
function paymentRestore(){
 if(!API.ja)return;paymentDetailsAccess.clear();
 try{for(let n=0;n<sessionStorage.length;n++){const key=sessionStorage.key(n);if(!key.startsWith(paymentPrefix()))continue;const value=JSON.parse(sessionStorage.getItem(key));if(value?.actor!==API.ja||!Number.isSafeInteger(value.payment)||value.payment<1||!['prishlo','otmenit_prishlo'].includes(value.action)||!['pending','unknown','not_found'].includes(value.phase)||!value.body||typeof value.body.zapros_kljuch!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.body.zapros_kljuch))continue;if(!paymentCommands.has(value.payment)){value.phase=value.phase==='not_found'?'not_found':'unknown';paymentCommands.set(value.payment,value);}}}catch{}
 paymentNote();
}
function paymentDraft(){return Boolean(document.querySelector('[data-pravim="1"]')||document.activeElement?.matches('textarea,[contenteditable=true]')&&!document.activeElement.closest('[data-payment-form]'));}
document.addEventListener('locus:session-restored',()=>{paymentDetailsAccess.clear();paymentNote();});
function paymentIntentDetails(intent){
 if(intent.action!=='prishlo')return '';
 const amount=String(intent.body?.summa_fakt??'').replace(',','.'),day=intent.body?.data;
 if(!/^\d+(?:\.\d{1,2})?$/.test(amount)||!Number.isFinite(Number(amount))||Number(amount)<=0||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return '';
 const date=new Date(day+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)return '';
 return ' Введено: '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(Number(amount))+' ₽, дата '+day.slice(8,10)+'.'+day.slice(5,7)+'.'+day.slice(0,4)+'.';
}
function readPaymentDetailsAccess(intent){
 const key=intent.body.zapros_kljuch;if(paymentDetailsAccess.has(key))return;paymentDetailsAccess.set(key,'checking');
 API.odna('platezhi',intent.payment).then(row=>{paymentDetailsAccess.set(key,row?.id===intent.payment&&typeof row.summa==='number'?'allowed':'denied');},()=>paymentDetailsAccess.set(key,'denied')).finally(()=>{if(paymentCommands.get(intent.payment)?.body.zapros_kljuch===key)paymentNote();});
}
function paymentNote(){
 pendingCommandNote(null,'payment-command-note');const entries=[...paymentCommands.values()];if(!entries.length)return;const intent=entries[0],note=document.createElement('aside');note.id='payment-command-note';note.className='locus-session-note payment-command-note';note.setAttribute('role','status');
 const text=document.createElement('span');text.textContent=entries.length>1?`Непроверенных платёжных действий: ${entries.length}.`:`Платёж ${intent.payment}: ${intent.phase==='not_found'?'операция пока не найдена':'сохранение ещё не подтверждено'}.`;
 if(intent.action==='prishlo'){readPaymentDetailsAccess(intent);if(paymentDetailsAccess.get(intent.body.zapros_kljuch)==='allowed')text.textContent+=paymentIntentDetails(intent);}
 const button=document.createElement('button');button.type='button';button.className='kn';button.dataset.paymentCheck=String(intent.payment);button.textContent='проверить платёж';button.disabled=paymentBusy.has(intent.payment);button.addEventListener('pointerdown',event=>{if(paymentDraft())event.preventDefault();});button.addEventListener('click',()=>paymentStatus(intent));note.append(text,button);pendingCommandNote(note,note.id);
}
async function paymentRequest(method,id,action,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,`/platezhi/${id}/${action}`,body,{signal:controller.signal});}catch(error){if(error.kod===403){const key=paymentCommands.get(id)?.body?.zapros_kljuch;if(key)paymentDetailsAccess.delete(key);paymentNote();}throw error;}finally{clearTimeout(timer);}}
function paymentResult(result,intent){
 if(!result||result.id!==intent.payment||!Number.isSafeInteger(result.versija)||result.versija<1||typeof result.summa!=='number'||!Number.isFinite(result.summa))throw new Error('Ответ не подтвердил платёж');
 if(intent.action==='prishlo'&&(result.status!=='prishlo'||result.oplachen_at!==intent.body.data||result.summa!==Number(intent.body.summa_fakt)||!Object.hasOwn(result,'ostatok_id')))throw new Error('Ответ не подтвердил содержание оплаты');
 if(intent.action==='otmenit_prishlo'&&(result.status!=='zhdem'||result.oplachen_at!==null))throw new Error('Ответ не подтвердил снятие оплаты');return result;
}
async function paymentFinish(intent,result,checked=false){
 const callbacks=paymentCallbacks.get(intent.payment);intent.phase='done';paymentCommands.delete(intent.payment);paymentStore(intent);paymentCallbacks.delete(intent.payment);callbacks?.close?.();paymentNote();let refreshed=true;
 if(paymentDraft())refreshed=false;else if(callbacks?.posle)try{await callbacks.posle();}catch{refreshed=false;}
 const suffix=refreshed?'':' Данные сохранены, обнови экран после завершения правки.';
 if(intent.action==='prishlo')tost((checked?'Оплата была записана.':'Платёж отмечен пришедшим.')+suffix,()=>{
  if(paymentDraft()){tost('Сначала заверши текущую правку');return;}
  const inverse={actor:API.ja,payment:intent.payment,action:'otmenit_prishlo',phase:'pending',body:{versija:result.versija,zapros_kljuch:API.kljuchZaprosa(),otmenit_zapros:intent.body.zapros_kljuch}};paymentCallbacks.set(intent.payment,{posle:callbacks?.posle});return paymentSend(inverse);
 },{ms:5000});else tost('Отметка оплаты снята.'+suffix);
}
async function paymentSend(intent){
 if(paymentBusy.has(intent.payment))return false;
 intent.phase='pending';if(!paymentStore(intent))throw new Error('Не удалось сохранить ключ проверки. Запись не отправлена.');paymentCommands.set(intent.payment,intent);paymentBusy.add(intent.payment);paymentNote();
 try{const result=paymentResult(await paymentRequest('POST',intent.payment,intent.action,intent.body),intent);await paymentFinish(intent,result);return true;}
 catch(error){
  if(error.kod!==undefined&&error.kod<500){intent.phase='done';paymentCommands.delete(intent.payment);paymentStore(intent);paymentNote();throw error;}
  intent.phase='unknown';paymentStore(intent);paymentNote();return false;
 }finally{paymentBusy.delete(intent.payment);paymentNote();}
}
async function paymentCheck(intent,status){
 if(paymentBusy.has(intent.payment))return;paymentBusy.add(intent.payment);paymentNote();
 try{
  const receipt=await paymentRequest('GET',intent.payment,'proverka?zapros_kljuch='+encodeURIComponent(intent.body.zapros_kljuch));
  if(typeof receipt?.podtverzhdeno!=='boolean')throw new Error('Не удалось подтвердить ответ проверки');
  if(!receipt.podtverzhdeno){intent.phase='not_found';paymentStore(intent);status.textContent='Операция пока не найдена. Повтор возможен отдельным действием с тем же ключом.';return;}
  if(receipt.dejstvie!==intent.action)throw new Error('Проверка относится к другому действию');await paymentFinish(intent,paymentResult(receipt.rezultat,intent),true);
 }catch(error){status.textContent='Проверка не завершена. '+error.message;}
 finally{paymentBusy.delete(intent.payment);paymentNote();}
}
function paymentStatus(intent){
 if(paymentDraft()){tost('Сначала заверши текущую правку');return;}
 const close=modalka('Проверить платёж',`<div data-payment-form><p id="opl-status">Сохранение ещё не подтверждено. Проверка только читает результат.</p><div class="payment-actions"><button type="button" class="kn" id="opl-check">проверить сохранение</button><button type="button" class="kn" id="opl-retry" hidden>повторить действие</button></div></div>`),status=document.getElementById('opl-status'),check=document.getElementById('opl-check'),retry=document.getElementById('opl-retry');
 const previous=paymentCallbacks.get(intent.payment)||{};paymentCallbacks.set(intent.payment,{...previous,close});
 const controls=()=>{check.disabled=retry.disabled=paymentBusy.has(intent.payment);retry.hidden=intent.phase!=='not_found';};
 check.addEventListener('click',async()=>{check.disabled=true;await paymentCheck(intent,status);controls();});retry.addEventListener('click',async()=>{controls();try{if(!await paymentSend(intent))status.textContent='Результат ещё неизвестен. Проверь сохранение.';}catch(error){status.textContent='Действие не применено. '+error.message;}controls();});controls();
}
async function otmetitOplatu(platezh_id, { proekt_id = null, posle = null } = {}) {
 if(paymentDraft()){tost('Сначала заверши текущую правку');return;}
 paymentRestore();if(paymentCommands.has(platezh_id)){paymentCallbacks.set(platezh_id,{posle});paymentStatus(paymentCommands.get(platezh_id));return;}
 let pred;try{pred=await paymentRequest('GET',platezh_id,'predprosmotr_otmetki');}catch(error){tost('Не получилось открыть платёж: '+error.message);return;}
 if(pred.id!==platezh_id||!Number.isSafeInteger(pred.versija)||pred.versija<1||typeof pred.summa_po_umolchaniyu!=='number'){tost('Не удалось подтвердить платёж. Обнови экран.');return;}
 if(proekt_id!==null&&Number(proekt_id)!==pred.proekt_id){tost('Платёж относится к другому проекту. Обнови экран.');return;}
 if(pred.status==='prishlo'){tost('Платёж уже отмечен пришедшим. Обнови экран.');return;}
 const close=modalka('Пришла оплата',`<form class="l-form" data-payment-form><p class="okno-pod" id="opl-caption">${ekranirovat(pred.naznachenie||'платёж')}</p><div class="payment-fields"><label class="l-field"><span class="l-label">сумма</span><input type="number" step="0.01" min="0.01" id="opl-summa" value="${pred.summa_po_umolchaniyu}" required></label><label class="l-field"><span class="l-label">дата</span><input type="date" id="opl-data" value="${ekranirovat(pred.data_po_umolchaniyu)}" required></label></div><fieldset class="payment-choice" id="opl-razvilka" hidden><legend id="opl-question"></legend><label class="payment-radio"><input type="radio" name="opl-ost" value="otdelnoj_strokoj" checked><span>остаток <b id="opl-ost-summa"></b> ₽ ждём отдельной строкой</span></label><label class="payment-radio"><input type="radio" name="opl-ost" value="spisat"><span>это всё, остаток списать</span></label></fieldset><p class="l-error" id="opl-osh" role="status" aria-live="polite"></p><div class="payment-actions"><button type="button" class="kn" id="opl-check" hidden>проверить сохранение</button><button type="button" class="kn" id="opl-retry" hidden>повторить отметку</button><button type="button" class="kn" id="opl-refresh" hidden>загрузить актуальные данные</button><button type="submit" class="kn tmn" id="opl-ok">Отметить</button></div></form>`),form=document.querySelector('[data-payment-form]'),amount=form.querySelector('#opl-summa'),date=form.querySelector('#opl-data'),choice=form.querySelector('#opl-razvilka'),status=form.querySelector('#opl-osh'),submit=form.querySelector('#opl-ok'),check=form.querySelector('#opl-check'),retry=form.querySelector('#opl-retry'),refresh=form.querySelector('#opl-refresh');
 let intent=null,sending=false;
 const recalc=()=>{const n=Number(amount.value),left=Math.round((pred.summa_po_umolchaniyu-n)*100)/100;choice.hidden=!(n>0&&left>0);form.querySelector('#opl-question').textContent=`Пришло ${n.toLocaleString('ru-RU')} ₽ из ${pred.summa_po_umolchaniyu.toLocaleString('ru-RU')} ₽`;form.querySelector('#opl-ost-summa').textContent=left.toLocaleString('ru-RU');};amount.addEventListener('input',recalc);
 const controls=()=>{const pending=Boolean(intent&&paymentCommands.has(platezh_id));amount.readOnly=date.readOnly=pending||sending;form.querySelectorAll('[name=opl-ost]').forEach(e=>e.disabled=pending||sending);submit.hidden=pending;submit.disabled=sending;check.hidden=!pending;check.disabled=paymentBusy.has(platezh_id);retry.hidden=!pending||intent.phase!=='not_found';retry.disabled=paymentBusy.has(platezh_id);};
 const send=async()=>{if(sending)return;sending=true;controls();try{paymentCallbacks.set(platezh_id,{posle,close});if(!await paymentSend(intent))status.textContent='Сохранение ещё не подтверждено. Сумма и дата остались в форме. Проверь результат.';}catch(error){status.textContent='Оплата не применена. '+error.message;if(error.kod===409){refresh.hidden=false;submit.disabled=true;}}finally{sending=false;controls();if(refresh.hidden===false)submit.disabled=true;}};
 form.addEventListener('submit',async event=>{event.preventDefault();if(sending||intent&&paymentCommands.has(platezh_id))return;if(!form.reportValidity())return;intent={actor:API.ja,payment:platezh_id,action:'prishlo',phase:'pending',body:{versija:pred.versija,zapros_kljuch:API.kljuchZaprosa(),summa_fakt:Number(amount.value),data:date.value,...(!choice.hidden?{reshenie:form.querySelector('[name=opl-ost]:checked').value}:{})}};await send();});
 check.addEventListener('click',async()=>{check.disabled=true;await paymentCheck(intent,status);controls();});retry.addEventListener('click',send);refresh.addEventListener('click',async()=>{refresh.disabled=true;try{const current=await paymentRequest('GET',platezh_id,'predprosmotr_otmetki');if(current.id!==platezh_id||!Number.isSafeInteger(current.versija))throw new Error('Не подтверждён платёж');if(current.proekt_id!==pred.proekt_id)throw new Error('Платёж перенесён в другой проект. Открой его у нового владельца.');if(current.status==='prishlo'){status.textContent='Платёж уже отмечен пришедшим. Обнови список.';return;}pred=current;amount.value=String(pred.summa_po_umolchaniyu);date.value=pred.data_po_umolchaniyu;form.querySelector('#opl-caption').textContent=pred.naznachenie||'платёж';intent=null;status.textContent='Загружены сохранённые данные. Проверь сумму и дату перед новым действием.';refresh.hidden=true;recalc();controls();}catch(error){status.textContent=error.message;}finally{refresh.disabled=false;}});
 amount.focus();
}

                                                                          
function preduprezhdenieKontakta(container,data,tip){
  const rows=data?.dubli||data?.spisok;
  if(!container||!Array.isArray(rows))return false;
  const owners=[...new Map(rows.filter(row=>Number.isSafeInteger(row.chelovek_id)&&row.chelovek_id>0)
    .map(row=>[row.chelovek_id,row])).values()];
  container.replaceChildren();container.classList.toggle('contact-duplicate-warning',owners.length>0);
  if(!owners.length)return false;
  const label=document.createElement('span');label.textContent=(tip==='telefon'?'Такой номер':'Такой контакт')+' уже есть у '+owners.map(row=>row.imja).join(', ')+'.';container.append(label);
  for(const row of owners){const link=document.createElement('a');link.href='/klient.html?id='+row.chelovek_id;link.className='contact-duplicate-link';link.textContent='Открыть карточку '+row.imja+(row.arhiv?' (в архиве)':'');container.append(link);}
  return true;
}

function ikonkaKontakta(action){
  const inside=action==='otkryt'?'<path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>':'<rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.5"/>';
  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'+inside+'</svg>';
}
function zaschititVneshnieSsylki(root,options={}){
                                                                           
                                                                               
  for(const link of root.querySelectorAll('a[href]')){
    try{const url=new URL(link.getAttribute('href'),location.href);if(!['https:','http:'].includes(url.protocol)||url.origin===location.origin)continue;
      link.target='_blank';link.rel='noopener noreferrer';
    }catch{}
  }
  if(options.materialControls!==false&&root.querySelector('.material-entry'))materialsUi().then(m=>m.controls(root)).catch(()=>{});
}
function entityCopyLink(relative){
 const url=new URL(relative,location.origin);if(url.origin!==location.origin)return '';
 return '<button type="button" class="entity-copy-link" data-kop-adres="'+ekranirovat(url.href)+'" aria-label="скопировать ссылку" title="скопировать ссылку"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></button>';
}
document.addEventListener('click',event=>{const button=event.target.closest('button.entity-copy-link');if(button){event.preventDefault();event.stopPropagation();kopirovat(button.dataset.kopAdres,'Ссылка скопирована');}},true);
window.O = { entityCopyLink, errorContext:reportContext,lastActionSnapshot:()=>LAST_REPORT_ACTION?{...LAST_REPORT_ACTION}:null, zamer, sozdanieOkrFormy, baseImportUi, baseUi, cabinetReflectionUi, feedUi, focusUi, focusTaskUi, referralPayoutLinkUi, referralTaskAmount, referralTasksUi, referralTermsUi, referralPayoutUi, servicesUi, projectActionUi, projectEditUi, templatesUi, materialsUi, materialBlocks, materialLink, pendingCommandNote, estNazvanieZadachi, accountCreate, zaschititVneshnieSsylki, ikonkaKontakta, preduprezhdenieKontakta, menju, avatar, plashka, strokaZadachi, mozhnoOtmetitPovtor, prichinaNedostupnogoPovtora, sPodzadachami, naprPoKodu, statusPoKodu, ekranirovat, profilCheloveka, razreshitKonflikt,
             povtory, taskCopy, taskAccounts, tekstUvedomlenija, otmetitUvedomlenie, obnovitUvedomlenija,
             lentaVbok, otmetitOplatu,
             ponumerovat, modalka, palitra, vkljuchitKlavishi, vkljuchitPeriod, vkljuchitVtoroj,
             vkljuchitLjudej, formaCheloveka, istochnikPrihoda,
             skolko, skolkoSlovo, garmoshka, spisokSPredelom,
             chelovekPoImeni, vkljuchitNapravlenija, vypadajuschij, tost,
             tostSoSchetom, ugasitStroku, zakrytZadachu, smenitStatusZadachi, vspyshka, plashkaKasanija, porjadokChipov,
             vkljuchitSprint,
             kopirovat, zagruzitFajl, shapka, vkljuchitSkvoznoe, vkljuchitStatusy, vkljuchitDejstvijaZadach, D,
             kartaSozdanija, poljaZadachi, vkljuchitFormuZadachi, chipy_so_strelkoj,entityHistory,polePoRusski,znachenieSlovami,
             formaProekta,toastCreatedTask,
             vkljuchitPeretaskivanie,
             otkrytZadachu, vkljuchitOtkrytieZadach, navedenie, otmetitVlezaet,
             zagruzit_nastrojki, primenit_svoi_cveta, kroshkiPodpis,
             PALITRY_LOKUSA, primenitPalitru,
             strategyUi,campaignUi,campaignPlanUi,preferencesUi,broadcastUi,PODRAZDELY_PROSTRANSTVA };
try{const prefix='locus-project-action:'+API.ja+':';for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith(prefix)){projectActionUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{const prefix='locus-project-edit:'+API.ja+':';for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith(prefix)){projectEditUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{const prefix='locus-referral-payout-intent:'+API.ja+':';for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith(prefix)||sessionStorage.key(i)?.startsWith('locus-referral-payout-undo:'+API.ja+':')){referralPayoutUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{const prefix='locus-service-intent:'+API.ja+':';for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith(prefix)){servicesUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{const prefix='locus-project-create:'+API.ja+':';for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith(prefix)){projectCreateUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{const prefix='locus-template-intent:'+API.ja+':';for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith(prefix)){templatesUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-publication-settings-draft-v1:'+API.ja+':')){taskPublication().then(module=>module.settingsNotices()).catch(()=>{});break;}}catch{}
try{if(sessionStorage.getItem('locus-publication-source-v1:'+API.ja))taskPublication().then(m=>m.notices()).catch(()=>{});}catch{}
try{const prefix='locus-task-field-v1:'+API.ja+':';for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith(prefix)){taskEdits().then(m=>m.notices()).catch(()=>{});break;}}catch{}
errorReportsUi().catch(()=>{});
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-task-context-v1:'+API.ja+':pending:')){taskContextUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-referral-tasks-intent:'+API.ja+':')){referralTasksUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{const prefix='locus-referral-terms-intent:'+API.ja+':';for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith(prefix)||sessionStorage.key(i)?.startsWith('locus-referral-terms-undo:'+API.ja+':')){referralTermsUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-referral-payout-link:'+API.ja+':')||sessionStorage.key(i)?.startsWith('locus-referral-payout-link-undo:'+API.ja+':')){referralPayoutLinkUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-focus-intent:'+API.ja+':')){focusUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-base-intent:'+API.ja+':')){baseUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-campaign-intent:'+API.ja+':')){campaignUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-broadcast-intent:'+API.ja+':')){broadcastUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<sessionStorage.length;i++)if(sessionStorage.key(i)?.startsWith('locus-feed-intent:'+API.ja+':')){feedUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<localStorage.length;i++)if(localStorage.key(i)?.startsWith('locus-campaign-plan-intent:'+API.ja+':')){campaignPlanUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
try{for(let i=0;i<localStorage.length;i++)if(localStorage.key(i)?.startsWith('locus-preferences-intent:'+API.ja+':')){preferencesUi().then(m=>m.notices()).catch(()=>{});break;}}catch{}
})();






