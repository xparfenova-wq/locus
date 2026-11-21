const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('material presentation preserves names and reports real file availability with local domain icons',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-material-view-'));process.env.LOCUS_FAJLY=folder;
 const view=require('../api/materialy-vid.js');
 try{
  await t.test('long UTF-8 display names preserve their extension without changing stored or original names',()=>{
   for(const name of ['Я'.repeat(180)+'.pdf','🙂'.repeat(90)+'.pptx','a'.repeat(500)+'.psd']){const result=view.present({nazvanie:name,ishodnoe_imja:name});assert.equal(result.nazvanie,name);assert.equal(result.ishodnoe_imja,name);assert.ok(Buffer.byteLength(result.imja_na_ekrane)<=255);assert.ok(result.imja_na_ekrane.endsWith(path.extname(name)));assert.ok(!result.imja_na_ekrane.includes('\uFFFD'));}
  });
  await t.test('a metadata record without bytes is unavailable; a real upload becomes available',()=>{
   const row={id:1,nazvanie:'Caption',ishodnoe_imja:'Original.pdf',fajl:'/fajly/fixture-object',razmer:4};assert.equal(view.present(row).fajl_dostupen,false);
   fs.writeFileSync(path.join(folder,'fixture-object'),'data');const result=view.present(row);assert.equal(result.fajl_dostupen,true);assert.equal(result.razmer_bajt,4);assert.equal(result.ishodnoe_imja,'Original.pdf');assert.equal(result.nazvanie,'Caption');
  });
  await t.test('links expose their host and local icon address without external requests',()=>{
   const result=view.present({nazvanie:'Макеты',ssylka:'https://www.figma.com/file/example',avtor:'Администратор',sozdano:'2026-11-17T09:00:00Z'});assert.equal(result.host,'www.figma.com');assert.equal(result.favicon_url,'/api/favicon?host=www.figma.com');assert.equal(result.kto_dobavil_imja,'Администратор');assert.equal(result.kogda_dobavlen,'2026-11-17T09:00:00Z');assert.equal(result.fajl_dostupen,null);
  });
  await t.test('known domain symbols and ten neutral fallbacks are cached as complete SVGs',()=>{
   assert.ok(view.icon('figma.com').buffer.toString().includes('#0acf83'));assert.ok(view.icon('drive.google.com').buffer.toString().includes('#4285f4'));
   for(let i=0;i<10;i++){const first=view.icon('unknown-'+i+'.example');assert.ok(first.buffer.toString().startsWith('<svg'));assert.ok(first.buffer.toString().endsWith('</svg>'));assert.equal(view.icon('unknown-'+i+'.example'),first);}
   for(const host of ['','not a domain','example.org/path','example.org?query=1'])assert.equal(view.icon(host),null);
  });
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
