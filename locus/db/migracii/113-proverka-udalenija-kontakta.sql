                                                                       
                                                                             
                                                                                
ALTER TABLE otmeny_kontaktov RENAME TO otmeny_kontaktov_do113;
CREATE TABLE otmeny_kontaktov (
 token_hesh TEXT NOT NULL,
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 do_ms INTEGER NOT NULL,
 udaleno_id INTEGER NOT NULL REFERENCES zhurnal(id) ON DELETE CASCADE,
 slepok TEXT NOT NULL,
 osnovnye TEXT NOT NULL,
 zapros_hesh TEXT,
 PRIMARY KEY (token_hesh),
 CHECK (length(token_hesh)=64 AND token_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK (do_ms>0),
 CHECK (json_valid(slepok)),
 CHECK (json_valid(osnovnye)),
 CHECK (zapros_hesh IS NULL OR (length(zapros_hesh)=64 AND zapros_hesh NOT GLOB '*[^0-9a-f]*'))
);
INSERT INTO otmeny_kontaktov(rowid,token_hesh,avtor,do_ms,udaleno_id,slepok,osnovnye)
SELECT rowid,token_hesh,avtor,do_ms,udaleno_id,slepok,osnovnye FROM otmeny_kontaktov_do113;
DROP TABLE otmeny_kontaktov_do113;
CREATE INDEX IF NOT EXISTS idx_otmeny_kontaktov_srok ON otmeny_kontaktov(do_ms);
CREATE INDEX IF NOT EXISTS idx_otmeny_kontaktov_zapros ON otmeny_kontaktov(avtor,zapros_hesh);
