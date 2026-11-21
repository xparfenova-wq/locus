const {createHash}=require('node:crypto');
                                                                              
                                                                             
function kontekst(db,account){
 const created=db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='akkaunt' AND obekt_id=? AND pole='sozdano'").get(account.id)?.id??null;
 const fields=['id','ploshadka','ssylka','napravlenie','proekt_id','vladelec'];
 return createHash('sha256').update(JSON.stringify({created,...Object.fromEntries(fields.map(field=>[field,account[field]??null]))})).digest('hex');
}
module.exports={kontekst};
