                                                               
                                     
  
                                                                 
                                                               

const { baza, v_api, v_bazu, OshibkaVvoda, NeNajdeno,
        v_odnoj_tranzakcii , seichas, segodnja, nomer_nedeli } = require('../db/db.js');

function tolko(metod, nado) {
  if (metod !== nado) {
    throw Object.assign(new Error(`сюда только ${nado}`), { kod: 405 });
  }
}
const OTKRYTA_Z = "status <> 'sdelano' AND status <> 'kogda_nibud'";
const NE_UDAL = '(udaleno IS NULL OR udaleno = 0)';

              
  
                                                                
                                                                    
                                               

function okr_celi(ctx) {
  if (ctx.metod === 'GET') {
    const periody = baza().prepare("SELECT * FROM periody WHERE tip='kvartal' ORDER BY id").all().map(v_api);
    return { telo: { ...require('./ekrany.js').okr(ctx).telo, periody } };
  }
  tolko(ctx.metod, 'POST');
  const { sozdat } = require('./obschij.js');
  return { kod: 201, telo: sozdat('celi', require('./opisanija.js').OPISANIJA.celi, ctx.telo, ctx.avtor) };
}

function okr_rezultaty(ctx) {
  if (ctx.metod === 'GET' && ctx.kljuch) return okr_rezultat(ctx);
  const { spisok, sozdat } = require('./obschij.js');
  const description = require('./opisanija.js').OPISANIJA.rezultaty;
  if (ctx.metod === 'GET') return { telo: spisok('rezultaty', description, ctx.zapros, ctx.avtor) };
  tolko(ctx.metod, 'POST');
  return { kod: 201, telo: sozdat('rezultaty', description, ctx.telo, ctx.avtor) };
}

                                                  
  
                                                                     
                                                                        
                                                                   
                           
  
                                                                  
                                                                    
                                                                        
                                                                 
                                                

                                                                        
                                                              
                                                              
                                                                     
                                                                   
                                 
function metrika_akkaunta(db,akkaunt_id,metrika,den){
  return require('./metriki-akkaunta.js').vse(db,akkaunt_id,den).metriki[metrika]||{znachenie:null,obnovleno:null};
}

                                                                        
                                                                  
                                                                       
                                                                     
  
                                                                    
                                                                
                                                                         
                                                             
                                         
function okr_rezultat(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const id = Number(ctx.kljuch);
  if (!Number.isInteger(id)) throw new OshibkaVvoda('нужен id результата', 'id');
  const rez = db.prepare('SELECT * FROM rezultaty WHERE id = ?').get(id);
  if (!rez) throw new NeNajdeno(`результата ${id} нет`);

  const snapshot=require('./srez-okr.js').fakt(db,rez,ctx.zapros.den);
  const posl=snapshot.poslednij_zamer;
  const tekuschee=snapshot.fakt,obnovleno=snapshot.obnovleno;

                                                                      
                                                                         
                                                                    
                                            
                                                                      
                                                                        
                                                                 
                                                
  const baza_zadana = rez.baza !== null && rez.baza !== undefined;
  let progress_pct = require('./progress-okr.js').result(rez,tekuschee);
  return {
    telo: {
      ...v_api(rez),
      na_datu:snapshot.na_datu,
      polnota_publikacij:snapshot.polnota_publikacij,
        pochemu_net_fakta:snapshot.pochemu,
      istochnik_fakta:snapshot.istochnik_fakta,
      tekuschee_znachenie: tekuschee,
      polnota_dannyh: rez.istochnik==='formula'
        ? require('./pervaja-rol.js').polnota_formuly(db,rez.formula,
          db.prepare('SELECT napravlenie FROM celi WHERE id=?').get(rez.cel_id)?.napravlenie) : null,
                                                                         
      tekushchee: tekuschee,
      fakt: tekuschee,
      progress_pct,
      baza_ne_zadana: rez.tip!=='veha'&&!baza_zadana,
      obnovleno,
      kto: posl ? posl.kto : null,
      kto_imja: posl ? posl.kto_imja : null,
      otkuda: posl ? posl.otkuda : null,
      zamerov: db.prepare('SELECT count(*) n FROM zamery WHERE rezultat_id = ? AND data<=?')
        .get(id,snapshot.na_datu).n,
    },
  };
}

function okr_zamery(ctx) {
  const { spisok, sozdat } = require('./obschij.js');
  const description = require('./opisanija.js').OPISANIJA.zamery;
  if (ctx.metod === 'GET') return { telo: spisok('zamery', description, ctx.zapros, ctx.avtor) };
  tolko(ctx.metod, 'POST');
  return { kod: 201, telo: sozdat('zamery', description, ctx.telo, ctx.avtor) };
}

                                                                
                                                       
                                                         
  
                                                                
                                                                
                                      
function kljuch_perioda(s) {
  const t = String(s || '').trim();
  const m = t.match(/^(\d{4})-?[Qq](\d)$/);
  if (m) return `${m[1]}-Q${m[2]}`;
  return t;
}

                                                                   
                                                                   
                                                    
                                                               
                                                                    
                                                                  
                                      
function okr_periody(ctx) {
  const { metod } = ctx;
  const db = baza();
  tolko(metod, 'GET');
  return { telo: { spisok: db.prepare(
    'SELECT * FROM periody ORDER BY tip, id').all().map(v_api) } };
}

function okr_zakryt(ctx) {
  const { metod, kljuch, avtor } = ctx;
  const db = baza();
  tolko(metod, 'POST');

                                                                        
                                 
  const { v_zhurnal } = require('./obschij.js');

  const id = kljuch_perioda(kljuch);
  const period = db.prepare('SELECT * FROM periody WHERE id = ?').get(id);
  if (!period) throw new NeNajdeno(`периода ${kljuch} нет`);

  {
    const celi = db.prepare(
      `SELECT * FROM celi WHERE period_id = ?
         AND (sostojanie IS NULL OR sostojanie <> 'arhiv')`).all(id);

                                                                
                                                     
    const svodka = { celej: celi.length, dostignuto: 0, nedostignuto: 0,
                     rezultatov: 0, perenesti: [] };
    for (const c of celi) {
      const rez = db.prepare('SELECT * FROM rezultaty WHERE cel_id = ?').all(c.id);
      svodka.rezultatov += rez.length;
      for (const r of rez) {
        const chislo = require('./ekrany.js').fakt_rezultata(db, r);
        const dostig = r.plan !== null && chislo >= Number(r.plan);
        if (dostig) svodka.dostignuto += 1;
        else {
          svodka.nedostignuto += 1;
                                                                       
                                                        
          svodka.perenesti.push({ rezultat_id: r.id, cel_id: c.id,
                                  nazvanie: r.nazvanie, fakt: chislo, plan: r.plan });
        }
      }
    }

    if (period.zakryt) {
                                                                   
                                                                         
      if (Number(period.zakryl) !== Number(avtor)) {
        throw Object.assign(new Error('открыть период может только тот, кто закрывал'),
                            { kod: 403 });
      }
      const dnej = db.prepare(
        "SELECT julianday('now') - julianday(?) d").get(period.zakryt_kogda).d;
      if (dnej > 7) {
        throw Object.assign(new Error('период закрыт больше недели назад, он уже итог'),
                            { kod: 409 });
      }
      db.prepare(
        'UPDATE periody SET zakryt = 0, zakryl = NULL, zakryt_kogda = NULL WHERE id = ?')
        .run(id);
      v_zhurnal(db, 'periody', id, 'zakryt', 'да', 'нет', avtor);
      return { telo: { period: id, zakryt: false, svodka } };
    }

                                                                         
                                                                    
                                                                
                                                                     
                                                            
    const vybrano = Array.isArray((ctx.telo || {}).perenesti)
      ? ctx.telo.perenesti.map(Number).filter(Number.isInteger) : [];
    const perenos = { celej: 0, rezultatov: 0, period: null };
    if (vybrano.length) {
      const sled = db.prepare(
        'SELECT id FROM periody WHERE tip = ? AND nachalo > ? ORDER BY nachalo LIMIT 1')
        .get(period.tip, period.konec);
      if (!sled) {
        throw Object.assign(new Error('следующего периода нет в справочнике'),
                            { kod: 422 });
      }
      perenos.period = sled.id;
      const dopustimye = new Map(svodka.perenesti.map((x) => [x.rezultat_id, x]));
      const po_celjam = new Map();
      for (const rid of vybrano) {
        const x = dopustimye.get(rid);
        if (!x) continue;
        if (!po_celjam.has(x.cel_id)) po_celjam.set(x.cel_id, []);
        po_celjam.get(x.cel_id).push(rid);
      }
      v_odnoj_tranzakcii(db, () => {
        for (const [cel_id, rez_ids] of po_celjam) {
          const c = db.prepare('SELECT * FROM celi WHERE id = ?').get(cel_id);
          const nc = db.prepare(
            `INSERT INTO celi (nazvanie, opisanie, napravlenie, period_id,
                               sostojanie, tezis_id, sozdano, versija)
             VALUES (?, ?, ?, ?, 'aktivna', ?, ?, 1)`)
            .run(c.nazvanie, c.opisanie, c.napravlenie, sled.id,
                 c.tezis_id, seichas());
          perenos.celej += 1;
          for (const rid of rez_ids) {
            const r = db.prepare('SELECT * FROM rezultaty WHERE id = ?').get(rid);
            const svod = dopustimye.get(rid);
            db.prepare(
              `INSERT INTO rezultaty (cel_id, nazvanie, tip, baza, plan,
                 kto_otvechaet, schitat_lidov, istochnik, formula, akkaunt_id,
                 metrika, zakryta, versija, baza_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`)
              .run(Number(nc.lastInsertRowid), r.nazvanie, r.tip, svod.fakt,
                   r.plan, r.kto_otvechaet, r.schitat_lidov??(require('./istochnik-rezultata.js').FORMULY_LIDOV.has(r.formula)?'tolko_novye':null), r.istochnik,
                   r.formula, r.akkaunt_id, r.metrika, r.baza_id);
            perenos.rezultatov += 1;
          }
          v_zhurnal(db, 'celi', Number(db.prepare('SELECT max(id) m FROM celi').get().m),
                    'pereneseno_iz', String(cel_id), sled.id, avtor);
        }
      });
    }

    db.prepare('UPDATE periody SET zakryt = 1, zakryl = ?, zakryt_kogda = ? WHERE id = ?')
      .run(Number(avtor) || null, segodnja(), id);
    v_zhurnal(db, 'periody', id, 'zakryt', 'нет', 'да', avtor);
    return { telo: { period: id, zakryt: true, svodka, perenos } };
  }
}

                                                                     
function celi_dekompozicija(ctx) {
  tolko(ctx.metod, 'POST');
  const db = baza();
  const cel_id = Number(ctx.kljuch || (ctx.telo && ctx.telo.cel_id));
  if (!Number.isInteger(cel_id)) throw new OshibkaVvoda('нужен id цели', 'cel_id');
  const cel = db.prepare('SELECT * FROM celi WHERE id = ?').get(cel_id);
  if (!cel) throw new NeNajdeno(`цели ${cel_id} нет`);
  proverit_otkrytuju_cel(db, cel);

  const zadachi = Array.isArray(ctx.telo.zadachi) ? ctx.telo.zadachi : [];
  if (!zadachi.length) throw new OshibkaVvoda('нужен массив zadachi', 'zadachi');

  const { sozdat } = require('./obschij.js');
  const description = require('./opisanija.js').OPISANIJA.zadachi;
                                                                            
                                                                       
  const sozdannye = v_odnoj_tranzakcii(db, () => zadachi.map((z) => {
    if (!z || typeof z !== 'object' || Array.isArray(z)) {
      throw new OshibkaVvoda('Каждая задача должна содержать поля', 'zadachi');
    }
    for (const field of ['napravlenie', 'cel_id', 'roditel_id']) {
      if (Object.hasOwn(z, field)) throw new OshibkaVvoda('Связь задачи задаётся выбранной целью', field);
    }
    return sozdat('zadachi', description, {
      tip: 'produktovaja', otvetstvennyj: ctx.avtor,
      ...z, napravlenie: cel.napravlenie, cel_id,
    }, ctx.avtor);
  }));
  return { kod: 201, telo: { sozdano: sozdannye.length, zadachi: sozdannye } };
}

function proverit_otkrytuju_cel(db, cel) {
  const { Konflikt } = require('../db/db.js');
  if (cel.sostojanie === 'arhiv') throw new Konflikt('Цель в архиве. Сначала верни её в работу');
  if (db.prepare('SELECT zakryt FROM periody WHERE id=?').get(String(cel.period_id))?.zakryt) {
    throw new Konflikt('Период закрыт. Цель доступна только для чтения');
  }
}

                                                                   
                        
  
                                                                 
                                                                   
                                                                    
                                                               
                                                                 
                                                                   
                                              
  
                                                                  
                                                                 
                                                                 

                                                                        
                                                              
  
                                                                    
                                                                   
                                                           
