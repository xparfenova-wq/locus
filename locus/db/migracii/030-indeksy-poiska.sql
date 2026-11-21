                                                                          
                                                                       
                                                     
  
                                                                          
                                                                            
                                                   
                                            
                                                      
                                    
  
                                                                  
                                                                       
                                                           
  
                                                                     
                                                                  
                                                                   
                                                                     
                                                                 
                                                           
  
                                                                 
                                                              
                                                            
  
                                                                         
                                                                  
                                                                      
                                                        
  
                                                                      
                                                                  
                                                                  
                                                            
                                           
CREATE INDEX IF NOT EXISTS idx_zadachi_sprint        ON zadachi (sprint);
CREATE INDEX IF NOT EXISTS idx_zadachi_otvetstvennyj ON zadachi (otvetstvennyj);
CREATE INDEX IF NOT EXISTS idx_zadachi_napravlenie   ON zadachi (napravlenie);
CREATE INDEX IF NOT EXISTS idx_zadachi_status        ON zadachi (status);
CREATE INDEX IF NOT EXISTS idx_zadachi_roditel       ON zadachi (roditel_id);
                                                                 
CREATE INDEX IF NOT EXISTS idx_sotr_chelovek    ON sotrudnichestva (chelovek_id);
CREATE INDEX IF NOT EXISTS idx_sotr_napravlenie ON sotrudnichestva (napravlenie);
CREATE INDEX IF NOT EXISTS idx_sotr_rol         ON sotrudnichestva (rol);
                                                                         
                                                                     
                                                        
CREATE INDEX IF NOT EXISTS idx_zhurnal_obekt ON zhurnal (obekt, obekt_id);
CREATE INDEX IF NOT EXISTS idx_zhurnal_kogda ON zhurnal (kogda);
                                                                     
CREATE INDEX IF NOT EXISTS idx_rassylka_ljudi_rassylka ON rassylka_ljudi (rassylka_id);
CREATE INDEX IF NOT EXISTS idx_rassylka_ljudi_chelovek ON rassylka_ljudi (chelovek_id);
CREATE INDEX IF NOT EXISTS idx_rassylka_ljudi_status   ON rassylka_ljudi (status);
                                                                      
                                                                    
CREATE INDEX IF NOT EXISTS idx_kontakty_znachenie_norm ON kontakty (znachenie_norm);
