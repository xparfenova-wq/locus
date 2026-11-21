                                                                    
const { zapros, nado, sluchaj, proverit } = require('../prover.js');
module.exports = async function () {
  const msk = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
  const day = offset => new Date(Date.parse(msk+'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const today = day(0), start = day(-14);
  const create = (fields = {}) => nado('POST', '/api/zadachi', { telo: {
    nazvanie: 'Повтор: проверка дней', napravlenie: 'synapt', otvetstvennyj: 2,
    povtorjaetsja: true, povtor_s: start, chastota: 'kazhdyj_den', ...fields,
  } }).then(r => r.telo);
  const task = await create();
  const url = `/api/zadachi/${task.nomer}`;
  for (const [name, data] of [['будущее', day(1)], ['несуществующий день', '2026-02-30'], ['раньше включения', day(-15)]]) {
    await sluchaj('отметка: запрещено ' + name, 'POST', url + '/otmetki', {
      parametry: { telo: { data } }, zhdjom_kod: 400,
    });
  }
  const before = (await nado('GET', url + '/otmetki')).telo.spisok.length;
  const dates = [day(-3), day(-2), day(-1)];
  const batch = await zapros('POST', url + '/otmetki', { telo: { daty: dates } });
  proverit('три даты записываются одним запросом', batch.kod === 201 && batch.telo.otmecheno === 3, batch);
  const marked = (await nado('GET', url + '/otmetki')).telo.spisok;
  proverit('все три даты присутствуют без дополнительных строк', marked.length === before + 3
    && dates.every(d => marked.some(r => r.data === d)), marked);
  await zapros('POST', url + '/otmetki', { telo: { daty: dates } });
  proverit('повтор массового запроса не удваивает отметки',
    (await nado('GET', url + '/otmetki')).telo.spisok.length === marked.length);
  const mixed = await zapros('POST', url + '/otmetki', { telo: { daty: [day(-4), day(1)] } });
  proverit('неверный день отклоняет весь пакет', mixed.kod === 400
    && !(await nado('GET', url + '/otmetki')).telo.spisok.some(r => r.data === day(-4)), mixed);
  await nado('POST', url + '/otmetki', { telo: { data: today } });
  const current = (await nado('GET', url)).telo;
  proverit('сегодняшняя отметка не скрывает прежние пропуски', current.status === 'prosrochena'
    && current.dnej_bez_otmetki > 0 && current.otmecheno === true, current);
  const unmarked = await zapros('DELETE', url + '/otmetki', { telo: { data: today } });
  proverit('отметку за день можно отменить', unmarked.kod === 200
    && !(await nado('GET', url + '/otmetki')).telo.spisok.some(r => r.data === today), unmarked);
  const beforeRemoval = (await nado('GET', url)).telo;
  const removal = await zapros('DELETE', url, { telo: { versija: beforeRemoval.versija } });
  proverit('удаление с историей требует подтверждения', removal.kod === 409
    && removal.telo.oshibka === 'nuzhno_podtverzhdenie' && removal.telo.otmetok === marked.length, removal);
  const deleted=await nado('DELETE', url, { telo: { confirm: true, versija: beforeRemoval.versija } });
  await nado('POST', url + '/vernut', { telo: {versija:deleted.telo.versija} });
  proverit('возврат из корзины сохраняет отметки',
    (await nado('GET', url + '/otmetki')).telo.spisok.length === marked.length);

  const weekly = await create({ chastota: 'raz_v_nedelju', den_nedeli: 2 });
  const chosen = await create({ chastota: 'vybrannye_dni', dni: [1, 3, 5] });
  for (const z of [weekly, chosen]) {
    const expected = z.id === weekly.id ? [2] : [1, 3, 5];
    for (let i = -7; i < 0; i++) {
      const date = day(i), weekday = new Date(date + 'T12:00:00Z').getUTCDay() || 7;
      const list = (await nado('GET', '/api/zadachi?data=' + date)).telo.spisok;
      proverit('список дня следует правилу ' + z.chastota + ' ' + date,
        list.some(r => r.nomer === z.nomer) === expected.includes(weekday));
      const mark = await zapros('POST', `/api/zadachi/${z.nomer}/otmetki`, { telo: { data: date } });
      proverit('отметка следует тому же правилу ' + date, mark.kod === (expected.includes(weekday) ? 201 : 400), mark);
    }
  }
  const fresh = (await nado('GET', url)).telo;
  const disabled = await nado('PATCH', url, { telo: { versija: fresh.versija, povtorjaetsja: false } });
  proverit('выключение очищает правило и возвращает срок', disabled.telo.chastota === null
    && disabled.telo.dni === null && disabled.telo.den_nedeli === null && Boolean(disabled.telo.srok), disabled.telo);
  proverit('выключение сохраняет всю историю',
    (await nado('GET', url + '/otmetki')).telo.spisok.length === marked.length);

  const skipped = await create({povtor_s:today});
  const skipUrl = `/api/zadachi/${skipped.nomer}`;
  for(const body of [{nazvanie:''},{napravlenie:null}]) await sluchaj('обязательное поле повтора не очищается','PATCH',skipUrl,{
    parametry:{telo:{versija:skipped.versija,...body}},zhdjom_kod:400,
  });
  await nado('POST',skipUrl+'/otmetki',{telo:{data:today,status:'propushcheno'}});
  const skippedState=(await nado('GET',skipUrl)).telo;
  proverit('пропущенный день закрыт, отдельно помечен пропущенным',skippedState.status==='sdelano'
    && skippedState.status_otmetki==='propushcheno' && skippedState.otmecheno===true,skippedState);
  proverit('пропущенный день не записывается в результаты как сделанный',
    !(await nado('GET','/api/itogi?den='+today)).telo.punkty.some(p=>p.nomer===skipped.nomer));
  const beforeUndo=skippedState.versija;
  await nado('DELETE',skipUrl+'/otmetki',{telo:{data:today,versija:beforeUndo}});
  await sluchaj('устаревшие отметки не перезаписываются','POST',skipUrl+'/otmetki',{
    parametry:{telo:{data:today,versija:beforeUndo}},zhdjom_kod:409,
  });
  await nado('POST',skipUrl+'/otmetki',{telo:{data:today}});
  const workspace=(await nado('GET','/api/moe_prostranstvo')).telo;
  proverit('сделанный повтор остаётся в моём пространстве',workspace.zadachi.some(z=>z.nomer===skipped.nomer
    && z.status==='sdelano'),workspace.zadachi.find(z=>z.nomer===skipped.nomer));
  const week=require('../../db/db').nomer_nedeli(today);
  const actualList=(await nado('GET','/api/zadachi?otvetstvennyj=2&sprint='+week+'&na_stranice=200')).telo.spisok;
  const summary=(await nado('GET','/api/zadachi/svodka?otvetstvennyj=2&sprint='+week)).telo;
  for(const status of ['v_plane','v_processe','na_soglasovanii','sdelano','kogda_nibud','prosrochena']){
    proverit('сводка и список согласованы: '+status,summary.po_statusu[status]===actualList.filter(z=>z.status===status).length,
      {summary:summary.po_statusu[status],actual:actualList.filter(z=>z.status===status).length});
  }
  const future=(await nado('GET','/api/zadachi?data='+day(1))).telo.spisok.find(z=>z.nomer===skipped.nomer);
  proverit('завтрашний день не порождает будущую просрочку',future.status==='v_plane'
    && future.buduschij_den===true && future.dnej_bez_otmetki===0,future);
  await sluchaj('сырой статус повтора не правится','PATCH',skipUrl,{
    parametry:{telo:{versija:(await nado('GET',skipUrl)).telo.versija,status:'sdelano'}},zhdjom_kod:400,
  });
  const past=await create({povtor_s:day(-2)});
  await nado('POST',`/api/zadachi/${past.nomer}/otmetki`,{telo:{data:day(-2)}});
  const pastList=(await nado('GET','/api/zadachi?data='+day(-2)+'&status=sdelano')).telo.spisok;
  proverit('фильтр статуса использует выбранный день',pastList.some(z=>z.nomer===past.nomer && z.status==='sdelano'));
  const old=await create({povtor_s:day(-451)});
  proverit('история пропусков не обрезается четырьмястами днями',
    (await nado('GET',`/api/zadachi/${old.nomer}`)).telo.dnej_bez_otmetki===451);
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(process.env.LOCUS_BAZA);
  const atomic=await create({povtor_s:day(-2)});
  db.exec(`CREATE TRIGGER test_repeat_failure BEFORE INSERT ON zhurnal
    WHEN NEW.obekt='zadacha' AND NEW.obekt_id=${atomic.id} AND NEW.pole='otmetka'
      AND NEW.stalo LIKE '${day(-1)}%'
    BEGIN SELECT RAISE(ABORT,'test_repeat_failure'); END`);
  try {
    await sluchaj('отказ журнала отменяет весь пакет отметок','POST',`/api/zadachi/${atomic.nomer}/otmetki`,{
      parametry:{telo:{daty:[day(-2),day(-1)]}},zhdjom_kod:500,
    });
    proverit('после отказа пакета нет отметок и прежняя версия',
      (await nado('GET',`/api/zadachi/${atomic.nomer}/otmetki`)).telo.spisok.length===0
      && (await nado('GET',`/api/zadachi/${atomic.nomer}`)).telo.versija===atomic.versija);
  } finally {db.exec('DROP TRIGGER test_repeat_failure');db.close();}
  await sluchaj('в дату нельзя подставить SQL','GET',"/api/moe_prostranstvo?den="+encodeURIComponent("1900-01-01' OR 1=1"),{zhdjom_kod:400});
};
