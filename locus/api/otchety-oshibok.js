                                                                           
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const contextModel=require('../public/js/error-context.js');
const inflight=new Map(),quotas=new Map(),memoryReceipts=new Map();
let workerBusy=false;
const fail=(message,kod=400,pole)=>Object.assign(new Error(message),{kod,...(pole?{pole}:{})});
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const root=()=>process.env.LOCUS_OSHIBKI_DIR||path.join(path.dirname(require('../db/puti.js').BAZA),'operational');
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function scrub(value,max){return String(value??'').replace(/\b(password|parol|token|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*[^\s&;,]+/gi,'$1=[скрыто]').slice(0,max);}
function address(value){try{const u=new URL(String(value||'/'),'https://locus.invalid');const q=new URLSearchParams();for(const [key,v]of u.searchParams)if(['nomer','id','cel','rezultat','period','napravlenie','vkladka','sprint','god','nedelja','den'].includes(key)&&/^[\p{L}\p{N}_.,: -]{1,80}$/u.test(v))q.append(key,v);return u.pathname.slice(0,300)+(q.size?'?'+q:'');}catch{return '/';}}
const contextFields=['screen','url','obekt','entity_num','poslednee_dejstvie','poslednee_dejstvie_ts','tekst_oshibki','kod_oshibki','istochnik'];
const textOrNull=(value,max)=>typeof value==='string'&&value.trim()?scrub(value.trim(),max):null;
function safeReportURL(value){const safe=contextModel.safeURL(value);return /^https?:\/\//i.test(String(value||''))?safe:safe?.replace(/^https:\/\/locus\.invalid/,'')||null;}
function formatEvent(event,metadata={}){
 let inferred={};try{inferred=contextModel.infer(new URL(event.url||event.gde||'/','https://locus.invalid'));}catch{}
 const error=textOrNull(Object.hasOwn(event,'tekst_oshibki')?event.tekst_oshibki:event.oshibka,1500);
 return {...event,ts:event.ts??event.at??null,chelovek:event.chelovek??event.actor??null,screen:event.screen??(event.gde?address(event.gde).split('?')[0]:null),url:event.url??event.gde??null,obekt:event.obekt??inferred.obekt??null,entity_num:event.entity_num??inferred.entity_num??null,poslednee_dejstvie:event.poslednee_dejstvie??textOrNull(event.nazhimala,300),poslednee_dejstvie_ts:event.poslednee_dejstvie_ts??null,tekst_oshibki:error,kod_oshibki:error?(event.kod_oshibki??event.code??null):null,user_agent:Object.hasOwn(event,'user_agent')?event.user_agent:textOrNull(metadata.userAgent,500),istochnik:event.istochnik||(event.kind==='ruchnaja'?'human':event.kind==='avto'||Object.hasOwn(event,'code')?'auto':null)};
}
function validate(body,actor){
 if(!Number.isSafeInteger(actor)||actor<1)throw fail('Нужно войти в Локус',401);
 if(!body||typeof body!=='object'||Array.isArray(body))throw fail('Нужен текст сообщения');
 for(const k of Object.keys(body))if(!['tekst','gde','nazhimala','oshibka','zapros_kljuch','tip','povtorov',...contextFields].includes(k))throw fail('Неизвестное поле отчёта',400,k);
 if(body.istochnik!==undefined&&!['human','auto'].includes(body.istochnik))throw fail('Неверный источник отчёта',400,'istochnik');
 const kind=body.tip??(body.istochnik==='auto'?'avto':'ruchnaja');if(!['ruchnaja','avto'].includes(kind)||body.istochnik&&body.istochnik!==(kind==='avto'?'auto':'human'))throw fail('Неверный вид отчёта',400,'tip');
 if(body.povtorov!==undefined&&(kind!=='avto'||!Number.isSafeInteger(body.povtorov)||body.povtorov<1||body.povtorov>1000))throw fail('Неверное число повторов',400,'povtorov');
 if(typeof body.tekst!=='string'||!body.tekst.trim()||body.tekst.length>5000)throw fail('Опиши, что произошло, до 5000 знаков',400,'tekst');
 for(const k of ['gde','nazhimala','oshibka','screen','url','obekt','poslednee_dejstvie','poslednee_dejstvie_ts','tekst_oshibki'])if(body[k]!=null&&typeof body[k]!=='string')throw fail('Нужен текст',400,k);
 if(body.entity_num!=null&&!(Number.isSafeInteger(body.entity_num)&&body.entity_num>0)&&!(typeof body.entity_num==='string'&&/^[a-z][a-z0-9_-]{0,79}$/i.test(body.entity_num)))throw fail('Нужен номер объекта',400,'entity_num');
 if(body.kod_oshibki!=null&&!Number.isSafeInteger(body.kod_oshibki)&&!(typeof body.kod_oshibki==='string'&&body.kod_oshibki.length<=80))throw fail('Неверный код ошибки',400,'kod_oshibki');
 if(body.poslednee_dejstvie_ts!=null&&!contextModel.iso(body.poslednee_dejstvie_ts))throw fail('Неверное время действия',400,'poslednee_dejstvie_ts');
 const key=body.zapros_kljuch??randomUUID();if(!uuid(key))throw fail('Нужен ключ одного отчёта',400,'zapros_kljuch');
 const error=textOrNull(Object.hasOwn(body,'tekst_oshibki')?body.tekst_oshibki:body.oshibka,1500),url=safeReportURL(body.url||body.gde||'/');let inferred={};try{inferred=contextModel.infer(new URL(url||'/','https://locus.invalid'));}catch{}
 const legacy={kind,actor,tekst:scrub(body.tekst.trim(),5000),gde:address(body.gde||body.url),nazhimala:scrub(body.nazhimala,300),oshibka:Object.hasOwn(body,'tekst_oshibki')?(error||''):scrub(body.oshibka,1500)};
 return {key:key.toLowerCase(),legacy,legacyOnly:!contextFields.some(k=>Object.hasOwn(body,k))&&body.povtorov===undefined,event:{...legacy,screen:textOrNull(body.screen,300)||address(body.gde||body.url).split('?')[0],url,obekt:textOrNull(body.obekt,80)||inferred.obekt||null,entity_num:body.entity_num??inferred.entity_num??null,poslednee_dejstvie:textOrNull(body.poslednee_dejstvie,500)||textOrNull(body.nazhimala,300),poslednee_dejstvie_ts:contextModel.iso(body.poslednee_dejstvie_ts),tekst_oshibki:error,kod_oshibki:error?(body.kod_oshibki??null):null,istochnik:kind==='avto'?'auto':'human',...(body.povtorov!==undefined?{povtorov:body.povtorov}:{})}};
}

function syncDirectory(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function folders(){const dir=root();fs.mkdirSync(path.join(dir,'reports'),{recursive:true,mode:0o700});syncDirectory(dir);syncDirectory(path.dirname(dir));return dir;}
function writeJSON(file,value){const tmp=file+'.'+randomUUID()+'.tmp';try{const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);syncDirectory(path.dirname(file));}finally{try{fs.unlinkSync(tmp);}catch{}}}
function rewrite(file,lines){const tmp=file+'.'+randomUUID()+'.tmp';try{const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,lines.join('\n')+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);syncDirectory(path.dirname(file));}finally{try{fs.unlinkSync(tmp);}catch{}}}
function files(){return ['errors.jsonl.previous','errors.jsonl'].map(n=>path.join(root(),n)).filter(f=>fs.existsSync(f));}
                                                                            
                                                                             
function enrichLegacy(){let changed=0;for(const file of files()){let dirty=false;const lines=fs.readFileSync(file,'utf8').trimEnd().split('\n').map(line=>{try{const row=JSON.parse(line),full=formatEvent(row),extra=Object.fromEntries(Object.entries(full).filter(([k])=>!Object.hasOwn(row,k)));if(Object.keys(extra).length){dirty=true;changed++;return JSON.stringify({...row,...extra});}}catch{}return line;});if(dirty)rewrite(file,lines);}return changed;}
function append(event){
 event=formatEvent(event);
 const dir=folders(),file=path.join(dir,'errors.jsonl');if(fs.existsSync(file)&&fs.statSync(file).size>2*1024*1024)fs.renameSync(file,file+'.previous');
 const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,JSON.stringify(event)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}syncDirectory(dir);return file;
}
function loggedEvent(id){for(const f of files()){let text;try{text=fs.readFileSync(f,'utf8');}catch{continue;}for(const line of text.split('\n'))try{const row=JSON.parse(line);if(row.id===id||row.report_keys?.includes(id))return row;}catch{}}return null;}
function logged(id){return !!loggedEvent(id);}
async function telegram(event){
 const token=process.env.LOCUS_REPORT_BOT_TOKEN,chat=process.env.LOCUS_REPORT_CHAT_ID;if(!token||!chat)return 'not_configured';
 const full=['Локус · сообщение об ошибке','Отчёт: '+event.id,'Участник №'+event.actor,'Экран: '+(event.screen||event.gde),event.url||event.gde,event.obekt?'Объект: '+event.obekt+(event.entity_num?' №'+event.entity_num:''):'',event.poslednee_dejstvie||event.nazhimala?'Последнее действие: '+(event.poslednee_dejstvie||event.nazhimala):'',event.poslednee_dejstvie_ts?'Время действия: '+event.poslednee_dejstvie_ts:'',event.tekst_oshibki?'Ошибка: '+event.tekst_oshibki+(event.kod_oshibki!=null?' (код '+event.kod_oshibki+')':''):'',event.tekst].filter(Boolean).join('\n');const characters=Array.from(full),text=characters.length>4000?characters.slice(0,3910).join('')+'\n[Полный текст сохранён в журнале]':full;
 try{const response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text,disable_web_page_preview:true}),signal:AbortSignal.timeout(5000)});const body=await response.json().catch(()=>null);if(response.ok&&body?.ok===true)return {status:'ok',message_id:body.result?.message_id??null};if(body?.ok===false)return 'error';return 'unknown';}catch(error){return ['ENOTFOUND','ECONNREFUSED','ENETUNREACH'].includes(error.cause?.code)?'error':'unknown';}
}
const memoryKey=id=>root()+':'+id;
function remember(record){const key=memoryKey(record.id);if(!memoryReceipts.has(key)&&memoryReceipts.size>=50)throw fail('Не удалось сохранить отчёт. Скопируй текст и отправь администратору',503);memoryReceipts.set(key,record);}
function persist(record){
 try{const dir=folders();writeJSON(path.join(dir,'reports',record.id+'.json'),record);memoryReceipts.delete(memoryKey(record.id));return true;}
 catch{remember(record);return false;}
}
function publicDelivery(record){return ['error','not_configured'].includes(record.telegram)?'failed':record.telegram==='sending'?'unknown':record.telegram;}
function outcome(record,actor){
 const telegram=publicDelivery(record),queued=record.retry_queued===true&&record.log==='ok'&&!memoryReceipts.has(memoryKey(record.id));
 const text=record.log!=='ok'?'Не удалось записать, скопируй текст и отправь администратору':telegram==='ok'?'Сообщение записано в журнал и доставлено в Telegram':telegram==='failed'?'Отправлено, записано в журнал, в Telegram пока не ушло, повторим':telegram==='not_requested'?'Ошибка записана в журнал':'Сообщение записано в журнал. Доставка в Telegram не подтверждена';
 return {kod:record.log==='ok'?200:telegram==='ok'?207:503,telo:{prinjato:record.log==='ok'||telegram==='ok',avtor_id:actor,zapros_kljuch:record.key,log:record.log==='ok'?'ok':'failed',telegram,telegram_retry_queued:queued,telegram_message_id:record.telegram_message_id??null,memory_only:memoryReceipts.has(memoryKey(record.id)),tekst:text}};
}
async function deliver(record,send){
 if(record.telegram==='sending'){record.telegram='unknown';record.retry_queued=false;persist(record);return;}
 if(!['pending','not_configured','error'].includes(record.telegram))return;
 record.telegram='sending';record.retry_queued=false;record.delivery_attempts=(record.delivery_attempts||0)+1;persist(record);
 let result;try{result=await send(record.event);}catch{result='unknown';}
 const status=typeof result==='object'&&result?result.status:result;
 record.telegram=['ok','error','unknown','not_configured'].includes(status)?status:'unknown';
 if(record.telegram==='ok'&&Number.isSafeInteger(result?.message_id))record.telegram_message_id=result.message_id;
 record.retry_queued=['error','not_configured'].includes(record.telegram);
 record.next_retry_at=record.retry_queued?new Date(Date.now()+Math.min(3600000,30000*2**Math.min(7,record.delivery_attempts-1))).toISOString():null;
 persist(record);
}
function ensureLog(record){
 if(record.log==='ok')return true;
 try{if(!logged(record.id)){if(record.event.kind==='avto'){const result=automatic({...record.event,code:null});if(result.unavailable)throw Error('log unavailable');}else append(record.event);}record.log='ok';persist(record);return true;}
 catch{record.log='failed';remember(record);return false;}
}
async function save(body,actor,{send=telegram,metadata={}}={}){
 const input=validate(body,actor),id=actor+'-'+input.key,hash=digest(input.event);let record=memoryReceipts.get(memoryKey(id));
 const file=path.join(root(),'reports',id+'.json');
 if(!record&&fs.existsSync(file))record=JSON.parse(fs.readFileSync(file,'utf8'));
 if(record){if(record.hash!==(record.hash_version===2?hash:input.legacyOnly?digest(input.legacy):null))throw fail('Под этим ключом уже другой отчёт',409);}
 else{
  if(memoryReceipts.size>=50)throw fail('Не удалось сохранить отчёт. Скопируй текст и отправь администратору',503);
  const now=Date.now(),quotaKey=memoryKey(actor+':'+input.event.kind),quota=quotas.get(quotaKey);
  if(quota&&now-quota.at<60000&&quota.count>=15)throw fail('Слишком много сообщений. Текст сохранён, попробуй через минуту',429);
  quotas.set(quotaKey,quota&&now-quota.at<60000?{at:quota.at,count:quota.count+1}:{at:now,count:1});
  if(quotas.size>10000)for(const [key,value]of quotas)if(now-value.at>60000)quotas.delete(key);
  record={id,key:input.key,hash_version:2,hash,event:formatEvent({id,at:new Date().toISOString(),...input.event},metadata),log:'pending',telegram:'pending'};
                                                                            
                                                                          
  const prior=loggedEvent(id);if(prior&&input.event.kind==='ruchnaja'){for(const [k,v]of Object.entries(input.event))if(prior[k]!==v)throw fail('Под этим ключом уже другой отчёт',409);record.event=prior;record.log='ok';record.telegram='unknown';}
  persist(record);
 }
 ensureLog(record);
 if(record.event.kind==='avto')record.telegram='not_requested';else await deliver(record,send);
 persist(record);return outcome(record,actor);
}
async function handle(body,actor,options){
 const input=validate(body,actor),key=actor+':'+input.key;
 if(inflight.has(key)){const running=inflight.get(key);if(running.hash!==digest(input.event))throw fail('Под этим ключом уже другой отчёт',409);return running.promise;}
 if(inflight.size>=30)throw fail('Журнал занят. Текст сохранён в форме, попробуй чуть позже',429);
 const promise=save({...body,zapros_kljuch:input.key},actor,options).catch(error=>{if(error.kod)throw error;throw fail('Журнал сейчас недоступен. Сохрани текст и попробуй ещё раз',503);});inflight.set(key,{hash:digest(input.event),promise});try{return await promise;}finally{inflight.delete(key);}
}
                                                                         
                                                                              
function automatic(event){
 try{
  const row=formatEvent({...event,kind:'avto',istochnik:'auto',code:event.code===undefined?500:event.code,actor:Number.isSafeInteger(event.actor)?event.actor:null,gde:address(event.gde),nazhimala:scrub(event.nazhimala,300),oshibka:scrub(event.oshibka??event.tekst_oshibki,1500),tekst:scrub(event.tekst||'Сбой запроса',1500)},{userAgent:event.userAgent});
  delete row.userAgent;delete row.method;
  const now=Date.now(),count=Number.isSafeInteger(event.povtorov)&&event.povtorov>0?Math.min(event.povtorov,1000):1;
  const fingerprint=r=>digest({code:r.kod_oshibki??r.code??null,screen:r.screen??r.gde,unknown_text:(r.kod_oshibki??r.code)==null?r.tekst_oshibki??r.oshibka:null});
  const key=fingerprint(row);
  for(const file of files().reverse()){
   const lines=fs.readFileSync(file,'utf8').trimEnd().split('\n');
   for(let n=lines.length-1;n>=0;n--){let prior;try{prior=JSON.parse(lines[n]);}catch{continue;}
    if(event.id&&(prior.id===event.id||prior.report_keys?.includes(event.id)))return {logged:false,suppressed:true,replayed:true,id:prior.id};
    if(prior.kind!=='avto'||now-Date.parse(prior.at||prior.ts)>60000||now<Date.parse(prior.at||prior.ts)||fingerprint(formatEvent(prior))!==key)continue;
    if(event.id&&(prior.report_keys?.length||0)>=1000)throw Error('repeat receipt limit');
    prior.povtorov=(prior.povtorov||1)+count;prior.last_repeat_at=new Date(now).toISOString();
    if(event.id)prior.report_keys=[...(prior.report_keys||[]),event.id];
    const actors=new Set([...(prior.actors||[]),prior.actor,row.actor].filter(Number.isSafeInteger));prior.actors=[...actors].slice(0,20);
    lines[n]=JSON.stringify(prior);rewrite(file,lines);return {logged:false,suppressed:true,id:prior.id,povtorov:prior.povtorov};
   }
  }
  const id=event.id||randomUUID();append({...row,id,at:new Date(now).toISOString(),ts:new Date(now).toISOString(),povtorov:count});return {logged:true,id,povtorov:count};
 }catch{return {logged:false,unavailable:true};}
}
function proof(key,actor){
 if(!uuid(key)||!Number.isSafeInteger(actor)||actor<1)throw fail('Нужен ключ отчёта',400,'zapros_kljuch');
 const id=actor+'-'+key.toLowerCase(),file=path.join(root(),'reports',id+'.json');let r=memoryReceipts.get(memoryKey(id));
 if(!r&&!fs.existsSync(file))return {avtor_id:actor,zapros_kljuch:key.toLowerCase(),found:false};
 if(!r)r=JSON.parse(fs.readFileSync(file,'utf8'));else ensureLog(r);
 return {...outcome(r,actor).telo,found:true};
}
function tail({source=null}={}){
 if(source&&!['human','auto'].includes(source))throw fail('Неверный источник журнала',400,'istochnik');
 enrichLegacy();const lines=[];for(const f of files())for(const l of fs.readFileSync(f,'utf8').split('\n'))try{const r=JSON.parse(l);if(!source||r.istochnik===source)lines.push(r);}catch{}
 return {file:path.join(root(),'errors.jsonl'),spisok:lines.slice(-20)};
}
async function retryQueued({send=telegram,now=Date.now()}={}){
 if(workerBusy)return {busy:true};workerBusy=true;let sent=0,recovered=0;
 try{
  for(const record of [...memoryReceipts.values()]){if(!memoryReceipts.has(memoryKey(record.id)))continue;if(ensureLog(record)&&persist(record))recovered++;}
  const folder=path.join(root(),'reports');if(!fs.existsSync(folder))return {sent,recovered};
  for(const name of fs.readdirSync(folder)){
   if(!/^\d+-[a-f0-9-]+\.json$/.test(name))continue;
   let record;try{record=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));if(!record?.event||!uuid(record.key))continue;}catch{continue;}const key=record.event.actor+':'+record.key;if(inflight.has(key))continue;
   if(record.retry_queued===undefined&&['error','not_configured'].includes(record.telegram)){record.retry_queued=true;record.next_retry_at=new Date(now).toISOString();persist(record);}
   if(record.telegram==='sending'){record.telegram='unknown';record.retry_queued=false;persist(record);continue;}
   if(record.retry_queued&&Date.parse(record.next_retry_at)<=now&&sent<10){
    const promise=(async()=>{if(!ensureLog(record))return;await deliver(record,send);sent++;})();inflight.set(key,{hash:record.hash,promise});try{await promise;}finally{inflight.delete(key);}
   }
  }
  return {sent,recovered};
 }finally{workerBusy=false;}
}
function startWorker(){
 if(process.env.LOCUS_REPORT_WORKER!=='1')return ()=>{};
 try{enrichLegacy();}catch{}
 let active=Promise.resolve();const run=()=>{active=retryQueued().catch(()=>{});},timer=setInterval(run,30000);timer.unref();run();return ()=>{clearInterval(timer);return active;};
}
module.exports={handle,automatic,tail,proof,validate,address,scrub,formatEvent,enrichLegacy,retryQueued,startWorker};
