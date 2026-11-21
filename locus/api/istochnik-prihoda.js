const {OshibkaVvoda}=require('../db/db.js');
const POLJA=['istochnik','istochnik_tekst','rekomendoval_id','rassylka_id'];
const VIDY=['rekomendacija','rassylka','meroprijatie','sajt','socseti','holodnyj_kontakt','svoj'];
function proverit(d,bylo){
                                                                      
  if(bylo&&!POLJA.some(field=>Object.hasOwn(d,field))){
    if(d.chelovek_id!==undefined&&bylo.istochnik==='rekomendacija'&&bylo.rekomendoval_id!=null&&
      Number(d.chelovek_id)===Number(bylo.rekomendoval_id)){
      throw new OshibkaVvoda('человек не может порекомендовать сам себя','rekomendoval_id');
    }
    return;
  }
  const changed=!bylo||Object.hasOwn(d,'istochnik')&&d.istochnik!==bylo.istochnik;
  const source=Object.hasOwn(d,'istochnik')?d.istochnik:bylo?.istochnik;
  const row={...bylo,...d};
  const fail=(message,field)=>{throw new OshibkaVvoda(message,field);};
  if(source!=null&&source!==''&&!VIDY.includes(source))fail('выбери существующий источник','istochnik');
  if(changed){
                                                                         
    for(const field of ['istochnik_tekst','rekomendoval_id','rassylka_id'])if(!Object.hasOwn(d,field))row[field]=null;
  }
  const has=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
  if(source==='rekomendacija'&&!has(row.rekomendoval_id))fail('выбери, кто порекомендовал','rekomendoval_id');
  if(source==='rekomendacija'&&Number(row.rekomendoval_id)===Number(row.chelovek_id))fail('человек не может порекомендовать сам себя','rekomendoval_id');
  if(source==='rassylka'&&!has(row.rassylka_id))fail('выбери рассылку','rassylka_id');
  if(['meroprijatie','svoj'].includes(source)&&!has(row.istochnik_tekst))fail(source==='meroprijatie'?'укажи мероприятие':'укажи свой источник','istochnik_tekst');
  const allowed={istochnik_tekst:['meroprijatie','svoj'],rekomendoval_id:['rekomendacija'],rassylka_id:['rassylka']};
  for(const [field,sources] of Object.entries(allowed)){
    if(!sources.includes(source)){
      if(Object.hasOwn(d,field)&&has(d[field]))fail('уточнение не относится к выбранному источнику',field);
      if(changed&&bylo?.[field]!=null)d[field]=null;
    }else if(field==='istochnik_tekst'&&Object.hasOwn(d,field))d[field]=String(d[field]).trim();
  }
  if(source==='')d.istochnik=null;
}
module.exports={proverit,POLJA,VIDY};
