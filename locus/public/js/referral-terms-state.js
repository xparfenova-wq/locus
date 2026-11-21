(() => {
 'use strict';
 const states=new Map(),settled=new Set();
 const fields=['procent','procent_shkala','nalog','dogovor_nomer','dogovor_id','vyplacheno'];
 const positive=n=>Number.isSafeInteger(n)&&n>0;
 const uuid=n=>typeof n==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(n);
 const prefix=()=>`locus-referral-terms-intent:${API.ja}:`,draftKey=id=>`locus-referral-terms-draft:${API.ja}:${id}`;
 const storageKey=r=>prefix()+r.id+':'+r.key;
 const state=id=>{const key=API.ja+':'+id;if(!states.has(key))states.set(key,{busy:false,views:new Set()});return states.get(key);};
 function validBody(b){return b&&typeof b==='object'&&!Array.isArray(b)&&positive(b.versija)&&Object.keys(b).some(k=>fields.includes(k))&&Object.entries(b).every(([key,value])=>key==='versija'||fields.includes(key)&&(value===null||(typeof value==='string'||typeof value==='number'&&Number.isFinite(value))));}
 function valid(r){return r?.actor===API.ja&&positive(r.id)&&uuid(r.key)&&validBody(r.body);}
 function persist(key,value){const text=JSON.stringify(value);try{sessionStorage.setItem(key,text);if(sessionStorage.getItem(key)!==text)throw new Error();}catch{throw new Error('Браузер не смог сохранить проверку. Правка не отправлена, оставь форму открытой');}}
 function records(id){
  const result=[];
  for(let i=0;i<sessionStorage.length;i++){
   const name=sessionStorage.key(i);if(!name?.startsWith(prefix()))continue;
   const [rawId,key,...rest]=name.slice(prefix().length).split(':'),number=Number(rawId);
   if(!positive(number)||!uuid(key)||rest.length)throw new Error('Не читается ключ правки условий. Оставь вкладку открытой');
   let row;try{row=JSON.parse(sessionStorage.getItem(name));}catch{}
   const envelope={actor:API.ja,id:number,key};
   if(!row||row.actor!==envelope.actor||row.id!==number||row.key!==key)row={...envelope,body:null};
   if(!validBody(row.body))row={...row,body:null};
   if(id===undefined||number===id)result.push(row);
  }
  return result;
 }
 function button(label,click,marker){const node=document.createElement('button');node.type='button';node.className='kn';node.textContent=label;if(marker)node.dataset[marker]='1';node.addEventListener('click',click);return node;}
 function notices(){
  let rows;try{rows=records();}catch(error){const node=document.createElement('aside');node.className='locus-session-note';node.textContent=error.message;O.pendingCommandNote(node,'referral-terms-note');return;}
  if(!rows.length){if(window.LocusReferralTermsUndo?.notices())return;O.pendingCommandNote(null,'referral-terms-note');return;}
  const r=rows[0],node=document.createElement('aside'),text=document.createElement('span');node.className='locus-session-note';node.setAttribute('role','status');text.textContent='Есть непроверенная правка условий реферала.';
  const check=button('проверить условия',()=>O.referralTermsUi().then(()=>window.LocusReferralTermsRecovery.open(r)).catch(error=>O.tost(error.message)),'termsPending');check.disabled=state(r.id).busy;node.append(text,check);O.pendingCommandNote(node,'referral-terms-note');
 }
 function update(id){notices();for(const view of state(id).views)if(view.root.isConnected)view.render();else state(id).views.delete(view);}
 async function request(method,path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,path,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
 function current(row,id){if(!row||fields.some(key=>row[key]!==null&&row[key]!==undefined&&!(typeof row[key]==='string'||typeof row[key]==='number'&&Number.isFinite(row[key])))||row.id!==id||!positive(row.versija)||!positive(row.chelovek_id)||typeof row.napravlenie!=='string'||!['lid','klient','referal'].includes(row.rol)||!Object.hasOwn(row,'procent')||!Object.hasOwn(row,'vyplacheno')||row.skryto?.includes('dengi'))throw new Error('Текущие условия не подтверждены или недоступны');return row;}
 function proof(r,result){
  if(r.actor!==API.ja)throw new Error('Аккаунт изменился. Обнови страницу');
  if(!result||result.id!==r.id||!['ne_najdeno','otmeneno','sohraneno'].includes(result.sostojanie))throw new Error('Результат проверки условий не подтверждён');
  if(result.sostojanie==='sohraneno'){
   if(!positive(result.versija_sohranenija))throw new Error('Версия сохранения не подтверждена');
   if(result.udaleno===true){if(result.sotrudnichestvo!==undefined)throw new Error('Сотрудничество после удаления не подтверждено');}
   else if(current(result.sotrudnichestvo,r.id).versija<result.versija_sohranenija)throw new Error('Версия текущих условий не подтверждена');
  }
  return result;
 }
 async function refresh(r,result,options={}){try{if(options.after)await options.after(result);else document.dispatchEvent(new CustomEvent('locus:referral-terms-changed',{detail:{id:r.id}}));}catch{O.tost('Условия изменены. Не удалось обновить карточку');}}
 async function finish(r,result,options={}){
  proof(r,result);if(result.sostojanie==='ne_najdeno')return false;
  const token=API.ja+':'+r.id+':'+r.key;if(settled.has(token))return true;
  sessionStorage.removeItem(storageKey(r));
  if(result.sostojanie==='sohraneno'&&!result.udaleno){let draft;try{draft=JSON.parse(sessionStorage.getItem(draftKey(r.id))||'null');}catch{}if(uuid(r.draftNonce)&&draft?.nonce===r.draftNonce&&draft.actor===API.ja&&draft.id===r.id)sessionStorage.removeItem(draftKey(r.id));}
  settled.add(token);
  for(const view of state(r.id).views)if(view.root.isConnected)view.onResolved?.(r.key,result);
  update(r.id);
  if(result.sostojanie==='sohraneno'){
   try{if(options.after)await options.after(result);else document.dispatchEvent(new CustomEvent('locus:referral-terms-changed',{detail:{id:r.id}}));}catch{O.tost('Условия сохранены. Не удалось обновить карточку');}
  }
  return true;
 }
 async function send(r,options={}){
  if(!valid(r))throw new Error('Поля правки не подтверждены');
  if(state(r.id).busy)return null;
  persist(storageKey(r),r);const scope=state(r.id);scope.busy=true;update(r.id);
  try{
   const row=current(await request('PATCH','/sotrudnichestva/'+r.id+'/uslovija',{...r.body,zapros_kljuch:r.key}),r.id);
   const result={sostojanie:'sohraneno',id:r.id,versija_sohranenija:row.versija_sohranenija||row.versija,sotrudnichestvo:row};
   await finish(r,result,options);return result;
  }finally{scope.busy=false;update(r.id);}
 }
 async function exclusive(id,fn){const scope=state(id);if(scope.busy)return null;scope.busy=true;update(id);try{return await fn();}finally{scope.busy=false;update(id);}}
 window.LocusReferralTermsState={fields,refresh,valid,validBody,uuid,positive,records,button,notices,request,current,proof,finish,send,exclusive,
  busy:id=>state(id).busy,subscribe:(id,view)=>{state(id).views.add(view);view.render();},
  draftText:id=>sessionStorage.getItem(draftKey(id)),draft:id=>JSON.parse(sessionStorage.getItem(draftKey(id))||'null'),storeDraft:(id,value)=>persist(draftKey(id),value),clearDraft:id=>sessionStorage.removeItem(draftKey(id))};
 notices();document.addEventListener('locus:session-restored',notices);
})();
