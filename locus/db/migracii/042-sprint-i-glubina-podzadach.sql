                                                                
  
                                                                
                                                              
  
                                                                
                                                                    
                                                                       
                                                                   
                             
  
                                                                    
                                                                  
                                     

UPDATE zadachi
   SET sprint = CAST(strftime('%W', srok) AS INTEGER)
 WHERE sprint IS NULL
   AND povtorjaetsja IS NOT 1
   AND srok IS NOT NULL;

UPDATE zadachi
   SET sprint = 43
 WHERE sprint IS NULL
   AND povtorjaetsja IS NOT 1;
                                                                    
                                                                    
                                                               
                                                            

UPDATE zadachi
   SET roditel_id = (SELECT r.roditel_id FROM zadachi r WHERE r.id = zadachi.roditel_id)
 WHERE roditel_id IS NOT NULL
   AND (SELECT r.roditel_id FROM zadachi r WHERE r.id = zadachi.roditel_id) IS NOT NULL;
