const assert=require('node:assert/strict');
const {nado,sluchaj,proverit}=require('../prover.js');
module.exports=async function(){
  for(const suffix of ['den=2027-01-01','sprint=2026-W53','god=2026&nedelja=53']){
    const week=(await nado('GET','/api/nedeli?'+suffix)).telo;
    assert.deepEqual(Object.fromEntries(['god','nomer','nachalo','konec'].map(k=>[k,week[k]])),
      {god:2026,nomer:53,nachalo:'2026-12-28',konec:'2027-01-03'});
    proverit('ISO-неделя через HTTP: '+suffix,true);
  }
  for(const url of ['/api/nedeli?god=2027&nedelja=53',
    '/api/nedeli?sprint=2026-43junk','/api/nedeli?den=2026-02-30',
    '/api/moe_prostranstvo?god=2027&sprint=53','/api/ekran_zadach?god=2027&sprint=53']){
    await sluchaj('недопустимая календарная неделя','GET',url,{zhdjom_kod:400});
  }
  const range=(await nado('GET','/api/sprinty?den=2027-01-01')).telo;
  assert.equal(range.spisok.length,12);
  assert.equal(range.spisok.filter(w=>w.tekuschij).length,1);
  assert.ok(range.spisok.some(w=>w.god===2027&&w.nomer===1));
  const workspace=(await nado('GET','/api/moe_prostranstvo?den=2027-01-01')).telo;
  assert.equal(workspace.sprint,53);
  assert.equal(workspace.nedelja.god,2026);
  assert.equal(workspace.nedelja.konec,'2027-01-03');
  const screen=(await nado('GET','/api/ekran_zadach?sprint=2026-W53')).telo;
  assert.equal(screen.sprint,53);
  assert.equal(screen.nedelja.god,2026);
  assert.equal(screen.nedelja.konec,'2027-01-03');
};
