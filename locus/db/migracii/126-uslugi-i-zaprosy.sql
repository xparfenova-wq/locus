ALTER TABLE uslugi ADD COLUMN arhiv_s TEXT;
ALTER TABLE uslugi ADD COLUMN vozvrat_s TEXT;
CREATE TABLE IF NOT EXISTS zaprosy_dejstvij_uslug (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 napravlenie TEXT NOT NULL,
 usluga_id INTEGER NOT NULL,
 dejstvie TEXT NOT NULL,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 itog_json TEXT,
 rezultat_usluga_id INTEGER,
 udaleno INTEGER NOT NULL DEFAULT 0,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK (dejstvie IN ('sozdanie','pravka','zamena','porjadok')),
 CHECK ((dejstvie IN ('sozdanie','porjadok') AND usluga_id=0) OR (dejstvie IN ('pravka','zamena') AND usluga_id>0)),
 CHECK (sohraneno IN (0,1)),
 CHECK (udaleno IN (0,1)),
 CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND itog_json IS NULL AND rezultat_usluga_id IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND itog_json IS NOT NULL AND json_valid(itog_json) AND ((dejstvie='porjadok' AND rezultat_usluga_id IS NULL) OR (dejstvie<>'porjadok' AND rezultat_usluga_id IS NOT NULL AND rezultat_usluga_id>0))))
);
