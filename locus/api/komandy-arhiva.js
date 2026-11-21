                                                                             
const {createHash,createHmac}=require('node:crypto');
const {baza,OshibkaVvoda,Konflikt,NeNajdeno,seichas,v_odnoj_tranzakcii}=require('../db/db.js');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
function fields(v,allowed){if(!v||typeof v!=='object'||Array.isArray(v))throw new OshibkaVvoda('Нужны параметры действия');for(const k of Object.keys(v))if(!allowed.includes(k))throw new OshibkaVvoda('Неизвестный параметр архива',k);}
function key(v){if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v))throw new OshibkaVvoda('Нужен ключ одного действия','zapros_kljuch');return hash(v.toLowerCase());}
function scope(v){
 if(!['ljudi','sotrudnichestva'].includes(v.tablica))throw new OshibkaVvoda('Выбери человека или сотрудничество','tablica');
 if(typeof v.id==='boolean'||typeof v.id==='string'&&!/^[1-9]\d*$/.test(v.id)||!Number.isSafeInteger(Number(v.id))||Number(v.id)<1)throw new OshibkaVvoda('Нужен номер карточки','id');
 return {tablica:v.tablica,id:Number(v.id)};
}
const eventName=s=>s.tablica==='ljudi'?'chelovek':'sotrudnichestvo';
function epoch(db,s){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt=? AND obekt_id=? AND pole='sozdano'").get(eventName(s),s.id)?.id??null;}
function target(db,s){const row=db.prepare('SELECT * FROM '+s.tablica+' WHERE id=?').get(s.id);if(!row)throw new NeNajdeno('Карточка не найдена');return row;}
function preview(db,s,actor){
 const row=target(db,s),person=s.tablica==='ljudi'?row:db.prepare('SELECT * FROM ljudi WHERE id=?').get(row.chelovek_id);if(!person)throw new NeNajdeno('Человек не найден');
 const roles=db.prepare('SELECT id,chelovek_id,napravlenie,rol,stadija,arhiv,arhiv_s,vozvrat_s FROM sotrudnichestva WHERE chelovek_id=? ORDER BY id').all(person.id);
 const direction=s.tablica==='sotrudnichestva'?db.prepare('SELECT nazvanie FROM napravlenija WHERE kod=?').get(row.napravlenie):null;
 const active=" AND (udaleno IS NULL OR udaleno=0) AND status NOT IN('sdelano','kogda_nibud')";
 const tasks=s.tablica==='ljudi'?db.prepare('SELECT id,status FROM zadachi WHERE (klient_id=? OR otvetstvennyj=?)'+active+' ORDER BY id').all(person.id,person.id):db.prepare('SELECT id,status FROM zadachi WHERE klient_id=? AND napravlenie=?'+active+' ORDER BY id').all(person.id,row.napravlenie);
 const projects=db.prepare("SELECT id,status FROM proekty WHERE klient_id=? AND coalesce(arhiv,0)=0 AND status<>'zavershen'"+(s.tablica==='sotrudnichestva'?' AND napravlenie=?':'')+' ORDER BY id').all(...(s.tablica==='sotrudnichestva'?[person.id,row.napravlenie]:[person.id]));
 const member=db.prepare('SELECT dostup,aktiven,komanda,arhiv FROM ljudi WHERE id=?').get(actor);
 const selected=r=>({arhiv:r.arhiv,arhiv_s:r.arhiv_s??null,vozvrat_s:r.vozvrat_s??null});
 const context={scope:s,actor,member,epoch:epoch(db,s),target:{...selected(row),imja:row.imja,chelovek_id:row.chelovek_id,napravlenie:row.napravlenie,rol:row.rol,stadija:row.stadija},person:{id:person.id,imja:person.imja,...selected(person)},roles,tasks,projects};
 return {...s,obekt:'arhiv',kontekst:hash(context),versija:row.versija,arhiv:!!row.arhiv,arhiv_s:row.arhiv_s??null,vozvrat_s:row.vozvrat_s??null,imja:person.imja,chelovek_id:person.id,napravlenie:row.napravlenie??null,napravlenie_imja:direction?.nazvanie??null,rol:row.rol??null,chelovek_v_arhive:!!person.arhiv,sotrudnichestv:roles.length,otdelno_v_arhive:roles.filter(r=>r.arhiv).length,otkrytyh_zadach:tasks.length,aktivnyh_proektov:projects.length};
}
function receipt(db,s,actor,value){const row=db.prepare('SELECT * FROM zaprosy_arhiva WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));if(row&&(row.tablica!==s.tablica||row.obekt_id!==s.id))throw new Konflikt('Ключ относится к другой карточке',{operation_key_reused:true});return row;}
function proof(db,s,actor,value){
 const row=receipt(db,s,actor,value),identity={obekt:'arhiv',avtor_id:actor,...s,zapros_kljuch:value.toLowerCase()};if(!row)return {...identity,sostojanie:'ne_najdeno'};if(!row.sohraneno)return {...identity,sostojanie:'otmeneno',dejstvie:row.dejstvie};
 const current=db.prepare('SELECT * FROM '+s.tablica+' WHERE id=?').get(s.id),same=!!current&&epoch(db,s)===row.sobytie_sozdanija,result=JSON.parse(row.rezultat_json),reverted=!!db.prepare('SELECT 1 FROM zaprosy_arhiva WHERE avtor=? AND roditel_kljuch_hesh=? AND sohraneno=1').get(actor,row.kljuch_hesh);
 const moved=same&&s.tablica==='sotrudnichestva'&&(current.chelovek_id!==result.chelovek_id||current.napravlenie!==result.napravlenie||current.rol!==result.rol);
 return {...identity,sostojanie:'sohraneno',dejstvie:row.dejstvie,...result,vernuto:reverted,zapis_suschestvuet:same,perenesen:!!moved,...(same?{arhiv_tekuschij:!!current.arhiv,versija_tekuschaja:current.versija,izmeneno_posle:current.versija!==result.versija_sohranenija}:{zapis_zamenena:!!current})};
}
function digest(value,s,kind,body){const {zapros_kljuch,...data}=body;return createHmac('sha256',value.toLowerCase()).update(JSON.stringify(stable({scope:s,kind,body:data}))).digest('hex');}
function repeated(db,s,actor,value,kind,signature){const row=receipt(db,s,actor,value);if(!row)return null;if(!row.sohraneno)throw new Konflikt('Попытка отменена. Начни новое действие',{operation_cancelled:true});if(row.dejstvie!==kind||row.zapros_hesh!==signature)throw new Konflikt('Под этим ключом отправлено другое действие',{operation_key_reused:true});return {...proof(db,s,actor,value),povtor_dejstvija:true};}
function record(db,s,actor,value,kind,signature,result,parent){db.prepare('INSERT INTO zaprosy_arhiva(avtor,kljuch_hesh,tablica,obekt_id,dejstvie,roditel_kljuch_hesh,zapros_hesh,sohraneno,sobytie_sozdanija,rezultat_json,sozdano)VALUES(?,?,?,?,?,?,?,1,?,?,?)').run(actor,key(value),s.tablica,s.id,kind,parent?key(parent):null,signature,epoch(db,s),JSON.stringify(result),seichas());return proof(db,s,actor,value);}
function save(ctx){
 const db=baza(),body=ctx.telo||{};if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});if(ctx.kljuch||Object.keys(ctx.zapros||{}).length)throw new OshibkaVvoda('Параметры действия передаются в теле');fields(body,['tablica','id','arhiv','versija','kontekst','zapros_kljuch']);const s=scope(body);key(body.zapros_kljuch);
 if(typeof body.arhiv!=='boolean'||!Number.isSafeInteger(body.versija)||body.versija<1)throw new OshibkaVvoda('Нужны состояние архива и прочитанная версия','versija');
 const signature=digest(body.zapros_kljuch,s,'arhiv',body),old=repeated(db,s,ctx.avtor,body.zapros_kljuch,'arhiv',signature);if(old)return {telo:old};
 const p=preview(db,s,ctx.avtor);if(typeof body.kontekst!=='string'||body.kontekst!==p.kontekst)throw new Konflikt('Карточка или связанные направления изменились. Проверь подтверждение заново',{kontekst_izmenilsja:true});
 const result=require('./podruchki.js').OTDELNYE.arhiv({...ctx,telo:{...s,arhiv:body.arhiv,versija:body.versija}});
 const after=target(db,s),out={chelovek_id:p.chelovek_id,napravlenie:p.napravlenie,rol:p.rol,arhiv:!!after.arhiv,arhiv_s:after.arhiv_s??null,vozvrat_s:after.vozvrat_s??null,versija_sohranenija:after.versija,otmena_dejstvie_id:result.telo.otmena_dejstvie_id};
 return {telo:record(db,s,ctx.avtor,body.zapros_kljuch,'arhiv',signature,out)};
}
function undo(ctx,s){
 const db=baza(),body=ctx.telo;fields(body,['tablica','id','zapros_kljuch','ishodnyj_kljuch']);key(body.zapros_kljuch);key(body.ishodnyj_kljuch);
 const signature=digest(body.zapros_kljuch,s,'otmenit',body),old=repeated(db,s,ctx.avtor,body.zapros_kljuch,'otmenit',signature);if(old)return {telo:old};
 const original=receipt(db,s,ctx.avtor,body.ishodnyj_kljuch);if(!original?.sohraneno||original.dejstvie!=='arhiv')throw new Konflikt('Исходное действие архива не найдено');
 if(epoch(db,s)!==original.sobytie_sozdanija)throw new Konflikt('Исходную карточку удалили или создали заново. Другая карточка не изменена');
 if(db.prepare('SELECT 1 FROM zaprosy_arhiva WHERE avtor=? AND roditel_kljuch_hesh=? AND sohraneno=1').get(ctx.avtor,original.kljuch_hesh))throw new Konflikt('Это действие уже отменено');
 const prior=JSON.parse(original.rezultat_json),current=target(db,s);
 if(s.tablica==='sotrudnichestva'&&(current.chelovek_id!==prior.chelovek_id||current.napravlenie!==prior.napravlenie||current.rol!==prior.rol))throw new Konflikt('Сотрудничество перенесли или изменили его роль. Отмена не изменит другой контекст');
 require('./obschij.js').otmenit_po_zhurnalu({dejstvie_id:prior.otmena_dejstvie_id},ctx.avtor);const after=target(db,s);
 return {telo:record(db,s,ctx.avtor,body.zapros_kljuch,'otmenit',signature,{chelovek_id:prior.chelovek_id,napravlenie:prior.napravlenie,rol:prior.rol,otmeneno:true,arhiv:!!after.arhiv,arhiv_s:after.arhiv_s??null,vozvrat_s:after.vozvrat_s??null,versija_sohranenija:after.versija},body.ishodnyj_kljuch)};
}
function handle(ctx){
 if(ctx.kljuch)throw new OshibkaVvoda('Номер карточки передаётся параметром id','id');
 const db=baza(),body=ctx.telo||{},query=ctx.zapros||{},action=ctx.dejstvie;
 if(['predprosmotr','proverka'].includes(action)){
  if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});fields(query,action==='proverka'?['tablica','id','zapros_kljuch']:['tablica','id']);const s=scope(query);
  return {telo:action==='proverka'?proof(db,s,ctx.avtor,query.zapros_kljuch):v_odnoj_tranzakcii(db,()=>preview(db,s,ctx.avtor))};
 }
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});if(Object.keys(query).length)throw new OshibkaVvoda('Параметры действия передаются в теле');const s=scope(body);
 if(action==='otmenit')return undo(ctx,s);
 if(action==='otmena_popytki'){
  fields(body,['tablica','id','dejstvie','zapros_kljuch']);key(body.zapros_kljuch);const kind=body.dejstvie??'arhiv';if(!['arhiv','otmenit'].includes(kind))throw new OshibkaVvoda('Действие архива не найдено');
  if(!receipt(db,s,ctx.avtor,body.zapros_kljuch))db.prepare('INSERT INTO zaprosy_arhiva(avtor,kljuch_hesh,tablica,obekt_id,dejstvie,sozdano)VALUES(?,?,?,?,?,?)').run(ctx.avtor,key(body.zapros_kljuch),s.tablica,s.id,kind,seichas());
  return {telo:proof(db,s,ctx.avtor,body.zapros_kljuch)};
 }
 throw new OshibkaVvoda('Действие архива не найдено');
}
module.exports={save,handle,preview,proof,scope};
