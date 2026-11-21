const {Konflikt}=require('../db/db.js');
function proveritIzmenenie(db,before,patch){
 const fields=['chelovek_id','napravlenie'].filter(field=>Object.hasOwn(patch,field)&&String(patch[field])!==String(before[field]));if(!fields.length)return;
 const populated=['stadija','svoja_stadija','osobennosti','zametka','kontekst','kommentarij','poslednee_obshenie','poslednjaja_zadacha','kontakt_id','referal_id','rekomendoval_id','rassylka_id','istochnik','istochnik_tekst'].some(field=>before[field]!==undefined&&before[field]!==null&&String(before[field]).trim()!=='');
 const money=['procent','procent_shkala','vyplacheno'].some(field=>before[field]!==null&&before[field]!==undefined&&Number(before[field])!==0);
 const task=db.prepare('SELECT 1 FROM zadachi WHERE sotrudnichestvo_id=? LIMIT 1').get(before.id);
 const history=db.prepare("SELECT 1 FROM zhurnal WHERE obekt='sotrudnichestvo' AND obekt_id=? AND pole NOT IN ('sozdano','chelovek_id','napravlenie') AND NOT(pole='rol' AND COALESCE(bylo,'')='') LIMIT 1").get(before.id);
 if(populated||money||before.arhiv||task||history)throw new Konflikt('У сотрудничества есть работа или история. Создай новое для другого человека или направления.',{identity_change_blocked:true,polja:fields});
}
module.exports={proveritIzmenenie};
