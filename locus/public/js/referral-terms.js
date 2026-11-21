(() => {
 'use strict';
 const S=window.LocusReferralTermsState;let opening=0;
 const labels={procent:'процент',procent_shkala:'шкала',nalog:'налог',dogovor_nomer:'номер договора',dogovor_id:'документ',vyplacheno:'ранее выплачено'};
 const values=row=>Object.fromEntries(S.fields.map(key=>[key,row[key]==null?'':String(row[key])]));
 const validValues=row=>row&&typeof row==='object'&&!Array.isArray(row)&&S.fields.every(key=>typeof row[key]==='string');
 const eligible=row=>row.rol==='referal'||row.rol==='klient'&&row.privodit_klientov===true;
 const changed=(mine,base)=>S.fields.filter(key=>mine[key]!==base[key]);
 function decimal(value,percent=false){
  const m=value.trim().match(/^(\d+)(?:[.,](\d+))?$/);if(!m)throw new Error(percent?'Процент: число от 0 до 100':'Ранее выплаченное: сумма от нуля, не больше двух знаков после запятой');
  const whole=m[1].replace(/^0+(?=\d)/,''),fraction=(m[2]||'').replace(/0+$/,'');
  if(percent){const n=Number(whole+(fraction?'.'+fraction:''));if(!Number.isFinite(n)||n>100||whole.length>3)throw new Error('Процент: число от 0 до 100');}
  else if(fraction.length>2||whole.length>14)throw new Error('Ранее выплаченное: точная сумма от нуля, не больше двух знаков после запятой');
  return whole+(fraction?'.'+fraction:'');
 }
 async function open(id,options={}){
  const existing=document.querySelector('.referral-terms-modal[data-terms-id="'+id+'"]');if(existing){existing.querySelector('input,button')?.focus();return {root:existing};}
  const serial=++opening;let row,pending;
  try{const undo=window.LocusReferralTermsUndo.records(id)[0];if(undo){window.LocusReferralTermsUndo.recover(undo,options);return;}pending=S.records(id)[0];if(pending){window.LocusReferralTermsRecovery.open(pending,options);return;}if(S.busy(id))return;row=S.current(await S.request('GET','/sotrudnichestva/'+id+'/uslovija'),id);if(!eligible(row))throw new Error('Условия доступны для реферального сотрудничества');if(!Array.isArray(row.dokumenty))throw new Error('Документы не загрузились');if(serial!==opening)return;}catch(error){O.tost(error.message);return;}
  let base=values(row),model={...base},version=row.versija,stale=null,issue=false,conflict=false,nonce=crypto.randomUUID(),closed=false;
  try{const saved=S.draft(id);if(saved){if(saved.actor!==API.ja||saved.id!==id||!S.positive(saved.version)||!validValues(saved.values)||!validValues(saved.base)||!S.uuid(saved.nonce))throw new Error();nonce=saved.nonce;if(saved.version===version){model={...saved.values};base={...saved.base};}else stale=saved;}}catch{issue=true;}
  const esc=O.ekranirovat;
  const close=O.modalka('Условия реферала',`<form class="l-form referral-terms-form" novalidate>
   <p data-terms-current></p><fieldset class="referral-terms-fields" data-terms-fields>
   <label class="l-field"><span class="l-label">процент числом</span><input class="l-input" inputmode="decimal" autocomplete="off" data-terms-field="procent"><small>От 0 до 100. Оставь пустым, если число не согласовано.</small></label>
   <label class="l-field"><span class="l-label">шкала процентов</span><textarea class="l-input" rows="2" data-terms-field="procent_shkala"></textarea><small>Договорные пороги. Если указано и число, расчёт идёт по числу, шкала остаётся подписью.</small></label>
   <label class="l-field"><span class="l-label">налог</span><select class="l-input" data-terms-field="nalog"><option value="">не согласовано</option><option value="do_vycheta">до вычета налога</option><option value="posle_vycheta">после вычета налога</option></select></label>
   <label class="l-field"><span class="l-label">номер договора</span><input class="l-input" autocomplete="off" data-terms-field="dogovor_nomer"><small data-terms-number-count></small></label>
   <label class="l-field"><span class="l-label">документ договора</span><select class="l-input" data-terms-field="dogovor_id"><option value="">без документа</option>${row.dokumenty.map(doc=>`<option value="${doc.id}">${esc([doc.nazvanie,doc.nomer].filter(Boolean).join(', ')||'документ '+doc.id)}</option>`).join('')}</select></label>
   <label class="l-field" data-terms-initial-paid><span class="l-label">раньше выплачено, ₽</span><input class="l-input" inputmode="decimal" autocomplete="off" data-terms-field="vyplacheno"><small>Прежний итог неизвестен. Укажи подтверждённую сумму, включая 0, или оставь неизвестным. Новую выплату отмечай отдельной кнопкой.</small></label>
   </fieldset><p role="status" aria-live="polite" data-terms-status></p><div class="tpl-actions" data-terms-more></div>
   <div class="mod-niz"><button type="button" class="kn" data-terms-confirm>Сохранить условия</button></div></form>`,null);
  const root=document.querySelector('.vyb-fon:last-of-type');root.classList.add('referral-terms-modal','referral-payout-modal');root.dataset.termsId=String(id);
  const form=root.querySelector('form'),status=root.querySelector('[data-terms-status]'),more=root.querySelector('[data-terms-more]'),confirm=root.querySelector('[data-terms-confirm]'),fieldset=root.querySelector('fieldset');
  const field=key=>root.querySelector('[data-terms-field="'+key+'"]');
  function read(){for(const key of S.fields)model[key]=field(key).value;return {...model};}
  function paint(){
   for(const key of S.fields){const node=field(key);if(key==='dogovor_id'){node.replaceChildren(new Option('без документа',''));for(const doc of row.dokumenty)node.append(new Option([doc.nazvanie,doc.nomer].filter(Boolean).join(', ')||'документ '+doc.id,String(doc.id)));}if(node.tagName==='SELECT'&&model[key]&&![...node.options].some(option=>option.value===model[key])){const option=document.createElement('option');option.value=model[key];option.textContent=key==='dogovor_id'?'сохранённый документ недоступен':'сохранено: '+model[key];node.append(option);}node.value=model[key];}
   root.querySelector('[data-terms-initial-paid]').hidden=row.vyplacheno!==null;
   root.querySelector('[data-terms-current]').textContent=row.vyplacheno===null?'Ранее выплаченное пока не указано.':'Ранее выплачено '+String(row.vyplacheno)+' ₽. Новую выплату отмечай отдельной кнопкой.';
   render();
  }
  function saveDraft(){if(closed||pending||S.busy(id)||stale||issue)return;read();nonce=crypto.randomUUID();S.storeDraft(id,{actor:API.ja,id,version,values:{...model},base:{...base},nonce});}
  function blocked(){return S.busy(id)||!!pending||!!stale||issue||conflict;}
  function render(){
   if(!root.isConnected)return;
   try{pending=S.records(id)[0]||null;}catch(error){status.textContent=error.message;issue=true;}
   fieldset.disabled=blocked();confirm.disabled=blocked();const proxy=root.querySelector('.vyb-g');if(proxy){proxy.setAttribute('aria-disabled',String(blocked()));proxy.setAttribute('aria-label','Сохранить условия');proxy.title='Сохранить условия';proxy.classList.toggle('referral-payout-disabled',blocked());}
   const length=[...model.dogovor_nomer].length;root.querySelector('[data-terms-number-count]').textContent=length+'/100';
   const kind=pending?'pending':issue?'issue':stale||conflict?'compare':'';
   if(more.dataset.kind!==kind){more.replaceChildren();more.dataset.kind=kind;if(pending)more.append(S.button('проверить правку',()=>window.LocusReferralTermsRecovery.open(pending,options),'termsCheck'));else if(issue)more.append(S.button('сбросить черновик после чтения',reset,'termsReset'));else if(stale||conflict)more.append(S.button('обновить и сравнить',compare,'termsCompare'));}
   more.querySelectorAll('button').forEach(button=>button.disabled=S.busy(id));
  }
  async function latest(){const fresh=S.current(await S.request('GET','/sotrudnichestva/'+id+'/uslovija'),id);if(!eligible(fresh)||!Array.isArray(fresh.dokumenty))throw new Error('Условия или роль изменились. Обнови карточку');return fresh;}
  async function reset(){try{const draftText=S.draftText(id),fresh=await latest();if(!root.isConnected||serial!==opening)return;if(S.draftText(id)!==draftText)throw new Error('Черновик уже изменился. Закрой и открой форму, чтобы увидеть актуальный ввод');S.clearDraft(id);row=fresh;version=fresh.versija;base=values(fresh);model={...base};stale=null;issue=false;conflict=false;paint();status.textContent='Черновик сброшен после чтения текущих условий';}catch(error){status.textContent=error.message;}}
  async function compare(){
   try{
    const draftText=S.draftText(id),own=stale||{values:read(),base:{...base}},fresh=await latest();if(!root.isConnected||serial!==opening)return;
    const current=values(fresh),keys=changed(own.values,own.base),done=O.modalka('Сравнить условия','<div class="tpl-compare" data-terms-comparison></div><div class="tpl-actions" data-terms-choices></div>',null,{poverh:true}),dialog=document.querySelector('.vyb-fon:last-of-type');dialog.classList.add('referral-terms-modal','referral-payout-modal');
    for(const key of S.fields){if(key==='vyplacheno'&&fresh.vyplacheno!==null&&!keys.includes(key))continue;const section=document.createElement('section'),title=document.createElement('strong'),saved=document.createElement('p'),mine=document.createElement('p');title.textContent=labels[key];saved.textContent='В карточке: '+(current[key]||'не указано');mine.textContent=keys.includes(key)?'Мой ввод: '+(own.values[key]||'не указано'):'В черновике это поле не менялось';section.append(title,saved,mine);dialog.querySelector('[data-terms-comparison]').append(section);}
    function choose(useMine){if(!root.isConnected||serial!==opening)return;if(S.draftText(id)!==draftText){status.textContent='Черновик уже изменился. Закрой и открой форму, чтобы увидеть актуальный ввод';done();return;}row=fresh;version=fresh.versija;base=current;model={...current};if(useMine)for(const key of keys)if(key!=='vyplacheno'||fresh.vyplacheno===null)model[key]=own.values[key];stale=null;conflict=false;issue=false;if(!useMine)S.clearDraft(id);paint();if(useMine)saveDraft();status.textContent=useMine?'Мой ввод загружен после сравнения. Проверь и сохрани отдельной кнопкой.':'Показаны сохранённые условия';done();}
    dialog.querySelector('[data-terms-choices]').append(S.button('вернуться',done),S.button('оставить условия карточки',()=>choose(false),'termsKeepCurrent'),S.button(fresh.vyplacheno!==null&&keys.includes('vyplacheno')?'оставить текущий итог, загрузить остальные правки':'загрузить мой ввод',()=>choose(true),'termsUseDraft'));
   }catch(error){status.textContent=error.message;}
  }
  function patch(){
   const result={versija:version};
   for(const key of changed(model,base)){
    const raw=model[key];if(key==='vyplacheno'&&row.vyplacheno!==null)continue;
    if(key==='procent'){result[key]=raw.trim()?decimal(raw,true):null;continue;}
    if(key==='vyplacheno'){if(raw.trim())result[key]=decimal(raw);continue;}
    if(key==='procent_shkala'&&[...raw].length>300)throw new Error('Шкала процентов: не больше 300 знаков');
    if(key==='dogovor_nomer'&&[...raw].length>100)throw new Error('Номер договора: не больше 100 знаков');
    if(key==='dogovor_id'){result[key]=raw?Number(raw):null;continue;}
    result[key]=raw.trim()?raw:null;
   }
   return result;
  }
  async function submit(event){
   event?.preventDefault();if(blocked())return;
   let body;try{read();body=patch();if(Object.keys(body).length===1){status.textContent='Условия не изменились';return;}saveDraft();}catch(error){status.textContent=error.message;return;}
   const attempt={actor:API.ja,id,key:crypto.randomUUID(),body,draftNonce:nonce};pending=attempt;
   try{const result=await S.send(attempt,options);if(!result)return;closed=true;if(root.isConnected)close();O.tost(result.sotrudnichestvo?.otmenena_posle_sohranenija?'Эта правка уже отменена. Показаны текущие условия':'Условия сохранены',result.sotrudnichestvo?.otmena_dostupna&&result.sotrudnichestvo?.dejstvie_id?()=>window.LocusReferralTermsUndo.undo(attempt,result.sotrudnichestvo,options).catch(error=>O.tost(error.message)):null);}
   catch(error){try{pending=S.records(id)[0]||null;}catch{issue=true;}conflict=error.kod===409;status.textContent=error.message+(pending?' Проверь результат или отмени попытку перед новой правкой.':'');render();}
  }
  form.addEventListener('input',()=>{if(!blocked())status.textContent='';read();try{saveDraft();}catch(error){status.textContent=error.message;}render();});form.addEventListener('change',()=>{if(!blocked())status.textContent='';read();try{saveDraft();}catch(error){status.textContent=error.message;}render();});form.addEventListener('submit',submit);confirm.addEventListener('click',submit);
  S.subscribe(id,{root,render,onResolved:(key,result)=>{if(pending?.key===key){pending=null;conflict=result.sostojanie==='otmeneno';status.textContent=result.sostojanie==='otmeneno'?'Попытка отменена, ввод сохранён. Проверь условия перед новой правкой.':'Условия сохранены';if(result.sostojanie==='sohraneno'){closed=true;if(root.isConnected)close();}}}});
  paint();if(stale)status.textContent='Карточка изменилась после сохранения черновика. Сначала сравни условия.';if(issue)status.textContent='Черновик не читается. Сброс доступен после чтения текущих условий.';if(!blocked())field('procent').focus({preventScroll:true});return {root,close};
 }
 window.LocusReferralTermsUi={open,notices:S.notices};S.notices();
})();
