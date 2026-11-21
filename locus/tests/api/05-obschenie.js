const {moskovskijDen}=require('../prover.js');
                                                        
                                                                    
const { zapros, nado, sluchaj, proverit } = require('../prover.js');

module.exports = async function () {
  const segodnja = moskovskijDen();
  const vchera = moskovskijDen(Date.now() - 86400000);
  const chel = await nado('POST', '/api/ljudi', { telo: { imja: 'Наумова Света' } });
  const id = chel.telo.id;
  const sotr = await nado('POST', '/api/sotrudnichestva',
    { telo: { chelovek_id: id, napravlenie: 'media', rol: 'klient', stadija: 'v_rabote' } });
  const sid = sotr.telo.id;

  proverit('общения нет сразу после заведения',
    sotr.telo.poslednee_obshenie === null, sotr.telo.poslednee_obshenie);
  proverit('последней задачи тоже нет',
    sotr.telo.poslednjaja_zadacha === null, sotr.telo.poslednjaja_zadacha);

                                                          
  const z = await nado('POST', '/api/zadachi',
    { telo: { nazvanie: 'Правки стратегии', napravlenie: 'media',
              otvetstvennyj: 1, tip: 'klientskaja', klient_id: id } });
  await nado('POST', `/api/zadachi/${z.telo.nomer}/zakryt`, { telo: { versija: (await nado('GET', `/api/zadachi/${z.telo.nomer}`)).telo.versija } });

  const posle_zadachi = await zapros('GET', `/api/sotrudnichestva/${sid}`);
  proverit('последняя задача сдвинулась',
    typeof posle_zadachi.telo.poslednjaja_zadacha === 'string'
      && posle_zadachi.telo.poslednjaja_zadacha.length === 10,
    posle_zadachi.telo.poslednjaja_zadacha);
  proverit('общение НЕ сдвинулось от закрытой задачи',
    posle_zadachi.telo.poslednee_obshenie === null,
    posle_zadachi.telo.poslednee_obshenie);

                                            
  await sluchaj('отметить общение руками', 'POST', `/api/sotrudnichestva/${sid}/kasanie`, {
    parametry: { telo: { kogda: vchera } },
    zhdjom_kod: 200,
    zhdjom: { poslednee_obshenie: vchera },
  });
  const posle_kasanija = await zapros('GET', `/api/sotrudnichestva/${sid}`);
  proverit('последняя задача не изменилась от отметки',
    posle_kasanija.telo.poslednjaja_zadacha === posle_zadachi.telo.poslednjaja_zadacha,
    { do: posle_zadachi.telo.poslednjaja_zadacha,
      posle: posle_kasanija.telo.poslednjaja_zadacha });

                                                      
  await sluchaj('отметка от бота', 'POST', `/api/sotrudnichestva/${sid}/kasanie`, {
    parametry: { telo: { kogda: segodnja, otkuda: 'bot' } },
    zhdjom_kod: 200,
    zhdjom: { poslednee_obshenie: segodnja },
  });
  const zh = await zapros('GET', `/api/sotrudnichestva/${sid}/istorija`);
  proverit('в журнале видно, что отметил бот',
    (zh.telo.spisok || []).some((r) => r.pole === 'kasanie' && String(r.stalo).includes('bot')),
    (zh.telo.spisok || []).filter((r) => r.pole === 'kasanie').map((r) => r.stalo));

  await sluchaj('выдуманный источник отметки', 'POST', `/api/sotrudnichestva/${sid}/kasanie`, {
    parametry: { telo: { otkuda: 'telepatija' } },
    zhdjom_kod: 400,
    zhdjom: { pole: 'otkuda' },
  });

                                                                
  const davnij = await nado('POST', '/api/ljudi', { telo: { imja: 'Давний Клиент' } });
  const sotr2 = await nado('POST', '/api/sotrudnichestva',
    { telo: { chelovek_id: davnij.telo.id, napravlenie: 'media', rol: 'klient' } });
                                                     
  const z2 = await nado('POST', '/api/zadachi',
    { telo: { nazvanie: 'Смонтировать ролик', napravlenie: 'media',
              otvetstvennyj: 1, tip: 'klientskaja', klient_id: davnij.telo.id } });
  await nado('POST', `/api/zadachi/${z2.telo.nomer}/zakryt`, { telo: { versija: (await nado('GET', `/api/zadachi/${z2.telo.nomer}`)).telo.versija } });

  const davno = await sluchaj('давно не общались', 'GET',
    '/api/sotrudnichestva/davno_ne_obschalis?napravlenie=media', { zhdjom_kod: 200 });
  const v_spiske = (davno.telo.spisok || []).map((r) => r.imja);
  proverit('тот, с кем не говорили, в списке, хотя задача закрыта',
    v_spiske.includes('Давний Клиент'), v_spiske);
  proverit('тот, с кем говорили сегодня, не в списке',
    !v_spiske.includes('Наумова Света'), v_spiske);

  const zapis = (davno.telo.spisok || []).find((r) => r.imja === 'Давний Клиент');
  proverit('помечен как никогда не общались',
    zapis && zapis.nikogda_ne_obschalis === true, zapis && zapis.nikogda_ne_obschalis);
  proverit('у него есть дата последней задачи',
    zapis && typeof zapis.poslednjaja_zadacha === 'string', zapis && zapis.poslednjaja_zadacha);
  proverit('норма взята из направления или общая',
    zapis && Number.isInteger(zapis.norma), zapis && zapis.norma);
  proverit('видно, что было последним',
    zapis && zapis.chto_bylo && typeof zapis.chto_bylo.chto === 'string',
    zapis && zapis.chto_bylo);

                                                      
  const bez = await sluchaj('клиенты без задач', 'GET',
    '/api/sotrudnichestva/bez_zadach?napravlenie=media', { zhdjom_kod: 200 });
  const bez_imen = (bez.telo.spisok || []).map((r) => r.imja);
  proverit('Наумова без открытых задач в списке',
    bez_imen.includes('Наумова Света'), bez_imen);
  const n = (bez.telo.spisok || []).find((r) => r.imja === 'Наумова Света');
  proverit('у неё стоит дата последней задачи',
    n && typeof n.poslednjaja_zadacha === 'string', n && n.poslednjaja_zadacha);
  proverit('и признак «задач не было» снят',
    n && n.zadach_ne_bylo === false, n && n.zadach_ne_bylo);

                                   
  await nado('POST', '/api/zadachi',
    { telo: { nazvanie: 'Новая работа', napravlenie: 'media',
              otvetstvennyj: 1, tip: 'klientskaja', klient_id: id } });
  const bez2 = await zapros('GET', '/api/sotrudnichestva/bez_zadach?napravlenie=media');
  proverit('с открытой задачей из списка ушла',
    !(bez2.telo.spisok || []).map((r) => r.imja).includes('Наумова Света'),
    (bez2.telo.spisok || []).map((r) => r.imja));

                                                                   
                                                                        
                                                          
  const zavtra = moskovskijDen(Date.now() + 86400000);
                                                                  
                                           
  const fixture=new(require('node:sqlite').DatabaseSync)(process.env.LOCUS_BAZA);
  try{fixture.prepare('UPDATE sotrudnichestva SET poslednjaja_zadacha=? WHERE id=?').run(zavtra,sid);}
  finally{fixture.close();}
  const staraja = await nado('POST', '/api/zadachi',
    { telo: { nazvanie: 'Старый хвост', napravlenie: 'media',
              otvetstvennyj: 1, tip: 'klientskaja', klient_id: id } });
  await nado('POST', `/api/zadachi/${staraja.telo.nomer}/zakryt`, { telo: { versija: (await nado('GET', `/api/zadachi/${staraja.telo.nomer}`)).telo.versija } });
  const posle_vtoroj = await zapros('GET', `/api/sotrudnichestva/${sid}`);
  proverit('дата последней задачи не ушла назад',
    posle_vtoroj.telo.poslednjaja_zadacha === zavtra,
    { postavili: zavtra, stalo: posle_vtoroj.telo.poslednjaja_zadacha });

  return { id, sid };
};
