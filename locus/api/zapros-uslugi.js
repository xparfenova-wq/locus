                                                                                   
const {createHash,createHmac}=require('node:crypto');
const {baza,OshibkaVvoda,Konflikt,seichas}=require('../db/db.js');
const kinds=new Set(['sozdanie','pravka','zamena','porjadok']);
function key(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного действия','zapros_kljuch');return createHash('sha256').update(value.toLowerCase()).digest('hex');}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function scope(db,kind,id,direction){if(!kinds.has(kind)||!Number.isSafeInteger(id)||id<0||(['sozdanie','porjadok'].includes(kind)?id!==0:id<1))throw new OshibkaVvoda('Действие услуги не найдено','dejstvie');if(typeof direction!=='string'||!db.prepare('SELECT kod FROM napravlenija WHERE kod=?').get(direction))throw new OshibkaVvoda('Выбери направление','napravlenie');return {dejstvie:kind,usluga_id:id,napravlenie:direction};}
function receipt(db,actor,value){return db.prepare('SELECT * FROM zaprosy_dejstvij_uslug WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));}
function sameScope(saved,kind,id,direction){if(saved&&(saved.dejstvie!==kind||saved.usluga_id!==id||direction!==undefined&&saved.napravlenie!==direction))throw new Konflikt('Ключ относится к другому действию услуги',{operation_key_reused:true});}
function present(db,actor,saved){
 const base={dejstvie:saved.dejstvie,usluga_id:saved.usluga_id,napravlenie:saved.napravlenie};
 if(!saved.sohraneno)return {sostojanie:'otmeneno',...base};
 const result={sostojanie:'sohraneno',...base,itog:JSON.parse(saved.itog_json),udaleno:!!saved.udaleno};
 if(saved.rezultat_usluga_id&&!saved.udaleno){const row=db.prepare('SELECT id FROM uslugi WHERE id=?').get(saved.rezultat_usluga_id);if(row)result.usluga=require('./obschij.js').odna('uslugi',require('./opisanija.js').OPISANIJA.uslugi,row.id,actor);else result.udaleno=true;}
 if(saved.dejstvie==='porjadok')result.spisok=db.prepare('SELECT id FROM uslugi WHERE napravlenie=? ORDER BY COALESCE(arhiv,0),porjadok,id').all(saved.napravlenie).map(r=>require('./obschij.js').odna('uslugi',require('./opisanija.js').OPISANIJA.uslugi,r.id,actor));
 return result;
}
function run(ctx,{kind,id,direction},fn){
 const body={...ctx.telo},value=body.zapros_kljuch;delete body.zapros_kljuch;if(value===undefined)return fn(body);
 const db=baza(),saved=receipt(db,ctx.avtor,value),provided=typeof direction==='string'?direction:undefined;sameScope(saved,kind,id,provided);
 const resolved=saved?.napravlenie??(typeof direction==='function'?direction():direction),owner=scope(db,kind,id,resolved),digest=createHmac('sha256',value.toLowerCase()).update(JSON.stringify(canonical({...owner,body}))).digest('hex');
 if(saved){
  if(!saved.sohraneno)throw new Konflikt('Действие отменено. Начни новое действие',{action_cancelled:true});
  if(saved.zapros_hesh!==digest)throw new Konflikt('Под этим ключом отправлены другие поля',{operation_key_reused:true});
  const current=present(db,ctx.avtor,saved),itog=current.itog;
  if(current.udaleno)throw Object.assign(new Error('Действие выполнено, затем услуга была удалена. Повтор её не создаёт.'),{kod:410,dannye:current});
  if(kind==='porjadok')return {telo:{spisok:current.spisok,povtor_dejstvija:true}};
  if(kind==='zamena')return {telo:{udalena:{id},vstala:current.usluga,proektov:itog.proektov,povtor_dejstvija:true}};
  return {kod:kind==='sozdanie'?201:200,telo:{...current.usluga,...(kind==='sozdanie'?{proektov_perevedeno:itog.proektov_perevedeno}:{}),povtor_dejstvija:true,versija_sohranenija:itog.versija_posle}};
 }
 const result=fn(body),row=kind==='zamena'?result.telo.vstala:kind==='porjadok'?null:result.telo,summary=kind==='zamena'?{proektov:result.telo.proektov,versija_posle:row.versija}:kind==='porjadok'?{porjadok:result.telo.spisok.filter(r=>!r.arhiv).map(r=>r.id)}:{versija_posle:row.versija,...(kind==='sozdanie'?{proektov_perevedeno:result.telo.proektov_perevedeno}: {})};
 db.prepare('INSERT INTO zaprosy_dejstvij_uslug(avtor,kljuch_hesh,napravlenie,usluga_id,dejstvie,zapros_hesh,sohraneno,itog_json,rezultat_usluga_id,sozdano)VALUES(?,?,?,?,?,?,1,?,?,?)').run(ctx.avtor,key(value),resolved,id,kind,digest,JSON.stringify(summary),row?.id??null,seichas());return result;
}
function read(ctx){if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});for(const field of Object.keys(ctx.zapros||{}))if(field!=='zapros_kljuch')throw new OshibkaVvoda('Проверка принимает только ключ',field);const db=baza(),saved=receipt(db,ctx.avtor,ctx.zapros.zapros_kljuch);return {telo:saved?present(db,ctx.avtor,saved):{sostojanie:'ne_najdeno'}};}
function cancel(ctx){
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});const body=ctx.telo||{};for(const field of Object.keys(body))if(!['zapros_kljuch','dejstvie','usluga_id','napravlenie'].includes(field))throw new OshibkaVvoda('Неизвестное поле отмены',field);
 const db=baza(),owner=scope(db,body.dejstvie,body.usluga_id,body.napravlenie),saved=receipt(db,ctx.avtor,body.zapros_kljuch);sameScope(saved,owner.dejstvie,owner.usluga_id,owner.napravlenie);
 if(!saved)db.prepare('INSERT INTO zaprosy_dejstvij_uslug(avtor,kljuch_hesh,napravlenie,usluga_id,dejstvie,sozdano)VALUES(?,?,?,?,?,?)').run(ctx.avtor,key(body.zapros_kljuch),owner.napravlenie,owner.usluga_id,owner.dejstvie,seichas());
 return {telo:present(db,ctx.avtor,receipt(db,ctx.avtor,body.zapros_kljuch))};
}
module.exports={run,read,cancel};
