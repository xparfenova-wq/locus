                                                                    
                                                                     
function pervaja_rol(db, rol, period, napravlenie, referral=false, mode='tolko_novye') {
  const args=[rol,rol,rol], parts=["l.rol_v_baze IS NOT 'kontaktnoe_lico'"];
  if(napravlenie){parts.push('s.napravlenie=?');args.push(napravlenie);}
  const rows=db.prepare(`SELECT s.id,s.chelovek_id,s.napravlenie,s.istochnik,s.rol,
    MIN(CASE WHEN j.stalo=? THEN datetime(j.kogda) END) pervyj,
    MAX(CASE WHEN j.bylo IS NULL AND j.pole='rol' THEN 1 ELSE 0 END) s_nachala,
    MAX(CASE WHEN j.stalo=? OR j.bylo=? THEN 1 ELSE 0 END) byl
    FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id
    LEFT JOIN zhurnal j ON j.obekt='sotrudnichestvo' AND j.obekt_id=s.id AND j.pole='rol'
    WHERE ${parts.join(' AND ')} GROUP BY s.id`).all(...args);
  const groups=new Map();
  for(const row of rows){
    const key=row.chelovek_id+':'+row.napravlenie;
    const group=groups.get(key)||{rows:[],pervyj:null};
    group.rows.push(row);
    if(row.pervyj&&(!group.pervyj||row.pervyj<group.pervyj))group.pervyj=row.pervyj;
    groups.set(key,group);
  }
  const dates=require('./aktivnost-lidov.js'),zone=dates.pojas(db);
  const invalidDates=new Set(db.prepare(`SELECT j.obekt_id,j.kogda FROM zhurnal j
    JOIN sotrudnichestva s ON s.id=j.obekt_id WHERE j.obekt='sotrudnichestvo' AND j.pole='rol'
    ${napravlenie?'AND s.napravlenie=?':''}`).all(...(napravlenie?[napravlenie]:[]))
    .filter(event=>!dates.den(event.kogda,zone)).map(event=>event.obekt_id));
  const active=rol==='lid'&&mode==='vse'?dates.aktivnost(db,period,napravlenie):null;
  let znachenie=0,bez_istorii=0;
  for(const group of groups.values()){
                                                                   
                                                                           
    const first=group.rows.find(r=>r.pervyj===group.pervyj);
    if(referral && !group.rows.some(r=>r.istochnik==='rekomendacija'))continue;
    const relevant=group.rows.some(r=>r.byl||r.rol===rol);
    if(!relevant)continue;
    if(group.rows.some(r=>!r.s_nachala||invalidDates.has(r.id))||!group.pervyj) {bez_istorii++;continue;}
    if(!group.pervyj || (referral&&first.istochnik!=='rekomendacija'))continue;
    const date=dates.den(group.pervyj,zone);
    if(!date){bez_istorii++;continue;}
    if(!period||(date>=period.nachalo&&date<=period.konec)){znachenie++;continue;}
    if(active&&date<period.nachalo&&active.has(group.rows[0].chelovek_id+':'+group.rows[0].napravlenie)){
                                                                
                                                        
      const wasLead=group.rows.some(row=>{
        let role=null;
        for(const event of db.prepare(`SELECT bylo,stalo,kogda FROM zhurnal WHERE obekt='sotrudnichestvo'
          AND obekt_id=? AND pole='rol' ORDER BY datetime(kogda),rowid`).all(row.id)){
          const day=dates.den(event.kogda,zone);if(!day)continue;
          if(day>period.konec)break;
          if(day>=period.nachalo&&(role==='lid'||event.bylo==='lid'||event.stalo==='lid'))return true;
          role=event.stalo;
        }
        return role==='lid';
      });
      if(wasLead)znachenie++;
    }
  }
  return {znachenie,polnaja:bez_istorii===0,bez_istorii};
}
const ROST={lidov:['lid',false],novyh_lidov:['lid',false],lidov_ot_referalov:['lid',true],
  novyh_klientov:['klient',false],novyh_klientov_ot_referalov:['klient',true]};
function polnota_formuly(db,formula,napravlenie){
  const options=ROST[formula];
  if(!options)return null;
  const {polnaja,bez_istorii}=pervaja_rol(db,options[0],null,napravlenie,options[1]);
  return {polnaja,bez_istorii};
}
function lidy_perioda(db,period,napravlenie){
  const fresh=pervaja_rol(db,'lid',period,napravlenie),all=pervaja_rol(db,'lid',period,napravlenie,false,'vse');
  return {novyh:fresh.znachenie,prezhnih:Math.max(0,all.znachenie-fresh.znachenie),vsego:all.znachenie,polnota_dannyh:{polnaja:all.polnaja,bez_istorii:all.bez_istorii}};
}
module.exports={pervaja_rol,polnota_formuly,lidy_perioda};
