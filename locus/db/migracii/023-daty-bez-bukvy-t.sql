                                                           
                                                                
                                                         
UPDATE zhurnal SET kogda = replace(substr(kogda, 1, 19), 'T', ' ')
  WHERE kogda LIKE '%T%';
UPDATE fokus_sessii SET nachalo = replace(substr(nachalo, 1, 19), 'T', ' ')
  WHERE nachalo LIKE '%T%';
UPDATE fokus_sessii SET konec = replace(substr(konec, 1, 19), 'T', ' ')
  WHERE konec LIKE '%T%';
UPDATE zadachi SET sozdano = replace(substr(sozdano, 1, 19), 'T', ' ')
  WHERE sozdano LIKE '%T%';
UPDATE ljudi SET sozdano = replace(substr(sozdano, 1, 19), 'T', ' ')
  WHERE sozdano LIKE '%T%';
                                                   
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
