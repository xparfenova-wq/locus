CREATE TABLE IF NOT EXISTS zaprosy_shablonov (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 tablica TEXT NOT NULL CHECK(tablica IN ('shablony')),
 vladelec_id INTEGER NOT NULL CHECK(vladelec_id>0),
 zapros_hesh TEXT,
 zapis_id INTEGER NOT NULL CHECK(zapis_id>=0),
 sobytie_id INTEGER,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK((zapis_id=0 AND sobytie_id IS NULL AND zapros_hesh IS NULL) OR
       (zapis_id>0 AND sobytie_id IS NOT NULL AND sobytie_id>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);
