const {baza,segodnja,OshibkaVvoda,NeNajdeno}=require('../db/db.js');
function summary(ctx){
 if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});
 if(Object.keys(ctx.zapros||{}).length)throw new OshibkaVvoda('Параметры статистики не нужны','zapros');
 const id=Number(ctx.kljuch);if(!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('Проект не найден','proekt_id');
 const db=baza();db.exec('SAVEPOINT project_statistics');
 try{
  if(!db.prepare('SELECT id FROM proekty WHERE id=?').get(id))throw new NeNajdeno();
  const day=segodnja(),accounts=db.prepare('SELECT id FROM akkaunty WHERE proekt_id=? AND COALESCE(udalen,0)=0 ORDER BY id').all(id),metrics=accounts.map(row=>require('./metriki-akkaunta.js').vse(db,row.id,day).metriki);
  const aggregate=field=>{
   const rows=metrics.map(row=>row[field]).filter(row=>typeof row.znachenie==='number'&&Number.isFinite(row.znachenie)),dates=rows.map(row=>row.obnovleno).filter(Boolean).sort(),starts=rows.map(row=>row.ot).filter(Boolean).sort();
   return {znachenie:rows.length?rows.reduce((sum,row)=>sum+row.znachenie,0):null,akkauntov:rows.length,obnovleno_ot:dates[0]||null,obnovleno_do:dates.at(-1)||null,...(field==='prirost_podpischikov'?{period_s:starts[0]||null,period_po:dates.at(-1)||null,raznye_periody:new Set(rows.map(row=>row.ot+':'+row.obnovleno)).size>1}:{})};
  };
  const result={proekt_id:id,den:day,akkauntov:accounts.length,podpischikov:aggregate('podpischikov'),za_nedelju:aggregate('prirost_podpischikov')};db.exec('RELEASE project_statistics');return {telo:result};
 }catch(error){db.exec('ROLLBACK TO project_statistics');db.exec('RELEASE project_statistics');throw error;}
}
module.exports={summary};
