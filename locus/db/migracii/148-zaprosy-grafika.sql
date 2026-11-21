                                                                                
CREATE TABLE IF NOT EXISTS zaprosy_grafika (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 chelovek_id INTEGER NOT NULL,
 god INTEGER NOT NULL,
 nedelja INTEGER NOT NULL,
 dejstvie TEXT NOT NULL,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 rezultat_json TEXT,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK(typeof(chelovek_id)='integer' AND chelovek_id>0),
 CHECK(typeof(god)='integer' AND god BETWEEN 1900 AND 9999),
 CHECK(typeof(nedelja)='integer' AND nedelja BETWEEN 1 AND 53),
 CHECK(dejstvie IN('sohranit','kopirovat')),
 CHECK(sohraneno IN(0,1)),
 CHECK((sohraneno=0 AND zapros_hesh IS NULL AND rezultat_json IS NULL) OR
       (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'
        AND rezultat_json IS NOT NULL AND json_valid(rezultat_json)))
);
