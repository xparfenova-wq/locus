(() => {
 'use strict';
 const S=window.LocusReferralTermsState;
 function open(r,options={}){
  const close=O.modalka('Проверить условия реферала','<p data-terms-intent></p><p role="status" aria-live="polite" data-terms-recovery-status>Проверка читает результат без повторной правки.</p><div class="tpl-actions" data-terms-recovery-actions></div>',null,{poverh:true});
  const root=document.querySelector('.vyb-fon:last-of-type');root.classList.add('referral-terms-modal');
  const status=root.querySelector('[data-terms-recovery-status]'),intent=root.querySelector('[data-terms-intent]'),actions=root.querySelector('[data-terms-recovery-actions]');let missing=false;
  const view={root,render:()=>actions.querySelectorAll('button').forEach(b=>b.disabled=S.busy(r.id))};S.subscribe(r.id,view);
  function details(){
   if(!S.valid(r)){intent.textContent='Сохранённые поля не читаются. Доступны проверка и отмена попытки.';return;}
   const labels={procent:'процент',procent_shkala:'шкала',nalog:'налог',dogovor_nomer:'номер договора',dogovor_id:'документ',vyplacheno:'ранее выплачено'};
   intent.textContent=S.fields.filter(k=>Object.hasOwn(r.body,k)).map(k=>labels[k]+': '+(r.body[k]===null?'не указано':k==='nalog'?({do_vycheta:'до вычета',posle_vycheta:'после вычета'})[r.body[k]]||String(r.body[k]):String(r.body[k]))).join('. ');
  }
  function controls(){actions.replaceChildren(S.button('проверить',inspect,'termsRead'));if(missing&&S.valid(r))actions.append(S.button('повторить эту правку',retry,'termsRetry'));actions.append(S.button('отменить попытку',cancel,'termsCancel'));view.render();}
  function done(){actions.replaceChildren(S.button('закрыть',close,'termsRecoveryClose'));}
  function message(result){if(result.otmenena_posle_sohranenija||result.sotrudnichestvo?.otmenena_posle_sohranenija)return 'Эта правка была сохранена и затем отменена. Сейчас показаны актуальные условия.';return result.sostojanie==='otmeneno'?'Попытка отменена. Поздний запрос не изменит условия. Черновик сохранён.':result.udaleno?'Правка была сохранена, затем сотрудничество удалили. Повтор его не создаёт.':'Правка сохранена. Показаны текущие условия, включая более поздние изменения.';}
  async function inspect(){
   if(S.busy(r.id))return;missing=false;
   try{await S.exclusive(r.id,async()=>{
    const result=S.proof(r,await S.request('GET','/sotrudnichestva/'+r.id+'/proverka_uslovij?zapros_kljuch='+encodeURIComponent(r.key)));details();
    if(result.sostojanie==='ne_najdeno'){missing=true;status.textContent=S.valid(r)?'Правка пока не найдена. Можно явно повторить ту же попытку или отменить её.':'Правка пока не найдена. Поля не читаются; можно отменить попытку.';controls();}
    else{await S.finish(r,result,options);status.textContent=message(result);done();}
   });}catch(error){intent.textContent='';status.textContent='Проверка не завершена. '+error.message;controls();}finally{view.render();}
  }
  async function retry(){
   if(!missing||!S.valid(r)||S.busy(r.id))return;missing=false;controls();
   try{const result=await S.send(r,options);if(!result)return;status.textContent=message(result);done();}
   catch(error){status.textContent='Результат правки ещё не подтверждён. '+error.message;controls();}finally{view.render();}
  }
  async function cancel(){
   if(S.busy(r.id))return;missing=false;
   try{await S.exclusive(r.id,async()=>{
    const result=S.proof(r,await S.request('POST','/sotrudnichestva/'+r.id+'/otmena_uslovij',{zapros_kljuch:r.key}));
    if(result.sostojanie==='ne_najdeno')throw new Error('Отмена не подтверждена');
    await S.finish(r,result,options);status.textContent=message(result);done();
   });}catch(error){status.textContent='Ответ об отмене ещё не подтверждён. '+error.message;controls();}finally{view.render();}
  }
  controls();if(S.busy(r.id))status.textContent='Правка ещё выполняется. Проверка станет доступна после ответа.';else void inspect();
  return {root,close};
 }
 window.LocusReferralTermsRecovery={open};
})();
