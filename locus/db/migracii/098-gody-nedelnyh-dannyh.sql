                                                                      
                                                                       
ALTER TABLE grafik ADD COLUMN god INTEGER;
                                                                         
                                                                        
                                                            
UPDATE grafik SET god=2026 WHERE nedelja IN (43,44);
CREATE TEMP TABLE proverka_goda_grafika (ostalos INTEGER CHECK(ostalos=0));
INSERT INTO proverka_goda_grafika SELECT count(*) FROM grafik WHERE god IS NULL;
DROP TABLE proverka_goda_grafika;
CREATE INDEX grafik_god_nedelja ON grafik(god,nedelja,chelovek_id);
CREATE UNIQUE INDEX grafik_odin_den ON grafik(chelovek_id,god,nedelja,den);

ALTER TABLE lenta ADD COLUMN god_sprinta INTEGER;
UPDATE lenta SET god_sprinta=CAST(strftime('%G',datetime(sozdano,'+3 hours')) AS INTEGER)
WHERE sprint IS NOT NULL;

CREATE TABLE snimki_planerki_s_godom (
  napravlenie TEXT, nedelja INTEGER, god INTEGER, dannye TEXT,
  sozdano TEXT, pereschitan TEXT,
  PRIMARY KEY (napravlenie,god,nedelja)
);
INSERT INTO snimki_planerki_s_godom
  (napravlenie,nedelja,god,dannye,sozdano,pereschitan)
SELECT napravlenie,nedelja,
  COALESCE(CAST(json_extract(CASE WHEN json_valid(dannye) THEN dannye ELSE '{}' END,'$.god') AS INTEGER),
    CAST(strftime('%G',datetime(sozdano,'+3 hours')) AS INTEGER)),
  dannye,sozdano,pereschitan FROM snimki_planerki;
DROP TABLE snimki_planerki;
ALTER TABLE snimki_planerki_s_godom RENAME TO snimki_planerki;

CREATE TABLE rassylka_plan_s_godom (
  id INTEGER, rassylka_id INTEGER, nedelja INTEGER, god INTEGER,
  plan_soobshenij INTEGER, plan_otvetov INTEGER, plan_soglasij INTEGER,
  plan_publikacij INTEGER, rabochih_dnej INTEGER, po_ljudjam TEXT,
  PRIMARY KEY (rassylka_id,god,nedelja)
);
                                                                  
                                                                         
CREATE TEMP TABLE proverka_starogo_plana (stroki INTEGER CHECK(stroki=0));
INSERT INTO proverka_starogo_plana SELECT count(*) FROM rassylka_plan;
DROP TABLE proverka_starogo_plana;
INSERT INTO rassylka_plan_s_godom
  (id,rassylka_id,nedelja,plan_soobshenij,plan_otvetov,plan_soglasij,
   plan_publikacij,rabochih_dnej,po_ljudjam)
SELECT id,rassylka_id,nedelja,plan_soobshenij,plan_otvetov,plan_soglasij,
  plan_publikacij,rabochih_dnej,po_ljudjam FROM rassylka_plan;
DROP TABLE rassylka_plan;
ALTER TABLE rassylka_plan_s_godom RENAME TO rassylka_plan;
