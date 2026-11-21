ALTER TABLE napravlenija ADD COLUMN versija INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ljudi ADD COLUMN vozvrat_s TEXT;
                                                             
DROP TRIGGER IF EXISTS proekt_arhiv_tolko_zavershennyj;
