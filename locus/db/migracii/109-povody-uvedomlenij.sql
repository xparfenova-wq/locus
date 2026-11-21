                                                                             
                                                                            
CREATE TABLE IF NOT EXISTS povody_uvedomlenij (
 kljuch TEXT NOT NULL,
 sozdano TEXT NOT NULL DEFAULT (datetime('now')),
 uvedomlenie_id INTEGER UNIQUE REFERENCES uvedomlenija(id) ON DELETE SET NULL,
 PRIMARY KEY (kljuch),
 CHECK (length(kljuch) BETWEEN 1 AND 160),
 CHECK (datetime(sozdano) IS NOT NULL)
);
