                                                                       
const {den_v_zone}=require('./nagruzka.js');
const formatters=new Map();
function pojas(db){
  try{return db.prepare('SELECT chasovoj_pojas FROM nastrojki_sistemy LIMIT 1').get()?.chasovoj_pojas||'Europe/Moscow';}
  catch(error){if(!String(error.message).includes('no such table'))throw error;return 'Europe/Moscow';}
}
function den(value,zone){
  if(value==null||value==='')return null;
  try{require('./kalendar.js').data(String(value).slice(0,10));}catch{return null;}
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return String(value);
  if(!formatters.has(zone)){
    if(formatters.size>=16)formatters.delete(formatters.keys().next().value);
    formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}));
  }
  return den_v_zone(value,zone,formatters.get(zone));
}
function aktivnost(db,period,direction){
  const zone=pojas(db),active=new Set();
  const add=(person,dir,date)=>{const day=den(date,zone);if(day&&(!period||(day>=period.nachalo&&day<=period.konec)))active.add(person+':'+dir);};
  const scope=direction?' WHERE s.napravlenie=?':'',args=direction?[direction]:[];
  for(const row of db.prepare('SELECT s.chelovek_id,s.napravlenie,s.poslednee_obshenie FROM sotrudnichestva s'+scope).all(...args))add(row.chelovek_id,row.napravlenie,row.poslednee_obshenie);
  for(const row of db.prepare(`SELECT s.chelovek_id,s.napravlenie,j.kogda,j.pole,j.stalo FROM zhurnal j
    JOIN sotrudnichestva s ON s.id=j.obekt_id WHERE j.obekt='sotrudnichestvo'
    AND j.pole IN ('rol','stadija','svoja_stadija','poslednee_obshenie')${direction?' AND s.napravlenie=?':''}`).all(...args))add(row.chelovek_id,row.napravlenie,row.pole==='poslednee_obshenie'?row.stalo:row.kogda);
                                                                     
                                                                   
  for(const row of db.prepare(`SELECT z.id,COALESCE(z.klient_id,s.chelovek_id) chelovek_id,z.napravlenie,z.sozdano,z.shablon,z.srok
    FROM zadachi z LEFT JOIN sotrudnichestva s ON s.id=z.sotrudnichestvo_id
    WHERE COALESCE(z.udaleno,0)=0${direction?' AND z.napravlenie=?':''}`).all(...args)){
    if(row.chelovek_id==null)continue;add(row.chelovek_id,row.napravlenie,row.sozdano);
    if(row.shablon==='kasanie')add(row.chelovek_id,row.napravlenie,row.srok);
  }
  for(const row of db.prepare(`SELECT COALESCE(z.klient_id,s.chelovek_id) chelovek_id,z.napravlenie,j.kogda
    FROM zhurnal j JOIN zadachi z ON z.id=j.obekt_id LEFT JOIN sotrudnichestva s ON s.id=z.sotrudnichestvo_id
    WHERE j.obekt='zadacha' AND COALESCE(z.udaleno,0)=0${direction?' AND z.napravlenie=?':''}`).all(...args))if(row.chelovek_id!=null)add(row.chelovek_id,row.napravlenie,row.kogda);
  for(const row of db.prepare(`SELECT k.chelovek_id,r.napravlenie,k.kogda FROM rassylka_kasanija k JOIN rassylki r ON r.id=k.rassylka_id${direction?' WHERE r.napravlenie=?':''}`).all(...args))add(row.chelovek_id,row.napravlenie,row.kogda);
  return active;
}
module.exports={aktivnost,pojas,den};
