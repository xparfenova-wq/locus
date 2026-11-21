const assert=require('node:assert/strict');
const {nado,sluchaj,proverit}=require('../prover.js');
module.exports=async function(){
  const create=(fields,avtor=2)=>nado('POST','/api/grafik',{avtor,telo:{chelovek_id:avtor,...fields}}).then(r=>r.telo);
  const own=await create({nedelja:'2026-W53',den:3,s_kakogo:'8,8.5,9.5',chasov:100});
  assert.equal(own.chasov,1.5);assert.equal(own.god,2026);assert.equal(own.nedelja,53);
  const peer=await create({nedelja:'2026-W53',den:3,chasov:6},1);
  for(const [method,body] of [['PATCH',{chasov:9}],['DELETE',undefined]]){
    await sluchaj('чужой график не меняется '+method,method,'/api/grafik/'+own.id,{
      parametry:{avtor:1,telo:body},zhdjom_kod:403});
  }
  await sluchaj('нельзя создать чужой график','POST','/api/grafik',{
    parametry:{avtor:1,telo:{chelovek_id:2,nedelja:'2027-W01',den:4}},zhdjom_kod:403});
  await sluchaj('нельзя передать свой график другому','PATCH','/api/grafik/'+peer.id,{
    parametry:{avtor:1,telo:{versija:peer.versija,chelovek_id:2}},zhdjom_kod:403});
  const privileged=(await nado('PATCH','/api/grafik/'+peer.id,{telo:{versija:peer.versija,chasov:7}})).telo;
  assert.equal(privileged.chasov,7);
  assert.equal((await nado('GET','/api/poleznoe',{avtor:2})).telo.grafik_mozhno_pravit_chuzhoj,true);
  assert.equal((await nado('GET','/api/poleznoe',{avtor:1})).telo.grafik_mozhno_pravit_chuzhoj,false);
  const copied=(await nado('POST','/api/grafik/kopirovat',{telo:{iz:'2026-W53',v:'2027-W01'}})).telo;
  assert.equal(copied.skopirovano,1);assert.equal(copied.iz_god,2026);assert.equal(copied.v_god,2027);
  const next=(await nado('GET','/api/grafik?nedelja=2027-W01')).telo.spisok;
  assert.equal(next.length,1);assert.equal(next[0].chelovek_id,2);assert.equal(next[0].chasov,1.5);
  const again=(await nado('POST','/api/grafik/kopirovat',{telo:{iz:'2026-W53',v:'2027-W01'}})).telo;
  assert.equal(again.skopirovano,0);assert.equal(again.propuscheno,1);
  assert.equal((await nado('GET','/api/grafik/svodka?nedelja=2027-W01')).telo.vsego_chasov,1.5);
  assert.equal((await nado('GET','/api/nedeli?sprint=2027-W01')).telo.plan_sum,1.5);
  const workload=(await nado('GET','/api/ljudi/2/zagruzka?nedelja=2027-W01')).telo;
  assert.equal(workload.chasov,1.5);assert.equal(workload.god,2027);
  for(const fields of [{den:0},{chasov:-1},{s_kakogo:'8,broken'},{nedelja:'2027-W53'}]){
    await sluchaj('неверный график не сохраняется','PATCH','/api/grafik/'+own.id,{
      parametry:{telo:{versija:own.versija,...fields}},zhdjom_kod:400});
  }
  await nado('PATCH','/api/grafik/'+own.id,{telo:{versija:own.versija,ne_rabotaju:true}});
  assert.equal((await nado('GET','/api/grafik/'+own.id)).telo.chasov,0);
  for(const year of [2026,2027]){
    await nado('POST','/api/lenta',{telo:{chelovek_id:2,tip:'refleksija',tekst:'Year reflection '+year,
      napravlenie:'synapt',sprint:year+'-W01'}});
    const reflection=(await nado('GET','/api/refleksija?nedelja='+year+'-W01')).telo;
    assert.equal(reflection.god,year);
    assert.equal(reflection.zapisi.length,1);assert.equal(reflection.zapisi[0].tekst,'Year reflection '+year);
    await nado('POST','/api/planerka/snimok?napravlenie=synapt&nedelja='+year+'-W01');
  }
  const old=(await nado('GET','/api/planerka/snimok?napravlenie=synapt&nedelja=2026-W01')).telo;
  const newer=(await nado('GET','/api/planerka/snimok?napravlenie=synapt&nedelja=2027-W01')).telo;
  assert.equal(old.god,2026);assert.equal(newer.god,2027);
  assert.equal(old.dannye.god,2026);assert.equal(newer.dannye.god,2027);
  await nado('POST','/api/planerka/snimok?napravlenie=synapt&nedelja=2027-W01');
  assert.deepEqual((await nado('GET','/api/planerka/snimok?napravlenie=synapt&nedelja=2026-W01')).telo,old);
  const editable=await create({nedelja:'2026-W53',den:7,chasov:2});
  const moved=(await nado('PATCH','/api/grafik/'+editable.id,{telo:{versija:editable.versija,nedelja:'2027-W02'}})).telo;
  assert.equal(moved.god,2027);assert.equal(moved.nedelja,2);
  await sluchaj('неделя и явный год должны совпадать','PATCH','/api/grafik/'+editable.id,{
    parametry:{telo:{versija:moved.versija,nedelja:'2026-W53',god:2027}},zhdjom_kod:400});
  await sluchaj('второй график на тот же день не создаётся','POST','/api/grafik',{
    parametry:{telo:{chelovek_id:2,nedelja:'2027-W02',den:7,chasov:3}},zhdjom_kod:409});
  const interval=await create({chelovek_id:1,nedelja:'2027-W03',den:3,chasov:4,s_kakogo:'15:00',do_kakogo:'19:00'});
  assert.equal(interval.chelovek_id,1);assert.equal(interval.chasov,4);
  assert.equal(interval.s_kakogo,'15,15.5,16,16.5,17,17.5,18,18.5');
  proverit('график и снимки разных лет независимы, правится и копируется только свой график',true);
};
