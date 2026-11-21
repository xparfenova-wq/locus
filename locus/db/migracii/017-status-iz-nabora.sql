                                                                
                                                                     
                                         
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
