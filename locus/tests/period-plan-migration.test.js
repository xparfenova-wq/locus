const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
test('period plan migration is additive and fresh/upgraded databases enforce the same constraints',()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-period-plan-migration-'));
 const digest=text=>createHash('sha256').update(text).digest('hex'),priorSchema=fs.readFileSync(path.join(root,'db/schema.sql'),'utf8').split('\n\nCREATE TABLE IF NOT EXISTS plany_periodov_okr (')[0]+'\n';assert.equal(digest(priorSchema),'170d8b4e291e09cc7801c53444db4c7a17d45e3c0a6a628d8bf27efd63d17df6');const old=name=>name==='db/schema.sql'?priorSchema:fs.readFileSync(path.join(root,name),'utf8');let db;
 try{
  const file=path.join(folder,'upgraded.db');db=new DatabaseSync(file);db.exec(old('db/schema.sql'));db.exec(old('db/nachalnye.sql'));db.exec(old('db/pravila.sql'));db.exec('CREATE TABLE migracii(nomer INTEGER PRIMARY KEY,imja TEXT NOT NULL,nakacheno TEXT NOT NULL,sha256 TEXT)');
  for(const name of fs.readdirSync(path.join(root,'db/migracii')).filter(n=>/^\d{3}-.*\.sql$/.test(n)&&Number(n.slice(0,3))<=144))db.prepare('INSERT INTO migracii(nomer,imja,nakacheno,sha256)VALUES(?,?,?,?)').run(Number(name.slice(0,3)),name,'2026-11-20T00:00:00Z',digest(old('db/migracii/'+name)));
  db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(9900991,'Synthetic migration witness',1,'polnyj',1)").run();
  db.prepare("INSERT INTO celi(id,nazvanie,napravlenie,period_id,sostojanie)VALUES(9900991,'Synthetic untouched legacy goal','synapt',2026,'aktivna')").run();
  db.prepare("INSERT INTO rezultaty(id,cel_id,nazvanie,plan,baza,istochnik)VALUES(9900991,9900991,'Synthetic untouched metric',500,0,'ruchnoj_zamer')").run();
  require('../db/versii.js').ustanovit(db);
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all(),before=new Map(tables.map(t=>[t.name,JSON.stringify(db.prepare('SELECT rowid,* FROM "'+t.name+'" ORDER BY rowid').all())]));db.close();db=null;
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env:{...process.env,LOCUS_BAZA:file},stdio:'pipe'});db=new DatabaseSync(file);
  for(const table of tables){assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table.name).sql,table.sql);if(table.name!=='migracii')assert.equal(JSON.stringify(db.prepare('SELECT rowid,* FROM "'+table.name+'" ORDER BY rowid').all()),before.get(table.name),table.name);}
  assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE nomer=145').get().n,1);for(const name of ['plany_periodov_okr','zaprosy_planov_okr'])assert.equal(db.prepare('SELECT count(*) n FROM '+name).get().n,0);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();db=null;
  const fresh=path.join(folder,'fresh.db');execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env:{...process.env,LOCUS_BAZA:fresh},stdio:'pipe'});
  for(const name of [file,fresh]){
   db=new DatabaseSync(name);if(name===fresh){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(9900991,'Synthetic fresh witness',1,'polnyj',1)").run();db.prepare("INSERT INTO celi(id,nazvanie,napravlenie,period_id,sostojanie)VALUES(9900991,'Synthetic fresh goal','synapt',2026,'aktivna')").run();db.prepare("INSERT INTO rezultaty(id,cel_id,nazvanie,plan,baza,istochnik)VALUES(9900991,9900991,'Synthetic fresh metric',500,0,'ruchnoj_zamer')").run();}
   assert.throws(()=>db.prepare('INSERT INTO plany_periodov_okr VALUES(?,?,?,?,?,?,?)').run(9900991,'2026-Q1','1',0,'a'.repeat(36),9900991,'2026-11-20'));
   assert.throws(()=>db.prepare('INSERT INTO zaprosy_planov_okr(avtor,kljuch_hesh,cel_id,sohraneno,sozdano)VALUES(?,?,?,?,?)').run(9900991,'a'.repeat(64),9900991,1,'2026-11-20'));
   assert.throws(()=>db.prepare('INSERT INTO zaprosy_planov_okr(avtor,kljuch_hesh,cel_id,sozdano)VALUES(?,?,?,?)').run(9900991,'invalid',9900991,'2026-11-20'));
   db.prepare('INSERT INTO plany_periodov_okr(rezultat_id,period_id,plan,versija,izmenenie_id,kto,kogda)VALUES(?,?,?,?,?,?,?)').run(9900991,'2026-Q1','0',1,'a'.repeat(36),9900991,'2026-11-20');assert.equal(db.prepare('SELECT typeof(plan) type,plan FROM plany_periodov_okr').get().type,'text');db.close();db=null;
  }
 }finally{db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
