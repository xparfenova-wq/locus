ALTER TABLE platezhi ADD COLUMN versija INTEGER NOT NULL DEFAULT 1;
ALTER TABLE akkaunty ADD COLUMN versija INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS zaprosy_platezhej (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 platezh_id INTEGER NOT NULL,
 dejstvie TEXT NOT NULL,
 zapros_hesh TEXT NOT NULL,
 otvet TEXT NOT NULL,
 obratno TEXT NOT NULL,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK(length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK(platezh_id>0),
 CHECK(dejstvie IN ('prishlo','otmenit_prishlo')),
 CHECK(json_valid(otvet) AND json_valid(obratno))
);
