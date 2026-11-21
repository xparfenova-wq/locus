                                                                                           
const {baza,OshibkaVvoda,seichas}=require('../db/db.js');
function active(alias='bl'){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw new Error('Invalid internal base alias');return `NOT EXISTS(SELECT 1 FROM arhiv_strok_baz member_archive WHERE member_archive.stroka_id=${alias}.id AND member_archive.arhiv=1)`;}
function state(db,id){return db.prepare('SELECT * FROM arhiv_strok_baz WHERE stroka_id=?').get(id)||null;}
function archived(db,id){return state(db,id)?.arhiv??0;}
function handle(ctx){
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});const core=require('./bazy-pravki.js').importApi;
 return core.command(ctx,'sostojanie_stroki',(db,body)=>{
  core.fields(body,['stroka_id','arhiv','versii']);const base=core.row(db,'baza',ctx.kljuch),row=core.row(db,'stroka',body.stroka_id,base.id);
  if(![0,1].includes(body.arhiv))throw new OshibkaVvoda('Выбери исключение или возврат строки','arhiv');const before=core.present(db,'stroka',row);core.checkFields(db,'stroka',row,body.versii,Object.keys(before.versii));
  if(before.arhiv!==body.arhiv){db.prepare('INSERT INTO arhiv_strok_baz(stroka_id,arhiv,avtor,kogda)VALUES(?,?,?,?) ON CONFLICT(stroka_id)DO UPDATE SET arhiv=excluded.arhiv,avtor=excluded.avtor,kogda=excluded.kogda').run(row.id,body.arhiv,ctx.avtor,seichas());require('./obschij.js').v_zhurnal(db,'bazy_ljudi',row.id,'arhiv',before.arhiv,body.arhiv,ctx.avtor,before);if(body.arhiv===0)require('./kampanii.js').syncBasePerson(db,base.id,row.kto,ctx.avtor);}
  return {vid:'stroka',telo:core.present(db,'stroka',row),details:{stroka_id:row.id,baza_id:base.id,arhiv:body.arhiv}};
 });
}
module.exports={active,state,archived,handle};
