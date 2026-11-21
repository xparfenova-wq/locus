                                                                    
const { OshibkaVvoda, segodnja } = require('../db/db.js');
const SHAG = 86400000;

function proverit_datu(value, pole = 'data') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value + 'T12:00:00Z'))
      || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) {
    throw new OshibkaVvoda('нужна существующая дата в виде ГГГГ-ММ-ДД', pole);
  }
  return value;
}

function dni_pravila(z) {
  let days = z.dni;
  if (typeof days === 'string') { try { days = JSON.parse(days); } catch { days = null; } }
  return Array.isArray(days) ? days : [];
}

function den_po_pravilu(z, data) {
  const day = new Date(data + 'T12:00:00Z').getUTCDay() || 7;
  if (z.chastota === 'kazhdyj_den') return true;
  if (z.chastota === 'budnie') return day <= 5;
  if (z.chastota === 'raz_v_nedelju') return Number(z.den_nedeli) === day;
  if (z.chastota === 'vybrannye_dni') return dni_pravila(z).includes(day);
  return false;
}

function proverit_pravilo(d, bylo = {}) {
  const combined = { ...bylo, ...d };
  if (Number(combined.povtorjaetsja) !== 1) {
    for (const key of ['chastota', 'dni', 'den_nedeli']) {
      if (Object.hasOwn(d, key) && d[key] != null) {
        throw new OshibkaVvoda('правило только при включённом повторении', key);
      }
    }
    return;
  }
  if (!['kazhdyj_den', 'budnie', 'raz_v_nedelju', 'vybrannye_dni'].includes(combined.chastota)) {
    throw new OshibkaVvoda('нужно правило повторения', 'chastota');
  }
                                                                               
                                                                            
  if (combined.chastota !== 'vybrannye_dni') {
    if (Object.hasOwn(d, 'dni') && d.dni != null) {
      throw new OshibkaVvoda('dni только при vybrannye_dni', 'dni');
    }
    if (combined.dni != null || Object.hasOwn(d, 'dni')) d.dni = null;
  }
  if (combined.chastota !== 'raz_v_nedelju') {
    if (Object.hasOwn(d, 'den_nedeli') && d.den_nedeli != null) {
      throw new OshibkaVvoda('den_nedeli только при raz_v_nedelju', 'den_nedeli');
    }
    if (combined.den_nedeli != null || Object.hasOwn(d, 'den_nedeli')) d.den_nedeli = null;
  }
  if (combined.chastota === 'raz_v_nedelju'
      && (!Number.isInteger(combined.den_nedeli) || combined.den_nedeli < 1 || combined.den_nedeli > 7)) {
    throw new OshibkaVvoda('день недели от 1 до 7', 'den_nedeli');
  }
  if (combined.chastota === 'vybrannye_dni') {
    const days = dni_pravila(combined);
    if (!days.length || days.some(n => !Number.isInteger(n) || n < 1 || n > 7)) {
      throw new OshibkaVvoda('нужны дни недели от 1 до 7', 'dni');
    }
    d.dni = JSON.stringify([...new Set(days)].sort((a, b) => a - b));
  }
  if (combined.povtor_s) proverit_datu(combined.povtor_s, 'povtor_s');
}

function nepokrytye_dni(db, z, den = segodnja()) {
  if (!z.povtorjaetsja) return [];
  const start = String(z.povtor_s || z.sozdano || den).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const done = new Set(db.prepare('SELECT data FROM otmetki_povtora WHERE zadacha_id=?')
    .all(z.id).map(r => r.data));
  const out = [];
  for (let ms = Date.parse(start + 'T12:00:00Z'); ms < Date.parse(den + 'T12:00:00Z'); ms += SHAG) {
    const date = new Date(ms).toISOString().slice(0, 10);
    if (den_po_pravilu(z, date) && !done.has(date)) out.push(date);
  }
  return out;
}

function podpis_propuskov(days, den = segodnja()) {
  if (!days.length) return null;
  const yesterday = new Date(Date.parse(den + 'T12:00:00Z') - SHAG).toISOString().slice(0, 10);
  if (days.length === 1 && days[0] === yesterday) return 'вчера не отмечено';
  const n = days.length, last = n % 10, lastTwo = n % 100;
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'дней' : last === 1 ? 'день' : last >= 2 && last <= 4 ? 'дня' : 'дней';
  return `${n} ${word} без отметки`;
}

function sledujuschij_den(z, den = segodnja()) {
  proverit_datu(den);
  const start = String(z.povtor_s || z.sozdano || den).slice(0, 10);
  try { proverit_datu(start, 'povtor_s'); } catch { return null; }
                                                                     
  const first = Math.max(Date.parse(den + 'T12:00:00Z') + SHAG,
    Date.parse(start + 'T12:00:00Z'));
  for (let i = 0; i < 7; i++) {
    const date = new Date(first + i * SHAG).toISOString().slice(0, 10);
    if (den_po_pravilu(z, date)) return date;
  }
  return null;
}

