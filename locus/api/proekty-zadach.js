const {OshibkaVvoda}=require('../db/db.js');
function novajaSvjaz(db,change,before=null){
 if(before&&(!Object.hasOwn(change,'proekt_id')||Number(change.proekt_id)===Number(before.proekt_id)))return;
 if(change.proekt_id==null||change.proekt_id==='')return;
 const id=Number(change.proekt_id),row=Number.isSafeInteger(id)&&id>0?db.prepare('SELECT status,arhiv FROM proekty WHERE id=?').get(id):null;
 if(!row)throw new OshibkaVvoda('Проект не найден','proekt_id');
 if(row.arhiv)throw new OshibkaVvoda('Проект в архиве. Верни его из архива или выбери действующий проект.','proekt_id');
 if(row.status==='zavershen')throw new OshibkaVvoda('Проект завершён. Верни его в работу или выбери действующий проект.','proekt_id');
}
module.exports={novajaSvjaz};
