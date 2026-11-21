                                                                                 
const {createHash}=require('node:crypto');
const {OshibkaVvoda,NeNajdeno}=require('../db/db.js');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
function preview(db,actor,t){
 const direction=t.napravlenie;
 if(typeof direction!=='string'||!db.prepare('SELECT 1 FROM napravlenija WHERE kod=? AND COALESCE(arhiv,0)=0').get(direction))throw new OshibkaVvoda('Выбери действующее направление','napravlenie');
 const kinds=['filtry','nabor_filtrov_id','chelovek_ids'].filter(k=>Object.hasOwn(t,k));
 if(kinds.length!==1)throw new OshibkaVvoda('Нужен ровно один источник людей','filtry');
 let filters=null,saved=null,people;
 if(kinds[0]==='chelovek_ids'){
  if(!Array.isArray(t.chelovek_ids)||!t.chelovek_ids.length||t.chelovek_ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new OshibkaVvoda('Отметь людей для рассылки','chelovek_ids');
  const ids=[...new Set(t.chelovek_ids)].sort((a,b)=>a-b);
  people=ids.map(id=>db.prepare('SELECT * FROM ljudi WHERE id=?').get(id));
  if(people.some(p=>!p))throw new OshibkaVvoda('Кто-то из отмеченных людей удалён. Проверь выбор','chelovek_ids');
  if(people.some(p=>p.rol_v_baze==='kontaktnoe_lico'))throw new OshibkaVvoda(require('./kontaktnye-lica.js').OSHIBKA_RASSYLKI,'chelovek_ids');
  if(people.some(p=>p.arhiv===1||p.komanda===1))throw new OshibkaVvoda('В рассылку можно включить только внешних людей вне архива','chelovek_ids');
 }else{
  filters=t.filtry;
  if(kinds[0]==='nabor_filtrov_id'){
   if(!Number.isSafeInteger(t.nabor_filtrov_id)||t.nabor_filtrov_id<1)throw new OshibkaVvoda('Нужен сохранённый набор','nabor_filtrov_id');
   saved=db.prepare('SELECT * FROM sohranennye_filtry WHERE id=?').get(t.nabor_filtrov_id);
   if(!saved||(Number(saved.chelovek_id)!==Number(actor)&&saved.vidimost!=='team'))throw new NeNajdeno('Набора нет');
   try{filters=JSON.parse(saved.filtry);}catch{throw new OshibkaVvoda('Сохранённый отбор повреждён','filtry');}
  }
  if(!filters||typeof filters!=='object'||Array.isArray(filters))throw new OshibkaVvoda('Нужен объект фильтров','filtry');
  if(filters.rol_v_baze==='kontaktnoe_lico')throw new OshibkaVvoda(require('./kontaktnye-lica.js').OSHIBKA_RASSYLKI,'rol_v_baze');
  if(filters.arhiv&&String(filters.arhiv)!=='0')throw new OshibkaVvoda('Верни людей из архива перед добавлением в рассылку','arhiv');
  for(const key of ['stranica','na_stranice','limit','offset','vneshnie','vse_roli'])if(Object.hasOwn(filters,key))throw new OshibkaVvoda('Отбор рассылки применяется ко всему списку внешних людей','filtry');
  const selection=require('./obschij.js').filtry_spiska('ljudi',require('./opisanija.js').OPISANIJA.ljudi,{...filters,arhiv:0,vneshnie:1,vse_roli:0},actor);
  people=db.prepare('SELECT * FROM ljudi '+selection.gde+' ORDER BY id').all(...selection.znachenija);
  if(selection.iskat){const norm=v=>String(v??'').toLowerCase().replace(/ё/g,'е'),search=norm(selection.iskat);people=people.filter(p=>selection.POLJA_POISKA.some(field=>norm(p[field]).includes(search)));}
  people=people.filter(p=>p.rol_v_baze!=='kontaktnoe_lico');
 }
 if(!people.length)throw new OshibkaVvoda('Под этот отбор никто не подходит: рассылку некому слать','filtry');
 const source=kinds[0]==='chelovek_ids'?{chelovek_ids:people.map(p=>p.id)}:saved?{nabor_filtrov_id:saved.id}:{filtry:canonical(filters)};
 return {vybor_bazy:'otbor',...source,spisok:people.map(p=>({id:p.id,imja:p.imja})),vsego:people.length,vybor_versija:hash({actor,direction,source,saved:saved?canonical(saved):null,people:people.map(p=>[p.id,p.imja,p.versija??null,p.rol_v_baze??null,p.arhiv??null,p.komanda??null])})};
}
module.exports={preview};
