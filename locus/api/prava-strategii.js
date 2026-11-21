const {NetDostupa}=require('../db/db.js');
function editors(){
 const parts=(process.env.LOCUS_STRATEGY_EDITOR_IDS||'').split(',').map(part=>part.trim()).filter(Boolean);
 return parts.length&&parts.every(part=>/^[1-9]\d*$/.test(part)&&Number.isSafeInteger(Number(part)))?new Set(parts.map(Number)):new Set();
}
function canEdit(db,actor){
 if(!Number.isSafeInteger(actor)||!editors().has(actor))return false;
 const person=db.prepare('SELECT komanda,aktiven,arhiv,dostup FROM ljudi WHERE id=?').get(actor);
 return !!person&&person.komanda===1&&person.aktiven===1&&!person.arhiv&&person.dostup!=='net';
}
function check(db,actor){if(!canEdit(db,actor))throw new NetDostupa('Стратегию могут редактировать настроенные редакторы стратегии');}
module.exports={canEdit,check};
