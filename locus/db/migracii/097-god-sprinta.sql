                                                                          
                                                                          
ALTER TABLE zadachi ADD COLUMN god_sprinta INTEGER;

UPDATE zadachi SET god_sprinta = CAST(strftime('%G', CASE
  WHEN srok IS NOT NULL AND CAST(strftime('%V',srok) AS INTEGER)=sprint THEN srok
  ELSE datetime(sozdano,'+3 hours') END) AS INTEGER)
WHERE sprint IS NOT NULL AND povtorjaetsja IS NOT 1;

CREATE INDEX zadachi_iso_sprint ON zadachi(god_sprinta,sprint);
                                                                            
CREATE TRIGGER zadachi_god_sprinta_insert
AFTER INSERT ON zadachi
WHEN NEW.sprint IS NOT NULL AND NEW.povtorjaetsja IS NOT 1 AND NEW.god_sprinta IS NULL
BEGIN
  UPDATE zadachi SET god_sprinta=CAST(strftime('%G',CASE
    WHEN NEW.srok IS NOT NULL AND CAST(strftime('%V',NEW.srok) AS INTEGER)=NEW.sprint THEN NEW.srok
    ELSE COALESCE(datetime(NEW.sozdano,'+3 hours'),datetime('now','+3 hours')) END) AS INTEGER)
  WHERE id=NEW.id;
END;
