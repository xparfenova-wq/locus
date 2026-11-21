                                                                    
CREATE TABLE IF NOT EXISTS otmeny_kontaktov (
 token_hesh TEXT NOT NULL,
 avtor INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 do_ms INTEGER NOT NULL,
 udaleno_id INTEGER NOT NULL REFERENCES zhurnal(id) ON DELETE CASCADE,
 slepok TEXT NOT NULL,
 osnovnye TEXT NOT NULL,
 PRIMARY KEY (token_hesh),
 CHECK (length(token_hesh)=64 AND token_hesh NOT GLOB '*[^0-9a-f]*'),
 CHECK (do_ms>0),
 CHECK (json_valid(slepok)),
 CHECK (json_valid(osnovnye))
);
CREATE INDEX IF NOT EXISTS idx_otmeny_kontaktov_srok ON otmeny_kontaktov(do_ms);
