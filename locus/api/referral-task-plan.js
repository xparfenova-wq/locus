const calendar=require('./kalendar.js');
function defaults(day=require('../db/db.js').segodnja()){
 const date=calendar.data(day),week=calendar.iso_nedelja(day);
 const year=date.getUTCFullYear(),month=date.getUTCMonth();
 return {srok:calendar.sdvinut_nedelju(week.god,week.nomer,1).konec,
  period_from:day.slice(0,7)+'-01',
  period_to:new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10),
  period_nazvanie:new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(date)};
}
module.exports={defaults};
