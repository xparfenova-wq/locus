                                                                             
const { zapros, nado, sluchaj, proverit } = require('../prover.js');

module.exports = async function () {
  const person = (await nado('POST', '/api/ljudi', { telo: { imja: 'Сквозной Клиент' } })).telo;
  const client = (await nado('POST', '/api/sotrudnichestva', { telo: {
    chelovek_id: person.id, napravlenie: 'synapt', rol: 'klient', stadija: 'v_rabote',
  } })).telo;
  await nado('POST', '/api/sotrudnichestva', { telo: {
    chelovek_id: person.id, napravlenie: 'media', rol: 'klient', stadija: 'v_rabote',
  } });
  await nado('POST', '/api/sotrudnichestva', { telo: {
    chelovek_id: person.id, napravlenie: 'synapt', rol: 'referal',
  } });
  const project = (await nado('POST', '/api/proekty', { telo: {
    nazvanie: 'Сквозной проект', klient_id: person.id, napravlenie: 'synapt', status: 'idet',
  } })).telo;
  const year = new Date().getUTCFullYear();
  const period = `${year + 3}-Q2`;
  const goal = (await nado('POST', '/api/celi', { telo: {
    nazvanie: 'Сквозная цель', napravlenie: 'synapt', period_id: period, sostojanie: 'aktivna',
  } })).telo;
  const result = (await nado('POST', '/api/rezultaty', { telo: {
    cel_id: goal.id, nazvanie: 'Проверенный результат', tip: 'chislo',
    istochnik: 'ruchnoj_zamer', baza: 0, plan: 10,
  } })).telo;
  const campaign = (await nado('POST', '/api/rassylki', { telo: {
    nazvanie: 'Сквозная рассылка', napravlenie: 'synapt', ploshadka: 'telegram', plan_chislo:50,
  } })).telo;
  await nado('POST', `/api/rassylki/${campaign.id}/kontakty`, { telo: { chelovek_id: person.id } });
  const task = (await nado('POST', '/api/zadachi', { telo: {
    nazvanie: 'Сквозное действие', napravlenie: 'synapt', otvetstvennyj: 2,
    tip: 'klientskaja', klient_id: person.id, proekt_id: project.id,
    sotrudnichestvo_id: client.id, cel_id: goal.id, rezultat_id: result.id,
    rassylka_id: campaign.id,
  } })).telo;
  const card = (await nado('GET', `/api/ljudi/${person.id}/celikom`)).telo;
  proverit('одна карточка содержит три сотрудничества', card.sotrudnichestva.length === 3,
    card.sotrudnichestva.map(s => [s.napravlenie, s.rol]));
  proverit('проект находится в карточке того же человека', card.proekty.some(p => p.id === project.id));
  proverit('задача относится к конкретной клиентской роли',
    card.sotrudnichestva.find(s => s.id === client.id).zadachi.some(z => z.id === task.id));
  for (const [key, expected] of Object.entries({ klient_id: person.id, proekt_id: project.id,
    cel_id: goal.id, rezultat_id: result.id, rassylka_id: campaign.id })) {
    proverit('связь задачи ' + key, task[key] === expected, task[key]);
  }
  const readRecipients=(await nado('GET', `/api/rassylki/${campaign.id}/ljudi?zadacha_id=${task.id}`)).telo.spisok;
  await nado('PATCH', `/api/rassylki/${campaign.id}/kontakty`, { telo: {
    zapros_kljuch: require('node:crypto').randomUUID(),versii:{[person.id]:readRecipients.find(p=>p.chelovek_id===person.id).versija_otmetki},
    chelovek_ids: [person.id], status: 'otpravleno', zadacha_id: task.id,
  } });
  const recipients = (await nado('GET', `/api/rassylki/${campaign.id}/ljudi?zadacha_id=${task.id}`)).telo;
  proverit('отправка относится к этой волне и этому человеку',
    recipients.spisok.some(x => x.chelovek_id === person.id && x.status_v_volne === 'otpravleno'));
  await nado('POST', '/api/zamery', { telo: {
    rezultat_id: result.id, znachenie: 3, otkuda: 'Сквозная проверка',
  } });
  const measured = (await nado('GET', `/api/okr/rezultat/${result.id}`)).telo;
  proverit('результат показывает последний подтверждённый замер', measured.fakt === 3, measured.fakt);
  proverit('прогресс 3 из 10 равен 30 процентам', measured.progress_pct === 30, measured.progress_pct);
  const reopened = (await nado('GET', `/api/zadachi/${task.nomer}`)).telo;
  const changed = await nado('PATCH', `/api/zadachi/${task.nomer}`, { telo: {
    versija: reopened.versija, nazvanie: 'Сквозное действие обновлено',
  } });
  await sluchaj('устаревшая вкладка не затирает правку задачи', 'PATCH', `/api/zadachi/${task.nomer}`, {
    parametry: { telo: { versija: reopened.versija, nazvanie: 'Устаревшая правка' } }, zhdjom_kod: 409,
  });
  proverit('сохранённая правка осталась',
    (await nado('GET', `/api/zadachi/${task.nomer}`)).telo.nazvanie === changed.telo.nazvanie);
  await nado('POST', `/api/okr/zakryt/${period}`, { telo: {} });
  await sluchaj('в закрытый период нельзя добавить замер', 'POST', '/api/zamery', {
    parametry: { telo: { rezultat_id: result.id, znachenie: 4, otkuda: 'Не должно записаться' } },
    zhdjom_kod: 409,
  });
  for (const [name, method, url, body] of [
    ['создать цель', 'POST', '/api/celi', { nazvanie: 'Запрещённая цель', napravlenie: 'synapt', period_id: period }],
    ['переименовать цель', 'PATCH', `/api/celi/${goal.id}`, { versija: goal.versija, nazvanie: 'Запрещённая правка' }],
    ['создать результат', 'POST', '/api/rezultaty', { cel_id: goal.id, nazvanie: 'Запрещённый результат' }],
    ['переименовать результат', 'PATCH', `/api/rezultaty/${result.id}`, { versija: result.versija, nazvanie: 'Запрещённая правка' }],
    ['удалить результат', 'DELETE', `/api/rezultaty/${result.id}`, undefined],
    ['удалить цель', 'DELETE', `/api/celi/${goal.id}`, undefined],
  ]) {
    await sluchaj('закрытый период: нельзя ' + name, method, url, {
      parametry: { telo: body }, zhdjom_kod: 409,
    });
  }
  proverit('отказ записи и удаления сохранил последний замер',
    (await nado('GET', `/api/okr/rezultat/${result.id}`)).telo.fakt === 3);

  const removableGoal = (await nado('POST', '/api/celi', { telo: {
    nazvanie: 'Удаляемая цель', napravlenie: 'synapt', period_id: `${year + 4}-Q2`,
  } })).telo;
  const removableResult = (await nado('POST', '/api/rezultaty', { telo: {
    cel_id: removableGoal.id, nazvanie: 'Удаляемый результат', tip: 'chislo', plan: 5,
  } })).telo;
  const linkedTask = (await nado('POST', '/api/zadachi', { telo: {
    nazvanie: 'Задача остаётся после удаления ОКР', napravlenie: 'synapt', otvetstvennyj: 2,
    cel_id: removableGoal.id, rezultat_id: removableResult.id,
  } })).telo;
  const resultPreview=(await nado('GET',`/api/rezultaty/${removableResult.id}`)).telo;
  await nado('DELETE', `/api/rezultaty/${removableResult.id}`,{telo:{versija:resultPreview.versija,kontekst_udalenija:resultPreview.kontekst_udalenija,zapros_kljuch:require('node:crypto').randomUUID()}});
  const afterResult = (await nado('GET', `/api/zadachi/${linkedTask.nomer}`)).telo;
  proverit('удаление результата сохраняет задачу и связь с целью',
    afterResult.rezultat_id === null && afterResult.cel_id === removableGoal.id
      && afterResult.versija > linkedTask.versija, afterResult);
  const nextResult = (await nado('POST', '/api/rezultaty', { telo: {
    cel_id: removableGoal.id, nazvanie: 'Результат удаляется вместе с целью', tip: 'chislo', plan: 5,
  } })).telo;
  const relinked = (await nado('PATCH', `/api/zadachi/${linkedTask.nomer}`, { telo: {
    versija: afterResult.versija, rezultat_id: nextResult.id,
  } })).telo;
  await nado('POST', '/api/zamery', { telo: {
    rezultat_id: nextResult.id, znachenie: 2, otkuda: 'Удаляемый замер',
  } });
  const goalPreview=(await nado('GET',`/api/celi/${removableGoal.id}`)).telo;
  await nado('DELETE', `/api/celi/${removableGoal.id}`,{telo:{versija:goalPreview.versija,kontekst_udalenija:goalPreview.kontekst_udalenija,zapros_kljuch:require('node:crypto').randomUUID()}});
  const afterGoal = (await nado('GET', `/api/zadachi/${linkedTask.nomer}`)).telo;
  proverit('удаление цели сохраняет задачу без висящей связи',
    afterGoal.cel_id === null && afterGoal.rezultat_id === null
      && afterGoal.versija > relinked.versija, afterGoal);
};
