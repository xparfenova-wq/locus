CREATE TABLE IF NOT EXISTS plany_kampanij (
  rassylka_id            INTEGER NOT NULL REFERENCES rassylki(id) ON DELETE CASCADE,
  plan_chislo            INTEGER NOT NULL,
  zadacha_bazy_id        INTEGER REFERENCES zadachi(id) ON DELETE SET NULL,
  zadacha_otpravki_id    INTEGER REFERENCES zadachi(id) ON DELETE SET NULL,
  nabor_filtrov_id       INTEGER REFERENCES sohranennye_filtry(id) ON DELETE SET NULL,
  versija                INTEGER NOT NULL DEFAULT 1,
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id),
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (rassylka_id),
  CHECK (plan_chislo>0 AND versija>0)
);
CREATE TABLE IF NOT EXISTS porjadki_voln (
  zadacha_id             INTEGER NOT NULL REFERENCES sostavy_voln(zadacha_id) ON DELETE CASCADE,
  rassylka_id            INTEGER NOT NULL REFERENCES rassylki(id) ON DELETE CASCADE,
  nomer                  INTEGER NOT NULL,
  PRIMARY KEY (zadacha_id),
  UNIQUE (rassylka_id, nomer),
  CHECK (nomer>0)
);
CREATE TABLE IF NOT EXISTS zaprosy_kampanij (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  tablica                TEXT NOT NULL,
  vladelec_id            INTEGER NOT NULL,
  zapros_hesh            TEXT,
  zapis_id               INTEGER NOT NULL,
  sobytie_id             INTEGER,
  sozdano                TEXT NOT NULL,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (tablica IN ('rassylki')),
  CHECK (vladelec_id>0 AND zapis_id>=0 AND udaleno IN (0,1)),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((zapis_id=0 AND sobytie_id IS NULL AND zapros_hesh IS NULL) OR (zapis_id>0 AND sobytie_id IS NOT NULL AND sobytie_id>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);
CREATE TRIGGER IF NOT EXISTS zaprosy_kampanij_delete AFTER DELETE ON rassylki BEGIN UPDATE zaprosy_kampanij SET udaleno=1 WHERE zapis_id=OLD.id;END;
