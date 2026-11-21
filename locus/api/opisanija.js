                                                                        
                                                                  

                                             
const { baza, seichas, segodnja, nomer_nedeli, OshibkaVvoda, Konflikt, v_api } = require('../db/db.js');
const { tolko_admin } = require('./dostup.js');

                                                                  
                                                                            

function proverit_nazvanie_zadachi(d) {
  if (typeof d.nazvanie === 'string' && !d.nazvanie.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu, '')) throw new OshibkaVvoda('nazvanie обязательно', 'nazvanie');
}

function proverit_daty_zadachi(d) {
  for (const field of ['srok','data']) if (Object.hasOwn(d,field)) {
    if (d[field] === '') d[field] = null;
    if (d[field] !== null && d[field] !== undefined) require('./kalendar.js').data(d[field],field);
  }
}

function normalizovat_sprint(d, bylo = {}) {
  const calendar = require('./kalendar.js');
  const week = calendar.razobrat_nedelju(d.sprint ?? bylo.sprint,
    d.god_sprinta ?? bylo.god_sprinta ?? calendar.iso_nedelja(segodnja()).god);
  if (d.god_sprinta !== undefined && Number(d.god_sprinta) !== week.god) {
    throw new OshibkaVvoda('год и спринт указывают на разные годы', 'god_sprinta');
  }
  d.sprint = week.nomer; d.god_sprinta = week.god;
  return week;
}

function proverit_den_sprinta(d, bylo = {}) {
  const next = {...bylo,...d};
  if(next.povtorjaetsja===1 || next.data==null || next.sprint==null)return;
  const cal=require('./kalendar.js'),week=cal.razobrat_nedelju(next.sprint,next.god_sprinta);
  if(next.data<week.nachalo||next.data>week.konec)throw new OshibkaVvoda('Плановая дата должна быть внутри спринта. Измени спринт и дату вместе в параметрах задачи','data');
}

function normalizovat_nedelju(d, bylo = {}) {
  const calendar = require('./kalendar.js');
  const current = calendar.iso_nedelja(segodnja());
  const week = calendar.razobrat_nedelju(d.nedelja ?? bylo.nedelja ?? current.nomer,
    d.god ?? bylo.god ?? current.god);
  if (d.god !== undefined && Number(d.god) !== week.god) {
    throw new OshibkaVvoda('год и неделя указывают на разные годы', 'god');
  }
  d.nedelja = week.nomer; d.god = week.god;
}

function svoj_grafik(d, avtor) {
  require('./prava-grafika.js').proverit(d.chelovek_id,avtor);
}

function normalizovat_grafik(d, bylo = {}) {
  normalizovat_nedelju(d, bylo);
  const den = Number(d.den ?? bylo.den);
  if (!Number.isInteger(den) || den < 1 || den > 7) throw new OshibkaVvoda('den: от 1 до 7', 'den');
  if(typeof d.zametka==='string'&&d.zametka.length>500)throw new OshibkaVvoda('в заметке может быть до 500 символов','zametka');
  if(typeof d.zametka==='string'&&!d.zametka.trim())d.zametka=null;
  const timeChanged=['s_kakogo','do_kakogo','chasov','ne_rabotaju'].some(key=>Object.hasOwn(d,key));
  const explicitlyOff=d.ne_rabotaju===true||d.ne_rabotaju===1;
  if (timeChanged&&!explicitlyOff&&/^\d{1,2}:\d{2}$/.test(String(d.s_kakogo ?? bylo.s_kakogo ?? ''))) {
    const time=x=>{const match=String(x||'').match(/^(\d{1,2}):(00|30)$/);return match?Number(match[1])+Number(match[2])/60:NaN;};
    const start=time(d.s_kakogo??bylo.s_kakogo),end=time(d.do_kakogo??bylo.do_kakogo);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<8||end>22||end<=start){
      throw new OshibkaVvoda('укажи интервал с 8:00 до 22:00, конец позже начала','s_kakogo');
    }
    if(Object.hasOwn(d,'chasov')&&(d.chasov===null||d.chasov===''||typeof d.chasov==='boolean'||!Number.isFinite(Number(d.chasov))||Number(d.chasov)!==end-start)){
      throw new OshibkaVvoda('число часов должно совпадать с указанным интервалом','chasov');
    }
    d.s_kakogo=Array.from({length:(end-start)*2},(_,i)=>start+i/2).join(',');
  }
  if (d.s_kakogo !== undefined) {
    const cells = String(d.s_kakogo || '').split(',').filter(x=>x.trim()).map(Number);
    if (cells.some(x=>!Number.isFinite(x) || x<8 || x>21.5 || !Number.isInteger(x*2))) {
      throw new OshibkaVvoda('часы: получасовые клетки с 8:00 до 21:30', 's_kakogo');
    }
    d.s_kakogo = [...new Set(cells)].sort((a,b)=>a-b).join(',');
    d.chasov = new Set(cells).size/2;
  }
  if (d.chasov === null || d.chasov === '' || (d.chasov === undefined && !Object.keys(bylo).length && !d.ne_rabotaju)) {
    throw new OshibkaVvoda('укажи число часов или отметь клетки графика','chasov');
  }
  const hours=Number(d.chasov ?? bylo.chasov ?? 0);
  if (!Number.isFinite(hours) || hours<0 || hours>24) throw new OshibkaVvoda('часов: от 0 до 24', 'chasov');
  if (d.ne_rabotaju === true || d.ne_rabotaju === 1) {
    d.chasov=0; d.s_kakogo=''; d.do_kakogo='';
  }
}

function odin_den_grafika(db,d,bylo={}) {
  const row=db.prepare('SELECT id FROM grafik WHERE chelovek_id=? AND god=? AND nedelja=? AND den=?')
    .get(d.chelovek_id,d.god,d.nedelja,d.den);
  if(row&&Number(row.id)!==Number(bylo.id))throw new Konflikt('на этот день график уже есть',{id:row.id});
}

function otvetstvennyj_chislom(v, db) {
  const n = typeof v === 'number' ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n < 1 || !db.prepare('SELECT 1 FROM ljudi WHERE id=?').get(n)) {
    throw new OshibkaVvoda('выбери существующего человека ответственным', 'otvetstvennyj');
  }
  return n;
}

                                                                      
                                                                 
                                                            
                                          
  
                                                                 
                                                              
                                                                 
                                        
function proverit_fajl(d) { require('./materialy-validacija.js').validate(d); }

                                                                  
                                                                     
                                     
  
                                                                  
                                                                  
                                                                  
                                     
  
                                                                        
                                                                      
                                   
const POTOKI = { pro_menja: 'pro_menja', sobytija: 'sobytija' };
                                                                  
                                                      
const CHTO_ETO = ['chelovek', 'kompanija', 'kanal', 'shkola'];

function imja_cheloveka(db, id) {
  if (!id) return null;
  const c = db.prepare('SELECT imja FROM ljudi WHERE id = ?').get(id);
  return c ? c.imja : null;
}

                                                                 
                                                             
                                                                     
                                                 
  
                                                                     
                                                                    
function glagol_po_polu(db, id, muzhskoj, zhenskij) {
  if (!id) return muzhskoj;
  const c = db.prepare('SELECT pol FROM ljudi WHERE id = ?').get(id);
  return c && c.pol === 'zh' ? zhenskij : muzhskoj;
}

                                              
const {uvedomit}=require('./sobytija-uvedomlenij.js');

                                                                 
                                                             
                                                              
function kto_dobavil_slovami(db, avtor, chto) {
  const imja = imja_cheloveka(db, avtor);
  if (!imja) return `Команда добавила ${chto}`;
  return `${imja} ${glagol_po_polu(db, avtor, 'добавил', 'добавила')} ${chto}`;
}

                                                                       
function uchastniki_zadachi(db, zadacha_id) {
  try {
    return db.prepare(
      'SELECT chelovek_id FROM zadacha_uchastniki WHERE zadacha_id = ?')
      .all(zadacha_id).map((r) => r.chelovek_id);
  } catch { return []; }
}

                                                            
function proverit_glubinu(d, db) {
  if (d.roditel_id === undefined || d.roditel_id === null) return;
  const r = db.prepare('SELECT id, nomer, roditel_id, udaleno FROM zadachi WHERE id = ?')
    .get(d.roditel_id);
  if (!r || r.udaleno) throw new OshibkaVvoda('roditel_id: задача не найдена', 'roditel_id');
  if (r.roditel_id !== null && r.roditel_id !== undefined) throw new OshibkaVvoda('глубина подзадач два уровня', 'roditel_id');
}

                                                                        
                                                                     
                                                                     
function napravlenija(db) {
  return db.prepare('SELECT kod FROM napravlenija ORDER BY porjadok, kod')
    .all().map((r) => r.kod);
}

                                                              
const NAPRAVLENIJA = ['synapt', 'automy', 'automy_junior', 'media',
                      'nastavnichestvo', 'platforma', 'anton', 'assist'];

                                                                       
                                                                       
                                                                  
  
                                                                     
                               
function zapert_li_period(db, rezultat_id) {
  if (rezultat_id === undefined || rezultat_id === null) return;
  const cel = db.prepare(
    'SELECT c.period_id FROM celi c JOIN rezultaty r ON r.cel_id = c.id WHERE r.id = ?')
    .get(rezultat_id);
  if (!cel || !cel.period_id) return;
  const p = db.prepare('SELECT zakryt FROM periody WHERE id = ?').get(String(cel.period_id));
  if (!p || !p.zakryt) return;
  const e = new Error(`период ${cel.period_id} закрыт, замеры только на чтение`);
  e.kod = 409;
  throw e;
}

function period_celi_otkryt(db, cel) {
  if (!cel.period_id) return;
  const { razobrat_period, granicy_perioda } = require('./ekrany.js');
  const id = razobrat_period(cel.period_id);
  const granicy = granicy_perioda(id);
  const tip = /^\d{4}$/.test(id) ? 'god' : id.includes('-Q') ? 'kvartal' : 'mesjac';
                                                                    
                                                                          
  db.prepare(`INSERT OR IGNORE INTO periody (id,tip,nachalo,konec,zakryt)
              VALUES (?,?,?,?,0)`).run(id, tip, granicy.nachalo, granicy.konec);
  if (db.prepare('SELECT zakryt FROM periody WHERE id=?').get(id).zakryt) {
    throw Object.assign(new Error(`период ${id} закрыт, цели и результаты только на чтение`), { kod: 409 });
  }
  cel.period_id = id;
}

function period_rezultata_otkryt(db, cel_id) {
  const cel = db.prepare('SELECT id,period_id FROM celi WHERE id=?').get(cel_id);
  if (!cel) throw new OshibkaVvoda('цели нет', 'cel_id');
  period_celi_otkryt(db, cel);
}

function otcepit_zadachi_okr(db, bylo, avtor, eto_cel) {
  const rezultaty = eto_cel ? new Set(db.prepare('SELECT id FROM rezultaty WHERE cel_id=?')
    .all(bylo.id).map(r => r.id)) : new Set([bylo.id]);
  const uslovie = eto_cel
    ? 'cel_id=? OR rezultat_id IN (SELECT id FROM rezultaty WHERE cel_id=?)'
    : 'rezultat_id=?';
  const zadachi = db.prepare(`SELECT nomer,cel_id,rezultat_id,versija FROM zadachi WHERE ${uslovie}`)
    .all(...(eto_cel ? [bylo.id, bylo.id] : [bylo.id]));
  const { pravit } = require('./obschij.js');
  for (const zadacha of zadachi) {
    const patch = { versija: zadacha.versija };
    if (eto_cel && zadacha.cel_id === bylo.id) patch.cel_id = null;
    if (rezultaty.has(zadacha.rezultat_id)) patch.rezultat_id = null;
    pravit('zadachi', OPISANIJA.zadachi, zadacha.nomer, patch, avtor);
  }
}

const STATUSY_ZADACHI = ['v_plane', 'v_processe', 'na_soglasovanii',
                         'sdelano', 'kogda_nibud'];

                                                                  
                                                                 
const TIPY_ZADACHI = ['klientskaja', 'produktovaja', 'biznesovaja',
                      'vnutrennjaja', 'kasanie'];

const ROLI = ['lid', 'klient', 'referal'];

const STADII = [
  'ne_pisali', 'napisali', 'na_soglasovanii', 'zhdem_oplatu', 'ne_sejchas',
  'v_rabote', 'zhdem_obratnuju_svjaz', 'zaplanirovan_zum', 'pauza',
  'prismatrivaemsja', 'dogovarivaemsja', 'rabotaem', 'k_vyplate',
];

