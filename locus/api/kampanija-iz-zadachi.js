                                                                                       
const {OshibkaVvoda,Konflikt}=require('../db/db.js');
function requested(body){return body?.tip==='rassylka'||Object.hasOwn(body||{},'vid_volny');}
function invalid(message,field){throw Object.assign(new OshibkaVvoda(message,field),{kod:422});}
function positive(value,field){if(typeof value==='boolean'||!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))invalid(field==='rassylka_id'?'Выбери существующую рассылку':'Нужно целое положительное целевое число',field);return Number(value);}
function create(db,body,actor){
 const common=require('./obschij.js'),opis=require('./opisanija.js').OPISANIJA,campaigns=require('./kampanii.js'),mode=body.vid_volny;
 if(!['novaja','suschestvuet'].includes(mode))require('./svjaz-rassylki-zadachi.js').missing();const target=positive(body.plan_chislo,'plan_chislo');if(body.tip&&!['rassylka','biznesovaja'].includes(body.tip))invalid('Выбери тип задачи «рассылка»','tip');
 if(body.rol_v_rassylke!==undefined&&body.rol_v_rassylke!=='otpravit')invalid('Для рассылки выбери отправку','rol_v_rassylke');
 if(body.povtorjaetsja)invalid('Волна рассылки создаётся отдельной задачей без правила повтора','povtorjaetsja');if(body.srok)invalid('У задачи рассылки нет срока; её движение видно по прогрессу','srok');
 if(body.status&&!['v_plane','v_processe'].includes(body.status))invalid('Создай открытую задачу; фактические отправки отмечаются в рассылке','status');if(body.shablon&&!['rassylka','rassylka_plan','otpravit_rassylku'].includes(body.shablon)){const template=require('./shablony.js').readable(db,body.shablon,actor);if(require('./rol-zadachi-rassylki.js').template(template)!=='otpravit')invalid('Выбери шаблон отправки рассылки','shablon');}
 const clean={...body,tip:'biznesovaja',plan_chislo:target};for(const field of ['vid_volny','vybor_versija'])delete clean[field];
 if(mode==='novaja'){
  if(body.rassylka_id!=null)invalid('У новой рассылки не должно быть прежней ссылки','rassylka_id');if(!body.napravlenie)invalid('Выбери направление новой рассылки','napravlenie');
  const owner=clean.otvetstvennyj??actor;clean.otvetstvennyj=owner;
  const description={...opis.rassylki,razlozhit_svjazannye:(row,related,connection,author)=>campaigns.createGraph(row,related,connection,author,{sendingTask:clean})};
  const campaign=common.sozdat('rassylki',description,{nazvanie:body.nazvanie,napravlenie:body.napravlenie,kto_vedet:owner,plan_chislo:target,vybor_bazy:'nikogo'},actor);
  return common.odna('zadachi',opis.zadachi,db.prepare('SELECT nomer FROM zadachi WHERE id=?').get(campaign.zadacha_otpravki_id).nomer,actor);
 }
 const id=positive(body.rassylka_id,'rassylka_id'),campaign=db.prepare('SELECT * FROM rassylki WHERE id=?').get(id);if(!campaign||campaign.status==='zavershena')invalid('Выбери действующую рассылку','rassylka_id');
 if(clean.napravlenie&&clean.napravlenie!==campaign.napravlenie)invalid('Задача и рассылка должны быть одного направления','napravlenie');
 const planned=campaigns.planningTask(db,id);if(planned)throw new Konflikt('Первая отправка уже запланирована. Сначала запусти её со страницы рассылки',{planovaja_zadacha:{id:planned.id,nomer:planned.nomer}});
 const selection=require('./volny-rassylok.js').preview({metod:'POST',kljuch:id,avtor:actor,telo:{komu:'vsja_baza'}}).telo;
 if(body.vybor_versija!==selection.vybor_versija)throw new Konflikt('Состав рассылки изменился. Проверь его перед созданием',{vybor_izmenilsja:true});if(!selection.plan)invalid('В рассылке пока нет действующих получателей','rassylka_id');if(target!==selection.plan)invalid('В этой новой волне '+selection.plan+' получателей. Целевое число должно совпадать с проверенным составом','plan_chislo');
 Object.assign(clean,{rassylka_id:id,napravlenie:campaign.napravlenie,otvetstvennyj:clean.otvetstvennyj??campaign.kto_vedet??actor,shablon:body.shablon&&!['rassylka','rassylka_plan','otpravit_rassylku'].includes(body.shablon)?body.shablon:'rassylka'});return common.sozdat('zadachi',opis.zadachi,clean,actor);
}
module.exports={requested,create};
