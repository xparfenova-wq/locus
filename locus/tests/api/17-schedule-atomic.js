const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {nado,sluchaj,proverit}=require('../prover.js');
module.exports=async function(){
  const create=async den=>(await nado('POST','/api/grafik',{telo:{chelovek_id:2,nedelja:'2030-W01',den,s_kakogo:'8'}})).telo;
  const a=await create(1),b=await create(2);
  const db=new DatabaseSync(process.env.LOCUS_BAZA);
  const rows=()=>db.prepare('SELECT * FROM grafik WHERE god=2030 AND nedelja=1 AND chelovek_id=2 ORDER BY den').all();
  const journal=()=>db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='grafik'").get().n;
  const data=(row,extra={})=>({id:row.id,versija:row.versija,den:row.den,chasov:1,s_kakogo:'8,8.5',...extra});
  const request=dni=>({telo:{chelovek_id:2,nedelja:'2030-W01',dni}});
  try{
    const before=rows(),count=journal();
    await sluchaj('неверный второй день откатывает всю неделю','POST','/api/grafik/sohranit',{
      parametry:request([data(a),data(b,{chasov:-1,s_kakogo:undefined})]),zhdjom_kod:400});
    assert.deepEqual(rows(),before);assert.equal(journal(),count);
    const peer=(await nado('PATCH','/api/grafik/'+b.id,{telo:{versija:b.versija,s_kakogo:'9,9.5'}})).telo;
    const afterPeer=rows(),peerCount=journal();
    await sluchaj('устаревший второй день не даёт частичной записи','POST','/api/grafik/sohranit',{
      parametry:request([data(a),data(b)]),zhdjom_kod:409});
    assert.deepEqual(rows(),afterPeer);assert.equal(journal(),peerCount);
    db.exec(`CREATE TRIGGER schedule_fail_audit BEFORE INSERT ON zhurnal
      WHEN NEW.obekt='grafik' AND NEW.obekt_id=${b.id}
      BEGIN SELECT RAISE(ABORT,'schedule_audit_failure'); END;`);
    await sluchaj('ошибка журнала второго дня откатывает записи и журнал','POST','/api/grafik/sohranit',{
      parametry:request([data(a),data(peer)]),zhdjom_kod:500});
    assert.deepEqual(rows(),afterPeer);assert.equal(journal(),peerCount);
    db.exec('DROP TRIGGER schedule_fail_audit');
    const saved=(await nado('POST','/api/grafik/sohranit',request([data(a),data(peer)]))).telo;
    assert.equal(saved.spisok.length,2);assert.equal(saved.spisok[0].chasov,1);
    assert.equal(saved.spisok[0].versija,a.versija+1);assert.equal(saved.spisok[1].versija,peer.versija+1);
    await sluchaj('обычный участник не сохраняет чужую неделю','POST','/api/grafik/sohranit',{
      parametry:{...request([data(a)]),avtor:1},zhdjom_kod:403});
    const actual=saved.spisok[0];
    await create(3);const afterCreate=rows();
    await sluchaj('новая строка другого участника тоже обнаруживается как конфликт','POST','/api/grafik/sohranit',{
      parametry:request([data(actual,{s_kakogo:'10'}),{den:3,s_kakogo:'10',chasov:0.5}]),zhdjom_kod:409});
    assert.deepEqual(rows(),afterCreate);
    proverit('сохранение недели атомарно при валидации, чужой правке, новом дне и ошибке журнала',true);
  }finally{db.exec('DROP TRIGGER IF EXISTS schedule_fail_audit');db.close();}
};
