ALTER TABLE fokus_sessii ADD COLUMN pauza_s TEXT;
ALTER TABLE fokus_sessii ADD COLUMN pauza_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fokus_sessii ADD COLUMN versija INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fokus_sessii ADD COLUMN identifikator TEXT;
CREATE TABLE IF NOT EXISTS zaprosy_fokusa (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 operacija TEXT,
 zapros_hesh TEXT,
 sessija_id INTEGER,
 identifikator TEXT,
 itog_json TEXT,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK((operacija IS NULL AND zapros_hesh IS NULL AND sessija_id IS NULL AND identifikator IS NULL AND itog_json IS NULL) OR (operacija IN ('start','pause','resume','stop','reset') AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND sessija_id IS NOT NULL AND sessija_id>0 AND identifikator IS NOT NULL AND length(identifikator)=36 AND itog_json IS NOT NULL AND json_valid(itog_json) AND json_type(itog_json,'$.sessija') IS 'object'))
);
