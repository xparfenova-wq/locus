                                                                         
                                                
const {segodnja}=require('../db/db.js'),calendar=require('./kalendar.js');
function bounds(goal){return require('./ekrany.js').granicy_perioda(require('./celi-model.js').period(String(goal.period_id)));}
function peresechenie(goal,week){
 const own=bounds(goal),start=[own.nachalo,week.nachalo].sort().at(-1),end=[own.konec,week.konec].sort()[0];
 return start<=end?{nachalo:start,konec:end}:null;
}
function kvartal(day){calendar.data(day,'den');return day.slice(0,4)+'-Q'+Math.ceil(Number(day.slice(5,7))/3);}
function rezultat(db,goal,row,week,day){
 calendar.data(day,'den');const interval=peresechenie(goal,week);if(!interval)return null;
 const engine=require('./okno-celej.js'),anchor=interval.konec,cutoff=[day,segodnja(),interval.konec].sort()[0];
 const weekly={period:week.god+'-W'+String(week.nomer).padStart(2,'0'),...interval,na_datu:cutoff,dostupno:interval.nachalo<=cutoff,pochemu:interval.nachalo>cutoff?'В выбранной неделе ещё нет фактической даты':null};
 const pack=window=>({...window,...engine.rezultat(db,goal,row,window,day)});
 return {nedelja:pack(weekly),mesjac:pack(engine.granicy(goal.period_id,anchor.slice(0,7),cutoff)),kvartal:pack(engine.granicy(goal.period_id,kvartal(anchor),cutoff)),god:pack(engine.granicy(goal.period_id,anchor.slice(0,4),cutoff))};
}
module.exports={bounds,peresechenie,kvartal,rezultat};