function celi_po_kvartalam(ctx) {
  const db = baza();
  const cel_id = Number(ctx.kljuch);
  if (!Number.isInteger(cel_id)) throw new OshibkaVvoda('нужен id цели', 'cel_id');
  const cel = db.prepare('SELECT * FROM celi WHERE id = ?').get(cel_id);
  if (!cel) throw new NeNajdeno(`цели ${cel_id} нет`);
  const god = /^\d{4}$/.test(String(cel.period_id || '')) ? cel.period_id : null;
  if (!god) {
    throw new OshibkaVvoda('по кварталам разбивается годовая цель', 'period_id');
  }
  const kvartaly = [1, 2, 3, 4].map((n) => `${god}-Q${n}`);
  const rezultaty = db.prepare(
    'SELECT * FROM rezultaty WHERE cel_id = ? ORDER BY id').all(cel_id);
  const decimal = require('../public/js/decimal-plan.js');
  const put_goda = row => Math.max(0, Number(decimal.subtract(row.plan || 0, row.baza || 0)));

  if (ctx.metod === 'GET') {
                                                                 
                                                     
    const predlozhenie = rezultaty.filter((r) => r.tip !== 'veha').map((r) => {
      const put = put_goda(r);
      const rovno = Math.floor(put / 4);
      return { rezultat_id: r.id, nazvanie: r.nazvanie,
               plan: r.plan || 0, baza: r.baza || 0, put,
               po_kvartalam: [Number(decimal.subtract(put, rovno * 3)), rovno, rovno, rovno] };
    });
    const uzhe = db.prepare(
      `SELECT period_id, count(*) k FROM celi
        WHERE nazvanie = ? AND napravlenie IS ? AND period_id IN (?,?,?,?)
        GROUP BY period_id`)
      .all(cel.nazvanie, cel.napravlenie, ...kvartaly);
    return { telo: { cel_id, god, kvartaly, rezultaty: predlozhenie,
                     uzhe_est: uzhe.map((r) => r.period_id) } };
  }

  tolko(ctx.metod, 'POST');
  proverit_otkrytuju_cel(db, cel);
                                                                   
                                              
  const telo = ctx.telo || {};
  for (const field of Object.keys(telo)) {
    if (field !== 'stroki') throw new OshibkaVvoda('Неизвестное поле разбиения', field);
  }
  if (Object.hasOwn(telo, 'stroki') && (!Array.isArray(telo.stroki) || !telo.stroki.length)) {
    throw new OshibkaVvoda('Укажи строки числовых результатов', 'stroki');
  }
  const stroki = Object.hasOwn(telo, 'stroki') ? telo.stroki
    : rezultaty.filter((r) => r.tip !== 'veha').map((r) => {
        const put = put_goda(r);
        const rovno = Math.floor(put / 4);
        return { rezultat_id: r.id,
                 po_kvartalam: [Number(decimal.subtract(put, rovno * 3)), rovno, rovno, rovno] };
      });
  const allowed = new Set(rezultaty.filter(r => r.tip !== 'veha').map(r => r.id));
  const po_rez = new Map();
  for (const row of stroki) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).some(field => !['rezultat_id', 'po_kvartalam'].includes(field))) {
      throw new OshibkaVvoda('Проверь поля числового результата', 'stroki');
    }
    const id = require('./okr-svjazi.js').id(row.rezultat_id, 'rezultat_id');
    if (!allowed.has(id) || po_rez.has(id)) throw new OshibkaVvoda('Выбери каждый результат этой цели не больше одного раза', 'rezultat_id');
    if (!Array.isArray(row.po_kvartalam) || row.po_kvartalam.length !== 4) {
      throw new OshibkaVvoda('Укажи план для каждого из четырёх кварталов', 'po_kvartalam');
    }
    const values = row.po_kvartalam.map(value => {
      const number = require('./ruchnoj-zamer.js').number(value);
      if (number < 0) throw new OshibkaVvoda('План квартала не может быть отрицательным', 'po_kvartalam');
      return number;
    });
    po_rez.set(id, values);
  }

  const { sozdat } = require('./obschij.js');
  const { OPISANIJA } = require('./opisanija.js');
  const sozdannye = [];
  v_odnoj_tranzakcii(db, () => kvartaly.forEach((period, i) => {
    const svoi = rezultaty.filter((r) => r.tip !== 'veha'
      && (po_rez.get(r.id) || [])[i] > 0);
    if (!svoi.length) return;
                                                              
                                                    
    const novaja = sozdat('celi', OPISANIJA.celi, {
      nazvanie: cel.nazvanie,
      ...(cel.opisanie ? { opisanie: cel.opisanie } : {}),
      ...(cel.napravlenie ? { napravlenie: cel.napravlenie } : {}),
      ...(cel.tezis_id ? { tezis_id: cel.tezis_id } : {}),
      period_id: period,
      sostojanie: cel.sostojanie === 'aktivna' ? 'aktivna' : 'chernovik',
    }, ctx.avtor);
    for (const r of svoi) {
      sozdat('rezultaty', OPISANIJA.rezultaty, {
        cel_id: novaja.id,
        nazvanie: r.nazvanie,
        baza: 0,
        plan: (po_rez.get(r.id) || [])[i],
        ...(r.istochnik ? { istochnik: r.istochnik } : {}),
        ...(r.formula ? { formula: r.formula } : {}),
        ...(r.schitat_lidov ? { schitat_lidov: r.schitat_lidov } : {}),
        ...(r.metrika ? { metrika: r.metrika } : {}),
        ...(r.akkaunt_id ? { akkaunt_id: r.akkaunt_id } : {}),
        ...(r.baza_id ? { baza_id: r.baza_id } : {}),
      }, ctx.avtor);
    }
    sozdannye.push({ period, cel_id: novaja.id, rezultatov: svoi.length });
  }));
  const sverka = rezultaty.filter(r => po_rez.has(r.id)).map(r => {
    const plan = put_goda(r), summa = decimal.sum(po_rez.get(r.id));
    return { rezultat_id: r.id, plan, summa: Number(summa), raznica: Number(decimal.subtract(plan, summa)) };
  });
  return { kod: 201, telo: { iz_celi: cel_id, sozdano: sozdannye.length,
                             kvartaly: sozdannye, sverka,
                             ...(sverka.length === 1 ? { raznica: sverka[0].raznica } : {}) } };
}

function rezultaty_proverit_formulu(ctx) {
  tolko(ctx.metod, 'POST');
  const db = baza();
  const formula = String((ctx.telo && ctx.telo.formula) || '').trim();
  if (!formula) throw new OshibkaVvoda('нужна formula', 'formula');
  if(formula.length>2000)throw new OshibkaVvoda('formula: не больше 2000 символов','formula');

  const { POKAZATELI } = require('./ekrany.js');
  const imena = Object.keys(POKAZATELI);

  const schitalka = Object.hasOwn(POKAZATELI,formula)?POKAZATELI[formula]:null;
  if (!schitalka) {
                                                                
                                                     
    return { kod:422,telo: { horosho: false,
                     oshibka: `показателя «${formula}» нет`,
                     pokazateli: imena } };
  }

                                                                    
                                                                    
                                             
  try {
    const cel=ctx.telo?.cel_id?db.prepare('SELECT napravlenie,period_id FROM celi WHERE id=?').get(ctx.telo.cel_id):null;
    if(ctx.telo?.cel_id&&!cel)throw new NeNajdeno('цели нет');
                                                                  
                                                                   
                                                                    
                                                                     
                                                                      
                    
    const { razobrat_period, granicy_perioda } = require('./ekrany.js');
    const explicitPeriod=ctx.telo?.period_id||ctx.telo?.period;
    if(cel?.period_id&&explicitPeriod&&razobrat_period(cel.period_id)!==razobrat_period(explicitPeriod)){
      throw new OshibkaVvoda('период проверки отличается от периода цели','period_id');
    }
    const prislano=cel?.period_id||explicitPeriod||null;
    let ramki_perioda = null;
    let period_id = null;
    if (prislano) {
      period_id = razobrat_period(prislano);
      ramki_perioda = db.prepare('SELECT nachalo, konec FROM periody WHERE id = ?')
        .get(period_id) || null;
                                                                 
                                          
      if (!ramki_perioda) {
        try { ramki_perioda = granicy_perioda(period_id); } catch { ramki_perioda = null; }
      }
    }
                                                                     
                                                                    
    const baza_id = (ctx.telo && ctx.telo.baza_id) || null;
    const mode=require('./istochnik-rezultata.js').rezhim_lidov(ctx.telo?.schitat_lidov);
    if(ctx.telo?.schitat_lidov!==undefined&&!require('./istochnik-rezultata.js').FORMULY_LIDOV.has(formula)){
      throw new OshibkaVvoda('выбор лидов доступен только у показателя про лидов','schitat_lidov');
    }
    const znachenie = schitalka(db, ramki_perioda, baza_id, cel?.napravlenie || ctx.telo?.napravlenie, mode);
    if(!Number.isFinite(znachenie))throw new Error('Формула должна вернуть одно число');
    return { telo: { horosho: true, znachenie, pokazatel: formula, schitat_lidov: mode,
                     polnota_dannyh: require('./pervaja-rol.js').polnota_formuly(db,formula,
                       cel?.napravlenie || ctx.telo?.napravlenie),
                     period: period_id, baza_id,
                     nachalo: ramki_perioda ? ramki_perioda.nachalo : null,
                     konec: ramki_perioda ? ramki_perioda.konec : null } };
  } catch (e) {
    return { kod:e.kod||422,telo: { horosho: false, oshibka: e.message } };
  }
}

                   

function rassylki_svodka(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const id = Number(ctx.kljuch);
  if (!Number.isInteger(id)) throw new OshibkaVvoda('нужен id рассылки', 'id');
  const r = db.prepare('SELECT * FROM rassylki WHERE id = ?').get(id);
  if (!r) throw new NeNajdeno(`рассылки ${id} нет`);

  const schet = (s, ...z) => { try { return db.prepare(s).get(...z).n; } catch { return 0; } };
  const source=require('./kampanii.js').sourceStats(db,r);
  const {razmer_bazy:vsego,otpravleno,otvetili,otkazy}=source;
                                                                                  
  const soglasilis=r.baza_id?db.prepare("SELECT count(*) n FROM bazy_ljudi bl JOIN bazy_statusy s ON s.id=bl.status_id WHERE bl.baza_id=? AND "+require('./sostojanie-strok-bazy.js').active('bl')+" AND s.rol='soglasilsja'").get(r.baza_id).n:null;

                                                                    
                                                               
  const plan_vsego = (() => {
    const profile=require('./kampanii.js').profile(db,id);if(profile)return profile.plan_chislo;
    try {
      const p = db.prepare(
        'SELECT sum(plan_soobshenij) n FROM rassylka_plan WHERE rassylka_id = ?').get(id);
      if (p && p.n) return p.n;
    } catch {                                   }
    return vsego;
  })();

                                                               
                                                                     
                                                                      
                                                       
  const week=require('./kalendar.js').nedelja_iz_zaprosa({},segodnja());
  const volny=db.prepare(`SELECT z.id,pv.nomer porjadok_volny,z.nomer,z.nazvanie,z.status,z.otvetstvennyj,z.plan_chislo,z.sozdano,z.cel_id,z.rezultat_id,c.nazvanie cel_imja,r.nazvanie rezultat_imja
    FROM zadachi z LEFT JOIN celi c ON c.id=z.cel_id
    LEFT JOIN porjadki_voln pv ON pv.zadacha_id=z.id
    LEFT JOIN rezultaty r ON r.id=z.rezultat_id
    WHERE z.rassylka_id=? AND COALESCE(z.udaleno,0)=0
    AND ${require('./rol-zadachi-rassylki.js').sendingSQL('z')} ORDER BY pv.nomer IS NOT NULL,pv.nomer,z.sozdano,z.id`).all(id).map((z,i)=>({
      ...v_api(z),nomer_volny:z.porjadok_volny??i+1,plan:z.plan_chislo??null,
      ...require('./volny-rassylok.js').stats(db,id,z.id,week),
      novyh_kontaktov:null,prezhnih:null,
      cel:z.cel_id?{id:z.cel_id,nazvanie:z.cel_imja}:null,
      rezultat:z.rezultat_id?{id:z.rezultat_id,nazvanie:z.rezultat_imja}:null,
    }));

  return {
    telo: {
      ...require('./kampanii.js').presentation(db,r),
      volny,
      ...require('./volny-rassylok.js').campaignStats(db,id,week),
      voln: volny.length,
                                                                
                                                  
      kontaktov_v_baze: vsego,
      otpravleno,
      otvetili,
      soglasilis,
      otkazy,
      plan_vsego,
                                                                
      vypolneno_procent: plan_vsego ? Math.round((otpravleno / plan_vsego) * 100) : null,
                                                                      
      vsego,
      ostalos: Math.max(0, vsego - otpravleno),
                                                              
                                                   
      otklik_procent: otpravleno ? Math.round((otvetili / otpravleno) * 100) : 0,
    },
  };
}

                                                                  
                                                                    
