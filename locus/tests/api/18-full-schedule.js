const assert=require('node:assert/strict');
const {nado,proverit}=require('../prover.js');
module.exports=async function(){
  const people=[];
  for(let i=0;i<8;i++){
    const person=(await nado('POST','/api/ljudi',{telo:{imja:'Full week teammate '+i,komanda:true}})).telo;
    people.push(person.id);
    for(let day=1;day<=7;day++)await nado('POST','/api/grafik',{telo:{chelovek_id:person.id,nedelja:'2028-W03',den:day,s_kakogo:'8'}});
  }
  const full=(await nado('GET','/api/poleznoe?nedelja=2028-W03&na_stranice=1',{avtor:1})).telo;
  assert.equal(full.grafik.length,56);
  assert.equal(full.grafik.reduce((sum,r)=>sum+r.chasov,0),28);
  for(const id of people){
    const rows=full.grafik.filter(r=>r.chelovek_id===id);
    assert.equal(rows.length,7);assert.equal(rows.reduce((sum,r)=>sum+r.chasov,0),3.5);
  }
  const summary=(await nado('GET','/api/grafik/svodka?nedelja=2028-W03')).telo;
  assert.equal(summary.vsego_chasov,28);assert.equal(summary.spisok.length,8);
  proverit('недельная сетка и сумма часов не обрезаются пагинацией ленты',true);
};
