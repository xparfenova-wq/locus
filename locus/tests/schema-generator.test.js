const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
test('schema generator accepts nonbreaking prose spaces and refuses to drop version fields silently',()=>{
 const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'locus-schema-generator-')),dbdir=path.join(temp,'locus/db');fs.mkdirSync(path.join(dbdir,'migracii'),{recursive:true});
 try{
  for(const name of ['sborka_shemy.py','sborka_pravil.py','puti.js'])fs.copyFileSync(path.join(root,'db',name),path.join(dbdir,name));
  const tables=['ljudi','sotrudnichestva','proekty','zadachi','celi','rezultaty','rassylki','uslugi','shablony','kontakty','materialy','dokumenty','anketa','grafik','kommentarii'];
  const doc=path.join(temp,'СХЕМА-БАЗЫ.md'),ascii='Поле есть у '+tables.map(x=>'`'+x+'`').join(', ')+'. У журналов его нет.\n\n'+tables.map(x=>'## '+x+'\n\n```\n'+(x==='anketa'?'chelovek_id число':'id')+'\nnazvanie текст\n```\n').join('\n');
  const generate=()=>execFileSync('python3',[path.join(dbdir,'sborka_shemy.py')],{stdio:'pipe'});fs.writeFileSync(doc,ascii);generate();const original=fs.readFileSync(path.join(dbdir,'schema.sql'),'utf8');const text=ascii.replace('Поле есть у','Поле\u00a0есть\u00a0у').replace('. У журналов','.\u00a0У\u00a0журналов');fs.writeFileSync(doc,text);generate();const generated=fs.readFileSync(path.join(dbdir,'schema.sql'),'utf8');assert.equal(generated,original);
  const db=new DatabaseSync(':memory:');try{db.exec(generated);for(const table of tables)assert.ok(db.prepare('PRAGMA table_info('+table+')').all().some(row=>row.name==='versija'),table);}finally{db.close();}
  fs.writeFileSync(doc,text.replace(/Поле\s+есть\s+у/,'Нет раздела перечисления'));assert.throws(generate,/Раздел версии записи не найден/);assert.equal(fs.readFileSync(path.join(dbdir,'schema.sql'),'utf8'),generated);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
