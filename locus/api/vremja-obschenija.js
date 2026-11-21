const kalendar=require('./kalendar.js');
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
const fail=()=>{throw Object.assign(new Error('Нужна существующая дата ГГГГ-ММ-ДД или дата со временем и часовым поясом'),{code:'invalid_communication_date'});};
function razobrat(value){
 if(typeof value!=='string'||value.length>80)fail();const text=value.trim();
 const m=/^(\d{4}-\d{2}-\d{2})(?:([T ])(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);if(!m)fail();
 try{kalendar.data(m[1]);}catch{fail();}
 if(m[3]!==undefined&&(Number(m[3])>23||Number(m[4])>59||Number(m[5]||0)>59))fail();
 if(m[7]&&m[7]!=='Z'&&(Number(m[7].slice(1,3))>23||Number(m[7].slice(4))>59))fail();
 const dateOnly=m[3]===undefined,instant=Date.parse(dateOnly?m[1]+'T00:00:00+03:00':m[1]+'T'+m[3]+':'+m[4]+':'+(m[5]||'00')+(m[6]||'')+(m[7]||'Z'));
 if(!Number.isFinite(instant))fail();
 return {moment:instant,znachenie:dateOnly?m[1]:new Date(instant).toISOString().replace('T',' ').replace(/\.000Z$/,'').replace(/Z$/,'')};
}
function prochitat(value){try{return razobrat(value);}catch{return null;}}
function denMoment(moment){const p=Object.fromEntries(formatter.formatToParts(new Date(moment)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
function den(value){const parsed=prochitat(value);return parsed?denMoment(parsed.moment):null;}
function dnej(value,now=Date.now()){
 const day=den(value);if(!day)return null;const today=denMoment(now);
 const result=Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000);return result<0?null:result;
}
module.exports={razobrat,prochitat,den,denMoment,dnej};
