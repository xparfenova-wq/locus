const {moskovskijDen}=require('../prover.js');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { nado, zapros, proverit } = require('../prover');
module.exports = async () => {
  const db = new DatabaseSync(process.env.LOCUS_BAZA);
  const make = async (table, telo, avtor = 2) => (await nado('POST', '/api/' + table, { telo, avtor })).telo;
  const get = async (url, avtor = 2) => (await nado('GET', '/api/' + url, { avtor })).telo;
  const member = await make('ljudi', { imja: 'Security member', komanda: true, dostup: 'bez_deneg' });
  const client = await make('ljudi', { imja: 'Scope client' });
  const now = moskovskijDen();
  const period = `${now.slice(0, 4)}-Q${Math.ceil(Number(now.slice(5, 7)) / 3)}`;
  const goal = await make('celi', { nazvanie: 'Scoped active goal', napravlenie: 'synapt', period_id: period, sostojanie: 'aktivna' });
  const result = await make('rezultaty', { cel_id: goal.id, nazvanie: 'Clients', istochnik: 'formula', formula: 'klientov', plan: 999, tip: 'chislo' });
  const before = (await get('okr/rezultat/' + result.id)).fakt;
  await make('sotrudnichestva', { chelovek_id: client.id, napravlenie: 'media', rol: 'klient', stadija: 'v_rabote' });
  assert.equal((await get('okr/rezultat/' + result.id)).fakt, before);
  await make('sotrudnichestva', { chelovek_id: client.id, napravlenie: 'synapt', rol: 'klient', stadija: 'v_rabote' });
  assert.equal((await get('okr/rezultat/' + result.id)).fakt, before + 1);
  assert.equal((await get('okr?period=' + period)).rezultaty.find(r => r.id === result.id).fakt, before + 1);
  const check = await nado('POST', '/api/rezultaty/proverit_formulu', { telo: { formula: 'klientov', period, napravlenie: 'synapt' } });
  assert.equal(check.telo.znachenie, before + 1);
  proverit('OKR scopes agree in card, screen and formula preview', true);

  const secretPlan = 987654321;
  const money = await make('rezultaty', { cel_id: goal.id, nazvanie: 'Revenue', istochnik: 'formula', formula: 'summa_oplat', tip: 'chislo', plan: secretPlan });
  const manualMoney = await make('rezultaty', { cel_id: goal.id, nazvanie: 'Manual revenue', istochnik: 'ruchnoj_zamer', tip: 'dengi', plan: secretPlan });
  await make('zamery', { rezultat_id: manualMoney.id, znachenie: secretPlan, otkuda: 'Test income' });
  for (const url of ['rezultaty/' + money.id, 'okr/rezultat/' + money.id, 'okr/rezultaty/' + money.id,
    'zamery?rezultat_id=' + manualMoney.id, 'okr/zamery?rezultat_id=' + manualMoney.id]) {
    assert.equal((await zapros('GET', '/api/' + url, { avtor: member.id })).kod, 403, url);
  }
  for (const url of ['rezultaty', 'okr/rezultaty', 'zamery', 'okr/zamery', 'okr?period=' + period, 'zhurnal']) {
    const response = await get(url, member.id);
    assert.ok(!JSON.stringify(response).includes(String(secretPlan)), url);
  }
  for (const [method, url, telo] of [
    ['PATCH', 'rezultaty/' + money.id, { versija: money.versija, tip: 'chislo', formula: null }],
    ['POST', 'rezultaty', { cel_id: goal.id, nazvanie: 'No bypass', formula: 'summa_oplat', istochnik: 'formula' }],
    ['POST', 'okr/zamery', { rezultat_id: manualMoney.id, znachenie: 1, otkuda: 'No bypass' }],
    ['DELETE', 'rezultaty/' + manualMoney.id, {}],
  ]) assert.equal((await zapros(method, '/api/' + url, { telo, avtor: member.id })).kod, 403, url);
  const plain = await make('rezultaty', { cel_id: goal.id, nazvanie: 'Public manual metric',plan:10,baza:0, istochnik: 'ruchnoj_zamer' });
  const publicMeasurement = await make('zamery', { rezultat_id: plain.id, znachenie: 1, otkuda: 'Public metric' });
  assert.equal((await zapros('PATCH', '/api/zamery/' + publicMeasurement.id, {
    avtor: member.id, telo: { rezultat_id: manualMoney.id, znachenie: 42 },
  })).kod, 403);
  for (const url of ['rezultaty?plan=' + secretPlan, 'zamery?znachenie=' + secretPlan, 'proekty?stoimost=' + secretPlan]) {
    assert.equal((await zapros('GET', '/api/' + url, { avtor: member.id })).kod, 403);
  }
  proverit('financial restrictions cover aliases, lists, measurements and writes', true);
  const project = await make('proekty', { nazvanie: 'Export privacy', napravlenie: 'synapt', klient_id: client.id,
    status: 'idet', stoimost: secretPlan });
  const exported = await get('vygruzka?chto=proekty', member.id);
  assert.ok(!exported.csv.includes(String(secretPlan)));
  assert.ok(!exported.stolbcy.includes('stoimost'));
  const linkedMoneyTask = await make('zadachi', { nazvanie: 'Task visible without money', napravlenie: 'synapt',
    otvetstvennyj: member.id, cel_id: goal.id, rezultat_id: money.id });
  assert.equal((await get('zadachi/' + linkedMoneyTask.nomer, member.id)).nomer, linkedMoneyTask.nomer);
  proverit('CSV obeys money rights; linked task remains visible', true);
  const week = require('../../db/db').nomer_nedeli(now);
  const snap = await nado('POST', '/api/planerka/snimok?napravlenie=synapt&nedelja=' + week, { telo: {}, avtor: member.id });
  assert.equal(snap.telo.dannye.dengi.skryto, true);
  const stored = db.prepare('SELECT dannye FROM snimki_planerki WHERE napravlenie=? AND nedelja=?').get('synapt',week);
  assert.equal(JSON.parse(stored.dannye).dengi.skryto, false);
  for (const url of ['planerka/snimok?napravlenie=synapt&nedelja=' + week]) {
    assert.ok(!JSON.stringify(await get(url, member.id)).includes(String(secretPlan)), url);
  }
  proverit('shared snapshot keeps full data but returns only permitted fields', true);

  const draft = await make('celi', { nazvanie: 'Private draft marker', napravlenie: 'synapt', period_id: period });
  assert.equal((await zapros('GET', '/api/celi/' + draft.id, { avtor: member.id })).kod, 404);
  for (const url of ['celi', 'okr/celi?period=' + period, 'okr?period=' + period]) {
    assert.ok(!JSON.stringify(await get(url, member.id)).includes(draft.nazvanie), url);
  }
  const search = await get('poisk?chto=' + encodeURIComponent(draft.nazvanie), member.id);
  assert.ok(!search.najdeno.some(row => row.chto === 'cel' && row.id === draft.id));
  const ownDraft = await make('okr/celi', { nazvanie: 'Own draft', napravlenie: 'synapt', period_id: period }, member.id);
  assert.equal((await get('celi/' + ownDraft.id, member.id)).id, ownDraft.id);
  assert.equal((await zapros('PATCH', '/api/celi/' + ownDraft.id, { avtor: member.id,
    telo: { versija: ownDraft.versija, sostojanie: 'aktivna' } })).kod, 200);
  proverit('draft belongs to its author and any author can activate their goal', true);

  const task = await make('zadachi', { nazvanie: 'Atomic parent', napravlenie: 'synapt', otvetstvennyj: 2 });
  const child = await make('zadachi', { nazvanie: 'Atomic child', napravlenie: 'synapt', otvetstvennyj: member.id, roditel_id: task.id });
  const journalBefore = db.prepare('SELECT count(*) n FROM zhurnal').get().n;
  const noticesBefore = db.prepare('SELECT count(*) n FROM uvedomlenija').get().n;
  db.exec(`CREATE TRIGGER test_child_journal_failure BEFORE INSERT ON zhurnal
    WHEN NEW.obekt='zadacha' AND NEW.obekt_id=${child.id} AND NEW.pole='status'
    BEGIN SELECT RAISE(ABORT,'test_child_journal_failure'); END`);
  try {
    assert.equal((await zapros('POST', `/api/zadachi/${task.nomer}/zakryt`, { telo: { versija:task.versija,i_podzadachi: true,versii_podzadach:[{id:child.id,versija:child.versija}] } })).kod, 500);
    for (const old of [task, child]) {
      const current = await get('zadachi/' + old.nomer);
      assert.equal(current.status, old.status);
      assert.equal(current.versija, old.versija);
    }
    assert.equal(db.prepare('SELECT count(*) n FROM zhurnal').get().n, journalBefore);
    assert.equal(db.prepare('SELECT count(*) n FROM uvedomlenija').get().n, noticesBefore);
  } finally { db.exec('DROP TRIGGER test_child_journal_failure'); }
  await nado('POST', `/api/zadachi/${task.nomer}/zakryt`, { telo: { versija:task.versija,i_podzadachi: true,versii_podzadach:[{id:child.id,versija:child.versija}] } });
  assert.equal((await get('zadachi/' + child.nomer)).status, 'sdelano');
  proverit('subject action rolls back parent, child, journal and notifications on failure', true);
  for (const field of ['klient_id', 'proekt_id', 'cel_id', 'rezultat_id', 'rassylka_id']) {
    assert.equal((await zapros('PATCH', '/api/zadachi/' + task.nomer, {
      telo: { versija: (await get('zadachi/' + task.nomer)).versija, [field]: 999999999 },
    })).kod, 400, field);
  }
  db.close();
  proverit('task references reject nonexistent records on update', true);
};
