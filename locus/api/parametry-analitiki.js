const {createHash,createHmac}=require('node:crypto');
const {baza,OshibkaVvoda,NetDostupa,Konflikt,v_odnoj_tranzakcii,seichas}=require('../db/db.js');
const M=require('../public/js/system-settings-model.js');
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function only(value,names){if(!plain(value))throw new OshibkaVvoda('Нужен объект параметров');for(const field of Object.keys(value))if(!names.includes(field))throw new OshibkaVvoda('Неизвестный параметр',field);}
function key(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного сохранения','zapros_kljuch');return hash(value.toLowerCase());}
function row(db){const rows=db.prepare('SELECT rowid AS _rowid,* FROM nastrojki_sistemy').all();if(rows.length>1)throw new Konflikt('Найдено несколько строк общих настроек. Нужна проверка данных',{settings_multiple:true});return rows[0]||null;}
function values(db){const raw=row(db),effective={...M.defaults};for(const field of M.fields)if(raw?.[field]!=null)effective[field]=raw[field];let normalized;try{normalized=M.normalize(effective);}catch(e){throw new Konflikt('В сохранённых параметрах расчёта есть ошибка. Нужна проверка данных',{settings_invalid:true,polja:Object.keys(e.fields||{})});}return {...raw,...normalized};}
const version=db=>db.prepare('SELECT versija FROM versija_nastroek_sistemy WHERE id=1').get()?.versija??0;
function context(db,actor){return hash([1,actor,version(db),row(db)]);}
function person(db,actor){if(!Number.isSafeInteger(actor)||actor<1)throw new NetDostupa();const p=db.prepare('SELECT l.dostup,l.aktiven,v.zablokirovan FROM ljudi l LEFT JOIN vhod v ON v.chelovek_id=l.id WHERE l.id=?').get(actor);if(!p||p.aktiven===0||p.zablokirovan)throw new NetDostupa();return p;}
function view(db,actor){const value=values(db);delete value._rowid;return {...{stavka_naloga:6,nachalo_nedeli:'ponedelnik',valjuta:'RUB'},...Object.fromEntries(Object.entries(value).filter(([,v])=>v!=null)),kontekst_nastroek:context(db,actor),versija_nastroek:version(db),mozhno_redaktirovat:person(db,actor).dostup==='polnyj'};}
function proof(db,actor,operation){const r=db.prepare('SELECT * FROM zaprosy_nastroek_sistemy WHERE avtor=? AND kljuch_hesh=?').get(actor,key(operation));if(!r)return {sostojanie:'ne_najdeno'};if(!r.sohraneno)return {sostojanie:'otmeneno'};const now=view(db,actor);return {sostojanie:'sohraneno',versija_sohranenija:r.versija_posle,polja:JSON.parse(r.polja_json),izmeneno_posle:now.kontekst_nastroek!==r.kontekst_posle,nastrojki:now};}
function handle(ctx){
 const db=baza(),actor=Number(ctx.avtor),action=ctx.dejstvie||'',read=action==='proverka',cancel=action==='otmena_popytki';
 if(ctx.kljuch)throw Object.assign(new Error('Параметры относятся ко всему Локусу'),{kod:404});
 if(ctx.metod!==(read?'GET':cancel?'POST':ctx.metod==='GET'?'GET':'PATCH'))throw Object.assign(new Error('Неподходящий способ запроса параметров'),{kod:405});
 person(db,actor);only(ctx.zapros||{},read?['zapros_kljuch']:[]);
 if(!action&&ctx.metod==='GET'){only(ctx.telo||{},[]);return {telo:view(db,actor)};}
 if(read){only(ctx.telo||{},[]);return {telo:proof(db,actor,ctx.zapros.zapros_kljuch)};}
 only(ctx.telo,cancel?['zapros_kljuch']:['zapros_kljuch','kontekst_nastroek','izmenenija']);const operation=ctx.telo.zapros_kljuch,hashed=key(operation);
 return v_odnoj_tranzakcii(db,()=>{
  const p=person(db,actor),saved=db.prepare('SELECT * FROM zaprosy_nastroek_sistemy WHERE avtor=? AND kljuch_hesh=?').get(actor,hashed);
  if(cancel){if(!saved)db.prepare('INSERT INTO zaprosy_nastroek_sistemy(avtor,kljuch_hesh,sozdano)VALUES(?,?,?)').run(actor,hashed,seichas());return {telo:proof(db,actor,operation)};}
  if(p.dostup!=='polnyj')throw new NetDostupa('Общие параметры меняют участники с полным доступом');
  const changes=ctx.telo.izmenenija;only(changes,M.fields);if(!Object.keys(changes).length)throw new OshibkaVvoda('Выбери параметры для изменения','izmenenija');
  const canonical=JSON.stringify([ctx.telo.kontekst_nastroek,M.fields.filter(k=>Object.hasOwn(changes,k)).map(k=>[k,changes[k]])]);
  const digest=createHmac('sha256',operation.toLowerCase()).update(canonical).digest('hex');
  if(saved){if(!saved.sohraneno)throw new Konflikt('Эта попытка отменена. Начни новое сохранение',{settings_cancelled:true});if(saved.zapros_hesh!==digest)throw new Konflikt('Этот ключ относится к другому сохранению',{operation_key_reused:true});return {telo:{...proof(db,actor,operation),povtor:true}};}
  const current=view(db,actor);if(ctx.telo.kontekst_nastroek!==current.kontekst_nastroek)throw new Konflikt('Общие параметры изменились. Сравни свою правку с сохранённой',{settings_changed:true,tekuschee:current});
  for(const field of Object.keys(changes))if(field!=='chasovoj_pojas'&&typeof changes[field]!=='number')throw new OshibkaVvoda(M.labels[field]+': нужно число',field);
  let normalized;try{normalized=M.normalize({...current,...changes});}catch(e){const first=Object.keys(e.fields)[0];throw new OshibkaVvoda(e.fields[first],first);}
  const changed=M.fields.filter(k=>Object.hasOwn(changes,k)&&normalized[k]!==current[k]),original=row(db);
  if(changed.length){
   if(original)db.prepare('UPDATE nastrojki_sistemy SET '+changed.map(k=>k+'=?').join(',')+' WHERE rowid=?').run(...changed.map(k=>normalized[k]),original._rowid);
   else db.prepare('INSERT INTO nastrojki_sistemy('+changed.join(',')+')VALUES('+changed.map(()=>'?').join(',')+')').run(...changed.map(k=>normalized[k]));
   for(const field of changed)require('./obschij.js').v_zhurnal(db,'nastrojki_sistemy',1,field,current[field],normalized[field],actor);
  }
  db.prepare('INSERT INTO zaprosy_nastroek_sistemy(avtor,kljuch_hesh,zapros_hesh,sohraneno,versija_posle,kontekst_posle,polja_json,sozdano)VALUES(?,?,?,1,?,?,?,?)').run(actor,hashed,digest,version(db),context(db,actor),JSON.stringify(changed),seichas());
  return {telo:proof(db,actor,operation)};
 });
}
function today(db){const f=new Intl.DateTimeFormat('en-CA',{timeZone:values(db).chasovoj_pojas,year:'numeric',month:'2-digit',day:'2-digit'}),parts=Object.fromEntries(f.formatToParts(new Date()).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;}
module.exports={handle,values,context,today};
