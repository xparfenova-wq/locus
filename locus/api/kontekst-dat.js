const time=require('./vremja-obschenija.js'),capabilities=new WeakMap();
function polnaja(db){
 if(!capabilities.has(db))capabilities.set(db,db.prepare('PRAGMA table_info(zhurnal)').all().some(c=>c.name==='srez')&&db.prepare('PRAGMA table_info(versii_polej)').all().length>0);
 return capabilities.get(db);
}
function najti(db,person){
 if(!polnaja(db))return {svoi:()=>true,otmetki:new Map()};                                                                 
 const versions=new Map();for(const row of db.prepare("SELECT v.obekt_id,v.pole,v.versija FROM versii_polej v JOIN sotrudnichestva s ON s.id=v.obekt_id WHERE v.tablica='sotrudnichestva' AND s.chelovek_id=? AND v.pole IN ('chelovek_id','poslednee_obshenie','poslednjaja_zadacha')").all(person)){if(!versions.has(row.obekt_id))versions.set(row.obekt_id,{});versions.get(row.obekt_id)[row.pole]=row.versija;}
 const otmetki=new Map();for(const row of db.prepare("SELECT obekt_id,srez FROM zhurnal WHERE srez IS NOT NULL AND json_extract(srez,'$.chelovek_id')=? AND obekt='sotrudnichestvo' AND json_type(srez,'$.obschenie')='object' ORDER BY id").all(person))otmetki.set(row.obekt_id,JSON.parse(row.srez).obschenie);
 function svoi(row,field){const meta=versions.get(row.id);if(!meta?.chelovek_id||(meta[field]||0)>=meta.chelovek_id)return true;
  if(field==='poslednee_obshenie'){const own=time.prochitat(otmetki.get(row.id)?.kogda),cached=time.prochitat(row[field]);return !!own&&!!cached&&own.moment===cached.moment;}return false;
 }
 return {svoi,otmetki};
}
function sqlSvoi(alias='s'){
 const owner=`(SELECT v.versija FROM versii_polej v WHERE v.tablica='sotrudnichestva' AND v.obekt_id=${alias}.id AND v.pole='chelovek_id')`;
 const date=`(SELECT v.versija FROM versii_polej v WHERE v.tablica='sotrudnichestva' AND v.obekt_id=${alias}.id AND v.pole='poslednee_obshenie')`;
 const own=`(SELECT json_extract(j.srez,'$.obschenie.kogda') FROM zhurnal j WHERE j.srez IS NOT NULL AND json_extract(j.srez,'$.chelovek_id')=${alias}.chelovek_id AND j.obekt='sotrudnichestvo' AND j.obekt_id=${alias}.id AND json_type(j.srez,'$.obschenie')='object' ORDER BY j.id DESC LIMIT 1)`;
 return `(${owner} IS NULL OR COALESCE(${date},0)>=${owner} OR locus_obschenie_moment(${own})=locus_obschenie_moment(${alias}.poslednee_obshenie))`;
}
function sqlKandidaty(person='ljudi.id'){
 return `SELECT s.poslednee_obshenie znachenie FROM sotrudnichestva s WHERE s.chelovek_id=${person} AND ${sqlSvoi('s')}
 UNION ALL SELECT json_extract(j.srez,'$.obschenie.kogda') znachenie FROM zhurnal j
 WHERE j.srez IS NOT NULL AND json_extract(j.srez,'$.chelovek_id')=${person} AND j.obekt='sotrudnichestvo' AND json_type(j.srez,'$.obschenie')='object'
 AND NOT EXISTS(SELECT 1 FROM sotrudnichestva s WHERE s.id=j.obekt_id AND s.chelovek_id=${person})
 AND NOT EXISTS(SELECT 1 FROM zhurnal n WHERE n.id>j.id AND n.srez IS NOT NULL AND json_extract(n.srez,'$.chelovek_id')=${person} AND n.obekt='sotrudnichestvo' AND n.obekt_id=j.obekt_id AND json_type(n.srez,'$.obschenie')='object')`;
}
module.exports={najti,sqlKandidaty};
