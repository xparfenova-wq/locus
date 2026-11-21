
CREATE UNIQUE INDEX IF NOT EXISTS skrytye_plashki_kljuch
  ON skrytye_plashki (chelovek_id, o_kom_id);

CREATE TRIGGER IF NOT EXISTS zadachi_status_nabor_vstavka
BEFORE INSERT ON zadachi
FOR EACH ROW WHEN NEW.status IS NOT NULL
  AND NEW.status NOT IN ('v_plane','v_processe','na_soglasovanii','sdelano','kogda_nibud')
BEGIN
  SELECT raise(ABORT, 'status: одно из v_plane, v_processe, na_soglasovanii, sdelano, kogda_nibud');
END;

CREATE TRIGGER IF NOT EXISTS zadachi_status_nabor_pravka
BEFORE UPDATE OF status ON zadachi
FOR EACH ROW WHEN NEW.status IS NOT NULL
  AND NEW.status NOT IN ('v_plane','v_processe','na_soglasovanii','sdelano','kogda_nibud')
BEGIN
  SELECT raise(ABORT, 'status: одно из v_plane, v_processe, na_soglasovanii, sdelano, kogda_nibud');
END;

CREATE TRIGGER IF NOT EXISTS sotr_rol_nabor
BEFORE INSERT ON sotrudnichestva
FOR EACH ROW WHEN NEW.rol IS NOT NULL AND NEW.rol NOT IN ('lid','klient','referal')
BEGIN
  SELECT raise(ABORT, 'rol: lid, klient или referal');
END;

CREATE TRIGGER IF NOT EXISTS proekty_status_nabor
BEFORE INSERT ON proekty
FOR EACH ROW WHEN NEW.status IS NOT NULL
  AND NEW.status NOT IN ('idet','pauza','zavershen')
BEGIN
  SELECT raise(ABORT, 'status: idet, pauza или zavershen');
END;

CREATE TRIGGER IF NOT EXISTS zhurnal_data_odnim_vidom
AFTER INSERT ON zhurnal FOR EACH ROW WHEN NEW.kogda LIKE '%T%'
BEGIN
  UPDATE zhurnal SET kogda = replace(substr(NEW.kogda, 1, 19), 'T', ' ')
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS zadachi_data_odnim_vidom
AFTER INSERT ON zadachi FOR EACH ROW WHEN NEW.sozdano LIKE '%T%'
BEGIN
  UPDATE zadachi SET sozdano = replace(substr(NEW.sozdano, 1, 19), 'T', ' ')
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS fokus_data_odnim_vidom
AFTER INSERT ON fokus_sessii FOR EACH ROW WHEN NEW.nachalo LIKE '%T%'
BEGIN
  UPDATE fokus_sessii SET nachalo = replace(substr(NEW.nachalo, 1, 19), 'T', ' ')
    WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_sostojanija_den ON sostojanija (den);

CREATE INDEX IF NOT EXISTS idx_zadachi_sprint        ON zadachi (sprint);

CREATE INDEX IF NOT EXISTS idx_zadachi_otvetstvennyj ON zadachi (otvetstvennyj);

CREATE INDEX IF NOT EXISTS idx_zadachi_napravlenie   ON zadachi (napravlenie);

CREATE INDEX IF NOT EXISTS idx_zadachi_status        ON zadachi (status);

CREATE INDEX IF NOT EXISTS idx_zadachi_roditel       ON zadachi (roditel_id);

CREATE INDEX IF NOT EXISTS idx_sotr_chelovek    ON sotrudnichestva (chelovek_id);

CREATE INDEX IF NOT EXISTS idx_sotr_napravlenie ON sotrudnichestva (napravlenie);

CREATE INDEX IF NOT EXISTS idx_sotr_rol         ON sotrudnichestva (rol);

CREATE INDEX IF NOT EXISTS idx_zhurnal_obekt ON zhurnal (obekt, obekt_id);

CREATE INDEX IF NOT EXISTS idx_zhurnal_kogda ON zhurnal (kogda);

CREATE INDEX IF NOT EXISTS idx_rassylka_ljudi_rassylka ON rassylka_ljudi (rassylka_id);

CREATE INDEX IF NOT EXISTS idx_rassylka_ljudi_chelovek ON rassylka_ljudi (chelovek_id);

CREATE INDEX IF NOT EXISTS idx_rassylka_ljudi_status   ON rassylka_ljudi (status);

CREATE INDEX IF NOT EXISTS idx_kontakty_znachenie_norm ON kontakty (znachenie_norm);

CREATE INDEX IF NOT EXISTS idx_zadachi_sotrudnichestvo
  ON zadachi (sotrudnichestvo_id);

CREATE UNIQUE INDEX IF NOT EXISTS bazy_statusy_porjadok
  ON bazy_statusy (baza_id, porjadok);

CREATE UNIQUE INDEX IF NOT EXISTS bazy_ljudi_odin
  ON bazy_ljudi (baza_id, kto);

