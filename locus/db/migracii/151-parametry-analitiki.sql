CREATE TABLE IF NOT EXISTS versija_nastroek_sistemy (
 id INTEGER NOT NULL PRIMARY KEY CHECK (id=1),
 versija INTEGER NOT NULL CHECK (typeof(versija)='integer' AND versija>0)
);
CREATE TABLE IF NOT EXISTS zaprosy_nastroek_sistemy (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 versija_posle INTEGER,
 kontekst_posle TEXT,
 polja_json TEXT,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK(sohraneno IN (0,1)),
 CHECK((sohraneno=0 AND zapros_hesh IS NULL AND versija_posle IS NULL AND kontekst_posle IS NULL AND polja_json IS NULL) OR (sohraneno=1 AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND typeof(versija_posle)='integer' AND versija_posle>=0 AND length(kontekst_posle)=64 AND kontekst_posle NOT GLOB '*[^0-9a-f]*' AND json_valid(polja_json) AND json_type(polja_json)='array' AND zapros_hesh IS NOT NULL AND kontekst_posle IS NOT NULL AND polja_json IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS nastrojki_sistemy_singleton BEFORE INSERT ON nastrojki_sistemy WHEN EXISTS(SELECT 1 FROM nastrojki_sistemy) BEGIN
 SELECT RAISE(ABORT,'only one shared settings row is permitted');
END;
CREATE TRIGGER IF NOT EXISTS versija_nastroek_sistemy_insert AFTER INSERT ON nastrojki_sistemy BEGIN
 INSERT INTO versija_nastroek_sistemy(id,versija)VALUES(1,1)ON CONFLICT(id)DO UPDATE SET versija=versija+1;
END;
CREATE TRIGGER IF NOT EXISTS versija_nastroek_sistemy_update AFTER UPDATE ON nastrojki_sistemy BEGIN
 INSERT INTO versija_nastroek_sistemy(id,versija)VALUES(1,1)ON CONFLICT(id)DO UPDATE SET versija=versija+1;
END;
CREATE TRIGGER IF NOT EXISTS versija_nastroek_sistemy_delete AFTER DELETE ON nastrojki_sistemy BEGIN
 INSERT INTO versija_nastroek_sistemy(id,versija)VALUES(1,1)ON CONFLICT(id)DO UPDATE SET versija=versija+1;
END;
