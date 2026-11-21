                                                                        
                                                                          
const { zapros, sluchaj, proverit } = require('../prover.js');
const { OBEKT_ZHURNALA, TABLICA_OBEKTA, PODPIS_OBEKTA } = require('../../api/obschij.js');

module.exports = async function () {
  const chel = await zapros('POST', '/api/ljudi', { telo: { imja: 'Журнальный Человек' } });
  const id = chel.telo.id;
  const sejchas = await zapros('GET', `/api/ljudi/${id}`);
  await zapros('PATCH', `/api/ljudi/${id}`,
    { telo: { versija: sejchas.telo.versija, rol_v_baze: 'klientskij' } });

                                                   
  const po_znacheniju = await zapros('GET', `/api/zhurnal?obekt=chelovek&obekt_id=${id}`);
  proverit('журнал найден по значению из схемы',
    po_znacheniju.telo.vsego >= 1, po_znacheniju.telo.vsego);

                                                            
  const po_tablice = await zapros('GET', `/api/zhurnal?obekt=ljudi&obekt_id=${id}`);
  proverit('то же по имени таблицы',
    po_tablice.telo.vsego === po_znacheniju.telo.vsego,
    { po_znacheniju: po_znacheniju.telo.vsego, po_tablice: po_tablice.telo.vsego });

                                                    
  const stroka = (po_znacheniju.telo.spisok || [])[0];
  proverit('в строке подпись для экрана', stroka && stroka.chto === 'человек', stroka && stroka.chto);
  proverit('в строке имя таблицы', stroka && stroka.tablica === 'ljudi', stroka && stroka.tablica);
  proverit('в строке имя автора', stroka && typeof stroka.kto_imja !== 'undefined', stroka);

                                                      
  await sluchaj('выдуманный объект журнала', 'GET', '/api/zhurnal?obekt=vydumka', {
    zhdjom_kod: 400,
    zhdjom: { pole: 'obekt' },
  });

                                                      
  const bez_podpisi = Object.values(OBEKT_ZHURNALA).filter((z) => !PODPIS_OBEKTA[z]);
  proverit('у каждого значения есть подпись', bez_podpisi.length === 0, bez_podpisi);
  const bez_obratnogo = Object.values(OBEKT_ZHURNALA).filter((z) => !TABLICA_OBEKTA[z]);
  proverit('у каждого значения есть обратный перевод', bez_obratnogo.length === 0, bez_obratnogo);

                                                                        
  const vse = await zapros('GET', '/api/zhurnal?skolko=500&s_daty=2000-01-01');
  const imena_tablic = [...new Set((vse.telo.spisok || [])
    .map((z) => z.obekt)
    .filter((o) => OBEKT_ZHURNALA[o] && OBEKT_ZHURNALA[o] !== o))];
  proverit('в журнале нет имён таблиц', imena_tablic.length === 0, imena_tablic);

                                      
  const neizvestnye = [...new Set((vse.telo.spisok || [])
    .map((z) => z.obekt)
    .filter((o) => !PODPIS_OBEKTA[o]))];
  proverit('все значения журнала известны коду', neizvestnye.length === 0, neizvestnye);

                                                                     
  const do_zametki = await zapros('GET', `/api/zhurnal?obekt=chelovek&obekt_id=${id}`);
  const teper = await zapros('GET', `/api/ljudi/${id}`);
  await zapros('PATCH', `/api/ljudi/${id}`,
    { telo: { versija: teper.telo.versija, zametka: 'не для журнала' } });
  const posle_zametki = await zapros('GET', `/api/zhurnal?obekt=chelovek&obekt_id=${id}`);
  proverit('заметка в журнал не попала',
    posle_zametki.telo.vsego === do_zametki.telo.vsego,
    { do: do_zametki.telo.vsego, posle: posle_zametki.telo.vsego });

  return { id };
};
