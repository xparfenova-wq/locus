const {OshibkaVvoda,Konflikt}=require('../db/db.js');
const owns=(row,key)=>Object.hasOwn(row,key);
function validate(db,change,before=null){
 const creating=!before,row={...before,...change};
 for(const [key,max] of [['nazvanie',200],['ssylka',500],['zametka',1000]]){
  if(!owns(change,key))continue;
  const value=change[key];
  if(value!=null&&typeof value!=='string')throw new OshibkaVvoda('Нужен текст',key);
  const text=value?.trim()||null;
  if(key==='nazvanie'&&!text)throw new OshibkaVvoda('Укажите название','nazvanie');
  if(text&&Array.from(text).length>max)throw new OshibkaVvoda('Максимум '+max+' знаков',key);
  if(key==='nazvanie'&&/^https?:/i.test(text))throw new OshibkaVvoda('Нужно имя без адреса','nazvanie');
  if(key==='ssylka'&&text){
   let url;try{url=new URL(text);}catch{}
   if(url?.protocol!=='https:'||!url.hostname||url.username||url.password)throw new OshibkaVvoda('Нужна полная ссылка с https','ssylka');
  }
  change[key]=text;row[key]=text;
 }
 if((creating||owns(change,'uroven')||owns(change,'ploshadka'))&&
    (row.uroven==='mtproto'&&row.ploshadka!=='telegram'||row.uroven==='graph'&&row.ploshadka!=='instagram'))
  throw new OshibkaVvoda('Личная статистика не соответствует площадке','uroven');
 if(owns(change,'vladelec')&&row.vladelec!=null){
  const owner=db.prepare('SELECT komanda,arhiv FROM ljudi WHERE id=?').get(row.vladelec);
  if(!owner?.komanda||owner.arhiv)throw new OshibkaVvoda('Выбери действующего участника команды','vladelec');
 }
 if(owns(change,'proekt_id')&&row.proekt_id!=null){
  const project=db.prepare('SELECT arhiv FROM proekty WHERE id=?').get(row.proekt_id);
  if(!project||project.arhiv)throw new OshibkaVvoda('Проект не найден или находится в архиве','proekt_id');
 }
 if(owns(change,'napravlenie')&&row.napravlenie!=null){
  const direction=db.prepare('SELECT arhiv FROM napravlenija WHERE kod=?').get(row.napravlenie);
  if(!direction||direction.arhiv)throw new OshibkaVvoda('Направление не найдено или находится в архиве','napravlenie');
 }
 if(!row.udalen&&(creating||['nazvanie','ploshadka','udalen'].some(key=>owns(change,key)))){
  const duplicate=db.prepare('SELECT id FROM akkaunty WHERE ploshadka=? AND nazvanie=? AND COALESCE(udalen,0)=0 AND id<>?').get(row.ploshadka,row.nazvanie,before?.id??0);
  if(duplicate)throw new Konflikt('Такой аккаунт уже есть',{oshibka:'akkaunt_est',id:duplicate.id,ploshadka:row.ploshadka,nazvanie:row.nazvanie});
 }
}
module.exports={validate};
