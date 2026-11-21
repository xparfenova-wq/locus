                                                
  
                                                                     
                                                        

const { baza, v_api, v_bazu, OshibkaVvoda, NeNajdeno,
        v_odnoj_tranzakcii , seichas } = require('../db/db.js');
const { segodnja } = require('../db/db.js');
const { OTKRYTA, NE_UDALENA } = require('./podruchki.js');

function teper() { return seichas(); }

                                                         
                                             
  
                                                               
                                             
function plashki({ zapros, telo, avtor, metod, kljuch }) {
  const db = baza();
  const ja = Number((telo && telo.chelovek_id) || zapros.chelovek_id || avtor);
  if (!Number.isInteger(ja)) throw new OshibkaVvoda('нужен автор запроса', 'chelovek_id');

  if (metod === 'POST' && kljuch === 'skryt') {
    const o_kom = Number(telo.o_kom_id);
    if (!Number.isInteger(o_kom)) throw new OshibkaVvoda('нужен o_kom_id', 'o_kom_id');
                                                                      
    const do_kogda = new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' ');
    db.prepare(
      `INSERT INTO skrytye_plashki (chelovek_id, o_kom_id, skryto_do) VALUES (?,?,?)
       ON CONFLICT(chelovek_id, o_kom_id) DO UPDATE SET skryto_do = excluded.skryto_do`)
      .run(ja, o_kom, do_kogda);
    return { telo: { skryto_do: do_kogda, o_kom_id: o_kom } };
  }

  if (metod !== 'GET') throw Object.assign(new Error('сюда GET или POST'), { kod: 405 });

  const skrytye = new Set(db.prepare(
    'SELECT o_kom_id FROM skrytye_plashki WHERE chelovek_id = ? AND skryto_do > ?')
    .all(ja, teper()).map((r) => r.o_kom_id));

  const den = zapros.den || segodnja();
  const plashki_spisok = [];

                                                  
  db.prepare(
    `SELECT s.chelovek_id, l.imja, s.napravlenie, s.poslednee_obshenie,
            coalesce(n.norma_dnej, 14) norma
     FROM sotrudnichestva s
     JOIN ljudi l ON l.id = s.chelovek_id
     LEFT JOIN napravlenija n ON n.kod = s.napravlenie
     WHERE s.rol = 'klient' AND (s.arhiv IS NULL OR s.arhiv = 0)
       AND (s.stadija IS NULL OR s.stadija <> 'pauza')
     ORDER BY s.id`).all().map(row=>{
       const facts=require('./obschenie.js').najti(db,row.chelovek_id,require('./vremja-obschenija.js').razobrat(den).moment);
       return {...row,poslednee_obshenie:facts.poslednee_obshenie_obshee,dnej:facts.dnej_bez_svjazi};
     }).filter(row=>row.dnej!==null&&row.dnej>row.norma).slice(0,20).forEach((s) => {
    if (skrytye.has(s.chelovek_id)) return;
    plashki_spisok.push({
      tip: 'davno_ne_obschalis',
      o_kom_id: s.chelovek_id,
      imja: s.imja,
      napravlenie: s.napravlenie,
      dnej: s.dnej,
      norma: s.norma,
      adres: `/ljudi/${s.chelovek_id}`,
    });
  });

  return { telo: { plashki: plashki_spisok, vsego: plashki_spisok.length } };
}

                                                                
                                                  
  
                                                             
                                                    
                                                                
                                                                     
                                            
  
                                                                        
                                                             
                                                          
const SHAGI_VHODA = [
  ['shag_1', 'Где мои задачи'],
  ['shag_2', 'Как создать задачу'],
  ['shag_3', 'Что такое спринт и как переключать'],
  ['shag_4', 'Где люди и как найти человека'],
  ['shag_5', 'Как отметить задачу сделанной'],
  ['shag_6', 'Где планёрка и зачем она'],
  ['shag_7', 'Где искать помощь'],
];

function otmetki(db, ja) {
  try {
    const n = db.prepare(
      'SELECT pokazannye_podskazki FROM nastrojki WHERE chelovek_id = ?').get(ja);
    if (!n || !n.pokazannye_podskazki) return new Set();
    return new Set(require('./context-hints.js').tokens(n.pokazannye_podskazki));
  } catch { return new Set(); }
}

function sostojanie_onbordinga(db, ja) {
  const est = otmetki(db, ja);
  return SHAGI_VHODA.map(([kod, imja]) => ({ kod, imja, sdelano: est.has(kod) }));
}

