                                                              
  
                                                                        
                                                             
                                                            
                                                                   
                                                                    
                                                 
  
                                                                    
                                                             

UPDATE zadachi
   SET chastota = 'raz_v_nedelju'
 WHERE povtorjaetsja = 1
   AND chastota = 'nedelja';
                                                                   
                                                               
                                                                    
                                             
UPDATE zadachi
   SET chastota = 'raz_v_nedelju'
 WHERE povtorjaetsja = 1
   AND chastota IN ('den', 'mesjac', 'kvartal');
                                                                      
                                                       
UPDATE zadachi
   SET den_nedeli = 1
 WHERE povtorjaetsja = 1
   AND chastota = 'raz_v_nedelju'
   AND den_nedeli IS NULL;
