-- Схема Локуса. Собрана из СХЕМА-БАЗЫ.md, руками не правится
-- Пересобрать: python3 db/sborka_shemy.py

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schetchiki_anket (
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  poslednjaja_versija    INTEGER NOT NULL,
  PRIMARY KEY (chelovek_id),
  CHECK (typeof(poslednjaja_versija)='integer' AND poslednjaja_versija>=1)
);

CREATE TABLE IF NOT EXISTS import_svjazi (
  istochnik              TEXT NOT NULL,
  tablica                TEXT NOT NULL,
  staryj_id              TEXT NOT NULL,
  chast                  TEXT NOT NULL,
  chelovek_id            INTEGER REFERENCES ljudi(id),
  akkaunt_id             INTEGER REFERENCES akkaunty(id),
  sha256                 TEXT NOT NULL,
  ishodnye_dannye        TEXT NOT NULL,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (istochnik, tablica, staryj_id, chast),
  CHECK ((chelovek_id IS NOT NULL) + (akkaunt_id IS NOT NULL) = 1)
);

CREATE TABLE IF NOT EXISTS versii_polej (
  tablica                TEXT NOT NULL,
  obekt_id               INTEGER NOT NULL,
  pole                   TEXT NOT NULL,
  versija                INTEGER NOT NULL,
  kto                    INTEGER,
  kogda                  TEXT,
  PRIMARY KEY (tablica, obekt_id, pole)
);

CREATE TABLE IF NOT EXISTS ljudi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  imja                   TEXT NOT NULL,
  jurlico                INTEGER,
  gorod                  TEXT,
  nisha                  TEXT,
  zametka                TEXT,
  komanda                INTEGER,
  pol                    TEXT,
  rol_v_baze             TEXT,
  chto_eto               TEXT DEFAULT 'chelovek',
  arhiv                  INTEGER,
  arhiv_s                TEXT,
  vozvrat_s              TEXT,
  aktiven                INTEGER,
  imja_norm              TEXT,
  foto                   TEXT,
  inicialy               TEXT,
  cvet                   TEXT,
  dostup                 TEXT,
  sozdano                TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS kontakty (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  tip                    TEXT,
  znachenie              TEXT,
  osnovnoj               INTEGER,
  porjadok               INTEGER,
  znachenie_norm         TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS sotrudnichestva (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  napravlenie            TEXT,
  rol                    TEXT,
  stadija                TEXT,
  svoja_stadija          TEXT,
  procent                INTEGER,
  procent_shkala         INTEGER,
  nalog                  INTEGER,
  privodit_klientov      INTEGER,
  vyplacheno             INTEGER,
  dogovor_nomer          TEXT,
  dogovor_id             INTEGER,
  kontakt_id             INTEGER,
  kontekst               TEXT,
  kommentarij            TEXT,
  osobennosti            TEXT,
  istochnik              TEXT,
  istochnik_tekst        TEXT,
  rekomendoval_id        INTEGER,
  rassylka_id            INTEGER REFERENCES rassylki(id),
  poslednjaja_zadacha    TEXT,
  poslednee_obshenie     TEXT,
  arhiv                  INTEGER,
  arhiv_s                TEXT,
  vozvrat_s              TEXT,
  sozdano                TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS fokus_sessii (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  zadacha_id             INTEGER,
  rezhim                 TEXT,
  nachalo                TEXT,
  konec                  TEXT,
  zachtena               INTEGER,
  pauza_s                TEXT,
  pauza_ms               INTEGER NOT NULL DEFAULT 0,
  versija                INTEGER NOT NULL DEFAULT 1,
  identifikator          TEXT
);

CREATE TABLE IF NOT EXISTS svjazi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  ot_cheloveka           INTEGER,
  k_cheloveku            INTEGER,
  tip                    TEXT,
  zametka                TEXT
);

CREATE TABLE IF NOT EXISTS bazy (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  nazvanie               TEXT,
  napravlenie            TEXT,
  opisanie               TEXT,
  chto_vnutri            TEXT,
  kto_vedet              INTEGER,
  arhiv                  INTEGER,
  sozdano                TEXT
);

CREATE TABLE IF NOT EXISTS bazy_statusy (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  baza_id                INTEGER,
  nazvanie               TEXT,
  rol                    TEXT,
  porjadok               INTEGER
);

CREATE TABLE IF NOT EXISTS bazy_ljudi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  baza_id                INTEGER,
  kto                    INTEGER,
  kontakt                TEXT,
  kanal_svjazi           TEXT,
  adres                  TEXT,
  kanal_zapasnoj         TEXT,
  kontekst               TEXT,
  kontekst_otkuda        TEXT,
  soobshenie             TEXT,
  soobshenie_vdogon      TEXT,
  status_id              INTEGER,
  segment                TEXT,
  kogorta                TEXT,
  kommentarij            TEXT,
  ssylka                 TEXT,
  svoi                   TEXT,
  sozdano                TEXT
);

CREATE TABLE IF NOT EXISTS rassylki (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  nazvanie               TEXT,
  napravlenie            TEXT,
  baza_id                INTEGER,
  ploshadka              TEXT,
  tip                    TEXT DEFAULT 'klientskaja',
  segment                TEXT,
  offer                  TEXT,
  kto_vedet              INTEGER,
  status                 TEXT,
  nachalo                TEXT,
  konec                  TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS rassylka_ljudi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  rassylka_id            INTEGER,
  chelovek_id            INTEGER,
  status                 TEXT,
  otpravleno_at          TEXT,
  otvet_at               TEXT,
  zametka                TEXT,
  zadacha_id             INTEGER REFERENCES zadachi(id)
);

CREATE TABLE IF NOT EXISTS rassylka_kasanija (
  rassylka_id            INTEGER,
  chelovek_id            INTEGER,
  zadacha_id             INTEGER,
  kogda                  TEXT,
  chto                   TEXT
);

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

CREATE TABLE IF NOT EXISTS vklady_baz (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  stroka_id              INTEGER NOT NULL REFERENCES bazy_ljudi(id) ON DELETE CASCADE,
  tablica                TEXT NOT NULL,
  material_id            INTEGER NOT NULL,
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id),
  sozdano                TEXT NOT NULL,
  UNIQUE (stroka_id, tablica, material_id),
  CHECK (tablica IN ('materialy','dokumenty') AND material_id>0)
);

