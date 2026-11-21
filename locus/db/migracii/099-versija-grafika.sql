                                                           
ALTER TABLE grafik ADD COLUMN versija INTEGER;
UPDATE grafik SET versija=1 WHERE versija IS NULL;
