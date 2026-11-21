CREATE TABLE IF NOT EXISTS sostavy_voln (
  zadacha_id             INTEGER NOT NULL REFERENCES zadachi(id) ON DELETE CASCADE,
  rassylka_id            INTEGER NOT NULL REFERENCES rassylki(id) ON DELETE CASCADE,
  plan                   INTEGER,
  polnyj                 INTEGER NOT NULL,
  sozdano                TEXT NOT NULL,
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id),
  PRIMARY KEY (zadacha_id),
  CHECK (polnyj IN (0,1))
);
CREATE TABLE IF NOT EXISTS uchastniki_voln (
  zadacha_id             INTEGER NOT NULL REFERENCES sostavy_voln(zadacha_id) ON DELETE CASCADE,
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id),
  status                 TEXT,
  kogda                  TEXT,
  otschet_at             TEXT,
  otvet_at               TEXT,
  versija                INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (zadacha_id, chelovek_id),
  CHECK (status IS NULL OR status IN ('ne_otpravleno','otpravleno','otvetil','otkaz')),
  CHECK (versija>0)
);
CREATE TABLE IF NOT EXISTS zaprosy_rassylok (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  rassylka_id            INTEGER NOT NULL,
  dejstvie               TEXT,
  zapros_hesh            TEXT,
  rezultat_json          TEXT,
  sozdano                TEXT NOT NULL,
  zadacha_id             INTEGER,
  sobytie_id             INTEGER,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((dejstvie IS NULL AND zapros_hesh IS NULL AND rezultat_json IS NULL AND zadacha_id IS NULL AND sobytie_id IS NULL) OR (dejstvie IN ('volna','otmetka') AND length(zapros_hesh)=64 AND json_valid(rezultat_json)))
);
