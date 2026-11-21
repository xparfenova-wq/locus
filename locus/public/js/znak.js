                                      
                                                                   

                                                                      
const UZLY = [
  { x: 1, y: 5, cvet: 'var(--dir-synapt)' },
  { x: 1, y: 2, cvet: 'var(--dir-media)' },
  { x: 3, y: 2, cvet: 'var(--dir-automy)' },
  { x: 3, y: 4, cvet: 'var(--dir-junior)' },
  { x: 5, y: 4, cvet: 'var(--dir-mentor)' },
  { x: 5, y: 1, cvet: 'var(--dir-brand)' },
];

                                                                  
                                   
function put(uzly, shag) {
  const t = (u) => [u.x * shag, u.y * shag];
  let d = '';
  uzly.forEach((u, i) => {
    const [x, y] = t(u);
    if (i === 0) { d += `M ${x} ${y}`; return; }
    const [px, py] = t(uzly[i - 1]);
                                                 
    if (px !== x && py !== y) d += ` L ${px} ${y} L ${x} ${y}`;
    else d += ` L ${x} ${y}`;
  });
  return d;
}

function narisovat({ razmer = 56, setka, radius, uzly = UZLY } = {}) {
  const kletok = 6;
  const shag = razmer / kletok;
                                                                       
                                                                 
                           
  if (setka === undefined) setka = razmer >= 40;
  if (radius === undefined) radius = Math.max(2.2, razmer * 0.09);
  const tolschina = Math.max(1.5, razmer * 0.035);
  const linii = [];
  if (setka) {
    for (let i = 0; i <= kletok; i += 1) {
      const p = i * shag;
      linii.push(`<line x1="0" y1="${p}" x2="${razmer}" y2="${p}"/>`);
      linii.push(`<line x1="${p}" y1="0" x2="${p}" y2="${razmer}"/>`);
    }
  }
  const d = put(uzly, shag);
  const tochki = uzly.map((u) =>
    `<circle class="znak-tochka" cx="${u.x * shag}" cy="${u.y * shag}" r="${radius}" fill="${u.cvet}"/>`
  ).join('');

  return `<svg class="znak-svg" width="${razmer}" height="${razmer}"
    viewBox="-${radius + 1} -${radius + 1} ${razmer + radius * 2 + 2} ${razmer + radius * 2 + 2}"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${setka ? `<g class="znak-setka">${linii.join('')}</g>` : ''}
    <path class="znak-svjaz" d="${d}" stroke-width="${tolschina}"/>
    ${tochki}
  </svg>`;
}

                                                         
function ozhivit(korenj) {
  const put_el = korenj.querySelector('.znak-svjaz');
  if (!put_el) return;
  const dlina = Math.ceil(put_el.getTotalLength());
  korenj.style.setProperty('--dlina', dlina);
  korenj.classList.add('znak-ozhivaet', 'znak-sobran');
}

function vstavit(kuda, nastrojki) {
  kuda.innerHTML = narisovat(nastrojki);
  kuda.classList.add('znak');
  return kuda;
}

if (typeof window !== 'undefined') {
  window.ZnakLokusa = { narisovat, ozhivit, vstavit, UZLY };
}
