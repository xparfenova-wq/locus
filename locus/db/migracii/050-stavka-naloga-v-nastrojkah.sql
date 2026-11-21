                                                       
  
                                                                          
                                                                    
                                                                        
                                                                
                                                
  
                                                                            
                                                                      
                                              

INSERT INTO nastrojki_sistemy (stavka_naloga, chasovoj_pojas, nedel_v_okne,
                               porog_peregruza, dnej_bez_obschenija_porog)
SELECT 6, 'Europe/Moscow', 8, NULL, 14
WHERE NOT EXISTS (SELECT 1 FROM nastrojki_sistemy);

UPDATE nastrojki_sistemy SET stavka_naloga = 6 WHERE stavka_naloga IS NULL;
                                                                         
                                                                          
                                                             
                        