const VIDY_KONTAKTA = require('./vidy-kontaktov.js').VIDY;

                                                                        
                                                                           
const PLOSHADKI = ['telegram', 'instagram', 'vk', 'youtube', 'dzen', 'tiktok'];

                                                                     
                                                                  
const UROVNI_SBORA = ['public', 'mtproto', 'graph'];

                                                                      
                                                                         
                                                                           
                                               
const METRIKI_AKKAUNTA = ['podpischikov', 'prirost_podpischikov', 'publikacij',
                          'prosmotrov', 'prosmotrov_srednee', 'vovlechennost',
                          'ohvat', 'ohvat_k_podpischikam'];

                                                                      
                                                                     
                                                   
const FORMATY_PUBLIKACII = ['post', 'rils', 'karusel', 'storis', 'video'];

                                                                       
                                                                  
                                                                     
const TIPY_LENTY = ['zapis', 'refleksija', 'princip', 'novoe'];

                                                                       
function norma(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
    .replace(/\s+/g, ' ');
}

                                                           
                         
const {norma_kontakta}=require('./normalizacija-kontakta.js');

                                                                
                                                                       
function svobodnyj_nomer(db) {
  for (let i = 0; i < 200; i += 1) {
    const n = 1000 + Math.floor(Math.random() * 9000);
    const est = db.prepare('SELECT 1 FROM zadachi WHERE nomer = ?').get(n);
    if (!est) return n;
  }
                                                           
  const max = db.prepare('SELECT max(nomer) m FROM zadachi').get().m || 9999;
  return max + 1;
}

                                                                 
                                                                  
                                                           
const KODY_SHABLONOV = ['next_touch', 'otpravit_kp', 'provesti_zum',
                        'poluchit_oplatu', 'sobrat_bazu', 'otpravit_rassylku',
                        'podgotovit_akt', 'vyplatit_procent'];

                                                                 
                                                                     
                                                                         
                                                                   
                                                       
                                                                   
                                                             
function odin_sposob_uslugi(novoe, bylo) {
  const zanjato = ['usluga_id', 'usluga_tekst', 'usluga_svoja'].filter((p) => {
    const v = novoe[p] !== undefined ? novoe[p] : bylo[p];
    return v !== undefined && v !== null && v !== '';
  });
  if (zanjato.length > 1) {
    const e = new Error('услуга задаётся одним способом из трёх');
    e.kod = 400;
    e.pole = zanjato[1];
    throw e;
  }
}



                                                                   
                                                            
function konec_nedeli_ot(sdvig_nedel = 0) {
  const d = new Date();
  const dn = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + (6 - dn) + sdvig_nedel * 7);
  return d.toISOString().slice(0, 10);
}

                                                                    
                                                                 
                                                                    
                                                               
function plashka_kasanija(db, chelovek_id, srok, avtor, prichina) {
  if (!chelovek_id) return null;
  const chel = db.prepare(
    'SELECT id, imja, arhiv FROM ljudi WHERE id = ?').get(chelovek_id);
  if (!chel || chel.arhiv) return null;
  const otkryta = db.prepare(
    `SELECT 1 FROM zadachi
      WHERE klient_id = ? AND status <> 'sdelano'
        AND (udaleno IS NULL OR udaleno = 0) LIMIT 1`).get(chelovek_id);
  if (otkryta) return null;
  try {
    const tiho = db.prepare(
      `SELECT 1 FROM skrytye_plashki
        WHERE chelovek_id = ? AND o_kom_id = ? AND skryto_do > ?`)
      .get(Number(avtor) || 0, chelovek_id, seichas());
    if (tiho) return null;
  } catch {                             }
  return {
    chelovek_id,
    nazvanie: `Следующее касание по ${chel.imja}`,
    srok,
    prichina,
  };
}


                                                              
                                                                    
function mezhdunarodnyj_telefon(syroj,options={}) {
  const result=require('./telefony').razobrat(syroj,{...options,strict:options.strana!=null&&options.bez_maski!==true});
  if(result.strana&&!result.nacionalnyj){const error=new OshibkaVvoda('Укажи номер после кода страны','znachenie');error.kod=422;error.dannye={kod:'invalid_phone'};throw error;}
  return result.e164;
}

function proverit_znachenie_kontakta(tip,value){
  try{return require('../public/js/validacija-kontakta.js').proverit(tip,value);}
  catch(cause){if(!cause.code)throw cause;const error=new OshibkaVvoda(cause.message,'znachenie');error.kod=cause.status||422;error.dannye={kod:cause.code};throw error;}
}

                                                                
function podgotovit_znachenie_kontakta(tip, value, options={}) {
  const text=String(value??'').trim();
  require('./vidy-kontaktov.js').proverit(tip);
  if(tip!=='telefon'&&Object.keys(options).length)throw new OshibkaVvoda('Страна и маска относятся только к телефону','tip');
  proverit_znachenie_kontakta(tip,text);
  const znachenie=tip==='telefon'?mezhdunarodnyj_telefon(text,options):text;
  const znachenie_norm=norma_kontakta(znachenie,tip);
  if(!znachenie_norm)throw new OshibkaVvoda('Нужно значение контакта','znachenie');
  return {znachenie,znachenie_norm};
}

                                                                  
                                                                     
                                                      
function avtoproekt_klienta(s, db, avtor) {
  const est = db.prepare(
    `SELECT id FROM proekty
      WHERE klient_id = ? AND napravlenie = ? AND (arhiv IS NULL OR arhiv = 0)`
  ).get(s.chelovek_id, s.napravlenie);
  if (est) return;
  const chel = db.prepare('SELECT imja FROM ljudi WHERE id = ?').get(s.chelovek_id);
  const napr = db.prepare('SELECT nazvanie FROM napravlenija WHERE kod = ?').get(s.napravlenie);
  if (!chel) return;
  const r = db.prepare(
    `INSERT INTO proekty (nazvanie, klient_id, napravlenie, status, arhiv, sozdano, versija)
     VALUES (?, ?, ?, 'idet', 0, ?, 1)`)
    .run(`${chel.imja}, ${napr ? napr.nazvanie : s.napravlenie}`,
         s.chelovek_id, s.napravlenie, seichas());
  const { v_zhurnal } = require('./obschij.js');
  v_zhurnal(db, 'proekty', r.lastInsertRowid, 'sozdano', null, 'да, сам при переходе в клиенты', avtor);
  return { avtoproekt: Number(r.lastInsertRowid) };
}

