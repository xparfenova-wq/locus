'use strict';
const M=require('../public/js/context-hints-model.js');
const {baza,OshibkaVvoda,Konflikt,v_odnoj_tranzakcii}=require('../db/db.js');
const settings=require('./nastrojki-komandy.js');
function actor(value){const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('Нужен автор подсказки');return id;}
function view(db,id){
 const row=db.prepare('SELECT pokazannye_podskazki FROM nastrojki WHERE chelovek_id=?').get(id);
 const seen=new Set(M.tokens(row?.pokazannye_podskazki));
 return {podskazki:M.hints.filter(h=>!seen.has(h.kod)),kody:M.codes,kontekst_nastroek:settings.context(db,id)};
}
function read(avtor){return view(baza(),actor(avtor));}
function normalise(value){try{return M.normalise(value);}catch(error){throw new OshibkaVvoda(error.message,'pokazannye_podskazki');}}
function hide({avtor,telo}){
 const id=actor(avtor),db=baza();
 for(const key of Object.keys(telo))if(!['kod','kontekst_nastroek'].includes(key))throw new OshibkaVvoda('Неизвестный параметр подсказки',key);
 if(!M.hints.some(h=>h.kod===telo.kod))throw new OshibkaVvoda('Выбери код доступной подсказки','kod');
 if(Object.hasOwn(telo,'kontekst_nastroek')&&(typeof telo.kontekst_nastroek!=='string'||!(/^[a-f0-9]{64}$/.test(telo.kontekst_nastroek))))throw new OshibkaVvoda('Обнови подсказку перед закрытием','kontekst_nastroek');
 return v_odnoj_tranzakcii(db,()=>{
  const old=db.prepare('SELECT pokazannye_podskazki FROM nastrojki WHERE chelovek_id=?').get(id)?.pokazannye_podskazki;
  if(M.tokens(old).includes(telo.kod))return {telo:{skryto:true,kod:telo.kod,...view(db,id)}};
  if(telo.kontekst_nastroek&&telo.kontekst_nastroek!==settings.context(db,id))throw new Konflikt('Настройки обновились. Перечитай подсказку перед закрытием',{hints_changed:true});
  let next;try{next=M.append(old,telo.kod);}catch(error){throw new Konflikt(error.message,{hints_unreadable:true});}
  db.prepare('INSERT OR IGNORE INTO nastrojki(chelovek_id)VALUES(?)').run(id);
  db.prepare('UPDATE nastrojki SET pokazannye_podskazki=? WHERE chelovek_id=?').run(next,id);
  return {telo:{skryto:true,kod:telo.kod,...view(db,id)}};
 });
}
module.exports={read,hide,normalise,tokens:M.tokens};
