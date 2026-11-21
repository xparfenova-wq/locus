const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const model=require('../api/tezisy-model.js'),rights=require('../api/prava-strategii.js');
test('strategy years, Unicode paragraphs and order have meaningful input boundaries',()=>{
 const body={god:'2026',tekst:'  Первое направление\n\n— Второй абзац  ',porjadok:0},out=model.validate(body);assert.equal(out.tekst,body.tekst);assert.equal(out.god,'2026');assert.equal(out.porjadok,0);
 for(const year of [1999,2101,2026.5,'две тысячи',true,null,{},' 2026 '])assert.throws(()=>model.validate({...body,god:year}),error=>error.pole==='god');
 for(const year of [2000,2100,'2026'])assert.equal(model.validate({...body,god:year}).god,String(year));
 for(const text of ['',null,4,{},'\u200b\u2003\n'])assert.throws(()=>model.validate({...body,tekst:text}),error=>error.pole==='tekst');
 assert.equal(model.validate({...body,tekst:'😀'.repeat(5000)}).tekst,'😀'.repeat(5000));assert.throws(()=>model.validate({...body,tekst:'😀'.repeat(5001)}),error=>error.pole==='tekst');
 for(const order of [-1,1.5,'первый',true,null,{},'1.0'])assert.throws(()=>model.validate({...body,porjadok:order}),error=>error.pole==='porjadok');
 assert.equal(model.validate({...body,porjadok:'12'}).porjadok,12);
 assert.deepEqual(model.validate({porjadok:2},{god:'legacy invalid year',tekst:'Legacy paragraph'}),{porjadok:2});
});
test('strategy editors are explicit, active team members and separate from system owners',()=>{
 const previous=process.env.LOCUS_STRATEGY_EDITOR_IDS,db=new DatabaseSync(':memory:');db.exec('CREATE TABLE ljudi(id INTEGER PRIMARY KEY,komanda INTEGER,aktiven INTEGER,arhiv INTEGER,dostup TEXT)');for(const id of [61,62,63,64,66])db.prepare("INSERT INTO ljudi VALUES(?,1,1,0,'polnyj')").run(id);
 try{
  delete process.env.LOCUS_STRATEGY_EDITOR_IDS;assert.equal(rights.canEdit(db,61),false);
  process.env.LOCUS_STRATEGY_EDITOR_IDS='61,63';assert.equal(rights.canEdit(db,61),true);assert.equal(rights.canEdit(db,63),true);for(const id of [62,64,66,999])assert.equal(rights.canEdit(db,id),false);
  for(const [field,value]of [['komanda',0],['aktiven',0],['arhiv',1],['dostup','net']]){db.prepare('UPDATE ljudi SET '+field+'=? WHERE id=63').run(value);assert.equal(rights.canEdit(db,63),false);db.prepare("UPDATE ljudi SET komanda=1,aktiven=1,arhiv=0,dostup='polnyj' WHERE id=63").run();}
  db.prepare("UPDATE ljudi SET dostup='bez_deneg' WHERE id=63").run();assert.equal(rights.canEdit(db,63),true);
  process.env.LOCUS_STRATEGY_EDITOR_IDS='61,not-an-id';assert.equal(rights.canEdit(db,61),false);assert.throws(()=>rights.check(db,61),error=>error.kod===403);
 }finally{db.close();if(previous===undefined)delete process.env.LOCUS_STRATEGY_EDITOR_IDS;else process.env.LOCUS_STRATEGY_EDITOR_IDS=previous;}
});
