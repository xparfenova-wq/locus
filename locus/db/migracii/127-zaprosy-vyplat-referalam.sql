CREATE TABLE IF NOT EXISTS zaprosy_vyplat_referalam (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 sotrudnichestvo_id INTEGER NOT NULL,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 zhurnal_id INTEGER,
 udaleno INTEGER NOT NULL DEFAULT 0,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK (sotrudnichestvo_id>0),
 CHECK (sohraneno IN (0,1)),
 CHECK (udaleno IN (0,1)),
 CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND zhurnal_id IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND zhurnal_id IS NOT NULL AND zhurnal_id>0))
);
