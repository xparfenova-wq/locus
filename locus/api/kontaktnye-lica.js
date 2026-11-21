const {OshibkaVvoda}=require('../db/db.js');
const KONTAKTNOE_LICO='kontaktnoe_lico';
const OSHIBKA_RASSYLKI='контактные лица в рассылки не попадают';
function proverit_dlja_rassylki(db,id){
  const person=db.prepare('SELECT id,rol_v_baze FROM ljudi WHERE id=?').get(id);
  if(person?.rol_v_baze===KONTAKTNOE_LICO)throw new OshibkaVvoda(OSHIBKA_RASSYLKI,'chelovek_id');
}
function uslovie_spiska(query){
  if(query.rol_v_baze || ['1','true','da'].includes(String(query.vse_roli)))return null;
  return "rol_v_baze IS NOT 'kontaktnoe_lico'";
}
function proverit_svoe_sotrudnichestvo(db,id){
  if(db.prepare('SELECT rol_v_baze FROM ljudi WHERE id=?').get(id)?.rol_v_baze===KONTAKTNOE_LICO){
    throw new OshibkaVvoda('контактному лицу сначала нужен признак «собственный»','chelovek_id');
  }
}
function proverit_perevod_v_kontaktnoe(db,id){
  if(db.prepare('SELECT 1 FROM sotrudnichestva WHERE chelovek_id=? LIMIT 1').get(id)||db.prepare('SELECT 1 FROM rassylka_ljudi WHERE chelovek_id=? LIMIT 1').get(id)){
    throw new OshibkaVvoda('у человека есть свои сотрудничества или рассылки; он остаётся собственным контактом','rol_v_baze');
  }
}
module.exports={KONTAKTNOE_LICO,OSHIBKA_RASSYLKI,proverit_dlja_rassylki,uslovie_spiska,proverit_svoe_sotrudnichestvo,proverit_perevod_v_kontaktnoe};
