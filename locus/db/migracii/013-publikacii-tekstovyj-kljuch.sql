                                                                     
                                                                             
                                                                          
                                                                      
                         
  
                                                                       
                                                                     
                                                                    
                                                                    
                                              
  
                                                               

ALTER TABLE publikacii RENAME TO publikacii_staraja;

CREATE TABLE publikacii (
  id                     TEXT PRIMARY KEY,
  akkaunt_id             INTEGER,
  publikacija_id         INTEGER,
  ssylka                 TEXT,
  data_vyhoda            TEXT,
  format                 TEXT,
  zagolovok              TEXT,
  prosmotrov             INTEGER,
  lajkov                 INTEGER,
  kommentariev           INTEGER,
  peresylok              INTEGER,
  sohranenij             INTEGER,
  ohvat                  INTEGER,
  extra                  TEXT
);
                                                                       
                                                    
INSERT INTO publikacii (id, akkaunt_id, publikacija_id, ssylka, data_vyhoda,
                        format, zagolovok, prosmotrov, lajkov, kommentariev,
                        peresylok, sohranenij, ohvat, extra)
SELECT COALESCE(akkaunt_id, 0) || '_' || COALESCE(publikacija_id, id),
       akkaunt_id, publikacija_id, ssylka, data_vyhoda,
       format, zagolovok, prosmotrov, lajkov, kommentariev,
       peresylok, sohranenij, ohvat, extra
FROM publikacii_staraja;

DROP TABLE publikacii_staraja;
