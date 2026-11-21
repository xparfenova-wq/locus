const taskRole=require('./rol-zadachi-rassylki.js');
                                                                               
                                                                             
const {createHash}=require('node:crypto');
const {baza,v_api,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,Konflikt,seichas,segodnja}=require('../db/db.js');
const membership=require('./sostojanie-strok-bazy.js');
const ACTIVATE=Symbol('activate-reviewed-first-wave');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function positive(value,field){if(typeof value==='boolean'||!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))throw new OshibkaVvoda('Нужно целое положительное число',field);return Number(value);}
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value))throw new OshibkaVvoda('Нужен объект параметров');for(const key of Object.keys(value))if(!allowed.includes(key))throw new OshibkaVvoda('Неизвестный параметр кампании',key);}
function profile(db,id){return db.prepare('SELECT * FROM plany_kampanij WHERE rassylka_id=?').get(id)||null;}
function presentation(db,row){
 const plan=profile(db,row.id),task=id=>id?db.prepare('SELECT id,nomer,nazvanie,status,versija,otvetstvennyj,plan_chislo,shablon,udaleno FROM zadachi WHERE id=?').get(id)||null:null;
 const source=sourceStats(db,row);
 return {...v_api(row),razmer_bazy:source.razmer_bazy,otpravleno:source.otpravleno,kontekst_plana:require('./plan-kampanii.js').context(db,row),plan_chislo:plan?.plan_chislo??null,versija_plana:plan?.versija??null,zadacha_bazy_id:plan?.zadacha_bazy_id??null,zadacha_otpravki_id:plan?.zadacha_otpravki_id??null,zadachi_kampanii:plan?[task(plan.zadacha_bazy_id),task(plan.zadacha_otpravki_id)].filter(Boolean).map(v_api):[]};
}
function selectSource(db,data,related,actor){
 const direction=data.napravlenie;if(typeof direction!=='string'||!db.prepare('SELECT 1 FROM napravlenija WHERE kod=? AND COALESCE(arhiv,0)=0').get(direction))throw new OshibkaVvoda('Выбери действующее направление','napravlenie');
 const mode=related.vybor_bazy??(data.baza_id==null?'nikogo':'baza');if(!['nikogo','lid','klient','vseh','baza'].includes(mode))throw new OshibkaVvoda('Неизвестный источник людей','vybor_bazy');
 if(data.baza_id!=null&&mode!=='baza')throw new OshibkaVvoda('Выбери базу либо людей направления','baza_id');
 let base=null,people=[];
 if(mode==='baza'){
  const id=positive(data.baza_id,'baza_id');base=db.prepare('SELECT * FROM bazy WHERE id=?').get(id);if(!base||base.arhiv===1)throw new OshibkaVvoda('База не найдена или в архиве','baza_id');if(base.napravlenie!==direction)throw new OshibkaVvoda('База относится к другому направлению','baza_id');
  people=db.prepare("SELECT DISTINCT l.id,l.imja FROM bazy_ljudi bl JOIN ljudi l ON l.id=bl.kto WHERE bl.baza_id=? AND "+membership.active('bl')+" AND l.rol_v_baze IS NOT 'kontaktnoe_lico' ORDER BY l.id").all(id);
 }else if(mode!=='nikogo'){
  people=db.prepare("SELECT DISTINCT l.id,l.imja FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id WHERE s.napravlenie=? AND COALESCE(s.arhiv,0)=0 AND COALESCE(l.arhiv,0)=0 AND l.rol_v_baze IS NOT 'kontaktnoe_lico'"+(mode==='vseh'?'':' AND s.rol=?')+' ORDER BY l.id').all(direction,...(mode==='vseh'?[]:[mode]));
 }
 return {vybor_bazy:mode,baza_id:base?.id??null,spisok:people,vsego:people.length,vybor_versija:hash({actor,direction,mode,base:base?{id:base.id,version:base.versija??null,name:base.nazvanie,kind:base.chto_vnutri}:null,people:people.map(row=>row.id)})};
}
function prepareCreation(data,db,actor,related){
 if(typeof data.nazvanie!=='string'||!data.nazvanie.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,'')||Array.from(data.nazvanie).length>2000)throw new OshibkaVvoda('Нужно название не длиннее 2000 символов','nazvanie');
 data.nazvanie=data.nazvanie.trim();const target=positive(related.plan_chislo,'plan_chislo'),owner=positive(data.kto_vedet??actor,'kto_vedet'),person=db.prepare('SELECT * FROM ljudi WHERE id=?').get(owner);
 if(!person||person.komanda!==1||person.aktiven===0||person.arhiv===1)throw new OshibkaVvoda('Нужен действующий участник команды','kto_vedet');data.kto_vedet=owner;
 const selected=selectSource(db,data,related,actor);if(selected.vybor_bazy!=='nikogo'&&related.vybor_versija!==selected.vybor_versija)throw new Konflikt('Состав источника изменился. Проверь его перед созданием',{vybor_izmenilsja:true});
 related.prepared={target,selected};if(data.status===undefined)data.status='gotovitsja';if(data.tip===undefined)data.tip='klientskaja';
 for(const field of ['nachalo','konec'])if(data[field]!=null)require('./kalendar.js').data(data[field],field);
 if(data.nachalo&&data.konec&&data.konec<data.nachalo)throw new OshibkaVvoda('Завершение раньше начала','konec');
}
function addTag(db,id,person,actor){
 const exists=db.prepare('SELECT * FROM rassylka_ljudi WHERE rassylka_id=? AND chelovek_id=?').get(id,person);if(exists)return exists;
 require('./kontaktnye-lica.js').proverit_dlja_rassylki(db,person);
 const row=db.prepare("INSERT INTO rassylka_ljudi(rassylka_id,chelovek_id,status)VALUES(?,?,'ne_otpravleno')RETURNING *").get(id,person);
 db.prepare("INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,kogda,chto)VALUES(?,?,?,'dobavlen')").run(id,person,segodnja());
 require('./obschij.js').v_zhurnal(db,'rassylki',id,'kasanie',null,JSON.stringify({chelovek_id:person,chto:'dobavlen'}),actor);return row;
}
function syncBasePerson(db,base,person,actor){
 for(const campaign of db.prepare("SELECT id FROM rassylki WHERE baza_id=? AND COALESCE(status,'gotovitsja')<>'zavershena'").all(base))addTag(db,campaign.id,person,actor);
}
function addSourceMember(db,campaign,person,actor){
 if(campaign.baza_id==null)return;const existing=db.prepare('SELECT id FROM bazy_ljudi WHERE baza_id=? AND kto=?').get(campaign.baza_id,person);if(existing){if(membership.archived(db,existing.id))throw new Konflikt('Строка исключена из базы. Сначала явно верни её со страницы базы');return;}
 require('./podruchki2.js').bazy_ljudi({kljuch:campaign.baza_id,metod:'POST',avtor:actor,telo:{kto:person}});
}
function validateCampaignChange(data,before,db){
 if(data.nazvanie!==undefined&&(typeof data.nazvanie!=='string'||!data.nazvanie.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,'')||Array.from(data.nazvanie).length>2000))throw new OshibkaVvoda('Нужно название не длиннее 2000 символов','nazvanie');
 const base=data.baza_id===undefined?before.baza_id:data.baza_id,direction=data.napravlenie===undefined?before.napravlenie:data.napravlenie;
 if(base!=null){const row=db.prepare('SELECT * FROM bazy WHERE id=?').get(positive(base,'baza_id'));if(!row||row.napravlenie!==direction)throw new OshibkaVvoda('База не найдена в этом направлении','baza_id');}
 if(data.napravlenie!==undefined&&data.napravlenie!==before.napravlenie&&db.prepare('SELECT 1 FROM zadachi WHERE rassylka_id=? LIMIT 1').get(before.id))throw new Konflikt('У кампании уже есть задачи. Для другого направления создай новую кампанию');
}

