                                                                 
  
                                                                      
                                                                     
                                                                  
  
                                                       
                                                               
                                                                         
                                                 
                                          
                                                
  
                                                                       
                                                                     

UPDATE nastrojki
   SET pokazyvat_v_rejtinge_fokusa = 0
 WHERE pokazyvat_v_rejtinge_fokusa IS NULL;
                                                                         
                                                                  
                                                   
CREATE TABLE nastrojki_novye (
  chelovek_id            INTEGER,
  panel_ljudej           INTEGER,
  vid_zadach             TEXT,
  bot_vkljuchen          INTEGER,
  bot_chto               TEXT,
  tihie_chasy            INTEGER,
  pokazannye_podskazki   TEXT,
  pokazyvat_v_rejtinge_fokusa INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chelovek_id)
);

INSERT INTO nastrojki_novye (
  chelovek_id, panel_ljudej, vid_zadach, bot_vkljuchen, bot_chto,
  tihie_chasy, pokazannye_podskazki, pokazyvat_v_rejtinge_fokusa)
SELECT chelovek_id, panel_ljudej, vid_zadach, bot_vkljuchen, bot_chto,
       tihie_chasy, pokazannye_podskazki,
       coalesce(pokazyvat_v_rejtinge_fokusa, 0)
  FROM nastrojki;

DROP TABLE nastrojki;
ALTER TABLE nastrojki_novye RENAME TO nastrojki;
                                                             
                          
