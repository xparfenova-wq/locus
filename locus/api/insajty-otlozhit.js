const {createHash}=require('node:crypto');
const {baza,OshibkaVvoda,NeNajdeno,Konflikt,v_odnoj_tranzakcii,seichas}=require('../db/db.js');
const hash=value=>createHash('sha256').update(value).digest('hex');
function identity(povod,napravlenie,source){return hash(JSON.stringify([1,povod,napravlenie||null,source]));}
function fields(value,names){for(const field of Object.keys(value||{}))if(!names.includes(field))throw new OshibkaVvoda('Неизвестный параметр откладывания',field);}
function insightKey(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new OshibkaVvoda('Нужен ключ прочитанного инсайта','kljuch');return value;}
function operationKey(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одной попытки','zapros_kljuch');return hash(value.toLowerCase());}
function visible(db,actor,rows){const hidden=new Set(db.prepare('SELECT kljuch FROM otlozhennye_insajty WHERE chelovek_id=? AND otlozhen_do>?').all(actor,seichas()).map(row=>row.kljuch));return rows.filter(row=>!hidden.has(row.kljuch));}
function receipt(row){return row?{sostojanie:row.otlozhen_do?'otlozheno':'otmeneno',kljuch:row.insajt_kljuch,...(row.otlozhen_do?{otlozhen_do:row.otlozhen_do,aktiven:row.otlozhen_do>seichas()}:{})}:{sostojanie:'ne_najdeno'};}
function handle(ctx){
 const check=ctx.dejstvie==='proverka',cancel=ctx.dejstvie==='otmena_popytki';
 if(ctx.kljuch)throw new NeNajdeno();
 if(ctx.metod!==(check?'GET':'POST'))throw Object.assign(new Error(check?'Для проверки нужен GET':'Для откладывания нужен POST'),{kod:405});
 const db=baza(),actor=Number(ctx.avtor);if(!Number.isSafeInteger(actor)||actor<1)throw new OshibkaVvoda('Нужен участник');
 fields(ctx.zapros,check?['zapros_kljuch']:[]);fields(ctx.telo,check?[]:['kljuch','zapros_kljuch']);
 const data=check?ctx.zapros:ctx.telo,key=operationKey(data?.zapros_kljuch),item=check?null:insightKey(data?.kljuch);
 return v_odnoj_tranzakcii(db,()=>{
  const saved=db.prepare('SELECT * FROM zaprosy_insajtov WHERE avtor=? AND kljuch_hesh=?').get(actor,key);
  if(check)return {telo:receipt(saved)};
  if(saved){if(saved.insajt_kljuch!==item)throw new Konflikt('Ключ относится к другому инсайту',{operation_key_reused:true});if(!saved.otlozhen_do&&!cancel)throw new Konflikt('Эта попытка отменена. Прочитай список перед новым действием',{operation_cancelled:true});return {telo:receipt(saved)};}
  const now=seichas();
  if(cancel){db.prepare('INSERT INTO zaprosy_insajtov(avtor,kljuch_hesh,insajt_kljuch,sozdano)VALUES(?,?,?,?)').run(actor,key,item,now);return {telo:{sostojanie:'otmeneno',kljuch:item}};}
                                                                                                             
  const raw=require('./ekrany2.js').insajty({zapros:{},avtor:actor,metod:'GET',uchityvat_otlozhennye:false}).telo;
  const permitted=require('./pravila-otveta.js').otvet(db,{tablica:'insajty',metod:'GET',avtor:actor,zapros:{},telo:{}},raw);
  if(!permitted.insajty.some(row=>row.kljuch===item))throw new NeNajdeno('Инсайт больше не актуален или недоступен. Обнови список');
  const previous=db.prepare('SELECT otlozhen_do FROM otlozhennye_insajty WHERE chelovek_id=? AND kljuch=?').get(actor,item);
  const until=previous?.otlozhen_do>now?previous.otlozhen_do:new Date(Date.now()+7*86400000).toISOString().slice(0,19).replace('T',' ');
  db.prepare('INSERT INTO otlozhennye_insajty(chelovek_id,kljuch,otlozhen_do,sozdano)VALUES(?,?,?,?) ON CONFLICT(chelovek_id,kljuch)DO UPDATE SET otlozhen_do=excluded.otlozhen_do,sozdano=excluded.sozdano').run(actor,item,until,now);
  db.prepare('INSERT INTO zaprosy_insajtov(avtor,kljuch_hesh,insajt_kljuch,otlozhen_do,sozdano)VALUES(?,?,?,?,?)').run(actor,key,item,until,now);
  return {telo:receipt({otlozhen_do:until,insajt_kljuch:item})};
 });
}
module.exports={identity,visible,handle};
