const {randomBytes,createHash}=require('node:crypto');
const {OshibkaVvoda,NeNajdeno,Konflikt,v_api}=require('../db/db.js');
function sozdatHranilische(clock=()=>Date.now()){
 const ttl=30000,hash=token=>createHash('sha256').update(token).digest('hex');
 const cleanup=db=>db.prepare('DELETE FROM otmeny_kontaktov WHERE do_ms<?').run(clock());
 const deletedEvent=(db,id)=>db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='kontakt' AND obekt_id=? AND pole='udaleno' AND stalo='да'").get(id).id;
 const primaryIds=(db,row)=>db.prepare('SELECT id FROM kontakty WHERE chelovek_id=? AND tip=? AND osnovnoj=1 ORDER BY id').all(row.chelovek_id,row.tip).map(x=>x.id);
 const parametry=options=>{
  if(options.proverit!==undefined&&typeof options.proverit!=='boolean')throw new OshibkaVvoda('proverit: да или нет','proverit');
  const key=options.zapros_kljuch;
  if(key!==undefined&&(typeof key!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)))throw new OshibkaVvoda('Нужен ключ одного запроса удаления','zapros_kljuch');
  if(options.proverit&&key===undefined)throw new OshibkaVvoda('Для проверки нужен ключ исходного запроса','zapros_kljuch');
  if(key!==undefined&&(!Number.isSafeInteger(options.versija)||options.versija<1))throw new OshibkaVvoda('Нужна увиденная версия контакта','versija');
  let scope=null;
  if(options.chelovek_id!==undefined||options.tip!==undefined){
   if(!Number.isSafeInteger(options.chelovek_id)||options.chelovek_id<1||!require('./opisanija.js').VIDY_KONTAKTA.includes(options.tip))throw new OshibkaVvoda('Нужны исходный человек и вид контакта','chelovek_id');
   scope={chelovek_id:options.chelovek_id,tip:options.tip};
  }
  return {keyHash:key===undefined?null:hash(key.toLowerCase()),scope};
 };
 const matches=(row,scope)=>!scope||(row.chelovek_id===scope.chelovek_id&&row.tip===scope.tip);
 const primary=(db,row)=>row?db.prepare('SELECT id FROM kontakty WHERE chelovek_id=? AND tip=? ORDER BY osnovnoj DESC,porjadok,id LIMIT 1').get(row.chelovek_id,row.tip)?.id??null:null;
 const group=(db,row)=>row?{osnovnaja_gruppa:require('./osnovnoj-kontakt.js').sostojanie(db,row.chelovek_id,row.tip)}:{};
 const insert=(db,receipt)=>{const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO otmeny_kontaktov(token_hesh,avtor,do_ms,udaleno_id,slepok,osnovnye,zapros_hesh) VALUES(?,?,?,?,?,?,?)').run(hash(token),receipt.avtor,receipt.do_ms,receipt.udaleno_id,receipt.slepok,receipt.osnovnye,receipt.zapros_hesh??null);return token;};
 return {
  proveritUdalenie(db,id,author,options={}){
   const {keyHash,scope}=parametry(options),current=db.prepare('SELECT * FROM kontakty WHERE id=?').get(id);
   if(!keyHash){if(current&&!matches(current,scope))throw new Konflikt('Контакт теперь относится к другому человеку или виду',{scope_changed:true});return null;}
   cleanup(db);
   const receipt=db.prepare('SELECT * FROM otmeny_kontaktov WHERE avtor=? AND zapros_hesh=? AND do_ms>=? ORDER BY token_hesh LIMIT 1').get(author,keyHash,clock());
   if(receipt){
    const row=JSON.parse(receipt.slepok);
    if(row.id!==Number(id)||row.versija!==options.versija||!matches(row,scope))throw new Konflikt('Ключ уже использован для другого контакта или версии',{operation_key_reused:true});
    if(!options.proverit){if(current)throw new Konflikt('Запрос удаления уже выполнен; контакт успели вернуть',{operation_key_reused:true});return null;}
    if(current)return {id:Number(id),deleted:false,udaleno:false,provereno:true,sostojanie:'est',scope_changed:!matches(current,scope),...group(db,scope||current)};
    if(deletedEvent(db,row.id)===receipt.udaleno_id)return {id:row.id,deleted:true,udaleno:true,provereno:true,token_otmeny:insert(db,receipt),novyj_osnovnoj:primary(db,row),...group(db,row)};
   }
   if(options.proverit)return {id:Number(id),deleted:!current,udaleno:!current,provereno:true,podtverzhdeno:false,sostojanie:current?'est':'otsutstvuet',scope_changed:current?!matches(current,scope):false,token_otmeny:null,novyj_osnovnoj:primary(db,scope),...group(db,scope||current)};
   if(current&&!matches(current,scope))throw new Konflikt('Контакт теперь относится к другому человеку или виду',{scope_changed:true});
   return null;
  },
  zapomnit(db,row,author,options={}){
   const {keyHash}=parametry(options);cleanup(db);const event=deletedEvent(db,row.id);
   if(!event)throw new Error('Contact deletion has no journal event');
   return insert(db,{avtor:author,do_ms:clock()+ttl,udaleno_id:event,slepok:JSON.stringify(row),
    osnovnye:JSON.stringify({ids:primaryIds(db,row),metki:row.osnovnoj?require('./osnovnoj-kontakt.js').metki(db,row):null}),zapros_hesh:keyHash});
  },
  vernut(db,body,author){
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['token_otmeny','token'].includes(key)))throw new OshibkaVvoda('Нужен только токен из ответа удаления','token_otmeny');
   const token=body.token_otmeny??body.token;if(typeof token!=='string'||!token)throw new OshibkaVvoda('Нужен токен из ответа удаления','token_otmeny');
   cleanup(db);const stored=db.prepare('SELECT * FROM otmeny_kontaktov WHERE token_hesh=? AND avtor=? AND do_ms>=?').get(hash(token),author,clock());
   if(!stored)throw new NeNajdeno('Окно отмены прошло или контакт удалён другим участником');
   const savedPrimary=JSON.parse(stored.osnovnye);
   const entry={event:stored.udaleno_id,primary:Array.isArray(savedPrimary)?savedPrimary:savedPrimary.ids,metki:Array.isArray(savedPrimary)?null:savedPrimary.metki};
   const row=JSON.parse(stored.slepok),conflict=message=>{throw new Konflikt(message);};
   if(deletedEvent(db,row.id)!==entry.event)conflict('Контакт уже удаляли повторно. Используй последнее действие отмены.');
   if(!db.prepare('SELECT 1 FROM ljudi WHERE id=?').get(row.chelovek_id))throw new NeNajdeno('Человека больше нет');
   const existing=db.prepare('SELECT * FROM kontakty WHERE id=?').get(row.id),version=Number(row.versija||1)+1;
   if(existing){
    if(existing.versija!==version||Object.entries(row).some(([key,value])=>key!=='versija'&&existing[key]!==value))conflict('Контакт уже изменился. Обнови карточку.');
    return {...v_api(existing),...require('./osnovnoj-kontakt.js').dopolnit(db,existing),vernuto:true,vsego_u_cheloveka:db.prepare('SELECT count(*) n FROM kontakty WHERE chelovek_id=?').get(row.chelovek_id).n};
   }
   if(row.osnovnoj){
    if(entry.metki&&entry.metki!==require('./osnovnoj-kontakt.js').metki(db,row))conflict('Основной контакт уже выбирали заново. Обнови карточку.');
    if(!entry.metki&&db.prepare("SELECT 1 FROM zhurnal j JOIN kontakty k ON k.id=j.obekt_id WHERE j.id>? AND j.obekt='kontakt' AND j.pole IN ('osnovnoj','osnovnoj_vybran') AND k.chelovek_id=? AND k.tip=? LIMIT 1").get(entry.event,row.chelovek_id,row.tip))conflict('После удаления основной контакт выбирали заново. Обнови карточку.');
    const current=primaryIds(db,row);if(entry.primary.length>1||JSON.stringify(current)!==JSON.stringify(entry.primary))conflict('Основной контакт уже выбирали заново. Обнови карточку.');
    db.prepare('UPDATE kontakty SET osnovnoj=0 WHERE chelovek_id=? AND tip=? AND osnovnoj=1').run(row.chelovek_id,row.tip);
    for(const id of current)require('./obschij.js').v_zhurnal(db,'kontakty',id,'osnovnoj','1','0',author);
   }
   db.prepare('INSERT INTO kontakty(id,chelovek_id,tip,znachenie,osnovnoj,porjadok,znachenie_norm,versija) VALUES(?,?,?,?,?,?,?,?)')
    .run(row.id,row.chelovek_id,row.tip,row.znachenie,row.osnovnoj,row.porjadok,row.znachenie_norm,version);
   require('./obschij.js').v_zhurnal(db,'kontakty',row.id,'udaleno','да','нет',author);
   const restored=db.prepare('SELECT * FROM kontakty WHERE id=?').get(row.id);
   return {...v_api(restored),...require('./osnovnoj-kontakt.js').dopolnit(db,restored),vernuto:true,vsego_u_cheloveka:db.prepare('SELECT count(*) n FROM kontakty WHERE chelovek_id=?').get(row.chelovek_id).n};
  },
 };
}
module.exports={...sozdatHranilische(),sozdatHranilische};
