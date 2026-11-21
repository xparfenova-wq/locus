const {OshibkaVvoda,NetDostupa,Konflikt,segodnja}=require('../db/db.js');
const own=(v,k)=>Object.hasOwn(v||{},k);
const FIELDS=Object.freeze(['nazvanie','opisanie','napravlenie','period_id','tezis_id','sostojanie']);
function period(value){
 if(typeof value==='number'&&Number.isSafeInteger(value))value=String(value);
 if(typeof value!=='string'||!/^[1-9]\d{3}(?:-[Qq][1-4]|-(?:0[1-9]|1[0-2]))?$/.test(value))throw new OshibkaVvoda('Выбери год, квартал или месяц','period_id');
 return value.toUpperCase();
}
function owner(db,goal){return db.prepare("SELECT kto FROM zhurnal WHERE obekt='cel' AND obekt_id=? AND pole='sozdano' ORDER BY id LIMIT 1").get(goal.id)?.kto;}
function canLead(db,goal,actor){
 const member=db.prepare('SELECT komanda,aktiven,arhiv FROM ljudi WHERE id=?').get(actor);
 if(!member?.komanda||!member.aktiven||member.arhiv)return false;
 const admins=new Set((process.env.LOCUS_ADMIN_IDS||'').split(',').map(s=>Number(s.trim())).filter(n=>Number.isSafeInteger(n)&&n>0));
 return admins.has(actor)||db.prepare('SELECT veduschij_id FROM napravlenija WHERE kod=?').get(goal.napravlenie)?.veduschij_id===actor;
}
function canEdit(db,goal,actor){return goal.sostojanie==='chernovik'?Number(owner(db,goal))===Number(actor):canLead(db,goal,actor);}
                                                                            
                                                                              
function open(db,goal){return !goal.period_id||!db.prepare('SELECT zakryt FROM periody WHERE id=?').get(String(goal.period_id))?.zakryt;}
function linked(db,goal){return !!db.prepare('SELECT 1 FROM rezultaty WHERE cel_id=? UNION ALL SELECT 1 FROM zadachi z WHERE z.cel_id=? OR z.rezultat_id IN(SELECT id FROM rezultaty WHERE cel_id=?) LIMIT 1').get(goal.id,goal.id,goal.id);}
function moneyAllowed(db,goal,actor){return require('./dengi-dostup.js').vidit(db,actor)||!db.prepare('SELECT * FROM rezultaty WHERE cel_id=?').all(goal.id).some(row=>require('./dengi-okr.js').isMoney(db,row));}
function permissions(db,goal,actor){
 const money=moneyAllowed(db,goal,actor),writable=money&&canEdit(db,goal,actor)&&open(db,goal)&&goal.sostojanie!=='arhiv',locked=linked(db,goal);
 return {mozhno_pravit:writable,mozhno_arhivirovat:money&&open(db,goal)&&goal.sostojanie==='aktivna'&&canLead(db,goal,actor),mozhno_vernut:money&&open(db,goal)&&goal.sostojanie==='arhiv'&&canLead(db,goal,actor),prichina:!money?'У цели есть денежные результаты. Для изменения нужен доступ к ним':!open(db,goal)?'Период закрыт. Доступен просмотр':goal.sostojanie==='arhiv'?'Цель в архиве. Доступен просмотр':!canEdit(db,goal,actor)?'Действующую цель редактируют ведущий направления и владельцы Локуса':'',zablokirovany:locked?['napravlenie','period_id']:[],prichina_svjazej:locked?'Направление и период сохраняют контекст уже связанных результатов и задач':''};
}
function authorize(db,before,data,actor){
 if(!moneyAllowed(db,before,actor))throw new NetDostupa('У цели есть денежные результаты');
 if(!open(db,before))throw new Konflikt('Период закрыт. Цель доступна только для чтения');
                                                                            
 const keys=Object.keys(data).filter(k=>k!=='versija'),publish=before.sostojanie==='chernovik'&&Number(owner(db,before))===Number(actor)&&keys.length===1&&keys[0]==='sostojanie'&&data.sostojanie==='aktivna';
 if(!publish&&!canEdit(db,before,actor))throw new NetDostupa('Эту цель редактируют ведущий направления и владельцы Локуса');
 if(before.sostojanie==='arhiv'&&!(keys.length===1&&keys[0]==='sostojanie'&&data.sostojanie==='aktivna'&&canLead(db,before,actor)))throw new Konflikt('Цель в архиве. Сначала верни её в работу');
}
function validate(data,before,db,actor,raw=data){
 const creation=!before;
 if(own(data,'nazvanie')){
  if(typeof raw.nazvanie!=='string'||!raw.nazvanie.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,''))throw new OshibkaVvoda('Сформулируй цель','nazvanie');
  if([...raw.nazvanie.trim()].length>300)throw new OshibkaVvoda('Название цели не длиннее 300 знаков','nazvanie');data.nazvanie=raw.nazvanie.trim();
 }
 if(own(data,'opisanie')&&data.opisanie!==null){if(typeof raw.opisanie!=='string')throw new OshibkaVvoda('Описание должно быть текстом','opisanie');if([...raw.opisanie].length>20000)throw new OshibkaVvoda('Описание не длиннее 20 000 знаков','opisanie');}
 if(creation||own(data,'napravlenie')){
  const direction=db.prepare('SELECT kod,arhiv FROM napravlenija WHERE kod=?').get(data.napravlenie??null);
  if(!direction||direction.arhiv&&data.napravlenie!==before?.napravlenie)throw new OshibkaVvoda('Выбери действующее направление','napravlenie');
 }
 if(creation&&!own(data,'period_id')){const day=segodnja();data.period_id=day.slice(0,4)+'-Q'+(Math.floor((Number(day.slice(5,7))-1)/3)+1);}
 if(own(data,'period_id'))data.period_id=period(data.period_id);
 if(before){
  authorize(db,before,data,actor);
  for(const field of ['napravlenie','period_id'])if(own(data,field)&&String(data[field])!==String(before[field])&&linked(db,before))throw new OshibkaVvoda('У цели уже есть связанные результаты или задачи. Направление и период сохраняются',field);
  if(own(data,'napravlenie')&&data.napravlenie!==before.napravlenie&&!canLead(db,{napravlenie:data.napravlenie},actor)&&before.sostojanie!=='chernovik')throw new NetDostupa('Для переноса действующей цели нужен доступ ведущего нового направления');
 }
}
function versionDependencies(data){return [...new Set([...Object.keys(data),'sostojanie','period_id','napravlenie','tezis_id'])];}
module.exports={FIELDS,period,canEdit,canLead,permissions,authorize,validate,versionDependencies};
