const taskRole=require('./rol-zadachi-rassylki.js');
                                                                           
                                                                             
const {createHash,createHmac}=require('node:crypto');
const {baza,v_api,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,Konflikt,seichas,segodnja}=require('../db/db.js');
const cal=require('./kalendar.js');
const statuses=['ne_otpravleno','otpravleno','otvetil','otkaz'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function positive(value,field){if(typeof value==='boolean'||!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))throw new OshibkaVvoda('Нужен целый положительный номер',field);return Number(value);}
function fields(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body))throw new OshibkaVvoda('Нужен объект параметров');for(const key of Object.keys(body))if(!allowed.includes(key))throw new OshibkaVvoda('Неизвестный параметр рассылки',key);}
function ids(value,field){if(!Array.isArray(value)||!value.length||value.length>10000)throw new OshibkaVvoda('Нужен список от 1 до 10000 человек',field);const list=value.map(v=>positive(v,field));if(new Set(list).size!==list.length)throw new OshibkaVvoda('Человек повторяется в списке',field);return list;}
function campaign(db,id){const row=db.prepare('SELECT * FROM rassylki WHERE id=?').get(id);if(!row)throw new NeNajdeno('Рассылки нет');return row;}
function wave(db,id,task,includingDeleted=false){const row=db.prepare('SELECT * FROM zadachi WHERE id=? AND rassylka_id=?'+(includingDeleted?'':' AND COALESCE(udaleno,0)=0')).get(task,id);if(!row||taskRole.collection(row)||taskRole.planned(db,row))throw new OshibkaVvoda('Задача не является волной этой рассылки','zadacha_id');return row;}
function history(db,id,task,person){return db.prepare('SELECT rowid,* FROM rassylka_kasanija WHERE rassylka_id=?'+(task==null?'':' AND zadacha_id=?')+(person==null?'':' AND chelovek_id=?')+" ORDER BY substr(kogda,1,10),rowid").all(id,...(task==null?[]:[task]),...(person==null?[]:[person]));}
function legacyRows(db,id,task){
 const known=new Map();
                                                                           
 for(const row of db.prepare('SELECT chelovek_id FROM rassylka_ljudi WHERE rassylka_id=? AND zadacha_id=?').all(id,task))known.set(row.chelovek_id,{zadacha_id:task,chelovek_id:row.chelovek_id,status:null,kogda:null,otschet_at:null,otvet_at:null,versija:1});
 for(const row of history(db,id,task)){
  if(!statuses.includes(row.chto))continue;
  let item=known.get(row.chelovek_id);if(!item){item={zadacha_id:task,chelovek_id:row.chelovek_id,status:null,kogda:null,otschet_at:null,otvet_at:null,versija:1};known.set(row.chelovek_id,item);}
  item.status=row.chto;item.kogda=row.kogda;
  if(row.chto==='ne_otpravleno'){item.otschet_at=null;item.otvet_at=null;}
  else{item.otschet_at||=row.kogda;if(['otvetil','otkaz'].includes(row.chto))item.otvet_at=row.kogda;else item.otvet_at=null;}
 }
 return [...known.values()].sort((a,b)=>a.chelovek_id-b.chelovek_id);
}
function roster(db,id,task,includingDeleted=false){wave(db,id,task,includingDeleted);const saved=db.prepare('SELECT * FROM sostavy_voln WHERE zadacha_id=? AND rassylka_id=?').get(task,id);return {complete:saved?.polnyj===1,plan:saved?.plan??null,rows:saved?db.prepare('SELECT * FROM uchastniki_voln WHERE zadacha_id=? ORDER BY chelovek_id').all(task):legacyRows(db,id,task)};}
function nextNumber(db,id,except=null){
 const maximum=db.prepare('SELECT COALESCE(max(nomer),0) n FROM porjadki_voln WHERE rassylka_id=?').get(id).n;
 const legacy=db.prepare("SELECT count(*) n FROM zadachi z WHERE z.rassylka_id=? AND (? IS NULL OR z.id<>?) AND COALESCE(z.udaleno,0)=0 AND "+taskRole.sendingSQL('z')+" AND NOT EXISTS(SELECT 1 FROM porjadki_voln p WHERE p.zadacha_id=z.id)").get(id,except,except).n;
 return Math.max(maximum,legacy)+1;
}

