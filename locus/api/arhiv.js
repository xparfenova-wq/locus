                                                                  
                                                                      
const calendar=require('./kalendar.js'),dates=require('./aktivnost-lidov.js');
const VOSSTANOVIT_DATY=Symbol('archive dates from an authenticated undo snapshot');
function flag(value){
 if(value===1||value===true||/^(1|true|da|да)$/i.test(String(value).trim()))return true;
 if(value===0||value===false||/^(0|false|net|нет)(?::.*)?$/i.test(String(value).trim()))return false;
 return null;
}
function dni(row,history,window,zone='Europe/Moscow'){
 const events=[];
 for(const event of history){
  const day=dates.den(event.kogda,zone),after=flag(event.stalo),before=flag(event.bylo);
  const moment=require('./vremja-obschenija.js').prochitat(event.kogda)?.moment;
  if(day&&after!==null&&before!==after)events.push({day,after,before,order:event.id||0,moment:moment??0});
 }
                                                                    
                                                     
 for(const [field,after] of [['arhiv_s',true],['vozvrat_s',false]]){
  const day=dates.den(row[field],zone);
  if(day&&!events.some(e=>e.day===day&&e.after===after))events.push({day,after,before:!after,order:-1,moment:-Infinity});
 }
 events.sort((a,b)=>a.day.localeCompare(b.day)||a.moment-b.moment||a.order-b.order);
 let archived=events.length?(events[0].before??!events[0].after):flag(row.arhiv)===true;
 const created=dates.den(row.sozdano,zone),result=new Set();let index=0;
 for(let day=window.nachalo;day<=window.konec;day=calendar.sdvinut_den(day,1)){
  while(index<events.length&&events[index].day<day)archived=events[index++].after;
  let active=!archived;
  while(index<events.length&&events[index].day===day){if(!events[index].after)active=true;archived=events[index++].after;}
  if(active&&(!created||created<=day))result.add(day);
 }
 return result;
}
function period(db,roles,window){
 const zone=dates.pojas(db),people=new Map(),history=new Map();
 if(!roles.length)return new Map();
                                                                  
 const direction=roles[0].napravlenie;
 for(const row of db.prepare(`SELECT l.* FROM ljudi l WHERE l.id IN
  (SELECT chelovek_id FROM sotrudnichestva WHERE napravlenie=?)`).all(direction))people.set(row.id,row);
 for(const event of db.prepare(`SELECT j.id,j.obekt,j.obekt_id,j.kogda,j.bylo,j.stalo FROM zhurnal j
  WHERE j.pole='arhiv' AND ((j.obekt='chelovek' AND j.obekt_id IN
   (SELECT chelovek_id FROM sotrudnichestva WHERE napravlenie=?)) OR
   (j.obekt='sotrudnichestvo' AND j.obekt_id IN
   (SELECT id FROM sotrudnichestva WHERE napravlenie=?))) ORDER BY j.kogda,j.id`).all(direction,direction)){
  const key=event.obekt+':'+event.obekt_id;if(!history.has(key))history.set(key,[]);history.get(key).push(event);
 }
 const personDays=new Map(),result=new Map();
 for(const role of roles){
  const person=people.get(role.chelovek_id);
  if(!personDays.has(role.chelovek_id))personDays.set(role.chelovek_id,person?dni(person,history.get('chelovek:'+person.id)||[],window,zone):new Set());
  const own=dni(role,history.get('sotrudnichestvo:'+role.id)||[],window,zone),upper=personDays.get(role.chelovek_id);
  const source=upper.size===0?person:role,object=source===person?'chelovek':'sotrudnichestvo';
  const starts=(history.get(object+':'+source?.id)||[]).filter(event=>flag(event.stalo)===true).map(event=>dates.den(event.kogda,zone)).filter(day=>day&&day<=window.konec);
  const fallback=dates.den(source?.arhiv_s,zone);if(fallback&&fallback<=window.konec)starts.push(fallback);
  result.set(role.id,{active:[...own].some(day=>upper.has(day)),person,arhiv_s:starts.sort().at(-1)||null});
 }
 return result;
}
function podgotovit(tablica,patch,before,body){
 const restore=body?.[VOSSTANOVIT_DATY];
 if(restore){for(const field of ['arhiv_s','vozvrat_s'])if(Object.hasOwn(before,field)&&Object.hasOwn(restore,field))patch[field]=restore[field];return;}
 if(!Object.hasOwn(patch,'arhiv')||patch.arhiv===before.arhiv)return;
 const today=require('../db/db.js').segodnja();
 if(Object.hasOwn(before,'arhiv_s'))patch.arhiv_s=patch.arhiv?today:null;
 if(Object.hasOwn(before,'vozvrat_s')&&!patch.arhiv)patch.vozvrat_s=today;
}
module.exports={flag,dni,period,podgotovit,VOSSTANOVIT_DATY};
