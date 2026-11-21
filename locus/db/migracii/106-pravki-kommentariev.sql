PRAGMA foreign_keys=OFF;
                                                                           
CREATE TEMP TABLE kommentarii_poslednij_id(seq INTEGER NOT NULL);
INSERT INTO kommentarii_poslednij_id(seq)
SELECT COALESCE(max(seq),0) FROM sqlite_sequence WHERE name='kommentarii';

CREATE TABLE kommentarii_novye (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zadacha_id INTEGER NOT NULL REFERENCES zadachi(id),
  chelovek_id INTEGER NOT NULL REFERENCES ljudi(id),
  tekst TEXT NOT NULL,
  sozdano TEXT NOT NULL,
  izmeneno TEXT,
  upominanija TEXT NOT NULL DEFAULT '[]',
  versija INTEGER NOT NULL DEFAULT 1,
  CHECK (typeof(tekst)='text' AND length(tekst)<=5000 AND length(trim(tekst,char(9)||char(10)||char(13)||' '))>0),
  CHECK (json_valid(upominanija) AND json_type(upominanija)='array'),
  CHECK (typeof(versija)='integer' AND versija>=1)
);
                                                                               
INSERT INTO kommentarii_novye(id,zadacha_id,chelovek_id,tekst,sozdano)
SELECT id,zadacha_id,chelovek_id,tekst,sozdano FROM kommentarii ORDER BY id;
DROP TABLE kommentarii;
ALTER TABLE kommentarii_novye RENAME TO kommentarii;
UPDATE sqlite_sequence SET seq=max(seq,(SELECT seq FROM kommentarii_poslednij_id)) WHERE name='kommentarii';
INSERT INTO sqlite_sequence(name,seq)
SELECT 'kommentarii',seq FROM kommentarii_poslednij_id
WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name='kommentarii');
DROP TABLE kommentarii_poslednij_id;

CREATE INDEX IF NOT EXISTS kommentarii_zadacha_pozicija ON kommentarii(zadacha_id,id);
PRAGMA foreign_keys=ON;
