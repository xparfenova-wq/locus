CREATE TABLE IF NOT EXISTS schetchiki_anket (
  chelovek_id INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  poslednjaja_versija INTEGER NOT NULL,
  PRIMARY KEY (chelovek_id),
  CHECK (typeof(poslednjaja_versija)='integer' AND poslednjaja_versija>=1)
);

INSERT INTO schetchiki_anket(chelovek_id,poslednjaja_versija)
SELECT chelovek_id,max(1,COALESCE(versija,1)) FROM anketa WHERE 1
ON CONFLICT(chelovek_id) DO UPDATE SET poslednjaja_versija=max(schetchiki_anket.poslednjaja_versija,excluded.poslednjaja_versija);

CREATE TRIGGER IF NOT EXISTS schetchik_ankety_vstavka AFTER INSERT ON anketa
BEGIN
  INSERT INTO schetchiki_anket(chelovek_id,poslednjaja_versija)
  VALUES(NEW.chelovek_id,max(1,COALESCE(NEW.versija,1)))
  ON CONFLICT(chelovek_id) DO UPDATE SET poslednjaja_versija=max(schetchiki_anket.poslednjaja_versija,excluded.poslednjaja_versija);
END;

CREATE TRIGGER IF NOT EXISTS schetchik_ankety_pravka AFTER UPDATE OF versija ON anketa
BEGIN
  INSERT INTO schetchiki_anket(chelovek_id,poslednjaja_versija)
  VALUES(NEW.chelovek_id,max(1,COALESCE(NEW.versija,1)))
  ON CONFLICT(chelovek_id) DO UPDATE SET poslednjaja_versija=max(schetchiki_anket.poslednjaja_versija,excluded.poslednjaja_versija);
END;
