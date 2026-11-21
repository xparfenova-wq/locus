                                                                     
const calendar=require('./kalendar.js');
const {status_sql}=require('./povtory.js');

function den_v_zone(value,zone,formatter=new Intl.DateTimeFormat('en-CA',{
  timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
})){
  const source=String(value).replace(' ','T');
  const date=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(source)?source:source+'Z');
  if(!Number.isFinite(date.getTime()))return null;
  const parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function mediana(chisla){
  const values=chisla.filter(x=>x>0).sort((a,b)=>a-b);
  if(values.length<4)return null;
  const mid=Math.floor(values.length/2);
  return values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
}
function nagruzka(db,{den,week=calendar.iso_nedelja(den),chelovek_id}={}){
  calendar.data(den);
  const settings=require('./parametry-analitiki.js').values(db);
  const zone=settings.chasovoj_pojas||'Europe/Moscow';
                                                                           
  new Intl.DateTimeFormat('en-CA',{timeZone:zone});
  const window=Number(settings.nedel_v_okne??8);
  if(!Number.isInteger(window)||window<1||window>52)throw new Error('окно медианы: 1–52 недели');
  const borders=calendar.granicy_nedeli(week.god,week.nomer);
  const start=calendar.sdvinut_nedelju(week.god,week.nomer,-window);
  const keys=Array.from({length:window},(_,i)=>{
    const w=calendar.sdvinut_nedelju(start.god,start.nomer,i);
    return {god:w.god,nedelja:w.nomer,kljuch:calendar.kljuch_nedeli(w.god,w.nomer),zakryto:0};
  });
  const people=db.prepare(`SELECT id,imja FROM ljudi WHERE COALESCE(arhiv,0)=0
    ${chelovek_id!=null?'AND id=?':''}`).all(...(chelovek_id!=null?[Number(chelovek_id)]:[]));
  const byPerson=new Map(people.map(p=>[p.id,{...p,otkryto:0,po_nedeljam:keys.map(w=>({...w}))}]));
  const events=db.prepare(`SELECT z.otvetstvennyj,MAX(datetime(j.kogda)) kogda
    FROM zadachi z JOIN zhurnal j ON j.obekt='zadacha' AND j.obekt_id=z.id
      AND j.pole='status' AND j.stalo='sdelano'
    WHERE z.status='sdelano' AND COALESCE(z.udaleno,0)=0
      ${chelovek_id!=null?'AND z.otvetstvennyj=?':''}
    GROUP BY z.id`).all(...(chelovek_id!=null?[Number(chelovek_id)]:[]));
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  for(const event of events){
    const person=byPerson.get(event.otvetstvennyj);
    if(!person||!event.kogda)continue;
    const date=den_v_zone(event.kogda,zone,formatter);
    if(!date||date<start.nachalo||date>=borders.nachalo)continue;
    const w=calendar.iso_nedelja(date),key=calendar.kljuch_nedeli(w.god,w.nomer);
    const bucket=person.po_nedeljam.find(x=>x.kljuch===key);
    if(bucket)bucket.zakryto++;
  }
  const open=db.prepare(`SELECT z.otvetstvennyj,count(*) n FROM zadachi z
    WHERE COALESCE(z.udaleno,0)=0 AND ${status_sql('z',`'${den}'`)} NOT IN ('sdelano','kogda_nibud')
      AND ((z.sprint=? AND z.god_sprinta=?) OR (z.povtorjaetsja=1 AND COALESCE(z.povtor_s,'0001-01-01')<=?))
      ${chelovek_id!=null?'AND z.otvetstvennyj=?':''}
    GROUP BY z.otvetstvennyj`).all(week.nomer,week.god,borders.konec,...(chelovek_id!=null?[Number(chelovek_id)]:[]));
  for(const row of open)if(byPerson.has(row.otvetstvennyj))byPerson.get(row.otvetstvennyj).otkryto=row.n;
  return [...byPerson.values()].map(p=>{
    const norma=mediana(p.po_nedeljam.map(w=>w.zakryto)),porog=norma==null?null:norma*settings.porog_peregruza;
    return {...p,chelovek_id:p.id,mediana:norma,mediana_zakrytyh:norma,porog,
      nepustyh_nedel:p.po_nedeljam.filter(w=>w.zakryto>0).length,
      peregruz:porog!=null&&p.otkryto>porog,nedel_v_okne:window,porog_peregruza:settings.porog_peregruza,chasovoj_pojas:zone};
  });
}
                                                                              
function zakryto_po_napravlenijam(db,{den}={}){
  calendar.data(den);const settings=require('./parametry-analitiki.js').values(db),week=calendar.iso_nedelja(den),start=calendar.sdvinut_nedelju(week.god,week.nomer,-settings.nedel_v_okne),borders=calendar.granicy_nedeli(week.god,week.nomer),groups=new Map();
  const keys=Array.from({length:settings.nedel_v_okne},(_,i)=>{const w=calendar.sdvinut_nedelju(start.god,start.nomer,i);return calendar.kljuch_nedeli(w.god,w.nomer);});
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:settings.chasovoj_pojas,year:'numeric',month:'2-digit',day:'2-digit'});
  for(const event of db.prepare("SELECT z.napravlenie,MAX(datetime(j.kogda)) kogda FROM zadachi z JOIN zhurnal j ON j.obekt='zadacha' AND j.obekt_id=z.id AND j.pole='status' AND j.stalo='sdelano' WHERE z.status='sdelano' AND COALESCE(z.udaleno,0)=0 GROUP BY z.id").all()){
    const day=event.kogda?den_v_zone(event.kogda,settings.chasovoj_pojas,formatter):null;if(!day||day<start.nachalo||day>den)continue;
    if(!groups.has(event.napravlenie))groups.set(event.napravlenie,{napravlenie:event.napravlenie,seichas:0,counts:keys.map(()=>0)});const group=groups.get(event.napravlenie);
    if(day>=borders.nachalo)group.seichas++;else{const w=calendar.iso_nedelja(day),i=keys.indexOf(calendar.kljuch_nedeli(w.god,w.nomer));if(i>=0)group.counts[i]++;}
  }
  return [...groups.values()].map(r=>({...r,mediana:mediana(r.counts),koefficient:settings.porog_peregruza}));
}
module.exports={nagruzka,mediana,den_v_zone,zakryto_po_napravlenijam};
