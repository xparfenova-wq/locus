(() => {
 'use strict';
 function mount(root,{task,initial,day}){
  const host=root.querySelector('#kz-pz-list'),counter=root.querySelector('#kz-pz-schet');
  if(!host)return {dispose(){},async reveal(){return false;}};
  const list=document.createElement('div'),status=document.createElement('p'),actions=document.createElement('div');status.className='kz-kom-net';status.dataset.taskChildrenStatus='1';status.setAttribute('role','status');status.setAttribute('aria-live','polite');actions.className='pv-command-actions';
  const more=document.createElement('button');more.type='button';more.className='kn';more.dataset.taskChildrenMore='1';const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.dataset.taskChildrenRetry='1';retry.textContent='повторить загрузку';actions.append(more,retry);host.replaceChildren(list,status,actions);
  let disposed=false,loading=false,page=0,pages=1,total=0,loaded=false,failedPage=1,controller,sequence=0;const seen=new Set();
  const connected=()=>!disposed&&root.isConnected;
  function controls(){
   more.hidden=!loaded||page>=pages||!retry.hidden;more.disabled=retry.disabled=loading;
   more.textContent='ещё '+Math.max(0,total-seen.size);more.setAttribute('aria-busy',String(loading));
  }
  function accept(data,requested,reset){
   if(!Array.isArray(data?.spisok)||!Number.isSafeInteger(data.vsego)||data.vsego<0||!Number.isInteger(data.stranic)||data.stranic<0||data.stranica!==requested||data.spisok.some(r=>!Number.isSafeInteger(r.id)||!Number.isSafeInteger(r.nomer)||r.roditel_id!==task.id))throw new Error('список подзадач не подтверждён');
   if(reset){seen.clear();list.replaceChildren();}
   for(const row of data.spisok)if(!seen.has(row.id)){seen.add(row.id);list.insertAdjacentHTML('beforeend',O.strokaZadachi(SPR.dlja_ekrana(row),{podzadacha:true}));}
   total=data.vsego;page=data.stranica;pages=data.stranic;loaded=true;status.textContent='';retry.hidden=true;
   if(!seen.size){const empty=document.createElement('div');empty.className='kz-kom-net';empty.textContent='Подзадач нет';list.replaceChildren(empty);}
   if(page>=pages&&seen.size!==total){status.textContent='Список изменился. Обнови подзадачи, чтобы увидеть все.';retry.textContent='обновить подзадачи';retry.hidden=false;failedPage=1;}
   counter.textContent=total?String(total):'';O.ponumerovat(list);controls();
  }
  async function load(requested=1){
   if(!connected()||loading)return;loading=true;failedPage=requested;controller?.abort();controller=new AbortController();const current=++sequence,timer=setTimeout(()=>controller.abort(),12000);controls();
   status.textContent=loaded?'Загружаются подзадачи':'Загружается список подзадач';
   try{
    const params=new URLSearchParams({roditel_id:String(task.id),na_stranice:'50',stranica:String(requested),...(day?{den_konteksta:day}:{})});
    const data=await API.zapros('GET','/zadachi?'+params,undefined,{signal:controller.signal});if(connected()&&sequence===current)accept(data,requested,requested===1);
   }catch{
    if(connected()&&sequence===current){status.textContent=loaded?'Не удалось загрузить подзадачи. Показан предыдущий список.':'Не удалось загрузить подзадачи. Повтори загрузку.';retry.textContent='повторить загрузку';retry.hidden=false;}
   }finally{clearTimeout(timer);if(sequence===current){loading=false;if(connected())controls();}}
  }
  more.onclick=()=>load(page+1);retry.onclick=()=>load(failedPage);
  if(initial){try{accept(initial,1,true);}catch{status.textContent='Не удалось загрузить подзадачи. Повтори загрузку.';retry.hidden=false;controls();}}else{status.textContent='Загружается список подзадач';retry.hidden=true;controls();}
  return {
   dispose(){disposed=true;sequence++;controller?.abort();},
   refresh(){controller?.abort();sequence++;loading=false;return load(1);},
   async reveal(number){if(!connected()||!loaded)return false;while(connected()&&page<pages){if(list.querySelector('.zs[data-nomer="'+Number(number)+'"]'))return true;const previous=page;await load(page+1);if(page===previous)return false;}return Boolean(list.querySelector('.zs[data-nomer="'+Number(number)+'"]'));},
  };
 }
 window.LocusTaskChildren={mount};
})();
