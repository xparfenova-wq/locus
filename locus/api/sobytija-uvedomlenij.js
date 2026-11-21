                                                                             
                                                                                    
const {seichas}=require('../db/db.js');
const SOBYTIJA=Object.freeze(Object.fromEntries([
 ['komanda_dobavila_zadachu','pro_menja','Вас назначили','zadacha_id'],
 ['komanda_dobavila_podzadachu','pro_menja','Вам добавили подзадачу','zadacha_id'],
 ['pomenjali_srok','pro_menja','Срок изменён','zadacha_id'],
 ['dobavili_uchastnikom','pro_menja','Вас добавили участником','zadacha_id'],
 ['vedushim_proekta','pro_menja','Вас назначили ведущим проекта','proekt_id'],
 ['segodnja_istekaet_srok','pro_menja','Сегодня срок задачи','zadacha_id'],
 ['zadacha_prosrochena','pro_menja','Задача просрочена','zadacha_id'],
 ['upomjanuli_v_kommentarii','pro_menja','Вас упомянули','zadacha_id'],
 ['kommentarij_v_zadache','sobytija','Новый комментарий','zadacha_id'],
 ['zakryli_podzadachu','sobytija','Подзадача закрыта','zadacha_id'],
 ['izmenili_zadachu_uchastnika','sobytija','Задача изменена','zadacha_id'],
                                                                         
                                                                            
 ['podzadacha_v_moej_zadache','sobytija','Добавлена подзадача','zadacha_id'],
 ['novoe','sobytija','Новое в Локусе','lenta_id'],
].map(([tip,potok,zagolovok,ssylka])=>[tip,Object.freeze({potok,zagolovok,ssylka})])));
function oshibka(prichina,tip){
 console.error('[uvedomlenija]',JSON.stringify({prichina,tip:typeof tip==='string'?tip.slice(0,80):null}));
 throw new Error('Не удалось создать уведомление: '+prichina);
}
function id(value){return (typeof value==='number'||typeof value==='string')&&/^[1-9]\d*$/.test(String(value))&&Number.isSafeInteger(Number(value))?Number(value):null;}
function uvedomit(db,event){
 const {komu,avtor,tip,potok}=event,definition=SOBYTIJA[tip];
 if(!Object.hasOwn(SOBYTIJA,tip))oshibka('неизвестный тип события',tip);
 if(tip==='podzadacha_v_moej_zadache')oshibka('исторический тип доступен только для чтения',tip);
 if(potok!==definition.potok)oshibka('неверный поток события',tip);
 if(typeof event.tekst!=='string'||!event.tekst.trim()||event.tekst.includes('\0'))oshibka('пустой или некорректный текст',tip);
 const links={};
 for(const [key,table]of [['zadacha_id','zadachi'],['proekt_id','proekty'],['lenta_id','lenta']]){
  const value=event[key];links[key]=value==null?null:id(value);
  if(value!=null&&(!links[key]||!db.prepare('SELECT 1 FROM '+table+' WHERE id=?').get(links[key])))oshibka('не найдена связанная запись '+key,tip);
  if(key===definition.ssylka&&!links[key])oshibka('не задана ссылка '+key,tip);
  if(key!==definition.ssylka&&links[key])oshibka('лишняя ссылка '+key,tip);
 }
 if(tip==='novoe'&&!db.prepare("SELECT 1 FROM lenta WHERE id=? AND tip='novoe'").get(links.lenta_id))oshibka('ссылка ведёт не на новость',tip);
                                                                         
                                                                               
 if(komu==null||komu==='')return null;
 const recipient=id(komu);
 if(!recipient)oshibka('получатель должен быть точным ID человека',tip);
 const person=db.prepare('SELECT komanda,arhiv FROM ljudi WHERE id=?').get(recipient);
 if(!person)oshibka('не найден получатель',tip);
 if(person.komanda!==1||person.arhiv===1||recipient===Number(avtor))return null;
 const points=Array.from(event.tekst),long=points.length>1000;
 const text=long?points.slice(0,999).join('')+'…':event.tekst;
 if(long)console.warn('[uvedomlenija]',JSON.stringify({preduprezhdenie:'текст сокращён до 1000 символов',tip,dlina:points.length}));
 const result=db.prepare(`INSERT INTO uvedomlenija(chelovek_id,tip,potok,zadacha_id,proekt_id,lenta_id,tekst,prochitano,sozdano)
  VALUES(?,?,?,?,?,?,?,0,?)`).run(recipient,tip,potok,links.zadacha_id,links.proekt_id,links.lenta_id,text,seichas());
 return Number(result.lastInsertRowid);
}
module.exports={SOBYTIJA,uvedomit};
