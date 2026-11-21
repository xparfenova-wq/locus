const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');
function browserAPI(){const vm=require('node:vm'),window={fetch:async()=>{throw new Error('Unexpected fetch');}},document={querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent:()=>{}},sandbox={window,document,crypto:require('node:crypto').webcrypto,URL,URLSearchParams,Headers,Request,Intl,console,setTimeout,clearTimeout};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/api.js'),'utf8'),sandbox);return window.API;}
const clientSnapshot={chelovek_id:2,kontekst:'a'.repeat(64),spisok:[{id:1,chelovek_id:2,tip:'telefon',znachenie:'+79997912345',versija:1},{id:2,chelovek_id:2,tip:'pochta',znachenie:'a@example.test',versija:1}]};
test('a lost order acknowledgement reads current state without replaying the POST',async()=>{
 for(const matched of [true,false]){const api=browserAPI();let writes=0,reads=0;api.dejstvie=async()=>{writes++;throw new TypeError('lost');};api.porjadokKontaktov=async()=>{reads++;return {...clientSnapshot,spisok:matched?clientSnapshot.spisok.slice().reverse():clientSnapshot.spisok};};assert.equal((await api.sohranitPorjadokKontaktov(clientSnapshot,[2,1])).podtverzhdeno,matched);assert.equal(writes,1);assert.equal(reads,1);}
});
test('order conflicts and initial authentication errors are never automatically replayed or rebased',async()=>{
 for(const error of [{kod:401},{kod:403},{kod:409,telo:{tekuschij_porjadok:clientSnapshot}},{kod:409,telo:{sessija_izmenilas:true}}]){const api=browserAPI();let writes=0;api.dejstvie=async()=>{writes++;throw error;};api.porjadokKontaktov=async()=>{throw new Error('must not read');};await assert.rejects(()=>api.sohranitPorjadokKontaktov(clientSnapshot,[2,1]),e=>e===error);assert.equal(writes,1);}
});
test('a failed read after an unacknowledged order write remains explicitly unknown',async()=>{
 for(const error of [new TypeError('offline'),{kod:401},{kod:403}]){const api=browserAPI();api.dejstvie=async()=>{throw new TypeError('lost');};api.porjadokKontaktov=async()=>{throw error;};await assert.rejects(()=>api.sohranitPorjadokKontaktov(clientSnapshot,[2,1]),e=>e.orderUnknown&&e.cause===error);}
});
test('a foreign or ambiguous order snapshot is rejected before changing client state',()=>{
 const api=browserAPI();for(const s of [{...clientSnapshot,chelovek_id:3},{...clientSnapshot,kontekst:'bad'},{...clientSnapshot,spisok:[clientSnapshot.spisok[0],clientSnapshot.spisok[0]]},{...clientSnapshot,spisok:[{...clientSnapshot.spisok[0],versija:0}]}])assert.throws(()=>api.proveritPorjadokKontaktov(s,2));
});
test('contact order is one authenticated, versioned transaction for exactly one person',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-order-')),file=path.join(folder,'test.db'),first=810001,second=810002,password='order-fixture-only',env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(first),NODE_ENV:'test'};let db,server,serial=0;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [first,second]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'Order actor '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'order-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>stderr+=d);const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};const login=async id=>{const r=await api('POST','vhod/parol',{login:'order-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};const a=await login(first),b=await login(second);
  const make=async()=>{const id=820000+(++serial);db.prepare('INSERT INTO ljudi(id,imja) VALUES(?,?)').run(id,'Order owner '+id);const rows=[];for(const [tip,value] of [['telefon','+79997912345'],['telefon','+79997967890'],['pochta','order-'+id+'@example.test']]){const r=await api('POST','kontakty',{chelovek_id:id,tip,znachenie:value,force:true},a);assert.equal(r.status,201);rows.push(r.body);}return{id,rows};};
  const get=async id=>{const r=await api('GET','kontakty/porjadok?chelovek_id='+id,undefined,a);assert.equal(r.status,200);return r.body;};
  const save=(s,ids,cookie=a,extra={})=>api('POST','kontakty/porjadok',{chelovek_id:s.chelovek_id,kontekst:s.kontekst,porjadok:ids,...extra},cookie);
  const state=()=>JSON.stringify(['kontakty','zhurnal','versii_polej'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
  await t.test('only order and its versions change; raw values, primaries, other people and authors are preserved',async()=>{
   const {id,rows}=await make(),foreign=await make(),before=state(),s=await get(id);assert.equal(state(),before);const ids=rows.map(x=>x.id).reverse(),r=await save(s,ids,b);assert.equal(r.status,200);assert.deepEqual(r.body.spisok.map(x=>x.id),ids);
   for(const row of rows){const current=db.prepare('SELECT * FROM kontakty WHERE id=?').get(row.id);assert.equal(current.znachenie,row.znachenie);assert.equal(Boolean(current.osnovnoj),row.osnovnoj);assert.equal(current.versija,row.versija+(row.porjadok===ids.indexOf(row.id)+1?0:1));}
   for(const row of foreign.rows)assert.equal(db.prepare('SELECT versija FROM kontakty WHERE id=?').get(row.id).versija,row.versija);
   const journal=db.prepare("SELECT kto FROM zhurnal WHERE obekt='kontakt' AND pole='porjadok' AND obekt_id IN (?,?,?)").all(...ids);assert.equal(journal.length,2);assert.ok(journal.every(x=>x.kto===second));
   for(const row of [rows[0],rows[2]])assert.equal(db.prepare("SELECT kto FROM versii_polej WHERE tablica='kontakty' AND obekt_id=? AND pole='porjadok'").get(row.id).kto,second);
   const after=state();assert.equal((await save(r.body,ids)).status,200);assert.equal(state(),after);
  });
  await t.test('two stale orders cannot overwrite each other, including an away-and-back sequence',async()=>{
   const {id,rows}=await make(),s=await get(id),ids=rows.map(x=>x.id),other=[ids[1],ids[0],ids[2]],r=await save(s,other,b);assert.equal(r.status,200);const before=state(),conflict=await save(s,ids);assert.equal(conflict.status,409);assert.equal(conflict.body.porjadok_izmenilsja,true);assert.equal(state(),before);assert.equal((await save(r.body,ids,b)).status,200);assert.equal((await save(s,other)).status,409);
  });
  await t.test('changed values, changed primaries, added or removed members all require a new review',async()=>{
   for(const mode of ['value','primary','add','remove']){const {id,rows}=await make(),s=await get(id);
    if(mode==='value')assert.equal((await api('PATCH','kontakty/'+rows[0].id,{versija:rows[0].versija,znachenie:'+79997955555'},b)).status,200);
    if(mode==='primary'){const row=(await api('GET','kontakty/'+rows[1].id,undefined,b)).body;assert.equal((await api('PATCH','kontakty/'+row.id,{versija:row.versija,osnovnoj:true,osnovnoj_kontekst:row.osnovnoj_kontekst},b)).status,200);}
    if(mode==='add')assert.equal((await api('POST','kontakty',{chelovek_id:id,tip:'drugoe',znachenie:'extra'},b)).status,201);
    if(mode==='remove')assert.equal((await api('DELETE','kontakty/'+rows[1].id,{versija:rows[1].versija},b)).status,200);
    const before=state();assert.equal((await save(s,rows.map(x=>x.id).reverse())).status,409);assert.equal(state(),before);
   }
  });
  await t.test('foreign, duplicate, missing or malformed IDs never change a row',async()=>{
   const {id,rows}=await make(),foreign=await make(),s=await get(id),ids=rows.map(x=>x.id),before=state();for(const list of [[ids[0],ids[0],ids[2]],ids.slice(1),[...ids,foreign.rows[0].id],[ids[0],ids[1],String(ids[2])]]){assert.equal((await save(s,list)).status,400);assert.equal(state(),before);}for(const kontekst of [undefined,true,'bad']){assert.equal((await save(s,ids,a,{kontekst})).status,400);assert.equal(state(),before);}
   assert.equal((await save(s,ids,null)).status,401);assert.equal((await api('GET','kontakty/porjadok?chelovek_id='+id)).status,401);assert.equal(state(),before);
  });
  await t.test('a failed second journal rolls back every order, version, and field-history update',async()=>{
   const {id,rows}=await make(),s=await get(id),ids=rows.map(x=>x.id).reverse(),before=state();db.exec("CREATE TRIGGER order_journal_failure BEFORE INSERT ON zhurnal WHEN NEW.obekt='kontakt' AND NEW.pole='porjadok' AND NEW.obekt_id="+rows[0].id+" BEGIN SELECT RAISE(ABORT,'fixture order journal failure');END");try{assert.equal((await save(s,ids)).status,500);assert.equal(state(),before);}finally{db.exec('DROP TRIGGER order_journal_failure');}assert.equal((await save(s,ids)).status,200);
  });
  await t.test('without explicit primaries the people list follows the new first phone',async()=>{
   const {id,rows}=await make();db.prepare("UPDATE kontakty SET osnovnoj=0 WHERE chelovek_id=? AND tip='telefon'").run(id);const s=await get(id);assert.equal((await api('GET','ljudi/'+id,undefined,a)).body.primary_phone,rows[0].znachenie);assert.equal((await save(s,[rows[1].id,rows[0].id,rows[2].id])).status,200);const person=(await api('GET','ljudi/'+id,undefined,a)).body;assert.equal(person.primary_phone,rows[1].znachenie);assert.equal(person.primary_phone_istochnik,'pervyj_po_porjadku');
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{if(server){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
