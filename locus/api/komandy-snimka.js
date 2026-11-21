                                                                            
const {createHash,createHmac,randomUUID}=require('node:crypto');
const {baza,OshibkaVvoda,NetDostupa,NeNajdeno,Konflikt,segodnja,seichas,v_odnoj_tranzakcii}=require('../db/db.js');
const calendar=require('./kalendar.js'),reader=require('./snimok-planerki.js');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

function fields(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new OshibkaVvoda('Нужны параметры сохранения недели');
 for(const name of Object.keys(value))if(!allowed.includes(name))throw new OshibkaVvoda('Неизвестный параметр сохранения недели',name);
}
function key(value){
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного сохранения','zapros_kljuch');
 return hash(value.toLowerCase());
}
function scope(query,extra=[]){
 fields(query,['napravlenie','nedelja','god',...extra]);
 if(typeof query.napravlenie!=='string'||!query.napravlenie||query.napravlenie.length>100)throw new OshibkaVvoda('Выбери направление','napravlenie');
 if(query.nedelja===undefined||query.god===undefined&&!/^\d{4}-W?\d{1,2}$/i.test(String(query.nedelja)))throw new OshibkaVvoda('Укажи неделю вместе с годом','nedelja');
 const week=calendar.nedelja_iz_zaprosa(query,segodnja());
 return {napravlenie:query.napravlenie,god:week.god,nedelja:week.nomer,nachalo:week.nachalo,konec:week.konec};
}
function raw(db,s){return db.prepare('SELECT rowid,* FROM snimki_planerki WHERE napravlenie=? AND god=? AND nedelja=?').get(s.napravlenie,s.god,s.nedelja)||null;}
function lastEvent(db,s){
 return db.prepare("SELECT coalesce(max(id),0) id FROM zhurnal WHERE obekt='snimok_planerki' AND json_valid(srez) AND json_extract(srez,'$.snimok_planerki.napravlenie')=? AND json_extract(srez,'$.snimok_planerki.god')=? AND json_extract(srez,'$.snimok_planerki.nedelja')=?").get(s.napravlenie,s.god,s.nedelja).id;
}
function version(db,s){
 const saved=reader.read(db,{napravlenie:s.napravlenie,god:s.god,nomer:s.nedelja});
 return hash({scope:s,record:saved?.versija??null,event:lastEvent(db,s)});
}
function authority(db,s,actor,{current=false}={}){
 const direction=db.prepare('SELECT kod,arhiv,veduschij_id FROM napravlenija WHERE kod=?').get(s.napravlenie);
 if(!direction)throw new NeNajdeno('Направление не найдено');
 if(!require('./celi-model.js').canLead(db,{napravlenie:s.napravlenie},actor)||!require('./dengi-dostup.js').vidit(db,actor))throw new NetDostupa('Снимок меняют ведущий направления и владельцы Локуса с полным доступом');
 if(direction.arhiv)throw new Konflikt('Направление в архиве. Сохранённая планёрка доступна для просмотра');
 if(!current&&s.konec>=segodnja())throw new Konflikt('Неделя ещё не завершена. Пока доступна текущая планёрка');
 return {direction,member:db.prepare('SELECT id,komanda,aktiven,arhiv,dostup FROM ljudi WHERE id=?').get(actor)};
}
function generate(db,s,actor){
 const day=[segodnja(),s.konec].sort()[0];
 const report=require('./ekrany.js').planerka({zapros:{napravlenie:s.napravlenie,nedelja:String(s.nedelja),god:s.god,den:day},avtor:actor,metod:'GET',polnyj_snimok:true}).telo;
                                                                         
 return require('./sostojanie-zadachi.js').predstavlenie(db,require('./povtory.js').predstavlenie(db,report,day),{actor});
}
function proposal(db,s,actor,options){
 const rights=authority(db,s,actor,options),saved=reader.read(db,{napravlenie:s.napravlenie,god:s.god,nomer:s.nedelja}),next=generate(db,s,actor);
 return {scope:s,kontekst:hash({scope:s,actor,rights,version:version(db,s),next}),versija:version(db,s),predyduschaja:saved?.dannye??null,novaja:next,sozdano:saved?.sozdano??null,pereschitan:saved?.pereschitan??null};
}
function receipt(db,actor,s,value){
 const row=db.prepare('SELECT * FROM zaprosy_snimkov_planerki WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));
 if(row&&(row.napravlenie!==s.napravlenie||row.god!==s.god||row.nedelja!==s.nedelja))throw new Konflikt('Этот ключ относится к другой неделе',{operation_key_reused:true});
 return row;
}
function proof(db,actor,s,value){
 const row=receipt(db,actor,s,value),identity={obekt:'snimok_planerki',avtor_id:actor,napravlenie:s.napravlenie,god:s.god,nedelja:s.nedelja,zapros_kljuch:value.toLowerCase()};
 if(!row)return {...identity,sostojanie:'ne_najdeno'};
 if(!row.sohraneno)return {...identity,sostojanie:'otmeneno'};
 const reverted=!!db.prepare('SELECT 1 FROM zaprosy_snimkov_planerki WHERE avtor=? AND roditel_kljuch_hesh=? AND sohraneno=1').get(actor,row.kljuch_hesh);
 return {...identity,sostojanie:'sohraneno',dejstvie:row.dejstvie,...JSON.parse(row.rezultat_json),vernuto:reverted};
}
function digest(value,s,action,body){const {zapros_kljuch,...data}=body;return createHmac('sha256',value.toLowerCase()).update(JSON.stringify(stable({scope:s,action,body:data}))).digest('hex');}
function savedReply(db,s,actor,value,action,requestDigest){
 const old=receipt(db,actor,s,value);if(!old)return null;
 if(!old.sohraneno)throw new Konflikt('Попытка отменена. Начни новое сохранение',{operation_cancelled:true});
 if(old.dejstvie!==action||old.zapros_hesh!==requestDigest)throw new Konflikt('Ключ уже использован для другого действия',{operation_key_reused:true});
 return {...proof(db,actor,s,value),povtor_sohranenija:true};
}
function record(db,s,actor,value,action,requestDigest,result,parent){
 const after=version(db,s);
 db.prepare('INSERT INTO zaprosy_snimkov_planerki(avtor,kljuch_hesh,napravlenie,god,nedelja,dejstvie,roditel_kljuch_hesh,zapros_hesh,sohraneno,rezultat_json,sobytie_id,posle_versija,sozdano)VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?)').run(actor,key(value),s.napravlenie,s.god,s.nedelja,action,parent?key(parent):null,requestDigest,JSON.stringify(result),result.sobytie_id??null,after,seichas());
 return proof(db,actor,s,value);
}
function journal(db,s,actor,action,before,after,operation){
 const meta=row=>row?{est:true,sozdano:row.sozdano,pereschitan:row.pereschitan??null}:{est:false};
 const context={snimok_planerki:{napravlenie:s.napravlenie,god:s.god,nedelja:s.nedelja,dejstvie:action,do:meta(before),posle:meta(after),izmenenie_id:randomUUID(),komanda_hesh:key(operation)}};
                                                                       
                                                                            
 return Number(db.prepare("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kto,kogda,srez)VALUES('snimok_planerki',?,'dannye',?,?,?,?,?)").run(before?.rowid??after?.rowid??s.nedelja,before?.dannye??null,after?.dannye??null,actor,seichas(),JSON.stringify(context)).lastInsertRowid);
}
function apply(db,s,actor,value,next,{automatic=false}={}){
 const before=raw(db,s),time=seichas(),text=JSON.stringify(next);
 if(before)db.prepare('UPDATE snimki_planerki SET dannye=?,pereschitan=? WHERE napravlenie=? AND god=? AND nedelja=?').run(text,time,s.napravlenie,s.god,s.nedelja);
 else db.prepare('INSERT INTO snimki_planerki(napravlenie,god,nedelja,dannye,sozdano)VALUES(?,?,?,?,?)').run(s.napravlenie,s.god,s.nedelja,text,time);
 const after=raw(db,s),event=before?journal(db,s,actor,automatic?'zavershit_nedelju':'pereschitat',before,after,value):null;
 return {sohraneno:true,sozdan:!before,predyduschij_snimok_byl:!!before,sobytie_id:event,sozdano:after.sozdano,pereschitan:after.pereschitan??null,avtomaticheski:automatic};
}
function save(db,s,actor,body){
 fields(body,['zapros_kljuch','kontekst']);key(body.zapros_kljuch);
 const requestDigest=digest(body.zapros_kljuch,s,'pereschitat',body),old=savedReply(db,s,actor,body.zapros_kljuch,'pereschitat',requestDigest);if(old)return old;
 const preview=proposal(db,s,actor);if(body.kontekst!==preview.kontekst)throw new Konflikt('Снимок, источники или права изменились. Посмотри актуальное сравнение',{kontekst_izmenilsja:true});
 return record(db,s,actor,body.zapros_kljuch,'pereschitat',requestDigest,apply(db,s,actor,body.zapros_kljuch,preview.novaja));
}
function undo(db,s,actor,body){
 fields(body,['zapros_kljuch','ishodnyj_kljuch']);key(body.zapros_kljuch);key(body.ishodnyj_kljuch);
 const requestDigest=digest(body.zapros_kljuch,s,'otmenit',body),old=savedReply(db,s,actor,body.zapros_kljuch,'otmenit',requestDigest);if(old)return old;
 authority(db,s,actor);const original=receipt(db,actor,s,body.ishodnyj_kljuch);
 if(!original?.sohraneno||original.dejstvie!=='pereschitat')throw new Konflikt('Исходное сохранение не найдено');
 const result=JSON.parse(original.rezultat_json);if(result.net_izmenenij)throw new Konflikt('В этом действии снимок не менялся');
 if(db.prepare('SELECT 1 FROM zaprosy_snimkov_planerki WHERE avtor=? AND roditel_kljuch_hesh=? AND sohraneno=1').get(actor,key(body.ishodnyj_kljuch)))throw new Konflikt('Это сохранение уже возвращено');
 if(version(db,s)!==original.posle_versija)throw new Konflikt('После сохранения снимок изменили. Прежняя версия не заменит позднюю правку');
 const before=raw(db,s);let after;
 if(result.predyduschij_snimok_byl){
  const event=db.prepare("SELECT * FROM zhurnal WHERE id=? AND obekt='snimok_planerki'").get(original.sobytie_id);let context;
  try{context=JSON.parse(event?.srez).snimok_planerki;}catch{}
  if(!event||context?.napravlenie!==s.napravlenie||context.god!==s.god||context.nedelja!==s.nedelja||!context.do?.est||event.bylo==null)throw new Konflikt('Прежняя запись истории недоступна. Снимок не изменён');
  try{JSON.parse(event.bylo);}catch{throw new Konflikt('Прежний снимок повреждён. Текущий не изменён');}
  db.prepare('UPDATE snimki_planerki SET dannye=?,sozdano=?,pereschitan=? WHERE napravlenie=? AND god=? AND nedelja=?').run(event.bylo,context.do.sozdano,context.do.pereschitan??null,s.napravlenie,s.god,s.nedelja);after=raw(db,s);
 }else{db.prepare('DELETE FROM snimki_planerki WHERE napravlenie=? AND god=? AND nedelja=?').run(s.napravlenie,s.god,s.nedelja);after=null;}
 const event=journal(db,s,actor,'otmenit_pereschet',before,after,body.zapros_kljuch);
 return record(db,s,actor,body.zapros_kljuch,'otmenit',requestDigest,{otmeneno:true,sobytie_id:event,snimok_est:!!after},body.ishodnyj_kljuch);
}
function history(db,s,query){
 let before=Number.MAX_SAFE_INTEGER;if(query.do_id!==undefined){if(!/^[1-9]\d*$/.test(String(query.do_id))||!Number.isSafeInteger(Number(query.do_id)))throw new OshibkaVvoda('Нужен номер предыдущей записи','do_id');before=Number(query.do_id);}
 const rows=db.prepare("SELECT j.*,l.imja kto_imja FROM zhurnal j LEFT JOIN ljudi l ON l.id=j.kto WHERE j.id<? AND j.obekt='snimok_planerki' AND json_valid(j.srez) AND json_extract(j.srez,'$.snimok_planerki.napravlenie')=? AND json_extract(j.srez,'$.snimok_planerki.god')=? AND json_extract(j.srez,'$.snimok_planerki.nedelja')=? ORDER BY j.id DESC LIMIT 20").all(before,s.napravlenie,s.god,s.nedelja);
 return {scope:s,spisok:rows,sledujuschij:rows.length===20?rows.at(-1).id:null};
}
function automaticKey(s){
 const namespace=Buffer.from('b9a4e24d65f54a2d9c362a6fda2fe118','hex');
 const bytes=createHash('sha1').update(namespace).update(s.napravlenie+':'+s.god+':'+s.nedelja).digest().subarray(0,16);
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const h=bytes.toString('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function automaticClose(ctx){
 if(!ctx.sluzhebnyj)throw new NetDostupa('Для фоновой фиксации нужен служебный доступ');
 fields(ctx.telo||{},[]);
 const db=baza(),s=scope(ctx.zapros||{}),actor=ctx.avtor;authority(db,s,actor,{current:true});
 const today=segodnja(),parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
 if(s.konec>today||s.konec===today&&parts<'23:59')throw new Konflikt('Неделя ещё не закончилась. Фоновая фиксация выполняется в воскресенье в 23:59');
 const value=automaticKey(s),previous=receipt(db,actor,s,value);
 if(previous){if(!previous.sohraneno)throw new Konflikt('Фоновая команда отменена. Нужна проверка владельцем Локуса');return {telo:{...proof(db,actor,s,value),povtor_sohranenija:true}};}
 const existing=reader.read(db,{napravlenie:s.napravlenie,god:s.god,nomer:s.nedelja});
 let partial=false;try{calendar.data(existing?.dannye?.den,'den');partial=existing.dannye.den<s.konec;}catch{}
 const body={avtomaticheski:true},requestDigest=digest(value,s,'pereschitat',body);
                                                                        
                                                       
 if(existing&&!partial)return {telo:record(db,s,actor,value,'pereschitat',requestDigest,{sohraneno:true,net_izmenenij:true,avtomaticheski:true,predyduschij_snimok_byl:true,sobytie_id:null,sozdano:existing.sozdano,pereschitan:existing.pereschitan??null})};
 const result=apply(db,s,actor,value,generate(db,s,actor),{automatic:true});
 return {kod:result.sozdan?201:200,telo:record(db,s,actor,value,'pereschitat',requestDigest,result)};
}
function legacyCreate(ctx){
 const db=baza(),s=scope(ctx.zapros||{}),body=ctx.telo||{};fields(body,[]);
 const existing=reader.read(db,{napravlenie:s.napravlenie,god:s.god,nomer:s.nedelja});
 if(existing){const {rowid,...data}=existing;return {telo:{...data,bez_izmenenij:true,podtverzhdenie_nuzhno:true}};}
                                                                          
                                                                                
 db.prepare('INSERT INTO snimki_planerki(napravlenie,god,nedelja,dannye,sozdano)VALUES(?,?,?,?,?)').run(s.napravlenie,s.god,s.nedelja,JSON.stringify(generate(db,s,ctx.avtor)),seichas());
 const {rowid,...data}=reader.read(db,{napravlenie:s.napravlenie,god:s.god,nomer:s.nedelja});return {kod:201,telo:data};
}
function handle(ctx){
 const db=baza(),action=ctx.dejstvie,s=scope(ctx.zapros||{},action==='snimok_proverka'?['zapros_kljuch']:action==='snimok_istorija'?['do_id']:[]),actor=ctx.avtor,body=ctx.telo||{};
 if(ctx.metod!=='GET'&&body.zapros_kljuch?.toLowerCase()===automaticKey(s))throw new OshibkaVvoda('Этот ключ относится к фоновой фиксации. Начни отдельное ручное действие','zapros_kljuch');
 const get=()=>{if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});};
 if(action==='snimok_predprosmotr'){get();return {telo:v_odnoj_tranzakcii(db,()=>proposal(db,s,actor))};}
 if(action==='snimok_proverka'){get();return {telo:proof(db,actor,s,ctx.zapros.zapros_kljuch)};}
 if(action==='snimok_istorija'){get();return {telo:history(db,s,ctx.zapros)};}
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});
 if(action==='snimok_otmena_popytki'){
  fields(body,['zapros_kljuch','dejstvie']);key(body.zapros_kljuch);const kind=body.dejstvie??'pereschitat';if(!['pereschitat','otmenit'].includes(kind))throw new OshibkaVvoda('Неизвестное действие','dejstvie');
  if(!receipt(db,actor,s,body.zapros_kljuch))db.prepare('INSERT INTO zaprosy_snimkov_planerki(avtor,kljuch_hesh,napravlenie,god,nedelja,dejstvie,sozdano)VALUES(?,?,?,?,?,?,?)').run(actor,key(body.zapros_kljuch),s.napravlenie,s.god,s.nedelja,kind,seichas());
  return {telo:proof(db,actor,s,body.zapros_kljuch)};
 }
 if(action==='snimok_otmenit')return {telo:undo(db,s,actor,body)};
 if(action==='snimok')return {telo:save(db,s,actor,body)};
 throw new OshibkaVvoda('Неизвестное действие снимка');
}
module.exports={handle,scope,version,proposal,generate,proof,save,undo,history,authority,automaticClose,legacyCreate,automaticKey};
