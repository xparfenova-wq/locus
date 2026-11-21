                                                                      
                                                                                
ALTER TABLE tezisy ADD COLUMN udaleno INTEGER NOT NULL DEFAULT 0 CHECK(udaleno IN (0,1));
ALTER TABLE tezisy ADD COLUMN versija INTEGER NOT NULL DEFAULT 1 CHECK(typeof(versija)='integer' AND versija>=1);
CREATE TABLE IF NOT EXISTS zaprosy_strategii (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 dejstvie TEXT NOT NULL,
 oblast TEXT NOT NULL,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 otmeneno INTEGER NOT NULL DEFAULT 0,
 itog_json TEXT,
 do_json TEXT,
 posle_json TEXT,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK(dejstvie IN ('sozdat','pravka','udalit','porjadok')),
 CHECK(length(oblast) BETWEEN 1 AND 200),
 CHECK(sohraneno IN (0,1) AND otmeneno IN (0,1) AND NOT(sohraneno=1 AND otmeneno=1)),
 CHECK((sohraneno=0 AND zapros_hesh IS NULL AND itog_json IS NULL AND do_json IS NULL AND posle_json IS NULL) OR
       (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND itog_json IS NOT NULL AND do_json IS NOT NULL AND posle_json IS NOT NULL AND json_valid(itog_json) AND json_valid(do_json) AND json_valid(posle_json)))
);
