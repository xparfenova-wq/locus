const {test}=require('node:test'),assert=require('node:assert/strict'),model=require('../public/js/task-route-model.js');
test('direct task identity comes from its path while query filters and a safe return list remain intact',()=>{
 const url='https://locus.example/synapt/4827?nomer=99&napravlenie=media&sprint=2026-W47&data=2026-11-20#comment-9';assert.deepEqual(model.direct(url),{direction:'synapt',number:4827});const q=model.query(url);assert.equal(q.get('nomer'),'4827');assert.equal(q.get('napravlenie'),'synapt');assert.equal(q.get('sprint'),'2026-W47');assert.equal(q.get('data'),'2026-11-20');const list=new URL(model.list(url),'https://locus.example');assert.equal(list.pathname,'/zadachi.html');assert.equal(list.searchParams.get('nomer'),null);assert.equal(list.searchParams.get('napravlenie'),'synapt');assert.equal(list.hash,'');
 for(const route of ['/ljudi/71','/proekty/1','/okr/2','/api/123','/synapt/4827/extra','/synapt/0','/synapt/9007199254740993'])assert.equal(model.direct(route),null,route);
 assert.equal(model.path('synapt',4827),'/synapt/4827');assert.equal(model.path('../x',4827),null);assert.equal(model.path('synapt',0),null);assert.equal(model.query('https://locus.example/klient.html?id=71&nomer=4827').get('id'),'71');
});
test('entity paths keep their own id across query filters and never become task paths',()=>{
 for(const[section,page]of [['ljudi','klient.html'],['proekty','proekt.html'],['rassylki','rassylka.html']]){
  const url='https://locus.example/'+section+'/71?id=999&volna=2';assert.equal(model.entity(url).id,71);assert.equal(model.entity(url).page,page);assert.equal(model.direct(url),null);assert.equal(model.query(url).get('id'),'71');assert.equal(model.query(url).get('volna'),'2');
  for(const bad of ['/0','/abc','/071','/9007199254740993','/71/extra'])assert.equal(model.entity('/'+section+bad),null);
 }
});
test('a goal path owns its identity independently of period filters and query ids',()=>{
 for(const section of ['okr','celi']){
  const href='https://locus.example/'+section+'/17?cel=99&period=2026-Q4&den=2026-09-30';
  assert.deepEqual(model.entity(href),{table:'celi',id:17,page:'okr.html',param:'cel',section});
  assert.equal(model.direct(href),null);assert.equal(model.query(href).get('cel'),'17');
  assert.equal(model.query(href).get('den'),'2026-09-30');
  for(const bad of ['/0','/017','/abc','/9007199254740993','/17/extra'])assert.equal(model.entity('/'+section+bad),null);
 }
});
