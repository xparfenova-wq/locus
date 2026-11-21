const {createHash,createHmac}=require('node:crypto');
const {baza,seichas,segodnja,v_api,v_odnoj_tranzakcii,OshibkaVvoda,Konflikt,NeNajdeno}=require('../db/db.js');
const snapshots=require('./snimki-akkaunta.js');
const configuration=require('./kontekst-akkaunta.js').kontekst;
const epoch=(db,object,id)=>db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt=? AND obekt_id=? AND pole='sozdano'").get(object,id)?.id??null;
const known=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function valid(db,task,link){
 if(!task||!link||task.udaleno===1||task.publikacija!==1||task.akkaunt_id!==link.akkaunt_id||epoch(db,'zadacha',task.id)!==link.sobytie_zadachi)return false;
 const account=db.prepare('SELECT * FROM akkaunty WHERE id=? AND COALESCE(udalen,0)=0').get(link.akkaunt_id);
 if(!account||account.ploshadka!==task.ploshadka||epoch(db,'akkaunt',account.id)!==link.sobytie_akkaunta||configuration(db,account)!==link.akkaunt_kontekst)return false;
 const selected=db.prepare('SELECT daty_izmerenij FROM publikacii WHERE id=? AND akkaunt_id=?').get(link.publikacija_id,link.akkaunt_id),identity=snapshots.daty(selected)._akkaunt?.data_vyhoda;if(identity&&identity!==link.akkaunt_kontekst)return false;
 try{require('./akkaunt-zadachi.js').validate(db,{akkaunt_id:task.akkaunt_id},task,task.versija);}catch(error){if([400,403,404,409].includes(error.kod))return false;throw error;}
 return true;
}
                                                                          
                                                                        
                                                                         
