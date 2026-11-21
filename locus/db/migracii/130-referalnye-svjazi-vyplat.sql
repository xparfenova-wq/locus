CREATE TABLE IF NOT EXISTS referalnye_svjazi_vyplat (
 zadacha_id INTEGER NOT NULL REFERENCES referalnye_zadachi(zadacha_id) ON DELETE CASCADE,
 zhurnal_id INTEGER NOT NULL REFERENCES zhurnal(id) ON DELETE RESTRICT,
 dejstvie_id TEXT NOT NULL,
 summa_kopeek INTEGER NOT NULL,
 sozdano TEXT NOT NULL,
 PRIMARY KEY(zadacha_id,zhurnal_id),
 CHECK(typeof(summa_kopeek)='integer' AND summa_kopeek>0 AND summa_kopeek<=9007199254740991),
 CHECK(length(dejstvie_id)=36)
);