CREATE INDEX IF NOT EXISTS bazy_ljudi_status
  ON bazy_ljudi (baza_id, status_id);

CREATE INDEX IF NOT EXISTS idx_zadachi_rezultat ON zadachi(rezultat_id);

CREATE INDEX IF NOT EXISTS idx_rassylka_ljudi_zadacha
  ON rassylka_ljudi(zadacha_id);

CREATE UNIQUE INDEX IF NOT EXISTS vhod_login_unique ON vhod(login);

CREATE INDEX IF NOT EXISTS zadachi_iso_sprint ON zadachi(god_sprinta,sprint);

CREATE TRIGGER IF NOT EXISTS zadachi_god_sprinta_insert
AFTER INSERT ON zadachi
WHEN NEW.sprint IS NOT NULL AND NEW.povtorjaetsja IS NOT 1 AND NEW.god_sprinta IS NULL
BEGIN
  UPDATE zadachi SET god_sprinta=CAST(strftime('%G',CASE
    WHEN NEW.srok IS NOT NULL AND CAST(strftime('%V',NEW.srok) AS INTEGER)=NEW.sprint THEN NEW.srok
    ELSE COALESCE(datetime(NEW.sozdano,'+3 hours'),datetime('now','+3 hours')) END) AS INTEGER)
  WHERE id=NEW.id;
END;

CREATE INDEX IF NOT EXISTS grafik_god_nedelja ON grafik(god,nedelja,chelovek_id);

CREATE UNIQUE INDEX IF NOT EXISTS grafik_odin_den ON grafik(chelovek_id,god,nedelja,den);

