                                                                              
                                                                                
CREATE TABLE IF NOT EXISTS zaprosy_planov_kampanij (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 rassylka_id INTEGER NOT NULL,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 plan_posle INTEGER,
 versija_posle INTEGER,
 obnovleno_json TEXT,
 udaleno INTEGER NOT NULL DEFAULT 0,
 sozdano TEXT NOT NULL,
 PRIMARY KEY (avtor,kljuch_hesh),
 CHECK (rassylka_id>0 AND sohraneno IN (0,1) AND udaleno IN (0,1)),
 CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND plan_posle IS NULL AND versija_posle IS NULL AND obnovleno_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND typeof(plan_posle)='integer' AND plan_posle>0 AND typeof(versija_posle)='integer' AND versija_posle>0 AND obnovleno_json IS NOT NULL AND json_valid(obnovleno_json) AND json_type(obnovleno_json)='array'))
);
CREATE TRIGGER IF NOT EXISTS zaprosy_planov_kampanij_delete AFTER DELETE ON rassylki BEGIN
 UPDATE zaprosy_planov_kampanij SET udaleno=1 WHERE rassylka_id=OLD.id;
END;
