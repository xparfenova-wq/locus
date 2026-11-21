                                                                  
  
                                                                      
  
                                                                 
                                                                       

UPDATE spravochnik_stadij SET sledujuschee_dejstvie = NULL
 WHERE rol = 'referal'
   AND kod IN ('prismatrivaemsja', 'dogovarivaemsja', 'rabotaem', 'k_vyplate');
DELETE FROM migracii WHERE nomer = 52;
