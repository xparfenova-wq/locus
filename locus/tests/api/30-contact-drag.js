const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {nado,zapros,proverit}=require('../prover');
module.exports=async()=>{
 const db=new DatabaseSync(process.env.LOCUS_BAZA),make=async(table,telo)=>(await nado('POST','/api/'+table,{telo})).telo;
 try{
  const person=await make('ljudi',{imja:'Drag alias owner'}),other=await make('ljudi',{imja:'Drag alias other'}),rows=[];
  for(let i=0;i<3;i++)rows.push(await make('kontakty',{chelovek_id:person.id,tip:'pochta',znachenie:'drag-alias-'+i+'@example.test'}));
  const route='/api/ljudi/'+person.id+'/kontakty/porjadok',read=(await nado('GET',route)).telo,legacy=(await nado('GET','/api/kontakty/porjadok?chelovek_id='+person.id)).telo;assert.deepEqual(read,legacy);proverit('адрес порядка из К-1371 читает тот же снимок и контекст',true);
  const ids=[...read.spisok].reverse().map(r=>r.id),changed=(await nado('PATCH',route,{telo:{kontekst:read.kontekst,porjadok:ids}})).telo;assert.deepEqual(changed.spisok.map(r=>r.id),ids);assert.deepEqual(changed.spisok.map(r=>r.porjadok),[1,2,3]);proverit('PATCH по человеку сохраняет точную последовательность без пропусков',true);
  assert.deepEqual((await nado('GET',route)).telo,changed);assert.deepEqual((await nado('GET','/api/ljudi/'+person.id+'/celikom')).telo.kontakty.map(r=>r.id),ids);proverit('последующее чтение и карточка возвращают серверный порядок',true);
  const state=()=>JSON.stringify(['kontakty','zhurnal','versii_polej'].map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all())),before=state();
  const stale=await zapros('PATCH',route,{telo:{kontekst:read.kontekst,porjadok:read.spisok.map(r=>r.id)}});assert.equal(stale.kod,409);assert.deepEqual(stale.telo.tekuschij_porjadok,changed);assert.equal(state(),before);proverit('старый жест отклоняется без перезаписи нового порядка и истории',true);
  const foreign=await zapros('PATCH',route,{telo:{chelovek_id:other.id,kontekst:changed.kontekst,porjadok:ids}});assert.equal(foreign.kod,400);assert.equal(state(),before);proverit('тело запроса не может перенаправить жест на другого человека',true);
  assert.equal((await zapros('POST',route,{telo:{kontekst:changed.kontekst,porjadok:ids}})).kod,405);assert.equal((await zapros('PATCH',route+'/extra',{telo:{kontekst:changed.kontekst,porjadok:ids}})).kod,404);assert.equal(state(),before);proverit('другие методы и лишние сегменты адреса не открываются',true);
  const journals=db.prepare("SELECT kto FROM zhurnal WHERE obekt='kontakt' AND pole='porjadok' AND obekt_id IN (?,?,?)").all(...ids);assert.ok(journals.length>0&&journals.every(r=>r.kto===2));proverit('новый адрес использует автора сессии и общий журнал',true);
  db.exec("CREATE TRIGGER fixture_drag_order_failure BEFORE INSERT ON zhurnal WHEN NEW.obekt='kontakt' AND NEW.pole='porjadok' BEGIN SELECT RAISE(ABORT,'fixture drag order journal');END");try{assert.equal((await zapros('PATCH',route,{telo:{kontekst:changed.kontekst,porjadok:[...ids].reverse()}})).kod,500);assert.equal(state(),before);}finally{db.exec('DROP TRIGGER fixture_drag_order_failure');}proverit('ошибка журнала откатывает весь жест, версии и каждую строку',true);
 }finally{db.close();}
};
