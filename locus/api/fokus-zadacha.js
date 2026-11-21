'use strict';
const {baza,v_api,OshibkaVvoda,NeNajdeno,NetDostupa}=require('../db/db.js');
const time=require('../public/js/focus-time.js');
function positive(value,field){if(typeof value==='boolean'||!(/^[1-9]\d*$/.test(String(value)))||!Number.isSafeInteger(Number(value)))throw new OshibkaVvoda('Нужен номер задачи',field);return Number(value);}
function eligible(db,row,owner){return Number.isSafeInteger(owner)&&owner>0&&!row.udaleno&&(row.otvetstvennyj===owner||!!db.prepare('SELECT 1 FROM zadacha_uchastniki WHERE zadacha_id=? AND chelovek_id=?').get(row.id,owner));}
function ownTask(db,scope,owner){
 const field=Object.hasOwn(scope,'id')?'id':'nomer',value=positive(scope[field],field);
 const row=db.prepare('SELECT * FROM zadachi WHERE '+field+'=? AND COALESCE(udaleno,0)=0').get(value);
 if(!row)throw new NeNajdeno('Задачи нет');
 if(!eligible(db,row,owner))throw new NetDostupa('Для фокуса выбери свою задачу или задачу, где ты участник');
 return row;
}
function descriptor(db,row,owner){
                                                                                   
 const safe=require('./pravila-otveta.js').otvet(db,{tablica:'zadachi',metod:'GET',avtor:owner,zapros:{},telo:{}},v_api(row));
 if(!safe)throw new NeNajdeno('Задачи нет');
 return {id:row.id,nomer:row.nomer,nazvanie:safe.nazvanie??null,adres:'/'+encodeURIComponent(row.napravlenie)+'/'+row.nomer};
}
function read(ctx){
 if(ctx.metod!=='GET')throw Object.assign(new Error('Контекст задачи доступен только для чтения'),{kod:405});
 const query=ctx.zapros||{},keys=Object.keys(query);
 if(keys.length!==1||!['id','nomer'].includes(keys[0]))throw new OshibkaVvoda('Передай один номер задачи','nomer');
 const owner=positive(ctx.avtor,'avtor'),db=baza(),row=ownTask(db,query,owner);
 return {telo:{zadacha:descriptor(db,row,owner)}};
}
function noun(n,one,few,many){const tail=n%100,last=n%10;return tail>=11&&tail<=14?many:last===1?one:last>=2&&last<=4?few:many;}
function duration(minutes){const hours=Math.floor(minutes/60),rest=minutes%60;return (hours?hours+' ч'+(rest?' ':''):'')+(rest||!hours?rest+' мин':'');}
function stats(db,id){
 const rows=db.prepare("SELECT nachalo,konec,pauza_ms,pauza_s FROM fokus_sessii WHERE zadacha_id=? AND konec IS NOT NULL AND konec<>'' AND zachtena=1 AND rezhim='fokus'").all(id);
 let ms=0,unknown=0;for(const row of rows){try{const n=time.active(row);if(!Number.isSafeInteger(n)||n<0||!Number.isSafeInteger(ms+n))throw Error();ms+=n;}catch{unknown++;}}
 const known=Math.round(ms/60000),count=rows.length;
 const text=count+' '+noun(count,'сессия','сессии','сессий')+(unknown?', время уточняется'+(count>unknown?' (известно '+duration(known)+')':''):', '+duration(known));
 return {sessij:count,minut:unknown?null:known,izvestno_minut:known,neizvestno_sessij:unknown,podskazka:text};
}
module.exports={read,ownTask,eligible,descriptor,stats};
