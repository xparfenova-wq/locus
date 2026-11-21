const {createHash}=require('node:crypto');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
function epoch(db,object,id){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt=? AND obekt_id=? AND pole='sozdano'").get(object,id)?.id??null;}
function owner(db,id){const row=db.prepare('SELECT id,sozdano FROM ljudi WHERE id=?').get(id);return row?hash({...row,epoch:epoch(db,'chelovek',id)}):null;}
function row(db,value){return {identichnost:hash({id:value.id,chelovek_id:value.chelovek_id,god:value.god,nedelja:value.nedelja,den:value.den,sozdano:value.sozdano,epoch:epoch(db,'grafik',value.id)})};}
function source(db,id,week){return hash(db.prepare('SELECT * FROM grafik WHERE chelovek_id=? AND god=? AND nedelja=? ORDER BY den,id').all(id,week.god,week.nomer).map(r=>({...r,...row(db,r),head:db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='grafik' AND obekt_id=?").get(r.id)?.id??null})));}
module.exports={hash,stable,owner,row,source};
