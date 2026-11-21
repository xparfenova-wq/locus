                                                                        
                                                                          
const ADRES = process.env.LOCUS || 'http://127.0.0.1:8790';
if (process.env.LOCUS_TEST_AUTH !== '1' || !process.env.LOCUS_BAZA
    || require('node:path').basename(process.env.LOCUS_BAZA) === 'locus.db'
    || !['127.0.0.1', 'localhost'].includes(new URL(ADRES).hostname)) {
  throw new Error('Запусти tests/progon.sh: записи разрешены только на отдельном тестовом сервере');
}
let vsego = 0;
let upalo = 0;
const promahi = [];

async function zapros(metod, put, { telo, avtor = 2, bez_avtora } = {}) {
  const zagolovki = { 'content-type': 'application/json' };
  if (!bez_avtora) zagolovki['x-locus-chelovek'] = String(avtor);
  const otvet = await fetch(ADRES + put, {
    method: metod,
    headers: zagolovki,
    body: telo === undefined ? undefined : JSON.stringify(telo),
  });
  let dannye = null;
  try { dannye = await otvet.json(); } catch { dannye = null; }
  return { kod: otvet.status, telo: dannye };
}

function proverit(imja, uslovie, chto_est) {
  vsego += 1;
  if (uslovie) return true;
  upalo += 1;
  promahi.push(`${imja}\n    получили: ${JSON.stringify(chto_est)}`);
  return false;
}

async function sluchaj(imja, metod, put, opisanie) {
  const { zhdjom_kod, zhdjom, net, parametry, ne_kritichno } = opisanie;
  const o = await zapros(metod, put, parametry || {});
                                                                          
                                                                    
                                                                     
  const kritichnyj = !ne_kritichno && zhdjom_kod !== undefined
    && zhdjom_kod >= 200 && zhdjom_kod < 300;
  if (zhdjom_kod !== undefined) {
    proverit(`${imja}: код ${zhdjom_kod}`, o.kod === zhdjom_kod, o);
  }
  if (zhdjom) {
    for (const [k, v] of Object.entries(zhdjom)) {
      const est = k.split('.').reduce((a, ch) => (a == null ? a : a[ch]), o.telo);
      const sovpalo = typeof v === 'function' ? v(est) : est === v;
      proverit(`${imja}: ${k} = ${typeof v === 'function' ? 'условие' : v}`, sovpalo, est);
    }
  }
  if (net) {
    for (const k of net) {
      const est = k.split('.').reduce((a, ch) => (a == null ? a : a[ch]), o.telo);
      proverit(`${imja}: поля ${k} быть не должно`, est === undefined, est);
    }
  }
  if (kritichnyj && o.kod !== zhdjom_kod) {
    throw new Error(`${imja}: ждали ${zhdjom_kod}, получили ${o.kod} `
      + `${JSON.stringify(o.telo).slice(0, 200)}. Дальше проверять нечего`);
  }
  return o;
}

                                                                          
                                                           
async function nado(metod, put, parametry) {
  const o = await zapros(metod, put, parametry);
  if (o.kod >= 400) {
    throw new Error(`${metod} ${put} отдал ${o.kod}: `
      + `${JSON.stringify(o.telo).slice(0, 200)}`);
  }
  return o;
}

const MOSCOW_DAY = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
function moskovskijDen(instant=Date.now()) {return MOSCOW_DAY.format(new Date(instant));}
module.exports = { zapros, nado, proverit, sluchaj, itog, ADRES, moskovskijDen };

function itog(zagolovok) {
  console.log(`\n${zagolovok}`);
  console.log(`проверок: ${vsego}, не прошло: ${upalo}`);
  if (promahi.length) {
    console.log('\nне прошло:');
    promahi.forEach((p) => console.log('  ' + p));
  }
  return upalo;
}
