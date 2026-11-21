const crypto=require('node:crypto');
const {baza,OshibkaVvoda,NeNajdeno,NetDostupa,seichas}=require('../db/db.js');
const PENDING="uspeh IS NULL AND (zaprosheno IS NOT NULL OR primechanie='запуск поставлен в очередь вручную')";
const POST_FIELDS=['publikacija_id','ssylka','data_vyhoda','format','zagolovok','prosmotrov','lajkov','kommentariev','peresylok','sohranenij','ohvat','extra'];
const NUMBERS=['prosmotrov','lajkov','kommentariev','peresylok','sohranenij','ohvat'];
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
function fingerprint(account){return hash(Object.fromEntries(['id','ploshadka','nazvanie','ssylka','napravlenie','proekt_id','vladelec','uroven','aktiven','udalen'].map(key=>[key,account[key]??null])));}
function object(value,allowed,field){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new OshibkaVvoda('нужен объект',field);
 for(const key of Object.keys(value))if(!allowed.includes(key))throw new OshibkaVvoda('неизвестное поле: '+key,field||key);
}
function text(value,max,field){if(typeof value!=='string'||Array.from(value).length>max)throw new OshibkaVvoda('нужен текст до '+max+' знаков',field);return value.trim();}
function spisok(db,query={}){
 let rows=db.prepare('SELECT * FROM akkaunty WHERE aktiven=1 AND COALESCE(udalen,0)=0 ORDER BY porjadok,id').all();
 const pending=db.prepare('SELECT id FROM zapuski_sbora WHERE akkaunt_id=? AND '+PENDING+' ORDER BY id LIMIT 1');
 rows=rows.map(a=>({id:a.id,nazvanie:a.nazvanie,ploshadka:a.ploshadka,ssylka:a.ssylka,uroven:a.uroven,vladelec:a.vladelec,
  aktiven:true,zaproshen:!!pending.get(a.id),akkaunt_sha256:fingerprint(a)}));
 if(query.pending==='1')rows=rows.filter(a=>a.zaproshen);
 return {spisok:rows,vsego:rows.length};
}
function normalizePost(input,account){
 object(input,POST_FIELDS,'publikacii');const row={};
 const id=input.publikacija_id;
 if(typeof id!=='string'&&!(typeof id==='number'&&Number.isSafeInteger(id)&&id>=0))throw new OshibkaVvoda('нужен точный id публикации','publikacija_id');
 row.publikacija_id=String(id).trim();
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(row.publikacija_id))throw new OshibkaVvoda('неверный id публикации','publikacija_id');
 row.id=account.id+'_'+row.publikacija_id;row.akkaunt_id=account.id;
 for(const [field,value] of Object.entries(input)){
  if(field==='publikacija_id')continue;
  if(value===null)throw new OshibkaVvoda('неизвестное поле не передаётся',field);
  if(NUMBERS.includes(field)){
   if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new OshibkaVvoda('измерение — целое число от нуля',field);
   row[field]=value;
  }else if(field==='extra'){
   if(!value||typeof value!=='object'||Array.isArray(value))throw new OshibkaVvoda('extra — объект','extra');row.extra=JSON.stringify(value);
  }else{
   row[field]=text(value,field==='zagolovok'?300:500,field);
   if(field==='ssylka'){
    let parsed;try{parsed=new URL(row[field]);}catch{}
    if(!parsed||!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new OshibkaVvoda('нужна ссылка http или https',field);
   }
   if(field==='data_vyhoda'){
    require('./kalendar.js').data(row[field].slice(0,10),field);
    if(!Number.isFinite(Date.parse(row[field])))throw new OshibkaVvoda('неверная дата публикации',field);
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row[field]));
    if(day>require('../db/db.js').segodnja())throw new OshibkaVvoda('публикация ещё не вышла',field);
   }
   if(field==='format'&&!require('./opisanija.js').FORMATY_PUBLIKACII.includes(row.format))throw new OshibkaVvoda('неверный формат публикации',field);
  }
 }
 return row;
}
function upsertPost(db,row,date,stamp,level,accountContext){
 const previous=db.prepare('SELECT * FROM publikacii WHERE id=?').get(row.id);
 if(previous&&(previous.akkaunt_id!==row.akkaunt_id||String(previous.publikacija_id)!==row.publikacija_id))throw new OshibkaVvoda('ключ публикации относится к другой записи','publikacija_id');
 const {daty,momentPolja}=require('./snimki-akkaunta.js');
 const metadata=daty(previous),times={...(metadata._kogda||{})},levels={...(metadata._uroven||{})},contexts={...(metadata._akkaunt||{})},current={id:row.id,akkaunt_id:row.akkaunt_id,publikacija_id:row.publikacija_id};
 for(const field of Object.keys(row).filter(field=>!['id','akkaunt_id','publikacija_id'].includes(field))){
  let oldDate=metadata[field],oldTime=previous&&momentPolja(previous,field);
  if(previous&&NUMBERS.includes(field)&&!oldDate&&field!=='sohranenij'){
   const old=db.prepare('SELECT * FROM zamery_publikacij WHERE publikacija_id=? AND '+field+' IS NOT NULL ORDER BY data DESC LIMIT 1').get(row.id);
   if(old){oldDate=old.data;oldTime=momentPolja(old,field);}
  }
  const stale=oldDate>date||oldTime&&oldTime>stamp;
  const untimedPast=previous?.[field]!==null&&previous?.[field]!==undefined&&!oldDate&&date<require('../db/db.js').segodnja();
  if(stale||untimedPast){if(untimedPast)metadata[field]=null;continue;}
  current[field]=row[field];metadata[field]=date;times[field]=stamp;levels[field]=level;contexts[field]=accountContext;
 }
 if(['mtproto','graph'].includes(level)){const attempt=metadata._popytka_ohvata;if(!attempt||attempt.akkaunt!==accountContext||attempt.kogda<=stamp)metadata._popytka_ohvata={kogda:stamp,data:date,poluchen:Object.hasOwn(row,'ohvat'),akkaunt:accountContext};}
 metadata._kogda=times;metadata._uroven=levels;metadata._akkaunt=contexts;current.daty_izmerenij=JSON.stringify(metadata);
 const fields=Object.keys(current),updates=fields.filter(field=>!['id','akkaunt_id','publikacija_id'].includes(field));
 db.prepare('INSERT INTO publikacii('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+') ON CONFLICT(id) DO UPDATE SET '+
  updates.map(field=>field+'=excluded.'+field).join(',')).run(...fields.map(field=>current[field]));
 const measured=NUMBERS.filter(field=>field!=='sohranenij'&&Object.hasOwn(row,field));
 if(!measured.length)return;
 const old=db.prepare('SELECT * FROM zamery_publikacij WHERE publikacija_id=? AND data=?').get(row.id,date);
 const dayMeta=daty(old),dayTimes={...(dayMeta._kogda||{})},dayLevels={...(dayMeta._uroven||{})},dayContexts={...(dayMeta._akkaunt||{})},accepted=measured.filter(field=>!old||!momentPolja(old,field)||momentPolja(old,field)<=stamp);
 if(!accepted.length)return;
 for(const field of accepted){dayMeta[field]=date;dayTimes[field]=stamp;dayLevels[field]=level;dayContexts[field]=accountContext;}dayMeta._kogda=dayTimes;dayMeta._uroven=dayLevels;dayMeta._akkaunt=dayContexts;
 const columns=['publikacija_id','data',...accepted,'daty_izmerenij'],values=[row.id,date,...accepted.map(field=>row[field]),JSON.stringify(dayMeta)];
 db.prepare('INSERT INTO zamery_publikacij('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+') ON CONFLICT(publikacija_id,data) DO UPDATE SET '+[...accepted,'daty_izmerenij'].map(field=>field+'=excluded.'+field).join(',')).run(...values);
}
function prinjat(ctx){
 if(ctx.metod!=='POST')return {kod:405,telo:{oshibka:'сюда только POST'}};
 if(!ctx.sborschik)throw new NetDostupa('результат передаёт только сборщик');
 const db=baza(),id=Number(ctx.kljuch),body=ctx.telo;
 if(!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('нужен номер аккаунта','id');
 object(body,['kljuch_sbora','kljuch_zapuska','akkaunt_sha256','data','kogda','uroven','uspeh','poluchen','primechanie','snimok','publikacii']);
 const key=text(body.kljuch_zapuska,128,'kljuch_zapuska');if(!/^[A-Za-z0-9_-]{20,128}$/.test(key))throw new OshibkaVvoda('нужен уникальный ключ запуска','kljuch_zapuska');
 const {kljuch_sbora,...payload}=body,digest=hash(payload);
 const existing=db.prepare('SELECT * FROM zapuski_sbora WHERE kljuch_zapuska=?').get(key);
 if(existing){
  if(existing.akkaunt_id!==id||existing.sha256!==digest)throw Object.assign(new Error('ключ запуска уже принят с другим содержимым'),{kod:409});
  return {kod:200,telo:{id:existing.id,kljuch_zapuska:key,uspeh:existing.uspeh===1,poluchen:existing.poluchen,povtor:true}};
 }
 const account=db.prepare('SELECT * FROM akkaunty WHERE id=? AND COALESCE(udalen,0)=0').get(id);if(!account)throw new NeNajdeno('аккаунта нет');
 if(account.aktiven!==1)throw Object.assign(new Error('аккаунт остановлен, результат не записан'),{kod:409});
 if(body.akkaunt_sha256!==fingerprint(account))throw Object.assign(new Error('привязка аккаунта изменилась, результат не записан'),{kod:409});
 if(!['public','mtproto','graph'].includes(body.uroven)||body.uroven!=='public'&&body.uroven!==account.uroven)throw new OshibkaVvoda('уровень сбора не соответствует аккаунту','uroven');
 if(body.uroven==='mtproto'&&account.ploshadka!=='telegram'||body.uroven==='graph'&&account.ploshadka!=='instagram')throw new OshibkaVvoda('личная статистика не соответствует площадке','uroven');
 if(typeof body.uspeh!=='boolean')throw new OshibkaVvoda('нужно true или false','uspeh');
 const note=body.primechanie===undefined?'':text(body.primechanie,400,'primechanie');
 const posts=body.publikacii===undefined?[]:body.publikacii;
 if(!Array.isArray(posts)||posts.length>1000)throw new OshibkaVvoda('не больше 1000 публикаций за пакет','publikacii');
 if(body.poluchen!==undefined&&(!Number.isSafeInteger(body.poluchen)||body.poluchen<0))throw new OshibkaVvoda('нужно число полученных публикаций','poluchen');
 const received=body.poluchen??posts.length;
 if(received<posts.length||received>posts.length+(body.snimok===undefined?0:1))throw new OshibkaVvoda('число полученных записей не совпадает с пакетом','poluchen');
 if(!body.uspeh&&(body.snimok!==undefined||posts.length))throw new OshibkaVvoda('ошибочный сбор не меняет измерения','uspeh');
 if(body.uspeh&&body.snimok===undefined&&!posts.length)throw new OshibkaVvoda('успешный сбор должен содержать данные','uspeh');
 const date=body.data;require('./kalendar.js').data(date,'data');
 if(date>require('../db/db.js').segodnja())throw new OshibkaVvoda('дата измерения ещё не наступила','data');
 let stamp;
 if(body.kogda===undefined)throw new OshibkaVvoda('нужно время измерения','kogda');
 text(body.kogda,40,'kogda');require('./kalendar.js').data(body.kogda.slice(0,10),'kogda');
 if(!Number.isFinite(Date.parse(body.kogda)))throw new OshibkaVvoda('неверное время запуска','kogda');
 stamp=new Date(body.kogda).toISOString();
 if(Date.parse(stamp)>Date.now()+5*60*1000)throw new OshibkaVvoda('время измерения ещё не наступило','kogda');
 const measuredDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp));
 if(measuredDay!==date)throw new OshibkaVvoda('дата и время измерения не совпадают','kogda');
 if(body.snimok!==undefined){
  object(body.snimok,['data','podpischikov','publikacij_vsego','summa_prosmotrov','ohvat','vovlechennost','extra'],'snimok');
  if(body.uroven==='public'&&Object.hasOwn(body.snimok,'ohvat'))throw new OshibkaVvoda('охват приходит из личной статистики','ohvat');
  if(body.snimok.data!==undefined&&body.snimok.data!==date)throw new OshibkaVvoda('дата снимка не совпадает с пакетом','data');
  require('./vremja-sbora.js').s_vremenem({kogda:stamp,data:date},()=>require('./obschij.js').sozdat('zamery_akkauntov',require('./opisanija.js').OPISANIJA.zamery_akkauntov,
   {...body.snimok,data:date,akkaunt_id:id,kljuch_sbora:require('./dostup-sbora.js').kljuch()},null));
 }
 const seen=new Set(),accountContext=require('./kontekst-akkaunta.js').kontekst(db,account);
 for(const input of posts){if(body.uroven==='public'&&Object.hasOwn(input||{},'ohvat'))throw new OshibkaVvoda('охват приходит из личной статистики','ohvat');const row=normalizePost(input,account);if(seen.has(row.id))throw new OshibkaVvoda('публикация повторяется в пакете','publikacija_id');seen.add(row.id);upsertPost(db,row,date,stamp,body.uroven,accountContext);}
 if(seen.size)require('./istochnik-publikacii-zadachi.js').syncAccount(db,id,seen);
 const timestamp=stamp.slice(0,19).replace('T',' ');
 const pending=body.uroven==='public'?db.prepare('SELECT * FROM zapuski_sbora WHERE akkaunt_id=? AND '+PENDING+' ORDER BY id LIMIT 1').get(id):null;
 let run;
 if(pending){
  db.prepare('UPDATE zapuski_sbora SET kogda=?,uroven=?,uspeh=?,poluchen=?,primechanie=?,kljuch_zapuska=?,sha256=?,zaprosheno=? WHERE id=?').run(timestamp,body.uroven,body.uspeh?1:0,received,note,key,digest,pending.zaprosheno||pending.kogda,pending.id);run=pending.id;
 }else run=Number(db.prepare('INSERT INTO zapuski_sbora(kogda,akkaunt_id,uroven,uspeh,poluchen,primechanie,kljuch_zapuska,sha256) VALUES(?,?,?,?,?,?,?,?)').run(timestamp,id,body.uroven,body.uspeh?1:0,received,note,key,digest).lastInsertRowid);
 if(body.uspeh&&body.snimok!==undefined)updateAccountTitle(db,id);
 return {kod:201,telo:{id:run,kljuch_zapuska:key,uspeh:body.uspeh,poluchen:received,povtor:false}};
}
                                                                           
                                                                                  
function updateAccountTitle(db,id){
 const snapshots=require('./snimki-akkaunta.js'),field='extra:title';
 const known=db.prepare('SELECT * FROM zamery_akkauntov WHERE akkaunt_id=?').all(id).map(row=>{
  try{const title=JSON.parse(row.extra)?.title;if(typeof title!=='string'||!title.trim())return null;return{title:Array.from(title.trim()).slice(0,300).join(''),rank:[snapshots.dataPolja(row,field),snapshots.momentPolja(row,field)||'',row.data].join('|')};}catch{return null;}
 }).filter(Boolean).sort((a,b)=>b.rank.localeCompare(a.rank));
 if(known.length)db.prepare("UPDATE akkaunty SET zagolovok=? WHERE id=? AND COALESCE(zagolovok,'')<>?").run(known[0].title,id,known[0].title);
}
module.exports={PENDING,fingerprint,spisok,prinjat,normalizePost};
