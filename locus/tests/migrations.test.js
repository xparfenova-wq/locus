const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

test('снимок перед миграцией сохраняет подтверждённые записи из WAL', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locus-migration-'));
  const file = path.join(dir, 'test.db');
  const env = { ...process.env, LOCUS_BAZA: file };
  const migrate = () => execFileSync(process.execPath, ['db/migrate.js'], {
    cwd: path.resolve(__dirname, '..'), env, stdio: 'pipe',
  });
  let writer;
  try {
    migrate();
    writer = new DatabaseSync(file);
    writer.exec('PRAGMA wal_autocheckpoint=0');
    writer.exec('CREATE TABLE backup_probe (value TEXT)');
    writer.prepare('INSERT INTO backup_probe VALUES (?)').run('committed only in WAL');
    assert.ok(fs.statSync(file + '-wal').size > 0);
    migrate();
    const backups = path.join(dir, 'bekapy/pered-migraciej');
    const snapshot = path.join(backups, fs.readdirSync(backups)[0]);
    const restored = new DatabaseSync(snapshot, { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT value FROM backup_probe').get().value, 'committed only in WAL');
      assert.equal(Object.values(restored.prepare('PRAGMA integrity_check').get())[0], 'ok');
    } finally { restored.close(); }
    assert.equal(fs.statSync(snapshot).mode & 0o777, 0o600);
  } finally {
    if (writer) writer.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('новая база получает ограничения статусов, нормализацию дат и поисковые индексы', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locus-rules-'));
  const file = path.join(dir, 'test.db');
  let db;
  try {
    execFileSync(process.execPath, ['db/migrate.js'], {
      cwd: path.resolve(__dirname, '..'), env: { ...process.env, LOCUS_BAZA: file }, stdio: 'pipe',
    });
    db = new DatabaseSync(file);
    const insert = db.prepare("INSERT INTO zadachi (nomer,nazvanie,status,sozdano,otvetstvennyj,napravlenie) VALUES (?,?,?,?,?,'synapt')");
    assert.throws(() => insert.run(1428, 'Неверный статус', 'not-a-status', '2026-10-23', 1), /status: одно из/);
    insert.run(1428, 'Правильный статус', 'v_plane', '2026-10-23T12:34:56.000Z', 1);
    assert.equal(db.prepare('SELECT sozdano FROM zadachi WHERE nomer=1428').get().sozdano, '2026-10-23 12:34:56');
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT id FROM zadachi WHERE otvetstvennyj=1').all();
    assert.ok(plan.some(row => /USING.*INDEX/.test(row.detail)), 'отбор по человеку использует индекс');
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n, 86);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name='zaprosy_planov_kampanij_delete'").get().n,1);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name='zaprosy_istochnikov_publikacij_udalenie'").get().n,1);
    for(const name of ['versii_tezisy_insert','versii_tezisy_update','versii_tezisy_delete'])assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name=?").get(name).n,1);
    for(const name of ['versii_nastroek_insert','versii_nastroek_update','versii_nastroek_delete'])assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name=?").get(name).n,1);
    assert.equal(['rassylka_ljudi', 'zadachi', 'sostojanija', 'zamery']
      .reduce((n, table) => n + db.prepare(`PRAGMA foreign_key_list(${table})`).all().length, 0), 5);
    db.exec('PRAGMA foreign_keys=ON');
    assert.throws(() => db.prepare('INSERT INTO zamery (rezultat_id,znachenie) VALUES (?,?)')
      .run(999999, 1), /FOREIGN KEY constraint failed/);
    db.exec("INSERT INTO ljudi (id,imja) VALUES (42,'Проверка состояния')");
    const state = db.prepare("INSERT INTO sostojanija (chelovek_id,den,resurs) VALUES (42,'2026-11-12',?)");
    state.run(50);
    assert.throws(() => state.run(60), /UNIQUE constraint failed/);
  } finally {
    if (db) db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ошибка в середине миграции откатывает SQL и не ставит отметку применения', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locus-migration-atomic-'));
  const work = path.join(dir, 'db');
  fs.mkdirSync(work);
  const original = path.resolve(__dirname, '../db');
  for (const file of ['migrate.js','puti.js','versii.js','versii-shagov.js','schema.sql','nachalnye.sql','pravila.sql']) {
    fs.copyFileSync(path.join(original,file), path.join(work,file));
  }
  fs.cpSync(path.join(original,'migracii'), path.join(work,'migracii'), { recursive: true });
  const file = path.join(dir, 'test.db');
  const migrate = () => execFileSync(process.execPath, [path.join(work,'migrate.js')], {
    env: { ...process.env, LOCUS_BAZA: file }, stdio: 'pipe',
  });
  let db;
  try {
    migrate();
    const probe = path.join(work,'migracii/999-atomic-test.sql');
    fs.writeFileSync(probe, 'CREATE TABLE atomic_probe(value TEXT);\n'
      + 'ALTER TABLE ljudi ADD COLUMN imja TEXT;\n'
      + 'ALTER TABLE ljudi ADD COLUMN migration_required TEXT;');
    assert.throws(migrate, /миграция 999-atomic-test.sql отменена/);
    db = new DatabaseSync(file);
    assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE nomer=999').get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='atomic_probe'").get().n, 0);
    assert.ok(!db.prepare('PRAGMA table_info(ljudi)').all().some(r => r.name==='migration_required'));
    db.close(); db = null;
    fs.writeFileSync(probe, 'CREATE TABLE atomic_probe(value TEXT);\n'
      + 'ALTER TABLE ljudi ADD COLUMN migration_required TEXT;');
    migrate();
    db = new DatabaseSync(file);
    assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE nomer=999').get().n, 1);
    assert.ok(db.prepare('PRAGMA table_info(ljudi)').all().some(r => r.name==='migration_required'));
  } finally {
    if (db) db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('применённый каталог неизменяем: хеш, имя, наличие и уникальный номер', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locus-migration-ledger-'));
  const work = path.join(dir, 'db');
  fs.mkdirSync(work);
  const original = path.resolve(__dirname, '../db');
  for (const name of ['migrate.js','puti.js','versii.js','versii-shagov.js','schema.sql','nachalnye.sql','pravila.sql']) {
    fs.copyFileSync(path.join(original,name),path.join(work,name));
  }
  fs.cpSync(path.join(original,'migracii'),path.join(work,'migracii'),{recursive:true});
  const file = path.join(dir,'test.db');
  const migrate = () => execFileSync(process.execPath,[path.join(work,'migrate.js')],{
    env:{...process.env,LOCUS_BAZA:file},stdio:'pipe',
  });
  try {
    migrate();
    const db = new DatabaseSync(file);
    assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE length(sha256)<>64 OR sha256 IS NULL').get().n,0);
    db.close();
    const first = fs.readdirSync(path.join(work,'migracii')).sort()[0];
    const applied = path.join(work,'migracii',first), text = fs.readFileSync(applied);
    fs.appendFileSync(applied,'\n-- edited after application\n');
    assert.throws(migrate,/изменена применённая миграция/);
    assert.ok(!fs.existsSync(path.join(dir,'bekapy')), 'отказ до снимка и изменения базы');
    fs.writeFileSync(applied,text);
    fs.renameSync(applied,applied+'.missing');
    assert.throws(migrate,/изменён каталог применённых/);
    fs.renameSync(applied+'.missing',applied);
    const duplicate=path.join(work,'migracii',first.slice(0,3)+'-duplicate.sql');
    fs.writeFileSync(duplicate,'SELECT 1;');
    assert.throws(migrate,/повтор номера миграции/);
    fs.unlinkSync(duplicate);
    migrate();
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
