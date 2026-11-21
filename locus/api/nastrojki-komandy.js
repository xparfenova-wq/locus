const {createHash,createHmac}=require('node:crypto');
const {baza,v_odnoj_tranzakcii,OshibkaVvoda,Konflikt,seichas}=require('../db/db.js');
const presets=['firmennaja','spokojnaja','teplaja','nebo','sad','indigo'];
const jsonFields=new Set(['razdely_menju','prioritetnye_napravlenija','svoi_cveta','bot_sobytija']);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
function actor(v){if(!Number.isSafeInteger(v)||v<1)throw new OshibkaVvoda('Нужен автор настроек');return v;}
function fields(v,allowed){if(!plain(v))throw new OshibkaVvoda('Нужен объект параметров');for(const k of Object.keys(v))if(!allowed.includes(k))throw new OshibkaVvoda('Неизвестный параметр настроек',k);}
function key(v){if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v))throw new OshibkaVvoda('Нужен ключ одного сохранения','zapros_kljuch');return hash(v.toLowerCase());}
const revision=(db,id)=>db.prepare('SELECT versija FROM versii_nastroek WHERE chelovek_id=?').get(id)?.versija??0;
function context(db,id){return hash({actor:actor(id),version:revision(db,id),row:db.prepare('SELECT * FROM nastrojki WHERE chelovek_id=?').get(id)??null});}
function present(db,id,value){return {...value,kontekst_nastroek:context(db,id),versija_nastroek:revision(db,id),polja_nastroek:db.prepare('PRAGMA table_info(nastrojki)').all().map(r=>r.name).filter(k=>k!=='chelovek_id')};}
function receipt(db,id,value){return db.prepare('SELECT * FROM zaprosy_nastroek WHERE avtor=? AND kljuch_hesh=?').get(actor(id),key(value));}
function proof(db,id,value){
 const r=receipt(db,id,value);if(!r)return {sostojanie:'ne_najdeno'};if(!r.sohraneno)return {sostojanie:'otmeneno'};
 if(r.udaleno||!db.prepare('SELECT 1 FROM nastrojki WHERE chelovek_id=?').get(id))return {sostojanie:'udaleno',dejstvie:r.dejstvie,versija_sohranenija:r.versija_posle};
 const current=require('./ekrany.js').nastrojki({metod:'GET',avtor:id,zapros:{}}).telo;
 return {sostojanie:'sohraneno',dejstvie:r.dejstvie,versija_sohranenija:r.versija_posle,kontekst_sohranenija:r.kontekst_posle,polja:JSON.parse(r.polja_json),izmeneno_posle:r.kontekst_posle!==current.kontekst_nastroek,nastrojki:current};
}
function read(ctx){if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET проверки'),{kod:405});fields(ctx.zapros,['zapros_kljuch']);return {telo:proof(baza(),actor(ctx.avtor),ctx.zapros.zapros_kljuch)};}
function cancel(ctx){if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST отмены попытки'),{kod:405});fields(ctx.telo,['zapros_kljuch']);const db=baza(),id=actor(ctx.avtor),value=ctx.telo.zapros_kljuch;return v_odnoj_tranzakcii(db,()=>{if(!receipt(db,id,value))db.prepare("INSERT INTO zaprosy_nastroek(avtor,kljuch_hesh,dejstvie,sozdano)VALUES(?,?,'otmena',?)").run(id,key(value),seichas());return {telo:proof(db,id,value)};});}
function palette(value){if(!Array.isArray(value)||value.length!==5||value.some(v=>typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v)))throw new OshibkaVvoda('Нужны пять цветов вида #112233','cveta');return value.map(v=>v.toUpperCase());}
function storedColors(row){if(row?.svoi_cveta==null||row.svoi_cveta==='')return {};let v;try{v=JSON.parse(row.svoi_cveta);}catch{}if(!plain(v))throw new Konflikt('Сохранённые цвета не читаются. Проверь их перед заменой',{colors_unreadable:true});return v;}
const validPalette=v=>Array.isArray(v)&&v.length===5&&v.every(c=>typeof c==='string'&&/^#[a-f0-9]{6}$/i.test(c));
function validateColors(v){
 if(!plain(v))throw new OshibkaVvoda('Нужен объект цветов','svoi_cveta');
 if(Object.hasOwn(v,'palitra')&&!presets.includes(v.palitra))throw new OshibkaVvoda('Такой готовой палитры нет','svoi_cveta');
 for(const k of ['svoja_palitra','primenennaja_palitra'])if(Object.hasOwn(v,k))palette(v[k]);
 for(const k of ['status','napravlenie'])if(Object.hasOwn(v,k)&&(!plain(v[k])||Object.values(v[k]).some(c=>typeof c!=='string'||!/^#(?:[a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(c))))throw new OshibkaVvoda('Укажи цвета в шестнадцатеричном формате','svoi_cveta');
}
function equivalent(a,b,json=false){
 if(json&&typeof a==='string')try{a=JSON.parse(a);}catch{}
 if(json&&typeof b==='string')try{b=JSON.parse(b);}catch{}
 if(typeof b==='boolean'&&(a===0||a===1))b=b?1:0;
 return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
function handle(ctx,write){
 if(!['PATCH','POST','PUT'].includes(ctx.metod)||!Object.hasOwn(ctx.telo||{},'zapros_kljuch'))return null;
 const db=baza(),id=actor(ctx.avtor),body={...ctx.telo},value=body.zapros_kljuch;delete body.zapros_kljuch;fields(body,['dejstvie','kontekst_nastroek','izmenenija','cveta']);key(value);
 if(!['pravka','palitra_sohranit','palitra_primenit'].includes(body.dejstvie))throw new OshibkaVvoda('Выбери действие настроек','dejstvie');
 const digest=createHmac('sha256',value.toLowerCase()).update(JSON.stringify(canonical(body))).digest('hex');
 return v_odnoj_tranzakcii(db,()=>{
  const previous=receipt(db,id,value);if(previous){if(!previous.sohraneno)throw new Konflikt('Сохранение отменено. Начни новое действие',{settings_cancelled:true});if(previous.zapros_hesh!==digest)throw new Konflikt('Под этим ключом отправлены другие настройки',{operation_key_reused:true});const result=proof(db,id,value);if(result.sostojanie!=='sohraneno')throw Object.assign(new Error('После этого сохранения настройки были сброшены'),{kod:410,dannye:result});return {telo:{...result,povtor:true}};}
  if(typeof body.kontekst_nastroek!=='string'||body.kontekst_nastroek!==context(db,id))throw new Konflikt('Настройки изменились. Перечитай их перед сохранением',{settings_changed:true});
  const row=db.prepare('SELECT * FROM nastrojki WHERE chelovek_id=?').get(id);let changes;
  if(body.dejstvie==='pravka'){
   if(Object.hasOwn(body,'cveta')||!plain(body.izmenenija)||!Object.keys(body.izmenenija).length)throw new OshibkaVvoda('Нужны изменённые настройки','izmenenija');
   const allowed=db.prepare('PRAGMA table_info(nastrojki)').all().map(r=>r.name).filter(k=>k!=='chelovek_id');fields(body.izmenenija,allowed);changes={...body.izmenenija};if(Object.hasOwn(changes,'svoi_cveta'))validateColors(changes.svoi_cveta);
  }else{
   if(Object.hasOwn(body,'izmenenija'))throw new OshibkaVvoda('Сохранение набора не заменяет остальные настройки','izmenenija');const colors=palette(body.cveta),cv=storedColors(row),next={...cv};
   if(body.dejstvie==='palitra_sohranit'){
                                                                               
    if(!validPalette(next.primenennaja_palitra)&&validPalette(cv.svoja_palitra))next.primenennaja_palitra=cv.svoja_palitra.slice();
    if(!presets.includes(next.palitra)&&!validPalette(next.primenennaja_palitra))next.palitra='firmennaja';
   }else{next.primenennaja_palitra=colors.slice();delete next.palitra;delete next.status;}
   next.svoja_palitra=colors;changes={svoi_cveta:next};
  }
  if(Object.hasOwn(changes,'pokazannye_podskazki'))changes.pokazannye_podskazki=require('./context-hints.js').normalise(changes.pokazannye_podskazki);
  const changed=Object.keys(changes).filter(k=>!equivalent(row?.[k],changes[k],jsonFields.has(k)));
  if(changed.length)write(Object.fromEntries(changed.map(k=>[k,changes[k]])));
  const current=context(db,id);db.prepare('INSERT INTO zaprosy_nastroek(avtor,kljuch_hesh,zapros_hesh,dejstvie,sohraneno,versija_posle,kontekst_posle,polja_json,sozdano)VALUES(?,?,?,?,1,?,?,?,?)').run(id,key(value),digest,body.dejstvie,revision(db,id),current,JSON.stringify(changed),seichas());
  return {telo:proof(db,id,value)};
 });
}
module.exports={context,present,handle,read,cancel};
