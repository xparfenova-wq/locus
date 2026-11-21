                                                                                 
CREATE TABLE IF NOT EXISTS arhiv_strok_baz (
 stroka_id INTEGER PRIMARY KEY REFERENCES bazy_ljudi(id) ON DELETE CASCADE,
 arhiv INTEGER NOT NULL,
 avtor INTEGER NOT NULL REFERENCES ljudi(id),
 kogda TEXT NOT NULL,
 CHECK (arhiv IN (0,1))
);
