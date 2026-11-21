const {segodnja}=require('../db/db.js');
const {dataPolja,momentPolja,poslednee,daty}=require('./snimki-akkaunta.js');
const VIDY=['podpischikov','prirost_podpischikov','publikacij','prosmotrov','prosmotrov_srednee','vovlechennost','ohvat','ohvat_k_podpischikam'];
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function mediana(values){
 const sorted=values.filter(finite).sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
 return !sorted.length?null:sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}
function vovlechennost(posts){
 const complete=posts.filter(p=>finite(p.prosmotrov)&&finite(p.lajkov));
 const views=complete.reduce((sum,p)=>sum+p.prosmotrov,0);
 const reactions=complete.reduce((sum,p)=>sum+p.lajkov+(finite(p.kommentariev)?p.kommentariev:0),0);
 return {znachenie:views?Math.round(reactions/views*1000)/10:null,publikacij_v_schete:complete.length,publikacij_vsego:posts.length};
}
function poPublikacijam(posts){
 const measured=posts.filter(p=>finite(p.prosmotrov));
 const sorted=measured.filter(p=>p.den_vyhoda).slice().sort((a,b)=>Date.parse(b.data_vyhoda)-Date.parse(a.data_vyhoda));
 const half=Math.floor(sorted.length/2),fresh=mediana(sorted.slice(0,half).map(p=>p.prosmotrov)),older=mediana(sorted.slice(half,half*2).map(p=>p.prosmotrov));
 const video=new Set(['video','rils','reels','storis','stories']),days=new Map(),labels=['пн','вт','ср','чт','пт','сб','вс'];
 for(const p of measured){if(!p.den_vyhoda)continue;const day=(new Date(p.den_vyhoda+'T12:00:00Z').getUTCDay()+6)%7;if(!days.has(day))days.set(day,[]);days.get(day).push(p.prosmotrov);}
 let best=null;for(const [day,values] of days){const value=mediana(values);if(!best||value>best.med)best={den:labels[day],med:value,skolko:values.length};}
 const engagement=vovlechennost(posts);
 return {vsego:posts.length,s_zamerom:measured.length,srednie:mediana(measured.map(p=>p.prosmotrov)),vovlechennost:engagement.znachenie,vovl_po:engagement.publikacij_v_schete,
  kuda:fresh!==null&&older!==null?{svezh:fresh,ranshe:older,storona:fresh>older?'вверх':fresh<older?'вниз':'ровно'}:null,
  format:{video:mediana(measured.filter(p=>video.has(p.format)).map(p=>p.prosmotrov)),prochee:mediana(measured.filter(p=>!video.has(p.format)).map(p=>p.prosmotrov))},den:best};
}
function publikacijaNaDatu(post,rows,day,sourceContext=null){
 const historical=day<segodnja(),fields=['prosmotrov','lajkov','kommentariev','peresylok','ohvat'];
 const result={...post},dates={},times={},levels={},contexts={},metadata=daty(post);
 for(const field of fields){
  let observed=null;try{require('./kalendar.js').data(metadata[field],'data');observed=metadata[field];}catch{}
  const candidates=rows.slice();
  if(observed&&observed<=day&&finite(post[field]))candidates.push({...post,data:observed});
  const filtered=sourceContext?candidates.filter(row=>daty(row)._akkaunt?.[field]===sourceContext):candidates;
  const known=poslednee(filtered,field,day),stamp=known&&momentPolja(known,field);
                                                                            
  if(!sourceContext&&!historical&&finite(post[field])&&!observed){
   result[field]=post[field];dates[field]=known&&known[field]===post[field]?dataPolja(known,field):null;
   if(dates[field]&&stamp)times[field]=stamp;if(dates[field]&&daty(known)._uroven?.[field])levels[field]=daty(known)._uroven[field];if(dates[field]&&daty(known)._akkaunt?.[field])contexts[field]=daty(known)._akkaunt[field];continue;
  }
  result[field]=known?known[field]:null;dates[field]=known?dataPolja(known,field):null;
  if(stamp)times[field]=stamp;if(known&&daty(known)._uroven?.[field])levels[field]=daty(known)._uroven[field];if(known&&daty(known)._akkaunt?.[field])contexts[field]=daty(known)._akkaunt[field];
 }
 if(Object.keys(times).length)dates._kogda=times;if(Object.keys(levels).length)dates._uroven=levels;if(Object.keys(contexts).length)dates._akkaunt=contexts;
 result.daty_izmerenij=JSON.stringify(dates);return result;
}
function publikacijaPoId(db,id,day=segodnja(),sourceContext=null){
 require('./kalendar.js').data(day,'data');day=[day,segodnja()].sort()[0];
 const post=db.prepare("SELECT *,date(data_vyhoda,'+3 hours') den_vyhoda FROM publikacii WHERE id=?").get(id);if(!post)return null;
 if(day<segodnja()&&(!post.den_vyhoda||post.den_vyhoda>day))return null;
 return publikacijaNaDatu(post,db.prepare('SELECT * FROM zamery_publikacij WHERE publikacija_id=?').all(id),day,sourceContext);
}
function publikaciiNaDatu(db,id,day){
 const historical=day<segodnja(),history=new Map();
 for(const row of db.prepare('SELECT z.* FROM zamery_publikacij z JOIN publikacii p ON p.id=z.publikacija_id WHERE p.akkaunt_id=?').all(id)){
  const key=String(row.publikacija_id);if(!history.has(key))history.set(key,[]);history.get(key).push(row);
 }
 return db.prepare("SELECT *,date(data_vyhoda,'+3 hours') den_vyhoda FROM publikacii WHERE akkaunt_id=?").all(id)
  .filter(post=>!historical||post.den_vyhoda&&post.den_vyhoda<=day)
  .map(post=>publikacijaNaDatu(post,history.get(String(post.id))||[],day));
}
function vse(db,id,day=segodnja()){
 require('./kalendar.js').data(day,'data');
                                                                   
 day=[day,segodnja()].sort()[0];
 const snapshots=db.prepare('SELECT * FROM zamery_akkauntov WHERE akkaunt_id=? ORDER BY data DESC').all(id);
 const posts=publikaciiNaDatu(db,id,day);
 const empty=()=>({znachenie:null,obnovleno:null});
 const known=(field,cutoff=day)=>{
  const row=poslednee(snapshots.filter(s=>finite(s[field])),field,cutoff);
  return row?{znachenie:row[field],obnovleno:dataPolja(row,field)}:empty();
 };
 const m={podpischikov:known('podpischikov'),publikacij:known('publikacij_vsego'),prosmotrov:known('summa_prosmotrov'),ohvat:known('ohvat')};
 const cutoff=new Date(Date.parse(day+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);
 const recent=posts.filter(p=>p.den_vyhoda>=cutoff&&p.den_vyhoda<=day),measured=recent.filter(p=>finite(p.prosmotrov));
 function observed(rows,fields){
  const days=rows.flatMap(p=>fields.map(field=>daty(p)[field]));
  return days.length&&days.every(Boolean)?days.sort()[0]:null;
 }
 m.prosmotrov_srednee={znachenie:mediana(measured.map(p=>p.prosmotrov)),obnovleno:observed(measured,['prosmotrov']),publikacij_v_schete:measured.length,publikacij_vsego:recent.length,period_s:cutoff,period_po:day};
 const engagement=vovlechennost(recent),complete=recent.filter(p=>finite(p.prosmotrov)&&finite(p.lajkov));
 m.vovlechennost={...(complete.length?{znachenie:engagement.znachenie,obnovleno:observed(complete,['prosmotrov','lajkov'])}:known('vovlechennost')),
  publikacij_v_schete:engagement.publikacij_v_schete,publikacij_vsego:engagement.publikacij_vsego};
 m.prirost_podpischikov=empty();
 if(m.podpischikov.obnovleno){
  const previousDay=new Date(Date.parse(m.podpischikov.obnovleno+'T00:00:00Z')-7*86400000).toISOString().slice(0,10),previous=known('podpischikov',previousDay);
  if(previous.znachenie!==null)m.prirost_podpischikov={znachenie:m.podpischikov.znachenie-previous.znachenie,obnovleno:m.podpischikov.obnovleno,ot:previous.obnovleno};
 }
 m.ohvat_k_podpischikam=empty();
 if(m.ohvat.znachenie!==null&&m.podpischikov.znachenie>0){
  const from=m.ohvat.obnovleno,subscribers=m.podpischikov.obnovleno;
  m.ohvat_k_podpischikam={znachenie:Math.round(m.ohvat.znachenie/m.podpischikov.znachenie*100),obnovleno:[from,subscribers].sort()[0],daty:{ohvat:from,podpischikov:subscribers},raznye_daty:from!==subscribers};
 }
 if(m.prosmotrov_srednee.znachenie===null)m.prosmotrov_srednee.pochemu='публикаций с замером за 30 дней нет';
 if(m.prirost_podpischikov.znachenie===null)m.prirost_podpischikov.pochemu='снимка недельной давности нет';
 if(m.vovlechennost.znachenie===null&&complete.length)m.vovlechennost.pochemu='просмотров для расчёта пока нет';
 return {metriki:m,po_publikacijam:poPublikacijam(posts)};
}
module.exports={VIDY,mediana,vovlechennost,poPublikacijam,publikaciiNaDatu,publikacijaPoId,vse};
