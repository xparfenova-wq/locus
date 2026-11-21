                                                               
                                                                              
CREATE UNIQUE INDEX IF NOT EXISTS idx_kontakty_chelovek_tip_norm
ON kontakty(chelovek_id, tip, znachenie_norm)
WHERE znachenie_norm IS NOT NULL AND znachenie_norm <> '';
