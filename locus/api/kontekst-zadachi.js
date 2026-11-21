const {createHash,createHmac}=require('node:crypto');
const {baza,seichas,v_odnoj_tranzakcii,OshibkaVvoda,Konflikt,NeNajdeno}=require('../db/db.js');
const FIELDS=Object.freeze(['napravlenie','tip','klient_id','proekt_id','sotrudnichestvo_id','cel_id','rezultat_id','plan_chislo','sprint','god_sprinta','data','srok']);
const DEPENDENCIES=[...FIELDS,'status','udaleno','roditel_id','platezh_id','rassylka_id','shablon','publikacija','akkaunt_id','povtorjaetsja'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
function fields(body,allowed){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new OshibkaVvoda('Нужен объект полей задачи');
 for(const field of Object.keys(body))if(!allowed.includes(field))throw new OshibkaVvoda('Неизвестное поле настроек задачи',field);
}
function positive(value,field){if(!Number.isSafeInteger(Number(value))||Number(value)<1||typeof value==='boolean')throw new OshibkaVvoda('Нужен номер задачи',field);return Number(value);}
function key(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одной правки','zapros_kljuch');return hash(value.toLowerCase());}
const epoch=(db,id)=>db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='sozdano'").get(id)?.id??null;
const versions=(db,table,id)=>db.prepare('SELECT pole,versija FROM versii_polej WHERE tablica=? AND obekt_id=? ORDER BY pole').all(table,id);
function load(db,number){const row=db.prepare('SELECT * FROM zadachi WHERE nomer=?').get(number);if(!row)throw new NeNajdeno('Задачи нет');return row;}
const present=(number,actor)=>require('./obschij.js').odna('zadachi',require('./opisanija.js').OPISANIJA.zadachi,number,actor);
function context(db,row,actor){
 const references=[];
 for(const [field,table]of [['proekt_id','proekty'],['sotrudnichestvo_id','sotrudnichestva'],['cel_id','celi'],['rezultat_id','rezultaty'],['platezh_id','platezhi'],['rassylka_id','rassylki'],['akkaunt_id','akkaunty']]){
  if(row[field]!=null)references.push({field,id:row[field],exists:!!db.prepare('SELECT 1 FROM '+table+' WHERE id=?').get(row[field]),versions:versions(db,table,row[field])});
 }
                                                                              
 return hash({actor,access:require('./dengi-dostup.js').vidit(db,actor),id:row.id,number:row.nomer,epoch:epoch(db,row.id),values:Object.fromEntries(DEPENDENCIES.filter(k=>k!=='plan_chislo').map(k=>[k,row[k]??null])),versions:versions(db,'zadachi',row.id).filter(r=>DEPENDENCIES.includes(r.pole)),references});
}
function catalogs(db,actor){
 const visibility=require('./pravila-otveta.js').vidimost('celi',actor,'c.');
 const goals=db.prepare('SELECT c.id,c.nazvanie,c.napravlenie,c.period_id,c.sostojanie FROM celi c WHERE '+visibility.sql+' ORDER BY c.nazvanie,c.id').all(...visibility.args);
 const ids=new Set(goals.map(g=>g.id)),canMoney=require('./dengi-dostup.js').vidit(db,actor),historicalMoney=require('./dengi-okr.js').ids(db);
 return {
  napravlenija:db.prepare('SELECT kod,nazvanie,arhiv FROM napravlenija ORDER BY porjadok,kod').all(),
  tipy:require('./opisanija.js').TIPY_ZADACHI,
  ljudi:db.prepare('SELECT id,imja,arhiv FROM ljudi ORDER BY imja,id').all(),
  proekty:db.prepare('SELECT id,nazvanie,napravlenie,klient_id,status,arhiv FROM proekty ORDER BY nazvanie,id').all(),
  sotrudnichestva:db.prepare('SELECT id,chelovek_id,napravlenie,rol,arhiv FROM sotrudnichestva ORDER BY id').all(),
  celi:goals,
  rezultaty:db.prepare('SELECT * FROM rezultaty ORDER BY id').all().filter(r=>ids.has(r.cel_id)&&(canMoney||!historicalMoney.has(r.id)&&!require('./dengi-okr.js').denezhnyj(r))).map(r=>({id:r.id,cel_id:r.cel_id,nazvanie:r.nazvanie,tip:r.tip})),
 };
}
function info(db,row,actor){
 const task=present(row.nomer,actor),money=require('./dengi-zadach.js').isMoney(db,row),visible=!money||require('./dengi-dostup.js').vidit(db,actor);
 const fixed=row.platezh_id!=null||row.rassylka_id!=null||!!row.referalnaja_zadacha||!!require('./referral-tasks.js').linked(db,row);
 const locked=fixed?['napravlenie','klient_id','proekt_id','sotrudnichestvo_id','tip','plan_chislo']:[];
 if(!visible)locked.push('plan_chislo');
 if(row.povtorjaetsja===1)locked.push('sprint','god_sprinta','data','srok');
 return {zadacha:task,kontekst:context(db,row,actor),polja:FIELDS.filter(k=>Object.hasOwn(task,k)),zablokirovany:[...new Set(locked)],prichina_blokirovki:fixed?'Связь этой задачи задаётся исходным платежом, рассылкой или реферальным расчётом.':'',spravochniki:catalogs(db,actor)};
}
function receipt(db,actor,number,value){
 const saved=db.prepare('SELECT * FROM zaprosy_konteksta_zadach WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));
 if(saved&&saved.nomer!==number)throw new Konflikt('Ключ относится к другой задаче',{operation_key_reused:true});return saved;
}
function proof(db,actor,number,value){
 const saved=receipt(db,actor,number,value),identity={avtor_id:actor,nomer:number,obekt:'kontekst_zadachi'};
 if(!saved)return {...identity,sostojanie:'ne_najdeno'};
 if(!saved.sohraneno)return {...identity,sostojanie:'otmeneno'};
 const row=db.prepare('SELECT * FROM zadachi WHERE id=? AND nomer=?').get(saved.zadacha_id,number);
 if(!row||row.udaleno||epoch(db,row.id)!==saved.sobytie_id)return {...identity,sostojanie:'udaleno'};
 return {...identity,dejstvie:saved.dejstvie,sostojanie:saved.otmeneno?'vozvrascheno':'sohraneno',zadacha_id:row.id,versija_sohranenija:saved.versija_posle,zadacha:present(number,actor)};
}
function apply(db,actor,number,body){
 fields(body,['versija','kontekst','zapros_kljuch',...FIELDS]);
 const value=body.zapros_kljuch,digest=createHmac('sha256',String(value).toLowerCase()).update(JSON.stringify({number,body:stable(body)})).digest('hex');
 const saved=receipt(db,actor,number,value);
 if(saved){
  if(!saved.sohraneno||saved.otmeneno)throw new Konflikt('Эта попытка отменена. Начни новую правку',{edit_cancelled:true});
  if(saved.dejstvie!=='pravka')throw new Konflikt('Ключ относится к другому действию',{operation_key_reused:true});
  if(saved.zapros_hesh!==digest)throw new Konflikt('Под этим ключом отправлены другие поля',{operation_key_reused:true});
  const checked=proof(db,actor,number,value);if(checked.sostojanie==='udaleno')throw Object.assign(new Error('Задача после этой правки удалена'),{kod:410});
  return {telo:{...checked,povtor_pravki:true}};
 }
 const row=load(db,number);if(row.udaleno)throw new Konflikt('Задача удалена. Правка не сохранена');
 if(!Number.isSafeInteger(body.versija)||body.versija<1)throw new OshibkaVvoda('Обнови задачу перед правкой','versija');
 if(typeof body.kontekst!=='string'||body.kontekst!==context(db,row,actor))throw new Konflikt('Связи задачи или их источники изменились. Сравни сохранённые поля',{kontekst_izmenilsja:true});
 const change=Object.fromEntries(FIELDS.filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]));
 if(!Object.keys(change).length)throw new OshibkaVvoda('Нет полей для изменения');
 const next={...row,...change};
 if(next.tip==='biznesovaja'&&!next.roditel_id&&next.publikacija!==1&&next.plan_chislo==null)throw new OshibkaVvoda('У бизнесовой задачи нужно целевое число','plan_chislo');
 for(const field of ['klient_id','proekt_id','sotrudnichestvo_id','cel_id','rezultat_id'])if(Object.hasOwn(change,field)&&change[field]!==null&&(!Number.isSafeInteger(change[field])||change[field]<1))throw new OshibkaVvoda('Выбери существующую запись',field);
 if(Object.hasOwn(change,'plan_chislo')&&change.plan_chislo!==null&&(typeof change.plan_chislo!=='number'||!Number.isFinite(change.plan_chislo)))throw new OshibkaVvoda('Нужно конечное число','plan_chislo');
 const locked=info(db,row,actor).zablokirovany;
 for(const field of locked)if(Object.hasOwn(change,field)&&change[field]!==row[field])throw new OshibkaVvoda('Это поле задаётся источником задачи или закрыто правами',field);
 const changed=require('./obschij.js').pravit('zadachi',require('./opisanija.js').OPISANIJA.zadachi,number,{versija:body.versija,...change},actor);
 const after=load(db,number);
 const before={fields:Object.fromEntries(FIELDS.filter(k=>JSON.stringify(row[k]??null)!==JSON.stringify(after[k]??null)).map(k=>[k,row[k]??null]))};
 db.prepare('INSERT INTO zaprosy_konteksta_zadach(avtor,kljuch_hesh,zadacha_id,nomer,sobytie_id,zapros_hesh,sohraneno,do_json,posle_json,versija_posle,sozdano)VALUES(?,?,?,?,?,?,1,?,?,?,?)').run(actor,key(value),row.id,number,epoch(db,row.id),digest,JSON.stringify(before),JSON.stringify({context:context(db,after,actor)}),changed.versija,seichas());
 return {telo:proof(db,actor,number,value)};
}
function handle(ctx){
 const db=baza(),number=positive(ctx.kljuch,'nomer'),actor=ctx.avtor;
 if(ctx.dejstvie==='kontekst'&&ctx.metod==='GET'){fields(ctx.zapros,[]);const row=load(db,number);if(row.udaleno)throw new Konflikt('Задача удалена. Сначала восстанови её.');return {telo:info(db,row,actor)};}
 if(ctx.dejstvie==='kontekst_proverka'&&ctx.metod==='GET'){fields(ctx.zapros,['zapros_kljuch']);return {telo:proof(db,actor,number,ctx.zapros.zapros_kljuch)};}
 if(ctx.metod!=='POST')throw Object.assign(new Error('Здесь GET или POST настроек задачи'),{kod:405});
 fields(ctx.zapros,[]);
 return v_odnoj_tranzakcii(db,()=>{
  if(ctx.dejstvie==='kontekst')return apply(db,actor,number,ctx.telo);
  fields(ctx.telo,ctx.dejstvie==='kontekst_otmenit'?['zapros_kljuch','pravka_kljuch']:['zapros_kljuch']);const value=ctx.telo.zapros_kljuch,saved=receipt(db,actor,number,value);
  if(ctx.dejstvie==='kontekst_otmena_popytki'){
   if(!saved){const row=load(db,number);db.prepare('INSERT INTO zaprosy_konteksta_zadach(avtor,kljuch_hesh,zadacha_id,nomer,sobytie_id,sozdano)VALUES(?,?,?,?,?,?)').run(actor,key(value),row.id,number,epoch(db,row.id),seichas());}
   return {telo:proof(db,actor,number,value)};
  }
  if(ctx.dejstvie==='kontekst_otmenit'){
   const parentKey=key(ctx.telo.pravka_kljuch),digest=createHmac('sha256',String(value).toLowerCase()).update(JSON.stringify({number,parentKey,action:'otmena'})).digest('hex');
   if(saved){
    if(!saved.sohraneno)throw new Konflikt('Попытка отмены остановлена. Начни новую отмену',{edit_cancelled:true});
    if(saved.dejstvie!=='otmena'||saved.roditel_kljuch_hesh!==parentKey||saved.zapros_hesh!==digest)throw new Konflikt('Ключ относится к другому действию',{operation_key_reused:true});
    return {telo:proof(db,actor,number,value)};
   }
   const parent=receipt(db,actor,number,ctx.telo.pravka_kljuch);
   if(!parent?.sohraneno||parent.dejstvie!=='pravka')throw new Konflikt('Сохранённой правки нет');
   const row=load(db,number),after=JSON.parse(parent.posle_json);
   if(row.id!==parent.zadacha_id||epoch(db,row.id)!==parent.sobytie_id||row.udaleno)throw new Konflikt('Исходная задача удалена. Возврат не выполнен');
   if(!parent.otmeneno){
    if(context(db,row,actor)!==after.context)throw new Konflikt('После этой правки связи или источники изменились. Сравни текущую задачу перед возвратом');
    const before=JSON.parse(parent.do_json);
    require('./obschij.js').pravit('zadachi',require('./opisanija.js').OPISANIJA.zadachi,number,{versija:row.versija,...before.fields},actor);
    db.prepare('UPDATE zaprosy_konteksta_zadach SET otmeneno=1 WHERE avtor=? AND kljuch_hesh=?').run(actor,parentKey);
   }
   const current=load(db,number);
   db.prepare("INSERT INTO zaprosy_konteksta_zadach(avtor,kljuch_hesh,zadacha_id,nomer,sobytie_id,dejstvie,roditel_kljuch_hesh,zapros_hesh,sohraneno,do_json,posle_json,versija_posle,sozdano)VALUES(?,?,?,?,?,'otmena',?,?,1,'{}','{}',?,?)").run(actor,key(value),row.id,number,epoch(db,row.id),parentKey,digest,current.versija,seichas());
   return {telo:proof(db,actor,number,value)};
  }
  throw new NeNajdeno('Действие настроек не найдено');
 });
}
module.exports={FIELDS,context,catalogs,info,proof,apply,handle};
