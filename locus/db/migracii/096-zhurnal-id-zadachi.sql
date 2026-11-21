                                                                   
                                                                    
                                                               
                                                                         
UPDATE zhurnal
SET obekt_id = (SELECT id FROM zadachi WHERE nomer = zhurnal.obekt_id)
WHERE obekt = 'zadacha'
  AND obekt_id IN (SELECT nomer FROM zadachi)
  AND obekt_id NOT IN (SELECT id FROM zadachi);
