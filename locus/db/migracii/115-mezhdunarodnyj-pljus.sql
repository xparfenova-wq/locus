                                                                            
                                                                              
                                                                            
                                                                                
WITH raw AS (
 SELECT id,trim(znachenie,char(9)||char(10)||char(11)||char(12)||char(13)||' ') AS text
 FROM kontakty WHERE tip='telefon'
), clean AS (
 SELECT id,replace(replace(replace(replace(substr(text,2),' ',''),'(',''),')',''),'-','') AS digits
 FROM raw WHERE substr(text,1,1)='+' AND instr(substr(text,2),'+')=0
  AND text NOT GLOB '*[^0-9+ ()-]*'
), normalized AS (
 SELECT id,digits FROM clean WHERE length(digits)=11 AND substr(digits,1,1)='8'
  AND digits NOT GLOB '*[^0-9]*'
)
UPDATE kontakty SET znachenie_norm=(SELECT digits FROM normalized WHERE id=kontakty.id)
WHERE id IN(SELECT id FROM normalized WHERE digits IS NOT kontakty.znachenie_norm);
