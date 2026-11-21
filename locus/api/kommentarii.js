const {OshibkaVvoda,NetDostupa,NeNajdeno,Konflikt,seichas}=require('../db/db.js');
const mentions=require('../public/js/upominanija.js');

function massiv(value){
  if(value===undefined)return [];
  let parsed=value;
  if(typeof value==='string'){
    try{parsed=JSON.parse(value);}catch{throw new OshibkaVvoda('не удалось прочитать выбранные упоминания','upominanija');}
  }
  if(!Array.isArray(parsed))throw new OshibkaVvoda('упоминания должны быть списком','upominanija');
  return parsed;
}
function starye(bylo){
  if(!bylo)return [];
  return massiv(bylo.upominanija).filter(ref=>ref&&Number.isSafeInteger(ref.chelovek_id)&&ref.chelovek_id>0
    &&Number.isSafeInteger(ref.nachalo)&&Number.isSafeInteger(ref.konec)&&ref.nachalo>=0&&ref.konec>ref.nachalo
    &&ref.konec<=bylo.tekst.length&&bylo.tekst[ref.nachalo]==='@');
}
function razobrat(db,text,input,bylo){
  const people=db.prepare('SELECT id,imja,komanda,arhiv FROM ljudi WHERE komanda=1 AND arhiv IS NOT 1').all();
  const old=starye(bylo),urls=mentions.ssylki(text),change=bylo?mentions.izmenenie(bylo.tekst,text):null;
  const unbound=new Set(bylo?mentions.razobrat(bylo.tekst,[])
    .filter(token=>!old.some(ref=>token.nachalo<ref.konec&&token.konec>ref.nachalo)).map(token=>mentions.normal(token.label)):[]);
  const requested=input===undefined?(bylo?mentions.perenesti(bylo.tekst,text,old):[]):massiv(input);
  if(input===undefined&&requested.length<old.length&&old.some(ref=>text.includes(bylo.tekst.slice(ref.nachalo,ref.konec)))){
    const error=new OshibkaVvoda('место прежнего упоминания изменилось: выбери коллегу заново, чтобы сохранить связь','upominanija');
    error.kod=422;throw error;
  }
  const refs=[];
  for(const ref of requested){
    if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).some(key=>!['chelovek_id','nachalo','konec'].includes(key))
      ||!Number.isSafeInteger(ref.chelovek_id)||ref.chelovek_id<1||!Number.isSafeInteger(ref.nachalo)||!Number.isSafeInteger(ref.konec)
      ||ref.nachalo<0||ref.konec<=ref.nachalo||ref.konec>text.length||text[ref.nachalo]!=='@'){
      throw new OshibkaVvoda('упоминание потеряло место в тексте: выбери коллегу заново','upominanija');
    }
    if(urls.some(url=>ref.nachalo<url.konec&&ref.konec>url.nachalo))throw new OshibkaVvoda('ссылка не является упоминанием коллеги','upominanija');
    const label=text.slice(ref.nachalo,ref.konec),person=people.find(p=>p.id===ref.chelovek_id);
    const trusted=old.some(previous=>previous.chelovek_id===ref.chelovek_id&&bylo.tekst.slice(previous.nachalo,previous.konec)===label);
    const name=mentions.normal(label.slice(1)),full=person?mentions.normal(person.imja):'';
    if(!trusted&&(!person||!name||(name!==full&&name!==full.split(' ')[0]))){
      throw new OshibkaVvoda('выбранный участник не соответствует имени в упоминании','upominanija');
    }
    refs.push({chelovek_id:ref.chelovek_id,nachalo:ref.nachalo,konec:ref.konec});
  }
  refs.sort((a,b)=>a.nachalo-b.nachalo);
  for(let i=1;i<refs.length;i++)if(refs[i].nachalo<refs[i-1].konec)throw new OshibkaVvoda('упоминания не могут перекрываться','upominanija');
  for(const mention of mentions.razobrat(text,people)){
    if(refs.some(ref=>mention.nachalo<ref.konec&&mention.konec>ref.nachalo))continue;
    if(unbound.has(mentions.normal(mention.label)))continue;
                                                                          
                                                                       
    if(change&&(mention.konec<=change.nachalo||mention.nachalo>=change.konec))continue;
    const prior=old.filter(ref=>mentions.normal(bylo.tekst.slice(ref.nachalo+1,ref.konec))===mentions.normal(mention.label));
    if(prior.length&&mention.kandidaty.some(person=>!prior.some(ref=>ref.chelovek_id===person.id))){
      const error=new OshibkaVvoda('имя из прежнего упоминания теперь принадлежит другому человеку: выбери коллегу явно','upominanija');
      error.kod=422;throw error;
    }
    if(mention.kandidaty.length>1){
      const names=mention.kandidaty.map(person=>person.imja).join(', ');
      const error=new OshibkaVvoda('@'+mention.label+': подходят несколько коллег ('+names+'). Выбери нужного в поле «позвать коллегу».','tekst');
      error.kod=422;throw error;
    }
    for(const person of mention.kandidaty)refs.push({chelovek_id:person.id,nachalo:mention.nachalo,konec:mention.konec});
  }
  return refs.sort((a,b)=>a.nachalo-b.nachalo);
}
function tekst(d,db,bylo){
  if(typeof d.tekst!=='string'||!d.tekst.trim())throw new OshibkaVvoda('напиши текст комментария','tekst');
  if(!d.tekst.isWellFormed())throw new OshibkaVvoda('в тексте есть повреждённый символ: вставь его заново','tekst');
  if(mentions.dlina(d.tekst)>mentions.limit)throw new OshibkaVvoda('комментарий: не больше 5000 символов','tekst');
  d.upominanija=JSON.stringify(razobrat(db,d.tekst,d.upominanija,bylo));
}
function avtor(bylo,who){
  if(!Number.isSafeInteger(Number(who))||Number(who)<1||Number(bylo.chelovek_id)!==Number(who)){
    throw new NetDostupa('изменить или удалить комментарий может только его автор');
  }
}
function zadacha(db,id){
  const row=db.prepare('SELECT id,udaleno FROM zadachi WHERE id=?').get(id);
  if(!row)throw new NeNajdeno('такой задачи нет');
  if(row.udaleno===1)throw new Konflikt('задача удалена');
}
function pravit(d,bylo,db,who){
  avtor(bylo,who);
  for(const key of Object.keys(d))if(!['tekst','upominanija'].includes(key))throw new OshibkaVvoda('у комментария можно менять только текст и выбранные упоминания',key);
  if(d.tekst===undefined)d.tekst=bylo.tekst;
  zadacha(db,bylo.zadacha_id);tekst(d,db,bylo);
  d.izmeneno=d.tekst!==bylo.tekst||d.upominanija!==bylo.upominanija?seichas():bylo.izmeneno;
}
function sozdat(d,db,who){
  if(!Number.isSafeInteger(who)||who<1)throw new NetDostupa('нужен автор комментария');
  if(d.izmeneno!==undefined)throw new OshibkaVvoda('время изменения считается само','izmeneno');
  d.chelovek_id=who;d.izmeneno=null;zadacha(db,d.zadacha_id);tekst(d,db);
}
function uvedomit(d,db,who,bylo){
  const previous=new Set(starye(bylo).map(ref=>ref.chelovek_id));
  const current=new Set(massiv(d.upominanija).map(ref=>ref.chelovek_id));
  for(const id of current){
    if(previous.has(id))continue;
                                                                             
                                                                          
    if(!db.prepare('SELECT 1 FROM ljudi WHERE id=? AND komanda=1 AND arhiv IS NOT 1').get(id))continue;
    require('./sobytija-uvedomlenij.js').uvedomit(db,{komu:id,avtor:who,tip:'upomjanuli_v_kommentarii',
      potok:'pro_menja',zadacha_id:d.zadacha_id,tekst:'Вас упомянули в комментарии'});
    if(!db.prepare('SELECT 1 FROM zadacha_uchastniki WHERE zadacha_id=? AND chelovek_id=?').get(d.zadacha_id,id)){
      db.prepare('INSERT INTO zadacha_uchastniki(zadacha_id,chelovek_id) VALUES(?,?)').run(d.zadacha_id,id);
    }
  }
}
function dto(db,rows){
  const ids=[...new Set(rows.map(row=>row.chelovek_id))];
  const people=ids.length?db.prepare('SELECT id,imja,foto,versija FROM ljudi WHERE id IN ('+ids.map(()=>'?').join(',')+')').all(...ids):[];
  return rows.map(row=>{const person=people.find(p=>p.id===row.chelovek_id);return {...row,upominanija:massiv(row.upominanija),avtor_imja:person?.imja??null,avtor_foto:person?.foto??null,avtor_versija:person?.versija??0};});
}

                                                                           
                                                                        
