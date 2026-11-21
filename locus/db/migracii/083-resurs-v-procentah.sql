                                                                
                                                               
                                   
  
                                                     
                                                        
CREATE TABLE sostojanija_novaja (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id   INTEGER NOT NULL REFERENCES ljudi(id),
  den           TEXT    NOT NULL,
  nastroenie    INTEGER CHECK (nastroenie BETWEEN 1 AND 5),
  resurs        INTEGER CHECK (resurs BETWEEN 0 AND 100),
  zametka       TEXT    CHECK (zametka IS NULL OR length(zametka) <= 140),
  sozdano       TEXT    NOT NULL DEFAULT (datetime('now')),
  versija       INTEGER NOT NULL DEFAULT 1,
  UNIQUE (chelovek_id, den)
);

INSERT INTO sostojanija_novaja
  (id, chelovek_id, den, nastroenie, resurs, zametka, sozdano, versija)
SELECT id, chelovek_id, den, nastroenie,
  CASE resurs WHEN 1 THEN 10 WHEN 2 THEN 30 WHEN 3 THEN 50
              WHEN 4 THEN 70 WHEN 5 THEN 90 ELSE resurs END,
  zametka, sozdano, versija
FROM sostojanija;

DROP TABLE sostojanija;
ALTER TABLE sostojanija_novaja RENAME TO sostojanija;
