const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
const vm=require('node:vm');
function browserAPI(){
 const window={fetch:async()=>{throw new Error('Unexpected fetch');}},document={querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent:()=>{}};
 const sandbox={window,document,crypto:require('node:crypto').webcrypto,URL,URLSearchParams,Headers,Request,Intl,console,setTimeout,clearTimeout};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/api.js'),'utf8'),sandbox);return window.API;
}
const clientRow={id:1,chelovek_id:2,tip:'pochta',znachenie:'one@example.test',osnovnoj:false,versija:1,osnovnoj_kontekst:'a'.repeat(64)};
const clientGroup=(selected=true)=>({chelovek_id:2,tip:'pochta',kontekst:clientRow.osnovnoj_kontekst,spisok:[{...clientRow,osnovnoj:selected}]});
test('a primary selection with a lost reply checks the whole group without replaying a write',async()=>{
 for(const selected of [true,false]){const api=browserAPI();let writes=0,reads=0;api.pravit=async()=>{writes++;throw new TypeError('lost');};api.gruppaKontaktov=async()=>{reads++;return clientGroup(selected);};const r=await api.vybratOsnovnojKontakt(clientRow);assert.equal(r.podtverzhdeno,selected);assert.equal(writes,1);assert.equal(reads,1);}
});
test('a missing target can be confirmed as a different current selection without a second write',async()=>{
 const api=browserAPI();let writes=0;api.pravit=async()=>{writes++;throw new TypeError('lost');};api.gruppaKontaktov=async()=>({...clientGroup(),spisok:[]});assert.equal((await api.vybratOsnovnojKontakt(clientRow)).podtverzhdeno,false);assert.equal(writes,1);
});
test('real primary conflicts and initial authentication failures stay explicit without reads or replay',async()=>{
 for(const error of [{kod:401},{kod:403},{kod:409,telo:{primary_group_changed:true}},{kod:409,telo:{sessija_izmenilas:true}},{kod:404},{kod:400}]){const api=browserAPI();let writes=0;api.pravit=async()=>{writes++;throw error;};api.gruppaKontaktov=async()=>{throw new Error('must not read');};await assert.rejects(()=>api.vybratOsnovnojKontakt(clientRow),e=>e===error);assert.equal(writes,1);}
});
test('an applied primary write followed by unavailable or expired-session confirmation remains unknown',async()=>{
 for(const error of [new TypeError('offline'),{kod:401},{kod:403},{kod:409,telo:{sessija_izmenilas:true}}]){const api=browserAPI();let writes=0;api.pravit=async()=>{writes++;throw new TypeError('lost');};api.gruppaKontaktov=async()=>{throw error;};await assert.rejects(()=>api.vybratOsnovnojKontakt(clientRow),e=>e.primaryUnknown&&e.cause===error);assert.equal(writes,1);}
});
test('foreign, inconsistent or ambiguous group responses cannot authorize a client update',()=>{
 const api=browserAPI();for(const group of [{...clientGroup(),chelovek_id:3},{...clientGroup(),tip:'telefon'},{...clientGroup(),kontekst:'bad'},
  {...clientGroup(),spisok:[{...clientRow,chelovek_id:3}]},{...clientGroup(),spisok:[{...clientRow,versija:0}]},
  {...clientGroup(),spisok:[{...clientRow,osnovnoj:true},{...clientRow,id:3,osnovnoj:true}]},
  {...clientGroup(),spisok:[clientRow,clientRow]}])assert.throws(()=>api.proveritGruppuKontaktov(group,2,'pochta'));
});
test('canonical kinds are shared between opens and a failed read can be retried',async()=>{
 const api=browserAPI();let reads=0;api.spisok=async()=>{reads++;if(reads===1)throw new Error('offline');return{spisok:require('../api/vidy-kontaktov.js').CATALOG};};await assert.rejects(()=>api.vidyKontaktov());const [a,b]=await Promise.all([api.vidyKontaktov(),api.vidyKontaktov()]);assert.equal(a,b);assert.equal(a.length,9);assert.equal(reads,2);
});
test('primary contact choices are atomic, scoped and protected against stale group reads',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-contact-primary-')),file=path.join(folder,'test.db'),first=790001,second=790002,password='primary-contact-fixture',hook=path.join(folder,'writer.json');
 const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(first),NODE_ENV:'test'};let db,server,ownerNumber=791000,serial=0;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [first,second]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'Primary actor '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'primary-'+id,hash);}
  const childCode=`const fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');const original=DatabaseSync.prototype.prepare;
   DatabaseSync.prototype.prepare=function(sql,...args){if(String(sql).startsWith('SELECT k.*,coalesce')&&fs.existsSync(${JSON.stringify(hook)})){const c=JSON.parse(fs.readFileSync(${JSON.stringify(hook)},'utf8'));fs.unlinkSync(${JSON.stringify(hook)});const w=new DatabaseSync(${JSON.stringify(file)});w.exec('BEGIN IMMEDIATE');original.call(w,'UPDATE kontakty SET osnovnoj=0 WHERE id=?').run(c.from);original.call(w,'UPDATE kontakty SET osnovnoj=1 WHERE id=?').run(c.to);w.exec('COMMIT');w.close();}return original.call(this,sql,...args);};
   require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)});`;
  server=spawn(process.execPath,['-e',childCode],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>{stderr+=d;});const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};const login=async id=>{const r=await api('POST','vhod/parol',{login:'primary-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};const a=await login(first),b=await login(second);
  const owner=()=>{const id=++ownerNumber;db.prepare('INSERT INTO ljudi(id,imja) VALUES(?,?)').run(id,'Primary owner '+id);return id;};
  const create=async(id,tip='telefon',extra={})=>{const value=tip==='telefon'?'+799979'+String(++serial).padStart(5,'0'):'primary-'+(++serial)+'@example.test';const r=await api('POST','kontakty',{chelovek_id:id,tip,znachenie:value,...extra},a);assert.equal(r.status,201,JSON.stringify(r.body));return r.body;};
  const get=async row=>(await api('GET','kontakty/'+row.id,undefined,a)).body;
  const mark=(row,cookie=a,extra={})=>api('PATCH','kontakty/'+row.id,{versija:row.versija,osnovnoj:true,osnovnoj_kontekst:row.osnovnoj_kontekst,...extra},cookie);
  const state=()=>JSON.stringify(['kontakty','zhurnal','versii_polej'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));
  await t.test('a switch changes exactly its kind, both versions and both journal entries',async()=>{
   const id=owner(),old=await create(id),next=await create(id),mail=await create(id,'pochta'),seen=await get(next),r=await mark(seen,b);assert.equal(r.status,200);assert.deepEqual(r.body.affected.sort((x,y)=>x-y),[old.id,next.id].sort((x,y)=>x-y));
   assert.equal(db.prepare('SELECT osnovnoj FROM kontakty WHERE id=?').get(old.id).osnovnoj,0);assert.equal(db.prepare('SELECT osnovnoj FROM kontakty WHERE id=?').get(next.id).osnovnoj,1);assert.equal(db.prepare('SELECT osnovnoj FROM kontakty WHERE id=?').get(mail.id).osnovnoj,1);
   for(const row of [old,next]){const current=db.prepare('SELECT * FROM kontakty WHERE id=?').get(row.id);assert.equal(current.versija,row.versija+1);assert.equal(current.znachenie,row.znachenie);assert.equal(current.porjadok,row.porjadok);assert.equal(db.prepare("SELECT kto FROM versii_polej WHERE tablica='kontakty' AND obekt_id=? AND pole='osnovnoj'").get(row.id).kto,second);}
   const journal=db.prepare("SELECT obekt_id,kto FROM zhurnal WHERE obekt='kontakt' AND pole='osnovnoj' AND obekt_id IN (?,?) ORDER BY obekt_id").all(old.id,next.id);assert.equal(journal.length,2);assert.ok(journal.every(row=>row.kto===second));assert.equal(r.body.osnovnaja_gruppa.spisok.filter(row=>row.osnovnoj).length,1);
  });
  await t.test('two different stale choices cannot silently replace each other',async()=>{
   const id=owner();await create(id);const x=await create(id),y=await create(id),seenX=await get(x),seenY=await get(y);const replies=await Promise.all([mark(seenX,a),mark(seenY,b)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);const loser=replies[0].status===409?x:y,conflict=replies.find(r=>r.status===409);assert.equal(conflict.body.primary_group_changed,true);assert.equal(db.prepare("SELECT count(*) n FROM kontakty WHERE chelovek_id=? AND tip='telefon' AND osnovnoj=1").get(id).n,1);
   assert.equal((await mark(await get(loser),b)).status,200);assert.equal(db.prepare('SELECT id FROM kontakty WHERE chelovek_id=? AND osnovnoj=1').get(id).id,loser.id);
  });
  await t.test('switching back still invalidates an old group token',async()=>{
   const id=owner(),x=await create(id),y=await create(id),z=await create(id),old=await get(z);assert.equal((await mark(await get(y))).status,200);assert.equal((await mark(await get(x))).status,200);const before=state();assert.equal((await mark(old)).status,409);assert.equal(state(),before);
  });
  await t.test('unrelated value and order edits merge without changing the primary context',async()=>{
   const id=owner(),x=await create(id),y=await create(id),seen=await get(y),value=await api('PATCH','kontakty/'+x.id,{versija:x.versija,znachenie:'+79997999999'},b);assert.equal(value.status,200);assert.equal((await api('PATCH','kontakty/'+x.id,{versija:value.body.versija,porjadok:40},b)).status,200);assert.equal((await get(y)).osnovnoj_kontekst,seen.osnovnoj_kontekst);assert.equal((await mark(seen)).status,200);const current=db.prepare('SELECT * FROM kontakty WHERE id=?').get(x.id);assert.equal(current.znachenie,'+79997999999');assert.equal(current.porjadok,40);
  });
  await t.test('missing or foreign tokens do not clear the existing primary',async()=>{
   const id=owner();await create(id);const next=await create(id),other=await create(owner()),seen=await get(next),before=state();for(const token of [undefined,true,'bad']){assert.equal((await mark(seen,a,{osnovnoj_kontekst:token})).status,400);assert.equal(state(),before);}assert.equal((await mark(seen,a,{osnovnoj_kontekst:other.osnovnoj_kontekst})).status,409);assert.equal(state(),before);
  });
  await t.test('a primary choice cannot silently select a target whose value changed',async()=>{
   const id=owner();await create(id);const target=await create(id),seen=await get(target);assert.equal((await api('PATCH','kontakty/'+target.id,{versija:target.versija,znachenie:'+79997977777'},b)).status,200);const before=state(),r=await mark(seen);assert.equal(r.status,409);assert.ok(r.body.izmenennye_polja.includes('znachenie'));assert.equal(state(),before);
  });
  await t.test('a failed target journal rolls back the whole switch and its metadata',async()=>{
   const id=owner();await create(id);const target=await create(id),seen=await get(target),before=state();db.exec("CREATE TRIGGER fail_primary_journal BEFORE INSERT ON zhurnal WHEN NEW.obekt='kontakt' AND NEW.pole='osnovnoj' AND NEW.obekt_id="+target.id+" BEGIN SELECT RAISE(ABORT,'fixture primary journal failure');END");try{assert.equal((await mark(seen)).status,500);assert.equal(state(),before);}finally{db.exec('DROP TRIGGER fail_primary_journal');}assert.equal((await mark(seen)).status,200);
  });
  await t.test('creating an explicitly primary contact requires a reviewed group and remains atomic',async()=>{
   const id=owner(),old=await create(id),before=state();assert.equal((await api('POST','kontakty',{chelovek_id:id,tip:'telefon',znachenie:'+79997988888',osnovnoj:true},a)).status,400);assert.equal(state(),before);const fresh=await get(old),r=await api('POST','kontakty',{chelovek_id:id,tip:'telefon',znachenie:'+79997988888',osnovnoj:true,osnovnoj_kontekst:fresh.osnovnoj_kontekst},a);assert.equal(r.status,201);assert.equal(db.prepare('SELECT count(*) n FROM kontakty WHERE chelovek_id=? AND osnovnoj=1').get(id).n,1);
  });
  await t.test('the database independently rejects a second raw primary flag',async()=>{
   const id=owner();await create(id);const next=await create(id),before=state();assert.throws(()=>db.prepare('UPDATE kontakty SET osnovnoj=1 WHERE id=?').run(next.id),/UNIQUE constraint failed/);assert.equal(state(),before);
  });
  await t.test('undo cannot override a later primary choice which returned to the same contact',async()=>{
   const id=owner(),old=await create(id),next=await create(id),third=await create(id);
   const deleted=await api('DELETE','kontakty/'+old.id,{versija:old.versija},a);assert.equal(deleted.status,200);
   assert.equal((await mark(await get(third),b)).status,200);assert.equal((await mark(await get(next),b)).status,200);
   const before=state();assert.equal((await api('POST','kontakty/otmena',{token_otmeny:deleted.body.token_otmeny},a)).status,409);assert.equal(state(),before);
  });
  await t.test('an explicit reaffirmation of the fallback primary protects that decision from undo',async()=>{
   const id=owner(),old=await create(id),next=await create(id),deleted=await api('DELETE','kontakty/'+old.id,{versija:old.versija},a);assert.equal(deleted.status,200);assert.equal((await mark(await get(next),b)).status,200);const before=state();assert.equal((await api('POST','kontakty/otmena',{token_otmeny:deleted.body.token_otmeny},a)).status,409);assert.equal(state(),before);
  });
  await t.test('adding a non-primary contact does not prevent an otherwise safe undo',async()=>{
   const id=owner(),old=await create(id);await create(id);const deleted=await api('DELETE','kontakty/'+old.id,{versija:old.versija},a),added=await create(id);assert.equal(added.osnovnoj,false);const restored=await api('POST','kontakty/otmena',{token_otmeny:deleted.body.token_otmeny},a);assert.equal(restored.status,200);assert.equal(restored.body.id,old.id);assert.ok(db.prepare('SELECT 1 FROM kontakty WHERE id=?').get(added.id));
  });
  await t.test('legacy array receipts remain usable without a later choice in their own group',async()=>{
   const id=owner(),old=await create(id),next=await create(id),deleted=await api('DELETE','kontakty/'+old.id,{versija:old.versija},a);assert.equal(deleted.status,200);db.prepare('UPDATE otmeny_kontaktov SET osnovnye=? WHERE slepok LIKE ?').run(JSON.stringify([next.id]),'%"id":'+old.id+',%');assert.equal((await api('POST','kontakty/otmena',{token_otmeny:deleted.body.token_otmeny},a)).status,200);
  });
  await t.test('all contact reads keep row flags and group context in one external-writer snapshot',async()=>{
   for(const mode of ['single','list','card','nested']){
    const id=owner(),old=await create(id),next=await create(id),target=await create(id),seen=await get(target);
    fs.writeFileSync(hook,JSON.stringify({from:old.id,to:next.id}));
    const route=mode==='single'?'kontakty/'+old.id:mode==='list'?'kontakty?chelovek_id='+id:mode==='card'?'ljudi/'+id+'/celikom':'ljudi/'+id+'/kontakty';
    const r=await api('GET',route,undefined,a);assert.equal(r.status,200);const rows=mode==='single'?[r.body]:mode==='card'?r.body.kontakty:r.body.spisok;
    assert.equal(rows.find(x=>x.id===old.id).osnovnoj,true);assert.ok(rows.every(x=>x.osnovnoj_kontekst===seen.osnovnoj_kontekst));
    const fresh=await get(target);assert.notEqual(fresh.osnovnoj_kontekst,seen.osnovnoj_kontekst);assert.equal(fresh.osnovnaja_gruppa.spisok.find(x=>x.id===next.id).osnovnoj,true);
    assert.equal((await mark(seen)).status,409);
   }
  });
  await t.test('canonical kinds, scoped nested creation and empty groups are explicit',async()=>{
   const kinds=await api('GET','kontakty/vidy',undefined,a);assert.equal(kinds.status,200);assert.equal(kinds.body.spisok.length,9);
   const id=owner(),empty=await api('GET','ljudi/'+id+'/kontakty?tip=youtube',undefined,a);assert.equal(empty.status,200);assert.deepEqual(empty.body.spisok,[]);assert.match(empty.body.osnovnaja_gruppa.kontekst,/^[a-f0-9]{64}$/);
   const invalid=await api('POST','ljudi/'+id+'/kontakty',{tip:'invented',znachenie:'x'},a);assert.equal(invalid.status,400);assert.equal(invalid.body.kod,'neizvestnyj_vid_kontakta');
   assert.equal((await api('POST','ljudi/'+id+'/kontakty',{chelovek_id:owner(),tip:'youtube',znachenie:'https://youtube.com/@fixture'},a)).status,400);
   for(const kind of kinds.body.spisok){
    const value=kind.znachenie==='telefon'?'+79997912345':kind.znachenie==='pochta'?'nested@example.test':kind.znachenie==='telegram'?'@nested_fixture':'https://example.test/'+kind.znachenie;
    const r=await api('POST','ljudi/'+id+'/kontakty',{tip:kind.znachenie,znachenie:value},a);assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.tip_nazvanie,kind.nazvanie);assert.equal(r.body.podskazka_vvoda,kind.podskazka_vvoda);assert.deepEqual(r.body.dejstvija,kind.dejstvija);assert.ok(r.body.deeplink||r.body.url||kind.znachenie==='drugoe');
   }
   const person=(await api('GET','ljudi/'+id,undefined,a)).body;assert.deepEqual(person.kontakty_dlja_spiska.map(x=>x.tip),['telegram','telefon','pochta']);assert.ok(person.kontakty_dlja_spiska.every(x=>x.istochnik==='explicit'&&x.ssylka));
   const phone=db.prepare("SELECT * FROM kontakty WHERE chelovek_id=? AND tip='telefon'").get(id);
   db.prepare('UPDATE kontakty SET osnovnoj=0 WHERE id=?').run(phone.id);
   const fallback=(await api('GET','ljudi/'+id,undefined,a)).body;assert.equal(fallback.primary_phone_istochnik,'pervyj_po_porjadku');assert.equal(fallback.primary_phone,phone.znachenie);
   const none=(await api('GET','ljudi/'+owner(),undefined,a)).body;assert.equal(none.primary_phone,null);assert.equal(none.primary_phone_istochnik,null);assert.deepEqual(none.kontakty_dlja_spiska,[]);
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{if(server){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});

test('an upgrade refuses ambiguous existing primary flags without choosing or losing data',()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-primary-upgrade-')),file=path.join(folder,'test.db'),env={...process.env,LOCUS_BAZA:file};let db;
 try{
  const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});migrate();db=new DatabaseSync(file);db.exec("DROP INDEX idx_kontakty_odin_osnovnoj;DELETE FROM migracii WHERE nomer=114;INSERT INTO ljudi(id,imja) VALUES(799001,'Ambiguous primary fixture')");const insert=db.prepare("INSERT INTO kontakty(chelovek_id,tip,znachenie,znachenie_norm,osnovnoj) VALUES(799001,'pochta',?,?,1)");insert.run('primary-a@example.test','primary-a@example.test');insert.run('primary-b@example.test','primary-b@example.test');const snapshot=()=>JSON.stringify(['kontakty','zhurnal','versii_polej','migracii'].map(t=>db.prepare('SELECT rowid,* FROM '+t+' ORDER BY rowid').all())),before=snapshot();assert.throws(migrate,/114-odin-osnovnoj-kontakt.sql отменена/);assert.equal(snapshot(),before);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
