CREATE TABLE IF NOT EXISTS zavershenija_fokusa (
 sessija_id INTEGER NOT NULL REFERENCES fokus_sessii(id) ON DELETE CASCADE,
 chelovek_id INTEGER NOT NULL REFERENCES ljudi(id) ON DELETE CASCADE,
 identifikator TEXT NOT NULL,
 nachalo TEXT NOT NULL,
 konec TEXT NOT NULL,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(sessija_id),
 CHECK(length(identifikator)=36)
);
