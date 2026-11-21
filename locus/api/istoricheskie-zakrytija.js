                                                                             
function naDatu(db,task,day){
 require('./kalendar.js').data(day,'den');
 const epoch=db.prepare("SELECT rowid,date(kogda,'+3 hours') den FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND pole='sozdano' ORDER BY rowid DESC LIMIT 1").get(task.id);
 const created=epoch?.den??db.prepare("SELECT date(?,'+3 hours') den").get(task.sozdano).den;
 if(created&&created>day)return {est:false,status:null,udaleno:null,zakryto:null};
 const events=db.prepare("SELECT pole,bylo,stalo,srez,date(kogda,'+3 hours') den FROM zhurnal WHERE obekt='zadacha' AND obekt_id=? AND rowid>=? ORDER BY julianday(kogda),rowid").all(task.id,epoch?.rowid??0);
 const boolean=value=>['0','1',0,1].includes(value)?Number(value):null,firstDeletion=events.find(event=>event.pole==='udaleno');
 let status=null,deleted=firstDeletion?boolean(firstDeletion.bylo):task.udaleno?null:0,closed=null;
 for(const event of events){
  if(!event.den||event.den>day)continue;
  let context;try{context=JSON.parse(event.srez);}catch{}
  if(context&&typeof context.status_zadachi==='string'){
   if(status!==context.status_zadachi)closed=null;
   status=context.status_zadachi;
   if(event.pole==='sozdano'&&status==='sdelano')closed=event.den;
   if(Object.hasOwn(context,'udaleno_zadachi'))deleted=boolean(context.udaleno_zadachi);
  }
  if(event.pole==='status'){status=event.stalo;closed=status==='sdelano'?event.den:null;}
  if(event.pole==='udaleno')deleted=boolean(event.stalo);
 }
 return {est:true,status,udaleno:deleted,zakryto:closed};
}
function schitat(db,period,direction){
 require('./kalendar.js').data(period.na_datu,'den');
 const tasks=db.prepare('SELECT * FROM zadachi'+(direction?' WHERE napravlenie=?':'')).all(...(direction?[direction]:[]));let count=0;
 for(const task of tasks){
  const state=naDatu(db,task,period.na_datu);if(!state.est||state.udaleno===1)continue;
  if(state.udaleno===null||state.status===null||state.status==='sdelano'&&state.zakryto===null)return null;
  if(state.status==='sdelano'&&state.zakryto>=period.nachalo&&state.zakryto<=period.konec)count++;
 }
 return count;
}
module.exports={schitat,naDatu};
