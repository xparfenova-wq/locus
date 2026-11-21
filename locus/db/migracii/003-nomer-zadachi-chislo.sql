                                                                    
                                                                          
                                                                    
PRAGMA foreign_keys = OFF;

CREATE TABLE zadachi_novye (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  nomer                  INTEGER UNIQUE,
  nazvanie               TEXT NOT NULL,
  opisanie               TEXT,
  napravlenie            TEXT NOT NULL,
  tip                    TEXT,
  publikacija            INTEGER,
  status                 TEXT,
  sprint                 INTEGER,
  srok                   TEXT,
  data                   TEXT,
  otvetstvennyj          INTEGER NOT NULL,
  klient_id              INTEGER,
  proekt_id              INTEGER,
  cel_id                 INTEGER,
  roditel_id             INTEGER,
  jakor                  TEXT,
  shablon                TEXT,
  plan_chislo            INTEGER,
  platezh_id             INTEGER,
  rassylka_id            INTEGER,
  rol_v_rassylke         TEXT,
  povtorjaetsja          INTEGER,
  povtor_s               TEXT,
  chastota               TEXT,
  dni                    TEXT,
  den_nedeli             INTEGER,
  ne_v_itogi             INTEGER,
  pochemu_otlozheno      TEXT,
  udaleno                INTEGER,
  sozdano                TEXT,
  ploshadka              TEXT,
  data_vyhoda            TEXT,
  format                 TEXT,
  rubrika                TEXT,
  akkaunt_id             INTEGER,
  ohvat                  INTEGER,
  versija                INTEGER
);

INSERT INTO zadachi_novye (id, nomer, nazvanie, opisanie, napravlenie, tip, publikacija, status, sprint, srok, data, otvetstvennyj, klient_id, proekt_id, cel_id, roditel_id, jakor, shablon, plan_chislo, platezh_id, rassylka_id, rol_v_rassylke, povtorjaetsja, povtor_s, chastota, dni, den_nedeli, ne_v_itogi, pochemu_otlozheno, udaleno, sozdano, ploshadka, data_vyhoda, format, rubrika, akkaunt_id, ohvat, versija)
SELECT id, CAST(CAST(nomer AS REAL) AS INTEGER), nazvanie, opisanie, napravlenie, tip, publikacija, status, sprint, srok, data, otvetstvennyj, klient_id, proekt_id, cel_id, roditel_id, jakor, shablon, plan_chislo, platezh_id, rassylka_id, rol_v_rassylke, povtorjaetsja, povtor_s, chastota, dni, den_nedeli, ne_v_itogi, pochemu_otlozheno, udaleno, sozdano, ploshadka, data_vyhoda, format, rubrika, akkaunt_id, ohvat, versija FROM zadachi;

DROP TABLE zadachi;
ALTER TABLE zadachi_novye RENAME TO zadachi;

PRAGMA foreign_keys = ON;
