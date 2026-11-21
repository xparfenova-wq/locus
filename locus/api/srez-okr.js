const {segodnja}=require('../db/db.js');
const {data,sdvinut_den}=require('./kalendar.js');
const {POKAZATELI,MOMENTNYE}=require('./pokazateli.js');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function kontekst(db,row,day=segodnja(),window){
 data(day,'den');
 const goal=db.prepare('SELECT period_id,napravlenie FROM celi WHERE id=?').get(row.cel_id);
 let period=goal?.period_id?db.prepare('SELECT nachalo,konec FROM periody WHERE id=?').get(String(goal.period_id)):null;
 if(window){data(window.nachalo,'nachalo');data(window.konec,'konec');period={nachalo:[period?.nachalo,window.nachalo].filter(Boolean).sort().at(-1),konec:[period?.konec,window.konec].filter(Boolean).sort()[0]};}
 const cutoff=[day,segodnja(),period?.konec].filter(Boolean).sort()[0];
 return {den:day,na_datu:cutoff,period,napravlenie:goal?.napravlenie};
}
function sohranennoe(db,row,cutoff){
 const epoch=db.prepare("SELECT id,julianday(kogda) moment,date(kogda,'+3 hours') den FROM zhurnal WHERE obekt='rezultat' AND obekt_id=? AND pole='sozdano' ORDER BY id DESC LIMIT 1").get(row.id);
 if(epoch?.den>cutoff)return [];
 const observations=[],direction=db.prepare('SELECT napravlenie FROM celi WHERE id=?').get(row.cel_id)?.napravlenie;
                                                                           
                                                                              
 for(const saved of db.prepare("SELECT napravlenie,dannye,julianday(coalesce(pereschitan,sozdano)) moment,date(coalesce(pereschitan,sozdano),'+3 hours') den FROM snimki_planerki WHERE date(coalesce(pereschitan,sozdano),'+3 hours')<=?").all(cutoff)){
  if(saved.napravlenie!==direction||epoch?.moment&&saved.moment<epoch.moment)continue;
  let report;try{report=JSON.parse(saved.dannye);}catch{continue;}
  const goals=report?.svodka?.celi;if(!Array.isArray(goals))continue;
  const goal=goals.find(goal=>goal?.id===row.cel_id),result=Array.isArray(goal?.rezultaty)?goal.rezultaty.find(result=>result?.id===row.id):null;
  if(!result||result.cel_id!==row.cel_id||!finite(result.fakt)||result.na_datu!==undefined&&result.na_datu!==saved.den)continue;
  if(row.tip==='veha'?result.tip!=='veha'||![0,1].includes(result.fakt):result.istochnik!==row.istochnik||result.formula!==row.formula||(result.baza_id??null)!==(row.baza_id??null))continue;
  observations.push({fakt:result.fakt,moment:saved.moment,den:saved.den});
 }
 return observations.sort((a,b)=>b.moment-a.moment);
}
function veha(db,row,cutoff){
 if(cutoff===segodnja())return {fakt:row.zakryta?1:0,obnovleno:null};
                                                                       
                                                                            
 const epoch=db.prepare("SELECT id,julianday(kogda) moment,date(kogda,'+3 hours') den FROM zhurnal WHERE obekt='rezultat' AND obekt_id=? AND pole='sozdano' ORDER BY id DESC LIMIT 1").get(row.id);
 if(epoch?.den>cutoff)return {fakt:null,obnovleno:null};
 const observations=sohranennoe(db,row,cutoff);
 const events=db.prepare("SELECT pole,stalo,srez,julianday(kogda) moment,date(kogda,'+3 hours') den FROM zhurnal WHERE obekt='rezultat' AND obekt_id=? AND id>=? AND date(kogda,'+3 hours')<=? ORDER BY julianday(kogda) DESC,id DESC").all(row.id,epoch?.id??0,cutoff);
 for(const event of events){
  let context;try{context=JSON.parse(event.srez);}catch{}
  if(context&&Object.hasOwn(context,'tip_rezultata')){observations.push({fakt:context.tip_rezultata==='veha'&&[0,1].includes(context.zakryta)?context.zakryta:null,moment:event.moment,den:event.den});break;}
  if(event.pole==='zakryta'&&['0','1'].includes(event.stalo)){observations.push({fakt:Number(event.stalo),moment:event.moment,den:event.den});break;}
  if(event.pole==='tip'){observations.push({fakt:null,moment:event.moment,den:event.den});break;}
 }
 const latest=observations.sort((a,b)=>b.moment-a.moment)[0];return {fakt:latest?.fakt??null,obnovleno:latest?.den??null};
}
function fakt(db,row,day,window){
 const context=kontekst(db,row,day,window),cutoff=context.na_datu;
 let value=null,reason=null,source=row.istochnik??'ruchnoj_zamer',updated=null,measurement=null,publicationCoverage=null;
 const read=fn=>{try{return fn();}catch{reason='Не удалось прочитать факт из источника. Проверь источник и повтори чтение.';return null;}};
 if(row.tip==='veha'){
  const state=veha(db,row,cutoff);value=state.fakt;updated=state.obnovleno;if(value===null)reason='Состояние вехи на эту дату не зафиксировано.';
 }else if(source==='akkaunt'){
  if(row.akkaunt_id&&row.metrika){const metric=read(()=>require('./metriki-akkaunta.js').vse(db,row.akkaunt_id,cutoff).metriki[row.metrika]);value=metric?.znachenie??null;updated=metric?.obnovleno??null;reason||=metric?.pochemu??null;}
  if(value===null)reason||='Измерений аккаунта на эту дату нет.';
 }else if(source==='formula'){
  if(MOMENTNYE.has(row.formula)&&cutoff<segodnja()){
   const observed=sohranennoe(db,row,cutoff)[0];value=observed?.fakt??null;updated=observed?.den??null;
   if(value===null)reason='Историческое состояние этого показателя не зафиксировано.';
  }
  else if(Object.hasOwn(POKAZATELI,row.formula)){
   const period={nachalo:context.period?.nachalo??'0001-01-01',konec:cutoff,na_datu:cutoff,istoricheskij:cutoff<segodnja()};
   if(['publikacij_vyshlo','ohvat_publikacij'].includes(row.formula)){publicationCoverage=read(()=>require('./fakty-publikacij.js').srez(db,period,context.napravlenie));value=publicationCoverage?.[row.formula==='publikacij_vyshlo'?'vyshlo':'ohvat']??null;updated=row.formula==='ohvat_publikacij'?publicationCoverage?.obnovleno??null:null;if(publicationCoverage?.raskhozhdenij_dat)reason||=publicationCoverage.pochemu;if(value===null)reason||=publicationCoverage?.pochemu??'Нет подтверждённых данных публикаций на эту дату.';}
   else value=read(()=>POKAZATELI[row.formula](db,period,row.baza_id,context.napravlenie,row.schitat_lidov));
   if(value===null&&row.formula==='zadach_zakryto')reason='Для части задач нет подтверждённой истории состояния на эту дату.';
   if(value===null&&['rassylok_otpravleno','pisem_otpravleno','otvetili_na_rassylku','otkazalis'].includes(row.formula))reason='Истории отметок рассылки на эту дату недостаточно для полного расчёта.';
  }
 }else if(source==='ruchnoj_zamer'){
  measurement=db.prepare('SELECT z.*,l.imja kto_imja FROM zamery z LEFT JOIN ljudi l ON l.id=z.kto WHERE z.rezultat_id=? AND z.data<=? ORDER BY z.data DESC,z.id DESC LIMIT 1').get(row.id,cutoff);
  if(measurement){value=measurement.znachenie;updated=measurement.data;}
  else if(cutoff===segodnja()){value=row.baza;source='baza';}
  else reason='Исторических замеров на эту дату нет.';
 }
 if(!finite(value))value=null;
 if(Number.isInteger(value)&&!Number.isSafeInteger(value)){value=null;reason='Число не помещается в точный числовой формат. Проверь источник.';}
 return {...context,fakt:value,istochnik_fakta:source,obnovleno:updated,poslednij_zamer:measurement??null,polnota_publikacij:publicationCoverage,pochemu:reason};
}
function nedelja(db,row,snapshot,start){
 if(!finite(snapshot.fakt)||start>snapshot.na_datu)return null;
 const source=row.istochnik??'ruchnoj_zamer';
 if(row.tip!=='veha'&&source==='formula'&&['publikacij_vyshlo','ohvat_publikacij'].includes(row.formula)){const before=fakt(db,row,sdvinut_den(start,-1)).fakt;return finite(before)?snapshot.fakt-before:null;}
 if(row.tip!=='veha'&&source==='formula'){
  if(MOMENTNYE.has(row.formula)||!Object.hasOwn(POKAZATELI,row.formula))return null;
  try{
   const value=POKAZATELI[row.formula](db,{nachalo:[start,snapshot.period?.nachalo].filter(Boolean).sort().at(-1),konec:snapshot.na_datu,na_datu:snapshot.na_datu,istoricheskij:snapshot.na_datu<segodnja()},row.baza_id,snapshot.napravlenie,row.schitat_lidov);
   return finite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value))?value:null;
  }catch{return null;}
 }
 const before=fakt(db,row,sdvinut_den(start,-1)).fakt;
 return finite(before)?snapshot.fakt-before:null;
}
module.exports={kontekst,fakt,nedelja};
