                                                                                 
CREATE TABLE IF NOT EXISTS versii_nastroek (
 chelovek_id INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 versija INTEGER NOT NULL,
 PRIMARY KEY (chelovek_id),
 CHECK (typeof(versija)='integer' AND versija>0)
);
CREATE TABLE IF NOT EXISTS zaprosy_nastroek (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 zapros_hesh TEXT,
 dejstvie TEXT NOT NULL,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 versija_posle INTEGER,
 kontekst_posle TEXT,
 polja_json TEXT,
 sozdano TEXT NOT NULL,
 udaleno INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (avtor,kljuch_hesh),
 CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK (dejstvie IN ('pravka','palitra_sohranit','palitra_primenit','otmena')),
 CHECK (sohraneno IN (0,1) AND udaleno IN (0,1)),
 CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND versija_posle IS NULL AND kontekst_posle IS NULL AND polja_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND typeof(versija_posle)='integer' AND versija_posle>=0 AND kontekst_posle IS NOT NULL AND length(kontekst_posle)=64 AND kontekst_posle NOT GLOB '*[^0-9a-f]*' AND polja_json IS NOT NULL AND json_valid(polja_json) AND json_type(polja_json)='array'))
);
CREATE TRIGGER IF NOT EXISTS versii_nastroek_insert AFTER INSERT ON nastrojki BEGIN
 INSERT INTO versii_nastroek(chelovek_id,versija)VALUES(NEW.chelovek_id,1)ON CONFLICT(chelovek_id)DO UPDATE SET versija=versija+1;
END;
CREATE TRIGGER IF NOT EXISTS versii_nastroek_update AFTER UPDATE ON nastrojki BEGIN
 INSERT INTO versii_nastroek(chelovek_id,versija)VALUES(NEW.chelovek_id,1)ON CONFLICT(chelovek_id)DO UPDATE SET versija=versija+1;
END;
CREATE TRIGGER IF NOT EXISTS versii_nastroek_delete AFTER DELETE ON nastrojki BEGIN
 INSERT INTO versii_nastroek(chelovek_id,versija)VALUES(OLD.chelovek_id,1)ON CONFLICT(chelovek_id)DO UPDATE SET versija=versija+1;
 UPDATE zaprosy_nastroek SET udaleno=1 WHERE avtor=OLD.chelovek_id AND sohraneno=1;
END;
