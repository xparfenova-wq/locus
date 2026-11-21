const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const reports=require('../api/otchety-oshibok');
test('literal error contracts preserve context, counts and independent delivery during failures',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'locus-report-contracts-')),previous=process.env.LOCUS_OSHIBKI_DIR;process.env.LOCUS_OSHIBKI_DIR=dir;
 const input=extra=>({zapros_kljuch:crypto.randomUUID(),tekst:'A complete synthetic report',screen:'Synapt, задача 4827',url:'https://locus.example/synapt/4827',obekt:'zadacha',entity_num:4827,poslednee_dejstvie:'click:sohranit_zadachu:4827',poslednee_dejstvie_ts:new Date().toISOString(),tekst_oshibki:null,kod_oshibki:null,istochnik:'human',...extra});
 const rows=()=>fs.readFileSync(path.join(dir,'errors.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 try{
  await t.test('ten reports distinguish five errors from five true absences; all eleven literal fields are physical',async()=>{
   for(let n=0;n<10;n++)await reports.handle(input(n<5?{tekst_oshibki:'Сбой '+n,kod_oshibki:500+n}:{}),810001,{metadata:{userAgent:'Trusted synthetic browser'},send:async()=>({status:'ok',message_id:100+n})});
   for(const [i,row]of rows().entries()){for(const key of ['ts','chelovek','screen','url','obekt','entity_num','poslednee_dejstvie','tekst_oshibki','kod_oshibki','user_agent','istochnik'])assert.ok(Object.hasOwn(row,key),key);assert.equal(row.chelovek,810001);assert.equal(row.user_agent,'Trusted synthetic browser');assert.equal(row.entity_num,4827);assert.equal(row.url,'https://locus.example/synapt/4827');assert.equal(row.tekst_oshibki,i<5?'Сбой '+i:null);assert.equal(row.kod_oshibki,i<5?500+i:null);}
   await assert.rejects(reports.handle(input({user_agent:'forged'}),810002),e=>e.kod===400);
  });
  await t.test('ten automatic occurrences yield exactly one durable row even after restart and replay',async()=>{
   const before=rows().length,body=input({istochnik:'auto',tekst_oshibki:'Same code and screen',kod_oshibki:'FIXTURE_REPEAT'});await reports.handle(body,810003);
   for(let n=0;n<8;n++)reports.automatic({screen:body.screen,url:body.url,kod_oshibki:body.kod_oshibki,tekst_oshibki:body.tekst_oshibki});
   const batch={...body,zapros_kljuch:crypto.randomUUID()};await reports.handle(batch,810003);await reports.handle(batch,810003);
   assert.equal(rows().length,before+1);assert.equal(rows().at(-1).povtorov,10);
   execFileSync(process.execPath,['-e',`require('./api/otchety-oshibok').handle(${JSON.stringify(batch)},810003).then(()=>{})`],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:'pipe'});assert.equal(rows().at(-1).povtorov,10);
   const r=rows().at(-1);r.at=r.ts=new Date(Date.now()-61000).toISOString();const all=rows();all[all.length-1]=r;fs.writeFileSync(path.join(dir,'errors.jsonl'),all.map(JSON.stringify).join('\n')+'\n');reports.automatic({screen:body.screen,kod_oshibki:body.kod_oshibki,tekst_oshibki:body.tekst_oshibki});assert.equal(rows().length,before+2);
  });
  await t.test('a definite rejection queues a durable bounded retry; unknown delivery never does',async()=>{
   const first=input();let attempts=0;const r=await reports.handle(first,810004,{send:async()=>{attempts++;return 'error';}});assert.equal(r.kod,200);assert.equal(r.telo.telegram,'failed');assert.equal(r.telo.telegram_retry_queued,true);assert.equal(r.telo.log,'ok');
   await reports.retryQueued({now:Date.now(),send:async()=>{throw Error('backoff must not send');}});assert.equal(attempts,1);
   const retry=await reports.retryQueued({now:Date.now()+60000,send:async()=>{attempts++;return {status:'ok',message_id:4827};}});assert.equal(retry.sent,1);assert.equal(attempts,2);const proof=reports.proof(first.zapros_kljuch,810004);assert.equal(proof.telegram,'ok');assert.equal(proof.telegram_message_id,4827);assert.equal(proof.telegram_retry_queued,false);
   const second=input();await reports.handle(second,810005,{send:async()=> 'unknown'});await reports.retryQueued({now:Date.now()+3600001,send:async()=>{throw Error('unknown must not resend');}});assert.equal(reports.proof(second.zapros_kljuch,810005).telegram_retry_queued,false);
  });
  await t.test('independent delivery survives a failed disk and later persists without resending',async()=>{
   const original=dir+'.saved';fs.renameSync(dir,original);fs.writeFileSync(dir,'Synthetic disk failure');let attempts=0;const body=input();
   try{for(let i=0;i<2;i++){const r=await reports.handle(body,810006,{send:async()=>{attempts++;return 'ok';}});assert.equal(r.kod,207);assert.equal(r.telo.log,'failed');assert.equal(r.telo.telegram,'ok');assert.equal(r.telo.memory_only,true);}assert.equal(attempts,1);assert.equal(reports.proof(body.zapros_kljuch,810006).found,true);}
   finally{fs.unlinkSync(dir);fs.renameSync(original,dir);}
   await reports.retryQueued({now:Date.now()+3600001,send:async()=>{throw Error('acknowledged delivery must not resend');}});assert.equal(reports.proof(body.zapros_kljuch,810006).log,'ok');assert.equal(rows().filter(r=>r.id==='810006-'+body.zapros_kljuch).length,1);
  });
  await t.test('neither a failed disk nor two failed paths are reported as success',async()=>{
   const original=dir+'.saved';fs.renameSync(dir,original);fs.writeFileSync(dir,'Synthetic disk failure');const body=input();try{const r=await reports.handle(body,810007,{send:async()=> 'error'});assert.equal(r.kod,503);assert.equal(r.telo.prinjato,false);assert.equal(r.telo.log,'failed');assert.equal(r.telo.telegram,'failed');}finally{fs.unlinkSync(dir);fs.renameSync(original,dir);}
  });
  await t.test('a legacy receipt replays unchanged, and upgrading a legacy line preserves every original value',async()=>{
   const body={zapros_kljuch:crypto.randomUUID(),tekst:'Legacy fixture',gde:'/zadachi.html?nomer=4827',nazhimala:'нажать',oshibka:''},legacy={kind:'ruchnaja',actor:810008,tekst:body.tekst,gde:body.gde,nazhimala:body.nazhimala,oshibka:''},event={id:'810008-'+body.zapros_kljuch,at:'2026-11-19T00:00:00Z',...legacy};
   fs.appendFileSync(path.join(dir,'errors.jsonl'),JSON.stringify(event)+'\n');fs.writeFileSync(path.join(dir,'reports',event.id+'.json'),JSON.stringify({id:event.id,key:body.zapros_kljuch,hash:crypto.createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),event,log:'ok',telegram:'ok'}));await reports.handle(body,810008,{send:async()=>{throw Error('legacy ack must not resend');}});assert.ok(reports.enrichLegacy()>0);const enriched=rows().find(r=>r.id===event.id);for(const[k,v]of Object.entries(event))assert.deepEqual(enriched[k],v);assert.equal(enriched.user_agent,null);assert.equal(enriched.istochnik,'human');assert.ok(reports.tail({source:'auto'}).spisok.every(r=>r.istochnik==='auto'));assert.ok(reports.tail({source:'human'}).spisok.every(r=>r.istochnik==='human'));assert.throws(()=>reports.tail({source:'other'}),e=>e.kod===400);
  });
  await t.test('a lost receipt never authorizes a duplicate message and a queued rejection survives a real restart',async()=>{
   const own=path.join(dir,'restart');process.env.LOCUS_OSHIBKI_DIR=own;
   try{
    const body=input();await reports.handle(body,810009,{send:async()=> 'ok'});fs.unlinkSync(path.join(own,'reports','810009-'+body.zapros_kljuch+'.json'));
    const r=await reports.handle(body,810009,{send:async()=>{throw Error('lost receipt must not duplicate acknowledged delivery');}});assert.equal(r.telo.telegram,'unknown');assert.equal(r.telo.telegram_retry_queued,false);
    const pending=input();await reports.handle(pending,810010,{send:async()=> 'error'});const counter=path.join(own,'sent.txt');
    execFileSync(process.execPath,['-e',`global.fetch=async()=>{require('fs').appendFileSync(${JSON.stringify(counter)},'unexpected');throw Error('must not send on import')};require('./server');setTimeout(()=>process.exit(require('fs').existsSync(${JSON.stringify(counter)})?2:0),60);`],{cwd:path.resolve(__dirname,'..'),env:{...process.env,LOCUS_REPORT_WORKER:'1',LOCUS_BAZA:path.join(own,'unused.db')},stdio:'pipe'});assert.equal(fs.existsSync(counter),false);
    execFileSync(process.execPath,['-e',`require('./api/otchety-oshibok').retryQueued({now:Date.now()+60001,send:async()=>{require('fs').appendFileSync(${JSON.stringify(counter)},'sent');return {status:'ok',message_id:91234}}}).then(r=>{if(r.sent!==1)process.exit(2)})`],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:'pipe'});assert.equal(fs.readFileSync(counter,'utf8'),'sent');assert.equal(reports.proof(pending.zapros_kljuch,810010).telegram_message_id,91234);
   }finally{process.env.LOCUS_OSHIBKI_DIR=dir;}
  });
 }finally{if(previous===undefined)delete process.env.LOCUS_OSHIBKI_DIR;else process.env.LOCUS_OSHIBKI_DIR=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
