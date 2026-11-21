                                                                          
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, scryptSync } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const dir = mkdtempSync(path.join(tmpdir(), 'locus-auth-'));
const file = path.join(dir, 'test.db');
const key = randomBytes(32).toString('hex');
const password = 'only-a-test-password';
const first = 100001, second = 100002;
let child, db, base, testEnv;

async function startServer() {
  child = spawn(process.execPath, ['server.js'],
    { cwd: root, env: testEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('сервер не запустился')), 10000);
    let text = '';
    child.once('error', reject);
    child.once('exit', code => reject(new Error('сервер завершился: ' + code)));
    child.stdout.on('data', chunk => {
      text += String(chunk);
      const ready = text.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (ready) { clearTimeout(timeout); resolve(ready[0]); }
    });
  });
}

async function request(url, options = {}) {
  return fetch(base + url, { redirect: 'manual', ...options });
}
function post(body, headers = {}) {
  return { method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body) };
}
async function login() {
  const res = await request('/api/vhod/parol', post({ login: 'auth-test', parol: password }));
  assert.equal(res.status, 200, res.status === 200 ? '' : await res.clone().text());
  return { res, cookie: res.headers.get('set-cookie').split(';')[0] };
}

before(async () => {
  const env = { ...process.env, LOCUS_BAZA: file, NODE_ENV: 'production',
    LOCUS_FAJLY: path.join(dir,'fajly'),
    LOCUS_SERVICE_KEY: key, LOCUS_TEST_AUTH: '0', LOCUS_RAZRABOTKA: '1',
    LOCUS_ADMIN_IDS: String(first), PORT: '0' };
  testEnv = env;
  execFileSync(process.execPath, ['db/migrate.js'], { cwd: root, env, stdio: 'pipe' });
  db = new DatabaseSync(file);
  const salt = randomBytes(16).toString('hex');
  const hash = salt + ':' + scryptSync(password, salt, 64).toString('hex');
  for (const id of [first, second]) {
    db.prepare('INSERT INTO ljudi (id, imja, imja_norm, komanda, dostup, versija) VALUES (?, ?, ?, 1, ?, 1)')
      .run(id, 'Test ' + id, 'test ' + id, 'polnyj');
    db.prepare('INSERT INTO vhod (chelovek_id, login, parol_hesh, zablokirovan) VALUES (?, ?, ?, 0)')
      .run(id, id === first ? 'auth-test' : 'other-test', hash);
  }
  await startServer();
});

test('вложения не читают соседнюю папку с похожим именем и внешние симлинки', async () => {
  const { cookie } = await login();
  const uploads=path.join(dir,'fajly'), neighbor=path.join(dir,'fajly-secret');
  mkdirSync(uploads,{recursive:true});mkdirSync(neighbor,{recursive:true});
  writeFileSync(path.join(neighbor,'marker.txt'),'private fixture marker');
  writeFileSync(path.join(uploads,'regular.txt'),'allowed attachment');
  symlinkSync(path.join(neighbor,'marker.txt'),path.join(uploads,'outside.txt'));
  assert.equal((await request('/fajly/regular.txt',{headers:{cookie}})).status,200);
  for(const url of ['/fajly/..%2Ffajly-secret%2Fmarker.txt','/fajly/outside.txt']){
    const response=await request(url,{headers:{cookie}});
    assert.equal(response.status,404,url);
    assert.ok(!(await response.text()).includes('private fixture marker'));
  }
});

test('повреждённая cookie не превращает отказ входа в серверную ошибку', async () => {
  const cookie='locus-sessija=%E0%A4%A';
  assert.equal((await request('/api/zadachi',{headers:{cookie}})).status,401);
  const logout=await request('/api/vhod/vyjti',post({}, {cookie}));
  assert.equal(logout.status,200);
  assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});

