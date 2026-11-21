                                                              
const {baza,v_api,OshibkaVvoda,NeNajdeno,NetDostupa}=require('../db/db.js');
const {SOBYTIJA}=require('./sobytija-uvedomlenij.js');
const SELECT=`SELECT u.*,z.nomer zadacha_nomer,z.nazvanie zadacha_nazvanie,
  z.napravlenie zadacha_napravlenie,z.udaleno zadacha_udalena,p.nazvanie proekt_nazvanie
  FROM uvedomlenija u LEFT JOIN zadachi z ON z.id=u.zadacha_id
  LEFT JOIN proekty p ON p.id=u.proekt_id`;
function positive(value,field,fallback){
  if(value===undefined)return fallback;
  if(!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))throw new OshibkaVvoda(field+': нужно положительное целое число',field);
  return Number(value);
}
function own(avtor,zapros={}){
  if(!Number.isSafeInteger(avtor)||avtor<1)throw new NetDostupa('нужно войти в Локус');
  if(zapros.chelovek_id!==undefined&&positive(zapros.chelovek_id,'chelovek_id')!==avtor)throw new NetDostupa('можно читать только свои уведомления');
  return avtor;
}
function dto(row){
  const result=v_api(row),deleted=!!row.zadacha_udalena||row.ssylka_udalena==='zadacha';
  result.zagolovok=SOBYTIJA[row.tip]?.zagolovok||'Уведомление';
  result.zadacha_udalena=deleted;
  const missing=row.zadacha_id_istochnika!=null;
  result.adres=deleted||missing||row.ssylka_udalena?null:row.zadacha_nomer
    ?'/'+encodeURIComponent(row.zadacha_napravlenie) +'/'+row.zadacha_nomer
    :row.proekt_id?'/proekt.html?id='+row.proekt_id
    :row.lenta_id?'/poleznoe.html?vkladka=novoe&novoe='+row.lenta_id
    :row.tip==='novoe'?'/poleznoe.html?vkladka=novoe':null;
  result.pojasnenie=missing?'Исходная задача недоступна':deleted?'Задача удалена'
    :row.ssylka_udalena==='proekt'?'Проект удалён':row.ssylka_udalena==='novoe'?'Новость удалена':null;
  return result;
}
function uvedomlenija({zapros={},avtor,metod,kljuch,telo={}}){
  const ja=own(avtor,zapros),db=baza();
  if(metod==='POST'||metod==='PUT')throw new NetDostupa('уведомления создаёт система по событиям, а не человек');
  if(kljuch){
    const id=positive(kljuch,'id'),row=db.prepare(SELECT+' WHERE u.id=?').get(id);
    if(!row)throw new NeNajdeno('уведомление не найдено');
    if(row.chelovek_id!==ja)throw new NetDostupa('можно менять только свои уведомления');
    if(metod==='GET')return {telo:dto(row)};
    if(metod!=='PATCH')throw Object.assign(new Error('доступны GET и PATCH'),{kod:405});
    const fields=Object.keys(telo);
    if(!fields.length||fields.some(key=>key!=='prochitano'))throw new OshibkaVvoda('можно менять только отметку prochitano','prochitano');
    if(telo.prochitano!==null&&typeof telo.prochitano!=='boolean')throw new OshibkaVvoda('prochitano: true или false','prochitano');
    if(telo.prochitano!==null)db.prepare('UPDATE uvedomlenija SET prochitano=? WHERE id=? AND chelovek_id=?').run(telo.prochitano?1:0,id,ja);
    return {telo:dto(db.prepare(SELECT+' WHERE u.id=?').get(id))};
  }
  if(metod!=='GET')throw Object.assign(new Error('сюда только GET'),{kod:405});
  const potok=zapros.potok===undefined?null:String(zapros.potok);
  if(potok!==null&&!['pro_menja','sobytija'].includes(potok))throw new OshibkaVvoda('potok: pro_menja или sobytija','potok');
  let where='u.chelovek_id=?',args=[ja];
  if(potok){where+=' AND u.potok=?';args.push(potok);}
  const counts=db.prepare(`SELECT count(*) vsego,
    sum(CASE WHEN prochitano IS NULL OR prochitano=0 THEN 1 ELSE 0 END) neprochitanyh
    FROM uvedomlenija u WHERE ${where}`).get(...args);
  if(zapros.prochitano!==undefined){
    if(!['0','1'].includes(String(zapros.prochitano)))throw new OshibkaVvoda('prochitano: 0 или 1','prochitano');
    where+=String(zapros.prochitano)==='1'?' AND u.prochitano=1':' AND (u.prochitano IS NULL OR u.prochitano=0)';
  }
  const predel=Math.min(positive(zapros.na_stranice,'na_stranice',30),100),page=positive(zapros.stranica,'stranica',1);
  if(!Number.isSafeInteger((page-1)*predel))throw new OshibkaVvoda('stranica слишком велика','stranica');
  const total=db.prepare('SELECT count(*) n FROM uvedomlenija u WHERE '+where).get(...args).n;
  const rows=db.prepare(SELECT+` WHERE ${where}
    ORDER BY (u.prochitano IS NOT NULL AND u.prochitano<>0),u.sozdano DESC,u.id DESC LIMIT ? OFFSET ?`).all(...args,predel,(page-1)*predel);
  const bell=db.prepare("SELECT count(*) n FROM uvedomlenija WHERE chelovek_id=? AND potok='pro_menja' AND (prochitano IS NULL OR prochitano=0)").get(ja).n;
  return {telo:{spisok:rows.map(dto),vsego:total,stranica:page,na_stranice:predel,stranic:Math.ceil(total/predel),
    neprochitanyh:counts.neprochitanyh||0,prochitannyh:counts.vsego-(counts.neprochitanyh||0),neprochitanyh_pro_menja:bell,...(potok?{potok}:{})}};
}
module.exports={uvedomlenija,own};
