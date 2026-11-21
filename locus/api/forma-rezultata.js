const {OshibkaVvoda}=require('../db/db.js');
const own=(o,k)=>Object.hasOwn(o,k),types=new Set(['chislo','veha','dengi','rubl','rubli','rub']);
function bad(message,field,code=422){throw Object.assign(new OshibkaVvoda(message,field),{kod:code});}
function numeric(value,field){try{return require('./ruchnoj-zamer.js').number(value);}catch{bad('Укажи конечное число не длиннее 15 знаков',field);}}
function validate(data,before,raw){
 const fresh=!before,tip=own(raw,'tip')?raw.tip:before?.tip??'chislo';
 if(!types.has(tip))bad('Выбери число, денежный результат или веху','tip',400);
 if(own(raw,'nazvanie')){if(typeof raw.nazvanie!=='string'||!raw.nazvanie.trim())bad('Напиши, что измеряем','nazvanie',400);if(raw.nazvanie.trim().length>200)bad('Название результата не длиннее 200 знаков','nazvanie',400);data.nazvanie=raw.nazvanie.trim();}
 if(fresh&&!own(raw,'tip'))data.tip='chislo';
 if(tip==='veha'){
  if(own(raw,'plan')&&raw.plan!==null)bad('У вехи нет числового плана','plan');
  if(own(raw,'baza')&&raw.baza!==null)bad('У вехи базы нет','baza',400);
  if(fresh||own(raw,'tip')){data.plan=null;data.baza=null;}
 }else{
  if(fresh||own(raw,'plan')||own(raw,'tip')){const plan=numeric(own(raw,'plan')?raw.plan:before?.plan,'plan');if(plan<=0)bad('План должен быть больше нуля','plan');data.plan=plan;}
  if(own(raw,'baza'))data.baza=raw.baza===null?null:numeric(raw.baza,'baza');
  else if(fresh)data.baza=null;
 }
 return null;
}
function advisory(db,goal){
 const count=db.prepare('SELECT count(*) n FROM rezultaty WHERE cel_id=?').get(goal).n;
 return {rezultatov:count,nepolnaja:count<2,...(count>5?{podskazka:'У цели '+count+' результатов. Рекомендуется от двух до пяти: проверь, какие действительно показывают достижение цели.'}:count<2?{podskazka:'У цели пока один результат. Рекомендуется от двух до пяти: добавь недостающие показатели.'}:{})};
}
module.exports={validate,advisory};
