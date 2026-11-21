const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('daily summary assigns UTC closures to Moscow days, including midnight, children and year rollover',()=>{
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'locus-summary-msk-')),file=path.join(dir,'fixture.db'),previous=process.env.LOCUS_BAZA;let db;
 try{
  process.env.LOCUS_BAZA=file;execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env:process.env,stdio:'pipe'});db=require('../db/db.js').baza();
  for(const id of [500101,500102])db.prepare('INSERT INTO ljudi(id,imja,komanda) VALUES(?,?,1)').run(id,'Daily summary fixture '+id);
  const task=db.prepare("INSERT INTO zadachi(nomer,nazvanie,napravlenie,otvetstvennyj,status,roditel_id,ne_v_itogi,udaleno) VALUES(?,?,'synapt',?,?,?,?,?)"),journal=db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kto,kogda) VALUES('zadacha',?,'status','v_processe','sdelano',?,?)");let number=60000;
  const make=(name,time,options={})=>{const nomer=++number,id=Number(task.run(nomer,name,options.person||500101,options.status||'sdelano',options.parent||null,options.hidden||0,options.deleted||0).lastInsertRowid);if(time)journal.run(id,options.actor||500101,time);return{id,nomer};};
  make('Before Moscow midnight','2026-11-14 20:59:59');const midnight=make('At Moscow midnight','2026-11-14 21:00:00');make('Late UTC evening','2026-11-14T23:59:59Z');make('Before next midnight','2026-11-15 20:59:59');make('Next Moscow day','2026-11-15 21:00:00');
  make('Other closer excluded','2026-11-14 21:00:00',{actor:500102});make('Hidden excluded','2026-11-14 21:00:00',{hidden:1});make('Deleted excluded','2026-11-14 21:00:00',{deleted:1});
  const parent=make('Other owner parent',null,{person:500102,status:'v_processe'});make('My closed child','2026-11-14 21:15:00',{parent:parent.id});make('New year closure','2026-12-31 21:00:00');
  const before=db.prepare('SELECT * FROM zadachi ORDER BY id').all(),{itogi}=require('../api/ekrany.js');
  const summary=day=>itogi({metod:'GET',avtor:500101,zapros:{den:day}}).telo;
  assert.deepEqual(summary('2026-11-14').punkty.map(r=>r.nazvanie),['Before Moscow midnight']);
  const today=summary('2026-11-15');assert.deepEqual(today.punkty.map(r=>r.nazvanie).sort(),['At Moscow midnight','Late UTC evening','Before next midnight','Other owner parent'].sort());
  assert.ok(today.punkty.every(r=>r.kogda==='2026-11-15'));assert.equal(today.punkty.find(r=>r.id===midnight.id).adres,'/synapt/'+midnight.nomer);assert.ok(today.tekst.startsWith('#результаты 15.11'));
  const grouped=today.punkty.find(r=>r.id===parent.id);assert.equal(grouped.chuzhaya,true);assert.deepEqual(grouped.podzadachi.map(r=>r.nazvanie),['My closed child']);assert.ok(today.tekst.includes('My closed child, сделано'));
  assert.deepEqual(summary('2026-11-16').punkty.map(r=>r.nazvanie),['Next Moscow day']);assert.equal(summary('2026-12-31').punkty.length,0);assert.deepEqual(summary('2027-01-01').punkty.map(r=>r.nazvanie),['New year closure']);
  assert.deepEqual(db.prepare('SELECT * FROM zadachi ORDER BY id').all(),before);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db?.close();if(previous===undefined)delete process.env.LOCUS_BAZA;else process.env.LOCUS_BAZA=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
