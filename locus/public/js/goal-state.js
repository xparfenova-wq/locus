(function(){
'use strict';
const operations=new Map();
function mount(root,{goal,API,onChanged}){
  const key=`locus-goal-publication:${API.ja}:${goal.id}`;
  if(!operations.has(key))operations.set(key,{busy:false,message:'',views:new Set()});
  const operation=operations.get(key);
  for(const view of operation.views)if(!view.root.isConnected)operation.views.delete(view);
  let pending=false,storageFailed=false,current=goal;
  try{pending=sessionStorage.getItem(key)!==null;}catch{storageFailed=true;}
  root.classList.add('goal-publication');
  const note=document.createElement('span'),button=document.createElement('button'),status=document.createElement('span');
  button.type='button';button.className='kn';button.dataset.goalPublish=String(goal.id);
  status.className='goal-publication-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.replaceChildren(note,button,status);
  function render(){
    try{pending=sessionStorage.getItem(key)!==null;}catch{storageFailed=true;}
    note.textContent=current.sostojanie==='chernovik'?'Черновик, виден только тебе':current.sostojanie==='arhiv'?'Цель в архиве':current.sostojanie==='aktivna'?'Цель опубликована для команды':'Состояние цели №'+goal.id+' нужно проверить';
    button.hidden=current.sostojanie!=='chernovik'&&!pending;
    button.textContent=pending?'проверить публикацию':'опубликовать цель';button.disabled=operation.busy;
    status.textContent=operation.message;
    root.setAttribute('aria-busy',String(operation.busy));
    const card=root.closest('.cel');
    if(card)for(const node of card.querySelectorAll('.cel-telo > *'))if(node!==root)node.inert=operation.busy;
  }
  operation.views.add({root,render});
  function freeze(value){
    operation.busy=value;
    for(const view of operation.views){if(view.root.isConnected)view.render();else operation.views.delete(view);}
  }
  async function refresh(){
    try{await onChanged();}catch{operation.message+=' Не удалось обновить экран. Перезагрузи страницу.';}
  }
  button.addEventListener('click',async()=>{
    if(operation.busy)return;operation.message='';freeze(true);
    try{
      if(pending){
        const saved=await API.zapros('GET','/celi/'+goal.id);
        if(saved.id!==goal.id||!Number.isSafeInteger(saved.versija)||!['aktivna','chernovik','arhiv'].includes(saved.sostojanie))throw new Error('Не удалось подтвердить состояние цели');
        sessionStorage.removeItem(key);pending=false;current=saved;
        operation.message=saved.sostojanie==='aktivna'?'Публикация подтверждена':saved.sostojanie==='arhiv'?'Цель в архиве. Повторной публикации не было':'Цель осталась черновиком. Можно опубликовать её отдельным действием';
        window.O?.tost(operation.message);
        await refresh();return;
      }
      if(storageFailed)throw new Error('Не удалось сохранить проверку публикации. Разреши хранилище этой вкладки и обнови страницу');
                                                                          
                                                                 
      sessionStorage.setItem(key,JSON.stringify({actor:API.ja,id:goal.id,versija:current.versija}));pending=true;
      const saved=await API.pravit('celi',goal.id,{versija:current.versija,sostojanie:'aktivna'});
      if(saved.id!==goal.id||saved.sostojanie!=='aktivna')throw new Error('Ответ не подтвердил публикацию');
      current=saved;sessionStorage.removeItem(key);pending=false;operation.message='Цель опубликована для команды';
      await refresh();
    }catch(error){operation.message=pending?'Ответ не подтверждён. Проверь публикацию: '+error.message:'Публикация не отправлена: '+error.message;}
    finally{freeze(false);document.dispatchEvent(new CustomEvent('locus:history-layout'));}
  });
  render();
}
function mountPending(container,{visibleGoals,API,onChanged}){
  container.replaceChildren();
  const prefix=`locus-goal-publication:${API.ja}:`,ids=new Set(visibleGoals.map(goal=>goal.id)),pendingIDs=[];
  try{
    for(let i=0;i<sessionStorage.length;i++){
      const key=sessionStorage.key(i);if(!key?.startsWith(prefix))continue;
      const suffix=key.slice(prefix.length);if(!/^[1-9][0-9]*$/.test(suffix))continue;
      const id=Number(suffix);if(!Number.isSafeInteger(id)||ids.has(id))continue;
      pendingIDs.push(id);
    }
  }catch{                                                                 }
  for(const id of pendingIDs){
    const root=document.createElement('div');root.dataset.goalState=String(id);container.appendChild(root);
    mount(root,{goal:{id,sostojanie:'neizvestno'},API,onChanged});
  }
}
window.LocusGoalState={mount,mountPending};
})();
