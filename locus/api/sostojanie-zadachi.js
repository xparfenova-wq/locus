                                                                                       
const { Konflikt, OshibkaVvoda, seichas } = require('../db/db.js');
const POLJA_STATUSA=['status','povtorjaetsja','roditel_id','klient_id','sotrudnichestvo_id','proekt_id','napravlenie','cel_id','rezultat_id','rassylka_id'];
function proverit_gruppu(db,parent,body){
  const seen=body.versii_podzadach;
  if(!Array.isArray(seen)||seen.length>500||seen.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['id','versija'].includes(k))||!Number.isSafeInteger(r.id)||r.id<1||!Number.isSafeInteger(r.versija)||r.versija<1)||new Set(seen.map(r=>r.id)).size!==seen.length)throw new OshibkaVvoda('Обнови список подзадач перед закрытием','versii_podzadach');
  const rows=db.prepare("SELECT * FROM zadachi WHERE roditel_id=? AND status NOT IN ('sdelano','kogda_nibud') AND COALESCE(udaleno,0)=0 ORDER BY id").all(parent.id);
  if(rows.length!==seen.length||rows.some(row=>!seen.some(r=>r.id===row.id)))throw new Konflikt('Состав подзадач изменился. Проверь список перед закрытием.',{sostav_podzadach_izmenen:true});
  for(const row of rows){
    if(row.povtorjaetsja)throw new OshibkaVvoda('Повторяющиеся подзадачи отмечаются по дням отдельно','versii_podzadach');
    require('./versii.js').proverit(db,'zadachi',row,seen.find(r=>r.id===row.id).versija,[...POLJA_STATUSA,'udaleno']);
  }
  return rows;
}

function otkrytye(db, id) {
  return db.prepare(`SELECT count(*) n FROM zadachi WHERE roditel_id=?
    AND status NOT IN ('sdelano','kogda_nibud') AND COALESCE(udaleno,0)=0`).get(id).n;
}

function proverit_podtverzhdenie(db, task, body) {
  if (body.podtverzhdeno_podzadach === undefined) return;
  if (!Number.isSafeInteger(body.podtverzhdeno_podzadach) || body.podtverzhdeno_podzadach < 0) {
    throw new OshibkaVvoda('число подзадач должно быть целым и неотрицательным', 'podtverzhdeno_podzadach');
  }
  const count = otkrytye(db, task.id);
  if (body.podtverzhdeno_podzadach !== count) {
    throw new Konflikt('Список открытых подзадач изменился', { podzadach: count });
  }
}

function predstavlenie(db, value,{origin,actor}={}) {
  let counts,referralContexts;const templateSources=new Map();
  function visit(v) {
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(visit);
    const out = Object.fromEntries(Object.entries(v).map(([key, data]) =>
      [key, key === 'dannye' ? data : visit(data)]));
    if(v.id&&v.nomer&&typeof v.nazvanie==='string'&&Object.hasOwn(v,'otvetstvennyj')&&Object.hasOwn(v,'status')){
                                                                              
      const complete=Object.hasOwn(v,'otvetstvennyj')&&Object.hasOwn(v,'status');
      const route=require('../public/js/task-route-model.js').path(v.napravlenie,v.nomer);if(origin&&complete&&route)out.url=origin+route;
      if(origin&&complete&&v.shablon!=null){const key=String(v.shablon);if(!templateSources.has(key))templateSources.set(key,require('./istochnik-shablona-zadachi.js').describe(db,v.shablon,actor));out.shablon_istochnik=templateSources.get(key);}
      if(!referralContexts)referralContexts=new Map(db.prepare('SELECT r.*,z.nomer FROM referalnye_zadachi r JOIN zadachi z ON z.id=r.zadacha_id').all().map(r=>[r.zadacha_id,r]));
      const context=referralContexts.get(v.id);
                                                                             
                                                           
      if(context&&context.nomer===v.nomer&&!Object.hasOwn(v,'referalnaja_zadacha'))out.referalnaja_zadacha={vid:context.vid,period_s:context.period_s,period_po:context.period_po,summa:context.summa};
    }
    if (v.id && v.nomer && Object.hasOwn(v, 'povtorjaetsja') && Object.hasOwn(v, 'otvetstvennyj')) {
                                                                                 
      if (!counts) counts = new Map(db.prepare(`SELECT roditel_id, count(*) n FROM zadachi
        WHERE roditel_id IS NOT NULL AND status NOT IN ('sdelano','kogda_nibud')
          AND COALESCE(udaleno,0)=0 GROUP BY roditel_id`).all().map(r => [r.roditel_id, r.n]));
      out.otkrytyh_podzadach = counts.get(v.id) || 0;
    }
    return out;
  }
  return visit(value);
}

