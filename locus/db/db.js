                                                         
  
                                      
                                        
                                                     
                                     
                                     
                                                     

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const { BAZA: BD } = require('./puti.js');

let db = null;

function baza() {
  if (db) return db;
  if (!fs.existsSync(BD)) {
    throw new Error('базы нет, накати: node db/migrate.js');
  }
  db = new DatabaseSync(BD);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if(!db.prepare('PRAGMA table_info(zhurnal)').all().some(column=>column.name==='srez'))throw new Error('База не обновлена: запусти node db/migrate.js');
  db.function('locus_today', segodnja);
  db.function('locus_obschenie_moment',value=>require('../api/vremja-obschenija.js').prochitat(value)?.moment??null);
  db.function('locus_obschenie_den',value=>require('../api/vremja-obschenija.js').den(value));
                                                                   
                                                              
  db.function('locus_contains', (value, query) => {
    const norm = v => String(v ?? '').toLowerCase().replace(/ё/g, 'е');
    return norm(value).includes(norm(query)) ? 1 : 0;
  });
  return db;
}

                                                                 
const kesh_polej = new Map();

function polja(tablica) {
  if (kesh_polej.has(tablica)) return kesh_polej.get(tablica);
  const r = baza().prepare(`PRAGMA table_info(${tablica})`).all();
  if (!r.length) throw new Error(`таблицы ${tablica} нет`);
  const nabor = new Set(r.map((x) => x.name));
  kesh_polej.set(tablica, nabor);
  return nabor;
}

function est_pole(tablica, pole) {
  return polja(tablica).has(pole);
}

                                                    
const LOGICHESKIE = new Set([
  'jurlico', 'komanda', 'arhiv', 'aktiven', 'osnovnoj', 'povtorjaetsja',
  'publikacija', 'ne_v_itogi', 'udaleno', 'udalen', 'zakryt', 'zakryta',
  'gotovyj', 'obschij', 'prochitano', 'est_klienty', 'privodit_klientov',
  'tihie_chasy', 'bot_vkljuchen', 'panel_ljudej', 'zablokirovan',
  'pokazyvat_v_rejtinge_fokusa', 'zachtena', 'uspeh', 'kljuchevaja', 'ne_rabotaju',
]);

function v_api(stroka) {
                                                             
  if (!stroka) return stroka;
  const out = {};
  for (const [k, v] of Object.entries(stroka)) {
    out[k] = LOGICHESKIE.has(k) && v !== null ? v === 1 || v === true : v;
  }
  return out;
}

function v_bazu(znachenie, pole) {
                                                              
  if (LOGICHESKIE.has(pole)) {
    if (znachenie === true) return 1;
    if (znachenie === false) return 0;
    if (znachenie === null || znachenie === undefined) return znachenie;
    throw new OshibkaVvoda(`${pole}: true или false`, pole);
  }
  return znachenie;
}

class OshibkaVvoda extends Error {
  constructor(soobshchenie, pole) {
    super(soobshchenie);
    this.kod = 400;
    this.pole = pole;
  }
}

class NeNajdeno extends Error {
  constructor(soobshchenie) {
    super(soobshchenie || 'не найдено');
    this.kod = 404;
  }
}

class Konflikt extends Error {
  constructor(soobshchenie, dannye) {
    super(soobshchenie);
    this.kod = 409;
    this.dannye = dannye;
  }
}

class NetDostupa extends Error {
  constructor(soobshchenie) {
    super(soobshchenie || 'нет доступа');
    this.kod = 403;
  }
}

                                                           
                                                               
                                                
  
                                                           
                                                  
function seichas() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

                                                             
                                                               
                                                 
const MOSCOW_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow',
  year: 'numeric', month: '2-digit', day: '2-digit' });
function segodnja(now = new Date()) {
  const parts = MOSCOW_DAY.formatToParts(now);
  const values = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nomer_nedeli(data) {
  return require('../api/kalendar.js').iso_nedelja(data).nomer;
}

                                                        
                                                         
                                                             
                                         
let nomer_tranzakcii = 0;
function v_odnoj_tranzakcii(db, chto_delat) {
                                                                         
  const imja = `locus_${++nomer_tranzakcii}`;
  db.exec(`SAVEPOINT ${imja}`);
  try {
    const itog = chto_delat();
    db.exec(`RELEASE SAVEPOINT ${imja}`);
    return itog;
  } catch (e) {
    try {
      db.exec(`ROLLBACK TO SAVEPOINT ${imja}`);
      db.exec(`RELEASE SAVEPOINT ${imja}`);
    } catch {                                             }
    throw e;
  }
}

module.exports = { seichas, segodnja, nomer_nedeli,
  baza, polja, est_pole, v_api, v_bazu, LOGICHESKIE,
  OshibkaVvoda, NeNajdeno, Konflikt, NetDostupa, v_odnoj_tranzakcii };
