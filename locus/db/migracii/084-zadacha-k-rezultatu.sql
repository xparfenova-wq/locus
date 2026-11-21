                                                                     
                                                                      
                                                             
                                                               
ALTER TABLE zadachi ADD COLUMN rezultat_id INTEGER REFERENCES rezultaty(id);
CREATE INDEX IF NOT EXISTS idx_zadachi_rezultat ON zadachi(rezultat_id);
