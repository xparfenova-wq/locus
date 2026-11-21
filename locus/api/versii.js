const {Konflikt,OshibkaVvoda,seichas,v_api}=require('../db/db.js');
const {TABLICY,S_VERSIEJ}=require('../db/versii.js');
const dejstvija=new WeakMap();

function id(table,row){return row[TABLICY[table]];}
function proverit(db,table,row,seen,fields){
  if(!S_VERSIEJ.has(table))return;
  if(seen===undefined)throw new OshibkaVvoda('versija обязательна в теле PATCH','versija');
  const version=Number(seen),current=Number(row.versija);
  if(typeof seen==='boolean' || !Number.isSafeInteger(version) || version<1) {
    throw new OshibkaVvoda('versija: целое число от 1','versija');
  }
  if(version===current)return;
  const metadata=db.prepare('SELECT * FROM versii_polej WHERE tablica=? AND obekt_id=?').all(table,id(table,row));
  const head=metadata.find(r=>r.pole===''),floor=metadata.find(r=>r.pole==='*');
  const unknown=!head || !floor || head.versija!==current || version<floor.versija;
  const requested=new Set(fields.filter(f=>f!=='versija'));
                                                                                 
  for(const field of ['udaleno','udalen'])if(row[field])requested.add(field);
  const conflicts=metadata.filter(r=>requested.has(r.pole)&&r.versija>version)
    .sort((a,b)=>b.versija-a.versija || String(b.kogda).localeCompare(String(a.kogda)));
  if(version<current && !unknown && !conflicts.length)return;
  const latest=conflicts[0]||head;
  const person=!unknown && latest?.kto ? db.prepare('SELECT imja FROM ljudi WHERE id=?').get(latest.kto) : null;
  throw new Konflikt('Это поле уже изменили. Проверь сохранённую версию',{
    versija:row.versija,tekuschee:table==='kontakty'?{...v_api(row),...require('./osnovnoj-kontakt.js').dopolnit(db,row)}:v_api(row),izmenennye_polja:conflicts.map(r=>r.pole),
    kto:unknown?null:(latest?.kto??null),kto_imja:person?.imja??null,kogda:unknown?null:(latest?.kogda??null),
    ...(unknown?{istorija_nepolnaja:true}:{}),
  });
}

function zapomnit(db,table,key,from,avtor){
  if(!S_VERSIEJ.has(table) || !Number.isSafeInteger(Number(avtor)) || Number(avtor)<1)return;
  const row=db.prepare('SELECT versija FROM "'+table+'" WHERE "'+TABLICY[table]+'"=?').get(key);
  if(!row)return;
  db.prepare(`UPDATE versii_polej SET kto=?,kogda=? WHERE tablica=? AND obekt_id=?
    AND pole<>'*' AND versija>? AND versija<=?`).run(Number(avtor),seichas(),table,key,Number(from)||0,row.versija);
}

function po_zhurnalu(db,table,key,field,avtor){
  if(!S_VERSIEJ.has(table))return;
  const row=db.prepare('SELECT versija FROM "'+table+'" WHERE "'+TABLICY[table]+'"=?').get(key);
  const meta=db.prepare('SELECT versija,kto FROM versii_polej WHERE tablica=? AND obekt_id=? AND pole=?').get(table,key,field);
  if(meta && row?.versija===meta.versija && meta.kto===null)zapomnit(db,table,key,meta.versija-1,avtor);
}

function s_avtorom(db,avtor,fn){
                                                                           
                                                                             
  const previous=db.prepare("SELECT * FROM versii_polej WHERE tablica='' AND obekt_id=0 AND pole=''").get();
  const predyduschee=dejstvija.get(db);
  const tekuschee=predyduschee?.avtor===avtor?predyduschee:{id:require('node:crypto').randomUUID(),avtor};
  db.prepare(`INSERT INTO versii_polej(tablica,obekt_id,pole,versija,kto,kogda) VALUES('',0,'',1,?,?)
    ON CONFLICT(tablica,obekt_id,pole) DO UPDATE SET kto=excluded.kto,kogda=excluded.kogda`)
    .run(Number.isSafeInteger(avtor)&&avtor>0?avtor:null,seichas());
  dejstvija.set(db,tekuschee);
  try{return fn();}
  finally{
    if(predyduschee)dejstvija.set(db,predyduschee);else dejstvija.delete(db);
    if(previous)db.prepare("UPDATE versii_polej SET kto=?,kogda=? WHERE tablica='' AND obekt_id=0 AND pole=''").run(previous.kto,previous.kogda);
    else db.exec("DELETE FROM versii_polej WHERE tablica='' AND obekt_id=0 AND pole=''");
  }
}

module.exports={proverit,zapomnit,po_zhurnalu,s_avtorom,dejstvie:db=>dejstvija.get(db)?.id??null};
