const {baza,v_api,OshibkaVvoda,NeNajdeno}=require('../db/db.js');
const positive=(value,field)=>{if(!['number','string'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new OshibkaVvoda('Нужен положительный номер',field);return Number(value);};
function list(query,actor){
 for(const key of Object.keys(query))if(!['istoriya','rezultat_id','skolko','prodolzhit'].includes(key))throw new OshibkaVvoda('Неизвестный параметр истории',key);
 if(query.istoriya!=='1')throw new OshibkaVvoda('Для истории нужно istoriya=1','istoriya');
 const id=positive(query.rezultat_id,'rezultat_id'),limit=query.skolko===undefined?30:positive(query.skolko,'skolko');if(limit>100)throw new OshibkaVvoda('Не больше 100 замеров за чтение','skolko');
 const db=baza();require('./pravila-otveta.js').proverit(db,{tablica:'rezultaty',kljuch:id,zapros:{},telo:{},avtor:actor,metod:'GET'});
 if(!db.prepare('SELECT id FROM rezultaty WHERE id=?').get(id))throw new NeNajdeno('Результата нет');
 let cursor=null,ceiling=db.prepare('SELECT coalesce(max(id),0) id FROM zamery WHERE rezultat_id=?').get(id).id;
 if(query.prodolzhit!==undefined){try{if(typeof query.prodolzhit!=='string'||query.prodolzhit.length>2048||!/^[A-Za-z0-9_-]+$/.test(query.prodolzhit))throw new Error();cursor=JSON.parse(Buffer.from(query.prodolzhit,'base64url').toString('utf8'));if(cursor.result!==id||!Number.isSafeInteger(cursor.ceiling)||cursor.ceiling<1||!Number.isSafeInteger(cursor.id)||cursor.id<1||cursor.id>cursor.ceiling||typeof cursor.day!=='string'||cursor.day.length>500)throw new Error();ceiling=cursor.ceiling;}catch{throw new OshibkaVvoda('Не удалось прочитать продолжение истории','prodolzhit');}}
 const args=[id,ceiling],where=['z.rezultat_id=?','z.id<=?'],day="coalesce(CAST(z.data AS TEXT),'')";
 if(cursor){where.push(`(${day}<? OR (${day}=? AND z.id<?))`);args.push(cursor.day,cursor.day,cursor.id);}
 const rows=db.prepare(`SELECT z.*,l.imja kto_imja,${day} sort_day FROM zamery z LEFT JOIN ljudi l ON l.id=z.kto WHERE ${where.join(' AND ')} ORDER BY ${day} DESC,z.id DESC LIMIT ?`).all(...args,limit+1),more=rows.length>limit;rows.splice(limit);const last=rows.at(-1);
 const next=more?Buffer.from(JSON.stringify({result:id,ceiling,id:last.id,day:last.sort_day})).toString('base64url'):null;
 return {spisok:rows.map(({sort_day,...row})=>v_api(row)),vsego:db.prepare('SELECT count(*) n FROM zamery WHERE rezultat_id=? AND id<=?').get(id,ceiling).n,prodolzhit:next,srez_id:ceiling};
}
module.exports={list};
