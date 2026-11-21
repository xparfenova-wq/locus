                                                              
                                                               
                      
ALTER TABLE ljudi ADD COLUMN pol TEXT CHECK (pol IN ('zh', 'm'));
                             
UPDATE ljudi SET pol = 'zh' WHERE imja IN ('Администратор', 'Аня', 'Вика', 'Олеся');
UPDATE ljudi SET pol = 'm' WHERE imja IN ('Антон', 'Антон Д', 'Антон 2',
  'Витя', 'Гоша', 'Егор', 'Никита');
