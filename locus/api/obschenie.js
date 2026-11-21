const time=require('./vremja-obschenija.js');
function proveritMoment(value){
 try{const parsed=time.razobrat(value);if(parsed.moment>Date.now()+1000)throw Object.assign(new Error('Общение ещё не состоялось: дата в будущем'),{code:'future_communication_date'});return parsed;}
 catch(cause){const error=new(require('../db/db.js').OshibkaVvoda)(cause.message,'kogda');error.dannye={kod:cause.code||'invalid_communication_date'};throw error;}
}
function podgotovitPolja(data){
 if(Object.hasOwn(data,'poslednjaja_zadacha'))throw new(require('../db/db.js').OshibkaVvoda)('Последняя задача рассчитывается при закрытии задачи','poslednjaja_zadacha');
 if(Object.hasOwn(data,'poslednee_obshenie')&&data.poslednee_obshenie!==null){try{data.poslednee_obshenie=proveritMoment(data.poslednee_obshenie).znachenie;}catch(error){error.pole='poslednee_obshenie';throw error;}}
}
function najti(db,person,now=Date.now()){
 const rows=db.prepare('SELECT id,poslednee_obshenie,poslednjaja_zadacha FROM sotrudnichestva WHERE chelovek_id=? ORDER BY id').all(person);
 const scope=require('./kontekst-dat.js').najti(db,person),owned=new Set(rows.map(row=>row.id));
 let latest=null,lastTask=null,unknown=false;
 for(const row of rows){
  if(row.poslednee_obshenie!==null){const parsed=time.prochitat(row.poslednee_obshenie);if(!scope.svoi(row,'poslednee_obshenie')||!parsed)unknown=true;else if(!latest||parsed.moment>latest.moment)latest={...parsed,raw:row.poslednee_obshenie,role:row.id};}
  const task=time.prochitat(row.poslednjaja_zadacha);if(scope.svoi(row,'poslednjaja_zadacha')&&task&&time.den(row.poslednjaja_zadacha)<=time.denMoment(now)&&(!lastTask||task.moment>lastTask.moment))lastTask={...task,raw:row.poslednjaja_zadacha};
 }
 for(const [role,fact] of scope.otmetki){if(owned.has(role)||fact.kogda===null)continue;const parsed=time.prochitat(fact.kogda);if(!parsed)unknown=true;else if(!latest||parsed.moment>latest.moment)latest={...parsed,raw:fact.kogda,role,source:fact.istochnik};}
 const owner=rows.length?'(z.klient_id=? OR (z.klient_id IS NULL AND z.sotrudnichestvo_id IN ('+rows.map(()=>'?').join(',')+')))':'z.klient_id=?';
 const work=db.prepare(`SELECT MAX(${require('./zavershenie.js').data_zakrytija('z')}) kogda FROM zadachi z
   WHERE ${owner} AND COALESCE(z.udaleno,0)=0`).get(person,...rows.map(row=>row.id));
 if(work?.kogda){const day=String(work.kogda).slice(0,10),parsed=time.prochitat(day);if(parsed&&(!lastTask||parsed.moment>lastTask.moment))lastTask={...parsed,raw:day};}
 let source=latest?.source??null;
 if(latest&&!latest.source){
  const journal=db.prepare("SELECT pole,stalo FROM zhurnal WHERE obekt='sotrudnichestvo' AND obekt_id=? AND pole IN ('kasanie','poslednee_obshenie') ORDER BY id DESC LIMIT 1").get(latest.role),match=/^(.*) \((ruchnaja|bot)\)$/.exec(journal?.stalo||'');
  if(match&&time.prochitat(match[1])?.moment===latest.moment)source=match[2];
  if(journal?.pole==='poslednee_obshenie'&&time.prochitat(journal.stalo)?.moment===latest.moment)source='ruchnaja';
 }
 return {poslednee_obshenie_obshee:latest?.raw??null,poslednee_obshenie_den:latest?time.den(latest.raw):null,poslednee_obshenie:latest?{kogda:latest.raw,istochnik:source}:null,dnej_bez_svjazi:latest?time.dnej(latest.raw,now):null,poslednjaja_zadacha:lastTask?time.den(lastTask.raw):null,neizvestnaja_data_obschenija:unknown,buduschaja_data_obschenija:latest?time.den(latest.raw)>time.denMoment(now):false};
}
module.exports={najti,proveritMoment,podgotovitPolja};