const OPISANIJA = {
                                                              
                                                    
  grafik: {
    dopolnit:(db,row)=>require('./grafik-identity.js').row(db,row),
    objazatelno: ['chelovek_id', 'den'],
    spravochniki: {},
    v_zhurnal: ['chasov','den','nedelja','god','chelovek_id','s_kakogo','do_kakogo','ne_rabotaju','zametka'],
    pered_zapisju: (d, db, avtor) => {
      svoj_grafik(d, avtor);
      normalizovat_grafik(d);
      odin_den_grafika(db,d);
    },
    pered_pravkoj: (d, bylo, db, avtor) => {
      svoj_grafik(bylo, avtor);
      svoj_grafik({ ...bylo, ...d }, avtor);
      normalizovat_grafik(d, bylo);
      odin_den_grafika(db,{...bylo,...d},bylo);
    },
    pered_udaleniem: (bylo, db, avtor) => svoj_grafik(bylo, avtor),
  },

                                                   
  rassylki: {
    svjazannye_polja: ['plan_chislo','vybor_bazy','vybor_versija'],
    razlozhit_svjazannye: (row,related,db,actor)=>require('./kampanii.js').createGraph(row,related,db,actor),
    dopolnit: (db,row)=>require('./kampanii.js').presentation(db,row),
    objazatelno: ['nazvanie'],
    spravochniki: {
      napravlenie: napravlenija,
      ploshadka: ['pochta', 'telegram', 'instagram'],
      status: ['gotovitsja', 'idet', 'pauza', 'zavershena'],
                                                                   
      tip: ['klientskaja', 'referalnaja'],
    },
    v_zhurnal: ['status', 'nachalo', 'konec', 'kto_vedet', 'tip','baza_id'],
    pered_zapisju: (d,db,actor,related) => require('./kampanii.js').prepareCreation(d,db,actor,related),
    pered_pravkoj: (d,bylo,db) => {
      require('./kampanii.js').validateCampaignChange(d,bylo,db);
      if(d.napravlenie!==undefined&&d.napravlenie!==bylo.napravlenie&&db.prepare(
        'SELECT 1 FROM sotrudnichestva WHERE rassylka_id=? AND napravlenie IS NOT ? LIMIT 1'
      ).get(bylo.id,d.napravlenie))throw new OshibkaVvoda('рассылка указана источником прихода в другом направлении','napravlenie');
    },
    pered_udaleniem: (row,db) => {
      if(db.prepare('SELECT 1 FROM sotrudnichestva WHERE rassylka_id=? LIMIT 1').get(row.id)){
        const error=new OshibkaVvoda('рассылка указана источником прихода; сначала измени источник в сотрудничестве');
        error.kod=409;throw error;
      }
    },
                                                                    
                                                                  
                                                    
    chisla_spiska: (spisok, db) => {
      if (!spisok.length) return spisok;
      const mesta = spisok.map(() => '?').join(', ');
      const po_id = new Map(db.prepare(
        `SELECT rassylka_id, count(*) n FROM rassylka_ljudi
          WHERE rassylka_id IN (${mesta}) GROUP BY rassylka_id`)
        .all(...spisok.map((r) => r.id))
        .map((r) => [r.rassylka_id, r.n]));
      return spisok.map((r) => ({ ...require('./kampanii.js').presentation(db,r), ljudej: require('./kampanii.js').sourceRows(db,r).length }));
    },
  },

                                                              
  rassylka_ljudi: {
    objazatelno: ['rassylka_id', 'chelovek_id'],
    spravochniki: { status: ['ne_otpravleno', 'otpravleno', 'otvetil', 'otkaz'] },
    v_zhurnal: ['status'],
    pered_zapisju: (d, db) => {
      require('./kontaktnye-lica.js').proverit_dlja_rassylki(db,d.chelovek_id);
      if (d.status === undefined) d.status = 'ne_otpravleno';
                                                                 
                              
      const est = db.prepare(
        'SELECT id FROM rassylka_ljudi WHERE rassylka_id = ? AND chelovek_id = ?'
      ).get(d.rassylka_id, d.chelovek_id);
      if (est) {
        const e = new Error('этот человек уже в рассылке');
        e.kod = 409; e.dannye = { id: est.id };
        throw e;
      }
    },
    pered_pravkoj: (d,bylo,db) => require('./kontaktnye-lica.js').proverit_dlja_rassylki(db,d.chelovek_id??bylo.chelovek_id),
  },

  ljudi: {
    objazatelno: ['imja'],
    svjazannye_polja: ['kontakty','sotrudnichestvo','kontakt_dlja'],
    razlozhit_svjazannye: (person,related,db,author) => require('./chelovek-celikom.js').razlozhit(person,related,db,author),
    spravochniki: { rol_v_baze: ['sobstvennyj', 'kontaktnoe_lico'],
                    dostup: ['polnyj', 'bez_deneg'],
                    chto_eto: CHTO_ETO },
    v_zhurnal: ['imja', 'arhiv', 'rol_v_baze', 'dostup', 'aktiven', 'chto_eto'],
                                                               
                                                           
    dopolnit: (db, chel) => {
      const vzjat = (sql, ...z) => {
        try { return db.prepare(sql).get(...z); } catch { return null; }
      };
                                                               
                                                             
                                                                    
      const telefon = vzjat(
        `SELECT id,tip,znachenie,znachenie_norm,osnovnoj FROM kontakty
          WHERE chelovek_id = ? AND tip = 'telefon'
          ORDER BY osnovnoj DESC, porjadok, id LIMIT 1`, chel.id);
      const telegram = vzjat(
        `SELECT id,tip,znachenie,znachenie_norm,osnovnoj FROM kontakty
          WHERE chelovek_id = ? AND tip = 'telegram'
          ORDER BY osnovnoj DESC, porjadok, id LIMIT 1`, chel.id);
      const email = vzjat(
        `SELECT id,tip,znachenie,znachenie_norm,osnovnoj FROM kontakty WHERE chelovek_id=? AND tip='pochta'
         ORDER BY osnovnoj DESC,porjadok,id LIMIT 1`,chel.id);
                                                                
                                             
      const istochnik = vzjat(
        `SELECT istochnik FROM sotrudnichestva
          WHERE chelovek_id = ? AND istochnik IS NOT NULL
          ORDER BY id LIMIT 1`, chel.id);
      const dop_kontakty = {
        primary_phone: telefon ? telefon.znachenie : null,
        primary_phone_pokaz:telefon?require('./telefony').pokaz(telefon.znachenie):null,
        primary_email: email ? email.znachenie : null,
        primary_telegram:telegram?.znachenie??null,
        primary_phone_istochnik:telefon?(telefon.osnovnoj?'explicit':'pervyj_po_porjadku'):null,
        primary_email_istochnik:email?(email.osnovnoj?'explicit':'pervyj_po_porjadku'):null,
        primary_telegram_istochnik:telegram?(telegram.osnovnoj?'explicit':'pervyj_po_porjadku'):null,
        kontakty_dlja_spiska:[telegram,telefon,email].filter(Boolean).map(row=>({id:row.id,tip:row.tip,
          ...require('./vidy-kontaktov.js').dto(row),znachenie:row.znachenie,
          istochnik:row.osnovnoj?'explicit':'pervyj_po_porjadku',ssylka:require('./vidy-kontaktov.js').ssylka(row)})),
        est_telegram: !!telegram,
        istochnik: istochnik ? istochnik.istochnik : null,
      };
      const kasanie = vzjat(
        `SELECT id, nomer, nazvanie, srok FROM zadachi
          WHERE klient_id = ? AND shablon = 'sledujuschee_kasanie'
            AND status <> 'sdelano' AND (udaleno IS NULL OR udaleno = 0)
          ORDER BY srok IS NULL, srok LIMIT 1`, chel.id);
                                                                      
                                                               
                            
      const priv = vzjat(
        `SELECT count(DISTINCT chelovek_id) k FROM sotrudnichestva
          WHERE rekomendoval_id = ?`, chel.id);
                                                                
                                                                   
      const obschenie=require('./obschenie.js').najti(db,chel.id);
      return {
        ...dop_kontakty,
        privedeno: priv ? priv.k : 0,
        ...obschenie,
        sledujushee_kasanie: kasanie ? kasanie.id : null,
                                                            
        plashka_zadacha: kasanie
          ? { nomer: kasanie.nomer, nazvanie: kasanie.nazvanie, srok: kasanie.srok }
          : null,
      };
    },
    pered_zapisju: (d, db, avtor, related = {}) => {
      require('./chelovek-celikom.js').podgotovit(d,related,db);
      d.imja_norm = norma(d.imja);
      if (d.dostup !== undefined) tolko_admin(db, avtor);
      if (d.rol_v_baze === undefined) d.rol_v_baze = 'sobstvennyj';
                                                          
      if (d.chto_eto === undefined || d.chto_eto === null || d.chto_eto === '') {
        d.chto_eto = 'chelovek';
      }
      if (d.arhiv === undefined) d.arhiv = 0;
      if (d.aktiven === undefined) d.aktiven = 1;
    },
    pered_pravkoj: (d, bylo, db, avtor, body) => {
      if (d.dostup !== undefined && d.dostup !== bylo.dostup) tolko_admin(db, avtor);
      require('./chelovek-celikom.js').pered_pravkoj(d,bylo,db,body);
      if(d.rol_v_baze==='kontaktnoe_lico'&&bylo.rol_v_baze!=='kontaktnoe_lico')require('./kontaktnye-lica.js').proverit_perevod_v_kontaktnoe(db,bylo.id);
      if (d.imja !== undefined) d.imja_norm = norma(d.imja);
    },
    posle_pravki: (stalo,bylo,db,author,body) => require('./chelovek-celikom.js').posle_pravki(stalo,bylo,db,author,body),
  },

  kontakty: {
    svjazannye_polja:['force','osnovnoj_kontekst','strana','bez_maski'],
    objazatelno: ['chelovek_id', 'tip', 'znachenie'],
    spravochniki: { tip: VIDY_KONTAKTA },
    v_zhurnal: ['osnovnoj','porjadok'],
    dopolnit:(db,row)=>require('./osnovnoj-kontakt.js').dopolnit(db,row),
    dopolnit_spisok:(db,rows)=>require('./osnovnoj-kontakt.js').spisok(db,rows),
    posle_zapisi:(row,db)=>({osnovnaja_gruppa:require('./osnovnoj-kontakt.js').sostojanie(db,row.chelovek_id,row.tip)}),
    posle_pravki:(row,before,db,author,body,context)=>require('./osnovnoj-kontakt.js').poslePravki(db,row,before,context,body,author),
                                                                  
                                                               
                                                                      
    udalenie: 'nasovsem',
    posle_udalenija: (bylo, db, avtor) => {
      if (!bylo.osnovnoj) return;
      const pervyj = db.prepare(
        `SELECT id FROM kontakty WHERE chelovek_id = ? AND tip = ?
          ORDER BY porjadok, id LIMIT 1`).get(bylo.chelovek_id, bylo.tip);
      if (pervyj) {
        db.prepare('UPDATE kontakty SET osnovnoj = 1 WHERE id = ?').run(pervyj.id);
        require('./obschij.js').v_zhurnal(db,'kontakty',pervyj.id,'osnovnoj','0','1',avtor);
      }
    },
    pered_zapisju: (d, db, avtor, related={}) => {
      Object.assign(d,podgotovit_znachenie_kontakta(d.tip,d.znachenie,require('./telefony').parametry(related)));
      require('./dubli-kontaktov.js').proverit(db,d,related.force);
                                                             
                                                                  
                      
      if (d.osnovnoj === undefined) {
        const uzhe = db.prepare(
          'SELECT count(*) k FROM kontakty WHERE chelovek_id = ? AND tip = ?'
        ).get(d.chelovek_id, d.tip).k;
        d.osnovnoj = uzhe ? 0 : 1;
      }
      if (d.porjadok === undefined) {
        const m = db.prepare(
          'SELECT max(porjadok) m FROM kontakty WHERE chelovek_id = ?'
        ).get(d.chelovek_id).m;
        d.porjadok = (m || 0) + 1;
      }
      if (d.osnovnoj === undefined) d.osnovnoj = 0;
      require('./osnovnoj-kontakt.js').peredVstavkoj(db,d,related,avtor);
    },
    pered_pravkoj: (d, bylo, db, avtor, body={}) => {
      if(body.force!==undefined&&typeof body.force!=='boolean')throw new OshibkaVvoda('force: да или нет','force');
      if((body.strana!==undefined||body.bez_maski!==undefined)&&d.znachenie===undefined)throw new OshibkaVvoda('Передай значение телефона вместе со страной или режимом маски','znachenie');
      if (d.znachenie !== undefined || d.tip !== undefined || d.chelovek_id !== undefined) {
        if(d.znachenie===undefined)d.znachenie=bylo.znachenie;
        Object.assign(d,podgotovit_znachenie_kontakta(d.tip||bylo.tip,d.znachenie,require('./telefony').parametry(body)));
        require('./dubli-kontaktov.js').proverit(db,{...bylo,...d},body.force,bylo.id);
      }
      return require('./osnovnoj-kontakt.js').peredPravkoj(db,bylo,d,body,avtor);
    },
  },

  sotrudnichestva: {
    objazatelno: ['chelovek_id', 'napravlenie', 'rol'],
    dopolnit: (db,s) => ({
      kontakt_imja:s.kontakt_id?db.prepare('SELECT imja FROM ljudi WHERE id=?').get(s.kontakt_id)?.imja||null:null,
      rekomendoval_imja:s.rekomendoval_id?db.prepare('SELECT imja FROM ljudi WHERE id=?').get(s.rekomendoval_id)?.imja||null:null,
      rassylka_nazvanie:s.rassylka_id?db.prepare('SELECT nazvanie FROM rassylki WHERE id=?').get(s.rassylka_id)?.nazvanie||null:null,
    }),
    spravochniki: { napravlenie: napravlenija, rol: ROLI, stadija: STADII,
                    nalog: ['do_vycheta', 'posle_vycheta'],
                    istochnik: require('./istochnik-prihoda.js').VIDY },
    v_zhurnal: ['rol', 'stadija', 'arhiv', 'procent', 'procent_shkala', 'nalog', 'dogovor_nomer', 'dogovor_id', 'vyplacheno', 'kontakt_id',
                'privodit_klientov','istochnik','istochnik_tekst','rekomendoval_id','rassylka_id','poslednee_obshenie','chelovek_id','napravlenie'],
    pered_zapisju: (d, db) => {
      require('./referral-terms-input.js').validate(db,d);
      require('./obschenie.js').podgotovitPolja(d);
      require('./kontaktnye-lica.js').proverit_svoe_sotrudnichestvo(db,d.chelovek_id);
      require('./istochnik-prihoda.js').proverit(d);
                                                            
      const est = db.prepare(
        `SELECT id FROM sotrudnichestva
         WHERE chelovek_id = ? AND napravlenie = ? AND rol = ?`
      ).get(d.chelovek_id, d.napravlenie, d.rol);
      if (est) {
        const e = new Error('такое сотрудничество уже есть');
        e.kod = 409;
        e.dannye = { oshibka: 'sotrudnichestvo_est', id: est.id,
                     napravlenie: d.napravlenie, rol: d.rol };
        throw e;
      }
      if (d.stadija === undefined && d.rol === 'lid') d.stadija = 'ne_pisali';
      if (d.arhiv === undefined) d.arhiv = 0;
                                                     
      if (d.privodit_klientov === 1 && d.rol !== 'klient') {
        const e = new Error('privodit_klientov только при rol = klient');
        e.kod = 422;
        throw e;
      }
    },
    pered_pravkoj: (d,bylo,db,avtor,telo) => {
      require('./referral-terms-input.js').validate(db,d,bylo);
      if(Object.hasOwn(d,'poslednee_obshenie'))require('./versii.js').proverit(db,'sotrudnichestva',bylo,telo.versija,['chelovek_id']);
      require('./obschenie.js').podgotovitPolja(d);
      require('./istochnik-prihoda.js').proverit(d,bylo);
      if(d.chelovek_id!==undefined||d.rol!==undefined||d.napravlenie!==undefined)require('./kontaktnye-lica.js').proverit_svoe_sotrudnichestvo(db,d.chelovek_id??bylo.chelovek_id);
      require('./kontekst-sotrudnichestva.js').proveritIzmenenie(db,bylo,d);
    },
                                                                     
                                                                  
                                                                 
                                                       
    posle_zapisi: (s, db, avtor, zhurnal) => {
      zhurnal(db,'sotrudnichestva',s.id,'rol',null,s.rol,avtor);
      if(s.poslednee_obshenie)zhurnal(db,'sotrudnichestva',s.id,'poslednee_obshenie',null,s.poslednee_obshenie,avtor);
      if (s.rol === 'klient') return avtoproekt_klienta(s, db, avtor);
    },
    posle_pravki: (stalo, bylo, db, avtor) => {
      const dop = {};
      if (stalo.rol === 'klient' && (bylo.rol !== 'klient'||bylo.chelovek_id!==stalo.chelovek_id||bylo.napravlenie!==stalo.napravlenie)) {
        Object.assign(dop, avtoproekt_klienta(stalo, db, avtor) || {});
      }
                                                                     
                                                                  
                                                                    
      if (!stalo.arhiv) {
        let srok = null, prichina = null;
        if (stalo.rol === 'klient' && bylo.rol === 'lid') {
          srok = konec_nedeli_ot(0); prichina = 'лид стал клиентом';
        } else if (String(stalo.stadija || '') !== String(bylo.stadija || '')
                   && stalo.stadija) {
          srok = stalo.stadija === 'ne_sejchas'
            ? (() => { const d = new Date();
                       d.setMonth(d.getMonth() + 1);
                       return d.toISOString().slice(0, 10); })()
            : konec_nedeli_ot(1);
          prichina = 'сменилась стадия';
        }
        if (srok) {
          const pl = plashka_kasanija(db, stalo.chelovek_id, srok, avtor, prichina);
          if (pl) dop.plashka_kasanie = pl;
        }
      }
      return Object.keys(dop).length ? dop : undefined;
    },
  },

  zadachi: {
    versija_pri_udalenii: true,
    kljuch: 'nomer',
                                                            
    dejstvija_spiska: (filtry) => {
      const d = [];
      if (filtry.prosrochennye || filtry.prosrocheno) d.push('prodlit_na_sprint');
      if (filtry.sprint) d.push('perenesti_sprint');
      return d;
    },
                                                                      
                                                                      
                                                              
                                                            
    dopolnit: (db, z, context = {}) => {
      const vzjat_vse = (sql, ...a) => {
        try { return db.prepare(sql).all(...a); } catch { return []; }
      };
                                                                  
                                                                
                                                                
      const podzadachi = vzjat_vse(
        `SELECT id,versija,nomer, jakor, nazvanie, status FROM zadachi
          WHERE roditel_id = ? AND (udaleno IS NULL OR udaleno = 0)
          ORDER BY ${z.shablon?'id':'jakor, nomer'}`, z.id
      ).map((p) => ({
        id: p.id, versija:p.versija, status:p.status,
        nomer: p.nomer,
        jakor: p.jakor || `p${p.nomer}`,
        nazvanie: p.nazvanie,
        sdelano: p.status === 'sdelano',
      }));

      const obschee = {
        ...v_api(z),
        massiv: podzadachi,
        podzadachi,
                                                                     
                                                    
        referalnaja_zadacha: require('./referral-tasks.js').presentContext(db,z),
        sdelano: z.status === 'sdelano',
        stadija: z.status === 'sdelano' ? 'zakryta'
          : z.status === 'v_processe' ? 'v_rabote' : 'otkryta',
      };

      if(z.platezh_id!=null){
        obschee.nomer_proekta=z.proekt_id;
        obschee.summa=z.plan_chislo;
      }

      if (z.roditel_id != null) {
        const parent=db.prepare('SELECT id,nomer,nazvanie,napravlenie,udaleno FROM zadachi WHERE id=?').get(z.roditel_id);
        obschee.roditel=parent?{...parent,udaleno:Boolean(parent.udaleno)}:null;
      }

                                                                    
                                                                     
                                                                  
                                                         
      if (z.rassylka_id) {
        const week=require('./kalendar.js').nedelja_iz_zaprosa({},segodnja());
        Object.assign(obschee,require('./volny-rassylok.js').taskStats(db,z,week));
        obschee.pohozhe_gotovo=Boolean(z.plan_chislo&&obschee.fakt>=z.plan_chislo&&z.status!=='sdelano'&&!obschee.fakt_nepolnyj);
      }

                                                                      
                                                              
                                                             
      if (!z.povtorjaetsja) {
        return { ...obschee, ...require('./povtory.js').sostojanie(db, z, context.den) };
      }
      return { ...obschee, ...require('./povtory.js').sostojanie(db, z, context.den) };
    },

                                                                    
                                                                       
                                                                       
                                                             
    porjadok: 'srok IS NULL, srok, nomer',
    objazatelno: ['nazvanie', 'napravlenie', 'otvetstvennyj'],
    spravochniki: { napravlenie: napravlenija, status: STATUSY_ZADACHI,
                    tip: TIPY_ZADACHI,
                    chastota: ['kazhdyj_den', 'budnie', 'raz_v_nedelju',
                               'vybrannye_dni'] },
    v_zhurnal: ['status', 'otvetstvennyj', 'srok', 'sprint', 'god_sprinta', 'napravlenie',
                'cel_id', 'rezultat_id', 'sotrudnichestvo_id', 'udaleno','klient_id','proekt_id'],
    pered_zapisju: (d, db,avtor,svjaz={}) => {
      proverit_daty_zadachi(d);
      require('./platezh-zadachi.js').prepare(db,d,undefined,svjaz.platezh_kontekst,avtor);
      require('./proekty-zadach.js').novajaSvjaz(db,d);
      require('./svjaz-rassylki-zadachi.js').validate(db,d,undefined,avtor);
      proverit_nazvanie_zadachi(d);
      require('./publikacija-zadachi.js').validate(db,d);
      d.nomer = svobodnyj_nomer(db);
      d.otvetstvennyj = otvetstvennyj_chislom(d.otvetstvennyj, db);
      if (d.status === undefined) d.status = 'v_plane';
      if (d.tip === undefined) d.tip = 'vnutrennjaja';
      if (d.udaleno === undefined) d.udaleno = 0;
      if (d.povtorjaetsja === undefined) d.povtorjaetsja = 0;
                                            
      if (d.povtorjaetsja === 1) {
        if (d.srok || d.sprint || d.god_sprinta) {
          const e = new Error('у повторяющейся нет срока и спринта');
          e.kod = 422;
          throw e;
        }
        if (!d.povtor_s) d.povtor_s = segodnja();
        d.god_sprinta = null;
      }
      require('./povtory.js').proverit_pravilo(d);
                                                                 
                                                                       
                                                                     
                                                            
      proverit_glubinu(d, db);
                                                                       
                                                                      
                                                                         
                                                                       
                                                                        
                                                                    
                                                       
      if (d.povtorjaetsja !== 1) {
        if (d.sprint === undefined || d.sprint === null || d.sprint === '') {
          d.sprint = nomer_nedeli(segodnja());
        }
        const week = normalizovat_sprint(d);
        if (!d.srok && d.status !== 'kogda_nibud' && !d.rassylka_id) d.srok = week.konec;
      }
      for (const key of ['srok','data']) if (d[key]) require('./kalendar.js').data(d[key], key);
      proverit_den_sprinta(d);
                                                                   
                                                                     
                                                                  
                                                               
      if (d.sotrudnichestvo_id !== undefined && d.sotrudnichestvo_id !== null) {
        const s = db.prepare(
          'SELECT chelovek_id, napravlenie, rol FROM sotrudnichestva WHERE id = ?')
          .get(d.sotrudnichestvo_id);
        if (!s) {
          const e = new Error(`сотрудничества ${d.sotrudnichestvo_id} нет`);
          e.kod = 400;
          e.pole = 'sotrudnichestvo_id';
          throw e;
        }
                                                                    
                                                                           
        if (d.klient_id === undefined || d.klient_id === null) {
          d.klient_id = s.chelovek_id;
        } else if (Number(d.klient_id) !== s.chelovek_id) {
          const e = new Error(
            `роль ${d.sotrudnichestvo_id} принадлежит другому человеку`);
          e.kod = 400;
          e.pole = 'sotrudnichestvo_id';
          throw e;
        }
        if (d.napravlenie && d.napravlenie !== s.napravlenie) {
          const e = new Error(
            `роль ${d.sotrudnichestvo_id} относится к направлению ${s.napravlenie}`);
          e.kod = 400;
          e.pole = 'sotrudnichestvo_id';
          throw e;
        }
      }
                                   
      if (d.tip === 'klientskaja' && !d.klient_id) {
        const e = new Error('у клиентской задачи клиент обязателен');
        e.kod = 400;
        e.pole = 'klient_id';
        throw e;
      }
                                                           
      if (d.tip === 'biznesovaja' && !d.roditel_id && d.publikacija !== 1
          && (d.plan_chislo === undefined || d.plan_chislo === null)) {
        const e = new Error('у бизнесовой задачи целевое число обязательно');
        e.kod = 400;
        e.pole = 'plan_chislo';
        throw e;
      }
    },
                                                                        
                                                                          
                                                                        
                                              
                                                           
                                                                
                                                               
                                               
      
                                                                  
                                                                 
                                                    
    svjazannye_polja: ['podzadachi', 'uchastniki', 'materialy', 'kommentarii','platezh_kontekst'],
    razlozhit_svjazannye: (zadacha, svjaz, db, avtor) => {
      const spisok = (v) => (Array.isArray(v) ? v : []);
      const common = require('./obschij.js');
      const actions = require('./podruchki.js').PODRUCHKI_KODA.zadachi;

                                                                   
                                         
      for (const u of spisok(svjaz.uchastniki)) {
        const id = u && typeof u === 'object' ? u.id ?? u.chelovek_id : u;
        actions.uchastniki({ kljuch: zadacha.nomer, telo: { chelovek_id: id }, metod: 'POST', avtor });
      }

                                                                     
                                                                  
      for (const m of spisok(svjaz.materialy)) {
        const nazvanie = String(m && m.nazvanie || '').trim();
        const ssylka = String(m && m.ssylka || '').trim();
        if (!nazvanie && !ssylka) {
          throw new OshibkaVvoda('материал: нужно название или ссылка', 'materialy');
        }
        common.sozdat('materialy', OPISANIJA.materialy, { zadacha_id: zadacha.id,
          napravlenie: zadacha.napravlenie, nazvanie: nazvanie || ssylka, ssylka: ssylka || null,
          ...Object.fromEntries(['fajl','razmer','tip_fajla','ishodnoe_imja'].filter(k=>m[k]!==undefined).map(k=>[k,m[k]])) }, avtor);
      }

                                                                    
                                                                    
      for (const pz of spisok(svjaz.podzadachi)) {
        const nazvanie = String(pz && pz.nazvanie || '').trim();
        if (!nazvanie) {
          throw new OshibkaVvoda('подзадача: нужно название', 'podzadachi');
        }
                                                              
                                               
        const inherited = actions.zagotovka_podzadachi({ kljuch: zadacha.nomer, metod: 'GET' }).telo.zagotovka;
        common.sozdat('zadachi', OPISANIJA.zadachi, { ...inherited, ...pz, nazvanie, roditel_id: zadacha.id }, avtor);
      }
      if(svjaz.kommentarii!==undefined&&!Array.isArray(svjaz.kommentarii))throw new OshibkaVvoda('Комментарии должны быть списком','kommentarii');
      for(const comment of spisok(svjaz.kommentarii)){
        if(!comment||typeof comment!=='object'||Array.isArray(comment)||Object.keys(comment).some(k=>!['tekst','upominanija'].includes(k)))throw new OshibkaVvoda('Комментарий: текст и упоминания','kommentarii');
        common.sozdat('kommentarii',OPISANIJA.kommentarii,{...comment,zadacha_id:zadacha.id},avtor);
      }
      return {};
    },
    posle_zapisi: (zadacha, db, avtor, v_zhurnal) => {
      require('./volny-rassylok.js').onTaskCreated(db,zadacha,avtor);
                                                                      
                                                                 
                                                             
      const podzadacha = zadacha.roditel_id !== null
        && zadacha.roditel_id !== undefined;
      uvedomit(db, {
        komu: zadacha.otvetstvennyj,
        avtor,
        tip: podzadacha ? 'komanda_dobavila_podzadachu' : 'komanda_dobavila_zadachu',
        potok: POTOKI.pro_menja,
        zadacha_id: zadacha.id,
        tekst: `${kto_dobavil_slovami(db, avtor, podzadacha ? 'подзадачу' : 'задачу')} ${zadacha.nazvanie}`,
      });
      if (!zadacha.klient_id) return null;
      const chel = db.prepare('SELECT * FROM ljudi WHERE id = ?')
        .get(zadacha.klient_id);
      if (!chel || !chel.arhiv) return null;

      db.prepare('UPDATE ljudi SET arhiv = 0, arhiv_s = NULL, vozvrat_s = ? WHERE id = ?').run(segodnja(),chel.id);
      const prichina = `появилась задача ${zadacha.nomer}`;
      v_zhurnal(db, 'ljudi', chel.id, 'arhiv', 'да', `нет: ${prichina}`, avtor, chel);

                                                                  
      return {
        vernulsja_iz_arhiva: {
          chelovek_id: chel.id,
          imja: chel.imja,
          prichina,
          tost: `${chel.imja} вернулся из архива: ${prichina}`,
        },
      };
    },
    pered_pravkoj: (d, bylo, db,avtor,telo={}) => {
      proverit_daty_zadachi(d);
      require('./platezh-zadachi.js').prepare(db,d,bylo);
      require('./svjaz-rassylki-zadachi.js').normalize(db,d,bylo,avtor);
      require('./kampanii.js').validateTaskChange(d,bylo,db,telo);
      const waveSnapshot=db.prepare('SELECT * FROM sostavy_voln WHERE zadacha_id=?').get(bylo.id);
      if(waveSnapshot){
        if(d.rassylka_id!==undefined&&d.rassylka_id!==bylo.rassylka_id)throw new Konflikt('У волны уже закреплён состав. Для другой рассылки создай новую задачу');
        if(require('./rol-zadachi-rassylki.js').collection({...bylo,...d})&&!require('./rol-zadachi-rassylki.js').collection(bylo))throw new Konflikt('Волну с закреплённым составом нельзя превратить в сбор базы');
        if(waveSnapshot.polnyj===1&&d.plan_chislo!==undefined&&d.plan_chislo!==waveSnapshot.plan)throw new Konflikt('План волны равен её закреплённому составу. Для другого состава создай новую волну');
      }
      require('./svjaz-rassylki-zadachi.js').validate(db,d,bylo,avtor);
      require('./proekty-zadach.js').novajaSvjaz(db,d,bylo);
      proverit_nazvanie_zadachi(d);
      require('./publikacija-zadachi.js').validate(db,d,bylo,telo.versija);
      const taskAfterEdit={...bylo,...d};
      if(['tip','plan_chislo','publikacija','roditel_id'].some(k=>Object.hasOwn(d,k))&&taskAfterEdit.tip==='biznesovaja'&&!taskAfterEdit.roditel_id&&taskAfterEdit.publikacija!==1&&taskAfterEdit.plan_chislo==null)throw new OshibkaVvoda('У бизнесовой задачи нужно целевое число','plan_chislo');
      const povtor = d.povtorjaetsja !== undefined
        ? d.povtorjaetsja : bylo.povtorjaetsja;
      if (povtor === 1 && d.status !== undefined) {
        throw new OshibkaVvoda('у повторяющейся задачи отмечают день, а не общий статус', 'status');
      }
      if (d.otvetstvennyj !== undefined) {
        d.otvetstvennyj = otvetstvennyj_chislom(d.otvetstvennyj, db);
      }
      if (povtor === 1 && (d.srok || d.sprint || d.god_sprinta)) {
        const e = new Error('у повторяющейся нет срока и спринта');
        e.kod = 400;
        throw e;
      }
                                                                        
                                                                       
                                                                     
      if (d.roditel_id !== undefined && d.roditel_id !== null && db) {
        if (Number(d.roditel_id) === Number(bylo.id)) {
          throw new OshibkaVvoda('задача не может быть своим родителем', 'roditel_id');
        }
        const descendant = db.prepare(`WITH RECURSIVE potomki(id) AS (
          SELECT id FROM zadachi WHERE roditel_id = ?
          UNION SELECT z.id FROM zadachi z JOIN potomki p ON z.roditel_id = p.id
        ) SELECT 1 FROM potomki WHERE id = ?`).get(bylo.id, d.roditel_id);
        if (descendant) throw new OshibkaVvoda('цикл в подзадачах', 'roditel_id');
        proverit_glubinu(d, db);
                                                                          
                                                             
        const svoi = db.prepare(
          'SELECT nomer FROM zadachi WHERE roditel_id = ?')
          .all(bylo.id);
        if (svoi.length) {
          throw new OshibkaVvoda('глубина подзадач два уровня', 'roditel_id');
        }
      }
                                                     
      if (d.povtorjaetsja === 1 && bylo.povtorjaetsja !== 1) {
        d.srok = null;
        d.sprint = null;
        d.god_sprinta = null;
        d.povtor_s = segodnja();
      }
                                                                        
                                                                       
                                                                         
      if (d.povtorjaetsja === 0 && bylo.povtorjaetsja === 1) {
        d.chastota = null;
        d.dni = null;
        d.den_nedeli = null;
        const den_vykljuchenija = segodnja();
        const segodnja_d = new Date(den_vykljuchenija + 'T12:00:00Z');
        if (d.sprint === undefined) d.sprint = nomer_nedeli(den_vykljuchenija);
        if (d.srok === undefined) {
          const k = new Date(segodnja_d);
          k.setUTCDate(k.getUTCDate() + 7 - (k.getUTCDay() || 7));
          d.srok = k.toISOString().slice(0, 10);
        }
        if (d.status === undefined && db) {
          let otmechena = false;
          try {
            otmechena = Boolean(db.prepare(
              `SELECT 1 FROM otmetki_povtora
                WHERE zadacha_id = ? AND data = ?`)
              .get(bylo.id, segodnja_d.toISOString().slice(0, 10)));
          } catch {                             }
          d.status = otmechena ? 'sdelano' : 'v_plane';
        }
      }
      require('./povtory.js').proverit_pravilo(d, bylo);
      const repeat = (d.povtorjaetsja ?? bylo.povtorjaetsja) === 1;
      const status = d.status ?? bylo.status;
      if (!repeat && status !== 'kogda_nibud' &&
          ((d.sprint ?? bylo.sprint) == null || (Object.hasOwn(d,'sprint') && !d.sprint))) {
        d.sprint = nomer_nedeli(segodnja());
        d.god_sprinta = require('./kalendar.js').iso_nedelja(segodnja()).god;
      }
      if (!repeat && (Object.hasOwn(d,'sprint') || Object.hasOwn(d,'god_sprinta'))
          && (d.sprint != null || bylo.sprint != null)) normalizovat_sprint(d, bylo);
      if (!repeat && status !== 'kogda_nibud' && !(d.rassylka_id ?? bylo.rassylka_id)
          && Object.hasOwn(d,'srok') && !d.srok) d.srok = normalizovat_sprint(d, bylo).konec;
      for (const key of ['srok','data']) if (d[key]) require('./kalendar.js').data(d[key], key);
      if(['data','sprint','god_sprinta'].some(k=>Object.hasOwn(d,k)))proverit_den_sprinta(d,bylo);
    },
    pered_udaleniem: (bylo, db, avtor, options = {}) => {
      const count = db.prepare('SELECT count(*) n FROM otmetki_povtora WHERE zadacha_id=?').get(bylo.id).n;
      if (count && options.confirm !== true) {
        throw Object.assign(new Error('для удаления задачи с отметками нужно подтверждение'), {
          kod: 409, dannye: { oshibka: 'nuzhno_podtverzhdenie', otmetok: count },
        });
      }
    },
                                                   
    posle_pravki: (stalo, bylo, db, avtor) => {
      const effects = require('./sostojanie-zadachi.js').posle_statusa(db, stalo, bylo, avtor);
                                                                 
                                                                   
      if (String(bylo.srok ?? '') !== String(stalo.srok ?? '')) {
        const imja = imja_cheloveka(db, avtor);
        const kto = imja
          ? `${imja} ${glagol_po_polu(db, avtor, 'перенёс', 'перенесла')} срок`
          : 'Срок перенесли';
        uvedomit(db, {
          komu: stalo.otvetstvennyj,
          avtor,
          tip: 'pomenjali_srok',
          potok: POTOKI.pro_menja,
          zadacha_id: stalo.id,
          tekst: `${kto}: ${stalo.nazvanie}`,
        });
      }
                                                                       
                                                 
      if (String(bylo.otvetstvennyj ?? '') !== String(stalo.otvetstvennyj ?? '')) {
        uvedomit(db, {
          komu: stalo.otvetstvennyj,
          avtor,
          tip: 'komanda_dobavila_zadachu',
          potok: POTOKI.pro_menja,
          zadacha_id: stalo.id,
          tekst: `${kto_dobavil_slovami(db, avtor, 'задачу')} ${stalo.nazvanie}`,
        });
      }
                                                             
                                                                    
                                                                        
      const VAZHNYE = ['srok', 'sprint', 'status', 'otvetstvennyj',
                       'napravlenie', 'nazvanie', 'klient_id', 'proekt_id'];
      const pomenjalos = VAZHNYE
        .filter((k) => String(bylo[k] ?? '') !== String(stalo[k] ?? ''));
      if (pomenjalos.length) {
        for (const komu of uchastniki_zadachi(db, stalo.id)) {
          if (Number(komu) === Number(stalo.otvetstvennyj)) continue;
          uvedomit(db, {
            komu,
            avtor,
            tip: 'izmenili_zadachu_uchastnika',
            potok: POTOKI.sobytija,
            zadacha_id: stalo.id,
            tekst: `Изменили задачу ${stalo.nazvanie}, вы в участниках`,
          });
        }
      }
      return effects;
    },
  },

                                                                  
                                                                       
                                                                  
                                                                 
                                                                   
                                                                     
                                                           
                                                                 
  bazy: {
    pered_udaleniem:(row,db)=>{if(db.prepare('SELECT 1 FROM rassylki WHERE baza_id=? LIMIT 1').get(row.id)||db.prepare('SELECT 1 FROM rezultaty WHERE baza_id=? LIMIT 1').get(row.id))throw new Konflikt('База используется кампанией или результатом. Сначала измени связанную запись');},
    objazatelno: ['nazvanie'],
    spravochniki: { napravlenie: napravlenija, chto_vnutri: CHTO_ETO },
    v_zhurnal: ['nazvanie', 'chto_vnutri', 'napravlenie', 'arhiv'],
                                                                    
                                         
    udalenie: 'nasovsem',
    vmeste_s_nim: [
      { tablica: 'bazy_ljudi', pole: 'baza_id' },
      { tablica: 'bazy_statusy', pole: 'baza_id' },
    ],
  },

  celi: {
    objazatelno: ['nazvanie'],
    proverka: (data, before, raw) => {
      for(const field of ['nazvanie','opisanie'])if(Object.hasOwn(raw,field)&&raw[field]!==null&&typeof raw[field]!=='string')return {tekst:'Нужен текст',pole:field};
      if(Object.hasOwn(raw,'period_id'))require('./celi-model.js').period(raw.period_id);
      if(Object.hasOwn(raw,'napravlenie')&&(typeof raw.napravlenie!=='string'||!raw.napravlenie))return {tekst:'Выбери действующее направление',pole:'napravlenie'};
      return null;
    },
    spravochniki: { napravlenie: napravlenija,
                    sostojanie: ['chernovik', 'aktivna', 'arhiv'] },
    v_zhurnal: ['nazvanie', 'opisanie', 'sostojanie', 'napravlenie', 'period_id', 'tezis_id'],
                                                                  
                                                         
    dopolnit: (db, c) => {
      const engine=require('./ekrany.js'),results=db.prepare('SELECT * FROM rezultaty WHERE cel_id=? ORDER BY id').all(c.id).map(r=>({...r,fakt:engine.fakt_rezultata(db,r)}));
      const percent=engine.procent_celi(results),source=require('./strategija-celi.js').sourceLink(db,c);
      return {progress:percent,procent:percent,...require('./otmena-okr.js').preview(db,'celi',c),strategija:source,...(source&&!source.udalen?{tezis_tekst:source.tekst}:{})};
    },
                                                                   
                                                                        
                                                                
                                                                   
                                                 
    udalenie: 'nasovsem',
    vmeste_s_nim: [
      { tablica: 'zamery', pole: 'rezultat_id',
        cherez: 'SELECT id FROM rezultaty WHERE cel_id = ?' },
      { tablica: 'rezultaty', pole: 'cel_id' },
    ],
    pered_zapisju: (d, db, avtor) => {
      if (d.sostojanie === undefined) d.sostojanie = 'chernovik';
      require('./strategija-celi.js').prepareLink(d,null,db);
      require('./celi-model.js').validate(d,null,db,avtor);
      period_celi_otkryt(db, d);
    },
                                                                      
                                                                     
    posle_zapisi: (itog, db) => {
      if (!itog.napravlenie) return null;
      const aktivnyh = db.prepare(
        `SELECT count(*) k FROM celi
          WHERE napravlenie = ? AND sostojanie = 'aktivna'
            AND (period_id IS ? OR period_id = ?)`
      ).get(itog.napravlenie, itog.period_id || null, itog.period_id || null).k;
      if (aktivnyh >= 4) {
        return { podskazka:
          `в направлении уже ${aktivnyh} активных целей: на квартал держат одну-три, лишние размывают фокус` };
      }
      return null;
    },
                                                                       
                                                                         
    pered_pravkoj: (d, bylo, db, avtor, raw) => {
      require('./celi-model.js').validate(d,bylo,db,avtor,raw);
      require('./versii.js').proverit(db,'celi',bylo,raw.versija,require('./celi-model.js').versionDependencies(d));
      require('./strategija-celi.js').prepareLink(d,bylo,db);
      if (d.period_id) period_celi_otkryt(db, d);
      if (!bylo.period_id) return;
      const p = db.prepare('SELECT zakryt FROM periody WHERE id = ?')
        .get(String(bylo.period_id));
      if (p && p.zakryt) {
        const e = new Error(`период ${bylo.period_id} закрыт, цели только на чтение`);
        e.kod = 409;
        throw e;
      }
    },
    pered_udaleniem: (bylo, db, avtor) => {
      require('./celi-model.js').authorize(db,bylo,{nazvanie:bylo.nazvanie},avtor);
      period_celi_otkryt(db, bylo);
      otcepit_zadachi_okr(db, bylo, avtor, true);
    },
  },

                                                                 
                                                                         
                                                                    
                                                                       
                                                                     
                                                                 
  rezultaty: {
    objazatelno: ['cel_id', 'nazvanie'],
    proverka:(d,before,raw)=>{if(before)period_rezultata_otkryt(baza(),before.cel_id);if(d.cel_id)period_rezultata_otkryt(baza(),d.cel_id);return require('./forma-rezultata.js').validate(d,before,raw);},
    posle_zapisi:(row,db)=>require('./forma-rezultata.js').advisory(db,row.cel_id),
    posle_pravki:(row,before,db)=>require('./forma-rezultata.js').advisory(db,row.cel_id),
    dopolnit:(db,r)=>{const snapshot=require('./srez-okr.js').fakt(db,r),fact=snapshot.fakt;return {fakt:fact,polnota_publikacij:snapshot.polnota_publikacij,pochemu_net_fakta:snapshot.pochemu,progress_pct:require('./progress-okr.js').result(r,fact),baza_ne_zadana:r.tip!=='veha'&&r.baza==null,...require('./otmena-okr.js').preview(db,'rezultaty',r)};},
    spravochniki: { istochnik: ['formula', 'ruchnoj_zamer', 'akkaunt'] },
    v_zhurnal: ['nazvanie','plan','baza','tip','istochnik','formula','akkaunt_id','metrika','kto_otvechaet','zakryta','schitat_lidov'],
                                                                       
                                                                    
                                                                     
                                                                     
                                                                
                                                             
                                                                  
                                    
    udalenie: 'nasovsem',
    vmeste_s_nim: [{ tablica: 'zamery', pole: 'rezultat_id' }],
    pered_pravkoj: (d, bylo, db) => {
      period_rezultata_otkryt(db, bylo.cel_id);
      if (d.cel_id) period_rezultata_otkryt(db, d.cel_id);
      require('./istochnik-rezultata.js').istochnik_rezultata(d,bylo);
      if(require('./dengi-okr.js').isMoney(db,bylo)!==require('./dengi-okr.js').denezhnyj({...bylo,...d}))throw new Konflikt('Денежный и обычный результат ведутся отдельно. Создай новый результат, чтобы сохранить смысл и защиту прежней истории');
    },
    pered_udaleniem: (bylo, db, avtor) => {
      period_rezultata_otkryt(db, bylo.cel_id);
      otcepit_zadachi_okr(db, bylo, avtor, false);
    },
    pered_zapisju: (d, db) => {
      period_rezultata_otkryt(db, d.cel_id);
      require('./istochnik-rezultata.js').istochnik_rezultata(d);
    },
  },

                                                                      
                                                                    
                                                                        
                                                         
                                                                
                                                                        
                                                                        
                                                                    
                                                                      
  zamery: {
    objazatelno: ['rezultat_id', 'znachenie', 'otkuda'],
    avtor_v_pole: 'kto',
    dopolnit:(db,row)=>({kto_imja:db.prepare('SELECT imja FROM ljudi WHERE id=?').get(row.kto)?.imja??null}),
    proverka:(d,before,raw)=>{require('./ruchnoj-zamer.js').validate(d,before,raw);return null;},
    v_zhurnal: [],
    pered_zapisju: (d, db) => {
      if (d.data === undefined) d.data = segodnja();
      require('./kalendar.js').data(d.data, 'data');
      if (d.znachenie === null || String(d.znachenie).trim() === '' || !Number.isFinite(Number(d.znachenie))) {
        throw new OshibkaVvoda('впиши конечное число', 'znachenie');
      }
      d.znachenie = Number(d.znachenie);
      zapert_li_period(db, d.rezultat_id);
    },
                                                                    
                                                                  
                 
    pered_pravkoj: (d, bylo, db) => {
      zapert_li_period(db, bylo.rezultat_id);
      if(d.rezultat_id!==undefined)zapert_li_period(db,d.rezultat_id);
      throw new OshibkaVvoda('Замеры хранятся неизменяемыми строками истории. Внеси уточнение новым замером');
    },
    pered_udaleniem: (bylo, db) => {
      zapert_li_period(db, bylo.rezultat_id);
      throw new OshibkaVvoda('Замер остаётся в истории. Внеси уточнение новой строкой');
    },
  },

  napravlenija: {
    kljuch: 'kod',
    pered_zapisju: (d,db,avtor) => {if(d.veduschij_id!=null)require('./dostup.js').tolko_admin(db,avtor,'Ведущего направления назначают владельцы Локуса');require('./referral-tasks.js').validateLead(db,d);},
    pered_pravkoj: (d,bylo,db,avtor) => {if(d.kod!==undefined&&d.kod!==bylo.kod)throw new OshibkaVvoda('Код направления не меняется','kod');if(Object.hasOwn(d,'veduschij_id')&&d.veduschij_id!==bylo.veduschij_id)require('./dostup.js').tolko_admin(db,avtor,'Ведущего направления назначают владельцы Локуса');require('./referral-tasks.js').validateLead(db,d);},
    objazatelno: ['kod', 'nazvanie'],
    v_zhurnal: ['nazvanie', 'arhiv', 'norma_dnej','veduschij_id'],
    porjadok: 'porjadok',
                                                               
                                                              
                                                              
                                        
    dopolnit: (db, n) => {
      const schet = (sql) => {
        try { return db.prepare(sql).get(n.kod).n; } catch { return 0; }
      };
      return {
        ...n,
                                                                      
        url: `/${n.kod}`,
        klientov: schet(
          `SELECT count(DISTINCT s.chelovek_id) n FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id
            WHERE s.napravlenie = ? AND s.rol = 'klient' AND COALESCE(s.arhiv,0)=0 AND COALESCE(l.arhiv,0)=0`),
        referalov: schet(
          `SELECT count(DISTINCT s.chelovek_id) n FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id
            WHERE s.napravlenie = ? AND s.rol = 'referal' AND COALESCE(s.arhiv,0)=0 AND COALESCE(l.arhiv,0)=0`),
        vsego_ljudej: schet(
          `SELECT count(DISTINCT s.chelovek_id) n FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id
            WHERE s.napravlenie = ? AND COALESCE(s.arhiv,0)=0 AND COALESCE(l.arhiv,0)=0`),
        zadach: schet(
          `SELECT count(1) n FROM zadachi
            WHERE napravlenie = ? AND (udaleno IS NULL OR udaleno = 0)`),
      };
    },
  },

                                                                 
                                                            
  proekty: {
                                                                          
                                                                     
                                                                  
                                            
    objazatelno: ['nazvanie', 'napravlenie', 'klient_id', 'status'],
                                                                     
                                                        
    udalenie: 'net',
    pochemu_ne_udaljaetsja: 'проект не удаляется, поставь архив',
    spravochniki: { napravlenie: napravlenija,
                    status: ['idet', 'pauza', 'zavershen'] },
                                                                 
                                                                  
                                                                  
                                                                     
    v_zhurnal: ['nazvanie', 'usluga_svoja', 'usluga_tekst', 'status', 'stoimost', 'kto_vedet', 'arhiv', 'usluga_id', 'klient_id', 'napravlenie'],
    pered_zapisju: (d, db) => {
      if (d.arhiv === undefined) d.arhiv = 0;
      require('./polja-proekta.js').validate(d,db);

                                                                
                                                            
      const klient = db.prepare('SELECT id FROM ljudi WHERE id = ?').get(d.klient_id);
      if (!klient) {
        const e = new Error('клиента нет');
        e.kod = 400;
        e.pole = 'klient_id';
        throw e;
      }

      odin_sposob_uslugi(d, d);

                                                                      
                                                                    
                                                                
                                                               
      if (d.usluga_id && d.stoimost === undefined) {
        const u = db.prepare('SELECT cena FROM uslugi WHERE id = ?').get(d.usluga_id);
        if (u && u.cena !== null) d.stoimost = u.cena;
      }
      require('./polja-proekta.js').validate(d,db);
    },
    pered_pravkoj: (d, bylo, db) => {
      require('./polja-proekta.js').validate(d,db,bylo);
      odin_sposob_uslugi(d, bylo);
      require('./akkaunt-zadachi.js').projectChange(db,d,bylo);
    },
                                                                  
                                                                     
                                              
    posle_zapisi: (proekt, db, avtor) => {
      uvedomit(db, {
        komu: proekt.kto_vedet,
        avtor,
        tip: 'vedushim_proekta',
        proekt_id: proekt.id,
        potok: POTOKI.pro_menja,
        tekst: `${kto_dobavil_slovami(db, avtor, 'вас ведущим проекта')} ${proekt.nazvanie}`,
      });
      return null;
    },
    posle_pravki: (stalo, bylo, db, avtor) => {
      if (String(bylo.kto_vedet ?? '') === String(stalo.kto_vedet ?? '')) return null;
      uvedomit(db, {
        komu: stalo.kto_vedet,
        avtor,
        tip: 'vedushim_proekta',
        proekt_id: stalo.id,
        potok: POTOKI.pro_menja,
        tekst: `${kto_dobavil_slovami(db, avtor, 'вас ведущим проекта')} ${stalo.nazvanie}`,
      });
      return null;
    },
  },

                                                    
  platezhi: {
                                                                     
                                                                 
                        
    objazatelno: ['proekt_id', 'summa', 'zhdem_do'],
    versija_pri_udalenii: true,
    pered_pravkoj: (d,bylo,db,avtor,telo)=>{
      require('./versii.js').proverit(db,'platezhi',bylo,telo.versija,['proekt_id','oplachen_at']);
      require('./platezhi.js').proveritDannye(d);
    },
                                                                  
                                                                   
                                                        
    udalenie: 'nasovsem',
    pered_udaleniem: (bylo) => {
      if (bylo.oplachen_at) {
        const e = new Error('пришедший платёж не удаляется, сними отметку оплаты');
        e.kod = 422;
        throw e;
      }
    },
                                                                    
                                                                         
                                           
    v_zhurnal: ['summa', 'oplachen_at', 'zhdem_do'],
    pered_zapisju: (d, db) => {
      require('./platezhi.js').proveritDannye(d);
      if (Number(d.summa) <= 0) {
        const e = new Error('сумма платежа больше нуля');
        e.kod = 400;
        e.pole = 'summa';
        throw e;
      }
                                                                    
                                                                  
                                                 
      const p = db.prepare('SELECT id FROM proekty WHERE id = ?').get(d.proekt_id);
      if (!p) {
        const e = new Error('проекта нет');
        e.kod = 400;
        e.pole = 'proekt_id';
        throw e;
      }
    },
  },

                                                                       
                                                                  
                                                                
                                           
  uslugi: {
    objazatelno: ['napravlenie', 'nazvanie'],
                                                                        
                                                                              
                                                               
    udalenie: 'net',
    pochemu_ne_udaljaetsja: 'услуга не удаляется, поставь архив или замени другой',
    spravochniki: { napravlenie: napravlenija },
                                                                       
                                                           
    v_zhurnal: ['nazvanie', 'opisanie', 'ssylka', 'cena', 'arhiv', 'porjadok'],
    porjadok: 'porjadok',
    pered_zapisju: (d, db) => {
      Object.assign(d,require('./uslugi.js').validate(d,true));
                                                                   
                                                                     
                                   
      if (d.porjadok === undefined) {
        const m = db.prepare(
          'SELECT max(porjadok) m FROM uslugi WHERE napravlenie = ?'
        ).get(d.napravlenie).m;
        d.porjadok = (m || 0) + 1;
      }
      if (d.arhiv === undefined) d.arhiv = 0;
    },
    pered_pravkoj: d => Object.assign(d,require('./uslugi.js').validate(d,true)),
  },

                                                      
  shablony: {
                                                                     
                                                                   
                                               
    objazatelno: ['nazvanie', 'schitat_fakt'],
    avtor_v_pole: 'avtor',
    vmeste_s_nim: [{tablica:'shablon_podzadachi',pole:'shablon_id'}],
                                                               
                                                               
    dopolnit: (db, sh) => {
      let shagi = [];
      try {
        shagi = db.prepare(
          `SELECT nazvanie FROM shablon_podzadachi
            WHERE shablon_id = ? ORDER BY porjadok`).all(sh.id)
          .map((r) => r.nazvanie);
      } catch {                                            }
      return { podzadachi: shagi.join(', ') || null,
               podzadachi_spisok: shagi };
    },
                                                                          
                                                                   
                                                                    
                                                                  
                                                                        
                                                                       
                                               
    udalenie: 'nasovsem',
    pered_udaleniem: (bylo,db,avtor) => {
      require('./shablony.js').writeable(db,bylo,avtor);
                                                                 
                                                   
      if (bylo.gotovyj === 1) {
        const e = new Error('gotovyj_zaschischen');
        e.kod = 403;
        throw e;
      }
    },
    spravochniki: { tip: TIPY_ZADACHI,
                    schitat_fakt: ['net', 'kontakty_bazy', 'otpravleno'],
                    kod: KODY_SHABLONOV },
    v_zhurnal: ['nazvanie', 'schitat_fakt', 'obschij', 'srok_po_umolchaniju'],
    pered_zapisju: (d, db, avtor) => {
      d.avtor=avtor;
                                                                    
                                                                
                                                                    
                                                                  
      if (d.gotovyj !== undefined) {
        const e = new Error('признак готового ставит система');
        e.kod = 400;
        e.pole = 'gotovyj';
        throw e;
      }
      d.gotovyj = 0;
                                                                    
                                                    
      if (d.obschij === undefined) d.obschij = 0;
                                                                     
                                                                         
                          
      if (d.kod) {
        const est = db.prepare('SELECT id FROM shablony WHERE kod = ?').get(d.kod);
        if (est) {
          const e = new Error('шаблон с таким кодом уже есть');
          e.kod = 409;
          e.dannye = { oshibka: 'shablon_est', id: est.id };
          throw e;
        }
      }
    },
    pered_pravkoj: (d, bylo, db, avtor) => {
      require('./shablony.js').writeable(db,bylo,avtor);
      if(Object.hasOwn(d,'avtor')&&d.avtor!==bylo.avtor)throw new OshibkaVvoda('Owner is fixed','avtor');
                                                                    
                                                                  
      if (bylo.gotovyj === 1) {
        const e = new Error('готовый шаблон не правится, сделай свой копией');
        e.kod = 422;
        throw e;
      }
      if (d.gotovyj !== undefined) {
        const e = new Error('признак готового ставит система');
        e.kod = 400;
        e.pole = 'gotovyj';
        throw e;
      }
    },
  },

                                                           
  svjazi: {
                                                                 
                                                                 
                         
    objazatelno: ['ot_cheloveka', 'k_cheloveku', 'tip'],
                                                               
                                                
    udalenie: 'nasovsem',
    spravochniki: { tip: ['rekomendoval', 'referal', 'reshaet', 'kollega'] },
                                                          
                                              
    v_zhurnal: [],
    pered_zapisju: (d, db) => {
                                                               
                                                                   
      if (String(d.ot_cheloveka) === String(d.k_cheloveku)) {
        const e = new Error('связь человека с собой не бывает');
        e.kod = 400;
        e.pole = 'k_cheloveku';
        throw e;
      }
      for (const pole of ['ot_cheloveka', 'k_cheloveku']) {
        const est = db.prepare('SELECT id FROM ljudi WHERE id = ?').get(d[pole]);
        if (!est) {
          const e = new Error('человека нет');
          e.kod = 400;
          e.pole = pole;
          throw e;
        }
      }
                                                                   
                                                                   
                                           
      const dubl = db.prepare(
        `SELECT id FROM svjazi
         WHERE ot_cheloveka = ? AND k_cheloveku = ? AND tip = ?`
      ).get(d.ot_cheloveka, d.k_cheloveku, d.tip);
      if (dubl) {
        const e = new Error('такая связь уже есть');
        e.kod = 409;
        e.dannye = { oshibka: 'svjaz_est', id: dubl.id };
        throw e;
      }
    },
  },

                                                               
                                                                  
  dokumenty: {
                                                                     
                                                                  
    objazatelno: ['nazvanie', 'tip', 'data'],
                                                                 
                                                                
                                                               
                                                 
    proverka: (t, bylo) => {
      const fajl = t.fajl !== undefined ? t.fajl : (bylo && bylo.fajl);
      const ssylka = t.ssylka !== undefined ? t.ssylka : (bylo && bylo.ssylka);
      const est_f = fajl !== null && fajl !== undefined && fajl !== '';
      const est_s = ssylka !== null && ssylka !== undefined && ssylka !== '';
      if (est_f && est_s) {
        return { pole: 'fajl', tekst: 'либо файл, либо ссылка, не оба сразу' };
      }
      if (!est_f && !est_s) {
        return { pole: 'fajl', tekst: 'нужен файл или ссылка на документ' };
      }
      return null;
    },
                                                                     
                                                                        
                                    
    udalenie: 'nasovsem',
                                                                       
                                                                      
                                                      
    spravochniki: { napravlenie: napravlenija,
                    tip: ['dogovor', 'dopnik', 'akt', 'schet', 'nda',
                          'doverennost', 'drugoe'] },
                                                                      
                                                                
    v_zhurnal: ['nomer', 'data', 'tip'],
    pered_zapisju: (d) => {
                                                                     
                                                                  
                             
      const est_fajl = !!(d.fajl && String(d.fajl).trim());
      const est_ssylka = !!(d.ssylka && String(d.ssylka).trim());
      if (est_fajl && est_ssylka) {
        const e = new Error('либо файл, либо ссылка');
        e.kod = 400;
        e.pole = 'fajl';
        throw e;
      }
      if (!est_fajl && !est_ssylka) {
        const e = new Error('нужен файл или ссылка');
        e.kod = 400;
        e.pole = 'fajl';
        throw e;
      }
                                                                       
                                                              
                       
      if (!d.chelovek_id && !d.proekt_id && !d.napravlenie) {
        const e = new Error('нужна привязка: человек, проект или направление');
        e.kod = 400;
        e.pole = 'chelovek_id';
        throw e;
      }
                                                                    
                                                                   
                                                          
      proverit_fajl(d);
    },
    pered_pravkoj: (d) => {
      proverit_fajl(d);
    },
  },

                                                           
                                                               
                                              
  anketa: {
                                                               
                                                                  
    kljuch: 'chelovek_id',
                                                                        
                                                                        
    porjadok: 'chelovek_id',
    objazatelno: ['chelovek_id'],
                                                                     
                                                            
    udalenie: 'nasovsem',
                                                                    
                                                                      
                                                
    v_zhurnal: [],
    pered_udaleniem: (bylo, db, avtor) => {
      if (Number(bylo.chelovek_id) !== Number(avtor)) {
        throw Object.assign(new Error('анкету удаляет только её хозяин'), { kod: 403 });
      }
    },
                                                                        
                                                                 
    pered_pravkoj: (d, bylo, db, avtor) => {
      if (avtor != null && Number(bylo.chelovek_id) !== Number(avtor)) {
        const e = new Error('анкету правит только её хозяин');
        e.kod = 403;
        e.pole = 'chelovek_id';
        throw e;
      }
      if(d.chelovek_id!==undefined&&Number(d.chelovek_id)!==Number(bylo.chelovek_id)){
        throw Object.assign(new Error('анкету нельзя перенести другому человеку'),{kod:403,pole:'chelovek_id'});
      }
    },
    pered_zapisju: (d, db, avtor) => {
                                                                    
                                                                
                                                         
      if (avtor != null && Number(d.chelovek_id) !== Number(avtor)) {
        const e = new Error('анкету заполняет только её хозяин');
        e.kod = 403;
        e.pole = 'chelovek_id';
        throw e;
      }
                                                                       
                                                              
      const chel = db.prepare('SELECT id, komanda FROM ljudi WHERE id = ?')
        .get(d.chelovek_id);
      if (!chel) {
        const e = new Error('человека нет');
        e.kod = 400;
        e.pole = 'chelovek_id';
        throw e;
      }
      if (chel.komanda !== 1) {
        const e = new Error('анкета заполняется только человеком команды');
        e.kod = 422;
        e.pole = 'chelovek_id';
        throw e;
      }
                                                                   
                                                                      
                                         
      const est = db.prepare('SELECT chelovek_id FROM anketa WHERE chelovek_id = ?')
        .get(d.chelovek_id);
      if (est) {
        const e = new Error('анкета уже есть, правь её');
        e.kod = 409;
        e.dannye = { oshibka: 'anketa_est', chelovek_id: d.chelovek_id };
        throw e;
      }
                                                                            
                                                                                
      const last=db.prepare('SELECT poslednjaja_versija FROM schetchiki_anket WHERE chelovek_id=?').get(d.chelovek_id);
      d.versija=(last?.poslednjaja_versija||0)+1;
    },
  },

                                                                      
                                                                       
                                                                      
                                             
  materialy: {
    objazatelno: ['nazvanie'],
    spravochniki: { napravlenie: napravlenija },
                                                                      
                                                                    
                                                              
    udalenie: 'nasovsem',
                                                                         
                                                                    
    v_zhurnal: ['nazvanie', 'ssylka', 'fajl'],
    pered_zapisju: (d) => {
                                                                      
                                                                  
                                                                    
      if (!d.chelovek_id && !d.proekt_id && !d.napravlenie && !d.zadacha_id) {
        const e = new Error('привязка обязательна: человек, проект, направление или задача');
        e.kod = 400;
        e.pole = 'chelovek_id';
        throw e;
      }
                                                                     
                                                                    
                                                       
      if (!d.fajl && !d.ssylka) {
        const e = new Error('нужен файл или ссылка');
        e.kod = 400;
        e.pole = 'ssylka';
        throw e;
      }
      proverit_fajl(d);
    },
    pered_pravkoj: (d, bylo) => {
                                                                     
                                                
      const posle = (k) => (d[k] !== undefined ? d[k] : bylo[k]);
      if (!posle('chelovek_id') && !posle('proekt_id')
          && !posle('napravlenie') && !posle('zadacha_id')) {
        const e = new Error('нельзя снять последнюю привязку материала');
        e.kod = 422;
        throw e;
      }
                                                            
      proverit_fajl(d);
    },
  },

                                                                           
                                                                         
                                     
                                                           
                                                                  
                             
  kommentarii: {
    objazatelno: ['zadacha_id', 'tekst'],
    versija_pri_udalenii: true,
    dopolnit: (db,row) => require('./kommentarii.js').dto(db,[row])[0],
    dopolnit_spisok: (db,rows) => require('./kommentarii.js').dto(db,rows),
                                                                     
                                                                   
                                                  
    udalenie: 'nasovsem',
                                                                     
                                                     
    v_zhurnal: ['zadacha_id'],
    pered_pravkoj: (d, bylo, db, avtor) => require('./kommentarii.js').pravit(d,bylo,db,avtor),
    pered_udaleniem: (bylo, db, avtor) => require('./kommentarii.js').avtor(bylo,avtor),
    posle_pravki: (d,bylo,db,avtor) => require('./kommentarii.js').uvedomit(d,db,avtor,bylo),
    pered_zapisju: (d, db, avtor) => {
                                                             
      if (avtor) d.chelovek_id = avtor;
      if (!d.sozdano) d.sozdano = seichas();
      require('./kommentarii.js').sozdat(d,db,avtor);
    },
    posle_zapisi: (d, db, avtor) => {
                                                                    
                                                                    
                                                                    
                                                                   
                                                             
      {
        const z = db.prepare(
          'SELECT otvetstvennyj, nazvanie FROM zadachi WHERE id = ?')
          .get(d.zadacha_id);
        if (z) {
          const imja = imja_cheloveka(db, avtor);
          uvedomit(db, {
            komu: z.otvetstvennyj,
            avtor,
            tip: 'kommentarij_v_zadache',
            potok: POTOKI.sobytija,
            zadacha_id: d.zadacha_id,
            tekst: `${imja ? `${imja} ${glagol_po_polu(db, avtor, 'написал', 'написала')}` : 'Новый комментарий'} в задаче ${z.nazvanie}`,
          });
        }
      }
                                                                 
                                                                
      require('./kommentarii.js').uvedomit(d,db,avtor);
    },
  },

  lenta: {
    objazatelno: ['chelovek_id', 'tip', 'tekst'],
    spravochniki: { tip: TIPY_LENTY, napravlenie: napravlenija },
                                                                       
                                                                  
                                                          
    udalenie: 'nasovsem',
                                                                      
                                                                   
    v_zhurnal: ['tip', 'napravlenie'],
                                                            
                                                              
                                                             
                            
    posle_zapisi: (zapis, db, avtor) => {
      if (zapis.tip !== 'novoe') return;
      const komanda = db.prepare(
        `SELECT id FROM ljudi
         WHERE komanda = 1 AND (arhiv IS NULL OR arhiv = 0)`).all();
      const kratko = String(zapis.tekst || '').slice(0, 120);
      for (const ch of komanda) uvedomit(db,{komu:ch.id,avtor,tip:'novoe',potok:POTOKI.sobytija,
        lenta_id:zapis.id,tekst:`Новое в Локусе: ${kratko}`});
    },
    pered_zapisju: (d, db, avtor) => {
      require('./lenta-komandy.js').author(d,avtor);require('./lenta-komandy.js').validateText(d);
      if (d.tip === undefined) d.tip = 'zapis';
                                                                         
                                                                 
      if (d.tip === 'refleksija' && (d.sprint === undefined || d.sprint === null)) {
        const e = new Error('у рефлексии спринт обязателен');
        e.kod = 400;
        e.pole = 'sprint';
        throw e;
      }
      if(d.tip!=='refleksija'&&d.sprint!=null)throw new OshibkaVvoda('Спринт относится только к рефлексии','sprint');
      if (d.sprint != null) normalizovat_sprint(d);
    },
    pered_udaleniem: (bylo,db,avtor,body) => {require('./lenta-komandy.js').author(bylo,avtor);require('./lenta-komandy.js').version(bylo,body);},
    pered_pravkoj: (d, bylo, db, avtor, body) => {
      require('./lenta-komandy.js').author(bylo,avtor);require('./lenta-komandy.js').author({...bylo,...d},avtor);require('./lenta-komandy.js').version(bylo,body);require('./lenta-komandy.js').validateText(body);
      const kind=d.tip??bylo.tip;
      if(kind==='refleksija'&&(Object.hasOwn(d,'sprint')?d.sprint:bylo.sprint)==null)throw new OshibkaVvoda('У рефлексии нужен спринт','sprint');
      if(kind!=='refleksija'&&d.sprint!=null)throw new OshibkaVvoda('Спринт относится только к рефлексии','sprint');
      if(bylo.tip==='refleksija'&&kind!=='refleksija'){d.sprint=null;d.god_sprinta=null;}
      if ('sprint' in d || 'god_sprinta' in d) {
        if (d.sprint === null && (d.tip ?? bylo.tip) !== 'refleksija') d.god_sprinta = null;
        else normalizovat_sprint(d, bylo);
      }
    },
  },

                                                                         
                                                                         
                                            
  tezisy: {
    objazatelno: ['napravlenie', 'god', 'tekst'],
    spravochniki: { napravlenie: napravlenija },
    proverka:(data,before,raw)=>{Object.assign(data,require('./tezisy-model.js').validate(data,before,raw));},
                                                                             
    udalenie: 'mjagko',
    versija_pri_udalenii: true,
    v_zhurnal: ['tekst', 'porjadok'],
    porjadok: 'porjadok',
    pered_pravkoj:(d,bylo,db,avtor)=>{
      require('./prava-strategii.js').check(db,avtor);
      if(Object.hasOwn(d,'udaleno')&&Number(d.udaleno)!==0)throw new OshibkaVvoda('Для удаления есть отдельное действие','udaleno');
      if(Object.hasOwn(d,'napravlenie')&&d.napravlenie!==bylo.napravlenie&&db.prepare('SELECT 1 FROM celi WHERE tezis_id=? LIMIT 1').get(bylo.id))throw Object.assign(new Error('У тезиса есть связанные цели. Для другого направления создай отдельный тезис'),{kod:409});
    },
    pered_udaleniem:(before,db,actor,options)=>{require('./prava-strategii.js').check(db,actor);require('./strategija-pravki.js').beforeDelete(db,before,actor,options);},
    pered_zapisju: (d, db, avtor) => {
      require('./prava-strategii.js').check(db,avtor);
                                                                        
                                                           
      if (d.porjadok === undefined) {
        const m = db.prepare(
          'SELECT max(porjadok) m FROM tezisy WHERE napravlenie = ? AND god = ? AND COALESCE(udaleno,0)=0'
        ).get(d.napravlenie, d.god).m;
        d.porjadok = m==null?0:m+1;
      }
    },
  },

                                                                       
                                                                          
                                                      
  akkaunty: {
    objazatelno: ['ploshadka', 'nazvanie', 'uroven'],
    versija_pri_udalenii: true,
    spravochniki: { ploshadka: PLOSHADKI, uroven: UROVNI_SBORA,
                    napravlenie: napravlenija },
                                                                      
                                                               
    v_zhurnal: ['nazvanie', 'ssylka', 'uroven', 'aktiven', 'vladelec',
                'napravlenie', 'proekt_id', 'ploshadka'],
    porjadok: 'porjadok',
    pered_udaleniem: (bylo,db) => {
      db.prepare("UPDATE zapuski_sbora SET uspeh=0,poluchen=0,primechanie='сбор отменён: аккаунт удалён',zaprosheno=COALESCE(zaprosheno,kogda),kogda=? WHERE akkaunt_id=? AND "+require('./sbor.js').PENDING).run(seichas(),bylo.id);
    },
    pered_zapisju: (d, db) => {
      require('./akkaunt-polja.js').validate(db,d);
                                                                     
                                                                        
                                                                  
      if (d.napravlenie && d.proekt_id) {
        const e = new Error('привязка одна: либо направление, либо проект');
        e.kod = 400;
        e.pole = 'proekt_id';
        throw e;
      }
      if (!d.napravlenie && !d.proekt_id) {
        const e = new Error('нужна привязка: направление или проект');
        e.kod = 400;
        e.pole = 'napravlenie';
        throw e;
      }
      if (d.aktiven === undefined) d.aktiven = 1;
      if (d.udalen === undefined) d.udalen = 0;
      if (d.porjadok === undefined) {
        const m = db.prepare('SELECT max(porjadok) m FROM akkaunty').get().m;
        d.porjadok = (m || 0) + 1;
      }

    },
    pered_pravkoj: (d, bylo, db, avtor, telo) => {
      require('./akkaunt-polja.js').validate(db,d,bylo);
      require('./versii.js').proverit(db,'akkaunty',bylo,telo.versija,['proekt_id','napravlenie','ploshadka']);
                                                                   
                                                              
      const napr = d.napravlenie !== undefined ? d.napravlenie : bylo.napravlenie;
      const proekt = d.proekt_id !== undefined ? d.proekt_id : bylo.proekt_id;
      if (napr && proekt) {
        const e = new Error('привязка одна: либо направление, либо проект');
        e.kod = 400;
        e.pole = 'proekt_id';
        throw e;
      }
      if (!napr && !proekt) {
        const e = new Error('нужна привязка: направление или проект');
        e.kod = 400;
        e.pole = 'napravlenie';
        throw e;
      }
      require('./akkaunt-zadachi.js').accountChange(db,d,bylo);
      if(d.aktiven===0&&bylo.aktiven!==0){
        db.prepare("UPDATE zapuski_sbora SET uspeh=0,poluchen=0,primechanie='сбор отменён: аккаунт остановлен',zaprosheno=COALESCE(zaprosheno,kogda),kogda=? WHERE akkaunt_id=? AND "+require('./sbor.js').PENDING).run(seichas(),bylo.id);
      }
    },
  },

                                                                          
                                                                           
                                                                       
                                                                    
  publikacii: {
    kljuch: 'id',
    objazatelno: ['akkaunt_id', 'publikacija_id'],
                                                                         
                                                                       
                                    
    udalenie: 'nasovsem',
    spravochniki: { format: FORMATY_PUBLIKACII },
                                                                     
                                                           
    v_zhurnal: ['ssylka', 'format', 'data_vyhoda'],
    pered_zapisju: (d, db) => {
                                                                        
                                                                       
      if (d.id === undefined || d.id === null || d.id === '') {
        d.id = `${d.akkaunt_id}_${d.publikacija_id}`;
      }
      const est = db.prepare('SELECT id FROM publikacii WHERE id = ?').get(d.id);
      if (est) {
        const e = new Error('такая публикация уже записана');
        e.kod = 409;
        e.dannye = { oshibka: 'publikacija_est', id: est.id };
        throw e;
      }
                                                                          
                                                          
      const akk = db.prepare('SELECT id FROM akkaunty WHERE id = ?').get(d.akkaunt_id);
      if (!akk) {
        const e = new Error('аккаунта нет');
        e.kod = 400;
        e.pole = 'akkaunt_id';
        throw e;
      }
                                                                      
                                                                    
      if (typeof d.zagolovok === 'string' && d.zagolovok.length > 300) {
        d.zagolovok = d.zagolovok.slice(0, 300);
      }
    },
    pered_pravkoj: (d) => {
      if (typeof d.zagolovok === 'string' && d.zagolovok.length > 300) {
        d.zagolovok = d.zagolovok.slice(0, 300);
      }
    },
  },

                                                                     
                                                                    
                                                         
  zamery_akkauntov: {
                                                                     
                                                                      
                                                                    
                                           
    kljuch: ['akkaunt_id', 'data'],
                                                                         
                                                                     
                                                              
    objazatelno: ['akkaunt_id'],
    v_zhurnal: [],
    porjadok: 'data',
    pered_zapisju: require('./snimki-akkaunta.js').podgotovit,
    povtornaja_zapis: require('./snimki-akkaunta.js').povtornaja,
  },

                                                                  
                                                                 
                                          
  zapuski_sbora: {
    objazatelno: ['akkaunt_id', 'uroven'],
                                                                      
                                                         
    udalenie: 'net',
    pochemu_ne_udaljaetsja: 'журнал сбора не удаляется: по нему разбираем, почему цифра не обновилась',
    spravochniki: { uroven: UROVNI_SBORA },
                                                                         
                                                 
    v_zhurnal: [],
    porjadok: 'kogda',
    pered_zapisju: (d) => {
      if (d.kogda === undefined) d.kogda = seichas();
                                                                    
                                                                      
                                                        
      if (d.uspeh === undefined) d.uspeh = 1;
      if (d.poluchen === undefined) d.poluchen = 0;
                                                                    
                                                   
      if (typeof d.primechanie === 'string' && d.primechanie.length > 400) {
        d.primechanie = d.primechanie.slice(0, 400);
      }
    },
  },
};

