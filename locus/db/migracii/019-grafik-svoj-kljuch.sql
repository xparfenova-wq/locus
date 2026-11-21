                                                                       
                                                                   
                                                                     
                                                                    
                                                                  
                                                       
CREATE TABLE grafik_novyj (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  nedelja                INTEGER,
  den                    INTEGER,
  chasov                 INTEGER,
  s_kakogo               TEXT,
  do_kakogo              TEXT,
  zametka                TEXT
);
INSERT INTO grafik_novyj (id, chelovek_id, nedelja, den, chasov, s_kakogo, do_kakogo, zametka)
  SELECT id, chelovek_id, nedelja, den, chasov, s_kakogo, do_kakogo, zametka
    FROM grafik WHERE id IS NOT NULL;
INSERT INTO grafik_novyj (chelovek_id, nedelja, den, chasov, s_kakogo, do_kakogo, zametka)
  SELECT chelovek_id, nedelja, den, chasov, s_kakogo, do_kakogo, zametka
    FROM grafik WHERE id IS NULL;
DROP TABLE grafik;
ALTER TABLE grafik_novyj RENAME TO grafik;