function createGraph(row,related,db,actor,options={}){
 const prepared=related.prepared;if(!prepared)throw new Error('Campaign source was not prepared');const {target,selected}=prepared;
 db.prepare('INSERT INTO plany_kampanij(rassylka_id,plan_chislo,avtor,sozdano)VALUES(?,?,?,?)').run(row.id,target,actor,seichas());
 for(const person of selected.spisok)addTag(db,row.id,person.id,actor);
 const common=require('./obschij.js'),description=require('./opisanija.js').OPISANIJA.zadachi,shared={napravlenie:row.napravlenie,otvetstvennyj:row.kto_vedet,status:'v_plane',tip:'biznesovaja',rassylka_id:row.id,plan_chislo:target};
 const collect=common.sozdat('zadachi',description,{...shared,nazvanie:'Собрать базу: '+row.nazvanie,shablon:'sobrat_bazu',rol_v_rassylke:'sobrat_bazu'},actor);
 db.prepare('UPDATE plany_kampanij SET zadacha_bazy_id=? WHERE rassylka_id=?').run(collect.id,row.id);
 const selectedTemplate=options.sendingTask?.shablon,ownTemplate=selectedTemplate&&!['rassylka','rassylka_plan','otpravit_rassylku'].includes(selectedTemplate);
 const send=common.sozdat('zadachi',description,{...shared,...(options.sendingTask||{nazvanie:'Отправить рассылку: '+row.nazvanie}),rassylka_id:row.id,shablon:ownTemplate?selectedTemplate:'rassylka_plan',rol_v_rassylke:'otpravit',plan_chislo:target},actor);
 db.prepare('UPDATE plany_kampanij SET zadacha_otpravki_id=? WHERE rassylka_id=?').run(send.id,row.id);
 return presentation(db,row);
}
function planningTask(db,campaign){const p=profile(db,campaign);if(!p?.zadacha_otpravki_id)return null;const row=db.prepare("SELECT * FROM zadachi WHERE id=? AND rassylka_id=? AND status NOT IN ('sdelano','kogda_nibud') AND COALESCE(udaleno,0)=0").get(p.zadacha_otpravki_id,campaign);return row&&taskRole.of(row)===taskRole.SEND&&!db.prepare('SELECT 1 FROM sostavy_voln WHERE zadacha_id=?').get(row.id)?row:null;}
function registerPlanningTask(db,task){const p=profile(db,task.rassylka_id);if(!p||p.zadacha_otpravki_id!=null)throw new OshibkaVvoda('Плановая отправка создаётся вместе с кампанией','shablon');db.prepare('UPDATE plany_kampanij SET zadacha_otpravki_id=? WHERE rassylka_id=?').run(task.id,task.rassylka_id);}
function activateBody(body){Object.defineProperty(body,ACTIVATE,{value:true});return body;}
function validateTaskChange(data,before,db,body){
 const p=db.prepare('SELECT * FROM plany_kampanij WHERE zadacha_bazy_id=? OR zadacha_otpravki_id=?').get(before.id,before.id);if(!p)return;
 if(data.rassylka_id!==undefined&&data.rassylka_id!==before.rassylka_id)throw new Konflikt('Задача связана с планом кампании. Для другой кампании создай отдельную задачу');
 if(taskRole.planned(db,before)&&data.shablon!==undefined&&data.shablon!==before.shablon&&!body?.[ACTIVATE])throw new Konflikt('Первая волна запускается со страницы рассылки после проверки состава');
 if(!body?.[ACTIVATE]&&(taskRole.collection(before)||taskRole.planned(db,before))&&data.plan_chislo!==undefined&&data.plan_chislo!==p.plan_chislo)throw new Konflikt('Общий план задаётся в кампании');
}
function sourceRows(db,campaign){
 const saved=db.prepare('SELECT rl.*,l.imja FROM rassylka_ljudi rl LEFT JOIN ljudi l ON l.id=rl.chelovek_id WHERE rl.rassylka_id=? ORDER BY rl.id').all(campaign.id);if(campaign.baza_id==null||campaign.status==='zavershena')return saved;
 const base=db.prepare('SELECT 1 FROM bazy WHERE id=?').get(campaign.baza_id);if(!base)return saved;
 const byPerson=new Map(saved.map(row=>[row.chelovek_id,row]));return db.prepare("SELECT DISTINCT l.id,l.imja FROM bazy_ljudi bl JOIN ljudi l ON l.id=bl.kto WHERE bl.baza_id=? AND "+membership.active('bl')+" AND l.rol_v_baze IS NOT 'kontaktnoe_lico' ORDER BY l.id").all(campaign.baza_id).map(person=>byPerson.get(person.id)||{id:null,rassylka_id:campaign.id,chelovek_id:person.id,imja:person.imja,status:'ne_otpravleno',otpravleno_at:null,otvet_at:null,zametka:null,zadacha_id:null});
}
                                                                            
                                                                                   
function sourceStats(db,campaign,window){
 const rows=sourceRows(db,campaign),sent=rows.filter(row=>row.status&&row.status!=='ne_otpravleno').length;
 const count=status=>rows.filter(row=>row.status===status).length;
 const within=field=>window?rows.filter(row=>row[field]&&String(row[field]).slice(0,10)>=window.nachalo&&String(row[field]).slice(0,10)<=window.konec).length:null;
 return {razmer_bazy:rows.length,otpravleno:sent,otvetili:count('otvetil'),otkazy:count('otkaz'),ostalos:Math.max(0,rows.length-sent),otklik_procent:sent?Math.round(count('otvetil')/sent*100):0,za_nedelju:{otpravleno:within('otpravleno_at'),otvetili:within('otvet_at')}};
}
                                                                            
                                                                               
function weeklyPredicate(alias,week){
 if(!['','z','zadachi'].includes(alias))throw new Error('Invalid internal task alias');
 const p=alias?alias+'.':'',current=require('./kalendar.js').iso_nedelja(segodnja());
 if(!Number.isInteger(week.nomer)||!Number.isInteger(week.god))throw new Error('Invalid internal week');
 const stored=`((${p}sprint=${week.nomer} AND ${p}god_sprinta=${week.god}) OR ${p}povtorjaetsja=1)`;
 if(week.nomer!==current.nomer||week.god!==current.god)return stored;
 const open=`COALESCE(${p}status,'v_plane') NOT IN ('sdelano','kogda_nibud')`,linked=status=>`EXISTS(SELECT 1 FROM rassylki campaign_week WHERE campaign_week.id=${p}rassylka_id AND campaign_week.status='${status}')`;
 return `((${stored} OR (${open} AND ${linked('idet')})) AND NOT (${open} AND ${linked('zavershena')}))`;
}
function handle(ctx){
 const db=baza(),store=require('./zapros-sozdanija.js'),actor=positive(ctx.avtor,'avtor');
 if(ctx.dejstvie==='istochniki'){
  if(ctx.metod!=='GET'||ctx.kljuch)throw Object.assign(new Error('Нужен GET источников кампании'),{kod:405});fields(ctx.zapros,['napravlenie']);selectSource(db,ctx.zapros,{vybor_bazy:'nikogo'},actor);
  const bases=db.prepare("SELECT b.id,b.nazvanie,b.chto_vnutri,(SELECT count(*) FROM bazy_ljudi bl JOIN ljudi l ON l.id=bl.kto WHERE bl.baza_id=b.id AND "+membership.active('bl')+" AND l.rol_v_baze IS NOT 'kontaktnoe_lico') vsego FROM bazy b WHERE b.napravlenie=? AND COALESCE(b.arhiv,0)=0 ORDER BY b.nazvanie,b.id").all(ctx.zapros.napravlenie);
  const people=db.prepare("SELECT id,imja FROM ljudi WHERE komanda=1 AND COALESCE(aktiven,1)=1 AND COALESCE(arhiv,0)=0 ORDER BY imja,id").all();return {telo:{bazy:bases,ljudi:people}};
 }

 if(ctx.dejstvie==='predprosmotr_sozdanija'){
  if(ctx.metod!=='POST'||ctx.kljuch)throw Object.assign(new Error('Нужен POST проверки новой кампании'),{kod:405});fields(ctx.telo,['napravlenie','baza_id','vybor_bazy']);return {telo:selectSource(db,ctx.telo,ctx.telo,actor)};
 }
 if(ctx.dejstvie==='proverka'){if(ctx.metod!=='GET'||ctx.kljuch)throw Object.assign(new Error('Нужен GET проверки добавления'),{kod:405});fields(ctx.zapros,['zapros_kljuch']);return {telo:store.check(db,actor,'rassylki',actor,ctx.zapros.zapros_kljuch,row=>presentation(db,row))};}
 if(ctx.dejstvie==='otmena_popytki'){if(ctx.metod!=='POST'||ctx.kljuch)throw Object.assign(new Error('Нужен POST отмены попытки'),{kod:405});fields(ctx.telo,['zapros_kljuch']);return v_odnoj_tranzakcii(db,()=>({telo:store.cancel(db,actor,'rassylki',actor,ctx.telo.zapros_kljuch,row=>presentation(db,row))}));}
 if(ctx.metod==='POST'&&!ctx.kljuch&&!ctx.dejstvie){
  fields(ctx.telo,['zapros_kljuch','nazvanie','napravlenie','baza_id','ploshadka','tip','segment','offer','kto_vedet','status','nachalo','konec','plan_chislo','vybor_bazy','vybor_versija']);const body={...ctx.telo},key=body.zapros_kljuch;delete body.zapros_kljuch;
  return v_odnoj_tranzakcii(db,()=>({kod:201,telo:store.create(db,actor,'rassylki',actor,key,body,()=>require('./obschij.js').sozdat('rassylki',require('./opisanija.js').OPISANIJA.rassylki,body,actor),row=>presentation(db,row))}));
 }
 return null;
}
module.exports={weeklyPredicate,handle,profile,presentation,selectSource,prepareCreation,createGraph,addTag,planningTask,registerPlanningTask,activateBody,validateTaskChange,sourceRows,sourceStats,syncBasePerson,addSourceMember,validateCampaignChange};
