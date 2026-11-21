                                                                
                                                                   
                                         
ALTER TABLE napravlenija ADD COLUMN cvet TEXT;
                                                                       
                                              
UPDATE napravlenija SET cvet = '#12a594' WHERE kod = 'synapt';
UPDATE napravlenija SET cvet = '#e0682a' WHERE kod = 'media';
UPDATE napravlenija SET cvet = '#4b7bc4' WHERE kod = 'automy';
UPDATE napravlenija SET cvet = '#7b61c9' WHERE kod = 'automy_junior';
UPDATE napravlenija SET cvet = '#c9476e' WHERE kod = 'nastavnichestvo';
UPDATE napravlenija SET cvet = '#1f8f4e' WHERE kod = 'platforma';
UPDATE napravlenija SET cvet = '#8a8f3f' WHERE kod = 'anton';
UPDATE napravlenija SET cvet = '#b07d20' WHERE kod = 'assist';
