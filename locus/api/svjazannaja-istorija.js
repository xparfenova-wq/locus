function sozdat(db,object,id,head){
 const map=(table,columns)=>new Map(db.prepare('SELECT '+columns+' FROM '+table).all().map(row=>[row.id,row]));
 const tasks=map('zadachi','id,nomer,nazvanie,proekt_id,cel_id,rezultat_id,roditel_id'),results=map('rezultaty','id,cel_id,nazvanie'),measurements=map('zamery','id,rezultat_id'),payments=map('platezhi','id,proekt_id'),materials=map('materialy','id,nazvanie,proekt_id,zadacha_id'),documents=map('dokumenty','id,nazvanie,proekt_id');
 const caches={zadacha:tasks,rezultat:results,zamer:measurements,platezh:payments,material:materials,dokument:documents};
 const parse=value=>{try{return JSON.parse(value)||{};}catch{return {};}};
 function current(row){
  const record=caches[row.obekt]?.get(Number(row.obekt_id));if(!record)return {};
  if(row.obekt==='zamer')return {cel_id:results.get(record.rezultat_id)?.cel_id,rezultat_id:record.rezultat_id};
  if(row.obekt==='zadacha')return {...record,cel_id:record.cel_id||results.get(record.rezultat_id)?.cel_id};
  if(row.obekt==='material')return {...record,proekt_id:record.proekt_id||tasks.get(record.zadacha_id)?.proekt_id,cel_id:tasks.get(record.zadacha_id)?.cel_id,roditel_id:tasks.get(record.zadacha_id)?.roditel_id};
  return record;
 }
 function match(row){
  const snapshot=parse(row.srez),now=current(row),field={proekt:'proekt_id',cel:'cel_id',zadacha:'roditel_id'}[object];
  const own=row.obekt===object&&Number(row.obekt_id)===id;
  let reliable=own||Number(snapshot[field])===id||Number(snapshot.do?.[field])===id;
  if(object==='zadacha'&&Number(snapshot.zadacha_id)===id)reliable=true;
  if(row.obekt==='zadacha'&&row.pole===field&&(Number(row.bylo)===id||Number(row.stalo)===id))reliable=true;
  const legacy=!Object.hasOwn(snapshot,field)&&Number(now[field])===id;
  const taskMaterial=object==='zadacha'&&['material','dokument'].includes(row.obekt)&&Number(now.zadacha_id)===id&&!Object.hasOwn(snapshot,'zadacha_id');
  if(!reliable&&!legacy&&!taskMaterial)return null;
  const task=tasks.get(Number(row.obekt_id)),title=snapshot.nazvanie||now.nazvanie||null;
  return {kontekst_ne_podtverzhden:!reliable,predmet_nazvanie:title,predmet_nomer:row.obekt==='zadacha'?(snapshot.nomer||task?.nomer||null):null};
 }
 const state=[];
 for(const row of db.prepare('SELECT id,obekt,obekt_id,pole,bylo,stalo,srez FROM zhurnal WHERE id<=? ORDER BY id').iterate(head)){const linked=match(row);if(linked?.kontekst_ne_podtverzhden)state.push([row.id,linked,current(row)]);}
 return {match,otpechatok:require('node:crypto').createHash('sha256').update(JSON.stringify(state)).digest('hex')};
}
module.exports={sozdat};
