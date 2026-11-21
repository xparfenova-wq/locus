const { OshibkaVvoda } = require('../db/db.js');
                                                                          
const REFERENCES = {
  materialy: {chelovek_id:'ljudi',proekt_id:'proekty',zadacha_id:'zadachi'},
  dokumenty: {chelovek_id:'ljudi',proekt_id:'proekty'},
  zadachi: { klient_id: 'ljudi', proekt_id: 'proekty', roditel_id: 'zadachi',
    cel_id: 'celi', rezultat_id: 'rezultaty', rassylka_id: 'rassylki', sotrudnichestvo_id: 'sotrudnichestva' },
  proekty: { klient_id: 'ljudi', kto_vedet: 'ljudi', usluga_id: 'uslugi' },
  sotrudnichestva: { chelovek_id: 'ljudi', referal_id: 'ljudi', kontakt_id: 'ljudi', rekomendoval_id:'ljudi', rassylka_id:'rassylki' },
  rezultaty: { cel_id: 'celi', akkaunt_id: 'akkaunty', baza_id: 'bazy' },
  zamery: { rezultat_id: 'rezultaty' },
  platezhi: { proekt_id: 'proekty' },
  celi: { tezis_id: 'tezisy' },
  rassylki: { baza_id: 'bazy', kto_vedet: 'ljudi' },
};
function proverit(db, table, row) {
  const linked = {};
  function fail(field, message) { throw new OshibkaVvoda(message, field); }
  for (const [field, target] of Object.entries(REFERENCES[table] || {})) {
    if (row[field] == null || row[field] === '') continue;
    const id = Number(row[field]);
    const record = Number.isSafeInteger(id) && id > 0
      ? db.prepare(`SELECT * FROM ${target} WHERE id=?`).get(id) : null;
    if (!record) fail(field, `${field}: связанной записи нет`);
    linked[field] = record;
  }
  if(table==='sotrudnichestva'&&linked.rassylka_id&&linked.rassylka_id.napravlenie!==row.napravlenie){
    fail('rassylka_id','рассылка относится к другому направлению');
  }
  if (table !== 'zadachi') return;
  if (row.tip === 'klientskaja' && !linked.klient_id) fail('klient_id', 'У клиентской задачи нужен клиент');
  for (const field of ['proekt_id', 'cel_id', 'rassylka_id', 'sotrudnichestvo_id']) {
    const record = linked[field];
    if (record?.napravlenie && row.napravlenie && record.napravlenie !== row.napravlenie) {
      fail(field, `${field}: запись относится к другому направлению`);
    }
  }
  if (linked.proekt_id && row.klient_id && Number(row.klient_id) !== linked.proekt_id.klient_id) {
    fail('proekt_id', 'Проект относится к другому клиенту');
  }
  if(linked.sotrudnichestvo_id&&row.klient_id&&Number(row.klient_id)!==linked.sotrudnichestvo_id.chelovek_id){
    fail('sotrudnichestvo_id','Сотрудничество относится к другому человеку');
  }
  if (linked.rezultat_id) {
    const goal = db.prepare('SELECT * FROM celi WHERE id=?').get(linked.rezultat_id.cel_id);
    if ((row.cel_id && Number(row.cel_id) !== goal?.id) || goal?.napravlenie !== row.napravlenie) {
      fail('rezultat_id', 'Результат относится к другой цели или направлению');
    }
  }
}
module.exports = { proverit };
