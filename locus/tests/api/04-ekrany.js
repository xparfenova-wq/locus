const {moskovskijDen}=require('../prover.js');
                                                          
                                                      
const { zapros, nado, sluchaj, proverit } = require('../prover.js');

module.exports = async function () {
                      
  const ja = (await nado('POST', '/api/ljudi', { telo: { imja: 'Администратор Тест', komanda:true } })).telo.id;
  const kollega = (await nado('POST', '/api/ljudi', { telo: { imja: 'Вика Тест', komanda:true } })).telo.id;
  const { nomer_nedeli } = require('../../db/db.js');
  const den = moskovskijDen();
  const sdvig = (n) => {
    const d = new Date(den + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const sprint = nomer_nedeli(den);
  const proshlyj_sprint = nomer_nedeli(sdvig(-7));
  const den_nedeli = new Date(den + 'T12:00:00Z').getUTCDay() || 7;
  const nachalo = sdvig(1 - den_nedeli), konec = sdvig(7 - den_nedeli);

  const sozdat = (telo, avtor = ja) =>
    nado('POST', '/api/zadachi', { telo: { napravlenie: 'synapt', ...telo }, avtor });

                          
  const na_segodnja = await sozdat(
    { nazvanie: 'Созвон с Наумовой', otvetstvennyj: ja, srok: den, sprint });
                 
  const prosrochennaja = await sozdat(
    { nazvanie: 'Правки КП', otvetstvennyj: ja, srok: sdvig(-2), sprint });
  const iz_proshlogo = await sozdat(
    { nazvanie: 'Осталась с прошлой недели', otvetstvennyj: ja,
      srok: sdvig(-8), sprint: proshlyj_sprint });
                             
  const ot_komandy = await sozdat(
    { nazvanie: 'Отрисовать баннеры', otvetstvennyj: ja, srok: sdvig(1), sprint },
    kollega);
                                 
  const chuzhaja = await sozdat(
    { nazvanie: 'Собрать медиа-смету', otvetstvennyj: kollega, srok: den, sprint }, kollega);
  await nado('POST', `/api/zadachi/${chuzhaja.telo.nomer}/uchastniki`,
    { telo: { chelovek_id: ja } });
                                                                 
                                           
  await sluchaj('повторный участник не дублируется', 'POST',
    `/api/zadachi/${chuzhaja.telo.nomer}/uchastniki`, {
    parametry: { telo: { chelovek_id: ja } },
    zhdjom_kod: 409,
    zhdjom: { uchastnik_uzhe_est: true },
  });
  const uchastniki = await zapros('GET', `/api/zadachi/${chuzhaja.telo.nomer}/uchastniki`);
  proverit('участник в списке один раз',
    (uchastniki.telo.spisok || []).filter((u) => u.chelovek_id === ja).length === 1,
    uchastniki.telo.spisok);

                                   
  const lichnaja = await sozdat(
    { nazvanie: 'Личное дело', otvetstvennyj: ja, srok: den, sprint, ne_v_itogi: true });

                             
  const vse = await sluchaj('моё пространство', 'GET',
    `/api/moe_prostranstvo?chelovek_id=${ja}&den=${den}&sprint=${sprint}`, {
    zhdjom_kod: 200,
    zhdjom: { sprint, 'nedelja.nachalo': nachalo, 'nedelja.konec': konec },
  });
  const nomera = (vse.telo.zadachi || []).map((z) => z.nomer);
  proverit('мои задачи в списке',
    nomera.includes(na_segodnja.telo.nomer) && nomera.includes(prosrochennaja.telo.nomer),
    nomera);
  proverit('чужая задача не в моём списке',
    !nomera.includes(chuzhaja.telo.nomer), nomera);

                                                
  proverit('просроченная идёт первой',
    nomera[0] === prosrochennaja.telo.nomer,
    (vse.telo.zadachi || []).map((z) => `${z.nomer}:${z.srok}`));
  proverit('метка просрочено стоит',
    (vse.telo.zadachi || []).find((z) => z.nomer === prosrochennaja.telo.nomer)?.prosrocheno === true,
    (vse.telo.zadachi || []).map((z) => z.prosrocheno));
  proverit('у задачи есть адрес',
    (vse.telo.zadachi || [])[0]?.adres?.startsWith('/synapt/'),
    (vse.telo.zadachi || [])[0]?.adres);

                                                                               
  proverit('прошлая неделя не подмешана в выбранный спринт',
    !nomera.includes(iz_proshlogo.telo.nomer), { sprint, nomera });

                             
  const komandoj = await sluchaj('чип добавлено командой', 'GET',
    `/api/moe_prostranstvo?chelovek_id=${ja}&den=${den}&sprint=${sprint}&chip=dobavleno_komandoj`, {
    zhdjom_kod: 200,
  });
  const nk = (komandoj.telo.zadachi || []).map((z) => z.nomer);
  proverit('чужая постановка в чипе', nk.includes(ot_komandy.telo.nomer), nk);
  proverit('моя постановка не в чипе', !nk.includes(na_segodnja.telo.nomer), nk);

                   
  const uchastvuju = await sluchaj('чип участвую', 'GET',
    `/api/moe_prostranstvo?chelovek_id=${ja}&den=${den}&chip=uchastvuju`, { zhdjom_kod: 200 });
  const nu = (uchastvuju.telo.zadachi || []).map((z) => z.nomer);
  proverit('чужая задача с моим участием в чипе', nu.includes(chuzhaja.telo.nomer), nu);

                                          
  const pros = await sluchaj('чип просроченные', 'GET',
    `/api/moe_prostranstvo?chelovek_id=${ja}&den=${den}&chip=prosrochennye`, {
    zhdjom_kod: 200,
    zhdjom: { prodlenie_dostupno: true },
  });
  proverit('в чипе только просроченные',
    (pros.telo.zadachi || []).every((z) => z.srok < den),
    (pros.telo.zadachi || []).map((z) => z.srok));
  proverit('задача прошлой недели не потеряна в чипе просроченных',
    (pros.telo.zadachi || []).some(z => z.nomer === iz_proshlogo.telo.nomer), pros.telo.chipy);

                                         
  proverit('на общем списке кнопки продления нет',
    vse.telo.prodlenie_dostupno === false, vse.telo.prodlenie_dostupno);

  await sluchaj('выдуманный чип', 'GET',
    `/api/moe_prostranstvo?chelovek_id=${ja}&chip=vydumka`, { zhdjom_kod: 400 });

                      
  const prodleno = await sluchaj('продлить просроченные', 'POST', '/api/zadachi/prodlit', {
    parametry: { telo: { chelovek_id: ja, den, sprint }, avtor: ja },
    zhdjom_kod: 200,
    zhdjom: { prodleno: (n) => n >= 1, novyj_srok: konec },
  });
  const posle = await zapros('GET',
    `/api/moe_prostranstvo?chelovek_id=${ja}&den=${den}&chip=prosrochennye`);
  proverit('просроченных не осталось',
    (posle.telo.zadachi || []).length === 0,
    (posle.telo.zadachi || []).map((z) => z.srok));

                                    
  await sluchaj('отмена продления', 'POST', '/api/otmena', {
    parametry: { telo: { otmena: prodleno.telo.otmena }, avtor: ja },
    zhdjom_kod: 200,
    zhdjom: { vernuto: prodleno.telo.prodleno },
  });
  const vernulos = await zapros('GET',
    `/api/moe_prostranstvo?chelovek_id=${ja}&den=${den}&chip=prosrochennye`);
  proverit('просроченная вернулась после отмены',
    (vernulos.telo.zadachi || []).some((z) => z.nomer === prosrochennaja.telo.nomer),
    (vernulos.telo.zadachi || []).map((z) => z.nomer));

                                      
  const chuzhaja_do = await zapros('GET', `/api/zadachi/${chuzhaja.telo.nomer}`);
  await zapros('POST', '/api/zadachi/prodlit', { telo: { chelovek_id: ja, den, sprint }, avtor: ja });
  const chuzhaja_posle = await zapros('GET', `/api/zadachi/${chuzhaja.telo.nomer}`);
  proverit('чужая задача не продлена',
    chuzhaja_posle.telo.srok === chuzhaja_do.telo.srok,
    { do: chuzhaja_do.telo.srok, posle: chuzhaja_posle.telo.srok });

                      
                                             
  await nado('POST', `/api/zadachi/${na_segodnja.telo.nomer}/zakryt`, { telo: { versija: (await nado('GET', `/api/zadachi/${na_segodnja.telo.nomer}`)).telo.versija }, avtor: ja });
  await nado('POST', `/api/zadachi/${lichnaja.telo.nomer}/zakryt`, { telo: { versija: (await nado('GET', `/api/zadachi/${lichnaja.telo.nomer}`)).telo.versija }, avtor: ja });
  const podzadacha = await sozdat(
    { nazvanie: 'Выгрузить контакты', otvetstvennyj: ja,
      roditel_id: chuzhaja.telo.id, srok: den, sprint });
  await nado('POST', `/api/zadachi/${podzadacha.telo.nomer}/zakryt`, { telo: { versija: (await nado('GET', `/api/zadachi/${podzadacha.telo.nomer}`)).telo.versija }, avtor: ja });

  const segodnja_den = moskovskijDen();
  const itogi = await sluchaj('итоги дня', 'GET',
    `/api/itogi?chelovek_id=${ja}&den=${segodnja_den}`, { zhdjom_kod: 200 });
  const nazvanija = (itogi.telo.punkty || []).map((p) => p.nazvanie);
  proverit('закрытая сегодня в итогах',
    nazvanija.includes('Созвон с Наумовой'), nazvanija);
  proverit('задача «не в итоги» не попала',
    !nazvanija.includes('Личное дело'), nazvanija);
  proverit('чужая задача с моей подзадачей попала',
    nazvanija.includes('Собрать медиа-смету'), nazvanija);

  const chuzhoj_punkt = (itogi.telo.punkty || []).find((p) => p.nazvanie === 'Собрать медиа-смету');
  proverit('под чужой задачей моя подзадача',
    (chuzhoj_punkt?.podzadachi || []).some((p) => p.nazvanie === 'Выгрузить контакты'),
    chuzhoj_punkt?.podzadachi);
  proverit('статус чужой задачи не подменён',
    chuzhoj_punkt?.itogovyj_status === 'chuzhaja', chuzhoj_punkt?.itogovyj_status);

  proverit('текст итогов начинается с решётки',
    String(itogi.telo.tekst).startsWith('#результаты'), String(itogi.telo.tekst).slice(0, 40));
  proverit('в тексте есть слово сделано',
    String(itogi.telo.tekst).includes('сделано'), itogi.telo.tekst);

                                  
  const vchera = await sluchaj('итоги за прошлый день', 'GET',
    `/api/itogi?chelovek_id=${ja}&den=2026-01-15`, {
    zhdjom_kod: 200,
    zhdjom: { tekst: 'за этот день пока нет сделанного' },
  });
  proverit('за прошлый день пунктов нет',
    (vchera.telo.punkty || []).length === 0, vchera.telo.punkty);

                                                  
  const v_processe = await sozdat(
    { nazvanie: 'Правки КП Технопродукту', otvetstvennyj: ja, srok: den, sprint,
      status: 'v_processe' });
  const itogi2 = await zapros('GET', `/api/itogi?chelovek_id=${ja}&den=${segodnja_den}`);
  proverit('в процессе в итогах сегодня',
    (itogi2.telo.punkty || []).some((p) => p.nazvanie === 'Правки КП Технопродукту'),
    (itogi2.telo.punkty || []).map((p) => `${p.nazvanie}:${p.itogovyj_status}`));

  await sluchaj('кривая дата в итогах', 'GET',
    `/api/itogi?chelovek_id=${ja}&den=23.10.2026`, { zhdjom_kod: 400 });

  return { ja, kollega };
};
