                                                                            
                                                                         
const {OshibkaVvoda,v_api}=require('../db/db.js');
const ROLES=new Set(['lid','klient','referal']),ACCESS=new Set(['polnyj','bez_deneg','tolko_svoe','gost']);
const list=v=>[...new Set(String(v??'').split(',').map(s=>s.trim()).filter(Boolean))],truth=v=>['1','true','da'].includes(String(v));
function prepare(query={}){
 const keys=new Set(),conditions=[],params=[],checks=[];const add=(field,values)=>{if(!values.length)return;conditions.push('s.'+field+' IN ('+values.map(()=>'?').join(',')+')');params.push(...values);checks.push(row=>row[field]!=null&&values.includes(String(row[field])));};
 const role=(key)=>{const values=list(query[key]);if(values.some(v=>!ROLES.has(v)))throw new OshibkaVvoda(key+': лид, клиент или реферал',key);keys.add(key);add('rol',values);};
 if(Object.hasOwn(query,'rol'))role('rol');
 if(Object.hasOwn(query,'dostup')){const values=list(query.dostup);if(values.some(v=>ROLES.has(v)))role('dostup');else if(values.some(v=>!ACCESS.has(v)))throw new OshibkaVvoda('dostup: роль или уровень доступа','dostup');}
 for(const [key,column]of [['napravlenie','napravlenie'],['stadija','stadija'],['istochnik','istochnik'],['rekomendoval','rekomendoval_id'],['rekomendoval_id','rekomendoval_id']])if(Object.hasOwn(query,key)){keys.add(key);add(column,list(query[key]));}
 if(Object.hasOwn(query,'privodit')){keys.add('privodit');if(truth(query.privodit)){conditions.push('s.privodit_klientov=1');checks.push(row=>row.privodit_klientov===1||row.privodit_klientov===true);}}
 const archived=truth(query.arhiv),active=archived?'1':'(s.arhiv IS NULL OR s.arhiv=0)',own='id IN (SELECT s.chelovek_id FROM sotrudnichestva s WHERE '+[active,...conditions].join(' AND ')+')';
                                                                             
                                                                             
 const contactBridge=[...keys].every(k=>k==='napravlenie'||k==='privodit'&&!truth(query.privodit)||!list(query[k]).length),onlyDirection=conditions.length>0&&contactBridge,contact='id IN (SELECT s.kontakt_id FROM sotrudnichestva s WHERE s.kontakt_id IS NOT NULL AND '+[active,...conditions].join(' AND ')+')';
 let sql=conditions.length?own:null,values=params.slice();
 if(onlyDirection&&query.rol_v_baze==='kontaktnoe_lico')sql=contact;
 else if(onlyDirection&&truth(query.vse_roli)){sql='('+own+' OR '+contact+')';values.push(...params);}
 return {keys,sql,params:values,conditionsSql:[active,...conditions].join(' AND '),conditionParams:params.slice(),contactBridge,archived,matches:row=>(archived||row.arhiv==null||row.arhiv===0||row.arhiv===false)&&checks.every(check=>check(row))};
}
function decorate(db,people,query,format=v_api){
 if(!people.length)return people;const spec=prepare(query),ids=people.map(p=>p.id),byPerson=new Map(ids.map(id=>[id,[]]));
 for(const row of db.prepare('SELECT * FROM sotrudnichestva WHERE chelovek_id IN ('+ids.map(()=>'?').join(',')+')'+(spec.archived?'':' AND (arhiv IS NULL OR arhiv=0)')+' ORDER BY id').all(...ids))byPerson.get(row.chelovek_id).push(row);
 const refers=s=>s.rol==='referal'||s.privodit_klientov===1;
 return people.map(person=>{
  const all=byPerson.get(person.id),matched=all.filter(spec.matches),selected=matched[0],referralRows=matched.filter(refers),referrals=referralRows.length?referralRows:all.filter(refers),directions=[...new Set(referrals.map(s=>s.napravlenie).filter(Boolean))];
  const count=directions.length?db.prepare("SELECT count(DISTINCT s.chelovek_id) n FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id WHERE s.rekomendoval_id=? AND l.rol_v_baze IS NOT 'kontaktnoe_lico' AND s.napravlenie IN ("+directions.map(()=>'?').join(',')+')').get(person.id,...directions).n:0;
  return {...person,roli:[...new Set(all.map(s=>s.rol).filter(Boolean))],rol:selected?.rol??null,napravlenie:selected?.napravlenie??null,stadija:selected?.stadija??null,
   privodit_klientov:all.some(refers),privodit:{privedeno:count},srez_sotrudnichestva:matched.map(s=>s.id),sotrudnichestva_spiska:all.map(format)};
 });
}
function directionCounts(db,query,filter){
 const spec=prepare(query),target=query.rol_v_baze==='kontaktnoe_lico'?'s.kontakt_id':'s.chelovek_id',targets=truth(query.vse_roli)&&query.rol_v_baze!=='kontaktnoe_lico'&&spec.contactBridge?['s.chelovek_id','s.kontakt_id']:[target];
 const statements=targets.map(person=>'SELECT s.napravlenie,'+person+' person_id FROM sotrudnichestva s WHERE '+person+' IN (SELECT id FROM ljudi '+filter.gde+') AND '+spec.conditionsSql);
 const params=targets.flatMap(()=>[...filter.znachenija,...spec.conditionParams]);
 return Object.fromEntries(db.prepare('SELECT napravlenie,count(DISTINCT person_id) n FROM ('+statements.join(' UNION ALL ')+') GROUP BY napravlenie').all(...params).map(r=>[r.napravlenie,r.n]));
}
module.exports={prepare,decorate,directionCounts};
