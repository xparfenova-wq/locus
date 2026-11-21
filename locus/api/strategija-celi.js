const {OshibkaVvoda,NeNajdeno,segodnja}=require('../db/db.js');
function thesisId(value){
 if(!['number','string'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new OshibkaVvoda('Нужен номер тезиса стратегии','tezis_id');
 return Number(value);
}
function thesis(db,value){
 const row=db.prepare('SELECT * FROM tezisy WHERE id=? AND COALESCE(udaleno,0)=0').get(thesisId(value));if(!row)throw new NeNajdeno('Тезис стратегии больше недоступен');return row;
}
function prepareLink(data,before,db){
 if(before&&!['tezis_id','napravlenie'].some(key=>Object.hasOwn(data,key)))return;
 const value=Object.hasOwn(data,'tezis_id')?data.tezis_id:before?.tezis_id;if(value==null)return;
 let source;try{source=thesis(db,value);}catch(error){if(error.kod===404)throw new OshibkaVvoda('Выбери существующий тезис стратегии','tezis_id');throw error;}
 const direction=Object.hasOwn(data,'napravlenie')?data.napravlenie:before?.napravlenie??source.napravlenie;
 if(!source.napravlenie||direction!==source.napravlenie)throw new OshibkaVvoda('Тезис из другого направления. Выбери подходящий тезис или явно убери связь','tezis_id');
 if(!before&&data.napravlenie==null)data.napravlenie=direction;
 if(!before&&data.period_id==null){const day=segodnja();data.period_id=day.slice(0,4)+'-Q'+(Math.floor((Number(day.slice(5,7))-1)/3)+1);}
 data.tezis_id=source.id;
}
function goals(db,id,actor){
 const visible=require('./pravila-otveta.js').vidimost('celi',actor??null,'c.');
 return db.prepare('SELECT c.* FROM celi c WHERE c.tezis_id=? AND '+visible.sql+' ORDER BY c.id').all(id,...visible.args).map(goal=>{
  const engine=require('./ekrany.js'),rows=db.prepare('SELECT * FROM rezultaty WHERE cel_id=? ORDER BY id').all(goal.id).map(row=>({...row,fakt:engine.fakt_rezultata(db,row)})),percent=engine.procent_celi(rows);
  return {id:goal.id,nazvanie:goal.nazvanie,napravlenie:goal.napravlenie,period_id:goal.period_id,sostojanie:goal.sostojanie,procent:percent,progress_pct:percent,url:'/okr/'+goal.id};
 });
}
function sourceLink(db,goal){
 if(!goal.tezis_id)return null;
 const source=db.prepare('SELECT id,tekst,napravlenie,god,udaleno FROM tezisy WHERE id=?').get(goal.tezis_id);
 if(!source||source.udaleno)return {id:goal.tezis_id,udalen:true};
 const {udaleno,...visible}=source;return {...visible,url:'/napravlenija.html?'+new URLSearchParams({napravlenie:source.napravlenie,vkladka:'strategija',...(/^\d{4}$/.test(String(source.god))?{god_strategii:String(source.god)}:{})})+'#tezis-'+source.id};
}
function tasks(db,value,actor){
 const source=thesis(db,value),visible=goals(db,source.id,actor),ids=visible.map(goal=>goal.id);
 const rows=ids.length?db.prepare(`SELECT z.id,z.nomer,z.nazvanie,z.status,z.napravlenie,z.srok,z.rezultat_id,
   COALESCE(z.cel_id,r.cel_id) cel_id FROM zadachi z LEFT JOIN rezultaty r ON r.id=z.rezultat_id
   WHERE COALESCE(z.cel_id,r.cel_id) IN (${ids.map(()=>'?').join(',')}) AND COALESCE(z.udaleno,0)=0
   ORDER BY z.status='sdelano',z.nomer`).all(...ids).map(row=>({...row,url:'/'+encodeURIComponent(row.napravlenie||'zadachi')+'/'+row.nomer})):[];
 return {tezis:source.id,celej:visible.length,celi:visible,vsego:rows.length,spisok:rows};
}
function create({kljuch,telo={},avtor,metod}){
 if(metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});
 const db=require('../db/db.js').baza(),id=thesisId(kljuch);
 if(!telo||typeof telo!=='object'||Array.isArray(telo))throw new OshibkaVvoda('Нужны параметры цели');
 for(const key of Object.keys(telo))if(!['nazvanie','opisanie','napravlenie','period_id','zapros_kljuch'].includes(key))throw new OshibkaVvoda('Неизвестное поле цели из стратегии',key);
                                                                           
                                                                              
 const body={...telo,tezis_id:id};
 const row=Object.hasOwn(body,'zapros_kljuch')?require('./sozdanie-okr.js').create('celi',body,avtor):require('./obschij.js').sozdat('celi',require('./opisanija.js').OPISANIJA.celi,body,avtor);
 return {kod:201,telo:row};
}
module.exports={thesis,prepareLink,goals,sourceLink,tasks,create};