function snapshot(db,task,people,actor,complete=true){
 if(db.prepare('SELECT 1 FROM sostavy_voln WHERE zadacha_id=?').get(task.id))return;
 db.prepare('INSERT INTO sostavy_voln(zadacha_id,rassylka_id,plan,polnyj,sozdano,avtor)VALUES(?,?,?,?,?,?)').run(task.id,task.rassylka_id,task.plan_chislo??null,complete?1:0,seichas(),actor);
 const insert=db.prepare('INSERT INTO uchastniki_voln(zadacha_id,chelovek_id,status,kogda,otschet_at,otvet_at,versija)VALUES(?,?,?,?,?,?,?)');
 for(const person of people)typeof person==='number'?insert.run(task.id,person,'ne_otpravleno',null,null,null,1):insert.run(task.id,person.chelovek_id,person.status,person.kogda,person.otschet_at,person.otvet_at,person.versija);
 db.prepare('INSERT INTO porjadki_voln(zadacha_id,rassylka_id,nomer)VALUES(?,?,?)').run(task.id,task.rassylka_id,nextNumber(db,task.rassylka_id,task.id));
}
function onTaskCreated(db,task,actor){const profile=task.rassylka_id?require('./kampanii.js').profile(db,task.rassylka_id):null;if(task.shablon==='rassylka_plan'||task.rol_v_rassylke===taskRole.SEND&&profile&&profile.zadacha_otpravki_id==null){if(!task.rassylka_id)throw new OshibkaVvoda('Плановой отправке нужна кампания','rassylka_id');require('./kampanii.js').registerPlanningTask(db,task);return;}if(!task.rassylka_id||taskRole.collection(task))return;const people=require('./kampanii.js').sourceRows(db,campaign(db,task.rassylka_id)).map(p=>p.chelovek_id);snapshot(db,task,people,actor);}
function token(db,id,person,task=null){const base=campaign(db,id).baza_id;return hash({id,person,task,source:base?{base,row:db.prepare('SELECT * FROM bazy_ljudi WHERE baza_id=? AND kto=?').get(base,person)||null,membership:db.prepare('SELECT a.* FROM arhiv_strok_baz a JOIN bazy_ljudi bl ON bl.id=a.stroka_id WHERE bl.baza_id=? AND bl.kto=?').get(base,person)||null}:null,tag:db.prepare('SELECT * FROM rassylka_ljudi WHERE rassylka_id=? AND chelovek_id=?').get(id,person)||null,history:history(db,id,null,person),member:task?db.prepare('SELECT * FROM uchastniki_voln WHERE zadacha_id=? AND chelovek_id=?').get(task,person)||null:null});}
function list(ctx){
 const db=baza(),id=positive(ctx.kljuch,'rassylka_id'),q=ctx.zapros||{};campaign(db,id);fields(q,['zadacha_id','status']);if(q.status!==undefined&&!statuses.includes(q.status)&&q.status!=='neizvestno')throw new OshibkaVvoda('Неизвестный статус','status');
 const task=q.zadacha_id==null?null:positive(q.zadacha_id,'zadacha_id');
 return v_odnoj_tranzakcii(db,()=>{
  const current=db.prepare('SELECT rl.*,l.imja FROM rassylka_ljudi rl LEFT JOIN ljudi l ON l.id=rl.chelovek_id WHERE rl.rassylka_id=? ORDER BY rl.id').all(id),byPerson=new Map(current.map(p=>[p.chelovek_id,p]));
  const selected=task?roster(db,id,task):null,active=require('./kampanii.js').sourceRows(db,campaign(db,id));for(const row of active)if(!byPerson.has(row.chelovek_id))byPerson.set(row.chelovek_id,row);
  let rows=task?selected.rows.map(item=>({...byPerson.get(item.chelovek_id),chelovek_id:item.chelovek_id,imja:byPerson.get(item.chelovek_id)?.imja??db.prepare('SELECT imja FROM ljudi WHERE id=?').get(item.chelovek_id)?.imja??'Участник',status_v_volne:item.status,kogda_v_volne:item.kogda,versija_volny:item.versija})):active;
  rows=rows.filter(row=>q.status===undefined||(task?row.status_v_volne:row.status)===(q.status==='neizvestno'?null:q.status));
  for(const row of rows){row.versija_otmetki=token(db,id,row.chelovek_id,task);const events=history(db,id,null,row.chelovek_id).filter(k=>statuses.includes(k.chto));const last=events.at(-1);row.poslednee_kasanie=last?{chto:last.chto,kogda:last.kogda}:null;}
  return {telo:{spisok:rows.map(v_api),vsego:rows.length,sostav_polnyj:task?selected.complete:true}};
 });
}
function responders(db,id){const people=require('./kampanii.js').sourceRows(db,campaign(db,id)),answered=new Set(people.filter(p=>p.status==='otvetil').map(p=>p.chelovek_id)),silent=new Set(people.filter(p=>p.status==='otpravleno').map(p=>p.chelovek_id));return {people,answered,silent};}
function selection(db,id,body){
 const c=campaign(db,id),komu=body.komu||'vsja_baza';if(!['vsja_baza','ne_otvetili','otvetili','svoja'].includes(komu))throw new OshibkaVvoda('Выбери, кому пишем','komu');
 const {people,answered,silent}=responders(db,id),all=people.map(p=>p.chelovek_id),existing=new Set(all);let selected;
 if(komu==='svoja'){selected=ids(body.chelovek_ids,'chelovek_ids').sort((a,b)=>a-b);if(selected.some(p=>!existing.has(p)))throw new OshibkaVvoda('Человека нет в этой рассылке','chelovek_ids');}
 else{if(body.chelovek_ids!==undefined)throw new OshibkaVvoda('Список людей нужен только для своей выборки','chelovek_ids');selected=all.filter(p=>komu==='vsja_baza'||(komu==='otvetili'?answered.has(p):silent.has(p)));}
                                                                                   
 const planned=require('./kampanii.js').planningTask(db,id);return {komu,chelovek_ids:selected,plan:selected.length,nomer_volny:nextNumber(db,id),planovaja_zadacha:planned?{id:planned.id,nomer:planned.nomer,nazvanie:planned.nazvanie,versija:planned.versija,otvetstvennyj:planned.otvetstvennyj,plan_chislo:planned.plan_chislo}:null,vybor_versija:hash({campaign:c.id,version:c.versija,komu,people:people.map(p=>[p.chelovek_id,p.status]),selected,planned:planned?{id:planned.id,version:planned.versija}:null})};
}
function preview(ctx){if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});fields(ctx.telo,['komu','chelovek_ids']);return {telo:selection(baza(),positive(ctx.kljuch,'rassylka_id'),ctx.telo)};}
function whom(ctx){if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});const db=baza(),id=positive(ctx.kljuch,'rassylka_id');campaign(db,id);const {people,answered,silent}=responders(db,id),a=answered.size;return {telo:{spisok:[{kod:'vsja_baza',nazvanie:'всем',skolko:people.length},{kod:'ne_otvetili',nazvanie:'кто молчит',skolko:silent.size},{kod:'otvetili',nazvanie:'кто ответил',skolko:a},{kod:'svoja',nazvanie:'отмечу сама',skolko:0}],vsego:4,nomer_sledujuschej_volny:nextNumber(db,id)}};}
function key(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new OshibkaVvoda('Нужен ключ одного действия','zapros_kljuch');return value.toLowerCase();}
function receipt(db,actor,id,value){const row=db.prepare('SELECT * FROM zaprosy_rassylok WHERE avtor=? AND kljuch_hesh=?').get(actor,hash(key(value)));if(row&&row.rassylka_id!==id)throw new Konflikt('Ключ относится к другой рассылке');return row;}
function creation(db,task){return db.prepare("SELECT max(id) id FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='sozdano'").get(task)?.id??null;}
function proof(db,actor,id,value){const row=receipt(db,actor,id,value);if(!row)return {sostojanie:'ne_najdeno'};if(!row.dejstvie)return {sostojanie:'otmeneno'};if(!db.prepare('SELECT 1 FROM rassylki WHERE id=?').get(id)||row.dejstvie==='volna'&&(!db.prepare('SELECT 1 FROM zadachi WHERE id=? AND rassylka_id=? AND COALESCE(udaleno,0)=0').get(row.zadacha_id,id)||creation(db,row.zadacha_id)!==row.sobytie_id))return {sostojanie:'udaleno'};return {sostojanie:'vypolneno',dejstvie:row.dejstvie,rezultat:JSON.parse(row.rezultat_json),istoricheskoe_podtverzhdenie:true};}
function command(ctx,action,fn){
 const db=baza(),actor=positive(ctx.avtor,'avtor'),id=positive(ctx.kljuch,'rassylka_id'),value=key(ctx.telo.zapros_kljuch),body={...ctx.telo};delete body.zapros_kljuch;
 const digest=createHmac('sha256',value).update(JSON.stringify({id,action,body:sort(body)})).digest('hex');
 return v_odnoj_tranzakcii(db,()=>{
  const old=receipt(db,actor,id,value);
  if(old){if(!old.dejstvie)throw new Konflikt('Действие отменено. Начни новое');if(old.dejstvie!==action||old.zapros_hesh!==digest)throw new Konflikt('Под ключом уже были другие данные');const result=proof(db,actor,id,value);if(result.sostojanie!=='vypolneno')throw Object.assign(new Error('Результат действия уже удалён'),{kod:410});return {kod:action==='volna'?201:200,telo:{...result.rezultat,povtor_dejstvija:true}};}
  campaign(db,id);const result=fn(db,id,body,actor);db.prepare('INSERT INTO zaprosy_rassylok(avtor,kljuch_hesh,rassylka_id,dejstvie,zapros_hesh,rezultat_json,sozdano,zadacha_id,sobytie_id)VALUES(?,?,?,?,?,?,?,?,?)').run(actor,hash(value),id,action,digest,JSON.stringify(result),seichas(),action==='volna'?result.zadacha_id:null,action==='volna'?creation(db,result.zadacha_id):null);
  return {kod:action==='volna'?201:200,telo:result};
 });
}
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
function check(ctx){if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});fields(ctx.zapros,['zapros_kljuch']);return {telo:proof(baza(),positive(ctx.avtor,'avtor'),positive(ctx.kljuch,'rassylka_id'),ctx.zapros.zapros_kljuch)};}
function cancel(ctx){if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});fields(ctx.telo,['zapros_kljuch']);const db=baza(),actor=positive(ctx.avtor,'avtor'),id=positive(ctx.kljuch,'rassylka_id');return v_odnoj_tranzakcii(db,()=>{if(!receipt(db,actor,id,ctx.telo.zapros_kljuch)){campaign(db,id);db.prepare('INSERT INTO zaprosy_rassylok(avtor,kljuch_hesh,rassylka_id,sozdano)VALUES(?,?,?,?)').run(actor,hash(key(ctx.telo.zapros_kljuch)),id,seichas());}return {telo:proof(db,actor,id,ctx.telo.zapros_kljuch)};});}
function create(ctx){
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});fields(ctx.telo,['zapros_kljuch','komu','chelovek_ids','vybor_versija','nazvanie','otvetstvennyj','sprint','god_sprinta','cel_id','rezultat_id']);
 return command(ctx,'volna',(db,id,t,actor)=>{
  const c=campaign(db,id);if(c.status==='zavershena')throw new Konflikt('Кампания завершена. Верни её в работу перед новой волной');const selected=selection(db,id,t);if(!selected.plan)throw new OshibkaVvoda('В волну некого взять: выборка пуста','komu');if(t.vybor_versija!==selected.vybor_versija)throw new Konflikt('Состав выборки изменился. Проверь его ещё раз',{vybor_izmenilsja:true});
  const owner=positive(t.otvetstvennyj??c.kto_vedet??actor,'otvetstvennyj'),person=db.prepare('SELECT * FROM ljudi WHERE id=?').get(owner);if(!person||person.komanda!==1||person.aktiven===0||person.arhiv===1)throw new OshibkaVvoda('Нужен действующий участник команды','otvetstvennyj');
  const number=nextNumber(db,id);
  if(t.nazvanie!==undefined&&(typeof t.nazvanie!=='string'||Array.from(t.nazvanie).length>2000))throw new OshibkaVvoda('Название не длиннее 2000 символов','nazvanie');const name=t.nazvanie?.trim()||selected.planovaja_zadacha?.nazvanie||`Волна ${number}: ${c.nazvanie}`;
  const week=cal.nedelja_iz_zaprosa({...t,...(t.god_sprinta!=null?{god:t.god_sprinta}:{})},segodnja());
  const kamp=require('./kampanii.js'),common=require('./obschij.js'),description=require('./opisanija.js').OPISANIJA.zadachi;
  for(const person of selected.chelovek_ids)kamp.addTag(db,id,person,actor);
  const planned=kamp.planningTask(db,id),body={nazvanie:name,napravlenie:c.napravlenie,otvetstvennyj:owner,status:'v_plane',tip:'biznesovaja',sprint:cal.kljuch_nedeli(week.god,week.nomer),rassylka_id:id,plan_chislo:planned?.plan_chislo??selected.plan,shablon:planned&&planned.shablon!=='rassylka_plan'?planned.shablon:'rassylka',rol_v_rassylke:'otpravit',cel_id:t.cel_id??null,rezultat_id:t.rezultat_id??null};
  const task=planned?common.pravit('zadachi',description,planned.nomer,kamp.activateBody({...body,versija:planned.versija}),actor):common.sozdat('zadachi',description,body,actor);
                                                                       
                                                                             
                                                                               
  db.prepare('DELETE FROM sostavy_voln WHERE zadacha_id=?').run(task.id);snapshot(db,task,selected.chelovek_ids,actor);

  return {zadacha_id:task.id,nomer:task.nomer,nazvanie:task.nazvanie,plan:task.plan_chislo,ljudej:selected.plan,nomer_volny:number,komu:selected.komu};
 });
}
                                                                          
                                                                             
function additionSelection(db,id,taskId){
 const c=campaign(db,id),p=require('./kampanii.js').profile(db,id),task=wave(db,id,taskId);
 if(c.status==='zavershena')throw new Konflikt('Кампания завершена. Верни её в работу перед добавлением людей');
 if(!p||p.zadacha_otpravki_id!==task.id||task.plan_chislo!==p.plan_chislo)throw new Konflikt('Пополнять можно только первоначальную отправку с общим планом кампании');
 if(['sdelano','kogda_nibud'].includes(task.status))throw new Konflikt('Первоначальная отправка закрыта или отложена. Для новой работы создай отдельную волну');
 const head=db.prepare('SELECT * FROM sostavy_voln WHERE zadacha_id=? AND rassylka_id=?').get(task.id,id);if(!head||head.polnyj!==1)throw new Konflikt('Прежний состав подтверждён не полностью. Автоматически дополнять его нельзя');
 const members=db.prepare('SELECT * FROM uchastniki_voln WHERE zadacha_id=? ORDER BY chelovek_id').all(task.id),known=new Set(members.map(p=>p.chelovek_id)),people=require('./kampanii.js').sourceRows(db,c),fresh=people.filter(p=>!known.has(p.chelovek_id)).sort((a,b)=>a.chelovek_id-b.chelovek_id);
 return {zadacha_id:task.id,nomer:task.nomer,nazvanie:task.nazvanie,plan:task.plan_chislo,uzhe_v_sostave:members.length,dobavitsja:fresh.length,spisok:fresh.map(p=>({id:p.chelovek_id,imja:p.imja})),vybor_versija:hash({campaign:id,version:c.versija,base:c.baza_id,task:task.id,taskVersion:task.versija,plan:task.plan_chislo,members,people:people.map(p=>p.chelovek_id).sort((a,b)=>a-b)})};
}
function previewAddition(ctx){if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});fields(ctx.telo,['zadacha_id']);return {telo:additionSelection(baza(),positive(ctx.kljuch,'rassylka_id'),positive(ctx.telo.zadacha_id,'zadacha_id'))};}
function addRecipients(ctx){
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});fields(ctx.telo,['zapros_kljuch','zadacha_id','vybor_versija','komu']);
 return command(ctx,'volna',(db,id,t,actor)=>{
  if(t.komu!=='vsja_baza')throw new OshibkaVvoda('Дополнение берётся из полного источника кампании','komu');
  const taskId=positive(t.zadacha_id,'zadacha_id'),selected=additionSelection(db,id,taskId);if(t.vybor_versija!==selected.vybor_versija)throw new Konflikt('Состав изменился. Проверь дополнение ещё раз',{vybor_izmenilsja:true});if(!selected.dobavitsja)throw new OshibkaVvoda('Новых людей для этой отправки пока нет');
  for(const person of selected.spisok){require('./kampanii.js').addTag(db,id,person.id,actor);db.prepare("INSERT INTO uchastniki_voln(zadacha_id,chelovek_id,status,versija)VALUES(?,?,'ne_otpravleno',1)").run(taskId,person.id);}
  db.prepare('UPDATE zadachi SET versija=COALESCE(versija,0)+1 WHERE id=?').run(taskId);
  require('./obschij.js').v_zhurnal(db,'zadachi',taskId,'sostav_volny',String(selected.uzhe_v_sostave),JSON.stringify({vsego:selected.uzhe_v_sostave+selected.dobavitsja,dobavleny:selected.spisok.map(p=>p.id)}),actor);
  const ordinal=db.prepare('SELECT nomer FROM porjadki_voln WHERE zadacha_id=?').get(taskId);if(!ordinal)throw new Error('Original sending order was not recorded');
  return {zadacha_id:taskId,nomer:selected.nomer,nazvanie:selected.nazvanie,plan:selected.plan,ljudej:selected.uzhe_v_sostave+selected.dobavitsja,nomer_volny:ordinal.nomer,komu:'vsja_baza',dopolnenie:true,dobavleno:selected.dobavitsja};
 });
}
function validCalendarDay(value){try{cal.data(value);return true;}catch{return false;}}
function validDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!validCalendarDay(value))throw new OshibkaVvoda('Нужна существующая календарная дата','kogda');return value;}
function mark(ctx){
 fields(ctx.telo,['zapros_kljuch','chelovek_ids','kontakt_ids','status','zadacha_id','kogda','versii']);
 return command(ctx,'otmetka',(db,id,t,actor)=>{
  if(!statuses.includes(t.status))throw new OshibkaVvoda('Неизвестный статус','status');if(t.chelovek_ids!==undefined&&t.kontakt_ids!==undefined)throw new OshibkaVvoda('Выбери один список людей');
  const date=validDay(t.kogda===undefined?segodnja():t.kogda),raw=ids(t.chelovek_ids??t.kontakt_ids,'chelovek_ids');
  const people=t.chelovek_ids!==undefined?raw:raw.map(n=>{const row=db.prepare('SELECT chelovek_id FROM rassylka_ljudi WHERE rassylka_id=? AND id=?').get(id,n);if(!row)throw new OshibkaVvoda('Контакта нет в рассылке','kontakt_ids');return row.chelovek_id;});
  if(!t.versii||typeof t.versii!=='object'||Array.isArray(t.versii)||Object.keys(t.versii).length!==people.length)throw new OshibkaVvoda('Нужны прочитанные версии выбранных отметок','versii');
  const task=t.zadacha_id==null?null:positive(t.zadacha_id,'zadacha_id'),rosterState=task?roster(db,id,task):null,memberMap=new Map(rosterState?.rows.map(row=>[row.chelovek_id,row]));
  const eligible=new Map(require('./kampanii.js').sourceRows(db,campaign(db,id)).map(row=>[row.chelovek_id,row]));
  let rows=people.map(person=>{if(!task&&!eligible.has(person))throw new Konflikt('Человек исключён из текущего состава. Проверь базу или выбери историческую волну');const row=db.prepare('SELECT * FROM rassylka_ljudi WHERE rassylka_id=? AND chelovek_id=?').get(id,person)||(!task?eligible.get(person):null);if(!row)throw new OshibkaVvoda('Человека нет в рассылке','chelovek_ids');if(task&&!memberMap.has(person))throw new OshibkaVvoda('Человека нет в составе волны','chelovek_ids');if(t.versii[person]!==token(db,id,person,task))throw new Konflikt('Отметки уже изменились. Прочитай их перед повтором',{otmetki_izmenilis:true});return row;});
  if(task&&rosterState.rows.some(row=>!db.prepare('SELECT 1 FROM ljudi WHERE id=?').get(row.chelovek_id)))throw new OshibkaVvoda('В старом составе есть отсутствующий человек. Сначала нужна сверка связи','zadacha_id');
  if(task&&!db.prepare('SELECT 1 FROM sostavy_voln WHERE zadacha_id=?').get(task))snapshot(db,wave(db,id,task),rosterState.rows,actor,false);
  rows=rows.map(row=>row.id==null?require('./kampanii.js').addTag(db,id,row.chelovek_id,actor):row);
  for(const row of rows){
   const member=task?memberMap.get(row.chelovek_id):null,previous=member?member.status:row.status,oldDate=member?member.kogda:(['otvetil','otkaz'].includes(row.status)?row.otvet_at:row.otpravleno_at);
   if(previous===t.status&&oldDate===date)continue;
   db.prepare('INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,zadacha_id,kogda,chto)VALUES(?,?,?,?,?)').run(id,row.chelovek_id,task,date,t.status);
   if(task)db.prepare('UPDATE uchastniki_voln SET status=?,kogda=?,otschet_at=?,otvet_at=?,versija=versija+1 WHERE zadacha_id=? AND chelovek_id=?').run(t.status,date,t.status==='ne_otpravleno'?null:(member.otschet_at||date),['otvetil','otkaz'].includes(t.status)?date:null,task,row.chelovek_id);
                                                                           
   const last=history(db,id,null,row.chelovek_id).filter(k=>statuses.includes(k.chto)).at(-1);
   if(last&&last.zadacha_id===task&&last.kogda===date&&last.chto===t.status){
    const sent=t.status==='ne_otpravleno'?null:task?(member.otschet_at||date):(row.otpravleno_at||date),reply=['otvetil','otkaz'].includes(t.status)?date:null;
    db.prepare('UPDATE rassylka_ljudi SET status=?,otpravleno_at=?,otvet_at=?,zadacha_id=? WHERE id=?').run(t.status,sent,reply,task,row.id);
   }
   require('./obschij.js').v_zhurnal(db,'rassylki',id,'kasanie',null,JSON.stringify({chelovek_id:row.chelovek_id,zadacha_id:task,status:t.status,kogda:date}),actor);
  }
  return {obnovleno:rows.length,status:t.status,zadacha_id:task,kogda:date};
 });
}
function stats(db,id,task,window=null){const state=roster(db,id,task),sent=state.rows.filter(p=>p.status!=null&&p.status!=='ne_otpravleno'),within=value=>value&&(!window||(value.slice(0,10)>=window.nachalo&&value.slice(0,10)<=window.konec));return {sostav_polnyj:state.complete,ljudej_v_volne:state.rows.length,neizvestnyh_otmetok:state.rows.filter(p=>p.status==null).length,otpravleno:sent.length,otvetili:state.rows.filter(p=>p.status==='otvetil').length,otkazy:state.rows.filter(p=>p.status==='otkaz').length,za_nedelju:sent.filter(p=>within(p.otschet_at)).length};}
function taskStats(db,task,window){if(taskRole.planned(db,task))return {fakt:0,fakt_nedeli:0,fakt_nepolnyj:false,pervaja_volna_ne_nachata:true};if(taskRole.collection(task))return {fakt:require('./kampanii.js').sourceRows(db,campaign(db,task.rassylka_id)).length,fakt_nedeli:null,fakt_nepolnyj:false,fakt_tekuschaja_baza:true};const s=stats(db,task.rassylka_id,task.id,window);return {fakt:s.otpravleno,fakt_nedeli:s.za_nedelju,fakt_nepolnyj:!s.sostav_polnyj||s.neizvestnyh_otmetok>0};}
function weeks(ctx){const db=baza(),id=positive(ctx.kljuch,'rassylka_id');campaign(db,id);const items=new Map();for(const row of facts(db,id)){if(!row.otpravleno_at)continue;const day=String(row.otpravleno_at).slice(0,10);if(!validCalendarDay(day))continue;const week=cal.iso_nedelja(day),key=cal.kljuch_nedeli(week.god,week.nomer),entry=items.get(key)||{nedelja:week.nomer,god:week.god,otpravleno:0};entry.otpravleno++;items.set(key,entry);}return {telo:{po_nedeljam:[...items.values()].sort((a,b)=>a.god-b.god||a.nedelja-b.nedelja)}};}

