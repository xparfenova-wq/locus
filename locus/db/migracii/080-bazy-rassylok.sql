                                                                     
                                                                
                                                    

ALTER TABLE ljudi ADD COLUMN chto_eto TEXT DEFAULT 'chelovek';

CREATE TABLE IF NOT EXISTS bazy (
  id            INTEGER PRIMARY KEY,
  nazvanie      TEXT NOT NULL,
  napravlenie   TEXT,
  opisanie      TEXT,
  chto_vnutri   TEXT NOT NULL DEFAULT 'chelovek',
  kto_vedet     INTEGER,
  arhiv         INTEGER DEFAULT 0,
  sozdano       TEXT DEFAULT (datetime('now'))
);
                                                                     
                                                                      
                                             
CREATE TABLE IF NOT EXISTS bazy_statusy (
  id            INTEGER PRIMARY KEY,
  baza_id       INTEGER NOT NULL,
  nazvanie      TEXT NOT NULL,
  rol           TEXT,
  porjadok      INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS bazy_statusy_porjadok
  ON bazy_statusy (baza_id, porjadok);

CREATE TABLE IF NOT EXISTS bazy_ljudi (
  id                INTEGER PRIMARY KEY,
  baza_id           INTEGER NOT NULL,
  kto               INTEGER NOT NULL,
  kontakt           INTEGER,
  kanal_svjazi      TEXT,
  adres             TEXT,
  kanal_zapasnoj    TEXT,
  kontekst          TEXT,
  kontekst_otkuda   TEXT,
  soobshenie        TEXT,
  soobshenie_vdogon TEXT,
  status_id         INTEGER,
  segment           TEXT,
  kogorta           TEXT,
  kommentarij       TEXT,
  ssylka            TEXT,
  svoi              TEXT,
  sozdano           TEXT DEFAULT (datetime('now'))
);
                                                                  
                  
CREATE UNIQUE INDEX IF NOT EXISTS bazy_ljudi_odin
  ON bazy_ljudi (baza_id, kto);
CREATE INDEX IF NOT EXISTS bazy_ljudi_status
  ON bazy_ljudi (baza_id, status_id);

ALTER TABLE rassylki ADD COLUMN baza_id INTEGER;
