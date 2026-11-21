const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process'),{randomBytes,scryptSync}=require('node:crypto');

test('one goal exposes a separate, read only and privacy protected view window',async t=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-goal-window-')),file=path.join(folder,'fixture.db'),actor=9900820,peer=actor+1,restricted=actor+2;
 const env={...process.env,LOCUS_BAZA:file,LOCUS_FAJLY:path.join(folder,'files'),LOCUS_TEST_AUTH:'0',LOCUS_ADMIN_IDS:String(actor),NODE_ENV:'test',LOCUS_REPORT_WORKER:'0',LOCUS_REPORT_BOT_TOKEN:'',LOCUS_REPORT_CHAT_ID:''};
 let db,server,base;const cookies=new Map(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()),year=String(Number(today.slice(0,4))-1);
 const api=async(method,route,body,who=actor)=>{const r=await fetch(base+'/api/'+route,{method,headers:{connection:'close','content-type':'application/json',...(cookies.has(who)?{cookie:cookies.get(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};};
 const good=async(method,route,body,status=200,who=actor)=>{const r=await api(method,route,body,who);assert.equal(r.status,status,route+' '+JSON.stringify(r.body));return r.body;};
 const state=()=>JSON.stringify(['celi','rezultaty','zamery','zadachi','zhurnal','snimki_planerki'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()));
 const make=async(extra={})=>{const goal=await good('POST','celi',{nazvanie:'Synthetic stable window identity',napravlenie:'synapt',period_id:year,sostojanie:'aktivna',...extra},201),result=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic sourced manual metric',tip:'chislo',istochnik:'ruchnoj_zamer',baza:0,plan:500},201);return {goal,result};};
 try{
  execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync('temporary-goal-window',salt,64).toString('hex');
  for(const id of [actor,peer,restricted]){db.prepare("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven,rol_v_baze)VALUES(?,?,1,?,1,'sobstvennyj')").run(id,'Synthetic window member '+id,id===restricted?'bez_deneg':'polnyj');db.prepare('INSERT INTO vhod(chelovek_id,login,parol_hesh)VALUES(?,?,?)').run(id,'window-'+id,hash);}
  server=spawn(process.execPath,['-e',"require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,env,stdio:['ignore','pipe','pipe']});server.stderr.on('data',()=>{});base='http://127.0.0.1:'+await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('window fixture startup')),10000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});server.once('exit',()=>{clearTimeout(timer);reject(new Error('window fixture stopped'));});});
  for(const id of [actor,peer,restricted]){const r=await api('POST','vhod/parol',{login:'window-'+id,parol:'temporary-goal-window'},id);assert.equal(r.status,200);cookies.set(id,r.headers.get('set-cookie').split(';')[0]);}
  await t.test('switching the selected month keeps the goal and its original plan while using the dated fact and source',async()=>{
   const {goal,result}=await make();for(const [data,znachenie]of [[year+'-10-31',25],[year+'-11-10',50]])await good('POST','zamery',{rezultat_id:result.id,znachenie,data,otkuda:'Synthetic verified source '+data},201);
   const before=state(),canonical=await good('GET','okr?nomer='+goal.id);assert.equal(canonical.rezultaty[0].fakt,50);assert.equal(canonical.srez_perioda,undefined);
   for(const [period,fact,date]of [[year+'-10',25,year+'-10-31'],[year+'-11',50,year+'-11-10'],[year,50,year+'-11-10']]){
    const viewed=await good('GET','okr?nomer='+goal.id+'&okno='+period);assert.equal(viewed.id,goal.id);assert.equal(String(viewed.period_id),year);assert.equal(viewed.rezultaty[0].plan,500);assert.equal(viewed.rezultaty[0].fakt,50);const snapshot=viewed.srez_perioda;assert.equal(snapshot.id,goal.id);assert.equal(snapshot.okno.period,period);assert.equal(snapshot.rezultaty[0].id,result.id);assert.equal(snapshot.rezultaty[0].fakt,fact);assert.equal(snapshot.rezultaty[0].obnovleno,date);assert.equal(snapshot.rezultaty[0].otkuda,'Synthetic verified source '+date);assert.equal(snapshot.rezultaty[0].kto,actor);assert.equal(snapshot.rezultaty[0].plan,period===year?500:null);assert.equal(snapshot.rezultaty[0].plan_na_okno_zadan,period===year);assert.equal(state(),before);
   }
   await make();const listBefore=state(),list=await good('GET','okr?cel='+goal.id+'&period='+year+'&okno='+year+'-10');assert.equal(list.celi.length,1);assert.equal(list.celi[0].id,goal.id);assert.equal(list.celi[0].srez_perioda.rezultaty[0].fakt,25);assert.equal(state(),listBefore);
  });
  await t.test('a missing observation is unknown and a known zero stays an actual zero',async()=>{
   const {goal,result}=await make();let view=await good('GET','okr?nomer='+goal.id+'&okno='+year+'-10');assert.equal(view.srez_perioda.rezultaty[0].fakt,null);assert.ok(view.srez_perioda.rezultaty[0].pochemu_net_fakta);
   await good('POST','zamery',{rezultat_id:result.id,znachenie:0,data:year+'-10-31',otkuda:'Synthetic verified zero'},201);view=await good('GET','okr?nomer='+goal.id+'&okno='+year+'-10');assert.equal(view.srez_perioda.rezultaty[0].fakt,0);assert.equal(view.srez_perioda.rezultaty[0].otkuda,'Synthetic verified zero');
   const outside=await good('GET','okr?nomer='+goal.id+'&okno='+String(Number(year)+2));assert.equal(outside.srez_perioda.okno.dostupno,false);assert.equal(outside.srez_perioda.rezultaty[0].fakt,null);assert.ok(outside.srez_perioda.okno.pochemu.includes('не пересекается'));
  });
  await t.test('financial facts and plans stay hidden inside the nested window and private goals stay invisible',async()=>{
   const {goal}=await make(),money=await good('POST','rezultaty',{cel_id:goal.id,nazvanie:'Synthetic protected metric',tip:'dengi',istochnik:'ruchnoj_zamer',baza:0,plan:987654322},201);await good('POST','zamery',{rezultat_id:money.id,znachenie:987654321,data:year+'-10-31',otkuda:'Synthetic protected source'},201);
   const visible=await good('GET','okr?nomer='+goal.id+'&okno='+year+'-10');assert.equal(visible.srez_perioda.rezultaty.find(row=>row.id===money.id).fakt,987654321);
   const hidden=await good('GET','okr?nomer='+goal.id+'&okno='+year+'-10',undefined,200,restricted);assert.ok(!JSON.stringify(hidden).includes('98765432'));assert.ok(!JSON.stringify(hidden).includes('Synthetic protected source'));assert.deepEqual(hidden.srez_perioda.rezultaty.find(row=>row.id===money.id).skryto,['dengi']);
   const draft=await make({sostojanie:'chernovik'});for(const view of [year+'-10','invalid']){const before=state();assert.equal((await api('GET','okr?nomer='+draft.goal.id+'&okno='+view,undefined,peer)).status,404);assert.equal(state(),before);}
  });
  await t.test('malformed or ambiguous view parameters do not read another period or write any state',async()=>{
   const {goal}=await make();for(const suffix of ['&okno=','&okno=2026-13','&okno=2026-Q5','&okno=invalid','&okno='+year+'-10&okno='+year+'-11']){const before=state();assert.equal((await api('GET','okr?nomer='+goal.id+suffix)).status,400);assert.equal(state(),before);}assert.equal((await api('GET','okr?okno='+year+'-10')).status,400);
  });
 }finally{db?.close();if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}fs.rmSync(folder,{recursive:true,force:true});}
});
