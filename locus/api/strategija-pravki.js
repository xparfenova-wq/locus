const crypto=require('node:crypto');
const {baza,v_api,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,Konflikt,seichas}=require('../db/db.js');
const rights=require('./prava-strategii.js'),model=require('./tezisy-model.js');
const owns=(value,key)=>Object.hasOwn(value||{},key),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
function uuid(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ изменения стратегии','zapros_kljuch');return value.toLowerCase();}
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value))throw new OshibkaVvoda('Нужны параметры изменения стратегии');for(const key of Object.keys(value))if(!allowed.includes(key))throw new OshibkaVvoda('Неизвестное поле стратегии',key);}
function id(value){return require('./okr-svjazi.js').id(value,'tezis_id');}
function row(db,value,{deleted=false}={}){const result=db.prepare('SELECT * FROM tezisy WHERE id=?').get(id(value));if(!result||result.udaleno&&!deleted)throw new NeNajdeno('Тезис стратегии недоступен');return result;}
function area(body){const direction=body.napravlenie;if(typeof direction!=='string'||!/^[a-z][a-z0-9_]*$/.test(direction))throw new OshibkaVvoda('Выбери направление','napravlenie');return 'god:'+direction+':'+model.year(body.god);}
function saved(db,actor,key){return db.prepare('SELECT * FROM zaprosy_strategii WHERE avtor=? AND kljuch_hesh=?').get(actor,sha(uuid(key)));}
function creation(db,number){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='tezis' AND obekt_id=? AND pole='sozdano'").get(number)?.id??null;}
function current(db,source){if(!source)return null;const found=db.prepare('SELECT * FROM tezisy WHERE id=?').get(source.id);return found&&creation(db,source.id)===source.sobytie_sozdanija?v_api(found):null;}
function envelope(db,result){return Array.isArray(result)?result.map(item=>envelope(db,item)):result?.id?{...v_api(result),sobytie_sozdanija:creation(db,result.id)}:result;}
function proof(db,actor,key){
 const receipt=saved(db,actor,key);if(!receipt)return {sostojanie:'ne_najdeno'};
 if(receipt.otmeneno)return {sostojanie:'otmeneno',dejstvie:receipt.dejstvie,oblast:receipt.oblast};
 if(!receipt.sohraneno)return {sostojanie:'ne_podtverzhdeno'};
 const result=JSON.parse(receipt.itog_json),actual=Array.isArray(result)?result.map(source=>current(db,source)):current(db,result);
 return {sostojanie:'sohraneno',dejstvie:receipt.dejstvie,oblast:receipt.oblast,itog:result,tekuschee:actual};
}
function command(db,actor,kind,scope,input,perform){
 const body={...input},key=body.zapros_kljuch;delete body.zapros_kljuch;
 if(key===undefined)return v_odnoj_tranzakcii(db,()=>perform(body).result);
 const value=uuid(key),digest=crypto.createHmac('sha256',value).update(JSON.stringify(canonical({kind,scope,body}))).digest('hex');
 return v_odnoj_tranzakcii(db,()=>{
  const previous=saved(db,actor,value);
  if(previous){
   if(previous.dejstvie!==kind||previous.oblast!==scope)throw new Konflikt('Ключ относится к другому изменению стратегии',{operation_key_reused:true});
   if(previous.otmeneno)throw new Konflikt('Это изменение отменено. Начни новое действие',{creation_cancelled:true});
   if(previous.zapros_hesh!==digest)throw new Konflikt('Под этим ключом уже были другие данные',{operation_key_reused:true});
   const result=proof(db,actor,value);return {...result,povtor_sohranenija:true};
  }
  const changed=perform(body),result=envelope(db,changed.result);
  db.prepare('INSERT INTO zaprosy_strategii(avtor,kljuch_hesh,dejstvie,oblast,zapros_hesh,sohraneno,itog_json,do_json,posle_json,sozdano)VALUES(?,?,?,?,?,1,?,?,?,?)').run(actor,sha(value),kind,scope,digest,JSON.stringify(result),JSON.stringify(changed.before??null),JSON.stringify(changed.after??changed.result),seichas());
  return proof(db,actor,value);
 });
}
function dependencies(db,source,actor){
 const all=db.prepare('SELECT id,versija,nazvanie,napravlenie,period_id,sostojanie FROM celi WHERE tezis_id=? ORDER BY id').all(source.id),scope=require('./pravila-otveta.js').vidimost('celi',actor,'c.'),visible=db.prepare('SELECT c.id,c.nazvanie,c.period_id FROM celi c WHERE c.tezis_id=? AND '+scope.sql+' ORDER BY c.id').all(source.id,...scope.args);
 return {tezis:v_api(source),versija:source.versija,celi:visible,est_drugie_svjazi:visible.length!==all.length,podpis:sha(JSON.stringify({source:source.id,version:source.versija,all})),hasLinks:all.length>0};
}
function beforeDelete(db,source,actor,options){
 const preview=dependencies(db,source,actor),confirm=[true,1,'1'].includes(options.confirm);
 if(preview.hasLinks&&!confirm)throw new Konflikt('На тезис ссылаются цели. Подтверди удаление после просмотра связей',{podtverzhdenie_nuzhno:true,...preview});
 if((preview.hasLinks||options.podpis!==undefined)&&options.podpis!==preview.podpis)throw new Konflikt('Связи тезиса изменились. Посмотри их ещё раз перед удалением',{svjazi_izmenilis:true,...preview});
}
function handle(ctx){
 const db=baza(),actor=ctx.avtor,method=ctx.metod,action=ctx.dejstvie,query=ctx.zapros||{},input=ctx.telo||{};
 if(ctx.kljuch&&['proverka','otmena_popytki','porjadok'].includes(action))throw new NeNajdeno('У этого действия стратегии нет номера тезиса');
 if(action==='proverka'){if(method!=='GET')throw Object.assign(new Error('Нужен GET проверки стратегии'),{kod:405});fields(query,['zapros_kljuch']);return {telo:proof(db,actor,query.zapros_kljuch)};}
 if(action==='predprosmotr_udalenija'){if(method!=='GET')throw Object.assign(new Error('Нужен GET просмотра связей'),{kod:405});rights.check(db,actor);fields(query,[]);return {telo:dependencies(db,row(db,ctx.kljuch),actor)};}
 if(method==='GET'&&!action&&ctx.kljuch)return {telo:v_api(row(db,ctx.kljuch))};
 if(method==='GET'&&!action)return null;
 rights.check(db,actor);
 if(action==='otmena_popytki'){
  if(method!=='POST')throw Object.assign(new Error('Нужен POST отмены попытки'),{kod:405});fields(input,['zapros_kljuch','dejstvie','oblast']);if(!['sozdat','pravka','udalit','porjadok'].includes(input.dejstvie)||typeof input.oblast!=='string'||!/^(?:tezis:[1-9]\d*|god:[a-z][a-z0-9_]*:\d{4})$/.test(input.oblast))throw new OshibkaVvoda('Нужна исходная область изменения');
  return {telo:v_odnoj_tranzakcii(db,()=>{const previous=saved(db,actor,input.zapros_kljuch);if(previous&&(previous.dejstvie!==input.dejstvie||previous.oblast!==input.oblast))throw new Konflikt('Ключ относится к другому изменению');if(!previous)db.prepare('INSERT INTO zaprosy_strategii(avtor,kljuch_hesh,dejstvie,oblast,otmeneno,sozdano)VALUES(?,?,?,?,1,?)').run(actor,sha(uuid(input.zapros_kljuch)),input.dejstvie,input.oblast,seichas());return proof(db,actor,input.zapros_kljuch);})};
 }
 if(action==='porjadok'){
  if(method!=='POST')throw Object.assign(new Error('Нужен POST порядка тезисов'),{kod:405});fields(input,['napravlenie','god','spisok','zapros_kljuch']);const scope=area(input);
  return {telo:command(db,actor,'porjadok',scope,input,body=>{
   if(!Array.isArray(body.spisok)||!body.spisok.length||body.spisok.some(item=>!item||typeof item!=='object'))throw new OshibkaVvoda('Нужен полный список тезисов','spisok');
   const ids=body.spisok.map(item=>{fields(item,['id','versija']);return id(item.id);}),before=db.prepare('SELECT * FROM tezisy WHERE napravlenie=? AND god=? AND COALESCE(udaleno,0)=0 ORDER BY porjadok,id').all(body.napravlenie,model.year(body.god));
   if(new Set(ids).size!==ids.length||JSON.stringify([...ids].sort((a,b)=>a-b))!==JSON.stringify(before.map(item=>item.id).sort((a,b)=>a-b)))throw new Konflikt('Состав стратегии изменился. Обнови список перед перестановкой',{spisok:before.map(v_api)});
   const common=require('./obschij.js'),description=require('./opisanija.js').OPISANIJA.tezisy;
   body.spisok.forEach((item,index)=>common.pravit('tezisy',description,item.id,{porjadok:index,versija:item.versija},actor));const result=ids.map(number=>row(db,number));return {before,result};
  })};
 }
 if(action)return null;
 const common=require('./obschij.js'),description=require('./opisanija.js').OPISANIJA.tezisy;
 if(method==='POST'&&!ctx.kljuch){fields(input,['napravlenie','god','tekst','porjadok','zapros_kljuch']);return {kod:201,telo:command(db,actor,'sozdat',area(input),input,body=>({result:common.sozdat('tezisy',description,body,actor)}))};}
 if(method==='PATCH'&&ctx.kljuch){fields(input,['napravlenie','god','tekst','porjadok','versija','udaleno','zapros_kljuch']);const number=id(ctx.kljuch);return {telo:command(db,actor,'pravka','tezis:'+number,input,body=>{const before=row(db,number,{deleted:true});if(before.udaleno&&body.udaleno!==false)throw Object.assign(new Error('Тезис удалён. Сначала восстанови его'),{kod:410});if(owns(body,'udaleno')&&body.udaleno!==false)throw new OshibkaVvoda('Для удаления есть отдельное действие','udaleno');return {before,result:common.pravit('tezisy',description,number,body,actor)};})};}
 if(method==='DELETE'&&ctx.kljuch){fields(input,['versija','confirm','podpis','zapros_kljuch']);const number=id(ctx.kljuch),body={...input};if(query.confirm!==undefined){if(owns(body,'confirm')&&String(body.confirm)!==String(query.confirm))throw new OshibkaVvoda('Подтверждение удаления должно быть одним','confirm');body.confirm=query.confirm;}return {telo:command(db,actor,'udalit','tezis:'+number,body,options=>{const before=row(db,number);beforeDelete(db,before,actor,options);common.udalit('tezisy',description,number,actor,options);return {before,result:row(db,number,{deleted:true})};})};}
 throw Object.assign(new Error('Этот метод не поддерживается для стратегии'),{kod:405});
}
module.exports={handle,beforeDelete,dependencies,proof};
