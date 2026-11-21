PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS nerazobrannye_svjazi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tablica TEXT NOT NULL,
  staryj_rowid INTEGER NOT NULL,
  zadacha_id_istochnika BLOB,
  chelovek_id_istochnika BLOB,
  prichina TEXT NOT NULL,
  obnaruzheno TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tablica,staryj_rowid)
);
CREATE TEMP TABLE uchastniki_poslednij_id(seq INTEGER NOT NULL);
INSERT INTO uchastniki_poslednij_id SELECT COALESCE(max(rowid),0) FROM zadacha_uchastniki;
                                                                          
                                                                       
INSERT INTO nerazobrannye_svjazi(tablica,staryj_rowid,zadacha_id_istochnika,chelovek_id_istochnika,prichina)
SELECT 'zadacha_uchastniki',u.rowid,u.zadacha_id,u.chelovek_id,
  CASE WHEN z.id IS NULL AND l.id IS NULL THEN 'не найдены задача и человек'
       WHEN z.id IS NULL THEN 'не найдена задача' ELSE 'не найден человек' END
FROM zadacha_uchastniki u LEFT JOIN zadachi z ON z.id=u.zadacha_id LEFT JOIN ljudi l ON l.id=u.chelovek_id
WHERE z.id IS NULL OR l.id IS NULL;
                                                                         
                                                                      
CREATE TABLE zadacha_uchastniki_novye (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zadacha_id INTEGER NOT NULL REFERENCES zadachi(id) ON DELETE CASCADE,
  chelovek_id INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  dobavleno TEXT DEFAULT (datetime('now')),
  UNIQUE (zadacha_id, chelovek_id)
);
INSERT INTO zadacha_uchastniki_novye(id,zadacha_id,chelovek_id,dobavleno)
SELECT u.rowid,u.zadacha_id,u.chelovek_id,NULL FROM zadacha_uchastniki u
JOIN zadachi z ON z.id=u.zadacha_id JOIN ljudi l ON l.id=u.chelovek_id ORDER BY u.rowid;
DROP TABLE zadacha_uchastniki;
ALTER TABLE zadacha_uchastniki_novye RENAME TO zadacha_uchastniki;
UPDATE sqlite_sequence SET seq=max(seq,(SELECT seq FROM uchastniki_poslednij_id)) WHERE name='zadacha_uchastniki';
INSERT INTO sqlite_sequence(name,seq) SELECT 'zadacha_uchastniki',seq FROM uchastniki_poslednij_id WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='zadacha_uchastniki');
DROP TABLE uchastniki_poslednij_id;
CREATE INDEX IF NOT EXISTS uchastniki_cheloveka ON zadacha_uchastniki(chelovek_id,zadacha_id);
PRAGMA foreign_keys=ON;
