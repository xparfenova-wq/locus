                                                     
  
                                                                 
                                                                   
                                       

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const KORJEN = __dirname;
const { BAZA: BD, SHEMA, NACHALNYE, MIGRACII, PRAVILA } = require('./puti.js');

function snimok() {
                                                      
  if (!fs.existsSync(BD)) return null;
  const metka = new Date().toISOString().replace(/[:.]/g, '-');
  const papka = path.join(path.dirname(BD), 'bekapy', 'pered-migraciej');
  fs.mkdirSync(papka, { recursive: true, mode: 0o700 });
  const kuda = path.join(papka, `locus-${metka}-${require('node:crypto').randomUUID()}.db`);
  const ishodnaja = new DatabaseSync(BD, { readOnly: true });
  try {
                                                                  
    ishodnaja.prepare('VACUUM INTO ?').run(kuda);
  } finally {
    ishodnaja.close();
  }
  fs.chmodSync(kuda, 0o600);
  return kuda;
}

function nakatit() {
                                                                     
                                                      
  const katalog = new Map();
  for (const imja of fs.existsSync(MIGRACII) ? fs.readdirSync(MIGRACII).filter(f => f.endsWith('.sql')).sort() : []) {
    const match = imja.match(/^(\d{3})-[\w-]+\.sql$/);
    if (!match || Number(match[1]) < 1) throw new Error(`неверное имя миграции: ${imja}`);
    const nomer = Number(match[1]);
    if (katalog.has(nomer)) throw new Error(`повтор номера миграции ${nomer}`);
    const sql = fs.readFileSync(path.join(MIGRACII, imja), 'utf8');
    katalog.set(nomer, { imja, sql, sha256: crypto.createHash('sha256').update(sql).digest('hex') });
  }
  const bylo = fs.existsSync(BD);
  if (bylo) {
    const check = new DatabaseSync(BD, { readOnly: true });
    try {
      const table = check.prepare("SELECT name FROM sqlite_master WHERE name='migracii'").get();
      if (table) for (const applied of check.prepare('SELECT * FROM migracii').all()) {
        const file = katalog.get(applied.nomer);
        if (!file || file.imja !== applied.imja) throw new Error(`изменён каталог применённых миграций: ${applied.nomer}`);
        if (applied.sha256 && applied.sha256 !== file.sha256) {
          throw new Error(`изменена применённая миграция: ${applied.imja}`);
        }
      }
    } finally { check.close(); }
    const s = snimok();
    console.log(`снимок: ${path.basename(s)}`);
  }

  const db = new DatabaseSync(BD);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  db.exec(fs.readFileSync(SHEMA, 'utf8'));

  db.exec(`CREATE TABLE IF NOT EXISTS migracii (
    nomer   INTEGER PRIMARY KEY,
    imja    TEXT NOT NULL,
    nakacheno TEXT NOT NULL,
    sha256 TEXT
  )`);
                                                                       
                                                                             
  if (!db.prepare('PRAGMA table_info(migracii)').all().some(p => p.name === 'sha256')) {
    db.exec('ALTER TABLE migracii ADD COLUMN sha256 TEXT');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const applied of db.prepare('SELECT nomer FROM migracii WHERE sha256 IS NULL').all()) {
      db.prepare('UPDATE migracii SET sha256=? WHERE nomer=?').run(katalog.get(applied.nomer).sha256, applied.nomer);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

                                                                            
                                                                     
                                                                       
                                                         
  const svezhaja = !bylo;

  let primeneno = 0;
                                                                        
                                                                 
  if (fs.existsSync(NACHALNYE)) {
    db.exec(fs.readFileSync(NACHALNYE, 'utf8'));
  }

  if (fs.existsSync(MIGRACII)) {
    const est = new Set(
      db.prepare('SELECT nomer FROM migracii').all().map((r) => r.nomer)
    );
    for (const [nomer, file] of katalog) {
      const f = file.imja;
      if (est.has(nomer)) continue;
      const sql = file.sql;
                                                               
                                                     
      const rebuild = !svezhaja && /^PRAGMA\s+foreign_keys\s*=\s*OFF\s*;/im.test(sql);
      if (rebuild) db.exec('PRAGMA foreign_keys=OFF');
      db.exec('BEGIN IMMEDIATE');
      try {
        if (!svezhaja) db.exec(sql);
        if (db.prepare('PRAGMA foreign_key_check').all().length) {
          throw new Error(`нарушены связи после ${f}`);
        }
        db.prepare('INSERT INTO migracii (nomer, imja, nakacheno, sha256) VALUES (?, ?, ?, ?)')
          .run(nomer, f, new Date().toISOString(), file.sha256);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw new Error(`миграция ${f} отменена: ${e.message}`, { cause: e });
      } finally {
        if (rebuild) db.exec('PRAGMA foreign_keys=ON');
      }
      console.log(svezhaja ? `учтена без наката: ${f}` : `накатана ${f}`);
      primeneno += 1;
    }
  }

                                                                  
                                                                      
                                                                       
  db.exec(fs.readFileSync(PRAVILA, 'utf8'));
                                                                              
                                                                                
  db.exec(`INSERT INTO schetchiki_anket(chelovek_id,poslednjaja_versija)
    SELECT chelovek_id,max(1,COALESCE(versija,1)) FROM anketa WHERE 1
    ON CONFLICT(chelovek_id) DO UPDATE SET poslednjaja_versija=max(schetchiki_anket.poslednjaja_versija,excluded.poslednjaja_versija)`);
  require('./versii.js').ustanovit(db);

  const tablic = db.prepare(
    `SELECT count(*) k FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
  ).get().k;

  console.log(`таблиц: ${tablic}, миграций ${svezhaja ? "учтено" : "накатано"}: ${primeneno}`);
  db.close();
}

nakatit();
