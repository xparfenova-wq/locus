ALTER TABLE napravlenija ADD COLUMN veduschij_id INTEGER REFERENCES ljudi(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS referalnye_zadachi (
 zadacha_id INTEGER PRIMARY KEY REFERENCES zadachi(id) ON DELETE CASCADE,
 sotrudnichestvo_id INTEGER NOT NULL,
 chelovek_id INTEGER NOT NULL,
 napravlenie TEXT NOT NULL,
 vid TEXT NOT NULL CHECK(vid IN ('akt','vyplata')),
 period_s TEXT NOT NULL,
 period_po TEXT NOT NULL,
 summa REAL,
 vyplata_zhurnal_id INTEGER,
 udaleno INTEGER NOT NULL DEFAULT 0 CHECK(udaleno IN (0,1)),
 sozdano TEXT NOT NULL,
 CHECK(period_s<=period_po),
 CHECK((vid='akt' AND summa IS NULL AND vyplata_zhurnal_id IS NULL) OR (vid='vyplata' AND summa IS NOT NULL AND summa>0))
);
CREATE TABLE IF NOT EXISTS zaprosy_referalnyh_zadach (
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 kljuch_hesh TEXT NOT NULL,
 sotrudnichestvo_id INTEGER NOT NULL,
 zapros_hesh TEXT,
 itog_json TEXT,
 udaleno INTEGER NOT NULL DEFAULT 0 CHECK(udaleno IN (0,1)),
 sozdano TEXT NOT NULL,
 PRIMARY KEY(avtor,kljuch_hesh),
 CHECK(length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK((zapros_hesh IS NULL AND itog_json IS NULL) OR (zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND itog_json IS NOT NULL AND json_valid(itog_json) AND json_type(itog_json,'$.zadachi') IS 'array' AND json_type(itog_json,'$.dejstvie_id') IS 'text'))
);
