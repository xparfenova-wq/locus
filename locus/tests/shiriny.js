                                                                       
  
                                                                      
                                                                  
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const SKILL = path.join(process.env.HOME,
  '.claude/skills/browser-automation/browser.mjs');
const ADRES = process.env.LOCUS || 'http://127.0.0.1:8790';

const SCENARIJ = `
export default async function (page) {
  const itog = {};
  for (const [imja, shirina] of [['desktop', 1440], ['telefon', 390]]) {
    await page.setViewportSize({ width: shirina, height: 900 });
    await page.waitForTimeout(200);
    itog[imja] = await page.evaluate(() => {
      const d = document.documentElement;
      const r = (s) => { const e = document.querySelector(s);
                         return e ? e.getBoundingClientRect() : null; };
      const daty = [...document.querySelectorAll('.stroka .stroka-data')]
        .map((e) => Math.round(e.getBoundingClientRect().right));
      const avatary = [...document.querySelectorAll('.stroka .avatar')]
        .map((e) => Math.round(e.getBoundingClientRect().right));
      const celi = [...document.querySelectorAll('.knopka, .pole, .chip')]
        .map((e) => e.getBoundingClientRect().height);
      return {
        shirina: innerWidth,
        skroll: d.scrollWidth > d.clientWidth + 1,
        daty_v_kolonku: new Set(daty).size === 1,
        avatary_v_kolonku: new Set(avatary).size === 1,
        menshe_44: celi.filter((h) => h > 0 && h < 44).length,
        stroka: r('.stroka') ? Math.round(r('.stroka').height) : null,
        strok: document.querySelectorAll('.stroka').length,
      };
    });
  }
  return itog;
}
`;

function prognat(put) {
  const fajl = path.join(require('node:os').tmpdir(), 'shiriny-scenarij.mjs');
  fs.writeFileSync(fajl, SCENARIJ);
  const vyhod = execFileSync('node', [SKILL, ADRES + put, '--script', fajl],
    { encoding: 'utf8', timeout: 90000 });
  const m = vyhod.match(/script\s+(\{[\s\S]*?\n\})/);
  if (!m) throw new Error('не получил результат:\n' + vyhod.slice(-500));
  return JSON.parse(m[1]);
}

const STRANICY = ['/komponenty.html', '/ekran-zadachi.html', '/znak.html'];
let upalo = 0;

function proverit(imja, uslovie, chto) {
  if (uslovie) return;
  upalo += 1;
  console.log(`  не прошло: ${imja}\n    получили: ${JSON.stringify(chto)}`);
}

for (const put of STRANICY) {
  console.log(`\n${put}`);
  const r = prognat(put);
  for (const [vid, d] of Object.entries(r)) {
    proverit(`${vid}: нет горизонтального скролла`, !d.skroll, d);
                                                          
    if (d.strok > 0) {
      proverit(`${vid}: даты в одной колонке`, d.daty_v_kolonku, d);
      proverit(`${vid}: аватары в одной колонке`, d.avatary_v_kolonku, d);
    }
    if (vid === 'telefon') {
      proverit('телефон: цели не меньше 44px', d.menshe_44 === 0, d.menshe_44);
    }
    console.log(`  ${vid}: ширина ${d.shirina}, строка ${d.stroka}px, ` +
                `скролл ${d.skroll ? 'есть' : 'нет'}`);
  }
}

console.log(`\nширины: не прошло ${upalo}`);
process.exitCode = upalo ? 1 : 0;