for(const tablica of ['materialy','dokumenty']){
  const rule=OPISANIJA[tablica],beforeCreate=rule.pered_zapisju,beforeEdit=rule.pered_pravkoj,beforeDelete=rule.pered_udaleniem;
  rule.v_zhurnal=[...new Set([...rule.v_zhurnal,'nazvanie','ssylka','fajl','chelovek_id','proekt_id','napravlenie',...(tablica==='materialy'?['zadacha_id']:[])])];
  const checkDate=value=>{
    const date=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00Z'):null;
    const upper=new Date(require('../db/db.js').segodnja()+'T12:00:00Z');upper.setUTCFullYear(upper.getUTCFullYear()+10);
    if(!date||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value||Number(value.slice(0,4))<1900||value>upper.toISOString().slice(0,10)){
      const error=new OshibkaVvoda('Дата документа: от 1900 года до текущей даты плюс 10 лет','data');error.dannye={kod:'data_vne_diapazona'};throw error;
    }
  };
  rule.pered_zapisju=(d,db,actor,related)=>{if(tablica==='dokumenty')checkDate(d.data);return beforeCreate?.(d,db,actor,related);};
  rule.pered_pravkoj=(d,old,db,actor)=>{
    require('./materialy-komandy.js').owner(old,actor);
    if(tablica==='dokumenty'){
      checkDate(d.data===undefined?old.data:d.data);
      if(!['chelovek_id','proekt_id','napravlenie'].some(k=>(d[k]===undefined?old[k]:d[k])!=null&&(d[k]===undefined?old[k]:d[k])!==''))throw new OshibkaVvoda('Нельзя снять последнюю привязку документа','chelovek_id');
    }
    return beforeEdit?.(d,old,db,actor);
  };
  rule.pered_udaleniem=(old,db,actor,options)=>{require('./materialy-komandy.js').owner(old,actor);return beforeDelete?.(old,db,actor,options);};
}
module.exports = { plashka_kasanija, konec_nedeli_ot, OPISANIJA, NAPRAVLENIJA, napravlenija, STATUSY_ZADACHI, TIPY_ZADACHI,
                   ROLI, STADII, VIDY_KONTAKTA, norma, norma_kontakta, podgotovit_znachenie_kontakta, proverit_znachenie_kontakta,
                   svobodnyj_nomer, PLOSHADKI, UROVNI_SBORA, METRIKI_AKKAUNTA,
                   FORMATY_PUBLIKACII, TIPY_LENTY, KODY_SHABLONOV,
                   zapert_li_period,
                                                                         
                                                                         
                                                                   
                   uvedomit, POTOKI, imja_cheloveka, kto_dobavil_slovami,
                   glagol_po_polu, CHTO_ETO,
};
