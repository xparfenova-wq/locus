                                                                             
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locus-suite-'));
  const env = { ...process.env, LOCUS_BAZA: path.join(dir, 'test.db'), LOCUS_FAJLY: path.join(dir,'fajly'),
    LOCUS_TEST_AUTH: '1', LOCUS_ADMIN_IDS: '2', LOCUS_GRAFIK_ADMIN_IDS: '2', NODE_ENV: 'test',
    LOCUS_KLJUCH_SBORA:'fixture-collector-key-000000000001' };
  let server;
  try {
    const migration = spawnSync(process.execPath, ['db/migrate.js'],
      { cwd: root, env, encoding: 'utf8' });
    if (migration.status !== 0) throw new Error(migration.stdout + migration.stderr);
                                                                             
                                                                              
    const { DatabaseSync } = require('node:sqlite');
    const fixture = new DatabaseSync(env.LOCUS_BAZA);
    try {
      fixture.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(1,'API suite performer',1,'polnyj',1),(2,'API suite owner',1,'polnyj',1)").run();
    }
    finally { fixture.close(); }
    server = spawn(process.execPath, ['-e',
      "const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('тестовый сервер не запустился')), 10000);
      server.once('error', reject);
      server.once('exit', code => reject(new Error('тестовый сервер завершился: ' + code)));
      server.stdout.once('data', data => { clearTimeout(timer); resolve(String(data).trim()); });
    });
    process.exitCode = await new Promise((resolve, reject) => {
      const tests = spawn(process.execPath, ['tests/run.js'], {
        cwd: root, env: { ...env, LOCUS: 'http://127.0.0.1:' + port }, stdio: 'inherit',
      });
      tests.once('error', reject);
      tests.once('exit', code => resolve(code ?? 1));
    });
  } finally {
    if (server && server.exitCode === null) {
      const stopped = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await stopped;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
