                                                                                   
                                                                                 
                                                                              
                                                                         
WITH raw AS (
 SELECT id,lower(trim(znachenie,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) AS text
 FROM kontakty WHERE tip='telegram' AND znachenie NOT GLOB '*[^ -~]*'
), urls AS (
 SELECT id,text,CASE WHEN text LIKE 'https://t.me/%' THEN substr(text,14)
  WHEN text LIKE 'http://t.me/%' THEN substr(text,13)
  WHEN text LIKE 't.me/%' THEN substr(text,6) END AS path FROM raw
), fragments AS (
 SELECT id,text,CASE WHEN instr(path,'#')>0 THEN substr(path,1,instr(path,'#')-1) ELSE path END AS path FROM urls
), queries AS (
 SELECT id,text,CASE WHEN instr(path,'?')>0 THEN substr(path,1,instr(path,'?')-1) ELSE path END AS path FROM fragments
), handles AS (
 SELECT id,text,CASE WHEN substr(path,-1)='/' THEN substr(path,1,length(path)-1) ELSE path END AS handle FROM queries
), normalized AS (
 SELECT id,CASE WHEN handle<>'' AND handle NOT GLOB '*[^a-z0-9_]*' THEN handle
  WHEN substr(text,1,1)='@' THEN substr(text,2) ELSE text END AS value FROM handles
)
UPDATE kontakty SET znachenie_norm=(SELECT value FROM normalized WHERE id=kontakty.id)
WHERE id IN(SELECT id FROM normalized WHERE value<>'' AND value IS NOT kontakty.znachenie_norm);
