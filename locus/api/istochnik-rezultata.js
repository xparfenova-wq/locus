const {OshibkaVvoda}=require('../db/db.js');
const FORMULY_LIDOV=new Set(['lidov','novyh_lidov','lidov_ot_referalov']);
function rezhim_lidov(value){
  const mode=value??'tolko_novye';
  if(!['tolko_novye','vse'].includes(mode))throw new OshibkaVvoda('выбери: только новые или все, с кем работали','schitat_lidov');
  return mode;
}
                                                                    
                                                                    
function istochnik_rezultata(d,bylo={}){
  const source=d.istochnik??bylo.istochnik??'ruchnoj_zamer';
  const changed=Object.hasOwn(d,'istochnik')&&d.istochnik!==bylo.istochnik;
  const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
  const bad=(message,field)=>{throw new OshibkaVvoda(message,field);};
  if((d.tip??bylo.tip)==='veha'){
    if(present(d.schitat_lidov))bad('у вехи нет выбора лидов','schitat_lidov');
    if(present(d.istochnik)||present(d.formula)||present(d.akkaunt_id)||present(d.metrika))bad('у вехи нет источника числового факта','istochnik');
    d.istochnik=null;d.formula=null;d.akkaunt_id=null;d.metrika=null;d.schitat_lidov=null;
    return;
  }
  if(Object.hasOwn(d,'istochnik')&&!present(d.istochnik))bad('выбери источник факта','istochnik');
  if(!['formula','ruchnoj_zamer','akkaunt'].includes(source))bad('выбери один из трёх источников','istochnik');
  const row={...bylo,...d};
  if(source!=='formula'){
    if(present(d.formula))bad('источник один: formula только у формульного результата','formula');
    if(changed||!Object.keys(bylo).length)d.formula=null;
  }
  if(source!=='akkaunt'){
    if(present(d.akkaunt_id)||present(d.metrika))bad('источник один: аккаунт и метрика только у аккаунтного результата','akkaunt_id');
    if(changed||!Object.keys(bylo).length){d.akkaunt_id=null;d.metrika=null;}
  }
  if(source==='formula'){
    const formula=String(row.formula||'').trim();
    if(!formula)bad('formula обязательна при источнике formula','formula');
    if(!Object.hasOwn(require('./pokazateli.js').POKAZATELI,formula))bad('выбери существующий показатель','formula');
    if(Object.hasOwn(d,'formula')||changed)d.formula=formula;
  }
  if(source==='formula'&&FORMULY_LIDOV.has(d.formula??bylo.formula)){
    const mode=rezhim_lidov(d.schitat_lidov??bylo.schitat_lidov);
    if(d.schitat_lidov===null)bad('выбери, каких лидов считать','schitat_lidov');
    if(d.schitat_lidov!==undefined||!Object.keys(bylo).length||changed||
        (Object.hasOwn(d,'formula')&&d.formula!==bylo.formula))d.schitat_lidov=mode;
  }else{
    if(present(d.schitat_lidov))bad('выбор лидов доступен только у показателя про лидов','schitat_lidov');
    if(bylo.schitat_lidov!=null)d.schitat_lidov=null;
  }
  if(source==='akkaunt'){
    if(!Number.isSafeInteger(Number(row.akkaunt_id))||Number(row.akkaunt_id)<1)bad('выбери аккаунт','akkaunt_id');
    if(!require('./opisanija.js').METRIKI_AKKAUNTA.includes(row.metrika))bad('выбери метрику аккаунта','metrika');
  }
  if(!Object.hasOwn(d,'istochnik')&&!Object.keys(bylo).length)d.istochnik=source;
}
module.exports={istochnik_rezultata,rezhim_lidov,FORMULY_LIDOV};
