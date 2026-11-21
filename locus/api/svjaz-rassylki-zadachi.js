const {OshibkaVvoda,Konflikt,NeNajdeno}=require('../db/db.js');
const role=require('./rol-zadachi-rassylki.js');
const campaignTemplates=new Set(['sobrat_bazu','otpravit_rassylku','rassylka','rassylka_plan']);
function missing(){throw Object.assign(new OshibkaVvoda('Выбери рассылку','rassylka_id'),{kod:422,dannye:{oshibka:'nuzhna_rassylka'}});}
function normalize(db,changes,previous,actor){
 const sourceChanged=Object.hasOwn(changes,'shablon')&&changes.shablon!==previous?.shablon;
 let inferred=null;
 if(sourceChanged&&changes.shablon!=null){
  const key=String(changes.shablon),numeric=/^(?:shablon_)?\d+$/.test(key),templates=require('./istochnik-shablona-zadachi.js'),source=templates.find(db,key);
  if(numeric&&!source)throw new NeNajdeno('Шаблон больше недоступен. Обнови страницу; твой черновик сохранён');
  if(!source&&!templates.workflowNames.has(key))throw new OshibkaVvoda('shablon не найден','shablon');
  if(source){require('./shablony.js').readable(db,source.id,actor);inferred=role.template(source);if(Object.hasOwn(changes,'rol_v_rassylke')&&changes.rol_v_rassylke!=null&&changes.rol_v_rassylke!==inferred)throw new Konflikt('Правило шаблона изменилось. Обнови страницу и сравни сохранённый черновик перед созданием задачи');if(source.gotovyj)changes.shablon=source.kod;}
 }
 if(Object.hasOwn(changes,'rol_v_rassylke')&&changes.rol_v_rassylke!=null&&![role.COLLECT,role.SEND].includes(changes.rol_v_rassylke)&&changes.rol_v_rassylke!==previous?.rol_v_rassylke)throw new OshibkaVvoda('Выбери сбор базы или отправку','rol_v_rassylke');
 const before=role.of(previous)??(previous?.rassylka_id!=null?role.SEND:null),next=inferred??role.of(changes);
 const roleChanged=Object.hasOwn(changes,'rol_v_rassylke')&&changes.rol_v_rassylke!==previous?.rol_v_rassylke;
 if(before&&(next&&before!==next||roleChanged&&changes.rol_v_rassylke!==before))throw new Konflikt('Функция задачи рассылки уже задана. Для другого подсчёта создай новую задачу');
 if(inferred){if(Object.hasOwn(changes,'rol_v_rassylke')&&changes.rol_v_rassylke!=null&&changes.rol_v_rassylke!==inferred)throw new OshibkaVvoda('Шаблон задаёт другой способ подсчёта','rol_v_rassylke');changes.rol_v_rassylke=inferred;}
 if(!previous&&!changes.rol_v_rassylke){const kind=role.of(changes)??(changes.rassylka_id!=null?role.SEND:null);if(kind)changes.rol_v_rassylke=kind;}
}
function validate(db,changes,previous,actor){
 if(previous&&!['shablon','rol_v_rassylke','rassylka_id','napravlenie'].some(k=>Object.hasOwn(changes,k)))return;
 normalize(db,changes,previous,actor);
 const row={...previous,...changes};
 if(!role.of(row)&&row.rassylka_id==null)return;
 if(row.rassylka_id==null||row.rassylka_id==='')missing();
 const campaign=db.prepare('SELECT id,napravlenie,status FROM rassylki WHERE id=?').get(row.rassylka_id);
 if(!campaign)throw new OshibkaVvoda('Рассылка не найдена','rassylka_id');
 if(campaign.napravlenie!==row.napravlenie)throw Object.assign(new OshibkaVvoda('Задача и рассылка должны быть одного направления','napravlenie'),{kod:422});
 if(campaign.status==='zavershena'&&(!previous||previous.rassylka_id!==row.rassylka_id))throw Object.assign(new OshibkaVvoda('Выбери действующую рассылку','rassylka_id'),{kod:422});
}
module.exports={campaignTemplates,missing,normalize,validate};
