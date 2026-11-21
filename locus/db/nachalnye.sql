                                                                               
                                                                    
                                                              
INSERT OR IGNORE INTO napravlenija (kod, nazvanie, est_klienty, porjadok) VALUES
  ('synapt',          'Synapt, студия AI-интеграции',               1, 1),
  ('automy',          'Automy, AI-обучение и сопровождение бизнеса', 1, 2),
  ('automy_junior',   'Automy Junior, AI для школьников и студентов', 1, 3),
  ('media',           'Oreshkin Media Lab',                          1, 4),
  ('nastavnichestvo', 'Драйв',                                        1, 5),
  ('platforma',       'Платформа',                                  1, 6),
  ('anton',           'Антон',                                       0, 7),
  ('assist',          'Ассист+, закрыт как единица, заявки берём',    1, 8);
                                                                 
                                                                 
                                                                 
                                                 
INSERT OR IGNORE INTO nastrojki_sistemy
  (stavka_naloga, chasovoj_pojas, nedel_v_okne, dnej_bez_obschenija_porog)
SELECT 6, 'Europe/Moscow', 8, 14
WHERE NOT EXISTS (SELECT 1 FROM nastrojki_sistemy);


INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'next_touch', 'Следующее касание', 'klientskaja',
       'Написать или позвонить тому, с кем давно не общались', 3,
       'net', 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'next_touch');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'otpravit_kp', 'Отправить КП', 'klientskaja',
       'Собрать предложение и отправить клиенту', 3,
       'net', 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'otpravit_kp');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'provesti_zum', 'Провести зум', 'klientskaja',
       'Договориться о времени, провести встречу, отправить фоллоуап', 2,
       'net', 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'provesti_zum');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'poluchit_oplatu', 'Получить оплату', 'biznesovaja',
       'Выставить счёт и довести до поступления', 7,
       'net', 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'poluchit_oplatu');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'sobrat_bazu', 'Собрать базу', 'biznesovaja',
       'Набрать контакты под рассылку и проверить их', 5,
       'kontakty_bazy', 1, NULL, 1, 1
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
       'net', 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'podgotovit_akt');

INSERT INTO shablony (kod, nazvanie, tip, opisanie, srok_po_umolchaniju,
                      schitat_fakt, gotovyj, avtor, obschij, versija)
SELECT 'vyplatit_procent', 'Выплатить процент', 'biznesovaja',
       'Посчитать и перевести процент по реферальному соглашению', 7,
       'net', 1, NULL, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM shablony WHERE kod = 'vyplatit_procent');
