const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{spawn,execFileSync}=require('node:child_process');
const {sledujuschij_den}=require('../api/povtory.js');

test('next repeat respects activation and the weekday rule across month and year boundaries',()=>{
 for(const [rule,today,start,expected]of [
  [{chastota:'kazhdyj_den'},'2026-11-17','2026-12-01','2026-12-01'],
  [{chastota:'budnie'},'2026-11-17','2026-12-05','2026-12-07'],
  [{chastota:'raz_v_nedelju',den_nedeli:2},'2026-11-17','2026-12-01','2026-12-01'],
  [{chastota:'vybrannye_dni',dni:'[3,5]'},'2026-11-17','2026-12-01','2026-12-02'],
  [{chastota:'kazhdyj_den'},'2026-12-31','2026-12-01','2027-01-01'],
  [{chastota:'budnie'},'2026-12-31','2027-01-02','2027-01-04'],
  [{chastota:'raz_v_nedelju',den_nedeli:2},'2026-11-17','2026-11-01','2026-11-24'],
  [{chastota:'kazhdyj_den'},'2028-02-28','2028-02-01','2028-02-29'],
 ])assert.equal(sledujuschij_den({...rule,povtor_s:start},today),expected,JSON.stringify({rule,today,start}));
 assert.equal(sledujuschij_den({chastota:'kazhdyj_den',povtor_s:'2026-02-30'},'2026-11-17'),null);
 assert.equal(sledujuschij_den({chastota:'unknown',povtor_s:'2026-11-01'},'2026-11-17'),null);
});

test('Useful repeats use the same Moscow day as the task before and after midnight and read without writes',async t=>{
 for(const [instant,day,status,next]of [
  ['2026-11-16T20:30:00.000Z','2026-11-16','sdelano','2026-11-17'],
  ['2026-11-16T21:30:00.000Z','2026-11-17','v_plane','2026-11-18'],
 ])await t.test(instant,async()=>{
  const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-repeat-midnight-')),file=path.join(folder,'fixture.db'),actor=9900054;
  const env={...process.env,LOCUS_BAZA:file,LOCUS_TEST_AUTH:'1',NODE_ENV:'test',LOCUS_ADMIN_IDS:String(actor),LOCUS_FAJLY:path.join(folder,'files'),TZ:'America/Los_Angeles'};let server,db;
  try{
   execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});db=new DatabaseSync(file);db.prepare('INSERT INTO ljudi(id,imja,komanda,dostup)VALUES(?,?,1,?)').run(actor,'Calendar fixture','polnyj');
   const boot=`const NativeDate=Date,instant=NativeDate.parse(${JSON.stringify(instant)});global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})`;
   server=spawn(process.execPath,['-e',boot],{cwd:root,env,stdio:['ignore','pipe','pipe']});let error='';server.stderr.on('data',b=>error+=b);
   const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture startup timeout '+error)),10000);server.stdout.once('data',b=>{clearTimeout(timer);resolve(String(b).trim());});server.once('exit',()=>reject(new Error('fixture server exited '+error)));});
   const api=async(method,route,body)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method,headers:{'content-type':'application/json','x-locus-chelovek':String(actor),connection:'close'},...(body===undefined?{}:{body:JSON.stringify(body)})}),data=await r.json();assert.ok(r.status<400,route+' '+r.status+' '+JSON.stringify(data));return data;};
   const make=extra=>api('POST','zadachi',{nazvanie:'Calendar fixture',napravlenie:'synapt',otvetstvennyj:actor,povtorjaetsja:true,chastota:'kazhdyj_den',povtor_s:'2026-11-16',...extra});
   const task=await make();await api('POST','zadachi/'+task.nomer+'/otmetki',{data:'2026-11-16',versija:task.versija});
   const future=[];for(const [extra,expected]of [[{chastota:'kazhdyj_den'},'2026-12-01'],[{chastota:'budnie'},'2026-12-01'],[{chastota:'raz_v_nedelju',den_nedeli:2},'2026-12-01'],[{chastota:'vybrannye_dni',dni:[3,5]},'2026-12-02']])future.push({task:await make({povtor_s:'2026-12-01',...extra}),expected});
   const state=()=>JSON.stringify(['zadachi','otmetki_povtora','zhurnal','versii_polej'].map(table=>db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all())),before=state();
   const detail=await api('GET','zadachi/'+task.nomer),list=await api('GET','poleznoe/povtory'),aggregate=await api('GET','poleznoe?na_stranice=1'),row=list.spisok.find(z=>z.id===task.id);
   assert.deepEqual(aggregate.povtory,list.spisok);
   assert.equal(detail.den_vybora,day);assert.equal(detail.status,status);assert.equal(row.den_vybora,day);assert.equal(row.status,status);assert.equal(row.sledujuschij_den,next);assert.equal(row.dnej_bez_otmetki,0);
   for(const item of future){const row=list.spisok.find(z=>z.id===item.task.id);assert.equal(row.sledujuschij_den,item.expected);assert.ok(row.sledujuschij_den>=item.task.povtor_s);}
   assert.equal(state(),before);assert.equal(db.prepare('SELECT count(*) n FROM zadachi').get().n,5);assert.equal(db.prepare('SELECT count(*) n FROM otmetki_povtora').get().n,1);
   for(let i=0;i<41;i++)await make({nazvanie:'Repeat collection '+i,povtor_s:'2026-12-01'});
   const manyBefore=state(),all=await api('GET','poleznoe/povtory'),many=await api('GET','poleznoe?na_stranice=1');assert.equal(all.vsego,46);assert.equal(all.spisok.length,46);assert.equal(many.povtory.length,46);assert.deepEqual(many.povtory,all.spisok);assert.equal(state(),manyBefore);
   assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{if(server){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}db?.close();fs.rmSync(folder,{recursive:true,force:true});}
 });
});
