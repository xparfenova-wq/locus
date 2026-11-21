(function(){
'use strict';
                                                                                 
function privjazat(root,options){
 let state=null,ignoreClickUntil=0;
 const rows=()=>[...root.querySelectorAll('[data-kontakt-row]')];
 const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
 function clean(){
  const old=state;state=null;if(!old)return;clearTimeout(old.timer);cancelAnimationFrame(old.frame);
  old.ghost?.remove();old.slot?.remove();old.row?.classList.remove('kon-drag-source');root.classList.remove('kon-drag-active');
  try{if(root.hasPointerCapture(old.pointer))root.releasePointerCapture(old.pointer);}catch{}
 }
 function position(){
  const s=state;if(!s?.active)return;s.ghost.style.transform=`translate(${s.x-s.startX}px,${s.y-s.startY}px)`;
  const others=s.nodes.filter(row=>row!==s.row&&row.isConnected),before=others.find(row=>{const r=row.getBoundingClientRect();return s.y<r.top+r.height/2;});root.insertBefore(s.slot,before||null);
  const ids=others.map(row=>Number(row.dataset.kontaktRow));ids.splice(before?others.indexOf(before):others.length,0,s.id);s.desired=ids;
 }
 function scroll(){
  const s=state;if(!s?.active)return;const edge=76,dy=s.y<edge?-Math.ceil((edge-s.y)/6):s.y>innerHeight-edge?Math.ceil((s.y-innerHeight+edge)/6):0;
  if(dy){window.scrollBy(0,Math.max(-16,Math.min(16,dy)));position();}s.frame=requestAnimationFrame(scroll);
 }
 function activate(){
  const s=state;if(!s||s.active||!s.snapshot||!s.row.isConnected||!options.canStart())return;
  s.active=true;s.nodes=rows();s.original=s.nodes.map(row=>Number(row.dataset.kontaktRow));s.desired=[...s.original];
  if(!same(s.original,s.snapshot.spisok.map(row=>row.id))){clean();options.message('Контакты изменились. Обнови карточку перед переносом.');return;}
  const r=s.row.getBoundingClientRect();if(!r.width||!r.height){clean();return;}s.ghost=s.row.cloneNode(true);
  for(const element of [s.ghost,...s.ghost.querySelectorAll('*')])for(const attr of [...element.attributes])if(attr.name==='id'||attr.name.startsWith('data-'))element.removeAttribute(attr.name);
  s.ghost.classList.add('kon-drag-ghost');s.ghost.setAttribute('aria-hidden','true');s.ghost.inert=true;Object.assign(s.ghost.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px'});document.body.append(s.ghost);
  s.slot=document.createElement('div');s.slot.className='kon-drag-slot';s.slot.setAttribute('aria-hidden','true');s.slot.dataset.contactDrop='1';s.row.classList.add('kon-drag-source');root.classList.add('kon-drag-active');position();scroll();options.message(s.type==='touch'?'Перемести контакт к линии и отпусти.':'Перемести контакт к линии и отпусти. Escape отменяет перенос.');
 }
 function down(event){
  const handle=event.target.closest('[data-contact-drag]');if(!handle||!root.contains(handle)||event.button!==0||event.isPrimary===false)return;
  if(!options.canStart()){event.preventDefault();options.message('Сначала заверши правку или проверку карточки.');return;}
  const row=handle.closest('[data-kontakt-row]');if(!row)return;clean();event.preventDefault();
  const s=state={pointer:event.pointerId,type:event.pointerType,row,id:Number(row.dataset.kontaktRow),startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false,wants:false};
  try{root.setPointerCapture(event.pointerId);}catch{clean();return;}
                                                                                  
  Promise.resolve(options.snapshot()).then(snapshot=>{if(state!==s)return;s.snapshot=snapshot;if(s.wants)activate();}).catch(()=>{if(state===s){clean();options.message('Не удалось подготовить перенос. Обнови карточку.');}});
  if(s.type==='touch')s.timer=setTimeout(()=>{if(state!==s)return;s.wants=true;activate();},350);
 }
 function move(event){
  const s=state;if(!s||s.pointer!==event.pointerId)return;s.x=event.clientX;s.y=event.clientY;const distance=Math.hypot(s.x-s.startX,s.y-s.startY);
  if(!s.active&&s.type==='touch'&&!s.wants&&distance>9){clean();return;}
  if(!s.active&&s.type!=='touch'&&distance>=4){s.wants=true;activate();}if(s.active){event.preventDefault();position();}
 }
 function up(event){
  const s=state;if(!s||s.pointer!==event.pointerId)return;const r=root.getBoundingClientRect(),inside=event.clientX>=r.left-24&&event.clientX<=r.right+24&&event.clientY>=r.top-48&&event.clientY<=r.bottom+48;
  const drop=s.active&&inside&&options.canStart()&&!same(s.original,s.desired),snapshot=s.snapshot,ids=s.desired;
  if(s.active){ignoreClickUntil=Date.now()+500;event.preventDefault();}clean();
  if(drop)Promise.resolve(options.drop(snapshot,ids)).catch(()=>options.message('Не удалось завершить перенос. Проверь порядок.'));else options.message('');
 }
 function cancel(event){if(!event||event.pointerId===undefined||event.pointerId===state?.pointer){const active=state?.active;if(active)ignoreClickUntil=Date.now()+500;clean();if(active)options.message('Перенос отменён.');}}
 function key(event){if(event.key==='Escape'&&state){event.preventDefault();cancel();}}
 function click(event){const handle=event.target.closest('[data-contact-drag]');if(!handle)return;event.preventDefault();event.stopPropagation();if(event.detail===0||Date.now()>=ignoreClickUntil)options.openOrder();}
 function visibility(){if(document.hidden)cancel();}
 root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move,{passive:false});root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);root.addEventListener('lostpointercapture',cancel);root.addEventListener('click',click);document.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',cancel);
 return()=>{clean();root.removeEventListener('pointerdown',down);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',cancel);root.removeEventListener('lostpointercapture',cancel);root.removeEventListener('click',click);document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',cancel);};
}
window.KontaktDrag={privjazat};
})();
