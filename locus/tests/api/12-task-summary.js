                                                                             
const assert=require('node:assert/strict');
const {nado,sluchaj,proverit}=require('../prover.js');
module.exports=async function(){
  const {segodnja,nomer_nedeli}=require('../../db/db');
  const today=segodnja(),week=nomer_nedeli(today);
  const day=offset=>new Date(Date.parse(today+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
  const person=(await nado('POST','/api/ljudi',{telo:{imja:'Клиент для сводки'}})).telo;
  const make=fields=>nado('POST','/api/zadachi',{telo:{nazvanie:'Сводка Ёж',napravlenie:'synapt',
    otvetstvennyj:2,tip:'vnutrennjaja',sprint:week,srok:day(7),...fields}}).then(r=>r.telo);
  for(let i=0;i<205;i++)await make({nazvanie:'Сводка Ёж '+i});
  await make({tip:'klientskaja',klient_id:person.id,srok:day(-1),publikacija:true,ploshadka:'telegram',format:'post',data_vyhoda:day(-1)});
  await make({tip:'klientskaja',klient_id:person.id,srok:day(-1),status:'sdelano'});
  await make({napravlenie:'media',otvetstvennyj:1});
  const repeat=await make({povtorjaetsja:true,chastota:'kazhdyj_den',povtor_s:day(-2),srok:null,sprint:null});
  await nado('POST',`/api/zadachi/${repeat.nomer}/otmetki`,{telo:{data:today}});
  const archived=await make({});
  await nado('DELETE',`/api/zadachi/${archived.nomer}`,{telo:{versija:archived.versija}});
  const query=new URLSearchParams({q:'сводка еж',na_stranice:'7'});
  const base=query.toString();
  for(const [filter,total] of [['',209],['status=sdelano',1],['prosrochennye=1',2],
    ['prosrocheno=1',2],['status=prosrochena',1],['napravlenie=media',1],
    ['otvetstvennyj=1',1],['tip=klientskaja',2],['publikacija=true',1],['arhivnye=1',1]]){
    const params=base+(filter?'&'+filter:'');
    const list=(await nado('GET','/api/zadachi?'+params)).telo;
    const summary=(await nado('GET','/api/zadachi/svodka?'+params)).telo;
    assert.equal(list.vsego,total,filter);
    assert.equal(summary.vsego,total,filter);
    assert.equal(Object.values(summary.po_tipu).reduce((a,b)=>a+b,0),total,filter);
    assert.equal(Object.values(summary.po_tipam).reduce((a,b)=>a+b,0),total,filter);
    assert.equal(Object.values(summary.po_statusu).reduce((a,b)=>a+b,0),total,filter);
    assert.equal(Object.values(summary.po_napravlenijam).reduce((a,b)=>a+b,0),total,filter);
    proverit('сводка и полный список: '+(filter||'кириллица и пагинация'),true);
  }
  const all=(await nado('GET','/api/zadachi?'+base)).telo;
  assert.equal(all.spisok.length,7);
  assert.equal(all.stranic,30);
  const p2=(await nado('GET','/api/zadachi?'+base+'&stranica=2')).telo;
  assert.equal(p2.spisok.length,7);
  assert.ok(!p2.spisok.some(row=>all.spisok.some(first=>first.id===row.id)));
  for(const endpoint of ['/api/zadachi?','/api/zadachi/svodka?']){
    await sluchaj('одинаковая проверка неизвестного фильтра','GET',endpoint+'not_a_filter=1',{zhdjom_kod:422});
  }
};
