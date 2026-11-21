const {baza,OshibkaVvoda,Konflikt,NeNajdeno}=require('../db/db.js');
                                                                               
const CONTENT=['nazvanie','opisanie','napravlenie','tip','publikacija','kljuchevaja','sprint','god_sprinta','srok','data','otvetstvennyj','cel_id','rezultat_id','plan_chislo','povtorjaetsja','povtor_s','chastota','dni','den_nedeli','ne_v_itogi','ploshadka','data_vyhoda','format','rubrika','akkaunt_id'];
const OVERRIDES=new Set([...CONTENT,'status','klient_id','sotrudnichestvo_id','proekt_id','podzadachi','uchastniki','materialy','kommentarii','vid_volny','rassylka_id','vybor_versija','shablon','rol_v_rassylke']);
function number(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new OshibkaVvoda('Нужен номер исходной задачи');return n;}
function source(db,nomer,seen){
 if(!Number.isSafeInteger(seen)||seen<1)throw new OshibkaVvoda('Обнови исходную задачу перед копированием','versija');
 const row=db.prepare('SELECT * FROM zadachi WHERE nomer=? AND COALESCE(udaleno,0)=0').get(nomer);if(!row)throw new NeNajdeno('Исходной задачи нет');
 if(row.versija!==seen)throw new Konflikt('Исходную задачу изменили. Обнови карточку перед копированием.');return row;
}
function draft(db,row,actor){
 const common=require('./obschij.js'),opis=require('./opisanija.js').OPISANIJA,visiting=new Set();let total=0;
 function copy(current,depth=0){
  if(depth>64||++total>5000||visiting.has(current.id))throw new Konflikt('Структуру подзадач нужно проверить перед копированием.');visiting.add(current.id);
  const visible=common.odna('zadachi',opis.zadachi,current.nomer,actor),out=Object.fromEntries(CONTENT.filter(k=>visible[k]!==null&&visible[k]!==undefined).map(k=>[k,visible[k]]));
                                                                             
                                                                                
  if(require('./dengi-zadach.js').isMoney(db,current))delete out.plan_chislo;
  out.status='v_plane';if(depth===0)Object.assign(out,{klient_id:null,sotrudnichestvo_id:null,proekt_id:null});
  const participants=db.prepare('SELECT chelovek_id FROM zadacha_uchastniki WHERE zadacha_id=? ORDER BY chelovek_id').all(current.id).map(r=>r.chelovek_id);if(participants.length)out.uchastniki=participants;
  const materials=[];let page=1,result;do{result=common.spisok('materialy',opis.materialy,{zadacha_id:current.id,na_stranice:1000,stranica:page++},actor);materials.push(...result.spisok);}while(materials.length<result.vsego&&result.spisok.length);
  if(materials.length)out.materialy=materials.map(m=>Object.fromEntries(['nazvanie','ssylka','fajl','razmer','tip_fajla'].filter(k=>m[k]!==null&&m[k]!==undefined).map(k=>[k,m[k]])));
  const children=db.prepare('SELECT * FROM zadachi WHERE roditel_id=? AND COALESCE(udaleno,0)=0 ORDER BY id').all(current.id);if(children.length)out.podzadachi=children.map(child=>copy(child,depth+1));
  visiting.delete(current.id);return out;
 }
 return copy(row);
}
function execute({kljuch,telo={},zapros={},metod,avtor}){
 const db=baza(),nomer=number(kljuch),opis=require('./opisanija.js').OPISANIJA.zadachi;
 if(metod==='GET'){
  for(const key of Object.keys(zapros))if(key!=='versija')throw new OshibkaVvoda('Неизвестный параметр копирования',key);
  const row=source(db,nomer,Number(zapros.versija));return {telo:{ishodnaja:{id:row.id,nomer:row.nomer,versija:row.versija},dostup_snimok:{actor:avtor,dostup:db.prepare('SELECT dostup FROM ljudi WHERE id=?').get(avtor)?.dostup??null},chernovik:draft(db,row,avtor)}};
 }
 if(metod!=='POST')throw Object.assign(new Error('Здесь GET или POST'),{kod:405});
 if(!telo||typeof telo!=='object'||Array.isArray(telo))throw new OshibkaVvoda('Нужны поля копии');
 for(const key of Object.keys(telo))if(!['versija','zapros_kljuch',...OVERRIDES].includes(key))throw new OshibkaVvoda('Неизвестное поле копии',key);
 if(['rassylka_id','vybor_versija'].some(key=>telo[key]!==undefined)&&!['novaja','suschestvuet'].includes(telo.vid_volny))throw new OshibkaVvoda('Явно выбери новую или существующую рассылку','vid_volny');
 const signature={operacija:'kopija_zadachi',nomer,polja:Object.fromEntries(Object.entries(telo).filter(([k])=>k!=='zapros_kljuch'))};
 const result=require('./otmena-sozdanija-zadachi.js').sozdat(telo,opis,avtor,{requiredKey:true,request:signature,prepare:()=>{
  const row=source(db,nomer,telo.versija),payload=draft(db,row,avtor);for(const [key,value]of Object.entries(telo))if(OVERRIDES.has(key))payload[key]=value;return payload;
 }});
 return {kod:result.povtor_sozdanija?200:201,telo:result};
}
module.exports={execute};
