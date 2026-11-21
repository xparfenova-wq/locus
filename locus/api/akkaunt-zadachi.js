const {OshibkaVvoda}=require('../db/db.js');
const WATCH=['akkaunt_id','tip','napravlenie','klient_id','sotrudnichestvo_id','proekt_id'];
const JOIN='FROM akkaunty a LEFT JOIN proekty p ON p.id=a.proekt_id';
function list(db,query={}){
 for(const key of Object.keys(query))if(!['tip','napravlenie','klient_id','ploshadka'].includes(key))throw new OshibkaVvoda('Неизвестный параметр выбора аккаунта',key);
 const {tip,napravlenie,ploshadka}=query,where=['COALESCE(a.udalen,0)=0'],values=[];
 if(tip!=null&&!['klientskaja','produktovaja','biznesovaja','vnutrennjaja','kasanie'].includes(tip))throw new OshibkaVvoda('Выбери тип задачи','tip');
 if(napravlenie!=null&&!db.prepare('SELECT 1 FROM napravlenija WHERE kod=?').get(napravlenie))throw new OshibkaVvoda('Направление не найдено','napravlenie');
 if(ploshadka!=null&&!require('./opisanija.js').PLOSHADKI.includes(ploshadka))throw new OshibkaVvoda('Площадка вне списка','ploshadka');
 if(tip==='klientskaja'||query.klient_id!=null){
  const client=Number(query.klient_id);if(Array.isArray(query.klient_id)||!Number.isSafeInteger(client)||client<1||!db.prepare('SELECT 1 FROM ljudi WHERE id=?').get(client))throw new OshibkaVvoda('Выбери клиента перед аккаунтом','klient_id');
  if(napravlenie){where.push('p.klient_id=? AND p.napravlenie=?');values.push(client,napravlenie);}else{where.push('p.klient_id=?');values.push(client);}
 }else if(tip||napravlenie){
  if(!napravlenie)throw new OshibkaVvoda('Выбери направление перед аккаунтом','napravlenie');
  where.push('a.napravlenie=? AND a.proekt_id IS NULL');values.push(napravlenie);
 }
 if(ploshadka){where.push('a.ploshadka=?');values.push(ploshadka);}
 return db.prepare('SELECT a.* '+JOIN+' WHERE '+where.join(' AND ')+' ORDER BY a.porjadok,a.id').all(...values);
}
function eligible(db,task,account){
 let client=task.klient_id;
 if(client==null&&task.sotrudnichestvo_id)client=db.prepare('SELECT chelovek_id FROM sotrudnichestva WHERE id=?').get(task.sotrudnichestvo_id)?.chelovek_id;
 return (task.tip||'vnutrennjaja')==='klientskaja'
  ?account.project_client===client&&account.project_direction===task.napravlenie
  :account.proekt_id==null&&account.napravlenie===task.napravlenie;
}
function validate(db,change,before=null,seen=null){
 if(before&&!WATCH.some(key=>Object.hasOwn(change,key)))return;
 const task={...before,...change};if(before&&(before.akkaunt_id!=null||task.akkaunt_id!=null))require('./versii.js').proverit(db,'zadachi',before,seen,WATCH);if(task.akkaunt_id==null)return;
 const account=db.prepare('SELECT a.*,p.klient_id project_client,p.napravlenie project_direction '+JOIN+' WHERE a.id=? AND COALESCE(a.udalen,0)=0').get(task.akkaunt_id);if(!account)throw new OshibkaVvoda('Аккаунт не найден','akkaunt_id');
 if(!eligible(db,task,account))throw new OshibkaVvoda('Аккаунт не относится к клиенту и направлению этой задачи','akkaunt_id');
}
                                                                              
                                                                             
function references(db,account,field){
 for(const task of db.prepare('SELECT * FROM zadachi WHERE akkaunt_id=?').all(account.id)){
  if(!eligible(db,task,account)||task.ploshadka&&task.ploshadka!==account.ploshadka)
   throw new OshibkaVvoda('Эта привязка не подходит существующим задачам аккаунта. Сначала выбери для них другой аккаунт.',field);
 }
}
function accountChange(db,change,before){
 const keys=['napravlenie','proekt_id','ploshadka'];
 if(!keys.some(key=>Object.hasOwn(change,key)&&change[key]!==before[key]))return;
 const next={...before,...change},project=next.proekt_id?db.prepare('SELECT klient_id,napravlenie FROM proekty WHERE id=?').get(next.proekt_id):null;
 references(db,{...next,project_client:project?.klient_id,project_direction:project?.napravlenie},keys.find(key=>Object.hasOwn(change,key)&&change[key]!==before[key]));
}
function projectChange(db,change,before){
 if(!['klient_id','napravlenie'].some(key=>Object.hasOwn(change,key)&&change[key]!==before[key]))return;
 const next={...before,...change};
 for(const task of db.prepare('SELECT klient_id,napravlenie FROM zadachi WHERE proekt_id=?').all(before.id)){
  if(task.napravlenie&&task.napravlenie!==next.napravlenie||task.klient_id!=null&&Number(task.klient_id)!==Number(next.klient_id))throw new OshibkaVvoda('У проекта есть задачи с прежним клиентом или направлением. Сначала измени их привязку.',Object.hasOwn(change,'klient_id')?'klient_id':'napravlenie');
 }
 for(const account of db.prepare('SELECT * FROM akkaunty WHERE proekt_id=?').all(before.id))
  references(db,{...account,project_client:next.klient_id,project_direction:next.napravlenie},Object.hasOwn(change,'klient_id')?'klient_id':'napravlenie');
}
module.exports={list,validate,accountChange,projectChange,WATCH};
