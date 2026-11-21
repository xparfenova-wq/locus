const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync,randomUUID}=require('node:crypto');
test('templates keep ordered steps, personal scope, independent task copies and recoverable creation',async t=>{
 const root=process.env.LOCUS_TEMPLATE_ROOT||path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-template-')),file=path.join(folder,'fixture.db'),actor=9900290,peer=9900291,password='template-fixture',env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test'};let db,server,port,cookie,other;
 const start=async()=>{server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',c=>process.stderr.write(c));port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('template startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>reject(new Error('template exited')));});};
 const stop=async()=>{if(!server||server.exitCode!==null)return;const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;};
 const api=async(method,route,body,auth=cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(auth?{cookie:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,auth=cookie)=>{const r=await api(method,route,body,auth);assert.equal(r.status,status,route+' '+JSON.stringify(r.body));return r.body;};
 const read=(key,auth=cookie)=>good('GET','shablony?zapros_kljuch='+key,undefined,200,auth),count=()=>db.prepare('SELECT count(*) n FROM shablony').get().n;
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');for(const id of [actor,peer]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(?,?,1,'polnyj',1)").run(id,'Template fixture '+id);db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'template-'+id,hash);}
  await start();const login=async id=>{const r=await api('POST','vhod/parol',{login:'template-'+id,parol:password},null);assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};cookie=await login(actor);other=await login(peer);
  let saved,key,body;
  await t.test('personal default preserves ordered literal names, description, due and trusted owner',async()=>{
   key=randomUUID();body={nazvanie:'Template ordered',tip:'vnutrennjaja',opisanie:'<b>literal</b>',schitat_fakt:'net',srok_po_umolchaniju:'3',podzadachi:['First, comma','<img src=x onerror=alert(1)>'],zapros_kljuch:key};saved=await good('POST','shablony',body,201);assert.equal(saved.avtor,actor);assert.equal(saved.obschij,false);assert.equal(saved.gotovyj,false);assert.deepEqual(saved.podzadachi_spisok,body.podzadachi);assert.equal(saved.srok_po_umolchaniju,'3');assert.equal((await read(key)).shablon.id,saved.id);assert.equal(saved.versija,db.prepare('SELECT versija FROM shablony WHERE id=?').get(saved.id).versija);
  });
  await t.test('author spoof and malformed fields do not create a row or receipt',async()=>{
   const before=count(),receipts=db.prepare('SELECT count(*) n FROM zaprosy_shablonov').get().n;for(const patch of [{avtor:peer},{podzadachi:['valid','']},{podzadachi:'text'},{nazvanie:'   '},{srok_po_umolchaniju:'-1'},{srok_po_umolchaniju:3.5},{podzadachi:[{}]},{klient_id:actor},{gotovyj:true},{kod:'next_touch'},{opisanie:[]},{nazvanie:'\u200b'},{podzadachi:['\u200b']},{podzadachi:Array(201).fill('Step')}])assert.equal((await api('POST','shablony',{...body,nazvanie:'Invalid '+randomUUID(),zapros_kljuch:randomUUID(),...patch})).status,400);
   assert.equal(count(),before);assert.equal(db.prepare('SELECT count(*) n FROM zaprosy_shablonov').get().n,receipts);
  });
  await t.test('another actor sees no private template through list, bootstrap, direct, duplicate, apply or receipt',async()=>{
   for(const route of ['shablony','zadachi/shablony','poleznoe','zagotovka_zadachi?napravlenie=synapt']){const data=await good('GET',route,undefined,200,other);assert.ok(!JSON.stringify(data).includes(body.nazvanie),route);}
   assert.equal((await api('GET','shablony/'+saved.id,undefined,other)).status,404);assert.equal((await api('POST','shablony/'+saved.id+'/dubl',{},other)).status,404);assert.equal((await api('POST','zadachi/iz_shablona',{shablon:String(saved.id),napravlenie:'synapt',sprint:'2026-W47'},other)).status,404);assert.equal((await read(key,other)).sostojanie,'ne_najdeno');
  });
  await t.test('same key replays one creation and changed body or duplicate query keys reject',async()=>{
   const before=count();const rows=await Promise.all(Array.from({length:5},()=>good('POST','shablony',body,201)));assert.ok(rows.every(r=>r.id===saved.id&&r.povtor_sozdanija));assert.equal(count(),before);assert.equal((await api('POST','shablony',{...body,nazvanie:'Different'})).status,409);assert.equal((await api('GET','shablony?zapros_kljuch='+key+'&zapros_kljuch='+randomUUID())).status,400);
  });
  await t.test('duplicate names are scoped to owner and give explicit suffix alternative',async()=>{
   const duplicate=await api('POST','shablony',{...body,nazvanie:'  TEMPLATE   ORDERED ',zapros_kljuch:randomUUID()});assert.equal(duplicate.status,409);assert.equal(duplicate.body.id,saved.id);assert.ok(duplicate.body.predlozhennoe_nazvanie.endsWith('2'));const independent=await good('POST','shablony',{...body,zapros_kljuch:randomUUID()},201,other);assert.equal(independent.avtor,peer);
  });
  await t.test('sharing opens read and apply, not owner edit or deletion',async()=>{
   saved=await good('PATCH','shablony/'+saved.id,{versija:saved.versija,obschij:true});const visible=await good('GET','shablony/'+saved.id,undefined,200,other);assert.equal(visible.avtor,actor);assert.equal(visible.mozhno_pravit,false);assert.deepEqual(visible.podzadachi_spisok,body.podzadachi);assert.equal((await api('PATCH','shablony/'+saved.id,{versija:saved.versija,nazvanie:'Stolen'},other)).status,403);assert.equal((await api('DELETE','shablony/'+saved.id,{versija:saved.versija},other)).status,403);
  });
  let task;
  await t.test('task from template gets all children, current owner, ISO year and relative due',async()=>{
   task=await good('POST','zadachi/iz_shablona',{shablon:String(saved.id),napravlenie:'synapt',sprint:'2026-W47'},201,other);assert.equal(task.otvetstvennyj,peer);assert.equal(task.god_sprinta,2026);assert.equal(task.podzadach,2);assert.deepEqual(db.prepare('SELECT nazvanie FROM zadachi WHERE roditel_id=? ORDER BY id').all(task.id).map(r=>r.nazvanie),body.podzadachi);assert.equal(db.prepare('SELECT count(*) n FROM zadachi WHERE roditel_id=? AND god_sprinta=2026').get(task.id).n,2);assert.equal(task.klient_id,null);assert.equal(task.proekt_id,null);assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(task.srok));
  });
  await t.test('changing steps and fields is atomic and leaves existing tasks independent',async()=>{
   const tasks=db.prepare('SELECT * FROM zadachi WHERE id=? OR roditel_id=? ORDER BY id').all(task.id,task.id);saved=await good('PATCH','shablony/'+saved.id,{versija:saved.versija,opisanie:'Updated',podzadachi:['New first','New second','New third']});assert.deepEqual(saved.podzadachi_spisok,['New first','New second','New third']);assert.equal(saved.opisanie,'Updated');assert.deepEqual(db.prepare('SELECT * FROM zadachi WHERE id=? OR roditel_id=? ORDER BY id').all(task.id,task.id),tasks);const before=db.prepare('SELECT * FROM shablony WHERE id=?').get(saved.id);assert.equal((await api('PATCH','shablony/'+saved.id,{versija:saved.versija,opisanie:'Must roll back',podzadachi:['valid',null]})).status,400);assert.deepEqual(db.prepare('SELECT * FROM shablony WHERE id=?').get(saved.id),before);
  });
  await t.test('direct child SQL invalidates stale step edits and supplies virtual field metadata',async()=>{
   const seen=saved.versija;db.prepare("UPDATE shablon_podzadachi SET nazvanie='External edit' WHERE shablon_id=? AND porjadok=1").run(saved.id);const conflict=await api('PATCH','shablony/'+saved.id,{versija:seen,podzadachi:['Overwrite']});assert.equal(conflict.status,409);assert.ok(conflict.body.izmenennye_polja.includes('podzadachi'));assert.equal(db.prepare('SELECT nazvanie FROM shablon_podzadachi WHERE shablon_id=? AND porjadok=1').get(saved.id).nazvanie,'External edit');saved=await good('GET','shablony/'+saved.id);
  });
  await t.test('independent description and steps edits both persist from the same observed version',async()=>{
   const seen=saved.versija;await good('PATCH','shablony/'+saved.id,{versija:seen,opisanie:'Independent note'});saved=await good('PATCH','shablony/'+saved.id,{versija:seen,podzadachi:['Independent step']});assert.equal(saved.opisanie,'Independent note');assert.deepEqual(saved.podzadachi_spisok,['Independent step']);
  });
  await t.test('duplicate copies ordered steps privately and deduplicates a lost response',async()=>{
   const key=randomUUID(),payload={zapros_kljuch:key},copy=await good('POST','shablony/'+saved.id+'/dubl',payload,201,other);assert.equal(copy.avtor,peer);assert.equal(copy.obschij,false);assert.equal(copy.gotovyj,false);assert.deepEqual(copy.podzadachi_spisok,saved.podzadachi_spisok);assert.equal((await good('POST','shablony/'+saved.id+'/dubl',payload,201,other)).id,copy.id);assert.equal((await read(key,other)).id,copy.id);
  });
  await t.test('unsharing hides the source while preserving already-created tasks',async()=>{saved=await good('PATCH','shablony/'+saved.id,{versija:saved.versija,obschij:false});assert.equal((await api('GET','shablony/'+saved.id,undefined,other)).status,404);assert.ok(db.prepare('SELECT 1 FROM zadachi WHERE id=?').get(task.id));});
  await t.test('clear steps persists an empty array and deletion is versioned, with no orphan steps',async()=>{
   const seen=saved.versija;saved=await good('PATCH','shablony/'+saved.id,{versija:seen,podzadachi:[]});assert.deepEqual(saved.podzadachi_spisok,[]);assert.equal((await api('DELETE','shablony/'+saved.id)).status,400);assert.equal((await api('DELETE','shablony/'+saved.id,{versija:seen})).status,409);await good('DELETE','shablony/'+saved.id,{versija:saved.versija});assert.equal(db.prepare('SELECT count(*) n FROM shablon_podzadachi WHERE shablon_id=?').get(saved.id).n,0);assert.ok(db.prepare('SELECT 1 FROM zadachi WHERE id=?').get(task.id));assert.equal((await read(key)).sostojanie,'udaleno');assert.equal((await api('POST','shablony',body)).status,410);
  });
  await t.test('cancel reserves unseen key and late creation is refused',async()=>{const value=randomUUID(),before=count();assert.equal((await good('POST','shablony',{zapros_kljuch:value,otmenit_dobavlenie:true})).sostojanie,'otmeneno');assert.equal((await api('POST','shablony',{nazvanie:'Late original',schitat_fakt:'net',zapros_kljuch:value})).status,409);assert.equal(count(),before);});
  await t.test('built-in templates stay immutable and can be copied into private editable templates',async()=>{
   const row=db.prepare('SELECT * FROM shablony WHERE gotovyj=1 LIMIT 1').get();assert.ok(row);assert.equal((await api('PATCH','shablony/'+row.id,{versija:row.versija,opisanie:'No'})).status,403);assert.equal((await api('DELETE','shablony/'+row.id,{versija:row.versija})).status,403);const copy=await good('POST','shablony/'+row.id+'/dubl',{zapros_kljuch:randomUUID()},201);assert.equal(copy.gotovyj,false);assert.equal(copy.mozhno_pravit,true);
  });
  await t.test('saving a task as template keeps steps and default due, not client or project',async()=>{
   const key=randomUUID(),result=await good('POST','shablony/iz_zadachi',{nomer:task.nomer,zapros_kljuch:key});assert.deepEqual(result.podzadachi_spisok,body.podzadachi);assert.equal(result.obschij,false);for(const field of ['klient_id','proekt_id','otvetstvennyj'])assert.equal(Object.hasOwn(result,field),false);assert.ok(result.srok_po_umolchaniju!==null);assert.equal((await good('POST','shablony/iz_zadachi',{nomer:task.nomer,zapros_kljuch:key})).id,result.id);
  });
  const graphSnapshot=()=>Object.fromEntries(['zadachi','zhurnal','versii_polej','rassylki','sostavy_voln','uchastniki_voln','porjadki_voln','zaprosy_zadach'].map(table=>[table,db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()]));
  await t.test('eight ready templates expose campaign requirements without creating business data',async()=>{
   const before=graphSnapshot(),rows=(await good('GET','zadachi/shablony')).spisok.filter(r=>r.gotovyj);assert.equal(rows.length,8);assert.deepEqual(rows.filter(r=>r.nuzhna_rassylka).map(r=>r.kod).sort(),['otpravit_rassylku','sobrat_bazu']);for(const row of rows){assert.equal(row.obekt,'zadacha');assert.ok(Object.hasOwn(row,'default_due'));}const filtered=await good('GET','zadachi/shablony?tip=rassylka');assert.equal(filtered.vsego,2);assert.ok(filtered.spisok.every(r=>r.nuzhna_rassylka));assert.deepEqual(graphSnapshot(),before);
  });
  await t.test('all task entry routes refuse campaign templates without a campaign and leave no graph',async()=>{
   const before=graphSnapshot(),source=db.prepare("SELECT id FROM shablony WHERE kod='sobrat_bazu'").get();
   for(const [route,patch]of [['zadachi',{tip:'rassylka'}],['zadachi',{shablon:'sobrat_bazu'}],['zadachi',{shablon:'otpravit_rassylku'}],['zadachi',{shablon:String(source.id)}],['zadachi',{shablon:'shablon_'+source.id}],['zadachi/iz_shablona',{shablon:'sobrat_bazu'}],['zadachi/iz_shablona',{shablon:'otpravit_rassylku'}]]){
    const r=await api('POST',route,{nazvanie:'Missing linked campaign',tip:'biznesovaja',napravlenie:'synapt',otvetstvennyj:actor,plan_chislo:180,...patch});assert.equal(r.status,422,JSON.stringify(r.body));assert.equal(r.body.oshibka,'nuzhna_rassylka');assert.equal(r.body.pole,'rassylka_id');assert.deepEqual(graphSnapshot(),before);
   }
  });
  let contractCampaign,collection;
  await t.test('collection template links the explicit campaign, has no implicit deadline and counts actual zero',async()=>{
   contractCampaign=await good('POST','rassylki',{nazvanie:'Contract source',napravlenie:'synapt',kto_vedet:actor,plan_chislo:180,vybor_bazy:'nikogo'},201);
   collection=await good('POST','zadachi/iz_shablona',{shablon:'sobrat_bazu',napravlenie:'synapt',rassylka_id:contractCampaign.id,plan_chislo:180},201);assert.equal(collection.rassylka_id,contractCampaign.id);assert.equal(collection.fakt,0);assert.equal(collection.srok,null);assert.equal(db.prepare('SELECT count(*) n FROM sostavy_voln WHERE zadacha_id=?').get(collection.id).n,0);
  });
  await t.test('missing or foreign direction campaign is rejected before any task, history or wave',async()=>{
   const before=graphSnapshot();for(const patch of [{rassylka_id:999999999},{rassylka_id:contractCampaign.id,napravlenie:'media'}]){const r=await api('POST','zadachi/iz_shablona',{shablon:'sobrat_bazu',napravlenie:'synapt',plan_chislo:180,...patch});assert.equal(r.status,patch.rassylka_id===999999999?400:422);assert.deepEqual(graphSnapshot(),before);}
  });
  await t.test('built-in numeric and legacy identifiers retain collection semantics',async()=>{
   const source=db.prepare("SELECT id FROM shablony WHERE kod='sobrat_bazu'").get();for(const shablon of [String(source.id),'shablon_'+source.id]){const row=await good('POST','zadachi',{nazvanie:'Resolved collection '+shablon,tip:'biznesovaja',napravlenie:'synapt',otvetstvennyj:actor,shablon,rassylka_id:contractCampaign.id,plan_chislo:180},201);assert.equal(row.shablon,'sobrat_bazu');assert.equal(row.fakt,0);assert.equal(db.prepare('SELECT count(*) n FROM sostavy_voln WHERE zadacha_id=?').get(row.id).n,0);}
   const row=await good('POST','zadachi/iz_shablona',{shablon:'shablon_'+source.id,napravlenie:'synapt',rassylka_id:contractCampaign.id,plan_chislo:180},201);assert.equal(row.shablon,'sobrat_bazu');assert.equal(row.srok,null);
  });
  await t.test('patch cannot detach campaign or move a linked task into another direction',async()=>{
   for(const patch of [{rassylka_id:null},{napravlenie:'media'}]){const before=graphSnapshot(),r=await api('PATCH','zadachi/'+collection.nomer,{versija:collection.versija,...patch});assert.equal(r.status,422);assert.deepEqual(graphSnapshot(),before);}
   const ordinary=await good('POST','zadachi',{nazvanie:'Ordinary task before campaign kind',napravlenie:'synapt',otvetstvennyj:actor},201),before=graphSnapshot(),r=await api('PATCH','zadachi/'+ordinary.nomer,{versija:ordinary.versija,shablon:'sobrat_bazu',plan_chislo:180,tip:'biznesovaja'});assert.equal(r.status,422);assert.equal(r.body.oshibka,'nuzhna_rassylka');assert.deepEqual(graphSnapshot(),before);
  });
  await t.test('numeric collection aliases cannot change a frozen sending wave into collection',async()=>{
   const source=db.prepare("SELECT id FROM shablony WHERE kod='sobrat_bazu'").get(),wave=await good('POST','zadachi',{nazvanie:'Frozen sending wave',tip:'biznesovaja',napravlenie:'synapt',otvetstvennyj:actor,rassylka_id:contractCampaign.id,shablon:'otpravit_rassylku',plan_chislo:180},201);assert.ok(db.prepare('SELECT 1 FROM sostavy_voln WHERE zadacha_id=?').get(wave.id));
   for(const shablon of [String(source.id),'shablon_'+source.id]){const before=graphSnapshot(),r=await api('PATCH','zadachi/'+wave.nomer,{versija:wave.versija,shablon});assert.equal(r.status,409);assert.deepEqual(graphSnapshot(),before);}
  });
  await t.test('closed campaign refuses new collection while existing description remains editable',async()=>{
   db.prepare("UPDATE rassylki SET status='zavershena' WHERE id=?").run(contractCampaign.id);const before=graphSnapshot(),r=await api('POST','zadachi/iz_shablona',{shablon:'sobrat_bazu',napravlenie:'synapt',rassylka_id:contractCampaign.id,plan_chislo:180});assert.equal(r.status,422);assert.deepEqual(graphSnapshot(),before);const edited=await good('PATCH','zadachi/'+collection.nomer,{versija:collection.versija,opisanie:'Existing historical task remains editable'});assert.equal(edited.opisanie,'Existing historical task remains editable');assert.equal(edited.rassylka_id,contractCampaign.id);
  });
  await t.test('legacy send_kp application uses the canonical template and still requires a client',async()=>{
   const r=await api('POST','zadachi/iz_shablona',{shablon:'send_kp',napravlenie:'synapt'});assert.equal(r.status,400);assert.equal(r.body.pole,'klient_id');
  });
  await t.test('shared template of disabled author stays visible and editable by administrator only',async()=>{
   const row=await good('POST','shablony',{nazvanie:'Disabled author',schitat_fakt:'net',obschij:true},201,other);db.prepare("UPDATE ljudi SET aktiven=0,dostup='net' WHERE id=?").run(peer);const record=await good('GET','shablony/'+row.id);assert.equal(record.vladelec_aktiven,false);assert.equal(record.mozhno_pravit,true);await good('PATCH','shablony/'+row.id,{versija:record.versija,opisanie:'Retained by admin'});
  });
  await t.test('next-touch and relative deadlines preserve the next week across ISO years',async()=>{
   const service=require('../api/shablony.js');
   for(const [today,nextSunday]of [['2026-11-17','2026-11-29'],['2026-11-22','2026-11-29'],['2026-12-28','2027-01-10'],['2027-01-01','2027-01-10']]){
    assert.equal(service.deadline({gotovyj:1,kod:'next_touch',srok_po_umolchaniju:'3'},today),nextSunday);
    assert.equal(service.deadline({gotovyj:0,srok_po_umolchaniju:'konec_sledujuschej_nedeli'},today),nextSunday);
   }
   assert.equal(service.deadline({srok_po_umolchaniju:'konec_nedeli'},'2026-11-17'),'2026-11-22');assert.equal(service.deadline({srok_po_umolchaniju:'0'},'2026-12-31'),'2026-12-31');assert.equal(service.deadline({srok_po_umolchaniju:'3'},'2026-12-31'),'2027-01-03');
   assert.equal(service.taskDueDays({sozdano:'2026-11-16 22:30:00',srok:'2026-11-20'}),3);assert.equal(service.taskDueDays({sozdano:'2026-11-16T21:00:00.000Z',srok:'2026-11-20'}),3);
   const next=db.prepare("SELECT * FROM shablony WHERE kod='next_touch'").get();const copy=await good('POST','shablony/'+next.id+'/dubl',{zapros_kljuch:randomUUID()},201);assert.equal(copy.srok_po_umolchaniju,'konec_sledujuschej_nedeli');
  });
  await t.test('legacy send_kp resolves precisely the existing otpravit_kp template',async()=>{
   const canonical=db.prepare("SELECT id FROM shablony WHERE kod='otpravit_kp'").get();const list=await good('GET','shablony?kod=send_kp');assert.equal(list.vsego,1);assert.equal(list.spisok[0].id,canonical.id);assert.equal((await good('GET','shablony/send_kp')).id,canonical.id);const before=count();const copy=await good('POST','shablony/send_kp/dubl',{},201);assert.equal(count(),before+1);assert.equal(copy.gotovyj,false);assert.equal(copy.obschij,false);assert.equal(db.prepare("SELECT count(*) n FROM shablony WHERE kod='otpravit_kp'").get().n,1);
  });
  await t.test('GET action routes cannot create templates',async()=>{
   const before=count();const id=db.prepare('SELECT id FROM shablony LIMIT 1').get().id;
   assert.equal((await api('GET','shablony/'+id+'/dubl')).status,405);assert.equal((await api('GET','shablony/iz_zadachi?nomer='+task.nomer)).status,405);assert.equal(count(),before);
  });
  await t.test('editing and deleting a template leaves twelve created task groups exactly unchanged',async()=>{
   let template=await good('POST','shablony',{nazvanie:'Twelve independent groups',tip:'vnutrennjaja',schitat_fakt:'net',srok_po_umolchaniju:'3',podzadachi:['First step','Second step']},201);
   const parents=[];for(let i=0;i<12;i++)parents.push(await good('POST','zadachi/iz_shablona',{shablon:String(template.id),napravlenie:'synapt',sprint:'2026-W47'},201));
   const query='SELECT * FROM zadachi WHERE shablon=? OR roditel_id IN ('+parents.map(()=>'?').join(',')+') ORDER BY id',args=[String(template.id),...parents.map(p=>p.id)],before=db.prepare(query).all(...args);assert.equal(before.length,36);
   template=await good('PATCH','shablony/'+template.id,{versija:template.versija,podzadachi:['Replacement step'],srok_po_umolchaniju:'7'});assert.deepEqual(db.prepare(query).all(...args),before);await good('DELETE','shablony/'+template.id,{versija:template.versija});assert.deepEqual(db.prepare(query).all(...args),before);assert.equal(db.prepare('SELECT count(*) n FROM shablon_podzadachi WHERE shablon_id=?').get(template.id).n,0);
  });
  await t.test('restart and repeat migration preserve old rows, ordered steps and receipts',async()=>{
   const before=db.prepare('SELECT * FROM shablony ORDER BY id').all(),steps=db.prepare('SELECT * FROM shablon_podzadachi ORDER BY shablon_id,porjadok').all(),metadata=db.prepare("SELECT * FROM versii_polej WHERE tablica='shablony' ORDER BY obekt_id,pole").all();await stop();execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});await start();assert.deepEqual(db.prepare('SELECT * FROM shablony ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT * FROM shablon_podzadachi ORDER BY shablon_id,porjadok').all(),steps);assert.deepEqual(db.prepare("SELECT * FROM versii_polej WHERE tablica='shablony' ORDER BY obekt_id,pole").all(),metadata);assert.equal((await read(key)).sostojanie,'udaleno');
  });
  await t.test('unknown template names fail atomically while historical task content stays independent',async()=>{
   const counts=()=>['zadachi','zhurnal','uvedomlenija'].map(table=>db.prepare('SELECT count(*) n FROM '+table).get().n),before=counts();
   const bad=await api('POST','zadachi',{nazvanie:'Must not exist',napravlenie:'synapt',otvetstvennyj:actor,shablon:'totally_missing_fixture_template'});assert.equal(bad.status,400);assert.equal(bad.body.oshibka,'shablon не найден');assert.deepEqual(counts(),before);
   const template=await good('POST','shablony',{nazvanie:'Source name literal <b>',tip:'vnutrennjaja',schitat_fakt:'net',opisanie:'Template content must not overwrite the task',zapros_kljuch:randomUUID()},201);
   let task=await good('POST','zadachi',{nazvanie:'Existing task stays unchanged',opisanie:'Independent task content',tip:'vnutrennjaja',napravlenie:'synapt',otvetstvennyj:actor,srok:'2026-12-01'},201);assert.equal(task.shablon,null);assert.equal(task.shablon_istochnik,undefined);
   const fields='SELECT nazvanie,opisanie,tip,srok,status,napravlenie,otvetstvennyj FROM zadachi WHERE id=?',original=db.prepare(fields).get(task.id);
   task=await good('PATCH','zadachi/'+task.nomer,{versija:task.versija,shablon:String(template.id)});assert.deepEqual(db.prepare(fields).get(task.id),original);assert.equal(task.shablon_istochnik.nazvanie,template.nazvanie);
   const peerRead=await good('GET','zadachi/'+task.nomer,undefined,200,other);assert.equal(peerRead.shablon_istochnik.nazvanie,'Личный шаблон');assert.equal(peerRead.shablon_istochnik.dostupen,false);
   await good('DELETE','shablony/'+template.id,{versija:template.versija});task=await good('GET','zadachi/'+task.nomer);assert.equal(task.shablon_istochnik.nazvanie,'Шаблон больше недоступен');const edited=await good('PATCH','zadachi/'+task.nomer,{versija:task.versija,opisanie:'A historical task stays editable'});assert.equal(edited.shablon,String(template.id));assert.equal(edited.opisanie,'A historical task stays editable');
   const copy=await good('POST','zadachi/'+task.nomer+'/dubl',{versija:edited.versija,zapros_kljuch:randomUUID()},201);assert.equal(copy.nazvanie,task.nazvanie);assert.equal(copy.shablon,null);assert.equal(copy.opisanie,edited.opisanie);
  });
 }finally{await stop();db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