function posle_statusa(db, stalo, bylo, avtor) {
  if (stalo.status === bylo.status || stalo.povtorjaetsja) return {};
  const closed = stalo.status === 'sdelano', reopened = bylo.status === 'sdelano';
  if (!closed && !reopened) return {};
  const { v_zhurnal } = require('./obschij.js');
  const { uvedomit, POTOKI, imja_cheloveka, glagol_po_polu,
    plashka_kasanija, konec_nedeli_ot } = require('./opisanija.js');
  const extra = {};
  const count = closed ? otkrytye(db, stalo.id) : 0;
  if (count) extra.preduprezhdenie = { podzadach: count };

  if (stalo.rezultat_id) {
    const result = db.prepare(`SELECT r.*, c.period_id FROM rezultaty r
      JOIN celi c ON c.id=r.cel_id WHERE r.id=?`).get(stalo.rezultat_id);
    if (result?.tip === 'veha' && Boolean(result.zakryta) !== closed) {
      const locked = result.period_id && db.prepare('SELECT zakryt FROM periody WHERE id=?').get(String(result.period_id))?.zakryt;
      if (locked) extra.okr_period_zakryt = true;
      else {
        db.prepare('UPDATE rezultaty SET zakryta=?, versija=COALESCE(versija,0)+1 WHERE id=?').run(closed ? 1 : 0, result.id);
        v_zhurnal(db, 'rezultaty', result.id, 'zakryta', String(result.zakryta || 0), closed ? '1' : '0', avtor);
      }
    }
  }
  if (!closed) return extra;

                                                                             
                                                                                 
  const candidates = db.prepare(`SELECT r.id,r.cel_id,r.nazvanie,c.nazvanie cel_nazvanie
    FROM rezultaty r JOIN celi c ON c.id=r.cel_id LEFT JOIN periody p ON p.id=c.period_id
    WHERE r.tip<>'veha' AND r.istochnik='ruchnoj_zamer' AND COALESCE(p.zakryt,0)=0
      AND ((? IS NOT NULL AND r.id=?) OR (? IS NULL AND r.cel_id=?)) ORDER BY r.id`)
    .all(stalo.rezultat_id, stalo.rezultat_id, stalo.rezultat_id, stalo.cel_id);
  const visible = candidates.filter(r => {
    try {
      require('./pravila-otveta.js').proverit(db, {
        tablica: 'rezultaty', kljuch: r.id, metod: 'GET', avtor, telo: {}, zapros: {},
      });
      return true;
    } catch (e) { if ([403,404].includes(e.kod)) return false; throw e; }
  });
  if (visible.length) extra.predlozhit_zamer = { ...visible[0], rezultaty: visible };

  if (stalo.roditel_id) {
    const parent = db.prepare('SELECT otvetstvennyj FROM zadachi WHERE id=?').get(stalo.roditel_id);
    if (parent) {
      const name = imja_cheloveka(db, avtor);
      const who = name ? `${name} ${glagol_po_polu(db, avtor, 'закрыл', 'закрыла')}` : 'Закрыли';
      uvedomit(db, { komu: parent.otvetstvennyj, avtor, tip: 'zakryli_podzadachu',
        potok: POTOKI.sobytija, zadacha_id: stalo.id, tekst: `${who} подзадачу ${stalo.nazvanie}` });
    }
  }
  const moved = require('./podruchki.js').obnovit_poslednjuju_zadachu(db, stalo, seichas());
  if (moved) extra.poslednjaja_zadacha = moved;
  if (stalo.klient_id) {
    const banner = plashka_kasanija(db, stalo.klient_id, konec_nedeli_ot(1), avtor, 'закрыта задача по человеку');
    if (banner) extra.plashka_kasanie = banner;
  }
  return extra;
}

module.exports = { otkrytye, proverit_podtverzhdenie, predstavlenie, posle_statusa, POLJA_STATUSA, proverit_gruppu };
