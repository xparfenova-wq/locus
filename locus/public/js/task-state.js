                                                                     
(() => {
  'use strict';
  const busy = new Set();
  function snapshot(row) {
    const d = row?.dataset || {}, version = Number(d.versija), number = Number(d.nomer);
    if (!Number.isInteger(version) || version < 1 || !number) throw new Error('Обнови список перед изменением задачи');
    return { nomer: number, versija: version, status: d.status,
      povtorjaetsja: d.povtor === '1', den_vybora: d.pvDate,
      otkrytyh_podzadach: Number(d.openChildren) || 0,
      otmecheno: d.pvMarked === '1', buduschij_den: d.pvFuture === '1',
      mozhno_otmetit: d.pvCanMark === '1' ? true : d.pvCanMark === '0' ? false : undefined,
      dnej_bez_otmetki: Number(d.pvMissed) || 0 };
  }
  function update(task) {
    if (!task?.nomer) return;
    for (const row of document.querySelectorAll('.zs[data-nomer="' + Number(task.nomer) + '"],.dsk-k[data-nomer="'+Number(task.nomer)+'"]')) {
      if (task.povtorjaetsja && task.den_vybora && row.dataset.pvDate !== task.den_vybora) continue;
      row.dataset.versija = String(task.versija); row.dataset.status = task.status;
      row.dataset.openChildren = String(task.otkrytyh_podzadach || 0);
      if (Object.hasOwn(task, 'povtorjaetsja')) row.dataset.povtor = task.povtorjaetsja ? '1' : '0';
      row.classList.toggle('sdel', task.status === 'sdelano');
      const check = row.querySelector('.gal-b');
      check?.classList.toggle('on', task.status === 'sdelano');
      check?.setAttribute('aria-checked', String(task.status === 'sdelano'));
      const available = Object.hasOwn(task, 'povtorjaetsja')
        ? window.O?.mozhnoOtmetitPovtor?.(task) ?? true : row.dataset.pvCanMark !== '0';
      row.dataset.pvCanMark = available ? '1' : '0';
      check?.setAttribute('aria-disabled', String(!available));
      if (check) check.tabIndex = available ? 0 : -1;
      if (task.povtorjaetsja) {
        row.dataset.pvMarked = task.otmecheno ? '1' : '0';
        row.dataset.pvMissed = String(task.dnej_bez_otmetki || 0);
      }
      const pill = row.querySelector('.pill.men');
      if (pill) {
        for (const c of [...pill.classList]) if (c.startsWith('st-')) pill.classList.remove(c);
        pill.classList.add('st-' + task.status); pill.dataset.status = task.status;
        const statuses = window.DANNYE?.statusy || [];
        pill.textContent = statuses.find(s => s.kod === task.status)?.imja || task.status;
        pill.setAttribute('aria-label', 'Статус: ' + pill.textContent);
        pill.locusVyp?.update(statuses, task.status);
      }
    }
  }
  async function refresh(after, message) {
    try { await after(); return true; }
    catch { O.tost(message + '. Список не обновился, обнови страницу'); return false; }
  }
  async function failed(error, after) {
    if(error.telo?.referalnaja_vyplata){try{await (await O.referralTasksUi()).closePayment(error.telo.referalnaja_vyplata.nomer,{after});}catch(e){O.tost(e.message);}return;}
    if (error.kod === 409) { try { await after(); } catch {} }
    O.tost((error.kod === 409 ? 'Правка не применена: ' : 'Не удалось подтвердить действие: ') + error.message);
  }
  function confirmChildren(count) {
    return new Promise(resolve => {
      let accepted=false;
      const text=count===1 ? 'Одна подзадача не выполнена. Точно закрываем?'
        : count+' '+O.skolko(count,'подзадача не выполнена','подзадачи не выполнены','подзадач не выполнено')+'. Точно закрываем?';
      const close=O.modalka('Закрыть задачу?', '<p>'+O.ekranirovat(text)+'</p>'
        +'<div class="fch-niz"><button type="button" class="kn ostavit-vnutri" data-task-confirm>закрыть</button>'
        +'<button type="button" class="kn ostavit-vnutri" data-task-return>вернуться</button></div>', null,
        {poverh:true,priZakrytii:()=>resolve(accepted)});
      const root=document.querySelector('.vyb-fon:not([hidden])');
      root.querySelector('[data-task-confirm]').onclick=()=>{accepted=true;close();};
      root.querySelector('[data-task-return]').onclick=close;
    });
  }
  async function withConfirmation(task, write) {
    let count=Number(task.otkrytyh_podzadach)||0;
    for (;;) {
      if (count>0 && !await confirmChildren(count)) return null;
      try { return await write(count); }
      catch(error) {
                                                                                          
        const changed=error.telo?.podzadach;
        if(error.kod!==409 || !Number.isSafeInteger(changed) || error.telo?.tekuschee)throw error;
        count=changed;
      }
    }
  }
  function measure(offer,after){return O.zamer({choices:offer.rezultaty||[offer],onChanged:()=>refresh(after,'Замер записан')});}
  function effects(saved, after) {
    if(saved.okr_period_zakryt)O.tost('Задача сохранена. Веха не изменилась: её период закрыт');
    if(saved.plashka_kasanie)O.plashkaKasanija(saved.plashka_kasanie);
    const offer=saved.predlozhit_zamer;
    if(!offer)return;
    const close=O.modalka('Обновить замер?', '<p>Задача по цели «'+O.ekranirovat(offer.cel_nazvanie)
      +'» закрыта. Обновить замер?</p><div class="fch-niz">'
      +'<button type="button" class="kn ostavit-vnutri" data-task-measure>вписать число</button>'
      +'<button type="button" class="kn ostavit-vnutri" data-task-later>позже</button></div>',null,{poverh:true});
    document.querySelector('[data-task-measure]').onclick=()=>{close();measure(offer,after);};
    document.querySelector('[data-task-later]').onclick=close;
  }
  async function completeCard(task, options={}) {
    const saved=await patch(task,'sdelano',options);
    if(saved)setTimeout(()=>effects(saved,async()=>{
      document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena',{detail:{nomer:task.nomer}}));
    }),0);
    return saved;
  }
  async function patch(task, next, options={}) {
    const write=count=>API.pravit('zadachi',task.nomer,{versija:task.versija,status:next,
      ...(next==='sdelano'?{podtverzhdeno_podzadach:count}:{})});
    try{return await (next==='sdelano' && task.status!=='sdelano' ? withConfirmation(task,write) : write(0));}catch(error){if(error.telo?.referalnaja_vyplata){await(await O.referralTasksUi()).closePayment(task.nomer,{after:options.after||(async()=>document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena',{detail:{nomer:task.nomer}})))});return null;}throw error;}
  }
  async function undo(task, previous, after) {
    if (busy.has(task.nomer)) return;
    busy.add(task.nomer);
    try {
      const saved = await API.pravit('zadachi', task.nomer, { versija: task.versija, status: previous });
      update(saved);
      if (await refresh(after, 'Отмена сохранена')) O.tost('Изменение отменено');
    } catch (error) { await failed(error, after); }
    finally { busy.delete(task.nomer); }
  }
  async function status(row, next, after) {
    let task;
    try { task = snapshot(row); } catch (error) { O.tost(error.message); return; }
    if (busy.has(task.nomer)) return;
    busy.add(task.nomer); row.setAttribute('aria-busy', 'true');
    try {
      const saved = await patch(task,next);
      if(!saved)return;
      update(saved);
      if (await refresh(after, 'Статус сохранён')) {
        const name = window.DANNYE?.statusy?.find(s => s.kod === next)?.imja || next;
        O.tost('Статус: ' + name, () => undo(saved, task.status, after));
      }
      effects(saved,after);
    } catch (error) { await failed(error, after); }
    finally { busy.delete(task.nomer); row.removeAttribute('aria-busy'); }
  }
  async function close(number, row, after, { bylo = null } = {}) {
    let task;
    try { task = snapshot(row); } catch (error) { O.tost(error.message); return; }
    if (task.nomer !== Number(number) || busy.has(task.nomer)) return;
    busy.add(task.nomer); row.setAttribute('aria-busy', 'true');
    try {
      if (task.povtorjaetsja) return await (await O.povtory()).toggle(task, () => refresh(after, 'Отметка сохранена'));
      if (task.status === 'sdelano') {
        const saved = await API.pravit('zadachi', number, { versija: task.versija, status: 'v_plane' });
        update(saved);
        if (await refresh(after, 'Задача возвращена в план')) O.tost('Задача ' + number + ' снова в плане');
        return;
      }
      const saved = await withConfirmation(task,count=>API.dejstvie('/zadachi/' + number + '/zakryt', {
        versija: task.versija,ostavit_podzadachi:true,podtverzhdeno_podzadach:count }));
      if(!saved)return;
      update(saved); O.vspyshka('сделано');
      row.classList.add('zs-sdelana');
      const confirmed = await O.tostSoSchetom('Задача ' + number + ' выполнена', 5);
      if (!confirmed) {
                                                                                  
        const restored = await API.pravit('zadachi', number, { versija: saved.versija, status: bylo || task.status });
        update(restored); row.classList.remove('zs-sdelana');
        await refresh(after, 'Отмена сохранена'); return;
      }
      await O.ugasitStroku(row); await refresh(after, 'Задача выполнена');
      effects(saved,after);
    } catch (error) { row.classList.remove('zs-sdelana'); await failed(error, after); }
    finally { busy.delete(task.nomer); row.removeAttribute('aria-busy'); }
  }
  window.LocusTaskState = { status, close, update, completeCard, patch, effects };
})();
