                                                       
  
                                                                         
                                                                 

const { baza, v_api, v_bazu, OshibkaVvoda, NeNajdeno , seichas } = require('../db/db.js');
const { segodnja, nomer_nedeli, v_odnoj_tranzakcii } = require('../db/db.js');
const { OTKRYTA, NE_UDALENA, zhurnal_stroki } = require('./podruchki.js');

                                                                      
                            
const { granicy_nedeli, iso_nedelja, nedelja_iz_zaprosa, sdvinut_nedelju, nedel_v_godu } = require('./kalendar.js');

                                              
  
                                                                           
                                                                  
                                                          
function moe_prostranstvo({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const ja = Number(zapros.chelovek_id || avtor);
  if (!Number.isInteger(ja)) throw new OshibkaVvoda('нужен автор запроса', 'chelovek_id');
  const den = zapros.den || segodnja();
  const week = nedelja_iz_zaprosa(zapros, den);
  const sprint = week.nomer;
  const chip = zapros.chip || 'vse';
  const chipy = ['vse', 'dobavleno_komandoj', 'uchastvuju', 'na_segodnja', 'prosrochennye'];
  if (!chipy.includes(chip)) {
    throw new OshibkaVvoda(`chip: одно из ${chipy.join(', ')}`, 'chip');
  }

                                                                   
                                                                        
                                                                  
                                                                        
  if (zapros.otvetstvennyj !== undefined) {
    throw new OshibkaVvoda(
      'Моё пространство не фильтруется по ответственному: это мой экран, '
      + 'ответственный на нём всегда я. Чужие задачи ищутся в разделе Задачи',
      'otvetstvennyj');
  }
  if (zapros.tip !== undefined) {
    throw new OshibkaVvoda(
      'Моё пространство не фильтруется по типу: фильтров здесь три, '
      + 'спринт, статус и направление', 'tip');
  }

                                                                    
                                                           
  const STATUSY = require('./opisanija.js').STATUSY_ZADACHI;
  const repeat = require('./povtory.js');
  const repeatDay = repeat.den_konteksta(zapros) || den;
  repeat.proverit_datu(den); repeat.proverit_datu(repeatDay);
  const state = repeat.status_sql('z', `'${repeatDay}'`);
  const open = `(z.povtorjaetsja=1 OR ${OTKRYTA.replace('status','z.status')})`;
  const f_status = zapros.status || null;
  if (f_status && ![...STATUSY,'prosrochena'].includes(f_status)) {
    throw new OshibkaVvoda(`status: одно из ${STATUSY.join(', ')}`, 'status');
  }
  const f_napr = zapros.napravlenie || null;
  if (f_napr && !db.prepare('SELECT 1 FROM napravlenija WHERE kod = ?').get(f_napr)) {
    throw new OshibkaVvoda(`направления ${f_napr} нет`, 'napravlenie');
  }
                                                                       
                                                        
  const dop = (f_status ? ` AND ${state} = '${f_status}'` : '')
            + (f_napr ? ` AND z.napravlenie = '${f_napr}'` : '');

                                                            
                                                                    
                                                                
                                                              
                                                               
  const svoi = `z.otvetstvennyj = ${ja}`;
  const v_sprinte = require('./kampanii.js').weeklyPredicate('z',week);
  const uslovija = {
    vse: `${svoi} AND ${v_sprinte}`,
    dobavleno_komandoj: `${svoi} AND ${v_sprinte} AND z.kto_dobavil IS NOT NULL AND z.kto_dobavil <> ${ja}`,
    uchastvuju: `z.otvetstvennyj <> ${ja} AND EXISTS (
        SELECT 1 FROM zadacha_uchastniki u
        WHERE u.zadacha_id = z.id AND u.chelovek_id = ${ja})`,
    na_segodnja: `${svoi} AND (z.srok = '${den}' OR (z.povtorjaetsja=1 AND COALESCE(z.povtor_s,'0001-01-01')<='${den}' AND ${repeat.pravilo_sql('z', `'${den}'`)}))`,
    prosrochennye: `${svoi} AND ((z.povtorjaetsja IS NOT 1 AND z.srok IS NOT NULL AND z.srok < '${den}') OR ${repeat.prosrochena_sql('z', `'${den}'`)})`,
  };

  const spisok = db.prepare(
    `SELECT z.*, l.imja otvetstvennyj_imja, p.nazvanie proekt_nazvanie,
            k.imja klient_imja
     FROM zadachi z
     LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
     LEFT JOIN proekty p ON p.id = z.proekt_id
     LEFT JOIN ljudi k ON k.id = z.klient_id
     WHERE ${NE_UDALENA.replace(/udaleno/g, 'z.udaleno')}
       AND ${open}
       AND (${uslovija[chip]})${dop}
     ORDER BY
       CASE WHEN z.srok IS NOT NULL AND z.srok < '${den}' THEN 0
            WHEN z.srok = '${den}' THEN 1
            WHEN z.srok IS NULL THEN 3
            ELSE 2 END,
       z.srok, z.nomer`
  ).all();

                                                              
  const chislo_chipa = (nazvanie) => db.prepare(
    `SELECT count(*) k FROM zadachi z
     WHERE ${NE_UDALENA.replace(/udaleno/g, 'z.udaleno')}
       AND ${open}
       AND (${uslovija[nazvanie]})${dop}`
  ).get().k;

  const moi_proekty = db.prepare(
    `SELECT p.*, l.imja klient_imja FROM proekty p
     LEFT JOIN ljudi l ON l.id = p.klient_id
     WHERE p.kto_vedet = ? AND (p.arhiv IS NULL OR p.arhiv = 0)
     ORDER BY p.id DESC`
  ).all(ja);

  return {
    telo: {
      chelovek_id: ja,
      den,
      sprint,
      nedelja: { ...week },
      chip,
                                                                        
                                                                  
      filtry: { sprint, status: f_status, napravlenie: f_napr },
      chipy: Object.fromEntries(chipy.map((c) => [c, chislo_chipa(c)])),
      zadachi: spisok.map((z) => ({
        ...v_api(z),
        ...(z.rassylka_id?require('./volny-rassylok.js').taskStats(db,z,week):{}),
        prosrocheno: Boolean(z.srok && z.srok < den),
        adres: `/${z.napravlenie}/${z.nomer}`,
      })),
      proekty: moi_proekty.map((p) => v_api(p)),
                                                                
      prodlenie_dostupno: chip === 'prosrochennye' && chislo_chipa('prosrochennye') > 0,
    },
  };
}

                                             
  
                                                                       
                                             
                                             
                                                                       
                                                  
function itogi({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const ja = Number(zapros.chelovek_id || avtor);
  if (!Number.isInteger(ja)) throw new OshibkaVvoda('нужен автор запроса', 'chelovek_id');
  const den = zapros.den || segodnja();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) throw new OshibkaVvoda('den в виде ГГГГ-ММ-ДД', 'den');
  const eto_segodnja = den === segodnja();

                                                                         
  const zakrytye_mnoj = db.prepare(
    `SELECT DISTINCT z.obekt_id FROM zhurnal z
     WHERE z.obekt = 'zadacha' AND z.pole = 'status' AND z.stalo = 'sdelano'
       AND z.kto = ? AND date(z.kogda,'+3 hours') = ?`
  ).all(ja, den).map((r) => r.obekt_id);

                                                                  
                                                       
  const est_otmetki = (() => {
    try {
      return db.prepare(
        'SELECT count(1) n FROM otmetki_povtora WHERE data = ?').get(den).n > 0;
    } catch { return false; }
  })();
  if (!zakrytye_mnoj.length && !eto_segodnja && !est_otmetki) {
    return { telo: { den, punkty: [], tekst: 'за этот день пока нет сделанного' } };
  }

  const v_spisok = zakrytye_mnoj.length
    ? zakrytye_mnoj.join(',')
    : '-1';

                                     
  const moi_zakrytye = db.prepare(
    `SELECT * FROM zadachi
     WHERE id IN (${v_spisok}) AND otvetstvennyj = ?
       AND (ne_v_itogi IS NULL OR ne_v_itogi = 0)
       AND (roditel_id IS NULL)
       AND ${NE_UDALENA}
     ORDER BY nomer`
  ).all(ja);

                                             
  const v_processe = eto_segodnja
    ? db.prepare(
        `SELECT * FROM zadachi
         WHERE otvetstvennyj = ? AND status = 'v_processe'
           AND (ne_v_itogi IS NULL OR ne_v_itogi = 0)
           AND roditel_id IS NULL AND ${NE_UDALENA}
         ORDER BY nomer`
      ).all(ja)
    : [];

                                              
  const chuzhie = db.prepare(
    `SELECT DISTINCT r.* FROM zadachi p
     JOIN zadachi r ON r.id = p.roditel_id
     WHERE p.id IN (${v_spisok}) AND p.otvetstvennyj = ?
       AND r.otvetstvennyj <> ?
       AND (r.ne_v_itogi IS NULL OR r.ne_v_itogi = 0)
       AND ${NE_UDALENA.replace(/udaleno/g, 'r.udaleno')}
     ORDER BY r.nomer`
  ).all(ja, ja);

                                             
  const podzadachi = (roditel_id) => db.prepare(
    `SELECT * FROM zadachi
     WHERE roditel_id = ? AND id IN (${v_spisok})
       AND (ne_v_itogi IS NULL OR ne_v_itogi = 0)
     ORDER BY jakor, nomer`
  ).all(roditel_id).map((p) => v_api(p));

  const punkt = (z, status, istochnik = 'zadacha') => ({
    ...v_api(z),
    itogovyj_status: status,
                                                                 
                                                    
    status: status === 'chuzhaja' ? 'sdelano' : status,
    sdelano: status === 'sdelano',
    chuzhaya: status === 'chuzhaja',
                                                                
                                                           
                                               
    kogda: den,
    zadacha_id: z.id,
    istochnik,
    adres: `/${z.napravlenie}/${z.nomer}`,
                                                          
                                               
    ssylka: (z.ssylka || '').trim() || null,
    podzadachi: podzadachi(z.id),
  });

                                                                 
                                                               
  const po_otmetkam = (() => {
    try {
      return db.prepare(
        `SELECT z.* FROM otmetki_povtora o JOIN zadachi z ON z.id = o.zadacha_id
          WHERE o.data = ? AND o.status='sdelano' AND z.otvetstvennyj = ?
            AND (z.ne_v_itogi IS NULL OR z.ne_v_itogi = 0)
            AND ${NE_UDALENA.replace(/udaleno/g, 'z.udaleno')}
          ORDER BY z.nomer`).all(den, ja);
    } catch { return []; }
  })();

  const punkty = [
    ...moi_zakrytye.map((z) => punkt(z, 'sdelano')),
    ...po_otmetkam.filter((z) => !moi_zakrytye.some((m) => m.id === z.id))
      .map((z) => punkt(z, 'sdelano', 'otmetka_povtora')),
    ...v_processe.filter((z) => !moi_zakrytye.some((m) => m.id === z.id))
      .map((z) => punkt(z, 'v_processe')),
    ...chuzhie.map((z) => punkt(z, 'chuzhaja')),
  ];

                                 
  const slovami = { sdelano: 'сделано', v_processe: 'в процессе', chuzhaja: 'закрыта подзадача' };
  const dd = `${den.slice(8, 10)}.${den.slice(5, 7)}`;
  const stroki = [`#результаты ${dd}`, ''];
  punkty.forEach((p, i) => {
    stroki.push(`${i + 1}. ${p.nazvanie}, ${slovami[p.itogovyj_status]}`);
    if (p.ssylka) stroki.push(`   ${p.ssylka}`);
    p.podzadachi.forEach((pz) => stroki.push(`   – ${pz.nazvanie}, сделано`));
  });

  return {
    telo: {
      den,
      segodnja: eto_segodnja,
      punkty,
      tekst: punkty.length ? stroki.join('\n') : 'за этот день пока нет сделанного',
    },
  };
}

                                  
  
                                                                     
                                                                   
                                                              
                                                
  
                                                               
                                                 
function kontent({ zapros, metod, avtor }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  if(zapros.vid==='kalendar')return require('./kontent-plan.js').handle({db,zapros,avtor});
  const den = zapros.den || segodnja();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) {
    throw new OshibkaVvoda('den в виде ГГГГ-ММ-ДД', 'den');
  }
  const dnej = Math.min(parseInt(zapros.dnej, 10) || 14, 60);

  const uslovija = ['z.publikacija = 1', NE_UDALENA.replace(/udaleno/g, 'z.udaleno')];
  const znachenija = [];

                                                                           
  for (const pole of ['ploshadka', 'format', 'rubrika']) {
    if (zapros[pole] !== undefined && zapros[pole] !== '') {
      uslovija.push(`z.${pole} = ?`);
      znachenija.push(String(zapros[pole]));
    }
  }
                                                                      
                                                
  if (zapros.napravlenie !== undefined && zapros.napravlenie !== '') {
    const kody = String(zapros.napravlenie).split(',')
      .map((s) => s.trim()).filter(Boolean).slice(0, 3);
    if (kody.length) {
      uslovija.push(`z.napravlenie IN (${kody.map(() => '?').join(',')})`);
      znachenija.push(...kody);
    }
  }
                                                  
  if (zapros.klient_id) {
    uslovija.push('z.klient_id = ?');
    znachenija.push(chislo_ili_null(zapros.klient_id));
  }
                                                               
                                                         
  if (zapros.tolko === 'klientskie') uslovija.push('z.klient_id IS NOT NULL');
  if (zapros.tolko === 'nashi') uslovija.push('z.klient_id IS NULL');
  if (zapros.akkaunt_id) {
    uslovija.push('z.akkaunt_id = ?');
    znachenija.push(chislo_ili_null(zapros.akkaunt_id));
  }
  if (zapros.otvetstvennyj) {
    uslovija.push('z.otvetstvennyj = ?');
    znachenija.push(chislo_ili_null(zapros.otvetstvennyj));
  }

                                        
  const konec = new Date(`${den}T00:00:00Z`);
  konec.setUTCDate(konec.getUTCDate() + dnej - 1);
  const po = konec.toISOString().slice(0, 10);
  uslovija.push('COALESCE(z.data_vyhoda, z.srok) >= ?');
  uslovija.push('COALESCE(z.data_vyhoda, z.srok) <= ?');
  znachenija.push(den, po);

  const stroki = db.prepare(
    `SELECT z.*, l.imja otvetstvennyj_imja, a.nazvanie akkaunt_nazvanie
     FROM zadachi z
     LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
     LEFT JOIN akkaunty a ON a.id = z.akkaunt_id
     WHERE ${uslovija.join(' AND ')}
     ORDER BY COALESCE(z.data_vyhoda, z.srok), z.nomer`
  ).all(...znachenija);

                                                     
  const po_dnjam = new Map();
  for (let i = 0; i < dnej; i += 1) {
    const d = new Date(`${den}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    po_dnjam.set(d.toISOString().slice(0, 10), []);
  }
  for (const z of stroki) {
    const data = String(z.data_vyhoda || z.srok || '').slice(0, 10);
    if (po_dnjam.has(data)) {
      po_dnjam.get(data).push({
        ...v_api(z),
        adres: `/${z.napravlenie}/${z.nomer}`,
      });
    }
  }

                                                    
  const znachenija_filtrov = (pole) => db.prepare(
    `SELECT DISTINCT ${pole} v FROM zadachi z
     WHERE z.publikacija = 1 AND ${NE_UDALENA.replace(/udaleno/g, 'z.udaleno')}
       AND ${pole} IS NOT NULL AND ${pole} <> ''
     ORDER BY 1`
  ).all().map((r) => r.v);

  return {
    telo: {
      den,
      dnej,
      po,
      dni: [...po_dnjam.entries()].map(([data, zadachi]) => ({
        data,
        segodnja: data === segodnja(),
        zadachi,
        skolko: zadachi.length,
      })),
      vsego: stroki.length,
      filtry: {
        ploshadka: znachenija_filtrov('ploshadka'),
        format: znachenija_filtrov('format'),
        rubrika: znachenija_filtrov('rubrika'),
                                                            
                                                              
        napravlenie: znachenija_filtrov('napravlenie'),
        klienty: db.prepare(
          `SELECT DISTINCT l.id, l.imja FROM zadachi z
             JOIN ljudi l ON l.id = z.klient_id
            WHERE z.publikacija = 1
              AND (z.udaleno IS NULL OR z.udaleno = 0)
            ORDER BY l.imja`).all(),
      },
    },
  };
}

function chislo_ili_null(x) {
  const n = parseInt(x, 10);
  return Number.isInteger(n) ? n : null;
}

                                                              
                                                                      
function prodlit({ telo, avtor, metod }) {
  if (metod !== 'POST') throw Object.assign(new Error('сюда только POST'), { kod: 405 });
  const db = baza();
  const { v_zhurnal } = require('./obschij.js');
  const ja = Number(telo.chelovek_id || avtor);
  if (ja !== Number(avtor)) throw Object.assign(new Error('продлить можно только свои задачи'), { kod: 403 });
  const den = telo.den || segodnja();
  const week = nedelja_iz_zaprosa(telo, den), sprint = week.nomer;
  const { konec } = week;

  const prosrochennye = db.prepare(
    `SELECT * FROM zadachi
     WHERE otvetstvennyj = ? AND povtorjaetsja IS NOT 1 AND srok IS NOT NULL AND srok < ?
       AND ${OTKRYTA} AND ${NE_UDALENA}`
  ).all(ja, den);

  const otmena = [];
  for (const z of prosrochennye) {
    db.prepare('UPDATE zadachi SET srok = ?, sprint = ?, god_sprinta=?, versija = COALESCE(versija,0) + 1 WHERE id = ?')
      .run(konec, sprint, week.god, z.id);
    v_zhurnal(db, 'zadachi', z.id, 'srok', z.srok, konec, ja);
    v_zhurnal(db, 'zadachi', z.id, 'sprint', z.sprint, sprint, ja);
    v_zhurnal(db, 'zadachi', z.id, 'god_sprinta', z.god_sprinta, week.god, ja);
    otmena.push({ id: z.id, nomer: z.nomer, srok: z.srok, sprint: z.sprint,
      god_sprinta: z.god_sprinta, versija: (z.versija || 0) + 1 });
  }

  return {
    telo: {
      prodleno: otmena.length,
      novyj_srok: konec,
      sprint,
      god_sprinta: week.god,
                                                 
      otmena,
    },
  };
}

                                                 
function otmena({ telo, avtor, metod }) {
  if (metod !== 'POST') throw Object.assign(new Error('сюда только POST'), { kod: 405 });
  const db = baza();
  const { v_zhurnal } = require('./obschij.js');
  const spisok = Array.isArray(telo.otmena) ? telo.otmena : null;
  if (!spisok || !spisok.length) {
    throw new OshibkaVvoda('otmena: список того, что возвращать', 'otmena');
  }
  let vernuto = 0;
  for (const z of spisok) {
    const est = db.prepare('SELECT * FROM zadachi WHERE id = ?').get(z.id);
    if (!est) throw new NeNajdeno('задачи для отмены нет');
    if (Number(est.otvetstvennyj) !== Number(avtor)) throw Object.assign(new Error('отменить продление можно только своей задачи'), { kod: 403 });
    if (!Number.isInteger(z.versija)) throw new OshibkaVvoda('для отмены нужна версия из ответа продления','versija');
    if (est.versija !== z.versija) throw Object.assign(new Error('задачу изменили после продления, обнови список'), { kod: 409 });
    if (z.srok) require('./kalendar.js').data(z.srok,'srok');
    if (z.sprint != null) require('./kalendar.js').granicy_nedeli(z.god_sprinta,z.sprint);
    db.prepare('UPDATE zadachi SET srok = ?, sprint = ?, god_sprinta=?, versija = COALESCE(versija,0) + 1 WHERE id = ?')
      .run(z.srok ?? null, z.sprint ?? null, z.god_sprinta ?? null, z.id);
    v_zhurnal(db, 'zadachi', z.id, 'srok', est.srok, z.srok ?? null, avtor);
    v_zhurnal(db, 'zadachi', z.id, 'sprint', est.sprint, z.sprint ?? null, avtor);
    v_zhurnal(db, 'zadachi', z.id, 'god_sprinta', est.god_sprinta, z.god_sprinta ?? null, avtor);
    vernuto += 1;
  }
  return { telo: { vernuto } };
}

                                                                    
                                      
  
                                                                     
                                                               
  
                                                                    
                           
                                              
                                                 
                                              
                                                              
                                                                    
                            

                                                                   
                               
function razobrat_period(stroka) {
  if (!stroka || stroka === 'sejchas') {
    const d = new Date();
    return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  }
  const t = String(stroka).trim().toUpperCase().replace(/[^0-9Q-]/g, '');
  const m = t.match(/^(\d{4})-?Q([1-4])$/);
  if (m) return `${m[1]}-Q${m[2]}`;
  if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(stroka)) return String(stroka);         
  if (/^\d{4}$/.test(stroka)) return String(stroka);                                      
  throw new OshibkaVvoda('period: 2026-Q4, 2026-11, 2026 или sejchas', 'period');
}

                                                            
                                                            
function granicy_perioda(id) {
  const kvartal = id.match(/^(\d{4})-Q([1-4])$/);
  if (kvartal) {
    const god = Number(kvartal[1]), k = Number(kvartal[2]);
    const m = (k - 1) * 3;
    return { nachalo: new Date(Date.UTC(god, m, 1)).toISOString().slice(0, 10),
             konec: new Date(Date.UTC(god, m + 3, 0)).toISOString().slice(0, 10),
             tip: 'kvartal' };
  }
  const mesjac = id.match(/^(\d{4})-(\d{2})$/);
  if (mesjac) {
    const god = Number(mesjac[1]), m = Number(mesjac[2]) - 1;
    return { nachalo: new Date(Date.UTC(god, m, 1)).toISOString().slice(0, 10),
             konec: new Date(Date.UTC(god, m + 1, 0)).toISOString().slice(0, 10),
             tip: 'mesjac' };
  }
  const god = Number(id);
  return { nachalo: `${god}-01-01`, konec: `${god}-12-31`, tip: 'god' };
}

                                                                    
  
                                                              
                                                      
  
                                                                    
                                                              
                                                               
                                                                 
  
                                                                     
                                                                    
                                         
                                                                 
                                                                     
                                                                      
                                                               
function ramki(db, period_id) {
  if (!period_id) return null;
  try {
    const p = db.prepare('SELECT nachalo, konec FROM periody WHERE id = ?')
      .get(String(period_id));
    return p && p.nachalo && p.konec ? p : null;
  } catch { return null; }
}

                                                                
                                                      
function v_ramkah(pole, r) {
  return r ? ` AND ${pole} IS NOT NULL AND date(${pole}) BETWEEN '${r.nachalo}' AND '${r.konec}'` : '';
}

const { POKAZATELI } = require('./pokazateli.js');

                                                                        
                                                                       
                        
  
                                                                  
function voronka_rassylok(db) {
  const shtuk = (uslovie) => {
    try {
      return db.prepare(
        `SELECT count(*) n FROM rassylka_ljudi${uslovie ? ' WHERE ' + uslovie : ''}`).get().n;
    } catch { return 0; }
  };
  const v_baze = shtuk('');
  const otpravleno = shtuk("status <> 'ne_otpravleno'");
  const otvetili = shtuk("status = 'otvetil'");
  const otkazy = shtuk("status = 'otkaz'");
  let klientov = 0;
  try {
    klientov = db.prepare(
      "SELECT count(DISTINCT chelovek_id) n FROM sotrudnichestva WHERE rol = 'klient'").get().n;
  } catch { klientov = 0; }

                                                                     
                                            
  const dolja = (chislo, ot) => (ot ? Math.round((chislo / ot) * 100) : 0);
  return {
    stupeni: [
      { kod: 'v_baze',     imja: 'в базе',      chislo: v_baze,     dolja: 100 },
      { kod: 'otpravleno', imja: 'отправлено',  chislo: otpravleno, dolja: dolja(otpravleno, v_baze) },
      { kod: 'otvetili',   imja: 'ответили',    chislo: otvetili,   dolja: dolja(otvetili, otpravleno) },
      { kod: 'klienty',    imja: 'стали клиентами', chislo: klientov, dolja: dolja(klientov, otvetili) },
    ],
    otkazy,
                                                                       
    uzkoe_mesto: (() => {
      const st = [
        { imja: 'отправка',  dolja: dolja(otpravleno, v_baze) },
        { imja: 'ответы',    dolja: dolja(otvetili, otpravleno) },
        { imja: 'в клиенты', dolja: dolja(klientov, otvetili) },
      ].filter((x) => Number.isFinite(x.dolja));
      if (!st.length) return null;
      return st.reduce((a, b) => (b.dolja < a.dolja ? b : a));
    })(),
  };
}

                                                                
function fakt_rezultata(db,r,den){
  return require('./srez-okr.js').fakt(db,r,den).fakt;
}

                                                                 
                                                             
                                                        
function procent_celi(rezultaty) {
  return require('./progress-okr.js').goal(rezultaty);
}

                                                                     
                                                         
function ozhidaemyj_procent(granicy, den) {
  const n = Date.parse(granicy.nachalo), k = Date.parse(granicy.konec);
  const s = Date.parse(den);
  if (s <= n) return 0;
  if (s >= k) return 100;
  return Math.round(((s - n) / (k - n)) * 100);
}

function okr({ zapros, metod, avtor, origin }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const single=Object.hasOwn(zapros,'nomer'),requested=single?zapros.nomer:zapros.cel;
  const target=requested===undefined?null:Number(requested);
  if(requested!==undefined&&(!/^[1-9]\d*$/.test(String(requested))||!Number.isSafeInteger(target)))throw new OshibkaVvoda('Нужен номер цели',single?'nomer':'cel');
  if(single&&zapros.cel!==undefined&&Number(zapros.cel)!==target)throw new OshibkaVvoda('В адресе должны совпадать номера цели','cel');
  if(Object.hasOwn(zapros,'okno')&&!target)throw new OshibkaVvoda('Выбери цель для временного среза','cel');
  const vidimost = require('./pravila-otveta.js').vidimost('celi', avtor, 'c.');
  const selected=target?db.prepare('SELECT c.* FROM celi c WHERE c.id=? AND '+vidimost.sql).get(target,...vidimost.args):null;
  if(target&&!selected)throw new NeNajdeno('Цель не найдена');
  const period_id = razobrat_period(selected&&(single||zapros.period===undefined)?selected.period_id:zapros.period);
  const granicy = granicy_perioda(period_id);
  const den = zapros.den || segodnja();
  require('./kalendar.js').data(den,'den');

  const period = db.prepare('SELECT * FROM periody WHERE id = ?').get(period_id);
  const zakryt = period ? !!period.zakryt : false;

  const uslovija = [target?'(c.sostojanie IS NULL OR c.sostojanie <> ? OR c.id=?)':'(c.sostojanie IS NULL OR c.sostojanie <> ?)'];
  const znachenija = target?['arhiv',target]:['arhiv'];
  uslovija.push(vidimost.sql); znachenija.push(...vidimost.args);
  if(single||target&&Object.hasOwn(zapros,'okno')){uslovija.push('c.id=?');znachenija.push(target);}
                                                                          
  uslovija.push('c.period_id = ?'); znachenija.push(period_id);
  if (zapros.napravlenie) { uslovija.push('c.napravlenie = ?'); znachenija.push(zapros.napravlenie); }

  const celi = db.prepare(
    `SELECT c.* FROM celi c WHERE ${uslovija.join(' AND ')}
     ORDER BY c.napravlenie, c.id`).all(...znachenija);

  const ozhidaem = ozhidaemyj_procent(granicy, den);

                                                                  
                                                                           
  const sprint_dlja_dvizhenija = nomer_nedeli(den);
  const nedelja_dlja_dvizhenija = granicy_nedeli(
    iso_nedelja(den).god, sprint_dlja_dvizhenija);

  const sobrannye = celi.map((c) => {
    const syrye = db.prepare(
      'SELECT * FROM rezultaty WHERE cel_id = ? ORDER BY id').all(c.id);
    const rezultaty = syrye.map((r) => {
      const snapshot=require('./srez-okr.js').fakt(db,r,den),fakt=snapshot.fakt;
      const zamery = db.prepare(
        `SELECT z.*,l.imja kto_imja FROM zamery z LEFT JOIN ljudi l ON l.id=z.kto WHERE z.rezultat_id = ? AND z.data<=?
         ORDER BY z.data DESC,z.id DESC LIMIT 12`).all(r.id,snapshot.na_datu).map(v_api);
                                                                   
      const poslednij = zamery[0];
      const dnej = poslednij
        ? Math.floor((Date.parse(snapshot.na_datu) - Date.parse(String(poslednij.data).slice(0, 10))) / 86400000)
        : null;
      return {
        ...v_api(r),
        fakt,
        na_datu:snapshot.na_datu,
        obnovleno:snapshot.obnovleno,
        polnota_publikacij:snapshot.polnota_publikacij,
        pochemu_net_fakta:snapshot.pochemu,
        istochnik_fakta:snapshot.istochnik_fakta,
        polnota_dannyh: r.istochnik==='formula'
          ? require('./pervaja-rol.js').polnota_formuly(db,r.formula,c.napravlenie) : null,
                                                                  
                                                                   
                                                                    
        tekuschee_znachenie: fakt,
        znachenie_plana: r.plan ?? null,
                                                                  
                                                                   
        schitaetsja_sam: r.istochnik === 'formula' && !!POKAZATELI[r.formula],
        progress_pct: require('./progress-okr.js').result(r,fakt),
        baza_ne_zadana:r.tip!=='veha'&&r.baza==null,
        zamery,
        zamerov:db.prepare('SELECT count(*) n FROM zamery WHERE rezultat_id=? AND data<=?').get(r.id,snapshot.na_datu).n,
        dnej_bez_zamera: dnej,
        ustarel: (r.istochnik??'ruchnoj_zamer')==='ruchnoj_zamer'&&dnej !== null && dnej > 14,
                                                                  
                                                               
                                   
        dvizhenie_nedeli: require('./srez-okr.js').nedelja(db,r,snapshot,nedelja_dlja_dvizhenija.nachalo),
                                                                   
                                                                  
        zadach: (() => {
          try {
            return db.prepare(
              `SELECT count(*) n FROM zadachi
                WHERE rezultat_id = ? AND ${NE_UDALENA}`).get(r.id).n;
          } catch { return 0; }
        })(),
        otkrytyh_zadach: (() => {
          try {
            return db.prepare(
              `SELECT count(*) n FROM zadachi
                WHERE rezultat_id = ? AND ${OTKRYTA} AND ${NE_UDALENA}`).get(r.id).n;
          } catch { return 0; }
        })(),
      };
    });

    for(const r of rezultaty)r.dvizhenie_sprinta=require('./progress-okr.js').week(r);
    const procent = procent_celi(rezultaty);
    const razryv = procent==null?null:procent - ozhidaem;
                                                          
    const status_celi = razryv==null?'net_dannyh':razryv >= -5 ? 'po_grafiku'
      : razryv >= -20 ? 'otstaem' : 'pod_ugrozoj';
    return {
      ...v_api(c),
                                                              
                                                              
      nomer: c.id,
      objective: c.nazvanie,
      url: `/okr/${c.id}`,
      strategija: require('./strategija-celi.js').sourceLink(db,c),
      prava_celi: require('./celi-model.js').permissions(db,c,avtor),
      ...(Object.hasOwn(zapros,'okno')?{srez_perioda:require('./okno-celej.js').srez(db,c,zapros.okno,den)}:{}),
      rezultaty,
      nepolnaja:rezultaty.length<2,
      podskazka:rezultaty.length>5?'Рекомендуется от двух до пяти результатов: проверь фокус цели.':null,
      dvizhenie_sprinta:require('./progress-okr.js').goalWeek(rezultaty),
      procent,
      ozhidaemyj_procent: ozhidaem,
      razryv,
      status_celi,
      otkrytyh_zadach: db.prepare(
        `SELECT count(*) n FROM zadachi WHERE ${require('./okr-svjazi.js').goalKey()} = ? AND ${OTKRYTA} AND ${NE_UDALENA}`
      ).get(c.id).n,
      zakrytyh_za_mesjac: db.prepare(
        `SELECT count(*) n FROM zadachi
         WHERE ${require('./okr-svjazi.js').goalKey()} = ? AND status = 'sdelano' AND ${NE_UDALENA}
           AND julianday(?) - julianday(sozdano) <= 31`).get(c.id, den).n,
    };
  });

  if(single){const goal=sobrannye.find(c=>c.id===target);if(!goal)throw new NeNajdeno('Цель не найдена в выбранном направлении');return {telo:{...goal,period:period_id,den,zakryt,url:origin?origin+goal.url:goal.url}};}
                                                                 
                                                              
                                             
  const sprint = nomer_nedeli(den);
  const nedelja_granicy = granicy_nedeli(iso_nedelja(den).god, sprint);

  return {
    telo: {
      period: period_id,
      den,
      na_datu:[den,segodnja(),granicy.konec].sort()[0],
      istoricheskij: [den,granicy.konec].sort()[0]<segodnja(),
      nachalo: granicy.nachalo,
      konec: granicy.konec,
      tip: granicy.tip,
      zakryt,
      ozhidaemyj_procent: ozhidaem,
      sprint,
      nachalo_sprinta: nedelja_granicy.nachalo,
      konec_sprinta: nedelja_granicy.konec,
      celi: sobrannye,
      mozhet_videt_dengi: require('./obschij.js').vidit_dengi(avtor),
                                                                     
                                                        
      voronka: voronka_rassylok(db),
                                                                  
                                                               
                                                      
      rezultaty: sobrannye.flatMap((c) => c.rezultaty.map((r) => ({
        ...r, cel_id: c.id, cel: c.nazvanie, napravlenie: c.napravlenie,
      }))),
                                                              
                                                
      ustarevshie_zamery: sobrannye.flatMap((c) =>
        c.rezultaty.filter((r) => r.ustarel)
                                                                 
                                                                   
          .map((r) => ({ cel_id: c.id, cel: c.nazvanie, rezultat_id: r.id,
                         nazvanie: r.nazvanie, dnej: r.dnej_bez_zamera,
                         nikogda_ne_zamerjali: r.dnej_bez_zamera == null }))),
    },
  };
}


                                                                    
                                           
  
                                                                 
                                                                  
                                                              
  
                                                                      
                                                                     
                                                                      
                                               

                                                                       
                                                                         
function razobrat_nedelju(zapros, den) {
  const week = nedelja_iz_zaprosa(zapros, den);
  return { god: week.god, nedelja: week.nomer };
}

                                                         
function vidit_dengi(db, avtor) {
  return require('./dengi-dostup.js').vidit(db,avtor);
}

function planerka({ zapros, avtor, metod, polnyj_snimok = false }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();

                                        
  if (zapros.chelovek !== undefined || zapros.chelovek_id !== undefined) {
    throw new OshibkaVvoda(
      'планёрка только про направление, личный срез в Моём пространстве', 'chelovek');
  }

  const napravlenie = zapros.napravlenie || zapros.napr;
  if (!napravlenie) {
    throw new OshibkaVvoda('napravlenie обязателен: планёрка всегда про направление',
      'napravlenie');
  }
  const napr = db.prepare('SELECT * FROM napravlenija WHERE kod = ?').get(napravlenie);
  if (!napr) throw new NeNajdeno(`направления ${napravlenie} нет`);

  const analyticToday=require('./parametry-analitiki.js').today(db);
  const den = zapros.den || analyticToday;
  require('./kalendar.js').data(den,'den');
  const { god, nedelja } = razobrat_nedelju(zapros, den);
  const week={god,nomer:nedelja};
  const okno = granicy_nedeli(god, nedelja);

                                                                            
                                                                           
  const weeklySnapshot=require('./snimok-planerki.js');
  if(!polnyj_snimok&&!Object.hasOwn(zapros,'den')&&okno.konec<analyticToday){
    const saved=weeklySnapshot.read(db,{napravlenie,god,nomer:nedelja});
    if(saved)return {telo:weeklySnapshot.report(saved,week,analyticToday,weeklySnapshot.permissions(db,{napravlenie,...okno},avtor))};
  }

  const NE_UD = NE_UDALENA.replace(/udaleno/g, 'z.udaleno');
  const OTKR = OTKRYTA.replace('status', 'z.status');

                                                                         
                                                                  
  const svoi = `z.napravlenie = '${napravlenie}' AND ${NE_UD}`;
                                                                         
                                                                      
    
                                                                
                                                                    
                                                                  
                                                                
                                                            
                              
  const v_okne = `${svoi} AND ${require('./kampanii.js').weeklyPredicate('z',week)}`
    + " AND z.status <> 'kogda_nibud'";

  const zadachi_po = (uslovie) => db.prepare(
    `SELECT z.*, l.imja otvetstvennyj_imja, k.imja klient_imja,
            p.nazvanie proekt_nazvanie
     FROM zadachi z
     LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
     LEFT JOIN ljudi k ON k.id = z.klient_id
     LEFT JOIN proekty p ON p.id = z.proekt_id
     WHERE ${uslovie}
     ORDER BY CASE z.status WHEN 'sdelano' THEN 0 WHEN 'v_processe' THEN 1 ELSE 2 END,
              z.srok, z.nomer`
  ).all();

                                                                            
                                                                     
                                                         
  const visit_dolgo = (z) => {
    if (z.status === 'sdelano') return null;
    const sozdano = String(z.sozdano || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sozdano)) return null;
    const dnej = Math.floor((Date.parse(den) - Date.parse(sozdano)) / 86400000);
    if (dnej < 21) return null;
    const zakrytyh = db.prepare(
      `SELECT count(*) k FROM zadachi
       WHERE roditel_id = ? AND status = 'sdelano' AND ${NE_UDALENA}`).get(z.id).k;
    if (zakrytyh > 0) return null;                                                 
    return Math.floor(dnej / 7);
  };

  const stroka_zadachi = (z) => {
    const nedel = visit_dolgo(z);
    const punkt = {
      ...v_api(z),
      ...(z.rassylka_id?require('./volny-rassylok.js').taskStats(db,z,week):{}),
      prosrocheno: Boolean(z.srok && z.srok < den && z.status !== 'sdelano'),
      adres: `/${z.napravlenie}/${z.nomer}`,
    };
    if (nedel !== null) punkt.visit_dolgo = nedel;
    return punkt;
  };

                           
                                                                    
                                                               
                                                                 
                                                                 
                                                  
    
                                                                
                                                                 
                                                                 
                                                                    
                                                                   
  const po_tipam = (...tipy) => zadachi_po(
    `${v_okne} AND z.tip IN (${tipy.map((t) => `'${t}'`).join(', ')})`)
    .map(stroka_zadachi);
  const po_tipu = (tip) => po_tipam(tip);

                                                                   
                                                                   
                                                               
                                                               
  const klienty = po_tipam('klientskaja', 'kasanie');
  const produkt = po_tipu('produktovaja');
  const prochee = po_tipu('vnutrennjaja');
  const kontent_bloka = zadachi_po(`${v_okne} AND z.publikacija = 1`).map(stroka_zadachi);
  const na_soglasovanii = zadachi_po(`${svoi} AND z.status = 'na_soglasovanii'`)
    .map(stroka_zadachi);

                                                             
  const biznes = {
    zadachi: po_tipu('biznesovaja'),
    proekty: db.prepare(
      `SELECT p.*, l.imja klient_imja FROM proekty p
       LEFT JOIN ljudi l ON l.id = p.klient_id
       WHERE p.napravlenie = ? AND (p.arhiv IS NULL OR p.arhiv = 0)
       ORDER BY p.id`).all(napravlenie).map((p) => v_api(p)),
  };

                                                                        
                                                                        
                                                 
  const rassylki = db.prepare(
    `SELECT r.* FROM rassylki r WHERE r.napravlenie = ? ORDER BY r.id`
  ).all(napravlenie).map((r) => {
    const z = db.prepare(
      `SELECT z.id, z.nomer, z.nazvanie, z.status, z.otvetstvennyj,
              l.imja otvetstvennyj_imja
       FROM zadachi z LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
       WHERE z.rassylka_id = ? AND ${NE_UD}
       ORDER BY z.id LIMIT 1`).get(r.id);
    const mailingFacts=require('./volny-rassylok.js').campaignStats(db,r.id,okno);
    const campaignTasks=db.prepare(`SELECT z.* FROM zadachi z WHERE z.rassylka_id=? AND ${NE_UD} AND ${require('./kampanii.js').weeklyPredicate('z',week)} AND z.status<>'kogda_nibud' ORDER BY z.id`).all(r.id).map(task=>({...stroka_zadachi(task),...require('./volny-rassylok.js').taskStats(db,task,week)}));
    return {
      ...require('./kampanii.js').presentation(db,r),
      zadachi_kampanii:campaignTasks,
      pokazat_v_nedele:campaignTasks.length>0||mailingFacts.soobschenij_za_nedelju>0||(r.status==='idet'&&week.god===iso_nedelja(segodnja()).god&&week.nomer===iso_nedelja(segodnja()).nomer),
      zadacha: z ? { nomer: z.nomer, nazvanie: z.nazvanie, stadija: z.status,
                     otvetstvennyj: z.otvetstvennyj,
                     otvetstvennyj_imja: z.otvetstvennyj_imja } : null,
      vsego_otpravleno:mailingFacts.soobschenij_vsego,
      za_nedelju_otpravleno:mailingFacts.soobschenij_za_nedelju,
      otvetili:mailingFacts.otvetov_vsego,

                                                               
                                                                  
                                                       
      voronka: (() => {
        const source=require('./kampanii.js').sourceStats(db,r,okno);
        return {
          v_baze:source.razmer_bazy,
          otpravleno:source.otpravleno,
          otvetili:source.otvetili,
          otkazy:source.otkazy,
          ostalos:source.ostalos,
          otklik_procent:source.otklik_procent,
          za_nedelju:source.za_nedelju,
                                                                 
                                                                 
          stupeni: (() => {
            if (!r.baza_id) return null;
            try {
              const vsego_v_baze = db.prepare(
                'SELECT count(*) n FROM bazy_ljudi bl WHERE baza_id = ? AND '+require('./sostojanie-strok-bazy.js').active('bl'))
                .get(r.baza_id).n;
              const syrye = db.prepare(
                `SELECT s.id, s.nazvanie, s.rol, s.porjadok,
                        (SELECT count(*) FROM bazy_ljudi bl
                          WHERE bl.baza_id = s.baza_id AND bl.status_id = s.id AND ${require('./sostojanie-strok-bazy.js').active('bl')}) AS skolko
                   FROM bazy_statusy s
                  WHERE s.baza_id = ? AND s.rol IS NOT NULL AND s.rol <> 'otkaz'
                  ORDER BY s.porjadok, s.id`).all(r.baza_id);
              let nakoplenno = 0;
              const itog = [];
              for (let i = syrye.length - 1; i >= 0; i--) {
                nakoplenno += syrye[i].skolko;
                itog.unshift({ nazvanie: syrye[i].nazvanie, doshlo: nakoplenno });
              }
              return itog.map((s, i) => ({
                ...s,
                procent_ot_bazy: vsego_v_baze
                  ? Math.round((s.doshlo * 100) / vsego_v_baze) : 0,
                procent_ot_predyduschej: i === 0 || !itog[i - 1].doshlo
                  ? null : Math.round((s.doshlo * 100) / itog[i - 1].doshlo),
              }));
            } catch { return null; }
          })(),
        };
      })(),
    };
  }).filter(r=>r.pokazat_v_nedele);
  biznes.rassylki = rassylki;

                                                                             
                                                                               
  const views=require('./razrezy-celej.js'),period_id=views.kvartal(okno.konec),weekView={...okno,god,nomer:nedelja},celi_bez_perioda=[];
  const celi=db.prepare("SELECT * FROM celi WHERE napravlenie=? AND sostojanie='aktivna' ORDER BY id").all(napravlenie).filter(goal=>{
    try{return !!views.peresechenie(goal,okno);}catch(error){if(error.kod!==400)throw error;celi_bez_perioda.push({id:goal.id,nazvanie:goal.nazvanie,period_id:goal.period_id,sostojanie:goal.sostojanie,pochemu:'Период цели не подтверждён. Недельный срез не сформирован'});return false;}
  });
  const celi_s_procentom=celi.map(c=>{
    const rezultaty=db.prepare('SELECT * FROM rezultaty WHERE cel_id=? ORDER BY id').all(c.id).map(row=>{
      const snapshot=require('./srez-okr.js').fakt(db,row,[den,okno.konec].sort()[0]);
      return {...row,fakt:snapshot.fakt,na_datu:snapshot.na_datu,obnovleno:snapshot.obnovleno,istochnik_fakta:snapshot.istochnik_fakta,polnota_publikacij:snapshot.polnota_publikacij,pochemu_net_fakta:snapshot.pochemu,razrezy:views.rezultat(db,c,row,weekView,[den,okno.konec].sort()[0])};
    });
    return {id:c.id,nazvanie:c.nazvanie,period_id:c.period_id,sostojanie:c.sostojanie,napravlenie:c.napravlenie,period_zakryt:!!db.prepare('SELECT zakryt FROM periody WHERE id=?').get(String(c.period_id))?.zakryt,procent:procent_celi(rezultaty),rezultatov:rezultaty.length,rezultaty:rezultaty.map(v_api)};
  });

  const repeatRules = require('./povtory.js');
  const repeatDay = repeatRules.den_konteksta(zapros) || den;
  repeatRules.proverit_datu(repeatDay);
  const repeatState = repeatRules.status_sql('z', `'${repeatDay}'`);
                                                                    
                                                           
  const chislo = (uslovie) => db.prepare(
    `SELECT count(*) k FROM zadachi z WHERE ${uslovie}`).get().k;

  const svodka = {
    nedelja,
    god,
    nachalo: okno.nachalo,
    konec: okno.konec,
    period: period_id,
    vsego_zadach: chislo(v_okne),
    zakryto: chislo(`${v_okne} AND ${repeatState} = 'sdelano'`),
    otkryto: chislo(`${v_okne} AND ${repeatState} NOT IN ('sdelano','kogda_nibud')`),
    prosrocheno: chislo(`${v_okne} AND (${repeatState} = 'prosrochena'
      OR (z.povtorjaetsja IS NOT 1 AND ${OTKR} AND z.srok IS NOT NULL AND z.srok < '${den}'))`),
    publikacij: chislo(`${v_okne} AND z.publikacija = 1`),
    celi: celi_s_procentom,
    celi_bez_perioda,
    kalendarnye_periody:[...new Set([views.kvartal(okno.nachalo),views.kvartal(okno.konec)])],
    procent_celej: celi_s_procentom.some(c=>c.procent==null)?null:celi_s_procentom.length
      ? Math.round(celi_s_procentom.reduce((a, c) => a + c.procent, 0) / celi_s_procentom.length)
      : 0,
  };

                                                                     
  const obratnaja_svjaz = db.prepare(
    `SELECT l.*, c.imja avtor_imja FROM lenta l
     LEFT JOIN ljudi c ON c.id = l.chelovek_id
     WHERE (l.napravlenie = ? OR l.napravlenie IS NULL)
       AND ((l.sprint = ? AND l.god_sprinta = ?) OR (l.sprint IS NULL AND date(l.sozdano,'+3 hours') BETWEEN ? AND ?))
     ORDER BY l.sozdano DESC, l.id DESC`
  ).all(napravlenie, nedelja, god, okno.nachalo, okno.konec).map((l) => v_api(l));

                                                                           

                                                                      
                                                                         
                                                                      
  const sotr_vse = db.prepare(
    `SELECT s.*, l.imja, l.foto, l.inicialy FROM sotrudnichestva s
     JOIN ljudi l ON l.id = s.chelovek_id
     WHERE s.napravlenie = ? AND (s.stadija IS NULL OR s.stadija <> 'pauza')
     ORDER BY l.imja`).all(napravlenie);

  const archivePeriods=require('./arhiv.js').period(db,sotr_vse,okno);
  const aktivnye = [];
  const arhiv_za_period = [];
  const arhiv_do = [];
  const isklucheno_arhivnyh = [];
  for (const s of sotr_vse) {
    const archive=archivePeriods.get(s.id);
    const arhiv_s=archive?.arhiv_s||null;
    if (archive?.active) {
      aktivnye.push({ ...v_api(s), uchten_aktivnym: true });
      continue;
    }
    isklucheno_arhivnyh.push(s.id);
    const zapis = { ...v_api(s), uchten_aktivnym: false, arhiv_s };
                                                                         
    if (arhiv_s && arhiv_s >= okno.nachalo && arhiv_s <= okno.konec) arhiv_za_period.push(zapis);
    else arhiv_do.push(zapis);
  }

                                                                        
                                                                      
                                                               
  const schetchiki = {
    klientov_v_rabote: new Set(aktivnye.filter((s) => s.rol === 'klient').map(s=>s.chelovek_id)).size,
    lidov: new Set(aktivnye.filter((s) => s.rol === 'lid').map(s=>s.chelovek_id)).size,
    zadach_vsego: svodka.vsego_zadach,
    zakryto: svodka.zakryto,
    otkryto: svodka.otkryto,
    prosrocheno: svodka.prosrocheno,
    na_soglasovanii: na_soglasovanii.length,
                                                                             
    bez_ispolnitelja: db.prepare(
      `SELECT count(*) k FROM zadachi z JOIN ljudi l ON l.id = z.otvetstvennyj
       WHERE z.napravlenie = ? AND l.aktiven = 0 AND ${OTKR} AND ${NE_UD}`
    ).get(napravlenie).k,
    proektov: biznes.proekty.length,
  };

  const lidy = require('./pervaja-rol.js').lidy_perioda(db,okno,napravlenie);

                                                                   
                                                                        
                                                             
  const nastrojki = require('./parametry-analitiki.js').values(db);
  const porog_sistemy = nastrojki.dnej_bez_obschenija_porog;
  const porog = napr.norma_dnej || porog_sistemy;

  const dnej_ot = (data) => {
    if (!data) return null;
    return Math.floor((Date.parse(den) - Date.parse(String(data).slice(0, 10))) / 86400000);
  };

                                                                          
                                                                     
                                                             
  const davno_ne_obschalis = aktivnye
    .filter((s) => s.rol !== 'referal')
    .map((s) => {
      const facts=require('./obschenie.js').najti(db,s.chelovek_id,require('./vremja-obschenija.js').razobrat(den).moment);
      return {
      sotrudnichestvo_id: s.id,
      chelovek_id: s.chelovek_id,
      imja: s.imja,
      rol: s.rol,
      stadija: s.stadija,
      norma: porog,
      dnej_bez_obschenija: facts.dnej_bez_svjazi,
      nikogda_ne_obschalis: !facts.poslednee_obshenie&&!facts.neizvestnaja_data_obschenija,
      poslednee_obshenie: facts.poslednee_obshenie_obshee,
      neizvestnaja_data_obschenija:facts.neizvestnaja_data_obschenija,
      buduschaja_data_obschenija:facts.buduschaja_data_obschenija,
    };})
    .filter((s) => s.nikogda_ne_obschalis || s.neizvestnaja_data_obschenija || s.buduschaja_data_obschenija || s.dnej_bez_obschenija > s.norma)
    .sort((a, b) => {
      if (a.nikogda_ne_obschalis !== b.nikogda_ne_obschalis) {
        return a.nikogda_ne_obschalis ? -1 : 1;
      }
      return (b.dnej_bez_obschenija || 0) - (a.dnej_bez_obschenija || 0);
    });

  const bez_zadach = aktivnye
    .filter((s) => s.rol === 'klient')
    .map((s) => ({
      sotrudnichestvo_id: s.id,
      chelovek_id: s.chelovek_id,
      imja: s.imja,
      napravlenie,
      otkrytyh_na_sprint: db.prepare(
        `SELECT count(*) k FROM zadachi z
         WHERE z.klient_id = ? AND z.napravlenie = ? AND z.sprint = ? AND z.god_sprinta = ?
           AND ${OTKR} AND ${NE_UD}`).get(s.chelovek_id, napravlenie, nedelja, god).k,
      poslednjaja_zadacha: s.poslednjaja_zadacha || null,
      zadach_ne_bylo: !s.poslednjaja_zadacha,
    }))
    .filter((s) => s.otkrytyh_na_sprint === 0);

                                                                       
                                             
  const vnimanie = napr.arhiv === 1
    ? zadachi_po(`${svoi} AND ${OTKR}`).map(stroka_zadachi)
    : [];

                                                                    
                                                                        
                       
  const ustarevshie_zamery = [];
  for (const c of celi) {
    for (const r of db.prepare('SELECT * FROM rezultaty WHERE cel_id = ? ORDER BY id').all(c.id)) {
      if(r.tip==='veha'||(r.istochnik??'ruchnoj_zamer')!=='ruchnoj_zamer')continue;
      const poslednij = db.prepare(
        'SELECT data FROM zamery WHERE rezultat_id = ? ORDER BY data DESC, id DESC LIMIT 1'
      ).get(r.id);
      const dnej = poslednij ? dnej_ot(poslednij.data) : null;
      if (dnej !== null && dnej <= 14) continue;
      ustarevshie_zamery.push({ cel_id: c.id, cel: c.nazvanie, rezultat_id: r.id,
                                nazvanie: r.nazvanie, dnej,
                                nikogda_ne_zamerjali: dnej === null });
    }
  }

                                                                      
                                                                          
                                                           
  const dostupny_dengi = polnyj_snimok || vidit_dengi(db, avtor);
  const dengi = dostupny_dengi
    ? {
        skryto: false,
        prishlo_za_nedelju: db.prepare(
          `SELECT COALESCE(sum(pl.summa), 0) s FROM platezhi pl
           JOIN proekty p ON p.id = pl.proekt_id
           WHERE p.napravlenie = ? AND pl.oplachen_at IS NOT NULL
             AND date(pl.oplachen_at) >= ? AND date(pl.oplachen_at) <= ?`
        ).get(napravlenie, okno.nachalo, okno.konec).s,
        vystavleno_ne_oplacheno: db.prepare(
          `SELECT COALESCE(sum(pl.summa), 0) s FROM platezhi pl
           JOIN proekty p ON p.id = pl.proekt_id
           WHERE p.napravlenie = ? AND pl.vystavlen_at IS NOT NULL
             AND pl.oplachen_at IS NULL`).get(napravlenie).s,
        v_proektah: biznes.proekty.reduce((a, p) => a + (p.stoimost || 0), 0),
      }
    : { znachenie: null, skryto: true };

  return {
    telo: {
      napravlenie,
      napravlenie_nazvanie: napr.nazvanie,
      nedelja,
      god,
      sprint: nedelja,
      den,
      nachalo: okno.nachalo,
      konec: okno.konec,
      porog_dnej_bez_obschenija: porog,
      istochnik_otcheta:{...weeklySnapshot.metadata(week,analyticToday,null,Object.hasOwn(zapros,'den')),...weeklySnapshot.permissions(db,{napravlenie,...okno},avtor)},
      dopolnenija:weeklySnapshot.extras(db,{napravlenie,week:{...week,...okno},day:[den,segodnja()].sort()[0],actor:avtor,uchityvat_otlozhennye:!polnyj_snimok&&weeklySnapshot.metadata(week,analyticToday,null,Object.hasOwn(zapros,'den')).vid==='tekuschaja'}),
      chasovoj_pojas: (nastrojki && nastrojki.chasovoj_pojas) || 'Europe/Moscow',
                                                                       
                                                                   
                                                                     
      po_napravlenijam: Object.fromEntries(db.prepare(
        `SELECT napravlenie, count(*) n FROM zadachi
         WHERE sprint = ? AND god_sprinta = ? AND ${NE_UDALENA} GROUP BY napravlenie`
      ).all(nedelja, god).map((r) => [r.napravlenie, r.n])),
                                           
      svodka,
      biznes,
      klienty,
      produkt,
      kontent: kontent_bloka,
      prochee,
      obratnaja_svjaz,
      na_soglasovanii,
                                                          
      schetchiki,
      isklucheno_arhivnyh,
      aktivnye,
      arhiv_za_period,
      arhiv_do,
      lidy,
      rassylki,
      vnimanie,
      davno_ne_obschalis,
      bez_zadach,
      ustarevshie_zamery,
      dengi,
    },
  };
}

                                                                    
                                                                  
  
                                                                      
                                                                   
                                                                     

const SPRAVOCHNIKI_KODA = require('./opisanija.js').SPRAVOCHNIKI || {};

                                                                 
  
                                                                  
                                                                 
                                          
function spravochniki({ zapros, telo, metod, kljuch }) {
  const db = baza();

                                                             
                                                                  
                                                        
  if (metod === 'POST') {
    if (kljuch && kljuch !== 'statusy' && kljuch !== 'stadii') {
      throw Object.assign(
        new Error(`в /api/spravochniki/${kljuch} добавлять нечего`), { kod: 405 });
    }
    const nazvanie = ((telo || {}).nazvanie || (telo || {}).imja || '').trim();
    if (!nazvanie) throw new OshibkaVvoda('нужно nazvanie', 'nazvanie');
    const oblast = (telo || {}).oblast || ((telo || {}).napravlenie ? 'napravlenie' : 'vse');
                                                                    
    const napravlenie = oblast === 'vse' ? null : (telo || {}).napravlenie;
    if (oblast !== 'vse' && !napravlenie) {
      throw new OshibkaVvoda('для области napravlenie нужно napravlenie', 'napravlenie');
    }
    if (napravlenie
        && !db.prepare('SELECT 1 FROM napravlenija WHERE kod = ?').get(napravlenie)) {
      throw new NeNajdeno(`направления «${napravlenie}» нет`);
    }
                                                                 
                                                                  
    const BUKVY = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e',
      ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n',
      о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h',
      ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
      э: 'e', ю: 'ju', я: 'ja' };
    const kod = (telo || {}).kod
      || nazvanie.toLowerCase().split('')
        .map((b) => (BUKVY[b] !== undefined ? BUKVY[b] : b))
        .join('').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const rol = (telo || {}).rol || 'klient';
    const est = db.prepare(
      `SELECT id FROM spravochnik_stadij WHERE kod = ? AND rol = ?
        AND (napravlenie IS ? OR napravlenie = ?)`)
      .get(kod, rol, napravlenie, napravlenie);
    if (est) {
      throw Object.assign(
        new Error(`стадия «${nazvanie}» в этом наборе уже есть`),
        { kod: 409, telo: { id: est.id } });
    }
    const porjadok = (db.prepare(
      'SELECT max(porjadok) m FROM spravochnik_stadij WHERE rol = ?').get(rol).m || 0) + 1;
    const r = db.prepare(
      `INSERT INTO spravochnik_stadij (rol, napravlenie, kod, nazvanie, porjadok)
       VALUES (?, ?, ?, ?, ?)`).run(rol, napravlenie, kod, nazvanie, porjadok);
    return { kod: 201,
             telo: v_api(db.prepare('SELECT * FROM spravochnik_stadij WHERE id = ?')
               .get(r.lastInsertRowid)) };
  }

  if (metod !== 'GET') throw Object.assign(new Error('сюда GET или POST'), { kod: 405 });

                                                                 
                                                           
  const statusy = [
    { kod: 'v_plane',         imja: 'в плане',         cvet: '#4b7bc4', porjadok: 1 },
    { kod: 'v_processe',      imja: 'в процессе',      cvet: '#12a594', porjadok: 2 },
    { kod: 'na_soglasovanii', imja: 'на согласовании', cvet: '#b07d20', porjadok: 3 },
    { kod: 'sdelano',         imja: 'сделано',         cvet: '#1f8f4e', porjadok: 4 },
    { kod: 'kogda_nibud',     imja: 'когда-нибудь',    cvet: '#9a9aa3', porjadok: 5 },
  ];

  const tipy = [
    { kod: 'klientskaja',   imja: 'клиентская' },
    { kod: 'produktovaja',  imja: 'продуктовая' },
    { kod: 'biznesovaja',   imja: 'бизнесовая' },
    { kod: 'vnutrennjaja',  imja: 'внутренняя' },
    { kod: 'kasanie',       imja: 'касание' },
  ];

  const roli = [
    { kod: 'lid',     imja: 'лид' },
    { kod: 'klient',  imja: 'клиент' },
    { kod: 'referal', imja: 'реферал' },
  ];

                                                              
                                                                 
  const iz_tablicy = (imja, zapasnoj) => {
    try {
      const r = db.prepare(`SELECT * FROM ${imja} ORDER BY porjadok, id`).all();
      if (r.length) return r.map(v_api);
    } catch {                             }
    return zapasnoj;
  };

  const STADII_PO_UMOLCHANIJU = [
    { kod: 'ne_pisali',            imja: 'не писали',            rol: 'lid' },
    { kod: 'napisali',             imja: 'написали',             rol: 'lid' },
    { kod: 'na_soglasovanii',      imja: 'на согласовании',      rol: 'lid' },
    { kod: 'zhdem_oplatu',         imja: 'ждём оплату',          rol: 'lid' },
    { kod: 'ne_sejchas',           imja: 'не сейчас',            rol: 'lid' },
    { kod: 'v_rabote',             imja: 'в работе',             rol: 'klient' },
    { kod: 'zhdem_obratnuju_svjaz', imja: 'ждём обратную связь', rol: 'klient' },
    { kod: 'zaplanirovan_zum',     imja: 'запланирован зум',     rol: 'klient' },
    { kod: 'pauza',                imja: 'пауза',                rol: 'klient' },
                                                                       
                                                                    
                                                                        
                                                                    
                                   
    { kod: 'prismatrivaemsja',     imja: 'присматриваемся',      rol: 'referal',
      sledujuschee_dejstvie: 'Поговорить про рекомендации' },
    { kod: 'dogovarivaemsja',      imja: 'договариваемся',       rol: 'referal',
      sledujuschee_dejstvie: 'Назвать процент и прислать договор' },
    { kod: 'rabotaem',             imja: 'работаем',             rol: 'referal',
      sledujuschee_dejstvie: 'Напомнить о себе, если три месяца тишина' },
    { kod: 'k_vyplate',            imja: 'к выплате',            rol: 'referal',
      sledujuschee_dejstvie: 'Акт и выплата' },
  ];

  const vse = {
    publikacii_polja:{ploshadki:require('./opisanija.js').PLOSHADKI,formaty:require('./opisanija.js').FORMATY_PUBLIKACII,rubriki:db.prepare("SELECT DISTINCT rubrika FROM zadachi WHERE COALESCE(udaleno,0)=0 AND rubrika IS NOT NULL AND trim(rubrika)<>'' AND length(rubrika)<=100 ORDER BY rubrika LIMIT 200").all().map(row=>row.rubrika)},
    statusy_zadach: statusy,
    statusy,                                                                    
    tipy_zadach: tipy,
    spravochnik_tipov: tipy,
    roli,
                                                                
                                                                
                                                      
    stadii: (() => {
      const vse = iz_tablicy('spravochnik_stadij', STADII_PO_UMOLCHANIJU);
      const rol = zapros.rol || zapros.dostup;
      if (!rol) return vse;
      return vse.filter((st) => !st.rol || st.rol === rol);
    })(),
    napravlenija: db.prepare(
      'SELECT kod, nazvanie, cvet, porjadok, est_klienty, norma_dnej FROM napravlenija '
      + 'WHERE arhiv IS NULL OR arhiv = 0 ORDER BY porjadok, kod').all().map(v_api),
                                                                  
                                                                 
    vidy_kontakta: require('./opisanija.js').VIDY_KONTAKTA
      .map((k) => ({ kod: k, imja: k })),
    istochniki_zamera: [
      { kod: 'ruchnoj_zamer', imja: 'ручной замер' },
      { kod: 'formula',       imja: 'формула' },
      { kod: 'akkaunt',       imja: 'аккаунт соцсети' },
    ],
    metriki: [
      { kod: 'podpischikov',           imja: 'подписчиков' },
      { kod: 'prirost_podpischikov',   imja: 'прирост подписчиков' },
      { kod: 'publikacij',             imja: 'публикаций' },
      { kod: 'prosmotrov',             imja: 'просмотров' },
      { kod: 'prosmotrov_srednee',     imja: 'просмотров в среднем' },
      { kod: 'vovlechennost',          imja: 'вовлечённость' },
      { kod: 'ohvat',                  imja: 'охват' },
      { kod: 'ohvat_k_podpischikam',   imja: 'охват к подписчикам' },
    ],
                                                            
                                             
    tipy_dokumentov: (() => {
      const IMENA = {
        dogovor: 'договор', dopnik: 'дополнительное соглашение',
        akt: 'акт', schet: 'счёт', nda: 'соглашение о неразглашении',
        doverennost: 'доверенность', drugoe: 'другое',
      };
      const o = require('./opisanija.js');
      const kody = (o.OPISANIJA.dokumenty
        && o.OPISANIJA.dokumenty.spravochniki
        && o.OPISANIJA.dokumenty.spravochniki.tip) || Object.keys(IMENA);
      return kody.map((k) => ({ kod: k, imja: IMENA[k] || k }));
    })(),
  };

                                                          
  if (kljuch) {
    if (!(kljuch in vse)) throw new NeNajdeno(`справочника ${kljuch} нет`);
    return { telo: { [kljuch]: vse[kljuch] } };
  }
  return { telo: vse };
}

                                         
  
                                                                        
                                                                    
function sprinty({ zapros, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('GET required'), { kod: 405 });
  const den=zapros.den||segodnja(), current=iso_nedelja(den);
  const skolko=zapros.skolko===undefined?12:Number(zapros.skolko);
  if (!Number.isInteger(skolko) || skolko<1 || skolko>60) throw new OshibkaVvoda('skolko: 1-60','skolko');
  const year=Number(zapros.god??current.god);
  const center=nedelja_iz_zaprosa({god:year,nedelja:Math.min(current.nomer,nedel_v_godu(year))},den);
  const first=zapros.ot!==undefined
    ? nedelja_iz_zaprosa({god:zapros.god,nedelja:zapros.ot},den)
    : sdvinut_nedelju(center.god,center.nomer,-Math.floor(skolko/2));
  const spisok=Array.from({length:skolko},(_,i)=>{
    const week=sdvinut_nedelju(first.god,first.nomer,i);
    return {...week,tekuschij:week.god===current.god&&week.nomer===current.nomer};
  });
  return {telo:{tekuschij:current.nomer,god:current.god,den,spisok}};
}

                                                      
                                                                    
                                                               
                                                                   
                                                     
  
                                                             
                                                            
function ekran_zadach(ctx) {
  if (ctx.metod !== 'GET') {
    throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  }
  const db = baza();
  const den = ctx.zapros.den || segodnja();
  const week = nedelja_iz_zaprosa(ctx.zapros, den);
  const sprint = week.nomer, god = week.god;
  const g = granicy_nedeli(god, sprint);

  const OPIS = require('./opisanija.js').OPISANIJA || {};
  const spisok = (chto, filtry) => {
    try {
      const o = require('./obschij.js').spisok(chto, OPIS[chto] || {},
        { ...filtry }, ctx.avtor);
      return (o && o.telo && o.telo.spisok) || (o && o.spisok) || [];
    } catch { return []; }
  };

                                                                   
  let vid = 'spisok';
  try {
    const n = db.prepare('SELECT vid_zadach FROM nastrojki WHERE chelovek_id = ?')
      .get(ctx.avtor);
    if (n && n.vid_zadach) vid = n.vid_zadach;
  } catch {                        }

                                                                
                                                         
                                                              
  const srez = ctx.zapros.vid;
  const SREZY = {
    prosrochennye: { prosrochennye: 1 },
    moi: { otvetstvennyj: ctx.avtor },
    uchastvuju: { uchastnik: ctx.avtor },
    sdelano: { status: 'sdelano' },
  };
  const srez_zadach = SREZY[srez]
    ? spisok('zadachi', { ...SREZY[srez], na_stranice: 200 })
    : null;

  return { telo: {
    sprint,
    nedelja: { nomer: sprint, god, nachalo: g.nachalo, konec: g.konec },
    vid,
                                                                
                                            
    ...(srez_zadach ? {
      srez,
      spisok: srez_zadach,
      vsego: srez_zadach.length,
      moja_prosrochka: srez === 'uchastvuju'
        ? srez_zadach.filter((z) => z.otvetstvennyj === ctx.avtor).length
        : undefined,
    } : {}),
    napravlenija: spisok('napravlenija', { na_stranice: 50 }),
    ...(() => {
      const vse = spisok('ljudi', { na_stranice: 300 });
                                                              
                                                                    
      const ljudi=[];
      for(let stranica=1;;stranica++){
        const result=require('./obschij.js').spisok('ljudi',OPIS.ljudi||{},
          {komanda:true,na_stranice:200,stranica},ctx.avtor);
        ljudi.push(...result.spisok);
        if(stranica>=result.stranic)break;
      }
      return { ljudi,
               vneshnie: vse.filter((l) => !l.komanda) };
    })(),
    proekty: spisok('proekty', { na_stranice: 200 }),
    rassylki: spisok('rassylki', { na_stranice: 200 }),
                                                                  
                                                          
                                                   
    zadachi: (() => {
      const ja = Number(ctx.zapros.chelovek_id || ctx.avtor) || null;
      const nynche = segodnja();
      let stroki = [];
      try {
        const uslovija = ["(udaleno IS NULL OR udaleno = 0)"];
        const znach = [];
        if (vid === 'uchastvuju' && ja) {
          uslovija.push(`(otvetstvennyj = ? OR id IN
            (SELECT zadacha_id FROM uchastniki WHERE chelovek_id = ?))`);
          znach.push(ja, ja);
        } else if (vid === 'moi' && ja) {
          uslovija.push('otvetstvennyj = ?');
          znach.push(ja);
        }
        stroki = db.prepare(
          `SELECT * FROM zadachi WHERE ${uslovija.join(' AND ')}
            ORDER BY srok IS NULL, srok LIMIT 300`).all(...znach).map(v_api);
      } catch { stroki = []; }
      return stroki.map((z) => ({
        ...z,
                                                                   
                                                    
        moja_prosrochka: Boolean(ja && z.otvetstvennyj === ja
          && z.srok && z.srok < nynche
          && z.status !== 'sdelano' && z.status !== 'kogda_nibud'),
      }));
    })(),
  } };
}

                                                     
function nedeli({ zapros, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('GET required'), { kod: 405 });
  const den = zapros.den || segodnja();
  return { telo: nedelja_iz_zaprosa(zapros, den) };
}

                                            
  
                                                                  
                                               
function svodka(ctx) {
  const summary=require('./podruchki.js').PODRUCHKI_KODA.zadachi.svodka(ctx).telo;
  return {telo:{...summary,...summary.po_statusu,...summary.po_tipam,publikacii:summary.publikacij}};
}

                                               
  
                                                                   
                                                                 
                      
function poisk({ zapros, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const chto = String(zapros.chto || zapros.q || '').trim();
  if (chto.length < 2) return { telo: { chto, najdeno: [], vsego: 0 } };
                                                                     
                                                                     
                                                           
  const norma = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
  const obrazec = `%${norma(chto)}%`;
  const predel = Math.min(parseInt(zapros.skolko, 10) || 20, 50);

  const najdeno = [];

  db.prepare(
    `SELECT id, imja, jurlico FROM ljudi
     WHERE imja_norm LIKE ? AND (arhiv IS NULL OR arhiv = 0)
     ORDER BY imja LIMIT ?`
  ).all(obrazec, predel).forEach((l) => najdeno.push({
    chto: 'chelovek', id: l.id, imja: l.imja,
    adres: `/ljudi/${l.id}`,
    tochno: norma(l.imja) === norma(chto),
  }));

                                                                       
                                                      
  db.prepare(
    `SELECT nomer, nazvanie, napravlenie, status FROM zadachi
     WHERE ${NE_UDALENA} ORDER BY nomer DESC`
  ).all().filter((z) => norma(z.nazvanie).includes(norma(chto)))
    .slice(0, predel).forEach((z) => najdeno.push({
    chto: 'zadacha', id: z.nomer, imja: z.nazvanie,
    napravlenie: z.napravlenie, status: z.status,
    adres: `/${z.napravlenie}/${z.nomer}`,
    tochno: norma(z.nazvanie) === norma(chto),
  }));

  db.prepare('SELECT id, nazvanie, napravlenie FROM proekty ORDER BY id DESC')
    .all().filter((p) => norma(p.nazvanie).includes(norma(chto)))
    .slice(0, predel).forEach((p) => najdeno.push({
    chto: 'proekt', id: p.id, imja: p.nazvanie, napravlenie: p.napravlenie,
    adres: `/proekty/${p.id}`,
    tochno: norma(p.nazvanie) === norma(chto),
  }));

  db.prepare('SELECT id, nazvanie, napravlenie FROM celi ORDER BY id DESC')
    .all().filter((c) => norma(c.nazvanie).includes(norma(chto)))
    .slice(0, predel).forEach((c) => najdeno.push({
    chto: 'cel', id: c.id, imja: c.nazvanie, napravlenie: c.napravlenie,
    adres: `/okr?cel=${c.id}`,
    tochno: norma(c.nazvanie) === norma(chto),
  }));

                                                               
  najdeno.sort((a, b) => (b.tochno ? 1 : 0) - (a.tochno ? 1 : 0));
                                                              
                                                              
                                       
  const archive_results = [];
  if (zapros.rol === 'archive' || zapros.arhiv === '1') {
    db.prepare(
      `SELECT id, imja FROM ljudi
        WHERE imja_norm LIKE ? AND arhiv = 1
        ORDER BY imja LIMIT ?`).all(obrazec, predel).forEach((l) => {
      archive_results.push({ chto: 'chelovek', id: l.id, imja: l.imja,
        adres: `/ljudi/${l.id}`, arhiv: true });
    });
  }

                                                              
                                                            
  const IMENA_GRUPP = { chelovek: 'Люди', zadacha: 'Задачи',
                        proekt: 'Проекты', cel: 'Цели' };
  const groups = [];
  for (const n of najdeno) {
    let g = groups.find((x) => x.kod === n.chto);
    if (!g) {
      g = { kod: n.chto, nazvanie: IMENA_GRUPP[n.chto] || n.chto, spisok: [] };
      groups.push(g);
    }
    g.spisok.push(n);
  }

  return { telo: { chto, najdeno: najdeno.slice(0, predel),
                   vsego: najdeno.length, archive_results, groups } };
}

                                      
                                                      
function uvedomlenija(ctx) { return require('./uvedomlenija.js').uvedomlenija(ctx); }

                                          
                
                                                                
                                                                  
                                                                      
                                                         
const NASTROJKI_JSON = {
  razdely_menju: [],
  prioritetnye_napravlenija: [],
  svoi_cveta: {},
  bot_sobytija: {},
};

function nastrojki_naruzhu(stroka) {
  const o = { ...stroka };
  for (const [pole, pusto] of Object.entries(NASTROJKI_JSON)) {
    if (!(pole in o)) { o[pole] = pusto; continue; }
    if (o[pole] === null || o[pole] === undefined || o[pole] === '') {
      o[pole] = pusto; continue;
    }
    try { o[pole] = JSON.parse(o[pole]); } catch { o[pole] = pusto; }
  }
  return o;
}

function nastrojki(ctx) {
  let {telo}=ctx;const {avtor,zapros,metod}=ctx,commands=require('./nastrojki-komandy.js');
  const protectedResult=commands.handle(ctx,changes=>nastrojki({...ctx,metod:'PATCH',telo:changes}));if(protectedResult)return protectedResult;
  const db = baza();
  const ja = Number(avtor);
  if (!Number.isInteger(ja)) throw new OshibkaVvoda('нужен автор запроса', 'chelovek_id');

                                                              
                                                               
                                                                
                                                                 
                                 
                                                                    
                                                                      
                                                           
  const svojo_po_umolchaniju = () => {
    const OTK = "status NOT IN ('sdelano', 'kogda_nibud')";
    const ZHIV = '(udaleno IS NULL OR udaleno = 0) AND napravlenie IS NOT NULL';
    const samoe = (uslovie, ...dovody) => db.prepare(
      `SELECT napravlenie, count(*) n FROM zadachi
        WHERE otvetstvennyj = ? AND ${ZHIV} AND ${uslovie}
        GROUP BY napravlenie ORDER BY n DESC LIMIT 1`).get(ja, ...dovody);
    try {
      const week = require('./kalendar.js').iso_nedelja(segodnja());
      const r = samoe(`${OTK} AND sprint = ? AND god_sprinta = ?`, week.nomer, week.god)
        || samoe(OTK) || samoe('1 = 1');
      return r ? r.napravlenie : null;
    } catch { return null; }
  };
  const s_umolchaniem = (o) => {
    if (o.prioritetnoe_napravlenie == null) {
      const kod = svojo_po_umolchaniju();
      if (kod) return { ...o, prioritetnoe_napravlenie: kod, prioritetnoe_po_umolchaniju: true };
    }
    return o;
  };

  if (metod === 'GET') {
    const est = db.prepare('SELECT * FROM nastrojki WHERE chelovek_id = ?').get(ja);
                                                                        
                                                              
    return {
      telo: commands.present(db,ja,s_umolchaniem(est ? nastrojki_naruzhu(v_api(est)) : {
        chelovek_id: ja, tema: 'svetlaja', uvedomlenija_pochta: true,
        uvedomlenija_telegram: false, nachalo_nedeli: 'ponedelnik',
        chasovoj_pojas: 'Europe/Moscow',
        ...NASTROJKI_JSON,
      })),
    };
  }
                                                                    
                                                                       
                                              
  if (metod !== 'PATCH' && metod !== 'POST' && metod !== 'PUT') {
    throw Object.assign(new Error('сюда GET, PATCH или PUT'), { kod: 405 });
  }

  if(Object.hasOwn(telo||{},'pokazannye_podskazki'))telo={...telo,pokazannye_podskazki:require('./context-hints.js').normalise(telo.pokazannye_podskazki)};
  for (const [pole, dopustimo] of Object.entries({
    startovyj_ekran: ['moe', 'zadachi', 'planerka'], chi_zadachi: ['moi', 'vse'],
  })) {
    if (telo[pole] !== undefined && telo[pole] !== null && !dopustimo.includes(telo[pole])) {
      throw new OshibkaVvoda(`${pole}: одно из ${dopustimo.join(', ')}`, pole);
    }
  }
  if (telo.prioritetnoe_napravlenie != null && telo.prioritetnoe_napravlenie !== 'net'
      && (typeof telo.prioritetnoe_napravlenie !== 'string'
        || !db.prepare('SELECT 1 FROM napravlenija WHERE kod=?').get(telo.prioritetnoe_napravlenie))) {
    throw new OshibkaVvoda('такого направления нет', 'prioritetnoe_napravlenie');
  }
  for (const [pole, umolchanie] of Object.entries(NASTROJKI_JSON)) {
    if (telo[pole] === undefined || telo[pole] === null) continue;
    let znachenie = telo[pole];
    if (typeof znachenie === 'string') {
      try { znachenie = JSON.parse(znachenie); }
      catch { throw new OshibkaVvoda(`${pole}: нужен корректный JSON`, pole); }
    }
    const forma_verna = Array.isArray(umolchanie) ? Array.isArray(znachenie)
      : znachenie !== null && typeof znachenie === 'object' && !Array.isArray(znachenie);
    if (!forma_verna) throw new OshibkaVvoda(`${pole}: неверный вид настройки`, pole);
    if (pole === 'bot_sobytija' && Object.values(znachenie).some(v => typeof v !== 'boolean')) {
      throw new OshibkaVvoda('bot_sobytija: значения true или false', pole);
    }
  }

  const est = db.prepare('SELECT * FROM nastrojki WHERE chelovek_id = ?').get(ja);
  const polja_tablicy = new Set(
    db.prepare('PRAGMA table_info(nastrojki)').all().map((c) => c.name));
  const pary = Object.entries(telo || {})
    .filter(([k]) => polja_tablicy.has(k) && k !== 'id' && k !== 'chelovek_id')
                                                              
                                                   
    .map(([k, v]) => (k in NASTROJKI_JSON && typeof v === 'object' && v !== null
      ? [k, JSON.stringify(v)] : [k, v]))
                                                                 
                                                                
    .map(([k, v]) => (typeof v === 'boolean' && !require('../db/db.js').LOGICHESKIE.has(k) ? [k, v ? 1 : 0] : [k, v]));
  if (!pary.length) throw new OshibkaVvoda('нечего менять', 'telo');

                                                             
                                                              
  if (est) {
    db.prepare(`UPDATE nastrojki SET ${pary.map(([k]) => `${k} = ?`).join(', ')} `
               + 'WHERE chelovek_id = ?').run(...pary.map(([k, v]) => v_bazu(v, k)), ja);
  } else {
    db.prepare(`INSERT INTO nastrojki (chelovek_id, ${pary.map(([k]) => k).join(', ')}) `
               + `VALUES (?, ${pary.map(() => '?').join(', ')})`)
      .run(ja, ...pary.map(([k, v]) => v_bazu(v, k)));
  }
  return { telo: commands.present(db,ja,s_umolchaniem(nastrojki_naruzhu(
    v_api(db.prepare('SELECT * FROM nastrojki WHERE chelovek_id = ?').get(ja))))) };
}

                                                      
function nastrojki_sistemy(ctx) { return require('./parametry-analitiki.js').handle(ctx); }

                                                                    
                                       
  
                                                                     
                                                                  
                          

const krypto = require('node:crypto');

function token() {
  return krypto.randomBytes(24).toString('base64url');
}

                                                                   
                                                            
function zahesirovat(parol) {
  const sol = krypto.randomBytes(16).toString('hex');
  const hesh = krypto.scryptSync(String(parol), sol, 64).toString('hex');
  return `${sol}:${hesh}`;
}

                                                               
                                            
function parol_shoditsja(parol, hranimoe) {
  const [sol, hesh] = String(hranimoe || '').split(':');
  if (!sol || !hesh) return false;
  const schitannyj = krypto.scryptSync(String(parol), sol, 64);
  const hranimyj = Buffer.from(hesh, 'hex');
  if (hranimyj.length !== schitannyj.length) return false;
  return krypto.timingSafeEqual(schitannyj, hranimyj);
}

                                                           
                                                       
                                                  
                                           
function vhod({ telo, zapros, avtor, metod, kljuch }) {
  const db = baza();

  if (metod === 'GET') {
                                                                
                                                  
    const ja = Number(avtor);
    if (!avtor) return { telo: { voshel: false } };
    if (!Number.isInteger(ja)) return { telo: { voshel: false } };
    const chel = db.prepare('SELECT id, imja, foto, dostup FROM ljudi WHERE id = ?').get(ja);
    if (!chel) return { telo: { voshel: false } };
    return { telo: { voshel: true, chelovek: v_api(chel) } };
  }

  if (metod === 'PATCH') {
    require('./dostup.js').tolko_admin(db, avtor);
    const id = Number(kljuch);
    if (!Number.isSafeInteger(id) || id < 1) throw new OshibkaVvoda('нужен номер человека');
    const neizvestnoe = Object.keys(telo).find(p => !['zablokirovan', 'sessija'].includes(p));
    if (neizvestnoe) throw new OshibkaVvoda('неизвестное поле: ' + neizvestnoe, neizvestnoe);
    if (typeof telo.zablokirovan !== 'boolean') throw new OshibkaVvoda('zablokirovan: true или false', 'zablokirovan');
    const bylo = db.prepare('SELECT zablokirovan FROM vhod WHERE chelovek_id=?').get(id);
    if (!bylo) throw new NeNajdeno('вход человека не найден');
    return v_odnoj_tranzakcii(db, () => {
      db.prepare('UPDATE vhod SET zablokirovan=? WHERE chelovek_id=?').run(telo.zablokirovan ? 1 : 0, id);
      if (telo.zablokirovan) db.prepare('DELETE FROM sessii WHERE chelovek_id=?').run(id);
      require('./obschij.js').v_zhurnal(db, 'ljudi', id, 'vhod_zablokirovan',
        String(bylo.zablokirovan || 0), telo.zablokirovan ? '1' : '0', avtor);
      return { telo: { chelovek_id: id, zablokirovan: telo.zablokirovan } };
    });
  }
  if (metod !== 'POST') throw Object.assign(new Error('сюда только POST или PATCH'), { kod: 405 });

                                                                   
                                                                     
  if (process.env.LOCUS_TEST_AUTH !== '1' && !['parol', 'vyjti'].includes(kljuch)) {
    throw Object.assign(new Error('используй вход по логину и паролю'), { kod: 404 });
  }

                                        
  if (kljuch === 'vyjti') {
    const sessija = String(telo.sessija || '');
    if (sessija) db.prepare('DELETE FROM sessii WHERE id = ?').run(sessija);
    return { telo: { vyshel: true } };
  }

                                                               
                                                                   
                                                                      
    
                                                                
                     
  if (kljuch === 'parol') {
    const prodlit_dlja = telo.prodlit_dlja;
    if (prodlit_dlja !== undefined
        && (!Number.isSafeInteger(prodlit_dlja) || prodlit_dlja < 1)) {
      throw new OshibkaVvoda('нужен номер участника открытой страницы', 'prodlit_dlja');
    }
    const login = String(telo.login || '').trim().toLowerCase();
    const parol = String(telo.parol || '');
    if (!login || !parol) {
      throw new OshibkaVvoda('нужны логин и пароль', login ? 'parol' : 'login');
    }
    const v = db.prepare('SELECT * FROM vhod WHERE lower(login) = ?').get(login);                                 
                                                                  
                                                          
    const otkaz = () => Object.assign(new Error('логин или пароль не подошли'),
                                      { kod: 401 });
    if (!v || !v.parol_hesh) throw otkaz();
    if (v.zablokirovan) {
      throw Object.assign(new Error('вход закрыт, напиши в чат'), { kod: 403 });
    }
    if (!parol_shoditsja(parol, v.parol_hesh)) throw otkaz();
                                                                 
                                                                
    if (prodlit_dlja !== undefined && prodlit_dlja !== v.chelovek_id) {
      throw Object.assign(new Error('В этой вкладке открыт другой участник. Войди под участником этой страницы.'), { kod: 409 });
    }

    return v_odnoj_tranzakcii(db, () => {
      const sessija = token();
      const istekaet = new Date(Date.now() + 30 * 86400000).toISOString();
      db.prepare(
        'INSERT INTO sessii (id, chelovek_id, sozdano, istekaet, ustrojstvo) VALUES (?,?,?,?,?)'
      ).run(sessija, v.chelovek_id, seichas(), istekaet,
            String(telo.ustrojstvo || '').slice(0, 200) || null);
      db.prepare('UPDATE vhod SET poslednij_vhod = ? WHERE chelovek_id = ?')
        .run(seichas(), v.chelovek_id);
      const chel = db.prepare('SELECT id, imja, foto FROM ljudi WHERE id = ?')
        .get(v.chelovek_id);
                                                                  
                                                                
                                   
      const nast = db.prepare(
        'SELECT startovyj_ekran FROM nastrojki WHERE chelovek_id = ?')
        .get(v.chelovek_id);
      const PUTI_EKRANOV = { moe: '/prostranstvo.html',
        zadachi: '/zadachi.html', planerka: '/planerka.html' };
      const kod_ekrana = (nast && nast.startovyj_ekran) || null;
      return { telo: { sessija, chelovek: chel ? v_api(chel) : null,
                       startovyj_ekran: PUTI_EKRANOV[kod_ekrana]
                         || v.startovyj_ekran || '/prostranstvo.html' } };
    });
  }

                                               
  if (kljuch === 'proverit') {
    const kod = String(telo.kod || '').trim();
    if (!kod) throw new OshibkaVvoda('нужен код из ссылки', 'kod');
    const s = db.prepare('SELECT * FROM vhod_ssylki WHERE id = ?').get(kod);
    if (!s) throw Object.assign(new Error('ссылка не найдена'), { kod: 401 });
    if (s.ispolzovana) {
      throw Object.assign(new Error('ссылкой уже входили, попроси новую'), { kod: 401 });
    }
    if (new Date(s.istekaet) < new Date()) {
      throw Object.assign(new Error('ссылка устарела, попроси новую'), { kod: 401 });
    }

                                                  
    db.prepare('UPDATE vhod_ssylki SET ispolzovana = ? WHERE id = ?')
      .run(seichas(), kod);

    const sessija = token();
    const istekaet = new Date(Date.now() + 30 * 86400000).toISOString();
    db.prepare(
      'INSERT INTO sessii (id, chelovek_id, sozdano, istekaet, ustrojstvo) VALUES (?,?,?,?,?)'
    ).run(sessija, s.chelovek_id, seichas(), istekaet,
          String(telo.ustrojstvo || '').slice(0, 200) || null);

    const chel = db.prepare('SELECT id, imja, foto, dostup FROM ljudi WHERE id = ?')
      .get(s.chelovek_id);
                                                                   
                                        
    return { telo: { sessija, istekaet, chelovek: v_api(chel), kuda: s.kuda || '/' } };
  }

                  
  const pochta = String(telo.pochta || '').trim().toLowerCase();
  if (!pochta || !pochta.includes('@')) {
    throw new OshibkaVvoda('нужна рабочая почта', 'pochta');
  }

                                                                   
                                                                
  const kontakt = db.prepare(
    `SELECT k.chelovek_id FROM kontakty k
     WHERE k.tip = 'pochta' AND lower(k.znachenie) = ? LIMIT 1`)                
    .get(pochta);

                                                                    
                                     
  const otvet = { otpravleno: true, pochta,
                  tekst: 'Если почта заведена в Локусе, ссылка уже там' };
  if (!kontakt) return { telo: otvet };

  const kod = token();
  db.prepare(
    'INSERT INTO vhod_ssylki (id, chelovek_id, sozdano, istekaet, kuda) VALUES (?,?,?,?,?)'
  ).run(kod, kontakt.chelovek_id, seichas(),
        new Date(Date.now() + 15 * 60000).toISOString(),
        String(telo.kuda || '/').slice(0, 300));

                                                               
                                                       
  if (process.env.LOCUS_RAZRABOTKA === '1') otvet.ssylka = `/vhod.html?kod=${kod}`;
  return { telo: otvet };
}

                                                               
                                         
function sessii({ zapros, avtor, metod, kljuch }) {
  const db = baza();
  const ja = Number(avtor);
  if (!Number.isInteger(ja)) throw new OshibkaVvoda('нужен автор запроса', 'chelovek_id');

  if (metod === 'GET') {
    const spisok = db.prepare(
      'SELECT * FROM sessii WHERE chelovek_id = ? ORDER BY sozdano DESC').all(ja)
      .map((s) => ({ ...v_api(s), id: String(s.id).slice(0, 8) + '…' }));
    return { telo: { spisok } };
  }
  if (metod === 'DELETE') {
    if (kljuch === 'vse') {
      const n = db.prepare('DELETE FROM sessii WHERE chelovek_id = ?').run(ja).changes;
      return { telo: { zakryto: n } };
    }
    const n = db.prepare('DELETE FROM sessii WHERE id = ? AND chelovek_id = ?')
      .run(String(kljuch), ja).changes;
    if (!n) throw new NeNajdeno('такой сессии нет');
    return { telo: { zakryto: n } };
  }
  throw Object.assign(new Error('сюда GET или DELETE'), { kod: 405 });
}

module.exports = { moe_prostranstvo, itogi, kontent, okr, planerka, prodlit, otmena,
                   granicy_nedeli, nomer_nedeli,
                                                               
                                                               
                                                          
                   procent_celi, fakt_rezultata,
                                                                            
                                                                      
                                                                             
                                                         
                   POKAZATELI,
                                                                   
                                                               
                                                             
                                                              
                                                    
  razobrat_period, granicy_perioda,
  spravochniki, sprinty, nedeli, svodka, poisk, ekran_zadach,
  uvedomlenija, nastrojki, nastrojki_sistemy,
  vhod, sessii };
