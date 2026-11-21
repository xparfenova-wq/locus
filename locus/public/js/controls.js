                                                                              
                                                                           
(function(){
'use strict';
if(window.LocusControls)return;
let opened=null,sequence=0,search='',searchAt=0,hoverEntry=null,hoverExit=null;
const enhanced=new WeakSet();
const fileInputs=new WeakSet(),disclosures=new WeakSet();
const hoverBlocks=new WeakMap();let lastPointer=null;
document.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')lastPointer={x:event.clientX,y:event.clientY};},true);
const hasHover=()=>matchMedia('(hover:hover) and (pointer:fine)').matches;
const openDelay=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hover-open-delay'))||90,closeDelay=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hover-close-delay'))||120;
function clearHover(){clearTimeout(hoverEntry);clearTimeout(hoverExit);hoverEntry=hoverExit=null;}
const rails=new WeakSet(),railSelector='body.locus-tasks .fil-r,body.locus-tasks .svod';
function measureRail(rail){
  rail.toggleAttribute('data-scroll-start',rail.scrollLeft>1);
  rail.toggleAttribute('data-scroll-more',rail.scrollWidth-rail.clientWidth-rail.scrollLeft>1);
}
function rail(root){
  const found=[...(root.matches?.(railSelector)?[root]:[]),...root.querySelectorAll(railSelector)];
  const parent=root.closest?.(railSelector);if(parent)found.push(parent);
  for(const item of new Set(found)){
    if(!rails.has(item)){rails.add(item);item.classList.add('l-scroll-rail');item.addEventListener('scroll',()=>measureRail(item),{passive:true});}
    requestAnimationFrame(()=>{if(item.isConnected)measureRail(item);});
  }
}
function close(focus=false){
  clearHover();
  if(!opened)return;
  const {select,popup,hiddenOptions}=opened;opened=null;search='';searchAt=0;popup.remove();
  if(lastPointer)hoverBlocks.set(select,lastPointer);
  for(const [option,previous] of hiddenOptions){
    if(previous===null)option.removeAttribute('aria-hidden');else option.setAttribute('aria-hidden',previous);
  }
  select.setAttribute('aria-expanded','false');select.removeAttribute('aria-controls');select.removeAttribute('aria-activedescendant');
  if(focus&&select.isConnected&&!select.disabled)select.focus({preventScroll:true});
}
function position(){
  if(!opened)return;
  const {select,popup}=opened;
  if(!select.isConnected||select.closest('[hidden]')){close();return;}
  const rect=select.getBoundingClientRect(),view=window.visualViewport;
  if(!rect.width||!rect.height){close();return;}
  const leftBound=view?.offsetLeft||0,topBound=view?.offsetTop||0;
  const width=view?.width||innerWidth,height=view?.height||innerHeight;
  const popupWidth=Math.min(Math.max(rect.width,220),width-32);
  const below=topBound+height-rect.bottom-8,above=rect.top-topBound-8;
  const onTop=below<160&&above>below,available=onTop?above:below;
  popup.style.width=popupWidth+'px';
  popup.style.maxHeight=Math.max(44,Math.min(300,available))+'px';
  popup.style.left=Math.max(leftBound+16,Math.min(rect.left,leftBound+width-popupWidth-16))+'px';
  popup.style.top=(onTop?Math.max(topBound+8,rect.top-popup.offsetHeight-6):Math.min(rect.bottom+6,topBound+height-popup.offsetHeight-8))+'px';
}
function activate(index){
  if(!opened)return;
  const {options,select}=opened;
  if(!options[index]||options[index].disabled)return;
  opened.active=index;
  for(const [i,option] of options.entries())option.toggleAttribute('data-active',i===index);
  select.setAttribute('aria-activedescendant',options[index].id);
  options[index].scrollIntoView({block:'nearest'});
}
function choose(index){
  if(!opened)return;
  const {select,options}=opened,option=options[index];
  if(select.matches(':disabled')){close();return;}
  if(!option||option.disabled)return;
  const changed=select.selectedIndex!==Number(option.dataset.index);
  select.selectedIndex=Number(option.dataset.index);close(true);
  if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
}
function open(select,{hover=false,keyboard=false}={}){
  if(select.matches(':disabled')||select.multiple||select.size>1)return;
  clearHover();
  if(opened?.select===select){if(!hover){opened.keyboard=keyboard;select.focus({preventScroll:true});}position();return;}
  window.KALENDAR?.zakryt?.();
  window.LocusSuggestions?.close();
  document.querySelectorAll('.vyp.otkryt').forEach(v=>v.locusClose?.());
  close();enhance(select);
  const popup=document.createElement('div');popup.className='l-select-popup';
  popup.id='l-select-'+(++sequence);popup.setAttribute('role','listbox');
  const label=select.labels?.[0]?.cloneNode(true);
  label?.querySelectorAll('select,input,textarea').forEach(e=>e.remove());
  popup.setAttribute('aria-label',select.getAttribute('aria-label')||label?.textContent.trim()||'Варианты');
  const options=[];let group=null;
  for(const [index,option] of [...select.options].entries()){
    if(option.hidden||option.closest('optgroup[hidden]'))continue;
    if(option.parentElement.tagName==='OPTGROUP'&&option.parentElement!==group){
      group=option.parentElement;const heading=document.createElement('div');heading.className='l-select-group';heading.textContent=group.label;popup.append(heading);
    }
    const button=document.createElement('button');button.type='button';button.className='l-select-option';
    button.id=popup.id+'-'+index;button.dataset.index=String(index);button.tabIndex=-1;
    button.setAttribute('role','option');button.setAttribute('aria-selected',String(index===select.selectedIndex));
    button.disabled=option.matches(':disabled');button.textContent=option.textContent;
    const n=options.length;button.addEventListener('click',()=>choose(n));
    button.addEventListener('pointermove',()=>{if(opened&&!button.disabled)activate(n);});
    options.push(button);popup.append(button);
  }
  const hiddenOptions=[...select.options].map(option=>[option,option.getAttribute('aria-hidden')]);
  for(const [option] of hiddenOptions)option.setAttribute('aria-hidden','true');
  opened={select,popup,options,hiddenOptions,active:-1,keyboard};document.body.append(popup);
  select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',popup.id);
  if(!hover)select.focus({preventScroll:true});position();
  const selected=options.findIndex(o=>Number(o.dataset.index)===select.selectedIndex&&!o.disabled);
  activate(selected<0?options.findIndex(o=>!o.disabled):selected);
}
function enhance(select){
  if(enhanced.has(select)||select.multiple||select.size>1)return;
  enhanced.add(select);select.classList.add('l-select');
  if(lastPointer)hoverBlocks.set(select,lastPointer);
  if(!select.closest('.vyb-fon,form,.l-form,.l-field,.mod-pole,.base-form-grid,.sozd,.zam-f,.pv-new'))select.classList.add('l-select--inline');
  select.setAttribute('aria-haspopup','listbox');select.setAttribute('aria-expanded','false');
  select.addEventListener('change',()=>{if(opened?.select===select)close();});
}
function fileControl(input){
  if(fileInputs.has(input)||input.hidden||getComputedStyle(input).display==='none')return;
  fileInputs.add(input);
  const wrapper=document.createElement('span'),button=document.createElement('button'),name=document.createElement('span');
  wrapper.className='l-file-control';button.type='button';button.className='kn l-file-button';name.className='l-file-name';name.id='locus-file-name-'+(++sequence);
  const originalLabel=input.getAttribute('aria-label')||input.labels?.[0]?.textContent.trim()||'Прикрепить файл';
  if(!input.id)input.id='locus-file-input-'+(++sequence);
  button.setAttribute('aria-controls',input.id);button.setAttribute('aria-label',originalLabel);name.setAttribute('role','status');name.setAttribute('aria-live','polite');
  input.before(wrapper);wrapper.append(input,button,name);input.classList.add('l-file-native');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
  const render=()=>{button.textContent=input.multiple?'выбрать файлы':'выбрать файл';button.disabled=input.matches(':disabled');name.textContent=input.files?.length?[...input.files].map(file=>file.name).join(', '):'Файл не выбран';};
  button.onclick=()=>{if(!input.matches(':disabled'))input.click();};input.addEventListener('change',render);input.addEventListener('input',render);
  input.form?.addEventListener('reset',()=>queueMicrotask(render));new MutationObserver(render).observe(input,{attributes:true,attributeFilter:['disabled','multiple','accept']});render();
  const fieldset=input.closest('fieldset');if(fieldset)new MutationObserver(render).observe(fieldset,{attributes:true,attributeFilter:['disabled']});
}
function disclosure(details){
 if(disclosures.has(details))return;disclosures.add(details);details.classList.add('l-disclosure');let enter,leave,pinned=details.open,automatic=false,hoverBlock=lastPointer;
 const summary=details.querySelector(':scope>summary');if(!summary)return;
 function hoverOpen(event){if(event.pointerType==='touch'||!hasHover()||summary.getAttribute('aria-disabled')==='true'||details.closest('[inert]'))return;if(hoverBlock&&event.clientX===hoverBlock.x&&event.clientY===hoverBlock.y)return;hoverBlock=null;clearTimeout(leave);if(!details.open)enter=setTimeout(()=>{if(details.isConnected&&summary.getAttribute('aria-disabled')!=='true'&&!details.closest('[inert]')){automatic=true;details.open=true;}},openDelay);}
 details.addEventListener('pointerenter',hoverOpen);details.addEventListener('pointermove',event=>{if(hoverBlock)hoverOpen(event);});
 details.addEventListener('pointerleave',event=>{if(event.pointerType==='touch'||!hasHover())return;hoverBlock=null;clearTimeout(enter);leave=setTimeout(()=>{if(!pinned&&!details.contains(document.activeElement)){automatic=false;details.open=false;}},closeDelay);});
 details.addEventListener('focusout',()=>queueMicrotask(()=>{if(automatic&&!pinned&&!details.contains(document.activeElement)&&!details.matches(':hover')){automatic=false;details.open=false;}}));
 summary.addEventListener('click',event=>{if(summary.getAttribute('aria-disabled')==='true'){event.preventDefault();return;}if(automatic&&details.open){event.preventDefault();pinned=true;automatic=false;}else pinned=!details.open;});
 details.addEventListener('keydown',event=>{if(event.key==='Escape'){clearTimeout(enter);clearTimeout(leave);pinned=automatic=false;details.open=false;summary.focus();event.stopPropagation();}});
}
function scan(root){
  if(root.nodeType!==1&&root!==document)return;
  rail(root);
  if(root.matches?.('select'))enhance(root);
  root.querySelectorAll('select').forEach(enhance);
  for(const input of [...(root.matches?.('input[type=checkbox],input[type=radio],input[type=range]')?[root]:[]),...root.querySelectorAll('input[type=checkbox],input[type=radio],input[type=range]')]){
    if(input.type==='checkbox')input.classList.add('l-checkbox');else if(input.type==='radio')input.classList.add('l-radio');else if(!input.matches('.rf-range,#pal-jar'))input.classList.add('l-range');
  }
  const files=[...(root.matches?.('input[type=file]')?[root]:[]),...root.querySelectorAll('input[type=file]')];files.forEach(fileControl);
  const details=[...(root.matches?.('details')?[root]:[]),...root.querySelectorAll('details')];details.forEach(disclosure);
  const actions=[...(root.matches?.('a:not([href])')?[root]:[]),...root.querySelectorAll('a:not([href])')];
  for(const action of actions){
    if(action.hasAttribute('role')||(!action.textContent.trim()&&!action.title&&!action.getAttribute('aria-label')))continue;
    action.setAttribute('role','button');if(!action.hasAttribute('tabindex'))action.tabIndex=0;
    if(action.title&&!action.hasAttribute('aria-label'))action.setAttribute('aria-label',action.title);
  }
  if(opened&&!opened.select.isConnected)close();
}
function selectHover(select,event){
 enhance(select);const block=hoverBlocks.get(select);if(block&&event.clientX===block.x&&event.clientY===block.y)return;
 hoverBlocks.delete(select);clearHover();hoverEntry=setTimeout(()=>{if(select.isConnected&&select.matches(':hover'))open(select,{hover:true});},openDelay);
}
document.addEventListener('pointerover',event=>{
 if(event.pointerType==='touch'||!hasHover())return;
 const select=event.target.closest('select');
 if(opened?.popup.contains(event.target)){clearTimeout(hoverExit);return;}
 if(select&&!select.multiple&&select.size<=1&&!select.disabled)selectHover(select,event);
});
document.addEventListener('pointermove',event=>{const select=event.target.closest('select');if(select&&hoverBlocks.has(select)&&event.pointerType!=='touch'&&hasHover())selectHover(select,event);});
document.addEventListener('pointerout',event=>{
 if(event.pointerType==='touch'||!hasHover())return;
 if(event.target.matches?.('select'))hoverBlocks.delete(event.target);
 if(!opened){clearTimeout(hoverEntry);return;}
 const {select,popup}=opened;if(event.target!==select&&!popup.contains(event.target))return;
 const to=event.relatedTarget;if(to&&(to===select||popup.contains(to)))return;
 clearTimeout(hoverEntry);clearTimeout(hoverExit);if(!opened.keyboard)hoverExit=setTimeout(()=>{if(opened&&!opened.select.matches(':hover')&&!opened.popup.matches(':hover'))close();},closeDelay);
});
document.addEventListener('pointerdown',event=>{
  const select=event.target.closest('select');
  if(select&&!select.multiple&&select.size<=1){event.preventDefault();open(select);return;}
  if(opened&&!opened.popup.contains(event.target))close();
},true);
document.addEventListener('keydown',event=>{
  const select=event.target.closest('select');
  if(!opened){
    if(select&&!select.multiple&&select.size<=1&&['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){
      event.preventDefault();event.stopPropagation();open(select,{keyboard:true});
    }
    return;
  }
  if(event.key==='Tab'){close();return;}
  if(event.key==='Escape'){const restore=event.target===opened.select||opened.popup.contains(event.target);event.preventDefault();event.stopPropagation();close(restore);return;}
  if(event.target!==opened.select&&!opened.popup.contains(event.target)){close();return;}
  const choices=opened.options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);
  if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
    event.preventDefault();event.stopPropagation();
    const current=choices.indexOf(opened.active);
    if(event.key==='Enter'||event.key===' '){choose(opened.active);return;}
    if(event.key==='Home')activate(choices[0]);else if(event.key==='End')activate(choices[choices.length-1]);
    else activate(choices[(current+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length]);
  }else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
    event.preventDefault();event.stopPropagation();
    search=performance.now()-searchAt>700?event.key:search+event.key;searchAt=performance.now();
    const i=opened.options.findIndex(o=>!o.disabled&&o.textContent.trim().toLocaleLowerCase('ru-RU').startsWith(search.toLocaleLowerCase('ru-RU')));
    if(i>=0)activate(i);
  }
},true);
document.addEventListener('focusin',event=>{
  if(opened&&event.target!==opened.select&&!opened.popup.contains(event.target))close();
});
                                                                   
                                                                           
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||!['Enter',' '].includes(event.key)||event.metaKey||event.ctrlKey||event.altKey)return;
  if(event.target.isContentEditable||event.target.closest('input,textarea,select,button,a[href]'))return;
  const action=event.target.closest('[role="button"]');
  if(!action||action.closest('[inert]')||action.getAttribute('aria-disabled')==='true')return;
  event.preventDefault();action.click();
});
addEventListener('resize',position);addEventListener('scroll',position,true);
addEventListener('resize',()=>document.querySelectorAll(railSelector).forEach(measureRail));
addEventListener('blur',()=>close());
window.visualViewport?.addEventListener('resize',position);
function start(){
  scan(document);
  document.fonts?.ready.then(()=>document.querySelectorAll(railSelector).forEach(measureRail));
  new MutationObserver(records=>{
    if(opened&&records.some(r=>r.target.closest?.('select')===opened.select))close();
    for(const record of records)for(const node of record.addedNodes)scan(node);
    if(opened&&!opened.select.isConnected)close();
  }).observe(document.body,{childList:true,subtree:true});
}
window.LocusControls={open,close,scan,pointer:()=>lastPointer};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
