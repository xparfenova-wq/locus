const {createHash}=require('node:crypto');
const {v_api,seichas,OshibkaVvoda,Konflikt}=require('../db/db.js');

                                                                             
                                                                             
function sostojanie(db,owner,kind){
 const records=db.prepare(`SELECT k.*,coalesce(p.versija,f.versija,k.versija) AS primary_field_version,
   p.kto AS primary_actor,p.kogda AS primary_time
   FROM kontakty k
   LEFT JOIN versii_polej p ON p.tablica='kontakty' AND p.obekt_id=k.id AND p.pole='osnovnoj'
   LEFT JOIN versii_polej f ON f.tablica='kontakty' AND f.obekt_id=k.id AND f.pole='*'
   WHERE k.chelovek_id=? AND k.tip=? ORDER BY k.id`).all(owner,kind);
 const context=createHash('sha256').update(JSON.stringify([owner,kind,records.map(r=>[r.id,r.osnovnoj?1:0,r.primary_field_version])])).digest('hex');
 const spisok=records.map(({primary_field_version,primary_actor,primary_time,...row})=>({...v_api(row),...require('./vidy-kontaktov.js').dto(row),osnovnoj_kontekst:context}));
 return {chelovek_id:owner,tip:kind,kontekst:context,spisok};
}
function dopolnit(db,row){const group=sostojanie(db,row.chelovek_id,row.tip);return {...require('./vidy-kontaktov.js').dto(row),osnovnoj_kontekst:group.kontekst,osnovnaja_gruppa:group};}
function spisok(db,rows){
 const cache=new Map();return rows.map(row=>{
  const key=JSON.stringify([row.chelovek_id,row.tip]);
  if(!cache.has(key))cache.set(key,sostojanie(db,row.chelovek_id,row.tip).kontekst);
  return {...row,...require('./vidy-kontaktov.js').dto(row),osnovnoj_kontekst:cache.get(key)};
 });
}
function proverit(db,row,context){
 const group=sostojanie(db,row.chelovek_id,row.tip);
 if(typeof context!=='string'||!/^[a-f0-9]{64}$/.test(context))throw new OshibkaVvoda('Нужно прочитанное состояние основной метки','osnovnoj_kontekst');
 if(context!==group.kontekst)throw new Konflikt('Основной контакт или состав контактов изменился. Проверь сохранённое состояние',{
  kod:'primary_conflict',primary_group_changed:true,tekuschee:{...v_api(row),osnovnoj_kontekst:group.kontekst},osnovnaja_gruppa:group,izmenennye_polja:['osnovnoj']});
 return group;
}
function snjatDrugie(db,owner,kind,except,author){
 const rows=db.prepare('SELECT id FROM kontakty WHERE chelovek_id=? AND tip=? AND osnovnoj=1 AND id<>? ORDER BY id').all(owner,kind,except??-1);
 for(const row of rows){
  db.prepare('UPDATE kontakty SET osnovnoj=0 WHERE id=?').run(row.id);
  require('./obschij.js').v_zhurnal(db,'kontakty',row.id,'osnovnoj','1','0',author);
 }
 return rows.map(row=>row.id);
}
function peredPravkoj(db,row,data,body,author){
 if(data.osnovnoj===undefined)return {affected:[]};
                                                                             
 if((data.chelovek_id!==undefined&&data.chelovek_id!==row.chelovek_id)||(data.tip!==undefined&&data.tip!==row.tip))throw new OshibkaVvoda('Сначала измени человека или вид, затем выбери основной контакт','osnovnoj');
 proverit(db,row,body.osnovnoj_kontekst);
 return {affected:data.osnovnoj?snjatDrugie(db,row.chelovek_id,row.tip,row.id,author):[]};
}
function peredVstavkoj(db,row,related,author){
 if(!row.osnovnoj)return;
 const group=sostojanie(db,row.chelovek_id,row.tip);
 if(group.spisok.some(r=>r.osnovnoj)){
  proverit(db,row,related.osnovnoj_kontekst);snjatDrugie(db,row.chelovek_id,row.tip,null,author);
 }
}
function metki(db,row){
 const records=db.prepare(`SELECT k.id,coalesce(p.versija,f.versija,k.versija) AS version
  FROM kontakty k LEFT JOIN versii_polej p ON p.tablica='kontakty' AND p.obekt_id=k.id AND p.pole='osnovnoj'
  LEFT JOIN versii_polej f ON f.tablica='kontakty' AND f.obekt_id=k.id AND f.pole='*'
  WHERE k.chelovek_id=? AND k.tip=? AND k.osnovnoj=1 ORDER BY k.id`).all(row.chelovek_id,row.tip);
 return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
function poslePravki(db,row,before,context,body,author){
 const selected=Object.hasOwn(body,'osnovnoj');
 if(selected){
                                                                               
  db.prepare(`INSERT INTO versii_polej(tablica,obekt_id,pole,versija,kto,kogda) VALUES('kontakty',?,'osnovnoj',?,?,?)
   ON CONFLICT(tablica,obekt_id,pole) DO UPDATE SET versija=excluded.versija,kto=excluded.kto,kogda=excluded.kogda`).run(row.id,row.versija,author,seichas());
  if(row.osnovnoj)require('./obschij.js').v_zhurnal(db,'kontakty',row.id,'osnovnoj_vybran',null,row.znachenie,author);
 }
 const group=sostojanie(db,row.chelovek_id,row.tip);
 return {affected:[...new Set([...(context?.affected||[]),...(selected?[row.id]:[])])],
  osnovnoj_kontekst:group.kontekst,osnovnaja_gruppa:group};
}
module.exports={sostojanie,dopolnit,spisok,peredPravkoj,peredVstavkoj,poslePravki,metki};
