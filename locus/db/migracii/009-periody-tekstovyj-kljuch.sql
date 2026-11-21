                                                          
                                                               
                                                               
DROP TABLE IF EXISTS periody;
CREATE TABLE periody (
  id                     TEXT PRIMARY KEY,
  tip                    TEXT,
  nachalo                TEXT,
  konec                  TEXT,
  zakryt                 INTEGER,
  zakryl                 INTEGER,
  zakryt_kogda           TEXT
);
