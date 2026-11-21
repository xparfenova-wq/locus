                                                                     
                                                                     
                                                                       
                                                         
  
                                                                         
                                                                      
                                                                         
                                                                          
  
                                                                           
                                                                       

ALTER TABLE akkaunty RENAME TO akkaunty_staraja;

CREATE TABLE akkaunty (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  ploshadka              TEXT,
  nazvanie               TEXT,
  ssylka                 TEXT,
  zagolovok              TEXT,
  napravlenie            TEXT,
  proekt_id              INTEGER,
  vladelec               INTEGER,
  uroven                 TEXT,
  zametka                TEXT,
  aktiven                INTEGER,
  udalen                 INTEGER,
  porjadok               INTEGER
);

INSERT INTO akkaunty (id, ploshadka, nazvanie, ssylka, zagolovok, napravlenie,
                      proekt_id, vladelec, uroven, zametka, aktiven, udalen,
                      porjadok)
SELECT id, ploshadka, nazvanie, ssylka, zagolovok, napravlenie,
       proekt_id, vladelec, uroven, zametka,
       CASE WHEN CAST(aktiven AS REAL) = 1 THEN 1 ELSE 0 END,
       CASE WHEN CAST(udalen AS REAL) = 1 THEN 1 ELSE 0 END,
       porjadok
FROM akkaunty_staraja;

DROP TABLE akkaunty_staraja;

ALTER TABLE zapuski_sbora RENAME TO zapuski_sbora_staraja;

CREATE TABLE zapuski_sbora (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  kogda                  TEXT,
  akkaunt_id             INTEGER,
  uroven                 TEXT,
  uspeh                  INTEGER,
  poluchen               INTEGER,
  primechanie            TEXT
);

INSERT INTO zapuski_sbora (id, kogda, akkaunt_id, uroven, uspeh, poluchen,
                           primechanie)
SELECT id, kogda, akkaunt_id, uroven,
       CASE WHEN CAST(uspeh AS REAL) = 1 THEN 1 ELSE 0 END,
       poluchen, primechanie
FROM zapuski_sbora_staraja;

DROP TABLE zapuski_sbora_staraja;
