                                                               
                                                                  
                                              
CREATE TRIGGER IF NOT EXISTS proekt_arhiv_tolko_zavershennyj
BEFORE UPDATE OF arhiv ON proekty
FOR EACH ROW WHEN NEW.arhiv = 1
  AND coalesce(NEW.status, OLD.status) = 'idet'
BEGIN
  SELECT raise(ABORT, 'в архив убирают завершённый проект, этот идёт');
END;
