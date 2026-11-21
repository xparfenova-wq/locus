                                                                            
                                                                   
const {baza,segodnja,seichas,NetDostupa,OshibkaVvoda,v_odnoj_tranzakcii}=require('../db/db.js');
const {uvedomit}=require('./sobytija-uvedomlenij.js');
function vypolnit({metod,sluzhebnyj,telo={},zapros={}}){
 if(sluzhebnyj!==true)throw new NetDostupa('запуск уведомлений доступен только фоновому заданию');
 if(metod!=='POST')throw Object.assign(new Error('сюда только POST'),{kod:405});
 if(!telo||typeof telo!=='object'||Array.isArray(telo)||Object.keys(telo).length||Object.keys(zapros).length)throw new OshibkaVvoda('фоновое задание не принимает параметры');
 const now=new Date(),den=segodnja(now),hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(now));
 const result={den,istekaet_segodnja:0,prosrocheno:0,ubrano_prochitannyh:0};
                                                                              
                                                                    
 if(hour<9)return{telo:{...result,otlozheno_do:'09:00 Europe/Moscow'}};
 const db=baza();
 return v_odnoj_tranzakcii(db,()=>{
  const tasks=db.prepare(`SELECT z.id,z.nazvanie,z.otvetstvennyj,z.srok FROM zadachi z
   JOIN ljudi l ON l.id=z.otvetstvennyj AND l.komanda=1 AND COALESCE(l.arhiv,0)=0
   WHERE z.srok<=? AND date(z.srok)=z.srok AND z.povtorjaetsja IS NOT 1
    AND z.status NOT IN ('sdelano','kogda_nibud') AND COALESCE(z.udaleno,0)=0 ORDER BY z.id`).all(den);
  const remember=db.prepare('INSERT INTO povody_uvedomlenij(kljuch,sozdano) VALUES(?,?) ON CONFLICT(kljuch) DO NOTHING');
  for(const task of tasks){
   const due=task.srok===den,tip=due?'segodnja_istekaet_srok':'zadacha_prosrochena';
   const key=[tip,task.id,task.srok,task.otvetstvennyj].join('/');
   if(!remember.run(key,seichas()).changes)continue;
   const notice=uvedomit(db,{komu:task.otvetstvennyj,avtor:null,tip,potok:'pro_menja',zadacha_id:task.id,
    tekst:(due?'Сегодня истекает срок: ':'Просрочена: ')+task.nazvanie});
   if(notice===null){db.prepare('DELETE FROM povody_uvedomlenij WHERE kljuch=?').run(key);continue;}
   db.prepare('UPDATE povody_uvedomlenij SET uvedomlenie_id=? WHERE kljuch=?').run(notice,key);
   if(due)result.istekaet_segodnja++;else result.prosrocheno++;
  }
                                                                               
                                                                             
                                                                              
  result.ubrano_prochitannyh=db.prepare(`DELETE FROM uvedomlenija
   WHERE prochitano=1 AND date(sozdano,'+3 hours')<date(?,'-30 day')`).run(den).changes;
  return{telo:result};
 });
}
module.exports={vypolnit};
