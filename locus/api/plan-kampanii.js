const {createHash,createHmac}=require('node:crypto');
const {baza,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,Konflikt,seichas}=require('../db/db.js');
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
function positive(v,field){if(typeof v==='boolean'||!/^[1-9]\d*$/.test(String(v))||!Number.isSafeInteger(Number(v)))throw new OshibkaVvoda('Нужно целое положительное число',field);return Number(v);}
function fields(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body))throw new OshibkaVvoda('Нужен объект параметров');for(const k of Object.keys(body))if(!allowed.includes(k))throw new OshibkaVvoda('Неизвестный параметр плана',k);}
function key(v){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new OshibkaVvoda('Нужен ключ одной правки плана','zapros_kljuch');return hash(v.toLowerCase());}
function context(db,row){
 const p=require('./kampanii.js').profile(db,row.id),task=id=>id?db.prepare('SELECT id,rassylka_id,versija,shablon,plan_chislo,status,udaleno FROM zadachi WHERE id=?').get(id)||null:null;
 return hash({id:row.id,version:row.versija,created:db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='rassylka' AND obekt_id=? AND pole='sozdano'").get(row.id)?.id??null,plan:p??null,collect:task(p?.zadacha_bazy_id),send:task(p?.zadacha_otpravki_id)});
}
function receipt(db,actor,id,value){const r=db.prepare('SELECT * FROM zaprosy_planov_kampanij WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));if(r&&r.rassylka_id!==id)throw new Konflikt('Ключ относится к плану другой кампании',{operation_key_reused:true});return r;}
function proof(db,actor,id,value){
 const r=receipt(db,actor,id,value);if(!r)return {sostojanie:'ne_najdeno'};if(!r.sohraneno)return {sostojanie:'otmeneno'};
 const row=db.prepare('SELECT * FROM rassylki WHERE id=?').get(id);if(r.udaleno||!row)return {sostojanie:'udaleno',id,plan_sohranen: r.plan_posle,versija_sohranenija:r.versija_posle};
 return {sostojanie:'sohraneno',id,plan_sohranen:r.plan_posle,versija_sohranenija:r.versija_posle,obnovlennye_zadachi:JSON.parse(r.obnovleno_json),rassylka:require('./kampanii.js').presentation(db,row)};
}
function apply(ctx){
 const db=baza(),actor=positive(ctx.avtor,'avtor'),id=positive(ctx.kljuch,'rassylka_id'),body={...ctx.telo},value=body.zapros_kljuch;delete body.zapros_kljuch;
 fields(body,['plan_chislo','versija','versija_plana','kontekst_plana']);key(value);
 const digest=createHmac('sha256',value.toLowerCase()).update(JSON.stringify({id,body:Object.fromEntries(Object.keys(body).sort().map(k=>[k,body[k]]))})).digest('hex');
 return v_odnoj_tranzakcii(db,()=>{
  const old=receipt(db,actor,id,value);
  if(old){if(!old.sohraneno)throw new Konflikt('Правка плана отменена. Начни новое действие',{edit_cancelled:true});if(old.zapros_hesh!==digest)throw new Konflikt('Под этим ключом уже отправлен другой план',{operation_key_reused:true});const result=proof(db,actor,id,value);if(result.sostojanie!=='sohraneno')throw Object.assign(new Error('Кампания после этой правки удалена'),{kod:410,dannye:result});return {telo:{...result.rassylka,plan_sohranen:old.plan_posle,versija_sohranenija:old.versija_posle,povtor_pravki:true}};}
  const row=db.prepare('SELECT * FROM rassylki WHERE id=?').get(id);if(!row)throw new NeNajdeno('Кампании нет');
  const kamp=require('./kampanii.js'),plan=kamp.profile(db,id),target=positive(body.plan_chislo,'plan_chislo');
  if(body.versija!==row.versija||body.versija_plana!==(plan?.versija??null)||typeof body.kontekst_plana!=='string'||body.kontekst_plana!==context(db,row))throw new Konflikt('Кампания или связанные задачи изменились. Перечитай план перед сохранением',{plan_izmenilsja:true});
  const changed=[];
  if(plan?.plan_chislo!==target){
   if(plan)db.prepare('UPDATE plany_kampanij SET plan_chislo=?,versija=versija+1 WHERE rassylka_id=?').run(target,id);
   else db.prepare('INSERT INTO plany_kampanij(rassylka_id,plan_chislo,avtor,sozdano)VALUES(?,?,?,?)').run(id,target,actor,seichas());
   for(const [taskId,template]of [[plan?.zadacha_bazy_id,'sobrat_bazu'],[plan?.zadacha_otpravki_id,'rassylka_plan']]){
    if(!taskId)continue;const task=db.prepare('SELECT * FROM zadachi WHERE id=?').get(taskId);
    if(!task||task.rassylka_id!==id||!(template==='sobrat_bazu'?require('./rol-zadachi-rassylki.js').collection(task):require('./rol-zadachi-rassylki.js').planned(db,task))||task.udaleno===1||['sdelano','kogda_nibud'].includes(task.status)||db.prepare('SELECT 1 FROM sostavy_voln WHERE zadacha_id=?').get(task.id))continue;
    if(task.plan_chislo===target)continue;
    const saved=require('./obschij.js').pravit('zadachi',require('./opisanija.js').OPISANIJA.zadachi,task.nomer,{versija:task.versija,plan_chislo:target},actor);changed.push({id:saved.id,nomer:saved.nomer,versija:saved.versija});
   }
   require('./obschij.js').v_zhurnal(db,'rassylki',id,'plan_chislo',plan?String(plan.plan_chislo):'',String(target),actor,row);
  }
  const next=kamp.profile(db,id);db.prepare('INSERT INTO zaprosy_planov_kampanij(avtor,kljuch_hesh,rassylka_id,zapros_hesh,sohraneno,plan_posle,versija_posle,obnovleno_json,sozdano)VALUES(?,?,?,?,1,?,?,?,?)').run(actor,key(value),id,digest,target,next.versija,JSON.stringify(changed),seichas());
  return {telo:{...kamp.presentation(db,db.prepare('SELECT * FROM rassylki WHERE id=?').get(id)),plan_sohranen:target,versija_sohranenija:next.versija,obnovlennye_zadachi:changed}};
 });
}
function handle(ctx){
 if(ctx.metod==='PATCH'&&ctx.kljuch&&!ctx.dejstvie&&Object.hasOwn(ctx.telo||{},'plan_chislo'))return apply(ctx);
 if(!['proverka_plana','otmena_plana'].includes(ctx.dejstvie))return null;
 const read=ctx.dejstvie==='proverka_plana';if(ctx.metod!==(read?'GET':'POST')||ctx.kljuch)throw Object.assign(new Error(read?'Нужен GET проверки плана':'Нужен POST отмены попытки'),{kod:405});
 const params=read?ctx.zapros:ctx.telo;fields(params,['rassylka_id','zapros_kljuch']);const id=positive(params.rassylka_id,'rassylka_id'),db=baza(),actor=positive(ctx.avtor,'avtor');
 if(read)return {telo:proof(db,actor,id,params.zapros_kljuch)};
 return v_odnoj_tranzakcii(db,()=>{if(!receipt(db,actor,id,params.zapros_kljuch))db.prepare('INSERT INTO zaprosy_planov_kampanij(avtor,kljuch_hesh,rassylka_id,sozdano)VALUES(?,?,?,?)').run(actor,key(params.zapros_kljuch),id,seichas());return {telo:proof(db,actor,id,params.zapros_kljuch)};});
}
module.exports={context,handle};
