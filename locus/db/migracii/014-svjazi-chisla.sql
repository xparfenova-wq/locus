                                                                
                                                             
                                                          
DROP TABLE IF EXISTS svjazi_novaja;
CREATE TABLE svjazi_novaja (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  ot_cheloveka           INTEGER,
  k_cheloveku            INTEGER,
  tip                    TEXT,
  zametka                TEXT
);
INSERT INTO svjazi_novaja (id, ot_cheloveka, k_cheloveku, tip, zametka)
  SELECT id, cast(cast(ot_cheloveka AS REAL) AS INTEGER),
         cast(cast(k_cheloveku AS REAL) AS INTEGER), tip, zametka
  FROM svjazi;
DROP TABLE svjazi;
ALTER TABLE svjazi_novaja RENAME TO svjazi;
