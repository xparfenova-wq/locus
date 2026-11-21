CREATE TABLE IF NOT EXISTS zaprosy_baz (
  avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh TEXT NOT NULL,
  dejstvie TEXT NOT NULL,
  zapros_hesh TEXT,
  itog TEXT,
  otmeneno INTEGER NOT NULL DEFAULT 0,
  sozdano TEXT NOT NULL,
  udaleno INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (otmeneno IN (0,1) AND udaleno IN (0,1)),
  CHECK ((otmeneno=1 AND zapros_hesh IS NULL AND itog IS NULL) OR (otmeneno=0 AND length(zapros_hesh)=64 AND json_valid(itog)))
);
CREATE TRIGGER IF NOT EXISTS zaprosy_baz_bazy_delete AFTER DELETE ON bazy BEGIN UPDATE zaprosy_baz SET udaleno=1 WHERE json_extract(itog,'$.vid')='baza' AND json_extract(itog,'$.id')=OLD.id;END;
CREATE TRIGGER IF NOT EXISTS zaprosy_baz_bazy_ljudi_delete AFTER DELETE ON bazy_ljudi BEGIN UPDATE zaprosy_baz SET udaleno=1 WHERE json_extract(itog,'$.vid')='stroka' AND json_extract(itog,'$.id')=OLD.id;END;
CREATE TRIGGER IF NOT EXISTS zaprosy_baz_bazy_statusy_delete AFTER DELETE ON bazy_statusy BEGIN UPDATE zaprosy_baz SET udaleno=1 WHERE json_extract(itog,'$.vid')='status' AND json_extract(itog,'$.id')=OLD.id;END;
CREATE TABLE IF NOT EXISTS vklady_baz (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 stroka_id INTEGER NOT NULL REFERENCES bazy_ljudi(id) ON DELETE CASCADE,
 tablica TEXT NOT NULL,
 material_id INTEGER NOT NULL,
 avtor INTEGER NOT NULL REFERENCES ljudi(id),
 sozdano TEXT NOT NULL,
 UNIQUE (stroka_id, tablica, material_id),
 CHECK (tablica IN ('materialy','dokumenty') AND material_id>0)
);
CREATE TRIGGER IF NOT EXISTS vklady_baz_materialy_delete AFTER DELETE ON materialy BEGIN DELETE FROM vklady_baz WHERE tablica='materialy' AND material_id=OLD.id;END;
CREATE TRIGGER IF NOT EXISTS vklady_baz_dokumenty_delete AFTER DELETE ON dokumenty BEGIN DELETE FROM vklady_baz WHERE tablica='dokumenty' AND material_id=OLD.id;END;
CREATE TRIGGER IF NOT EXISTS vklady_baz_target_insert BEFORE INSERT ON vklady_baz WHEN (NEW.tablica='materialy' AND NOT EXISTS(SELECT 1 FROM materialy WHERE id=NEW.material_id)) OR (NEW.tablica='dokumenty' AND NOT EXISTS(SELECT 1 FROM dokumenty WHERE id=NEW.material_id)) BEGIN SELECT RAISE(ABORT,'base attachment source does not exist');END;
