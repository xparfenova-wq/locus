                                       
  
                                                                      
                                                                     
                                                                
  
                                                                   
                                                                
                                                                
                                                        
  
                                                                       
                                                              

UPDATE spravochnik_stadij SET sledujuschee_dejstvie = 'Поговорить про рекомендации'
 WHERE rol = 'referal' AND kod = 'prismatrivaemsja'
   AND (sledujuschee_dejstvie IS NULL OR sledujuschee_dejstvie = '');

UPDATE spravochnik_stadij SET sledujuschee_dejstvie = 'Назвать процент и прислать договор'
 WHERE rol = 'referal' AND kod = 'dogovarivaemsja'
   AND (sledujuschee_dejstvie IS NULL OR sledujuschee_dejstvie = '');

UPDATE spravochnik_stadij SET sledujuschee_dejstvie = 'Напомнить о себе, если три месяца тишина'
 WHERE rol = 'referal' AND kod = 'rabotaem'
   AND (sledujuschee_dejstvie IS NULL OR sledujuschee_dejstvie = '');

UPDATE spravochnik_stadij SET sledujuschee_dejstvie = 'Акт и выплата'
 WHERE rol = 'referal' AND kod = 'k_vyplate'
   AND (sledujuschee_dejstvie IS NULL OR sledujuschee_dejstvie = '');
                                                                                      
                                                                          
                                                             
                        
