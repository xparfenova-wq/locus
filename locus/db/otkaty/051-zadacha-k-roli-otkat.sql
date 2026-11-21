                                                    
  
                                                                      
  
                                                                     
                                                                        
                                                                    
                                            

DROP INDEX IF EXISTS idx_zadachi_sotrudnichestvo;
UPDATE zadachi SET sotrudnichestvo_id = NULL;
DELETE FROM migracii WHERE nomer = 51;
