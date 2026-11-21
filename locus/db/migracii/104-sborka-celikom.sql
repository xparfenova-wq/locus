PRAGMA foreign_keys=OFF;

CREATE TABLE zamery_akkauntov_sbor (
  akkaunt_id             INTEGER NOT NULL REFERENCES akkaunty(id),
  data                   TEXT NOT NULL,
  podpischikov           INTEGER,
  publikacij_vsego       INTEGER,
  summa_prosmotrov       INTEGER,
  ohvat                  INTEGER,
  vovlechennost          INTEGER,
  extra                  TEXT,
  daty_izmerenij         TEXT,
  PRIMARY KEY (akkaunt_id, data)
);

INSERT INTO zamery_akkauntov_sbor(rowid,"akkaunt_id","data","podpischikov","publikacij_vsego","summa_prosmotrov","ohvat","vovlechennost","extra","daty_izmerenij") SELECT rowid,"akkaunt_id","data","podpischikov","publikacij_vsego","summa_prosmotrov","ohvat","vovlechennost","extra","daty_izmerenij" FROM zamery_akkauntov;

DROP TABLE zamery_akkauntov;

ALTER TABLE zamery_akkauntov_sbor RENAME TO zamery_akkauntov;

CREATE TABLE publikacii_sbor (
  id                     TEXT PRIMARY KEY,
  akkaunt_id             INTEGER NOT NULL REFERENCES akkaunty(id),
  publikacija_id         TEXT NOT NULL,
  ssylka                 TEXT,
  data_vyhoda            TEXT,
  format                 TEXT,
  zagolovok              TEXT,
  prosmotrov             INTEGER,
  lajkov                 INTEGER,
  kommentariev           INTEGER,
  peresylok              INTEGER,
  sohranenij             INTEGER,
  ohvat                  INTEGER,
  extra                  TEXT,
  daty_izmerenij         TEXT
);

INSERT INTO publikacii_sbor(rowid,"id","akkaunt_id","publikacija_id","ssylka","data_vyhoda","format","zagolovok","prosmotrov","lajkov","kommentariev","peresylok","sohranenij","ohvat","extra") SELECT rowid,"id","akkaunt_id",CAST("publikacija_id" AS TEXT),"ssylka","data_vyhoda","format","zagolovok","prosmotrov","lajkov","kommentariev","peresylok","sohranenij","ohvat","extra" FROM publikacii;

DROP TABLE publikacii;

ALTER TABLE publikacii_sbor RENAME TO publikacii;

CREATE TABLE zamery_publikacij_sbor (
  publikacija_id         TEXT NOT NULL REFERENCES publikacii(id),
  data                   TEXT NOT NULL,
  prosmotrov             INTEGER,
  lajkov                 INTEGER,
  kommentariev           INTEGER,
  peresylok              INTEGER,
  ohvat                  INTEGER,
  daty_izmerenij         TEXT,
  PRIMARY KEY (publikacija_id, data)
);

INSERT INTO zamery_publikacij_sbor(rowid,"publikacija_id","data","prosmotrov","lajkov","kommentariev","peresylok","ohvat") SELECT rowid,CAST("publikacija_id" AS TEXT),"data","prosmotrov","lajkov","kommentariev","peresylok","ohvat" FROM zamery_publikacij;

DROP TABLE zamery_publikacij;

ALTER TABLE zamery_publikacij_sbor RENAME TO zamery_publikacij;

ALTER TABLE zapuski_sbora ADD COLUMN kljuch_zapuska TEXT;

ALTER TABLE zapuski_sbora ADD COLUMN sha256 TEXT;

ALTER TABLE zapuski_sbora ADD COLUMN zaprosheno TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sbor_kljuch ON zapuski_sbora(kljuch_zapuska);
