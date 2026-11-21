                                                                          
                                                
function ustanovit(db){
 db.exec(`INSERT OR IGNORE INTO versii_polej(tablica,obekt_id,pole,versija,kogda)
 SELECT 'shablony',id,'podzadachi',versija,datetime('now') FROM shablony;`);
 const stamp=parent=>`UPDATE shablony SET versija=versija+1 WHERE id=${parent};
 INSERT INTO versii_polej(tablica,obekt_id,pole,versija,kto,kogda)
 SELECT 'shablony',id,'podzadachi',versija,(SELECT kto FROM versii_polej WHERE tablica='' AND obekt_id=0 AND pole=''),datetime('now') FROM shablony WHERE id=${parent}
 ON CONFLICT(tablica,obekt_id,pole) DO UPDATE SET versija=excluded.versija,kto=excluded.kto,kogda=excluded.kogda;`;
 for(const action of ['insert','update','delete'])db.exec('DROP TRIGGER IF EXISTS versii_shablon_shagi_'+action);
 db.exec(`CREATE TRIGGER versii_shablon_shagi_insert AFTER INSERT ON shablon_podzadachi BEGIN ${stamp('NEW.shablon_id')} END;
 CREATE TRIGGER versii_shablon_shagi_delete AFTER DELETE ON shablon_podzadachi BEGIN ${stamp('OLD.shablon_id')} END;
 CREATE TRIGGER versii_shablon_shagi_update AFTER UPDATE ON shablon_podzadachi
 WHEN OLD.shablon_id IS NOT NEW.shablon_id OR OLD.nazvanie IS NOT NEW.nazvanie OR OLD.porjadok IS NOT NEW.porjadok
 BEGIN ${stamp('OLD.shablon_id')}
 UPDATE shablony SET versija=versija+1 WHERE id=NEW.shablon_id AND NEW.shablon_id IS NOT OLD.shablon_id;
 INSERT INTO versii_polej(tablica,obekt_id,pole,versija,kto,kogda)
 SELECT 'shablony',id,'podzadachi',versija,(SELECT kto FROM versii_polej WHERE tablica='' AND obekt_id=0 AND pole=''),datetime('now') FROM shablony WHERE id=NEW.shablon_id AND NEW.shablon_id IS NOT OLD.shablon_id
 ON CONFLICT(tablica,obekt_id,pole) DO UPDATE SET versija=excluded.versija,kto=excluded.kto,kogda=excluded.kogda;
 END;`);
}
module.exports={ustanovit};