function rezhim_chtenija(q){
  if(q.sverit_ot_id===undefined&&q.ids===undefined)return null;
  const allowed=new Set(['zadacha_id','sverit_ot_id','ids','sortirovka','na_stranice']);
  for(const key of Object.keys(q))if(!allowed.has(key))throw new OshibkaVvoda('параметр не подходит для сверки обсуждения: '+key,key);
  const id=(value,field)=>{
    if(!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))throw new OshibkaVvoda('нужен положительный целый номер',field);
    return Number(value);
  };
  const taskId=id(q.zadacha_id,'zadacha_id');
  if(q.sverit_ot_id!==undefined&&q.ids!==undefined)throw new OshibkaVvoda('граница и пакет ID запрашиваются отдельно','ids');
  if(q.na_stranice!==undefined&&id(q.na_stranice,'na_stranice')>200)throw new OshibkaVvoda('не больше 200 строк страницы','na_stranice');
  if(q.sverit_ot_id!==undefined){
    if(q.sortirovka!==undefined&&q.sortirovka!=='id_desc')throw new OshibkaVvoda('сверка начинается с последних комментариев','sortirovka');
    return {taskId,floor:id(q.sverit_ot_id,'sverit_ot_id')};
  }
  const parts=String(q.ids).split(',');
  if(parts.length>100)throw new OshibkaVvoda('не больше 100 ID комментариев в пакете','ids');
  return {taskId,ids:[...new Set(parts.map(value=>id(value,'ids')))]};
}
function sverka(db,mode){
  return {zadacha_id:mode.taskId,ot_id:mode.floor,versii:db.prepare(
    'SELECT c.id,c.versija,coalesce(a.versija,0) avtor_versija FROM kommentarii c LEFT JOIN ljudi a ON a.id=c.chelovek_id WHERE c.zadacha_id=? AND c.id>=? ORDER BY c.id'
  ).all(mode.taskId,mode.floor)};
}
module.exports={razobrat,tekst,avtor,zadacha,pravit,sozdat,uvedomit,dto,rezhim_chtenija,sverka};
