const {NetDostupa}=require('../db/db.js');
function mozhet_chuzhoj(avtor){
  return new Set((process.env.LOCUS_GRAFIK_ADMIN_IDS||'').split(',')
    .map(x=>Number(x.trim())).filter(x=>Number.isSafeInteger(x)&&x>0)).has(Number(avtor));
}
function proverit(chelovek,avtor){
  if(Number(chelovek)!==Number(avtor)&&!mozhet_chuzhoj(avtor)){
    throw new NetDostupa('можно менять свой график; чужой — только с отдельным доступом');
  }
}
module.exports={mozhet_chuzhoj,proverit};