const STATUSY_CHELOVEKA =
  require('./opisanija.js').OPISANIJA.rassylka_ljudi.spravochniki.status;

                                                           
function celoe(x, imja) {
  const n = parseInt(x, 10);
  if (!Number.isInteger(n)) throw new OshibkaVvoda(`${imja} должен быть числом`, imja);
  return n;
}

function rassylki_ljudi(ctx) {
  if(ctx.metod==='POST')return rassylki_dobavit_kontakty(ctx,baza(),Number(ctx.kljuch));
  if(ctx.metod==='PATCH')return require('./volny-rassylok.js').mark(ctx);
  tolko(ctx.metod,'GET');
  return require('./volny-rassylok.js').list(ctx);
}

                                                                  
                                                                
                                                                
function rassylki_dobavit_kontakty(ctx, db, id) {
  const campaign=db.prepare('SELECT * FROM rassylki WHERE id=?').get(id);
  if (!campaign) {
    throw new NeNajdeno(`рассылки ${id} нет`);
  }
  const t = ctx.telo || {};
  const syrjo = Array.isArray(t.kontakty) ? t.kontakty
    : Array.isArray(t.chelovek_ids) ? t.chelovek_ids
    : t.chelovek_id != null ? [t.chelovek_id] : [];
  if (!syrjo.length) {
    throw new OshibkaVvoda('нужен chelovek_id или массив kontakty', 'kontakty');
  }
  const ids = syrjo.map((x) => celoe(
    (x && typeof x === 'object') ? x.chelovek_id : x, 'chelovek_id'));

                                                             
                     
  if (t.status && t.status !== 'ne_otpravleno') {
    throw new OshibkaVvoda(
      'новый контакт заводится со статусом ne_otpravleno', 'status');
  }

  let sozdano = 0, uzhe_bylo = 0;
  const kontaktnye = [];
  v_odnoj_tranzakcii(db, () => {
    for (const chelovek_id of ids) {
      const chel = db.prepare('SELECT id, imja, rol_v_baze FROM ljudi WHERE id = ?')
        .get(chelovek_id);
      if (!chel) {
        throw new OshibkaVvoda(`человека ${chelovek_id} нет`, 'chelovek_id');
      }
                                                                  
                                                                  
                                                                
                                                               
                                           
        
                                                                      
                                                                     
      if (chel.rol_v_baze === 'kontaktnoe_lico') {
        kontaktnye.push({ chelovek_id: chel.id, imja: chel.imja });
        continue;
      }
      const existedBefore=db.prepare('SELECT 1 FROM rassylka_ljudi WHERE rassylka_id=? AND chelovek_id=?').get(id,chelovek_id);
      require('./kampanii.js').addSourceMember(db,campaign,chelovek_id,ctx.avtor);
                                                      
      const est = db.prepare(
        'SELECT 1 FROM rassylka_ljudi WHERE rassylka_id = ? AND chelovek_id = ?')
        .get(id, chelovek_id);
      if (est) { if(existedBefore)uzhe_bylo+=1;else sozdano+=1; continue; }
      db.prepare(
        `INSERT INTO rassylka_ljudi (rassylka_id, chelovek_id, status)
         VALUES (?, ?, 'ne_otpravleno')`).run(id, chelovek_id);
      db.prepare("INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,kogda,chto)VALUES(?,?,?,'dobavlen')").run(id,chelovek_id,segodnja());
      sozdano += 1;
    }
  });
                                                                       
                                                         
  if (kontaktnye.length && !sozdano && !uzhe_bylo) {
    throw new OshibkaVvoda(
      require('./kontaktnye-lica.js').OSHIBKA_RASSYLKI, 'chelovek_id');
  }
  return { kod: 201,
           telo: { sozdano, uzhe_bylo,
                   propuscheno_kontaktnyh: kontaktnye.length,
                   kontaktnye_lica: kontaktnye } };
}

                                                                
                                                                  
                                                             
function rassylki_statusy_kontaktov(ctx) { return require('./volny-rassylok.js').mark(ctx);
}

const rassylki_kontakty = rassylki_ljudi;

                                                                     
                                                               
function rassylka_s_bazoj(ctx) {
  const db = baza();
  const id = Number(ctx.kljuch);
  const r = db.prepare('SELECT * FROM rassylki WHERE id = ?').get(id);
  if (!r) throw new NeNajdeno(`рассылки ${id} нет`);
  const vsego_ljudej=require('./kampanii.js').sourceRows(db,r).length;
  return {
    telo: {
      ...require('./kampanii.js').presentation(db,r),
      vsego_ljudej,
                                                                 
                                                     
      mozhno_dobavit_zadachu: true,
    },
  };
}

function rassylki_zadachi(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const id = Number(ctx.kljuch);
                                                                  
                                                             
  const spisok = db.prepare(
    `SELECT z.*, l.imja otvetstvennyj_imja FROM zadachi z
     LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
     WHERE z.rassylka_id = ? AND ${NE_UDAL} ORDER BY z.nomer`).all(id).map(v_api);
  return { telo: { spisok, vsego: spisok.length } };
}

                                                                 
                                                                  
                                                           
  
                                                                    
                                                                     
                                                         
function rassylki_komu_pisat(ctx) {
  return require('./volny-rassylok.js').whom(ctx);
}

                                                                 
                                                                   
                                                                 
                                                              
                                                                  
                                                               
function rassylki_volna(ctx) {
  return require('./volny-rassylok.js').create(ctx);
}

                                                        
function rassylki_nedeli(ctx) {
  tolko(ctx.metod,'GET');
  return require('./volny-rassylok.js').weeks(ctx);
}

function rassylki_statusy(ctx) {
  tolko(ctx.metod, 'GET');
  return {
    telo: {
      statusy: [
        { kod: 'gotovitsja', imja: 'готовится' },
        { kod: 'idet',       imja: 'идёт' },
        { kod: 'pauza',      imja: 'пауза' },
        { kod: 'zavershena', imja: 'завершена' },
      ],
                                                                     
                                                     
      statusy_cheloveka: (() => {
        const IMENA = { ne_otpravleno: 'не отправлено', otpravleno: 'отправлено',
                        otvetil: 'ответил', otkaz: 'отказ' };
        const o = require('./opisanija.js');
        return o.OPISANIJA.rassylka_ljudi.spravochniki.status
          .map((k) => ({ kod: k, imja: IMENA[k] || k }));
      })(),
    },
  };
}

                                                                
function rassylki_predprosmotr_udalenija(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const id = Number(ctx.kljuch);
  const r = db.prepare('SELECT * FROM rassylki WHERE id = ?').get(id);
  if (!r) throw new NeNajdeno(`рассылки ${id} нет`);
  const schet = (s) => { try { return db.prepare(s).get(id).n; } catch { return 0; } };
  return {
    telo: {
      rassylka: v_api(r),
      propadet: {
        ljudej: schet('SELECT count(*) n FROM rassylka_ljudi WHERE rassylka_id = ?'),
        kasanij: schet('SELECT count(*) n FROM rassylka_kasanija WHERE rassylka_id = ?'),
        zadach: schet(`SELECT count(*) n FROM zadachi WHERE rassylka_id = ?`),
      },
                                                                    
      sohranitsja: 'сами люди остаются в базе, пропадёт только метка рассылки',
      istochnik_prihoda: schet('SELECT count(*) n FROM sotrudnichestva WHERE rassylka_id = ?'),
    },
  };
}

function nedeli_rassylki(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const week=require('./kalendar.js').nedelja_iz_zaprosa({...ctx.zapros,nedelja:ctx.kljuch},segodnja());
  const spisok=db.prepare(`SELECT r.*,count(rl.id) otpravleno FROM rassylki r
    LEFT JOIN rassylka_ljudi rl ON rl.rassylka_id=r.id
      AND date(rl.otpravleno_at,'+3 hours') BETWEEN ? AND ?
    GROUP BY r.id ORDER BY r.id`).all(week.nachalo,week.konec).map(v_api);
  return {telo:{nedelja:week.nomer,god:week.god,spisok}};
}

                      

function napr_strategija(ctx) {
  tolko(ctx.metod, 'GET');
  const kod = String(ctx.kljuch || '');
  const db = baza();
  if (!db.prepare('SELECT 1 FROM napravlenija WHERE kod = ?').get(kod)) {
    throw new NeNajdeno(`направления ${kod} нет`);
  }
  return require('./ekrany2.js').strategija({
    zapros: { napravlenie: kod, god: ctx.zapros.god }, metod: 'GET',avtor:ctx.avtor });
}

function napr_materialy(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const kod = String(ctx.kljuch || '');
  try {
    const spisok = db.prepare(
      'SELECT * FROM materialy WHERE napravlenie = ? ORDER BY id DESC LIMIT 200')
      .all(kod).map(v_api)
                                                                     
                                                                
                                         
      .map((m) => { const o = { ...m }; delete o.tip; delete o.nomer;
                    delete o.data_dokumenta; return o; })
                                                                 
                                                              
                                               
      .map((m) => ({
        ...m,
        vid_istochnika: m.fajl ? 'fajl'
          : (m.ssylka ? 'ssylka' : 'zapis'),
      }));
    return { telo: { spisok, vsego: spisok.length } };
  } catch { return { telo: { spisok: [], vsego: 0 } }; }
}

function napr_akkaunty(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const kod = String(ctx.kljuch || '');
  try {
    const spisok = db.prepare(
      'SELECT * FROM akkaunty WHERE napravlenie = ? AND COALESCE(udalen,0)=0 ORDER BY id').all(kod).map(v_api);
    return { telo: { spisok, vsego: spisok.length } };
  } catch { return { telo: { spisok: [], vsego: 0 } }; }
}

                                                                      
                                                                     
                                                                        
                                                                   
                              
function napr_svoi_znachenija(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const kod = String(ctx.kljuch || '');
  const napr = db.prepare('SELECT * FROM napravlenija WHERE kod = ?').get(kod);
  if (!napr) throw new NeNajdeno(`направления ${kod} нет`);
  const vzjat = (t) => {
    try {
      return db.prepare(`SELECT * FROM ${t} WHERE napravlenie = ? ORDER BY porjadok, id`)
        .all(kod).map(v_api);
    } catch { return []; }
  };
  let spisok = [];
  try {
    spisok = db.prepare(
      `SELECT usluga_svoja AS znachenie, COUNT(1) AS upotreblenij
         FROM proekty
        WHERE napravlenie = ? AND usluga_svoja IS NOT NULL AND usluga_svoja <> ''
        GROUP BY usluga_svoja
        ORDER BY upotreblenij DESC, usluga_svoja`).all(kod);
  } catch { spisok = []; }
  return {
    telo: {
      napravlenie: kod,
      spisok,
      vsego: spisok.length,
      stadii: vzjat('spravochnik_stadij'),
      tipy: vzjat('spravochnik_tipov'),
                                                                 
      pojasnenie: 'пустой список значит общие значения системы',
    },
  };
}

function napr_vizity(ctx) {
  const db = baza();
  const kod = String(ctx.kljuch || '');

                                                                  
                                                              
  if (ctx.metod === 'POST') {
    const t = ctx.telo || {};
    const stroki = Array.isArray(t.stroki) ? t.stroki : [t];
    if (!stroki.length) throw new OshibkaVvoda('нужны строки визитов', 'stroki');
    let zapisano = 0;
    for (const s of stroki) {
      const data = String(s.data || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        throw new OshibkaVvoda(`дата это ГГГГ-ММ-ДД, пришло «${s.data}»`, 'data');
      }
      const vizitov = Number(s.vizitov);
      if (!Number.isInteger(vizitov) || vizitov < 0) {
        throw new OshibkaVvoda(
          `визитов это целое от нуля, пришло «${s.vizitov}»`, 'vizitov');
      }
      const istochnik = String(s.istochnik_trafika || 'prochee');
      db.prepare(
        `INSERT INTO vizity (napravlenie, data, vizitov, istochnik_trafika)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (napravlenie, data, istochnik_trafika)
         DO UPDATE SET vizitov = excluded.vizitov`)
        .run(kod, data, vizitov, istochnik);
      zapisano += 1;
    }
    return { kod: 201, telo: { napravlenie: kod, zapisano } };
  }

  tolko(ctx.metod, 'GET');
  try {
    const spisok = db.prepare(
      `SELECT * FROM vizity WHERE napravlenie = ?
       ORDER BY data DESC LIMIT 200`).all(kod).map(v_api);
    return { telo: { spisok, vsego: spisok.length } };
  } catch (e) {
                                                                     
    return { kod: 500, telo: { oshibka: e.message } };
  }
}

                            

                                                            
                                                              
                           
function akkaunty_dlja_zadachi(ctx) {
  tolko(ctx.metod,'GET');const spisok=require('./akkaunt-zadachi.js').list(baza(),ctx.zapros).map(v_api);
  return {telo:{spisok,vsego:spisok.length,tip:ctx.zapros.tip||null,podstavit:spisok.length===1}};
}

