                                               
  
                                                                        
                                                              
                                                              
                                                               
                                                                     
  
                                                                   
                                                                

                                                                     
                                                         
                                                       
                                                           
                                                         
                        
const MESTA = {
  synapt:          [0.215, 0.145],                          
  media:           [0.362, 0.355],                            
  assist:          [0.412, 0.355],
  automy:          [0.642, 0.285],                         
  automy_junior:   [0.692, 0.285],
  platforma:       [0.500, 0.640],                             
  anton:           [0.075, 0.500],                                
  nastavnichestvo: [0.930, 0.215],                           
};

                                                     
                                                 
const SVJAZI = [
  ['anton', 'synapt'], ['anton', 'media'], ['anton', 'platforma'],
  ['synapt', 'automy'], ['automy', 'automy_junior'],
  ['automy_junior', 'nastavnichestvo'], ['nastavnichestvo', 'assist'],
  ['assist', 'platforma'], ['media', 'automy'], ['assist', 'synapt'],
];

                                                                    
                                                                         
function korotkoe(n) {
  const polnoe = n.nazvanie || n.imja || n.kod;
  return polnoe.split(/[,(]/)[0].trim();
}

const NS = 'http://www.w3.org/2000/svg';
function el(imja, svojstva) {
  const e = document.createElementNS(NS, imja);
  for (const k in svojstva) e.setAttribute(k, svojstva[k]);
  return e;
}

                                              
                                                                 
function karta(napr, { shirina = 560, vysota = 560, kletka = true } = {}) {
  const po_kodu = {};
  napr.forEach((n) => { po_kodu[n.kod] = n; });
  const toch = (kod) => {
    const m = MESTA[kod];
    return m ? [m[0] * shirina, m[1] * vysota] : null;
  };

  const svg = el('svg', { viewBox: `0 0 ${shirina} ${vysota}`,
                          class: 'krt', 'aria-hidden': 'true' });

                                                     
  const shag = Math.round(shirina / 14);
  const uzor = el('pattern', { id: 'krt-kletka', width: shag, height: shag,
                               patternUnits: 'userSpaceOnUse' });
  uzor.appendChild(el('path', { d: `M ${shag} 0 L 0 0 0 ${shag}`,
                                fill: 'none', stroke: 'var(--lin)', 'stroke-width': 1 }));
  const defs = el('defs', {});
  defs.appendChild(uzor);
  svg.appendChild(defs);
  if (kletka) {
                                                               
    svg.appendChild(el('rect', { x: -shag, y: -shag,
                                 width: shirina + shag * 2, height: vysota + shag * 2,
                                 fill: 'url(#krt-kletka)', class: 'krt-f' }));
  }

                                             
  const sloj_linij = el('g', { class: 'krt-linii' });
  SVJAZI.forEach(([a, b], i) => {
    const ta = toch(a), tb = toch(b);
    if (!ta || !tb) return;
                                                              
                                                                
                                          
    const d = `M ${ta[0]} ${ta[1]} L ${tb[0]} ${ta[1]} L ${tb[0]} ${tb[1]}`;
    const l = el('path', { d, fill: 'none',
                           stroke: '#e4e4e8', 'stroke-width': 0.8,
                           'stroke-linejoin': 'round',
                           class: 'krt-l', style: `--z:${i}` });
    sloj_linij.appendChild(l);
  });
  svg.appendChild(sloj_linij);

  const sloj_tochek = el('g', { class: 'krt-tochki' });
  napr.forEach((n, i) => {
    const t = toch(n.kod);
    if (!t) return;
    const g = el('g', { class: 'krt-t', style: `--z:${i}`, 'data-napr': n.kod });
    const cvet = n.cvet || 'var(--t3)';
                                                                 
                                           
                                                               
                                                              
    g.appendChild(el('circle', { cx: t[0], cy: t[1], r: 8.5,
                                 fill: cvet, class: 'krt-jadro' }));
                                                                  
                                                            
    sloj_tochek.appendChild(g);
  });
  svg.appendChild(sloj_tochek);
  return svg;
}

                                                      
                                                           
function znak(px = 28, cveta = ['#7182CB', '#FF6716', '#FFC93C']) {
  const svg = el('svg', { viewBox: '0 0 28 28', width: px, height: px,
                          class: 'znk', 'aria-label': 'Locus' });
  svg.appendChild(el('path', { d: 'M 6 20 L 14 8 L 22 17', fill: 'none',
                               stroke: 'currentColor', 'stroke-width': 1.4,
                               'stroke-linecap': 'round', opacity: '.28' }));
  [[6, 20], [14, 8], [22, 17]].forEach(([x, y], i) => {
    svg.appendChild(el('circle', { cx: x, cy: y, r: 3.2, fill: cveta[i] }));
  });
  return svg;
}

                                                      
                                                      
                                                       
function polosa(napr, tekuschee) {
  const svg = el('svg', { viewBox: '0 0 560 44', class: 'krt-pol',
                          'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const x = (i) => 26 + i * (508 / Math.max(1, napr.length - 1));
  const y = (kod) => 22 + (MESTA[kod] ? (MESTA[kod][1] - 0.5) * 22 : 0);

  for (let i = 0; i < napr.length - 1; i++) {
    svg.appendChild(el('line', { x1: x(i), y1: y(napr[i].kod),
                                 x2: x(i + 1), y2: y(napr[i + 1].kod),
                                 stroke: 'var(--lin)', 'stroke-width': 1 }));
  }
  napr.forEach((n, i) => {
    const on = n.kod === tekuschee;
    svg.appendChild(el('circle', { cx: x(i), cy: y(n.kod), r: on ? 4.5 : 2.8,
      fill: n.cvet || 'var(--t3)', opacity: on ? '1' : '.3',
      class: 'krt-pt', 'data-napr': n.kod }));
  });
  return svg;
}

window.KARTA = { karta, znak, polosa, korotkoe, MESTA, SVJAZI };
