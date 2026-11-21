                                                                  
(function(){
'use strict';
function otkryt({cel,posle,API,O,mozhetVidatDengi,onChanged}) {
  const creationKey=crypto.randomUUID();
  const formuly={lidov:'Лиды за период',novyh_klientov:'Новые клиенты за период',
    klientov:'Клиенты сейчас',lidov_ot_referalov:'Лиды по рекомендации',
    novyh_klientov_ot_referalov:'Новые клиенты по рекомендации',
    klientov_ot_referalov:'Клиенты по рекомендации сейчас',
    pisem_otpravleno:'Отправленные сообщения',rassylok_otpravleno:'Рассылки с отправками',
    otvetili_na_rassylku:'Ответы на рассылку',otkazalis:'Отказы',
    kontaktov_v_baze:'Контакты в рассылках сейчас',summa_oplat:'Оплаты за период',
    zadach_zakryto:'Закрытые задачи за период',publikacij_vyshlo:'Публикации за период',
    ohvat_publikacij:'Охват публикаций за период'};
  if(!mozhetVidatDengi)delete formuly.summa_oplat;
  const zakryt_r = O.modalka(`Результат цели «${cel.nazvanie}»`, `
    <div class="l-form">
      <label class="l-field l-field-wide"><span class="l-label">что меряем</span>
      <input id="r-imja" maxlength="200" placeholder="проведённых чекапов" autofocus></label>
      <label class="l-field l-field-wide"><span class="l-label">тип результата</span><select id="r-tip" aria-label="тип результата"><option value="chislo">число</option>${mozhetVidatDengi?'<option value="dengi">деньги</option>':''}<option value="veha">веха</option></select></label>
      <label class="l-field l-field-wide" id="r-closed-row" hidden><span class="l-label"><input id="r-closed" type="checkbox"> закрыта</span></label>
      <label class="l-field l-field-wide" data-result-numeric><span class="l-label">источник</span>
      <select id="r-istochnik" aria-label="источник"><option value="ruchnoj_zamer">Ручной замер</option><option value="formula">Формула из данных</option><option value="akkaunt">Из аккаунта</option></select></label>
      <div class="r-formula" id="r-formula-blok" hidden>
        <label class="l-label" for="r-formula">показатель</label>
        <select id="r-formula">${Object.entries(formuly).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select>
        <label class="l-field" id="r-lidy-blok" hidden><span class="l-label">каких лидов считать</span>
          <select id="r-schitat-lidov" aria-label="каких лидов считать"><option value="tolko_novye">только новые</option><option value="vse">все, с кем работали</option></select></label>
        <button type="button" id="r-proverit">Проверить число</button>
        <div class="r-proverka" id="r-proverka" role="status" aria-live="polite"></div>
      </div>
      <div class="r-formula" id="r-akkaunt-blok" hidden>
        <label class="l-label" for="r-akkaunt">аккаунт</label>
        <select id="r-akkaunt"><option value="">Загружаю аккаунты…</option></select>
        <label class="l-label" for="r-metrika">метрика</label>
        <select id="r-metrika"><option value="">Загружаю метрики…</option></select>
        <div class="r-proverka" id="r-akkaunt-fakt" role="status" aria-live="polite"></div>
      </div>
      <label class="l-field" data-result-numeric><span class="l-label">сейчас</span>
      <input id="r-baza" placeholder="неизвестно" inputmode="decimal"></label>
      <label class="l-field" data-result-numeric><span class="l-label">хотим</span>
      <input id="r-plan" placeholder="10" inputmode="decimal"></label>
    </div>
    <div class="nov-p" id="r-help">доля считается от «сейчас» к «хотим»: пока факт
      равен началу, результат стоит на нуле, при достижении плана — сто
      процентов. Факт приходит из выбранного источника</div>
    <div class="fch-niz">
      <a class="svernut" id="r-net">не сейчас</a></div>`,
    null, {
      gotovo: async () => {
        const imja = field('r-imja');
        const nazvanie = (imja?.value || '').trim();
        if (!nazvanie) {
          O.tost('Напиши, что меряем'); throw new Error('нужно имя');
        }
        const tip=field('r-tip').value,payload={cel_id:cel.id,nazvanie,tip,zapros_kljuch:creationKey};
        if(tip==='veha')payload.zakryta=field('r-closed').checked;
        else {
        const baseText=field('r-baza').value.trim().replace(/\s/g,'').replace(',','.');
        const baza = baseText===''?null:Number(baseText);
        const plan = Number(field('r-plan').value.trim().replace(/\s/g,'').replace(',','.'));
        if ((baza!==null&&!Number.isFinite(baza))||!Number.isFinite(plan)||plan<=0) {
          O.tost('Укажи положительный план и числовую базу, если она известна');
          throw new Error('план мал');
        }
        const istochnik=field('r-istochnik').value;
        const formula=istochnik==='formula'?field('r-formula').value:null;
        if(formula)await proverit_formulu();
        const akkaunt_id=istochnik==='akkaunt'?Number(field('r-akkaunt').value):null;
        const metrika=istochnik==='akkaunt'?field('r-metrika').value:null;
        if(istochnik==='akkaunt'&&(!akkaunt_id||!metrika))throw new Error('Выбери аккаунт и метрику');
        if(istochnik==='akkaunt')await proverit_akkaunt();
        Object.assign(payload,{plan,baza,istochnik,formula,akkaunt_id,metrika,...(istochnik==='formula'&&leadFormula(formula)?{schitat_lidov:field('r-schitat-lidov').value}:{})});
        }
        const novyj = await API.sozdat('rezultaty',payload);
        const updated=await obnovit(onChanged,O);
        O.tost(`Результат «${nazvanie}» добавлен${updated?'':'. Обнови страницу, чтобы увидеть его'}${novyj.podskazka?'. '+novyj.podskazka:''}`, async () => {
          await LocusOkrDelete.removeKnown('rezultaty',novyj);
        });
        if (posle) posle();
      },
      znak: '+', podskazka: 'добавить результат',
    });
  const root=document.getElementById('r-imja').closest('.vyb-fon');
  root.classList.add('result-create-form');
  O.sozdanieOkrFormy(root,creationKey,async()=>{zakryt_r();await obnovit(onChanged,O);if(posle)posle();});
  const field=id=>root.querySelector('#'+id);
  const leadFormula=formula=>['lidov','novyh_lidov','lidov_ot_referalov'].includes(formula);
  const showLeadMode=()=>{field('r-lidy-blok').hidden=field('r-tip').value==='veha'||field('r-istochnik').value!=='formula'||!leadFormula(field('r-formula').value);};
  const numericHelp=field('r-help').textContent;
  function showType(){
    const milestone=field('r-tip').value==='veha';for(const node of root.querySelectorAll('[data-result-numeric]'))node.hidden=milestone;
    field('r-closed-row').hidden=!milestone;field('r-formula-blok').hidden=milestone||field('r-istochnik').value!=='formula';field('r-akkaunt-blok').hidden=milestone||field('r-istochnik').value!=='akkaunt';showLeadMode();
    field('r-help').textContent=milestone?'Веха либо закрыта, либо нет. Её вклад в цель равен 0 или 100%. Связанная задача закроет веху автоматически.':numericHelp;
  }
  field('r-tip').addEventListener('change',showType);
  {
    field('r-istochnik').addEventListener('change',ev=>{
      field('r-formula-blok').hidden=ev.target.value!=='formula';
      field('r-akkaunt-blok').hidden=ev.target.value!=='akkaunt';showLeadMode();
      if(ev.target.value==='akkaunt')zagruzit_akkaunty().catch(e=>field('r-akkaunt-fakt').textContent=e.message);
    });
    for(const id of ['r-akkaunt','r-metrika'])field(id).addEventListener('change',()=>proverit_akkaunt().catch(()=>{}));
    field('r-formula').addEventListener('change',()=>{formulaCheck++;field('r-proverka').textContent='';showLeadMode();});
    field('r-schitat-lidov').addEventListener('change',()=>{formulaCheck++;field('r-proverka').textContent='';});
    field('r-proverit').addEventListener('click',()=>proverit_formulu().catch(()=>{}));
    const imja = field('r-imja');
    setTimeout(() => imja?.focus(), 40);
    [imja, field('r-baza'), field('r-plan')]
      .filter(Boolean)
      .forEach((pole) => pole.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') root.querySelector('.vyb-g')?.click();
      }));
    field('r-net')?.addEventListener('click', () => {
      zakryt_r();
      if (posle) posle();
    });
  }
  let formulaCheck=0;
  async function proverit_formulu(){
    const box=field('r-proverka'),token=++formulaCheck;
    const formula=field('r-formula').value;
    box.textContent='Проверяю…';
    try{
      const r=await API.dejstvie('/rezultaty/proverit_formulu',{formula,cel_id:cel.id,period_id:cel.period_id,...(leadFormula(formula)?{schitat_lidov:field('r-schitat-lidov').value}:{})});
      if(!r.horosho)throw new Error(r.oshibka||'Показатель не удалось проверить');
      if(token!==formulaCheck)return r;
      box.textContent=`Сейчас: ${r.znachenie}${r.polnota_dannyh&&!r.polnota_dannyh.polnaja
        ? `. Учтены подтверждённые переходы. Без полной истории: ${r.polnota_dannyh.bez_istorii}`:''}`;
      return r;
    }catch(e){if(token===formulaCheck)box.textContent=e.message;throw e;}
  }
  let akkaunty_zagruzheny=false,proverka_akkaunta=0;
  async function zagruzit_akkaunty(){
    if(akkaunty_zagruzheny)return;
    const [a,m]=await Promise.all([API.ekran('akkaunty/dlja_zadachi'),API.ekran('spravochniki/metriki')]);
    const accounts=(a.spisok||[]).filter(x=>!x.udalen&&x.aktiven!==false);
    field('r-akkaunt').innerHTML='<option value="">Выбери аккаунт</option>'+accounts.map(x=>`<option value="${x.id}">${O.ekranirovat(x.nazvanie)} · ${O.ekranirovat(x.ploshadka)}</option>`).join('');
    field('r-metrika').innerHTML=(m.metriki||[]).map(x=>`<option value="${x.kod}">${O.ekranirovat(x.imja)}</option>`).join('');
    akkaunty_zagruzheny=true;
  }
  async function proverit_akkaunt(){
    const id=field('r-akkaunt').value,metrika=field('r-metrika').value;
    const box=field('r-akkaunt-fakt'),token=++proverka_akkaunta;
    if(!id||!metrika){box.textContent='Выбери аккаунт и метрику';return;}
    box.textContent='Проверяю…';
    try{
      const r=await API.ekran('akkaunty/'+id+'/pokazatel',{metrika});
      if(token===proverka_akkaunta)box.textContent=r.znachenie==null?'Замера пока нет':`Сейчас: ${r.znachenie}${r.obnovleno?' · '+r.obnovleno:''}`;
      return r;
    }catch(e){if(token===proverka_akkaunta)box.textContent=e.message;throw e;}
  }
}

