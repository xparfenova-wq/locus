                                                                    
                                            
  
                                                             
                                                            

const { baza, v_api, v_bazu, OshibkaVvoda, NeNajdeno , seichas } = require('../db/db.js');
const { segodnja, nomer_nedeli } = require('../db/db.js');
const { OTKRYTA, NE_UDALENA } = require('./podruchki.js');
                                                                    

const { granicy_nedeli, nedelja_iz_zaprosa, iso_nedelja, sdvinut_nedelju } = require('./kalendar.js');

                                                         
function vidit_dengi(db, ja) {
  return require('./dengi-dostup.js').vidit(db,ja);
}

                               
  
                                                                  
                                                             
function dengi({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const ja = Number(zapros.chelovek_id || avtor);
  if (!vidit_dengi(db, ja)) {
    return { telo: { skryto: true, prichina: 'у тебя доступ без денег' } };
  }

  const den = zapros.den || segodnja();
  const god = Number(zapros.god) || Number(den.slice(0, 4));
  const mesjac = zapros.mesjac || den.slice(0, 7);
  const napravlenie = zapros.napravlenie || null;

  const gde_napr = napravlenie ? 'AND p.napravlenie = ?' : '';
  const znach = napravlenie ? [napravlenie] : [];

                                                           
                                                               
  const prishlo = db.prepare(
    `SELECT coalesce(sum(pl.summa), 0) s FROM platezhi pl
     LEFT JOIN proekty p ON p.id = pl.proekt_id
     WHERE pl.oplachen_at IS NOT NULL
       AND substr(pl.oplachen_at, 1, 7) = ? ${gde_napr}`).get(mesjac, ...znach).s;

  const vystavleno = db.prepare(
    `SELECT coalesce(sum(pl.summa), 0) s FROM platezhi pl
     LEFT JOIN proekty p ON p.id = pl.proekt_id
     WHERE pl.vystavlen_at IS NOT NULL
       AND substr(pl.vystavlen_at, 1, 7) = ? ${gde_napr}`).get(mesjac, ...znach).s;

  const dolg = db.prepare(
    `SELECT coalesce(sum(pl.summa), 0) s FROM platezhi pl
     LEFT JOIN proekty p ON p.id = pl.proekt_id
     WHERE pl.vystavlen_at IS NOT NULL AND pl.oplachen_at IS NULL ${gde_napr}`)
    .get(...znach).s;

                                                        
  const po_napravlenijam = db.prepare(
    `SELECT p.napravlenie,
            coalesce(sum(CASE WHEN pl.oplachen_at IS NOT NULL
                         AND substr(pl.oplachen_at,1,7) = ? THEN pl.summa END), 0) prishlo,
            coalesce(sum(CASE WHEN pl.oplachen_at IS NULL
                         AND pl.vystavlen_at IS NOT NULL THEN pl.summa END), 0) dolg
     FROM platezhi pl JOIN proekty p ON p.id = pl.proekt_id
     GROUP BY p.napravlenie ORDER BY prishlo DESC`).all(mesjac).map(v_api);

                                                  
  const po_mesjacam = [];
  for (let m = 1; m <= 12; m++) {
    const kljuch = `${god}-${String(m).padStart(2, '0')}`;
    po_mesjacam.push({
      mesjac: kljuch,
      prishlo: db.prepare(
        `SELECT coalesce(sum(summa), 0) s FROM platezhi
         WHERE oplachen_at IS NOT NULL AND substr(oplachen_at, 1, 7) = ?`).get(kljuch).s,
      vystavleno: db.prepare(
        `SELECT coalesce(sum(summa), 0) s FROM platezhi
         WHERE vystavlen_at IS NOT NULL AND substr(vystavlen_at, 1, 7) = ?`).get(kljuch).s,
    });
  }

  const spisok = db.prepare(
    `SELECT pl.*, p.nazvanie proekt, p.napravlenie
     FROM platezhi pl LEFT JOIN proekty p ON p.id = pl.proekt_id
     WHERE (substr(coalesce(pl.oplachen_at, pl.vystavlen_at), 1, 7) = ?) ${gde_napr}
     ORDER BY coalesce(pl.oplachen_at, pl.vystavlen_at) DESC`)
    .all(mesjac, ...znach).map(v_api);

  return {
    telo: { skryto: false, mesjac, god, napravlenie,
            prishlo, vystavleno, dolg,
            po_napravlenijam, po_mesjacam, platezhi: spisok },
  };
}

                                                               
function dengi_prognoz({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  if (!vidit_dengi(db, Number(zapros.chelovek_id || avtor))) {
    return { telo: { skryto: true } };
  }
  const den = zapros.den || segodnja();

                                                                   
                                                          
  const vystavleno = db.prepare(
    `SELECT coalesce(sum(summa), 0) s FROM platezhi
     WHERE vystavlen_at IS NOT NULL AND oplachen_at IS NULL`).get().s;
  const v_rabote = db.prepare(
    `SELECT coalesce(sum(stoimost), 0) s FROM proekty
     WHERE status = 'idet' AND (arhiv IS NULL OR arhiv = 0)`).get().s;

  return {
    telo: {
      skryto: false, den,
      zhdem_oplaty: vystavleno,
      v_rabote,
      itogo: vystavleno + v_rabote,
      pojasnenie: 'выставленное и неоплаченное плюс стоимость проектов в работе',
    },
  };
}

                                               
function dengi_svodka({ zapros, avtor, metod }) {
  const polnoe = dengi({ zapros, avtor, metod });
  if (polnoe.telo.skryto) return polnoe;
  const { prishlo, vystavleno, dolg, mesjac } = polnoe.telo;
  return { telo: { skryto: false, mesjac, prishlo, vystavleno, dolg } };
}

                                      
  
                                                               
                                                           
function poleznoe({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const vkladka = zapros.vkladka || 'lenta';
  const predel = Math.min(parseInt(zapros.na_stranice, 10) || 40, 100);
                                                                 
                                                                 
                  
  const week = nedelja_iz_zaprosa(zapros, zapros.den || segodnja());
  const nedelja_grafika = week.nomer;

  const bezopasno = (zapros_sql, ...z) => {
    try { return db.prepare(zapros_sql).all(...z).map(v_api); }
    catch { return []; }                                                   
  };

                                                                   
                                                                 
                                                                     
                                                                    
                                                                 
    
                                                               
                                                              
                                            
  const lenta_po_tipu = (tip) => bezopasno(
    `SELECT * FROM lenta WHERE tip = ? ORDER BY sozdano DESC, id DESC LIMIT ?`,
    tip, predel);

  const vse = {
    lenta: bezopasno(
      `SELECT * FROM lenta ORDER BY sozdano DESC, id DESC LIMIT ?`, predel),
    refleksija: bezopasno("SELECT * FROM lenta WHERE tip='refleksija' AND sprint=? AND god_sprinta=? ORDER BY sozdano DESC,id DESC LIMIT ?",week.nomer,week.god,predel),
    principy: lenta_po_tipu('princip'),
                                                              
                                   
    komanda: bezopasno(
      `SELECT a.*, l.imja FROM anketa a LEFT JOIN ljudi l ON l.id = a.chelovek_id
       ORDER BY a.chelovek_id LIMIT ?`, predel),
    grafik: bezopasno(
      `SELECT g.*, l.imja FROM grafik g LEFT JOIN ljudi l ON l.id = g.chelovek_id
       WHERE g.nedelja = ? AND g.god = ? ORDER BY g.chelovek_id, g.den`,
      nedelja_grafika, week.god).map(row=>({...row,...require('./grafik-identity.js').row(db,row)})),
    grafik_konteksty:Object.fromEntries(db.prepare('SELECT id FROM ljudi WHERE komanda=1 OR id=?').all(avtor).map(row=>[row.id,require('./grafik-identity.js').owner(db,row.id)])),
    grafik_poslednie:Object.fromEntries(db.prepare('SELECT id FROM ljudi WHERE komanda=1 OR id=?').all(avtor).map(row=>[row.id,require('./otmena-grafika.js').lastFor(db,{chelovek_id:row.id,god:week.god,nedelja:week.nomer},avtor)])),
    nedelja_grafika, god_grafika: week.god,
    grafik_mozhno_pravit_chuzhoj: require('./prava-grafika.js').mozhet_chuzhoj(avtor),
    grafik_komanda: bezopasno(`SELECT id,imja,foto FROM ljudi WHERE komanda=1 AND COALESCE(arhiv,0)=0 ORDER BY imja,id`),
                                                                    
                                                              
    fokus: require('./fokus.js').todayRows(db,Number(avtor)),
    shablony: require('./shablony.js').list(db,avtor).spisok,
                                                                  
                                                                  
                                      
    povtory: require('./podruchki.js').PODRUCHKI_KODA.poleznoe.povtory({metod:'GET',avtor}).telo.spisok,
    zhurnal: bezopasno(
      `SELECT z.*, l.imja AS kto_imja FROM zhurnal z
         LEFT JOIN ljudi l ON l.id = z.kto
        ORDER BY z.kogda DESC, z.id DESC LIMIT ?`, predel),
    novoe: lenta_po_tipu('novoe'),
  };

  vse.refleksija_vsego=db.prepare("SELECT count(*) n FROM lenta WHERE tip='refleksija' AND sprint=? AND god_sprinta=?").get(week.nomer,week.god).n;
  vse.refleksija_esche=vse.refleksija_vsego>vse.refleksija.length;

                                                                 
                                                                 
                                      
  const PORJADOK = ['lenta', 'refleksija', 'principy', 'komanda', 'grafik',
                    'fokus', 'shablony', 'zhurnal', 'novoe'];
  const vkladki = PORJADOK.map((k) => ({ kod: k, skolko: (vse[k] || []).length }));
  if (zapros.vkladka && !PORJADOK.includes(vkladka)) {
    throw new OshibkaVvoda(`вкладка: одна из ${PORJADOK.join(', ')}`, 'vkladka');
  }
  return { telo: { vkladka, vkladki, ...vse } };
}

                                          
                                         
  
                                                                          
                                                              
                                                             
  
                                                                
                                                                
                                  
function fokus(ctx){return require('./fokus.js').handle(ctx);}

                                                                 
function kontekst({ zapros, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
                                                               
                                                                 
                                        
  let napravlenie = zapros.napravlenie;
  let iz_obekta = null;
  if (!napravlenie && zapros.ekran && zapros.id) {
    const TABLICY = { proekt: 'proekty', klient: 'ljudi',
                      zadacha: 'zadachi', rassylka: 'rassylki' };
    const t = TABLICY[zapros.ekran];
    if (t) {
      try {
        const kolonka = t === 'zadachi' ? 'nomer' : 'id';
        const r = db.prepare(
          `SELECT * FROM ${t} WHERE ${kolonka} = ?`).get(Number(zapros.id));
        if (r) {
          napravlenie = r.napravlenie;
                                                                
                                               
          iz_obekta = { klient_id: r.klient_id ?? null,
                        proekt_id: t === 'proekty' ? r.id : (r.proekt_id ?? null) };
        }
      } catch {                                                 }
    }
  }
  if (!napravlenie) throw new OshibkaVvoda('нужно направление', 'napravlenie');
  const napr = db.prepare('SELECT * FROM napravlenija WHERE kod = ?').get(napravlenie);
  if (!napr) throw new NeNajdeno(`направления ${napravlenie} нет`);

  const bezopasno = (s, ...z) => {
    try { return db.prepare(s).all(...z).map(v_api); } catch { return []; }
  };

  return {
    telo: {
      napravlenie: v_api(napr),
      ...(iz_obekta || {}),
      tezisy: bezopasno(
        'SELECT * FROM tezisy WHERE napravlenie = ? AND COALESCE(udaleno,0)=0 ORDER BY porjadok, id', napravlenie),
      uslugi: bezopasno(
        'SELECT * FROM uslugi WHERE napravlenie = ? ORDER BY id', napravlenie),
                                                                 
                                                                   
                                                                  
                                                     
      celi: (() => {
        try {
          const { okr } = require('./ekrany.js');
                                                                    
                                                  
                                                                  
          const otvet = okr({ zapros: {}, metod: 'GET' });
          const vse = otvet.telo || otvet;
          return (vse.celi || [])
            .filter((c) => c.napravlenie === napravlenie
              && (c.sostojanie === null || c.sostojanie === undefined
                  || c.sostojanie !== 'arhiv'));
        } catch {
                                                                       
                                                           
          return bezopasno(
            `SELECT * FROM celi WHERE napravlenie = ?
               AND (sostojanie IS NULL OR sostojanie <> 'arhiv') ORDER BY id DESC`,
            napravlenie);
        }
      })(),
      klientov: db.prepare(
        `SELECT count(DISTINCT s.chelovek_id) n FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id
         WHERE s.napravlenie = ? AND s.rol = 'klient'
           AND COALESCE(s.arhiv,0)=0 AND COALESCE(l.arhiv,0)=0`).get(napravlenie).n,
      zadach_otkrytyh: db.prepare(
        `SELECT count(*) n FROM zadachi
         WHERE napravlenie = ? AND ${OTKRYTA} AND ${NE_UDALENA}`).get(napravlenie).n,
    },
  };
}

                                                     
function strategija({ zapros, metod, avtor }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const uslovija = ['COALESCE(udaleno,0)=0'], znach = [];
  if (zapros.napravlenie) { uslovija.push('napravlenie = ?'); znach.push(zapros.napravlenie); }
  if(zapros.god!==undefined){uslovija.push('god=?');znach.push(require('./tezisy-model.js').year(zapros.god));}
  const gde = uslovija.length ? 'WHERE ' + uslovija.join(' AND ') : '';
  const tezisy = db.prepare(`SELECT * FROM tezisy ${gde} ORDER BY napravlenie, porjadok, id`)
    .all(...znach).map(v_api);

                                                                     
  const celi_tezisa = {};
  for (const t of tezisy) {
    celi_tezisa[t.id] = require('./strategija-celi.js').goals(db,t.id,avtor);
  }
  const gody=db.prepare('SELECT DISTINCT god FROM tezisy WHERE COALESCE(udaleno,0)=0'+(zapros.napravlenie?' AND napravlenie=?':'')+' ORDER BY god').all(...(zapros.napravlenie?[zapros.napravlenie]:[])).map(row=>row.god);
  return { telo: { tezisy: tezisy.map((t) => ({ ...t, celi: celi_tezisa[t.id] || [] })),mozhno_pravit:require('./prava-strategii.js').canEdit(db,avtor),gody } };
}

                                                                 
                                                                    
                                                                       
                                        
function strategija_tezisy({ kljuch, metod, avtor }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const id = Number(kljuch);
  if (!Number.isInteger(id)) {
    throw Object.assign(new Error('нужен id тезиса'), { kod: 400, pole: 'id' });
  }
  const t = db.prepare('SELECT * FROM tezisy WHERE id = ? AND COALESCE(udaleno,0)=0').get(id);
  if (!t) throw Object.assign(new Error(`тезиса ${id} нет`), { kod: 404 });
                                                                    
                                                                 
                                                             
  const celi = require('./strategija-celi.js').goals(db,id,avtor);
  return { telo: { ...v_api(t), celi } };
}

                                                            
                                                               
                                                       
function strategija_cel(ctx) { return require('./strategija-celi.js').create(ctx); }

                                          
  
                                                            
                                                  
function refleksija({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const ja = Number(zapros.chelovek_id || avtor);
  const den = zapros.den || segodnja();
  const week = nedelja_iz_zaprosa(zapros, den);
  const nedelja = week.nomer;
  const okno = week;

  const moi = Number.isInteger(ja) ? 'AND otvetstvennyj = ' + ja : '';
  const schet = (uslovie, ...z) => db.prepare(
    `SELECT count(*) n FROM zadachi WHERE sprint = ? AND god_sprinta = ? ${moi} AND ${NE_UDALENA}
     ${uslovie ? 'AND ' + uslovie : ''}`).get(nedelja, week.god, ...z).n;

  const zakryto = schet("status = 'sdelano'");
  const vsego = schet('');
  return {
    telo: {
      nedelja, ...okno,
      vsego, zakryto,
      otkryto: vsego - zakryto,
      pereneseno: 0,
      procent: vsego ? Math.round((zakryto / vsego) * 100) : 0,
      prosrocheno: schet(`srok IS NOT NULL AND srok < ? AND ${OTKRYTA}`, okno.konec),
      po_tipam: db.prepare(
        `SELECT tip, count(*) n, sum(CASE WHEN status = 'sdelano' THEN 1 ELSE 0 END) zakryto
         FROM zadachi WHERE sprint = ? AND god_sprinta = ? ${moi} AND ${NE_UDALENA} GROUP BY tip`)
        .all(nedelja, week.god).map(v_api),
      zapisi: db.prepare(
        `SELECT * FROM lenta WHERE tip = 'refleksija' AND sprint = ? AND god_sprinta = ?
         ORDER BY id DESC`).all(nedelja, week.god).map(v_api),
    },
  };
}

                                               
  
                                                                
                                                                  
                            
function insajty({ zapros, avtor, metod, uchityvat_otlozhennye=true }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const analyticSettings=require('./parametry-analitiki.js').values(db);
  const den = zapros.den || require('./nagruzka.js').den_v_zone(new Date().toISOString(),analyticSettings.chasovoj_pojas);
  const najdeno = [];
  const dnej_s = (data) => Math.floor((Date.parse(den) - Date.parse(data)) / 86400000);
                                                            
  const sk = (n, f1, f2, f5) => {
    const o = n % 10, s = n % 100;
    const f = o === 1 && s !== 11 ? f1 : o >= 2 && o <= 4 && (s < 12 || s > 14) ? f2 : f5;
    return `${n} ${f}`;
  };
                                                                      
                                                             
  const dobavit = (gruppa, povod, prichina, adres, napravlenie, context={}) => najdeno.push({
    kljuch:require('./insajty-otlozhit.js').identity(povod,napravlenie,context.istochnik_kljucha??adres),
    gruppa, povod, prichina, tip: povod, tekst: prichina, adres, napravlenie,
    ...Object.fromEntries(Object.entries(context).filter(([key])=>key!=='istochnik_kljucha')),
  });
                                                                 
                                                                    
  const bezopasno = (fn) => {
    try { fn(); } catch (e) { if (process.env.LOCUS_OTLADKA) console.error('инсайт:', e.message); }
  };
                                                                     
                              
  const OTK_Z = "z.status NOT IN ('sdelano', 'kogda_nibud')";
  const ZHIVAJA_Z = '(z.udaleno IS NULL OR z.udaleno = 0)';

                 
                                                        
  bezopasno(() => db.prepare(
    `SELECT z.nomer, z.nazvanie, z.napravlenie, count(*) n
       FROM zhurnal j JOIN zadachi z ON z.id = j.obekt_id
      WHERE j.obekt = 'zadacha' AND j.pole = 'srok' AND j.bylo IS NOT NULL
        AND ${OTK_Z} AND ${ZHIVAJA_Z}
      GROUP BY z.id HAVING n >= 3 `).all().forEach((z) =>
    dobavit('zadachi', 'perenesena_tretij_raz',
      `«${z.nazvanie}» переносили ${sk(z.n, 'раз', 'раза', 'раз')}`,
      `/zadachi.html?nomer=${z.nomer}`, z.napravlenie)));

                                               
  bezopasno(() => db.prepare(
    `SELECT z.nomer, z.nazvanie, z.napravlenie, z.sozdano FROM zadachi z
      WHERE ${OTKRYTA} AND ${NE_UDALENA}
        AND julianday(?) - julianday(z.sozdano) > 21
        AND NOT EXISTS (SELECT 1 FROM zadachi p WHERE p.roditel_id = z.id)
      ORDER BY z.sozdano `).all(den).forEach((z) =>
    dobavit('zadachi', 'visit_bez_podzadach',
      `«${z.nazvanie}» висит ${sk(dnej_s(z.sozdano), 'день', 'дня', 'дней')} и не разбита на шаги`,
      `/zadachi.html?nomer=${z.nomer}`, z.napravlenie)));

                                                                            
  bezopasno(() => {
    for(const r of require('./nagruzka.js').zakryto_po_napravlenijam(db,{den})){
      if(r.mediana!=null&&r.seichas>r.mediana*r.koefficient){
        dobavit('zadachi','zakryto_bolshe_obychnogo',
          `закрыто ${r.seichas} при обычных ${r.mediana} за неделю`,
          `/zadachi.html?napravlenie=${encodeURIComponent(r.napravlenie)}&status=sdelano`,r.napravlenie);
      }
    }
  });

               
  bezopasno(() => {
    const ljudi = db.prepare(
      `SELECT l.id, l.imja,
              sum(CASE WHEN ${OTK_Z} THEN 1 ELSE 0 END) otkryto,
              -- Дата закрытия живёт в журнале статусов: поле data у задач пустое
              sum(CASE WHEN EXISTS (SELECT 1 FROM zhurnal j
                        WHERE j.obekt = 'zadacha' AND j.obekt_id = z.id
                          AND j.pole = 'status' AND j.stalo = 'sdelano'
                          AND julianday(?) - julianday(j.kogda) <= 7)
                       THEN 1 ELSE 0 END) zakryto_nedelja,
              sum(CASE WHEN ${OTK_Z}
                        AND z.srok IS NOT NULL AND z.srok < ? THEN 1 ELSE 0 END) prosrocheno
         FROM ljudi l JOIN zadachi z ON z.otvetstvennyj = l.id
        WHERE ${ZHIVAJA_Z}
        GROUP BY l.id`).all(den, den);
    const loads=new Map(require('./nagruzka.js').nagruzka(db,{den})
      .map(l=>[l.id,l]));
    for (const l of ljudi) {
      const load=loads.get(l.id);
      if(load?.peregruz){
        dobavit('ljudi','peregruz',
          `${l.imja}: на неделе ${load.otkryto} задач, обычно закрывает ${load.mediana}`,
          `/zadachi.html?otvetstvennyj=${l.id}`,null);
      }
      if (l.otkryto > 0 && l.zakryto_nedelja === 0) {
        dobavit('ljudi', 'net_zakrytyh_za_nedelju',
          `${l.imja}: за неделю ни одной закрытой, открытых ${l.otkryto}`,
          `/zadachi.html?otvetstvennyj=${l.id}`, null);
      }
      if (l.prosrocheno >= 3) {
        dobavit('ljudi', 'prosrochki',
          `${l.imja}: просрочено ${sk(l.prosrocheno, 'задача', 'задачи', 'задач')}`,
          `/zadachi.html?otvetstvennyj=${l.id}&prosrochennye=1`, null);
      }
    }
  });

                  
                                                                
  bezopasno(() => db.prepare(
    `SELECT s.id, s.chelovek_id, l.imja, s.napravlenie,
            coalesce(n.norma_dnej, ?) norma, s.poslednee_obshenie
     FROM sotrudnichestva s
     JOIN ljudi l ON l.id = s.chelovek_id
     LEFT JOIN napravlenija n ON n.kod = s.napravlenie
     WHERE s.rol = 'klient' AND (s.arhiv IS NULL OR s.arhiv = 0)
       AND (s.stadija IS NULL OR s.stadija <> 'pauza')
       AND s.poslednee_obshenie IS NOT NULL
       AND julianday(?) - julianday(s.poslednee_obshenie) > coalesce(n.norma_dnej, ?)
     `).all(analyticSettings.dnej_bez_obschenija_porog,den,analyticSettings.dnej_bez_obschenija_porog).forEach((s) =>
    dobavit('klienty', 'davno_ne_obschalis',
      `${s.imja}: ${sk(dnej_s(s.poslednee_obshenie), 'день', 'дня', 'дней')} без общения при норме ${s.norma}`,
      `/klient.html?id=${s.chelovek_id}`, s.napravlenie,{istochnik_kljucha:['sotrudnichestvo',s.id]})));

                                                                    
  bezopasno(() => db.prepare(
    `SELECT p.id, p.nazvanie, p.napravlenie FROM proekty p
      WHERE (p.arhiv IS NULL OR p.arhiv = 0)
        AND coalesce(p.status, '') NOT IN ('zavershen', 'zakryt')
        AND EXISTS (SELECT 1 FROM zadachi z WHERE z.proekt_id = p.id
                     AND ${OTK_Z} AND ${ZHIVAJA_Z})
        AND NOT EXISTS (SELECT 1 FROM zhurnal j JOIN zadachi z ON z.id = j.obekt_id
                         WHERE j.obekt = 'zadacha' AND j.pole = 'status'
                           AND j.stalo = 'sdelano' AND z.proekt_id = p.id
                           AND julianday(?) - julianday(j.kogda) <= 21)
      `).all(den).forEach((p) =>
    dobavit('klienty', 'proekt_bez_zakrytyh',
      `в проекте «${p.nazvanie}» три недели не закрыто ни одной задачи`,
      `/proekt.html?id=${p.id}`, p.napravlenie)));

                                                         
  bezopasno(() => db.prepare(
    `SELECT pl.id, pl.summa, pl.vystavlen_at, p.id proekt, p.nazvanie, p.napravlenie
       FROM platezhi pl JOIN proekty p ON p.id = pl.proekt_id
      WHERE pl.oplachen_at IS NULL AND pl.vystavlen_at IS NOT NULL
        AND julianday(?) - julianday(pl.vystavlen_at) > 14
      `).all(den).forEach((pl) =>
    dobavit('klienty', 'platezh_zhdem',
      `оплату ${Number(pl.summa || 0).toLocaleString('ru-RU')} ₽ по «${pl.nazvanie}» `
        + `ждём ${sk(dnej_s(pl.vystavlen_at), 'день', 'дня', 'дней')}`,
      `/proekt.html?id=${pl.proekt}`, pl.napravlenie,{finansovyj_insajt:true,istochnik_kljucha:['platezh',pl.id]})));

               
                                                                   
                                                             
  bezopasno(() => {
    const { okr } = require('./ekrany.js');
    const otvet = okr({ zapros: {}, metod: 'GET' });
    const celi = ((otvet.telo || otvet).celi || [])
      .filter((c) => c.sostojanie !== 'arhiv');
    for (const c of celi) {
      if (c.status_celi === 'pod_ugrozoj') {
        dobavit('celi', 'cel_pod_ugrozoj',
          `«${c.nazvanie}» на ${c.procent}% при ожидаемых ${c.ozhidaemyj_procent}%`,
          `/okr.html?cel=${c.id}`, c.napravlenie,{insajt_okr:true,cel_id:c.id});
      }
      const zadach = db.prepare(
        `SELECT count(*) n FROM zadachi WHERE ${require('./okr-svjazi.js').goalKey()} = ? AND ${NE_UDALENA}`).get(c.id).n;
      if (!zadach) {
        dobavit('celi', 'cel_bez_zadach',
          `у цели «${c.nazvanie}» нет ни одной задачи`,
          `/okr.html?cel=${c.id}`, c.napravlenie,{insajt_okr:true,cel_id:c.id});
      }
    }
  });

                             
  bezopasno(() => db.prepare(
    `SELECT r.id, r.cel_id, r.nazvanie, c.nazvanie cel, c.napravlenie,
            (SELECT max(data) FROM zamery WHERE rezultat_id = r.id) poslednij
     FROM rezultaty r JOIN celi c ON c.id = r.cel_id
     WHERE (r.tip IS NULL OR r.tip <> 'veha') AND COALESCE(r.istochnik,'ruchnoj_zamer')='ruchnoj_zamer'`).all().forEach((r) => {
    if (!r.poslednij) return;
    const dnej = dnej_s(r.poslednij);
    if (dnej > 14) {
      dobavit('celi', 'zamer_ustarel',
        `«${r.nazvanie}» не замеряли ${sk(dnej, 'день', 'дня', 'дней')}`, '/okr.html', r.napravlenie,{insajt_okr:true,cel_id:r.cel_id,rezultat_id:r.id,istochnik_kljucha:['rezultat',r.id]});
    }
  }));

  const napravlenie = zapros.napravlenie;
  const otobrannye = napravlenie
    ? najdeno.filter((n) => n.napravlenie === napravlenie) : najdeno;
  const rows=uchityvat_otlozhennye?require('./insajty-otlozhit.js').visible(db,avtor,otobrannye):otobrannye;
  return { telo: { den, insajty: rows, vsego: rows.length } };
}


                                                        
  
                                                                   
                                                                    
                                                                 
                                                      
  
                                                                          
                                                    
                                                                     
function sostojanija({ zapros, telo, avtor, metod }) {
  const db = baza();
  const ja = Number(zapros.chelovek_id || avtor);
  const den = zapros.den || segodnja();

  if (metod === 'POST') {
                                                                   
                                                                  
                                         
    const chislo = (v) => (v === undefined ? undefined
      : v === null || v === '' ? null : Number(v));
    const n = chislo((telo || {}).nastroenie);
    const r = chislo((telo || {}).resurs);
    if (n !== undefined && n !== null
      && (!Number.isInteger(n) || n < 1 || n > 5)) {
      throw new OshibkaVvoda(`настроение это целое от 1 до 5, пришло «${n}»`);
    }
    if (r !== undefined && r !== null
      && (!Number.isInteger(r) || r < 0 || r > 100)) {
      throw new OshibkaVvoda(`энергия это процент от 0 до 100, пришло «${r}»`);
    }
    const zametka = ((telo || {}).zametka || '').trim() || null;
    if (zametka && zametka.length > 140) {
      throw new OshibkaVvoda(`заметка до 140 знаков, пришло ${zametka.length}`);
    }
                                                                   
    db.prepare(
      `INSERT INTO sostojanija (chelovek_id, den, nastroenie, resurs, zametka, sozdano)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (chelovek_id, den) DO UPDATE SET
         nastroenie = CASE WHEN ? THEN excluded.nastroenie ELSE nastroenie END,
         resurs = CASE WHEN ? THEN excluded.resurs ELSE resurs END,
         zametka = CASE WHEN ? THEN excluded.zametka ELSE zametka END,
         versija = versija + 1`)
      .run(ja, den,
           n === undefined ? null : n,
           r === undefined ? null : r,
           zametka, seichas(),
           n !== undefined ? 1 : 0,
           r !== undefined ? 1 : 0,
           (telo || {}).zametka !== undefined ? 1 : 0);
    return { kod: 200,
             telo: v_api(db.prepare(
               'SELECT * FROM sostojanija WHERE chelovek_id = ? AND den = ?')
               .get(ja, den)) };
  }

  if (metod !== 'GET') throw Object.assign(new Error('сюда GET или POST'), { kod: 405 });

  return sostojanija_moe({ zapros, avtor, metod });
}

                                                    
function sostojanija_komanda({ zapros, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const den = zapros.den || segodnja();
                                                            
                                                               
                                                                      
  if (zapros.s && zapros.po) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(zapros.s) || !/^\d{4}-\d{2}-\d{2}$/.test(zapros.po)) {
      throw new OshibkaVvoda('s и po в виде ГГГГ-ММ-ДД', 's');
    }
    const stroki = db.prepare(
      `SELECT s.chelovek_id, l.imja, s.den, s.nastroenie, s.resurs
         FROM sostojanija s JOIN ljudi l ON l.id = s.chelovek_id
        WHERE s.den BETWEEN ? AND ?
        ORDER BY s.den DESC`).all(zapros.s, zapros.po).map(v_api);
    const po_ljudjam = new Map();
    for (const r of stroki) if (!po_ljudjam.has(r.chelovek_id)) po_ljudjam.set(r.chelovek_id, r);
    return { telo: { s: zapros.s, po: zapros.po, spisok: [...po_ljudjam.values()] } };
  }
  {
                                                         
                                                      
    const spisok = db.prepare(
      `SELECT l.id chelovek_id, l.imja, l.foto, l.cvet,
              s.nastroenie, s.resurs, s.zametka
         FROM ljudi l
         LEFT JOIN sostojanija s ON s.chelovek_id = l.id AND s.den = ?
        WHERE l.komanda = 1 AND (l.arhiv IS NULL OR l.arhiv = 0)
        ORDER BY l.imja`).all(den).map(v_api);
    const otmetilis = spisok.filter((x) => x.nastroenie || x.resurs);
    const srednee = (pole) => {
      const est = otmetilis.map((x) => x[pole]).filter(Boolean);
      return est.length ? Math.round((est.reduce((a, b) => a + b, 0) / est.length) * 10) / 10 : null;
    };
    return { telo: { den, spisok,
                     otmetilis: otmetilis.length, vsego: spisok.length,
                     srednee_nastroenie: srednee('nastroenie'),
                     srednij_resurs: srednee('resurs') } };
  }
}

                                                                      
function sostojanija_moe({ zapros, avtor, metod }) {
  if (metod !== 'GET') throw Object.assign(new Error('сюда только GET'), { kod: 405 });
  const db = baza();
  const ja = Number(zapros.chelovek_id || avtor);
  const den = zapros.den || segodnja();

  const nazad = new Date(den + 'T00:00:00');
  nazad.setDate(nazad.getDate() - 13);
  return {
    telo: {
      den,
      segodnja: v_api(db.prepare(
        'SELECT * FROM sostojanija WHERE chelovek_id = ? AND den = ?')
        .get(ja, den)) || null,
      istorija: db.prepare(
        `SELECT * FROM sostojanija WHERE chelovek_id = ? AND den >= ? AND den <= ?
          ORDER BY den`).all(ja, nazad.toISOString().slice(0, 10), den).map(v_api),
    },
  };
}

module.exports = { dengi, dengi_prognoz, dengi_svodka, poleznoe, fokus,
                   kontekst, strategija, strategija_tezisy, strategija_cel,
                   refleksija, insajty, sostojanija,
                   sostojanija_moe, sostojanija_komanda };
