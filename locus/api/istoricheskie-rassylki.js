const statuses=new Set(['ne_otpravleno','otpravleno','otvetil','otkaz']);
const cal=require('./kalendar.js');
const dates=require('./vremja-obschenija.js');
const day=value=>dates.den(value);
function fakty(db,campaign,cutoff){
 cal.data(cutoff,'den');
 const groups=new Map(),key=(task,person)=>(task??'none')+':'+person;
 const events=db.prepare('SELECT rowid,* FROM rassylka_kasanija WHERE rassylka_id=?').all(campaign).sort((a,b)=>(dates.prochitat(a.kogda)?.moment??0)-(dates.prochitat(b.kogda)?.moment??0)||a.rowid-b.rowid);
 let unknownSend=false,unknownReply=false;
 for(const event of events){
  if(!statuses.has(event.chto))continue;
  const id=key(event.zadacha_id,event.chelovek_id),group=groups.get(id)||{rassylka_id:campaign,zadacha_id:event.zadacha_id,chelovek_id:event.chelovek_id,status:null,otpravleno_at:null,otvet_at:null,events:0};groups.set(id,group);
  const date=day(event.kogda);if(!date){unknownSend=true;unknownReply=true;continue;}if(date>cutoff)continue;
  group.events++;group.status=event.chto;
  if(event.chto==='ne_otpravleno'){group.otpravleno_at=null;group.otvet_at=null;}
  else{group.otpravleno_at||=date;group.otvet_at=['otvetil','otkaz'].includes(event.chto)?date:null;}
 }
 const legacy=(row,task,sentField,complete=false)=>{
  const id=key(task,row.chelovek_id),known=groups.get(id);if(known?.events)return;
  if(complete)return;                                                 
  if(row.status==null){unknownSend=true;unknownReply=true;return;}
  const sent=day(row[sentField]),reply=day(row.otvet_at);
  if(!sent){if(row.status&&row.status!=='ne_otpravleno'){unknownSend=true;unknownReply=true;}else if(known){unknownSend=true;unknownReply=true;}return;}
  if(sent>cutoff)return;
                                                                          
                                                                  
  const state=reply&&reply<=cutoff&&['otvetil','otkaz'].includes(row.status)?row.status:'otpravleno';
  groups.set(id,{rassylka_id:campaign,zadacha_id:task,chelovek_id:row.chelovek_id,status:state,otpravleno_at:sent,otvet_at:state==='otpravleno'?null:reply,events:0});
  if(state==='otpravleno')unknownReply=true;
 };
 const scoped=new Set();
 for(const saved of db.prepare('SELECT * FROM sostavy_voln WHERE rassylka_id=?').all(campaign)){
  for(const member of db.prepare('SELECT * FROM uchastniki_voln WHERE zadacha_id=?').all(saved.zadacha_id)){scoped.add(member.chelovek_id);legacy(member,saved.zadacha_id,'otschet_at',saved.polnyj===1);}
 }
 for(const row of db.prepare('SELECT * FROM rassylka_ljudi WHERE rassylka_id=?').all(campaign)){
  if(row.zadacha_id!=null){if(!db.prepare('SELECT 1 FROM sostavy_voln WHERE zadacha_id=? AND rassylka_id=?').get(row.zadacha_id,campaign)&&!groups.get(key(row.zadacha_id,row.chelovek_id))?.events){unknownSend=true;unknownReply=true;}continue;}
  if(!scoped.has(row.chelovek_id))legacy(row,null,'otpravleno_at');
 }
 return {rows:[...groups.values()].filter(row=>row.status&&row.status!=='ne_otpravleno'),unknownSend,unknownReply};
}
function metrika(db,name,period,base,direction){
 let rows=[],unknown=false;
 for(const campaign of db.prepare('SELECT id,baza_id,napravlenie FROM rassylki').all()){
  if(base&&campaign.baza_id!==Number(base)||direction&&campaign.napravlenie!==direction)continue;
  const slice=fakty(db,campaign.id,period.na_datu);rows.push(...slice.rows);unknown||=['otvetili_na_rassylku','otkazalis'].includes(name)?slice.unknownReply:slice.unknownSend;
 }
 if(unknown)return null;
 const within=value=>value&&value>=period.nachalo&&value<=period.konec;
 if(name==='otvetili_na_rassylku')rows=rows.filter(row=>row.status==='otvetil'&&within(row.otvet_at));
 else if(name==='otkazalis')rows=rows.filter(row=>row.status==='otkaz'&&within(row.otvet_at));
 else rows=rows.filter(row=>within(row.otpravleno_at));
 return name==='rassylok_otpravleno'?new Set(rows.map(row=>row.rassylka_id)).size:rows.length;
}
module.exports={fakty,metrika};
