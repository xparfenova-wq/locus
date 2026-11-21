                                                                                  
CREATE TABLE IF NOT EXISTS import_svjazi (
  istochnik TEXT NOT NULL,
  tablica TEXT NOT NULL,
  staryj_id TEXT NOT NULL,
  chast TEXT NOT NULL,
  chelovek_id INTEGER REFERENCES ljudi(id),
  akkaunt_id INTEGER REFERENCES akkaunty(id),
  sha256 TEXT NOT NULL,
  ishodnye_dannye TEXT NOT NULL,
  sozdano TEXT NOT NULL,
  PRIMARY KEY(istochnik,tablica,staryj_id,chast),
  CHECK ((chelovek_id IS NOT NULL) + (akkaunt_id IS NOT NULL) = 1)
);
