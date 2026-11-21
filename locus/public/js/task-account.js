(function(){
'use strict';
function mount({button,hint,read,select,platform,dirty,locked}){
 if(button.locusTaskAccount)return button.locusTaskAccount;
 let scope=null,sequence=0,rows=[],pending=null,state='idle',manualScope=null,requestController=null,lastContext=null;
 const current=()=>read(),label=id=>rows.find(row=>row.id===Number(id))?.nazvanie||String(id),text=value=>{const node=button.querySelector('.sozd-t');if(node)node.textContent=value;button.classList.toggle('vybrano',Boolean(value));};
 const note=value=>{hint.replaceChildren();hint.textContent=value||'';hint.hidden=!value;};
 function actions(message=null){
  note(message);hint.hidden=false;const ctx=current(),address=new URL(ctx.tip==='klientskaja'?'/klient.html':'/napravlenija.html',location.origin);if(ctx.tip==='klientskaja')address.searchParams.set('id',String(ctx.klient_id));else address.searchParams.set('vkladka','socseti');address.searchParams.set('napravlenie',ctx.napravlenie);address.searchParams.set('dobavit_akkaunt','1');if(ctx.ploshadka)address.searchParams.set('ploshadka',ctx.ploshadka);
  const add=document.createElement('a');add.href=address.pathname+address.search;add.target='_blank';add.rel='noopener noreferrer';add.textContent='добавить аккаунт';add.className='account-create-link';add.setAttribute('aria-label','Добавить аккаунт в новой вкладке; черновик задачи останется здесь');add.dataset.taskAccountAdd='1';const reload=document.createElement('button');reload.type='button';reload.className='kn';reload.textContent='обновить аккаунты';reload.dataset.taskAccountRefresh='1';reload.addEventListener('click',()=>refresh({force:true}).catch(()=>{}));hint.append(' ',add,' ',reload);
 }
 function empty(){actions('Аккаунтов для этого выбора пока нет. Задачу можно создать без аккаунта.');}
 const busy=enabled=>{button.classList.toggle('zhdjot',enabled);button.setAttribute('aria-busy',String(enabled));button.setAttribute('aria-disabled',String(enabled));};
 const choose=id=>{select(id==null?null:Number(id));text(id==null?'':label(id));};
 const picker=O.vypadajuschij(button,()=>[{kod:'',imja:'без аккаунта'},...rows.map(row=>({kod:String(row.id),imja:row.nazvanie}))],null);
 picker.addEventListener('click',event=>{const option=event.target.closest('.vyp-p');if(!option||state!=='ready')return;const id=option.dataset.kod?Number(option.dataset.kod):null,account=rows.find(row=>row.id===id);if(account&&!current().ploshadka)platform(account.ploshadka);manualScope=current().scope;choose(id);dirty();actions();});
 function reset(){sequence++;requestController?.abort();requestController=null;scope=null;rows=[];pending=null;state='idle';manualScope=null;lastContext=null;busy(false);note(null);text('');}
 function preserve(){manualScope=current().scope;}
 function refresh({force=false,preserveScope=null}={}){
  const ctx=current(),key=ctx.scope;if(preserveScope===key)manualScope=key;
  if(!force&&scope===key){if(pending)return pending;if(state==='ready'||state==='waiting')return Promise.resolve(rows);}
  const token=++sequence;requestController?.abort();const previous=lastContext;lastContext=ctx;scope=key;rows=[];let removedBefore=false;
  if(!locked()&&ctx.akkaunt_id!=null&&previous&&((previous.tip==='klientskaja')!==(ctx.tip==='klientskaja')||previous.napravlenie!==ctx.napravlenie||ctx.tip==='klientskaja'&&previous.klient_id!==ctx.klient_id||previous.ploshadka!==ctx.ploshadka)){choose(null);removedBefore=true;O.tost('Аккаунт убран: изменился клиент, направление или площадка.');}
  if(!ctx.napravlenie||ctx.tip==='klientskaja'&&!ctx.klient_id){state='waiting';pending=null;if(!locked())choose(null);busy(true);note(ctx.tip==='klientskaja'&&!ctx.klient_id?'Выбери клиента перед аккаунтом.':'Выбери направление перед аккаунтом.');return Promise.resolve([]);}
  state='loading';busy(true);note('Загружаю аккаунты…');
  const query={tip:ctx.tip,napravlenie:ctx.napravlenie,...(ctx.tip==='klientskaja'?{klient_id:ctx.klient_id}:{}),...(ctx.ploshadka?{ploshadka:ctx.ploshadka}:{})};
  const controller=new AbortController();requestController=controller;const timer=setTimeout(()=>controller.abort(),12000);
  const request=API.zapros('GET','/akkaunty/dlja_zadachi?'+new URLSearchParams(query),undefined,{signal:controller.signal}).then(result=>{
   if(token!==sequence||current().scope!==key||!button.isConnected)return [];
   if(!Array.isArray(result.spisok)||typeof result.podstavit!=='boolean'||result.vsego!==result.spisok.length||result.podstavit!==(result.spisok.length===1))throw new Error('Список аккаунтов не подтверждён. Повтори загрузку.');
   rows=result.spisok;state='ready';busy(false);
   const selected=current().akkaunt_id,account=rows.find(row=>row.id===Number(selected));
   if(locked()){if(account)text(account.nazvanie);note('Сначала проверь незавершённое сохранение задачи.');return rows;}
   let removed=removedBefore;const missingSelection=selected!=null&&!account;if(missingSelection){choose(null);manualScope=key;removed=true;O.tost('Аккаунт убран: он не относится к выбранному клиенту, направлению или площадке.');}else if(account)text(account.nazvanie);
   if(!missingSelection&&current().akkaunt_id==null&&ctx.ploshadka&&result.podstavit&&manualScope!==key)choose(rows[0].id);
   if(!rows.length)empty();else actions(removed&&current().akkaunt_id==null?'Выбери аккаунт для нового клиента, направления или площадки.':null);
   return rows;
  }).catch(error=>{if(token!==sequence||current().scope!==key)return [];if(error.name==='AbortError')error=new Error('Аккаунты не загрузились. Повтори загрузку.');if(token===sequence&&current().scope===key){state='error';busy(true);note(error.message||'Не удалось загрузить аккаунты.');const retry=document.createElement('button');retry.type='button';retry.className='kn';retry.textContent='повторить загрузку';retry.addEventListener('click',()=>refresh({force:true}).catch(()=>{}));hint.append(' ',retry);}throw error;}).finally(()=>{clearTimeout(timer);if(requestController===controller)requestController=null;if(token===sequence)pending=null;});
  pending=request;return request;
 }
 const controller={refresh,reset,preserve,label,get state(){return state;},get scope(){return scope;},get accounts(){return rows;}};button.locusTaskAccount=controller;return controller;
}
window.LocusTaskAccount={mount};
})();
