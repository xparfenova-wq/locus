                                                                                
function vidit(db,actor){
 return Number.isSafeInteger(actor)&&actor>0&&db.prepare('SELECT dostup FROM ljudi WHERE id=?').get(actor)?.dostup==='polnyj';
}
module.exports={vidit};
