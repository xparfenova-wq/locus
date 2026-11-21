const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');

test('loaded comment history reconciles through authenticated, bounded, coherent read snapshots',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-comment-sync-')),file=path.join(folder,'test.db'),hook=path.join(folder,'writer.json');
 const first=700001,second=700002,password='comment-sync-fixture-only',env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(first),NODE_ENV:'test'};let db,server;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
  for(const id of [first,second]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup) VALUES(?,?,1,'polnyj')").run(id,'CommentSync '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh) VALUES(?,?,?)').run(id,'sync-'+id,hash);}
                                                                         
                                                                            
  const childCode=`const fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');const original=DatabaseSync.prototype.prepare;
    DatabaseSync.prototype.prepare=function(sql,...args){if(String(sql).startsWith('SELECT c.id,c.versija,')&&fs.existsSync(${JSON.stringify(hook)})){const change=JSON.parse(fs.readFileSync(${JSON.stringify(hook)},'utf8'));fs.unlinkSync(${JSON.stringify(hook)});const writer=new DatabaseSync(${JSON.stringify(file)});original.call(writer,'UPDATE kommentarii SET tekst=?,versija=versija+1 WHERE id=?').run(change.text,change.id);writer.close();}return original.call(this,sql,...args);};
    require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)});`;
  server=spawn(process.execPath,['-e',childCode],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',d=>{stderr+=d;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup '+stderr)),10000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+stderr));});server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const api=async(method,route,body,cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
  const login=async id=>{const r=await api('POST','vhod/parol',{login:'sync-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const owner=await login(first),peer=await login(second);
  const makeTask=async title=>{const r=await api('POST','zadachi',{nazvanie:title,napravlenie:'synapt',otvetstvennyj:first},owner);assert.equal(r.status,201);return r.body;};
  const task=await makeTask('Version manifest fixture'),foreign=await makeTask('Other discussion fixture'),ids=[];
  const insert=db.prepare("INSERT INTO kommentarii(zadacha_id,chelovek_id,tekst,sozdano) VALUES(?,?,?,datetime('now'))");db.exec('BEGIN');for(let i=0;i<180;i++)ids.push(Number(insert.run(task.id,i%2?second:first,'Comment '+i).lastInsertRowid));const foreignId=Number(insert.run(foreign.id,first,'Foreign private text').lastInsertRowid);db.exec('COMMIT');
  const query=(floor=ids[0])=>'kommentarii?zadacha_id='+task.id+'&sortirovka=id_desc&na_stranice=50&sverit_ot_id='+floor;
  await t.test('manifest covers the loaded range and never crosses task or authentication boundaries',async()=>{
   const counts=()=>JSON.stringify(['kommentarii','zhurnal','uvedomlenija','versii_polej'].map(table=>db.prepare('SELECT count(*) n FROM '+table).get().n)),before=counts();
   const r=await api('GET',query(),undefined,owner);assert.equal(r.status,200);assert.equal(r.body.spisok.length,50);assert.equal(r.body.vsego,180);assert.deepEqual(r.body.spisok.map(x=>x.id),ids.slice(-50).reverse());assert.deepEqual(r.body.sverka.versii.map(x=>x.id),ids);assert.ok(r.body.sverka.versii.every(x=>x.versija===1&&x.avtor_versija===1));assert.equal(r.body.sverka.zadacha_id,task.id);assert.equal(r.body.sverka.ot_id,ids[0]);assert.ok(!('sverit_ot_id'in r.body.primenennye_filtry));assert.equal(counts(),before);
   const partial=await api('GET',query(ids[40]),undefined,owner);assert.deepEqual(partial.body.sverka.versii.map(x=>x.id),ids.slice(40));
   assert.equal((await api('GET',query())).status,401);
   const batch=await api('GET','kommentarii?zadacha_id='+task.id+'&ids='+[ids[0],ids[1],foreignId,ids[0]].join(',')+'&na_stranice=100',undefined,owner);assert.equal(batch.status,200);assert.deepEqual(batch.body.spisok.map(x=>x.id),ids.slice(0,2));assert.ok(batch.body.spisok.every(x=>x.zadacha_id===task.id&&x.avtor_versija===1));
   const bad=['sverit_ot_id=0','sverit_ot_id=-1','sverit_ot_id=1e3','sverit_ot_id=1.5','sverit_ot_id=9007199254740993','ids=','ids=1,,2','ids=1)OR1=1','ids='+Array(101).fill(1).join(',')];
   for(const tail of bad)assert.equal((await api('GET','kommentarii?zadacha_id='+task.id+'&'+tail,undefined,owner)).status,400,tail);
   for(const tail of ['&ids='+ids[0],'&q=Comment','&do_id='+ids[10],'&stranica=2','&na_stranice=201','&sortirovka=id_asc'])assert.equal((await api('GET',query()+tail,undefined,owner)).status,400,tail);
   assert.equal((await api('GET','kommentarii?sverit_ot_id=1',undefined,owner)).status,400);assert.equal((await api('GET','ljudi?sverit_ot_id=1',undefined,owner)).status,422);assert.equal((await api('GET','ljudi?ids=1',undefined,owner)).status,422);
  });
  await t.test('old edit, deletion and author rename are visible without resending unchanged text',async()=>{
   const changed=await api('PATCH','kommentarii/'+ids[0],{versija:1,tekst:'Old comment edited'},owner);assert.equal(changed.status,200);assert.equal((await api('DELETE','kommentarii/'+ids[1],{versija:1},peer)).status,200);
   const person=db.prepare('SELECT versija FROM ljudi WHERE id=?').get(first);const renamed=await api('PATCH','ljudi/'+first,{versija:person.versija,imja:'Renamed author fixture'},owner);assert.equal(renamed.status,200);
   const r=await api('GET',query(),undefined,owner);assert.equal(r.body.vsego,179);assert.equal(r.body.sverka.versii.find(x=>x.id===ids[0]).versija,2);assert.ok(!r.body.sverka.versii.some(x=>x.id===ids[1]));assert.equal(r.body.sverka.versii.find(x=>x.id===ids[0]).avtor_versija,renamed.body.versija);
   const batch=await api('GET','kommentarii?zadacha_id='+task.id+'&ids='+ids.slice(0,3).join(','),undefined,owner);assert.equal(batch.status,200);assert.equal(batch.body.spisok.length,2);assert.equal(batch.body.spisok[0].tekst,'Old comment edited');assert.equal(batch.body.spisok[0].avtor_imja,'Renamed author fixture');
  });
  await t.test('five thousand long comments use a compact version manifest and bounded text pages',async()=>{
   const large=await makeTask('Large discussion fixture'),text='x'.repeat(5000);db.exec('BEGIN');const big=[];for(let i=0;i<5000;i++)big.push(Number(insert.run(large.id,first,text).lastInsertRowid));db.exec('COMMIT');
   const started=Date.now(),r=await api('GET','kommentarii?zadacha_id='+large.id+'&sverit_ot_id='+big[0]+'&sortirovka=id_desc&na_stranice=50',undefined,owner);assert.equal(r.status,200);assert.equal(r.body.sverka.versii.length,5000);assert.equal(r.body.spisok.length,50);assert.equal(r.body.vsego,5000);assert.ok(r.body.sverka.versii.every(x=>Object.keys(x).sort().join(',')==='avtor_versija,id,versija'));assert.ok(Buffer.byteLength(JSON.stringify(r.body))<1000000);assert.ok(Date.now()-started<20000);
  });
  await t.test('a real external writer cannot mix the text page with a newer version snapshot',async()=>{
   const target=ids.at(-1),before=db.prepare('SELECT tekst,versija FROM kommentarii WHERE id=?').get(target);fs.writeFileSync(hook,JSON.stringify({id:target,text:'Concurrent external update'}));
   const r=await api('GET',query(),undefined,owner);assert.equal(r.status,200);assert.equal(r.body.spisok.find(x=>x.id===target).tekst,before.tekst);assert.equal(r.body.sverka.versii.find(x=>x.id===target).versija,before.versija);assert.equal(db.prepare('SELECT versija FROM kommentarii WHERE id=?').get(target).versija,before.versija+1);
   const next=await api('GET',query(),undefined,owner);assert.equal(next.body.spisok.find(x=>x.id===target).tekst,'Concurrent external update');assert.equal(next.body.sverka.versii.find(x=>x.id===target).versija,before.versija+1);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  });
 }finally{if(server){server.kill();await new Promise(r=>server.once('exit',r));}if(db)db.close();fs.rmSync(folder,{recursive:true,force:true});}
});
