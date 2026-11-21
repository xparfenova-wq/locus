(function(){
 'use strict';
 const operations=new Map();
 function mount(root,{taskNumber,initial}){
  const O=window.O,API=window.API,prefix=API.ja+':'+taskNumber+':';
  const row=root.querySelector('.kz-uchast-row'),holder=root.querySelector('.kz-uchastniki');
  row.hidden=false;holder.innerHTML='<span class="kz-uchast-spisok"></span><span class="kz-uchast-tools"><select aria-label="добавить участника" disabled><option value="">загрузка коллег</option></select></span><span class="kz-uchast-status" role="status"></span><button type="button" class="kz-kom-ranshe" data-members-retry hidden>обновить участников</button><button type="button" class="kz-kom-ranshe" data-team-retry hidden>загрузить коллег</button>';
  const list=holder.querySelector('.kz-uchast-spisok'),picker=holder.querySelector('select'),status=holder.querySelector('[role=status]'),retry=holder.querySelector('[data-members-retry]'),teamRetry=holder.querySelector('[data-team-retry]');
  let members=[],people=[],loaded=false,teamLoaded=false,disposed=false,uncertain=false,expanded=false,readSequence=0,controller;
  const connected=()=>!disposed&&root.isConnected;
  const busy=()=>[...operations.keys()].some(key=>key.startsWith(prefix));
  function labels(){
   const all=[...new Map([...people,...members.map(m=>({...m,id:m.chelovek_id}))].map(p=>[p.id,p])).values()],counts=new Map();
   for(const p of all){const name=LocusUpominanija.normal(p.imja);counts.set(name,(counts.get(name)||0)+1);}
   return p=>{
    const full={...(people.find(v=>v.id===p.id)||{}),...p};
    if(counts.get(LocusUpominanija.normal(full.imja))<2)return full.imja;
    const extra=[full.gorod,full.telefon||full.telegram||full.pochta].filter(Boolean).join(', ');
    return full.imja+' — '+(extra||'участник '+full.id);
   };
  }
  function controls(){
   const locked=!loaded||uncertain||busy();picker.disabled=locked||!teamLoaded;retry.disabled=busy();
   for(const b of list.querySelectorAll('[data-member-remove]'))b.disabled=locked;
  }
  function draw(){
   if(!connected())return;const label=labels(),shown=expanded?members:members.slice(0,8);
   list.innerHTML=shown.map(m=>{
    const text=label({...m,id:m.chelovek_id});
    return '<span class="kz-uchastnik">'+O.profilCheloveka(m.chelovek_id,text)+'<button type="button" data-member-remove="'+m.chelovek_id+'" aria-label="'+O.ekranirovat('убрать '+text)+'" title="убрать участника">×</button></span>';
   }).join('')+(!members.length?'<span class="kz-uchast-empty">'+(loaded?'пока нет участников':'участники ещё не загружены')+'</span>':'')
    +(members.length>8?'<button type="button" class="kz-kom-ranshe" data-members-more>'+O.ekranirovat(expanded?'свернуть':'ещё '+(members.length-8))+'</button>':'');
   const selected=new Set(members.map(m=>m.chelovek_id));
   picker.innerHTML='<option value="">'+(teamLoaded?'добавить участника':'загрузка коллег')+'</option>'+people.filter(p=>!selected.has(p.id)).map(p=>'<option value="'+p.id+'">'+O.ekranirovat(label(p))+'</option>').join('');controls();
  }
  function accept(data){
   if(!Array.isArray(data?.spisok)||data.spisok.some(m=>!Number.isSafeInteger(m.chelovek_id)))throw new Error('сервер не вернул список участников');
   members=data.spisok;loaded=true;uncertain=false;retry.hidden=true;status.textContent='';draw();
  }
  async function refresh(){
   if(!connected()||busy())return;
   const sequence=++readSequence;controller?.abort();controller=new AbortController();
   try{
    const data=await API.zapros('GET','/zadachi/'+taskNumber+'/uchastniki',undefined,{signal:controller.signal});
    if(connected()&&sequence===readSequence)accept(data);
   }catch(e){if(connected()&&sequence===readSequence){status.textContent='Не удалось обновить участников. '+(loaded?'Показан предыдущий список.':'Повтори загрузку.');retry.hidden=false;controls();}}
  }
  async function loadPeople(){
   teamRetry.hidden=true;
   try{
    const rows=[];
    for(let page=1;;page++){const data=await API.spisok('ljudi',{komanda:1,na_stranice:200,stranica:page});if(!connected())return;rows.push(...data.spisok);if(page>=data.stranic)break;}
    people=rows.filter(p=>p.komanda&&!p.arhiv);teamLoaded=true;draw();
   }catch(e){if(connected()){teamRetry.hidden=false;status.textContent='Не удалось загрузить коллег. Список участников сохранён.';}}
  }
  async function change(person,remove){
   if(!connected()||busy()||!loaded||uncertain)return;
   const key=prefix+person;readSequence++;controller?.abort();status.textContent='';
   const operation=(async()=>{
    try{
     const result=remove?await API.zapros('DELETE','/zadachi/'+taskNumber+'/uchastniki/'+person):await API.dejstvie('/zadachi/'+taskNumber+'/uchastniki',{chelovek_id:person});
     document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena',{detail:{nomer:taskNumber}}));return result;
    }catch(e){if(!remove&&e.kod===409&&e.telo?.uchastnik_uzhe_est)return e.telo.uchastnik;throw e;}
   })();
   operations.set(key,operation);controls();
   try{
    const result=await operation;
    if(connected()){
     if(remove)members=members.filter(m=>m.chelovek_id!==person);
     else if(result&&!members.some(m=>m.chelovek_id===person))members.push(result);
     members.sort((a,b)=>a.id-b.id);draw();
    }
   }catch(e){if(connected()){
    uncertain=e.kod===undefined||e.kod>=500||!!e.telo?.sessija_izmenilas;
    status.textContent=uncertain?'Изменение участников не подтверждено. Обнови список перед повторной попыткой.':e.message;retry.hidden=false;
   }}
   finally{
    if(operations.get(key)===operation)operations.delete(key);if(connected()){controls();if(!uncertain)refresh();}
   }
  }
  picker.addEventListener('change',()=>{const person=Number(picker.value);if(Number.isSafeInteger(person)&&person>0)change(person,false);});
  list.addEventListener('click',e=>{
   const remove=e.target.closest('[data-member-remove]');if(remove){e.preventDefault();e.stopPropagation();change(Number(remove.dataset.memberRemove),true);return;}
   if(e.target.closest('[data-members-more]')){expanded=!expanded;draw();}
  });
  retry.addEventListener('click',refresh);teamRetry.addEventListener('click',loadPeople);
  try{accept(initial);}catch(e){status.textContent='Не удалось загрузить участников';retry.hidden=false;draw();}
  loadPeople();
  const prior=[...operations].filter(([key])=>key.startsWith(prefix)).map(([,operation])=>operation);
  if(prior.length){controls();Promise.allSettled(prior).then(()=>{if(connected())refresh();});}
  return{refresh,dispose(){disposed=true;readSequence++;controller?.abort();}};
 }
 window.LocusUchastniki={mount};
})();
