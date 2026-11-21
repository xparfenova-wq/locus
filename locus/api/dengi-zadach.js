                                                                           
                                                                              
const fields=Object.freeze(['plan_chislo','fakt','fakt_nedeli','procent','progress_pct']);
function marked(row){
 return !!row&&(row.denezhnaja_zadacha===true||row.denezhnaja_zadacha===1||row.platezh_id!=null||row.shablon==='poluchit_oplatu'||row.referalnaja_zadacha?.vid==='vyplata');
}
function ids(db){
 return new Set(db.prepare(`SELECT id FROM zadachi WHERE platezh_id IS NOT NULL OR shablon='poluchit_oplatu'
  UNION SELECT zadacha_id FROM referalnye_zadachi WHERE vid='vyplata'
  UNION SELECT obekt_id FROM zhurnal WHERE obekt='zadacha' AND json_valid(srez)
   AND (json_extract(srez,'$.denezhnaja_zadacha')=1 OR json_extract(srez,'$.platezh_id') IS NOT NULL)`)
  .all().map(row=>Number(row.id)));
}
function isMoney(db,row){
 return marked(row)||!!(row?.id&&db.prepare(`SELECT 1 FROM referalnye_zadachi WHERE zadacha_id=? AND vid='vyplata'
  UNION ALL SELECT 1 FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND json_valid(srez)
   AND (json_extract(srez,'$.denezhnaja_zadacha')=1 OR json_extract(srez,'$.platezh_id') IS NOT NULL) LIMIT 1`).get(row.id,row.id));
}
module.exports={fields,marked,ids,isMoney};
