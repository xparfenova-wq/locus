(function(){
 'use strict';
 const M=window.LocusContextHintsModel,instances=new Map();
 function surface(hint){
  const root=document.createElement('aside');root.className='context-hint';root.dataset.contextHint=hint.kod;root.setAttribute('aria-label','Подсказка раздела «'+hint.title+'»');
  const body=document.createElement('div'),text=document.createElement('p'),title=document.createElement('strong');title.textContent=hint.title+'. ';text.append(title,document.createTextNode(hint.text));
  const more=document.createElement('a');more.href='/poleznoe.html?vkladka=novoe';more.textContent='подробнее в инструкции';
  const status=document.createElement('p');status.className='context-hint-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
  const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.dataset.contextHintCheck='1';retry.textContent='проверить закрытие';retry.hidden=true;
  const close=document.createElement('button');close.type='button';close.className='context-hint-close';close.dataset.contextHintClose='1';close.setAttribute('aria-label','Больше не показывать подсказку раздела «'+hint.title+'»');close.title='больше не показывать';close.textContent='×';
  body.append(text,more,status,retry);root.append(body,close);
  return {root,status,retry,close};
 }
 function preview({host,code='ljudi',state=''}){
  const hint=M.hints.find(h=>h.kod===code)||M.hints[0],ui=surface(hint);host.append(ui.root);
  const checking=/провер|потерян|повтор чтения/.test(state),error=/ошиб/.test(state);
  if(checking||error){ui.status.hidden=false;ui.status.textContent=checking?'Не удалось подтвердить закрытие. Сначала проверим его состояние.':'Не удалось скрыть подсказку. Можно повторить.';}
  ui.retry.hidden=!checking;ui.close.disabled=checking;ui.close.setAttribute('aria-busy',String(checking));
  ui.retry.onclick=()=>{ui.status.textContent='Это образец проверки. Рабочие данные не меняются.';ui.retry.hidden=true;ui.close.disabled=false;ui.close.setAttribute('aria-busy','false');};
  ui.close.onclick=()=>ui.root.remove();return ui.root;
 }
 function mount({code,anchor}){
  const hint=M.hints.find(h=>h.kod===code),actor=API.ja,key=actor+':'+code;
  if(!hint||!anchor?.isConnected||!Number.isSafeInteger(actor))return;
  if(instances.has(key))return instances.get(key);
  const {root,status,retry,close}=surface(hint);
  let snapshot=null,busy=false,uncertain=false,ended=false,controller=null;
  const own=()=>!ended&&API.ja===actor&&anchor.isConnected;
  function stop(){ended=true;controller?.abort();root.remove();}
  function valid(data){if(!data||!Array.isArray(data.podskazki)||data.podskazki.some(h=>!M.hints.some(known=>known.kod===h.kod))||typeof data.kontekst_nastroek!=='string'||!/^[a-f0-9]{64}$/.test(data.kontekst_nastroek))throw Error('Подсказки прочитаны не полностью');return data;}
  function apply(data){
   if(!own())return false;snapshot=valid(data);
   if(!snapshot.podskazki.some(h=>h.kod===code)){stop();return false;}
   if(!root.isConnected)anchor.after(root);return true;
  }
  async function request(method,body){controller=new AbortController();const current=controller,timer=setTimeout(()=>current.abort(),15000);try{return await API.zapros(method,method==='GET'?'/podskazki':'/podskazki/skryt',body,{signal:current.signal});}finally{clearTimeout(timer);if(controller===current)controller=null;}}
  function loading(value){busy=value;close.disabled=value||uncertain;close.setAttribute('aria-busy',String(value));retry.disabled=value;}
  function note(message,check=false){status.textContent=message;status.hidden=false;uncertain=check;retry.hidden=!check;close.disabled=busy||check;}
  async function check(){
   if(!own()||busy)return;loading(true);
   try{const data=await request('GET');if(!own())return;if(apply(data)){uncertain=false;retry.hidden=true;note('Закрытие пока не подтверждено. Можно повторить.');}}
   catch{if(own())note('Не удалось проверить закрытие. Проверь связь и попробуй ещё раз.',true);}
   finally{loading(false);}
  }
  async function hide(){
   if(!own()||busy||uncertain||!snapshot)return;loading(true);status.hidden=true;
   try{const data=await request('POST',{kod:code,kontekst_nastroek:snapshot.kontekst_nastroek});if(own()){if(data?.skryto!==true||data.kod!==code)throw Error('Закрытие не подтверждено');apply(data);}}
   catch{
    if(own())try{const data=await request('GET');if(own()&&apply(data))note('Закрытие пока не подтверждено. Можно повторить.');}
    catch{if(own())note('Не удалось подтвердить закрытие. Сначала проверим его состояние.',true);}
   }finally{loading(false);}
  }
  close.addEventListener('click',hide);retry.addEventListener('click',check);
                                                                                      
  const instance={stop};instances.set(key,instance);request('GET').then(data=>{if(own())apply(data);}).catch(()=>{instances.delete(key);});
  addEventListener('pagehide',stop,{once:true});return instance;
 }
 window.LocusContextHints={mount,preview};
})();