CREATE INDEX IF NOT EXISTS idx_sotr_istochnik_rassylka ON sotrudnichestva(rassylka_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sbor_kljuch ON zapuski_sbora(kljuch_zapuska);

CREATE TRIGGER IF NOT EXISTS schetchik_ankety_vstavka AFTER INSERT ON anketa
BEGIN
  INSERT INTO schetchiki_anket(chelovek_id,poslednjaja_versija)
  VALUES(NEW.chelovek_id,max(1,COALESCE(NEW.versija,1)))
  ON CONFLICT(chelovek_id) DO UPDATE SET poslednjaja_versija=max(schetchiki_anket.poslednjaja_versija,excluded.poslednjaja_versija);
END;

CREATE TRIGGER IF NOT EXISTS schetchik_ankety_pravka AFTER UPDATE OF versija ON anketa
BEGIN
  INSERT INTO schetchiki_anket(chelovek_id,poslednjaja_versija)
  VALUES(NEW.chelovek_id,max(1,COALESCE(NEW.versija,1)))
  ON CONFLICT(chelovek_id) DO UPDATE SET poslednjaja_versija=max(schetchiki_anket.poslednjaja_versija,excluded.poslednjaja_versija);
END;

CREATE INDEX IF NOT EXISTS kommentarii_zadacha_pozicija ON kommentarii(zadacha_id,id);

CREATE INDEX IF NOT EXISTS uchastniki_cheloveka ON zadacha_uchastniki(chelovek_id,zadacha_id);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_kontakty_chelovek_tip_norm
ON kontakty(chelovek_id, tip, znachenie_norm)
WHERE znachenie_norm IS NOT NULL AND znachenie_norm <> '';

CREATE INDEX IF NOT EXISTS idx_otmeny_kontaktov_srok ON otmeny_kontaktov(do_ms);

CREATE INDEX IF NOT EXISTS idx_otmeny_kontaktov_zapros ON otmeny_kontaktov(avtor,zapros_hesh);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kontakty_odin_osnovnoj
ON kontakty(chelovek_id,tip) WHERE osnovnoj=1;

CREATE INDEX IF NOT EXISTS idx_zhurnal_srez_chelovek
 ON zhurnal(json_extract(srez,'$.chelovek_id')) WHERE srez IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zhurnal_srez_chelovek_do
 ON zhurnal(json_extract(srez,'$.chelovek_id_do')) WHERE srez IS NOT NULL;

CREATE INDEX IF NOT EXISTS materialy_fajl ON materialy(fajl);

CREATE INDEX IF NOT EXISTS dokumenty_fajl ON dokumenty(fajl);

CREATE TRIGGER IF NOT EXISTS zaprosy_lenty_delete AFTER DELETE ON lenta BEGIN UPDATE zaprosy_lenty SET udaleno=1 WHERE zapis_id=OLD.id;END;

CREATE TRIGGER IF NOT EXISTS zaprosy_kampanij_delete AFTER DELETE ON rassylki BEGIN UPDATE zaprosy_kampanij SET udaleno=1 WHERE zapis_id=OLD.id;END;

CREATE TRIGGER IF NOT EXISTS zaprosy_baz_bazy_delete AFTER DELETE ON bazy BEGIN UPDATE zaprosy_baz SET udaleno=1 WHERE json_extract(itog,'$.vid')='baza' AND json_extract(itog,'$.id')=OLD.id;END;

CREATE TRIGGER IF NOT EXISTS zaprosy_baz_bazy_ljudi_delete AFTER DELETE ON bazy_ljudi BEGIN UPDATE zaprosy_baz SET udaleno=1 WHERE json_extract(itog,'$.vid')='stroka' AND json_extract(itog,'$.id')=OLD.id;END;

CREATE TRIGGER IF NOT EXISTS zaprosy_baz_bazy_statusy_delete AFTER DELETE ON bazy_statusy BEGIN UPDATE zaprosy_baz SET udaleno=1 WHERE json_extract(itog,'$.vid')='status' AND json_extract(itog,'$.id')=OLD.id;END;

CREATE TRIGGER IF NOT EXISTS vklady_baz_materialy_delete AFTER DELETE ON materialy BEGIN DELETE FROM vklady_baz WHERE tablica='materialy' AND material_id=OLD.id;END;

CREATE TRIGGER IF NOT EXISTS vklady_baz_dokumenty_delete AFTER DELETE ON dokumenty BEGIN DELETE FROM vklady_baz WHERE tablica='dokumenty' AND material_id=OLD.id;END;

CREATE TRIGGER IF NOT EXISTS vklady_baz_target_insert BEFORE INSERT ON vklady_baz WHEN (NEW.tablica='materialy' AND NOT EXISTS(SELECT 1 FROM materialy WHERE id=NEW.material_id)) OR (NEW.tablica='dokumenty' AND NOT EXISTS(SELECT 1 FROM dokumenty WHERE id=NEW.material_id)) BEGIN SELECT RAISE(ABORT,'base attachment source does not exist');END;

CREATE TRIGGER IF NOT EXISTS zaprosy_planov_kampanij_delete AFTER DELETE ON rassylki BEGIN
 UPDATE zaprosy_planov_kampanij SET udaleno=1 WHERE rassylka_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS versii_nastroek_insert AFTER INSERT ON nastrojki BEGIN
 INSERT INTO versii_nastroek(chelovek_id,versija)VALUES(NEW.chelovek_id,1)ON CONFLICT(chelovek_id)DO UPDATE SET versija=versija+1;
END;

CREATE TRIGGER IF NOT EXISTS versii_nastroek_update AFTER UPDATE ON nastrojki BEGIN
 INSERT INTO versii_nastroek(chelovek_id,versija)VALUES(NEW.chelovek_id,1)ON CONFLICT(chelovek_id)DO UPDATE SET versija=versija+1;
END;

CREATE TRIGGER IF NOT EXISTS versii_nastroek_delete AFTER DELETE ON nastrojki BEGIN
 INSERT INTO versii_nastroek(chelovek_id,versija)VALUES(OLD.chelovek_id,1)ON CONFLICT(chelovek_id)DO UPDATE SET versija=versija+1;
 UPDATE zaprosy_nastroek SET udaleno=1 WHERE avtor=OLD.chelovek_id AND sohraneno=1;
END;

CREATE INDEX IF NOT EXISTS istochniki_publikacij_zadach_post ON istochniki_publikacij_zadach(publikacija_id,akkaunt_id);

CREATE INDEX IF NOT EXISTS zaprosy_istochnikov_publikacij_zadacha ON zaprosy_istochnikov_publikacij(zadacha_id);

CREATE TRIGGER IF NOT EXISTS zaprosy_istochnikov_publikacij_udalenie AFTER DELETE ON zadachi BEGIN
 UPDATE zaprosy_istochnikov_publikacij SET udaleno=1 WHERE zadacha_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS nastrojki_sistemy_singleton BEFORE INSERT ON nastrojki_sistemy WHEN EXISTS(SELECT 1 FROM nastrojki_sistemy) BEGIN
 SELECT RAISE(ABORT,'only one shared settings row is permitted');
END;

CREATE TRIGGER IF NOT EXISTS versija_nastroek_sistemy_insert AFTER INSERT ON nastrojki_sistemy BEGIN
 INSERT INTO versija_nastroek_sistemy(id,versija)VALUES(1,1)ON CONFLICT(id)DO UPDATE SET versija=versija+1;
END;

CREATE TRIGGER IF NOT EXISTS versija_nastroek_sistemy_update AFTER UPDATE ON nastrojki_sistemy BEGIN
 INSERT INTO versija_nastroek_sistemy(id,versija)VALUES(1,1)ON CONFLICT(id)DO UPDATE SET versija=versija+1;
END;

CREATE TRIGGER IF NOT EXISTS versija_nastroek_sistemy_delete AFTER DELETE ON nastrojki_sistemy BEGIN
 INSERT INTO versija_nastroek_sistemy(id,versija)VALUES(1,1)ON CONFLICT(id)DO UPDATE SET versija=versija+1;
END;

