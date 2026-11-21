                                                                          
                                                                                
CREATE UNIQUE INDEX IF NOT EXISTS idx_kontakty_odin_osnovnoj
ON kontakty(chelovek_id,tip) WHERE osnovnoj=1;
