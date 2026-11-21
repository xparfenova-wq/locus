                                                                                
                                                                             
                                                                          
CREATE TABLE IF NOT EXISTS versii_polej (
  tablica TEXT NOT NULL,
  obekt_id INTEGER NOT NULL,
  pole TEXT NOT NULL,
  versija INTEGER NOT NULL,
  kto INTEGER,
  kogda TEXT,
  PRIMARY KEY(tablica,obekt_id,pole)
);
