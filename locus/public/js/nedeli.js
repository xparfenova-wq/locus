(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.LOCUS_NEDELI=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
                                                                     
                                                            
function neverno(text, pole) {
  throw Object.assign(new Error(text), { kod: 400, pole });
}
function data(den, pole='den') {
  if (typeof den !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(den)) neverno('нужна существующая дата ГГГГ-ММ-ДД',pole);
  const d=new Date(den+'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==den) neverno('нужна существующая дата ГГГГ-ММ-ДД',pole);
  return d;
}
const MOSCOW_DAY=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'});
function den_moskvy(moment=new Date()) { return MOSCOW_DAY.format(moment); }
function sdvinut_den(den,sdvig) {
  if(!Number.isInteger(sdvig))neverno('сдвиг дня: целое число','sdvig');
  const d=data(den);d.setUTCDate(d.getUTCDate()+sdvig);
  return d.toISOString().slice(0,10);
}
function raznica_dnej(ot,po) { return Math.round((data(po)-data(ot))/86400000); }
function iso_nedelja(den) {
  const d=data(den);
  d.setUTCHours(0,0,0,0);
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const god=d.getUTCFullYear();
  return { god, nomer:Math.ceil(((d-Date.UTC(god,0,1))/86400000+1)/7) };
}
function nedel_v_godu(god) {
  if (!Number.isInteger(god) || god<1900 || god>9998) neverno('god: целый год от 1900 до 9998','god');
  return iso_nedelja(`${god}-12-28`).nomer;
}
function granicy_nedeli(god, nomer) {
  if (!Number.isInteger(nomer) || nomer<1 || nomer>nedel_v_godu(god)) {
    neverno(`в ${god} году недель: ${nedel_v_godu(god)}`,'sprint');
  }
  const d=new Date(Date.UTC(god,0,4,12));
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1+(nomer-1)*7);
  const nachalo=d.toISOString().slice(0,10);
  d.setUTCDate(d.getUTCDate()+6);
  return {nachalo,konec:d.toISOString().slice(0,10)};
}
function razobrat_nedelju(value, fallbackGod, pole='sprint') {
  const text=String(value??'').trim();
  const match=text.match(/^(?:(\d{4})-W?)?(\d{1,2})$/i);
  if (!match) neverno('спринт: номер недели или ГГГГ-WНН',pole);
  const god=match[1]?Number(match[1]):Number(fallbackGod),nomer=Number(match[2]);
  const borders=granicy_nedeli(god,nomer);
  return {god,nomer,...borders};
}
function nedelja_iz_zaprosa(query, den) {
  const current=iso_nedelja(den);
  const god=query.god===undefined?current.god:Number(query.god);
  let value=query.nedelja??query.sprint??current.nomer;
  if (value==='' || value==='sejchas' || value==='tekuschaja') value=current.nomer;
  const result=razobrat_nedelju(value,god);
  if (query.god!==undefined && result.god!==god) neverno('год и спринт указывают на разные годы','god');
  return result;
}
function sdvinut_nedelju(god,nomer,sdvig) {
  if (!Number.isInteger(sdvig)) neverno('сдвиг недели: целое число','sdvig');
  const d=data(granicy_nedeli(god,nomer).nachalo);
  d.setUTCDate(d.getUTCDate()+sdvig*7);
  const next=iso_nedelja(d.toISOString().slice(0,10));
  return {...next,...granicy_nedeli(next.god,next.nomer)};
}
const kljuch_nedeli=(god,nomer)=>`${god}-W${String(nomer).padStart(2,'0')}`;
return {data,den_moskvy,sdvinut_den,raznica_dnej,iso_nedelja,nedel_v_godu,granicy_nedeli,razobrat_nedelju,
  nedelja_iz_zaprosa,sdvinut_nedelju,kljuch_nedeli};

});
