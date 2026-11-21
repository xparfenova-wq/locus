                                                   
                                                                 
                                                     
  
                                                               
                                                              
                                           
DROP TABLE IF EXISTS sostojanija;

CREATE TABLE sostojanija (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id   INTEGER NOT NULL REFERENCES ljudi(id),
  den           TEXT    NOT NULL,
  nastroenie    INTEGER CHECK (nastroenie BETWEEN 1 AND 5),
  resurs        INTEGER CHECK (resurs BETWEEN 1 AND 5),
  zametka       TEXT    CHECK (zametka IS NULL OR length(zametka) <= 140),
  sozdano       TEXT    NOT NULL DEFAULT (datetime('now')),
  versija       INTEGER NOT NULL DEFAULT 1,
                                                                
                                    
  UNIQUE (chelovek_id, den)
);

CREATE INDEX idx_sostojanija_den ON sostojanija (den);
