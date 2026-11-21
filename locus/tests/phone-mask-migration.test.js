const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite'),{execFileSync}=require('node:child_process');
for(const collision of [false,true])test('explicit-plus comparison migration '+(collision?'refuses an ambiguous collision atomically':'repairs only a derived key and protects it on repeated startup'),()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'locus-phone-migration-')),file=path.join(folder,'test.db'),env={...process.env,LOCUS_BAZA:file};let db;
 try{
  const migrate=()=>execFileSync(process.execPath,['db/migrate.js'],{cwd:root,env,stdio:'pipe'});migrate();db=new DatabaseSync(file);db.exec("DELETE FROM migracii WHERE nomer=115;INSERT INTO ljudi(id,imja) VALUES(860001,'Phone comparison migration')");
  const insert=db.prepare("INSERT INTO kontakty(chelovek_id,tip,znachenie,znachenie_norm,porjadok,osnovnoj) VALUES(860001,'telefon',?,?,?,0)");
  const target=Number(insert.run('+8 (123) 456-78-90','71234567890',1).lastInsertRowid);
  if(collision)insert.run('+81234567890','81234567890',2);
  else{insert.run('82345678901','72345678901',2);insert.run('+8 invalid 3456789012','legacy-key',3);}
  const snapshot=()=>JSON.stringify(['kontakty','zhurnal','versii_polej','migracii'].map(t=>db.prepare('SELECT rowid,* FROM '+t+' ORDER BY rowid').all())),before=snapshot();
  const rows=db.prepare('SELECT * FROM kontakty ORDER BY id').all(),history=JSON.stringify(db.prepare('SELECT rowid,* FROM versii_polej ORDER BY rowid').all());
  if(collision){assert.throws(migrate,/115-mezhdunarodnyj-pljus.sql отменена/);assert.equal(snapshot(),before);}
  else{
   migrate();const after=db.prepare('SELECT * FROM kontakty ORDER BY id').all();assert.equal(after.find(x=>x.id===target).znachenie_norm,'81234567890');
   for(let i=0;i<rows.length;i++){const old={...rows[i]},current={...after[i]};delete old.znachenie_norm;delete current.znachenie_norm;assert.deepEqual(current,old);if(rows[i].id!==target)assert.equal(after[i].znachenie_norm,rows[i].znachenie_norm);}
   assert.equal(JSON.stringify(db.prepare('SELECT rowid,* FROM versii_polej ORDER BY rowid').all()),history);assert.equal(db.prepare('SELECT count(*) n FROM migracii WHERE nomer=115').get().n,1);const once=snapshot();migrate();assert.equal(snapshot(),once);
  }
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});