CREATE TABLE IF NOT EXISTS zaprosy_baz (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  dejstvie               TEXT NOT NULL,
  zapros_hesh            TEXT,
  itog                   TEXT,
  otmeneno               INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (otmeneno IN (0,1) AND udaleno IN (0,1)),
  CHECK ((otmeneno=1 AND zapros_hesh IS NULL AND itog IS NULL) OR (otmeneno=0 AND length(zapros_hesh)=64 AND json_valid(itog)))
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

CREATE TABLE IF NOT EXISTS rassylka_plan (
  id                     INTEGER,
  rassylka_id            INTEGER,
  nedelja                INTEGER,
  god                    INTEGER,
  plan_soobshenij        INTEGER,
  plan_otvetov           INTEGER,
  plan_soglasij          INTEGER,
  plan_publikacij        INTEGER,
  rabochih_dnej          INTEGER,
  po_ljudjam             TEXT,
  PRIMARY KEY (rassylka_id, god, nedelja)
);

CREATE TABLE IF NOT EXISTS proekty (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  nazvanie               TEXT,
  klient_id              INTEGER,
  napravlenie            TEXT,
  kto_vedet              INTEGER,
  status                 TEXT,
  arhiv                  INTEGER,
  arhiv_s                TEXT,
  stoimost               INTEGER,
  usluga_id              INTEGER,
  usluga_tekst           TEXT,
  usluga_svoja           TEXT,
  kommentarij            TEXT,
  sozdano                TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS uslugi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  napravlenie            TEXT,
  nazvanie               TEXT,
  opisanie               TEXT,
  cena                   INTEGER,
  ssylka                 TEXT,
  porjadok               INTEGER,
  arhiv                  INTEGER,
  arhiv_s                TEXT,
  vozvrat_s              TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS platezhi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  proekt_id              INTEGER,
  summa                  INTEGER,
  vystavlen_at           TEXT,
  zhdem_do               TEXT,
  oplachen_at            TEXT,
  nomer                  TEXT,
  naznachenie            TEXT,
  versija                INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS zadachi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  nomer                  INTEGER UNIQUE,
  nazvanie               TEXT NOT NULL,
  opisanie               TEXT,
  napravlenie            TEXT NOT NULL,
  tip                    TEXT,
  publikacija            INTEGER,
  kljuchevaja            INTEGER DEFAULT 0,
  status                 TEXT,
  sprint                 INTEGER,
  god_sprinta            INTEGER,
  srok                   TEXT,
  data                   TEXT,
  otvetstvennyj          INTEGER NOT NULL,
  klient_id              INTEGER,
  sotrudnichestvo_id     INTEGER,
  proekt_id              INTEGER,
  cel_id                 INTEGER,
  rezultat_id            INTEGER REFERENCES rezultaty(id),
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
  kto_dobavil            INTEGER,
  sozdano                TEXT,
  ploshadka              TEXT,
  data_vyhoda            TEXT,
  format                 TEXT,
  rubrika                TEXT,
  akkaunt_id             INTEGER,
  ohvat                  INTEGER,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS zadacha_uchastniki (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  zadacha_id             INTEGER NOT NULL REFERENCES zadachi(id) ON DELETE CASCADE,
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  dobavleno              TEXT DEFAULT (datetime('now')),
  UNIQUE (zadacha_id, chelovek_id)
);

CREATE TABLE IF NOT EXISTS nerazobrannye_svjazi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  tablica                TEXT NOT NULL,
  staryj_rowid           INTEGER NOT NULL,
  zadacha_id_istochnika  BLOB,
  chelovek_id_istochnika BLOB,
  prichina               TEXT NOT NULL,
  obnaruzheno            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tablica, staryj_rowid)
);

CREATE TABLE IF NOT EXISTS kommentarii (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  zadacha_id             INTEGER NOT NULL REFERENCES zadachi(id),
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id),
  tekst                  TEXT NOT NULL,
  sozdano                TEXT NOT NULL,
  izmeneno               TEXT,
  upominanija            TEXT NOT NULL DEFAULT '[]',
  versija                INTEGER NOT NULL DEFAULT 1,
  CHECK (typeof(tekst)='text' AND length(tekst)<=5000 AND length(trim(tekst,char(9)||char(10)||char(13)||' '))>0),
  CHECK (json_valid(upominanija) AND json_type(upominanija)='array'),
  CHECK (typeof(versija)='integer' AND versija>=1)
);

CREATE TABLE IF NOT EXISTS otmetki_povtora (
  zadacha_id             INTEGER,
  data                   TEXT,
  status                 TEXT,
  kto                    INTEGER,
  kogda                  TEXT,
  PRIMARY KEY (zadacha_id, data)
);

CREATE TABLE IF NOT EXISTS snimki_planerki (
  napravlenie            TEXT,
  nedelja                INTEGER,
  god                    INTEGER,
  dannye                 TEXT,
  sozdano                TEXT,
  pereschitan            TEXT,
  PRIMARY KEY (napravlenie, god, nedelja)
);

CREATE TABLE IF NOT EXISTS spravochnik_stadij (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  rol                    TEXT,
  napravlenie            TEXT,
  kod                    TEXT,
  nazvanie               TEXT,
  sledujuschee_dejstvie  TEXT,
  gotovyj                INTEGER,
  porjadok               INTEGER,
  arhiv                  INTEGER
);

CREATE TABLE IF NOT EXISTS spravochnik_tipov (
  kod                    TEXT,
  nazvanie               TEXT,
  porjadok               INTEGER,
  PRIMARY KEY (kod)
);

