                                                                           
                                                                                 
DROP TABLE zaprosy_platezhej;
DROP TRIGGER IF EXISTS versii_platezhi_insert;
DROP TRIGGER IF EXISTS versii_platezhi_update;
DROP TRIGGER IF EXISTS versii_platezhi_delete;
DROP TRIGGER IF EXISTS versii_akkaunty_insert;
DROP TRIGGER IF EXISTS versii_akkaunty_update;
DROP TRIGGER IF EXISTS versii_akkaunty_delete;
DELETE FROM versii_polej WHERE tablica IN ('platezhi','akkaunty');
ALTER TABLE platezhi DROP COLUMN versija;
ALTER TABLE akkaunty DROP COLUMN versija;