function akkaunty_metriki(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const id = Number(ctx.kljuch);
  if(!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('нужен номер аккаунта','id');
  if(!db.prepare('SELECT 1 FROM akkaunty WHERE id=? AND COALESCE(udalen,0)=0').get(id))throw new NeNajdeno('аккаунта нет');
  try {
    const spisok = db.prepare(
      `SELECT * FROM zamery_akkauntov WHERE akkaunt_id = ?
       ORDER BY data DESC, rowid DESC LIMIT 100`).all(id).map(v_api);
    const computed=require('./metriki-akkaunta.js').vse(db,id);
    return { telo: { spisok, vsego: spisok.length,...computed,
      ...Object.fromEntries(Object.entries(computed.metriki).map(([key,value])=>[key,value.znachenie])) } };
  } catch (e) {
    return { kod: 500, telo: { oshibka: e.message } };
  }
}

function akkaunty_pokazatel(ctx){
  tolko(ctx.metod,'GET');
  const db=baza(),id=Number(ctx.kljuch),metrika=String(ctx.zapros.metrika||'');
  if(!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('нужен номер аккаунта','id');
  if(!require('./opisanija.js').METRIKI_AKKAUNTA.includes(metrika))throw new OshibkaVvoda('выбери метрику аккаунта','metrika');
  if(!db.prepare('SELECT id FROM akkaunty WHERE id=? AND COALESCE(udalen,0)=0').get(id))throw new NeNajdeno('аккаунта нет');
  return {telo:{akkaunt_id:id,metrika,...metrika_akkaunta(db,id,metrika)}};
}

function akkaunty_sobrat(ctx) {
  tolko(ctx.metod, 'POST');
  const db = baza();
  const id = Number(ctx.kljuch);
  const akk = db.prepare('SELECT * FROM akkaunty WHERE id = ? AND COALESCE(udalen,0)=0').get(id);
  if (!akk) throw new NeNajdeno(`аккаунта ${id} нет`);
                                                                   
                                                                         
                                                               
  if (akk.aktiven !== 1) {
    const e = new Error('аккаунт остановлен, сбор по нему не идёт');
    e.kod = 409;
    throw e;
  }
  const pending=db.prepare('SELECT id FROM zapuski_sbora WHERE akkaunt_id=? AND '+require('./sbor.js').PENDING+' ORDER BY id LIMIT 1').get(id);
  if(pending)return {kod:202,telo:{zaprosheno:true,akkaunt_id:id,zapros_id:pending.id,povtor:true,tekst:'Сбор поставлен в очередь'}};
                                                                
                                    
                                                                          
                                                                         
                                                                    
                                                      
  const now=seichas();
  const request=db.prepare(
    `INSERT INTO zapuski_sbora (kogda, akkaunt_id, uroven, uspeh, poluchen, primechanie,zaprosheno)
     VALUES (?, ?, ?, ?, ?, ?,?)`)
    .run(now, id, akk.uroven, null, null,
         'запуск поставлен в очередь вручную',now);
  return { kod: 202, telo: { zaprosheno: true, akkaunt_id: id,
    zapros_id:Number(request.lastInsertRowid),povtor:false,tekst:'Сбор поставлен в очередь' } };
}

function publikacii_zamery(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const id = String(ctx.kljuch);
  try {
    const spisok = db.prepare(
      `SELECT * FROM zamery_publikacij WHERE publikacija_id = ?
       ORDER BY data DESC, rowid DESC LIMIT 100`).all(id).map(v_api);
    return { telo: { spisok, vsego: spisok.length } };
  } catch (e) {
    return { kod: 500, telo: { oshibka: e.message } };
  }
}

                                                            

                                                                  
                                               
function planerka_snimok(ctx) {
  const db = baza();
  if (ctx.zapros.nedelja == null && ctx.zapros.sprint == null) throw new OshibkaVvoda('нужна nedelja', 'nedelja');
  const week = require('./kalendar.js').nedelja_iz_zaprosa(ctx.zapros, segodnja());
  const nedelja = week.nomer, god = week.god;
  const napravlenie = ctx.zapros.napravlenie || null;

  if (ctx.metod === 'GET') {
    const saved=require('./snimok-planerki.js').read(db,{napravlenie,god,nomer:nedelja});
    if(!saved)throw new NeNajdeno(`снимка недели ${nedelja} нет`);
    const {rowid,...result}=saved;
    return {telo:result};
  }

  tolko(ctx.metod, 'POST');
  if (!napravlenie) throw new OshibkaVvoda('нужно направление', 'napravlenie');

  const commands=require('./komandy-snimka.js'),normalized={...ctx,zapros:{napravlenie,nedelja:String(nedelja),god:String(god)}};
  if(ctx.avtomaticheskij_snimok)return commands.automaticClose(ctx);
  if(ctx.telo&&Object.hasOwn(ctx.telo,'zapros_kljuch'))return commands.handle({...ctx,dejstvie:'snimok'});
  return commands.legacyCreate(normalized);
}

                                                            
                                      
function planerka_vse(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const den = ctx.zapros.den || segodnja();
  const week = require('./kalendar.js').nedelja_iz_zaprosa(ctx.zapros, den);
  const nedelja = week.nomer;

  const vidit_dengi = require('./dengi-dostup.js').vidit(db,ctx.avtor);

                                                                 
  const napravlenija = db.prepare(
    'SELECT * FROM napravlenija WHERE arhiv IS NULL OR arhiv = 0 ORDER BY porjadok, kod')
    .all();

  const polosa = napravlenija.map((n) => {
    const vsego = db.prepare(
      `SELECT count(*) c FROM zadachi WHERE napravlenie = ? AND ${require('./kampanii.js').weeklyPredicate('zadachi',week)} AND ${NE_UDAL}`)
      .get(n.kod).c;
    const zakryto = db.prepare(
      `SELECT count(*) c FROM zadachi WHERE napravlenie = ? AND ${require('./kampanii.js').weeklyPredicate('zadachi',week)}
         AND status = 'sdelano' AND ${NE_UDAL}`).get(n.kod).c;
    const celi = db.prepare(
      `SELECT id FROM celi WHERE napravlenie = ?
         AND sostojanie='aktivna'`).all(n.kod);
    let procent = 0;
    if (celi.length) {
      const doli = celi.map((c) => {
        const rez = db.prepare('SELECT * FROM rezultaty WHERE cel_id = ?').all(c.id);
        if (!rez.length) return 0;
        const { fakt_rezultata, procent_celi } = require('./ekrany.js');
        return procent_celi(rez.map(r => ({...r, fakt: fakt_rezultata(db,r)})));
      });
      procent = doli.some(value=>value==null)?null:Math.round(doli.reduce((a, b) => a + b, 0) / doli.length);
    }
    const prishlo = vidit_dengi ? db.prepare(
      `SELECT coalesce(sum(pl.summa), 0) s FROM platezhi pl
       JOIN proekty p ON p.id = pl.proekt_id
       WHERE p.napravlenie = ? AND pl.oplachen_at IS NOT NULL
         AND date(pl.oplachen_at,'+3 hours') BETWEEN ? AND ?`)
      .get(n.kod, week.nachalo, week.konec).s : null;
    return { ...v_api(n), zadach: vsego, zakryto, procent_celej: procent, prishlo };
  });

  const trebuet_reshenija = db.prepare(
    `SELECT z.*, l.imja otvetstvennyj_imja FROM zadachi z
     LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
     WHERE z.status = 'na_soglasovanii' AND ${NE_UDAL.replace(/udaleno/g, 'z.udaleno')}
     ORDER BY z.napravlenie, z.nomer`).all().map(v_api);

  const prosrochki = db.prepare(
    `SELECT z.otvetstvennyj, l.imja, count(*) n FROM zadachi z
     LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
     WHERE z.srok IS NOT NULL AND z.srok < ? AND ${OTKRYTA_Z.replace(/status/g, 'z.status')}
       AND ${NE_UDAL.replace(/udaleno/g, 'z.udaleno')}
     GROUP BY z.otvetstvennyj ORDER BY n DESC`).all(den).map(v_api);

  const dvizhenija = (() => {
    try {
      return db.prepare(
        `SELECT * FROM zhurnal WHERE pole IN ('rol', 'status', 'stadija', 'arhiv')
         ORDER BY kogda DESC LIMIT 20`).all().map(v_api);
    } catch { return []; }
  })();

  const davno = db.prepare(
    `SELECT s.chelovek_id, l.imja, s.napravlenie, s.poslednee_obshenie,
            coalesce(n.norma_dnej, 14) norma
     FROM sotrudnichestva s JOIN ljudi l ON l.id = s.chelovek_id
     LEFT JOIN napravlenija n ON n.kod = s.napravlenie
     WHERE s.rol = 'klient' AND (s.arhiv IS NULL OR s.arhiv = 0)
       AND (s.stadija IS NULL OR s.stadija <> 'pauza')
     ORDER BY s.id`).all().map(row=>{
       const facts=require('./obschenie.js').najti(db,row.chelovek_id,require('./vremja-obschenija.js').razobrat(den).moment);
       return {...v_api(row),poslednee_obshenie:facts.poslednee_obshenie_obshee,dnej:facts.dnej_bez_svjazi};
     }).filter(row=>row.dnej!==null&&row.dnej>row.norma).sort((a,b)=>b.dnej-a.dnej).slice(0,30);

  const dengi_blok = vidit_dengi
    ? {
        skryto: false,
        prishlo_za_nedelju: db.prepare(
          `SELECT coalesce(sum(summa), 0) s FROM platezhi
           WHERE oplachen_at IS NOT NULL
             AND date(oplachen_at,'+3 hours') BETWEEN ? AND ?`).get(week.nachalo,week.konec).s,
        vystavleno_ne_oplacheno: db.prepare(
          `SELECT coalesce(sum(summa), 0) s FROM platezhi
           WHERE vystavlen_at IS NOT NULL AND oplachen_at IS NULL`).get().s,
      }
    : { skryto: true, znachenie: null };

  return {
    telo: {
      nedelja, den,
                                                           
      polosa_napravlenij: polosa,
      trebuet_reshenija,
      dengi: dengi_blok,
      dvizhenija,
      prosrochki,
      davno_ne_obschalis: davno,
    },
  };
}

                                                

                                                                    
                                                                       
                                                               
function onbording_shag(ctx) {
  tolko(ctx.metod, 'POST');
  const e3 = require('./ekrany3.js');
  const syrjo = (ctx.telo && (ctx.telo.shag != null ? ctx.telo.shag : ctx.telo.nomer));
  if (syrjo == null || String(syrjo).trim() === '') {
    throw new OshibkaVvoda('нужен shag', 'shag');
  }
                                                          
  const kod = /^\d+$/.test(String(syrjo).trim())
    ? 'shag_' + String(syrjo).trim() : String(syrjo).trim();
  if (!e3.SHAGI_VHODA.some(([k]) => k === kod)) {
    throw new OshibkaVvoda(
      `shag: один из ${e3.SHAGI_VHODA.map(([k]) => k).join(', ')}`, 'shag');
  }

  const db = baza();
  const ja = Number(ctx.avtor);
  db.prepare('INSERT OR IGNORE INTO nastrojki (chelovek_id) VALUES (?)').run(ja);
  const est = e3.otmetki(db, ja);
  est.add(kod);
  db.prepare('UPDATE nastrojki SET pokazannye_podskazki = ? WHERE chelovek_id = ?')
    .run([...est].join(','), ja);

  return e3.onbording({ zapros: { chelovek_id: ja }, avtor: ja, metod: 'GET' });
}

                                                                 
                                                              
                                                                
function onbording_sbros(ctx) {
  tolko(ctx.metod, 'POST');
  const db = baza();
  const ja = Number(ctx.avtor);
  db.prepare('INSERT OR IGNORE INTO nastrojki (chelovek_id) VALUES (?)').run(ja);
  db.prepare("UPDATE nastrojki SET pokazannye_podskazki = '' WHERE chelovek_id = ?")
    .run(ja);
  const e3 = require('./ekrany3.js');
  const sostojanie = e3.onbording(
    { zapros: { chelovek_id: ja }, avtor: ja, metod: 'GET' });
  return { telo: { sbrosheno: true, ...sostojanie.telo } };
}

function podskazki_skryt(ctx) {
  tolko(ctx.metod, 'POST');
  if(Object.hasOwn(ctx.telo||{},'kod'))return require('./context-hints.js').hide(ctx);
  return require('./ekrany3.js').plashki({ ...ctx, kljuch: 'skryt' });
}

                                                     
function podskazki_peregruz(ctx) {
  tolko(ctx.metod, 'GET');
  const db=baza(),den=ctx.zapros.den||segodnja();
  const week=require('./kalendar.js').nedelja_iz_zaprosa(ctx.zapros,den);
  const loads=require('./nagruzka.js').nagruzka(db,{den,week});
  const mine=loads.find(l=>l.id===Number(ctx.avtor));
  const spisok=loads.filter(l=>l.peregruz).map(l=>({...l,n:l.otkryto}));
  return {telo:{nedelja:week.nomer,god:week.god,predel:mine?.porog??null,
    mediana:mine?.mediana??null,otkryto:mine?.otkryto??0,
    peregruzheny:spisok,vsego:spisok.length}};
}

function nastrojki_vid(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const ja = Number(ctx.zapros.chelovek_id || ctx.avtor);
                                                               
                                                              
                                                       
  const svoi = (() => {
    try {
      return db.prepare('SELECT vid_zadach FROM nastrojki WHERE chelovek_id = ?')
        .get(ja);
    } catch { return null; }
  })();

  return {
    telo: {
      vid_zadach: (svoi && svoi.vid_zadach) || 'spisok',
      vidy_zadach: [
        { kod: 'spisok', imja: 'списком' },
        { kod: 'plitki', imja: 'плитками' },
      ],
      temy: [{ kod: 'svetlaja', imja: 'светлая' }, { kod: 'tjomnaja', imja: 'тёмная' }],
      plotnost: [{ kod: 'obychnaja', imja: 'обычная' }, { kod: 'plotnaja', imja: 'плотная' }],
      startovye_ekrany: [
        { kod: 'moe', imja: 'Моё пространство' },
        { kod: 'zadachi', imja: 'Задачи' },
        { kod: 'planerka', imja: 'Планёрка' },
      ],
    },
  };
}

function nastrojki_bot(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const ja = Number(ctx.zapros.chelovek_id || ctx.avtor);
  const tg = db.prepare(
    `SELECT znachenie FROM kontakty WHERE chelovek_id = ? AND tip = 'telegram' LIMIT 1`)
    .get(ja);
                                                                    
                                                                  
                               
  let nastr = null;
  try {
    nastr = db.prepare(
      'SELECT tihie_chasy, bot_chto, bot_sobytija FROM nastrojki WHERE chelovek_id = ?')
      .get(ja);
  } catch { nastr = null; }
                                                           
                                                               
                                                                
  let svoi_sobytija = {};
  try { svoi_sobytija = JSON.parse((nastr && nastr.bot_sobytija) || '{}') || {}; }
  catch { svoi_sobytija = {}; }
  const UMOLCHANIJA = [
    { kod: 'moi_zadachi_na_segodnja', imja: 'мои задачи на сегодня', vkljucheno: true },
    { kod: 'prosrochki', imja: 'просрочки', vkljucheno: true },
    { kod: 'planerka', imja: 'напоминание о планёрке', vkljucheno: false },
  ];
  return {
    telo: {
      podkljuchen: !!tg,
      telegram: tg ? tg.znachenie : null,
                                                                 
      tihie_chasy: nastr ? !!nastr.tihie_chasy : false,
      chto_prisylat: nastr && nastr.bot_chto ? nastr.bot_chto : 'vse',
      sobytija: UMOLCHANIJA.map((s) => ({
        ...s,
        vkljucheno: typeof svoi_sobytija[s.kod] === 'boolean'
          ? svoi_sobytija[s.kod] : s.vkljucheno,
      })),
    },
  };
}

function meta_napravlenija(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const spisok = db.prepare(
    'SELECT * FROM napravlenija ORDER BY porjadok, kod').all().map(v_api);
  return { telo: { spisok, vsego: spisok.length,
    zhivyh: spisok.filter((n) => !n.arhiv).length } };
}

function meta_filtry_zadach(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  return {
    telo: {
      polja: [
        { kod: 'napravlenie', imja: 'направление', vid: 'spisok',
          znachenija: db.prepare(
            'SELECT kod, nazvanie FROM napravlenija WHERE arhiv IS NULL OR arhiv = 0')
            .all().map(v_api) },
        { kod: 'status', imja: 'статус', vid: 'spisok' },
        { kod: 'tip', imja: 'тип', vid: 'spisok' },
        { kod: 'otvetstvennyj', imja: 'ответственный', vid: 'chelovek' },
        { kod: 'sprint', imja: 'спринт', vid: 'chislo' },
        { kod: 'prosrocheno', imja: 'просроченные', vid: 'da_net' },
      ],
    },
  };
}

                 

function grafik_kopirovat(ctx) {
  tolko(ctx.metod, 'POST');
  const db = baza();
  const chelovek=Number(ctx.telo?.chelovek_id??ctx.zapros.chelovek_id??ctx.avtor);
  if(!Number.isSafeInteger(chelovek)||chelovek<1)throw new OshibkaVvoda('нужен человек','chelovek_id');
  require('./prava-grafika.js').proverit(chelovek,ctx.avtor);
  const calendar = require('./kalendar.js'), current = calendar.iso_nedelja(segodnja());
  const iz = calendar.razobrat_nedelju(ctx.zapros.iz ?? ctx.telo?.iz, current.god, 'iz');
  const v = calendar.razobrat_nedelju(ctx.zapros.v ?? ctx.telo?.v, current.god, 'v');
  const stroki = db.prepare('SELECT * FROM grafik WHERE nedelja = ? AND god = ? AND chelovek_id = ?')
    .all(iz.nomer, iz.god, chelovek);
  if (!stroki.length) throw new NeNajdeno('своего графика на исходной неделе нет');

                                                             
                                                            
  const est = new Set(db.prepare(
    'SELECT chelovek_id, den FROM grafik WHERE nedelja = ? AND god = ? AND chelovek_id = ?')
    .all(v.nomer, v.god, chelovek)
    .map((r) => `${r.chelovek_id}:${r.den}`));

  let skopirovano = 0;
  const vnutri = () => v_odnoj_tranzakcii(db, () => {
    for (const s of stroki) {
      if (est.has(`${s.chelovek_id}:${s.den}`)) continue;
      const created=db.prepare(
        `INSERT INTO grafik (chelovek_id, nedelja, god, den, chasov, s_kakogo, do_kakogo, zametka, ne_rabotaju,versija)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,1)`)
        .run(chelovek, v.nomer, v.god, s.den, s.chasov, s.s_kakogo, s.do_kakogo, s.zametka, s.ne_rabotaju);
      require('./obschij.js').v_zhurnal(db,'grafik',Number(created.lastInsertRowid),'sozdano',null,
        `скопировано из ${calendar.kljuch_nedeli(iz.god,iz.nomer)}`,ctx.avtor);
      skopirovano++;
    }
  });
  vnutri();
  return { telo: { chelovek_id:chelovek, iz:iz.nomer, v:v.nomer, iz_god:iz.god, v_god:v.god,
    skopirovano, propuscheno: stroki.length - skopirovano } };
}

function grafik_sohranit(ctx){
  tolko(ctx.metod,'POST');
  const db=baza(),body=ctx.telo||{},chelovek=Number(body.chelovek_id??ctx.avtor);
  require('./prava-grafika.js').proverit(chelovek,ctx.avtor);
  if(!Number.isSafeInteger(chelovek)||!db.prepare('SELECT 1 FROM ljudi WHERE id=?').get(chelovek)){
    throw new OshibkaVvoda('выбери существующего человека','chelovek_id');
  }
  const week=require('./kalendar.js').nedelja_iz_zaprosa(body,segodnja());
  if(!Array.isArray(body.dni)||body.dni.length>7||body.dni.length===0)throw new OshibkaVvoda('нужны дни недели','dni');
  const used=new Set();
  for(const row of body.dni){
    if(!row||typeof row!=='object'||!Number.isInteger(row.den)||row.den<1||row.den>7||used.has(row.den)){
      throw new OshibkaVvoda('каждый день от 1 до 7 передаётся один раз','dni');
    }
    used.add(row.den);
  }
  const {sozdat,pravit}=require('./obschij.js'),desc=require('./opisanija.js').OPISANIJA.grafik;
  const {Konflikt}=require('../db/db.js');
  const result=v_odnoj_tranzakcii(db,()=>body.dni.flatMap(row=>{
    const before=db.prepare('SELECT * FROM grafik WHERE chelovek_id=? AND god=? AND nedelja=? AND den=?')
      .get(chelovek,week.god,week.nomer,row.den);
    if((before&&Number(row.id)!==before.id)||(!before&&row.id!=null)){
      throw new Konflikt('график изменился у другого участника',{den:row.den,tekuschee:before?v_api(before):null});
    }
    const fields=Object.fromEntries(['chasov','s_kakogo','do_kakogo','ne_rabotaju','zametka']
      .filter(key=>key in row).map(key=>[key,row[key]]));
    const data={...fields,chelovek_id:chelovek,nedelja:week.nomer,god:week.god,den:row.den};
    if(before)return [pravit('grafik',desc,before.id,{...data,versija:row.versija},ctx.avtor)];
    if(Number(row.chasov)===0&&!row.ne_rabotaju&&!String(row.s_kakogo||'').trim())return [];
    return [sozdat('grafik',desc,data,ctx.avtor)];
  }));
  return {telo:{chelovek_id:chelovek,nedelja:week.nomer,god:week.god,spisok:result}};
}

function grafik_svodka(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const week = require('./kalendar.js').nedelja_iz_zaprosa(ctx.zapros, segodnja());
  const nedelja = week.nomer;
  const chelovek = ctx.zapros.chelovek_id ? Number(ctx.zapros.chelovek_id) : null;
  const uslovija = ['g.nedelja = ?', 'g.god = ?'], znach = [nedelja, week.god];
  if (chelovek) { uslovija.push('g.chelovek_id = ?'); znach.push(chelovek); }
  const gde = uslovija.length ? 'WHERE ' + uslovija.join(' AND ') : '';
  const spisok = db.prepare(
    `SELECT g.chelovek_id, l.imja, sum(g.chasov) chasov, count(*) dnej
     FROM grafik g LEFT JOIN ljudi l ON l.id = g.chelovek_id
     ${gde} GROUP BY g.chelovek_id ORDER BY chasov DESC`).all(...znach).map(v_api);
  return { telo: { nedelja, god:week.god, spisok,
    vsego_chasov: spisok.reduce((a, s) => a + (s.chasov || 0), 0) } };
}

function moe_prostranstvo_grafik(ctx) {
  tolko(ctx.metod, 'GET');
  const summary=grafik_svodka({ ...ctx, zapros: { ...ctx.zapros, chelovek_id: ctx.avtor } }).telo,db=baza();
  const dni=db.prepare('SELECT * FROM grafik WHERE chelovek_id=? AND god=? AND nedelja=? ORDER BY den').all(ctx.avtor,summary.god,summary.nedelja).map(row=>({...v_api(row),...require('./grafik-identity.js').row(db,row)}));
  return {telo:{...summary,chelovek_id:ctx.avtor,kontekst:require('./grafik-identity.js').owner(db,ctx.avtor),poslednee_dejstvie:require('./otmena-grafika.js').lastFor(db,{chelovek_id:ctx.avtor,god:summary.god,nedelja:summary.nedelja},ctx.avtor),dni}};
}

                       

function bazy_kontakty(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const tip = ctx.zapros.tip || 'pochta';
  const spisok = db.prepare(
    `SELECT k.chelovek_id, l.imja, k.znachenie FROM kontakty k
     JOIN ljudi l ON l.id = k.chelovek_id
     WHERE k.tip = ? AND (l.arhiv IS NULL OR l.arhiv = 0)
     ORDER BY l.imja LIMIT 2000`).all(tip).map(v_api);
  return { telo: { tip, spisok, vsego: spisok.length } };
}

function bazy_zagruzka(ctx) {
  tolko(ctx.metod, 'POST');
  return require('./import-bazy.js').apply(ctx);
}

                        
  
                                                                
                                                                 
                                                    

const ROLI_STATUSA = ['v_rabote', 'otkliknulsja', 'soglasilsja', 'otkaz'];
                                                               
                                                             
const { CHTO_ETO } = require('./opisanija.js');
const KANALY_SVJAZI = ['mail', 'tg', 'instagram', 'telefon'];

function baza_po_kljuchu(db, kljuch) {
  const id = Number(kljuch);
  if (!Number.isInteger(id) || id <= 0) {
    throw new OshibkaVvoda('нужен номер базы', 'baza_id');
  }
  const b = db.prepare('SELECT * FROM bazy WHERE id = ?').get(id);
  if (!b) throw new NeNajdeno(`базы ${id} нет`);
  return b;
}

                                                       
  
                                                                    
                                                                
                                                                 
function bazy_statusy(ctx) { return require('./bazy-pravki.js').stages(ctx); }
function bazy_sostojanie_stroki(ctx){return require('./sostojanie-strok-bazy.js').handle(ctx);}
function bazy_ljudi(ctx) { return require('./bazy-pravki.js').members(ctx); }
function bazy_voronka(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const b = baza_po_kljuchu(db, ctx.kljuch);
  const vsego = db.prepare('SELECT count(*) n FROM bazy_ljudi bl WHERE baza_id = ? AND '+require('./sostojanie-strok-bazy.js').active('bl'))
    .get(b.id).n;
  const stupeni = db.prepare(
    `SELECT s.id, s.nazvanie, s.rol, s.porjadok,
            (SELECT count(*) FROM bazy_ljudi bl
              WHERE bl.baza_id = s.baza_id AND bl.status_id = s.id AND ${require('./sostojanie-strok-bazy.js').active('bl')}) AS skolko
       FROM bazy_statusy s
      WHERE s.baza_id = ? AND s.rol IS NOT NULL AND s.rol <> 'otkaz'
      ORDER BY s.porjadok, s.id`).all(b.id);
                                                                 
                                                                 
                                          
  const otkazov = db.prepare(
    `SELECT count(*) n FROM bazy_ljudi bl
       JOIN bazy_statusy s ON s.id = bl.status_id
      WHERE bl.baza_id = ? AND ${require('./sostojanie-strok-bazy.js').active('bl')} AND s.rol = 'otkaz'`).get(b.id).n;
                                                                 
                                                                       
  let itog = [], nakoplenno = 0;
  for (let i = stupeni.length - 1; i >= 0; i--) {
    nakoplenno += stupeni[i].skolko;
    itog.unshift({ ...v_api(stupeni[i]), doshlo: nakoplenno });
  }
  itog = itog.map((s, i) => ({
    ...s,
    procent_ot_bazy: vsego ? Math.round((s.doshlo * 100) / vsego) : 0,
    procent_ot_predyduschej: i === 0 || !itog[i - 1].doshlo
      ? null : Math.round((s.doshlo * 100) / itog[i - 1].doshlo),
  }));
  const bez_roli = db.prepare(
    'SELECT count(*) n FROM bazy_statusy WHERE baza_id = ? AND rol IS NULL')
    .get(b.id).n;
  return {
    telo: {
      baza_id: b.id, nazvanie: b.nazvanie, vsego, stupeni: itog,
      otkazov, statusov_bez_roli: bez_roli,
      dohodimost: vsego && itog.length
        ? Math.round((itog[itog.length - 1].doshlo * 100) / vsego) : 0,
    },
  };
}

                                                      
  
                                                          
                                   
function bazy_vygruzka(ctx) {
  tolko(ctx.metod, 'GET');const db=baza(),b=baza_po_kljuchu(db,ctx.kljuch);
  const stroki=db.prepare('SELECT bl.*,l.imja,s.nazvanie status_slovami,k.imja kontakt_imja FROM bazy_ljudi bl JOIN ljudi l ON l.id=bl.kto LEFT JOIN ljudi k ON CAST(k.id AS TEXT)=bl.kontakt LEFT JOIN bazy_statusy s ON s.id=bl.status_id WHERE bl.baza_id=? AND '+require('./sostojanie-strok-bazy.js').active('bl')+' ORDER BY bl.id').all(b.id);
  const OBSCHIE=['imja','kontakt','kanal_svjazi','adres','kanal_zapasnoj','kontekst','kontekst_otkuda','soobshenie','soobshenie_vdogon','status_slovami','segment','kogorta','kommentarij','materialy','ssylka'];
  const svoi_imena=[],tails=stroki.map(row=>{let value;try{value=JSON.parse(row.svoi);}catch{}if(!value||typeof value!=='object'||Array.isArray(value)){if(row.svoi)value={'свои поля: исходный текст':row.svoi};else value={};}for(const key of Object.keys(value))if(!svoi_imena.includes(key))svoi_imena.push(key);return value;});
  const used=new Set(OBSCHIE),svoi_kolonki=svoi_imena.map(key=>{let label=used.has(key)?'своё: '+key:key,n=2;while(used.has(label))label='своё: '+key+' ('+(n++)+')';used.add(label);return {imja:label,kljuch:key};});
  const tablica=stroki.map((row,i)=>{
   const attachments=require('./bazy-pravki.js').attachments({...ctx,metod:'GET',zapros:{stroka_id:row.id}}).telo.spisok;
   row.materialy=attachments.map(item=>{const m=item.material,name=(m.nazvanie||m.ishodnoe_imja||'файл')+(m.fajl_dostupen===false?' (исходник недоступен)':'');if(m.fajl||String(m.ssylka||'').startsWith('/fajly/'))return name+' — /api/fajly/'+m.id+'/skachat?obekt='+(item.tablica==='dokumenty'?'dokument':'material')+'&fajl='+encodeURIComponent(m.fajl||m.ssylka||'');return name+(m.ssylka?' — '+m.ssylka:'');}).join('\n');row.kontakt=row.kontakt_imja||row.kontakt;
   return [...OBSCHIE.map(k=>row[k]==null?'':String(row[k])),...svoi_kolonki.map(c=>{const v=tails[i][c.kljuch];return v==null?'':typeof v==='object'?JSON.stringify(v):String(v);})];
  });
  return {telo:{baza_id:b.id,nazvanie:b.nazvanie,kolonki:[...OBSCHIE,...svoi_kolonki.map(c=>c.imja)],stroki:tablica,vsego:tablica.length,svoih_kolonok:svoi_kolonki.length,svoi_kolonki}};
}

                                                        
  
                                                           
                                                        
                   
function bazy_svoi_polja(ctx) { return require('./bazy-pravki.js').custom(ctx); }
function legacy_bazy_svoi_polja(ctx) {
  const db = baza();
  const b = baza_po_kljuchu(db, ctx.kljuch);
  if (ctx.metod === 'GET') {
    const stroki = db.prepare(
      'SELECT svoi FROM bazy_ljudi bl WHERE baza_id = ? AND svoi IS NOT NULL AND '+require('./sostojanie-strok-bazy.js').active('bl'))
      .all(b.id);
    const schet = {};
    for (const s of stroki) {
      let h = {};
      try { h = JSON.parse(s.svoi); } catch { continue; }
      for (const [k, v] of Object.entries(h)) {
        if (v === null || v === '') continue;
        schet[k] = (schet[k] || 0) + 1;
      }
    }
    const spisok = Object.entries(schet)
      .map(([imja, zapolneno]) => ({ imja, zapolneno }))
      .sort((a, b2) => b2.zapolneno - a.zapolneno || a.imja.localeCompare(b2.imja));
    return { telo: { baza_id: b.id, spisok, vsego: spisok.length } };
  }
  throw Object.assign(new Error('сюда только GET'),{kod:405});
}

function fajly_skachat(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const id = Number(ctx.kljuch);
  const vzjat = (t) => {
    try { return db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id); }
    catch { return null; }
  };
  const fajl = vzjat('materialy') || vzjat('dokumenty');
  if (!fajl) throw new NeNajdeno(`файла ${id} нет`);
                                                                      
                                                     
  return { telo: { ...v_api(fajl),
    ssylka: fajl.ssylka || fajl.put || null,
    tekst: fajl.ssylka || fajl.put ? null : 'у этой записи нет вложенного файла' } };
}

module.exports = {
  okr_celi, okr_rezultaty, okr_rezultat, okr_zamery, okr_periody, okr_zakryt,
  celi_dekompozicija,
  celi_po_kvartalam,
  rezultaty_proverit_formulu,
  rassylki_svodka, rassylki_ljudi, rassylki_kontakty, rassylki_zadachi,
  rassylki_komu_pisat, rassylki_nedeli, rassylki_statusy, rassylki_volna,
  rassylki_predprosmotr_udalenija, nedeli_rassylki,
  napr_strategija, napr_materialy, napr_akkaunty, napr_svoi_znachenija, napr_vizity,
  akkaunty_dlja_zadachi, akkaunty_metriki, akkaunty_pokazatel, akkaunty_sobrat, publikacii_zamery,
  planerka_snimok, planerka_vse,
  onbording_shag, onbording_sbros, podskazki_skryt, podskazki_peregruz,
  nastrojki_vid, nastrojki_bot, meta_napravlenija, meta_filtry_zadach,
  grafik_kopirovat, grafik_sohranit, grafik_svodka, moe_prostranstvo_grafik,
  legacy_bazy_svoi_polja, bazy_kontakty, bazy_zagruzka, bazy_statusy, bazy_ljudi,
  bazy_sostojanie_stroki, bazy_voronka, bazy_vygruzka, bazy_svoi_polja, fajly_skachat,
};

                                                        
  
                                                       
                                                                 

                                                                
                                                              
                            
function proekt_s_dengami(ctx) {
  const db = baza();
  const id = Number(ctx.kljuch);
  const p = db.prepare('SELECT * FROM proekty WHERE id = ?').get(id);
  if (!p) throw new NeNajdeno(`проекта ${id} нет`);

  const vidit = require('./dengi-dostup.js').vidit(db,ctx.avtor);

  const summa = (uslovie) => db.prepare(
    `SELECT coalesce(sum(summa), 0) s FROM platezhi WHERE proekt_id = ? ${uslovie}`)
    .get(id).s;

  return {
    telo: {
      ...v_api(p),
                                                              
                                                              
      stoimost: vidit ? p.stoimost : null,
      vystavleno: vidit ? summa('AND vystavlen_at IS NOT NULL') : null,
      oplacheno: vidit ? summa('AND oplachen_at IS NOT NULL') : null,
      dengi_skryty: !vidit,
                                                              
                                                              
      skryto: vidit ? null : ['dengi'],
      skryty_polja: vidit ? null : ['stoimost', 'vystavleno', 'oplacheno'],
    },
  };
}

                                                                    
                                                               
                     
function dengi_svodka_po_uslugam(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  if (!require('./dengi-dostup.js').vidit(db,ctx.avtor)) {
    return { telo: { skryto: true, po_uslugam: [], bez_uslugi: 0, summa_bez_uslugi: 0 } };
  }
  const mesjac = ctx.zapros.mesjac || null;
  const gde_mesjac = mesjac ? "AND substr(pl.oplachen_at, 1, 7) = ?" : '';
  const znach = mesjac ? [mesjac] : [];

  const po_uslugam = db.prepare(
    `SELECT u.id usluga_id, u.nazvanie usluga,
            count(DISTINCT p.id) proektov,
            coalesce(sum(CASE WHEN pl.oplachen_at IS NOT NULL THEN pl.summa END), 0) summa
     FROM proekty p
     JOIN uslugi u ON u.id = p.usluga_id
     LEFT JOIN platezhi pl ON pl.proekt_id = p.id ${gde_mesjac}
     GROUP BY u.id ORDER BY summa DESC`).all(...znach).map(v_api);

  const bez = db.prepare(
    `SELECT count(*) n,
            coalesce((SELECT sum(pl.summa) FROM platezhi pl
                      JOIN proekty p2 ON p2.id = pl.proekt_id
                      WHERE p2.usluga_id IS NULL AND p2.usluga_svoja IS NULL
                        AND pl.oplachen_at IS NOT NULL ${gde_mesjac}), 0) s
     FROM proekty WHERE usluga_id IS NULL AND usluga_svoja IS NULL`)
    .get(...znach);

  return {
    telo: {
      skryto: false, mesjac,
      po_uslugam,
                                                                
                                     
      bez_uslugi: bez.n,
      summa_bez_uslugi: bez.s,
    },
  };
}

                                                           
                                                                 
                                   
function zadachi_fakt(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const nomer = Number(ctx.kljuch);
  const z = db.prepare('SELECT * FROM zadachi WHERE nomer = ?').get(nomer);
  if (!z) throw new NeNajdeno(`задачи ${nomer} нет`);

  let novyh = 0, prezhnih = 0;
  if (z.rassylka_id) {
    try {
      prezhnih = db.prepare(
        'SELECT count(DISTINCT chelovek_id) n FROM rassylka_kasanija WHERE zadacha_id = ?')
        .get(z.id).n;
    } catch { prezhnih = 0; }
    try {
                                                                  
                                  
      novyh = db.prepare(
        `SELECT count(*) n FROM sotrudnichestva
         WHERE napravlenie = ? AND sozdano IS NOT NULL
           AND strftime('%G-W%V',sozdano,'+3 hours') = ?`)
        .get(z.napravlenie, z.sprint && z.god_sprinta ? require('./kalendar.js').kljuch_nedeli(z.god_sprinta,z.sprint) : '').n;
    } catch { novyh = 0; }
  }
                                                                 
                                                      
  let otpravleno = 0, otvetili = 0, vsego_v_rassylke = 0;
  if (z.rassylka_id) {
    try {
      otpravleno = db.prepare(
        'SELECT count(DISTINCT chelovek_id) n FROM rassylka_kasanija WHERE zadacha_id = ?')
        .get(z.id).n;
      otvetili = db.prepare(
        `SELECT count(*) n FROM rassylka_ljudi
         WHERE rassylka_id = ? AND status = 'otvetil'`).get(z.rassylka_id).n;
      vsego_v_rassylke = db.prepare(
        'SELECT count(*) n FROM rassylka_ljudi WHERE rassylka_id = ?')
        .get(z.rassylka_id).n;
    } catch {                                     }
  }

  return {
    telo: {
      nomer, zadacha_id: z.id, rassylka_id: z.rassylka_id || null,
      novyh, prezhnih,
      otpravleno, otvetili,
      vsego: vsego_v_rassylke || (novyh + prezhnih),
    },
  };
}

                                                                 
                                                                   
                                                               
                          
function nedeli_plan_fakt(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const week = require('./kalendar.js').nedelja_iz_zaprosa(ctx.zapros, ctx.zapros.den || segodnja());
  const nedelja = week.nomer;

  const plan = (() => {
    try {
      return db.prepare(
        'SELECT coalesce(sum(chasov), 0) s FROM grafik WHERE nedelja = ? AND god = ?')
        .get(nedelja, week.god).s;
    } catch { return 0; }
  })();

  const fakt = db.prepare(
    `SELECT count(*) n FROM zadachi
     WHERE sprint = ? AND god_sprinta=? AND status = 'sdelano' AND ${NE_UDAL}`).get(nedelja, week.god).n;

  const po_ljudjam = db.prepare(
    `SELECT z.otvetstvennyj chelovek_id, l.imja,
            count(*) zadach,
            sum(CASE WHEN z.status = 'sdelano' THEN 1 ELSE 0 END) sdelano
     FROM zadachi z LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
     WHERE z.sprint = ? AND z.god_sprinta=? AND ${NE_UDAL.replace(/udaleno/g, 'z.udaleno')}
       AND z.otvetstvennyj IS NOT NULL
     GROUP BY z.otvetstvennyj ORDER BY l.imja`).all(nedelja, week.god).map((r) => {
    const chasov = (() => {
      try {
        return db.prepare(
          'SELECT coalesce(sum(chasov), 0) s FROM grafik WHERE nedelja = ? AND god = ? AND chelovek_id = ?')
          .get(nedelja, week.god, r.chelovek_id).s;
      } catch { return 0; }
    })();
    return { ...v_api(r), plan_chasov: chasov };
  });

                                                                 
                                                                 

  return {
    telo: {
      nedelja,
      nomer: nedelja,
      ...week,
      plan_sum: plan,
      summa_fakta: fakt,
      po_ljudjam,
    },
  };
}

                                                                  
                                                                      
                                                                      
                                                                 
                                                            
function nedeli_rassylki_s_dolgom(ctx) {
  const bazovyj = nedeli_rassylki(ctx);
  const db = baza();
  const week=require('./kalendar.js').nedelja_iz_zaprosa({...ctx.zapros,nedelja:ctx.kljuch},segodnja());
  const nedelja=week.nomer;
  const vzjat = (sql, ...a) => {
    try { return db.prepare(sql).all(...a); } catch { return []; }
  };
                                                                    
                                                                     
  const fakt = new Map(vzjat(
    `SELECT rassylka_id, count(*) n FROM rassylka_ljudi
      WHERE otpravleno_at IS NOT NULL
        AND date(otpravleno_at,'+3 hours') BETWEEN ? AND ?
      GROUP BY rassylka_id`, week.nachalo, week.konec).map((r) => [r.rassylka_id, r.n]));
  const plany = new Map(vzjat(
    'SELECT rassylka_id, plan_soobshenij FROM rassylka_plan WHERE nedelja = ? AND god = ?',
    nedelja, week.god).map((r) => [r.rassylka_id, r.plan_soobshenij]));

  const rassylki = vzjat(
    "SELECT id, nazvanie, napravlenie, status FROM rassylki WHERE status <> 'zavershena'"
  ).map((r) => {
    const plan_nedeli = plany.has(r.id) ? (plany.get(r.id) || 0) : 0;
    const otpravleno_za_nedelyu = fakt.get(r.id) || 0;
                                                                 
                                                         
    const vypolneno_procent = plan_nedeli > 0
      ? Math.round((otpravleno_za_nedelyu / plan_nedeli) * 100) : null;
    return { ...v_api(r), plan_nedeli, otpravleno_za_nedelyu, vypolneno_procent };
  });

  return {
    telo: {
      ...bazovyj.telo,
      rassylki,
      plan_nedeli: rassylki.reduce((a, r) => a + r.plan_nedeli, 0),
      otpravleno_za_nedelyu: rassylki.reduce((a, r) => a + r.otpravleno_za_nedelyu, 0),
    },
  };
}

                                                                   
                                                                 
                                
function svodka_s_tekstom(ctx) {
  const bazovaja = require('./ekrany.js').svodka(ctx);
  const s = bazovaja.telo;
  const stroki = [
    `Задач: ${s.vsego}`,
    `Сделано: ${s.sdelano}`,
    `В работе: ${s.v_processe}`,
    `На согласовании: ${s.na_soglasovanii}`,
  ];
  if (s.prosrocheno) stroki.push(`Просрочено: ${s.prosrocheno}`);
  return { telo: { ...s, tekst: stroki.join('\n') } };
}

                                                                
                                                              
function zadachi_po_nomeru_s_410(ctx) {
  const db = baza();
  const nomer = Number(ctx.zapros.nomer);
  if (!Number.isInteger(nomer)) return null;                   
  const z = db.prepare('SELECT * FROM zadachi WHERE nomer = ?').get(nomer);
  if (!z) {
    return { kod: 404, telo: { oshibka: 'такой задачи нет', nomer } };
  }
  if (!z.udaleno) return null;                                                 

  const kto = db.prepare(
    `SELECT kto, kogda FROM zhurnal WHERE obekt = 'zadacha' AND obekt_id = ?
       AND pole = 'udaleno' ORDER BY id DESC LIMIT 1`).get(z.id);
  const imja = kto && kto.kto
    ? (db.prepare('SELECT imja FROM ljudi WHERE id = ?').get(kto.kto) || {}).imja
    : null;
  return {
    kod: 410,
    telo: {
      status: 'deleted',
      nomer: z.nomer,
      nazvanie: z.nazvanie,
      napravlenie: z.napravlenie,
      udaleno: kto ? kto.kogda : null,
      kto_udalil: imja,
      oshibka: 'эта задача удалена',
    },
  };
}

                                                                     
                                        
function shablony_s_vidom(ctx) {return {telo:require('./shablony.js').list(baza(),ctx.avtor,ctx.zapros)};}

module.exports.proekt_s_dengami = proekt_s_dengami;
module.exports.rassylka_s_bazoj = rassylka_s_bazoj;
module.exports.dengi_svodka_po_uslugam = dengi_svodka_po_uslugam;
module.exports.zadachi_fakt = zadachi_fakt;
module.exports.nedeli_rassylki_s_dolgom = nedeli_rassylki_s_dolgom;
module.exports.svodka_s_tekstom = svodka_s_tekstom;
module.exports.zadachi_po_nomeru_s_410 = zadachi_po_nomeru_s_410;
module.exports.shablony_s_vidom = shablony_s_vidom;
module.exports.nedeli_plan_fakt = nedeli_plan_fakt;

                                                           

                                                               
  
                                                                
                                                                   
                                                                   
                                                               
                                               
function zadachi_pohozhie(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const proekt = parseInt(ctx.zapros.proekt || ctx.kljuch, 10);
  if (!Number.isInteger(proekt)) {
    throw new OshibkaVvoda('нужен proekt: похожесть не угадывается, '
      + 'показываются открытые задачи проекта', 'proekt');
  }
  const spisok = db.prepare(
    `SELECT z.nomer, z.nazvanie, z.status, z.srok, z.tip, l.imja otvetstvennyj_imja
       FROM zadachi z LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
      WHERE z.proekt_id = ? AND z.status != 'sdelano'
        AND (z.udaleno IS NULL OR z.udaleno = 0)
      ORDER BY z.srok IS NULL, z.srok, z.nomer`).all(proekt).map(v_api);
  return { telo: { proekt, vsego: spisok.length, spisok,
                   pojasnenie: 'это открытые задачи проекта, а не угаданные похожие' } };
}

                                                           
  
                                                                   
                                                               
                   
function okr_vehi(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const period = ctx.zapros.period || ctx.kljuch || null;
  const uslovie = period ? 'AND c.period_id = ?' : '';
  const z = period ? [period] : [];
  const spisok = db.prepare(
    `SELECT r.id, r.cel_id, r.nazvanie, r.kto_otvechaet, c.nazvanie cel,
            c.napravlenie, c.period_id
       FROM rezultaty r JOIN celi c ON c.id = r.cel_id
      WHERE r.tip = 'veha' ${uslovie}
      ORDER BY c.napravlenie, r.id`).all(...z).map(v_api);
  return { telo: { period, vsego: spisok.length, spisok } };
}

                                                          
  
                                                              
                                    
function okr_veha_zadacha(ctx) {
  tolko(ctx.metod, 'POST');
  const r=baza().prepare('SELECT tip FROM rezultaty WHERE id=?').get(Number(ctx.kljuch));
  if(!r)throw new NeNajdeno('вехи нет');
  if(r.tip!=='veha')throw new OshibkaVvoda('сделать задачей можно веху', 'rezultat_id');
  if(ctx.telo.rezultat_id!==undefined && Number(ctx.telo.rezultat_id)!==Number(ctx.kljuch)) {
    throw new OshibkaVvoda('результат в адресе и теле должен совпадать','rezultat_id');
  }
  return okr_zadachi({...ctx,telo:{...ctx.telo,rezultat_id:Number(ctx.kljuch)}});
}

function okr_zadachi(ctx) {
  const db = baza();
                                                               
                                                                   
                                                              
  if (ctx.metod === 'POST') {
    const t = ctx.telo || {};
    const rezultat_id = parseInt(t.rezultat_id ?? ctx.kljuch, 10);
    if (!Number.isInteger(rezultat_id)) {
      throw new OshibkaVvoda('нужен rezultat_id', 'rezultat_id');
    }
    const r = db.prepare(
      `SELECT r.id, r.nazvanie, r.kto_otvechaet, r.cel_id, c.napravlenie
         FROM rezultaty r JOIN celi c ON c.id = r.cel_id
        WHERE r.id = ?`).get(rezultat_id);
    if (!r) throw new NeNajdeno(`результата ${rezultat_id} нет`);

    const { sozdat } = require('./obschij.js');
    const zadacha = sozdat('zadachi', require('./opisanija.js').OPISANIJA.zadachi, {
      nazvanie: t.nazvanie || r.nazvanie, napravlenie: r.napravlenie,
      otvetstvennyj: t.otvetstvennyj ?? r.kto_otvechaet ?? ctx.avtor,
      tip: t.tip || 'vnutrennjaja', cel_id: r.cel_id, rezultat_id,
    }, ctx.avtor);
    return { kod: 201, telo: zadacha };
  }

  tolko(ctx.metod, 'GET');
                                                            
  const links=require('./okr-svjazi.js');
  if (ctx.zapros.rezultat!==undefined) {
    const rezultat=links.id(ctx.zapros.rezultat,'rezultat'),row=db.prepare('SELECT cel_id FROM rezultaty WHERE id=?').get(rezultat);if(!row)throw new NeNajdeno('Результат недоступен');links.goal(db,row.cel_id,ctx.avtor);
    const spisok = db.prepare(
      `SELECT z.id,z.nomer, z.nazvanie, z.status, z.napravlenie,z.srok, z.sprint,z.versija,z.cel_id, z.rezultat_id,
              l.imja otvetstvennyj_imja
         FROM zadachi z LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
        WHERE z.rezultat_id = ? AND (z.udaleno IS NULL OR z.udaleno = 0)
        ORDER BY z.status = 'sdelano', z.srok IS NULL, z.srok`).all(rezultat).map(v_api);
    const zakryto = spisok.filter((x) => x.status === 'sdelano').length;
    return { telo: { rezultat, vsego: spisok.length, zakryto,
                     otkryto: spisok.length - zakryto, spisok } };
  }
  const cel = links.goal(db,ctx.zapros.cel??ctx.kljuch,ctx.avtor).id;
  const spisok = db.prepare(
    `SELECT z.id, z.nomer, z.nazvanie, z.status,z.napravlenie, z.srok, z.sprint, z.versija, z.cel_id, z.rezultat_id,
            l.imja otvetstvennyj_imja
       FROM zadachi z LEFT JOIN ljudi l ON l.id = z.otvetstvennyj
      WHERE ${links.goalKey('z')} = ? AND (z.udaleno IS NULL OR z.udaleno = 0)
      ORDER BY z.status = 'sdelano', z.srok IS NULL, z.srok`).all(cel).map(v_api);
  const zakryto = spisok.filter((x) => x.status === 'sdelano').length;
  return { telo: { cel, vsego: spisok.length, zakryto,
                   otkryto: spisok.length - zakryto, spisok } };
}

                                                                   
  
                                                                
                     
function strategija_zadachi(ctx) {
  tolko(ctx.metod, 'GET');
  return {telo:require('./strategija-celi.js').tasks(baza(),ctx.zapros.tezis??ctx.kljuch,ctx.avtor)};
}

                                                                 
  
                                                                  
                                                               
                                             
function napravlenija_vkladki(ctx) {
  tolko(ctx.metod, 'GET');
  const db = baza();
  const kod = ctx.zapros.kod || ctx.kljuch;
  if (!kod) throw new OshibkaVvoda('нужен kod направления', 'kod');
  const n = db.prepare('SELECT * FROM napravlenija WHERE kod = ?').get(kod);
  if (!n) throw new NeNajdeno(`направления «${kod}» нет`);
  const est_klienty = db.prepare(
    `SELECT count(*) n FROM sotrudnichestva WHERE napravlenie = ?`).get(kod).n > 0;
  const spisok = [
    { kod: 'kontekst', imja: 'контекст' },
    { kod: 'strategija', imja: 'стратегия' },
    { kod: 'proekty', imja: 'проекты' },
    ...(est_klienty ? [{ kod: 'klienty', imja: 'клиенты' }] : []),
    { kod: 'kontent', imja: 'контент-план' },
    { kod: 'socseti', imja: 'соцсети' },
    { kod: 'sajt', imja: 'сайт' },
    ...(est_klienty ? [{ kod: 'rassylki', imja: 'рассылки' }] : []),
    { kod: 'materialy', imja: 'материалы' },
  ];
  return { telo: { kod, est_klienty, spisok } };
}

                                                                    
  
                                                             
                                                                
                      
function napravlenija_porjadok(ctx) {
  if (ctx.metod !== 'PATCH' && ctx.metod !== 'POST') {
    throw Object.assign(new Error('сюда PATCH или POST'), { kod: 405 });
  }
  const db = baza();
  const spisok = (ctx.telo || {}).porjadok;
  if (!Array.isArray(spisok) || !spisok.length) {
    throw new OshibkaVvoda('нужен porjadok: список кодов направлений '
      + 'в нужном порядке', 'porjadok');
  }
  const est = new Set(db.prepare('SELECT kod FROM napravlenija').all().map((r) => r.kod));
  const chuzhie = spisok.filter((k) => !est.has(k));
  if (chuzhie.length) {
    throw new OshibkaVvoda(`таких направлений нет: ${chuzhie.join(', ')}`, 'porjadok');
  }
  v_odnoj_tranzakcii(db, () => {
    const pravka = db.prepare('UPDATE napravlenija SET porjadok = ? WHERE kod = ?');
    spisok.forEach((kod, i) => pravka.run(i + 1, kod));
  });
  return { telo: { porjadok: spisok, obnovleno: spisok.length } };
}

                                                         
  
                                                              
                                                       
function fajly_privjazki(ctx) {
  tolko(ctx.metod, 'GET');
  return {telo:require('./materialy-komandy.js').links(Number(ctx.zapros.fajl||ctx.kljuch),ctx.zapros.obekt)};

}

module.exports.zadachi_pohozhie = zadachi_pohozhie;
module.exports.okr_vehi = okr_vehi;
module.exports.okr_zadachi = okr_zadachi;
module.exports.okr_veha_zadacha = okr_veha_zadacha;
module.exports.strategija_zadachi = strategija_zadachi;
module.exports.napravlenija_vkladki = napravlenija_vkladki;
module.exports.napravlenija_porjadok = napravlenija_porjadok;
module.exports.fajly_privjazki = fajly_privjazki;

                  

                                                              
                                                                     
  
                                                                 
                                                                 
                                                                  
function ljudi_kasanija(ctx) {
  const db = baza();
  const chelovek = Number(ctx.kljuch ?? ctx.zapros.chelovek_id);
  if (!Number.isSafeInteger(chelovek)||chelovek<1) throw new OshibkaVvoda('нужен человек', 'chelovek_id');
  const est = db.prepare('SELECT id, imja FROM ljudi WHERE id = ?').get(chelovek);
  if (!est) throw new NeNajdeno(`человека ${chelovek} нет`);

  if (ctx.metod === 'POST') {
    return v_odnoj_tranzakcii(db,()=>{
      const telo=ctx.telo||{};
      for(const field of Object.keys(telo))if(!['sostojalos','chto','srok','napravlenie','proekt_id','sotrudnichestvo_id','versija_sotrudnichestva','otvetstvennyj','nazvanie','zapros_kljuch'].includes(field))throw new OshibkaVvoda('Неизвестное поле: '+field,field);
      const requests=require('./zapros-zadachi.js'),replayed=requests.povtor(db,Number(ctx.avtor),chelovek,telo);if(replayed)return {kod:200,telo:replayed};
      if(telo.sostojalos!==undefined&&typeof telo.sostojalos!=='boolean')throw new OshibkaVvoda('sostojalos: да или нет','sostojalos');
      if(telo.chto!==undefined&&telo.chto!=='otmetit')throw new OshibkaVvoda('chto: otmetit','chto');
      const bylo=telo.sostojalos===true||telo.chto==='otmetit',srok=bylo?segodnja():telo.srok;
      if(!srok)throw new OshibkaVvoda('У следующей задачи срок обязателен','srok');
      const week=require('./kalendar.js').iso_nedelja(srok);
      const linkedID=field=>{if(telo[field]===undefined||telo[field]===null)return null;const id=Number(telo[field]);if(!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('Нужен номер записи',field);return id;};
      const proekt=linkedID('proekt_id'),cooperation=linkedID('sotrudnichestvo_id');
      if(telo.versija_sotrudnichestva!==undefined){
        if(!cooperation)throw new OshibkaVvoda('Нужен номер сотрудничества','sotrudnichestvo_id');
        const role=db.prepare('SELECT * FROM sotrudnichestva WHERE id=?').get(cooperation);if(!role)throw new NeNajdeno('Сотрудничества больше нет');
        if(role.chelovek_id!==chelovek)throw Object.assign(new Error('Сотрудничество теперь относится к другому человеку'),{kod:409,dannye:{scope_changed:true}});
        try{require('./versii.js').proverit(db,'sotrudnichestva',role,telo.versija_sotrudnichestva,['chelovek_id','napravlenie']);}catch(error){if(error.kod===409){error.message='Сотрудничество изменилось. Обнови карточку перед созданием задачи.';error.dannye={...error.dannye,scope_changed:true};}throw error;}
      }
      let napravlenie=telo.napravlenie
        ||(proekt&&db.prepare('SELECT napravlenie FROM proekty WHERE id=?').get(proekt)?.napravlenie)
        ||(cooperation&&db.prepare('SELECT napravlenie FROM sotrudnichestva WHERE id=?').get(cooperation)?.napravlenie);
      if(!napravlenie){
        const directions=db.prepare('SELECT DISTINCT napravlenie FROM sotrudnichestva WHERE chelovek_id=? ORDER BY napravlenie').all(chelovek).map(row=>row.napravlenie);
        if(directions.length>1)throw Object.assign(new Error('Выбери направление задачи'),{kod:409,dannye:{direction_required:true,napravlenija:directions}});
        napravlenie=directions[0];
      }
      if(!napravlenie)throw new OshibkaVvoda(`У ${est.imja} нет направления: выбери его для задачи`,'napravlenie');
      const communicationRole=bylo?db.prepare("SELECT id,versija FROM sotrudnichestva WHERE chelovek_id=? AND napravlenie=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,CASE rol WHEN 'klient' THEN 0 WHEN 'lid' THEN 1 ELSE 2 END,id LIMIT 1").get(chelovek,napravlenie,cooperation):null;
      if(bylo&&!communicationRole)throw new OshibkaVvoda('Сначала добавь человеку направление, чтобы отметить состоявшееся общение','napravlenie');
      const common=require('./obschij.js'),opisanie=require('./opisanija.js').OPISANIJA.zadachi,avtor=Number(ctx.avtor);
      const created=common.sozdat('zadachi',opisanie,{
        nazvanie:telo.nazvanie??(bylo?`Касание по ${est.imja}`:`Следующее касание по ${est.imja}`),
        napravlenie,tip:'kasanie',status:'v_plane',sprint:week.nomer,god_sprinta:week.god,srok,
        otvetstvennyj:Object.hasOwn(telo,'otvetstvennyj')?telo.otvetstvennyj:avtor,
        klient_id:chelovek,proekt_id:proekt,sotrudnichestvo_id:cooperation,shablon:'sledujuschee_kasanie'
      },avtor);
      const result=bylo?require('./podruchki.js').PODRUCHKI_KODA.zadachi.zakryt({kljuch:created.nomer,telo:{versija:created.versija},metod:'POST',avtor}).telo:created;
                                                                              
                                                                            
      if(bylo)require('./podruchki.js').PODRUCHKI_KODA.sotrudnichestva.kasanie({kljuch:communicationRole.id,metod:'POST',avtor,telo:{chelovek_id:chelovek,versija:communicationRole.versija,kogda:srok,otkuda:'ruchnaja'}});
      common.v_zhurnal(db,'zadachi',created.id,'kasanie',null,bylo?'отмечено':'запланировано',avtor);
      const response={...created,...result,sprosit_pro_sledujuschee:bylo};requests.zapomnit(db,avtor,chelovek,telo,response);
      return {kod:201,telo:response};
    });
  }

  tolko(ctx.metod, 'GET');
  if(ctx.zapros.zapros_kljuch!==undefined)return {telo:require('./zapros-zadachi.js').proverit(db,Number(ctx.avtor),chelovek,ctx.zapros.zapros_kljuch)};
  const schet = (uslovie, ...z) => db.prepare(
    `SELECT count(*) n FROM zadachi WHERE tip = 'kasanie' AND klient_id = ?
       AND (udaleno IS NULL OR udaleno = 0) ${uslovie}`).get(chelovek, ...z).n;
  const bylo = schet("AND status = 'sdelano'");
  const zaplanirovano = db.prepare(
    `SELECT nomer, nazvanie, srok, proekt_id FROM zadachi
      WHERE tip = 'kasanie' AND klient_id = ? AND status != 'sdelano'
        AND (udaleno IS NULL OR udaleno = 0)
      ORDER BY srok IS NULL, srok LIMIT 1`).get(chelovek);
  const poslednee = db.prepare(
    `SELECT nomer, nazvanie, srok FROM zadachi
      WHERE tip = 'kasanie' AND klient_id = ? AND status = 'sdelano'
        AND (udaleno IS NULL OR udaleno = 0)
      ORDER BY srok DESC, nomer DESC LIMIT 1`).get(chelovek);

                                                                    
                                                                  
    
                                                                      
                                                                       
                                                                     
                                                         
                                                                      
                                       
    
                                                                   
                                                             
  const stal_klientom = (() => {
    try {
      return db.prepare(
        `SELECT kogda FROM zhurnal WHERE obekt = 'sotrudnichestvo'
           AND pole = 'rol' AND stalo = 'klient'
           AND obekt_id IN (SELECT id FROM sotrudnichestva WHERE chelovek_id = ?)
         ORDER BY kogda LIMIT 1`).get(chelovek)?.kogda || null;
    } catch { return null; }
  })();

  return { telo: {
    chelovek_id: chelovek, imja: est.imja,
    vsego: bylo,
    poslednee: poslednee ? v_api(poslednee) : null,
    zaplanirovano: zaplanirovano ? v_api(zaplanirovano) : null,
                                                        
    po_proektam: db.prepare(
      `SELECT p.id proekt_id, p.nazvanie, count(z.id) n
         FROM zadachi z JOIN proekty p ON p.id = z.proekt_id
        WHERE z.tip = 'kasanie' AND z.klient_id = ? AND z.status = 'sdelano'
          AND (z.udaleno IS NULL OR z.udaleno = 0)
        GROUP BY p.id ORDER BY n DESC`).all(chelovek).map(v_api),
    konversija: stal_klientom ? {
      stal_klientom,
      kasanij_do: schet("AND status = 'sdelano' AND srok <= ?", stal_klientom.slice(0, 10)),
    } : null,
  } };
}

module.exports.ljudi_kasanija = ljudi_kasanija;

                                                                         
                                                                         
                                                
module.exports.metrika_akkaunta = metrika_akkaunta;
module.exports.mediana = require('./metriki-akkaunta.js').mediana;
