const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync,createHash}=require('node:crypto');
test('child task navigation, depth, defaults and pagination keep one valid relation',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-children-')),file=path.join(folder,'fixture.db'),actor=9900066,peer=9900067,password='children-snapshot-fixture',env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),LOCUS_FAJLY:path.join(folder,'files'),NODE_ENV:'test'};let db,server,cookieA,port,serial=0;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()),yesterday=require('../api/kalendar.js').sdvinut_den(today,-1);
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);
  for(const id of [actor,peer]){const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO ljudi(id,imja,komanda,dostup)VALUES(?,?,1,?)').run(id,'Children fixture '+id,id===actor?'polnyj':'bez_deneg');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'children-'+id,salt+':'+scryptSync(password,salt,64).toString('hex'));}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup timeout')),10000);server.stdout.once('data',data=>{clearTimeout(timer);resolve(String(data).trim());});server.once('exit',()=>reject(new Error('fixture server exited')));});
  const api=async(method,route,body,cookie=cookieA)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json',connection:'close',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json(),headers:r.headers};},login=async id=>{const r=await api('POST','vhod/parol',{login:'children-'+id,parol:password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};cookieA=await login(actor);const cookieB=await login(peer);
  const ok=async(method,route,body,cookie=cookieA)=>{const r=await api(method,route,body,cookie);assert.ok(r.status<400,route+' '+r.status+' '+JSON.stringify(r.body));return r.body;},make=extra=>ok('POST','zadachi',{nazvanie:'Child relation '+(++serial),napravlenie:'synapt',otvetstvennyj:actor,...extra}),state=()=>createHash('sha256').update(JSON.stringify(['zadachi','otmetki_povtora','zhurnal','uvedomlenija','versii_polej','sqlite_sequence'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()))).digest('hex');
  await t.test('parent is a minimal literal DTO with distinct id and public number and no financial fields',async()=>{
   const parent=await make({nazvanie:'Parent <b>literal</b>'}),child=await make({roditel_id:parent.id,napravlenie:'media'});assert.notEqual(parent.id,parent.nomer);const before=state();
   for(const cookie of [cookieA,cookieB]){const row=await ok('GET','zadachi/'+child.nomer,undefined,cookie);assert.deepEqual(row.roditel,{id:parent.id,nomer:parent.nomer,nazvanie:parent.nazvanie,napravlenie:'synapt',udaleno:false});assert.equal(row.roditel_id,parent.id);}assert.equal(state(),before);
  });
  await t.test('third level create and reparent reject with 400 without partial records',async()=>{
   const parent=await make(),child=await make({roditel_id:parent.id}),other=await make();
   for(const [method,route,body]of [['POST','zadachi',{nazvanie:'Invalid third level',napravlenie:'synapt',otvetstvennyj:actor,roditel_id:child.id}],['PATCH','zadachi/'+other.nomer,{roditel_id:child.id,versija:other.versija}]]){const before=state(),r=await api(method,route,body);assert.equal(r.status,400);assert.equal(r.body.oshibka,'глубина подзадач два уровня');assert.equal(state(),before);}
  });
  await t.test('self parent and descendant cycles reject before changing relationships',async()=>{
   const parent=await make(),child=await make({roditel_id:parent.id});
   for(const [id,error]of [[parent.id,'задача не может быть своим родителем'],[child.id,'цикл в подзадачах']]){const before=state(),r=await api('PATCH','zadachi/'+parent.nomer,{roditel_id:id,versija:parent.versija});assert.equal(r.status,400);assert.equal(r.body.oshibka,error);assert.equal(state(),before);}
  });
  await t.test('a root with a deleted child cannot become a third level and malformed context is read only',async()=>{
   const parent=await make(),child=await make({roditel_id:parent.id}),other=await make();await ok('DELETE','zadachi/'+child.nomer,{versija:child.versija,confirm:true});
   const before=state(),r=await api('PATCH','zadachi/'+parent.nomer,{roditel_id:other.id,versija:parent.versija});assert.equal(r.status,400);assert.equal(r.body.oshibka,'глубина подзадач два уровня');assert.equal(state(),before);
   for(const day of ['wrong','2026-02-30']){const result=await api('GET','zadachi?roditel_id='+other.id+'&den_konteksta='+day);assert.equal(result.status,400);assert.equal(state(),before);}
  });
  await t.test('missing and deleted parent cannot receive a new task',async()=>{
   const parent=await make();await ok('DELETE','zadachi/'+parent.nomer,{versija:parent.versija,confirm:true});
   for(const id of [2147483000,parent.id]){const before=state(),r=await api('POST','zadachi',{nazvanie:'Invalid parent',napravlenie:'synapt',otvetstvennyj:actor,roditel_id:id});assert.equal(r.status,400);assert.equal(state(),before);}
  });
  await t.test('typed defaults inherit the ISO year and independent fields without copying the date',async()=>{
   const parent=await make({nazvanie:'Parent not a child name',opisanie:'Parent description',otvetstvennyj:peer,tip:'produktovaja',sprint:48,god_sprinta:2026,srok:'2026-11-25'}),data=await ok('GET','zadachi/'+parent.nomer+'/zagotovka_podzadachi'),draft=data.zagotovka;
   for(const field of ['napravlenie','proekt_id','klient_id','otvetstvennyj','sprint','god_sprinta','tip'])assert.equal(draft[field],parent[field],field);
   for(const field of ['nazvanie','opisanie','srok','plan_chislo','cel_id','data'])assert.equal(draft[field],null,field);assert.deepEqual(draft.uchastniki,[]);assert.equal(draft.roditel_id,parent.id);
   const child=await make({...draft,nazvanie:'Own child name'});assert.notEqual(child.srok,parent.srok);await ok('PATCH','zadachi/'+child.nomer,{otvetstvennyj:actor,versija:child.versija});assert.equal((await ok('GET','zadachi/'+parent.nomer)).otvetstvennyj,peer);
  });
  await t.test('all 51 children are accessible once and recurring state follows the selected day',async()=>{
   const parent=await make(),children=[];for(let i=0;i<51;i++)children.push(await make({roditel_id:parent.id,...(i===0?{povtorjaetsja:true,chastota:'kazhdyj_den',povtor_s:yesterday}:{})}));await ok('POST','zadachi/'+children[0].nomer+'/otmetki',{data:today,versija:children[0].versija});
   const before=state(),first=await ok('GET','zadachi?roditel_id='+parent.id+'&na_stranice=50&stranica=1&den_konteksta='+today),last=await ok('GET','zadachi?roditel_id='+parent.id+'&na_stranice=50&stranica=2&den_konteksta='+today);assert.equal(first.vsego,51);assert.equal(first.spisok.length,50);assert.equal(last.spisok.length,1);const all=[...first.spisok,...last.spisok];assert.equal(new Set(all.map(r=>r.id)).size,51);assert.ok(all.every(r=>r.roditel_id===parent.id));assert.equal(all.find(r=>r.id===children[0].id).otmecheno,true);
   const previous=await ok('GET','zadachi?roditel_id='+parent.id+'&na_stranice=100&den_konteksta='+yesterday);assert.equal(previous.spisok.find(r=>r.id===children[0].id).otmecheno,false);assert.equal(state(),before);
  });
 }finally{if(server){server.kill();await new Promise(resolve=>server.once('exit',resolve));}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
