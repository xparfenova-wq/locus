                                                                              
const {createHmac}=require('node:crypto');
const {baza,Konflikt,OshibkaVvoda,seichas}=require('../db/db.js');
const identity=require('./grafik-identity.js');
const time=['chasov','s_kakogo','do_kakogo','ne_rabotaju'],editable=[...time,'zametka'],scopeFields=['chelovek_id','god','nedelja','den'];
const utilities=()=>require('./komandy-grafika.js');
function weekRows(db,s){return db.prepare('SELECT * FROM grafik WHERE chelovek_id=? AND god=? AND nedelja=? ORDER BY den,id').all(s.chelovek_id,s.god,s.nedelja);}
function heads(db,id,fields){return identity.hash(fields.map(pole=>[pole,db.prepare("SELECT versija,kto,kogda FROM versii_polej WHERE tablica='grafik' AND obekt_id=? AND pole=?").get(id,pole)??null]));}
function find(db,s,actor,value){const row=db.prepare('SELECT * FROM dejstvija_grafika WHERE avtor=? AND kljuch_hesh=?').get(actor,utilities().key(value));if(row&&scopeFields.slice(0,3).some(k=>row[k]!==s[k]))throw new Konflikt('Ключ относится к другому графику',{operation_key_reused:true});return row;}
function undone(db,row){return !!db.prepare("SELECT 1 FROM dejstvija_grafika WHERE avtor=? AND roditel_kljuch_hesh=? AND dejstvie='otmenit' AND sohraneno=1").get(row.avtor,row.kljuch_hesh);}
function record(db,s,actor,value,kind,before){
 const prior=new Map(before.map(row=>[row.id,row])),after=weekRows(db,s),result=[];
 if(before.some(row=>!after.some(r=>r.id===row.id)))throw Error('Saving a schedule unexpectedly removed an existing day');
 for(const row of after){
  const old=prior.get(row.id),base={id:row.id,den:row.den,identichnost:identity.row(db,row).identichnost};
  if(!old){result.push({...base,created:true,after_hash:identity.hash(row)});continue;}
  let mask=editable.filter(k=>old[k]!==row[k]);if(!mask.length)continue;
  if(mask.some(k=>time.includes(k)))mask=[...new Set([...mask,...time])];
  const watch=[...new Set([...mask,...scopeFields,...([old.zametka,row.zametka].includes('ne_rabotaju')?time:[])])];
  result.push({...base,created:false,mask,watch,before:Object.fromEntries(mask.map(k=>[k,old[k]])),after:Object.fromEntries(watch.map(k=>[k,row[k]])),heads:heads(db,row.id,watch)});
 }
 const server=require('./versii.js').dejstvie(db);if(!server)throw Error('Schedule inverse requires a server command');
 db.prepare('INSERT INTO dejstvija_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,sohraneno,kontekst_vladelca,server_dejstvie,obratno_json,rezultat_json,sozdano)VALUES(?,?,?,?,?,?,1,?,?,?,?,?)').run(actor,utilities().key(value),s.chelovek_id,s.god,s.nedelja,kind,identity.owner(db,s.chelovek_id),server,JSON.stringify(result),JSON.stringify({izmeneno_dnej:result.length,zapros_kljuch:value.toLowerCase()}),seichas());
}
function availability(db,s,actor,value){const row=find(db,s,actor,value);if(!row||!row.sohraneno||row.dejstvie==='otmenit')return {};const reverted=undone(db,row);let allowed=!reverted&&(Number(s.chelovek_id)===Number(actor)||require('./prava-grafika.js').mozhet_chuzhoj(actor));if(allowed){try{validate(db,s,row);}catch(error){if(error.kod!==409)throw error;allowed=false;}}return {otmena_dostupna:allowed,vernuto:reverted};}
function lastFor(db,s,actor){
 if(Number(s.chelovek_id)!==Number(actor)&&!require('./prava-grafika.js').mozhet_chuzhoj(actor))return null;
 const row=db.prepare("SELECT * FROM dejstvija_grafika WHERE avtor=? AND chelovek_id=? AND god=? AND nedelja=? AND dejstvie IN('sohranit','kopirovat') AND sohraneno=1 ORDER BY rowid DESC LIMIT 1").get(actor,s.chelovek_id,s.god,s.nedelja);
 if(!row||undone(db,row))return null;const meta=JSON.parse(row.rezultat_json);if(!meta.zapros_kljuch||utilities().key(meta.zapros_kljuch)!==row.kljuch_hesh)throw new Konflikt('Не удалось подтвердить последнее действие графика');
 return {obekt:'grafik',avtor_id:actor,...s,zapros_kljuch:meta.zapros_kljuch,dejstvie:row.dejstvie,izmeneno_dnej:meta.izmeneno_dnej,otmena_dostupna:availability(db,s,actor,meta.zapros_kljuch).otmena_dostupna};
}
function proof(db,s,actor,value){const row=find(db,s,actor,value),out={obekt:'grafik',avtor_id:actor,...s,zapros_kljuch:value.toLowerCase(),dejstvie:'otmenit'};if(row&&row.dejstvie!=='otmenit')throw new Konflikt('Этот ключ относится к сохранению графика');return !row?{...out,sostojanie:'ne_najdeno'}:!row.sohraneno?{...out,sostojanie:'otmeneno'}:{...out,sostojanie:'sohraneno',...JSON.parse(row.rezultat_json)};}
function validate(db,s,original){
 if(original.kontekst_vladelca!==identity.owner(db,s.chelovek_id))throw new Konflikt('Исходную карточку человека заменили. Отмена не изменит другой график');
 const plan=JSON.parse(original.obratno_json);if(!Array.isArray(plan)||!plan.length)throw new Konflikt('В этом действии не было изменений графика');
 for(const item of plan){
  const row=db.prepare('SELECT * FROM grafik WHERE id=?').get(item.id);
  if(!row||scopeFields.slice(0,3).some(k=>row[k]!==s[k])||row.den!==item.den||identity.row(db,row).identichnost!==item.identichnost)throw new Konflikt('Один из дней удалили, заменили или перенесли. График не изменён',{den:item.den});
  if(item.created){if(identity.hash(row)!==item.after_hash)throw new Konflikt('Созданный день уже изменили. Отмена не затрёт эту правку',{den:item.den});}
  else if(item.watch.some(k=>row[k]!==item.after[k])||heads(db,row.id,item.watch)!==item.heads)throw new Konflikt('Одно из связанных полей уже изменили. Вся отмена остановлена',{den:item.den});
 }
 return plan;
}
function undo(ctx){
 const u=utilities(),db=baza(),body=ctx.telo||{};if(ctx.metod!=='POST')throw Object.assign(Error('Нужен POST'),{kod:405});if(ctx.kljuch||Object.keys(ctx.zapros||{}).length)throw new OshibkaVvoda('Параметры отмены передаются в теле');
 u.fields(body,['chelovek_id','nedelja','zapros_kljuch','ishodnyj_kljuch']);const s=u.scope(body,ctx.avtor),value=body.zapros_kljuch;u.key(value);u.key(body.ishodnyj_kljuch);
 const {zapros_kljuch,...data}=body,signature=createHmac('sha256',value.toLowerCase()).update(JSON.stringify(identity.stable({s,kind:'otmenit',data}))).digest('hex'),old=find(db,s,ctx.avtor,value);
 if(old){if(!old.sohraneno)throw new Konflikt('Эта попытка отмены остановлена',{operation_cancelled:true});if(old.dejstvie!=='otmenit'||old.zapros_hesh!==signature)throw new Konflikt('Под этим ключом другое действие',{operation_key_reused:true});return {telo:{...proof(db,s,ctx.avtor,value),povtor_dejstvija:true}};}
 if(db.prepare('SELECT 1 FROM zaprosy_grafika WHERE avtor=? AND kljuch_hesh=?').get(ctx.avtor,u.key(value)))throw new Konflikt('Ключ уже принадлежит сохранению графика',{operation_key_reused:true});
 u.rights(db,s,ctx.avtor);const original=find(db,s,ctx.avtor,body.ishodnyj_kljuch);
 if(!original?.sohraneno||original.dejstvie==='otmenit')throw new Konflikt('Для этой старой операции нет сохранённой целостной отмены');
 if(undone(db,original))throw new Konflikt('Это действие уже отменено');const plan=validate(db,s,original),common=require('./obschij.js');
 for(const item of plan){
  if(item.created){const before=db.prepare('SELECT * FROM grafik WHERE id=?').get(item.id);common.v_zhurnal(db,'grafik',item.id,'udaleno','0','1',ctx.avtor,before);db.prepare('DELETE FROM grafik WHERE id=?').run(item.id);continue;}
  const before=db.prepare('SELECT * FROM grafik WHERE id=?').get(item.id);
                                                                              
                                                                            
  if(!item.mask.every(k=>editable.includes(k)))throw Error('Unexpected schedule inverse field');
  db.prepare('UPDATE grafik SET '+item.mask.map(k=>'"'+k+'"=?').join(',')+' WHERE id=?').run(...item.mask.map(k=>item.before[k]),item.id);
  for(const k of item.mask)common.v_zhurnal(db,'grafik',item.id,k,String(before[k]??''),String(item.before[k]??''),ctx.avtor,before);
  require('./versii.js').zapomnit(db,'grafik',item.id,before.versija,ctx.avtor);
 }
 const metadata={vernuto_dnej:plan.length,ishodnyj_kljuch:body.ishodnyj_kljuch.toLowerCase(),ishodnoe_dejstvie:original.dejstvie};
 db.prepare('INSERT INTO dejstvija_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,roditel_kljuch_hesh,zapros_hesh,sohraneno,server_dejstvie,rezultat_json,sozdano)VALUES(?,?,?,?,?,\'otmenit\',?,?,1,?,?,?)').run(ctx.avtor,u.key(value),s.chelovek_id,s.god,s.nedelja,u.key(body.ishodnyj_kljuch),signature,require('./versii.js').dejstvie(db),JSON.stringify(metadata),seichas());return {telo:proof(db,s,ctx.avtor,value)};
}
function handle(ctx){
 const u=utilities(),db=baza();if(ctx.kljuch)throw new OshibkaVvoda('У графика нет номера отмены');
 if(ctx.dejstvie==='poslednee_dejstvie'){if(ctx.metod!=='GET')throw Object.assign(Error('Нужен GET'),{kod:405});u.fields(ctx.zapros,['chelovek_id','nedelja']);const s=u.scope(ctx.zapros,ctx.avtor);u.rights(db,s,ctx.avtor);return {telo:{obekt:'grafik',avtor_id:ctx.avtor,...s,poslednee:lastFor(db,s,ctx.avtor)}};}
 if(ctx.dejstvie==='otmena_proverka'){
  if(ctx.metod!=='GET')throw Object.assign(Error('Нужен GET'),{kod:405});u.fields(ctx.zapros,['chelovek_id','nedelja','zapros_kljuch']);const s=u.scope(ctx.zapros,ctx.avtor);return {telo:proof(db,s,ctx.avtor,ctx.zapros.zapros_kljuch)};
 }
 if(ctx.dejstvie==='otmena_popytki'){
  if(ctx.metod!=='POST')throw Object.assign(Error('Нужен POST'),{kod:405});if(Object.keys(ctx.zapros||{}).length)throw new OshibkaVvoda('Параметры отмены передаются в теле');u.fields(ctx.telo,['chelovek_id','nedelja','zapros_kljuch','dejstvie']);if(ctx.telo.dejstvie!=='otmenit')throw new OshibkaVvoda('Нужна попытка отмены');const s=u.scope(ctx.telo,ctx.avtor),value=ctx.telo.zapros_kljuch,old=find(db,s,ctx.avtor,value);if(!old&&db.prepare('SELECT 1 FROM zaprosy_grafika WHERE avtor=? AND kljuch_hesh=?').get(ctx.avtor,u.key(value)))throw new Konflikt('Ключ уже принадлежит сохранению графика',{operation_key_reused:true});if(old&&old.dejstvie!=='otmenit')throw new Konflikt('Ключ относится к сохранению графика');if(!old)db.prepare('INSERT INTO dejstvija_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,sozdano)VALUES(?,?,?,?,?,\'otmenit\',?)').run(ctx.avtor,u.key(value),s.chelovek_id,s.god,s.nedelja,seichas());return {telo:proof(db,s,ctx.avtor,value)};
 }
 return undo(ctx);
}
function protectedCommand(db,actor,server){return !!server&&!!db.prepare('SELECT 1 FROM dejstvija_grafika WHERE avtor=? AND server_dejstvie=? AND sohraneno=1').get(actor,server);}
module.exports={weekRows,record,availability,lastFor,handle,protectedCommand};
