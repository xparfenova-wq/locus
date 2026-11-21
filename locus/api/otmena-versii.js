const {Konflikt,OshibkaVvoda,LOGICHESKIE}=require('../db/db.js'),{S_VERSIEJ,TABLICY}=require('../db/versii.js');
const ZAVISIMOSTI={platezhi:['proekt_id','oplachen_at'],akkaunty:['proekt_id','napravlenie','ploshadka'],kontakty:['chelovek_id','tip'],sotrudnichestva:['chelovek_id','napravlenie','rol','privodit_klientov'],zadachi:['klient_id','sotrudnichestvo_id','proekt_id','napravlenie'],proekty:['klient_id','napravlenie'],celi:['napravlenie','period_id','sostojanie'],rezultaty:['cel_id'],rassylki:['napravlenie'],grafik:['chelovek_id','god','nedelja'],materialy:['chelovek_id','zadacha_id','proekt_id'],dokumenty:['chelovek_id','proekt_id'],kommentarii:['zadacha_id','chelovek_id']};
function proverit(db,table,row,journal){
 let snapshot;try{snapshot=JSON.parse(journal.srez);}catch{}
 if(!S_VERSIEJ.has(table)||!Number.isSafeInteger(snapshot?.versija)||snapshot.versija<1)throw new Konflikt('У старой записи нет подтверждённой версии. Проверь значение в карточке.',{istorija_nepolnaja:true});
 const key=row[TABLICY[table]],meta=db.prepare('SELECT pole,versija FROM versii_polej WHERE tablica=? AND obekt_id=?').all(table,key),head=meta.find(r=>r.pole===''),floor=meta.find(r=>r.pole==='*');
 if(!head||!floor||head.versija!==row.versija||snapshot.versija<floor.versija||!meta.some(r=>r.pole===journal.pole))throw new Konflikt('История версии неполная. Проверь значение в карточке.',{istorija_nepolnaja:true});
 if(db.prepare("SELECT 1 FROM zhurnal WHERE obekt=? AND obekt_id=? AND pole='sozdano' AND id>? LIMIT 1").get(journal.obekt,journal.obekt_id,journal.id))throw new Konflikt('После этой правки запись создали заново. Обнови карточку.',{scope_changed:true});
 const fields=[journal.pole,...(ZAVISIMOSTI[table]||[])];
 if(journal.pole==='arhiv')fields.push('arhiv_s','vozvrat_s');
 if(table==='zadachi'){
  if(journal.pole==='status')fields.push('povtorjaetsja','roditel_id');
  if(journal.pole==='srok')fields.push('povtorjaetsja');
  if(['sprint','god_sprinta'].includes(journal.pole))fields.push('sprint','god_sprinta','povtorjaetsja');
  const repeat=['povtorjaetsja','chastota','dni_nedeli','povtor_s','povtor_po'];
  if(repeat.includes(journal.pole))fields.push(...repeat,'srok','sprint','god_sprinta','status');
 }
 require('./versii.js').proverit(db,table,row,snapshot.versija,fields);
                                                                             
                                                                           
 const current=znachenie(journal.pole,row[journal.pole]),expected=znachenie(journal.pole,journal.stalo),numeric=typeof current==='number'&&expected!==null&&Number.isFinite(Number(expected))&&current===Number(expected);
 if(!numeric&&String(current??'')!==String(expected??''))throw new Konflikt('Значение поля уже изменилось. Отмена не применена.');
}
function znachenie(field,value){
 if(value===null||value===undefined||value==='')return null;
 if(!LOGICHESKIE.has(field))return value;
 if(value===1||value===true||/^(1|true|da|да)$/i.test(String(value).trim()))return 1;
 if(value===0||value===false||/^(0|false|net|нет)(?::.*)?$/i.test(String(value).trim()))return 0;
 throw new OshibkaVvoda('В журнале не подтверждено логическое значение',field);
}
module.exports={proverit,znachenie};
