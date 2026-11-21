(function(){
  'use strict';
  const inflight=new Map();
  function refs(row){
    let value=row.upominanija;
    if(typeof value==='string'){try{value=JSON.parse(value);}catch{return [];}}
    if(!Array.isArray(value))return [];
    let end=0;
    return value.slice().sort((a,b)=>(a?.nachalo??0)-(b?.nachalo??0)).filter(ref=>{
      if(!ref||!Number.isSafeInteger(ref.chelovek_id)||ref.chelovek_id<1||!Number.isSafeInteger(ref.nachalo)||!Number.isSafeInteger(ref.konec)
        ||ref.nachalo<end||ref.konec<=ref.nachalo||ref.konec>String(row.tekst||'').length||row.tekst[ref.nachalo]!=='@')return false;
      end=ref.konec;return true;
    }).map(ref=>({chelovek_id:ref.chelovek_id,nachalo:ref.nachalo,konec:ref.konec}));
  }
  function textLinks(text,O){
    let html='',position=0;
    for(const range of LocusUpominanija.ssylki(text)){
      const url=text.slice(range.nachalo,range.konec).replace(/[.,;:!?]+$/u,'');
      html+=O.ekranirovat(text.slice(position,range.nachalo));
      html+='<a class="kz-kom-up" href="'+O.ekranirovat(url)+'" rel="noopener noreferrer">'+O.ekranirovat(url)+'</a>';
      position=range.nachalo+url.length;
    }
    return html+O.ekranirovat(text.slice(position));
  }
  function renderText(row,O){
    const text=String(row.tekst||'');let html='',position=0;
    for(const ref of refs(row)){
      html+=textLinks(text.slice(position,ref.nachalo),O);
      html+=O.profilCheloveka(ref.chelovek_id,text.slice(ref.nachalo,ref.konec));position=ref.konec;
    }
    return html+textLinks(text.slice(position),O);
  }
  function render(row,actor,O){
    const time=LocusUpominanija.vremja(row.sozdano),edited=LocusUpominanija.vremja(row.izmeneno);
    const name=row.avtor_imja||'участник',person={id:row.chelovek_id,imja:name,foto:row.avtor_foto};
    return '<div class="kz-kom-s" data-kom="'+row.id+'"><div class="kz-kom-sh">'+O.avatar(person,20)
      +'<b>'+O.profilCheloveka(row.chelovek_id,name)+'</b><time class="kz-kom-t" datetime="'+O.ekranirovat(time.iso)+'" title="'+O.ekranirovat(time.polnoe)+'">'+O.ekranirovat(time.tekst)+'</time>'
      +(row.izmeneno?'<span class="kz-kom-t" title="'+O.ekranirovat(edited.polnoe)+'">изменено</span>':'')
      +(row.chelovek_id===actor?'<span class="kz-kom-dejstvija"><button type="button" data-pravit-kom="'+row.id+'">изменить</button><button type="button" data-ubrat="'+row.id+'">удалить</button></span>':'')
      +'</div><div class="kz-kom-tx">'+renderText(row,O)+'</div></div>';
  }
  function mount(root,{taskId,initial,onRefresh=()=>{}}){
    const O=window.O,API=window.API,M=window.LocusUpominanija;
    const input=root.querySelector('#kz-kom-pole'),send=root.querySelector('#kz-kom-dat'),thread=root.querySelector('#kz-kom');
    const counter=root.querySelector('#kz-kom-dlina'),error=root.querySelector('#kz-kom-oshibka'),count=root.querySelector('#kz-kom-schet');
    const vvod=input.closest('.kz-kom-vvod'),known=new Map();
    const top=document.createElement('div');top.className='kz-kom-upravlenie';
    top.innerHTML='<button type="button" class="kz-kom-ranshe" hidden>показать ранние комментарии</button><span class="kz-kom-nit-oshibka" role="status"></span><button type="button" class="kz-kom-obnovit" hidden>обновить обсуждение</button>';
    thread.before(top);
    const bar=document.createElement('div');bar.className='kz-kom-edit-bar';bar.hidden=true;
    bar.innerHTML='<span>редактирование комментария</span><button type="button" id="kz-kom-otmena">отмена</button>';vvod.before(bar);
    const tools=document.createElement('div');tools.className='kz-kom-tools';
    tools.innerHTML='<select id="kz-kom-chelovek" aria-label="позвать коллегу" disabled><option value="">загружаются коллеги</option></select><button type="button" id="kz-kom-team-retry" hidden>загрузить коллег</button><span id="kz-kom-draft-state" role="status"></span>';
    vvod.after(tools);
    const earlier=top.querySelector('.kz-kom-ranshe'),readError=top.querySelector('[role=status]'),retry=top.querySelector('.kz-kom-obnovit');
    const cancel=bar.querySelector('button'),picker=tools.querySelector('select'),teamRetry=tools.querySelector('button'),draftState=tools.querySelector('[role=status]');
    let actor=null,key=null,disposed=false,pending=false,loading=false,loadingEdit=false,loaded=false,total=Number(initial?.vsego||0),noEarlier=false,edit=null;
    let fresh={text:'',refs:[]},drafts={},bindings=[],lastText='',revision=crypto.randomUUID(),people=[],caret={start:0,end:0},timer,readSequence=0,invalidEdit=false,refreshing=0;
    const deleting=new Set();
    input.disabled=true;
    const connected=()=>!disposed&&root.isConnected;
    const empty=()=>({text:'',refs:[]});
    const reason=e=>/failed to fetch|networkerror|load failed/i.test(String(e?.message||''))?'нет соединения с сервером':String(e?.message||'ошибка соединения');
    function readDraft(){try{return key?JSON.parse(sessionStorage.getItem(key)||'null'):null;}catch{return null;}}
    function persist(){
      if(!key)return;
      try{
        if(!fresh.text&&!edit&&!Object.keys(drafts).length)sessionStorage.removeItem(key);
        else sessionStorage.setItem(key,JSON.stringify({fresh,edit,drafts,revision}));
        if(connected())draftState.textContent='';
      }catch{if(connected())draftState.textContent='Браузер не сохранил черновик. Оставь окно открытым';}
    }
    function remember(){
      const value={text:input.value,refs:bindings.map(ref=>({...ref}))};
      if(edit){Object.assign(edit,value);drafts[edit.id]={...edit,refs:edit.refs.map(ref=>({...ref}))};}else fresh=value;
      revision=crypto.randomUUID();persist();
    }
    function buttons(){
      for(const button of thread.querySelectorAll('[data-pravit-kom],[data-ubrat]'))button.disabled=pending||loadingEdit||deleting.has(Number(button.dataset.pravitKom||button.dataset.ubrat));
    }
    function controls(){
      input.disabled=!actor||loadingEdit;
      const length=M.dlina(input.value),over=length>M.limit;
      counter.textContent=length+' / '+M.limit;counter.classList.toggle('perebor',over);
      input.setAttribute('aria-invalid',String(over));send.disabled=!actor||pending||loadingEdit||invalidEdit||over||!input.value.trim();send.setAttribute('aria-busy',String(pending));
      send.setAttribute('aria-label',edit?'сохранить комментарий':'отправить комментарий');bar.hidden=!edit;bar.dataset.commentId=edit?String(edit.id):'';bar.setAttribute('aria-busy',String(loadingEdit));cancel.disabled=pending||loadingEdit;
      input.style.height='auto';input.style.height=Math.min(input.scrollHeight,150)+'px';
      buttons();
    }
    function setInput(value){
      input.value=String(value?.text||'');bindings=refs({tekst:input.value,upominanija:value?.refs||[]});lastText=input.value;
      caret={start:input.value.length,end:input.value.length};controls();
    }
    function showError(message){if(!connected())return;error.textContent=message;error.scrollIntoView({block:'nearest'});}
    function draw(){
      if(!connected())return;
      const rows=[...known.values()].sort((a,b)=>a.id-b.id);
      if(!rows.length)thread.innerHTML='<div class="kz-kom-net">'+(loaded?'Пока тихо. Напиши первым':'Обсуждение ещё не загружено')+'</div>';
      else{
        const wanted=new Set(rows.map(row=>String(row.id))),nodes=new Map();
        for(const node of [...thread.children]){
          if(!wanted.has(node.dataset.kom))node.remove();else nodes.set(Number(node.dataset.kom),node);
        }
        rows.forEach((row,index)=>{
          const signature=JSON.stringify([row.versija,row.avtor_versija,actor]);let node=nodes.get(row.id);
          if(!node||node.locusCommentSignature!==signature){
            const holder=document.createElement('div');holder.innerHTML=render(row,actor,O);const next=holder.firstElementChild;next.locusCommentSignature=signature;
            if(node)node.replaceWith(next);node=next;
          }
          if(thread.children[index]!==node)thread.insertBefore(node,thread.children[index]||null);
          node.querySelector('time').textContent=M.vremja(row.sozdano).tekst;
        });
      }
      buttons();
      count.textContent=loaded?(total?String(total):''):'—';earlier.hidden=noEarlier||!rows.length||rows.length>=total;earlier.disabled=loading;
    }
    function validPage(page){
      if(!page||!Array.isArray(page.spisok)||!Number.isSafeInteger(page.vsego)||page.vsego<0)throw new Error('сервер не вернул обсуждение, повтори загрузку');
      return page;
    }
    function acceptLatest(page){
      validPage(page);loaded=true;
      const rows=page.spisok||[],floor=rows.length?Math.min(...rows.map(row=>row.id)):Infinity,ids=new Set(rows.map(row=>row.id));
      if(rows.length<50)known.clear();
      else for(const id of known.keys())if(id>=floor&&!ids.has(id))known.delete(id);
      for(const row of rows)known.set(row.id,row);
      total=page.vsego;noEarlier=known.size>=total;draw();onRefresh();
    }
    async function latest(){
      if(!connected())return;
      const sequence=++readSequence,floor=known.size?Math.min(...known.keys()):null;
      refreshing++;
      try{
        const page=validPage(await API.spisok('kommentarii',{zadacha_id:taskId,na_stranice:50,sortirovka:'id_desc',...(floor?{sverit_ot_id:floor}:{})}));
        if(!connected()||sequence!==readSequence)return;
        if(!floor){acceptLatest(page);readError.textContent='';retry.hidden=true;return;}
        const check=page.sverka,versions=new Map(),next=new Map(),needed=[];
        if(check?.zadacha_id!==taskId||check.ot_id!==floor||!Array.isArray(check.versii))throw new Error('сервер не вернул сверку загруженной истории');
        for(const item of check.versii){
          if(!Number.isSafeInteger(item?.id)||item.id<floor||!Number.isSafeInteger(item.versija)||item.versija<1
            ||!Number.isSafeInteger(item.avtor_versija)||item.avtor_versija<0||versions.has(item.id))throw new Error('неверная сверка обсуждения');
          versions.set(item.id,item);
        }
        if(versions.size>page.vsego||page.spisok.length!==Math.min(50,page.vsego))throw new Error('неполная страница обсуждения');
        const validRow=row=>Number.isSafeInteger(row?.id)&&row.id>0&&row.zadacha_id===taskId&&Number.isSafeInteger(row.versija)&&row.versija>0&&Number.isSafeInteger(row.avtor_versija)&&row.avtor_versija>=0;
        for(const row of page.spisok){
          const expected=versions.get(row?.id);
          if(!validRow(row)||next.has(row.id)||(row.id>=floor&&(!expected||expected.versija!==row.versija||expected.avtor_versija!==row.avtor_versija)))throw new Error('страница обсуждения не совпала со сверкой');
          next.set(row.id,row);
        }
        for(const item of versions.values()){
          if(next.has(item.id))continue;
          const row=known.get(item.id);
          if(row?.versija===item.versija&&row.avtor_versija===item.avtor_versija)next.set(row.id,row);
          else needed.push(item.id);
        }
        for(let offset=0;offset<needed.length;offset+=100){
          const ids=needed.slice(offset,offset+100),wanted=new Set(ids);
          const batch=validPage(await API.spisok('kommentarii',{zadacha_id:taskId,ids:ids.join(','),na_stranice:100,sortirovka:'id_asc'}));
          if(!connected()||sequence!==readSequence)return;
          if(batch.spisok.length!==batch.vsego||batch.stranic!==1)throw new Error('сервер вернул неполный пакет комментариев');
          for(const row of batch.spisok){
            const expected=versions.get(row?.id);
            if(!validRow(row)||!wanted.delete(row.id)||row.versija<expected.versija||row.avtor_versija<expected.avtor_versija)throw new Error('неверный ответ обновления комментариев');
            next.set(row.id,row);
          }
                                                                              
        }
        let deletedEdit=edit&&edit.id>=floor&&!next.has(edit.id)?edit.id:null;
        if(edit&&edit.id<floor){
          const editingId=edit.id;
          try{const row=await API.odna('kommentarii',editingId);if(!validRow(row)||row.chelovek_id!==actor)throw new Error('черновик относится к другому комментарию');}
          catch(e){if(e.kod===404)deletedEdit=editingId;else throw e;}
        }
        if(!connected()||sequence!==readSequence)return;
        known.clear();for(const [id,row]of next)known.set(id,row);
        loaded=true;total=page.vsego;noEarlier=known.size>=total;draw();onRefresh();
        if(edit){
          invalidEdit=edit.id===deletedEdit;
          if(invalidEdit)error.textContent='Комментарий удалён в другом окне. Текст правки остался в поле; отмена вернёт новую реплику.';
          controls();
        }
        readError.textContent='';retry.hidden=true;
      }catch(e){if(connected()&&sequence===readSequence)throw e;}
      finally{refreshing--;}
    }
    function readFailed(e){if(connected()){readError.textContent='Не удалось обновить обсуждение: '+reason(e);retry.hidden=false;}}
    async function older(){
      if(loading||pending||loadingEdit||!known.size)return;const sequence=++readSequence;loading=true;draw();
      try{
        const page=await API.spisok('kommentarii',{zadacha_id:taskId,na_stranice:50,sortirovka:'id_desc',do_id:Math.min(...known.keys())});
        validPage(page);
        if(!connected()||sequence!==readSequence)return;for(const row of page.spisok)known.set(row.id,row);
        noEarlier=page.spisok.length<50;readError.textContent='';retry.hidden=true;
      }catch(e){if(sequence===readSequence)readFailed(e);}finally{loading=false;draw();}
    }
    async function loadPeople(){
      picker.disabled=true;teamRetry.hidden=true;
      try{
        const list=[];
        for(let page=1;;page++){
          const result=await API.spisok('ljudi',{komanda:1,na_stranice:200,stranica:page});list.push(...result.spisok);if(page>=result.stranic)break;
        }
        if(!connected())return;people=list.filter(p=>p.komanda&&!p.arhiv);
        const names=new Map();for(const p of people)names.set(M.normal(p.imja),(names.get(M.normal(p.imja))||0)+1);
        picker.innerHTML='<option value="">позвать коллегу</option>'+people.map(p=>{
          const info=names.get(M.normal(p.imja))>1?[p.gorod,p.telefon||p.telegram||p.pochta].filter(Boolean).join(', '):'';
          return '<option value="'+p.id+'">'+O.ekranirovat(p.imja+(info?' — '+info:names.get(M.normal(p.imja))>1?' — участник '+p.id:''))+'</option>';
        }).join('');picker.disabled=false;
      }catch(e){if(connected()){picker.innerHTML='<option value="">коллеги недоступны</option>';teamRetry.hidden=false;}}
    }
    function choose(){
      const person=people.find(p=>p.id===Number(picker.value));picker.value='';if(!person||pending)return;
      const from=caret.start,before=input.value,existing=bindings.find(ref=>from>=ref.nachalo&&from<=ref.konec&&caret.end<=ref.konec);
      const to=existing?existing.konec:caret.end;
      const prefix=before.slice(0,from),typed=prefix.match(/(^|[^\p{L}\p{N}_])@([\p{L}\p{M}\p{N}_-]*)$/u);
      const start=existing?existing.nachalo:typed?from-typed[2].length-1:from,label='@'+person.imja;
      const gap=start>0&&!/\s/u.test(before[start-1])?' ':'';
      const inserted=gap+label+' ',next=before.slice(0,start)+inserted+before.slice(to);
      bindings=M.perenesti(before,next,bindings);bindings.push({chelovek_id:person.id,nachalo:start+gap.length,konec:start+gap.length+label.length});
      bindings.sort((a,b)=>a.nachalo-b.nachalo);input.value=next;lastText=next;
      caret={start:start+inserted.length,end:start+inserted.length};remember();controls();input.focus();input.setSelectionRange(caret.start,caret.end);
    }
    function applySaved(row,sent){
      readSequence++;
      const stored=readDraft(),same=revision===sent.revision;
      if(same){
        if(sent.editId){delete drafts[sent.editId];edit=null;}else fresh=empty();
        if(connected())setInput(fresh);
        if(!stored||stored.revision===sent.revision)persist();
      }else if(sent.editId&&edit?.id===sent.editId){edit.versija=row.versija;drafts[edit.id]={...edit};persist();}
      if(connected()){const existed=known.has(row.id);known.set(row.id,row);if(!sent.editId&&!existed)total++;draw();onRefresh();}
    }
    async function perform(sent){
      if(!sent.editId)return API.sozdat('kommentarii',{zadacha_id:taskId,tekst:sent.text,upominanija:sent.refs});
      let expected=sent.versija;
      for(;;){
        try{return await API.pravit('kommentarii',sent.editId,{versija:expected,tekst:sent.text,upominanija:sent.refs});}
        catch(e){
          if(e.kod!==409||!e.telo?.tekuschee||!connected())throw e;
          const current=e.telo.tekuschee;
          const choice=await O.razreshitKonflikt(e,{label:'комментарий',local:sent.text,current:current.tekst});
          if(choice==='load'){
            readSequence++;
            edit={id:current.id,versija:current.versija,text:current.tekst,refs:refs(current)};known.set(current.id,current);setInput(edit);remember();draw();return null;
          }
          if(choice!=='own')return null;expected=current.versija;
        }
      }
    }
    async function save(){
      if(!actor||pending||loadingEdit||invalidEdit||!input.value.trim()||M.dlina(input.value)>M.limit)return;
      remember();const sent={text:input.value,refs:bindings.map(r=>({...r})),editId:edit?.id,versija:edit?.versija,revision};
      pending=true;controls();error.textContent='';
      const operation=perform(sent);inflight.set(key,{operation,sent});
      try{
        const row=await operation;if(!row)return;applySaved(row,sent);
        if(connected())try{await latest();}catch(e){showError('Комментарий сохранён. Не удалось обновить обсуждение: '+reason(e));}
      }catch(e){
        if(e.kod===undefined||e.kod>=500){showError('Не удалось подтвердить сохранение. Текст остался в поле. Проверь обсуждение перед повторной отправкой.');if(connected())retry.hidden=false;}
        else showError(e.message);
      }
      finally{if(inflight.get(key)?.operation===operation)inflight.delete(key);pending=false;if(connected())controls();}
    }
    async function editComment(id){
      if(pending||loadingEdit)return;loadingEdit=true;controls();draftState.textContent='Открываем комментарий…';let opened=false;
      try{
        const row=await API.odna('kommentarii',id);if(!connected())return;
        if(row.chelovek_id!==actor||row.zadacha_id!==taskId)throw new Error('этот комментарий нельзя изменить');
        remember();invalidEdit=false;edit=drafts[id]?{...drafts[id]}:{id:row.id,versija:row.versija,text:row.tekst,refs:refs(row)};setInput(edit);remember();error.textContent='';opened=true;
      }catch(e){showError('Не удалось открыть правку: '+reason(e));}finally{loadingEdit=false;if(connected()){if(draftState.textContent==='Открываем комментарий…')draftState.textContent='';controls();if(opened){input.focus();input.scrollIntoView({block:'nearest'});}}}
    }
    async function remove(id,button){
      if(button.disabled||pending||deleting.has(id))return;let row=known.get(id);if(!row||row.chelovek_id!==actor)return;deleting.add(id);button.disabled=true;
      try{
        for(;;){
          try{await API.udalit('kommentarii',id,{versija:row.versija});break;}
          catch(e){
            if(e.kod!==409||!e.telo?.tekuschee)throw e;
            row=e.telo.tekuschee;
            const choice=await O.razreshitKonflikt(e,{heading:'Удаление не применено',label:'комментарий',local:'Удалить этот комментарий',current:row.tekst,ownLabel:'удалить этот вариант',loadLabel:'оставить и обновить',intro:'Сначала проверь сохранённую реплику.'});
            if(choice!=='own'){if(connected()){readSequence++;known.set(row.id,row);draw();}return;}
          }
        }
        readSequence++;known.delete(id);total=Math.max(0,total-1);delete drafts[id];
        if(edit?.id===id){edit=null;invalidEdit=false;setInput(fresh);remember();}else persist();draw();
        try{await latest();}catch(e){showError('Комментарий удалён. Не удалось обновить обсуждение: '+reason(e));}
      }catch(e){showError(e.kod===undefined||e.kod>=500?'Удаление не подтверждено. Обнови обсуждение перед повторной попыткой.':e.message);if(connected()&&(e.kod===undefined||e.kod>=500))retry.hidden=false;}finally{deleting.delete(id);if(connected())buttons();}
    }
    input.addEventListener('input',()=>{
      bindings=M.perenesti(lastText,input.value,bindings);lastText=input.value;error.textContent=invalidEdit?'Комментарий недоступен. Текст правки остался в поле; отмена вернёт новую реплику.':'';remember();controls();
    });
    for(const name of ['keyup','click','select','blur'])input.addEventListener(name,()=>{caret={start:input.selectionStart,end:input.selectionEnd};});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();save();}});
    send.addEventListener('click',save);picker.addEventListener('change',choose);teamRetry.addEventListener('click',loadPeople);
    cancel.addEventListener('click',()=>{if(pending)return;if(edit)delete drafts[edit.id];edit=null;invalidEdit=false;setInput(fresh);remember();error.textContent='';input.focus();});
    earlier.addEventListener('click',older);retry.addEventListener('click',async()=>{
      retry.disabled=true;
      try{if(!actor)await initialize();if(actor)await latest();}catch(e){readFailed(e);}finally{retry.disabled=false;}
    });
    thread.addEventListener('click',e=>{const editButton=e.target.closest('[data-pravit-kom]'),removeButton=e.target.closest('[data-ubrat]');if(editButton)editComment(Number(editButton.dataset.pravitKom));if(removeButton)remove(Number(removeButton.dataset.ubrat),removeButton);});
    try{if(initial?.oshibka)throw new Error(initial.oshibka);acceptLatest(initial);}catch(e){readFailed(e);draw();}
    const initialize=async()=>{
      if(!connected())return;error.textContent='';
      try{
        const identity=await API.zapros('GET','/vhod');if(!connected())return;
        if(!identity.voshel||!identity.chelovek?.id)throw new Error('войдите заново, чтобы написать комментарий');
        actor=identity.chelovek.id;key='locus-comment-draft-v1:'+actor+':'+taskId;
        const stored=readDraft();
        if(stored&&typeof stored.fresh?.text==='string'){
          fresh={text:stored.fresh.text,refs:refs({tekst:stored.fresh.text,upominanija:stored.fresh.refs})};
          for(const [id,value] of Object.entries(stored.drafts||{}))if(Number.isSafeInteger(Number(id))&&Number(id)>0&&value?.id===Number(id)&&typeof value.text==='string')drafts[id]={...value,refs:refs({tekst:value.text,upominanija:value.refs})};
          if(stored.edit&&Number.isSafeInteger(stored.edit.id)&&typeof stored.edit.text==='string')edit={...stored.edit,refs:refs({tekst:stored.edit.text,upominanija:stored.edit.refs})};
          if(edit)drafts[edit.id]=edit;
          revision=typeof stored.revision==='string'?stored.revision:crypto.randomUUID();
        }
        input.disabled=false;retry.textContent='обновить обсуждение';setInput(edit||fresh);draw();
        if(edit){
          invalidEdit=true;controls();
          try{const row=await API.odna('kommentarii',edit.id);if(row.chelovek_id!==actor||row.zadacha_id!==taskId)throw new Error('черновик относится к другому комментарию');invalidEdit=false;}
          catch(e){showError('Черновик правки сохранён, но комментарий недоступен: '+e.message);}
          controls();
        }
        const prior=inflight.get(key);
        if(prior){
          pending=true;controls();try{const row=await prior.operation;if(row)applySaved(row,prior.sent);}catch(e){showError(e.message);}finally{pending=false;controls();}
        }
        loadPeople();
        timer=setInterval(()=>{if(!connected()){clearInterval(timer);return;}if(!document.hidden&&!loading&&!pending&&!loadingEdit&&!refreshing&&!thread.contains(document.activeElement))latest().catch(readFailed);},15000);
      }catch(e){showError('Не удалось подтвердить вход: '+reason(e));if(connected()){retry.textContent='повторить загрузку';retry.hidden=false;}}
    };
    controls();initialize();
    return ()=>{disposed=true;clearInterval(timer);};
  }
  window.LocusKommentarii={mount,renderText};
})();
