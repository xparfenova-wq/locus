                                                           
                                                            
                                                        
                                                       
                                                             
UPDATE zhurnal
SET obekt_id = (SELECT z.id FROM zadachi z WHERE z.nomer = zhurnal.obekt_id)
WHERE obekt = 'zadacha'
  AND obekt_id NOT IN (SELECT id FROM zadachi)
  AND obekt_id IN (SELECT nomer FROM zadachi);
