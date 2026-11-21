const {createHash}=require('node:crypto');
const {baza,v_api,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,Konflikt}=require('../db/db');
function snimok(db,owner){
 const rows=db.prepare('SELECT * FROM kontakty WHERE chelovek_id=? ORDER BY porjadok,id').all(owner);
 const kontekst=createHash('sha256').update(JSON.stringify([owner,rows.map(x=>[x.id,x.versija,x.tip,x.porjadok])])).digest('hex');
 return {chelovek_id:owner,kontekst,spisok:require('./osnovnoj-kontakt').spisok(db,rows.map(v_api))};
}
function obrabotat({metod,zapros={},telo={},avtor}){
 if(!['GET','POST'].includes(metod))throw Object.assign(new Error('сюда GET или POST'),{kod:405});
 const data=metod==='GET'?zapros:telo,allowed=metod==='GET'?['chelovek_id']:['chelovek_id','kontekst','porjadok'];
 for(const key of Object.keys(data))if(!allowed.includes(key))throw new OshibkaVvoda('Лишнее поле порядка контактов',key);
 const raw=data.chelovek_id,owner=Number(raw);
 if(!/^[1-9]\d*$/.test(String(raw))||!Number.isSafeInteger(owner))throw new OshibkaVvoda('Нужен номер человека','chelovek_id');
 return v_odnoj_tranzakcii(baza(),()=>{
  const db=baza();if(!db.prepare('SELECT id FROM ljudi WHERE id=?').get(owner))throw new NeNajdeno('Человека нет');
  const current=snimok(db,owner);if(metod==='GET')return {telo:current};
  const ids=data.porjadok;
  if(!Array.isArray(ids)||ids.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(ids).size!==ids.length)throw new OshibkaVvoda('Нужны разные номера контактов в новом порядке','porjadok');
  if(typeof data.kontekst!=='string'||!/^[a-f0-9]{64}$/.test(data.kontekst))throw new OshibkaVvoda('Нужно прочитанное состояние контактов','kontekst');
  if(data.kontekst!==current.kontekst)throw new Konflikt('Контакты изменились. Проверь сохранённый порядок',{porjadok_izmenilsja:true,tekuschij_porjadok:current});
  const lookup=new Map(current.spisok.map(x=>[x.id,x]));
  if(ids.length!==lookup.size||ids.some(x=>!lookup.has(x)))throw new OshibkaVvoda('В порядке должны быть все контакты только этого человека','porjadok');
  const update=db.prepare('UPDATE kontakty SET porjadok=?,versija=versija+1 WHERE id=? AND versija=?');
  ids.forEach((id,index)=>{
   const row=lookup.get(id);if(row.porjadok===index+1)return;
   if(update.run(index+1,id,row.versija).changes!==1)throw new Konflikt('Контакт изменился. Проверь порядок');
   require('./obschij').v_zhurnal(db,'kontakty',id,'porjadok',row.porjadok==null?null:String(row.porjadok),String(index+1),avtor);
   require('./versii').zapomnit(db,'kontakty',id,row.versija,avtor);
  });
  return {telo:snimok(db,owner)};
 });
}
function poCheloveku(ctx){
 if(!['GET','PATCH'].includes(ctx.metod))throw Object.assign(new Error('Сюда GET или PATCH'),{kod:405});
 const owner=Number(ctx.kljuch);if(!/^[1-9]\d*$/.test(String(ctx.kljuch))||!Number.isSafeInteger(owner))throw new OshibkaVvoda('Нужен номер человека','chelovek_id');
 const data=ctx.metod==='GET'?ctx.zapros||{}:ctx.telo||{};
 if(Object.hasOwn(data,'chelovek_id')&&data.chelovek_id!==owner)throw new OshibkaVvoda('Человек указан в адресе','chelovek_id');
 return obrabotat({...ctx,metod:ctx.metod==='GET'?'GET':'POST',zapros:{...data,chelovek_id:owner},telo:{...data,chelovek_id:owner}});
}
module.exports={obrabotat,snimok,poCheloveku};
