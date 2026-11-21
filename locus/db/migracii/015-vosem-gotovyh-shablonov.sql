                                                                    
                                                                    
                                                                    
                                                                      
                                              
  
                                                                       
                                       
  
                                                                       
                                                                 
                                                        
  
                                                              
                                                  
UPDATE shablony SET gotovyj = 0, obschij = 1
 WHERE gotovyj = 1 AND (kod IS NULL OR kod = '');
                                                                  
                                                              
UPDATE shablony SET kod = NULL, gotovyj = 0
 WHERE kod IN ('kp', 'chekap', 'planerka', 'rassylka', 'kejs');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'next_touch', 'Следующее касание', 'klientskaja',
       'Написать или позвонить тому, с кем давно не общались', 3,
       NULL, 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'next_touch');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'otpravit_kp', 'Отправить КП', 'klientskaja',
       'Собрать предложение и отправить клиенту', 3,
       NULL, 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'otpravit_kp');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'provesti_zum', 'Провести зум', 'klientskaja',
       'Договориться о времени, провести встречу, отправить фоллоуап', 2,
       NULL, 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'provesti_zum');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'poluchit_oplatu', 'Получить оплату', 'biznesovaja',
       'Выставить счёт и довести до поступления', 7,
       NULL, 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'poluchit_oplatu');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'sobrat_bazu', 'Собрать базу', 'biznesovaja',
       'Набрать контакты под рассылку и проверить их', 5,
       'kontakty', 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'sobrat_bazu');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'otpravit_rassylku', 'Отправить рассылку', 'biznesovaja',
       'Волна писем по сегменту базы', 5,
       'otpravleno', 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'otpravit_rassylku');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'podgotovit_akt', 'Подготовить акт', 'biznesovaja',
       'Составить акт по закрытому этапу и отдать на подпись', 5,
       NULL, 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'podgotovit_akt');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'vyplatit_procent', 'Выплатить процент', 'biznesovaja',
       'Посчитать и перевести процент по реферальному соглашению', 7,
       NULL, 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'vyplatit_procent');