test('полный доступ к деньгам не позволяет назначать себе или другим права', async () => {
  const res = await request('/api/vhod/parol', post({ login: 'other-test', parol: password }));
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const body = { versija: 1, dostup: 'bez_deneg' };
  for (const url of ['/api/ljudi/' + first, '/api/ljudi/' + first + '/dostup']) {
    assert.equal((await request(url, { ...post(body, { cookie }), method: 'PATCH' })).status, 403);
  }
  assert.equal((await request('/api/ljudi', post({ imja: 'Новый доступ', dostup: 'polnyj' }, { cookie }))).status, 403);
  const owner = await login();
  assert.equal((await request('/api/ljudi/' + second + '/dostup', {
    ...post({ dostup: 'bez_deneg' }, { cookie: owner.cookie }), method: 'PATCH',
  })).status, 200);
  const version = db.prepare('SELECT versija FROM ljudi WHERE id=?').get(second).versija;
  for (const url of ['/api/ljudi/' + second, '/api/ljudi/' + second + '/dostup']) {
    assert.equal((await request(url, {
      ...post({ versija: version, dostup: 'polnyj' }, { cookie }), method: 'PATCH',
    })).status, 403);
  }
  assert.equal(db.prepare('SELECT dostup FROM ljudi WHERE id=?').get(second).dostup, 'bez_deneg');
});

