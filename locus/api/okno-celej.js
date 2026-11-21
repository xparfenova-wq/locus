const {segodnja}=require('../db/db.js');
const calendar=require('./kalendar.js');
const finite=value=>typeof value==='number'&&Number.isFinite(value);

function granicy(goalPeriod,requested,day=segodnja()){
 calendar.data(day,'den');
 const model=require('./celi-model.js'),engine=require('./ekrany.js');
 const period=model.period(requested),view=engine.granicy_perioda(period);
 if(goalPeriod===null||goalPeriod===undefined)return {period,nachalo:view.nachalo,konec:view.konec,na_datu:[day,segodnja(),view.konec].sort()[0],dostupno:false,pochemu:'У цели не указан период. Временной срез не сформирован'};
 const original=engine.granicy_perioda(model.period(String(goalPeriod)));
 const start=[original.nachalo,view.nachalo].sort().at(-1),end=[original.konec,view.konec].sort()[0],cutoff=[day,segodnja(),end].sort()[0];
 if(start>end)return {period,nachalo:view.nachalo,konec:view.konec,na_datu:[day,segodnja(),view.konec].sort()[0],dostupno:false,pochemu:'Выбранное окно не пересекается с периодом цели'};
 return {period,nachalo:start,konec:end,na_datu:cutoff,dostupno:start<=cutoff,pochemu:start>cutoff?'В выбранном периоде ещё нет фактической даты':null};
}

function rezultat(db,goal,row,window,day){
 if(row.cel_id!==goal.id)throw new TypeError('Result does not belong to the selected goal');
 const engine=require('./srez-okr.js');
  const value=window.dostupno?engine.fakt(db,row,day,window):null;
  const ownPeriod=String(goal.period_id)===window.period;
  const savedPlan=ownPeriod?null:db.prepare('SELECT plan,versija,kto,kogda FROM plany_periodov_okr WHERE rezultat_id=? AND period_id=?').get(row.id,window.period);
  const plan=ownPeriod?row.plan:savedPlan?Number(savedPlan.plan):null;
  let movement=null,movementReason=null;
  if(window.dostupno&&finite(value?.fakt)){
   const flow=row.tip!=='veha'&&row.istochnik==='formula'&&!require('./pokazateli.js').MOMENTNYE.has(row.formula);
   if(flow)movement=value.fakt;
   else{
    const first=require('./ekrany.js').granicy_perioda(String(goal.period_id)).nachalo;
    const baseline=window.nachalo===first?row.baza:engine.fakt(db,row,calendar.sdvinut_den(window.nachalo,-1)).fakt;
    if(finite(baseline))movement=Number(require('../public/js/decimal-plan.js').subtract(value.fakt,baseline));
    else movementReason='Нет подтверждённого значения на начало периода. Движение пока неизвестно';
   }
  }
  return {id:row.id,cel_id:goal.id,nazvanie:row.nazvanie,tip:row.tip,istochnik:row.istochnik,formula:row.formula,
   fakt:value?.fakt??null,obnovleno:value?.obnovleno??null,na_datu:window.na_datu,
   istochnik_fakta:value?.istochnik_fakta??row.istochnik??'ruchnoj_zamer',
   kto:value?.poslednij_zamer?.kto??null,kto_imja:value?.poslednij_zamer?.kto_imja??null,
   otkuda:value?.poslednij_zamer?.otkuda??null,
   plan,baza:ownPeriod?row.baza:savedPlan?0:null,
   dvizhenie_perioda:finite(movement)?movement:null,pochemu_net_dvizhenija:movementReason,
   progress_pct:ownPeriod&&value?require('./progress-okr.js').result(row,value.fakt):savedPlan&&finite(movement)?require('./progress-okr.js').result({baza:0,plan,tip:row.tip},movement):null,
   plan_na_okno_zadan:finite(plan),plan_perioda:savedPlan?{...savedPlan}:null,
   pochemu_net_fakta:window.pochemu||value?.pochemu||null};
}

function srez(db,goal,requested,day){
 const window=granicy(goal.period_id,requested,day);
 const results=db.prepare('SELECT * FROM rezultaty WHERE cel_id=? ORDER BY id').all(goal.id).map(row=>rezultat(db,goal,row,window,day));
                                                                              
 return {id:goal.id,period_id:goal.period_id,sostojanie:goal.sostojanie,okno:window,rezultaty:results};
}

module.exports={granicy,srez,rezultat};
