                                                                    
const { zapros, sluchaj, proverit } = require('../prover.js');

module.exports = async function () {
                        
  await sluchaj('без автора', 'POST', '/api/ljudi', {
    parametry: { bez_avtora: true, telo: { imja: 'Кто-то' } },
    zhdjom_kod: 401,
  });

                                       
  await sluchaj('чужое значение справочника', 'POST', '/api/ljudi', {
    parametry: { telo: { imja: 'Проверка справочника', dostup: 'vydumannyj' } },
    zhdjom_kod: 400,
    zhdjom: { pole: 'dostup' },
  });

                                       
  await sluchaj('неизвестное поле', 'POST', '/api/ljudi', {
    parametry: { telo: { imja: 'Проверка поля', vydumannoe: 1 } },
    zhdjom_kod: 400,
    zhdjom: { pole: 'vydumannoe' },
  });

                                  
  const sozdan = await sluchaj('создание человека', 'POST', '/api/ljudi', {
    parametry: { telo: { imja: 'Тестовый Ёжик', gorod: 'Москва' } },
    zhdjom_kod: 201,
    zhdjom: { imja_norm: 'тестовый ежик', versija: 1, arhiv: false },
  });
  const id = sozdan.telo.id;

                                
  await sluchaj('id в теле PATCH', 'PATCH', `/api/ljudi/${id}`, {
    parametry: { telo: { id: 999, versija: 1, gorod: 'Казань' } },
    zhdjom_kod: 400,
  });

                       
  await sluchaj('PATCH без версии', 'PATCH', `/api/ljudi/${id}`, {
    parametry: { telo: { gorod: 'Казань' } },
    zhdjom_kod: 400,
    zhdjom: { pole: 'versija' },
  });

                                       
  const pravka = await sluchaj('PATCH меняет одно поле', 'PATCH', `/api/ljudi/${id}`, {
    parametry: { telo: { versija: 1, gorod: 'Казань' } },
    zhdjom_kod: 200,
    zhdjom: { gorod: 'Казань', imja: 'Тестовый Ёжик', versija: 2 },
  });

                                               
  await sluchaj('PATCH со старой версией', 'PATCH', `/api/ljudi/${id}`, {
    parametry: { telo: { versija: 1, gorod: 'Сочи' } },
    zhdjom_kod: 409,
    zhdjom: { versija: 2 },
  });

                                                                     
                                                      
  await sluchaj('человек не удаляется', 'DELETE', `/api/ljudi/${id}`, {
    zhdjom_kod: 400,
    zhdjom: { oshibka: (x) => typeof x === 'string' && x.includes('архив') },
  });

                                           
  await sluchaj('в архив', 'POST', '/api/arhiv', {
    parametry: { telo: { tablica: 'ljudi', id, versija: (await zapros('GET','/api/ljudi/'+id)).telo.versija } },
    zhdjom_kod: 200,
    zhdjom: { arhiv: true, arhiv_s: (x) => typeof x === 'string' && x.length > 0 },
  });
  const bez_arhiva = await zapros('GET', '/api/ljudi');
  proverit('архивного нет в обычном списке',
    !(bez_arhiva.telo.spisok || []).some((c) => c.id === id),
    bez_arhiva.telo.vsego);
  const s_arhivom = await zapros('GET', '/api/ljudi?arhiv=1');
  proverit('архивный виден с arhiv=1',
    (s_arhivom.telo.spisok || []).some((c) => c.id === id),
    s_arhivom.telo.vsego);

                                                                             
                                                                   
                              
  await sluchaj('задача в несуществующем направлении', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Проба', napravlenie: 'vydumka', otvetstvennyj: 1 } },
    zhdjom_kod: 400,
    zhdjom: { pole: 'napravlenie' },
  });

                                                     
    
                                                                
                                                                   
                                                              
  const kod_proby = `proba${Date.now().toString().slice(-6)}`;
  await sluchaj('новое направление', 'POST', '/api/napravlenija', {
    parametry: { telo: { kod: kod_proby, nazvanie: 'Проба направления', porjadok: 99 } },
    zhdjom_kod: 201,
  });
  await sluchaj('задача в новом направлении', 'POST', '/api/zadachi', {
    parametry: { telo: { nazvanie: 'Проба в новом', napravlenie: kod_proby, otvetstvennyj: 1 } },
    zhdjom_kod: 201,
    zhdjom: { napravlenie: kod_proby },
  });
                                                                     
                                                                
  await sluchaj('тот же код направления занят', 'POST', '/api/napravlenija', {
    parametry: { telo: { kod: kod_proby, nazvanie: 'Второй раз', porjadok: 99 } },
    zhdjom_kod: 409,
    zhdjom: { pole: 'kod' },
  });
                                                                       
                                                                   
                                                                   
  await zapros('PATCH', `/api/napravlenija/${kod_proby}`,
    { telo: { arhiv: true, versija: 1 } });

                                                                        
                                                           
  await sluchaj('фильтр komanda=true', 'GET', '/api/ljudi?komanda=true', {
    zhdjom_kod: 200,
    zhdjom: { vsego: (n) => Number.isInteger(n) },
  });
  await sluchaj('фильтр komanda=1', 'GET', '/api/ljudi?komanda=1', { zhdjom_kod: 200 });
  await sluchaj('фильтр komanda=false', 'GET', '/api/ljudi?komanda=false', { zhdjom_kod: 200 });
  const svoi = await zapros('GET', '/api/ljudi?komanda=true');
  const chuzhie = await zapros('GET', '/api/ljudi?komanda=false');
  proverit('true и false дают разные выборки',
    svoi.telo.vsego !== chuzhie.telo.vsego || svoi.telo.vsego === 0,
    { komanda: svoi.telo.vsego, vneshnie: chuzhie.telo.vsego });
  await sluchaj('мусор в логическом фильтре', 'GET', '/api/ljudi?komanda=musor', {
    zhdjom_kod: 400, zhdjom: { pole: 'komanda' },
  });

                                           
  await sluchaj('ручки нет в каноне', 'GET', '/api/vydumannaja', { zhdjom_kod: 404 });
  await sluchaj('действия нет у ручки', 'GET', '/api/ljudi/1/vydumannoe', { zhdjom_kod: 404 });
  await sluchaj('хвост длиннее канона', 'GET', '/api/ljudi/1/istorija/eschjo', { zhdjom_kod: 404 });
                                                           
                                                                
                                            
  {
    const { BAZOVYE } = require('../../api/kanon.js');
    const dyry = [];
    for (const r of BAZOVYE) {
      const o = await zapros('GET', `/api/${r}`).catch(() => null);
      if (o && o.kod === 501) dyry.push(r);
    }
    proverit('ни одной ручки канона без кода', dyry.length === 0,
             `без кода: ${dyry.join(', ')}`);
  }

  return { id };
};
