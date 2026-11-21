                                                                             
                                                                            
const {createHash,createHmac,randomUUID}=require('node:crypto');
const {baza,OshibkaVvoda,Konflikt,NetDostupa,seichas}=require('../db/db.js');
const model=require('./celi-model.js'),decimal=require('../public/js/decimal-plan.js');
const own=(v,k)=>Object.hasOwn(v||{},k),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function fields(v,allowed){if(!v||typeof v!=='object'||Array.isArray(v))throw new OshibkaVvoda('Нужны параметры периодных планов');for(const k of Object.keys(v))if(!allowed.includes(k))throw new OshibkaVvoda('Неизвестное поле периодных планов',k);}
function key(v){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new OshibkaVvoda('Нужен ключ одного сохранения','zapros_kljuch');return hash(v.toLowerCase());}
function epoch(db,id){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='cel' AND obekt_id=? AND pole IN('sozdano','udaleno')").get(id)?.id??null;}
function load(db,id,actor){
 const goal=require('./okr-svjazi.js').goal(db,id,actor),rights=model.permissions(db,goal,actor);
 if(goal.sostojanie==='arhiv'||db.prepare('SELECT zakryt FROM periody WHERE id=?').get(String(goal.period_id))?.zakryt)throw new Konflikt(rights.prichina||'Цель доступна только для чтения');
 if(!rights.mozhno_pravit)throw new NetDostupa(rights.prichina||'Нет доступа к планам');return goal;
}
function children(period){const p=model.period(period);if(/^\d{4}$/.test(p))return [1,2,3,4].map(n=>p+'-Q'+n);if(/^\d{4}-Q[1-4]$/.test(p)){const start=(Number(p.at(-1))-1)*3+1;return [0,1,2].map(n=>p.slice(0,4)+'-'+String(start+n).padStart(2,'0'));}throw new OshibkaVvoda('На периоды ниже разбивается год или квартал','period');}
function inside(goal,period){const bounds=require('./ekrany.js').granicy_perioda,original=bounds(model.period(String(goal.period_id))),view=bounds(model.period(period));if(view.nachalo<original.nachalo||view.konec>original.konec)throw new OshibkaVvoda('Выбери период внутри периода цели','period');}
function plans(db,id){return db.prepare('SELECT p.* FROM plany_periodov_okr p JOIN rezultaty r ON r.id=p.rezultat_id WHERE r.cel_id=? ORDER BY p.rezultat_id,p.period_id').all(id);}
function results(db,id){return db.prepare('SELECT * FROM rezultaty WHERE cel_id=? ORDER BY id').all(id);}
function context(db,goal,actor){return hash({actor,goal,epoch:epoch(db,goal.id),results:results(db,goal.id),plans:plans(db,goal.id),rights:model.permissions(db,goal,actor),periods:db.prepare('SELECT id,zakryt FROM periody ORDER BY id').all()});}
function target(db,goal,row,period){if(String(goal.period_id)===period)return typeof row.plan==='number'&&Number.isFinite(row.plan)&&typeof row.baza==='number'&&Number.isFinite(row.baza)?decimal.subtract(row.plan,row.baza):null;return db.prepare('SELECT plan FROM plany_periodov_okr WHERE rezultat_id=? AND period_id=?').get(row.id,period)?.plan??null;}
function proposal(db,goal,actor,period){
 period=model.period(period);inside(goal,period);const periods=children(period),saved=plans(db,goal.id);
 return {cel_id:goal.id,period,kontekst:context(db,goal,actor),periody:periods,rezultaty:results(db,goal.id).filter(r=>r.tip!=='veha').map(row=>{
  const plan=target(db,goal,row,period),safe=plan!==null&&Number(plan)>=0,defaults=safe?decimal.split(plan,periods.length):null;
  return {id:row.id,cel_id:goal.id,rezultat_id:row.id,nazvanie:row.nazvanie,tip:row.tip,istochnik:row.istochnik,formula:row.formula,plan,po_periodam:periods.map((p,i)=>saved.find(s=>s.rezultat_id===row.id&&s.period_id===p)?.plan??defaults?.[i]??null)};
 })};
}
function receipt(db,actor,id,value){const row=db.prepare('SELECT * FROM zaprosy_planov_okr WHERE avtor=? AND kljuch_hesh=?').get(actor,key(value));if(row&&row.cel_id!==id)throw new Konflikt('Ключ использован для другой цели',{operation_key_reused:true});return row;}
function proof(db,actor,id,value){
 const saved=receipt(db,actor,id,value),identity={avtor_id:actor,cel_id:id,obekt:'plany_periodov_okr',zapros_kljuch:value.toLowerCase()};
 if(!saved)return {...identity,sostojanie:'ne_najdeno'};if(!saved.sohraneno)return {...identity,sostojanie:'otmeneno'};
 const result={...identity,sostojanie:'sohraneno',dejstvie:saved.dejstvie};
 if(epoch(db,id)!==saved.sobytie_id)return {...result,dannye_skryty:true};
 try{load(db,id,actor);}catch(e){if([403,404,409].includes(e.kod))return {...result,dannye_skryty:true};throw e;}
 return {...result,...JSON.parse(saved.rezultat_json)};
}
function save(db,goal,actor,body){
 const period=model.period(body.period);inside(goal,period);const periods=children(period),rows=results(db,goal.id).filter(r=>r.tip!=='veha');
 if(!rows.length)throw new OshibkaVvoda('У цели нет числовых результатов');
 if(body.kontekst!==context(db,goal,actor))throw new Konflikt('Планы, результаты или права изменились. Сравни актуальные значения',{kontekst_izmenilsja:true});
 for(const p of [period,...periods])if(db.prepare('SELECT zakryt FROM periody WHERE id=?').get(p)?.zakryt)throw new Konflikt('Период закрыт. Сохранённые планы доступны для чтения');
 if(!Array.isArray(body.stroki)||body.stroki.length!==rows.length)throw new OshibkaVvoda('Укажи все числовые результаты','stroki');
 const seen=new Set(),changes=[],summaries=[];
 for(const entry of body.stroki){
  fields(entry,['rezultat_id','po_periodam']);const id=require('./okr-svjazi.js').id(entry.rezultat_id,'rezultat_id'),row=rows.find(r=>r.id===id);
  if(!row||seen.has(id))throw new OshibkaVvoda('Выбери каждый результат этой цели один раз','rezultat_id');seen.add(id);
  if(!Array.isArray(entry.po_periodam)||entry.po_periodam.length!==periods.length)throw new OshibkaVvoda('Нужен план каждого периода','po_periodam');
  const values=entry.po_periodam.map(v=>{const n=require('./ruchnoj-zamer.js').number(v);if(n<0)throw new OshibkaVvoda('План периода не может быть отрицательным','po_periodam');return decimal.sum([String(v).trim().replace(',','.')]);});
  const parent=target(db,goal,row,period),summa=decimal.sum(values);summaries.push({id,cel_id:goal.id,rezultat_id:id,istochnik:row.istochnik,formula:row.formula,plan:parent,summa,raznica:parent===null?null:decimal.subtract(parent,summa)});
  values.forEach((plan,i)=>changes.push({row,period:periods[i],plan}));
 }
 const previous=[],after=[];
 for(const {row,period,plan}of changes){
  const before=db.prepare('SELECT * FROM plany_periodov_okr WHERE rezultat_id=? AND period_id=?').get(row.id,period);
  if(before?.plan===plan)continue;
  previous.push({rezultat_id:row.id,period_id:period,row:before??null,rezultat_versija:row.versija});
  db.prepare('INSERT INTO plany_periodov_okr(rezultat_id,period_id,plan,versija,izmenenie_id,kto,kogda)VALUES(?,?,?,1,?,?,?) ON CONFLICT(rezultat_id,period_id)DO UPDATE SET plan=excluded.plan,versija=versija+1,izmenenie_id=excluded.izmenenie_id,kto=excluded.kto,kogda=excluded.kogda').run(row.id,period,plan,randomUUID(),actor,seichas());
  after.push(db.prepare('SELECT * FROM plany_periodov_okr WHERE rezultat_id=? AND period_id=?').get(row.id,period));
  require('./obschij.js').v_zhurnal(db,'rezultaty',row.id,'plan_perioda',before?JSON.stringify({period,plan:before.plan}):null,JSON.stringify({period,plan}),actor,row);
 }
 return {response:{period,periody:periods,sverka:summaries,sohraneno:after.length},previous,after};
}
function undo(db,goal,actor,body){
 const original=receipt(db,actor,goal.id,body.ishodnyj_kljuch);
 if(!original?.sohraneno||original.dejstvie!=='plan'||original.sobytie_id!==epoch(db,goal.id))throw new Konflikt('Исходное сохранение недоступно для возврата');
 if(db.prepare("SELECT 1 FROM zaprosy_planov_okr WHERE avtor=? AND roditel_kljuch_hesh=? AND sohraneno=1").get(actor,key(body.ishodnyj_kljuch)))throw new Konflikt('Эти планы уже возвращены');
 const previous=JSON.parse(original.do_json),after=JSON.parse(original.posle_json);
 if(!after.length)throw new Konflikt('В этом сохранении нет изменённых планов');
 for(const saved of after){
  const row=db.prepare('SELECT * FROM rezultaty WHERE id=? AND cel_id=?').get(saved.rezultat_id,goal.id),before=previous.find(p=>p.rezultat_id===saved.rezultat_id&&p.period_id===saved.period_id),current=db.prepare('SELECT * FROM plany_periodov_okr WHERE rezultat_id=? AND period_id=?').get(saved.rezultat_id,saved.period_id);
  if(!row||row.versija!==before.rezultat_versija||current?.izmenenie_id!==saved.izmenenie_id)throw new Konflikt('После сохранения результат или план изменили. Сравни актуальные значения');
  if(db.prepare('SELECT zakryt FROM periody WHERE id=?').get(saved.period_id)?.zakryt)throw new Konflikt('Период закрыт. Возврат планов не применён');
 }
 for(const saved of after){
  const before=previous.find(p=>p.rezultat_id===saved.rezultat_id&&p.period_id===saved.period_id),row=db.prepare('SELECT * FROM rezultaty WHERE id=?').get(saved.rezultat_id);
  if(before.row)db.prepare('UPDATE plany_periodov_okr SET plan=?,versija=versija+1,izmenenie_id=?,kto=?,kogda=? WHERE rezultat_id=? AND period_id=?').run(before.row.plan,randomUUID(),actor,seichas(),saved.rezultat_id,saved.period_id);
  else db.prepare('DELETE FROM plany_periodov_okr WHERE rezultat_id=? AND period_id=?').run(saved.rezultat_id,saved.period_id);
  require('./obschij.js').v_zhurnal(db,'rezultaty',saved.rezultat_id,'plan_perioda',JSON.stringify({period:saved.period_id,plan:saved.plan}),JSON.stringify({period:saved.period_id,plan:before.row?.plan??null}),actor,row);
 }
 return {response:{otmeneno:true,sohraneno:after.length},previous:after,after:previous};
}
function handle(ctx){
 const db=baza(),id=require('./okr-svjazi.js').id(ctx.kljuch,'cel_id'),actor=ctx.avtor,body=ctx.telo||{},query=ctx.zapros||{},action=ctx.dejstvie;
 if(action==='plany_periodov_proverka'){if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET проверки'),{kod:405});fields(query,['zapros_kljuch']);return {telo:proof(db,actor,id,query.zapros_kljuch)};}
 if(action==='plany_periodov_otmena_popytki'){
  if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST отмены попытки'),{kod:405});fields(query,[]);fields(body,['zapros_kljuch']);
  if(!receipt(db,actor,id,body.zapros_kljuch))db.prepare('INSERT INTO zaprosy_planov_okr(avtor,kljuch_hesh,cel_id,sozdano)VALUES(?,?,?,?)').run(actor,key(body.zapros_kljuch),id,seichas());return {telo:proof(db,actor,id,body.zapros_kljuch)};
 }
 if(ctx.metod==='GET'&&action==='plany_periodov'){fields(query,['period']);return {telo:proposal(db,load(db,id,actor),actor,query.period)};}
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST сохранения'),{kod:405});fields(query,[]);const returning=action==='plany_periodov_otmenit';fields(body,returning?['zapros_kljuch','ishodnyj_kljuch']:['period','kontekst','zapros_kljuch','stroki']);
 const digest=createHmac('sha256',String(body.zapros_kljuch).toLowerCase()).update(JSON.stringify({action,body:stable(body)})).digest('hex'),saved=receipt(db,actor,id,body.zapros_kljuch);
 if(saved){if(!saved.sohraneno)throw new Konflikt('Попытка отменена. Начни новое сохранение',{edit_cancelled:true});if(saved.zapros_hesh!==digest)throw new Konflikt('Ключ использован для другого плана',{operation_key_reused:true});return {telo:{...proof(db,actor,id,body.zapros_kljuch),povtor_sohranenija:true}};}
 const goal=load(db,id,actor),result=returning?undo(db,goal,actor,body):save(db,goal,actor,body);
 db.prepare('INSERT INTO zaprosy_planov_okr(avtor,kljuch_hesh,cel_id,sobytie_id,dejstvie,roditel_kljuch_hesh,zapros_hesh,sohraneno,rezultat_json,do_json,posle_json,sozdano)VALUES(?,?,?,?,?,?,?,1,?,?,?,?)').run(actor,key(body.zapros_kljuch),id,epoch(db,id),returning?'otmena':'plan',returning?key(body.ishodnyj_kljuch):null,digest,JSON.stringify(result.response),JSON.stringify(result.previous),JSON.stringify(result.after),seichas());
 return {telo:proof(db,actor,id,body.zapros_kljuch)};
}
module.exports={handle,children,plans};
