                                                                      
ALTER TABLE materialy ADD COLUMN ishodnoe_imja TEXT;
ALTER TABLE dokumenty ADD COLUMN ishodnoe_imja TEXT;
CREATE TABLE IF NOT EXISTS zaprosy_materialov (
  avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch TEXT NOT NULL,
  tablica TEXT NOT NULL CHECK(tablica IN ('materialy','dokumenty')),
  otpechatok TEXT NOT NULL,
  zapis_id INTEGER NOT NULL,
  sozdano TEXT NOT NULL,
  PRIMARY KEY(avtor,kljuch)
);
CREATE INDEX materialy_fajl ON materialy(fajl);
CREATE INDEX dokumenty_fajl ON dokumenty(fajl);
