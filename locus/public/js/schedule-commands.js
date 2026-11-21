(function(){
 'use strict';
 function create({API,O,onSaved,onCancelled,onUnconfirmed}){
  const actor=Number(API.ja),prefix='locus-schedule-command-v1:',storage=sessionStorage;let busy=false,invalidSession=false;const lastCommands=new Map();
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
  function guard(){if(invalidSession||Number(API.ja)!==actor)throw Error('Вход изменился. Обнови страницу');}
  function slot(owner,week){return prefix+actor+':'+owner+':'+week;}
  function valid(v){return v&&v.actor===actor&&Number.isSafeInteger(v.owner)&&v.owner>0&&/^\d{4}-W\d{2}$/.test(v.week)&&uuid(v.key)&&['sohranit','kopirovat','otmenit'].includes(v.kind)&&v.body?.zapros_kljuch===v.key&&v.body.chelovek_id===v.owner&&(v.kind==='kopirovat'?v.body.v:v.body.nedelja)===v.week;}
  function pending(owner,week){guard();let raw;try{raw=storage.getItem(slot(owner,week));}catch{throw Error('Браузер не даёт прочитать проверку сохранения');}if(raw===null)return null;let value;try{value=JSON.parse(raw);}catch{throw Error('Не удалось прочитать предыдущую попытку. Автоматически её не повторяем');}if(!valid(value)||value.owner!==owner||value.week!==week)throw Error('Контекст предыдущей попытки не подтверждён');return value;}
  function reserve(kind,body,before){guard();const owner=body.chelovek_id,week=kind==='kopirovat'?body.v:body.nedelja;if(pending(owner,week))throw Error('Сначала проверь результат предыдущей попытки');const key=crypto.randomUUID(),item={actor,owner,week,key,kind,body:{...body,zapros_kljuch:key},before:before||[]};if(!valid(item))throw Error('Не удалось подготовить сохранение графика');try{const data=JSON.stringify(item),name=slot(owner,week);storage.setItem(name,data);if(storage.getItem(name)!==data)throw Error();}catch{throw Error('Браузер не сохранил проверку. '+(kind==='otmenit'?'Отмена не отправлена':'График не отправлен'));}return item;}
  function same(item,r){return r?.obekt==='grafik'&&r.avtor_id===actor&&r.chelovek_id===item.owner&&r.god===Number(item.week.slice(0,4))&&r.nedelja===Number(item.week.slice(-2))&&r.zapros_kljuch===item.key&&(!r.dejstvie||r.dejstvie===item.kind);}
  async function request(method,url,body){guard();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await API.zapros(method,url,body,{signal:controller.signal});}finally{clearTimeout(timer);}}
  const query=item=>new URLSearchParams({chelovek_id:item.owner,nedelja:item.week,zapros_kljuch:item.key});
  function seedLast(owner,week,value){
   guard();if(value===null||value===undefined){lastCommands.set(slot(owner,week),null);return;}
   if(value.obekt!=='grafik'||value.avtor_id!==actor||value.chelovek_id!==owner||value.god!==Number(week.slice(0,4))||value.nedelja!==Number(week.slice(-2))||!uuid(value.zapros_kljuch)||!['sohranit','kopirovat'].includes(value.dejstvie)||!Number.isInteger(value.izmeneno_dnej)||value.izmeneno_dnej<0||value.izmeneno_dnej>7||typeof value.otmena_dostupna!=='boolean')throw Error('Последнее сохранение относится к другому графику');
   lastCommands.set(slot(owner,week),value.otmena_dostupna?Object.freeze({...value}):null);
  }
  function last(owner,week){guard();return lastCommands.get(slot(owner,week))||null;}
  function unknown(item,cause){const error=Object.assign(Error('Ответ о действии не получен. Проверь результат перед повтором'),{pending:true,item,cause});try{onUnconfirmed?.(error);}catch{}return error;}
  async function complete(item,result){guard();if(!same(item,result)||!['sohraneno','otmeneno'].includes(result.sostojanie))throw Error('Ответ не подтвердил эту неделю');if(result.sostojanie==='sohraneno'){if(item.kind==='otmenit'){if(result.ishodnyj_kljuch!==item.body.ishodnyj_kljuch)throw Error('Ответ относится к другой отмене');if(last(item.owner,item.week)?.zapros_kljuch===item.body.ishodnyj_kljuch)seedLast(item.owner,item.week,null);}else if(result.otmena_dostupna&&!result.vernuto)seedLast(item.owner,item.week,{...result,izmeneno_dnej:item.kind==='kopirovat'?result.skopirovano:result.izmeneno_dnej});else seedLast(item.owner,item.week,null);}let cleanupFailed=false;try{storage.removeItem(slot(item.owner,item.week));if(storage.getItem(slot(item.owner,item.week))!==null)throw Error();}catch{cleanupFailed=true;}
   const outcome={item,result,cleanupFailed};try{if(result.sostojanie==='sohraneno')await onSaved?.(outcome);else await onCancelled?.(outcome);}catch{outcome.refreshFailed=true;O.tost(result.sostojanie==='sohraneno'?'График сохранён. Обнови страницу, чтобы прочитать его':'Попытка отменена. Обнови страницу перед новой правкой');}return outcome;
  }
  async function send(kind,body,before){if(busy)throw Error('Предыдущее действие ещё идёт');const item=reserve(kind,body,before);busy=true;
   try{return await complete(item,await request('POST','/grafik/'+kind,item.body));}
   catch(error){
    if(error.kod>=400&&error.kod<500&&![401,403,404].includes(error.kod)){
     try{const result=await request('POST','/grafik/otmena_popytki',{chelovek_id:item.owner,nedelja:item.week,zapros_kljuch:item.key,dejstvie:item.kind});if(!same(item,result))throw Error();if(result.sostojanie==='sohraneno')return await complete(item,result);await complete(item,result);}catch(checkError){throw unknown(item,checkError);}
     throw error;
    }
    throw unknown(item,error);
   }finally{busy=false;}
  }
  function recover(owner,week){let item;try{item=pending(owner,week);}catch(e){O.tost(e.message);return;}if(!item){O.tost('Неподтверждённых попыток для этой недели нет');return;}
   const close=O.modalka('Проверить сохранение графика','<div class="schedule-command-check"><p>Проверим '+(item.kind==='kopirovat'?'копирование':item.kind==='otmenit'?'отмену':'сохранение')+' недели '+O.ekranirovat(item.week)+'. Повторная отправка произойдёт только по твоему выбору</p><p data-schedule-command-status role="status" aria-live="polite"></p><div class="schedule-command-buttons"><button type="button" class="kn" data-schedule-command="check">проверить</button><button type="button" class="kn" data-schedule-command="retry" hidden>повторить эту попытку</button><button type="button" class="kn" data-schedule-command="cancel">отменить попытку</button></div></div>'),root=document.querySelector('.vyb-fon:last-of-type'),status=root.querySelector('[data-schedule-command-status]');let loading=false;
   async function run(action){if(loading||busy)return;loading=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
     const result=action==='retry'?await request('POST','/grafik/'+item.kind,item.body):action==='cancel'?await request('POST','/grafik/otmena_popytki',{chelovek_id:item.owner,nedelja:item.week,zapros_kljuch:item.key,dejstvie:item.kind}):await request('GET','/grafik/'+(item.kind==='otmenit'?'otmena_proverka':'proverka')+'?'+query(item));
     if(!same(item,result))throw Error('Ответ относится к другому графику');
     if(result.sostojanie==='ne_najdeno'){status.textContent='Сохранение пока не найдено. Можно повторить именно эту попытку или отменить её, чтобы поздний запрос уже ничего не изменил';root.querySelector('[data-schedule-command="retry"]').hidden=false;}
     else{await complete(item,result);close();O.tost(result.sostojanie==='sohraneno'?(item.kind==='otmenit'?'Предыдущий график возвращён':'Сохранение графика подтверждено'):'Попытка остановлена. Поздний запрос не изменит график');}
    }catch(error){status.textContent=error.message||'Не удалось проверить сохранение';status.className='schedule-error';if([401,403,404].includes(error.kod))root.querySelector('[data-schedule-command="retry"]').hidden=true;}
    finally{loading=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}
   }
   root.querySelectorAll('[data-schedule-command]').forEach(button=>button.onclick=()=>run(button.dataset.scheduleCommand));run('check');
  }
  async function undo(owner,week,label){
   try{guard();if(busy)throw Error('Предыдущее действие ещё идёт');if(pending(owner,week)){recover(owner,week);return;}
    const response=await request('GET','/grafik/poslednee_dejstvie?'+new URLSearchParams({chelovek_id:owner,nedelja:week}));
    if(response.obekt!=='grafik'||response.avtor_id!==actor||response.chelovek_id!==owner||response.god!==Number(week.slice(0,4))||response.nedelja!==Number(week.slice(-2)))throw Error('Ответ относится к другой неделе');
    seedLast(owner,week,response.poslednee);const original=last(owner,week);if(!original){O.tost('Для этой недели нет сохранения, которое можно вернуть');return;}
    const close=O.modalka('Вернуть предыдущий график','<div class="schedule-command-check"><p>'+O.ekranirovat(label||'Выбранный участник')+' — '+O.ekranirovat(week)+'</p><p>Вернём предыдущее состояние '+original.izmeneno_dnej+' '+O.skolko(original.izmeneno_dnej,'дня','дней','дней')+' этого сохранения. Добавленные им дни будут убраны. Если связанные данные уже изменили, вся отмена остановится</p><p class="schedule-error" data-schedule-undo-status role="status"></p><div class="schedule-command-buttons"><button type="button" class="kn tmn" data-schedule-undo-confirm>вернуть предыдущий график</button><button type="button" class="kn" data-schedule-undo-close>оставить как есть</button></div></div>'),root=document.querySelector('.vyb-fon:last-of-type'),button=root.querySelector('[data-schedule-undo-confirm]');root.querySelector('[data-schedule-undo-close]').onclick=close;
    button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{const out=await send('otmenit',{chelovek_id:owner,nedelja:week,ishodnyj_kljuch:original.zapros_kljuch});close();O.tost(out.result.sostojanie==='sohraneno'?'Предыдущий график возвращён':'Попытка отмены остановлена');}catch(e){if(e.pending){close();recover(owner,week);}else{root.querySelector('[data-schedule-undo-status]').textContent=e.message;button.disabled=false;}}};
   }catch(error){O.tost(error.message||'Не удалось проверить отмену');}
  }
  function clearPrivate(){invalidSession=true;lastCommands.clear();try{for(let i=storage.length-1;i>=0;i--){const name=storage.key(i);if(name?.startsWith(prefix))storage.removeItem(name);}}catch{}}
  document.addEventListener('locus:session-changed',clearPrivate);
                                                                            
  try{for(let i=storage.length-1;i>=0;i--){const name=storage.key(i);if(name?.startsWith(prefix)&&!name.startsWith(prefix+actor+':'))storage.removeItem(name);}}catch{}
  return {pending,send,recover,seedLast,last,undo,isBusy:()=>busy};
 }
 window.LocusScheduleCommands={create};
})();
