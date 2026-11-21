                                                                                 
                                                               
CREATE TABLE IF NOT EXISTS zaprosy_konteksta_zadach (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 zadacha_id INTEGER NOT NULL,
 nomer INTEGER NOT NULL,
 sobytie_id INTEGER,
 dejstvie TEXT NOT NULL DEFAULT 'pravka' CHECK(dejstvie IN ('pravka','otmena')),
 roditel_kljuch_hesh TEXT,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0 CHECK(sohraneno IN (0,1)),
 do_json TEXT,
 posle_json TEXT,
 versija_posle INTEGER,
 otmeneno INTEGER NOT NULL DEFAULT 0 CHECK(otmeneno IN (0,1)),
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK(typeof(zadacha_id)='integer' AND zadacha_id>0),
 CHECK(typeof(nomer)='integer' AND nomer>0),
 CHECK(sobytie_id IS NULL OR (typeof(sobytie_id)='integer' AND sobytie_id>0)),
 CHECK((sohraneno=0 AND zapros_hesh IS NULL AND do_json IS NULL AND posle_json IS NULL AND versija_posle IS NULL) OR
       (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND do_json IS NOT NULL AND json_valid(do_json) AND posle_json IS NOT NULL AND json_valid(posle_json) AND versija_posle IS NOT NULL AND versija_posle>0)),
 CHECK(roditel_kljuch_hesh IS NULL OR (dejstvie='otmena' AND length(roditel_kljuch_hesh)=64 AND roditel_kljuch_hesh NOT GLOB '*[^0-9a-f]*'))
);
