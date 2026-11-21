                                                                        
(() => {
  const API = window.API;
  const names = { kazhdyj_den: 'каждый день', budnie: 'будние', raz_v_nedelju: 'раз в неделю', vybrannye_dni: 'выбранные дни' };
  const week = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const dayText = day => SPR.data(day) + (day.slice(0, 4) === SPR.segodnja().slice(0, 4) ? '' : '.' + day.slice(0, 4));
  const changed = nomer => document.dispatchEvent(new CustomEvent('locus:zadacha-izmenena', { detail: { nomer } }));
  const fresh = task => API.odna('zadachi', task.nomer + (task.den_vybora ? '?den=' + task.den_vybora : ''));
  const actionBusy = new Set();
  const actionKey = task => 'locus-repeat-action-v1:' + API.ja + ':' + Number(task.nomer);
  const actionDates = record => record.body.daty || [record.body.data];
  function readAction(task) {
    try {
      const raw = sessionStorage.getItem(actionKey(task));
      if (!raw) return null;
      const record = JSON.parse(raw), body = record.body;
      if (record.actor !== API.ja || record.nomer !== Number(task.nomer) || !body
          || !Number.isSafeInteger(body.versija) || body.versija < 1
          || !['pending', 'unknown', 'conflict'].includes(record.phase)
          || !['mark', 'rule', 'lifecycle'].includes(record.kind)
          || record.kind === 'mark' && !['POST', 'DELETE'].includes(record.method)
          || record.kind === 'rule' && record.method !== 'PATCH'
          || record.kind === 'lifecycle' && (!['POST', 'DELETE'].includes(record.method)
            || record.method === 'DELETE' && body.confirm !== true)) throw new Error();
      if (record.kind === 'mark' && (!Array.isArray(actionDates(record)) || !actionDates(record).length
          || actionDates(record).some(day => typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
            || !Number.isFinite(Date.parse(day + 'T12:00:00Z'))
            || new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) !== day))) throw new Error();
      if (record.kind === 'mark' && record.method === 'POST' && body.status !== undefined
          && !['sdelano', 'propushcheno'].includes(body.status)) throw new Error();
      if (record.kind === 'rule' && typeof body.povtorjaetsja !== 'boolean') throw new Error();
      if (record.kind === 'rule' && body.povtorjaetsja && (!names[body.chastota]
          || body.chastota === 'vybrannye_dni' && (!Array.isArray(body.dni) || !body.dni.length || body.dni.some(n => !Number.isInteger(n) || n < 1 || n > 7))
          || body.chastota === 'raz_v_nedelju' && (!Number.isInteger(body.den_nedeli) || body.den_nedeli < 1 || body.den_nedeli > 7))) throw new Error();
      return record;
    } catch { return { invalid: true }; }
  }
  function matchesAction(row, record) {
    if (record.invalid) return false;
    if (row.versija < record.body.versija) return false;
    if (record.kind === 'lifecycle') return [true, false, 0, 1].includes(row.udaleno)
      && Boolean(row.udaleno) === (record.method === 'DELETE');
    if (record.kind === 'mark') return Array.isArray(row.otmetki) && actionDates(record).every(day => {
      const mark = row.otmetki.find(item => item.data === day);
      return record.method === 'DELETE' ? !mark : mark?.status === (record.body.status || 'sdelano');
    });
    const body = record.body;
    if (row.povtorjaetsja !== body.povtorjaetsja) return false;
    if (!body.povtorjaetsja) return row.chastota == null && row.dni == null && row.den_nedeli == null;
    if (row.chastota !== body.chastota) return false;
    if (body.chastota === 'raz_v_nedelju') return row.den_nedeli === body.den_nedeli;
    if (body.chastota === 'vybrannye_dni') {
      let days; try { days = JSON.parse(row.dni); } catch { return false; }
      return JSON.stringify(days) === JSON.stringify([...new Set(body.dni)].sort((a, b) => a - b));
    }
    return true;
  }
  function checkedActionRow(task, row) {
    if (row?.nomer !== Number(task.nomer) || !Number.isSafeInteger(row.versija) || row.versija < 1) {
      throw new Error('Данные задачи не подтверждены');
    }
    return row;
  }
  async function actionRequest(task, method, body, kind) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    const lifecycleRead = method === 'GET' && kind === 'lifecycle';
    const route = lifecycleRead ? '/zadachi/' + Number(task.nomer) + '/korzina' : '/zadachi/' + task.nomer + (kind === 'mark' ? '/otmetki' : kind === 'lifecycle' && method === 'POST' ? '/vernut' : '')
      + (method === 'GET' && task.den_vybora && !lifecycleRead ? '?den=' + encodeURIComponent(task.den_vybora) : '');
    try {
      try { return await API.zapros(method, route, body, { signal: controller.signal }); }
      catch (error) {
        if (method !== 'GET' || lifecycleRead || error.kod !== 410) throw error;
        return await API.zapros('GET', '/zadachi/' + Number(task.nomer) + '/korzina', undefined, { signal: controller.signal });
      }
    }
    finally { clearTimeout(timer); }
  }
  async function actionSaved(task, row, after, message, closeHost = null, kind = null) {
    sessionStorage.removeItem(actionKey(task));
    closeHost?.closest('.vyb-fon')?.querySelector('.vyb-x')?.click();
    if (kind !== 'lifecycle' && typeof row.status === 'string') window.LocusTaskState?.update(row);
    if (kind === 'lifecycle') O.tost(message);
    try { await after(row); if (kind !== 'lifecycle') O.tost(message); }
    catch { O.tost(message + '. Не удалось обновить вид, обнови страницу.'); }
    return row;
  }
  function pendingAction(task, after, host) {
    const record = readAction(task); if (!record) return;
    if (!host?.isConnected) {
      if (record.kind === 'lifecycle') {
        O.otkrytZadachu(task.nomer, task.den_vybora).catch(() => O.tost('Не удалось открыть результат. Открой задачу ещё раз.'));
        return;
      }
      O.modalka('Задача ' + Number(task.nomer), '<div id="pv-action-host"></div>');
      host = document.getElementById('pv-action-host');
    }
    host.querySelector('.pv-command')?.remove();
    if (record.kind === 'lifecycle' && host.id === 'kz') for (const child of host.children) child.inert = true;
    const save = host.closest('.vyb-fon')?.querySelector('.vyb-g');
    if (save) { save.setAttribute('aria-disabled','true'); save.tabIndex = -1; }
    for (const input of host.querySelectorAll('.pv-dates input,.pv-modes button,.pv-week button,.pv-history button,.pv-footer button,[data-pv-delete-confirm]')) input.disabled = true;
    const panel = document.createElement('div'); panel.className = 'pv-command'; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    const note = document.createElement('p'); note.textContent = record.invalid
      ? 'Не удалось прочитать незавершённое действие. Проверь текущее состояние задачи.'
      : 'Результат ещё не подтверждён. Проверь сохранённые данные без повторной записи.';
    const current = document.createElement('div'), actions = document.createElement('div'); actions.className = 'pv-command-actions';
    const check = document.createElement('button'); check.type = 'button'; check.className = 'kn ostavit-vnutri'; check.textContent = 'проверить результат'; check.dataset.pvCheck = '1';
    const keep = document.createElement('button'); keep.type = 'button'; keep.className = 'kn ostavit-vnutri'; keep.textContent = 'оставить текущее состояние'; keep.hidden = true; keep.dataset.pvKeep = '1';
    actions.append(check, keep); panel.append(note);
    if (!record.invalid) {
      const intent = document.createElement('p'); intent.className = 'pv-command-intent';
      intent.textContent = record.kind === 'mark'
        ? (record.method === 'DELETE' ? 'Отменить отметки: ' : record.body.status === 'propushcheno' ? 'Пропустить дни: ' : 'Отметить дни: ') + actionDates(record).map(dayText).join(', ')
        : record.kind === 'lifecycle' ? record.method === 'DELETE' ? 'Выбрано: удалить задачу' : 'Выбрано: восстановить задачу'
        : record.body.povtorjaetsja ? 'Выбрано повторение: ' + names[record.body.chastota] : 'Выбрано: больше не повторять';
      panel.append(intent);
    }
    panel.append(current, actions); host.prepend(panel);
    const inspect = async acceptCurrent => {
      const actor = API.ja, key = actionKey(task); if (actionBusy.has(key)) return;
      actionBusy.add(key); check.disabled = keep.disabled = true;
      try {
        const row = checkedActionRow(task, await actionRequest(task, 'GET', undefined, record.kind === 'lifecycle' ? 'lifecycle' : undefined));
        if (API.ja !== actor) throw new Error('Доступ изменился');
        if (acceptCurrent || matchesAction(row, record)) { await actionSaved(task, row, after, 'Текущее состояние загружено', host, record.kind); panel.remove(); return; }
        note.textContent = record.invalid ? 'Сохранённое состояние показано ниже. Можно продолжить с ним.' : 'Сейчас сохранены другие данные. Повторной записи не было.';
        current.replaceChildren();
        if (record.kind === 'lifecycle' || row.udaleno) {
          const line = document.createElement('p'); line.textContent = row.udaleno ? 'Задача сейчас в корзине' : 'Задача сейчас не в корзине'; current.append(line);
          const title = document.createElement('p'); title.textContent = row.nazvanie; current.append(title);
        } else if (!record.invalid && record.kind === 'mark') for (const date of actionDates(record)) {
          const mark = row.otmetki?.find(item => item.data === date), line = document.createElement('p');
          line.textContent = dayText(date) + ': ' + (mark ? mark.status === 'sdelano' ? 'сделано' : 'пропущено' : 'не отмечено') + (mark?.kto_imja ? ', ' + mark.kto_imja : ''); current.append(line);
        } else { const line = document.createElement('p'); line.textContent = row.povtorjaetsja ? 'Повторение: ' + (names[row.chastota] || 'включено') : 'Повторение выключено'; current.append(line); }
        keep.hidden = false;
      } catch { note.textContent = 'Не удалось проверить результат. Действие осталось в браузере; повтори проверку.'; }
      finally { actionBusy.delete(key); check.disabled = keep.disabled = false; }
    };
    check.onclick = () => inspect(false); keep.onclick = () => inspect(true);
  }
  async function writeAction(task, kind, method, body, after, host, message) {
    const actor = API.ja, key = actionKey(task);
    if (actionBusy.has(key)) return false;
    if (readAction(task)) { pendingAction(task, after, host); return false; }
    if (!Number.isSafeInteger(body.versija) || body.versija < 1) { O.tost('Обнови задачу перед действием'); return false; }
    const record = { actor, nomer: Number(task.nomer), kind, method, body, phase: 'pending' };
    try { sessionStorage.setItem(key, JSON.stringify(record)); }
    catch { O.tost('Не удалось подготовить действие в браузере. Запрос не отправлен.'); return false; }
    actionBusy.add(key);
    try {
      const result = await actionRequest(task, method, body, kind);
      if (API.ja !== actor) return false;
      let payload = kind === 'mark' ? result.zadacha : result;
      if (kind === 'lifecycle' && method === 'DELETE' && typeof payload?.nomer === 'string' && /^\d+$/.test(payload.nomer)) payload = { ...payload, nomer: Number(payload.nomer) };
      const row = checkedActionRow(task, payload);
      if (!matchesAction(row, record)) throw new Error('Изменение не подтверждено');
      return await actionSaved(task, row, after, message, null, kind);
    } catch (error) {
      if (API.ja !== actor) return false;
      if (error.kod >= 400 && error.kod < 500 && error.kod !== 409) {
        try { sessionStorage.removeItem(key); } catch {}
        O.tost('Действие не применено. ' + error.message);
      } else { pendingAction(task, after, host); }
      return false;
    } finally { actionBusy.delete(key); }
  }
  function button(text, action, cls = 'pv-link') {
    const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text;
    b.addEventListener('click', e => { e.stopPropagation(); Promise.resolve().then(action).catch(err => O.tost(err.kod ? err.message : 'Не удалось загрузить данные. Повтори попытку.')); });
    return b;
  }

  async function days(task, after = () => changed(task.nomer)) {
    task = await fresh(task);
    const state = await API.odna('zadachi', `${task.nomer}/otmetki${task.den_vybora ? '?den=' + task.den_vybora : ''}`);
    const panel = document.createElement('div'); panel.className = 'pv-days';
    let status = 'sdelano';
    const mode = document.createElement('div'); mode.className = 'pv-modes';
    for (const [key, name] of [['sdelano', 'сделано'], ['propushcheno', 'пропустить']]) {
      const b = button(name, () => {
        status = key; mode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      }, 'fil-b'); b.setAttribute('aria-pressed', String(key === status)); mode.append(b);
    }
    if (task.povtorjaetsja) panel.append(mode);
    const dates = document.createElement('div'); dates.className = 'pv-dates';
    for (const day of state.dni_dlja_otmetki || []) {
      const label = document.createElement('label'); label.className = 'pv-day';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = day.data; input.checked = day.vybrano;
      const text = document.createElement('span'); text.textContent = day.podpis === 'сегодня' ? 'сегодня, ' + dayText(day.data) : dayText(day.data);
      label.append(input, text); dates.append(label);
    }
    if (!dates.children.length) { const empty = document.createElement('p'); empty.textContent = 'Все дни отмечены'; dates.append(empty); }
    if (task.povtorjaetsja) panel.append(dates);
    const history = document.createElement('details'); history.className = 'pv-history';
    const summary = document.createElement('summary'); summary.textContent = 'история отметок'; history.append(summary);
    history.open = !task.povtorjaetsja;
    for (const mark of state.spisok || []) {
      const row = document.createElement('div'); row.className = 'pv-day';
      const text = document.createElement('span'); text.textContent = `${dayText(mark.data)}, ${mark.status === 'sdelano' ? 'сделано' : 'пропущено'}${mark.kto_imja ? ', ' + mark.kto_imja : mark.kto ? ', участник ' + mark.kto : ''}`;
      row.append(text);
      if (task.povtorjaetsja) row.append(button('отменить', async () => {
        const saved = await writeAction(task, 'mark', 'DELETE', { data: mark.data, versija: state.versija }, after, panel, 'Отметка отменена');
        if (saved) await days(saved, after);
      })); history.append(row);
    }
    panel.append(history);
    const close = O.modalka(task.povtorjaetsja ? 'Отметки по дням' : 'История отметок', '<div id="pv-body"></div>', null, task.povtorjaetsja ? {
      podskazka: 'отметить дни', gotovo: async () => {
        const selected = [...dates.querySelectorAll('input:checked')].map(x => x.value);
        if (!selected.length) throw new Error('Отметь хотя бы один день');
        return writeAction(task, 'mark', 'POST', { daty: selected, status, versija: state.versija }, after, panel, `Отмечено дней: ${selected.length}`);
      },
    } : {});
    document.getElementById('pv-body').append(panel);
    if (task.povtorjaetsja) panel.append(button('не отмечать', close));
    pendingAction(task, after, panel);
  }

  async function toggle(task, after = () => changed(task.nomer)) {
    if (task.buduschij_den) { O.tost('День ещё не наступил'); return false; }
    if (O.mozhnoOtmetitPovtor && !O.mozhnoOtmetitPovtor(task)) {
      O.tost(O.prichinaNedostupnogoPovtora(task)); return false;
    }
    if (task.dnej_bez_otmetki > 0) return days(task, after);
    const date = task.den_vybora || SPR.segodnja();
    return writeAction(task, 'mark', task.otmecheno ? 'DELETE' : 'POST', { data: date, versija: task.versija }, after, null, task.otmecheno ? 'Отметка отменена' : 'День отмечен');
  }

  async function rule(task, after = () => changed(task.nomer)) {
    task = await fresh(task);
    let frequency = task.chastota || 'kazhdyj_den';
    let selected; try { selected = JSON.parse(task.dni || '[]'); } catch { selected = []; }
    if (frequency === 'raz_v_nedelju') selected = [task.den_nedeli];
    const panel = document.createElement('div'); panel.className = 'pv-rule';
    const modes = document.createElement('div'); modes.className = 'pv-modes';
    const daysRow = document.createElement('div'); daysRow.className = 'pv-week';
    const redraw = () => {
      modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.frequency === frequency)));
      daysRow.dataset.frequency = frequency;
      daysRow.hidden = !['raz_v_nedelju', 'vybrannye_dni'].includes(frequency);
      daysRow.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(selected.includes(i + 1))));
    };
    for (const [key, name] of Object.entries(names)) {
      const b = button(name, () => { frequency = key; if (key === 'raz_v_nedelju') selected = [selected[0] || 1]; redraw(); }, 'fil-b');
      b.dataset.frequency = key; modes.append(b);
    }
    week.forEach((name, i) => daysRow.append(button(name, () => {
      const day = i + 1;
      selected = frequency === 'raz_v_nedelju' ? [day] : selected.includes(day) ? selected.filter(d => d !== day) : [...selected, day];
      redraw();
    }, 'fil-b')));
    panel.append(modes, daysRow); redraw();
    O.modalka(task.povtorjaetsja ? 'Повторение' : 'Включить повторение', '<div id="pv-rule"></div>', null, { podskazka: task.povtorjaetsja ? 'сохранить повторение' : 'включить повторение', gotovo: async () => {
      return writeAction(task, 'rule', 'PATCH', { versija: task.versija, povtorjaetsja: true,
        chastota: frequency, den_nedeli: frequency === 'raz_v_nedelju' ? selected[0] : null,
        dni: frequency === 'vybrannye_dni' ? selected : null }, after, panel, 'Повторение сохранено');
    } });
    document.getElementById('pv-rule').append(panel);
    pendingAction(task, after, panel);
  }

  async function restore(task, after = () => changed(task.nomer), host = null) {
    return writeAction(task, 'lifecycle', 'POST', { versija: task.versija }, after, host, 'Задача восстановлена');
  }
  async function remove(task, after) {
    if (readAction(task)) { pendingAction(task, row => row.udaleno ? after() : O.otkrytZadachu(task.nomer, task.den_vybora), null); return; }
    const count = task.otmetki?.length || 0;
    let container;
    const finish = async row => {
      if (container?.isConnected) close();
      await after();
      if (row.udaleno) O.tost('Задача в корзине', () => restore({ ...task, versija: row.versija }));
      else O.tost('Задача сейчас не в корзине');
    };
    const close = O.modalka('Удалить задачу', `<p class="pv-delete-note">«${O.ekranirovat(task.nazvanie)}» уйдёт в корзину${count ? ` вместе с историей: ${count} ${O.skolko(count,'отметка','отметки','отметок')}` : ''}. Её можно восстановить.</p><div id="pv-delete-actions" class="pv-delete-actions"></div>`, null, {
      poverh: true,
      priZakrytii: () => {
        if (readAction(task)) Promise.resolve().then(() => O.otkrytZadachu(task.nomer, task.den_vybora)).catch(() => O.tost('Не удалось открыть задачу. Повтори попытку.'));
      },
    });
    container = document.getElementById('pv-delete-actions');
    const confirm = button('удалить задачу', async () => {
      confirm.disabled = true; confirm.setAttribute('aria-busy','true');
      try { await writeAction(task, 'lifecycle', 'DELETE', { confirm: true, versija: task.versija }, finish, container, 'Задача в корзине'); }
      finally { confirm.setAttribute('aria-busy','false'); if (!readAction(task)) confirm.disabled = false; }
    }, 'kn'); confirm.dataset.pvDeleteConfirm = '1';
    container.append(button('оставить', close, 'kn'), confirm);
  }
  function mountTrash(task, place, after) {
    const header = place.closest('.vyb-fon')?.querySelector('.vyb-g');
    if (header) { header.setAttribute('aria-disabled', 'true'); header.tabIndex = -1; header.title = 'Задача в корзине'; }
    place.replaceChildren();
    const heading = document.createElement('div'); heading.className = 'kz-zag';
    const title = document.createElement('span'); title.className = 'kz-nazvanie'; title.setAttribute('role','heading'); title.setAttribute('aria-level','2'); title.textContent = task.nazvanie; heading.append(title);
    const note = document.createElement('p'); note.className = 'pv-trash-note'; note.setAttribute('role','status'); note.textContent = 'Задача в корзине. Её можно восстановить с прежними отметками.';
    const actions = document.createElement('div'); actions.className = 'pv-tools pv-footer';
    const back = button('восстановить задачу', () => restore(task, after, place), 'kn'); back.dataset.pvRestore = '1'; actions.append(back);
    const history = document.createElement('details'); history.className = 'pv-history'; history.open = true;
    const summary = document.createElement('summary'); summary.textContent = 'история отметок: ' + (task.otmetki?.length || 0); history.append(summary);
    for (const mark of task.otmetki || []) {
      const row = document.createElement('div'); row.className = 'pv-day'; const text = document.createElement('span');
      text.textContent = dayText(mark.data) + ', ' + (mark.status === 'sdelano' ? 'сделано' : 'пропущено') + (mark.kto_imja ? ', ' + mark.kto_imja : mark.kto ? ', участник ' + mark.kto : ''); row.append(text); history.append(row);
    }
    place.append(heading, note, actions, history); pendingAction(task, after, place);
  }

  function mountCard(task, place, { after, removed, duplicate }) {
    const row = document.createElement('div'); row.className = 'kz-s';
    const label = document.createElement('span'); label.className = 'kz-p'; label.textContent = 'повторение';
    const controls = document.createElement('span'); controls.className = 'kz-z pv-tools';
    const available = !O.mozhnoOtmetitPovtor || O.mozhnoOtmetitPovtor(task);
    const headerAction = place.closest('.vyb-fon')?.querySelector('.vyb-g');
    if (headerAction && (task.povtorjaetsja || readAction(task))) {
      const disabled = !available || Boolean(readAction(task));
      headerAction.setAttribute('aria-disabled', String(disabled)); headerAction.tabIndex = disabled ? -1 : 0;
      if (!available) headerAction.title = O.prichinaNedostupnogoPovtora(task);
    }
    controls.append(button(task.povtorjaetsja ? names[task.chastota] || 'повтор' : 'включить', () => rule(task, after)));
    if (task.povtorjaetsja || task.otmetki?.length) controls.append(button('отметки по дням', () => days(task, after)));
    if (task.povtorjaetsja) controls.append(button('больше не повторять', async () => {
      await writeAction(task, 'rule', 'PATCH', { versija: task.versija, povtorjaetsja: false }, after, place, 'Повторение выключено');
    }));
    if (task.povtorjaetsja && (!available || task.den_vybora && task.den_vybora !== SPR.segodnja())) {
      const note = document.createElement('span'); note.className = 'pv-day-note';
      note.textContent = (task.den_vybora && task.den_vybora !== SPR.segodnja() ? 'День отметки: ' + dayText(task.den_vybora) + '. ' : '')
        + (!available ? O.prichinaNedostupnogoPovtora(task) : ''); controls.append(note);
    }
    row.append(label, controls); place.querySelector('.kz-polja').append(row);
    const footer = document.createElement('div'); footer.className = 'pv-tools pv-footer';
    if(duplicate)footer.append(button('дублировать задачу',duplicate));
    footer.append(button('удалить задачу', () => remove(task, removed))); place.append(footer);
    pendingAction(task, after, place);
  }
  window.LocusPovtory = { days, toggle, rule, mountCard, mountTrash };
})();
