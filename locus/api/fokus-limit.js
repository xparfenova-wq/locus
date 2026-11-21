const {baza,v_odnoj_tranzakcii}=require('../db/db.js');
const time=require('../public/js/focus-time.js');
const LIMIT=86400000;
const stamp=number=>new Date(number).toISOString().replace('T',' ').replace('Z','');

                                                                               
                                                                        
function startedHere(row,receipts){
 return receipts.some(receipt=>{
  try{
   const saved=JSON.parse(receipt.itog_json).sessija;
   return receipt.avtor===row.chelovek_id&&receipt.sessija_id===row.id&&receipt.identifikator===row.identifikator&&
    saved.id===row.id&&saved.chelovek_id===row.chelovek_id&&saved.identifikator===row.identifikator&&
    saved.nachalo===row.nachalo&&saved.konec===null&&saved.versija===1;
  }catch{return false;}
 });
}
function due(db,row,now=Date.now()){
 if(row.konec||!row.identifikator||!Number.isFinite(now))return false;
 try{if(now<time.instant(row.nachalo)+LIMIT)return false;}catch{return false;}
 return startedHere(row,db.prepare("SELECT * FROM zaprosy_fokusa WHERE operacija='start' AND avtor=? AND sessija_id=? AND identifikator=?").all(row.chelovek_id,row.id,row.identifikator));
}
function closeDue(db,row,now=Date.now()){
 if(!due(db,row,now))return false;
 let end,pause=row.pauza_ms;
 try{
  end=time.instant(row.nachalo)+LIMIT;
  if(!Number.isSafeInteger(pause)||pause<0)return false;
  time.active(row,end);
  if(row.pauza_s){const began=time.instant(row.pauza_s);if(began<time.instant(row.nachalo)||began>end)return false;pause+=end-began;}
  if(!Number.isSafeInteger(pause)||pause>LIMIT)return false;
 }catch{return false;}
 return v_odnoj_tranzakcii(db,()=>{
  const result=db.prepare('UPDATE fokus_sessii SET konec=?,zachtena=0,pauza_s=NULL,pauza_ms=?,versija=versija+1 WHERE id=? AND konec IS NULL AND versija=? AND identifikator=? AND nachalo=?').run(stamp(end),pause,row.id,row.versija,row.identifikator,row.nachalo);
  if(!result.changes)return false;
  db.prepare('INSERT INTO zavershenija_fokusa(sessija_id,chelovek_id,identifikator,nachalo,konec,sozdano)VALUES(?,?,?,?,?,?)').run(row.id,row.chelovek_id,row.identifikator,row.nachalo,stamp(end),stamp(now));
  return true;
 });
}
function expire(db=baza(),now=Date.now()){
 if(!Number.isFinite(now))throw new TypeError('Invalid focus expiry clock');
 return v_odnoj_tranzakcii(db,()=>{
  let closed=0;
  for(const row of db.prepare('SELECT * FROM fokus_sessii WHERE konec IS NULL AND identifikator IS NOT NULL').all())if(closeDue(db,row,now))closed++;
  return closed;
 });
}
function automatic(row,db=baza()){
 if(!row.konec||!row.identifikator)return false;
 return !!db.prepare('SELECT 1 FROM zavershenija_fokusa WHERE sessija_id=? AND chelovek_id=? AND identifikator=? AND nachalo=? AND konec=?').get(row.id,row.chelovek_id,row.identifikator,row.nachalo,row.konec);
}
function attach(server){
 let timer;
 const run=()=>{try{expire();}catch(error){console.error('focus expiry: '+error.name);}};
 server.once('listening',()=>{run();timer=setInterval(run,60000);timer.unref();});
 server.once('close',()=>{if(timer)clearInterval(timer);});
}
module.exports={expire,automatic,attach,due,closeDue,LIMIT};
