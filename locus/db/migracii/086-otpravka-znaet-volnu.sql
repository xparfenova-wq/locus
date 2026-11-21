                                                                    
                                                                
                                                             
                                                    
ALTER TABLE rassylka_ljudi ADD COLUMN zadacha_id INTEGER REFERENCES zadachi(id);
CREATE INDEX IF NOT EXISTS idx_rassylka_ljudi_zadacha
  ON rassylka_ljudi(zadacha_id);
