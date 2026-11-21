                                                             
                                                                     
ALTER TABLE sotrudnichestva ADD COLUMN rassylka_id INTEGER REFERENCES rassylki(id);
CREATE INDEX IF NOT EXISTS idx_sotr_istochnik_rassylka ON sotrudnichestva(rassylka_id);
