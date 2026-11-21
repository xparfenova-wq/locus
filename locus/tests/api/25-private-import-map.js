const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {zapros,proverit}=require('../prover.js');
module.exports=async()=>{
  const db=new DatabaseSync(process.env.LOCUS_BAZA);
  try{
    db.prepare("INSERT INTO import_svjazi(istochnik,tablica,staryj_id,chast,chelovek_id,sha256,ishodnye_dannye,sozdano) VALUES('fixture','base_person','private','person',2,'fixture','{\"contact\":\"private dictionary fixture\"}','2030-01-01')").run();
    for(const [method,url] of [['GET','/api/import_svjazi'],['GET','/api/import_svjazi/private'],['POST','/api/import_svjazi']]){
      const result=await zapros(method,url,{telo:method==='POST'?{}:undefined});assert.equal(result.kod,404);assert.equal(JSON.stringify(result.telo).includes('private dictionary fixture'),false);
    }
    const exported=await zapros('GET','/api/vygruzka?chto=import_svjazi');assert.equal(exported.kod,400);assert.equal(JSON.stringify(exported.telo).includes('private dictionary fixture'),false);
    proverit('служебные исходники импорта не доступны обычным API даже при заполненной таблице',true);
  }finally{db.prepare("DELETE FROM import_svjazi WHERE istochnik='fixture' AND staryj_id='private'").run();db.close();}
};
