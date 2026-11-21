                                                                   
CREATE TABLE IF NOT EXISTS zaprosy_zadach (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  zapros_hesh            TEXT NOT NULL,
  otvet                  TEXT NOT NULL,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (json_valid(otvet))
);
