const {baza,OshibkaVvoda,NeNajdeno,Konflikt,seichas,v_api,v_odnoj_tranzakcii}=require('../db/db.js');
const payment=require('./platezhi.js'),history=require('./referral-payout-history.js');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function tasks(){return require('./referral-tasks.js');}
function cents(value){const parts=String(payment.summa(value)).split('.');return BigInt(parts[0])*100n+BigInt((parts[1]||'').padEnd(2,'0'));}
function money(value){return (value/100n).toString()+'.'+(value%100n).toString().padStart(2,'0');}
function allocations(db,id){return db.prepare('SELECT * FROM referalnye_svjazi_vyplat WHERE zadacha_id=? ORDER BY zhurnal_id').all(id);}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function scope(db,id,taskId){
 const task=db.prepare('SELECT * FROM zadachi WHERE id=?').get(tasks().id(taskId,'zadacha_id'));
 if(!task)throw new NeNajdeno('Задачи нет');
 const context=tasks().linked(db,task);
 if(!context||context.vid!=='vyplata'||context.sotrudnichestvo_id!==id)throw new Konflikt('Задача не относится к этой выплате');
 return {task,context,cooperation:tasks().validateContext(db,task,context)};
}
function source(db,cooperation,id,action){
 const row=db.prepare("SELECT * FROM zhurnal WHERE id=? AND obekt='sotrudnichestvo' AND obekt_id=? AND pole='vyplacheno'").get(id,cooperation.id);
 const fact=row&&history.fact(row),context=row&&history.context(row);
 const created=db.prepare("SELECT COALESCE(max(id),0) id FROM zhurnal WHERE obekt='sotrudnichestvo' AND obekt_id=? AND pole='sozdano'").get(cooperation.id).id;
 if(!fact||!uuid(context.dejstvie_id)||action!==undefined&&context.dejstvie_id!==action||row.id<created||context.chelovek_id!==cooperation.chelovek_id||context.napravlenie!==cooperation.napravlenie||history.undone(db,cooperation.id,row.id))throw new Konflikt('Исходная выплата больше не подтверждена. Обнови историю');
 return {row,fact,context};
}
function used(db,event,exceptTask){
 let total=0n;
 for(const row of db.prepare('SELECT * FROM referalnye_svjazi_vyplat WHERE zhurnal_id=?').all(event.id)){
  if(row.dejstvie_id!==history.context(event).dejstvie_id)throw new Konflikt('История связанной выплаты изменилась. Проверь журнал');
  if(row.zadacha_id!==exceptTask)total+=BigInt(row.summa_kopeek);
 }
 for(const row of db.prepare("SELECT zadacha_id,summa FROM referalnye_zadachi WHERE vid='vyplata' AND vyplata_zhurnal_id=?").all(event.id))if(row.zadacha_id!==exceptTask)total+=cents(row.summa);
 return total;
}
function validateAllocations(db,current,rows){
 const seen=new Set();let total=0n;
 for(const row of rows){
  if(!uuid(row.dejstvie_id)||row.zadacha_id!==current.task.id||seen.has(row.zhurnal_id)||!Number.isSafeInteger(row.summa_kopeek)||row.summa_kopeek<=0||typeof row.sozdano!=='string')throw new Konflikt('Не подтверждены части связанной выплаты');
  seen.add(row.zhurnal_id);const fact=source(db,current.cooperation,row.zhurnal_id,row.dejstvie_id),amount=BigInt(row.summa_kopeek);
  if(used(db,fact.row,current.task.id)+amount>cents(fact.fact.summa))throw new Konflikt('Эта часть выплаты уже связана с другой задачей. Обнови историю');
  total+=amount;
 }
 if(rows.length&&total!==cents(current.context.summa))throw new Konflikt('Сумма выбранных частей должна совпадать с суммой задачи');
}
function active(db,context){
 const rows=allocations(db,context.zadacha_id);if(!rows.length)return false;
 const current=scope(db,context.sotrudnichestvo_id,context.zadacha_id);validateAllocations(db,current,rows);return true;
}
function writeAllocations(db,id,rows){
 db.prepare('DELETE FROM referalnye_svjazi_vyplat WHERE zadacha_id=?').run(id);
 const insert=db.prepare('INSERT INTO referalnye_svjazi_vyplat(zadacha_id,zhurnal_id,dejstvie_id,summa_kopeek,sozdano)VALUES(?,?,?,?,?)');
 for(const r of rows)insert.run(r.zadacha_id,r.zhurnal_id,r.dejstvie_id,r.summa_kopeek,r.sozdano);
}
function group(db,event){return db.prepare("SELECT * FROM zhurnal WHERE json_extract(srez,'$.dejstvie_id')=? ORDER BY id").all(history.context(event).dejstvie_id);}
function anchor(db,event){
 const marker=history.context(event).svjaz_vyplaty_operacija;if(marker===undefined)return null;
 const root=db.prepare('SELECT * FROM zhurnal WHERE id=?').get(marker);
 if(!root||!history.context(root).svjaz_vyplat||history.context(root).dejstvie_id!==history.context(event).dejstvie_id)throw new Konflikt('История связи выплаты неполная. Отмена не применена',{istorija_nepolnaja:true});
 return root;
}
function seal(db,event,meta){
 const rows=group(db,event);for(const row of rows)db.prepare('UPDATE zhurnal SET srez=? WHERE id=?').run(JSON.stringify({...history.context(row),svjaz_vyplaty_operacija:event.id,...(row.id===event.id?{svjaz_vyplat:meta,svjaz_sobytija:rows.map(r=>r.id)}:{})}),row.id);
}
function assertComplete(db,events,actor){
 const selected=new Set(events.map(r=>r.id)),checked=new Set();
 for(const event of events){if(actor!==undefined&&history.context(event).svjaz_vyplaty_operacija!==undefined)tasks().rights(db,actor);const root=anchor(db,event);if(!root||checked.has(root.id))continue;checked.add(root.id);
  if(actor!==undefined)tasks().rights(db,actor);
  const c=history.context(root),meta=c.svjaz_vyplat,rows=group(db,root),ids=c.svjaz_sobytija;
  if(!Array.isArray(meta.before)||!Array.isArray(meta.after)||!Array.isArray(ids)||!ids.length||selected.size!==ids.length||new Set(ids).size!==ids.length||ids.some(id=>!selected.has(id))||rows.length!==ids.length||rows.some(r=>!ids.includes(r.id))||root.obekt!=='zadacha'||root.obekt_id!==meta.zadacha_id||root.pole!=='status')throw new Konflikt('Связь выплаты и закрытие задачи отменяются целиком. Проверь журнал',{istorija_nepolnaja:true});
  const current=scope(db,meta.sotrudnichestvo_id,meta.zadacha_id);
  if(current.task.nomer!==meta.nomer||!same(allocations(db,current.task.id),meta.after))throw new Konflikt('Связь выплаты уже изменилась. Отмена не применена');
  validateAllocations(db,current,meta.after);validateAllocations(db,current,meta.before);
 }
}
function afterUndo(db,events,head){
 const root=events.map(r=>anchor(db,r)).find(Boolean);if(!root)return;
 const m=history.context(root).svjaz_vyplat;
 const inverse=db.prepare("SELECT * FROM zhurnal WHERE id>? AND obekt='zadacha' AND obekt_id=? AND pole='status' ORDER BY id DESC LIMIT 1").get(head,m.zadacha_id);
 if(!inverse)throw new Error('Payout link inverse missing');
 writeAllocations(db,m.zadacha_id,m.before);seal(db,inverse,{...m,before:m.after,after:m.before,obratno_k_svjazi:root.id});
}
function isLinkedUndo(db,events){return events.some(r=>!!anchor(db,r));}
function payoutRoot(db,event){
 const seen=new Set();let row=event;
 while(row){if(seen.has(row.id))throw new Konflikt('История выплаты неполная');seen.add(row.id);const c=history.context(row);
  if(history.fact(row))return row;
  if(!Number.isSafeInteger(c.obratno_k_vyplate))return null;
  row=db.prepare("SELECT * FROM zhurnal WHERE id=? AND obekt='sotrudnichestvo' AND obekt_id=? AND pole='vyplacheno'").get(c.obratno_k_vyplate,event.obekt_id);
  if(!row)throw new Konflikt('История выплаты неполная');
 }return null;
}
function assertPayoutUnlinked(db,events){
 for(const event of events){if(event.obekt!=='sotrudnichestvo'||event.pole!=='vyplacheno')continue;const root=payoutRoot(db,event);if(root&&db.prepare('SELECT 1 FROM referalnye_svjazi_vyplat WHERE zhurnal_id=? LIMIT 1').get(root.id))throw new Konflikt('Выплата связана с задачей. Сначала сними связь с задачей, затем отменяй выплату');}
}
function canUndo(db,event,actor){try{const rows=group(db,event);assertComplete(db,rows,actor);for(const row of rows){const table=require('./obschij.js').TABLICA_OBEKTA[row.obekt],target=table&&db.prepare('SELECT * FROM '+table+' WHERE id=?').get(row.obekt_id);if(!target)return false;require('./otmena-versii.js').proverit(db,table,target,row);}return true;}catch{return false;}}
function undone(db,event){
 const roots=new Map(),states=new Map();
 for(const row of db.prepare("SELECT * FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='status' ORDER BY id").all(event.obekt_id)){
  const m=history.context(row).svjaz_vyplat;if(!m)continue;
  if(Number.isSafeInteger(m.obratno_k_svjazi)&&roots.has(m.obratno_k_svjazi)){const root=roots.get(m.obratno_k_svjazi);roots.set(row.id,root);states.set(root,!states.get(root));}else{roots.set(row.id,row.id);states.set(row.id,true);}
 }return states.get(event.id)===false;
}
function checkResult(db,r){
 const meta=JSON.parse(r.itog_json),saved=meta.zadachi[0],event=db.prepare('SELECT * FROM zhurnal WHERE id=?').get(saved.zhurnal_id),task=db.prepare('SELECT * FROM zadachi WHERE id=? AND nomer=?').get(saved.id,saved.nomer),c=event&&history.context(event),removed=!!r.udaleno||!task||!c?.svjaz_vyplat||event.obekt!=='zadacha'||event.obekt_id!==saved.id||event.pole!=='status'||c.svjaz_vyplat.nomer!==saved.nomer||c.svjaz_vyplat.zadacha_id!==saved.id||c.svjaz_vyplat.sotrudnichestvo_id!==r.sotrudnichestvo_id||c.dejstvie_id!==meta.dejstvie_id||!tasks().linked(db,task)||!!tasks().linked(db,task).udaleno;
 return {sostojanie:'sohraneno',vid:'svjaz_vyplaty',sotrudnichestvo_id:r.sotrudnichestvo_id,zadacha:{id:saved.id,nomer:saved.nomer},dejstvie_id:meta.dejstvie_id,udaleno:removed,dejstvie_otmeneno:!removed&&undone(db,event),svjaz_otmenena:!removed&&!same(allocations(db,task.id),c.svjaz_vyplat.after),otmena_dostupna:!removed&&canUndo(db,event,r.avtor)};
}
function proposal(ctx){
 if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});const db=baza();tasks().rights(db,ctx.avtor);tasks().fields(ctx.zapros,['zadacha_id']);const id=tasks().id(ctx.kljuch),current=scope(db,id,ctx.zapros.zadacha_id),assigned=allocations(db,current.task.id),facts=[];
 for(const event of history.rows(db,id)){
  if(!history.fact(event))continue;let s;try{s=source(db,current.cooperation,event.id);}catch(e){if(e.kod===409)continue;throw e;}
  const taken=used(db,event,current.task.id),available=cents(s.fact.summa)-taken;if(available<0n)throw new Konflikt('В истории выплаты превышена сумма распределений. Проверь журнал');
  facts.push({zhurnal_id:event.id,dejstvie_id:s.context.dejstvie_id,data:s.fact.data,summa:money(cents(s.fact.summa)),dostupno:money(available)});
 }
 return {telo:{sotrudnichestvo_id:id,zadacha:{id:current.task.id,nomer:current.task.nomer,nazvanie:current.task.nazvanie,versija:current.task.versija,status:current.task.status,otkrytyh_podzadach:require('./sostojanie-zadachi.js').otkrytye(db,current.task.id)},versija:current.cooperation.versija,summa:money(cents(current.context.summa)),vyplata_zadachi:tasks().active(db,current.context),svjazi:assigned,fakty:facts}};
}
function change(ctx){
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});const db=baza();return v_odnoj_tranzakcii(db,()=>{
  tasks().rights(db,ctx.avtor);const body=ctx.telo;tasks().fields(body,['zapros_kljuch','versija','zadacha_id','zadacha_versija','podtverzhdeno_podzadach','dejstvie','chasti']);const id=tasks().id(ctx.kljuch),old=tasks().receipt(db,ctx.avtor,id,body.zapros_kljuch);
  if(old){if(!old.itog_json)throw new Konflikt('Попытка отменена. Начни новую',{action_cancelled:true});if(old.zapros_hesh!==tasks().digest(body.zapros_kljuch,id,body)||JSON.parse(old.itog_json).vid!=='svjaz_vyplaty')throw new Konflikt('Под ключом отправлены другие поля',{operation_key_reused:true});return {telo:checkResult(db,old)};}
  const current=scope(db,id,body.zadacha_id),before=allocations(db,current.task.id);
  require('./versii.js').proverit(db,'sotrudnichestva',current.cooperation,body.versija,['chelovek_id','napravlenie','rol','privodit_klientov','vyplacheno','stadija']);
  require('./versii.js').proverit(db,'zadachi',current.task,body.zadacha_versija,[...require('./sostojanie-zadachi.js').POLJA_STATUSA,'udaleno']);
  if(!['privjazat','ubrat'].includes(body.dejstvie))throw new OshibkaVvoda('Выбери действие со связью выплаты','dejstvie');
  if(!Array.isArray(body.chasti)||body.chasti.length>200)throw new OshibkaVvoda('Выбери части фактов выплаты','chasti');
  let after=[];
  if(body.dejstvie==='privjazat'){
   if(current.task.status==='sdelano'||tasks().active(db,current.context))throw new Konflikt('У задачи уже подтверждена выплата. Обнови карточку');
   if(!body.chasti.length)throw new OshibkaVvoda('Выбери хотя бы один факт выплаты','chasti');
   after=body.chasti.map(r=>{if(!r||typeof r!=='object'||Object.keys(r).some(k=>!['zhurnal_id','dejstvie_id','summa'].includes(k)))throw new OshibkaVvoda('Не подтверждена часть выплаты','chasti');const amount=cents(r.summa);return {zadacha_id:current.task.id,zhurnal_id:tasks().id(r.zhurnal_id,'chasti'),dejstvie_id:r.dejstvie_id,summa_kopeek:Number(amount),sozdano:seichas()};}).sort((a,b)=>a.zhurnal_id-b.zhurnal_id);
   if(!Number.isSafeInteger(body.podtverzhdeno_podzadach)||body.podtverzhdeno_podzadach<0)throw new OshibkaVvoda('Обнови число открытых подзадач','podtverzhdeno_podzadach');validateAllocations(db,current,after);require('./sostojanie-zadachi.js').proverit_podtverzhdenie(db,current.task,{podtverzhdeno_podzadach:body.podtverzhdeno_podzadach});
  }else{
   if(!before.length)throw new Konflikt('У задачи нет отдельно привязанной выплаты');
   if(body.chasti.length)throw new OshibkaVvoda('Для снятия связи не нужны части выплаты','chasti');
   if(current.task.status!=='sdelano')throw new Konflikt('Сначала закрой открытую задачу по уже учтённой выплате, затем сними связь');
   validateAllocations(db,current,before);
  }
  const head=db.prepare('SELECT COALESCE(max(id),0) id FROM zhurnal').get().id;
  tasks().withAllowedClosure(current.task.id,()=>require('./obschij.js').pravit('zadachi',require('./opisanija.js').OPISANIJA.zadachi,current.task.nomer,{versija:body.zadacha_versija,status:body.dejstvie==='privjazat'?'sdelano':'v_plane',...(body.dejstvie==='privjazat'?{podtverzhdeno_podzadach:body.podtverzhdeno_podzadach}:{})},ctx.avtor));
  const event=db.prepare("SELECT * FROM zhurnal WHERE id>? AND obekt='zadacha' AND obekt_id=? AND pole='status' ORDER BY id DESC LIMIT 1").get(head,current.task.id);if(!event)throw new Error('Payout link status missing');
  writeAllocations(db,current.task.id,after);seal(db,event,{zadacha_id:current.task.id,nomer:current.task.nomer,sotrudnichestvo_id:id,before,after});
  const meta={vid:'svjaz_vyplaty',dejstvie_id:history.context(event).dejstvie_id,zadachi:[{id:current.task.id,nomer:current.task.nomer,zhurnal_id:event.id}]};
  db.prepare('INSERT INTO zaprosy_referalnyh_zadach(avtor,kljuch_hesh,sotrudnichestvo_id,zapros_hesh,itog_json,sozdano)VALUES(?,?,?,?,?,?)').run(ctx.avtor,tasks().key(body.zapros_kljuch),id,tasks().digest(body.zapros_kljuch,id,body),JSON.stringify(meta),seichas());
  return {telo:checkResult(db,tasks().receipt(db,ctx.avtor,id,body.zapros_kljuch))};
 });
}
module.exports={active,allocations,proposal,change,checkResult,assertComplete,afterUndo,isLinkedUndo,assertPayoutUnlinked,cents,money};