async function obnovit(onChanged,O){
  try{await onChanged();return true;}catch{O.tost('Сохранено. Не удалось обновить экран — перезагрузи страницу');return false;}
}
async function plan({rez,chislo,API,O,onChanged}){
  try{
    await API.pravit('rezultaty',rez.id,{versija:rez.versija,plan:chislo});
    await obnovit(onChanged,O);
  }catch(e){
    if(e.kod!==409){O.tost('Не получилось сохранить план: '+e.message);return;}
    let live=e.telo?.tekuschee||e.telo?.zapis||null;
    const zakryt=O.modalka('План уже изменён',`<p>Твоя правка: <b>${chislo}</b>. На открытом экране было: <b>${O.ekranirovat(rez.plan)}</b>.</p>
      <p id="rp-tekuschee">${live?.plan!=null?'Сейчас сохранено: '+O.ekranirovat(String(live.plan)): 'Можно загрузить сохранённую версию или явно записать своё число.'}</p>
      <div class="r-formula"><button type="button" id="rp-obnovit">Загрузить сохранённое</button>
      <button type="button" id="rp-moe">Сохранить моё число</button></div>
      <p id="rp-oshibka" role="status" aria-live="polite"></p>`);
    const root=document.getElementById('rp-obnovit').closest('.vyb-fon');
    let busy=false;
    root.querySelector('#rp-obnovit').addEventListener('click',async()=>{
      if(busy)return;busy=true;
      try{await onChanged();zakryt();}catch(err){root.querySelector('#rp-oshibka').textContent=err.message;}finally{busy=false;}
    });
    root.querySelector('#rp-moe').addEventListener('click',async()=>{
      if(busy)return;busy=true;
      const button=root.querySelector('#rp-moe');button.disabled=true;
      try{
                                                                          
                                                          
        if(!live)throw new Error('Загрузи сохранённую версию и повтори правку');
        await API.pravit('rezultaty',rez.id,{versija:live.versija,plan:chislo});
        zakryt();await obnovit(onChanged,O);
      }catch(err){
        if(err.kod===409&&err.telo?.tekuschee){
          live=err.telo.tekuschee;root.querySelector('#rp-tekuschee').textContent='Сейчас сохранено: '+live.plan;
        }
        root.querySelector('#rp-oshibka').textContent=err.message;
      }
      finally{busy=false;button.disabled=false;}
    });
  }
}
function lidy({rez,API,O,onChanged}){
  let version=rez.versija,token=0;
  const label=mode=>mode==='vse'?'все, с кем работали':'только новые';
  O.modalka('Каких лидов считать',`<div class="l-form">
    <label class="l-field l-field-wide"><span class="l-label">источник числа</span>
      <select id="rl-mode" aria-label="каких лидов считать"><option value="tolko_novye"${rez.schitat_lidov!=='vse'?' selected':''}>только новые</option><option value="vse"${rez.schitat_lidov==='vse'?' selected':''}>все, с кем работали</option></select></label>
    <div class="r-formula"><button type="button" id="rl-preview">Проверить число</button><div class="r-proverka" id="rl-value" role="status" aria-live="polite"></div></div>
  </div>`,null,{gotovo:async()=>{
    const mode=input.value;
    for(;;){
      try{await API.pravit('rezultaty',rez.id,{versija:version,schitat_lidov:mode});break;}
      catch(error){
        if(error.kod!==409||!error.telo?.tekuschee)throw error;
        const live=error.telo.tekuschee;
        const choice=await O.razreshitKonflikt(error,{label:'каких лидов считать',local:label(mode),current:label(live.schitat_lidov)});
        if(choice==='load'){await obnovit(onChanged,O);return;}
        if(choice!=='own')throw new Error('Выбор сохранён в форме');
        version=live.versija;
      }
    }
    await obnovit(onChanged,O);
  },podskazka:'сохранить выбор лидов'});
  const input=document.getElementById('rl-mode'),box=document.getElementById('rl-value');
  input.addEventListener('change',()=>{token++;box.textContent='';});
  document.getElementById('rl-preview').addEventListener('click',async()=>{
    const seq=++token;box.textContent='Проверяю…';
    try{const result=await API.dejstvie('/rezultaty/proverit_formulu',{formula:rez.formula,cel_id:rez.cel_id,schitat_lidov:input.value});if(seq===token)box.textContent='Сейчас: '+result.znachenie;}
    catch(error){if(seq===token)box.textContent=error.message;}
  });
}
function baza({rez,API,O,onChanged}){
 let seen={...rez},pending=null,busy=false;
 const close=O.modalka('База результата: '+rez.nazvanie,`<div class="l-form"><label class="l-field l-field-wide"><span class="l-label">значение в начале периода</span><input id="result-base-value" inputmode="decimal" value="${O.ekranirovat(rez.baza??'')}" placeholder="неизвестно"></label><p>База — точка отсчёта прогресса. Пустое поле означает «неизвестно», число 0 — известный ноль. Предыдущие замеры сохранятся.</p><p role="status" id="result-base-status"></p><div class="result-base-actions"><button type="button" class="kn ostavit-vnutri" id="result-base-check" hidden>проверить сохранённое</button><button type="button" class="kn ostavit-vnutri" id="result-base-use" hidden>использовать сохранённое</button><button type="button" class="kn ostavit-vnutri" id="result-base-rebase" hidden>править с учётом этой версии</button></div></div>`,null,{poverh:true,podskazka:'сохранить базу',gotovo:async()=>{
  if(busy||pending)return false;const raw=input.value.trim().replace(/\s/g,'').replace(',','.'),value=raw===''?null:Number(raw);if(value!==null&&!Number.isFinite(value))throw new Error('Укажи число или оставь базу неизвестной');if(value===seen.baza){close();return;}
  busy=true;input.disabled=true;try{await API.pravit('rezultaty',rez.id,{versija:seen.versija,baza:value});close();await obnovit(onChanged,O);O.tost('База сохранена');}
  catch(error){if(error.kod&&error.kod<500&&error.kod!==409)throw error;pending={value};root.querySelector('.vyb-g').setAttribute('aria-disabled','true');check.hidden=false;status.textContent=error.kod===409?'Результат изменился. Прочитай сохранённую базу, чтобы сравнить со своей.':'Ответ не получен. Повтора записи не было: сначала проверь сохранённую базу.';return false;}
  finally{busy=false;if(!pending)input.disabled=false;}
 }}),root=document.getElementById('result-base-value').closest('.vyb-fon'),input=root.querySelector('#result-base-value'),status=root.querySelector('#result-base-status'),check=root.querySelector('#result-base-check'),use=root.querySelector('#result-base-use'),rebase=root.querySelector('#result-base-rebase');
 check.onclick=async()=>{if(busy)return;busy=true;check.disabled=true;try{const current=await API.odna('rezultaty',rez.id);if(current.id!==rez.id||!Number.isSafeInteger(current.versija)||current.tip==='veha'||current.skryto?.includes('dengi'))throw new Error('База этой записи недоступна');seen=current;status.textContent='Сейчас сохранено: '+(current.baza===null?'база не задана':current.baza)+'. Твоя правка: '+(pending.value===null?'база не задана':pending.value)+'.';use.hidden=false;rebase.hidden=false;}catch(error){status.textContent=error.message;}finally{busy=false;check.disabled=false;}};
 use.onclick=async()=>{close();await obnovit(onChanged,O);};
 rebase.onclick=()=>{if(busy||use.hidden)return;pending=null;input.disabled=false;root.querySelector('.vyb-g').removeAttribute('aria-disabled');check.hidden=use.hidden=rebase.hidden=true;status.textContent='Твоя правка сохранена в поле. Проверь её перед новым подтверждением.';input.focus();};return close;
}

window.LocusResultForm={otkryt,plan,lidy,baza};
})();
