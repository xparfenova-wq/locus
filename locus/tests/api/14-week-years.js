const assert=require('node:assert/strict');
const {nado,sluchaj,proverit}=require('../prover.js');
module.exports=async function(){
  const prefix='Year partition proof';
  const make=fields=>nado('POST','/api/zadachi',{telo:{nazvanie:prefix,tip:'vnutrennjaja',
    napravlenie:'synapt',otvetstvennyj:2,...fields}}).then(r=>r.telo);
  const old=await make({nazvanie:prefix+' old',sprint:'2026-W01'});
  const future=await make({nazvanie:prefix+' future',sprint:'2027-W01',status:'sdelano'});
  assert.equal(old.sprint,1);assert.equal(old.god_sprinta,2026);assert.equal(old.srok,'2026-01-04');
  assert.equal(future.sprint,1);assert.equal(future.god_sprinta,2027);assert.equal(future.srok,'2027-01-10');
  for(const [year,wanted,unwanted] of [[2026,old,future],[2027,future,old]]){
    const query=new URLSearchParams({q:prefix,sprint:year+'-W01'});
    const list=(await nado('GET','/api/zadachi?'+query)).telo;
    assert.equal(list.vsego,1);assert.equal(list.spisok[0].id,wanted.id);
    assert.ok(!list.spisok.some(z=>z.id===unwanted.id));
    assert.equal((await nado('GET','/api/zadachi/svodka?'+query)).telo.vsego,1);
    assert.equal((await nado('GET','/api/svodka?'+query)).telo.vsego,1);
  }
  const parent=await make({nazvanie:prefix+' parent',sprint:'2027-W01',podzadachi:[{nazvanie:prefix+' child'}]});
  const children=(await nado('GET','/api/zadachi?roditel_id='+parent.id)).telo.spisok;
  assert.equal(children.length,1);assert.equal(children[0].god_sprinta,2027);
  assert.equal(children[0].sprint,1);assert.equal(children[0].srok,'2027-01-10');
  const workspace=(await nado('GET','/api/moe_prostranstvo?sprint=2027-W01')).telo;
  const serialized=JSON.stringify(workspace);
  assert.ok(serialized.includes(prefix+' parent'));
  assert.ok(!serialized.includes(prefix+' old'));
  const meeting=(await nado('GET','/api/planerka?napravlenie=synapt&nedelja=2027-W01')).telo;
  assert.ok(JSON.stringify(meeting).includes(prefix+' parent'));
  assert.ok(!JSON.stringify(meeting).includes(prefix+' old'));
  assert.equal((await nado('GET','/api/nedeli?sprint=2027-W01')).telo.summa_fakta,1);
  for(const fields of [{sprint:'2027-W53'},{sprint:'2026-W01',god_sprinta:2027},
    {sprint:1,srok:'2026-02-30'}]){
    await sluchaj('не записывается неправильная неделя/дата','POST','/api/zadachi',{
      parametry:{telo:{nazvanie:prefix+' invalid',napravlenie:'synapt',otvetstvennyj:2,...fields}},zhdjom_kod:400});
  }
  const source=await make({nazvanie:prefix+' extend',sprint:'2026-W01',srok:'2026-01-02'});
  await sluchaj('продление не подменяет владельца','POST','/api/zadachi/prodlit',{
    parametry:{telo:{chelovek_id:1,sprint:'2027-W01'}},zhdjom_kod:403});
  const extended=(await nado('POST','/api/zadachi/prodlit',{telo:{sprint:'2027-W01'}})).telo;
  const current=(await nado('GET','/api/zadachi/'+source.nomer)).telo;
  assert.equal(current.sprint,1);assert.equal(current.god_sprinta,2027);assert.equal(current.srok,'2027-01-10');
  await sluchaj('чужая операция продления не отменяется','POST','/api/zadachi/prodlit/otmena',{
    parametry:{avtor:1,telo:{operacija_id:extended.operacija_id}},zhdjom_kod:403});
  await nado('POST','/api/zadachi/prodlit/otmena',{telo:{operacija_id:extended.operacija_id}});
  const restored=(await nado('GET','/api/zadachi/'+source.nomer)).telo;
  assert.equal(restored.sprint,source.sprint);assert.equal(restored.god_sprinta,source.god_sprinta);
  assert.equal(restored.srok,source.srok);
  const again=(await nado('POST','/api/zadachi/prodlit',{telo:{sprint:'2027-W01'}})).telo;
  const moved=(await nado('GET','/api/zadachi/'+source.nomer)).telo;
  await nado('PATCH','/api/zadachi/'+source.nomer,{avtor:1,telo:{versija:moved.versija,nazvanie:prefix+' peer edit'}});
  await sluchaj('отмена не затирает правку другого участника','POST','/api/zadachi/prodlit/otmena',{
    parametry:{telo:{operacija_id:again.operacija_id}},zhdjom_kod:409});
  const kept=(await nado('GET','/api/zadachi/'+source.nomer)).telo;
  assert.equal(kept.nazvanie,prefix+' peer edit');assert.equal(kept.god_sprinta,2027);
  proverit('ISO-год сохраняется в задаче, подзадаче, списке, сводке, планёрке и отмене',true);
};
