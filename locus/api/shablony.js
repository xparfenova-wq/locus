const {baza,v_api,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,NetDostupa,Konflikt,segodnja}=require('../db/db.js');
const own=(o,k)=>Object.hasOwn(o,k),norm=s=>String(s??'').trim().replace(/\s+/g,' ').toLowerCase().replace(/ё/g,'е');
const hasName=s=>typeof s==='string'&&!!s.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,'');
const DUE_RULES=['konec_nedeli','konec_sledujuschej_nedeli'];
function defaultDue(row){return row.gotovyj&&row.kod==='next_touch'?'konec_sledujuschej_nedeli':row.srok_po_umolchaniju;}
function deadline(row,today=segodnja()){
 const value=defaultDue(row),calendar=require('./kalendar.js');
 if(DUE_RULES.includes(value)){const week=calendar.iso_nedelja(today),chosen=value==='konec_nedeli'?week:calendar.sdvinut_nedelju(week.god,week.nomer,1);return calendar.granicy_nedeli(chosen.god,chosen.nomer).konec;}
 if(value!==null&&value!==undefined&&/^\d+$/.test(String(value)))return calendar.sdvinut_den(today,Number(value));
 return null;
}
function taskDueDays(task){
 if(!task.srok||!/^\d{4}-\d{2}-\d{2}$/.test(task.srok))return null;
 const raw=String(task.sozdano||''),moment=new Date(raw?(raw.includes('T')?raw:raw.replace(' ','T'))+(/(?:Z|[+-]\d\d:\d\d)$/.test(raw)?'':'Z'):NaN);
 const origin=Number.isFinite(moment.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(moment):segodnja();
 return Math.max(0,Math.round((Date.parse(task.srok)-Date.parse(origin))/86400000));
}
function visible(row,actor){return !!row&&(row.gotovyj===1||row.gotovyj===true||row.obschij===1||row.obschij===true||Number(row.avtor)===Number(actor));}
function editable(db,row,actor){
 if(!visible(row,actor)||row.gotovyj)return false;
 if(Number(row.avtor)===Number(actor))return true;
 const owner=db.prepare('SELECT aktiven,dostup FROM ljudi WHERE id=?').get(row.avtor);
 if(owner&&owner.aktiven!==0&&owner.dostup!=='net')return false;
 try{require('./dostup.js').tolko_admin(db,actor);return true;}catch{return false;}
}
const legacyCode=value=>String(value??'')==='send_kp'?'otpravit_kp':String(value??'');
function find(db,key){
 const value=legacyCode(key);let row=db.prepare('SELECT * FROM shablony WHERE kod=?').get(value);
 if(!row&&/^\d+$/.test(value))row=db.prepare('SELECT * FROM shablony WHERE id=?').get(Number(value));
 if(!row&&/^shablon_\d+$/.test(value))row=db.prepare('SELECT * FROM shablony WHERE id=?').get(Number(value.slice(8)));
 return row;
}
function readable(db,key,actor){const row=find(db,key);if(!visible(row,actor))throw new NeNajdeno('Шаблон не найден');return row;}
function writeable(db,row,actor){if(!visible(row,actor))throw new NeNajdeno('Шаблон не найден');if(row.gotovyj)throw Object.assign(new NetDostupa('Готовый шаблон можно дублировать себе'),{dannye:{oshibka:'gotovyj_zaschischen'}});if(!editable(db,row,actor))throw Object.assign(new NetDostupa('Править этот шаблон может его автор'),{dannye:{oshibka:'ne_vladelec'}});}
function steps(value){if(!Array.isArray(value)||value.length>200)throw new OshibkaVvoda('Подзадачи: список до 200 шагов','podzadachi');return value.map(s=>{if(!hasName(s)||s.trim().length>2000)throw new OshibkaVvoda('У каждой подзадачи должно быть название до 2000 знаков','podzadachi');return s.trim();});}
function names(db,id){return db.prepare('SELECT nazvanie FROM shablon_podzadachi WHERE shablon_id=? ORDER BY porjadok,rowid').all(id).map(r=>r.nazvanie);}
function present(db,row,actor){
 const owner=db.prepare('SELECT imja,aktiven,dostup FROM ljudi WHERE id=?').get(row.avtor),children=names(db,row.id),taskCount=db.prepare('SELECT count(*) n FROM zadachi WHERE shablon IN (?,?,?) AND COALESCE(udaleno,0)=0 AND roditel_id IS NULL').get(String(row.id),'shablon_'+row.id,row.kod||String(row.id)).n;
 return {...v_api(row),nuzhna_rassylka:!!require('./rol-zadachi-rassylki.js').template(row),rol_rassylki:require('./rol-zadachi-rassylki.js').template(row),schitat_fakt:row.schitat_fakt==='kontakty'?'kontakty_bazy':row.schitat_fakt||'net',kod:row.kod||String(row.id),obekt:'zadacha',default_due:defaultDue(row)??null,podzadachi:children.join(', ')||null,podzadachi_spisok:children,avtor_imja:owner?.imja??null,vladelec_aktiven:!row.avtor||!!owner&&owner.aktiven!==0&&owner.dostup!=='net',mozhno_pravit:editable(db,row,actor),mozhno_udalit:editable(db,row,actor),zadach_sozdano:taskCount};
}
function list(db,actor,query={}){
 let rows=db.prepare('SELECT * FROM shablony WHERE gotovyj=1 OR obschij=1 OR avtor=? ORDER BY gotovyj DESC,id').all(actor);
 if(query.kod!==undefined)rows=rows.filter(r=>r.kod===legacyCode(query.kod)||String(r.id)===String(query.kod)||'shablon_'+r.id===String(query.kod));
 if(query.tip!==undefined)rows=rows.filter(r=>query.tip==='rassylka'?!!require('./rol-zadachi-rassylki.js').template(r):r.tip===String(query.tip));
 const term=String(query.q||'').trim();if(term)rows=rows.filter(r=>norm(r.nazvanie).includes(norm(term)));
 return {spisok:rows.map(row=>present(db,row,actor)),vsego:rows.length};
}
function validate(db,body,actor,current){
 if(own(body,'avtor')&&Number(body.avtor)!==Number(current?.avtor??actor))throw new OshibkaVvoda('Автора задаёт проверенная сессия','avtor');
 if(own(body,'kod')&&body.kod!==null&&body.kod!=='')throw new OshibkaVvoda('Код закреплён за готовыми шаблонами','kod');
 if(own(body,'nazvanie')){if(!hasName(body.nazvanie)||body.nazvanie.trim().length>2000)throw new OshibkaVvoda('Без названия шаблон не сохранить','nazvanie');body.nazvanie=body.nazvanie.trim();}
 if(own(body,'opisanie')&&body.opisanie!==null&&(typeof body.opisanie!=='string'||body.opisanie.length>50000))throw new OshibkaVvoda('Описание должно быть текстом','opisanie');
 if(own(body,'srok_po_umolchaniju')&&body.srok_po_umolchaniju!==null){const x=body.srok_po_umolchaniju;if(!DUE_RULES.includes(x)){if(typeof x==='boolean'||!/^\d+$/.test(String(x))||Number(x)>36500)throw new OshibkaVvoda('Выбери правило срока или целое число дней от 0 до 36500','srok_po_umolchaniju');body.srok_po_umolchaniju=String(Number(x));}}
 if(own(body,'podzadachi'))body.podzadachi=steps(body.podzadachi);
 const title=own(body,'nazvanie')?body.nazvanie:current?.nazvanie,owner=current?.avtor??actor;
 const duplicate=db.prepare('SELECT id,nazvanie FROM shablony WHERE COALESCE(gotovyj,0)=0 AND avtor=? AND id<>? ORDER BY id').all(owner,current?.id??-1).find(r=>norm(r.nazvanie)===norm(title));
 if(duplicate)throw new Konflikt('У тебя уже есть шаблон с таким названием',{oshibka:'shablon_est',id:duplicate.id,nazvanie:duplicate.nazvanie,predlozhennoe_nazvanie:freeName(db,owner,title)});
 return body;
}
function freeName(db,actor,title){const existing=new Set(db.prepare('SELECT nazvanie FROM shablony WHERE avtor=?').all(actor).map(r=>norm(r.nazvanie)));let n=2,name=title;while(existing.has(norm(name)))name=title+' '+n++;return name;}
function replaceSteps(db,row,value,actor){
 const before=names(db,row.id);if(JSON.stringify(before)===JSON.stringify(value))return;
 db.prepare('DELETE FROM shablon_podzadachi WHERE shablon_id=?').run(row.id);
 const insert=db.prepare('INSERT INTO shablon_podzadachi(shablon_id,nazvanie,porjadok)VALUES(?,?,?)');value.forEach((name,i)=>insert.run(row.id,name,i+1));
 require('./obschij.js').v_zhurnal(db,'shablony',row.id,'podzadachi',JSON.stringify(before),JSON.stringify(value),actor);
}
function create(db,body,actor){
 const input=validate(db,{...body},actor),children=input.podzadachi;delete input.podzadachi;input.avtor=actor;
 const row=require('./obschij.js').sozdat('shablony',require('./opisanija.js').OPISANIJA.shablony,input,actor);
 if(children!==undefined)replaceSteps(db,row,children,actor);
 return db.prepare('SELECT * FROM shablony WHERE id=?').get(row.id);
}
function keyed(db,actor,body,fn){const value=body.zapros_kljuch,input={...body};delete input.zapros_kljuch;return require('./zapros-sozdanija.js').create(db,actor,'shablony',actor,value,input,fn,row=>present(db,row,actor));}
function handle(ctx){
 const {metod,kljuch,avtor,zapros={},telo={}}=ctx;if(ctx.dejstvie)return null;const db=baza();
 if(metod==='GET'){
  if(own(zapros,'zapros_kljuch'))return {telo:require('./zapros-sozdanija.js').check(db,avtor,'shablony',avtor,zapros.zapros_kljuch,row=>present(db,row,avtor))};
  if(kljuch)return {telo:present(db,readable(db,kljuch,avtor),avtor)};
  return {telo:list(db,avtor,zapros)};
 }
 return v_odnoj_tranzakcii(db,()=>{
  if(metod==='POST'&&!kljuch){
   if(telo.otmenit_dobavlenie===true){if(Object.keys(telo).some(k=>!['zapros_kljuch','otmenit_dobavlenie'].includes(k)))throw new OshibkaVvoda('Отмена не принимает поля шаблона');return {telo:require('./zapros-sozdanija.js').cancel(db,avtor,'shablony',avtor,telo.zapros_kljuch,row=>present(db,row,avtor))};}
   const body={...telo};delete body.zapros_kljuch;
   return {kod:201,telo:keyed(db,avtor,telo,()=>create(db,body,avtor))};
  }
  if(metod==='PATCH'&&kljuch){
   const row=readable(db,kljuch,avtor);writeable(db,row,avtor);const body=validate(db,{...telo},avtor,row),children=body.podzadachi;delete body.podzadachi;
   if(children!==undefined)require('./versii.js').proverit(db,'shablony',row,telo.versija,['podzadachi']);
   if(Object.keys(body).some(k=>k!=='versija'))require('./obschij.js').pravit('shablony',require('./opisanija.js').OPISANIJA.shablony,row.id,body,avtor);
   else if(children===undefined)throw new OshibkaVvoda('Нечего менять');
   if(children!==undefined)replaceSteps(db,row,children,avtor);
   return {telo:present(db,db.prepare('SELECT * FROM shablony WHERE id=?').get(row.id),avtor)};
  }
  if(metod==='DELETE'&&kljuch){const row=readable(db,kljuch,avtor);writeable(db,row,avtor);require('./versii.js').proverit(db,'shablony',row,telo.versija,Object.keys(row).concat('podzadachi'));const result=require('./obschij.js').udalit('shablony',require('./opisanija.js').OPISANIJA.shablony,row.id,avtor,{versija:telo.versija});return {telo:result};}
  return null;
 });
}
function duplicate(ctx){
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});
 const db=baza(),row=readable(db,ctx.kljuch,ctx.avtor),body=ctx.telo||{};for(const k of Object.keys(body))if(!['nazvanie','zapros_kljuch'].includes(k))throw new OshibkaVvoda('Неизвестное поле копии',''+k);
 return {kod:201,telo:keyed(db,ctx.avtor,{...body,source_id:row.id,action:'duplicate'},()=>create(db,{nazvanie:body.nazvanie??freeName(db,ctx.avtor,row.nazvanie+' копия'),tip:row.tip,opisanie:row.opisanie,srok_po_umolchaniju:defaultDue(row),schitat_fakt:row.schitat_fakt==='kontakty'?'kontakty_bazy':row.schitat_fakt||'net',obschij:false,podzadachi:names(db,row.id)},ctx.avtor))};
}
function fromTask(ctx){
 if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});
 const db=baza(),body=ctx.telo||{},nomer=Number(body.nomer??body.zadacha_nomer),task=db.prepare('SELECT * FROM zadachi WHERE nomer=? AND COALESCE(udaleno,0)=0').get(nomer);if(!task)throw new NeNajdeno('Задача не найдена');
 for(const k of Object.keys(body))if(!['nomer','zadacha_nomer','nazvanie','schitat_fakt','zapros_kljuch'].includes(k))throw new OshibkaVvoda('Неизвестное поле шаблона',k);
 const due=taskDueDays(task);
 return {telo:keyed(db,ctx.avtor,{...body,source_id:task.id,action:'from_task'},()=>create(db,{nazvanie:body.nazvanie??freeName(db,ctx.avtor,task.nazvanie),tip:task.tip,opisanie:task.opisanie,srok_po_umolchaniju:due===null?null:String(due),schitat_fakt:body.schitat_fakt??(require('./rol-zadachi-rassylki.js').collection(task)?'kontakty_bazy':require('./rol-zadachi-rassylki.js').of(task)==='otpravit'?'otpravleno':'net'),obschij:false,podzadachi:db.prepare('SELECT nazvanie FROM zadachi WHERE roditel_id=? AND COALESCE(udaleno,0)=0 ORDER BY id').all(task.id).map(r=>r.nazvanie)},ctx.avtor))};
}
module.exports={handle,visible,editable,find,readable,writeable,present,list,create,duplicate,fromTask,defaultDue,deadline,taskDueDays};
