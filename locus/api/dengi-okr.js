                                                                      
const kinds=new Set(['dengi','rubl','rubli','rub']);
const denezhnyj=row=>!!row&&(kinds.has(row.tip)||row.formula==='summa_oplat');
const marked=context=>!!context&&(context.denezhnaja_istorija_okr===true||context.denezhnaja_istorija_okr===1||context.do?.denezhnaja_istorija_okr===true||context.do?.denezhnaja_istorija_okr===1);
const safe='CASE WHEN json_valid(srez) THEN srez ELSE NULL END';
function ids(db){return new Set(db.prepare(`SELECT CASE WHEN obekt='rezultat' THEN obekt_id ELSE json_extract(${safe},'$.rezultat_id') END id FROM zhurnal WHERE obekt IN ('rezultat','zamer') AND json_extract(${safe},'$.denezhnaja_istorija_okr')=1`).all().map(row=>Number(row.id)).filter(id=>Number.isSafeInteger(id)&&id>0));}
function isMoney(db,row){const id=typeof row==='object'?row?.id:Number(row),current=typeof row==='object'?row:db.prepare('SELECT tip,formula FROM rezultaty WHERE id=?').get(id);return denezhnyj(current)||!!(Number.isSafeInteger(id)&&id>0&&db.prepare(`SELECT 1 FROM zhurnal WHERE obekt='rezultat' AND obekt_id=? AND json_extract(${safe},'$.denezhnaja_istorija_okr')=1 LIMIT 1`).get(id));}
module.exports={denezhnyj,marked,ids,isMoney};
