PRAGMA foreign_keys=OFF;
CREATE TEMP TABLE uvedomlenija_poslednij_id(seq INTEGER NOT NULL);
INSERT INTO uvedomlenija_poslednij_id SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name='uvedomlenija'),0);
CREATE TABLE uvedomlenija_novye (
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
                                                                         
                                                                         
INSERT INTO uvedomlenija_novye(id,chelovek_id,tip,potok,zadacha_id,tekst,prochitano,sozdano,zadacha_id_istochnika)
SELECT u.id,u.chelovek_id,u.tip,u.potok,
 CASE WHEN z.id IS NOT NULL THEN u.zadacha_id ELSE NULL END,
 u.tekst,u.prochitano,u.sozdano,
 CASE WHEN u.zadacha_id IS NOT NULL AND z.id IS NULL THEN u.zadacha_id ELSE NULL END
FROM uvedomlenija u LEFT JOIN zadachi z ON z.id=u.zadacha_id ORDER BY u.id;
DROP TABLE uvedomlenija;
ALTER TABLE uvedomlenija_novye RENAME TO uvedomlenija;
UPDATE sqlite_sequence SET seq=max(seq,(SELECT seq FROM uvedomlenija_poslednij_id)) WHERE name='uvedomlenija';
INSERT INTO sqlite_sequence(name,seq) SELECT 'uvedomlenija',seq FROM uvedomlenija_poslednij_id WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='uvedomlenija');
DROP TABLE uvedomlenija_poslednij_id;
CREATE INDEX IF NOT EXISTS uvedomlenija_cheloveka ON uvedomlenija(chelovek_id,potok,prochitano,sozdano DESC,id DESC);
CREATE INDEX IF NOT EXISTS uvedomlenija_zadachi ON uvedomlenija(zadacha_id,tip,chelovek_id,sozdano);
CREATE TRIGGER IF NOT EXISTS uvedomlenija_zadacha_udalena BEFORE DELETE ON zadachi
BEGIN
 UPDATE uvedomlenija SET ssylka_udalena='zadacha' WHERE zadacha_id=OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS uvedomlenija_proekt_udalen BEFORE DELETE ON proekty
BEGIN
 UPDATE uvedomlenija SET ssylka_udalena='proekt' WHERE proekt_id=OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS uvedomlenija_novoe_udaleno BEFORE DELETE ON lenta
BEGIN
 UPDATE uvedomlenija SET ssylka_udalena='novoe' WHERE lenta_id=OLD.id;
END;
PRAGMA foreign_keys=ON;