function postDate(db,link,post){
 if(!post)return null;const identity=snapshots.daty(post)._akkaunt?.data_vyhoda;
 if(identity&&identity!==link.akkaunt_kontekst)return null;
 if(!identity){const account=db.prepare('SELECT * FROM akkaunty WHERE id=?').get(link.akkaunt_id);if(!account||epoch(db,'akkaunt',account.id)!==link.sobytie_akkaunta||configuration(db,account)!==link.akkaunt_kontekst)return null;}
 return require('./vremja-obschenija.js').den(post.data_vyhoda);
}
function actualDate(db,task,link){
 if(!link||task.id!==link.zadacha_id||task.akkaunt_id!==link.akkaunt_id||epoch(db,'zadacha',task.id)!==link.sobytie_zadachi)return null;
 return postDate(db,link,db.prepare('SELECT * FROM publikacii WHERE id=? AND akkaunt_id=?').get(link.publikacija_id,link.akkaunt_id));
}
function measurement(db,link,day=segodnja()){
 const raw=db.prepare('SELECT * FROM publikacii WHERE id=? AND akkaunt_id=?').get(link.publikacija_id,link.akkaunt_id);
 if(!raw)return {znachenie:null,data:null,kogda:null,pochemu:'Связанная публикация больше не найдена.'};
 const post=require('./metriki-akkaunta.js').publikacijaPoId(db,raw.id,day,link.akkaunt_kontekst),meta=snapshots.daty(post),level=meta._uroven?.ohvat;
 if(!post||!known(post.ohvat)||!['mtproto','graph'].includes(level))return {znachenie:null,data:null,kogda:null,pochemu:'Подтверждённого охвата из личной статистики пока нет.'};
 const publicationDay=postDate(db,link,raw);if(publicationDay&&meta.ohvat&&meta.ohvat<publicationDay)return {znachenie:null,data:null,kogda:null,pochemu:'Замер датирован раньше выхода публикации. Нужен новый замер.'};
 return {znachenie:post.ohvat,data:meta.ohvat??null,kogda:snapshots.momentPolja(post,'ohvat'),pochemu:null};
}
                                                                         
                                                                       
function observedReach(db,task,link,day=segodnja()){
 require('./kalendar.js').data(day,'den');
 if(!link||task.id!==link.zadacha_id||task.akkaunt_id!==link.akkaunt_id||epoch(db,'zadacha',task.id)!==link.sobytie_zadachi)return {znachenie:null,data:null,kogda:null};
 const candidates=[],post=measurement(db,link,day);
 if(known(post.znachenie))candidates.push(post);
 if(link.versija_zamera>0&&known(task.ohvat)&&link.ohvat_data&&link.ohvat_data<=day)candidates.push({znachenie:task.ohvat,data:link.ohvat_data,kogda:link.ohvat_moment});
 const rows=db.prepare("SELECT stalo FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='ohvat_zamer' AND id>=? ORDER BY id DESC").all(task.id,link.sobytie_zadachi??0);
 for(const row of rows){let value;try{value=JSON.parse(row.stalo);}catch{continue;}
  if(value?.istochnik!=='sborschik'||value.publikacija_id!==link.publikacija_id||value.akkaunt_id!==link.akkaunt_id||value.akkaunt_kontekst!==link.akkaunt_kontekst||!known(value.znachenie)||typeof value.data!=='string'||value.data>day)continue;
  try{require('./kalendar.js').data(value.data,'data');}catch{continue;}
  candidates.push({znachenie:value.znachenie,data:value.data,kogda:typeof value.kogda==='string'&&Number.isFinite(Date.parse(value.kogda))?new Date(value.kogda).toISOString():null});
 }
 const published=actualDate(db,task,link)||require('./vremja-obschenija.js').den(task.data_vyhoda);
 return candidates.filter(v=>v.data&&v.data<=day&&(!published||v.data>=published)).sort((a,b)=>b.data.localeCompare(a.data)||(b.kogda??'').localeCompare(a.kogda??''))[0]??{znachenie:null,data:null,kogda:null};
}
function syncOne(db,task,link,options={}){return v_odnoj_tranzakcii(db,()=>syncOneInside(db,task,link,options));}
function syncOneInside(db,task,link,{replace=false}={}){
 if(!valid(db,task,link))return {obnovleno:false,pochemu:'Контекст задачи или аккаунта изменился. Проверь связь с публикацией.'};
 const value=measurement(db,link);
 if(value.znachenie===null){
                                                                            
                                                                         
  if(replace&&task.ohvat!==null)db.prepare('UPDATE zadachi SET ohvat=NULL,versija=coalesce(versija,0)+1 WHERE id=?').run(task.id);
  return {obnovleno:false,pochemu:value.pochemu};
 }
 if(!replace&&link.ohvat_data){
  if(!value.data||value.data<link.ohvat_data)return {obnovleno:false};
  if(value.data===link.ohvat_data&&link.ohvat_moment&&(!value.kogda||value.kogda<link.ohvat_moment))return {obnovleno:false};
 }
 if(!replace&&task.ohvat===value.znachenie&&link.ohvat_data===value.data&&link.ohvat_moment===value.kogda)return {obnovleno:false};
 return require('./versii.js').s_avtorom(db,null,()=>{
  if(task.ohvat!==value.znachenie)db.prepare('UPDATE zadachi SET ohvat=?,versija=coalesce(versija,0)+1 WHERE id=?').run(value.znachenie,task.id);
  db.prepare('UPDATE istochniki_publikacij_zadach SET ohvat_data=?,ohvat_moment=?,poluchen_at=?,versija_zamera=versija_zamera+1 WHERE zadacha_id=?').run(value.data,value.kogda,seichas(),task.id);
  const observation={publikacija_id:link.publikacija_id,akkaunt_id:link.akkaunt_id,akkaunt_kontekst:link.akkaunt_kontekst,znachenie:value.znachenie,data:value.data,kogda:value.kogda,istochnik:'sborschik'};
  require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'ohvat_zamer',null,JSON.stringify(observation),null,task);
  return {obnovleno:true};
 });
}
function syncAccount(db,id,publicationIds){return v_odnoj_tranzakcii(db,()=>syncAccountInside(db,id,publicationIds));}
function syncAccountInside(db,id,publicationIds){
 const ids=publicationIds?new Set(publicationIds):null;let updated=0;
 for(const link of db.prepare('SELECT * FROM istochniki_publikacij_zadach WHERE akkaunt_id=?').all(id)){
  if(ids&&!ids.has(link.publikacija_id))continue;
  const task=db.prepare('SELECT * FROM zadachi WHERE id=?').get(link.zadacha_id);
  if(syncOne(db,task,link).obnovleno)updated++;
 }
 return updated;
}
const SETTINGS=['publikacija','ploshadka','format','data_vyhoda','rubrika','akkaunt_id','plan_chislo'];
const DEPENDENCIES=['publikacija','ploshadka','akkaunt_id','data_vyhoda','tip','napravlenie','klient_id','proekt_id','sotrudnichestvo_id','cel_id','rezultat_id','udaleno'];
const ACCOUNT_DEPENDENCIES=['ploshadka','ssylka','napravlenie','proekt_id','vladelec','udalen'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
function positive(value,field){if(!['number','string'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new OshibkaVvoda('Нужен положительный номер',field);return Number(value);}
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value))throw new OshibkaVvoda('Нужен объект параметров');for(const key of Object.keys(value))if(!allowed.includes(key))throw new OshibkaVvoda('Неизвестный параметр источника публикации',key);}
function key(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одной операции','zapros_kljuch');return hash(value.toLowerCase());}
function sourceEvent(db,id){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='publikacija_istochnik'").get(id).id;}
function versions(db,table,id,selected){return db.prepare('SELECT pole,versija FROM versii_polej WHERE tablica=? AND obekt_id=? ORDER BY pole').all(table,id).filter(row=>selected.includes(row.pole));}
function load(db,number,actor,{deleted=false}={}){
 const task=db.prepare('SELECT * FROM zadachi WHERE nomer=?').get(number);if(!task)throw new NeNajdeno('Задачи нет');
 require('./pravila-otveta.js').proverit(db,{tablica:'zadachi',kljuch:number,zapros:{},telo:{},avtor:actor,metod:'GET'});
 if(!deleted&&task.udaleno===1)throw new Konflikt('Задача удалена. Источник не изменён.');return task;
}
function context(db,task){
 const link=db.prepare('SELECT * FROM istochniki_publikacij_zadach WHERE zadacha_id=?').get(task.id),account=task.akkaunt_id?db.prepare('SELECT * FROM akkaunty WHERE id=?').get(task.akkaunt_id):null;
 return hash({id:task.id,nomer:task.nomer,epoch:epoch(db,'zadacha',task.id),fields:Object.fromEntries(DEPENDENCIES.map(field=>[field,task[field]??null])),versions:versions(db,'zadachi',task.id,DEPENDENCIES),source:link?{id:link.publikacija_id,account:link.akkaunt_id,context:link.akkaunt_kontekst,version:link.versija}:null,event:sourceEvent(db,task.id),account:account?{context:configuration(db,account),versions:versions(db,'akkaunty',account.id,ACCOUNT_DEPENDENCIES)}:null});
}
function safeURL(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function postContext(post){return hash(Object.fromEntries(['id','akkaunt_id','publikacija_id','data_vyhoda','ssylka','zagolovok','format'].map(field=>[field,post[field]??null])));}
function postDTO(db,post,account){
 const day=require('./vremja-obschenija.js').den(post.data_vyhoda);
 return {id:post.id,akkaunt_id:post.akkaunt_id,nazvanie:typeof post.zagolovok==='string'&&post.zagolovok.trim()?Array.from(post.zagolovok).slice(0,300).join(''):'Публикация '+post.publikacija_id,ssylka:safeURL(post.ssylka),data:day,format:post.format??null,kontekst_publikacii:postContext(post),akkaunt_kontekst:configuration(db,account)};
}
function presentation(db,task,actor){
 const safe=actor?require('./obschij.js').bez_summ('zadachi',v_api(task),actor):task;
 const link=db.prepare('SELECT * FROM istochniki_publikacij_zadach WHERE zadacha_id=?').get(task.id),account=task.akkaunt_id?db.prepare('SELECT * FROM akkaunty WHERE id=? AND COALESCE(udalen,0)=0').get(task.akkaunt_id):null,matched=link?valid(db,task,link):false;
 const post=matched?db.prepare('SELECT * FROM publikacii WHERE id=? AND akkaunt_id=?').get(link.publikacija_id,link.akkaunt_id):null;
 const last=account?db.prepare('SELECT kogda,uspeh,uroven FROM zapuski_sbora WHERE akkaunt_id=? AND uspeh IS NOT NULL ORDER BY julianday(kogda) DESC,id DESC LIMIT 1').get(account.id):null;
 const attempt=post?snapshots.daty(post)._popytka_ohvata:null,missing=attempt&&attempt.akkaunt===link.akkaunt_kontekst&&attempt.poluchen===false&&(!link.ohvat_moment||attempt.kogda>link.ohvat_moment)?{data:attempt.data,kogda:attempt.kogda}:null;
 const failed=last?.uspeh===0&&(!link?.ohvat_moment||Date.parse(last.kogda.replace(' ','T')+'Z')>Date.parse(link.ohvat_moment))?{data:require('./vremja-obschenija.js').den(last.kogda+'Z'),kogda:new Date(last.kogda.replace(' ','T')+'Z').toISOString()}:null;
 const failure=missing&&failed?(missing.kogda>failed.kogda?missing:failed):missing||failed;
 const sourceDate=actualDate(db,task,link),dateConflict=!!sourceDate&&sourceDate!==require('./vremja-obschenija.js').den(task.data_vyhoda);
 return {zadacha_id:task.id,nomer:task.nomer,versija:task.versija,publikacija:task.publikacija===1,ploshadka:safe.ploshadka??null,format:safe.format??null,rubrika:safe.rubrika??null,udaleno:task.udaleno===1,data_vyhoda:task.data_vyhoda,kontekst_istochnika:context(db,task),akkaunt:account?{id:account.id,nazvanie:account.nazvanie,ploshadka:account.ploshadka,aktiven:account.aktiven===1,uroven:account.uroven}:null,istochnik:post?postDTO(db,post,account):null,svjazan:!!link,svjaz_dejstvitelna:matched&&!!post,ohvat:task.ohvat??null,ohvat_podtverzhden:!!link&&matched&&known(task.ohvat)&&link.versija_zamera>0&&(!sourceDate||!!link.ohvat_data&&link.ohvat_data>=sourceDate),ohvat_data:link?.ohvat_data??null,ohvat_moment:link?.ohvat_moment??null,poluchen_at:link?.poluchen_at??null,poslednij_sbor:last??null,ohvat_oshibka:failure??null,data_istochnika:sourceDate,nuzhno_podtverdit_datu:dateConflict,pochemu:link&&!matched?'Контекст источника изменился. Проверь связь перед новым замером.':link&&!post?'Связанная публикация больше не найдена. Прежнее измерение сохранено.':dateConflict?'Дата задачи расходится с источником. Подтверди фактическую дату выхода.':!link&&task.ohvat!=null?'Ранее сохранённое значение пока не связано с подтверждённым источником.':null};
}
function receipt(db,actor,number,taskId,value){
 const row=db.prepare('SELECT * FROM zaprosy_istochnikov_publikacij WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));
 if(row&&(row.nomer_zadachi!==number||row.zadacha_id!==taskId))throw new Konflikt('Ключ относится к другой задаче',{operation_key_reused:true});return row;
}
function proof(db,actor,number,taskId,value){
 const saved=receipt(db,actor,number,taskId,value),identity={avtor_id:actor,zadacha_id:taskId,nomer:number,obekt:'publikacija_istochnik'};
 if(!saved)return {...identity,sostojanie:'ne_najdeno'};
 if(!saved.sohraneno)return {...identity,sostojanie:'otmeneno'};
 const row=db.prepare('SELECT * FROM zadachi WHERE id=? AND nomer=?').get(taskId,number);
 if(saved.udaleno||!row||epoch(db,'zadacha',taskId)!==saved.sobytie_zadachi)return {...identity,sostojanie:'udaleno'};
 try{load(db,number,actor,{deleted:true});}catch(error){if(![403,404].includes(error.kod))throw error;return {...identity,sostojanie:'sohraneno',dannye_skryty:true};}
 return {...identity,sostojanie:'sohraneno',podtverzhdenie:JSON.parse(saved.itog_json),tekuschee:presentation(db,row,actor)};
}
function packet(db,task){return {source:db.prepare('SELECT * FROM istochniki_publikacij_zadach WHERE zadacha_id=?').get(task.id)??null,ohvat:task.ohvat??null,data_vyhoda:task.data_vyhoda??null,epoch:epoch(db,'zadacha',task.id),projectionVersion:versions(db,'zadachi',task.id,['ohvat'])};}
function settingsContext(db,task){return hash({source:context(db,task),values:Object.fromEntries(SETTINGS.filter(k=>k!=='plan_chislo').map(k=>[k,task[k]??null])),versions:versions(db,'zadachi',task.id,SETTINGS)});}
function settingsInfo(db,task,actor){
 const safe=require('./obschij.js').bez_summ('zadachi',v_api(task),actor),client=task.klient_id??(task.sotrudnichestvo_id?db.prepare('SELECT chelovek_id FROM sotrudnichestva WHERE id=?').get(task.sotrudnichestvo_id)?.chelovek_id:null),catalog=require('./opisanija.js');
 return {...presentation(db,task,actor),nastrojki:Object.fromEntries(SETTINGS.map(k=>[k,k==='publikacija'?task.publikacija===1:safe[k]??null])),kontekst_nastroek:settingsContext(db,task),status:task.status,plan_denezhnij:require('./dengi-zadach.js').isMoney(db,task),plan_dostupen:!require('./dengi-zadach.js').isMoney(db,task)||require('./dengi-dostup.js').vidit(db,actor),nuzhen_plan_pri_otkljuchenii:task.tip==='biznesovaja'&&(task.plan_chislo===null||task.plan_chislo===undefined),vybor_akkaunta:{tip:task.tip,napravlenie:task.napravlenie,klient_id:client??null},spravochniki:{ploshadki:catalog.PLOSHADKI,formaty:catalog.FORMATY_PUBLIKACII,rubriki:db.prepare("SELECT DISTINCT rubrika FROM zadachi WHERE rubrika IS NOT NULL AND trim(rubrika)<>'' AND length(rubrika)<=100 ORDER BY rubrika LIMIT 200").all().map(r=>r.rubrika)}};
}
const settingsPacket=(db,task)=>({...packet(db,task),settings:Object.fromEntries(SETTINGS.map(k=>[k,task[k]??null]))});
function humanSettings(db,values,selected){
 const labels={publikacija:'публикация',ploshadka:'площадка',format:'формат',data_vyhoda:'дата выхода',rubrika:'рубрика',akkaunt_id:'аккаунт',plan_chislo:'целевое число'},formats={post:'пост',rils:'рилс',karusel:'карусель',storis:'сторис',video:'видео'},platforms={telegram:'Telegram',instagram:'Instagram',vk:'ВКонтакте',youtube:'YouTube',dzen:'Дзен',tiktok:'TikTok'};
 return selected.map(k=>{if(k==='plan_chislo')return 'целевое число изменено';let v=values[k];if(k==='publikacija')v=v?'да':'нет';else if(k==='akkaunt_id'&&v!=null)v=db.prepare('SELECT nazvanie FROM akkaunty WHERE id=?').get(v)?.nazvanie??'аккаунт недоступен';else if(k==='format')v=formats[v]??v;else if(k==='ploshadka')v=platforms[v]??v;else if(k==='data_vyhoda'&&v)v=String(v).split('-').reverse().join('.');return labels[k]+': '+(v==null||v===''?'не указано':String(v));}).join('; ');
}
function applySettings(db,actor,number,body){
 fields(body,['zadacha_id','versija','kontekst_nastroek','polja','zapros_kljuch']);fields(body.polja,SETTINGS);const selected=Object.keys(body.polja);if(!selected.length)throw new OshibkaVvoda('Выбери настройки для сохранения','polja');
 for(const [field,value]of Object.entries(body.polja)){
  if(field==='publikacija'&&typeof value!=='boolean')throw new OshibkaVvoda('Нужно да или нет','publikacija');
  if(field==='plan_chislo'&&value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||Number.isInteger(value)&&!Number.isSafeInteger(value)))throw new OshibkaVvoda('Нужно точное число от нуля','plan_chislo');
  if(field==='akkaunt_id'&&value!==null&&(typeof value!=='number'||!Number.isSafeInteger(value)||value<1))throw new OshibkaVvoda('Выбери аккаунт или оставь без аккаунта','akkaunt_id');
  if(!['publikacija','akkaunt_id','plan_chislo'].includes(field)&&value!==null&&typeof value!=='string')throw new OshibkaVvoda('Нужно текстовое значение настройки',field);
 }
 const taskId=positive(body.zadacha_id,'zadacha_id'),value=body.zapros_kljuch,hashed=key(value),digest=createHmac('sha256',value.toLowerCase()).update(JSON.stringify(stable({operation:'publication_settings',number,body:Object.fromEntries(Object.entries(body).filter(([k])=>k!=='zapros_kljuch'))}))).digest('hex');
 return v_odnoj_tranzakcii(db,()=>require('./versii.js').s_avtorom(db,actor,()=>{
  const old=receipt(db,actor,number,taskId,value);
  if(old){if(!old.sohraneno)throw new Konflikt('Эта попытка отменена. Начни новое действие',{edit_cancelled:true});if(old.zapros_hesh!==digest)throw new Konflikt('Ключ использован с другим содержанием',{operation_key_reused:true});load(db,number,actor,{deleted:true});const result=proof(db,actor,number,taskId,value);if(result.sostojanie==='udaleno')throw Object.assign(new Error('Исходная задача удалена'),{kod:410,dannye:result});return {telo:{...result,povtor_dejstvija:true}};}
  const task=load(db,number,actor);if(task.id!==taskId)throw new Konflikt('Исходная задача изменилась');
  if(typeof body.versija!=='number'||!Number.isSafeInteger(body.versija)||body.versija<1)throw new OshibkaVvoda('Нужна прочитанная версия задачи','versija');
  if(typeof body.kontekst_nastroek!=='string'||body.kontekst_nastroek!==settingsContext(db,task))throw new Konflikt('Настройки или контекст задачи изменились. Сравни сохранённое перед правкой.',{nastrojki_izmenilis:true});
  require('./versii.js').proverit(db,'zadachi',task,body.versija,[...SETTINGS,...DEPENDENCIES]);
  const before=settingsPacket(db,task);require('./obschij.js').pravit('zadachi',require('./opisanija.js').OPISANIJA.zadachi,number,{...body.polja,versija:body.versija},actor);
  let next=db.prepare('SELECT * FROM zadachi WHERE id=?').get(task.id);const changed=SETTINGS.filter(k=>JSON.stringify(task[k]??null)!==JSON.stringify(next[k]??null)),clearProjection=!before.source&&task.ohvat!==null&&changed.some(k=>['publikacija','ploshadka','akkaunt_id','data_vyhoda'].includes(k));
  if(clearProjection){db.prepare('UPDATE zadachi SET ohvat=NULL,versija=versija+1 WHERE id=?').run(task.id);require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'ohvat',task.ohvat,null,actor,task);next=db.prepare('SELECT * FROM zadachi WHERE id=?').get(task.id);}
  if(changed.includes('plan_chislo')&&!require('./opisanija.js').OPISANIJA.zadachi.v_zhurnal.includes('plan_chislo'))require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'plan_chislo',task.plan_chislo,next.plan_chislo,actor,task);
  if(changed.length)require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'publikacija_nastrojki',humanSettings(db,before.settings,changed),humanSettings(db,Object.fromEntries(SETTINGS.map(k=>[k,next[k]??null])),changed),actor,task);
  const after={...settingsPacket(db,next),settingsFields:changed,settingsVersions:versions(db,'zadachi',task.id,changed),cacheCleared:clearProjection,context:context(db,next)},ack={zadacha_id:task.id,nomer:number,publikacija_id:after.source?.publikacija_id??null,nastrojki:true,izmeneno:changed.length>0,versija_sohranenija:next.versija,dejstvie_id:require('./versii.js').dejstvie(db)};
  db.prepare("INSERT INTO zaprosy_istochnikov_publikacij(avtor,kljuch_hesh,zadacha_id,nomer_zadachi,sobytie_zadachi,dejstvie,zapros_hesh,sohraneno,itog_json,do_json,posle_json,versija_zadachi_posle,sobytie_svjazi_posle,sozdano)VALUES(?,?,?,?,?,'nastrojit',?,1,?,?,?,?,?,?)").run(actor,hashed,task.id,number,epoch(db,'zadacha',task.id),digest,JSON.stringify(ack),JSON.stringify(before),JSON.stringify(after),next.versija,sourceEvent(db,task.id),seichas());
  return {telo:proof(db,actor,number,task.id,value)};
 }));
}
function undoSettings(db,task,before,after,actor){
 const selected=after.settingsFields;if(!Array.isArray(selected)||!selected.length||selected.some(k=>!SETTINGS.includes(k)||!Object.hasOwn(before.settings??{},k)))throw new Konflikt('Сохранённый пакет настроек неполный. Настройки не изменены.');
 if(JSON.stringify(versions(db,'zadachi',task.id,selected))!==JSON.stringify(after.settingsVersions))throw new Konflikt('Эти настройки уже меняли. Отмена не перезапишет более позднюю работу.');
 const restored=Object.fromEntries(selected.map(k=>[k,k==='publikacija'?before.settings[k]===1:before.settings[k]]));
 try{require('./obschij.js').pravit('zadachi',require('./opisanija.js').OPISANIJA.zadachi,task.nomer,{...restored,versija:task.versija},actor);}catch(error){if([400,404,409].includes(error.kod))throw new Konflikt('Прежние настройки не подходят: '+error.message,{pole:error.pole??null});throw error;}
 if(after.cacheCleared){db.prepare('UPDATE zadachi SET ohvat=?,versija=versija+1 WHERE id=?').run(before.ohvat,task.id);require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'ohvat',task.ohvat,before.ohvat,actor,task);}
 if(selected.includes('plan_chislo')&&!require('./opisanija.js').OPISANIJA.zadachi.v_zhurnal.includes('plan_chislo'))require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'plan_chislo',task.plan_chislo,before.settings.plan_chislo,actor,task);
 require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'publikacija_nastrojki',humanSettings(db,after.settings,selected),humanSettings(db,before.settings,selected),actor,task);
}
function selection(db,actor,number,query){
 fields(query,['poisk','skolko','prodolzhit']);const task=load(db,number,actor);
 if(task.publikacija!==1)throw new OshibkaVvoda('Это не задача-публикация','publikacija');
 const info=presentation(db,task,actor);if(!info.akkaunt)return {zadacha_id:task.id,spisok:[],vsego:0,prodolzhit:null,pochemu:'Сначала выбери аккаунт задачи.'};
 const limit=query.skolko===undefined?30:positive(query.skolko,'skolko');if(limit>100)throw new OshibkaVvoda('Не больше 100 публикаций за чтение','skolko');
 if(query.poisk!==undefined&&(typeof query.poisk!=='string'||query.poisk.length>200))throw new OshibkaVvoda('Поиск не длиннее 200 знаков','poisk');
 const search=(query.poisk||'').trim(),cfg=configuration(db,db.prepare('SELECT * FROM akkaunty WHERE id=?').get(task.akkaunt_id));
 const currentHead=db.prepare('SELECT coalesce(max(rowid),0) n FROM publikacii WHERE akkaunt_id=?').get(task.akkaunt_id).n;let head=currentHead,last=null;
 if(query.prodolzhit!==undefined){try{if(typeof query.prodolzhit!=='string'||query.prodolzhit.length>1500||!/^[A-Za-z0-9_-]+$/.test(query.prodolzhit))throw new Error();const c=JSON.parse(Buffer.from(query.prodolzhit,'base64url').toString('utf8'));if(c.task!==task.id||c.account!==task.akkaunt_id||c.context!==cfg||c.search!==hash(search)||!Number.isSafeInteger(c.head)||c.head<1||c.head>currentHead||!Number.isSafeInteger(c.last)||c.last<1||c.last>c.head)throw new Error();head=c.head;last=c.last;}catch{throw new OshibkaVvoda('Перечитай список публикаций перед продолжением','prodolzhit');}}
 const args=[task.akkaunt_id,head,segodnja()],where=['akkaunt_id=?','rowid<=?',"locus_obschenie_den(data_vyhoda)<=?"];
 if(search){where.push("locus_contains(coalesce(nullif(trim(zagolovok),''),'Публикация '||publikacija_id)||' '||coalesce(ssylka,'')||' '||publikacija_id,?)");args.push(search);}
 const total=db.prepare('SELECT count(*) n FROM publikacii WHERE '+where.join(' AND ')).get(...args).n;
 if(last!==null){where.push('rowid<?');args.push(last);}
 const rows=db.prepare('SELECT rowid row_number,* FROM publikacii WHERE '+where.join(' AND ')+' ORDER BY rowid DESC LIMIT ?').all(...args,limit+1),more=rows.length>limit;rows.splice(limit);
 const account=db.prepare('SELECT * FROM akkaunty WHERE id=?').get(task.akkaunt_id),cursor=more?Buffer.from(JSON.stringify({task:task.id,account:task.akkaunt_id,context:cfg,search:hash(search),head,last:rows.at(-1).row_number})).toString('base64url'):null;
 return {zadacha_id:task.id,akkaunt_id:task.akkaunt_id,spisok:rows.map(post=>postDTO(db,post,account)),vsego:total,prodolzhit:cursor};
}
function apply(db,actor,number,body){
 fields(body,['zadacha_id','versija','kontekst_istochnika','publikacija_id','kontekst_publikacii','podtverdit_datu','zapros_kljuch']);
 const taskId=positive(body.zadacha_id,'zadacha_id'),value=body.zapros_kljuch,hashed=key(value),digest=createHmac('sha256',value.toLowerCase()).update(JSON.stringify(stable({number,body:Object.fromEntries(Object.entries(body).filter(([key])=>key!=='zapros_kljuch'))}))).digest('hex');
 return v_odnoj_tranzakcii(db,()=>require('./versii.js').s_avtorom(db,actor,()=>{
  const old=receipt(db,actor,number,taskId,value);
  if(old){if(!old.sohraneno)throw new Konflikt('Эта попытка отменена. Начни новое действие',{edit_cancelled:true});if(old.zapros_hesh!==digest)throw new Konflikt('Ключ уже использован с другим содержанием',{operation_key_reused:true});load(db,number,actor,{deleted:true});const result=proof(db,actor,number,taskId,value);if(result.sostojanie==='udaleno')throw Object.assign(new Error('Исходная задача удалена'),{kod:410,dannye:result});return {telo:{...result,povtor_dejstvija:true}};}
  const task=load(db,number,actor);if(task.id!==taskId)throw new Konflikt('Исходная задача изменилась');
  if(task.publikacija!==1)throw new OshibkaVvoda('Связь доступна у задачи-публикации','publikacija');
  if(typeof body.versija!=='number'||!Number.isSafeInteger(body.versija)||body.versija<1)throw new OshibkaVvoda('Нужна прочитанная версия задачи','versija');
  if(typeof body.kontekst_istochnika!=='string'||body.kontekst_istochnika!==context(db,task))throw new Konflikt('Контекст задачи или источника изменился. Перечитай перед сохранением',{istochnik_izmenilsja:true});
  require('./versii.js').proverit(db,'zadachi',task,body.versija,DEPENDENCIES);
  if(body.podtverdit_datu!==undefined&&typeof body.podtverdit_datu!=='boolean')throw new OshibkaVvoda('Нужно явное подтверждение даты','podtverdit_datu');
  if(body.publikacija_id!==null&&(typeof body.publikacija_id!=='string'||!body.publikacija_id||body.publikacija_id.length>500||body.publikacija_id.includes('\0')))throw new OshibkaVvoda('Выбери конкретную публикацию или отсоедини источник','publikacija_id');
  const before=packet(db,task);let post=null,account=null,day=task.data_vyhoda;
  if(body.publikacija_id!==null){
   if(!task.akkaunt_id)throw new OshibkaVvoda('Сначала выбери аккаунт задачи','akkaunt_id');
   account=db.prepare('SELECT * FROM akkaunty WHERE id=? AND COALESCE(udalen,0)=0').get(task.akkaunt_id);if(!account)throw new NeNajdeno('Аккаунт больше не найден');
   require('./akkaunt-zadachi.js').validate(db,{akkaunt_id:task.akkaunt_id},task,task.versija);
   if(account.ploshadka!==task.ploshadka)throw new OshibkaVvoda('Аккаунт не с этой площадки','akkaunt_id');
   post=db.prepare('SELECT * FROM publikacii WHERE id=? AND akkaunt_id=?').get(body.publikacija_id,account.id);if(!post)throw new OshibkaVvoda('Публикация не найдена в аккаунте этой задачи','publikacija_id');
   const identity=snapshots.daty(post)._akkaunt?.data_vyhoda;if(identity&&identity!==configuration(db,account))throw new Konflikt('Публикация относится к прежней настройке аккаунта. Обнови его данные перед связью.');
   if(typeof body.kontekst_publikacii!=='string'||body.kontekst_publikacii!==postContext(post))throw new Konflikt('Выбранная публикация изменилась. Перечитай её.',{publikacija_izmenilas:true});
   day=require('./vremja-obschenija.js').den(post.data_vyhoda);if(!day||day>segodnja())throw new OshibkaVvoda('Дата вышедшей публикации не подтверждена','publikacija_id');
   if(day!==task.data_vyhoda&&body.podtverdit_datu!==true)throw new Konflikt('Подтверди фактическую дату выхода из источника',{nuzhno_podtverdit_datu:true,data_vyhoda_zadachi:task.data_vyhoda,data_vyhoda_iz_istochnika:day});
  }else if(body.kontekst_publikacii!==undefined)throw new OshibkaVvoda('У отсоединения нет выбранной публикации','kontekst_publikacii');
  const changed=before.source?.publikacija_id!==(post?.id??undefined)||before.source?.akkaunt_kontekst!==(account?configuration(db,account):undefined)||day!==task.data_vyhoda;
  if(post){
   const cfg=configuration(db,account);
   if(changed)db.prepare('INSERT INTO istochniki_publikacij_zadach(zadacha_id,publikacija_id,akkaunt_id,akkaunt_kontekst,sobytie_zadachi,sobytie_akkaunta,versija,avtor,sozdano)VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(zadacha_id) DO UPDATE SET publikacija_id=excluded.publikacija_id,akkaunt_id=excluded.akkaunt_id,akkaunt_kontekst=excluded.akkaunt_kontekst,sobytie_zadachi=excluded.sobytie_zadachi,sobytie_akkaunta=excluded.sobytie_akkaunta,versija=excluded.versija,avtor=excluded.avtor,sozdano=excluded.sozdano,ohvat_data=NULL,ohvat_moment=NULL,poluchen_at=NULL,versija_zamera=0').run(task.id,post.id,account.id,cfg,epoch(db,'zadacha',task.id),epoch(db,'akkaunt',account.id),(before.source?.versija??0)+1,actor,seichas());
   if(day!==task.data_vyhoda){db.prepare('UPDATE zadachi SET data_vyhoda=?,versija=coalesce(versija,0)+1 WHERE id=?').run(day,task.id);require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'data_vyhoda',task.data_vyhoda,day,actor,task);}
   const updatedTask=db.prepare('SELECT * FROM zadachi WHERE id=?').get(task.id),updatedLink=db.prepare('SELECT * FROM istochniki_publikacij_zadach WHERE zadacha_id=?').get(task.id);if(!valid(db,updatedTask,updatedLink))throw new Konflikt('Контекст задачи или аккаунта изменился. Связь не сохранена.');syncOne(db,updatedTask,updatedLink,{replace:changed});
  }else if(before.source){db.prepare('DELETE FROM istochniki_publikacij_zadach WHERE zadacha_id=?').run(task.id);db.prepare('UPDATE zadachi SET ohvat=NULL,versija=coalesce(versija,0)+1 WHERE id=?').run(task.id);}
  const next=db.prepare('SELECT * FROM zadachi WHERE id=?').get(task.id),after=packet(db,next);
  if(changed)require('./obschij.js').v_zhurnal(db,'zadachi',task.id,'publikacija_istochnik',before.source?JSON.stringify({id:before.source.publikacija_id,context:before.source.akkaunt_kontekst,version:before.source.versija,nazvanie:db.prepare('SELECT zagolovok FROM publikacii WHERE id=?').get(before.source.publikacija_id)?.zagolovok??null,date:before.data_vyhoda,ohvat:before.ohvat}):null,post?JSON.stringify({id:post.id,nazvanie:post.zagolovok??null,context:after.source.akkaunt_kontekst,version:after.source.versija,date:after.data_vyhoda,ohvat:next.ohvat}):'отсоединено',actor,task);
  after.context=context(db,next);
  const ack={zadacha_id:task.id,nomer:number,publikacija_id:post?.id??null,izmeneno:changed,versija_sohranenija:next.versija,dejstvie_id:require('./versii.js').dejstvie(db)};
  db.prepare('INSERT INTO zaprosy_istochnikov_publikacij(avtor,kljuch_hesh,zadacha_id,nomer_zadachi,sobytie_zadachi,dejstvie,zapros_hesh,sohraneno,itog_json,do_json,posle_json,versija_zadachi_posle,sobytie_svjazi_posle,sozdano)VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?,?)').run(actor,hashed,task.id,number,epoch(db,'zadacha',task.id),post?'svjazat':'otvjazat',digest,JSON.stringify(ack),JSON.stringify(before),JSON.stringify(after),next.versija,sourceEvent(db,task.id),seichas());
  return {telo:proof(db,actor,number,task.id,value)};
 }));
}
                                                                         
                                                                         
function undoRecord(db,actor,action){
 if(typeof action!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(action))return null;
 return db.prepare("SELECT * FROM zaprosy_istochnikov_publikacij WHERE avtor=? AND sohraneno=1 AND json_extract(itog_json,'$.dejstvie_id')=?").get(actor,action);
}
function undoProof(body,actor){
 const db=baza(),saved=undoRecord(db,actor,body?.dejstvie_id);if(!saved)return null;
 fields(body,['dejstvie_id']);
 const ack=JSON.parse(saved.itog_json),task=db.prepare('SELECT * FROM zadachi WHERE id=? AND nomer=?').get(saved.zadacha_id,saved.nomer_zadachi);
 if(task&&task.id===saved.zadacha_id&&epoch(db,'zadacha',task.id)===saved.sobytie_zadachi)load(db,saved.nomer_zadachi,actor,{deleted:true});
 return {tip:'istochnik_publikacii',dejstvie_id:ack.dejstvie_id,zadacha_id:saved.zadacha_id,nomer:saved.nomer_zadachi,najdeno:true,otmeneno:ack.otmeneno===true,otmena_otmenena:ack.otmena_otmenena===true,udaleno:!!saved.udaleno||!task||epoch(db,'zadacha',saved.zadacha_id)!==saved.sobytie_zadachi};
}
function undo(body,actor){
 const db=baza(),saved=undoRecord(db,actor,body?.dejstvie_id);if(!saved)return null;
 fields(body,['dejstvie_id','otkaz']);if(body.otkaz!==undefined&&body.otkaz!==true)throw new OshibkaVvoda('Для отказа от отмены нужно явное подтверждение','otkaz');
 return v_odnoj_tranzakcii(db,()=>require('./versii.js').s_avtorom(db,actor,()=>{
  const currentReceipt=undoRecord(db,actor,body.dejstvie_id),ack=JSON.parse(currentReceipt.itog_json),proofBody={dejstvie_id:body.dejstvie_id};
  if(ack.otmeneno||body.otkaz&&ack.otmena_otmenena)return undoProof(proofBody,actor);
  if(body.otkaz){ack.otmena_otmenena=true;db.prepare('UPDATE zaprosy_istochnikov_publikacij SET itog_json=? WHERE avtor=? AND kljuch_hesh=?').run(JSON.stringify(ack),actor,saved.kljuch_hesh);return undoProof(proofBody,actor);}
  if(ack.otmena_otmenena)throw new Konflikt('От возврата источника уже отказались. Поздняя отмена не применена.',{edit_cancelled:true});
  const task=load(db,saved.nomer_zadachi,actor);
  if(saved.udaleno||task.id!==saved.zadacha_id||epoch(db,'zadacha',task.id)!==saved.sobytie_zadachi)throw new Konflikt('Исходная задача удалена или создана заново. Отмена не применена.');
  const before=JSON.parse(saved.do_json),after=JSON.parse(saved.posle_json);
  if(ack.izmeneno){
   if(!after.context||context(db,task)!==after.context||sourceEvent(db,task.id)!==saved.sobytie_svjazi_posle)throw new Konflikt('После выбора источника изменили его связь, дату или контекст задачи. Отмена не применена.');
   if(!after.source&&(!ack.nastrojki||after.cacheCleared)&&JSON.stringify(versions(db,'zadachi',task.id,['ohvat']))!==JSON.stringify(after.projectionVersion))throw new Konflikt('После отсоединения появился новый замер. Проверь его перед возвратом источника.');
   if(ack.nastrojki)undoSettings(db,task,before,after,actor);
   else{
   if(before.source){
    const restored={...before.source,versija:Math.max(before.source.versija,after.source?.versija??0)+1};
    db.prepare('DELETE FROM istochniki_publikacij_zadach WHERE zadacha_id=?').run(task.id);
    const columns=Object.keys(restored);db.prepare('INSERT INTO istochniki_publikacij_zadach('+columns.join(',')+')VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(k=>restored[k]));
   }else db.prepare('DELETE FROM istochniki_publikacij_zadach WHERE zadacha_id=?').run(task.id);
   db.prepare('UPDATE zadachi SET data_vyhoda=?,ohvat=?,versija=versija+1 WHERE id=?').run(before.data_vyhoda,before.ohvat,task.id);
   const journal=require('./obschij.js').v_zhurnal;
   if(task.data_vyhoda!==before.data_vyhoda)journal(db,'zadachi',task.id,'data_vyhoda',task.data_vyhoda,before.data_vyhoda,actor,task);
   const restoredTask=db.prepare('SELECT * FROM zadachi WHERE id=?').get(task.id),restoredLink=db.prepare('SELECT * FROM istochniki_publikacij_zadach WHERE zadacha_id=?').get(task.id);
   if(restoredLink&&valid(db,restoredTask,restoredLink))syncOne(db,restoredTask,restoredLink);
   journal(db,'zadachi',task.id,'publikacija_istochnik',JSON.stringify({otmena:ack.dejstvie_id,source:after.source?.publikacija_id??null}),JSON.stringify({source:before.source?.publikacija_id??null,vosstanovleno:true}),actor,task);
   }
  }
  ack.otmeneno=true;ack.otmeneno_kogda=seichas();db.prepare('UPDATE zaprosy_istochnikov_publikacij SET itog_json=? WHERE avtor=? AND kljuch_hesh=?').run(JSON.stringify(ack),actor,saved.kljuch_hesh);
  return undoProof(proofBody,actor);
 }));
}
function handle(ctx){
 const db=baza(),actor=positive(ctx.avtor,'avtor'),number=positive(ctx.kljuch,'nomer');
 if(ctx.dejstvie==='publikacija_nastrojki'){if(ctx.metod==='GET'){fields(ctx.zapros,[]);return {telo:settingsInfo(db,load(db,number,actor,{deleted:true}),actor)};}if(ctx.metod==='POST')return applySettings(db,actor,number,ctx.telo);throw Object.assign(new Error('Здесь GET или POST настроек публикации'),{kod:405});}
 if(ctx.dejstvie==='publikacija_vybor'){if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET выбора публикации'),{kod:405});return {telo:selection(db,actor,number,ctx.zapros)};}
 if(ctx.dejstvie==='publikacija_istochnik'){
  if(ctx.metod==='GET'){fields(ctx.zapros,[]);return {telo:presentation(db,load(db,number,actor,{deleted:true}),actor)};}
  if(ctx.metod==='POST')return apply(db,actor,number,ctx.telo);
 }else if(['publikacija_istochnik_proverka','publikacija_istochnik_otmena_popytki'].includes(ctx.dejstvie)){
  const read=ctx.dejstvie==='publikacija_istochnik_proverka';if(ctx.metod!==(read?'GET':'POST'))throw Object.assign(new Error('Неверный метод проверки источника'),{kod:405});
  const params=read?ctx.zapros:ctx.telo;fields(params,['zadacha_id','zapros_kljuch']);const id=positive(params.zadacha_id,'zadacha_id');key(params.zapros_kljuch);
  if(read)return {telo:proof(db,actor,number,id,params.zapros_kljuch)};
  return v_odnoj_tranzakcii(db,()=>{if(!receipt(db,actor,number,id,params.zapros_kljuch))db.prepare("INSERT INTO zaprosy_istochnikov_publikacij(avtor,kljuch_hesh,zadacha_id,nomer_zadachi,dejstvie,sozdano)VALUES(?,?,?,?,'otmena_popytki',?)").run(actor,key(params.zapros_kljuch),id,number,seichas());return {telo:proof(db,actor,number,id,params.zapros_kljuch)};});
 }
 throw Object.assign(new Error('Здесь GET или POST источника публикации'),{kod:405});
}
const actions=Object.fromEntries(['publikacija_nastrojki','publikacija_istochnik','publikacija_vybor','publikacija_istochnik_proverka','publikacija_istochnik_otmena_popytki'].map(action=>[action,ctx=>handle({...ctx,dejstvie:action})]));
module.exports={epoch,valid,actualDate,measurement,observedReach,syncOne,syncAccount,context,postContext,presentation,proof,apply,selection,handle,actions,undo,undoProof,undoRecord,settingsContext,settingsInfo,applySettings};
