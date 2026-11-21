                                                        
  
                                                              
                                                                  
                                                                     
                                                                 
                                                                      

CREATE TABLE nastrojki_otkat (
  chelovek_id            INTEGER,
  panel_ljudej           INTEGER,
  vid_zadach             TEXT,
  bot_vkljuchen          INTEGER,
  bot_chto               TEXT,
  tihie_chasy            INTEGER,
  pokazannye_podskazki   TEXT,
  pokazyvat_v_rejtinge_fokusa INTEGER,
  PRIMARY KEY (chelovek_id)
);

INSERT INTO nastrojki_otkat
SELECT chelovek_id, panel_ljudej, vid_zadach, bot_vkljuchen, bot_chto,
       tihie_chasy, pokazannye_podskazki, pokazyvat_v_rejtinge_fokusa
  FROM nastrojki;

DROP TABLE nastrojki;
ALTER TABLE nastrojki_otkat RENAME TO nastrojki;
