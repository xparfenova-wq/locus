                                                              
  
                                                                      
                                                                           
                                                        
  
                                                                       
                                                           

const {
  baza, polja, v_api, v_bazu, v_odnoj_tranzakcii,
  OshibkaVvoda, NeNajdeno, Konflikt, NetDostupa, seichas, segodnja: den_msk } = require('../db/db.js');
const { v_zhurnal, OBEKT_ZHURNALA, TABLICA_OBEKTA,
        PODPIS_OBEKTA } = require('./obschij.js');

                                                                
                                          
                                                            
                                                              
function soderzhit(gde, chto) {
  if (!gde) return false;
  const n = (s) => String(s).toLowerCase().replace(/ё/g, 'е');
  return n(gde).includes(n(chto));
}

const OTKRYTA = "status NOT IN ('sdelano','kogda_nibud')";
const NE_UDALENA = '(udaleno IS NULL OR udaleno = 0)';

function tolko(metod, nado) {
  if (metod !== nado) {
    throw Object.assign(new Error(`сюда только ${nado}`), { kod: 405 });
  }
}

function chislo(x, imja) {
  const n = parseInt(x, 10);
  if (!Number.isInteger(n)) throw new OshibkaVvoda(`${imja} должен быть числом`, imja);
  return n;
}

                                                          
function chelovek(db, id) {
  const c = db.prepare('SELECT * FROM ljudi WHERE id = ?').get(chislo(id, 'id'));
  if (!c) throw new NeNajdeno(`человека ${id} нет`);
  return c;
}

                                                                   
                                                        
                                                        
                                                           
  
                                                                      
                                                               
                                                                      
                                                 
  
                                                                    
                                                                       
                                                                   
const { den_po_pravilu, nepokrytye_dni, podpis_propuskov,
  sostojanie: povtor_sostojanie } = require('./povtory.js');

                                                                      
function zadacha(db, nomer) {
  const z = db.prepare(`SELECT * FROM zadachi WHERE nomer = ? AND ${NE_UDALENA}`)
    .get(chislo(nomer, 'nomer'));
  if (!z) throw new NeNajdeno(`задачи ${nomer} нет`);
  return z;
}

                                                                         
                                                                        
function zhurnal_stroki(db, { obekt, obekt_id, kto, pole, s_daty, po_datu, skolko }) {
  const uslovija = [];
  const znachenija = [];
  if (obekt) {
                                                                       
                                                      
    const znachenie = OBEKT_ZHURNALA[obekt] || obekt;
    if (!PODPIS_OBEKTA[znachenie]) {
      throw new OshibkaVvoda(`журнал не знает объект «${obekt}»`, 'obekt');
    }
    uslovija.push('z.obekt = ?');
    znachenija.push(znachenie);
  }
  if (obekt_id !== undefined) {
    uslovija.push('z.obekt_id = ?');
    znachenija.push((OBEKT_ZHURNALA[obekt]||obekt)==='napravlenie'?String(obekt_id):chislo(obekt_id,'obekt_id'));
  }
  if (kto) { uslovija.push('z.kto = ?'); znachenija.push(chislo(kto, 'kto')); }
  if (pole) { uslovija.push('z.pole = ?'); znachenija.push(pole); }
  if (s_daty) { uslovija.push('z.kogda >= ?'); znachenija.push(s_daty); }
  if (po_datu) { uslovija.push('z.kogda <= ?'); znachenija.push(po_datu); }
  const gde = uslovija.length ? `WHERE ${uslovija.join(' AND ')}` : '';
  const predel = Math.min(parseInt(skolko, 10) || 100, 500);
  const stroki = db.prepare(
    `SELECT z.*, l.imja kto_imja FROM zhurnal z
     LEFT JOIN ljudi l ON l.id = z.kto
     ${gde} ORDER BY z.kogda DESC, z.id DESC LIMIT ?`
  ).all(...znachenija, predel);
  const vsego = db.prepare(`SELECT count(*) k FROM zhurnal z ${gde}`).get(...znachenija).k;
                                                                         
  return {
    spisok: stroki.map((z) => ({
      ...v_api(z),
      chto: PODPIS_OBEKTA[z.obekt] || z.obekt,
      tablica: TABLICA_OBEKTA[z.obekt] || null,
    })),
    vsego,
  };
}

                                                                              
function zhurnal({ metod, zapros, avtor }) {
  tolko(metod, 'GET');
  const db = baza();
  const est_filtry = ['obekt', 'obekt_id', 'id', 'chelovek', 'kto', 'pole', 's_daty', 'po_datu']
    .some((k) => zapros[k] !== undefined);
  return { telo: require('./istorija-obekta.js').chitat(db,zapros,avtor,{defaultSince:est_filtry?null:nedelja_nazad()}) };
}

