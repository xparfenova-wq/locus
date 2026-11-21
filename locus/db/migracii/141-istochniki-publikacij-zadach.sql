                                                                             
                                                                         
CREATE TABLE IF NOT EXISTS istochniki_publikacij_zadach (
 zadacha_id INTEGER NOT NULL REFERENCES zadachi(id) ON DELETE CASCADE,
 publikacija_id TEXT NOT NULL,
 akkaunt_id INTEGER NOT NULL,
 akkaunt_kontekst TEXT NOT NULL,
 sobytie_zadachi INTEGER,
 sobytie_akkaunta INTEGER,
 versija INTEGER NOT NULL DEFAULT 1,
 avtor INTEGER NOT NULL,
 sozdano TEXT NOT NULL,
 ohvat_data TEXT,
 ohvat_moment TEXT,
 poluchen_at TEXT,
 versija_zamera INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(zadacha_id),
 CHECK(typeof(zadacha_id)='integer' AND zadacha_id>0),
 CHECK(typeof(akkaunt_id)='integer' AND akkaunt_id>0),
 CHECK(length(akkaunt_kontekst)=64 AND akkaunt_kontekst NOT GLOB '*[^0-9a-f]*'),
 CHECK(typeof(avtor)='integer' AND avtor>0),
 CHECK(length(publikacija_id) BETWEEN 1 AND 500),
 CHECK(typeof(versija)='integer' AND versija>=1),
 CHECK(typeof(versija_zamera)='integer' AND versija_zamera>=0),
 CHECK(sobytie_zadachi IS NULL OR (typeof(sobytie_zadachi)='integer' AND sobytie_zadachi>0)),
 CHECK(sobytie_akkaunta IS NULL OR (typeof(sobytie_akkaunta)='integer' AND sobytie_akkaunta>0)),
 CHECK(ohvat_data IS NULL OR (typeof(ohvat_data)='text' AND length(ohvat_data)=10 AND date(ohvat_data) IS NOT NULL AND date(ohvat_data)=ohvat_data)),
 CHECK(ohvat_moment IS NULL OR (ohvat_data IS NOT NULL AND julianday(ohvat_moment) IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS zaprosy_istochnikov_publikacij (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 zadacha_id INTEGER NOT NULL,
 nomer_zadachi INTEGER NOT NULL,
 sobytie_zadachi INTEGER,
 dejstvie TEXT NOT NULL,
 zapros_hesh TEXT,
 sohraneno INTEGER NOT NULL DEFAULT 0,
 itog_json TEXT,
 do_json TEXT,
 posle_json TEXT,
 versija_zadachi_posle INTEGER,
 sobytie_svjazi_posle INTEGER,
 sozdano TEXT NOT NULL,
 udaleno INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(typeof(zadacha_id)='integer' AND zadacha_id>0),
 CHECK(typeof(nomer_zadachi)='integer' AND nomer_zadachi>0),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK(dejstvie IN ('svjazat','otvjazat','otmenit','otmena_popytki','nastrojit')),
 CHECK(sohraneno IN (0,1) AND udaleno IN (0,1)),
 CHECK(sobytie_zadachi IS NULL OR (typeof(sobytie_zadachi)='integer' AND sobytie_zadachi>0)),
 CHECK(sobytie_svjazi_posle IS NULL OR (typeof(sobytie_svjazi_posle)='integer' AND sobytie_svjazi_posle>0)),
 CHECK((sohraneno=0 AND zapros_hesh IS NULL AND itog_json IS NULL AND do_json IS NULL AND posle_json IS NULL AND versija_zadachi_posle IS NULL AND sobytie_svjazi_posle IS NULL) OR
       (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND itog_json IS NOT NULL AND do_json IS NOT NULL AND posle_json IS NOT NULL AND json_valid(itog_json) AND json_type(itog_json)='object' AND json_valid(do_json) AND json_type(do_json)='object' AND json_valid(posle_json) AND json_type(posle_json)='object' AND typeof(versija_zadachi_posle)='integer' AND versija_zadachi_posle>=1))
);
CREATE INDEX IF NOT EXISTS istochniki_publikacij_zadach_post ON istochniki_publikacij_zadach(publikacija_id,akkaunt_id);
CREATE INDEX IF NOT EXISTS zaprosy_istochnikov_publikacij_zadacha ON zaprosy_istochnikov_publikacij(zadacha_id);
CREATE TRIGGER IF NOT EXISTS zaprosy_istochnikov_publikacij_udalenie AFTER DELETE ON zadachi BEGIN
 UPDATE zaprosy_istochnikov_publikacij SET udaleno=1 WHERE zadacha_id=OLD.id;
END;
