                                                                      
                                     
  
                                                                              
                                                                        
                     

const path = require('node:path');

const PAPKA = __dirname;

                                                                          
const BAZA = process.env.LOCUS_BAZA
  ? path.resolve(process.env.LOCUS_BAZA)
  : path.join(PAPKA, 'locus.db');

const SHEMA    = path.join(PAPKA, 'schema.sql');
const NACHALNYE = path.join(PAPKA, 'nachalnye.sql');
const MIGRACII = path.join(PAPKA, 'migracii');
const PRAVILA = path.join(PAPKA, 'pravila.sql');

module.exports = { PAPKA, BAZA, SHEMA, NACHALNYE, MIGRACII, PRAVILA };
