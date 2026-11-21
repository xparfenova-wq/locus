                                                              
                                                           
DROP TABLE IF EXISTS sessii;
CREATE TABLE sessii (
  id                     TEXT PRIMARY KEY,
  chelovek_id            INTEGER,
  sozdano                TEXT,
  istekaet               TEXT,
  ustrojstvo             TEXT
);
                                                                       
CREATE TABLE IF NOT EXISTS vhod_ssylki (
  id                     TEXT PRIMARY KEY,
  chelovek_id            INTEGER,
  sozdano                TEXT,
  istekaet               TEXT,
  ispolzovana            TEXT,
  kuda                   TEXT
);
