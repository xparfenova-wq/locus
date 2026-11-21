const {createHash}=require('node:crypto');
const {OshibkaVvoda}=require('../db/db.js');
const calendar=require('./kalendar.js');
function unavailable(cause){return Object.assign(new Error('Не удалось прочитать сохранённую планёрку. Повтори чтение: сохранённые числа не пересчитывались.'),{kod:503,cause});}
function read(db,{napravlenie,god,nomer}){
 let rows;
 try{rows=db.prepare('SELECT rowid,* FROM snimki_planerki WHERE god=? AND nedelja=?'+(napravlenie?' AND napravlenie=?':'')+' ORDER BY napravlenie').all(...(napravlenie?[god,nomer,napravlenie]:[god,nomer]));}catch(error){throw unavailable(error);}
 if(rows.length>1)throw new OshibkaVvoda('Укажи направление: за эту неделю сохранено несколько планёрок','napravlenie');
 if(!rows.length)return null;
 const row=rows[0];let data;
 try{data=JSON.parse(row.dannye);}catch(error){throw unavailable(error);}
 if(!data||typeof data!=='object'||Array.isArray(data)||!data.svodka||typeof data.svodka!=='object'||data.napravlenie!==row.napravlenie||Number(data.god)!==row.god||Number(data.nedelja)!==row.nedelja)throw unavailable(new Error('Stored weekly identity or data is invalid'));
 return {...row,dannye:data,versija:createHash('sha256').update(JSON.stringify([row.rowid,row.napravlenie,row.god,row.nedelja,row.sozdano,row.pereschitan,row.dannye])).digest('hex')};
}
function metadata(week,day,saved,explicitDay=false){
 const range=calendar.granicy_nedeli(week.god,week.nomer),past=range.konec<day,future=range.nachalo>day;
 return {vid:saved?'snimok':explicitDay?'srez_na_datu':past?'ne_zafiksirovano':future?'buduschaja':'tekuschaja',napravlenie:saved?.napravlenie??null,god:week.god,nedelja:week.nomer,nachalo:range.nachalo,konec:range.konec,sozdano:saved?.sozdano??null,pereschitan:saved?.pereschitan??null,versija:saved?.versija??null,tolko_chtenie:!!saved||past};
}
function permissions(db,scope,actor){
 const direction=db.prepare('SELECT arhiv FROM napravlenija WHERE kod=?').get(scope.napravlenie);
 return {mozhno_pereschitat:!!direction&&!direction.arhiv&&scope.konec<require('../db/db.js').segodnja()&&require('./celi-model.js').canLead(db,scope,actor)&&require('./dengi-dostup.js').vidit(db,actor)};
}
function report(saved,week,day,actions={}){return {...saved.dannye,istochnik_otcheta:{...metadata(week,day,saved),...actions}};}
function extras(db,{napravlenie,week,day,actor,uchityvat_otlozhennye=false}){
 const cutoff=[day,week.konec].sort()[0],before=calendar.sdvinut_den(week.nachalo,-1),screens=require('./ekrany2.js');
 if(cutoff<week.nachalo)return {platezhi:[],tokeny:[],socseti:[],insajty:[],na_datu:cutoff};
 const platezhi=db.prepare('SELECT pl.* FROM platezhi pl JOIN proekty p ON p.id=pl.proekt_id WHERE p.napravlenie=? ORDER BY pl.id').all(napravlenie);
 const tokeny=cutoff<week.nachalo?[]:screens.sostojanija_komanda({zapros:{s:week.nachalo,po:cutoff},metod:'GET'}).telo.spisok;
 const socseti=db.prepare('SELECT * FROM akkaunty WHERE napravlenie=? AND aktiven=1 ORDER BY id').all(napravlenie).map(row=>{
  const engine=require('./metriki-akkaunta.js'),latest=engine.vse(db,row.id,cutoff).metriki.podpischikov,initial=engine.vse(db,row.id,before).metriki.podpischikov;
  return {id:row.id,nazvanie:row.nazvanie,ploshadka:row.ploshadka,podpischikov:latest.znachenie,obnovleno:latest.obnovleno,pochemu:latest.pochemu,delta:latest.znachenie==null||initial.znachenie==null?null:Number(require('../public/js/decimal-plan.js').subtract(latest.znachenie,initial.znachenie))};
 });
 const insajty=screens.insajty({zapros:{napravlenie,den:cutoff},avtor:actor,metod:'GET',uchityvat_otlozhennye}).telo.insajty;
 return {platezhi,tokeny,socseti,insajty,na_datu:cutoff};
}
module.exports={read,metadata,report,extras,permissions};