CREATE TABLE IF NOT EXISTS shablony (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  kod                    TEXT,
  nazvanie               TEXT,
  tip                    TEXT,
  opisanie               TEXT,
  srok_po_umolchaniju    TEXT,
  schitat_fakt           TEXT,
  gotovyj                INTEGER,
  avtor                  INTEGER,
  obschij                INTEGER,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS shablon_podzadachi (
  shablon_id             INTEGER,
  nazvanie               TEXT,
  porjadok               INTEGER
);

CREATE TABLE IF NOT EXISTS periody (
  id                     TEXT PRIMARY KEY,
  tip                    TEXT,
  nachalo                TEXT,
  konec                  TEXT,
  zakryt                 INTEGER,
  zakryl                 INTEGER,
  zakryt_kogda           TEXT
);

CREATE TABLE IF NOT EXISTS celi (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  nazvanie               TEXT,
  opisanie               TEXT,
  napravlenie            TEXT,
  period_id              INTEGER,
  sostojanie             TEXT,
  tezis_id               INTEGER,
  sozdano                TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS rezultaty (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  cel_id                 INTEGER,
  nazvanie               INTEGER,
  tip                    INTEGER,
  baza                   INTEGER,
  plan                   INTEGER,
  kto_otvechaet          TEXT,
  schitat_lidov          INTEGER,
  istochnik              TEXT,
  formula                TEXT,
  akkaunt_id             INTEGER,
  baza_id                INTEGER,
  metrika                TEXT,
  zakryta                INTEGER,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS zamery (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  rezultat_id            INTEGER NOT NULL REFERENCES rezultaty(id),
  znachenie              REAL,
  data                   TEXT,
  otkuda                 TEXT,
  kto                    INTEGER REFERENCES ljudi(id),
  sozdano                TEXT
);

CREATE TABLE IF NOT EXISTS tezisy (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  napravlenie            TEXT,
  god                    TEXT,
  tekst                  TEXT,
  porjadok               INTEGER,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  versija                INTEGER NOT NULL DEFAULT 1,
  CHECK (udaleno IN (0,1)),
  CHECK (typeof(versija)='integer' AND versija>=1)
);

CREATE TABLE IF NOT EXISTS napravlenija (
  kod                    TEXT,
  nazvanie               TEXT,
  cvet                   TEXT,
  logotip                TEXT,
  est_klienty            INTEGER,
  norma_dnej             INTEGER,
  arhiv                  INTEGER,
  porjadok               INTEGER,
  versija                INTEGER NOT NULL DEFAULT 1,
  veduschij_id           INTEGER REFERENCES ljudi(id) ON DELETE SET NULL,
  PRIMARY KEY (kod)
);

CREATE TABLE IF NOT EXISTS akkaunty (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  ploshadka              TEXT,
  nazvanie               TEXT,
  ssylka                 TEXT,
  zagolovok              TEXT,
  napravlenie            TEXT,
  proekt_id              INTEGER,
  vladelec               INTEGER,
  uroven                 TEXT,
  zametka                TEXT,
  aktiven                INTEGER,
  udalen                 INTEGER,
  porjadok               INTEGER,
  versija                INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS zamery_akkauntov (
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

CREATE TABLE IF NOT EXISTS publikacii (
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

CREATE TABLE IF NOT EXISTS zamery_publikacij (
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

CREATE TABLE IF NOT EXISTS vizity (
  napravlenie            TEXT,
  data                   TEXT,
  vizitov                INTEGER,
  istochnik_trafika      TEXT,
  PRIMARY KEY (napravlenie, data, istochnik_trafika)
);

CREATE TABLE IF NOT EXISTS zapuski_sbora (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  kogda                  TEXT,
  akkaunt_id             INTEGER,
  uroven                 TEXT,
  uspeh                  INTEGER,
  poluchen               INTEGER,
  primechanie            TEXT,
  kljuch_zapuska         TEXT,
  sha256                 TEXT,
  zaprosheno             TEXT
);

CREATE TABLE IF NOT EXISTS grafik (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  nedelja                INTEGER,
  god                    INTEGER,
  den                    INTEGER,
  chasov                 INTEGER,
  ne_rabotaju            INTEGER DEFAULT 0,
  s_kakogo               TEXT,
  do_kakogo              TEXT,
  zametka                TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS zhurnal (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  obekt                  TEXT,
  obekt_id               INTEGER,
  pole                   TEXT,
  bylo                   TEXT,
  stalo                  TEXT,
  kto                    INTEGER,
  kogda                  TEXT,
  srez                   TEXT,
  CHECK (srez IS NULL OR CASE WHEN json_valid(srez) THEN json_type(srez)='object' ELSE 0 END)
);

CREATE TABLE IF NOT EXISTS uvedomlenija (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE RESTRICT,
  tip                    TEXT NOT NULL,
  potok                  TEXT NOT NULL,
  zadacha_id             INTEGER REFERENCES zadachi(id) ON DELETE SET NULL,
  tekst                  TEXT NOT NULL,
  prochitano             INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL DEFAULT (datetime('now')),
  proekt_id              INTEGER REFERENCES proekty(id) ON DELETE SET NULL,
  lenta_id               INTEGER REFERENCES lenta(id) ON DELETE SET NULL,
  zadacha_id_istochnika  BLOB,
  ssylka_udalena         TEXT,
  CHECK (tip IN ('komanda_dobavila_zadachu','komanda_dobavila_podzadachu','pomenjali_srok','dobavili_uchastnikom','vedushim_proekta','segodnja_istekaet_srok','zadacha_prosrochena','upomjanuli_v_kommentarii','kommentarij_v_zadache','zakryli_podzadachu','izmenili_zadachu_uchastnika','podzadacha_v_moej_zadache','novoe')),
  CHECK ((potok='pro_menja' AND tip IN ('komanda_dobavila_zadachu','komanda_dobavila_podzadachu','pomenjali_srok','dobavili_uchastnikom','vedushim_proekta','segodnja_istekaet_srok','zadacha_prosrochena','upomjanuli_v_kommentarii')) OR (potok='sobytija' AND tip IN ('kommentarij_v_zadache','zakryli_podzadachu','izmenili_zadachu_uchastnika','podzadacha_v_moej_zadache','novoe'))),
  CHECK (length(trim(tekst,char(9)||char(10)||char(11)||char(12)||char(13)||char(32)||char(160)||char(5760)||char(8192)||char(8193)||char(8194)||char(8195)||char(8196)||char(8197)||char(8198)||char(8199)||char(8200)||char(8201)||char(8202)||char(8232)||char(8233)||char(8239)||char(8287)||char(12288)||char(65279))) BETWEEN 1 AND 1000 AND length(tekst)<=1000 AND instr(tekst,char(0))=0),
  CHECK (prochitano IN (0,1)),
  CHECK (datetime(sozdano) IS NOT NULL),
  CHECK ((zadacha_id IS NOT NULL)+(proekt_id IS NOT NULL)+(lenta_id IS NOT NULL)<=1),
  CHECK (ssylka_udalena IS NULL OR ssylka_udalena IN ('zadacha','proekt','novoe'))
);

CREATE TABLE IF NOT EXISTS povody_uvedomlenij (
  kljuch                 TEXT NOT NULL,
  sozdano                TEXT NOT NULL DEFAULT (datetime('now')),
  uvedomlenie_id         INTEGER UNIQUE REFERENCES uvedomlenija(id) ON DELETE SET NULL,
  PRIMARY KEY (kljuch),
  CHECK (length(kljuch) BETWEEN 1 AND 160),
  CHECK (datetime(sozdano) IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS otmeny_kontaktov (
  token_hesh             TEXT NOT NULL,
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  do_ms                  INTEGER NOT NULL,
  udaleno_id             INTEGER NOT NULL REFERENCES zhurnal(id) ON DELETE CASCADE,
  slepok                 TEXT NOT NULL,
  osnovnye               TEXT NOT NULL,
  zapros_hesh            TEXT,
  PRIMARY KEY (token_hesh),
  CHECK (length(token_hesh)=64 AND token_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (do_ms>0),
  CHECK (json_valid(slepok)),
  CHECK (json_valid(osnovnye)),
  CHECK (zapros_hesh IS NULL OR (length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);

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

CREATE TABLE IF NOT EXISTS zaprosy_platezhej (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  platezh_id             INTEGER NOT NULL,
  dejstvie               TEXT NOT NULL,
  zapros_hesh            TEXT NOT NULL,
  otvet                  TEXT NOT NULL,
  obratno                TEXT NOT NULL,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (platezh_id > 0),
  CHECK (dejstvie IN ('prishlo','otmenit_prishlo')),
  CHECK (json_valid(otvet) AND json_valid(obratno))
);

CREATE TABLE IF NOT EXISTS nastrojki (
  chelovek_id            INTEGER,
  panel_ljudej           INTEGER,
  prioritetnoe_napravlenie TEXT,
  vid_zadach             TEXT,
  bot_vkljuchen          INTEGER,
  bot_chto               TEXT,
  tihie_chasy            INTEGER,
  pokazannye_podskazki   TEXT,
  pokazyvat_v_rejtinge_fokusa INTEGER NOT NULL DEFAULT 0,
  svoj_kursor            INTEGER DEFAULT 0,
  razdely_menju          TEXT,
  prioritetnye_napravlenija TEXT,
  svoi_cveta             TEXT,
  chi_zadachi            TEXT,
  startovyj_ekran        TEXT,
  bot_sobytija           TEXT,
  PRIMARY KEY (chelovek_id)
);

CREATE TABLE IF NOT EXISTS skrytye_plashki (
  chelovek_id            INTEGER,
  o_kom_id               INTEGER,
  skryto_do              TEXT,
  PRIMARY KEY (chelovek_id, o_kom_id)
);

CREATE TABLE IF NOT EXISTS nastrojki_sistemy (
  stavka_naloga          INTEGER,
  chasovoj_pojas         TEXT,
  nedel_v_okne           INTEGER,
  porog_peregruza        TEXT,
  dnej_bez_obschenija_porog INTEGER
);

CREATE TABLE IF NOT EXISTS anketa (
  chelovek_id            INTEGER,
  kogda_v_seti           TEXT,
  kak_obraschatsja       TEXT,
  chto_besit             TEXT,
  chto_pomogaet          TEXT,
  format_svjazi          TEXT,
  kakaja_ja              TEXT,
  silnye_storony         TEXT,
  slabye_storony         TEXT,
  v_chem_polezna         TEXT,
  kogda_trudno           TEXT,
  dogovoritsja           TEXT,
  missija                TEXT,
  mechty                 TEXT,
  chitaju                TEXT,
  smotrju                TEXT,
  izuchaju               TEXT,
  eschyo                 TEXT,
  desert                 TEXT,
  versija                INTEGER,
  PRIMARY KEY (chelovek_id)
);

CREATE TABLE IF NOT EXISTS vhod (
  chelovek_id            INTEGER,
  login                  TEXT UNIQUE,
  parol_hesh             TEXT,
  startovyj_ekran        TEXT,
  poslednij_vhod         TEXT,
  zablokirovan           INTEGER,
  PRIMARY KEY (chelovek_id)
);

CREATE TABLE IF NOT EXISTS vhod_ssylki (
  id                     TEXT PRIMARY KEY,
  chelovek_id            INTEGER,
  sozdano                TEXT,
  istekaet               TEXT,
  ispolzovana            TEXT,
  kuda                   TEXT
);

CREATE TABLE IF NOT EXISTS sessii (
  id                     TEXT PRIMARY KEY,
  chelovek_id            INTEGER,
  sozdano                TEXT,
  istekaet               TEXT,
  ustrojstvo             TEXT
);

CREATE TABLE IF NOT EXISTS prosmotry (
  chelovek_id            INTEGER,
  zadacha_id             INTEGER,
  kogda                  TEXT,
  PRIMARY KEY (chelovek_id, zadacha_id)
);

CREATE TABLE IF NOT EXISTS lenta (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  tip                    TEXT,
  tekst                  TEXT,
  napravlenie            TEXT,
  sprint                 INTEGER,
  god_sprinta            INTEGER,
  sozdano                TEXT,
  versija                INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS materialy (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  proekt_id              INTEGER,
  napravlenie            TEXT,
  zadacha_id             INTEGER,
  nazvanie               TEXT,
  ishodnoe_imja          TEXT,
  fajl                   TEXT,
  ssylka                 TEXT,
  razmer                 INTEGER,
  tip_fajla              TEXT,
  kto_dobavil            INTEGER,
  sozdano                TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS dokumenty (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  proekt_id              INTEGER,
  napravlenie            TEXT,
  nazvanie               TEXT,
  tip                    TEXT,
  nomer                  TEXT,
  data                   TEXT,
  ishodnoe_imja          TEXT,
  fajl                   TEXT,
  ssylka                 TEXT,
  razmer                 INTEGER,
  tip_fajla              TEXT,
  kto_dobavil            INTEGER,
  sozdano                TEXT,
  versija                INTEGER
);

CREATE TABLE IF NOT EXISTS istorija_filtrov (
  chelovek_id            INTEGER,
  nabor_filtrov          TEXT,
  upotreblenij           INTEGER,
  poslednij_raz          TEXT
);

CREATE TABLE IF NOT EXISTS sohranennye_filtry (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER,
  nazvanie               TEXT,
  filtry                 TEXT,
  vidimost               TEXT,
  porjadok               INTEGER,
  sozdano                TEXT
);

CREATE TABLE IF NOT EXISTS sostojanija (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id),
  den                    TEXT NOT NULL,
  nastroenie             INTEGER,
  resurs                 INTEGER,
  zametka                TEXT,
  sozdano                TEXT NOT NULL DEFAULT (datetime('now')),
  versija                INTEGER NOT NULL DEFAULT 1,
  UNIQUE (chelovek_id, den)
);

CREATE TABLE IF NOT EXISTS zaprosy_materialov (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch                 TEXT NOT NULL,
  tablica                TEXT NOT NULL,
  otpechatok             TEXT NOT NULL,
  zapis_id               INTEGER NOT NULL,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch),
  CHECK (tablica IN ('materialy','dokumenty'))
);

CREATE TABLE IF NOT EXISTS zaprosy_sozdanija (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  tablica                TEXT NOT NULL,
  vladelec_id            INTEGER NOT NULL,
  zapros_hesh            TEXT,
  zapis_id               INTEGER NOT NULL,
  sobytie_id             INTEGER,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (tablica IN ('platezhi')),
  CHECK (vladelec_id>0),
  CHECK (zapis_id>=0),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((zapis_id=0 AND sobytie_id IS NULL AND zapros_hesh IS NULL) OR (zapis_id>0 AND sobytie_id IS NOT NULL AND sobytie_id>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE IF NOT EXISTS zaprosy_shablonov (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  tablica                TEXT NOT NULL,
  vladelec_id            INTEGER NOT NULL,
  zapros_hesh            TEXT,
  zapis_id               INTEGER NOT NULL,
  sobytie_id             INTEGER,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (tablica IN ('shablony')),
  CHECK (vladelec_id>0),
  CHECK (zapis_id>=0),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((zapis_id=0 AND sobytie_id IS NULL AND zapros_hesh IS NULL) OR (zapis_id>0 AND sobytie_id IS NOT NULL AND sobytie_id>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE IF NOT EXISTS zaprosy_proektov (
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
  CHECK (udaleno IN (0,1)),
  CHECK (tablica IN ('proekty')),
  CHECK (vladelec_id>0),
  CHECK (zapis_id>=0),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((zapis_id=0 AND sobytie_id IS NULL AND zapros_hesh IS NULL) OR (zapis_id>0 AND sobytie_id IS NOT NULL AND sobytie_id>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE IF NOT EXISTS zaprosy_pravok_proektov (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  proekt_id              INTEGER NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  versija_posle          INTEGER,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (proekt_id>0),
  CHECK (sohraneno IN (0,1)),
  CHECK (udaleno IN (0,1)),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((sohraneno=0 AND versija_posle IS NULL AND zapros_hesh IS NULL) OR (sohraneno=1 AND versija_posle IS NOT NULL AND versija_posle>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE IF NOT EXISTS zaprosy_dejstvij_proektov (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  proekt_id              INTEGER NOT NULL,
  dejstvie               TEXT NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  versija_posle          INTEGER,
  itog_json              TEXT,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (proekt_id>0),
  CHECK (dejstvie IN ('zavershit','vozobnovit','arhiv')),
  CHECK (sohraneno IN (0,1)),
  CHECK (udaleno IN (0,1)),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((sohraneno=0 AND versija_posle IS NULL AND zapros_hesh IS NULL AND itog_json IS NULL) OR (sohraneno=1 AND versija_posle IS NOT NULL AND versija_posle>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND itog_json IS NOT NULL AND json_valid(itog_json)))
);

CREATE TABLE IF NOT EXISTS zaprosy_dejstvij_uslug (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  napravlenie            TEXT NOT NULL,
  usluga_id              INTEGER NOT NULL,
  dejstvie               TEXT NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  itog_json              TEXT,
  rezultat_usluga_id     INTEGER,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (dejstvie IN ('sozdanie','pravka','zamena','porjadok')),
  CHECK ((dejstvie IN ('sozdanie','porjadok') AND usluga_id=0) OR (dejstvie IN ('pravka','zamena') AND usluga_id>0)),
  CHECK (sohraneno IN (0,1)),
  CHECK (udaleno IN (0,1)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND itog_json IS NULL AND rezultat_usluga_id IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND itog_json IS NOT NULL AND json_valid(itog_json) AND ((dejstvie='porjadok' AND rezultat_usluga_id IS NULL) OR (dejstvie<>'porjadok' AND rezultat_usluga_id IS NOT NULL AND rezultat_usluga_id>0))))
);

CREATE TABLE IF NOT EXISTS zaprosy_vyplat_referalam (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  sotrudnichestvo_id     INTEGER NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  zhurnal_id             INTEGER,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (sotrudnichestvo_id>0),
  CHECK (sohraneno IN (0,1)),
  CHECK (udaleno IN (0,1)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND zhurnal_id IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND zhurnal_id IS NOT NULL AND zhurnal_id>0))
);

CREATE TABLE IF NOT EXISTS zaprosy_uslovij_referalov (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  sotrudnichestvo_id     INTEGER NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  versija_posle          INTEGER,
  itog_json              TEXT,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (sotrudnichestvo_id>0),
  CHECK (sohraneno IN (0,1)),
  CHECK (udaleno IN (0,1)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND versija_posle IS NULL AND itog_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND versija_posle IS NOT NULL AND versija_posle>0 AND itog_json IS NOT NULL AND json_valid(itog_json) AND json_type(itog_json,'$.zhurnal_ids') IS 'array' AND json_type(itog_json,'$.dejstvie_id') IS NOT NULL AND json_type(itog_json,'$.dejstvie_id') IN ('text','null')))
);

CREATE TABLE IF NOT EXISTS referalnye_zadachi (
  zadacha_id             INTEGER NOT NULL REFERENCES zadachi(id) ON DELETE CASCADE,
  sotrudnichestvo_id     INTEGER NOT NULL,
  chelovek_id            INTEGER NOT NULL,
  napravlenie            TEXT NOT NULL,
  vid                    TEXT NOT NULL,
  period_s               TEXT NOT NULL,
  period_po              TEXT NOT NULL,
  summa                  REAL,
  vyplata_zhurnal_id     INTEGER,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (zadacha_id),
  CHECK (vid IN ('akt','vyplata')),
  CHECK (udaleno IN (0,1)),
  CHECK (period_s<=period_po),
  CHECK ((vid='akt' AND summa IS NULL AND vyplata_zhurnal_id IS NULL) OR (vid='vyplata' AND summa IS NOT NULL AND summa>0))
);

CREATE TABLE IF NOT EXISTS zaprosy_referalnyh_zadach (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  sotrudnichestvo_id     INTEGER NOT NULL,
  zapros_hesh            TEXT,
  itog_json              TEXT,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (udaleno IN (0,1)),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((zapros_hesh IS NULL AND itog_json IS NULL) OR (zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND itog_json IS NOT NULL AND json_valid(itog_json) AND json_type(itog_json,'$.zadachi') IS 'array' AND json_type(itog_json,'$.dejstvie_id') IS 'text'))
);

CREATE TABLE IF NOT EXISTS referalnye_svjazi_vyplat (
  zadacha_id             INTEGER NOT NULL REFERENCES referalnye_zadachi(zadacha_id) ON DELETE CASCADE,
  zhurnal_id             INTEGER NOT NULL REFERENCES zhurnal(id) ON DELETE RESTRICT,
  dejstvie_id            TEXT NOT NULL,
  summa_kopeek           INTEGER NOT NULL,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (zadacha_id, zhurnal_id),
  CHECK (typeof(summa_kopeek)='integer' AND summa_kopeek>0 AND summa_kopeek<=9007199254740991),
  CHECK (length(dejstvie_id)=36)
);

CREATE TABLE IF NOT EXISTS zaprosy_fokusa (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  operacija              TEXT,
  zapros_hesh            TEXT,
  sessija_id             INTEGER,
  identifikator          TEXT,
  itog_json              TEXT,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((operacija IS NULL AND zapros_hesh IS NULL AND sessija_id IS NULL AND identifikator IS NULL AND itog_json IS NULL) OR (operacija IN ('start','pause','resume','stop','reset') AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND sessija_id IS NOT NULL AND sessija_id>0 AND identifikator IS NOT NULL AND length(identifikator)=36 AND itog_json IS NOT NULL AND json_valid(itog_json) AND json_type(itog_json,'$.sessija') IS 'object'))
);

CREATE TABLE IF NOT EXISTS zavershenija_fokusa (
  sessija_id             INTEGER NOT NULL REFERENCES fokus_sessii(id) ON DELETE CASCADE,
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  identifikator          TEXT NOT NULL,
  nachalo                TEXT NOT NULL,
  konec                  TEXT NOT NULL,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (sessija_id),
  CHECK (length(identifikator)=36)
);

CREATE TABLE IF NOT EXISTS zaprosy_lenty (
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
  CHECK (tablica IN ('lenta')),
  CHECK (vladelec_id>0),
  CHECK (zapis_id>=0),
  CHECK (udaleno IN (0,1)),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((zapis_id=0 AND sobytie_id IS NULL AND zapros_hesh IS NULL) OR (zapis_id>0 AND sobytie_id IS NOT NULL AND sobytie_id>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE IF NOT EXISTS arhiv_strok_baz (
  stroka_id              INTEGER NOT NULL REFERENCES bazy_ljudi(id) ON DELETE CASCADE,
  arhiv                  INTEGER NOT NULL,
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id),
  kogda                  TEXT NOT NULL,
  PRIMARY KEY (stroka_id),
  CHECK (arhiv IN (0,1))
);

CREATE TABLE IF NOT EXISTS zaprosy_planov_kampanij (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  rassylka_id            INTEGER NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  plan_posle             INTEGER,
  versija_posle          INTEGER,
  obnovleno_json         TEXT,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (rassylka_id>0 AND sohraneno IN (0,1) AND udaleno IN (0,1)),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND plan_posle IS NULL AND versija_posle IS NULL AND obnovleno_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND typeof(plan_posle)='integer' AND plan_posle>0 AND typeof(versija_posle)='integer' AND versija_posle>0 AND obnovleno_json IS NOT NULL AND json_valid(obnovleno_json) AND json_type(obnovleno_json)='array'))
);

CREATE TABLE IF NOT EXISTS versii_nastroek (
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  versija                INTEGER NOT NULL,
  PRIMARY KEY (chelovek_id),
  CHECK (typeof(versija)='integer' AND versija>0)
);

CREATE TABLE IF NOT EXISTS zaprosy_nastroek (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  zapros_hesh            TEXT,
  dejstvie               TEXT NOT NULL,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  versija_posle          INTEGER,
  kontekst_posle         TEXT,
  polja_json             TEXT,
  sozdano                TEXT NOT NULL,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (dejstvie IN ('pravka','palitra_sohranit','palitra_primenit','otmena')),
  CHECK (sohraneno IN (0,1) AND udaleno IN (0,1)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND versija_posle IS NULL AND kontekst_posle IS NULL AND polja_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND typeof(versija_posle)='integer' AND versija_posle>=0 AND kontekst_posle IS NOT NULL AND length(kontekst_posle)=64 AND kontekst_posle NOT GLOB '*[^0-9a-f]*' AND polja_json IS NOT NULL AND json_valid(polja_json) AND json_type(polja_json)='array'))
);

CREATE TABLE IF NOT EXISTS zaprosy_okr (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  tablica                TEXT NOT NULL,
  vladelec_id            INTEGER NOT NULL,
  zapros_hesh            TEXT,
  zapis_id               INTEGER NOT NULL,
  sobytie_id             INTEGER,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (tablica IN ('celi','rezultaty','zamery')),
  CHECK (vladelec_id>0),
  CHECK (zapis_id>=0),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK ((zapis_id=0 AND sobytie_id IS NULL AND zapros_hesh IS NULL) OR (zapis_id>0 AND sobytie_id IS NOT NULL AND sobytie_id>0 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE IF NOT EXISTS istochniki_publikacij_zadach (
  zadacha_id             INTEGER NOT NULL REFERENCES zadachi(id) ON DELETE CASCADE,
  publikacija_id         TEXT NOT NULL,
  akkaunt_id             INTEGER NOT NULL,
  akkaunt_kontekst       TEXT NOT NULL,
  sobytie_zadachi        INTEGER,
  sobytie_akkaunta       INTEGER,
  versija                INTEGER NOT NULL DEFAULT 1,
  avtor                  INTEGER NOT NULL,
  sozdano                TEXT NOT NULL,
  ohvat_data             TEXT,
  ohvat_moment           TEXT,
  poluchen_at            TEXT,
  versija_zamera         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (zadacha_id),
  CHECK (typeof(zadacha_id)='integer' AND zadacha_id>0),
  CHECK (typeof(akkaunt_id)='integer' AND akkaunt_id>0),
  CHECK (length(akkaunt_kontekst)=64 AND akkaunt_kontekst NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof(avtor)='integer' AND avtor>0),
  CHECK (length(publikacija_id) BETWEEN 1 AND 500),
  CHECK (typeof(versija)='integer' AND versija>=1),
  CHECK (typeof(versija_zamera)='integer' AND versija_zamera>=0),
  CHECK (sobytie_zadachi IS NULL OR (typeof(sobytie_zadachi)='integer' AND sobytie_zadachi>0)),
  CHECK (sobytie_akkaunta IS NULL OR (typeof(sobytie_akkaunta)='integer' AND sobytie_akkaunta>0)),
  CHECK (ohvat_data IS NULL OR (typeof(ohvat_data)='text' AND length(ohvat_data)=10 AND date(ohvat_data) IS NOT NULL AND date(ohvat_data)=ohvat_data)),
  CHECK (ohvat_moment IS NULL OR (ohvat_data IS NOT NULL AND julianday(ohvat_moment) IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS zaprosy_istochnikov_publikacij (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  zadacha_id             INTEGER NOT NULL,
  nomer_zadachi          INTEGER NOT NULL,
  sobytie_zadachi        INTEGER,
  dejstvie               TEXT NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  itog_json              TEXT,
  do_json                TEXT,
  posle_json             TEXT,
  versija_zadachi_posle  INTEGER,
  sobytie_svjazi_posle   INTEGER,
  sozdano                TEXT NOT NULL,
  udaleno                INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (typeof(zadacha_id)='integer' AND zadacha_id>0),
  CHECK (typeof(nomer_zadachi)='integer' AND nomer_zadachi>0),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (dejstvie IN ('svjazat','otvjazat','otmenit','otmena_popytki','nastrojit')),
  CHECK (sohraneno IN (0,1) AND udaleno IN (0,1)),
  CHECK (sobytie_zadachi IS NULL OR (typeof(sobytie_zadachi)='integer' AND sobytie_zadachi>0)),
  CHECK (sobytie_svjazi_posle IS NULL OR (typeof(sobytie_svjazi_posle)='integer' AND sobytie_svjazi_posle>0)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND itog_json IS NULL AND do_json IS NULL AND posle_json IS NULL AND versija_zadachi_posle IS NULL AND sobytie_svjazi_posle IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND itog_json IS NOT NULL AND do_json IS NOT NULL AND posle_json IS NOT NULL AND json_valid(itog_json) AND json_type(itog_json)='object' AND json_valid(do_json) AND json_type(do_json)='object' AND json_valid(posle_json) AND json_type(posle_json)='object' AND typeof(versija_zadachi_posle)='integer' AND versija_zadachi_posle>=1))
);

CREATE TABLE IF NOT EXISTS zaprosy_strategii (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  dejstvie               TEXT NOT NULL,
  oblast                 TEXT NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  otmeneno               INTEGER NOT NULL DEFAULT 0,
  itog_json              TEXT,
  do_json                TEXT,
  posle_json             TEXT,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (dejstvie IN ('sozdat','pravka','udalit','porjadok')),
  CHECK (length(oblast) BETWEEN 1 AND 200),
  CHECK (sohraneno IN (0,1) AND otmeneno IN (0,1) AND NOT(sohraneno=1 AND otmeneno=1)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND itog_json IS NULL AND do_json IS NULL AND posle_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND itog_json IS NOT NULL AND do_json IS NOT NULL AND posle_json IS NOT NULL AND json_valid(itog_json) AND json_valid(do_json) AND json_valid(posle_json)))
);

CREATE TABLE IF NOT EXISTS zaprosy_konteksta_zadach (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  zadacha_id             INTEGER NOT NULL,
  nomer                  INTEGER NOT NULL,
  sobytie_id             INTEGER,
  dejstvie               TEXT NOT NULL DEFAULT 'pravka',
  roditel_kljuch_hesh    TEXT,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  do_json                TEXT,
  posle_json             TEXT,
  versija_posle          INTEGER,
  otmeneno               INTEGER NOT NULL DEFAULT 0,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (dejstvie IN ('pravka','otmena')),
  CHECK (sohraneno IN (0,1)),
  CHECK (otmeneno IN (0,1)),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof(zadacha_id)='integer' AND zadacha_id>0),
  CHECK (typeof(nomer)='integer' AND nomer>0),
  CHECK (sobytie_id IS NULL OR (typeof(sobytie_id)='integer' AND sobytie_id>0)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND do_json IS NULL AND posle_json IS NULL AND versija_posle IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND do_json IS NOT NULL AND json_valid(do_json) AND posle_json IS NOT NULL AND json_valid(posle_json) AND versija_posle IS NOT NULL AND versija_posle>0)),
  CHECK (roditel_kljuch_hesh IS NULL OR (dejstvie='otmena' AND length(roditel_kljuch_hesh)=64 AND roditel_kljuch_hesh NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE IF NOT EXISTS zaprosy_pravok_celej (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  cel_id                 INTEGER NOT NULL,
  sobytie_id             INTEGER,
  dejstvie               TEXT NOT NULL DEFAULT 'pravka',
  roditel_kljuch_hesh    TEXT,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  do_json                TEXT,
  posle_json             TEXT,
  versija_posle          INTEGER,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof(cel_id)='integer' AND cel_id>0),
  CHECK (sobytie_id IS NULL OR (typeof(sobytie_id)='integer' AND sobytie_id>0)),
  CHECK (dejstvie IN ('pravka','otmena')),
  CHECK (sohraneno IN (0,1)),
  CHECK (roditel_kljuch_hesh IS NULL OR (dejstvie='otmena' AND length(roditel_kljuch_hesh)=64 AND roditel_kljuch_hesh NOT GLOB '*[^0-9a-f]*')),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND do_json IS NULL AND posle_json IS NULL AND versija_posle IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND do_json IS NOT NULL AND json_valid(do_json) AND posle_json IS NOT NULL AND json_valid(posle_json) AND versija_posle IS NOT NULL AND typeof(versija_posle)='integer' AND versija_posle>0))
);

CREATE TABLE IF NOT EXISTS plany_periodov_okr (
  rezultat_id            INTEGER NOT NULL REFERENCES rezultaty(id) ON DELETE CASCADE,
  period_id              TEXT NOT NULL,
  plan                   TEXT NOT NULL,
  versija                INTEGER NOT NULL DEFAULT 1,
  izmenenie_id           TEXT NOT NULL,
  kto                    INTEGER NOT NULL REFERENCES ljudi(id),
  kogda                  TEXT NOT NULL,
  PRIMARY KEY (rezultat_id, period_id),
  CHECK (typeof(versija)='integer' AND versija>0),
  CHECK (typeof(plan)='text' AND length(plan) BETWEEN 1 AND 1024),
  CHECK (length(period_id)=7),
  CHECK (length(izmenenie_id)=36)
);

CREATE TABLE IF NOT EXISTS zaprosy_planov_okr (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  cel_id                 INTEGER NOT NULL,
  sobytie_id             INTEGER,
  dejstvie               TEXT NOT NULL DEFAULT 'plan',
  roditel_kljuch_hesh    TEXT,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  rezultat_json          TEXT,
  do_json                TEXT,
  posle_json             TEXT,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof(cel_id)='integer' AND cel_id>0),
  CHECK (sohraneno IN(0,1)),
  CHECK (dejstvie IN('plan','otmena')),
  CHECK (roditel_kljuch_hesh IS NULL OR (dejstvie='otmena' AND length(roditel_kljuch_hesh)=64)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND rezultat_json IS NULL AND do_json IS NULL AND posle_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND rezultat_json IS NOT NULL AND json_valid(rezultat_json) AND do_json IS NOT NULL AND json_valid(do_json) AND posle_json IS NOT NULL AND json_valid(posle_json)))
);

CREATE TABLE IF NOT EXISTS zaprosy_snimkov_planerki (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  napravlenie            TEXT NOT NULL,
  god                    INTEGER NOT NULL,
  nedelja                INTEGER NOT NULL,
  dejstvie               TEXT NOT NULL DEFAULT 'pereschitat',
  roditel_kljuch_hesh    TEXT,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  rezultat_json          TEXT,
  sobytie_id             INTEGER,
  posle_versija          TEXT,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(napravlenie) BETWEEN 1 AND 100),
  CHECK (typeof(god)='integer' AND god BETWEEN 1000 AND 9999),
  CHECK (typeof(nedelja)='integer' AND nedelja BETWEEN 1 AND 53),
  CHECK (dejstvie IN('pereschitat','otmenit')),
  CHECK (roditel_kljuch_hesh IS NULL OR (dejstvie='otmenit' AND length(roditel_kljuch_hesh)=64 AND roditel_kljuch_hesh NOT GLOB '*[^0-9a-f]*')),
  CHECK (sohraneno IN(0,1)),
  CHECK (sobytie_id IS NULL OR (typeof(sobytie_id)='integer' AND sobytie_id>0)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND rezultat_json IS NULL AND sobytie_id IS NULL AND posle_versija IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND rezultat_json IS NOT NULL AND json_valid(rezultat_json) AND posle_versija IS NOT NULL AND length(posle_versija)=64 AND posle_versija NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE IF NOT EXISTS zaprosy_arhiva (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  tablica                TEXT NOT NULL,
  obekt_id               INTEGER NOT NULL,
  dejstvie               TEXT NOT NULL DEFAULT 'arhiv',
  roditel_kljuch_hesh    TEXT,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  sobytie_sozdanija      INTEGER,
  rezultat_json          TEXT,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (tablica IN('ljudi','sotrudnichestva')),
  CHECK (typeof(obekt_id)='integer' AND obekt_id>0),
  CHECK (dejstvie IN('arhiv','otmenit')),
  CHECK (roditel_kljuch_hesh IS NULL OR (dejstvie='otmenit' AND length(roditel_kljuch_hesh)=64 AND roditel_kljuch_hesh NOT GLOB '*[^0-9a-f]*')),
  CHECK (sohraneno IN(0,1)),
  CHECK (sobytie_sozdanija IS NULL OR (typeof(sobytie_sozdanija)='integer' AND sobytie_sozdanija>0)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND rezultat_json IS NULL AND sobytie_sozdanija IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND rezultat_json IS NOT NULL AND json_valid(rezultat_json)))
);

CREATE TABLE IF NOT EXISTS zaprosy_grafika (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  chelovek_id            INTEGER NOT NULL,
  god                    INTEGER NOT NULL,
  nedelja                INTEGER NOT NULL,
  dejstvie               TEXT NOT NULL,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  rezultat_json          TEXT,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof(chelovek_id)='integer' AND chelovek_id>0),
  CHECK (typeof(god)='integer' AND god BETWEEN 1900 AND 9999),
  CHECK (typeof(nedelja)='integer' AND nedelja BETWEEN 1 AND 53),
  CHECK (dejstvie IN('sohranit','kopirovat')),
  CHECK (sohraneno IN(0,1)),
  CHECK ((sohraneno=0 AND zapros_hesh IS NULL AND rezultat_json IS NULL) OR (sohraneno=1 AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND rezultat_json IS NOT NULL AND json_valid(rezultat_json)))
);

CREATE TABLE IF NOT EXISTS dejstvija_grafika (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  chelovek_id            INTEGER NOT NULL,
  god                    INTEGER NOT NULL,
  nedelja                INTEGER NOT NULL,
  dejstvie               TEXT NOT NULL,
  roditel_kljuch_hesh    TEXT,
  zapros_hesh            TEXT,
  sohraneno              INTEGER NOT NULL DEFAULT 0,
  kontekst_vladelca      TEXT,
  server_dejstvie        TEXT,
  obratno_json           TEXT,
  rezultat_json          TEXT,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh),
  CHECK (length(kljuch_hesh)=64 AND kljuch_hesh NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof(chelovek_id)='integer' AND chelovek_id>0),
  CHECK (typeof(god)='integer' AND god BETWEEN 1900 AND 9999),
  CHECK (typeof(nedelja)='integer' AND nedelja BETWEEN 1 AND 53),
  CHECK (dejstvie IN('sohranit','kopirovat','otmenit')),
  CHECK (sohraneno IN(0,1)),
  CHECK (roditel_kljuch_hesh IS NULL OR (dejstvie='otmenit' AND length(roditel_kljuch_hesh)=64 AND roditel_kljuch_hesh NOT GLOB '*[^0-9a-f]*')),
  CHECK ((sohraneno=0 AND dejstvie='otmenit' AND zapros_hesh IS NULL AND obratno_json IS NULL AND rezultat_json IS NULL AND kontekst_vladelca IS NULL AND server_dejstvie IS NULL) OR (sohraneno=1 AND server_dejstvie IS NOT NULL AND length(server_dejstvie)=36 AND rezultat_json IS NOT NULL AND json_valid(rezultat_json) AND ((dejstvie IN('sohranit','kopirovat') AND roditel_kljuch_hesh IS NULL AND kontekst_vladelca IS NOT NULL AND length(kontekst_vladelca)=64 AND obratno_json IS NOT NULL AND json_valid(obratno_json)) OR (dejstvie='otmenit' AND roditel_kljuch_hesh IS NOT NULL AND zapros_hesh IS NOT NULL AND length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*' AND obratno_json IS NULL))))
);

CREATE TABLE IF NOT EXISTS otlozhennye_insajty (
  chelovek_id            INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch                 TEXT NOT NULL,
  otlozhen_do            TEXT NOT NULL,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (chelovek_id, kljuch)
);

CREATE TABLE IF NOT EXISTS zaprosy_insajtov (
  avtor                  INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
  kljuch_hesh            TEXT NOT NULL,
  insajt_kljuch          TEXT NOT NULL,
  otlozhen_do            TEXT,
  sozdano                TEXT NOT NULL,
  PRIMARY KEY (avtor, kljuch_hesh)
);
