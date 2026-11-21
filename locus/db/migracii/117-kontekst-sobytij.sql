                                                                          
                                                                      
ALTER TABLE zhurnal ADD COLUMN srez TEXT
 CHECK (srez IS NULL OR CASE WHEN json_valid(srez) THEN json_type(srez)='object' ELSE 0 END);
CREATE INDEX IF NOT EXISTS idx_zhurnal_srez_chelovek
 ON zhurnal(json_extract(srez,'$.chelovek_id')) WHERE srez IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zhurnal_srez_chelovek_do
 ON zhurnal(json_extract(srez,'$.chelovek_id_do')) WHERE srez IS NOT NULL;
