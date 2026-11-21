                                                           
                                                               
                                                      
CREATE TABLE zamery_novye (
  id INTEGER PRIMARY KEY,
  rezultat_id INTEGER NOT NULL REFERENCES rezultaty(id),
  znachenie REAL,
  data TEXT,
  otkuda TEXT,
  kto INTEGER REFERENCES ljudi(id),
  sozdano TEXT
);
INSERT INTO zamery_novye (id, rezultat_id, znachenie, data, otkuda, kto, sozdano)
  SELECT id, rezultat_id, znachenie, data, otkuda, kto, sozdano FROM zamery;
DROP TABLE zamery;
ALTER TABLE zamery_novye RENAME TO zamery;
