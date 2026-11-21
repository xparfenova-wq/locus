                                                                             
                                                                               
const {segodnja}=require('../db/db.js'),dates=require('./vremja-obschenija.js');
function srez(db,period,direction){
 const day=[period?.na_datu??period?.konec??segodnja(),segodnja()].sort()[0],start=period?.nachalo??'0001-01-01';require('./kalendar.js').data(day,'den');
 const rows=db.prepare('SELECT * FROM zadachi WHERE publikacija=1'+(direction?' AND napravlenie=?':'')).all(...(direction?[direction]:[]));
 let published=0,uncertain=0,sum=0,covered=0,updated=null,dateConflicts=0;
 for(const task of rows){
  const actual=dates.den(task.data_vyhoda??task.srok),link=db.prepare('SELECT * FROM istochniki_publikacij_zadach WHERE zadacha_id=?').get(task.id),source=require('./istochnik-publikacii-zadachi.js'),sourceDay=source.actualDate(db,task,link),belongs=date=>!!date&&date>=start&&date<=day,conflict=!!actual&&!!sourceDay&&actual!==sourceDay;
  if(actual&&!belongs(actual)&&(!sourceDay||!belongs(sourceDay)))continue;
  const state=day<segodnja()?require('./istoricheskie-zakrytija.js').naDatu(db,task,day):{est:true,status:task.status,udaleno:task.udaleno??0};
  if(!state.est||state.udaleno===1)continue;
  if(state.status!==null&&state.status!=='sdelano')continue;
  if(conflict)dateConflicts++;
  if(!actual||state.status===null||state.udaleno===null||conflict&&belongs(actual)!==belongs(sourceDay)){uncertain++;continue;}
  published++;
  const value=source.observedReach(db,task,link,day);
  if(value.znachenie===null)continue;
  covered++;sum+=value.znachenie;if(value.data&&(!updated||value.data>updated))updated=value.data;
 }
 const exact=Number.isSafeInteger(sum),complete=uncertain===0&&covered===published;
 return {vyshlo:uncertain?null:published,podtverzhdeno_vyshlo:published,ohvat:complete&&exact?sum:null,izvestnyj_ohvat:exact&&(covered>0||published===0&&uncertain===0)?sum:null,ohvat_po:covered,ohvat_iz:published,bez_istorii:uncertain,raskhozhdenij_dat:dateConflicts,obnovleno:updated,pochemu:dateConflicts?'Дата задачи расходится с источником. Подтверди дату выхода в карточке задачи.':uncertain?'Для части публикаций нет подтверждённого состояния или даты выхода.':!complete?'Охват подтверждён не у всех вышедших публикаций.':!exact?'Сумма охвата не помещается в точный числовой формат.':null};
}
module.exports={srez};
