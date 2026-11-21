                                                                          
                                                                              
const {createHmac}=require('node:crypto');
const {baza,OshibkaVvoda,Konflikt,NeNajdeno,seichas,segodnja}=require('../db/db.js');
const identity=require('./grafik-identity.js'),calendar=require('./kalendar.js');
function fields(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body))throw new OshibkaVvoda('Нужны параметры графика');for(const k of Object.keys(body))if(!allowed.includes(k))throw new OshibkaVvoda('Неизвестный параметр графика',k);}
function key(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одной попытки','zapros_kljuch');return identity.hash(value.toLowerCase());}
function scope(body,actor,kind){
 const id=body.chelovek_id??actor;if(typeof id==='boolean'||typeof id==='string'&&!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)throw new OshibkaVvoda('Выбери человека','chelovek_id');
 const raw=kind==='kopirovat'?body.v:body.nedelja;
 if(typeof raw!=='string'||!/^\d{4}-W\d{2}$/.test(raw))throw new OshibkaVvoda('Нужна неделя вместе с годом','nedelja');
 const week=calendar.razobrat_nedelju(raw,calendar.iso_nedelja(segodnja()).god);
 return {chelovek_id:Number(id),god:week.god,nedelja:week.nomer};
}
function receipt(db,s,actor,value){const row=db.prepare('SELECT * FROM zaprosy_grafika WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));if(row&&['chelovek_id','god','nedelja'].some(k=>row[k]!==s[k]))throw new Konflikt('Ключ относится к другой неделе',{operation_key_reused:true});return row;}
function proof(db,s,actor,value){const r=receipt(db,s,actor,value),out={obekt:'grafik',avtor_id:actor,...s,zapros_kljuch:value.toLowerCase()};return !r?{...out,sostojanie:'ne_najdeno'}:!r.sohraneno?{...out,sostojanie:'otmeneno',dejstvie:r.dejstvie}:{...out,sostojanie:'sohraneno',dejstvie:r.dejstvie,...JSON.parse(r.rezultat_json),...require('./otmena-grafika.js').availability(db,s,actor,value)};}
function rights(db,s,actor){require('./prava-grafika.js').proverit(s.chelovek_id,actor);if(!identity.owner(db,s.chelovek_id))throw new NeNajdeno('Человек не найден');}
function run(ctx,kind){
 const body=ctx.telo||{};if(!Object.hasOwn(body,'zapros_kljuch'))return require('./podruchki2.js')['grafik_'+kind](ctx);
 if(ctx.metod!=='POST')throw Object.assign(Error('Нужен POST'),{kod:405});if(ctx.kljuch||Object.keys(ctx.zapros||{}).length)throw new OshibkaVvoda('Параметры попытки передаются в теле');
 fields(body,['chelovek_id','zapros_kljuch','kontekst',...(kind==='sohranit'?['nedelja','dni']:['iz','v','istochnik_kontekst'])]);
 const db=baza(),s=scope(body,ctx.avtor,kind),value=body.zapros_kljuch;key(value);
 const {zapros_kljuch,...data}=body,digest=createHmac('sha256',value.toLowerCase()).update(JSON.stringify(identity.stable({s,kind,data}))).digest('hex'),old=receipt(db,s,ctx.avtor,value);
 if(old){if(!old.sohraneno)throw new Konflikt('Эта попытка отменена. Можно начать новую',{operation_cancelled:true});if(old.dejstvie!==kind||old.zapros_hesh!==digest)throw new Konflikt('Под этим ключом другое действие',{operation_key_reused:true});return {telo:{...proof(db,s,ctx.avtor,value),povtor_dejstvija:true}};}
 if(db.prepare('SELECT 1 FROM dejstvija_grafika WHERE avtor=? AND kljuch_hesh=?').get(ctx.avtor,key(value)))throw new Konflikt('Ключ уже принадлежит другому действию графика',{operation_key_reused:true});
 rights(db,s,ctx.avtor);if(body.kontekst!==identity.owner(db,s.chelovek_id))throw new Konflikt('Карточка человека изменилась. Открой график заново',{kontekst_izmenilsja:true});
 let plain;
 if(kind==='sohranit'){
  if(!Array.isArray(body.dni)||!body.dni.length||body.dni.length>7)throw new OshibkaVvoda('Нужны изменённые дни недели','dni');
  const days=body.dni.map(day=>{fields(day,['id','den','versija','identichnost','chasov','s_kakogo','do_kakogo','ne_rabotaju','zametka']);
   if(!Number.isInteger(day.den)||day.den<1||day.den>7)throw new OshibkaVvoda('Нужен день недели от1до7','den');
   if(day.id!=null&&(typeof day.id==='boolean'||typeof day.id==='string'&&!/^[1-9]\d*$/.test(day.id)||!Number.isSafeInteger(Number(day.id))||Number(day.id)<1))throw new OshibkaVvoda('Нужен номер прочитанного дня','id');
   if(day.id!=null){const current=db.prepare('SELECT * FROM grafik WHERE id=?').get(day.id);if(!current||day.identichnost!==identity.row(db,current).identichnost||current.chelovek_id!==s.chelovek_id||current.god!==s.god||current.nedelja!==s.nedelja||current.den!==day.den)throw new Konflikt('Этот день удалили, заменили или перенесли. Проверь неделю заново',{den:day.den});}
   const {identichnost,...rest}=day;return rest;});
  plain={chelovek_id:s.chelovek_id,nedelja:body.nedelja,dni:days};
 }else{
  if(typeof body.iz!=='string'||!/^\d{4}-W\d{2}$/.test(body.iz))throw new OshibkaVvoda('Нужна исходная неделя с годом','iz');const source=calendar.razobrat_nedelju(body.iz,s.god,'iz');
  if(body.istochnik_kontekst!==identity.source(db,s.chelovek_id,source))throw new Konflikt('Исходная неделя изменилась. Проверь её перед копированием',{istochnik_izmenilsja:true});
  plain={chelovek_id:s.chelovek_id,iz:body.iz,v:body.v};
 }
 const before=require('./otmena-grafika.js').weekRows(db,s);
 const result=require('./podruchki2.js')['grafik_'+kind]({...ctx,telo:plain,zapros:{}}).telo;
 const metadata=kind==='sohranit'?{izmeneno_dnej:result.spisok.length}:{skopirovano:result.skopirovano,propuscheno:result.propuscheno,iz_god:result.iz_god,iz:result.iz};
 db.prepare('INSERT INTO zaprosy_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,zapros_hesh,sohraneno,rezultat_json,sozdano)VALUES(?,?,?,?,?,?,?,1,?,?)').run(ctx.avtor,key(value),s.chelovek_id,s.god,s.nedelja,kind,digest,JSON.stringify(metadata),seichas());
 require('./otmena-grafika.js').record(db,s,ctx.avtor,value,kind,before);
 return {telo:proof(db,s,ctx.avtor,value)};
}
function handle(ctx){
 const db=baza(),query=ctx.zapros||{},body=ctx.telo||{},action=ctx.dejstvie;
 if(ctx.kljuch)throw new OshibkaVvoda('У графика нет номера действия');
 if(['otmenit','otmena_proverka','poslednee_dejstvie'].includes(action)||action==='otmena_popytki'&&body.dejstvie==='otmenit')return require('./otmena-grafika.js').handle(ctx);
 if(action==='predprosmotr'){
  if(ctx.metod!=='GET')throw Object.assign(Error('Нужен GET'),{kod:405});fields(query,['chelovek_id','nedelja','iz']);const s=scope(query,ctx.avtor);rights(db,s,ctx.avtor);
  const rows=db.prepare('SELECT * FROM grafik WHERE chelovek_id=? AND god=? AND nedelja=? ORDER BY den,id').all(s.chelovek_id,s.god,s.nedelja);
  return {telo:{...s,kontekst:identity.owner(db,s.chelovek_id),poslednee_dejstvie:require('./otmena-grafika.js').lastFor(db,s,ctx.avtor),spisok:rows.map(r=>({...require('../db/db.js').v_api(r),...identity.row(db,r)})),...(query.iz?{istochnik_kontekst:identity.source(db,s.chelovek_id,calendar.razobrat_nedelju(query.iz,s.god,'iz'))}:{})}};
 }
 if(action==='proverka'){
  if(ctx.metod!=='GET')throw Object.assign(Error('Нужен GET'),{kod:405});fields(query,['chelovek_id','nedelja','zapros_kljuch']);const s=scope(query,ctx.avtor);return {telo:proof(db,s,ctx.avtor,query.zapros_kljuch)};
 }
 if(action==='otmena_popytki'){
  if(ctx.metod!=='POST')throw Object.assign(Error('Нужен POST'),{kod:405});if(Object.keys(query).length)throw new OshibkaVvoda('Параметры отмены передаются в теле');fields(body,['chelovek_id','nedelja','zapros_kljuch','dejstvie']);if(!['sohranit','kopirovat'].includes(body.dejstvie))throw new OshibkaVvoda('Выбери сохранение или копирование');const s=scope(body,ctx.avtor),r=receipt(db,s,ctx.avtor,body.zapros_kljuch);if(r&&r.dejstvie!==body.dejstvie)throw new Konflikt('Ключ относится к другому действию');if(!r)db.prepare('INSERT INTO zaprosy_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,sozdano)VALUES(?,?,?,?,?,?,?)').run(ctx.avtor,key(body.zapros_kljuch),s.chelovek_id,s.god,s.nedelja,body.dejstvie,seichas());return {telo:proof(db,s,ctx.avtor,body.zapros_kljuch)};
 }
 throw new OshibkaVvoda('Действие графика не найдено');
}
module.exports={run,handle,proof,key,scope,fields,rights};
