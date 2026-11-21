CREATE TABLE IF NOT EXISTS zaprosy_pravok_proektov (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 proekt_id INTEGER NOT NULL CHECK(proekt_id>0),
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0 CHECK(sohraneno IN (0,1)),
 versija_posle INTEGER,
 udaleno INTEGER NOT NULL DEFAULT 0 CHECK(udaleno IN (0,1)),
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK((sohraneno=0 AND versija_posle IS NULL AND zapros_hesh IS NULL) OR
       (sohraneno=1 AND versija_posle IS NOT NULL AND versija_posle>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);
