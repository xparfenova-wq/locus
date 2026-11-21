CREATE TABLE IF NOT EXISTS zamery_akkauntov (
  akkaunt_id             INTEGER,
  data                   TEXT,
  podpischikov           INTEGER,
  publikacij_vsego       INTEGER,
  summa_prosmotrov       INTEGER,
  ohvat                  INTEGER,
  vovlechennost          INTEGER,
  extra                  TEXT,
  daty_izmerenij         TEXT,
  PRIMARY KEY (akkaunt_id, data)
);

CREATE TABLE IF NOT EXISTS publikacii (
  id                     TEXT PRIMARY KEY,
  akkaunt_id             INTEGER,
  publikacija_id         INTEGER,
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
  extra                  TEXT
);

CREATE TABLE IF NOT EXISTS zamery_publikacij (
  publikacija_id         INTEGER,
  data                   TEXT,
  prosmotrov             INTEGER,
  lajkov                 INTEGER,
  kommentariev           INTEGER,
  peresylok              INTEGER,
  ohvat                  INTEGER,
  PRIMARY KEY (publikacija_id, data)
);