after(async () => {
  if (child && child.exitCode === null) {
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await stopped;
  }
  if (db) db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('анонимное чтение, поддельный автор и файлы закрыты', async () => {
  for (const url of ['/api/ljudi', '/api/zadachi', '/api/sessii', '/fajly/proba.txt']) {
    assert.equal((await request(url)).status, 401, url);
    assert.equal((await request(url, { headers: { 'x-locus-chelovek': first } })).status, 401, url);
  }
  assert.equal((await request('/api/ljudi', post({ imja: 'не создавать' },
    { 'x-locus-chelovek': first }))).status, 401);
});

test('вход и его ресурсы открыты, рабочие страницы требуют сессию', async () => {
  for (const url of ['/login', '/vhod.html', '/css/obschij.css', '/js/api.js', '/healthz']) {
    assert.equal((await request(url)).status, 200, url);
  }
  for (const url of ['/prostranstvo.html', '/js/dannye.js', '/foto/demo-member.jpg']) {
    const res = await request(url);
    assert.equal(res.status, 302, url);
    assert.match(res.headers.get('location'), /^\/login\?next=/);
  }
});

test('страницы разрешают только свои скрипты с одноразовым nonce', async () => {
  const firstPage = await request('/login');
  const policy = firstPage.headers.get('content-security-policy');
  assert.match(policy, /script-src 'nonce-[^']+' 'strict-dynamic'/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  const html = await firstPage.text();
  const nonce = policy.match(/nonce-([^']+)/)[1];
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);
  assert.ok(scripts.length >= 3);
  assert.ok(scripts.every(tag => tag.includes(`nonce="${nonce}"`)));
  assert.equal(firstPage.headers.get('cache-control'), 'no-store');
  const secondPage = await request('/login');
  assert.notEqual(secondPage.headers.get('content-security-policy'), policy);
  for (const path of ['/js/vendor/purify.min.js', '/js/bezopasnyj-html.js']) {
    assert.equal((await request(path)).status, 200);
  }
});

test('параметр и заголовок не позволяют назвать себя вошедшим', async () => {
  const res = await request('/api/vhod?chelovek_id=' + first,
    { headers: { 'x-locus-chelovek': first } });
  assert.deepEqual(await res.json(), { voshel: false });
});

test('отладочная настройка не выдаёт ссылку для обхода пароля', async () => {
  for (const url of ['/api/vhod', '/api/vhod/proverit']) {
    const res = await request(url, post({ pochta: 'test@example.com', kod: 'test' }));
    assert.equal(res.status, 404);
    assert.equal((await res.json()).ssylka, undefined);
  }
});

test('пароль создаёт защищённую cookie, которая открывает API', async () => {
  const { res, cookie } = await login();
  const header = res.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=2592000']) {
    assert.ok(header.includes(flag), flag);
  }
  assert.equal((await res.json()).sessija, undefined);
  assert.equal((await request('/api/ljudi', { headers: { cookie } })).status, 200);
  assert.equal((await request('/prostranstvo.html', { headers: { cookie } })).status, 200);
});

test('личность и сессии нельзя переключить параметром запроса', async () => {
  const { cookie } = await login();
  const headers = { cookie, 'x-locus-chelovek': second };
  const res = await request('/api/vhod?chelovek_id=' + second, { headers });
  assert.equal((await res.json()).chelovek.id, first);
  const sessions = await request('/api/sessii?chelovek_id=' + second, { headers });
  assert.ok((await sessions.json()).spisok.every(s => s.chelovek_id === first));
});

test('внешняя страница не может отправить действие с чужой сессией', async () => {
  const { cookie } = await login();
  assert.equal((await request('/api/ljudi', post({ imja: 'не создавать' },
    { cookie, origin: 'https://another.example' }))).status, 403);
});

test('блокировка учётной записи закрывает уже выданную сессию', async () => {
  const { cookie } = await login();
  db.prepare('UPDATE vhod SET zablokirovan=1 WHERE chelovek_id=?').run(first);
  try {
    assert.equal((await request('/api/ljudi', { headers: { cookie } })).status, 401);
  } finally {
    db.prepare('UPDATE vhod SET zablokirovan=0 WHERE chelovek_id=?').run(first);
  }
});

test('просроченная сессия закрыта', async () => {
  const { cookie } = await login();
  db.prepare('UPDATE sessii SET istekaet=? WHERE id=?').run('2000-01-01T00:00:00Z', cookie.split('=')[1]);
  assert.equal((await request('/api/ljudi', { headers: { cookie } })).status, 401);
});

test('выход завершает только свою сессию и очищает cookie', async () => {
  const { cookie } = await login();
  const other = randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO sessii (id, chelovek_id, istekaet) VALUES (?, ?, ?)')
    .run(other, second, '2099-01-01T00:00:00Z');
  const res = await request('/api/vhod/vyjti?sessija=' + other,
    post({ sessija: other }, { cookie }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  assert.ok(db.prepare('SELECT 1 FROM sessii WHERE id=?').get(other));
  assert.equal((await request('/api/ljudi', { headers: { cookie } })).status, 401);
});

test('служебный ключ не открывает людей и задачи', async () => {
  const headers = { 'x-locus-service-key': key, 'x-locus-chelovek': first };
  assert.equal((await request('/api/napravlenija', { headers })).status, 200);
  assert.equal((await request('/api/ljudi', { headers })).status, 401);
  assert.equal((await request('/api/zadachi', { headers })).status, 401);
  assert.equal((await request('/api/napravlenija', {
    headers: { ...headers, 'x-locus-service-key': 'wrong' } })).status, 401);
});

test('частые попытки пароля ограничены, другой адрес может войти', async () => {
  const headers = { 'x-real-ip': '192.0.2.10' };
  for (let n = 0; n < 20; n += 1) {
    assert.equal((await request('/api/vhod/parol', post({ login: 'missing', parol: 'wrong' }, headers))).status, 401);
  }
  const blocked = await request('/api/vhod/parol', post({ login: 'missing', parol: 'wrong' }, headers));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await request('/api/vhod/parol', post({ login: 'auth-test', parol: password },
    { 'x-real-ip': '192.0.2.11' }))).status, 200);
});

test('настройки сохраняются своему пользователю и проверяют значения', async () => {
  const { cookie } = await login();
  const patch = body => ({ ...post(body, { cookie }), method: 'PATCH' });
  const settings = { chi_zadachi: 'vse', startovyj_ekran: 'planerka',
    bot_sobytija: { prosrochki: false }, prioritetnoe_napravlenie: 'synapt' };
  const saved = await request('/api/nastrojki?chelovek_id=' + second, patch(settings));
  assert.equal(saved.status, 200);
  const loaded = await (await request('/api/nastrojki', { headers: { cookie } })).json();
  for (const [key, value] of Object.entries(settings)) assert.deepEqual(loaded[key], value);
  assert.equal(db.prepare('SELECT count(*) n FROM nastrojki WHERE chelovek_id=?').get(second).n, 0);
  for (const invalid of [{ chi_zadachi: 'any' }, { startovyj_ekran: 'external' },
    { bot_sobytija: { prosrochki: 'yes' } }, { svoi_cveta: '{broken' },
    { prioritetnoe_napravlenie: 'missing-direction' }, { prioritetnoe_napravlenie: {} }]) {
    assert.equal((await request('/api/nastrojki', patch(invalid))).status, 400);
  }
});

test('задача хранит существующего ответственного по номеру, имя не принимается', async () => {
  const { cookie } = await login();
  const task = { nazvanie: 'Проверка связи', napravlenie: 'synapt', otvetstvennyj: first };
  for (const invalid of ['Кто-то', 999999999]) {
    const res = await request('/api/zadachi', post({ ...task, otvetstvennyj: invalid }, { cookie }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).pole, 'otvetstvennyj');
  }
  const created = await request('/api/zadachi', post(task, { cookie }));
  assert.equal(created.status, 201);
  const saved = await created.json();
  assert.equal(saved.otvetstvennyj, first);
  const bad = await request('/api/zadachi/' + saved.nomer, {
    ...post({ versija: saved.versija, otvetstvennyj: 'Другой' }, { cookie }), method: 'PATCH',
  });
  assert.equal(bad.status, 400);
  assert.equal(db.prepare('SELECT otvetstvennyj FROM zadachi WHERE id=?').get(saved.id).otvetstvennyj, first);
});

test('ошибка журнала не оставляет частично созданную или изменённую задачу', async () => {
  const { cookie } = await login();
  const task = { nazvanie: 'Проверка атомарности', napravlenie: 'synapt', otvetstvennyj: first };
  const created = await request('/api/zadachi', post(task, { cookie }));
  assert.equal(created.status, 201);
  const saved = await created.json();
  const count = db.prepare('SELECT count(*) n FROM zadachi').get().n;
  db.exec("CREATE TRIGGER audit_test_failure BEFORE INSERT ON zhurnal WHEN NEW.obekt='zadacha' BEGIN SELECT raise(ABORT,'audit_test_failure'); END");
  try {
    assert.equal((await request('/api/zadachi', post(task, { cookie }))).status, 500);
    assert.equal(db.prepare('SELECT count(*) n FROM zadachi').get().n, count);
    assert.equal((await request('/api/zadachi/' + saved.nomer, {
      ...post({ versija: saved.versija, status: 'v_processe' }, { cookie }), method: 'PATCH',
    })).status, 500);
    const unchanged = db.prepare('SELECT * FROM zadachi WHERE id=?').get(saved.id);
    assert.equal(unchanged.nazvanie, task.nazvanie);
    assert.equal(unchanged.status, saved.status);
    assert.equal(unchanged.versija, saved.versija);
    assert.equal((await request('/api/zadachi/' + saved.nomer, {
      ...post({ versija: saved.versija }, { cookie }), method: 'DELETE',
    })).status, 500);
    assert.equal(db.prepare('SELECT udaleno FROM zadachi WHERE id=?').get(saved.id).udaleno, 0);
  } finally {
    db.exec('DROP TRIGGER audit_test_failure');
  }
});

test('перезапуск сохраняет задачу и уже выданный вход', async () => {
  const { cookie } = await login();
  const created = await request('/api/zadachi', post({
    nazvanie: 'Сохранить после перезапуска', napravlenie: 'synapt', otvetstvennyj: first,
  }, { cookie }));
  assert.equal(created.status, 201);
  const saved = await created.json();
  const stopped = new Promise(resolve => child.once('exit', code => resolve(code)));
  child.kill('SIGTERM');
  assert.equal(await stopped, 0);
  await startServer();
  const identity = await request('/api/vhod', { headers: { cookie } });
  assert.equal((await identity.json()).chelovek.id, first);
  const task = await request('/api/zadachi/' + saved.nomer, { headers: { cookie } });
  assert.equal(task.status, 200);
  assert.equal((await task.json()).nazvanie, saved.nazvanie);
});

test('любой участник активирует цель, удалить анкету может только её хозяин', async () => {
  const owner = await login();
  const otherLogin = await request('/api/vhod/parol', post({ login: 'other-test', parol: password }));
  const cookie = otherLogin.headers.get('set-cookie').split(';')[0];
  const goal = await request('/api/celi', post({ nazvanie: 'Черновик команды', napravlenie: 'synapt', sostojanie: 'chernovik' }, { cookie }));
  assert.equal(goal.status, 201);
  const saved = await goal.json();
  assert.equal((await request('/api/celi', post({ nazvanie: 'Активная цель команды', napravlenie: 'synapt', sostojanie: 'aktivna' }, { cookie }))).status, 201);
  const activate = { ...post({ versija: saved.versija, sostojanie: 'aktivna' }, { cookie }), method: 'PATCH' };
  assert.equal((await request('/api/celi/' + saved.id, activate)).status, 200);
  assert.equal((await request('/api/anketa', post({ chelovek_id: first, missija: 'Свой рассказ' }, { cookie: owner.cookie }))).status, 200);
  assert.equal((await request('/api/anketa/' + first, { method: 'DELETE', headers: { cookie } })).status, 403);
  assert.equal(db.prepare('SELECT missija FROM anketa WHERE chelovek_id=?').get(first).missija, 'Свой рассказ');
  assert.equal((await request('/api/anketa/' + first, { method: 'DELETE', headers: { cookie: owner.cookie } })).status, 200);
});

test('владелец блокирует вход одним запросом вместе со всеми сессиями', async () => {
  const owner = await login();
  const otherLogin = await request('/api/vhod/parol', post({ login: 'other-test', parol: password }));
  const cookie = otherLogin.headers.get('set-cookie').split(';')[0];
  const block = { ...post({ zablokirovan: true }, { cookie }), method: 'PATCH' };
  assert.equal((await request('/api/vhod/' + first, block)).status, 403);
  const before = db.prepare('SELECT count(*) n FROM zadachi WHERE otvetstvennyj=?').get(second).n;
  try {
    assert.equal((await request('/api/vhod/' + second, {
      ...block, headers: { ...block.headers, cookie: owner.cookie },
    })).status, 200);
    assert.equal(db.prepare('SELECT count(*) n FROM sessii WHERE chelovek_id=?').get(second).n, 0);
    assert.equal((await request('/api/zadachi', { headers: { cookie } })).status, 401);
    assert.equal((await request('/api/vhod/parol', post({ login: 'other-test', parol: password }))).status, 403);
    assert.equal(db.prepare('SELECT count(*) n FROM zadachi WHERE otvetstvennyj=?').get(second).n, before);
  } finally {
    db.prepare('UPDATE vhod SET zablokirovan=0 WHERE chelovek_id=?').run(second);
  }
});

test('повторное сохранение состояния обновляет сегодняшнюю запись', async () => {
  const { cookie } = await login();
  const today = db.prepare("SELECT date('now','+3 hours') den"), expected = new Map();
  for (const resurs of [50, 65]) {
    const before = today.get().den;
    const response = await request('/api/sostojanija', post({ nastroenie: 3, resurs }, { cookie }));
    assert.equal(response.status, 200);
    const row = await response.json(), after = today.get().den;
    assert.ok([before, after].includes(row.den), 'состояние относится к московскому дню');
    expected.set(row.den, resurs);
  }
                                                                        
                                                                      
  for (const [day, resurs] of expected) {
    const rows = db.prepare('SELECT resurs FROM sostojanija WHERE chelovek_id=? AND den=?').all(first, day);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].resurs, resurs);
  }
});

test('повторный вход ограничен участником открытой страницы и не меняет cookie при отказе', async () => {
  const headers={'x-real-ip':'renewal-boundaries-fixture'};
  const before=db.prepare('SELECT count(*) n FROM sessii').get().n;
  const last=db.prepare('SELECT poslednij_vhod FROM vhod WHERE chelovek_id=?').get(second).poslednij_vhod;
  for(const value of [null,'100001',0,-1,1.5,true]){
    const r=await request('/api/vhod/parol',post({login:'auth-test',parol:password,prodlit_dlja:value},headers));assert.equal(r.status,400);assert.equal(r.headers.get('set-cookie'),null);
  }
  const wrong=await request('/api/vhod/parol',post({login:'other-test',parol:password,prodlit_dlja:first},headers));assert.equal(wrong.status,409);assert.equal(wrong.headers.get('set-cookie'),null);
  assert.equal(db.prepare('SELECT count(*) n FROM sessii').get().n,before);assert.equal(db.prepare('SELECT poslednij_vhod FROM vhod WHERE chelovek_id=?').get(second).poslednij_vhod,last);
  const bad=await request('/api/vhod/parol',post({login:'auth-test',parol:'wrong',prodlit_dlja:first},headers));assert.equal(bad.status,401);assert.equal(bad.headers.get('set-cookie'),null);
  const own=await request('/api/vhod/parol',post({login:'auth-test',parol:password,prodlit_dlja:first},headers));assert.equal(own.status,200);assert.equal((await own.json()).chelovek.id,first);assert.match(own.headers.get('set-cookie'),/HttpOnly/);assert.match(own.headers.get('set-cookie'),/Secure/);
  assert.equal(db.prepare('SELECT count(*) n FROM sessii').get().n,before+1);
});

test('сбой отметки входа откатывает созданную сессию целиком', async () => {
  const before=db.prepare('SELECT count(*) n FROM sessii').get().n;
  const last=db.prepare('SELECT poslednij_vhod FROM vhod WHERE chelovek_id=?').get(first).poslednij_vhod;
  db.exec(`CREATE TRIGGER fixture_login_failure BEFORE UPDATE OF poslednij_vhod ON vhod WHEN NEW.chelovek_id=${first} BEGIN SELECT RAISE(ABORT,'fixture login failure'); END`);
  try{
    const response=await request('/api/vhod/parol',post({login:'auth-test',parol:password,prodlit_dlja:first},{'x-real-ip':'renewal-atomic-fixture'}));assert.equal(response.status,500);assert.equal(response.headers.get('set-cookie'),null);
    assert.equal(db.prepare('SELECT count(*) n FROM sessii').get().n,before);assert.equal(db.prepare('SELECT poslednij_vhod FROM vhod WHERE chelovek_id=?').get(first).poslednij_vhod,last);
  }finally{db.exec('DROP TRIGGER fixture_login_failure');}
});

test('истёкшая сессия не создаёт задачу, повторный вход разрешает только явный новый запрос', async () => {
  const headers={'x-real-ip':'renewal-expired-fixture'};
  const signed=await request('/api/vhod/parol',post({login:'auth-test',parol:password},headers));assert.equal(signed.status,200);const oldCookie=signed.headers.get('set-cookie').split(';')[0];
  db.prepare("UPDATE sessii SET istekaet='2000-01-01T00:00:00.000Z' WHERE id=?").run(oldCookie.slice('locus-sessija='.length));
  const data={nazvanie:'Явное сохранение после повторного входа',napravlenie:'synapt',otvetstvennyj:first},count=()=>db.prepare('SELECT count(*) n FROM zadachi WHERE nazvanie=?').get(data.nazvanie).n;
  assert.equal((await request('/api/zadachi',post(data,{cookie:oldCookie}))).status,401);assert.equal(count(),0);
  const renewed=await request('/api/vhod/parol',post({login:'auth-test',parol:password,prodlit_dlja:first},headers));assert.equal(renewed.status,200);assert.equal(count(),0);
  const response=await request('/api/zadachi',post(data,{cookie:renewed.headers.get('set-cookie').split(';')[0]}));assert.equal(response.status,201);const task=await response.json();assert.equal(count(),1);assert.equal(task.otvetstvennyj,first);
  const actor=db.prepare("SELECT kto FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? ORDER BY id LIMIT 1").get(task.id);assert.equal(actor.kto,first);
});
