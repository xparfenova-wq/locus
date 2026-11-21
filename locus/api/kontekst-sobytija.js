const id=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
function osnovnoj(db,table,row,key,actor){
 const context={versija:id(row?.versija)};if(!row)return context;
 if(typeof row.napravlenie==='string')context.napravlenie=row.napravlenie;
 if(table==='napravlenija')context.napravlenie=row.kod??key;
 if(table==='ljudi')context.chelovek_id=id(row.id??key);
 if(table==='sotrudnichestva')Object.assign(context,{chelovek_id:id(row.chelovek_id),sotrudnichestvo_id:id(row.id??key),rol:row.rol});
 if(table==='zadachi'){
  context.status_zadachi=row.status??null;context.udaleno_zadachi=row.udaleno?1:0;
  context.zadacha_id=id(row.id??key);context.roditel_id=id(row.roditel_id);context.rezultat_id=id(row.rezultat_id);context.cel_id=id(row.cel_id);
  if(!context.cel_id&&context.rezultat_id)context.cel_id=id(db.prepare('SELECT cel_id FROM rezultaty WHERE id=?').get(context.rezultat_id)?.cel_id);
  context.chelovek_id=id(row.klient_id);context.nazvanie=row.nazvanie;context.nomer=id(row.nomer);
  if(require('./dengi-zadach.js').isMoney(db,row))context.denezhnaja_zadacha=true;
  if(row.platezh_id)context.platezh_id=id(row.platezh_id);
  if(row.sotrudnichestvo_id){
   const role=db.prepare('SELECT id,chelovek_id,napravlenie,rol FROM sotrudnichestva WHERE id=?').get(row.sotrudnichestvo_id);
   if(role&&(!context.chelovek_id||role.chelovek_id===context.chelovek_id)&&role.napravlenie===row.napravlenie){
    context.sotrudnichestvo_id=role.id;context.rol=role.rol;if(!context.chelovek_id){context.chelovek_id=role.chelovek_id;context.chelovek_po_sotrudnichestvu=true;}
   }else{context.svjaz_ne_podtverzhdena=true;context.nepodtverzhdennoe_sotrudnichestvo_id=id(row.sotrudnichestvo_id);}
  }
  if(row.proekt_id)context.proekt_id=id(row.proekt_id);
 }
 if(table==='proekty'){
  context.chelovek_id=id(row.klient_id);context.proekt_id=id(row.id??key);context.nazvanie=row.nazvanie;
  if(context.chelovek_id&&context.napravlenie){const role=db.prepare("SELECT id,rol FROM sotrudnichestva WHERE chelovek_id=? AND napravlenie=? AND rol='klient'").get(context.chelovek_id,context.napravlenie);if(role){context.sotrudnichestvo_id=role.id;context.rol=role.rol;}}
 }
 if(table==='kontakty'){context.chelovek_id=id(row.chelovek_id);context.tip_kontakta=row.tip;}
 if(table==='celi'){context.cel_id=id(row.id??key);context.nazvanie=row.nazvanie;}
 if(table==='rezultaty'){context.tip_rezultata=row.tip??'chislo';context.zakryta=row.zakryta?1:0;if(require('./dengi-okr.js').isMoney(db,row))context.denezhnaja_istorija_okr=true;context.cel_id=id(row.cel_id);context.rezultat_id=id(row.id??key);context.nazvanie=row.nazvanie;}
 if(table==='zamery'){if(require('./dengi-okr.js').isMoney(db,Number(row.rezultat_id)))context.denezhnaja_istorija_okr=true;context.rezultat_id=id(row.rezultat_id);context.cel_id=id(db.prepare('SELECT cel_id FROM rezultaty WHERE id=?').get(row.rezultat_id)?.cel_id);}
 if(table==='platezhi'){context.proekt_id=id(row.proekt_id);}
 if(['materialy','dokumenty'].includes(table)){
  context.proekt_id=id(row.proekt_id);context.zadacha_id=id(row.zadacha_id);context.nazvanie=row.nazvanie;
  if(context.zadacha_id){const task=db.prepare('SELECT proekt_id,cel_id,roditel_id FROM zadachi WHERE id=?').get(context.zadacha_id);if(task){context.proekt_id||=id(task.proekt_id);context.cel_id=id(task.cel_id);context.roditel_id=id(task.roditel_id);}}
 }
 if(context.cel_id){
  const goal=table==='celi'?row:db.prepare('SELECT sostojanie FROM celi WHERE id=?').get(context.cel_id);
  if(goal){context.cel_sostojanie=goal.sostojanie;context.cel_avtor=db.prepare("SELECT kto FROM zhurnal WHERE obekt='cel' AND obekt_id=? AND pole='sozdano' ORDER BY id LIMIT 1").get(context.cel_id)?.kto??(table==='celi'?actor:null);}
 }
 return Object.fromEntries(Object.entries(context).filter(([,value])=>value!==undefined));
}
function snimok(db,table,key,pole,bylo,stalo,before,actor){
 const {TABLICY}=require('../db/versii.js'),primary=TABLICY[table]||(table==='zamery'?'id':null);
 const current=primary?db.prepare('SELECT * FROM "'+table+'" WHERE "'+primary+'"=?').get(key):null;
 const context=osnovnoj(db,table,current||before,key,actor);
 const action=require('./versii.js').dejstvie(db);if(action)context.dejstvie_id=action;
 if(before){
  if(pole==='arhiv')context.arhiv_do=Object.fromEntries(['arhiv','arhiv_s','vozvrat_s'].filter(field=>Object.hasOwn(before,field)).map(field=>[field,before[field]]));
  const previous=osnovnoj(db,table,before,key,actor);if(previous.denezhnaja_istorija_okr)context.denezhnaja_istorija_okr=true;const fields=['chelovek_id','sotrudnichestvo_id','napravlenie','rol','proekt_id','cel_id','rezultat_id','roditel_id','zadacha_id'];
  if(fields.some(field=>(previous[field]??null)!==(context[field]??null)))context.do=previous;
 }
 if(context.do?.chelovek_id&&context.do.chelovek_id!==context.chelovek_id)context.chelovek_id_do=context.do.chelovek_id;
 if(!context.chelovek_id_do&&((table==='sotrudnichestva'&&pole==='chelovek_id')||(['zadachi','proekty'].includes(table)&&pole==='klient_id'))&&id(bylo)!==id(stalo)&&id(bylo))context.chelovek_id_do=id(bylo);
 if(table==='sotrudnichestva'&&pole==='kasanie'){
  const parsed=/^(.*) \((ruchnaja|bot)\)$/.exec(String(stalo));if(parsed)context.obschenie={kogda:parsed[1],istochnik:parsed[2]};
 }
 if(table==='sotrudnichestva'&&pole==='poslednee_obshenie')context.obschenie={kogda:stalo||null,istochnik:'ruchnaja'};
 return context;
}
module.exports={snimok};
