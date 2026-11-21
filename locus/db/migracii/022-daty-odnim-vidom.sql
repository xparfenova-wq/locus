                                                            
                                                                 
                                                                  
  
                                                     
UPDATE zadachi SET sozdano = replace(substr(sozdano, 1, 19), 'T', ' ')
  WHERE sozdano LIKE '%T%';
UPDATE ljudi SET sozdano = replace(substr(sozdano, 1, 19), 'T', ' ')
  WHERE sozdano LIKE '%T%';
UPDATE zhurnal SET kogda = replace(substr(kogda, 1, 19), 'T', ' ')
  WHERE kogda LIKE '%T%';
UPDATE sotrudnichestva SET arhiv_s = substr(arhiv_s, 1, 10)
  WHERE arhiv_s LIKE '%T%';
UPDATE zamery SET sozdano = replace(substr(sozdano, 1, 19), 'T', ' ')
  WHERE sozdano LIKE '%T%';
