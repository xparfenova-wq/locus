const {moskovskijDen}=require('../prover.js');
                                    
                                                                    
                                                                        
const { zapros, nado, sluchaj, proverit } = require('../prover.js');

module.exports = async function () {
  const ja = (await nado('POST', '/api/ljudi', { telo: { imja: 'Вика Медиа' } })).telo.id;

  const publikacija = (telo) => nado('POST', '/api/zadachi', {
    telo: { napravlenie: 'media', otvetstvennyj: ja, publikacija: true,
            sprint: 43, ...telo },
  });

  await publikacija({ nazvanie: 'Пост про чекап', ploshadka: 'telegram',
    format: 'post', rubrika: 'ekspertiza', data_vyhoda: '2026-10-24', srok: '2026-10-24' });
  await publikacija({ nazvanie: 'Рилс со съёмки', ploshadka: 'instagram',
    format: 'rils', rubrika: 'zakulise', data_vyhoda: '2026-10-24', srok: '2026-10-24' });
  await publikacija({ nazvanie: 'Сторис анонс', ploshadka: 'instagram',
    format: 'storis', rubrika: 'anons', data_vyhoda: '2026-10-25', srok: '2026-10-25' });
                                                       
  await nado('POST', '/api/zadachi', {
    telo: { nazvanie: 'Смонтировать ролик', napravlenie: 'media',
            otvetstvennyj: ja, srok: '2026-10-24', sprint: 43 },
  });

  const plan = await sluchaj('контент-план', 'GET', '/api/kontent?den=2026-10-24&dnej=3', {
    zhdjom_kod: 200,
    zhdjom: { den: '2026-10-24' },
  });

                                                                      
                                                                     
                                                                     
                                                                  
                                                   
  const moi = (istochnik) => (istochnik || [])
    .flatMap((d) => d.zadachi.filter((z) => z.otvetstvennyj === ja)
      .map((z) => z.nazvanie));
  const skolko_moih = (d) => (d ? d.zadachi
    .filter((z) => z.otvetstvennyj === ja).length : null);

                                                      
  const vse = moi(plan.telo.dni);
  proverit('задача без галочки не в плане', !vse.includes('Смонтировать ролик'), vse);
  proverit('публикации в плане', vse.length === 3, vse);

                      
  const den24 = (plan.telo.dni || []).find((d) => d.data === '2026-10-24');
  const den25 = (plan.telo.dni || []).find((d) => d.data === '2026-10-25');
  proverit('24 октября две публикации', skolko_moih(den24) === 2, skolko_moih(den24));
  proverit('25 октября одна', skolko_moih(den25) === 1, skolko_moih(den25));

                                                      
  proverit('в ленте три дня', (plan.telo.dni || []).length === 3, (plan.telo.dni || []).length);

                                                
  const po = async (hvost) => {
    const r = await zapros('GET', `/api/kontent?den=2026-10-24&dnej=3&${hvost}`);
    return moi(r.telo.dni);
  };

  const instagram = await po('ploshadka=instagram');
  proverit('фильтр по площадке',
    instagram.length === 2 && !instagram.includes('Пост про чекап'), instagram);

  const reels = await po('format=rils');
  proverit('фильтр по формату', reels.length === 1 && reels[0] === 'Рилс со съёмки', reels);

  const anons = await po('rubrika=anons');
  proverit('фильтр по рубрике', anons.length === 1 && anons[0] === 'Сторис анонс', anons);

  const para = await po('ploshadka=telegram&format=post');
  proverit('два фильтра вместе', para.length === 1 && para[0] === 'Пост про чекап', para);

  const nikogo = await po('ploshadka=instagram&format=post');
  proverit('несовпадающая пара даёт пусто', nikogo.length === 0, nikogo);

                                                       
  proverit('площадки собраны из задач',
    (plan.telo.filtry.ploshadka || []).includes('instagram')
      && (plan.telo.filtry.ploshadka || []).includes('telegram'),
    plan.telo.filtry.ploshadka);
  proverit('форматы собраны из задач',
    (plan.telo.filtry.format || []).length >= 3, plan.telo.filtry.format);

                             
  const segodnja = moskovskijDen();
  const plan2 = await zapros('GET', `/api/kontent?den=${segodnja}&dnej=2`);
  proverit('сегодняшний день помечен',
    (plan2.telo.dni || [])[0]?.segodnja === true, (plan2.telo.dni || [])[0]);

  await sluchaj('кривая дата', 'GET', '/api/kontent?den=24.10.2026', { zhdjom_kod: 400 });

  return { ja };
};
