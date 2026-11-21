                                                                                  
CREATE TABLE IF NOT EXISTS zaprosy_arhiva (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 tablica TEXT NOT NULL,
 obekt_id INTEGER NOT NULL,
 dejstvie TEXT NOT NULL DEFAULT 'arhiv',
 roditel_kljuch_hesh TEXT,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 sobytie_sozdanija INTEGER,
 rezultat_json TEXT,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK (tablica IN('ljudi','sotrudnichestva')),
 CHECK (typeof(obekt_id)='integer' AND obekt_id>0),
 CHECK (dejstvie IN('arhiv','otmenit')),
 CHECK (roditel_kljuch_hesh IS NULL OR (dejstvie='otmenit' AND length(roditel_kljuch_hesh)=64 AND roditel_kljuch_hesh NOT GLOB '*[^0-9a-f]*')),
 CHECK (sohraneno IN(0,1)),
 CHECK (sobytie_sozdanija IS NULL OR (typeof(sobytie_sozdanija)='integer' AND sobytie_sozdanija>0)),
 CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND rezultat_json IS NULL AND sobytie_sozdanija IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND rezultat_json IS NOT NULL AND json_valid(rezultat_json)))
);
