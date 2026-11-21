                                                               
  
                                                                     
                                                                 
                                                                        
                                                                 
                                                                       
                                                                  
                                        
  
                                                                      
                                                                       
                                                                 
                            
  
                                                                   
                                                                    
                                        

ALTER TABLE zadachi ADD COLUMN sotrudnichestvo_id INTEGER;
                                                                    
                                                               
CREATE INDEX IF NOT EXISTS idx_zadachi_sotrudnichestvo
  ON zadachi (sotrudnichestvo_id);
                                                                 
                                                                       
                                                                   
                                                                   
UPDATE zadachi SET sotrudnichestvo_id = (
  SELECT s.id FROM sotrudnichestva s
  WHERE s.chelovek_id = zadachi.klient_id
    AND s.napravlenie = zadachi.napravlenie
)
WHERE klient_id IS NOT NULL
  AND sotrudnichestvo_id IS NULL
  AND (SELECT count(*) FROM sotrudnichestva s
       WHERE s.chelovek_id = zadachi.klient_id
         AND s.napravlenie = zadachi.napravlenie) = 1;
                                                             
                                                               
                                                                  
                              
