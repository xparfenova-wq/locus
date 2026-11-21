const {createHash,createHmac}=require('node:crypto');
const {baza,OshibkaVvoda,NeNajdeno,Konflikt,seichas}=require('../db/db.js');
const payout=require('./vyplata-referalu.js'),money=require('./referral-money.js');
const table='zaprosy_uslovij_referalov';
const editable=['procent','procent_shkala','nalog','dogovor_nomer','dogovor_id','vyplacheno'];
function fields(body,allowed){for(const name of Object.keys(body||{}))if(!allowed.includes(name))throw new OshibkaVvoda('Неизвестное поле условий реферала',name);}
function key(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одной правки','zapros_kljuch');return createHash('sha256').update(value.toLowerCase()).digest('hex');}
function row(db,id){const r=db.prepare('SELECT * FROM sotrudnichestva WHERE id=?').get(id);if(!r)throw new NeNajdeno('Сотрудничества нет');return r;}
function eligible(r){if(r.rol!=='referal'&&!(r.rol==='klient'&&r.privodit_klientov===1))throw new OshibkaVvoda('Эти условия относятся к реферальному сотрудничеству','rol');}
function document(db,id,person){return db.prepare(`SELECT d.* FROM dokumenty d LEFT JOIN proekty p ON p.id=d.proekt_id
  WHERE d.id=? AND (d.chelovek_id=? OR d.chelovek_id IS NULL AND p.klient_id=?)`).get(id,person,person);}
function present(db,id,actor){return require('./obschij.js').odna('sotrudnichestva',require('./opisanija.js').OPISANIJA.sotrudnichestva,id,actor);}
function receipt(db,actor,id,value){const r=db.prepare('SELECT * FROM '+table+' WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));if(r&&r.sotrudnichestvo_id!==id)throw new Konflikt('Ключ относится к условиям другого сотрудничества',{operation_key_reused:true});return r;}
function checked(db,actor,id,value){const r=receipt(db,actor,id,value);if(!r)return {sostojanie:'ne_najdeno',id};if(!r.sohraneno)return {sostojanie:'otmeneno',id};const result={sostojanie:'sohraneno',id,versija_sohranenija:r.versija_posle};if(r.udaleno||!db.prepare('SELECT id FROM sotrudnichestva WHERE id=?').get(id))return {...result,udaleno:true,dejstvie_id:null,otmena_dostupna:false,otmenena_posle_sohranenija:false,chastichno_otmeneno:false};return {...result,sotrudnichestvo:present(db,id,actor),...require('./referral-terms-history.js').status(db,r)};}
function validate(db,before,body){
 const patch={...body};delete patch.zapros_kljuch;
 fields(patch,['versija',...editable]);
 if(!editable.some(name=>Object.hasOwn(patch,name)))throw new OshibkaVvoda('Передай изменённое условие');
 for(const name of editable){
  if(!Object.hasOwn(patch,name)||Object.is(patch[name],before[name]))continue;
  const value=patch[name];
  if(name==='procent'&&value!==null){const f=money.rate(value),n=Number(String(value).replace(',','.')),stored=money.fraction(n);if(!f||!stored||f.n*stored.d!==stored.n*f.d)throw new OshibkaVvoda('Процент от 0 до 100, точное число','procent');patch[name]=n;}
  if(['procent_shkala','dogovor_nomer'].includes(name)&&value!==null){if(typeof value!=='string')throw new OshibkaVvoda('Нужен текст',name);if(name==='dogovor_nomer'&&[...value].length>100)throw new OshibkaVvoda('Номер договора: не больше 100 знаков',name);}
  if(name==='nalog'&&value!==null&&!['do_vycheta','posle_vycheta'].includes(value))throw new OshibkaVvoda('Выбери вариант налога или оставь не согласованным','nalog');
  if(name==='dogovor_id'&&value!==null){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||!document(db,value,before.chelovek_id))throw new OshibkaVvoda('Выбери документ этого человека','dogovor_id');}
  if(name==='vyplacheno'){
   if(before.vyplacheno!==null)throw new Konflikt('Выплаченное уже указано. Новую выплату отметь отдельной кнопкой');
   const cents=money.cents(value),n=money.number(cents);if(cents===null||n===null)throw new OshibkaVvoda('Ранее выплаченное: точная сумма от нуля','vyplacheno');patch[name]=n;
  }
 }
 return patch;
}
function handle(ctx){
 const db=baza();payout.prava(db,ctx.avtor);const id=payout.number(ctx.kljuch);
 if(ctx.metod==='GET'){
  fields(ctx.zapros,[]);const current=row(db,id);eligible(current);
  const documents=db.prepare(`SELECT DISTINCT d.* FROM dokumenty d LEFT JOIN proekty p ON p.id=d.proekt_id
    WHERE d.chelovek_id=? OR d.chelovek_id IS NULL AND p.klient_id=? ORDER BY d.nazvanie,d.id`).all(current.chelovek_id,current.chelovek_id);
  return {telo:{...present(db,id,ctx.avtor),dokumenty:documents.map(require('./materialy-vid.js').present)}};
 }
 if(ctx.metod!=='PATCH')throw Object.assign(new Error('Нужен GET или PATCH'),{kod:405});
 fields(ctx.telo,['versija','zapros_kljuch',...editable]);const value=ctx.telo.zapros_kljuch;key(value);
 const raw={...ctx.telo};delete raw.zapros_kljuch;
 const digest=createHmac('sha256',value.toLowerCase()).update(JSON.stringify({id,body:Object.fromEntries(Object.keys(raw).sort().map(k=>[k,raw[k]]))})).digest('hex');
 const saved=receipt(db,ctx.avtor,id,value);
 if(saved){
  if(!saved.sohraneno)throw new Konflikt('Попытка правки отменена. Начни новую',{edit_cancelled:true});
  if(saved.zapros_hesh!==digest)throw new Konflikt('Под этим ключом отправлены другие условия',{operation_key_reused:true});
  const result=checked(db,ctx.avtor,id,value);if(result.udaleno)throw Object.assign(new Error('Сотрудничество после правки удалено'),{kod:410,dannye:result});
  const {sotrudnichestvo,...details}=result;return {telo:{...sotrudnichestvo,...details,povtor_pravki:true,versija_sohranenija:saved.versija_posle}};
 }
 const before=row(db,id);eligible(before);
 require('./versii.js').proverit(db,'sotrudnichestva',before,ctx.telo.versija,['chelovek_id','napravlenie','rol','privodit_klientov',...editable]);
 const head=db.prepare('SELECT COALESCE(max(id),0) id FROM zhurnal').get().id,patch=validate(db,before,ctx.telo),current=require('./obschij.js').pravit('sotrudnichestva',require('./opisanija.js').OPISANIJA.sotrudnichestva,id,patch,ctx.avtor);
 const events=db.prepare("SELECT id,srez FROM zhurnal WHERE id>? AND obekt='sotrudnichestvo' AND obekt_id=? AND kto=? ORDER BY id").all(head,id,ctx.avtor);
 const itog={dejstvie_id:events.length?require('./versii.js').dejstvie(db):null,zhurnal_ids:events.map(r=>r.id)};
 db.prepare('INSERT INTO '+table+'(avtor,kljuch_hesh,sotrudnichestvo_id,zapros_hesh,sohraneno,versija_posle,itog_json,sozdano)VALUES(?,?,?,?,1,?,?,?)').run(ctx.avtor,key(value),id,digest,current.versija,JSON.stringify(itog),seichas());
 return {telo:{...current,...require('./referral-terms-history.js').status(db,receipt(db,ctx.avtor,id,value))}};
}
function read(ctx){if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});const db=baza();payout.prava(db,ctx.avtor);fields(ctx.zapros,['zapros_kljuch']);return {telo:checked(db,ctx.avtor,payout.number(ctx.kljuch),ctx.zapros.zapros_kljuch)};}
function cancel(ctx){if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});const db=baza();payout.prava(db,ctx.avtor);fields(ctx.telo,['zapros_kljuch']);const id=payout.number(ctx.kljuch),value=ctx.telo.zapros_kljuch;if(!receipt(db,ctx.avtor,id,value))db.prepare('INSERT INTO '+table+'(avtor,kljuch_hesh,sotrudnichestvo_id,sozdano)VALUES(?,?,?,?)').run(ctx.avtor,key(value),id,seichas());return {telo:checked(db,ctx.avtor,id,value)};}
module.exports={handle,read,cancel};
