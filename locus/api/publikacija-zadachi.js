const {OshibkaVvoda,Konflikt}=require('../db/db.js');
const FIELDS=['publikacija','ploshadka','data_vyhoda','format','rubrika','akkaunt_id'];
function validate(db,change,before=null,seen=null){
 if(before&&(['publikacija','ploshadka','akkaunt_id','data_vyhoda'].some(key=>Object.hasOwn(change,key)&&change[key]!==before[key])||Object.hasOwn(change,'ohvat'))&&db.prepare('SELECT 1 FROM istochniki_publikacij_zadach WHERE zadacha_id=?').get(before.id)){
  throw new Konflikt(Object.hasOwn(change,'ohvat')?'Охват обновляется из выбранной публикации. Передай её замер через сборщик.':'Сначала отсоедини вышедшую публикацию перед изменением её аккаунта, площадки или даты.');
 }
 require('./akkaunt-zadachi.js').validate(db,change,before,seen);
 if(before&&!FIELDS.some(key=>Object.hasOwn(change,key))&&!Object.hasOwn(change,'ohvat'))return;
 const task={...before,...change},required=task.publikacija===1;
 if(before&&Object.hasOwn(change,'publikacija')&&!required&&task.tip==='biznesovaja'&&task.plan_chislo==null)throw new OshibkaVvoda('Для бизнесовой задачи без признака публикации нужно целевое число','plan_chislo');
 if(Object.hasOwn(change,'ohvat')&&!required)throw new OshibkaVvoda('ohvat измеряется у публикации','ohvat');
 const {PLOSHADKI,FORMATY_PUBLIKACII}=require('./opisanija.js');
 for(const [key,allowed]of [['ploshadka',PLOSHADKI],['format',FORMATY_PUBLIKACII]]){
  const value=task[key];if(required&&(value===null||value===undefined||value===''))throw new OshibkaVvoda(key+' обязательна',key);
  if(value!==null&&value!==undefined&&value!==''&&(typeof value!=='string'||!allowed.includes(value)))throw new OshibkaVvoda(key+' вне списка',key);
 }
 if(required&&!task.data_vyhoda)throw new OshibkaVvoda('data_vyhoda: формат ГГГГ-ММ-ДД','data_vyhoda');
 if(task.data_vyhoda!==null&&task.data_vyhoda!==undefined&&task.data_vyhoda!=='')require('./povtory.js').proverit_datu(task.data_vyhoda,'data_vyhoda');
 if(task.rubrika!==undefined&&task.rubrika!==null&&(typeof task.rubrika!=='string'||Array.from(task.rubrika).length>100))throw new OshibkaVvoda('rubrika не длиннее 100 символов','rubrika');
 if(task.akkaunt_id!==null&&task.akkaunt_id!==undefined){
  const account=db.prepare('SELECT ploshadka,udalen FROM akkaunty WHERE id=?').get(task.akkaunt_id);if(!account||account.udalen)throw new OshibkaVvoda('akkaunt_id: аккаунт не найден','akkaunt_id');
  if(task.ploshadka&&account.ploshadka!==task.ploshadka)throw new OshibkaVvoda('аккаунт не с этой площадки','akkaunt_id');
 }
}
module.exports={validate,FIELDS};