function sostojanie(db, z, den = segodnja()) {
  const marks = db.prepare(`SELECT o.*, l.imja AS kto_imja FROM otmetki_povtora o
    LEFT JOIN ljudi l ON l.id=o.kto WHERE o.zadacha_id=? ORDER BY o.data DESC`).all(z.id);
  if (!z.povtorjaetsja) return { otmetki: marks, otkrytye_dni: [], dnej_bez_otmetki: 0,
    propushcheno_dnej: 0, otmecheno: null, podsvetka: false };
  const open = nepokrytye_dni(db, z, den > segodnja() ? segodnja() : den);
  const mark = marks.find(r => r.data === den);
  const status = open.length ? 'prosrochena' : mark ? 'sdelano' : 'v_plane';
  const start = String(z.povtor_s || z.sozdano || den).slice(0, 10);
  return { status, status_vychislen: status, otmetki: marks, den_vybora: den,
    buduschij_den: den > segodnja(),
    sdelano: status === 'sdelano', otmecheno: Boolean(mark), status_otmetki: mark?.status || null,
    segodnja_otmecheno: Boolean(mark), otkrytye_dni: open, nepokrytye_dni: open,
    propushcheno_dnej: open.length, dnej_bez_otmetki: open.length, nepokrytyh_dnej: open.length,
    podsvetka: open.length > 3, podsvetit: open.length > 3,
    podpis_propuskov: podpis_propuskov(open, den),
    podpis_o_propuske: podpis_propuskov(open, den),
    dni_dlja_otmetki: [
      ...(den >= start && den_po_pravilu(z, den) && den <= segodnja()
        ? [{ data: den, podpis: den === segodnja() ? 'сегодня' : den, vybrano: !mark }] : []),
      ...open.slice().reverse().map(data => ({ data, podpis: data, vybrano: false })),
    ],
  };
}

function pravilo_sql(z, den) {
  const weekday = `(CASE CAST(strftime('%w',${den}) AS INTEGER) WHEN 0 THEN 7 ELSE CAST(strftime('%w',${den}) AS INTEGER) END)`;
  return `(${z}.chastota='kazhdyj_den' OR (${z}.chastota='budnie' AND ${weekday} BETWEEN 1 AND 5)
    OR (${z}.chastota='raz_v_nedelju' AND ${z}.den_nedeli=${weekday})
    OR (${z}.chastota='vybrannye_dni' AND EXISTS (SELECT 1 FROM json_each(
      CASE WHEN json_valid(${z}.dni) THEN ${z}.dni ELSE '[]' END) WHERE value=${weekday})))`;
}

function prosrochena_sql(z = 'zadachi', den = 'locus_today()') {
  const cutoff = `(CASE WHEN ${den}>locus_today() THEN locus_today() ELSE ${den} END)`;
  return `(${z}.povtorjaetsja=1 AND EXISTS (
    WITH RECURSIVE calendar(d) AS (
      SELECT date(COALESCE(${z}.povtor_s,${z}.sozdano))
        WHERE date(COALESCE(${z}.povtor_s,${z}.sozdano)) < ${cutoff}
      UNION ALL SELECT date(d,'+1 day') FROM calendar WHERE d < date(${cutoff},'-2 days')
    ) SELECT 1 FROM calendar WHERE ${pravilo_sql(z, 'calendar.d')}
      AND NOT EXISTS (SELECT 1 FROM otmetki_povtora o WHERE o.zadacha_id=${z}.id AND o.data=calendar.d)))`;
}

function status_sql(z = 'zadachi', den = 'locus_today()') {
  return `(CASE WHEN ${z}.povtorjaetsja IS NOT 1 THEN ${z}.status
    WHEN ${prosrochena_sql(z, den)} THEN 'prosrochena'
    WHEN EXISTS (SELECT 1 FROM otmetki_povtora o WHERE o.zadacha_id=${z}.id AND o.data=${den})
    THEN 'sdelano' ELSE 'v_plane' END)`;
}

function den_konteksta(query = {}) {
  const explicit = query.den_konteksta || query.den || query.data;
  if (explicit) return explicit;
  const selected = query.nedelja ?? query.sprint;
  if (selected === undefined || selected === 'vse') return undefined;
  try {
    const calendar = require('./kalendar.js');
    const week = calendar.nedelja_iz_zaprosa({ ...query, god: query.god ?? query.god_sprinta }, segodnja());
    return week.nachalo > segodnja() ? week.nachalo : undefined;
  } catch { return undefined; }                                       
}

function predstavlenie(db, value, den) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => predstavlenie(db, v, den));
  if (value.povtorjaetsja && value.id && value.nomer) {
    return { ...value, ...sostojanie(db, value, den || value.den_vybora || segodnja()) };
  }
  return Object.fromEntries(Object.entries(value).map(([key, v]) =>
    [key, key === 'dannye' ? v : predstavlenie(db, v, den)]));
}

module.exports = { proverit_datu, proverit_pravilo, den_po_pravilu,
  nepokrytye_dni, podpis_propuskov, sledujuschij_den, sostojanie, pravilo_sql, prosrochena_sql, status_sql, den_konteksta, predstavlenie };