function facts(db,id){
 const out=[];
 for(const task of db.prepare("SELECT z.* FROM zadachi z WHERE z.rassylka_id=? AND "+taskRole.sendingSQL('z')+"").all(id)){
  for(const member of roster(db,id,task.id,true).rows)if(member.status&&member.status!=='ne_otpravleno')out.push({rassylka_id:id,zadacha_id:task.id,chelovek_id:member.chelovek_id,status:member.status,otpravleno_at:member.otschet_at,otvet_at:member.otvet_at});
 }
 const unscoped=new Map(),seen=new Set();
 for(const row of history(db,id,null)){
  if(!statuses.includes(row.chto))continue;seen.add(row.chelovek_id);
  if(row.zadacha_id!=null)continue;
  let current=unscoped.get(row.chelovek_id)||{rassylka_id:id,zadacha_id:null,chelovek_id:row.chelovek_id,status:null,otpravleno_at:null,otvet_at:null};
  current.status=row.chto;if(row.chto==='ne_otpravleno'){current.otpravleno_at=null;current.otvet_at=null;}else{current.otpravleno_at||=row.kogda;current.otvet_at=['otvetil','otkaz'].includes(row.chto)?row.kogda:null;}unscoped.set(row.chelovek_id,current);
 }
 const attributed=new Set(out.map(row=>row.chelovek_id));
                                                                      
                                                                         
 for(const row of db.prepare('SELECT * FROM rassylka_ljudi WHERE rassylka_id=?').all(id))if(!seen.has(row.chelovek_id)&&!attributed.has(row.chelovek_id)&&row.status&&row.status!=='ne_otpravleno')unscoped.set(row.chelovek_id,{...row,zadacha_id:null});
 for(const row of unscoped.values())if(row.status&&row.status!=='ne_otpravleno')out.push(row);
 return out;
}
function within(value,period){return !period||!!value&&String(value).slice(0,10)>=period.nachalo&&String(value).slice(0,10)<=period.konec;}
function campaignStats(db,id,period){const rows=facts(db,id);return {soobschenij_vsego:rows.length,soobschenij_za_nedelju:rows.filter(r=>within(r.otpravleno_at,period)).length,otvetov_vsego:rows.filter(r=>r.status==='otvetil').length,otvetov_za_nedelju:rows.filter(r=>r.status==='otvetil'&&within(r.otvet_at,period)).length};}
function metric(db,name,period,base,direction){if(period?.istoricheskij)return require('./istoricheskie-rassylki.js').metrika(db,name,period,base,direction);let rows=[];for(const c of db.prepare('SELECT id,baza_id,napravlenie FROM rassylki').all())if((!base||c.baza_id===Number(base))&&(!direction||c.napravlenie===direction))rows.push(...facts(db,c.id));if(name==='otvetili_na_rassylku')rows=rows.filter(r=>r.status==='otvetil'&&within(r.otvet_at,period));else if(name==='otkazalis')rows=rows.filter(r=>r.status==='otkaz'&&within(r.otvet_at,period));else rows=rows.filter(r=>within(r.otpravleno_at,period));return name==='rassylok_otpravleno'?new Set(rows.map(r=>r.rassylka_id)).size:rows.length;}

module.exports={previewAddition,addRecipients,list,whom,preview,create,mark,check,cancel,roster,snapshot,onTaskCreated,stats,taskStats,weeks,token,validDay,facts,campaignStats,metric};
