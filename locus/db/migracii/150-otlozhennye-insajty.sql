                                                                                             
CREATE TABLE IF NOT EXISTS otlozhennye_insajty (
 chelovek_id INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch TEXT NOT NULL CHECK(length(kljuch)=64 AND kljuch NOT GLOB '*[^0-9a-f]*'),
 otlozhen_do TEXT NOT NULL,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(chelovek_id,kljuch)
);
CREATE TABLE IF NOT EXISTS zaprosy_insajtov (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 insajt_kljuch TEXT NOT NULL CHECK(length(insajt_kljuch)=64 AND insajt_kljuch NOT GLOB '*[^0-9a-f]*'),
 otlozhen_do TEXT,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh)
);
