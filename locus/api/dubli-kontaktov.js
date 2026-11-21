const {OshibkaVvoda,Konflikt}=require('../db/db.js');
function proverit(db,contact,force,except=null){
 if(force!==undefined&&typeof force!=='boolean')throw new OshibkaVvoda('force: да или нет','force');
 const own=db.prepare('SELECT id FROM kontakty WHERE chelovek_id=? AND tip=? AND znachenie_norm=? AND (? IS NULL OR id<>?) ORDER BY id LIMIT 1')
  .get(contact.chelovek_id,contact.tip,contact.znachenie_norm,except,except);
 if(own){const error=new Konflikt(require('../public/js/validacija-kontakta.js').tekstDublya(contact.tip),{kod:'dubl_kontakta',id:own.id});error.pole='znachenie';throw error;}
 if(force===true)return;
 const rows=db.prepare(`SELECT DISTINCT l.id AS chelovek_id,l.imja,l.arhiv
  FROM kontakty k JOIN ljudi l ON l.id=k.chelovek_id
  WHERE k.tip=? AND k.znachenie_norm=? AND k.chelovek_id<>? AND (? IS NULL OR k.id<>?) ORDER BY l.id`)
  .all(contact.tip,contact.znachenie_norm,contact.chelovek_id,except,except);
 if(!rows.length)return;
 const error=new Error('Такой контакт уже есть у '+rows.map(row=>row.imja).join(', '));error.kod=409;error.pole='znachenie';
 error.dannye={dubl_chego:rows[0].chelovek_id,dubli:rows.map(row=>({...row,arhiv:Boolean(row.arhiv)}))};throw error;
}
module.exports={proverit};
