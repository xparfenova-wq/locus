const {baza,NetDostupa,OshibkaVvoda,Konflikt,v_api}=require('../db/db.js');
const schema=require('../public/js/anketa.js');
function sohranit(telo,avtor){
 if(!Number.isSafeInteger(avtor)||avtor<1)throw new NetDostupa('нужен хозяин анкеты');
 if(!telo||typeof telo!=='object'||Array.isArray(telo))throw new OshibkaVvoda('нужен объект анкеты');
 const target=Object.hasOwn(telo,'chelovek_id')?Number(telo.chelovek_id):avtor;
 if(target!==avtor)throw new NetDostupa('анкету заполняет только её хозяин');
 const allowed=new Set(['chelovek_id','versija',...schema.polja.map(([key])=>key),...schema.legacy]);
 for(const key of Object.keys(telo))if(!allowed.has(key))throw new OshibkaVvoda('неизвестное поле: '+key,key);
 const db=baza(),person=db.prepare('SELECT komanda FROM ljudi WHERE id=?').get(avtor);
 if(person?.komanda!==1)throw new NetDostupa('анкета заполняется только человеком команды');
 const common=require('./obschij.js'),description=require('./opisanija.js').OPISANIJA.anketa;
 const existing=db.prepare('SELECT * FROM anketa WHERE chelovek_id=?').get(avtor);
 if(!existing)return common.sozdat('anketa',description,{...telo,chelovek_id:avtor},avtor);
 const {chelovek_id,...changes}=telo;
 if(!Object.keys(changes).some(key=>key!=='versija'))return common.odna('anketa',description,avtor,avtor);
 if(changes.versija===undefined){
  const head=db.prepare("SELECT * FROM versii_polej WHERE tablica='anketa' AND obekt_id=? AND pole=''").get(avtor);
  const author=head?.kto?db.prepare('SELECT imja FROM ljudi WHERE id=?').get(head.kto):null;
  throw new Konflikt('Анкета уже появилась. Проверь сохранённые ответы',{
   versija:existing.versija,tekuschee:v_api(existing),kto:head?.kto??null,kto_imja:author?.imja??null,kogda:head?.kogda??null,
   ...(!head?{istorija_nepolnaja:true}:{})});
 }
                                                                            
                                                                          
 return common.pravit('anketa',description,avtor,changes,avtor);
}
module.exports={sohranit};