function podskazki({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const ja = Number(zapros.chelovek_id || avtor);
  if (!Number.isInteger(ja)) throw new OshibkaVvoda('нужен автор запроса', 'chelovek_id');
  const shagi = sostojanie_onbordinga(db, ja);
  return { telo: { shagi: shagi.filter((s) => !s.sdelano), ...require('./context-hints.js').read(avtor) } };
}

function onbording({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const ja = Number(zapros.chelovek_id || avtor);
  if (!Number.isInteger(ja)) throw new OshibkaVvoda('нужен автор запроса', 'chelovek_id');
  const shagi = sostojanie_onbordinga(db, ja);
  const sdelano = shagi.filter((s) => s.sdelano).length;
  return {
    telo: { shagi, sdelano, vsego: shagi.length,
            procent: Math.round((sdelano / shagi.length) * 100),
            zavershen: sdelano === shagi.length },
  };
}

                                                          
  
                                                          
                                               
function kasanija({ telo, zapros, avtor, metod }) {
  const db = baza();

  if (metod === 'GET') {
    const chelovek = Number(zapros.chelovek_id);
    if (!Number.isInteger(chelovek)) {
      throw new OshibkaVvoda('нужен chelovek_id', 'chelovek_id');
    }
    const spisok = db.prepare(
      `SELECT * FROM rassylka_kasanija WHERE chelovek_id = ?
       ORDER BY kogda DESC LIMIT 50`).all(chelovek).map(v_api);
    return { telo: { spisok } };
  }

  if (metod !== 'POST') throw Object.assign(new Error('сюда GET или POST'), { kod: 405 });
  const o_kom = Number(telo.o_kom_id || telo.komu_id);
  if (!Number.isSafeInteger(o_kom)||o_kom<1) throw new OshibkaVvoda('нужен o_kom_id', 'o_kom_id');
  const row=db.prepare('SELECT id,versija FROM sotrudnichestva WHERE chelovek_id=?'+(telo.napravlenie?' AND napravlenie=?':'')+' ORDER BY id LIMIT 1').get(...(telo.napravlenie?[o_kom,telo.napravlenie]:[o_kom]));
  if(!row)throw new NeNajdeno('у этого человека нет сотрудничества');
  const result=require('./podruchki.js').PODRUCHKI_KODA.sotrudnichestva.kasanie({kljuch:row.id,metod:'POST',avtor,telo:{chelovek_id:o_kom,versija:row.versija,...(Object.hasOwn(telo,'kogda')?{kogda:telo.kogda}:{}),...(Object.hasOwn(telo,'otkuda')?{otkuda:telo.otkuda}:{})}}).telo;
  return {telo:{otmecheno:result.rolej_otmecheno,chelovek_id:o_kom,kogda:result.poslednee_obshenie}};
}

                                                             
  
                                                              
function oshibki({ telo, avtor, metod }) {
  if (metod !== 'POST') throw Object.assign(new Error('сюда только POST'), { kod: 405 });
  return require('./otchety-oshibok.js').handle(telo,avtor);
}

                                     
  
                                                              
                                                             
function vygruzka({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const chto = zapros.chto || 'proekty';
  const mozhno = ['proekty', 'zadachi', 'ljudi', 'platezhi', 'sotrudnichestva'];
  if (!mozhno.includes(chto)) {
    throw new OshibkaVvoda(`chto: одно из ${mozhno.join(', ')}`, 'chto');
  }

                                                                    
  if (chto === 'platezhi') {
    if (!require('./dengi-dostup.js').vidit(db,avtor)) {
      throw Object.assign(new Error('у тебя доступ без денег'), { kod: 403 });
    }
  }

                                                                  
                                                      
  const FILTRY_VYGRUZKI = ['napravlenie', 'status', 'sprint', 'otvetstvennyj',
    'rol', 'klient_id', 'proekt_id', 'stadija', 'tip'];
  const uslovija = [];
  const znachenija = [];
  const kolonki_tablicy = new Set(db.prepare(
    `SELECT name FROM pragma_table_info('${chto}')`).all().map((r) => r.name));
  for (const f of FILTRY_VYGRUZKI) {
    if (zapros[f] !== undefined && zapros[f] !== '' && kolonki_tablicy.has(f)) {
      uslovija.push(`${f} = ?`);
      znachenija.push(zapros[f]);
    }
  }
  const gde = uslovija.length ? `WHERE ${uslovija.join(' AND ')}` : '';
  const stroki = db.prepare(`SELECT * FROM ${chto} ${gde} LIMIT 5000`)
    .all(...znachenija).map(v_api).map(row => require('./obschij.js').bez_summ(chto, row, avtor));
  if (!stroki.length) return { telo: { chto, stolbcy: [], stroki: [], csv: '' } };

  const stolbcy = Object.keys(stroki[0]);
  const ekran = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' && /^[=+@\-\t\r]/.test(v) ? "'" + v : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
                                                                 
  const csv = [stolbcy.join(';')]
    .concat(stroki.map((r) => stolbcy.map((k) => ekran(r[k])).join(';'))).join('\n');

  return { telo: { chto, stolbcy, vsego: stroki.length, csv } };
}

                                                
  
                                                                    
                                            
function zagruzka({ telo, avtor, metod }) {
  if (metod !== 'POST') throw Object.assign(new Error('сюда только POST'), { kod: 405 });
  const response=require('./podruchki.js').PODRUCHKI_KODA.ljudi.zagruzka({telo,avtor,metod});
  const result=response.telo;
  return {kod:response.kod,telo:{...result,zavedeno:result.dobavleno,najdeno:result.najdeno_dublej}};
}

                                                        
  
                                                                  
                                                                      
function zagotovka_zadachi({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const den = segodnja();

  function nomer_nedeli(data) {
    const d = new Date(`${data}T00:00:00Z`);
    const dn = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dn);
    const ng = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - ng) / 86400000 + 1) / 7);
  }

                                                                  
                                                                     
                                                             
                         
  if (zapros.stroka) {
    const db2 = db;
    let ostatok = String(zapros.stroka).trim();
    const razobrano = { nazvanie: null, srok: null,
                        otvetstvennyj: null, napravlenie: null };
    const DNI = { 'понедельника': 1, 'понедельник': 1, 'вторника': 2,
      'вторник': 2, 'среды': 3, 'среда': 3, 'четверга': 4, 'четверг': 4,
      'пятницы': 5, 'пятница': 5, 'субботы': 6, 'суббота': 6,
      'воскресенья': 7, 'воскресенье': 7 };
                                                          
                                                             
    const m_den = ostatok.match(/(?:^|\s)до\s+([а-яё]+)/i);
    if (m_den && DNI[m_den[1].toLowerCase()]) {
      const d = new Date();
      const nado = DNI[m_den[1].toLowerCase()];
      let sdvig = (nado - ((d.getDay() + 6) % 7 + 1) + 7) % 7;
      if (!sdvig) sdvig = 7;
      d.setDate(d.getDate() + sdvig);
      razobrano.srok = d.toISOString().slice(0, 10);
      ostatok = ostatok.replace(m_den[0], '').trim();
    }
    const m_data = ostatok.match(/\b(?:до\s+)?(\d{1,2})[.](\d{1,2})\b/);
    if (!razobrano.srok && m_data) {
                                                                        
      const den2 = String(m_data[1]).padStart(2, '0');
      const mes2 = String(m_data[2]).padStart(2, '0');
      let god = new Date().getFullYear();
      if (`${god}-${mes2}-${den2}` < segodnja()) god += 1;
      razobrano.srok = `${god}-${mes2}-${den2}`;
      ostatok = ostatok.replace(m_data[0], '').trim();
    }
    if (/(?:^|\s)завтра(?=\s|$)/i.test(ostatok)) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      razobrano.srok = d.toISOString().slice(0, 10);
      ostatok = ostatok.replace(/(?:^|\s)завтра(?=\s|$)/i, ' ').trim();
    }
                                                          
    try {
      const komanda = db2.prepare(
        "SELECT id, imja FROM ljudi WHERE komanda = 1 AND (arhiv IS NULL OR arhiv = 0)").all();
      for (const ch of komanda) {
        const imja1 = String(ch.imja).split(' ')[0];
        const re = new RegExp('(?:^|\\s)' + imja1 + '[а-яё]*(?=\\s|$)', 'i');
        if (re.test(ostatok)) {
          razobrano.otvetstvennyj = ch.id;
          razobrano.otvetstvennyj_imja = ch.imja;
          ostatok = ostatok.replace(re, ' ').trim();
          break;
        }
      }
    } catch {                                      }
                         
    try {
      const naprs = db2.prepare('SELECT kod, nazvanie FROM napravlenija WHERE arhiv IS NULL OR arhiv = 0').all();
      for (const n of naprs) {
        const slovo = String(n.nazvanie || n.kod).split(/[,(]/)[0].trim();
        const re = new RegExp('(?:^|\\s)' + slovo.replace(/[.*+?^${}()|[\]\\]/g, '') + '(?=\\s|$)', 'i');
        if (slovo && re.test(ostatok)) {
          razobrano.napravlenie = n.kod;
          ostatok = ostatok.replace(re, ' ').trim();
          break;
        }
      }
    } catch {                                    }
    razobrano.nazvanie = ostatok.replace(/\s{2,}/g, ' ').trim() || String(zapros.stroka).trim();
    return { telo: { razobrano } };
  }

  const zagotovka = {
    napravlenie: zapros.napravlenie || null,
    klient_id: zapros.klient_id ? Number(zapros.klient_id) : null,
    proekt_id: zapros.proekt_id ? Number(zapros.proekt_id) : null,
    cel_id: zapros.cel_id ? Number(zapros.cel_id) : null,
    otvetstvennyj: Number(avtor) || null,
    sprint: nomer_nedeli(den),
    status: 'v_plane',
    tip: 'biznesovaja',
  };

                                                             
  if (zagotovka.proekt_id) {
    const p = db.prepare('SELECT napravlenie, klient_id FROM proekty WHERE id = ?')
      .get(zagotovka.proekt_id);
    if (p) {
      zagotovka.napravlenie = zagotovka.napravlenie || p.napravlenie;
      zagotovka.klient_id = zagotovka.klient_id || p.klient_id;
      zagotovka.tip = 'klientskaja';
    }
  }
                                            
  if (zagotovka.klient_id && zagotovka.tip === 'biznesovaja') {
    zagotovka.tip = 'klientskaja';
  }
  if (zagotovka.cel_id) {
    const c = db.prepare('SELECT napravlenie FROM celi WHERE id = ?').get(zagotovka.cel_id);
    if (c) zagotovka.napravlenie = zagotovka.napravlenie || c.napravlenie;
  }

  return { telo: { zagotovka, shablony: require('./shablony.js').list(db,avtor).spisok } };
}

                                           
function rassylka({ zapros, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const id = zapros.id ? Number(zapros.id) : null;
  const vzjat = (s, ...z) => { try { return db.prepare(s).all(...z).map(v_api); }
                               catch { return []; } };

  if (!id) {
    return { telo: { spisok: vzjat(
      `SELECT * FROM rassylki ORDER BY coalesce(nachalo, '') DESC, id DESC LIMIT 50`) } };
  }

  const r = db.prepare('SELECT * FROM rassylki WHERE id = ?').get(id);
  if (!r) throw new NeNajdeno(`рассылки ${id} нет`);
  const ljudi = vzjat('SELECT * FROM rassylka_ljudi WHERE rassylka_id = ?', id);
  const kasanija_spisok = vzjat(
    'SELECT * FROM rassylka_kasanija WHERE rassylka_id = ?', id);

  return {
    telo: {
      ...v_api(r),
      vsego_ljudej: ljudi.length,
      otpravleno: kasanija_spisok.length,
      ostalos: Math.max(0, ljudi.length - kasanija_spisok.length),
      plan: vzjat('SELECT * FROM rassylka_plan WHERE rassylka_id = ? ORDER BY id', id),
    },
  };
}

                                                       
  
                                  
                                        
  
                                                                  
                                                                  
                                                             
function rassylka_soobshenija({ zapros, telo, avtor, metod }) {
  const db = baza();

  if (metod === 'POST') {
    const id=Number(telo?.rassylka_id),person=Number(telo?.chelovek_id);
    require('./kontaktnye-lica.js').proverit_dlja_rassylki(db,person);
    for(const field of Object.keys(telo||{}))if(!['rassylka_id','chelovek_id','chto','zadacha_id','kogda','zapros_kljuch','versija_otmetki'].includes(field))throw new OshibkaVvoda('Неизвестный параметр отметки',field);
    const result=require('./volny-rassylok.js').mark({metod:'PATCH',kljuch:id,avtor,telo:{
      zapros_kljuch:telo.zapros_kljuch,chelovek_ids:[person],status:telo.chto||'otpravleno',
      versii:{[person]:telo.versija_otmetki},...(telo.zadacha_id!=null?{zadacha_id:telo.zadacha_id}:{}),...(telo.kogda!==undefined?{kogda:telo.kogda}:{}),
    }});
    return {kod:201,telo:result.telo};
  }

  if (metod !== 'GET') throw Object.assign(new Error('сюда GET или POST'), { kod: 405 });
  const id = zapros.rassylka_id ? Number(zapros.rassylka_id) : null;
  try {
    const spisok = db.prepare(
      `SELECT * FROM rassylka_kasanija ${id ? 'WHERE rassylka_id = ?' : ''}
       ORDER BY kogda DESC, rowid DESC LIMIT 200`)
      .all(...(id ? [id] : [])).map(v_api);
    return { telo: { spisok } };
  } catch (e) {
    return { kod: 500, telo: { oshibka: e.message } };
  }
}

                                             
function zapisi({ zapros, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  try {
    const uslovija = [], znach = [];
    if (zapros.tip) { uslovija.push('tip = ?'); znach.push(zapros.tip); }
    const gde = uslovija.length ? 'WHERE ' + uslovija.join(' AND ') : '';
    return { telo: { spisok: db.prepare(
      `SELECT z.*, l.imja AS avtor_imja, l.foto, l.inicialy, l.cvet
         FROM lenta z LEFT JOIN ljudi l ON l.id = z.chelovek_id
         ${gde.replace('WHERE', 'WHERE z.').replace('tip = ?', 'tip = ?')}
        ORDER BY z.id DESC LIMIT 100`).all(...znach).map(v_api) } };
  } catch { return { telo: { spisok: [] } }; }
}

                                                             
  
                                                              
                                                                
                                                          
                                    
function bazy_svodka({ metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const po_napravlenijam = db.prepare(
    `SELECT napravlenie, rol, count(*) n FROM sotrudnichestva
     WHERE arhiv IS NULL OR arhiv = 0 GROUP BY napravlenie, rol`).all().map(v_api);
  const vsego = db.prepare(
    'SELECT count(*) n FROM ljudi WHERE arhiv IS NULL OR arhiv = 0').get().n;
  const s_pochtoj = db.prepare(
    `SELECT count(DISTINCT chelovek_id) n FROM kontakty WHERE tip = 'pochta'`).get().n;
  const s_telegramom = db.prepare(
    `SELECT count(DISTINCT chelovek_id) n FROM kontakty WHERE tip = 'telegram'`).get().n;

  return { telo: { vsego, s_pochtoj, s_telegramom, po_napravlenijam } };
}

                                                          
function meta({ metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const schet = (t) => {
    try { return db.prepare(`SELECT count(*) n FROM ${t}`).get().n; } catch { return 0; }
  };
  return {
    telo: {
      imja: 'Локус',
      opisanie: 'Место, где видно всю работу сразу',
      tablic: db.prepare(
        "SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n,
      ljudej: schet('ljudi'),
      zadach: schet('zadachi'),
      napravlenij: schet('napravlenija'),
      celej: schet('celi'),
    },
  };
}

                                          
function fajly({ zapros, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
                                                                
                                                    
  const vzjat = (s, ...z) => { try { return db.prepare(s).all(...z).map(v_api); }
                               catch { return []; } };
  const chelovek = zapros.chelovek_id ? Number(zapros.chelovek_id) : null;
  return {
    telo: {
      materialy: vzjat(
        `SELECT * FROM materialy ${chelovek ? 'WHERE chelovek_id = ?' : ''}
         ORDER BY id DESC LIMIT 100`, ...(chelovek ? [chelovek] : [])),
      dokumenty: vzjat(
        `SELECT * FROM dokumenty ${chelovek ? 'WHERE chelovek_id = ?' : ''}
         ORDER BY id DESC LIMIT 100`, ...(chelovek ? [chelovek] : [])),
    },
  };
}

                                    
  
                                                                 
                                                               
                                                                  
                                                           
                                                      
function favicon({ metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`
    + `<rect width="32" height="32" rx="8" fill="#0a0a0b"/>`
    + `<path d="M10.2 6h4.7v15.3h7.7V26H10.2z" fill="#ffffff"/>`
    + `</svg>`;
  return { telo: { svg }, tip: 'image/svg+xml' };
}

module.exports = { plashki, podskazki, onbording, kasanija, oshibki,
                   vygruzka, zagruzka, zagotovka_zadachi, rassylka,
                   rassylka_soobshenija, zapisi, bazy_svodka, meta, fajly, favicon,
                   SHAGI_VHODA, otmetki };
