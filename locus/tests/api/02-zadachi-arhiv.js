const {moskovskijDen}=require('../prover.js');
                                                               
                                                                 
const { zapros, nado, sluchaj, proverit } = require('../prover.js');

module.exports = async function () {
                                                    
  const chel = await zapros('POST', '/api/ljudi',
    { telo: { imja: 'Архивный Клиент' } });
  const id = chel.telo.id;

                                     
  await sluchaj('задача без названия', 'POST', '/api/zadachi', {
    parametry: { telo: { napravlenie: 'media', otvetstvennyj: 1 } },
    zhdjom_kod: 400,
    zhdjom: { pole: 'nazvanie' },
  });

  await sluchaj('клиентская без клиента', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Созвон', napravlenie: 'media',
                         otvetstvennyj: 1, tip: 'klientskaja' } },
    zhdjom_kod: 400,
    zhdjom: { pole: 'klient_id' },
  });

  await sluchaj('бизнесовая без целевого числа', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Выручка', napravlenie: 'media',
                         otvetstvennyj: 1, tip: 'biznesovaja' } },
    zhdjom_kod: 400,
    zhdjom: { pole: 'plan_chislo' },
  });

                                        
  await sluchaj('повторяющаяся со сроком', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Планёрка', napravlenie: 'media',
                         otvetstvennyj: 1, povtorjaetsja: true,
                         srok: '2026-10-30' } },
    zhdjom_kod: 422,
  });

                                           
  const z1 = await sluchaj('задача создана', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Первая задача', napravlenie: 'media',
                         otvetstvennyj: 1 } },
    zhdjom_kod: 201,
    zhdjom: {
      status: 'v_plane',
      tip: 'vnutrennjaja',
      nomer: (n) => Number.isInteger(n) && n >= 1000,
    },
  });
  const nomer = z1.telo.nomer;

                           
  await sluchaj('клиент в архив', 'POST', '/api/arhiv', {
    parametry: { telo: { tablica: 'ljudi', id, versija: (await zapros('GET','/api/ljudi/'+id)).telo.versija } },
    zhdjom_kod: 200,
    zhdjom: { arhiv: true },
  });

                                                                     
  await sluchaj('задача без клиента архив не трогает', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Хвост по закрытому', napravlenie: 'media',
                         otvetstvennyj: 1 } },
    zhdjom_kod: 201,
    net: ['vernulsja_iz_arhiva'],
  });
  const vsjo_esche = await zapros('GET', `/api/ljudi/${id}`);
  proverit('человек всё ещё в архиве', vsjo_esche.telo.arhiv === true, vsjo_esche.telo.arhiv);
  proverit('дата архива сохранилась',
    typeof vsjo_esche.telo.arhiv_s === 'string' && vsjo_esche.telo.arhiv_s.length > 0,
    vsjo_esche.telo.arhiv_s);
                                                 
  const bez_vozvrata = await zapros('GET', `/api/ljudi/${id}/istorija`);
  proverit('задача без клиента архив не сняла',
    !(bez_vozvrata.telo.spisok || []).some((z) => z.pole === 'arhiv'
      && String(z.stalo).startsWith('нет')),
    (bez_vozvrata.telo.spisok || []).map((z) => `${z.pole}:${z.stalo}`));

                                                              
  await sluchaj('задача на архивном возвращает', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Доделать отчёт', napravlenie: 'media',
                         otvetstvennyj: 1, tip: 'klientskaja', klient_id: id } },
    zhdjom_kod: 201,
    zhdjom: {
      'vernulsja_iz_arhiva.chelovek_id': id,
      'vernulsja_iz_arhiva.tost': (t) => typeof t === 'string' && t.includes('вернулся из архива'),
    },
  });

  const vernulsja = await zapros('GET', `/api/ljudi/${id}`);
  proverit('человек вернулся из архива', vernulsja.telo.arhiv === false, vernulsja.telo.arhiv);
  proverit('дата архива снята', vernulsja.telo.arhiv_s === null, vernulsja.telo.arhiv_s);

                                                 
  const istorija = await zapros('GET', `/api/ljudi/${id}/istorija`);
  const pro_arhiv = (istorija.telo.spisok || []).filter((z) => z.pole === 'arhiv');
  proverit('в журнале два события архива', pro_arhiv.length === 2, pro_arhiv.map((z) => z.stalo));
  proverit('видна причина возврата',
    pro_arhiv.some((z) => String(z.stalo).includes('появилась задача')),
    pro_arhiv.map((z) => z.stalo));

                                                               
                                                                          
  await sluchaj('задача на активном не трогает архив', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Ещё задача активному', napravlenie: 'media',
                         otvetstvennyj: 1, tip: 'klientskaja', klient_id: id } },
    zhdjom_kod: 201,
    net: ['vernulsja_iz_arhiva'],
  });
  const aktiven = await zapros('GET', `/api/ljudi/${id}/istorija`);
  const snjatij = (aktiven.telo.spisok || []).filter((z) => z.pole === 'arhiv'
    && String(z.stalo).startsWith('нет'));
  proverit('снятие архива записано один раз', snjatij.length === 1,
    snjatij.map((z) => z.stalo));

                                                      
                                                                           
                                                               
  const sotr = await zapros('POST', '/api/sotrudnichestva',
    { telo: { chelovek_id: id, napravlenie: 'media', rol: 'lid' } });
  const sid = sotr.telo.id;
  await sluchaj('роль лид на клиента', 'PATCH', `/api/sotrudnichestva/${sid}`, {
    parametry: { telo: { versija: sotr.telo.versija, rol: 'klient' } },
    zhdjom_kod: 200,
    zhdjom: { rol: 'klient' },
  });
  const zh_sotr = await zapros('GET', `/api/sotrudnichestva/${sid}/istorija`);
  proverit('переход роли записан в журнал',
    (zh_sotr.telo.spisok || []).some((z) => z.pole === 'rol'
      && z.bylo === 'lid' && z.stalo === 'klient'),
    zh_sotr.telo.spisok);

                                                 
  const chel_sejchas = await zapros('GET', `/api/ljudi/${id}`);
  await zapros('PATCH', `/api/ljudi/${id}`,
    { telo: { versija: chel_sejchas.telo.versija, imja: 'Вернувшийся Клиент' } });
  const zh_chel = await zapros('GET', `/api/ljudi/${id}/istorija`);
  proverit('правка имени записана в журнал',
    (zh_chel.telo.spisok || []).some((z) => z.pole === 'imja'
      && z.stalo === 'Вернувшийся Клиент'),
    (zh_chel.telo.spisok || []).map((z) => z.pole));

                                             
  await sluchaj('воронка после перехода', 'GET', '/api/napravlenija/media/voronka', {
    zhdjom_kod: 200,
    zhdjom: { klienty: (n) => n >= 1 },
  });

                                          
  const roditel = await zapros('POST', '/api/zadachi',
    { telo: { nazvanie: 'Родительская', napravlenie: 'media', otvetstvennyj: 1 } });
  const rid = roditel.telo.id;
  await zapros('POST', '/api/zadachi',
    { telo: { nazvanie: 'Подзадача', napravlenie: 'media',
              otvetstvennyj: 1, roditel_id: rid } });

  await sluchaj('закрыть с открытой подзадачей', 'POST', `/api/zadachi/${roditel.telo.nomer}/zakryt`, {
    parametry: { telo: {versija:roditel.telo.versija} },
    zhdjom_kod: 409,
    zhdjom: { podzadach: 1 },
  });

  await sluchaj('закрыть вместе с подзадачами', 'POST', `/api/zadachi/${roditel.telo.nomer}/zakryt`, {
    parametry: { telo: { versija:roditel.telo.versija,i_podzadachi: true,versii_podzadach:(await nado('GET',`/api/zadachi/${roditel.telo.nomer}`)).telo.podzadachi.map(p=>({id:p.id,versija:p.versija})) } },
    zhdjom_kod: 200,
    zhdjom: { status: 'sdelano', zakryto_podzadach: 1 },
  });

                                  
  const zh = await zapros('GET', `/api/zhurnal?obekt=zadachi&obekt_id=${rid}`);
  proverit('смена статуса в журнале',
    (zh.telo.spisok || []).some((z) => z.pole === 'status' && z.stalo === 'sdelano'),
    zh.telo.spisok);
  proverit('в журнале подпись для экрана',
    (zh.telo.spisok || []).every((z) => z.chto === 'задача'),
    (zh.telo.spisok || []).map((z) => z.chto));

                                                                 
  const svodka = await sluchaj('сводка задач', 'GET', '/api/zadachi/svodka?napravlenie=media', {
    zhdjom_kod: 200,
    zhdjom: {
      vsego: (n) => n >= 4,
      sdelano: (n) => n >= 2,
      otkryto: (n) => n >= 1,
    },
  });
  proverit('сделано и открыто не больше всего',
    svodka.telo.sdelano + svodka.telo.otkryto <= svodka.telo.vsego,
    svodka.telo);

                                                            
                                                                  
  const do_togo = await zapros('GET', '/api/zadachi/svodka?napravlenie=media');
  const kogda_nibud = await zapros('POST', '/api/zadachi',
    { telo: { nazvanie: 'Когда-нибудь сделаю', napravlenie: 'media',
              otvetstvennyj: 1, status: 'kogda_nibud' } });
  const posle_kn = await zapros('GET', '/api/zadachi/svodka?napravlenie=media');
  proverit('когда-нибудь не прибавила открытых',
    posle_kn.telo.otkryto === do_togo.telo.otkryto,
    { do: do_togo.telo.otkryto, posle: posle_kn.telo.otkryto });
  proverit('когда-нибудь прибавила к всего',
    posle_kn.telo.vsego === do_togo.telo.vsego + 1,
    { do: do_togo.telo.vsego, posle: posle_kn.telo.vsego });

                                                                              
  const obychnaja = await zapros('POST', '/api/zadachi',
    { telo: { nazvanie: 'Обычная в работу', napravlenie: 'media', otvetstvennyj: 1 } });
  const posle_ob = await zapros('GET', '/api/zadachi/svodka?napravlenie=media');
  proverit('обычная задача прибавила открытых',
    posle_ob.telo.otkryto === posle_kn.telo.otkryto + 1,
    { do: posle_kn.telo.otkryto, posle: posle_ob.telo.otkryto });

                                                 
  const celikom = await zapros('GET', `/api/ljudi/${id}/celikom`);
  proverit('когда-нибудь не в задачах человека',
    !(celikom.telo.zadachi || []).some((z) => z.nomer === kogda_nibud.telo.nomer),
    (celikom.telo.zadachi || []).map((z) => z.status));

                                  
  const povtor = await zapros('POST', '/api/zadachi',
    { telo: { nazvanie: 'Каждый день', napravlenie: 'media',
              otvetstvennyj: 1, povtorjaetsja: true, chastota: 'kazhdyj_den' } });
  const den_povtora = moskovskijDen();
  await sluchaj('отметка повтора', 'POST', `/api/zadachi/${povtor.telo.nomer}/otmetki`, {
    parametry: { telo: { data: den_povtora } },
    zhdjom_kod: 201,
    zhdjom: { data: den_povtora },
  });
  await sluchaj('повторная отметка не дублируется', 'POST', `/api/zadachi/${povtor.telo.nomer}/otmetki`, {
    parametry: { telo: { data: den_povtora } },
    zhdjom_kod: 200,
  });
  await sluchaj('отметка неповторяющейся', 'POST', `/api/zadachi/${nomer}/otmetki`, {
    parametry: { telo: {} },
    zhdjom_kod: 400,
  });

                                                 
  await sluchaj('воронка направления', 'GET', '/api/napravlenija/media/voronka', {
    zhdjom_kod: 200,
    zhdjom: { napravlenie: 'media', lidy: (n) => Number.isInteger(n) },
  });
  await sluchaj('воронка несуществующего направления', 'GET', '/api/napravlenija/vydumka/voronka', {
    zhdjom_kod: 404,
  });

                                                        
                                                                   
                                                                 
                                                                
  {
    const pz = await zapros('POST', '/api/zadachi', { telo: {
      nazvanie: 'Повтор для отметок', napravlenie: 'media',
                                                          
                                             
      otvetstvennyj: 1, tip: 'vnutrennjaja', povtorjaetsja: true, chastota: 'kazhdyj_den' } });
    const nom = pz.telo && pz.telo.nomer;
    if (nom) {
      const den = moskovskijDen();
      const a = await zapros('POST', `/api/zadachi/${nom}/otmetki`, { telo: { data: den } });
      const b = await zapros('POST', `/api/zadachi/${nom}/otmetki`, { telo: { data: den } });
      proverit('первая отметка создаётся', a.kod === 201, `код ${a.kod}`);
      proverit('вторая отметка тем же днём не дублирует',
               b.kod === 200, `код ${b.kod}, ждали 200`);
      const spis = await zapros('GET', `/api/zadachi/${nom}/otmetki`);
      const skolko = ((spis.telo && spis.telo.spisok) || [])
        .filter((o) => String(o.data).slice(0, 10) === den).length;
      proverit('отметка за день ровно одна', skolko === 1, `их ${skolko}`);
      const seen = (await nado('GET', `/api/zadachi/${nom}`)).telo;
      await nado('DELETE', `/api/zadachi/${nom}`, { telo: { versija: seen.versija, confirm: true } });
    }
  }

  return { nomer, id };
};
