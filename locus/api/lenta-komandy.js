const {createHash}=require('node:crypto');
const {baza,v_api,v_odnoj_tranzakcii,OshibkaVvoda,NetDostupa}=require('../db/db.js');
const calendar=require('./kalendar.js'),text=require('../public/js/feed-text.js');
const registered=new WeakSet();
function fields(body,allowed){for(const key of Object.keys(body||{}))if(!allowed.includes(key))throw new OshibkaVvoda('Неизвестный параметр ленты',key);}
function positive(value,field){if(typeof value==='boolean'||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new OshibkaVvoda('Нужен целый номер',field);return Number(value);}
function author(row,actor){if(Number(row.chelovek_id)!==Number(actor))throw new NetDostupa('Создавать и менять запись может её автор');}
function validateText(body){if(!Object.hasOwn(body||{},'tekst'))return;const value=body.tekst;if(typeof value!=='string'||!value.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,''))throw new OshibkaVvoda('Заполни текст записи','tekst');if(Array.from(value).length>5000)throw new OshibkaVvoda('Текст не длиннее 5000 символов','tekst');}
function present(row){return v_api(row);}
function page(ctx){
 const db=baza(),q=ctx.zapros||{};fields(q,['razdel','nedelja','god','chelovek_id','gran','tip_nahodki','porjadok','na_stranice','cursor']);
 if(!registered.has(db)){db.function('locus_feed_type',value=>text.kind(value));db.function('locus_reflection_facet',value=>text.facet(value));registered.add(db);}
 const section=q.razdel||'lenta';if(!['lenta','refleksija'].includes(section))throw new OshibkaVvoda('Выбери ленту или рефлексию','razdel');
 const order=q.porjadok||'novye';if(!['novye','starye'].includes(order))throw new OshibkaVvoda('Неизвестный порядок записей','porjadok');
 const limit=q.na_stranice===undefined?40:positive(q.na_stranice,'na_stranice');if(limit>100)throw new OshibkaVvoda('Не больше 100 записей на странице','na_stranice');
 const person=q.chelovek_id===undefined?null:positive(q.chelovek_id,'chelovek_id');
 const facets=q.gran===undefined?[]:String(q.gran).split(',').sort();if(facets.some(v=>!text.facets.some(row=>row[0]===v))||new Set(facets).size!==facets.length)throw new OshibkaVvoda('Неизвестная грань рефлексии','gran');
 const kind=q.tip_nahodki||null;if(kind&&!['bez_tipa',...text.kinds.map(row=>row[0])].includes(kind))throw new OshibkaVvoda('Неизвестный тип находки','tip_nahodki');
 if(section==='refleksija'&&kind||section==='lenta'&&(facets.length||q.nedelja!==undefined||q.god!==undefined))throw new OshibkaVvoda('Фильтр относится к другому разделу');
 const week=section==='refleksija'?calendar.nedelja_iz_zaprosa(q,calendar.den_moskvy()):null;
 const scope=createHash('sha256').update(JSON.stringify({actor:ctx.avtor,section,order,person,facets,kind,week:week?calendar.kljuch_nedeli(week.god,week.nomer):null})).digest('hex');
 let cursor=null;
 if(q.cursor!==undefined){
  try{if(typeof q.cursor!=='string'||q.cursor.length>2048||!/^[A-Za-z0-9_-]+$/.test(q.cursor))throw new Error();cursor=JSON.parse(Buffer.from(q.cursor,'base64url').toString());if(cursor.v!==1||cursor.scope!==scope||!Number.isSafeInteger(cursor.upper)||cursor.upper<0||!Number.isSafeInteger(cursor.id)||cursor.id<1||cursor.id>cursor.upper||typeof cursor.date!=='string'||cursor.date.length>100)throw new Error();}catch{throw new OshibkaVvoda('Обнови список после изменения фильтров','cursor');}
 }
 return v_odnoj_tranzakcii(db,()=>{
  const upper=cursor?cursor.upper:db.prepare('SELECT COALESCE(max(id),0) n FROM lenta').get().n,where=['id<=?'],args=[upper];
  if(week){where.push("tip='refleksija' AND sprint=? AND god_sprinta=?");args.push(week.nomer,week.god);}
  if(person){where.push('chelovek_id=?');args.push(person);}
  if(facets.length){where.push('locus_reflection_facet(tekst) IN ('+facets.map(()=>'?').join(',')+')');args.push(...facets);}
  if(kind){where.push('locus_feed_type(tekst)=?');args.push(kind);}
  const allWhere=where.join(' AND '),total=db.prepare('SELECT count(*) n FROM lenta WHERE '+allWhere).get(...args).n;
  const ascending=order==='starye',comparison=ascending?'>':'<',direction=ascending?'ASC':'DESC';
  if(cursor){where.push("(COALESCE(sozdano,'')"+comparison+"? OR (COALESCE(sozdano,'')=? AND id"+comparison+'?))');args.push(cursor.date,cursor.date,cursor.id);}
  const rows=db.prepare('SELECT * FROM lenta WHERE '+where.join(' AND ')+" ORDER BY COALESCE(sozdano,'') "+direction+',id '+direction+' LIMIT ?').all(...args,limit+1),more=rows.length>limit,selected=rows.slice(0,limit),last=selected.at(-1);
  const next=more?Buffer.from(JSON.stringify({v:1,scope,upper,id:last.id,date:last.sozdano||''})).toString('base64url'):null;
  return {telo:{razdel:section,...(week?{nedelja:week.nomer,god:week.god}:{}),spisok:selected.map(present),vsego:total,esche:more,sledujuschaja:next}};
 });
}
function weeks(ctx){
 if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET недель рефлексии'),{kod:405});
 const q=ctx.zapros||{};fields(q,['chelovek_id']);const person=positive(q.chelovek_id??ctx.avtor,'chelovek_id'),db=baza();if(!db.prepare('SELECT 1 FROM ljudi WHERE id=?').get(person))throw new (require('../db/db.js').NeNajdeno)('Автор рефлексии не найден');
 return v_odnoj_tranzakcii(db,()=>{
  const grouped=db.prepare("SELECT god_sprinta,sprint,count(*) skolko FROM lenta WHERE tip='refleksija' AND chelovek_id=? GROUP BY god_sprinta,sprint ORDER BY god_sprinta,sprint").all(person),rows=[];let unassigned=0;
  for(const row of grouped){try{const week=calendar.razobrat_nedelju(row.sprint,row.god_sprinta);if(!Number.isInteger(row.sprint)||!Number.isInteger(row.god_sprinta)||week.nomer!==row.sprint||week.god!==row.god_sprinta)throw new Error();rows.push({god:week.god,nedelja:week.nomer,kljuch:calendar.kljuch_nedeli(week.god,week.nomer),zapisey:row.skolko});}catch{unassigned+=row.skolko;}}
  return {telo:{chelovek_id:person,spisok:rows,vsego:rows.length,zapisej_bez_podtverzhdennoj_nedeli:unassigned}};
 });
}
function handle(ctx){
 if(['nedeli','potok','proverka','otmena_popytki'].includes(ctx.dejstvie)){
  if(ctx.kljuch)throw new (require('../db/db.js').NeNajdeno)('У этого действия ленты нет номера записи');
  const expected=ctx.dejstvie==='otmena_popytki'?'POST':'GET';
  if(ctx.metod!==expected)throw Object.assign(new Error('Для этого действия ленты нужен '+expected),{kod:405});
 }
 const db=baza(),store=require('./zapros-sozdanija.js'),id=positive(ctx.avtor,'avtor');
 if(ctx.dejstvie==='nedeli')return weeks(ctx);
 if(ctx.metod==='GET'&&ctx.dejstvie==='potok')return page(ctx);
 if(ctx.metod==='GET'&&ctx.dejstvie==='proverka'){fields(ctx.zapros,['zapros_kljuch']);return {telo:store.check(db,id,'lenta',id,ctx.zapros.zapros_kljuch,present)};}
 if(ctx.metod==='POST'&&ctx.dejstvie==='otmena_popytki'){fields(ctx.telo,['zapros_kljuch']);return v_odnoj_tranzakcii(db,()=>({telo:store.cancel(db,id,'lenta',id,ctx.telo.zapros_kljuch,present)}));}
 if(ctx.metod==='POST'&&!ctx.kljuch&&!ctx.dejstvie){
  const body={...ctx.telo},key=body.zapros_kljuch;delete body.zapros_kljuch;if(body.chelovek_id!=null)author(body,id);validateText(body);
  return v_odnoj_tranzakcii(db,()=>({kod:201,telo:store.create(db,id,'lenta',id,key,body,()=>require('./obschij.js').sozdat('lenta',require('./opisanija.js').OPISANIJA.lenta,body,id),present)}));
 }
 return null;
}
function version(row,body){const value=body?.versija;if(typeof value==='boolean'||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new OshibkaVvoda('Нужна прочитанная версия записи','versija');if(Number(value)!==row.versija)throw new (require('../db/db.js').Konflikt)('Запись уже изменена. Прочитай её перед правкой',{versija:row.versija,tekuschee:v_api(row)});}
module.exports={handle,author,version,validateText};
