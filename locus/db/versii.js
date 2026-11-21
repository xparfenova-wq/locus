                                                                               
const TABLICY=Object.freeze(Object.fromEntries([
  'ljudi','sotrudnichestva','proekty','zadachi','celi','rezultaty','rassylki',
  'platezhi','akkaunty','uslugi','shablony','kontakty','materialy','dokumenty','anketa','grafik','kommentarii',
  'napravlenija','tezisy',
].map(t=>[t,t==='anketa'?'chelovek_id':t==='napravlenija'?'kod':'id'])));
const S_VERSIEJ=new Set(Object.keys(TABLICY));
const INTERNAL=new Set(['versija','id','sozdano','imja_norm','znachenie_norm','poslednij_vhod']);
const q=x=>'"'+x.replaceAll('"','""')+'"';

function ustanovit(db){
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const [table,key] of Object.entries(TABLICY)){
      const columns=db.prepare('PRAGMA table_info('+q(table)+')').all();
      if(!columns.some(c=>c.name==='versija') || !columns.some(c=>c.name===key))throw new Error('versioned table has no key/version: '+table);
      const fields=columns.map(c=>c.name).filter(c=>!INTERNAL.has(c)).sort();
      const name=q(table),pk=q(key),id='NEW.'+pk;
      for(const action of ['insert','update','delete'])db.exec('DROP TRIGGER IF EXISTS '+q('versii_'+table+'_'+action));
      db.exec('UPDATE '+name+" SET versija=1 WHERE typeof(versija)<>'integer' OR versija<1");
                                                                                    
      db.exec(`DELETE FROM versii_polej WHERE tablica='${table}' AND (obekt_id NOT IN (SELECT ${pk} FROM ${name})
        OR obekt_id IN (SELECT t.${pk} FROM ${name} t JOIN versii_polej v
          ON v.tablica='${table}' AND v.obekt_id=t.${pk} AND v.pole='' WHERE v.versija<>t.versija));
        INSERT OR IGNORE INTO versii_polej(tablica,obekt_id,pole,versija,kogda)
          SELECT '${table}',${pk},'*',versija,datetime('now') FROM ${name};
        INSERT OR IGNORE INTO versii_polej(tablica,obekt_id,pole,versija,kogda)
          SELECT '${table}',${pk},'',versija,datetime('now') FROM ${name};`);
      const stamp=(field,where='1')=>`INSERT INTO versii_polej(tablica,obekt_id,pole,versija,kto,kogda)
        SELECT '${table}',${pk},'${field}',versija,
          (SELECT kto FROM versii_polej WHERE tablica='' AND obekt_id=0 AND pole=''),datetime('now')
          FROM ${name} WHERE ${pk}=${id} AND (${where})
        ON CONFLICT(tablica,obekt_id,pole) DO UPDATE SET versija=excluded.versija,kto=excluded.kto,kogda=excluded.kogda;`;
      const changed=fields.map(f=>'OLD.'+q(f)+' IS NOT NEW.'+q(f)).join(' OR ');
      db.exec(`CREATE TRIGGER ${q('versii_'+table+'_insert')} AFTER INSERT ON ${name} BEGIN
        UPDATE ${name} SET versija=1 WHERE ${pk}=${id} AND (versija IS NULL OR versija<1);
        INSERT OR IGNORE INTO versii_polej(tablica,obekt_id,pole,versija,kogda)
          SELECT '${table}',${pk},'*',versija,datetime('now') FROM ${name} WHERE ${pk}=${id};
        ${stamp('')}${table==='shablony'?'\n'+stamp('podzadachi'):''}
      END;
      CREATE TRIGGER ${q('versii_'+table+'_update')} AFTER UPDATE ON ${name}
      WHEN OLD.versija IS NOT NEW.versija OR (${changed}) BEGIN
        DELETE FROM versii_polej WHERE tablica='${table}' AND obekt_id=OLD.${pk} AND OLD.${pk} IS NOT NEW.${pk};
        INSERT OR IGNORE INTO versii_polej(tablica,obekt_id,pole,versija,kogda)
          VALUES('${table}',${id},'*',max(1,COALESCE(OLD.versija,1)),datetime('now'));
        UPDATE ${name} SET versija=max(1,COALESCE(OLD.versija,0)+CASE WHEN (${changed}) THEN 1 ELSE 0 END)
          WHERE ${pk}=${id} AND (versija IS NULL OR versija<COALESCE(OLD.versija,1)
            OR (versija=COALESCE(OLD.versija,0) AND (${changed})));
        ${stamp('')}
        ${fields.map(f=>stamp(f,'OLD.'+q(f)+' IS NOT NEW.'+q(f))).join('\n')}
      END;
      CREATE TRIGGER ${q('versii_'+table+'_delete')} AFTER DELETE ON ${name} BEGIN
        DELETE FROM versii_polej WHERE tablica='${table}' AND obekt_id=OLD.${pk};${table==='proekty'&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_proektov'").get()?'\n        UPDATE zaprosy_proektov SET udaleno=1 WHERE zapis_id=OLD.id;':''}${table==='proekty'&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_pravok_proektov'").get()?'\n        UPDATE zaprosy_pravok_proektov SET udaleno=1 WHERE proekt_id=OLD.id;':''}${table==='proekty'&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_dejstvij_proektov'").get()?'\n        UPDATE zaprosy_dejstvij_proektov SET udaleno=1 WHERE proekt_id=OLD.id;':''}${table==='sotrudnichestva'&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_vyplat_referalam'").get()?'\n        UPDATE zaprosy_vyplat_referalam SET udaleno=1 WHERE sotrudnichestvo_id=OLD.id;':''}${table==='sotrudnichestva'&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_uslovij_referalov'").get()?'\n        UPDATE zaprosy_uslovij_referalov SET udaleno=1 WHERE sotrudnichestvo_id=OLD.id;':''}${table==='sotrudnichestva'&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='referalnye_zadachi'").get()?'\n        UPDATE referalnye_zadachi SET udaleno=1 WHERE sotrudnichestvo_id=OLD.id;':''}${table==='zadachi'&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_referalnyh_zadach'").get()?"\n        UPDATE zaprosy_referalnyh_zadach SET udaleno=1 WHERE EXISTS(SELECT 1 FROM json_each(itog_json,'$.zadachi') j WHERE json_extract(j.value,'$.id')=OLD.id);":''}${table==='uslugi'&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zaprosy_dejstvij_uslug'").get()?'\n        UPDATE zaprosy_dejstvij_uslug SET udaleno=1 WHERE rezultat_usluga_id=OLD.id;':''}
      END;`);
    }
    require('./versii-shagov.js').ustanovit(db);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={TABLICY,S_VERSIEJ,ustanovit};
