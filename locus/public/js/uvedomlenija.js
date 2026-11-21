(function(){
 'use strict';
 const root=document.getElementById('spisok'),chips=[...document.querySelectorAll('[data-uv-srez]')];
 let srez=new URLSearchParams(location.search).get('srez')==='prochitannye'?'prochitannye':'novye';
 let rows=[],page=0,total=0,unread=null,loaded=false,loading=false,error='',sequence=0,controller;
 const pending=new Set();
 const escape=O.ekranirovat;
 function time(value){
  const date=SPR.vremja(value);
  return !date?'':date.toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 }
 function draw(){
  chips.forEach(e=>{e.classList.toggle('on',e.dataset.uvSrez===srez);e.setAttribute('aria-pressed',String(e.dataset.uvSrez===srez));});
  document.getElementById('uv-n').textContent=unread===null?'':unread||'';
  root.setAttribute('aria-busy',String(loading));
  const status=error?'<div class="uv-status" role="status">'+escape(error)+' <button type="button" class="kn" data-uv-retry>повторить загрузку</button></div>':'';
  root.innerHTML=status+rows.map(u=>{
   const disabled=pending.has(u.id);
   return '<div class="uv-ob" data-uved-ob="'+u.id+'"><a class="uv-s'+(u.prochitano?' proch':'')+'" '
    +(u.adres?'href="'+escape(u.adres)+'"':'role="button" tabindex="0"')+' data-uved="'+u.id+'">'
    +'<span class="uv-t"></span><span class="uv-content"><span class="uv-im uv-clamp">'+O.tekstUvedomlenija(u)+'</span>'
    +(u.pojasnenie?'<span class="uv-p">'+escape(u.pojasnenie)+'</span>':'')+'</span>'
    +'<time class="uv-kogda">'+escape(time(u.sozdano))+'</time></a>'
    +'<button type="button" class="uv-expand" data-uv-expand="'+u.id+'" aria-expanded="false" hidden>показать целиком</button>'
    +'<button type="button" class="uv-svajp" data-uv-otm="'+u.id+'" data-stalo="'+(u.prochitano?'':'1')+'"'+(disabled?' disabled':'')+'>'
    +(u.prochitano?'не прочитано':'прочитано')+'</button></div>';
  }).join('')+(!rows.length&&!error?'<div class="pusto" style="padding:40px 0"><div class="pusto-z">'
    +(!loaded?'Загрузка уведомлений':srez==='novye'?'Непрочитанных нет':'Прочитанных нет')+'</div></div>':'')
    +(loaded&&rows.length<total?'<button type="button" class="kn uv-more" data-uv-more'+(loading?' disabled':'')+'>показать ещё</button>':'');
  root.querySelectorAll('[data-uved-ob]').forEach(ob=>{
   let start=null;
   ob.addEventListener('touchstart',e=>{const t=e.touches[0];start={x:t.clientX,y:t.clientY};},{passive:true});
   ob.addEventListener('touchmove',e=>{if(!start)return;const t=e.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
    if(Math.abs(dy)>Math.abs(dx)){start=null;return;}if(Math.abs(dx)>40){ob.classList.toggle('svajp',dx<0);start=null;}
   },{passive:true});
   ob.addEventListener('touchend',()=>{start=null;},{passive:true});
  });
  requestAnimationFrame(()=>root.querySelectorAll('.uv-ob').forEach(ob=>{
   const text=ob.querySelector('.uv-im'),button=ob.querySelector('[data-uv-expand]');
   if(button?.getAttribute('aria-expanded')==='false')button.hidden=text.scrollHeight<=text.clientHeight+1;
  }));
 }
 async function load(more=false){
  const own=++sequence;controller?.abort();controller=new AbortController();const active=controller;
  loading=true;error='';draw();const target=more?page+1:1;
  const timer=setTimeout(()=>active.abort(),15000);
  try{
   const response=await fetch('/api/uvedomlenija?'+new URLSearchParams({prochitano:srez==='novye'?'0':'1',na_stranice:50,stranica:target}),{signal:active.signal});
   if(!response.ok)throw new Error('ошибка '+response.status);
   const data=await response.json();if(own!==sequence)return;
   if(!Array.isArray(data.spisok)||!Number.isSafeInteger(data.vsego)||!Number.isSafeInteger(data.neprochitanyh))throw new Error('неполный ответ сервера');
   rows=more?[...new Map([...rows,...data.spisok].map(u=>[u.id,u])).values()]:data.spisok;
   page=target;total=data.vsego;unread=data.neprochitanyh;loaded=true;
  }catch(e){if(own===sequence)error='Не удалось загрузить уведомления. '+(rows.length?'Показан ранее загруженный список.':'Повтори загрузку.');}
  finally{clearTimeout(timer);if(own===sequence){loading=false;draw();}}
 }
 async function mark(id,value,link){
  if(pending.has(id))return;pending.add(id);
  const ob=root.querySelector('[data-uved-ob="'+id+'"]');ob?.setAttribute('aria-busy','true');ob?.querySelector('[data-uv-otm]')?.setAttribute('disabled','');
  try{
   await O.otmetitUvedomlenie(id,value);
   if(link){location.assign(link);return;}
   await load();
  }catch(e){
   error='Отметка не подтверждена. Обнови список перед повторной попыткой.';draw();
  }finally{pending.delete(id);const current=root.querySelector('[data-uved-ob="'+id+'"]');if(current){current.removeAttribute('aria-busy');current.querySelector('[data-uv-otm]')?.removeAttribute('disabled');}}
 }
 chips.forEach(chip=>chip.addEventListener('click',e=>{
  e.preventDefault();if(srez===chip.dataset.uvSrez)return;srez=chip.dataset.uvSrez;rows=[];page=total=0;loaded=false;
  const url=new URL(location.href);url.searchParams.set('srez',srez);history.replaceState(null,'',url);load();
 }));
 root.addEventListener('click',e=>{
  const markButton=e.target.closest('[data-uv-otm]');
  if(markButton){e.preventDefault();mark(Number(markButton.dataset.uvOtm),markButton.dataset.stalo==='1');return;}
  const expand=e.target.closest('[data-uv-expand]');
  if(expand){const open=expand.getAttribute('aria-expanded')!=='true';expand.setAttribute('aria-expanded',String(open));expand.textContent=open?'свернуть':'показать целиком';expand.closest('.uv-ob').querySelector('.uv-im').classList.toggle('uv-clamp',!open);return;}
  if(e.target.closest('[data-uv-more]')){load(true);return;}
  if(e.target.closest('[data-uv-retry]')){load();return;}
  const link=e.target.closest('[data-uved]');
  if(link&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&e.button===0){e.preventDefault();mark(Number(link.dataset.uved),true,link.getAttribute('href'));}
 });
 window.addEventListener('pagehide',()=>{sequence++;controller?.abort();});
 document.getElementById('menju').innerHTML=O.menju('Уведомления',{});O.vkljuchitSkvoznoe();load();
 SPR.zagruzit().then(s=>{window.DANNYE={napravlenija:s.napravlenija,ljudi:s.ljudi,statusy:s.statusy,tipy:s.tipy,zadachi:[]};}).catch(()=>{});
})();
