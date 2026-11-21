                                                                   
                                                               
                                                  
const { zapros, nado, sluchaj, proverit } = require('../prover.js');

                                                                    
const VOSEM = ['svodka', 'biznes', 'klienty', 'produkt', 'kontent',
               'prochee', 'obratnaja_svjaz', 'na_soglasovanii'];

module.exports = async function () {
  const ja = (await nado('POST', '/api/ljudi', { telo: { imja: 'Планёрка Автор', dostup:'polnyj' } })).telo.id;
  const bez_deneg = (await nado('POST', '/api/ljudi',
    { telo: { imja: 'Планёрка Без Денег', dostup: 'bez_deneg' } })).telo.id;
  const klient = (await nado('POST', '/api/ljudi', { telo: { imja: 'Планёрка Клиент' } })).telo.id;
  const na_pauze = (await nado('POST', '/api/ljudi', { telo: { imja: 'Планёрка Пауза' } })).telo.id;
  const sprint = 43;

  const sozdat = (telo) => nado('POST', '/api/zadachi',
    { telo: { napravlenie: 'synapt', otvetstvennyj: ja, sprint, ...telo }, avtor: ja });

  await sozdat({ nazvanie: 'Планёрка: клиентская', tip: 'klientskaja', klient_id: klient });
  await sozdat({ nazvanie: 'Планёрка: продуктовая', tip: 'produktovaja' });
  await sozdat({ nazvanie: 'Планёрка: внутренняя', tip: 'vnutrennjaja' });
  await sozdat({ nazvanie: 'Планёрка: бизнесовая', tip: 'biznesovaja', plan_chislo: 30 });
  await sozdat({ nazvanie: 'Планёрка: на согласовании', tip: 'produktovaja',
                 status: 'na_soglasovanii' });
                                                                
  const publ = await sozdat({ nazvanie: 'Планёрка: публикация клиента', tip: 'klientskaja',
                              klient_id: klient, publikacija: true, ploshadka:'telegram', format:'post', data_vyhoda:'2026-10-24' });
                                                            
  await nado('POST', '/api/zadachi', { telo: { napravlenie: 'media', otvetstvennyj: ja,
    sprint, nazvanie: 'Планёрка: чужое направление', tip: 'klientskaja',
    klient_id: klient }, avtor: ja });

  await nado('POST', '/api/sotrudnichestva', { telo: { chelovek_id: klient,
    napravlenie: 'synapt', rol: 'klient', stadija: 'v_rabote' }, avtor: ja });
  const pauza = await nado('POST', '/api/sotrudnichestva', { telo: { chelovek_id: na_pauze,
    napravlenie: 'synapt', rol: 'klient', stadija: 'pauza' }, avtor: ja });

  const p = await sluchaj('планёрка Synapt', 'GET',
    `/api/planerka?napravlenie=synapt&nedelja=${sprint}`,
    { zhdjom_kod: 200, parametry: { avtor: ja } });

  for (const blok of VOSEM) {
    proverit(`блок ${blok} отдан`, p.telo[blok] !== undefined, Object.keys(p.telo));
  }

  const nomer_publ = publ.telo.nomer;
  const est = (spisok) => (spisok || []).some((z) => z.nomer === nomer_publ);
  proverit('публикация в блоке клиентов (К-106)', est(p.telo.klienty),
    (p.telo.klienty || []).map((z) => z.nomer));
  proverit('публикация в блоке контента (К-106)', est(p.telo.kontent),
    (p.telo.kontent || []).map((z) => z.nomer));
                                                                  
  proverit('в сводке публикация посчитана один раз',
    p.telo.svodka.vsego_zadach === p.telo.klienty.length + p.telo.produkt.length
      + p.telo.prochee.length + p.telo.biznes.zadachi.length,
    { svodka: p.telo.svodka.vsego_zadach, kontent: p.telo.kontent.length });

  proverit('чужое направление в числа не идёт (К-98)',
    !(p.telo.klienty || []).some((z) => z.napravlenie === 'media'),
    (p.telo.klienty || []).map((z) => z.napravlenie));

  proverit('пауза отсеяна на сервере (К-909)',
    !(p.telo.aktivnye || []).some((s) => s.stadija === 'pauza'),
    (p.telo.aktivnye || []).map((s) => s.stadija));
  proverit('человек на паузе не в счётчике клиентов (К-909, К-1320)',
    !(p.telo.aktivnye || []).some((s) => s.id === pauza.telo.id),
    p.telo.schetchiki);

  proverit('на согласовании отдельным блоком',
    (p.telo.na_soglasovanii || []).length >= 1, p.telo.na_soglasovanii);
  proverit('давно не общались и без задач это разные массивы (К-1681)',
    Array.isArray(p.telo.davno_ne_obschalis) && Array.isArray(p.telo.bez_zadach),
    { d: typeof p.telo.davno_ne_obschalis, b: typeof p.telo.bez_zadach });
  proverit('порог дней отдан числом (К-1680)',
    Number.isInteger(p.telo.porog_dnej_bez_obschenija), p.telo.porog_dnej_bez_obschenija);

                                                                         
  proverit('полному доступу деньги видны (К-128)',
    p.telo.dengi && p.telo.dengi.skryto === false, p.telo.dengi);
  const urezannyj = await zapros('GET',
    `/api/planerka?napravlenie=synapt&nedelja=${sprint}`, { avtor: bez_deneg });
  proverit('без денег ключ dengi есть (К-128)',
    urezannyj.telo.dengi !== undefined, Object.keys(urezannyj.telo));
  proverit('без денег значение null и skryto (К-128)',
    urezannyj.telo.dengi.znachenie === null && urezannyj.telo.dengi.skryto === true,
    urezannyj.telo.dengi);
  proverit('число ключей у обоих доступов одинаковое (К-128)',
    Object.keys(p.telo).length === Object.keys(urezannyj.telo).length,
    { polnyj: Object.keys(p.telo).length, bez: Object.keys(urezannyj.telo).length });

                                 
  await sluchaj('планёрка не принимает chelovek (К-180)', 'GET',
    `/api/planerka?napravlenie=synapt&nedelja=${sprint}&chelovek=${ja}`,
    { zhdjom_kod: 400, parametry: { avtor: ja } });
  await sluchaj('планёрка без направления', 'GET', `/api/planerka?nedelja=${sprint}`,
    { zhdjom_kod: 400, parametry: { avtor: ja } });
  await sluchaj('планёрка несуществующего направления', 'GET',
    '/api/planerka?napravlenie=netakogo&nedelja=43', { zhdjom_kod: 404, parametry: { avtor: ja } });
  await sluchaj('планёрка: кривая неделя', 'GET',
    '/api/planerka?napravlenie=synapt&nedelja=99', { zhdjom_kod: 400, parametry: { avtor: ja } });
  await sluchaj('планёрка: только GET', 'POST', '/api/planerka?napravlenie=synapt',
    { zhdjom_kod: 405, parametry: { avtor: ja, telo: {} } });

                                                                    
  const sprintom = await sluchaj('планёрка по sprint', 'GET',
    '/api/planerka?napravlenie=synapt&sprint=2026-43',
    { zhdjom_kod: 200, zhdjom: { nedelja: 43, god: 2026 }, parametry: { avtor: ja } });
  proverit('sprint и nedelja дают одно окно',
    sprintom.telo.nachalo === p.telo.nachalo && sprintom.telo.konec === p.telo.konec,
    { sprint: sprintom.telo.nachalo, nedelja: p.telo.nachalo });
  await sluchaj('планёрка на sejchas', 'GET',
    '/api/planerka?napravlenie=synapt&nedelja=sejchas',
    { zhdjom_kod: 200, parametry: { avtor: ja } });

                                                   
  const pustaja = await sluchaj('планёрка пустой недели', 'GET',
    '/api/planerka?napravlenie=synapt&nedelja=5',
    { zhdjom_kod: 200, parametry: { avtor: ja } });
  proverit('на пустых данных блоков столько же (К-181)',
    VOSEM.every((b) => pustaja.telo[b] !== undefined), Object.keys(pustaja.telo));
  proverit('на пустой неделе задач ноль',
    pustaja.telo.svodka.vsego_zadach === 0, pustaja.telo.svodka);

  return { ja, klient };
};
