                                                              
                                                                      
const {OshibkaVvoda,NeNajdeno}=require('../db/db.js');
function object(value,field,allowed){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new OshibkaVvoda('нужен объект',field);
  for(const key of Object.keys(value))if(!allowed.includes(key))throw new OshibkaVvoda('неизвестное поле: '+key,field+'.'+key);
  return value;
}
function parent(db,value){
  object(value,'kontakt_dlja',['sotrudnichestvo_id','versija']);
  if(!Number.isSafeInteger(value.sotrudnichestvo_id)||value.sotrudnichestvo_id<1)throw new OshibkaVvoda('нужно сотрудничество','kontakt_dlja');
  const row=db.prepare('SELECT * FROM sotrudnichestva WHERE id=?').get(value.sotrudnichestvo_id);
  if(!row)throw new NeNajdeno('сотрудничества нет');
  if(!Number.isSafeInteger(value.versija)||value.versija<1)throw new OshibkaVvoda('нужна увиденная версия сотрудничества','kontakt_dlja.versija');
  return row;
}
function podgotovit(d,related,db){
  if(related.kontakty!==undefined){
    if(!Array.isArray(related.kontakty)||related.kontakty.length>30)throw new OshibkaVvoda('не больше 30 контактов','kontakty');
    for(const value of related.kontakty)object(value,'kontakty',['tip','znachenie','osnovnoj','porjadok']);
  }
  if(related.sotrudnichestvo!==undefined)object(related.sotrudnichestvo,'sotrudnichestvo',
    ['napravlenie','rol','istochnik','istochnik_tekst','rekomendoval_id','rassylka_id','kontekst','osobennosti']);
  if(related.kontakt_dlja!==undefined){
    parent(db,related.kontakt_dlja);
    if(related.sotrudnichestvo!==undefined)throw new OshibkaVvoda('контактное лицо не получает собственного сотрудничества','sotrudnichestvo');
    if(d.rol_v_baze!==undefined&&d.rol_v_baze!=='kontaktnoe_lico')throw new OshibkaVvoda('из поля контакта создаётся контактное лицо','rol_v_baze');
    d.rol_v_baze='kontaktnoe_lico';
  }
}
function razlozhit(person,related,db,author){
  const common=require('./obschij.js'),{OPISANIJA}=require('./opisanija.js');
  const result={};
  if(related.kontakty)result.kontakty=related.kontakty.map(value=>common.sozdat('kontakty',OPISANIJA.kontakty,{...value,chelovek_id:person.id},author));
  if(related.sotrudnichestvo)result.sotrudnichestvo=common.sozdat('sotrudnichestva',OPISANIJA.sotrudnichestva,{...related.sotrudnichestvo,chelovek_id:person.id},author);
  if(related.kontakt_dlja){
    const row=parent(db,related.kontakt_dlja);
    const linked=common.pravit('sotrudnichestva',OPISANIJA.sotrudnichestva,row.id,{versija:related.kontakt_dlja.versija,kontakt_id:person.id},author);
    result.kontakt_dlja={sotrudnichestvo_id:linked.id,versija:linked.versija,kontakt_id:person.id};
  }
  return result;
}
function napravlenie_lida(db,person,body){
  let direction=body.napravlenie_lida;
  if(direction===undefined){
    const linked=db.prepare('SELECT DISTINCT napravlenie FROM sotrudnichestva WHERE kontakt_id=? AND COALESCE(arhiv,0)=0').all(person.id);
    if(linked.length===1)direction=linked[0].napravlenie;
  }
  if(typeof direction!=='string'||!db.prepare('SELECT 1 FROM napravlenija WHERE kod=?').get(direction)){
    throw new OshibkaVvoda('выбери направление, в котором человек стал лидом','napravlenie_lida');
  }
  return direction;
}
function pered_pravkoj(d,bylo,db,body={}){
  const conversion=bylo.rol_v_baze==='kontaktnoe_lico'&&d.rol_v_baze==='sobstvennyj';
  if(body.napravlenie_lida!==undefined&&!conversion)throw new OshibkaVvoda('направление лида задаётся при переводе контактного лица','napravlenie_lida');
  if(conversion)napravlenie_lida(db,bylo,body);
}
function posle_pravki(stalo,bylo,db,author,body={}){
  if(bylo.rol_v_baze!=='kontaktnoe_lico'||stalo.rol_v_baze!=='sobstvennyj')return;
  const direction=napravlenie_lida(db,bylo,body),common=require('./obschij.js'),{OPISANIJA}=require('./opisanija.js');
  const s=common.sozdat('sotrudnichestva',OPISANIJA.sotrudnichestva,{chelovek_id:stalo.id,napravlenie:direction,rol:'lid'},author);
  return {novoe_sotrudnichestvo:{id:s.id,napravlenie:s.napravlenie,rol:s.rol,versija:s.versija}};
}
module.exports={podgotovit,razlozhit,pered_pravkoj,posle_pravki};