function nedelja_nazad() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString();
}

               

                                                       
function ljudi_istorija({ kljuch, metod, zapros, avtor }) {
  tolko(metod, 'GET');
  const db = baza();
  return { telo: require('./istorija-cheloveka.js').chitat(db,kljuch,zapros,avtor) };
}

                                                                     
function ljudi_celikom(ctx) {
  return v_odnoj_tranzakcii(baza(),()=>ljudi_celikom_vnutri(ctx));
}
function ljudi_celikom_vnutri({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const c = chelovek(db, kljuch);
  const id = c.id;
  const vzjat = (sql, ...p) => db.prepare(sql).all(...p).map((s) => v_api(s));

                                                                   
                                                                   
                                                               
                                                            
    
                                                                    
                                                    
  const zadachi_roli = db.prepare(
    `SELECT * FROM zadachi
     WHERE sotrudnichestvo_id = ? AND (klient_id IS NULL OR klient_id=?) AND ${OTKRYTA} AND ${NE_UDALENA}
     ORDER BY srok IS NULL, srok, nomer`);
  const sotrudnichestva = db.prepare(
    'SELECT * FROM sotrudnichestva WHERE chelovek_id = ? ORDER BY id')
    .all(id)
    .map((s) => {
      const svoi = zadachi_roli.all(s.id,id).map((z) => v_api(z));
      return { ...v_api(s), zadachi: svoi, zadach: svoi.length };
    });

  return {
    telo: {
      chelovek: {...v_api(c),...require('./opisanija.js').OPISANIJA.ljudi.dopolnit(db,c)},
      kontakty_napravlenij: vzjat(`SELECT s.id,s.napravlenie,s.chelovek_id,l.imja
        FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id
        WHERE s.kontakt_id=? ORDER BY s.id`,id),
      kontakty: require('./osnovnoj-kontakt.js').spisok(db,vzjat(`SELECT * FROM kontakty WHERE chelovek_id = ?
                       ORDER BY porjadok, id`, id)),
      sotrudnichestva,
      zadachi: vzjat(`SELECT * FROM zadachi
                      WHERE (klient_id = ? OR otvetstvennyj = ? OR (klient_id IS NULL AND sotrudnichestvo_id IN (SELECT id FROM sotrudnichestva WHERE chelovek_id=?)))
                        AND ${OTKRYTA} AND ${NE_UDALENA}
                      ORDER BY srok IS NULL, srok, nomer`, id, id, id),
      proekty: vzjat('SELECT * FROM proekty WHERE klient_id = ? ORDER BY id DESC', id),
      svjazi: vzjat(
        `SELECT s.*, ot.imja ot_imja, k.imja k_imja FROM svjazi s
         LEFT JOIN ljudi ot ON ot.id = s.ot_cheloveka
         LEFT JOIN ljudi k ON k.id = s.k_cheloveku
         WHERE s.ot_cheloveka = ? OR s.k_cheloveku = ?`, id, id),
      materialy: vzjat('SELECT * FROM materialy WHERE chelovek_id = ? ORDER BY id DESC', id),
    },
  };
}

                                                                         
function ljudi_chislo({ metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const nabor = polja('ljudi');
  const uslovija = [];
  const znachenija = [];
  if (zapros.arhiv !== '1') uslovija.push('(arhiv IS NULL OR arhiv = 0)');
  for (const [k, v] of Object.entries(zapros)) {
    if (k === 'arhiv') continue;
    if (!nabor.has(k)) throw new OshibkaVvoda(`неизвестное поле в фильтре: ${k}`, k);
    uslovija.push(`${k} = ?`);
    znachenija.push(v_bazu(v, k));
  }
  const gde = uslovija.length ? `WHERE ${uslovija.join(' AND ')}` : '';
  const k = db.prepare(`SELECT count(*) k FROM ljudi ${gde}`).get(...znachenija).k;
  return { telo: { chislo: k } };
}

                                                  
function ljudi_kontakty(ctx) {
  return v_odnoj_tranzakcii(baza(),()=>ljudi_kontakty_vnutri(ctx));
}
function ljudi_kontakty_vnutri({ kljuch, metod, zapros={}, telo={}, avtor }) {
  if(!['GET','POST'].includes(metod))throw Object.assign(new Error('сюда GET или POST'),{kod:405});
  const db = baza();
  chelovek(db, kljuch);
  const id=chislo(kljuch,'id');
  if(metod==='POST'){
    if(telo.chelovek_id!==undefined&&Number(telo.chelovek_id)!==id)throw new OshibkaVvoda('Контакт должен принадлежать человеку из адреса','chelovek_id');
    return {kod:201,telo:require('./obschij.js').sozdat('kontakty',require('./opisanija.js').OPISANIJA.kontakty,{...telo,chelovek_id:id},avtor)};
  }
  if(zapros.tip!==undefined){
    for(const key of Object.keys(zapros))if(key!=='tip')throw new OshibkaVvoda('Лишний параметр списка контактов',key);
    require('./vidy-kontaktov.js').proverit(zapros.tip);
    const group=require('./osnovnoj-kontakt.js').sostojanie(db,id,zapros.tip);
    return {telo:{spisok:group.spisok,osnovnaja_gruppa:group}};
  }
  const stroki = db.prepare(
    `SELECT * FROM kontakty WHERE chelovek_id = ?
     ORDER BY porjadok, id`
  ).all(id);
  return { telo: { spisok: require('./osnovnoj-kontakt.js').spisok(db,stroki.map((s) => v_api(s))) } };
}

                                                           
                                                                     
                                                                    
function ljudi_privedshie({ kljuch, metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
                                                                
                                                   
  const q = (zapros || {}).q;
  if (q && !kljuch) {
    const norma = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').trim();
    const stroki = db.prepare(
      `SELECT id, imja, gorod, foto, inicialy FROM ljudi
        WHERE imja_norm LIKE ? AND (arhiv IS NULL OR arhiv = 0)
        ORDER BY imja LIMIT 20`).all(`%${norma(q)}%`).map(v_api);
    return { telo: { spisok: stroki, vsego: stroki.length } };
  }
  chelovek(db, kljuch);
  const stroki = db.prepare(
    `SELECT l.imja, l.gorod, l.foto, l.inicialy,
            s.id sotrudnichestvo_id, s.chelovek_id, s.napravlenie, s.rol,
            s.stadija, s.istochnik
     FROM sotrudnichestva s
     JOIN ljudi l ON l.id = s.chelovek_id
     WHERE s.rekomendoval_id = ? ORDER BY l.imja`
  ).all(chislo(kljuch, 'id'));
  return { telo: { spisok: stroki.map((r) => v_api(r)), vsego: stroki.length } };
}

                                                                            
function ljudi_proverka_dublej({ metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const gruppy = db.prepare(
    `SELECT imja_norm, count(*) skolko, group_concat(id) ids
     FROM ljudi WHERE imja_norm IS NOT NULL
     GROUP BY imja_norm HAVING count(*) > 1 ORDER BY skolko DESC`
  ).all();
  return {
    telo: {
      spisok: gruppy.map((g) => ({
        imja_norm: g.imja_norm,
        skolko: g.skolko,
        ids: String(g.ids).split(',').map(Number),
      })),
      vsego: gruppy.length,
    },
  };
}

                                                                      
                                                                  
                                                                   
                                                        
function chelovek_ili_imja(db, kljuch) {
  const s = String(kljuch === undefined ? '' : kljuch).trim();
  if (!s) throw new OshibkaVvoda('нужен человек в адресе', 'id');
  if (/^\d+$/.test(s)) return chelovek(db, s);
  const n = norma_imeni(s);
                                                                         
                                                           
  const vse = db.prepare('SELECT * FROM ljudi').all();
  const tochno = vse.find((c) => norma_imeni(c.imja) === n);
  if (tochno) return tochno;
  const po_translitu = vse.find((c) => translit(norma_imeni(c.imja)) === n);
  if (po_translitu) return po_translitu;
  throw new NeNajdeno(`человека «${s}» нет`);
}

function norma_imeni(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

                                                              
                                                                     
const BUKVY = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'ju', я: 'ja',
};

function translit(s) {
  return String(s || '').split('').map((b) => (BUKVY[b] !== undefined ? BUKVY[b] : b)).join('');
}

                                                          
  
                                                                         
                                                                  
function ljudi_akkaunty({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const c = chelovek_ili_imja(db, kljuch);
  const stroki = db.prepare(
    `SELECT a.*, p.nazvanie proekt_nazvanie FROM akkaunty a
     JOIN proekty p ON p.id = a.proekt_id
     WHERE COALESCE(a.udalen,0)=0 AND p.klient_id=?
     ORDER BY a.porjadok, a.id`
  ).all(c.id);
  const vedet=db.prepare(`SELECT a.*,p.nazvanie proekt_nazvanie FROM akkaunty a LEFT JOIN proekty p ON p.id=a.proekt_id WHERE a.vladelec=? AND COALESCE(a.udalen,0)=0 AND (p.klient_id IS NULL OR p.klient_id<>?) ORDER BY a.porjadok,a.id`).all(c.id,c.id);
  return {
    telo: {
      chelovek_id: c.id,
      spisok: stroki.map((s) => v_api(s)),
      vedet: vedet.map(v_api), vedet_vsego: vedet.length,
      vsego: stroki.length,
    },
  };
}

                                                                             
  
                                                                      
                                                                
                                                     
const POLJA_ANKETY = require('../public/js/anketa.js').polja;

function ljudi_anketa({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const c = chelovek_ili_imja(db, kljuch);
  const a = db.prepare('SELECT * FROM anketa WHERE chelovek_id = ?').get(c.id);
  const bloki = [];
  if (a) {
    for (const [pole, podpis] of POLJA_ANKETY) {
      const v = a[pole];
      if (v === null || v === undefined || String(v).trim() === '') continue;
      bloki.push({ pole, podpis: require('../public/js/anketa.js').podpis(pole,c.pol), znachenie: v });
    }
  }
  return {
    telo: {
      chelovek_id: c.id,
      imja: c.imja,
                                                                   
                                                             
      bloki,
      zapolneno: bloki.length,
      vsego_polej: POLJA_ANKETY.length,
    },
  };
}

                                                                        
  
                                                                   
                                                                     
                                                    
function ljudi_dejstvija({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const c = chelovek_ili_imja(db, kljuch);
  const osnovnoj = (tip) => {
    const k = db.prepare(
      `SELECT znachenie FROM kontakty WHERE chelovek_id = ? AND tip = ?
       ORDER BY osnovnoj DESC, porjadok, id LIMIT 1`
    ).get(c.id, tip);
    return k ? k.znachenie : null;
  };
  const pochta = osnovnoj('pochta');
  const telefon = osnovnoj('telefon');
  const telegram = osnovnoj('telegram');
                                                                   
                                                                    
                                                            
  const dostupnye_dejstvija = [
    { kod: 'napisat', podpis: 'Написать', vykljuchen: false, znachenie: pochta },
    { kod: 'pozvonit', podpis: 'Позвонить', vykljuchen: false, znachenie: telefon },
    { kod: 'telegram', podpis: 'Телеграм', vykljuchen: false, znachenie: telegram },
    { kod: 'sozdat_zadachu', podpis: 'Создать задачу', vykljuchen: false },
    { kod: 'dobavit_v_proekt', podpis: 'Добавить в проект', vykljuchen: false },
    { kod: 'otmetit_obshenie', podpis: 'Отметить общение', vykljuchen: false },
  ];
  return {
    telo: {
      chelovek_id: c.id,
      arhiv: c.arhiv === 1,
      dostupnye_dejstvija,
    },
  };
}

                                                                     
const { tolko_admin } = require('./dostup.js');

                                                                
function ljudi_dostup({ kljuch, telo, metod, avtor }) {
  tolko(metod, 'PATCH');
  const db = baza();
  tolko_admin(db, avtor);
  const c = chelovek_ili_imja(db, kljuch);
  const dostup = String(telo.dostup || '');
  if (!['polnyj', 'bez_deneg'].includes(dostup)) {
    throw new OshibkaVvoda('dostup: polnyj или bez_deneg', 'dostup');
  }
  if (c.dostup === dostup) return { telo: v_api(c) };
  db.prepare('UPDATE ljudi SET dostup = ?, versija = COALESCE(versija, 0) + 1 WHERE id = ?')
    .run(dostup, c.id);
                                                             
  v_zhurnal(db, 'ljudi', c.id, 'dostup', c.dostup || null, dostup, avtor);
  const stalo = db.prepare('SELECT * FROM ljudi WHERE id = ?').get(c.id);
  return { telo: v_api(stalo) };
}

                                                                                
  
                                                                    
                                                                    
                                                                  
                                                               

                                                                             
  
                                                                         
                                                                        
                                                                 
function ljudi_rassylki({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const c = chelovek_ili_imja(db, kljuch);
  const stroki = db.prepare(
    `SELECT rl.id, rl.rassylka_id, rl.status, rl.otpravleno_at, rl.otvet_at,
            rl.zametka, r.nazvanie, r.napravlenie, r.ploshadka
     FROM rassylka_ljudi rl
     LEFT JOIN rassylki r ON r.id = rl.rassylka_id
     WHERE rl.chelovek_id = ? ORDER BY rl.id DESC`
  ).all(c.id);
  return {
    telo: { chelovek_id: c.id, spisok: stroki.map((s) => v_api(s)), vsego: stroki.length },
  };
}

                                                                          
                                                                   
  
                                                                   
                                                                    
                                            
function ljudi_zagruzka(ctx) {
  if (ctx.kljuch !== undefined) return zagruzka_cheloveka(ctx);
  return zagruzka_spiska(ctx);
}

                                                                     
                                                                
                                          
function zagruzka_cheloveka({ kljuch, metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const c = chelovek_ili_imja(db, kljuch);
  const calendar = require('./kalendar.js');
  const week = calendar.nedelja_iz_zaprosa(zapros, zapros.den || require('./parametry-analitiki.js').today(db));
  const nedelja = week.nomer;

                                                                      
                                          
  const schedule = db.prepare(
    'SELECT COALESCE(sum(chasov), 0) s, count(chasov) days FROM grafik WHERE chelovek_id = ? AND nedelja = ? AND god = ?'
  ).get(c.id, nedelja, week.god);
  const chasov = schedule.s, est_grafik = schedule.days > 0;
                                                                   
                                               
  const peregruz_po_chasam = chasov > 40;

  const zadach = db.prepare(
    `SELECT count(*) k FROM zadachi
     WHERE otvetstvennyj = ? AND ${OTKRYTA} AND ${NE_UDALENA}`
  ).get(c.id).k;
  const load=require('./nagruzka.js').nagruzka(db,{den:zapros.den||require('./parametry-analitiki.js').today(db),week,chelovek_id:c.id})[0];
  const zadach_nedeli=load?.otkryto??0,mediana=load?.mediana??null;

  return {
    telo: { peregruz_po_chasam,
      chelovek_id: c.id,
      imja: c.imja,
      nedelja,
      god: week.god,
      chasov,
      est_grafik,
      zapolneno_dnej: schedule.days,
      zadach,
      zadach_nedeli,
      mediana_zakrytyh: mediana,
      nepustyh_nedel: load?.nepustyh_nedel??0,
      porog_peregruza: load?.porog??null,
                                                                  
      podsvetit: mediana !== null && zadach_nedeli > mediana,
                                                                     
      podskazka: require('../public/js/task-workload.js').describe({imja:c.imja,chasov,zadach_nedeli,est_grafik}),
    },
  };
}

                                                                          
  
                                                                  
                                                                  
                                                                  
                                        
function zagruzka_spiska({ telo, metod, avtor }) {
  tolko(metod, 'POST');
  const db = baza();
  const stroki = Array.isArray(telo.stroki) ? telo.stroki : null;
  if (!stroki || !stroki.length) throw new OshibkaVvoda('нужен массив stroki', 'stroki');
  if (stroki.length > 5000) throw new OshibkaVvoda('не больше 5000 строк за раз', 'stroki');

  let rassylka_id = null;
  if (telo.rassylka_id !== undefined && telo.rassylka_id !== null) {
    rassylka_id = chislo(telo.rassylka_id, 'rassylka_id');
    if (!db.prepare('SELECT 1 FROM rassylki WHERE id = ?').get(rassylka_id)) {
      throw new NeNajdeno(`рассылки ${rassylka_id} нет`);
    }
  }

  const itog = {
    dobavleno: 0,                                         
    najdeno_dublej: 0,                               
    privjazano: 0,                                          
    propuscheno: 0,                          
    dubli: [],
    propuscheno_kontaktnyh: 0,
    kontaktnye_lica: [],
    trebuet_sopostavlenija: [],
  };
  const common=require('./obschij.js'),{OPISANIJA,norma_kontakta}=require('./opisanija.js');

                                                               
  const vnutri = (spisok) => {
    for (const s of spisok) {
      const imja = String(s.imja || '').trim();
      if (!imja) { itog.propuscheno += 1; continue; }
      const n = norma_imeni(imja);
      let id,est;
      const contacts=[['pochta',s.pochta],['telegram',s.telegram],['telefon',s.telefon]].filter(([,v])=>String(v??'').trim());
      const names=db.prepare('SELECT id,imja,rol_v_baze FROM ljudi WHERE imja_norm=?').all(n);
      if(s.chelovek_id!=null){
        est=db.prepare('SELECT id,imja,rol_v_baze FROM ljudi WHERE id=?').get(chislo(s.chelovek_id,'chelovek_id'));
        if(!est)throw new NeNajdeno('человека нет');
      }else{
        const matches=new Map(),incompatible=new Map();
        for(const [tip,value] of contacts){
          const norm=norma_kontakta(String(value),tip);
          for(const person of db.prepare('SELECT DISTINCT l.id,l.imja,l.rol_v_baze FROM kontakty k JOIN ljudi l ON l.id=k.chelovek_id WHERE k.tip=? AND k.znachenie_norm=?').all(tip,norm)){
            if(norma_imeni(person.imja)===n||tip==='telegram')matches.set(person.id,person);
            else incompatible.set(person.id,person);
          }
        }
        if(matches.size===1)est=[...matches.values()][0];
        if(incompatible.size||matches.size>1||(names.length&&!est)||names.some(person=>est&&person.id!==est.id)){
          itog.trebuet_sopostavlenija.push({imja,vozmozhnye_id:[...new Set([...names.map(r=>r.id),...matches.keys(),...incompatible.keys()])]});
          itog.propuscheno++;continue;
        }
      }
      if (est) {
        id = est.id;
        itog.najdeno_dublej += 1;
        itog.dubli.push({ imja, id });
      } else {
        const person=common.sozdat('ljudi',OPISANIJA.ljudi,{imja},avtor);id=person.id;
        for(const [tip,value] of contacts)common.sozdat('kontakty',OPISANIJA.kontakty,{chelovek_id:id,tip,znachenie:String(value)},avtor);
        itog.dobavleno += 1;
      }
      if (rassylka_id === null) continue;
      if(est?.rol_v_baze==='kontaktnoe_lico'){
        itog.propuscheno_kontaktnyh++;itog.kontaktnye_lica.push({chelovek_id:id,imja:est.imja});continue;
      }
                                                                  
                                                                  
      const metka = db.prepare(
        'SELECT id FROM rassylka_ljudi WHERE rassylka_id = ? AND chelovek_id = ?'
      ).get(rassylka_id, id);
      if (metka) continue;
      db.prepare(
        `INSERT INTO rassylka_ljudi (rassylka_id, chelovek_id, status)
         VALUES (?, ?, 'ne_otpravleno')`
      ).run(rassylka_id, id);
      itog.privjazano += 1;
    }
  };
  v_odnoj_tranzakcii(db,()=>vnutri(stroki));

  if (rassylka_id !== null) {
    itog.rassylka_id = rassylka_id;
                                                                      
    itog.v_rassylke = db.prepare(
      'SELECT count(*) k FROM rassylka_ljudi WHERE rassylka_id = ?'
    ).get(rassylka_id).k;
  }
                                                                         
                                 
  return { kod: 200, telo: itog };
}

                                                

                                                                   
                                                                 
                                                    
function schema_filtrov(db, rol) {
  const stadii = (dlja_roli) => {
    const uslovie = dlja_roli ? 'WHERE rol = ? AND (arhiv IS NULL OR arhiv = 0)'
      : 'WHERE (arhiv IS NULL OR arhiv = 0)';
    const stroki = dlja_roli
      ? db.prepare(`SELECT kod, nazvanie, rol, porjadok FROM spravochnik_stadij ${uslovie} ORDER BY porjadok, id`).all(dlja_roli)
      : db.prepare(`SELECT kod, nazvanie, rol, porjadok FROM spravochnik_stadij ${uslovie} ORDER BY porjadok, id`).all();
    return stroki.map((s) => ({ znachenie: s.kod, nazvanie: s.nazvanie, rol: s.rol }));
  };
  const znachenija = (tablica, pole) => db.prepare(
    `SELECT DISTINCT ${pole} z FROM ${tablica} WHERE ${pole} IS NOT NULL AND ${pole} <> ''`
  ).all().map((r) => ({ znachenie: r.z, nazvanie: r.z }));

  return [
    {
      kod: 'stadija',
      nazvanie: 'Стадия',
      tip: 'multi_enum',
                                                                            
      depends_on: 'dostup',
                                                                     
                                                                   
      vykljuchen: false,
      varianty: stadii(rol),
    },
                                                                      
                                                                    
                                                                     
                                             
    {
      kod: 'status_rassylki',
      nazvanie: 'Статус в рассылке',
      tip: 'multi_enum',
      varianty: [
        { znachenie: 'otpravleno', nazvanie: 'Отправлено' },
        { znachenie: 'otvetil', nazvanie: 'Ответил' },
        { znachenie: 'otkaz', nazvanie: 'Отказ' },
        { znachenie: 'ne_otpravljali', nazvanie: 'Не отправляли' },
      ],
    },
    {
      kod: 'istochnik',
      nazvanie: 'Источник',
      tip: 'multi_enum',
      varianty: [
        { znachenie: 'rekomendacija', nazvanie: 'Рекомендация' },
        { znachenie: 'rassylka', nazvanie: 'Рассылка' },
        { znachenie: 'meroprijatie', nazvanie: 'Мероприятие' },
        { znachenie: 'sajt', nazvanie: 'Сайт' },
        { znachenie: 'socseti', nazvanie: 'Соцсети' },
        { znachenie: 'holodnyj_kontakt', nazvanie: 'Холодный контакт' },
        { znachenie: 'svoj', nazvanie: 'Свой' },
      ],
    },
    {
      kod: 'rekomendoval',
      nazvanie: 'Кто порекомендовал',
      tip: 'vybor_cheloveka',
                                                                      
      depends_on: 'istochnik',
    },
    { kod: 'gorod', nazvanie: 'Город', tip: 'podskazka_teksta', srez: 'gorod' },
    { kod: 'nisha', nazvanie: 'Ниша', tip: 'podskazka_teksta', srez: 'nisha' },
    {
      kod: 'poslednee_obshenie',
      nazvanie: 'Последнее общение',
      tip: 'enum',
      varianty: [
        { znachenie: 'svezhee_nedeli', nazvanie: 'Свежее недели' },
        { znachenie: 'nedelja_mesjac', nazvanie: 'От недели до месяца' },
        { znachenie: 'bolshe_mesjaca', nazvanie: 'Больше месяца' },
        { znachenie: 'nikogda', nazvanie: 'Никогда не общались' },
      ],
    },
    { kod: 'est_otkrytye_zadachi', nazvanie: 'Есть незакрытые задачи', tip: 'bool' },
                                                                      
                                                                      
  ].map((f) => (f.srez ? { ...f, varianty: znachenija('ljudi', f.srez) } : f));
}

                                                                          
function ljudi_filtry({ metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
                                                                     
                                                      
  const rol = zapros.dostup || zapros.rol || null;
  if (rol && !['lid', 'klient', 'referal'].includes(rol)) {
    throw new OshibkaVvoda('dostup: lid, klient или referal', 'dostup');
  }
                                                                  
                                                                   
  const spisok = schema_filtrov(db, rol).map((f) => ({
    vykljuchen: false,
    ...f,
    vykljuchen_pochemu: f.vykljuchen ? (f.vykljuchen_pochemu || 'не для этой роли') : null,
  }));
  return { telo: { rol, spisok, vsego: spisok.length,
                                                                    
                                                                   
                                                               
                                                                  
                                              
      
                                                                    
                                                                   
    chip_kontaktnyh_lic: {
      kod: 'rol_v_baze',
      nazvanie: 'Контактные лица',
      tip: 'pereklyuchatel',
      znachenie_vkljucheno: 'kontaktnoe_lico',
      po_umolchaniju: 'skryty',
      skolko: db.prepare(
        `SELECT count(*) n FROM ljudi
          WHERE rol_v_baze = 'kontaktnoe_lico' AND (arhiv IS NULL OR arhiv = 0)`).get().n,
    } } };
}

                                                                        
  
                                                                       
                                                                 
                                                                 
function ljudi_srezy({ metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const facet = zapros.facet || null;
  const srez = zapros.srez || null;

  if (facet === 'napravlenie' || (!facet && !srez)) {
    const stroki = db.prepare(
      `SELECT kod, nazvanie, porjadok, arhiv FROM napravlenija
       WHERE (arhiv IS NULL OR arhiv = 0) ORDER BY porjadok, kod`
    ).all();
    return {
      telo: {
                                                                  
                                                    
        napravlenija: stroki.map((n) => ({
          id: n.kod, slug: n.kod, nazvanie: n.nazvanie,
          porjadok: n.porjadok, arhiv: false,
        })),
        vsego: stroki.length,
      },
    };
  }

                                                             
                                                         
  if (srez === 'istochnik') {
    const stroki = db.prepare(
      `SELECT COALESCE(s.istochnik, 'ne_ukazan') istochnik,
              SUM(CASE WHEN s.rol = 'lid' THEN 1 ELSE 0 END) lidov,
              SUM(CASE WHEN s.rol = 'klient' THEN 1 ELSE 0 END) klientov
         FROM sotrudnichestva s
        WHERE (s.arhiv IS NULL OR s.arhiv = 0)
        GROUP BY COALESCE(s.istochnik, 'ne_ukazan')
        ORDER BY klientov DESC, lidov DESC`).all();
    const dengi = (ist) => {
      try {
        return db.prepare(
          `SELECT COALESCE(SUM(p.summa), 0) s FROM platezhi p
             JOIN proekty pr ON pr.id = p.proekt_id
            WHERE p.oplachen_at IS NOT NULL
              AND pr.klient_id IN (
                SELECT chelovek_id FROM sotrudnichestva
                 WHERE COALESCE(istochnik, 'ne_ukazan') = ?)`).get(ist).s;
      } catch { return 0; }
    };
    return { telo: { spisok: stroki.map((r) => ({
      istochnik: r.istochnik, lidov: r.lidov, klientov: r.klientov,
      deneg: dengi(r.istochnik) })), vsego: stroki.length } };
  }

  if (!['gorod', 'nisha'].includes(srez)) {
    throw new OshibkaVvoda('srez: gorod, nisha или istochnik, либо facet=napravlenie', 'srez');
  }
                                                                  
                                                            
  const q = norma_imeni(zapros.q || '');
  const stroki = db.prepare(
    `SELECT ${srez} znachenie, count(*) chislo FROM ljudi
     WHERE ${srez} IS NOT NULL AND ${srez} <> ''
       AND (arhiv IS NULL OR arhiv = 0)
     GROUP BY ${srez} ORDER BY count(*) DESC, ${srez}`
  ).all();
  const spisok = stroki
    .filter((r) => !q || norma_imeni(r.znachenie).startsWith(q)
                   || norma_imeni(r.znachenie).includes(q))
    .map((r) => ({ znachenie: r.znachenie, chislo: r.chislo }));
  return {
    telo: {
      srez,
      q: zapros.q || null,
      spisok,
      vsego: spisok.length,
                                                                     
      ...(spisok.length ? {} : { podskazka: 'net_takogo_znachenija' }),
    },
  };
}

                                                                    
                                                                         
function norma_nazvanija(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

const VIDIMOST = ['privatnyj', 'team'];

                                                                       
                                                              
function nabor_v_api(s, ja) {
  let filtry = {};
  try { filtry = s.filtry ? JSON.parse(s.filtry) : {}; } catch { filtry = {}; }
  return {
    id: s.id,
    nazvanie: s.nazvanie,
                                                                
                                                                    
    vidimost: s.vidimost,
    visibility: s.vidimost,
    filtry,
    porjadok: s.porjadok,
    otvetstvennyj: s.chelovek_id,
    sozdano: s.sozdano,
    svoj: s.chelovek_id === ja,
    mozhno_pravit: s.chelovek_id === ja,
  };
}

                                                                 
                                                              
                                                             
                                                                    
  
                                                                      
                                                                 
                                                                  
  
                                                                 
                                                                   
function ljudi_predprosmotr_rassylki(ctx) {
  tolko(ctx.metod,'POST');
  return {telo:require('./otbor-ljudej-kampanii.js').preview(baza(),Number(ctx.avtor),ctx.telo||{})};
}
function ljudi_rassylka_iz_nabora(ctx) {
  tolko(ctx.metod,'POST');
  const db=baza(),actor=Number(ctx.avtor),body={...(ctx.telo||{})},key=body.zapros_kljuch;delete body.zapros_kljuch;
  const allowed=['nazvanie','napravlenie','filtry','nabor_filtrov_id','chelovek_ids','vybor_versija','plan_chislo','kto_vedet','otvetstvennyj','cel_id','rezultat_id'];
  for(const field of Object.keys(body))if(!allowed.includes(field))throw new OshibkaVvoda('Неизвестный параметр рассылки',field);
  const kamp=require('./kampanii.js'),store=require('./zapros-sozdanija.js');
  const present=row=>{
    const p=kamp.profile(db,row.id),task=p?.zadacha_otpravki_id?db.prepare('SELECT nomer,cel_id,rezultat_id FROM zadachi WHERE id=?').get(p.zadacha_otpravki_id):null;
    const saved=p?.nabor_filtrov_id?db.prepare('SELECT * FROM sohranennye_filtry WHERE id=?').get(p.nabor_filtrov_id):null,visible=saved&&(Number(saved.chelovek_id)===actor||saved.vidimost==='team');
    return {...kamp.presentation(db,row),rassylka_id:row.id,zadacha_nomer:task?.nomer??null,ljudej:kamp.sourceRows(db,row).length,nabor:visible?{id:saved.id,nazvanie:saved.nazvanie}:{id:null,nazvanie:'Набор недоступен'},cel_id:task?.cel_id??null,rezultat_id:task?.rezultat_id??null};
  };
  if(key===undefined)throw new OshibkaVvoda('Нужен ключ одного создания','zapros_kljuch');
  return v_odnoj_tranzakcii(db,()=>({kod:201,telo:store.create(db,actor,'rassylki',actor,key,body,()=>{
    const picked=require('./otbor-ljudej-kampanii.js').preview(db,actor,body);
    if(body.vybor_versija!==picked.vybor_versija)throw new Konflikt('Отбор изменился. Проверь полный состав перед созданием',{vybor_izmenilsja:true});
    const saved=body.nabor_filtrov_id?db.prepare('SELECT * FROM sohranennye_filtry WHERE id=?').get(body.nabor_filtrov_id):null;
    const title=body.nazvanie??saved?.nazvanie;
    const campaign=require('./obschij.js').sozdat('rassylki',require('./opisanija.js').OPISANIJA.rassylki,{nazvanie:title,napravlenie:body.napravlenie,status:'gotovitsja',kto_vedet:body.kto_vedet??body.otvetstvennyj??actor,nachalo:den_msk(),plan_chislo:body.plan_chislo??picked.vsego,vybor_bazy:'nikogo'},actor);
    for(const person of picked.spisok)kamp.addTag(db,campaign.id,person.id,actor);
    let nabor=saved;
    if(!nabor&&body.filtry){
      const occupied=new Set(db.prepare('SELECT nazvanie FROM sohranennye_filtry WHERE chelovek_id=?').all(actor).map(r=>norma_nazvanija(r.nazvanie)));
      let label,counter=0;do{const suffix=' · '+campaign.id+(counter?' ('+counter+')':''),letters=Array.from(campaign.nazvanie);while(letters.join('').length+suffix.length>40)letters.pop();label=letters.join('')+suffix;counter++;}while(occupied.has(norma_nazvanija(label)));
      nabor=nabory_sohranit({telo:{nazvanie:label,filtry:body.filtry},avtor:actor}).telo;
    }
    if(nabor)db.prepare('UPDATE plany_kampanij SET nabor_filtrov_id=? WHERE rassylka_id=?').run(nabor.id,campaign.id);
    const waves=require('./volny-rassylok.js'),selection=waves.preview({kljuch:campaign.id,metod:'POST',avtor:actor,telo:{komu:'vsja_baza'}}).telo;
    waves.create({kljuch:campaign.id,metod:'POST',avtor:actor,telo:{komu:'vsja_baza',vybor_versija:selection.vybor_versija,zapros_kljuch:require('node:crypto').randomUUID(),otvetstvennyj:campaign.kto_vedet,nazvanie:'Первая волна: '+campaign.nazvanie,cel_id:body.cel_id??null,rezultat_id:body.rezultat_id??null}});
    return db.prepare('SELECT * FROM rassylki WHERE id=?').get(campaign.id);
  },present)}));
}

function ljudi_nabory_filtrov(ctx) {
  const { metod } = ctx;
  if (metod === 'GET') return nabory_spisok(ctx);
  if (metod === 'POST') return nabory_sohranit(ctx);
  if (metod === 'PUT') return nabory_obnovit(ctx);
  throw Object.assign(new Error('сюда GET, POST или PUT'), { kod: 405 });
}

function nabory_spisok({ avtor, zapros }) {
  const db = baza();
  const ja = avtor || null;
                                                                 
                                   
  const stroki = db.prepare(
    `SELECT * FROM sohranennye_filtry
     WHERE chelovek_id = ? OR vidimost = 'team'
     ORDER BY porjadok, id`
  ).all(ja);
  const spisok = stroki.map((s) => nabor_v_api(s, ja));
  return {
    telo: {
      spisok: zapros.vidimost
        ? spisok.filter((n) => n.vidimost === zapros.vidimost) : spisok,
      vsego: spisok.length,
    },
  };
}

function proverit_nazvanie(db, ja, nazvanie, krome_id) {
  const n = String(nazvanie || '').trim();
  if (!n) throw new OshibkaVvoda('нужно название набора', 'nazvanie');
  if (n.length > 40) throw new OshibkaVvoda('название до 40 знаков', 'nazvanie');
  const norma = norma_nazvanija(n);
                                                                       
                                                                   
  const svoi = db.prepare('SELECT id, nazvanie FROM sohranennye_filtry WHERE chelovek_id = ?')
    .all(ja);
  const est = svoi.find((s) => norma_nazvanija(s.nazvanie) === norma
                               && s.id !== krome_id);
  if (est) {
    throw new Konflikt('набор с таким названием уже есть',
      { oshibka: 'dubl_nazvanija', id: est.id, nazvanie: est.nazvanie });
  }
  return n;
}

function razobrat_filtry(telo) {
  const f = telo.filtry;
  if (f === undefined || f === null) return {};
  if (typeof f === 'string') {
    try { return JSON.parse(f); } catch { throw new OshibkaVvoda('filtry: объект', 'filtry'); }
  }
  if (typeof f !== 'object' || Array.isArray(f)) {
    throw new OshibkaVvoda('filtry: объект', 'filtry');
  }
  return f;
}

function proverit_vidimost(telo) {
  const v = telo.vidimost !== undefined ? telo.vidimost : telo.visibility;
                                                                     
  if (v === undefined || v === null || v === '') return 'privatnyj';
  if (!VIDIMOST.includes(String(v))) {
    throw new OshibkaVvoda('vidimost: privatnyj или team', 'vidimost');
  }
  return String(v);
}

function nabory_sohranit({ telo, avtor }) {
  const db = baza();
  const ja = avtor;
  const nazvanie = proverit_nazvanie(db, ja, telo.nazvanie, null);
  const vidimost = proverit_vidimost(telo);
  const filtry = razobrat_filtry(telo);
  const max = db.prepare(
    'SELECT max(porjadok) m FROM sohranennye_filtry WHERE chelovek_id = ?').get(ja).m;
  const r = db.prepare(
    `INSERT INTO sohranennye_filtry (chelovek_id, nazvanie, filtry, vidimost, porjadok, sozdano)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(ja, nazvanie, JSON.stringify(filtry), vidimost, (max || 0) + 1,
        seichas());
  const stalo = db.prepare('SELECT * FROM sohranennye_filtry WHERE id = ?')
    .get(Number(r.lastInsertRowid));
  return {
    kod: 201,
    telo: {
      ...nabor_v_api(stalo, ja),
                                                                   
                                               
      primenennye_filtry: Object.keys(JSON.parse(stalo.filtry || '{}')),
    },
  };
}

function nabory_obnovit({ telo, avtor }) {
  const db = baza();
  const ja = avtor;
  const id = chislo(telo.id, 'id');
  const bylo = db.prepare('SELECT * FROM sohranennye_filtry WHERE id = ?').get(id);
  if (!bylo) throw new NeNajdeno(`набора ${id} нет`);
                                                                  
  if (bylo.chelovek_id !== ja) throw new NetDostupa('это не ваш набор');
  const nazvanie = telo.nazvanie !== undefined
    ? proverit_nazvanie(db, ja, telo.nazvanie, id) : bylo.nazvanie;
  const vidimost = (telo.vidimost !== undefined || telo.visibility !== undefined)
    ? proverit_vidimost(telo) : bylo.vidimost;
  const filtry = telo.filtry !== undefined
    ? JSON.stringify(razobrat_filtry(telo)) : bylo.filtry;
  db.prepare(
    'UPDATE sohranennye_filtry SET nazvanie = ?, filtry = ?, vidimost = ? WHERE id = ?'
  ).run(nazvanie, filtry, vidimost, id);
  const stalo = db.prepare('SELECT * FROM sohranennye_filtry WHERE id = ?').get(id);
  return { telo: nabor_v_api(stalo, ja) };
}

                                                                            
  
                                                                   
                                                                     
function ljudi_porjadok({ kljuch, telo, metod, avtor }) {
  tolko(metod, 'PATCH');
  if (kljuch !== 'nabory_filtrov') {
    throw new OshibkaVvoda('порядок меняется у nabory_filtrov', 'porjadok');
  }
  const db = baza();
  const ja = avtor;
  const ids = Array.isArray(telo.porjadok) ? telo.porjadok
    : Array.isArray(telo.ids) ? telo.ids : null;
  if (!ids || !ids.length) throw new OshibkaVvoda('нужен массив id в новом порядке', 'porjadok');
  const svoi = db.prepare('SELECT id FROM sohranennye_filtry WHERE chelovek_id = ?')
    .all(ja).map((s) => s.id);
  const chuzhoj = ids.map((x) => chislo(x, 'id')).find((x) => !svoi.includes(x));
  if (chuzhoj !== undefined) {
    throw new OshibkaVvoda(`набора ${chuzhoj} у вас нет`, 'porjadok');
  }
                                                                    
                                                                 
                                                                  
  db.exec('BEGIN');
  try {
    ids.forEach((x, i) => {
      db.prepare('UPDATE sohranennye_filtry SET porjadok = ? WHERE id = ?')
        .run(i + 1, chislo(x, 'id'));
    });
                                                                           
    let n = ids.length;
    for (const s of db.prepare(
      `SELECT id FROM sohranennye_filtry WHERE chelovek_id = ?
       ORDER BY porjadok, id`).all(ja)) {
      if (ids.map(Number).includes(s.id)) continue;
      n += 1;
      db.prepare('UPDATE sohranennye_filtry SET porjadok = ? WHERE id = ?').run(n, s.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const stroki = db.prepare(
    `SELECT * FROM sohranennye_filtry WHERE chelovek_id = ? OR vidimost = 'team'
     ORDER BY porjadok, id`).all(ja);
  return { telo: { spisok: stroki.map((s) => nabor_v_api(s, ja)), vsego: stroki.length } };
}

                                                              
  
                                                                  
                                                                 
                                                             
function ljudi_istorija_filtrov({ metod, zapros, avtor }) {
  tolko(metod, 'GET');
  const db = baza();
  const predel = Math.min(parseInt(zapros.skolko, 10) || 3, 10);
  const stroki = db.prepare(
    `SELECT * FROM istorija_filtrov WHERE chelovek_id = ?
     ORDER BY upotreblenij DESC, poslednij_raz DESC LIMIT ?`
  ).all(avtor || null, predel);
  return {
    telo: {
      spisok: stroki.map((s) => {
        let filtry = {};
        try { filtry = s.nabor_filtrov ? JSON.parse(s.nabor_filtrov) : {}; } catch { filtry = {}; }
        return {
          filtry,
          upotreblenij: s.upotreblenij,
          poslednij_raz: s.poslednij_raz,
                                                         
          podpis: Object.values(filtry).flat().filter(Boolean).join(' '),
        };
      }),
      vsego: stroki.length,
      predel,
    },
  };
}

                

                                               
                                                                  
                                                         
function arhiv_pereklyuchit({ telo, avtor, metod }) {
  tolko(metod, 'POST');
  const db=baza(),tablica=String(telo.tablica||'');
  if(!['ljudi','sotrudnichestva','proekty','napravlenija'].includes(tablica))throw new OshibkaVvoda('Неизвестный вид архива','tablica');
  for(const key of Object.keys(telo))if(!['tablica','id','arhiv','v_arhiv','versija'].includes(key))throw new OshibkaVvoda('Неизвестный параметр архива',key);
  const opisanie=require('./opisanija.js').OPISANIJA[tablica],primary=opisanie.kljuch||'id';
  const id=tablica==='napravlenija'?String(telo.id||''):chislo(telo.id,'id');
  if(!id)throw new OshibkaVvoda('Нужна запись для архива','id');
  const value=telo.v_arhiv!==undefined?telo.v_arhiv:telo.arhiv!==undefined?telo.arhiv:true;
  if(typeof value!=='boolean')throw new OshibkaVvoda('arhiv: true или false','arhiv');
  if(telo.v_arhiv!==undefined&&telo.arhiv!==undefined&&telo.v_arhiv!==telo.arhiv)throw new OshibkaVvoda('Переданы разные значения архива','arhiv');
  const before=db.prepare('SELECT * FROM '+tablica+' WHERE '+primary+'=?').get(id);
  if(!before)throw new NeNajdeno('Записи для архива нет');
  require('./versii.js').proverit(db,tablica,before,telo.versija,['arhiv','arhiv_s','vozvrat_s']);
  if(Boolean(before.arhiv)===value)throw new Konflikt(value?'Запись уже в архиве':'Запись уже вне архива',{[value?'uzhe_v_arhive':'uzhe_vne_arhiva']:true,tekuschee:v_api(before)});
  const result=require('./obschij.js').pravit(tablica,opisanie,id,{arhiv:value,versija:telo.versija},avtor);
  return {telo:{...v_api(result),otmena_dejstvie_id:require('./versii.js').dejstvie(db)}};
}

                 

                                                    
function zadachi_svodka({ metod, zapros, avtor }) {
  tolko(metod, 'GET');
  const { STATUSY_ZADACHI, TIPY_ZADACHI, OPISANIJA } = require('./opisanija.js');
  const { db, gde, znachenija } = require('./obschij.js')
    .filtry_spiska('zadachi', OPISANIJA.zadachi, zapros, avtor);
  const den = require('./obschij.js').den_iz_slova(zapros.den || zapros.data) || den_msk();
  require('./povtory.js').proverit_datu(den);
  const repeatDay = require('./obschij.js').den_iz_slova(require('./povtory.js').den_konteksta(zapros)) || den;
  const status = require('./povtory.js').status_sql('zadachi', `'${repeatDay}'`);
  const rows = db.prepare(`SELECT tip, publikacija, napravlenie, srok,
      kljuchevaja, povtorjaetsja, ${status} AS status_na_den FROM zadachi ${gde}`)
    .all(...znachenija);
  const po_statusu = Object.fromEntries([...STATUSY_ZADACHI, 'prosrochena'].map(s => [s, 0]));
  const po_tipu = Object.fromEntries(TIPY_ZADACHI.map(t => [t, 0]));
  const po_napravlenijam = Object.fromEntries(db.prepare(
    'SELECT kod FROM napravlenija WHERE COALESCE(arhiv,0)=0').all().map(n => [n.kod,0]));
  let otkryto=0, sdelano=0, prosrocheno=0, na_segodnja=0, kljuchevye=0, bez_sroka=0, publikacij=0;
  for (const row of rows) {
    const s = row.status_na_den, open = !['sdelano','kogda_nibud'].includes(s);
    if (s in po_statusu) po_statusu[s]++;
    if (row.tip in po_tipu) po_tipu[row.tip]++;
    if (row.napravlenie in po_napravlenijam) po_napravlenijam[row.napravlenie]++;
    if (open) otkryto++;
    if (s === 'sdelano') sdelano++;
    if (s === 'prosrochena' || (!row.povtorjaetsja && open && row.srok && row.srok < den)) prosrocheno++;
    if (open && !row.povtorjaetsja && row.srok === den) na_segodnja++;
    if (open && row.kljuchevaja) kljuchevye++;
    if (open && !row.povtorjaetsja && !row.srok) bez_sroka++;
    if (row.publikacija) publikacij++;
  }
  return { telo: { vsego: rows.length, otkryto, sdelano, prosrocheno, na_segodnja,
    kljuchevye, bez_sroka, po_statusu, po_tipu,
    po_tipam: { klientskie: po_tipu.klientskaja, produktovye: po_tipu.produktovaja,
      biznesovye: po_tipu.biznesovaja, vnutrennie: po_tipu.vnutrennjaja, kasanie: po_tipu.kasanie },
    po_napravlenijam, publikacij } };
}

                                                               
                                                               
function zadachi_otmetki({ kljuch, telo, metod, avtor, zapros = {} }) {
  const db = baza();
  const z = zadacha(db, kljuch);
  if (metod === 'GET') {
    const stroki = db.prepare(
      `SELECT o.*, l.imja AS kto_imja FROM otmetki_povtora o
        LEFT JOIN ljudi l ON l.id=o.kto WHERE o.zadacha_id = ? ORDER BY o.data DESC`
    ).all(z.id);
                                                                     
                                                                       
                                                                     
                                                                       
                                                    
    const sostojanie = povtor_sostojanie(db, z, zapros.den || zapros.data || den_msk());
    return {
      telo: {
        spisok: stroki.map((s) => v_api(s)),
        versija: z.versija,
        ...(sostojanie || {}),
      },
    };
  }
  if (!['POST', 'DELETE'].includes(metod)) throw Object.assign(new Error('сюда GET, POST или DELETE'), { kod: 405 });
  if (!z.povtorjaetsja) throw new OshibkaVvoda('задача не повторяется');
  if (telo.versija !== undefined && telo.versija !== z.versija) {
    throw new Konflikt('Отметки уже изменили, открой их заново', { tekuschee: v_api(z) });
  }
  const { proverit_datu } = require('./povtory.js');
  const days = Array.isArray(telo) ? telo : telo.daty !== undefined ? telo.daty
    : Array.isArray(telo.data) ? telo.data : [telo.data || den_msk()];
  if (!Array.isArray(days) || !days.length) throw new OshibkaVvoda('нужен непустой массив дат', 'daty');
  const dates = [...new Set(days)];
  const today = den_msk();
  const start = String(z.povtor_s || z.sozdano || today).slice(0, 10);
  for (const date of dates) {
    proverit_datu(date);
    if (date > today) throw new OshibkaVvoda('день ещё не наступил', 'data');
    if (metod === 'POST' && date < start) throw new OshibkaVvoda('повторение ещё не было включено', 'data');
    if (metod === 'POST' && !den_po_pravilu(z, date)) throw new OshibkaVvoda('день не по правилу', 'data');
  }
  const status = telo.status === undefined ? 'sdelano' : telo.status;
  if (metod === 'POST' && !['sdelano', 'propushcheno'].includes(status)) {
    throw new OshibkaVvoda('status: sdelano или propushcheno', 'status');
  }
  return v_odnoj_tranzakcii(db, () => {
    let added = 0, changed = 0, removed = 0;
    for (const date of dates) {
      const old = db.prepare('SELECT * FROM otmetki_povtora WHERE zadacha_id=? AND data=?').get(z.id, date);
      if (metod === 'DELETE') {
        if (!old) continue;
        db.prepare('DELETE FROM otmetki_povtora WHERE zadacha_id=? AND data=?').run(z.id, date);
        v_zhurnal(db, 'zadachi', z.id, 'otmetka', `${date}: ${old.status}`, null, avtor);
        removed++;
      } else {
        if (old?.status === status) continue;
        db.prepare(`INSERT INTO otmetki_povtora (zadacha_id,data,status,kto,kogda) VALUES (?,?,?,?,?)
          ON CONFLICT(zadacha_id,data) DO UPDATE SET status=excluded.status,kto=excluded.kto,kogda=excluded.kogda`)
          .run(z.id, date, status, avtor, seichas());
        v_zhurnal(db, 'zadachi', z.id, 'otmetka', old ? `${date}: ${old.status}` : null, `${date}: ${status}`, avtor);
        if (old) changed++; else added++;
      }
    }
    if (added || changed || removed) db.prepare('UPDATE zadachi SET versija=COALESCE(versija,1)+1 WHERE id=?').run(z.id);
    const current = db.prepare('SELECT * FROM zadachi WHERE id=?').get(z.id);
    const single = dates.length === 1 ? db.prepare('SELECT * FROM otmetki_povtora WHERE zadacha_id=? AND data=?').get(z.id, dates[0]) : null;
    return { kod: added ? 201 : 200, telo: { ...(single || {}), otmecheno: dates.length,
      dobavleno: added, izmeneno: changed, udaleno: removed,
      zadacha: v_api({ ...current, ...povtor_sostojanie(db, current, dates.length === 1 ? dates[0] : today) }) } };
  });
}

                                                 
function zadachi_zakryt({ kljuch, telo, metod, avtor }) {
  tolko(metod, 'POST');
  const db = baza();
  const z = zadacha(db, kljuch);
  if(telo.versija===undefined)throw new OshibkaVvoda('Обнови задачу перед закрытием','versija');
  require('./versii.js').proverit(db,'zadachi',z,telo.versija,require('./sostojanie-zadachi.js').POLJA_STATUSA);
  if (z.povtorjaetsja) return zadachi_otmetki({ kljuch, telo, metod, avtor });

  for (const key of ['i_podzadachi', 'ostavit_podzadachi']) {
    if (telo[key] !== undefined && typeof telo[key] !== 'boolean') throw new OshibkaVvoda(key + ': нужно true или false', key);
  }
  if (telo.i_podzadachi && telo.ostavit_podzadachi) throw new OshibkaVvoda('выбери одно действие с подзадачами');
  if(z.status==='sdelano'&&!telo.i_podzadachi)return {telo:v_api(z)};
  require('./sostojanie-zadachi.js').proverit_podtverzhdenie(db, z, telo);

                                                                          
  const otkrytye = db.prepare(
    `SELECT count(*) k FROM zadachi WHERE roditel_id = ? AND ${OTKRYTA} AND ${NE_UDALENA}`
  ).get(z.id).k;
  if (otkrytye > 0 && !telo.i_podzadachi && !telo.ostavit_podzadachi) {
    throw new Konflikt(`у задачи ${z.nomer} открытых подзадач: ${otkrytye}`,
      { podzadach: otkrytye, podskazka: 'передай i_podzadachi: true, чтобы закрыть вместе' });
  }

  const deti=telo.i_podzadachi?require('./sostojanie-zadachi.js').proverit_gruppu(db,z,telo):[];

  if(z.status!=='sdelano'){
    db.prepare('UPDATE zadachi SET status = ?, versija = versija + 1 WHERE id = ?')
      .run('sdelano', z.id);
    v_zhurnal(db, 'zadachi', z.id, 'status', z.status, 'sdelano', avtor);
  }

  if (otkrytye > 0 && telo.i_podzadachi) {
    for (const d of deti) {
      db.prepare('UPDATE zadachi SET status = ?, versija = versija + 1 WHERE id = ?')
        .run('sdelano', d.id);
      v_zhurnal(db, 'zadachi', d.id, 'status', d.status, 'sdelano', avtor);
      const child = db.prepare('SELECT * FROM zadachi WHERE id=?').get(d.id);
      require('./opisanija.js').OPISANIJA.zadachi.posle_pravki(child, d, db, avtor);
    }
  }

  const stalo = db.prepare('SELECT * FROM zadachi WHERE id = ?').get(z.id);
  const effects = require('./opisanija.js').OPISANIJA.zadachi.posle_pravki(stalo, z, db, avtor);
  return {
    telo: {
      ...v_api(stalo),
      zakryto_podzadach: telo.i_podzadachi ? otkrytye : 0,
      ...effects,
    },
  };
}

                                                   
function zadachi_dubl(ctx){return require('./kopija-zadachi.js').execute(ctx);}

                                                                              
function zadachi_korzina({ kljuch, metod, avtor }) {
  tolko(metod, 'GET');
  const number = Number(kljuch);
  if (!/^\d+$/.test(String(kljuch)) || !Number.isSafeInteger(number) || number < 1) throw new OshibkaVvoda('nomer: положительное целое число', 'nomer');
  return v_odnoj_tranzakcii(baza(), () => {
    const { OPISANIJA } = require('./opisanija.js');
    const row = require('./obschij.js').odna('zadachi', OPISANIJA.zadachi, number, avtor);
    return { telo: { id: row.id, nomer: row.nomer, nazvanie: row.nazvanie,
      napravlenie: row.napravlenie, versija: row.versija,
      udaleno: Boolean(row.udaleno), otmetki: row.otmetki || [] } };
  });
}

                                                     
function zadachi_vernut({ kljuch, telo, metod, avtor }) {
  tolko(metod, 'POST');
  const db = baza();
  const z = db.prepare('SELECT * FROM zadachi WHERE nomer = ?')
    .get(chislo(kljuch, 'nomer'));
  if (!z) throw new NeNajdeno(`задачи ${kljuch} нет`);
  if(typeof telo.versija==='boolean'||!Number.isSafeInteger(telo.versija)||telo.versija<1)throw new OshibkaVvoda('Обнови список корзины перед восстановлением','versija');
  if (!z.udaleno) return { telo: v_api(z) };
  require('./versii.js').proverit(db,'zadachi',z,telo.versija,['udaleno',...require('./sostojanie-zadachi.js').POLJA_STATUSA]);
  db.prepare('UPDATE zadachi SET udaleno = 0, versija = versija + 1 WHERE id = ?').run(z.id);
  v_zhurnal(db, 'zadachi', z.id, 'udaleno', 'да', 'нет', avtor);
  const stalo = db.prepare('SELECT * FROM zadachi WHERE id = ?').get(z.id);
  return { telo: v_api(stalo) };
}

                                                  
                                                         
function zadachi_uchastniki(ctx){return require('./uchastniki.js').uchastniki(ctx);}

                         

                                                                
function sotr_arhiv({ kljuch, telo, metod, avtor }) {
  tolko(metod, 'POST');
  return arhiv_pereklyuchit({
    telo: { tablica: 'sotrudnichestva', id: kljuch, v_arhiv: telo.v_arhiv, arhiv: telo.arhiv, versija: telo.versija },
    avtor, metod,
  });
}

                                                                  
function sotr_istorija({ kljuch, metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const id = chislo(kljuch, 'id');
  if (!db.prepare('SELECT 1 FROM sotrudnichestva WHERE id = ?').get(id)) {
    throw new NeNajdeno(`сотрудничества ${id} нет`);
  }
  return { telo: zhurnal_stroki(db, { obekt: 'sotrudnichestva', obekt_id: id, skolko: zapros.skolko }) };
}

                                                         
function sotr_klienty({ metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const uslovija = ["s.rol = 'klient'", '(s.arhiv IS NULL OR s.arhiv = 0)'];
  const znachenija = [];
  if (zapros.napravlenie) {
    uslovija.push('s.napravlenie = ?');
    znachenija.push(zapros.napravlenie);
  }
  if (zapros.stadija) {
    uslovija.push('s.stadija = ?');
    znachenija.push(zapros.stadija);
  }
  const stroki = db.prepare(
    `SELECT s.*, l.imja, l.gorod, l.foto, l.inicialy FROM sotrudnichestva s
     JOIN ljudi l ON l.id = s.chelovek_id
     WHERE ${uslovija.join(' AND ')} ORDER BY l.imja`
  ).all(...znachenija);
  return { telo: { spisok: stroki.map((s) => v_api(s)), vsego: stroki.length } };
}

                                                                
  
                                                                      
                                                                        
                                                                           
                                                                    
function sotr_kasanie({ kljuch, telo, metod, avtor }) {
  tolko(metod, 'POST');
  const db = baza();
  const id = chislo(kljuch, 'id');
  const s = db.prepare('SELECT * FROM sotrudnichestva WHERE id = ?').get(id);
  if (!s) throw new NeNajdeno(`сотрудничества ${id} нет`);
  const time=require('./vremja-obschenija.js'),parsed=require('./obschenie.js').proveritMoment(Object.hasOwn(telo,'kogda')?telo.kogda:seichas());
  const kogda=parsed.znachenie;
  if(telo.chelovek_id!==undefined){
    if(!Number.isSafeInteger(telo.chelovek_id)||telo.chelovek_id<1)throw new OshibkaVvoda('Нужен номер человека','chelovek_id');
    if(telo.chelovek_id!==s.chelovek_id)throw Object.assign(new Error('Сотрудничество теперь относится к другому человеку. Обнови карточку.'),{kod:409,dannye:{scope_changed:true}});
  }
  if(telo.versija!==undefined){
    try{require('./versii.js').proverit(db,'sotrudnichestva',s,telo.versija,['chelovek_id']);}
    catch(error){if(error.kod===409)error.dannye={...error.dannye,scope_changed:true};throw error;}
  }
                                                                           
  const otkuda = telo.otkuda===undefined?'ruchnaja':telo.otkuda;
  if (!['ruchnaja', 'bot'].includes(otkuda)) {
    throw new OshibkaVvoda('otkuda: ruchnaja или bot', 'otkuda');
  }
                                                                 
                                                                  
                                                                 
                                                                        
                                                                       
                                                                  
                                                                  
                                                               
    
                                                                        
                                                                   
                                   
  const roli = db.prepare(
    `SELECT id, poslednee_obshenie FROM sotrudnichestva
     WHERE chelovek_id = ?`).all(s.chelovek_id);
  const obnovit = db.prepare(
    'UPDATE sotrudnichestva SET poslednee_obshenie = ? WHERE id = ?');
  let rolej = 0;
  const scope=require('./kontekst-dat.js').najti(db,s.chelovek_id);
  for (const r of roli) {
    const previous=time.prochitat(r.poslednee_obshenie);
    if (scope.svoi(r,'poslednee_obshenie')&&previous&&previous.moment<=Date.now()+1000&&previous.moment>=parsed.moment) continue;
    obnovit.run(kogda, r.id);
    rolej += 1;
    v_zhurnal(db, 'sotrudnichestva', r.id, 'kasanie',
      r.poslednee_obshenie || null, `${kogda} (${otkuda})`, avtor);
  }
  const stalo = db.prepare('SELECT * FROM sotrudnichestva WHERE id = ?').get(id);
                                                                        
  return { telo: { ...v_api(stalo), rolej_otmecheno: rolej } };
}

                                                                 
                                                          
function obnovit_poslednjuju_zadachu(db, zadacha, kogda) {
  if ((!zadacha.klient_id&&!zadacha.sotrudnichestvo_id) || !zadacha.napravlenie) return null;
  const s = zadacha.sotrudnichestvo_id?db.prepare('SELECT * FROM sotrudnichestva WHERE id=? AND (? IS NULL OR chelovek_id=?) AND napravlenie=?').get(zadacha.sotrudnichestvo_id,zadacha.klient_id??null,zadacha.klient_id??null,zadacha.napravlenie):db.prepare(
    `SELECT * FROM sotrudnichestva
     WHERE chelovek_id = ? AND napravlenie = ?
     ORDER BY CASE rol WHEN 'klient' THEN 0 WHEN 'lid' THEN 1 ELSE 2 END
     LIMIT 1`
  ).get(zadacha.klient_id, zadacha.napravlenie);
  if (!s) return null;
  const den = require('./vremja-obschenija.js').den(kogda);if(!den)throw new OshibkaVvoda('Не удалось определить дату закрытия задачи','kogda');
                                                                     
  if (require('./kontekst-dat.js').najti(db,s.chelovek_id).svoi(s,'poslednjaja_zadacha')&&s.poslednjaja_zadacha && s.poslednjaja_zadacha >= den) return null;
  db.prepare('UPDATE sotrudnichestva SET poslednjaja_zadacha = ? WHERE id = ?')
    .run(den, s.id);
  return { sotrudnichestvo_id: s.id, poslednjaja_zadacha: den };
}

                                                                   
  
                                                                           
                                                               
function sotr_davno_ne_obschalis({ metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const po_umolchaniju = require('./parametry-analitiki.js').values(db).dnej_bez_obschenija_porog;

  const uslovija = ["(s.arhiv IS NULL OR s.arhiv = 0)", "s.rol <> 'referal'"];
  const znachenija = [];
  if (zapros.napravlenie) {
    uslovija.push('s.napravlenie = ?');
    znachenija.push(zapros.napravlenie);
  }

  const stroki = db.prepare(
    `SELECT s.id, s.chelovek_id, s.napravlenie, s.rol, s.stadija,
            s.poslednee_obshenie, s.poslednjaja_zadacha,
            l.imja, l.foto, l.inicialy,
            n.nazvanie napravlenie_nazvanie,
            COALESCE(n.norma_dnej, ?) norma
     FROM sotrudnichestva s
     JOIN ljudi l ON l.id = s.chelovek_id
     LEFT JOIN napravlenija n ON n.kod = s.napravlenie
     WHERE ${uslovija.join(' AND ')}
       AND (l.arhiv IS NULL OR l.arhiv = 0)`
  ).all(po_umolchaniju, ...znachenija);

  const reference=require('./vremja-obschenija.js').razobrat(zapros.den||den_msk()).moment;

  const spisok = [];
  for (const r of stroki) {
    const facts=require('./obschenie.js').najti(db,r.chelovek_id,reference),skolko=facts.dnej_bez_svjazi;
                                                                     
    const nikogda = skolko === null&&!facts.neizvestnaja_data_obschenija&&!facts.buduschaja_data_obschenija;
    if (!nikogda&&!facts.neizvestnaja_data_obschenija&&!facts.buduschaja_data_obschenija&&skolko <= r.norma) continue;
    spisok.push({
      sotrudnichestvo_id: r.id,
      chelovek_id: r.chelovek_id,
      imja: r.imja,
      napravlenie: r.napravlenie,
      napravlenie_nazvanie: r.napravlenie_nazvanie,
      rol: r.rol,
      stadija: r.stadija,
      norma: r.norma,
      dnej_bez_obschenija: skolko,
      nikogda_ne_obschalis: nikogda,
      poslednee_obshenie: facts.poslednee_obshenie_obshee,
      neizvestnaja_data_obschenija:facts.neizvestnaja_data_obschenija,
      buduschaja_data_obschenija:facts.buduschaja_data_obschenija,
      poslednjaja_zadacha: r.poslednjaja_zadacha || null,
                                                                 
      chto_bylo: chto_bylo_poslednim(db, r.id),
    });
  }

                                                              
  spisok.sort((a, b) => {
    if (a.nikogda_ne_obschalis !== b.nikogda_ne_obschalis) {
      return a.nikogda_ne_obschalis ? -1 : 1;
    }
    return (b.dnej_bez_obschenija || 0) - (a.dnej_bez_obschenija || 0);
  });

  return { telo: { spisok, vsego: spisok.length, norma_po_umolchaniju: po_umolchaniju } };
}

                                                                 
function chto_bylo_poslednim(db, sotrudnichestvo_id) {
  const z = db.prepare(
    `SELECT pole, stalo, kogda FROM zhurnal
     WHERE obekt = 'sotrudnichestvo' AND obekt_id = ?
     ORDER BY kogda DESC, id DESC LIMIT 1`
  ).get(sotrudnichestvo_id);
  if (!z) return null;
  const slovami = {
    kasanie: 'отметили общение',
    stadija: 'сменили стадию',
    rol: 'сменили роль',
    sozdano: 'завели сотрудничество',
    arhiv: 'архив',
  };
  return { chto: slovami[z.pole] || z.pole, kogda: z.kogda };
}

                                                                    
                                                 
function sotr_bez_zadach({ metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const uslovija = ["(s.arhiv IS NULL OR s.arhiv = 0)", "s.rol = 'klient'"];
  const znachenija = [];
  if (zapros.napravlenie) {
    uslovija.push('s.napravlenie = ?');
    znachenija.push(zapros.napravlenie);
  }
  const week = zapros.sprint ? require('./kalendar.js').nedelja_iz_zaprosa(zapros,den_msk()) : null;
  const sprint=week?.nomer;
  const stroki = db.prepare(
    `SELECT s.id, s.chelovek_id, s.napravlenie, s.poslednjaja_zadacha,
            l.imja, n.nazvanie napravlenie_nazvanie
     FROM sotrudnichestva s
     JOIN ljudi l ON l.id = s.chelovek_id
     LEFT JOIN napravlenija n ON n.kod = s.napravlenie
     WHERE ${uslovija.join(' AND ')} AND (l.arhiv IS NULL OR l.arhiv = 0)`
  ).all(...znachenija);

  const spisok = [];
  for (const r of stroki) {
    const otkrytyh = db.prepare(
      `SELECT count(*) k FROM zadachi
       WHERE klient_id = ? AND napravlenie = ?
         AND ${OTKRYTA} AND ${NE_UDALENA}
         ${sprint ? 'AND sprint = ? AND god_sprinta = ?' : ''}`
    ).get(...(sprint
      ? [r.chelovek_id, r.napravlenie, sprint, week.god]
      : [r.chelovek_id, r.napravlenie])).k;
    if (otkrytyh > 0) continue;
    spisok.push({
      sotrudnichestvo_id: r.id,
      chelovek_id: r.chelovek_id,
      imja: r.imja,
      napravlenie: r.napravlenie,
      napravlenie_nazvanie: r.napravlenie_nazvanie,
      poslednjaja_zadacha: r.poslednjaja_zadacha || null,
                                                                   
      zadach_ne_bylo: !r.poslednjaja_zadacha,
    });
  }
  spisok.sort((a, b) => {
    if (a.zadach_ne_bylo !== b.zadach_ne_bylo) return a.zadach_ne_bylo ? -1 : 1;
    return String(a.poslednjaja_zadacha).localeCompare(String(b.poslednjaja_zadacha));
  });
  return { telo: { spisok, vsego: spisok.length, sprint } };
}

                                                                      
  
                                                                      
                                                                      
                                                                     
                                                                       
function sotr_privedeno({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const s = sotrudnichestvo(db, kljuch);
  return {telo:require('./referral-summary.js').summary(db,s,den_msk())};
}

                                           
function sotrudnichestvo(db, kljuch) {
  const id = chislo(kljuch, 'id');
  const s = db.prepare('SELECT * FROM sotrudnichestva WHERE id = ?').get(id);
  if (!s) throw new NeNajdeno(`сотрудничества ${id} нет`);
  return s;
}

                                                                           
  
                                                                
                                                                    
                                                               
function sotr_vyplata(ctx) { return require('./vyplata-referalu.js').pay(ctx); }

                                                                     
                                 
  
                                                              
                                                                      
                                              
function sotr_predlozhennye_zadachi({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const s = sotrudnichestvo(db, kljuch);
  const chel = db.prepare('SELECT imja FROM ljudi WHERE id = ?').get(s.chelovek_id);
  const imja = chel ? chel.imja : `человек ${s.chelovek_id}`;
  const svodka = sotr_privedeno({ kljuch: String(s.id), metod: 'GET' }).telo;
  const summa = svodka.k_vyplate;

                                                                       
                                                        
  const nado = s.stadija === 'k_vyplate';
                                                                            
                                                                              
  const plan=require('./referral-task-plan.js').defaults(den_msk());
  const mesjac=plan.period_nazvanie,srok=plan.srok;

                                                                     
                                              
  const spisok = nado ? [
    {
      kod: 'akt',
      nazvanie: `Подготовить закрывающий акт по ${imja} за ${mesjac}`,
      otmecheno: true,
      napravlenie: s.napravlenie,
      srok,
    },
    {
      kod: 'vyplata',
      nazvanie: summa === null
        ? `Выплатить процент ${imja}`
        : `Выплатить процент ${imja}: ${summa} ₽`,
      otmecheno: true,
      napravlenie: s.napravlenie,
      summa,
      srok,
    },
  ] : [];

                                                                             
  const sozdany=spisok.length>0&&spisok.every(z=>db.prepare(`SELECT 1 FROM referalnye_zadachi r JOIN zadachi z ON z.id=r.zadacha_id
    WHERE r.sotrudnichestvo_id=? AND r.vid=? AND r.period_s=? AND r.period_po=? AND r.udaleno=0 AND COALESCE(z.udaleno,0)=0`).get(s.id,z.kod,plan.period_from,plan.period_to));

  return {
    telo: {
      sotrudnichestvo_id: s.id,
      chelovek_id: s.chelovek_id,
      stadija: s.stadija,
      k_vyplate: summa,
      privedeno: svodka.privedeno,
      spisok,
      vsego: spisok.length,
      zadachi_sozdany: Boolean(sozdany),
                                                             
      podpis: sozdany ? null : 'задачи не созданы',
    },
  };
}

                   

                                                           
                                                           
                                                       
                                                               
function kontakty_vidy({ metod }) {
  tolko(metod, 'GET');
  const spisok = require('./vidy-kontaktov.js').CATALOG;
  return { telo: { spisok, vsego: spisok.length } };
}

                                                              
                                                                    
                                                                  
                                                  
const {STRANY}=require('./telefony');

const STRANA_PO_UMOLCHANIJU = 'ru';

                                                                
                                                                    
function cifr_v_maske(mask) {
  return String(mask).replace(/\D/g, '').length;
}

function strana_naruzhu(s) {
  return { ...s, cifr: cifr_v_maske(s.mask) };
}

                                                               
function kontakty_maski({ metod, zapros }) {
  tolko(metod, 'GET');
  const kod = zapros.kod_strany || zapros.strana || null;
  const spisok = (kod
    ? STRANY.filter((s) => s.kod_strany === String(kod).toLowerCase())
    : STRANY).map(strana_naruzhu);
  if (kod && !spisok.length) throw new NeNajdeno(`страны ${kod} нет в справочнике`);
  return { telo: { spisok, vsego: spisok.length } };
}

                                                                              
function kontakty_po_umolchaniju({ metod }) {
  tolko(metod, 'GET');
  const s = STRANY.find((x) => x.kod_strany === STRANA_PO_UMOLCHANIJU);
  return {
    telo: {
      strana_po_umolchaniju: s.kod_strany,
      kod_strany_po_umolchaniju: s.telefonnyj_kod,
      flag: s.flag,
      mask: s.mask,
                                                                        
      vid_po_umolchaniju: 'telefon',
    },
  };
}

                                                              
  
                                                                 
                                                                   
                                               
function kontakty_strany({ metod, zapros }) {
  tolko(metod, 'GET');
  const q = norma_imeni(zapros.q || '');
  const bez_pljusa = q.replace(/^\+/, '');
  const podhodit = (s) => {
    if (!q) return true;
    if (norma_imeni(s.nazvanie).startsWith(q)) return true;
    if (norma_imeni(s.nazvanie).includes(q)) return true;
    if (s.telefonnyj_kod === q) return true;
    if (s.telefonnyj_kod.replace('+', '') === bez_pljusa) return true;
    return false;
  };
  const spisok = STRANY.filter(podhodit).map(strana_naruzhu);
  return { telo: { q: zapros.q || null, spisok, vsego: spisok.length } };
}

                                                                   
  
                                                                      
                                                                       
                                             
function kontakty_razbor({telo,metod}){
  tolko(metod,'POST');
  return {telo:require('./telefony').razobrat(telo.raw!==undefined?telo.raw:telo.znachenie,{...(telo.strana!==undefined?{strana:telo.strana}:{}),...(telo.bez_maski!==undefined?{bez_maski:telo.bez_maski}:{})})};
}

                                                                   
                      
  
                                                                       
                                                                  
                                                                    
function kontakty_duplikaty({ metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const { norma_kontakta, podgotovit_znachenie_kontakta } = require('./opisanija.js');
                                                                         
                                                                  
  if(zapros.podtverdit_chelovek_id!==undefined){
    const raw=String(zapros.podtverdit_chelovek_id),id=Number(raw);
    if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(id))throw new OshibkaVvoda('Нужен номер человека','podtverdit_chelovek_id');
    for(const key of Object.keys(zapros))if(!['podtverdit_chelovek_id','tip','znachenie','strana','bez_maski'].includes(key))throw new OshibkaVvoda('Лишний параметр проверки контакта',key);
    chelovek(db,id);
    const {znachenie,znachenie_norm}=podgotovit_znachenie_kontakta(zapros.tip,zapros.znachenie,require('./telefony').parametry(zapros,true));
    const group=require('./osnovnoj-kontakt.js').sostojanie(db,id,zapros.tip);
    const spisok=group.spisok.filter(row=>row.znachenie_norm===znachenie_norm);
    return {telo:{chelovek_id:id,tip:zapros.tip,znachenie,znachenie_norm,
      spisok,vsego:spisok.length,osnovnaja_gruppa:group}};
  }
  const syroe = zapros.znachenie_norm !== undefined
    ? zapros.znachenie_norm : zapros.znachenie;

                                                                    
                                                           
  if (syroe === undefined || String(syroe).trim() === '') {
    const gruppy = db.prepare(
      `SELECT znachenie_norm, count(DISTINCT chelovek_id) ljudej,
              group_concat(DISTINCT chelovek_id) ids
       FROM kontakty WHERE znachenie_norm IS NOT NULL AND znachenie_norm <> ''
       GROUP BY znachenie_norm HAVING count(DISTINCT chelovek_id) > 1
       ORDER BY ljudej DESC`
    ).all();
    return {
      telo: {
        otchet: gruppy.map((g) => ({
          znachenie_norm: g.znachenie_norm,
          ljudej: g.ljudej,
          ids: String(g.ids).split(',').map(Number),
        })),
        vsego: gruppy.length,
      },
    };
  }

  const tip = zapros.tip || null;
  if(tip&&!require('./opisanija.js').VIDY_KONTAKTA.includes(tip))throw new OshibkaVvoda('Неизвестный вид контакта','tip');
  const norma = zapros.znachenie!==undefined&&tip
    ?podgotovit_znachenie_kontakta(tip,syroe,require('./telefony').parametry(zapros,true)).znachenie_norm:norma_kontakta(syroe,tip||'telefon');
  const krome_cheloveka = zapros.chelovek_id !== undefined
    ? chislo(zapros.chelovek_id, 'chelovek_id') : null;
  const krome_kontakta = zapros.kontakt_id !== undefined
    ? chislo(zapros.kontakt_id, 'kontakt_id') : null;

  const kandidaty = db.prepare(
    `SELECT k.id, k.chelovek_id, k.tip, k.znachenie, k.znachenie_norm,
            k.osnovnoj, l.imja, l.arhiv
     FROM kontakty k JOIN ljudi l ON l.id = k.chelovek_id
     WHERE k.znachenie_norm = ? ORDER BY k.id`
  ).all(norma)
    .filter((k) => !tip || k.tip===tip)
    .filter((k) => krome_kontakta === null || k.id !== krome_kontakta);
  const svoi=krome_cheloveka===null?[]:kandidaty.filter(k=>k.chelovek_id===krome_cheloveka);
  const stroki=kandidaty.filter(k=>krome_cheloveka===null||k.chelovek_id!==krome_cheloveka);

  return {
    telo: {
      znachenie_norm: norma,
      svoi:svoi.map(k=>v_api(k)),
      spisok: stroki.map((k) => v_api(k)),
                                                                      
      vladelcy: [...new Set(stroki.map((k) => k.chelovek_id))],
      vsego: stroki.length,
      dubl: stroki.length > 0,
    },
  };
}

                                                                         
function kontakty_otmena({telo,metod,avtor}){
  tolko(metod,'POST');
  return {telo:require('./otmena-kontakta.js').vernut(baza(),telo,avtor)};
}

                      

function spravochnik(tablica, vid) {
  return ({ metod, zapros }) => {
    tolko(metod, 'GET');
    const db = baza();
    const nabor = polja(tablica);
    const uslovija = [];
    const znachenija = [];
    if (vid && nabor.has('vid')) {
      uslovija.push('vid = ?');
      znachenija.push(vid);
    }
    if (zapros.napravlenie && nabor.has('napravlenie')) {
      uslovija.push('(napravlenie = ? OR napravlenie IS NULL)');
      znachenija.push(zapros.napravlenie);
    }
    if (nabor.has('arhiv')) uslovija.push('(arhiv IS NULL OR arhiv = 0)');
    const gde = uslovija.length ? `WHERE ${uslovija.join(' AND ')}` : '';
    const porjadok = nabor.has('porjadok') ? 'porjadok, id' : 'id';
    const stroki = db.prepare(`SELECT * FROM ${tablica} ${gde} ORDER BY ${porjadok}`).all(...znachenija);
    return { telo: { spisok: stroki.map((s) => v_api(s)) } };
  };
}

                                                                        
function spravochnik_statusy_zadach({ metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const sql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='zadachi'"
  ).get().sql;
  const m = /status[^,]*?CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i.exec(sql);
  const znachenija = m
    ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''))
    : [];
  return { telo: { spisok: znachenija, otkrytye: znachenija.filter((z) => !['sdelano', 'kogda_nibud'].includes(z)) } };
}

                      

                                                  
                                                                         
                                                
                                                    
                                                          
function napr_uslugi(ctx) { return require('./uslugi.js').inDirection(ctx); }

                                                                      
                                                                      
                                        
function napr_voronka({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const kod = String(kljuch || '');
  if (!db.prepare('SELECT 1 FROM napravlenija WHERE kod = ?').get(kod)) {
    throw new NeNajdeno(`направления ${kod} нет`);
  }
                                                                  
                                                              
                        
    
                                                                    
                                                                 
                                                              
                                                              
    
                                                                  
                                                                
                                                                  
                                                                   
                                                                 
                                                                     
                                                                 
  const SVOI = `AND (SELECT rol_v_baze FROM ljudi WHERE id = s.chelovek_id)
                IS NOT 'kontaktnoe_lico'`;
  const bylo_lidom = `
    SELECT DISTINCT s.chelovek_id FROM sotrudnichestva s
     WHERE s.napravlenie = ? AND (s.arhiv IS NULL OR s.arhiv = 0) ${SVOI}
       AND (s.rol IN ('lid', 'klient')
            OR s.id IN (SELECT obekt_id FROM zhurnal
                         WHERE obekt = 'sotrudnichestvo' AND pole = 'rol'
                           AND (bylo = 'lid' OR stalo = 'lid')))`;
  const stal_klientom = `
    SELECT DISTINCT s.chelovek_id FROM sotrudnichestva s
     WHERE s.napravlenie = ? AND (s.arhiv IS NULL OR s.arhiv = 0) ${SVOI}
       AND (s.rol = 'klient'
            OR s.id IN (SELECT obekt_id FROM zhurnal
                         WHERE obekt = 'sotrudnichestvo' AND pole = 'rol'
                           AND stalo = 'klient'))`;
  const skolko = (zapros) => db.prepare(
    `SELECT count(*) k FROM (${zapros})`).get(kod).k;
  const lidy = skolko(bylo_lidom);
  const klienty = skolko(stal_klientom);
                                                                  
  const proektov = db.prepare(
    `SELECT count(*) k FROM proekty p
     WHERE p.napravlenie = ? AND (p.arhiv IS NULL OR p.arhiv = 0)`
  ).get(kod).k;
                                                                             
                                                             
  const oplacheno = db.prepare(
    `SELECT count(DISTINCT p.id) k FROM proekty p
     JOIN platezhi pl ON pl.proekt_id = p.id
     WHERE p.napravlenie = ? AND pl.oplachen_at IS NOT NULL`
  ).get(kod).k;
                                                                   
                                                                  
                                                                 
                                                                 
                                    
  const dolja = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : null);
  return {
    telo: {
      napravlenie: kod,
      lidy,
      klienty,
      klienty_dolja: dolja(klienty, lidy),
      proekty: proektov,
      oplacheno,
      oplacheno_dolja: dolja(oplacheno, proektov),
                                                                      
                                                                    
                                                                  
                                                     
      ...(klienty > lidy
        ? { stupeni_rashodjatsja: `клиентов ${klienty}, а через лиды прошло ${lidy}` }
        : {}),
    },
  };
}

                           

                                                        
function sprinty_tekuschij({ metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const segodnja = new Date().toISOString().slice(0, 10);
  const nabor = polja('periody');
  if (!nabor.has('nachalo')) {
    return { telo: { period: null, pochemu: 'в periody нет границ' } };
  }
  const p = db.prepare(
    'SELECT * FROM periody WHERE nachalo <= ? AND konec >= ? ORDER BY nachalo DESC LIMIT 1'
  ).get(segodnja, segodnja);
  return { telo: { segodnja, period: p ? v_api(p) : null } };
}

                      

                                                                  
function uved_prochitat_vse({ avtor, metod, zapros, telo }) {
  tolko(metod, 'POST');
  require('./uvedomlenija.js').own(avtor,zapros);
  if(telo?.chelovek_id!==undefined)require('./uvedomlenija.js').own(avtor,telo);
  const db = baza();
  const r = db.prepare(
    'UPDATE uvedomlenija SET prochitano = 1 WHERE chelovek_id = ? AND (prochitano IS NULL OR prochitano = 0)'
  ).run(avtor);
  return { telo: { prochitano: r.changes } };
}

                                                                            
function uved_po_srokam(params) {
  return require('./uvedomlenija-po-srokam.js').vypolnit(params);
}

                           

                                                                       
                                                         
                                                       
                                                                     
                                                                  
                                                                      
  
                                                     
function sostojanie({ metod, avtor, proverennyj_dostup }) {
  tolko(metod, 'GET');

  let dostup = null;
  try {
    const c = baza().prepare('SELECT dostup FROM ljudi WHERE id = ?').get(Number(avtor));
    dostup = c && c.dostup;
  } catch { dostup = proverennyj_dostup || null; }
  if (dostup !== 'polnyj') {
    const e = new Error('страница состояния только при полном доступе');
    e.kod = 403;
    throw e;
  }

  const fs = require('fs');
  const put_k_baze = (() => {
    try { return require('../db/puti.js').BAZA; } catch { return null; }
  })();

                                         
  const zapuschena = new Date(Date.now() - process.uptime() * 1000).toISOString();
  const sluzhba = { rabotaet: true, zapuschena, sekund_v_rabote: Math.round(process.uptime()) };
  try { baza().prepare('SELECT count(*) FROM zadachi').get(); sluzhba.baza_dostupna = true; }
  catch { sluzhba.baza_dostupna = false; }

                                                                
  let snimok = { est: false, kogda: null, imja: null };
  try {
    const papka = require('path').dirname(put_k_baze);
    const svezhij = fs.readdirSync(papka)
      .filter((f) => /^locus-.*\.db$/.test(f))
      .map((f) => ({ imja: f, kogda: fs.statSync(require('path').join(papka, f)).mtime }))
      .sort((a, b) => b.kogda - a.kogda)[0];
    if (svezhij) {
      snimok = { est: true, kogda: svezhij.kogda.toISOString(), imja: svezhij.imja };
    }
  } catch {                             }

                                                                    
                                                                       
                                                                      
                                                    
  let bekap = { est: false, kogda: null, proveren_vosstanovleniem: false };
  try {
    const path = require('path');
    const papka = path.join(path.dirname(put_k_baze), 'bekapy');
    const svezhij = fs.readdirSync(papka)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ imja: f, kogda: fs.statSync(path.join(papka, f)).mtime }))
      .sort((a, b) => b.kogda - a.kogda)[0];
    if (svezhij) {
      let proverka = null;
      try {
        proverka = JSON.parse(fs.readFileSync(path.join(papka, 'proverka.json'), 'utf8'));
      } catch {                              }
                                                                    
                                                                    
      const proveren = false;
      bekap = { est: true, kogda: svezhij.kogda.toISOString(),
                proveren_vosstanovleniem: proveren,
                pojasnenie: proveren
                  ? `копия открыта как база, в ней ${proverka.zadach} задач`
                  : 'восстановлением не проверялся' };
    }
  } catch {                             }

                                                                         
                                                                             
  try {
    const path = require('path');
    const state = JSON.parse(fs.readFileSync(path.join(__dirname, '../ops/backup-state.json'), 'utf8'));
    if (state.snapshot) {
      const m = JSON.parse(fs.readFileSync(path.join(state.snapshot.path, 'backup.json'), 'utf8'));
      snimok = { est: true, kogda: m.created, imja: path.basename(state.snapshot.path) };
    }
    if (state.nightly) {
      const n = state.nightly;
      const manifest = fs.readFileSync(path.join(n.path, 'backup.json'));
      const hash = require('node:crypto').createHash('sha256').update(manifest).digest('hex');
      const proveren = !!n.restored && hash === n.manifest_sha256 && n.smoke?.['/healthz'] === 200;
      bekap = { est: true, kogda: n.created, proveren_vosstanovleniem: proveren,
        vneshnjaja_kopija: n.offsite === true,
        pojasnenie: proveren
          ? `приложение запущено из копии, проверено ${n.files_verified} файлов и все таблицы`
          : 'полный комплект восстановлением не проверялся' };
    }
  } catch {                                                                 }

                              
  let disk = { dostupno_bajt: null, pojasnenie: 'не удалось посчитать' };
  try {
    const st = fs.statfsSync(require('path').dirname(put_k_baze));
    const dostupno = st.bavail * st.bsize;
    disk = { dostupno_bajt: dostupno,
             dostupno_gb: Math.round((dostupno / 1073741824) * 10) / 10,
             vsego_gb: Math.round((st.blocks * st.bsize / 1073741824) * 10) / 10 };
  } catch {                                  }

                               
                                                              
                                                                      
  let oshibok_za_sutki = { chislo: 0, baza_dostupna: true };
  try {
    const n = baza().prepare(
      `SELECT count(*) k FROM zhurnal WHERE obekt = 'oshibka'
         AND kogda > datetime('now','-1 day')`).get().k;
    oshibok_za_sutki = { chislo: n, baza_dostupna: true };
  } catch {
    oshibok_za_sutki = { chislo: null, baza_dostupna: false,
                         pojasnenie: 'база недоступна, число не посчитать' };
  }

  try {
    const path = require('path');
    const cutoff = Date.now() - 86400000;
    let count = 0;
    for (const name of ['errors.jsonl', 'errors.jsonl.previous']) {
      const file = path.join(path.dirname(put_k_baze), 'operational', name);
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        try { if (Date.parse(JSON.parse(line).at) >= cutoff) count++; } catch {                         }
      }
    }
    oshibok_za_sutki.chislo = (oshibok_za_sutki.chislo || 0) + count;
  } catch {                                                              }

  return { telo: { sluzhba, snimok, bekap, disk, oshibok_za_sutki } };
}


                  

                                                                           
                                                       
function proekt(db, id) {
  const p = db.prepare('SELECT * FROM proekty WHERE id = ?').get(chislo(id, 'id'));
  if (!p) throw new NeNajdeno(`проекта ${id} нет`);
  return p;
}

                                                                  
function vidit_dengi(db, avtor) {
  return require('./dengi-dostup.js').vidit(db,avtor);
}

                                                                         
                                                                        
function proekty_otkrytye_zadachi({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const p = proekt(db, kljuch);
  const stroki = db.prepare(
    `SELECT * FROM zadachi WHERE proekt_id = ? AND ${OTKRYTA} AND ${NE_UDALENA}
     ORDER BY srok IS NULL, srok, nomer`
  ).all(p.id);
  return { telo: { spisok: stroki.map((s) => v_api(s)), vsego: stroki.length } };
}

                                                               
  
                                                                    
                                                    
function proekty_svodka({ metod, zapros, avtor }) {
  tolko(metod, 'GET');
  const db = baza();
  const uslovija = [];
  const znachenija = [];
  if (zapros.napravlenie) { uslovija.push('napravlenie = ?'); znachenija.push(zapros.napravlenie); }
  if(zapros.status==='aktivnye')uslovija.push("status IN ('idet','pauza')");else if (zapros.status) { uslovija.push('status = ?'); znachenija.push(zapros.status); }
  if (zapros.arhiv !== '1') uslovija.push('(arhiv IS NULL OR arhiv = 0)');
  const gde = uslovija.length ? `WHERE ${uslovija.join(' AND ')}` : '';
  const odno = (dop) => db.prepare(
    `SELECT count(*) k FROM proekty ${gde}${gde && dop ? ' AND ' : dop ? 'WHERE ' : ''}${dop || ''}`
  ).get(...znachenija).k;
  const telo = {
    vsego: odno(''),
    idet: odno("status = 'idet'"),
    pauza: odno("status = 'pauza'"),
    zavershen: odno("status = 'zavershen'"),
    bez_ceny: odno('stoimost IS NULL'),
  };
                                                                      
  if (vidit_dengi(db, avtor)) {
    const s = db.prepare(
      `SELECT sum(stoimost) s FROM proekty ${gde}${gde ? ' AND ' : 'WHERE '}stoimost IS NOT NULL`
    ).get(...znachenija).s;
    telo.summa = s || 0;
  } else {
    telo.dengi_skryty = true;
  }
  return { telo };
}

                                                                           
                                                                       
                                                                          
function proekty_dostupnye_uslugi({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const p = proekt(db, kljuch);
  const stroki = db.prepare(
    `SELECT * FROM uslugi WHERE napravlenie = ? AND (arhiv IS NULL OR arhiv = 0)
     ORDER BY porjadok, id`
  ).all(p.napravlenie);
  return {
    telo: {
      napravlenie: p.napravlenie,
      spisok: stroki.map((s) => v_api(s)),
      vsego: stroki.length,
    },
  };
}

                                                                                   
  
                                                                          
                                                                   
function proekty_predprosmotr_zavershenija({ kljuch, metod, avtor }) {
  tolko(metod, 'GET');
  const db = baza();
  const p = proekt(db, kljuch);
  const snap=require('./hvosty-proekta.js').snapshot(db,p.id);
  const otkrytyh = db.prepare(
    `SELECT count(*) k FROM zadachi WHERE proekt_id = ? AND ${OTKRYTA} AND ${NE_UDALENA}`
  ).get(p.id).k;
                                                                
                                                     
  const dolg = db.prepare(
    'SELECT count(*) k, sum(summa) s FROM platezhi WHERE proekt_id = ? AND oplachen_at IS NULL'
  ).get(p.id);
  const telo = {
    id: p.id,
    nazvanie: p.nazvanie,
    status: p.status,
    otkrytyh_zadach: otkrytyh,
    platezhey_ne_prishlo: dolg.k,
    varianty_zadach: ['zakryt', 'otvjazat', 'perenesti'],
    default:'otvyazat',versija:p.versija,hvosty_token:snap.token,
    povtorjajuschihsja:snap.tasks.filter(x=>x.povtorjaetsja).length,
    vneshnih_podzadach:snap.outside.length,
  };
  if (vidit_dengi(db, avtor)) telo.summa_ne_prishlo = dolg.s || 0;
  else telo.dengi_skryty = true;
  return { telo };
}

                                                                    
  
                                                                
                                                                          
function proekty_zavershit({ kljuch, telo, metod, avtor }) {
  tolko(metod, 'POST');
  const db = baza();
  const p = proekt(db, kljuch);
  if(p.status==='zavershen')throw new Konflikt('Проект уже завершён',{project_already_completed:true});
  require('./hvosty-proekta.js').observed(db,p,telo);

                                                                  
                                                                  
                                                              
                                                                   
                                                                     
                                                            
    
                                                                    
                                                                     
                                                                  
                                                              
  const syrjo = telo.zadachi_mode != null ? telo.zadachi_mode : telo.chto_s_zadachami;

                                                                  
                                                                 
                                                                
                                                 
  if (syrjo === undefined || syrjo === null || String(syrjo).trim() === '') {
    const otkrytyh = db.prepare(
      `SELECT count(*) k FROM zadachi WHERE proekt_id = ? AND ${OTKRYTA} AND ${NE_UDALENA}`
    ).get(p.id).k;
    if (otkrytyh) {
      throw new OshibkaVvoda(
        `у проекта ${otkrytyh} открытых задач, скажи что с ними: `
        + 'zadachi_mode это zakryt, otvjazat или perenesti', 'zadachi_mode');
    }
  }

  const PSEVDONIMY = { otvyazat: 'otvjazat', perenest: 'perenesti' };
  const nazvano = String(syrjo == null ? 'zakryt' : syrjo).trim();
  const rezhim = PSEVDONIMY[nazvano] || nazvano;
  if (!['zakryt', 'otvjazat', 'perenesti'].includes(rezhim)) {
    throw new OshibkaVvoda('zadachi_mode: zakryt, otvjazat или perenesti', 'zadachi_mode');
  }
                                                                    
                                                                         
                                                          
  const kuda_syrjo = telo.v_proekt_id != null ? telo.v_proekt_id : telo.proekt_id_plana;
  const kuda = rezhim === 'perenesti' ? chislo(kuda_syrjo, 'v_proekt_id') : null;
  if (kuda !== null) proekt(db, kuda);

  const otkrytye = db.prepare(
    `SELECT * FROM zadachi WHERE proekt_id = ? AND ${OTKRYTA} AND ${NE_UDALENA}`
  ).all(p.id);

  if(rezhim==='perenesti')require('./hvosty-proekta.js').transfer(db,p,proekt(db,kuda),otkrytye);
  if(rezhim==='zakryt'&&otkrytye.some(x=>x.povtorjaetsja))throw new OshibkaVvoda('Повторяющиеся задачи отмечают по дням. Оставь их открытыми или перенеси в другой проект.','zadachi_mode');
  let zakryto = 0, otvjazano = 0, perenes = 0;
  for (const z of otkrytye) {
    if (rezhim === 'zakryt') {
      db.prepare('UPDATE zadachi SET status = ?, versija = versija + 1 WHERE id = ?')
        .run('sdelano', z.id);
      v_zhurnal(db, 'zadachi', z.id, 'status', z.status, 'sdelano', avtor);
      const stalo=db.prepare('SELECT * FROM zadachi WHERE id=?').get(z.id);
      require('./opisanija.js').OPISANIJA.zadachi.posle_pravki(stalo,z,db,avtor);
      zakryto += 1;
    } else if (rezhim === 'otvjazat') {
                                                                             
      db.prepare('UPDATE zadachi SET proekt_id = NULL, versija = versija + 1 WHERE id = ?')
        .run(z.id);
      v_zhurnal(db, 'zadachi', z.id, 'proekt_id', String(p.id), null, avtor);
      otvjazano += 1;
    } else {
      db.prepare('UPDATE zadachi SET proekt_id = ?, versija = versija + 1 WHERE id = ?')
        .run(kuda, z.id);
      v_zhurnal(db, 'zadachi', z.id, 'proekt_id', String(p.id), String(kuda), avtor);
      perenes += 1;
    }
  }

  db.prepare('UPDATE proekty SET status = ?, versija = versija + 1 WHERE id = ?')
    .run('zavershen', p.id);
  v_zhurnal(db, 'proekty', p.id, 'status', p.status, 'zavershen', avtor);
  const stalo = db.prepare('SELECT * FROM proekty WHERE id = ?').get(p.id);
  return {
    telo: {
      ...v_api(stalo),
      zakryto_zadach: zakryto,
      otvjazano,
                                                                  
                                                              
                                                                    
                                              
      otvyazano: otvjazano,
      perenes,
                                                                  
                                                                    
                                                                   
                                                                   
                     
      chto_s_zadachami: rezhim,
    },
  };
}

                                                                    
function proekty_vozobnovit({ kljuch, metod, avtor, telo={} }) {
  tolko(metod, 'POST');
  const db = baza();
  const p = proekt(db, kljuch);
  require('./hvosty-proekta.js').observed(db,p,telo);
  if (p.status === 'idet') return { telo: v_api(p) };
  db.prepare('UPDATE proekty SET status = ?, versija = versija + 1 WHERE id = ?')
    .run('idet', p.id);
  v_zhurnal(db, 'proekty', p.id, 'status', p.status, 'idet', avtor);
  const stalo = db.prepare('SELECT * FROM proekty WHERE id = ?').get(p.id);
  return { telo: v_api(stalo) };
}

                                                                       
                                                                         
                                                                    
function proekty_arhiv({ kljuch, telo, metod, avtor }) {
  tolko(metod, 'POST');
  return arhiv_pereklyuchit({
    telo: { tablica: 'proekty', id: kljuch, v_arhiv: telo.v_arhiv, arhiv: telo.arhiv, versija: telo.versija },
    avtor, metod,
  });
}

                  

                                                                   
                                                                           
function sostojanie_platezha(p) {
  return p.oplachen_at ? 'prishlo' : 'zhdem';
}

                                                             
                                                   
function platezh_v_api(p, vidno) {
  const out = { ...v_api(p), status: sostojanie_platezha(p) };
  if (!vidno) { delete out.summa; out.summa_skryta = true; }
  return out;
}

function platezh(db, id) {
  const p = db.prepare('SELECT * FROM platezhi WHERE id = ?').get(chislo(id, 'id'));
  if (!p) throw new NeNajdeno(`платежа ${id} нет`);
  return p;
}

                                                                         
                                                                          
                                
function segodnja_po_nastrojkam(db) {
  const n = db.prepare('SELECT chasovoj_pojas FROM nastrojki_sistemy LIMIT 1').get();
  const pojas = (n && n.chasovoj_pojas) || 'Europe/Moscow';
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: pojas }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

                                                         
                                                          
  
                                                                     
                                                                            
function proekty_platezhi({ kljuch, telo, zapros, metod, avtor }) {
  const db = baza();
  const p = proekt(db, kljuch);
  const vidno = vidit_dengi(db, avtor);

  if (metod === 'GET') {
    if(Object.hasOwn(zapros,'zapros_kljuch')){
      if(!vidno)throw new NetDostupa('Суммы недоступны');
      for(const field of Object.keys(zapros))if(field!=='zapros_kljuch')throw new OshibkaVvoda('Неизвестный параметр проверки',field);
      return {telo:require('./zapros-sozdanija.js').check(db,avtor,'platezhi',p.id,zapros.zapros_kljuch,row=>platezh_v_api(row,true))};
    }
    const stroki = db.prepare(
      `SELECT * FROM platezhi WHERE proekt_id = ?
       ORDER BY oplachen_at IS NOT NULL, zhdem_do, id`
    ).all(p.id);
    const spisok = stroki.map((s) => platezh_v_api(s, vidno));
    const itog = { spisok, vsego: spisok.length };
    if (vidno) {
      itog.summa_zhdem = stroki.filter((s) => !s.oplachen_at)
        .reduce((n, s) => n + (s.summa || 0), 0);
      itog.summa_prishlo = stroki.filter((s) => s.oplachen_at)
        .reduce((n, s) => n + (s.summa || 0), 0);
    } else {
      itog.dengi_skryty = true;
    }
    return { telo: itog };
  }

  tolko(metod, 'POST');
  if (!vidno) throw new NetDostupa('суммы недоступны, платёж не завести');
  const receipt=require('./zapros-sozdanija.js'),present=row=>platezh_v_api(row,true);
  if(telo.otmenit_dobavlenie===true){
    for(const field of Object.keys(telo))if(!['otmenit_dobavlenie','zapros_kljuch'].includes(field))throw new OshibkaVvoda('Лишнее поле отмены добавления',field);
    return {telo:receipt.cancel(db,avtor,'platezhi',p.id,telo.zapros_kljuch,present)};
  }
  const allowed=['summa','zhdem_do','kogda_zhdem','vystavlen_at','nomer','naznachenie','zapros_kljuch'];
  for(const field of Object.keys(telo))if(!allowed.includes(field))throw new OshibkaVvoda('Неизвестное поле платежа',field);
  if(telo.zhdem_do!==undefined&&telo.kogda_zhdem!==undefined&&telo.zhdem_do!==telo.kogda_zhdem)throw new OshibkaVvoda('Даты ожидания не совпадают','zhdem_do');
  const body={summa:require('./platezhi.js').summa(telo.summa),zhdem_do:telo.zhdem_do??telo.kogda_zhdem};
  if(!body.zhdem_do)throw new OshibkaVvoda('Нужна дата ожидаемого платежа','zhdem_do');
  for(const field of ['vystavlen_at','nomer','naznachenie'])if(telo[field]!==undefined){
    if(telo[field]!==null&&typeof telo[field]!=='string')throw new OshibkaVvoda('Нужен текст',field);
    body[field]=telo[field]===null?null:telo[field].trim()||null;
  }
  require('./platezhi.js').proveritDannye(body);
  return {kod:201,telo:receipt.create(db,avtor,'platezhi',p.id,telo.zapros_kljuch,body,()=>require('./obschij.js').sozdat('platezhi',require('./opisanija.js').OPISANIJA.platezhi,{proekt_id:p.id,...body,vystavlen_at:body.vystavlen_at||segodnja_po_nastrojkam(db)},avtor),present)};
}

                                                                              
function platezhi_predprosmotr_otmetki({ kljuch, metod, avtor }) {
  tolko(metod, 'GET');
  const db = baza();
  const p = platezh(db, kljuch);
  if (!vidit_dengi(db, avtor)) throw new NetDostupa('суммы недоступны');
  return {
    telo: {
      id: p.id,
      versija: p.versija,
      proekt_id: p.proekt_id,
      naznachenie: p.naznachenie,
      status: sostojanie_platezha(p),
      summa_po_umolchaniyu: p.summa,
      data_po_umolchaniyu: segodnja_po_nastrojkam(db),
      zhdem_do: p.zhdem_do,
    },
  };
}

                                                                 
  
                                                                  
                                                                      
                                                                       
                                     
function platezhi_prishlo(ctx) {
 return require('./platezhi.js').prishlo({...ctx,segodnja:()=>segodnja_po_nastrojkam(baza())});
}
function platezhi_otmenit_prishlo(ctx) {
 return require('./platezhi.js').otmenit(ctx);
}

                                                                                    
  
                                                                       
                                                                         
function platezhi_shablon_zadachi({ kljuch, metod, avtor }) {
  tolko(metod, 'GET');
  const db = baza();
  const p = platezh(db, kljuch);
  const pr = db.prepare('SELECT * FROM proekty WHERE id = ?').get(p.proekt_id);
  const vidno = vidit_dengi(db, avtor);
                                                                   
  const zagotovka = {
    shablon: 'poluchit_oplatu',
    nazvanie: `Получить оплату${p.naznachenie ? `: ${p.naznachenie}` : ''}`,
    platezh_id: p.id,
    proekt_id: p.proekt_id,
    napravlenie: pr ? pr.napravlenie : null,
    klient_id: pr ? pr.klient_id : null,
    tip: 'klientskaja',
    status: 'v_plane',
    srok: p.zhdem_do || null,
    otvetstvennyj: Number.isInteger(avtor) ? avtor : null,
    platezh_kontekst: pr?require('./platezh-zadachi.js').context(db,p,pr,avtor):null,
  };
  if (vidno) zagotovka.summa = p.summa;
  return { telo: { zagotovka, summa_skryta: !vidno } };
}

                                
  
                                                             
                                                                
                                                                     
                                                                          
  
                                                                         
                                                                   

                                                                   
                                                                  
                                                                
const DATA_DOKUMENTA = 'data';

                                                                    
                                                         
function privjazka_materialov(db, tablica, kljuch) {
  if (tablica === 'proekty') {
                                                          
                                                                   
                                                                
                                                             
    if (!/^\d+$/.test(String(kljuch || ''))) {
      return privjazka_materialov(db, 'napravlenija', kljuch);
    }
    const p = proekt(db, kljuch);
    return { pole: 'proekt_id', znachenie: p.id, dokumenty: true };
  }
  if (tablica === 'ljudi') {
                                                                          
                                                                       
                                               
    const c = chelovek_ili_imja(db, kljuch);
    return { pole: 'chelovek_id', znachenie: c.id, dokumenty: true };
  }
  if (tablica === 'napravlenija') {
    const kod = String(kljuch || '');
    if (!db.prepare('SELECT 1 FROM napravlenija WHERE kod = ?').get(kod)) {
      throw new NeNajdeno(`направления ${kod} нет`);
    }
    return { pole: 'napravlenie', znachenie: kod, dokumenty: true };
  }
  if (tablica === 'zadachi') {
    const z = zadacha(db, kljuch);
                                                                      
                                            
    return { pole: 'zadacha_id', znachenie: z.id, dokumenty: false };
  }
  throw new OshibkaVvoda(`материалы не крепятся к ${tablica}`, 'tablica');
}

                                                                 
                                                                
                            
function material_v_api(s, obekt) {
  const out = { ...v_api(s), obekt };
  if (obekt === 'dokument') out.data_dokumenta = s[DATA_DOKUMENTA] || null;
                                                                  
                                                                  
                               
  out.vid_istochnika = s.fajl ? 'fajl' : (s.ssylka ? 'ssylka' : 'zapis');
                                                                 
                                                    
  if (obekt === 'material') {
    delete out.tip; delete out.nomer; delete out.data_dokumenta;
  }
  return require('./materialy-vid.js').present(out);
}

function materialy_obschie({ tablica, kljuch, telo, zapros, metod, avtor }) {
  const db = baza();
  const pr = privjazka_materialov(db, tablica, kljuch);

  if (metod === 'GET') {
    const chto = zapros.obekt ? String(zapros.obekt) : null;
    if (chto && !['material', 'dokument'].includes(chto)) {
      throw new OshibkaVvoda('obekt: material или dokument', 'obekt');
    }
    const q = zapros.q ? String(zapros.q).trim() : '';
    const itog = {};

    if (!chto || chto === 'material') {
                                                                    
                                                          
      const uslovija = [`m.${pr.pole} = ?`];
      const znachenija = [pr.znachenie];
      if (q) {
                                                                      
                                                       
        znachenija.push();
      }
      const stroki = db.prepare(
        `SELECT m.*, l.imja avtor FROM materialy m
         LEFT JOIN ljudi l ON l.id = m.kto_dobavil
         WHERE ${uslovija.join(' AND ')}
         ORDER BY m.sozdano DESC, m.id DESC`
      ).all(...znachenija);
      itog.materialy = stroki
        .filter((s) => !q || soderzhit(s.nazvanie, q) || soderzhit(s.avtor, q))
        .map((s) => material_v_api(s, 'material'));
    }

    if (pr.dokumenty && (!chto || chto === 'dokument')) {
                                                                        
                                                                    
      const uslovija = [`d.${pr.pole} = ?`];
      const znachenija = [pr.znachenie];
      if (q) {
                                                    
        znachenija.push();
      }
      if (zapros.tip) { uslovija.push('d.tip = ?'); znachenija.push(String(zapros.tip)); }
      const stroki = db.prepare(
        `SELECT d.*, l.imja avtor FROM dokumenty d
         LEFT JOIN ljudi l ON l.id = d.kto_dobavil
         WHERE ${uslovija.join(' AND ')}
         ORDER BY d.${DATA_DOKUMENTA} DESC, d.sozdano DESC, d.id DESC`
      ).all(...znachenija);
      itog.dokumenty = stroki
        .filter((s) => !q || soderzhit(s.nazvanie, q) || soderzhit(s.nomer, q))
        .map((s) => material_v_api(s, 'dokument'));
    }

                                                                     
                                                                         
                                                     
    if (!pr.dokumenty) itog.dokumenty = false;

    return {
      telo: {
        ...itog,
        materialov: itog.materialy ? itog.materialy.length : 0,
        dokumentov: Array.isArray(itog.dokumenty) ? itog.dokumenty.length : 0,
      },
    };
  }

  tolko(metod, 'POST');
  const chto = String(telo.obekt || 'material');
  if (!['material', 'dokument'].includes(chto)) {
    throw new OshibkaVvoda('obekt: material или dokument', 'obekt');
  }
  if (chto === 'dokument' && !pr.dokumenty) {
    throw new OshibkaVvoda('документы к задаче не крепятся', 'obekt');
  }
                                                               
                                                
  const nazvanie = String(telo.nazvanie || '').trim();
  if (!nazvanie) {
    const e = new OshibkaVvoda('нужно название', 'nazvanie');
    e.dannye = { kod: 'nuzhno_nazvanie' };
    throw e;
  }
                                                                        
                                                                          
  const ssylka = telo.ssylka || telo.url || null;
  const fajl = telo.fajl || null;
  if (!ssylka && !fajl) throw new OshibkaVvoda('нужен файл или ссылка', 'ssylka');

  const obschie = {
    nazvanie,
    ssylka: ssylka ? String(ssylka) : null,
    fajl: fajl ? String(fajl) : null,
    razmer: telo.razmer === undefined ? null : telo.razmer,
    tip_fajla: telo.tip_fajla || null,
    kto_dobavil: Number.isInteger(avtor) ? avtor : null,
    sozdano: seichas(),
    versija: 1,
  };
                                                                   
                                                             
  const privjazki = {
    chelovek_id: telo.chelovek_id === undefined ? null : telo.chelovek_id,
    proekt_id: telo.proekt_id === undefined ? null : telo.proekt_id,
    napravlenie: telo.napravlenie === undefined ? null : telo.napravlenie,
  };
  if (chto === 'material') privjazki.zadacha_id = telo.zadacha_id === undefined ? null : telo.zadacha_id;
  privjazki[pr.pole] = pr.znachenie;

  const input={nazvanie:obschie.nazvanie,ssylka:obschie.ssylka,fajl:obschie.fajl,razmer:obschie.razmer,tip_fajla:obschie.tip_fajla,...privjazki,...(telo.zapros_kljuch!==undefined?{zapros_kljuch:telo.zapros_kljuch}:{})};
  if (chto === 'material') {
    const row=require('./materialy-komandy.js').create('materialy',input,avtor);
    return {kod:201,telo:material_v_api(row,'material')};
  }

                                                               
                                                                  
  const tip = String(telo.tip || '').trim();
                                                                 
                                                                    
  const TIPY_DOK = require('./opisanija.js').OPISANIJA.dokumenty.spravochniki.tip;
  if (!TIPY_DOK.includes(tip)) {
    throw new OshibkaVvoda(`tip: одно из ${TIPY_DOK.join(', ')}`, 'tip');
  }
  const data = String(telo[DATA_DOKUMENTA] || telo.data_dokumenta || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new OshibkaVvoda('data в виде ГГГГ-ММ-ДД', 'data');
  }
  const row=require('./materialy-komandy.js').create('dokumenty',
    {...input,tip,[DATA_DOKUMENTA]:data,nomer:telo.nomer||null},avtor);
  return {kod:201,telo:material_v_api(row,'dokument')};
}

                                                                                
  
                                                                        
                                                                        
function proekty_fajly({ kljuch, zapros, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const p = proekt(db, kljuch);
  const smeshenie = Math.max(0, parseInt(zapros.smeshenie, 10) || 0);
  const skolko = Math.min(Math.max(parseInt(zapros.skolko, 10) || 10, 1), 100);
  const materialy = db.prepare(
    `SELECT m.*, l.imja avtor FROM materialy m
     LEFT JOIN ljudi l ON l.id = m.kto_dobavil
     WHERE m.proekt_id = ? ORDER BY m.sozdano DESC, m.id DESC LIMIT ? OFFSET ?`
  ).all(p.id, skolko, smeshenie);
  const dokumenty = db.prepare(
    `SELECT d.*, l.imja avtor FROM dokumenty d
     LEFT JOIN ljudi l ON l.id = d.kto_dobavil
     WHERE d.proekt_id = ? ORDER BY d.${DATA_DOKUMENTA} DESC, d.sozdano DESC, d.id DESC
     LIMIT ? OFFSET ?`
  ).all(p.id, skolko, smeshenie);
  const vsego_m = db.prepare('SELECT count(*) k FROM materialy WHERE proekt_id = ?').get(p.id).k;
  const vsego_d = db.prepare('SELECT count(*) k FROM dokumenty WHERE proekt_id = ?').get(p.id).k;
  return {
    telo: {
      materialy: materialy.map((s) => material_v_api(s, 'material')),
      dokumenty: dokumenty.map((s) => material_v_api(s, 'dokument')),
      smeshenie,
      skolko,
      materialov_vsego: vsego_m,
      dokumentov_vsego: vsego_d,
      est_esche: smeshenie + skolko < Math.max(vsego_m, vsego_d),
    },
  };
}

                 

function uslugi_vlijanie(ctx) { return require('./uslugi.js').handle({...ctx,dejstvie:'vlijanie'}); }
function uslugi_zamena(ctx) { return require('./uslugi.js').handle({...ctx,dejstvie:'zamena'}); }

                                                                       
  
                                                                   
                                                                    
function shablony_iz_zadachi(ctx) {
  return require('./shablony.js').fromTask(ctx);
}
                                                         
  
                                                                     
                                                        
function shablony_dubl(ctx) {
  return require('./shablony.js').duplicate(ctx);
}
                                                  

                                                                              
  
                                                                         
                                                          
const NASLEDUETSJA = ['napravlenie', 'proekt_id', 'klient_id', 'otvetstvennyj',
                      'sprint', 'tip'];
const NE_NASLEDUETSJA = ['nazvanie', 'opisanie', 'srok', 'plan_chislo', 'cel_id',
                         'uchastniki', 'data'];

function zadachi_zagotovka_podzadachi({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const z = zadacha(db, kljuch);
  const zagotovka = { roditel_id: z.id, status: 'v_plane' };
  zagotovka.god_sprinta = z.god_sprinta ?? null;
  for (const pole of NASLEDUETSJA) zagotovka[pole] = z[pole] === undefined ? null : z[pole];
  for (const pole of NE_NASLEDUETSJA) zagotovka[pole] = pole === 'uchastniki' ? [] : null;
  return {
    telo: {
      zagotovka: v_api(zagotovka),
      nasleduetsja: NASLEDUETSJA,
      ne_nasleduetsja: NE_NASLEDUETSJA,
      roditel: { id: z.id, nomer: z.nomer, nazvanie: z.nazvanie },
    },
  };
}

                                                                  
                                                                    
                                                                    
const KLJUCHI_PAKETA = new Map();

                                                              
  
                                                                       
                                                                        
                   
function zadachi_paket({ telo, metod, avtor }) {
  tolko(metod, 'POST');
  const db = baza();
  const spisok = Array.isArray(telo.zadachi) ? telo.zadachi
    : Array.isArray(telo) ? telo : null;
  if (!spisok || !spisok.length) {
    throw new OshibkaVvoda('zadachi: массив задач', 'zadachi');
  }
  if (spisok.length > 200) {
    throw new OshibkaVvoda('за раз не больше 200 задач', 'zadachi');
  }
  const kljuch_idemp = telo.kljuch !== undefined ? String(telo.kljuch)
    : telo.kljuch_idempotentnosti !== undefined ? String(telo.kljuch_idempotentnosti) : null;
  if (kljuch_idemp && KLJUCHI_PAKETA.has(kljuch_idemp)) {
                                              
    return { telo: { ...KLJUCHI_PAKETA.get(kljuch_idemp), povtor: true } };
  }

  const { sozdat } = require('./obschij.js');
  const { OPISANIJA } = require('./opisanija.js');
  const zavedeno = [];
  const oshibki = [];
                                                                        
                                                           
  db.exec('BEGIN');
  try {
    spisok.forEach((d, i) => {
      try {
        zavedeno.push(sozdat('zadachi', OPISANIJA.zadachi, { ...d }, avtor));
      } catch (e) {
        oshibki.push({ nomer_v_pakete: i + 1, oshibka: e.message, pole: e.pole || null });
      }
    });
    if (oshibki.length) throw Object.assign(new Error('в пакете есть ошибки'), { kod: 422 });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    if (oshibki.length) {
      return { kod: 422, telo: { zavedeno: 0, oshibki } };
    }
    throw e;
  }

  const itog = { zavedeno: zavedeno.length, zadachi: zavedeno, povtor: false };
  if (kljuch_idemp) KLJUCHI_PAKETA.set(kljuch_idemp, itog);
  return { kod: 201, telo: itog };
}

                                                                    
  
                                                                        
                                                                        
function zadachi_shablony({ metod, zapros, avtor }) {
  tolko(metod,'GET');return {telo:{...require('./shablony.js').list(baza(),avtor,zapros)}};
}
                                                                            
  
                                                                  
                                                                 
function zadachi_iz_shablona({ telo, metod, avtor }) {
  tolko(metod, 'POST');
  const db = baza();
  const kod = telo.shablon !== undefined ? String(telo.shablon)
    : telo.kod !== undefined ? String(telo.kod) : null;
  if (!kod) throw new OshibkaVvoda('shablon: код или id шаблона', 'shablon');
  let sh;try{sh=require('./shablony.js').readable(db,kod,avtor);}catch(error){if(error.kod!==404||kod!=='poluchit_oplatu')throw error;}
  const polja_zadachi = polja('zadachi');
  const dannye = {};
                                                                      
                                                   
  if (sh) {
    dannye.nazvanie = sh.nazvanie;
    if (sh.tip) dannye.tip = sh.tip;
    if (sh.opisanie) dannye.opisanie = sh.opisanie;
    dannye.shablon = sh.kod || String(sh.id);
    const defaultDeadline=require('./shablony.js').deadline(sh);if(defaultDeadline&&!require('./rol-zadachi-rassylki.js').template(sh))dannye.srok=defaultDeadline;
  } else if (kod === 'poluchit_oplatu') {
                                                                      
                                                              
    dannye.nazvanie = 'Получить оплату';
    dannye.tip = 'klientskaja';
    dannye.shablon = kod;
  } else {
    throw new NeNajdeno(`шаблона ${kod} нет`);
  }

  for (const [k, v] of Object.entries(telo)) {
    if (['shablon', 'kod'].includes(k)) continue;
    if (!polja_zadachi.has(k)&&!['platezh_kontekst','summa'].includes(k)) throw new OshibkaVvoda(`у задачи нет поля ${k}`, k);
    dannye[k] = v;
  }

                                                                       
                                                                   
  if (dannye.platezh_id) {
    const p = db.prepare('SELECT * FROM platezhi WHERE id = ?').get(Number(dannye.platezh_id));
    if (!p) throw new OshibkaVvoda('платежа нет', 'platezh_id');
    const pr = db.prepare('SELECT * FROM proekty WHERE id = ?').get(p.proekt_id);
    if (dannye.proekt_id === undefined) dannye.proekt_id = p.proekt_id;
    if (!Object.hasOwn(telo,'srok')) dannye.srok = p.zhdem_do;
    if (!Object.hasOwn(telo,'tip')) dannye.tip = 'klientskaja';
                                                                           
                                                                                
    if (pr) {
      if (dannye.napravlenie === undefined) dannye.napravlenie = pr.napravlenie;
      if (dannye.klient_id === undefined) dannye.klient_id = pr.klient_id;
    }
  }
  if (dannye.otvetstvennyj === undefined && Number.isInteger(avtor)) {
    dannye.otvetstvennyj = avtor;
  }

  const { sozdat } = require('./obschij.js');
  const { OPISANIJA } = require('./opisanija.js');
  const novaja = sozdat('zadachi', OPISANIJA.zadachi, dannye, avtor);

                                                                  
                                                       
  let podzadach = 0;
  if (sh) {
    const shagi = db.prepare(
      'SELECT nazvanie FROM shablon_podzadachi WHERE shablon_id = ? ORDER BY porjadok'
    ).all(sh.id);
    for (const sh_z of shagi) {
      sozdat('zadachi', OPISANIJA.zadachi, {
        nazvanie: sh_z.nazvanie,
        napravlenie: novaja.napravlenie,
        otvetstvennyj: novaja.otvetstvennyj,
        roditel_id: novaja.id,
        tip: novaja.tip,
        klient_id: novaja.klient_id,
        proekt_id: novaja.proekt_id,
        sprint: novaja.sprint,
        god_sprinta: novaja.god_sprinta,
        ...(novaja.tip === 'biznesovaja' ? { plan_chislo: novaja.plan_chislo } : {}),
      }, avtor);
      podzadach += 1;
    }
  }

  return { kod: 201, telo: { ...novaja, podzadach } };
}

                                                            
  
                                                                     
                                                    
function zadachi_fakt({ kljuch, metod }) {
  tolko(metod, 'GET');
  const db = baza();
  const z = zadacha(db, kljuch);
  const po_chemu = (chto) => db.prepare(
    `SELECT count(DISTINCT chelovek_id) k FROM rassylka_kasanija
     WHERE zadacha_id = ? AND chto = ?`
  ).get(z.id, chto).k;
  const otpravleno = po_chemu('otpravleno');
  const otvetili = po_chemu('otvet');
                                                                 
                                                         
  const vsego_v_zadache = db.prepare(
    'SELECT count(*) k FROM zadacha_uchastniki WHERE zadacha_id = ?'
  ).get(z.id).k;
  const vsego_v_rassylke = z.rassylka_id
    ? db.prepare('SELECT count(*) k FROM rassylka_ljudi WHERE rassylka_id = ?')
        .get(z.rassylka_id).k
    : 0;
  return {
    telo: {
      zadacha_id: z.id,
      nomer: z.nomer,
      rassylka_id: z.rassylka_id || null,
      otpravleno,
      otvetili,
      vsego: vsego_v_zadache || vsego_v_rassylke,
      plan_chislo: z.plan_chislo === undefined ? null : z.plan_chislo,
    },
  };
}

                                                                     
  
                                                                    
                                                    
function zadachi_baza({ kljuch, metod, zapros }) {
  tolko(metod, 'GET');
  const db = baza();
  const z = zadacha(db, kljuch);
  const stroki = db.prepare(
    `SELECT u.chelovek_id, l.imja, l.foto, l.inicialy,
            (SELECT count(*) FROM rassylka_kasanija k
              WHERE k.zadacha_id = u.zadacha_id AND k.chelovek_id = u.chelovek_id
                AND k.chto = 'otpravleno') otmecheno_raz,
            (SELECT max(kogda) FROM rassylka_kasanija k
              WHERE k.zadacha_id = u.zadacha_id AND k.chelovek_id = u.chelovek_id)
              poslednee_kasanie
     FROM zadacha_uchastniki u
     JOIN ljudi l ON l.id = u.chelovek_id
     WHERE u.zadacha_id = ? ORDER BY l.imja`
  ).all(z.id);
  let spisok = stroki.map((s) => ({
    chelovek_id: s.chelovek_id,
    imja: s.imja,
    foto: s.foto,
    inicialy: s.inicialy,
    otmecheno: s.otmecheno_raz > 0,
    poslednee_kasanie: s.poslednee_kasanie || null,
  }));
  if (zapros.otmecheno === '0') spisok = spisok.filter((s) => !s.otmecheno);
  if (zapros.otmecheno === '1') spisok = spisok.filter((s) => s.otmecheno);
  return {
    telo: {
      spisok,
      vsego: spisok.length,
      otmecheno: spisok.filter((s) => s.otmecheno).length,
    },
  };
}

                                                                     
                                                                     
function poleznoe_povtory({ metod }) {
  tolko(metod, 'GET');
  const db = baza();
  let stroki = [];
  try {
    stroki = db.prepare(
      `SELECT * FROM zadachi WHERE povtorjaetsja = 1 AND ${NE_UDALENA}
       ORDER BY nomer`).all();
  } catch { stroki = []; }

                                                              
                                                       
    
                                                                    
                                                                
                                                                 
                                                                  
                                                                      
                                                              
  const den_segodnja = den_msk();

  const spisok = stroki.map((z) => ({
    ...v_api(z),
    chastota: z.chastota || null,
    sledujuschij_den: require('./povtory.js').sledujuschij_den(z, den_segodnja),
                                                                        
                                                                      
                                                                      
    ...(povtor_sostojanie(db, z, den_segodnja) || {}),
  }));
  return { telo: { spisok, vsego: spisok.length } };
}

                                                                    
                                                                         
function poleznoe_uslugi({ metod }) {
  tolko(metod, 'GET');
  return {
    telo: {
      spisok: [],
      vsego: 0,
      gde: '/api/napravlenija/{kod}/uslugi',
      pojasnenie: 'услуги живут в карточке направления, в Полезном их нет',
    },
  };
}

                                                                   
                                                                      
                                    
const PRODLENIJA = new Map();

                                                                        
                                                                       
                                               
function zadachi_prodlit(ctx) {
  const itog = require('./ekrany.js').prodlit(ctx);
  const spisok = (itog.telo && itog.telo.otmena) || [];
  if (spisok.length) {
    const operacija_id = `prodlenie-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    PRODLENIJA.set(operacija_id, { spisok, kto: ctx.avtor });
                                                              
    if (PRODLENIJA.size > 20) PRODLENIJA.delete(PRODLENIJA.keys().next().value);
    itog.telo.operacija_id = operacija_id;
  }
  return itog;
}

                                                                    
  
                                                                   
                                                
function zadachi_prodlit_otmena({ telo, metod, avtor }) {
  tolko(metod, 'POST');
  const db = baza();
  const operacija_id = telo.operacija_id ? String(telo.operacija_id) : null;
                                                                   
                                                            
  const svoj = Array.isArray(telo.otmena) && telo.otmena.length ? telo.otmena : null;
  const zapomnennoe = operacija_id ? PRODLENIJA.get(operacija_id) : null;
  if (!zapomnennoe && !svoj) {
                                                                     
                                                          
    throw new NeNajdeno(operacija_id
      ? `операции ${operacija_id} нет, срок отмены истёк`
      : 'нужен operacija_id или список otmena');
  }
  const spisok = zapomnennoe ? zapomnennoe.spisok : svoj;
  if (zapomnennoe && Number(zapomnennoe.kto)!==Number(avtor)) throw Object.assign(new Error('это продление другого участника'),{kod:403});
  const result = require('./ekrany.js').otmena({telo:{otmena:spisok},metod,avtor});
  const vozvrashcheno = result.telo.vernuto;
  if (operacija_id) PRODLENIJA.delete(operacija_id);
  return { telo: { vozvrashcheno, operacija_id } };
}

                                                                
                                                                   
                                              
const e2 = () => require('./ekrany2.js');

const PODRUCHKI_KODA = {
  lenta: Object.fromEntries(['nedeli','potok','proverka','otmena_popytki'].map(dejstvie=>[dejstvie,ctx=>require('./lenta-komandy.js').handle({...ctx,dejstvie})])),
  fokus: {
    zadacha:ctx=>require('./fokus-zadacha.js').read(ctx),
    ...Object.fromEntries(['pause','resume','reset','proverka','otmena_popytki'].map(action=>[action,ctx=>e2().fokus({...ctx,kljuch:action})])),
    start:   (ctx) => e2().fokus({ ...ctx, kljuch: 'start' }),
    stop:    (ctx) => e2().fokus({ ...ctx, kljuch: 'stop' }),
    rejting: (ctx) => e2().fokus({ ...ctx, kljuch: 'rejting' }),
  },
  dengi: {
    prognoz: (ctx) => e2().dengi_prognoz(ctx),
    svodka:  (ctx) => e2().dengi_svodka(ctx),
  },
  poleznoe: {
    grafik:   (ctx) => e2().poleznoe({ ...ctx, zapros: { ...ctx.zapros, vkladka: 'grafik' } }),
    principy: (ctx) => e2().poleznoe({ ...ctx, zapros: { ...ctx.zapros, vkladka: 'principy' } }),
                                                                 
                                                                      
                                                                         
    povtory:  poleznoe_povtory,
                                                                
                                                                   
                                            
    uslugi:   poleznoe_uslugi,
  },
  vhod: {
    proverit: (ctx) => require('./ekrany.js').vhod({ ...ctx, kljuch: 'proverit' }),
    vyjti:    (ctx) => require('./ekrany.js').vhod({ ...ctx, kljuch: 'vyjti' }),
  },
  plashki: {
    skryt: (ctx) => require('./ekrany3.js').plashki({ ...ctx, kljuch: 'skryt' }),
  },
  insajty: {
    otlozhit: (ctx) => require('./insajty-otlozhit.js').handle({ ...ctx, dejstvie: 'otlozhit' }),
    proverka: (ctx) => require('./insajty-otlozhit.js').handle({ ...ctx, dejstvie: 'proverka' }),
    otmena_popytki: (ctx) => require('./insajty-otlozhit.js').handle({ ...ctx, dejstvie: 'otmena_popytki' }),
  },
  ljudi: {
    akkaunty: ljudi_akkaunty,
    anketa: ljudi_anketa,
    istorija: ljudi_istorija,
    istorija_filtrov: ljudi_istorija_filtrov,
    celikom: ljudi_celikom,
    chislo: ljudi_chislo,
    dejstvija: ljudi_dejstvija,
    dostup: ljudi_dostup,
    filtry: ljudi_filtry,
    kontakty: ljudi_kontakty,
                                                                   
                                                   
    materialy: (ctx) => materialy_obschie({ ...ctx, tablica: 'ljudi' }),
    nabory_filtrov: ljudi_nabory_filtrov,
    predprosmotr_rassylki: ljudi_predprosmotr_rassylki,
    rassylka_iz_nabora: ljudi_rassylka_iz_nabora,
                                                                        
                                                                 
                                                    
    porjadok: ljudi_porjadok,
    privedshie: ljudi_privedshie,
    proverka_dublej: ljudi_proverka_dublej,
    rassylki: ljudi_rassylki,
    srezy: ljudi_srezy,
    zagruzka: ljudi_zagruzka,
  },
  kontakty: {
    porjadok:require('./porjadok-kontaktov').obrabotat,
    duplikaty: kontakty_duplikaty,
    maski: kontakty_maski,
    otmena: kontakty_otmena,
    po_umolchaniju: kontakty_po_umolchaniju,
    razbor: kontakty_razbor,
    strany: kontakty_strany,
    vidy: kontakty_vidy,
  },
  proekty: {
    arhiv: proekty_arhiv,
    dostupnye_uslugi: proekty_dostupnye_uslugi,
    fajly: proekty_fajly,
    materialy: (ctx) => materialy_obschie({ ...ctx, tablica: 'proekty' }),
    otkrytye_zadachi: proekty_otkrytye_zadachi,
    platezhi: proekty_platezhi,
    predprosmotr_zavershenija: proekty_predprosmotr_zavershenija,
    svodka: proekty_svodka,
    vozobnovit: proekty_vozobnovit,
                                                                  
                                                                   
                                                                
    zapisat_oplatu: (ctx) => {
      const p=platezh(baza(),ctx.telo.platezh_id);if(p.proekt_id!==Number(ctx.kljuch))throw new OshibkaVvoda('Платёж относится к другому проекту','platezh_id');
      return platezhi_prishlo({ ...ctx, kljuch: p.id });
    },
    zavershit: proekty_zavershit,
  },
  platezhi: {
    otmenit_prishlo: platezhi_otmenit_prishlo,
    proverka: ctx=>require('./platezhi.js').proverka(ctx),
    predprosmotr_otmetki: platezhi_predprosmotr_otmetki,
    prishlo: platezhi_prishlo,
    shablon_zadachi: platezhi_shablon_zadachi,
  },
  uslugi: {
    vlijanie: uslugi_vlijanie,
    zamena: uslugi_zamena,
  },
  shablony: {
    dubl: shablony_dubl,
    iz_zadachi: shablony_iz_zadachi,
  },
  zadachi: {
    baza: zadachi_baza,
    fakt: zadachi_fakt,
    ...Object.fromEntries(['kontekst','kontekst_proverka','kontekst_otmena_popytki','kontekst_otmenit'].map(action=>[action,ctx=>require('./kontekst-zadachi.js').handle({...ctx,dejstvie:action})])),
    iz_shablona: zadachi_iz_shablona,
    materialy: (ctx) => materialy_obschie({ ...ctx, tablica: 'zadachi' }),
    paket: zadachi_paket,
    shablony: zadachi_shablony,
    zagotovka_podzadachi: zadachi_zagotovka_podzadachi,
    prodlit: zadachi_prodlit,
                                                                              
                                                                   
                                                            
    otmena: zadachi_prodlit_otmena,
    svodka: zadachi_svodka,
    otmetki: zadachi_otmetki,
    zakryt: zadachi_zakryt,
    dubl: zadachi_dubl,
    vernut: zadachi_vernut,
    korzina: zadachi_korzina,
    uchastniki: zadachi_uchastniki,
  },
  sotrudnichestva: {
    arhiv: sotr_arhiv,
    davno_ne_obschalis: sotr_davno_ne_obschalis,
    bez_zadach: sotr_bez_zadach,
    istorija: sotr_istorija,
    klienty: sotr_klienty,
    kasanie: sotr_kasanie,
    predlozhennye_zadachi: sotr_predlozhennye_zadachi,
    svjaz_vyplaty: ctx => ctx.metod==='GET'?require('./referral-payout-link.js').proposal(ctx):require('./referral-payout-link.js').change(ctx),
    proverka_svjazi_vyplaty: ctx => {tolko(ctx.metod,'GET');return require('./referral-tasks.js').check(ctx);},
    otmena_svjazi_vyplaty: ctx => {tolko(ctx.metod,'POST');return require('./referral-tasks.js').cancel(ctx);},
    zadachi_referala: ctx => ctx.metod==='GET'?require('./referral-tasks.js').proposal(ctx):require('./referral-tasks.js').create(ctx),
    proverka_zadach: ctx => {tolko(ctx.metod,'GET');return require('./referral-tasks.js').check(ctx);},
    otmena_zadach: ctx => {tolko(ctx.metod,'POST');return require('./referral-tasks.js').cancel(ctx);},
    privedeno: sotr_privedeno,
    vyplata: sotr_vyplata,
    uslovija: ctx => require('./uslovija-referala.js').handle(ctx),
    proverka_uslovij: ctx => require('./uslovija-referala.js').read(ctx),
    otmena_uslovij: ctx => require('./uslovija-referala.js').cancel(ctx),
    proverka_vyplaty: ctx => require('./vyplata-referalu.js').check(ctx),
    otmena_vyplaty: ctx => require('./vyplata-referalu.js').cancel(ctx),
  },
  napravlenija: {
    materialy: (ctx) => materialy_obschie({ ...ctx, tablica: 'napravlenija' }),
    uslugi: napr_uslugi,
    voronka: napr_voronka,
  },
                                                                 
                                                          
                                                       
  spravochniki: new Proxy({}, {
    get: (_, vetka) => (ctx) =>
      require('./ekrany.js').spravochniki({ ...ctx, kljuch: String(vetka) }),
    has: () => true,
  }),
  sprinty: { tekuschij: sprinty_tekuschij },
  uvedomlenija: { prochitat_vse: uved_prochitat_vse,
                  po_srokam: uved_po_srokam },
};

                                                           
const OTDELNYE = { arhiv: arhiv_pereklyuchit, sostojanie, zhurnal };

module.exports = { PODRUCHKI_KODA, OTDELNYE, OTKRYTA, NE_UDALENA,
                   zhurnal_stroki, obnovit_poslednjuju_zadachu };
