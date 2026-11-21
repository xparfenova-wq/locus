const {createHash,createHmac}=require('node:crypto');
const {baza,OshibkaVvoda,Konflikt,NeNajdeno,seichas,v_api}=require('../db/db.js');
const model=require('./celi-model.js'),own=(v,k)=>Object.hasOwn(v||{},k),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const id=value=>require('./okr-svjazi.js').id(value,'cel_id');
function key(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ изменения цели','zapros_kljuch');return hash(value.toLowerCase());}
function fields(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body))throw new OshibkaVvoda('Нужны параметры изменения цели');for(const name of Object.keys(body))if(!allowed.includes(name))throw new OshibkaVvoda('Неизвестное поле изменения цели',name);}
function epoch(db,goal){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='cel' AND obekt_id=? AND pole IN ('sozdano','udaleno')").get(goal)?.id??null;}
function load(db,goal,actor){const row=require('./okr-svjazi.js').goal(db,goal,actor);require('./pravila-otveta.js').proverit(db,{tablica:'celi',kljuch:goal,metod:'PATCH',telo:{},zapros:{},avtor:actor});return row;}
function context(db,row,actor){
 const versions=db.prepare("SELECT pole,versija FROM versii_polej WHERE tablica='celi' AND obekt_id=? AND pole IN('napravlenie','period_id','tezis_id','sostojanie') ORDER BY pole").all(row.id);
 const results=db.prepare('SELECT id FROM rezultaty WHERE cel_id=? ORDER BY id').all(row.id),tasks=db.prepare('SELECT id,napravlenie FROM zadachi WHERE cel_id=? OR rezultat_id IN(SELECT id FROM rezultaty WHERE cel_id=?) ORDER BY id').all(row.id,row.id);
 return hash({actor,id:row.id,epoch:epoch(db,row.id),versions,results,tasks,rights:model.permissions(db,row,actor),lead:db.prepare('SELECT veduschij_id FROM napravlenija WHERE kod=?').get(row.napravlenie)?.veduschij_id??null});
}
function info(db,row,actor){const rights=model.permissions(db,row,actor);try{load(db,row.id,actor);}catch(error){if(error.kod!==403)throw error;rights.mozhno_pravit=rights.mozhno_arhivirovat=rights.mozhno_vernut=false;rights.prichina='У цели есть денежные результаты. Для изменения нужен доступ к ним';}return {cel:v_api(row),prava:rights,kontekst:context(db,row,actor),spravochniki:{napravlenija:db.prepare('SELECT kod,nazvanie,arhiv FROM napravlenija ORDER BY porjadok,kod').all(),tezisy:db.prepare('SELECT id,tekst,napravlenie,god FROM tezisy WHERE COALESCE(udaleno,0)=0 ORDER BY god DESC,porjadok,id').all()}};}
function receipt(db,actor,goal,value){const row=db.prepare('SELECT * FROM zaprosy_pravok_celej WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));if(row&&row.cel_id!==goal)throw new Konflikt('Ключ относится к другой цели',{operation_key_reused:true});return row;}
function proof(db,actor,goal,value){
 const saved=receipt(db,actor,goal,value),identity={avtor_id:actor,cel_id:goal,obekt:'pravka_celi',zapros_kljuch:value.toLowerCase()};
 if(!saved)return {...identity,sostojanie:'ne_najdeno'};if(!saved.sohraneno)return {...identity,sostojanie:'otmeneno'};
 const result={...identity,sostojanie:'sohraneno',dejstvie:saved.dejstvie,versija_sohranenija:saved.versija_posle};
 const row=db.prepare('SELECT * FROM celi WHERE id=?').get(goal);if(!row||epoch(db,goal)!==saved.sobytie_id)return {...result,udaleno:true};
 try{load(db,goal,actor);}catch(error){if([403,404].includes(error.kod))return {...result,dannye_skryty:true};throw error;}
 return {...result,cel:v_api(row),sohranennye_polja:JSON.parse(saved.posle_json)};
}
function save(db,actor,goal,input,kind,perform){
 const value=input.zapros_kljuch,saved=receipt(db,actor,goal,value),digest=createHmac('sha256',String(value).toLowerCase()).update(JSON.stringify({kind,goal,body:stable(input)})).digest('hex');
 if(saved){if(!saved.sohraneno)throw new Konflikt('Попытка отменена. Начни новую правку',{edit_cancelled:true});if(saved.dejstvie!==kind||saved.zapros_hesh!==digest)throw new Konflikt('Под этим ключом были другие изменения',{operation_key_reused:true});return {...proof(db,actor,goal,value),povtor_pravki:true};}
 const before=load(db,goal,actor),body=perform(before),after=db.prepare('SELECT * FROM celi WHERE id=?').get(goal),changed=model.FIELDS.filter(f=>JSON.stringify(before[f]??null)!==JSON.stringify(after[f]??null));
 db.prepare('INSERT INTO zaprosy_pravok_celej(avtor,kljuch_hesh,cel_id,sobytie_id,dejstvie,roditel_kljuch_hesh,zapros_hesh,sohraneno,do_json,posle_json,versija_posle,sozdano)VALUES(?,?,?,?,?,?,?,1,?,?,?,?)').run(actor,key(value),goal,epoch(db,goal),kind,kind==='otmena'?key(input.ishodnyj_kljuch):null,digest,JSON.stringify(Object.fromEntries(changed.map(f=>[f,before[f]??null]))),JSON.stringify(Object.fromEntries(changed.map(f=>[f,after[f]??null]))),body.versija,seichas());return proof(db,actor,goal,value);
}
function handle(ctx){
 const action=ctx.dejstvie;if(!['redaktor','pravka_proverka','pravka_otmena_popytki','pravka_otmenit'].includes(action)&&!(ctx.metod==='PATCH'&&!action&&own(ctx.telo,'zapros_kljuch')))return null;
 const db=baza(),actor=ctx.avtor,goal=id(ctx.kljuch),body=ctx.telo||{},query=ctx.zapros||{},method=ctx.metod,common=require('./obschij.js'),description=require('./opisanija.js').OPISANIJA.celi;
 if(action==='redaktor'){if(method!=='GET')throw Object.assign(new Error('Нужен GET формы цели'),{kod:405});fields(query,[]);const row=require('./okr-svjazi.js').goal(db,goal,actor);return {telo:info(db,row,actor)};}
 if(action==='pravka_proverka'){if(method!=='GET')throw Object.assign(new Error('Нужен GET проверки правки'),{kod:405});fields(query,['zapros_kljuch']);return {telo:proof(db,actor,goal,query.zapros_kljuch)};}
 if(action==='pravka_otmena_popytki'){
  if(method!=='POST')throw Object.assign(new Error('Нужен POST отмены попытки'),{kod:405});fields(body,['zapros_kljuch']);fields(query,[]);
  if(!receipt(db,actor,goal,body.zapros_kljuch))db.prepare('INSERT INTO zaprosy_pravok_celej(avtor,kljuch_hesh,cel_id,sozdano)VALUES(?,?,?,?)').run(actor,key(body.zapros_kljuch),goal,seichas());return {telo:proof(db,actor,goal,body.zapros_kljuch)};
 }
 if(action==='pravka_otmenit'){
  if(method!=='POST')throw Object.assign(new Error('Нужен POST возврата полей цели'),{kod:405});fields(body,['zapros_kljuch','ishodnyj_kljuch']);fields(query,[]);
  return {telo:save(db,actor,goal,body,'otmena',row=>{const original=receipt(db,actor,goal,body.ishodnyj_kljuch);if(!original?.sohraneno||original.dejstvie!=='pravka'||epoch(db,goal)!==original.sobytie_id)throw new Konflikt('Исходная правка недоступна для возврата');
   if(db.prepare("SELECT 1 FROM zaprosy_pravok_celej WHERE avtor=? AND cel_id=? AND roditel_kljuch_hesh=? AND sohraneno=1").get(actor,goal,key(body.ishodnyj_kljuch)))throw new Konflikt('Эту правку уже вернули');
   const previous=JSON.parse(original.do_json),after=JSON.parse(original.posle_json),names=Object.keys(previous);if(!names.length)throw new Konflikt('В этой правке нет изменённых полей');
   require('./versii.js').proverit(db,'celi',row,original.versija_posle,model.versionDependencies(previous));for(const field of names)if(JSON.stringify(row[field]??null)!==JSON.stringify(after[field]??null))throw new Konflikt('После этой правки поле изменили. Сначала сравни актуальную цель');
   return common.pravit('celi',description,goal,{versija:row.versija,...previous},actor);
  })};
 }
 fields(body,['versija','kontekst','zapros_kljuch',...model.FIELDS]);fields(query,[]);
 return {telo:save(db,actor,goal,body,'pravka',row=>{
  if(!Number.isSafeInteger(body.versija)||body.versija<1)throw new OshibkaVvoda('Обнови цель перед изменением','versija');if(body.kontekst!==context(db,row,actor))throw new Konflikt('Связи или права цели изменились. Сравни актуальную цель',{kontekst_izmenilsja:true});
  const change=Object.fromEntries(model.FIELDS.filter(f=>own(body,f)).map(f=>[f,body[f]]));if(!Object.keys(change).length)throw new OshibkaVvoda('Нет полей для изменения');return common.pravit('celi',description,goal,{versija:body.versija,...change},actor);
 })};
}
module.exports={handle,info,proof};
