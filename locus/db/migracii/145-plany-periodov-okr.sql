                                                                          
CREATE TABLE IF NOT EXISTS plany_periodov_okr (
 rezultat_id INTEGER NOT NULL REFERENCES rezultaty(id) ON DELETE CASCADE,
 period_id TEXT NOT NULL,
 plan TEXT NOT NULL,
 versija INTEGER NOT NULL DEFAULT 1,
 izmenenie_id TEXT NOT NULL,
 kto INTEGER NOT NULL REFERENCES ljudi(id),
 kogda TEXT NOT NULL,
 PRIMARY KEY(rezultat_id,period_id),
 CHECK (typeof(versija)='integer' AND versija>0),
 CHECK (typeof(plan)='text' AND length(plan) BETWEEN 1 AND 1024),
 CHECK (length(period_id)=7),
 CHECK (length(izmenenie_id)=36)
);
CREATE TABLE IF NOT EXISTS zaprosy_planov_okr (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 cel_id INTEGER NOT NULL,
 sobytie_id INTEGER,
 dejstvie TEXT NOT NULL DEFAULT 'plan',
 roditel_kljuch_hesh TEXT,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 rezultat_json TEXT,
 do_json TEXT,
 posle_json TEXT,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK (typeof(cel_id)='integer' AND cel_id>0),
 CHECK (sohraneno IN(0,1)),
 CHECK (dejstvie IN('plan','otmena')),
 CHECK (roditel_kljuch_hesh IS NULL OR (dejstvie='otmena' AND length(roditel_kljuch_hesh)=64)),
 CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND rezultat_json IS NULL AND do_json IS NULL AND posle_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND rezultat_json IS NOT NULL AND json_valid(rezultat_json) AND do_json IS NOT NULL AND json_valid(do_json) AND posle_json IS NOT NULL AND json_valid(posle_json)))
);
