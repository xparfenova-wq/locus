(function(){
'use strict';
const operations=new Map();
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validBody=body=>body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===3&&Object.keys(body).every(key=>['summa','zhdem_do','naznachenie'].includes(key))&&['number','string'].includes(typeof body.summa)&&/^[0-9]+(?:[.,][0-9]{1,2})?$/.test(String(body.summa))&&Number.isFinite(Number(body.summa))&&Number(body.summa)>0&&typeof body.zhdem_do==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(body.zhdem_do)&&(body.naznachenie===null||typeof body.naznachenie==='string');
function mount(root,{project,API,O,onChanged}){
 const parent=Number(project.id),prefix=`locus-payment-create:${API.ja}:${parent}:`;
 if(!operations.has(prefix))operations.set(prefix,{busy:false,views:new Set(),phase:'unknown',message:''});
 const operation=operations.get(prefix);
 for(const view of operation.views)if(!view.active())operation.views.delete(view);
 let modal=null;
 function pending(){
  const found=[];
  for(let i=0;i<sessionStorage.length;i++){
   const name=sessionStorage.key(i);if(!name?.startsWith(prefix))continue;
   const key=name.slice(prefix.length);if(!uuid(key))throw new Error('Не удалось прочитать ключ добавления в этой вкладке');
   let body=null;
   try{const data=JSON.parse(sessionStorage.getItem(name));if(data?.actor===API.ja&&data?.project===parent&&validBody(data.body))body=data.body;}catch{}
   found.push({name,key,body});
  }
  return found[0]||null;
 }
 function button(text,action){const node=document.createElement('button');node.type='button';node.className='kn';node.textContent=text;node.addEventListener('click',action);return node;}
 function render(){
  root.replaceChildren();root.classList.add('payment-create');root.setAttribute('aria-busy',String(operation.busy));
  let intent;try{intent=pending();}catch(error){const note=document.createElement('p');note.setAttribute('role','status');note.textContent=error.message;root.appendChild(note);return;}
  const note=document.createElement('span');note.className='payment-create-status';note.setAttribute('role','status');note.setAttribute('aria-live','polite');note.textContent=operation.message;
  if(intent){
   const check=button('проверить добавление',()=>verify(intent));check.dataset.paymentCreateCheck='';check.disabled=operation.busy;root.appendChild(check);
   if(operation.phase==='not_found'){
    if(intent.body){const retry=button('повторить добавление',()=>send(intent));retry.dataset.paymentCreateRetry='';retry.disabled=operation.busy;root.appendChild(retry);}
    const cancel=button('отменить добавление',()=>cancelPending(intent));cancel.dataset.paymentCreateCancel='';cancel.disabled=operation.busy;root.appendChild(cancel);
   }
   if(!note.textContent)note.textContent='Добавление ещё не подтверждено. Проверь результат перед новым платежом';
  }else{
   const add=button('добавить платёж',open);add.dataset.paymentCreateAdd='';add.disabled=operation.busy;root.appendChild(add);
  }
  root.appendChild(note);
  if(modal?.root.isConnected){
   const stored=Boolean(intent);modal.root.querySelector('.vyb-g').hidden=stored;modal.root.querySelector('.vyb-g').disabled=operation.busy;
   for(const field of modal.root.querySelectorAll('input,textarea')){field.disabled=stored||operation.busy;if(field.type!=='date')field.readOnly=stored||operation.busy;}
   modal.status.textContent=operation.message;
   modal.recovery.replaceChildren();
   if(stored){const check=button('проверить добавление',()=>verify(intent));check.disabled=operation.busy;modal.recovery.appendChild(check);}
  }
 }
 function update(){for(const view of operation.views){if(view.active())view.render();else operation.views.delete(view);}document.dispatchEvent(new CustomEvent('locus:history-layout'));}
 operation.views.add({root,render,active:()=>root.isConnected||Boolean(modal?.root.isConnected)});
 function busy(value){operation.busy=value;update();}
 async function refresh(message){
  O.tost(message);
  try{await onChanged();}catch{operation.message='Сохранено. Не удалось обновить карточку. Перезагрузи страницу';}
 }
 async function finish(intent,result){
  if(!['sozdano','otmeneno','udaleno','perenesen'].includes(result?.sostojanie))throw new Error('Не удалось подтвердить результат добавления');
  if(result.sostojanie==='sozdano'&&(!Number.isSafeInteger(result.id)||result.id!==result.platezh?.id||result.platezh.proekt_id!==parent))throw new Error('Проверка вернула другой платёж');
  sessionStorage.removeItem(intent.name);operation.phase='unknown';operation.message='';modal?.close();
  const message={sozdano:'Платёж добавлен. Текущая сумма и дата показаны в карточке',otmeneno:'Добавление отменено',udaleno:'Этот платёж уже был добавлен и затем удалён',perenesen:'Этот платёж уже перенесён в другой проект'}[result.sostojanie];
  await refresh(message);
 }
 async function verify(intent){
  if(operation.busy)return;operation.message='Проверяю добавление…';busy(true);
  try{
   const result=await API.zapros('GET',`/proekty/${parent}/platezhi?zapros_kljuch=${encodeURIComponent(intent.key)}`);
   if(result.sostojanie==='ne_najdeno'){operation.phase='not_found';operation.message=intent.body?'Платёж пока не найден. Можно повторить добавление или отменить его':'Платёж пока не найден. Данные формы не читаются; можно отменить это добавление';}
   else await finish(intent,result);
  }catch(error){operation.message='Не удалось проверить добавление: '+error.message;}
  finally{busy(false);}
 }
 async function cancelPending(intent){
  if(operation.busy)return;operation.message='Отменяю неподтверждённое добавление…';busy(true);
  try{await finish(intent,await API.dejstvie(`/proekty/${parent}/platezhi`,{zapros_kljuch:intent.key,otmenit_dobavlenie:true}));}
  catch(error){operation.phase='unknown';operation.message='Ответ об отмене не подтверждён. Проверь результат: '+error.message;}
  finally{busy(false);}
 }
 async function send(intent){
  if(operation.busy)return false;if(!intent.body)throw new Error('Данные формы не читаются. Сначала проверь добавление');
  operation.phase='unknown';operation.message='Сохраняю платёж…';busy(true);
  try{
   const row=await API.dejstvie(`/proekty/${parent}/platezhi`,{...intent.body,zapros_kljuch:intent.key});
   await finish(intent,{sostojanie:'sozdano',id:row.id,platezh:row});return true;
  }catch(error){operation.message='Ответ не подтверждён. Проверь добавление: '+error.message;return false;}
  finally{busy(false);}
 }
 function open(){
  if(operation.busy)return;
  try{if(pending()){update();return;}}catch(error){operation.message=error.message;update();return;}
  const close=O.modalka('Добавить платёж',`<form class="l-form payment-create-form">
   <label class="l-field l-field-wide"><span class="l-label">сумма, ₽</span><input id="pc-sum" inputmode="decimal" autocomplete="off" required></label>
   <label class="l-field l-field-wide"><span class="l-label">когда ждём</span><input id="pc-date" type="date" required></label>
   <label class="l-field l-field-wide"><span class="l-label">назначение, необязательно</span><textarea id="pc-purpose" rows="2" placeholder="первый этап, за октябрь"></textarea></label>
   <p class="payment-create-form-status" role="status" aria-live="polite"></p><div class="payment-create-recovery"></div>
   <p class="payment-create-help">Платёж появится отдельной строкой. Когда деньги поступят, отметь «пришло»</p>
  </form>`,null,{znak:'+',podskazka:'добавить платёж',gotovo:async()=>{
   if(operation.busy)throw new Error('Дождись результата добавления');
   if(pending())throw new Error('Сначала проверь добавление');
   const form=modal.root.querySelector('form');if(!form.reportValidity())throw new Error('Заполни сумму и дату');
   const text=form.querySelector('#pc-sum').value.trim().replace(/\s/g,''),amount=Number(text.replace(',','.'));
   if(!/^[0-9]+(?:[.,][0-9]{1,2})?$/.test(text)||!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(Math.round(amount*100)))throw new Error('Нужна положительная сумма, не больше двух знаков после запятой');
   const date=form.querySelector('#pc-date').value;if(!date)throw new Error('Выбери дату ожидаемого платежа');
   const body={summa:text.replace(',','.'),zhdem_do:date,naznachenie:form.querySelector('#pc-purpose').value.trim()||null};
   const key=API.kljuchZaprosa(),name=prefix+key;
   try{sessionStorage.setItem(name,JSON.stringify({actor:API.ja,project:parent,body}));}catch{operation.message='Браузер не смог сохранить добавление. Платёж не отправлен';update();throw new Error(operation.message);}
   if(!await send({name,key,body}))throw new Error('Проверь добавление перед новым платежом');
  }});
  const form=document.getElementById('pc-sum').closest('form'),modalRoot=form.closest('.vyb-fon');modal={root:modalRoot,close,status:form.querySelector('.payment-create-form-status'),recovery:form.querySelector('.payment-create-recovery')};
  form.querySelector('#pc-date').value=window.SPR?.segodnja?.()||new Date().toISOString().slice(0,10);
  form.addEventListener('submit',event=>{event.preventDefault();if(!operation.busy)modalRoot.querySelector('.vyb-g').click();});
  form.querySelector('#pc-sum').focus();
 }
 render();
}
window.LocusPaymentCreate={mount};
})();
