                                                                                
const COLLECT='sobrat_bazu',SEND='otpravit';
function template(row){if(!row)return null;if(row.kod===COLLECT||['kontakty','kontakty_bazy'].includes(row.schitat_fakt))return COLLECT;if(row.kod==='otpravit_rassylku'||row.schitat_fakt==='otpravleno')return SEND;return null;}
function of(row){if([COLLECT,SEND].includes(row?.rol_v_rassylke))return row.rol_v_rassylke;if(row?.rol_v_rassylke==='volna')return SEND;if(row?.shablon===COLLECT)return COLLECT;if(['otpravit_rassylku','rassylka','rassylka_plan'].includes(row?.shablon))return SEND;return null;}
const collection=row=>of(row)===COLLECT;
function planned(db,row){if(row?.shablon==='rassylka_plan')return true;if(row?.rol_v_rassylke!==SEND||!row.rassylka_id)return false;return !!db.prepare('SELECT 1 FROM plany_kampanij p WHERE p.rassylka_id=? AND p.zadacha_otpravki_id=? AND NOT EXISTS(SELECT 1 FROM sostavy_voln s WHERE s.zadacha_id=?)').get(row.rassylka_id,row.id,row.id);}
function alias(value){if(!/^[a-z][a-z0-9_]*$/i.test(value))throw new Error('Internal SQL alias');return value;}
function collectionSQL(value='z'){const z=alias(value);return `(${z}.rol_v_rassylke='sobrat_bazu' OR COALESCE(${z}.shablon,'')='sobrat_bazu')`;}
function plannedSQL(value='z'){const z=alias(value);return `(COALESCE(${z}.shablon,'')='rassylka_plan' OR (${z}.rol_v_rassylke='otpravit' AND EXISTS(SELECT 1 FROM plany_kampanij _plan WHERE _plan.rassylka_id=${z}.rassylka_id AND _plan.zadacha_otpravki_id=${z}.id) AND NOT EXISTS(SELECT 1 FROM sostavy_voln _roster WHERE _roster.zadacha_id=${z}.id)))`;}
function sendingSQL(value='z'){return `NOT COALESCE(${collectionSQL(value)},0) AND NOT COALESCE(${plannedSQL(value)},0)`;}
module.exports={COLLECT,SEND,template,of,collection,planned,collectionSQL,plannedSQL,sendingSQL};
