const fields=new Set(['procent','procent_shkala','nalog','dogovor_nomer','dogovor_id','vyplacheno']);
const positive=n=>Number.isSafeInteger(n)&&n>0;
const uuid=n=>typeof n==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(n);
function context(row){try{return JSON.parse(row.srez)||{};}catch{return {};}}
function status(db,receipt){
 const missing={dejstvie_id:null,otmena_dostupna:false,otmenena_posle_sohranenija:false,chastichno_otmeneno:false,istorija_nepolnaja:true};
 let meta;try{meta=JSON.parse(receipt.itog_json);}catch{return missing;}
 if(!meta||!Array.isArray(meta.zhurnal_ids)||!meta.zhurnal_ids.every(positive)||new Set(meta.zhurnal_ids).size!==meta.zhurnal_ids.length)return missing;
 if(!meta.zhurnal_ids.length)return meta.dejstvie_id===null?{...missing,istorija_nepolnaja:false,bez_izmenenij:true}:missing;
 if(!uuid(meta.dejstvie_id))return missing;
 const roots=meta.zhurnal_ids.map(id=>db.prepare('SELECT * FROM zhurnal WHERE id=?').get(id));
 if(roots.some(row=>!row||row.obekt!=='sotrudnichestvo'||row.obekt_id!==receipt.sotrudnichestvo_id||row.kto!==receipt.avtor||!fields.has(row.pole)||context(row).versija!==receipt.versija_posle||context(row).dejstvie_id!==meta.dejstvie_id))return missing;
 const rootOf=new Map(roots.map(row=>[row.id,row.id])),active=new Map(roots.map(row=>[row.id,true]));
 for(const row of db.prepare("SELECT * FROM zhurnal WHERE obekt='sotrudnichestvo' AND obekt_id=? AND id>? ORDER BY id").all(receipt.sotrudnichestvo_id,Math.min(...meta.zhurnal_ids))){
  const back=context(row).obratno_k_uslovijam;if(!positive(back)||!rootOf.has(back))continue;
  const root=rootOf.get(back);if(row.pole!==roots.find(r=>r.id===root).pole)continue;
  rootOf.set(row.id,root);active.set(root,!active.get(root));
 }
 const cancelled=[...active.values()].filter(value=>!value).length,current=db.prepare('SELECT * FROM sotrudnichestva WHERE id=?').get(receipt.sotrudnichestvo_id);
 let available=cancelled===0&&!!current;
 if(available)try{
  const patch={};
  for(const row of roots){
   require('./otmena-versii.js').proverit(db,'sotrudnichestva',current,row);
   let prior=require('./otmena-versii.js').znachenie(row.pole,row.bylo);
   if(prior!==null&&['procent','vyplacheno','dogovor_id'].includes(row.pole)){prior=Number(prior);if(!Number.isFinite(prior))throw new Error('Unrestorable numeric condition');}
   if(row.pole==='nalog'&&prior!==null&&!['do_vycheta','posle_vycheta'].includes(prior))throw new Error('Unrestorable legacy tax');
   if(row.pole==='dogovor_nomer'&&prior!==null&&[...String(prior)].length>100)throw new Error('Unrestorable legacy document number');
   patch[row.pole]=prior;
  }
  require('./referral-terms-input.js').validate(db,patch,current);
 }catch{available=false;}
 return {dejstvie_id:meta.dejstvie_id,otmena_dostupna:available,otmenena_posle_sohranenija:cancelled===roots.length,chastichno_otmeneno:cancelled>0&&cancelled<roots.length,istorija_nepolnaja:false};
}
function markUndo(db,plan,head){
 if(plan.tablica!=='sotrudnichestva'||!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_uslovij_referalov'").get())return;
 for(const original of plan.zapisi){
  const c=context(original),belongs=positive(c.obratno_k_uslovijam)||db.prepare(`SELECT 1 FROM zaprosy_uslovij_referalov r,json_each(r.itog_json,'$.zhurnal_ids') j
   WHERE r.sohraneno=1 AND r.sotrudnichestvo_id=? AND r.avtor=? AND j.value=? LIMIT 1`).get(original.obekt_id,original.kto,original.id);
  if(!belongs)continue;
  const inverse=db.prepare("SELECT * FROM zhurnal WHERE id>? AND obekt='sotrudnichestvo' AND obekt_id=? AND pole=? ORDER BY id DESC LIMIT 1").get(head,original.obekt_id,original.pole);
  if(!inverse)throw new Error('Terms undo journal entry missing');
  db.prepare('UPDATE zhurnal SET srez=? WHERE id=?').run(JSON.stringify({...context(inverse),obratno_k_uslovijam:original.id}),inverse.id);
 }
}
function assertComplete(db,events){
 if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_uslovij_referalov'").get())return;
 const checked=new Set();
 for(const event of events){
  if(event.obekt!=='sotrudnichestvo')continue;
  let id=event.id,row=event;const seen=new Set();
  while(positive(id)&&!seen.has(id)){
   seen.add(id);
   const receipt=db.prepare(`SELECT r.* FROM zaprosy_uslovij_referalov r,json_each(r.itog_json,'$.zhurnal_ids') j
    WHERE r.sohraneno=1 AND r.sotrudnichestvo_id=? AND j.value=? LIMIT 1`).get(event.obekt_id,id);
   if(receipt){const key=receipt.avtor+':'+receipt.kljuch_hesh;if(!checked.has(key)&&status(db,receipt).istorija_nepolnaja)throw new(require('../db/db.js').Konflikt)('История условий неполная. Отмена не применена',{istorija_nepolnaja:true});checked.add(key);break;}
   row=row?.id===id?row:db.prepare('SELECT * FROM zhurnal WHERE id=?').get(id);
   const back=row&&context(row).obratno_k_uslovijam;if(!positive(back))break;
   if(back>=id)throw new(require('../db/db.js').Konflikt)('Связь отмены условий не подтверждена',{istorija_nepolnaja:true});
   id=back;
  }
 }
}
module.exports={status,markUndo,assertComplete};
