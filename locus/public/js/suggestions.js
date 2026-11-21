                                                                                 
(function(){
'use strict';
if(window.LocusSuggestions)return;
const fields=new WeakSet(),choosing=new WeakSet(),hoverBlocks=new WeakMap(),hover=()=>matchMedia('(hover:hover) and (pointer:fine)').matches;
const delay=name=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
let active=null,sequence=0,enter,leave;
function timers(){clearTimeout(enter);clearTimeout(leave);}
function close(){timers();if(!active)return;const {input,popup}=active;active=null;const point=window.LocusControls?.pointer?.();if(point)hoverBlocks.set(input,point);popup.remove();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-controls');input.removeAttribute('aria-activedescendant');}
function available(input){return input.isConnected&&!input.matches(':disabled')&&!input.readOnly&&!input.closest('[inert],[hidden]');}
function position(){
 if(!active)return;const {input,popup}=active;
 if(!available(input)){close();return;}
 const r=input.getBoundingClientRect(),v=window.visualViewport,left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight;
 if(!r.width||!r.height){close();return;}
 const w=Math.min(Math.max(r.width,220),width-32),below=top+height-r.bottom-8,above=r.top-top-8,onTop=below<160&&above>below;
 popup.style.width=w+'px';popup.style.maxHeight=Math.max(44,Math.min(300,onTop?above:below))+'px';popup.style.left=Math.max(left+16,Math.min(r.left,left+width-w-16))+'px';popup.style.top=(onTop?Math.max(top+8,r.top-popup.offsetHeight-6):Math.min(r.bottom+6,top+height-popup.offsetHeight-8))+'px';
}
function activate(index,scroll=false){
 if(!active||!active.options[index])return;active.index=index;
 active.options.forEach((n,i)=>n.toggleAttribute('data-active',i===index));active.input.setAttribute('aria-activedescendant',active.options[index].id);
 if(scroll)active.options[index].scrollIntoView({block:'nearest'});
}
function choose(index){
 if(!active)return;const {input,options}=active,option=options[index];if(!available(input)||!option){close();return;}
 const value=option.dataset.value,changed=input.value!==value;input.value=value;close();input.focus({preventScroll:true});
 if(changed){choosing.add(input);try{input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}finally{choosing.delete(input);}}
}
function render(){
 if(!active)return;const {input,popup}=active,list=document.getElementById(input.dataset.locusList);
 if(list?.tagName!=='DATALIST'){close();return;}
 const query=input.value.toLocaleLowerCase('ru-RU'),seen=new Set(),options=[];
 for(const item of list.options){
  if(item.hidden||item.disabled||!item.value||seen.has(item.value))continue;
  const label=item.label||item.value;if(query&&!item.value.toLocaleLowerCase('ru-RU').includes(query)&&!label.toLocaleLowerCase('ru-RU').includes(query))continue;
  seen.add(item.value);const button=document.createElement('button'),index=options.length;
  button.type='button';button.className='l-select-option';button.id=popup.id+'-'+index;button.tabIndex=-1;button.setAttribute('role','option');button.setAttribute('aria-selected',String(input.value===item.value));button.dataset.value=item.value;button.textContent=label;
  button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('pointermove',()=>activate(index));button.addEventListener('click',()=>choose(index));options.push(button);
 }
 active.options=options;active.index=-1;input.removeAttribute('aria-activedescendant');popup.replaceChildren(...options);
 if(!options.length){close();return;}position();
}
function open(input,{keyboard=false}={}){
 timers();if(!available(input))return;
 if(active?.input===input){if(keyboard)active.keyboard=true;return;}
 enhance(input);if(!input.dataset.locusList)return;
 close();window.LocusControls?.close();window.KALENDAR?.zakryt?.();document.querySelectorAll('.vyp.otkryt').forEach(v=>v.locusClose?.());
 const popup=document.createElement('div');popup.className='l-select-popup l-suggestions';popup.id='locus-suggestions-'+(++sequence);popup.setAttribute('role','listbox');popup.setAttribute('aria-label',input.getAttribute('aria-label')||input.labels?.[0]?.textContent.trim()||'Подсказки');
 active={input,popup,options:[],index:-1,keyboard};document.body.append(popup);input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls',popup.id);render();
}
function enhance(input){
 const id=input.getAttribute('list');if(!id)return;if(fields.has(input)){input.dataset.locusList=id;input.removeAttribute('list');if(active?.input===input)render();return;}fields.add(input);input.dataset.locusList=id;input.removeAttribute('list');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-expanded','false');
 const initialPoint=window.LocusControls?.pointer?.();if(initialPoint)hoverBlocks.set(input,initialPoint);
 input.addEventListener('input',()=>{if(choosing.has(input))return;if(active?.input===input)render();else if(document.activeElement===input)open(input,{keyboard:true});});
 input.addEventListener('click',()=>open(input));
 function hoverOpen(event){if(event.pointerType==='touch'||!hover())return;const point=hoverBlocks.get(input);if(point&&event.clientX===point.x&&event.clientY===point.y)return;hoverBlocks.delete(input);timers();enter=setTimeout(()=>{if(input.matches(':hover'))open(input);},delay('--hover-open-delay')||90);}
 input.addEventListener('pointerenter',hoverOpen);input.addEventListener('pointermove',event=>{if(hoverBlocks.has(input))hoverOpen(event);});
 input.addEventListener('pointerleave',event=>{if(event.pointerType==='touch'||!hover())return;hoverBlocks.delete(input);clearTimeout(enter);if(active?.input===input&&!active.popup.contains(event.relatedTarget)&&!active.keyboard)leave=setTimeout(()=>{if(active?.input===input&&!input.matches(':hover')&&!active.popup.matches(':hover'))close();},delay('--hover-close-delay')||120);});
 new MutationObserver(()=>{if(active?.input===input&&!available(input))close();}).observe(input,{attributes:true,attributeFilter:['disabled','readonly']});
}
function scan(root){if(root.nodeType!==1&&root!==document)return;if(root.matches?.('input[list]'))enhance(root);root.querySelectorAll('input[list]').forEach(enhance);}
document.addEventListener('pointerover',event=>{if(active?.popup.contains(event.target))clearTimeout(leave);});
document.addEventListener('pointerout',event=>{if(!active||!active.popup.contains(event.target)||event.pointerType==='touch'||!hover()||active.keyboard)return;const to=event.relatedTarget;if(to===active.input||active.popup.contains(to))return;leave=setTimeout(()=>{if(active&&!active.input.matches(':hover')&&!active.popup.matches(':hover'))close();},delay('--hover-close-delay')||120);});
document.addEventListener('pointerdown',event=>{if(active&&event.target!==active.input&&!active.popup.contains(event.target))close();},true);
document.addEventListener('focusin',event=>{if(active&&event.target!==active.input&&!active.popup.contains(event.target))close();});
document.addEventListener('keydown',event=>{
 if(active&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
 if(active&&event.key==='Tab'){close();return;}
 const input=event.target.closest('input[data-locus-list]');if(!input)return;
 if(!active||active.input!==input){if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(input,{keyboard:true});if(active)activate(event.key==='ArrowUp'?active.options.length-1:0,true);}return;}
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active.keyboard=true;activate(active.index<0?(event.key==='ArrowDown'?0:active.options.length-1):(active.index+(event.key==='ArrowDown'?1:-1)+active.options.length)%active.options.length,true);}
 else if(event.key==='Enter'&&active.index>=0){event.preventDefault();choose(active.index);}
},true);
addEventListener('resize',position);addEventListener('scroll',position,true);addEventListener('blur',close);window.visualViewport?.addEventListener('resize',position);
function start(){scan(document);new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'&&record.attributeName==='list')scan(record.target);for(const node of record.addedNodes)scan(node);}if(active){if(!active.input.isConnected){close();return;}const list=document.getElementById(active.input.dataset.locusList);if(records.some(r=>r.target===list||list?.contains(r.target)))render();}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['list','value','label','disabled','hidden']});}
window.LocusSuggestions={close,scan};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
