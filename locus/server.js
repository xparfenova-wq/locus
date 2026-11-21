                                
                                                        
                                                                    

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { baza, v_odnoj_tranzakcii, OshibkaVvoda } = require('./db/db.js');
const pravilaOtveta = require('./api/pravila-otveta.js');
const obschij = require('./api/obschij.js');
const { OPISANIJA } = require('./api/opisanija.js');
const { PODRUCHKI_KODA: PODRUCHKI_BAZA, OTDELNYE } = require('./api/podruchki.js');
const p2 = require('./api/podruchki2.js');

                                                              
                                                                
const PODRUCHKI_KODA = {
  arhiv: Object.fromEntries(['predprosmotr','proverka','otmena_popytki','otmenit'].map(dejstvie=>[dejstvie,ctx=>require('./api/komandy-arhiva.js').handle({...ctx,dejstvie})])),
  ...PODRUCHKI_BAZA,
                                                              
                                      
  ljudi: { ...(PODRUCHKI_BAZA.ljudi || {}), kasanija: p2.ljudi_kasanija },
  okr: { celi: p2.okr_celi, rezultaty: p2.okr_rezultaty, zamery: p2.okr_zamery,
         vehi: p2.okr_vehi, zadachi: p2.okr_zadachi,
         rezultat: p2.okr_rezultat,
         periody: p2.okr_periody, zakryt: p2.okr_zakryt,
         ...(PODRUCHKI_BAZA.okr || {}) },
  celi: { redaktor: ctx=>require('./api/pravki-celej.js').handle(ctx), pravka_proverka: ctx=>require('./api/pravki-celej.js').handle(ctx), pravka_otmena_popytki: ctx=>require('./api/pravki-celej.js').handle(ctx), pravka_otmenit: ctx=>require('./api/pravki-celej.js').handle(ctx), dekompozicija: p2.celi_dekompozicija,
          plany_periodov: ctx=>require('./api/plany-periodov-okr.js').handle({...ctx,dejstvie:'plany_periodov'}),
          plany_periodov_proverka: ctx=>require('./api/plany-periodov-okr.js').handle({...ctx,dejstvie:'plany_periodov_proverka'}),
          plany_periodov_otmena_popytki: ctx=>require('./api/plany-periodov-okr.js').handle({...ctx,dejstvie:'plany_periodov_otmena_popytki'}),
          plany_periodov_otmenit: ctx=>require('./api/plany-periodov-okr.js').handle({...ctx,dejstvie:'plany_periodov_otmenit'}),
          po_kvartalam: p2.celi_po_kvartalam, ...(PODRUCHKI_BAZA.celi || {}) },
  rezultaty: { proverit_formulu: p2.rezultaty_proverit_formulu,
               ...(PODRUCHKI_BAZA.rezultaty || {}) },
  rassylki: { proverka_plana:ctx=>require('./api/plan-kampanii.js').handle({...ctx,dejstvie:'proverka_plana'}),otmena_plana:ctx=>require('./api/plan-kampanii.js').handle({...ctx,dejstvie:'otmena_plana'}),istochniki:ctx=>require('./api/kampanii.js').handle({...ctx,dejstvie:'istochniki'}),
              predprosmotr_sozdanija:ctx=>require('./api/kampanii.js').handle({...ctx,dejstvie:'predprosmotr_sozdanija'}),
              proverka:ctx=>require('./api/kampanii.js').handle({...ctx,dejstvie:'proverka'}),
              otmena_popytki:ctx=>require('./api/kampanii.js').handle({...ctx,dejstvie:'otmena_popytki'}),
              predprosmotr_dopolnenija:ctx=>require('./api/volny-rassylok.js').previewAddition(ctx),
              dopolnit_volnu:ctx=>require('./api/volny-rassylok.js').addRecipients(ctx),
              predprosmotr_volny:ctx=>require('./api/volny-rassylok.js').preview(ctx),
              proverka_dejstvija:ctx=>require('./api/volny-rassylok.js').check(ctx),
              otmena_dejstvija:ctx=>require('./api/volny-rassylok.js').cancel(ctx),
              svodka: p2.rassylki_svodka, ljudi: p2.rassylki_ljudi,
              kontakty: p2.rassylki_kontakty, zadachi: p2.rassylki_zadachi,
              komu_pisat: p2.rassylki_komu_pisat, nedeli: p2.rassylki_nedeli,
              volna: p2.rassylki_volna,
              statusy: p2.rassylki_statusy,
              predprosmotr_udalenija: p2.rassylki_predprosmotr_udalenija,
              ...(PODRUCHKI_BAZA.rassylki || {}) },
  nedeli: { ...(PODRUCHKI_BAZA.nedeli || {}), rassylki: p2.nedeli_rassylki_s_dolgom },
  napravlenija: { strategija: p2.napr_strategija, materialy: p2.napr_materialy,
                  vkladki: p2.napravlenija_vkladki, porjadok: p2.napravlenija_porjadok,
                  akkaunty: p2.napr_akkaunty, svoi_znachenija: p2.napr_svoi_znachenija,
                  vizity: p2.napr_vizity, ...(PODRUCHKI_BAZA.napravlenija || {}) },
  akkaunty: { korzina: ctx=>{if(ctx.metod!=='GET')return{kod:405,telo:{oshibka:'сюда только GET'}};if(ctx.kljuch)return{kod:404,telo:{oshibka:'корзина относится к списку аккаунтов'}};return{telo:require('./api/akkaunt-korzina.js').list(ctx.zapros)};}, proverka: ctx=>{if(ctx.metod!=='GET')return{kod:405,telo:{oshibka:'сюда только GET'}};if(ctx.kljuch)return{kod:404,telo:{oshibka:'проверка относится к запросу, не к номеру аккаунта'}};return{telo:require('./api/sozdanie-akkaunta.js').check(ctx.zapros,ctx.avtor)};}, dlja_zadachi: p2.akkaunty_dlja_zadachi, metriki: p2.akkaunty_metriki,
              pokazatel: p2.akkaunty_pokazatel,
              prinjat_sbor: ctx=>require('./api/sbor.js').prinjat(ctx),
              sobrat: p2.akkaunty_sobrat, ...(PODRUCHKI_BAZA.akkaunty || {}) },
  publikacii: { zamery: p2.publikacii_zamery, ...(PODRUCHKI_BAZA.publikacii || {}) },
  planerka: { snimok: p2.planerka_snimok, vse: p2.planerka_vse,
    snimok_predprosmotr: ctx=>require('./api/komandy-snimka.js').handle({...ctx,dejstvie:'snimok_predprosmotr'}),
    snimok_proverka: ctx=>require('./api/komandy-snimka.js').handle({...ctx,dejstvie:'snimok_proverka'}),
    snimok_otmena_popytki: ctx=>require('./api/komandy-snimka.js').handle({...ctx,dejstvie:'snimok_otmena_popytki'}),
    snimok_otmenit: ctx=>require('./api/komandy-snimka.js').handle({...ctx,dejstvie:'snimok_otmenit'}),
    snimok_istorija: ctx=>require('./api/komandy-snimka.js').handle({...ctx,dejstvie:'snimok_istorija'}),
              ...(PODRUCHKI_BAZA.planerka || {}) },
  onbording: { shag: p2.onbording_shag, sbros: p2.onbording_sbros,
               ...(PODRUCHKI_BAZA.onbording || {}) },
  podskazki: { skryt: p2.podskazki_skryt, peregruz: p2.podskazki_peregruz,
               ...(PODRUCHKI_BAZA.podskazki || {}) },
  nastrojki: { proverka:ctx=>require('./api/nastrojki-komandy.js').read(ctx),otmena_popytki:ctx=>require('./api/nastrojki-komandy.js').cancel(ctx),vid: p2.nastrojki_vid, bot: p2.nastrojki_bot,
               ...(PODRUCHKI_BAZA.nastrojki || {}) },
  meta: { napravlenija: p2.meta_napravlenija, filtry_zadach: p2.meta_filtry_zadach,
          ...(PODRUCHKI_BAZA.meta || {}) },
                                                                   
                               
  sostojanija: { moe: require('./api/ekrany2.js').sostojanija_moe,
                 komanda: require('./api/ekrany2.js').sostojanija_komanda,
                 ...(PODRUCHKI_BAZA.sostojanija || {}) },
                                                                    
                                                          
                                                                   
                                       
  strategija: { tezisy: require('./api/ekrany2.js').strategija_tezisy,
                zadachi: p2.strategija_zadachi,
                cel: require('./api/ekrany2.js').strategija_cel,
                ...(PODRUCHKI_BAZA.strategija || {}) },
  grafik: { ...Object.fromEntries(['predprosmotr','proverka','otmena_popytki','otmenit','otmena_proverka','poslednee_dejstvie'].map(dejstvie=>[dejstvie,ctx=>require('./api/komandy-grafika.js').handle({...ctx,dejstvie})])), kopirovat:ctx=>require('./api/komandy-grafika.js').run(ctx,'kopirovat'), svodka: p2.grafik_svodka, sohranit:ctx=>require('./api/komandy-grafika.js').run(ctx,'sohranit'),
            ...(PODRUCHKI_BAZA.grafik || {}) },
  moe_prostranstvo: { grafik: p2.moe_prostranstvo_grafik,
                      ...(PODRUCHKI_BAZA.moe_prostranstvo || {}) },
                                                              
                                                  
                                                                
                                                               
                                 
                                                              
                                                                   
                                                          
                                                               
  vhod: {
    parol: (ctx) => require('./api/ekrany.js').vhod({ ...ctx, kljuch: 'parol' }),
    proverit: (ctx) => require('./api/ekrany.js').vhod({ ...ctx, kljuch: 'proverit' }),
    vyjti: (ctx) => require('./api/ekrany.js').vhod({ ...ctx, kljuch: 'vyjti' }),
  },
  bazy: { sostojanie_stroki:p2.bazy_sostojanie_stroki, predprosmotr_zagruzki:ctx=>require('./api/import-bazy.js').preview(ctx), materialy:ctx=>require('./api/bazy-pravki.js').attachments(ctx), proverka:ctx=>require('./api/bazy-pravki.js').check(ctx), otmena_popytki:ctx=>require('./api/bazy-pravki.js').cancel(ctx), porjadok_statusov:ctx=>require('./api/bazy-pravki.js').order(ctx), kontakty: p2.bazy_kontakty, zagruzka: p2.bazy_zagruzka,
          statusy: p2.bazy_statusy, ljudi: p2.bazy_ljudi,
          voronka: p2.bazy_voronka, vygruzka: p2.bazy_vygruzka,
          svoi_polja: p2.bazy_svoi_polja,
          svodka: (ctx) => require('./api/ekrany3.js').bazy_svodka(ctx),
          ...(PODRUCHKI_BAZA.bazy || {}) },
  proekty: { ...(PODRUCHKI_BAZA.proekty||{}), statistika:ctx=>require('./api/statistika-proekta.js').summary(ctx), ...Object.fromEntries(['zavershit','vozobnovit','arhiv'].map(dejstvie=>[dejstvie,ctx=>require('./api/dejstvija-proekta.js').run({...ctx,dejstvie})])), proverka_dejstvija:ctx=>require('./api/dejstvija-proekta.js').read(ctx),otmena_dejstvija:ctx=>require('./api/dejstvija-proekta.js').cancel(ctx), proverka_pravki:ctx=>require('./api/pravka-proekta.js').read(ctx), otmena_pravki:ctx=>require('./api/pravka-proekta.js').cancel(ctx) },
  fajly: { skachat: p2.fajly_skachat, privjazki: p2.fajly_privjazki,
           ...(PODRUCHKI_BAZA.fajly || {}) },
                                          
                                                               
  zadachi: { ...(PODRUCHKI_BAZA.zadachi || {}),...require('./api/istochnik-publikacii-zadachi.js').actions, fakt: p2.zadachi_fakt,
             pohozhie: p2.zadachi_pohozhie },
                                                              
                                                       
  dengi: { ...(PODRUCHKI_BAZA.dengi || {}), svodka: p2.dengi_svodka_po_uslugam },
};

                                                       
const OBERTKI = {
  bazy:ctx=>require('./api/bazy-pravki.js').root(ctx),
                                                                   
  proekty: (ctx) => require('./api/pravka-proekta.js').apply(ctx) || require('./api/sozdanie-proekta.js').handle(ctx) || (ctx.metod === 'GET' && ctx.kljuch
    ? p2.proekt_s_dengami(ctx) : null),
                                                                    
                            
  rassylki: (ctx) => require('./api/plan-kampanii.js').handle(ctx) || require('./api/kampanii.js').handle(ctx) || (ctx.metod === 'GET' && ctx.kljuch && !ctx.dejstvie
    ? p2.rassylka_s_bazoj(ctx) : null),
                                                     
  svodka: (ctx) => (ctx.metod === 'GET' ? p2.svodka_s_tekstom(ctx) : null),
                                         
  nedeli: (ctx) => (ctx.metod === 'GET' && ctx.zapros
    && (ctx.zapros.nedelja || ctx.zapros.sprint) && !ctx.kljuch
    ? p2.nedeli_plan_fakt(ctx) : null),
                                                                 
                                                                   
                                                                
                                                                 
                                                                   
                                                       
  zadachi: (ctx) => (ctx.metod === 'GET' && !ctx.dejstvie
    && ((ctx.zapros && ctx.zapros.nomer) || ctx.kljuch)
    ? p2.zadachi_po_nomeru_s_410(
      ctx.kljuch && !(ctx.zapros && ctx.zapros.nomer)
        ? { ...ctx, zapros: { ...ctx.zapros, nomer: ctx.kljuch } }
        : ctx) : null),
                                                                
                                         
  shablony: (ctx) => require('./api/shablony.js').handle(ctx),
};
const ekrany = require('./api/ekrany.js');
const ekrany2 = require('./api/ekrany2.js');
const ekrany3 = require('./api/ekrany3.js');
const { BAZOVYE, PODRUCHKI } = require('./api/kanon.js');

const PORT = process.env.PORT || 8790;
const HOST = '127.0.0.1';
                                                                        
                                                                       
const TEST_AUTH = process.env.LOCUS_TEST_AUTH === '1';
const POPITKI_VHODA = new Map();
                                                                      
                                                                            
                                                                            
const SESSII_DIAGNOSTIKI = new Map();
if (TEST_AUTH && process.env.NODE_ENV === 'production') {
  throw new Error('LOCUS_TEST_AUTH запрещён в production');
}
const PUBLIC = path.join(__dirname, 'public');
                                                                 
                                                                   
const FAJLY = process.env.LOCUS_FAJLY ? path.resolve(process.env.LOCUS_FAJLY) : path.join(__dirname, 'fajly');
try { fs.mkdirSync(FAJLY, { recursive: true }); } catch {            }

                                                               
                        
const EKRANY = {
  moe_prostranstvo: ekrany.moe_prostranstvo,
  itogi: ekrany.itogi,
  kontent: ekrany.kontent,
  okr: ekrany.okr,
  spravochniki: ekrany.spravochniki,
  sprinty: ekrany.sprinty,
  ekran_zadach: ekrany.ekran_zadach,
  nedeli: ekrany.nedeli,
  svodka: ekrany.svodka,
  poisk: ekrany.poisk,
  uvedomlenija: require('./api/uvedomlenija.js').uvedomlenija,
  nastrojki: ekrany.nastrojki,
  nastrojki_sistemy: ekrany.nastrojki_sistemy,
  vhod: ekrany.vhod,
  sessii: ekrany.sessii,
  dengi: ekrany2.dengi,
  poleznoe: ekrany2.poleznoe,
  fokus: ekrany2.fokus,
  kontekst: ekrany2.kontekst,
  strategija: ekrany2.strategija,
  refleksija: ekrany2.refleksija,
  sostojanija: ekrany2.sostojanija,
  insajty: ekrany2.insajty,
  plashki: ekrany3.plashki,
  podskazki: ekrany3.podskazki,
  onbording: ekrany3.onbording,
  kasanija: ekrany3.kasanija,
  oshibki: ekrany3.oshibki,
  vygruzka: ekrany3.vygruzka,
  zagruzka: ekrany3.zagruzka,
  zagotovka_zadachi: ekrany3.zagotovka_zadachi,
  rassylka: ekrany3.rassylka,
  rassylka_soobshenija: ekrany3.rassylka_soobshenija,
  zapisi: ekrany3.zapisi,
  meta: ekrany3.meta,
  fajly: ekrany3.fajly,
  favicon: ekrany3.favicon,
  planerka: ekrany.planerka,
  otmena: ekrany.otmena,
};

                                                      
                                                       
function avtor_zaprosa(req) {
                                                                  
                                                             
  const po_sessii = sessija_zaprosa(req);
  if (po_sessii !== null) return po_sessii;
  if (!TEST_AUTH && !sluzhebnyj_zapros(req)) return null;
  const h = req.headers['x-locus-chelovek'];
  const id = h ? parseInt(h, 10) : NaN;
  return Number.isInteger(id) ? id : null;
}
function staraja_vkladka(req,res,actor){
  const pageUser=req.headers['x-locus-page-user'];
  if(pageUser===undefined||String(actor)===pageUser)return false;
  res.setHeader('x-locus-session-changed','1');
  otvet(res,409,{oshibka:'В браузере вошли под другим участником. Сохрани текст из открытых полей и обнови страницу.',sessija_izmenilas:true});return true;
}

                                                                     
                                                                   
function sluzhebnyj_zapros(req) {
  const put = new URL(req.url, 'http://localhost').pathname;
  const razresheno = (req.method === 'GET' && put === '/api/napravlenija')
    || (req.method === 'POST' && ['/api/uvedomlenija/po_srokam',
      '/api/planerka/snimok'].includes(put));
  if (!razresheno) return false;
  const est = Buffer.from(String(req.headers['x-locus-service-key'] || ''));
  const nuzhen = Buffer.from(process.env.LOCUS_SERVICE_KEY || '');
  return nuzhen.length >= 32 && est.length === nuzhen.length
    && crypto.timingSafeEqual(est, nuzhen);
}

function otvet_vhoda(req, res, itog) {
  const telo = { ...itog.telo };
  const secure = req.headers['x-forwarded-proto'] === 'https'
    || process.env.NODE_ENV === 'production';
  const flags = '; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '');
  if (telo.sessija) {
    res.setHeader('set-cookie', `locus-sessija=${telo.sessija}; Max-Age=${30 * 86400}${flags}`);
                                                      
    if (!TEST_AUTH) delete telo.sessija;
  }
  if (telo.vyshel) res.setHeader('set-cookie', `locus-sessija=; Max-Age=0${flags}`);
  return otvet(res, itog.kod || 200, telo);
}

function otvet(res, kod, telo) {
                                                                          
                                                                        
                                                                     
  const frozenWeekly=res.locusContext?.tablica==='planerka'&&(res.locusContext.dejstvie?.startsWith('snimok')||!res.locusContext.dejstvie&&telo?.istochnik_otcheta?.vid==='snimok'&&telo.istochnik_otcheta.tolko_chtenie===true);
  if (res.locusContext&&!frozenWeekly) {
    const repeats = require('./api/povtory.js');
    telo = repeats.predstavlenie(baza(), telo, repeats.den_konteksta(res.locusContext.zapros));
    telo = require('./api/sostojanie-zadachi.js').predstavlenie(baza(), telo,{origin:res.locusPublicOrigin,actor:res.locusContext.avtor});
  }
  if (res.locusContext) telo = pravilaOtveta.otvet(baza(), res.locusContext, telo);
  const context=res.locusContext,sections={ljudi:'ljudi',proekty:'proekty',rassylki:'rassylki',celi:'okr'};
  if(context?.metod==='GET'&&!context.dejstvie&&context.kljuch&&sections[context.tablica]&&res.locusPublicOrigin&&telo&&Number.isSafeInteger(telo.id))telo={...telo,url:res.locusPublicOrigin+'/'+sections[context.tablica]+'/'+telo.id};
  const stroka = JSON.stringify(telo, null, kod >= 400 ? 2 : 0);
  res.writeHead(kod, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(stroka);
}

                                                             
                                                               
                                                             
                                                                           
process.on('uncaughtExceptionMonitor',(error)=>{
  try{require('./api/otchety-oshibok.js').automatic({gde:'/process',code:'NODE_FATAL',tekst:'Необработанная ошибка процесса',oshibka:error?.message||'Ошибка процесса'});}catch{}
});

const PRAVILA_BAZY = [
  'в архив убирают завершённый проект',
  'status: одно из',
  'rol: lid, klient или referal',
];

function oshibka(res, e) {
  let kod = e.kod || 500;
  const telo = { oshibka: e.message };
  if (e.pole) telo.pole = e.pole;
  if (e.dannye) Object.assign(telo, e.dannye);

                                                               
                                                                 
                                                                
                                                              
                                        
    
                                                                   
                                                                   
  const unikalnost = String(e.message)
    .match(/UNIQUE constraint failed:\s*([\w.]+)/i);
  if (kod === 500 && unikalnost) {
    const put = unikalnost[1].split('.');
    const pole = put[put.length - 1];
    kod = 409;
    const contact=String(e.message).includes('kontakty.chelovek_id, kontakty.tip, kontakty.znachenie_norm');
    telo.oshibka = contact?'Такой контакт у человека уже есть':`${pole} уже занят`;
    telo.pole = contact?'znachenie':pole;
  } else if (kod === 500
             && PRAVILA_BAZY.some((p) => String(e.message).includes(p))) {
                                                                     
    kod = 409;
  } else if (kod === 500) {
    telo.oshibka = 'не получилось выполнить запрос';
    console.error('500:', e.message, e.stack);
    try{const result=require('./api/otchety-oshibok.js').automatic({...res.locusErrorContext,code:500,kod_oshibki:500,actor:res.locusContext?.avtor,tekst_oshibki:e.message,oshibka:e.message});if(result.logged||result.suppressed)res.setHeader('x-locus-error-logged','1');}catch{}
                                                                  
    res.locusContext=null;
  }
  otvet(res, kod, telo);
}

function prochitat_telo(req) {
  return new Promise((resolve, reject) => {
    const limit = 2 * 1024 * 1024;
    let chunks = [], bytes = 0, settled = false;
    const fail = (text, kod) => {
      if (settled) return;
      settled = true;
      chunks = [];
      reject(Object.assign(new Error(text), { kod }));
    };
                                                                            
                                                                
    req.on('data', chunk => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > limit) return fail('тело больше 2 МБ', 413);
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      if (!bytes) { settled = true; return resolve({}); }
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
          .decode(Buffer.concat(chunks, bytes));
      } catch { return fail('тело не UTF-8', 400); }
      chunks = [];
      let value;
      try { value = JSON.parse(text); }
      catch { return fail('тело не JSON', 400); }
      settled = true;
      resolve(value);
    });
    req.on('aborted', () => fail('тело запроса получено не целиком', 400));
    req.on('error', error => {
      if (settled) return;
      settled = true;
      chunks = [];
      reject(error);
    });
    if (Number(req.headers['content-length']) > limit) {
      fail('тело больше 2 МБ', 413);
      req.resume();
    }
  });
}

                                     
const TIPY = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

                                                               
                                                                   
                                   
  
                                                                   
                             
function razobrat_adres(put, napravlenija) {
  const ch = put.split('/').filter(Boolean);
  if (!ch.length) return { fajl: 'prostranstvo.html' };
  if(ch.length>2)return null;

                                                                  
                                                            
                                                     
  if (ch[0] === 'login' || ch[0] === 'vhod') {
    if (!ch[1]) return { fajl: 'vhod.html', otdat_kak_est: true };
  }

  const PROSTYE = {
    moe: 'prostranstvo.html', zadachi: 'zadachi.html', okr: 'okr.html',
    ljudi: 'ljudi.html', planerka: 'planerka.html', poleznoe: 'poleznoe.html',
    kabinet: 'kabinet.html', napravlenija: 'napravlenija.html',
    vhod: 'vhod.html', login: 'vhod.html', rassylki: 'rassylka.html',
    proekty: 'proekt.html',
  };
  const entity=require('./public/js/task-route-model.js').entity('/'+put);if(entity)return {fajl:entity.page,parametry:{[entity.param]:String(entity.id)},entity,otdat_kak_est:true};

                                                     
  if (ch[0] === 'planerka' && ch[1]) {
    return { fajl: 'planerka.html', parametry: { napravlenie: ch[1] } };
  }
  if (ch[0] === 'poleznoe' && ch[1]) {
    return { fajl: 'poleznoe.html', parametry: { vkladka: ch[1] } };
  }
  if (PROSTYE[ch[0]] && !ch[1]) return { fajl: PROSTYE[ch[0]] };

                                                               
  if (napravlenija.has(ch[0])) {
    if (!ch[1]) return { fajl: 'napravlenija.html', parametry: { napravlenie: ch[0] } };
    if (/^[1-9]\d*$/.test(ch[1])&&Number.isSafeInteger(Number(ch[1]))) {
                                                                             
      return { fajl: 'zadachi.html', parametry: { nomer: ch[1], napravlenie: ch[0] } };
    }
                                                                    
                                                                 
                                          
    const VNUTRI = {
      zadachi: { fajl: 'zadachi.html' },
      kontent: { fajl: 'napravlenija.html', vkladka: 'kontent' },
      strategija: { fajl: 'napravlenija.html', vkladka: 'strategija' },
      planerka: { fajl: 'planerka.html' },
    };
    if (VNUTRI[ch[1]]) {
      const v = VNUTRI[ch[1]];
      const parametry = { napravlenie: ch[0] };
      if (v.vkladka) parametry.vkladka = v.vkladka;
      return { fajl: v.fajl, parametry };
    }
  }
  return null;
}

                                                                     
function sessija_tokena(req) {
  const golova = req.headers.cookie || '';
  const para = golova.split(';').map((s) => s.trim())
    .find((s) => s.startsWith('locus-sessija='));
  try { return para ? decodeURIComponent(para.slice('locus-sessija='.length)) : null; }
  catch { return null; }
}

                                                                     
                                                                 
                                                                       
function sessija_zaprosa(req) {
  const golova = req.headers.cookie || '';
  const para = golova.split(';').map((s) => s.trim())
    .find((s) => s.startsWith('locus-sessija='));
  if (!para) return null;
  let token;
  try { token = decodeURIComponent(para.slice('locus-sessija='.length)); }
  catch { return null; }
  if (!token) return null;
  const cacheKey = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const s = baza().prepare(`SELECT s.chelovek_id, s.istekaet, v.zablokirovan, l.dostup
      FROM sessii s JOIN vhod v ON v.chelovek_id = s.chelovek_id
      JOIN ljudi l ON l.id=s.chelovek_id WHERE s.id = ?`)
      .get(token);
    if (!s || s.zablokirovan) { SESSII_DIAGNOSTIKI.delete(cacheKey); return null; }
    if (!s.istekaet || !Number.isFinite(Date.parse(s.istekaet))
        || Date.parse(s.istekaet) <= Date.now()) { SESSII_DIAGNOSTIKI.delete(cacheKey); return null; }
    if (SESSII_DIAGNOSTIKI.size >= 10000) SESSII_DIAGNOSTIKI.clear();
    SESSII_DIAGNOSTIKI.set(cacheKey, { id: s.chelovek_id, dostup: s.dostup, do: Date.parse(s.istekaet) });
    return s.chelovek_id;
  } catch {
    if (req.method === 'GET' && new URL(req.url, 'http://localhost').pathname === '/api/sostojanie' || ['POST','GET'].includes(req.method) && /^\/api\/oshibki\/?$/.test(new URL(req.url, 'http://localhost').pathname) && (req.method==='POST'||new URL(req.url,'http://localhost').searchParams.has('zapros_kljuch'))) {
      const known = SESSII_DIAGNOSTIKI.get(cacheKey);
      if (known && known.do > Date.now()) {
        req.proverennyjDostupDiagnostiki = known.dostup;
        return known.id;
      }
    }
    return null;
  }
}

                                                                 
                                                                 
                                        
const BEZ_VHODA = new Set(['vhod.html', 'login', 'vhod', 'favicon.ico',
                           'index.html', 'manifest.webmanifest']);

function otkryto_bez_vhoda(put) {
  if (!put) return false;
  if (BEZ_VHODA.has(put)) return true;
                                                                        
  return put.startsWith('css/') || put.startsWith('shrifty/')
    || ['js/api.js', 'js/nedeli.js', 'js/karta.js', 'js/znak.js', 'js/bezopasnyj-html.js',
      'js/vendor/purify.min.js','js/task-route-model.js'].includes(put);
}

function net_kartochki(res,req,table){
  const people=table==='ljudi',goal=table==='celi',href=people?'/ljudi.html':goal?'/okr.html':'/napravlenija.html',label=people?'К людям':goal?'К целям':'К направлениям';
  const html=fs.readFileSync(path.join(PUBLIC,'404.html'),'utf8').replace(/<title>[^<]*<\/title>/,'<title>Карточка не найдена</title>').replace(/<div class="net-z">[\s\S]*?<\/div>/,'<div class="net-z">Не удалось найти карточку</div>').replace(/<div class="net-p">[\s\S]*?<\/div>/,'<div class="net-p">Проверь ссылку или открой нужную карточку из списка</div>').replace('<a class="kn tmn" href="/prostranstvo.html">Вернуться на главную</a>','<a class="kn tmn" href="'+href+'">'+label+'</a>');
  return otdat_html(res,404,html,req);
}
function est_kartochka(table,id,req){
  if(table==='celi'){const visible=pravilaOtveta.vidimost('celi',avtor_zaprosa(req),'c.');return baza().prepare('SELECT c.id FROM celi c WHERE c.id=? AND '+visible.sql).get(id,...visible.args);}
  return baza().prepare('SELECT id FROM '+table+' WHERE id=?').get(id);
}
function kartochka_ili_vosstanovlenie(res,req,table,id){
 if(table==='celi'&&Number.isSafeInteger(id)){const target=require('./api/otmena-okr.js').deletedGoalRoute(baza(),id,avtor_zaprosa(req));if(target){res.writeHead(302,{location:target,'cache-control':'no-store'});res.end();return;}}
 return net_kartochki(res,req,table);
}
function otdat_html(res, kod, html, req) {
  if(kod===200&&req){
    const u=new URL(req.url,'http://localhost'),legacy={'/klient.html':'ljudi','/proekt.html':'proekty','/rassylka.html':'rassylki'},table=u.pathname==='/okr.html'&&u.searchParams.has('cel')?'celi':legacy[u.pathname];
    if(table){const values=u.searchParams.getAll(table==='celi'?'cel':'id'),id=values.length===1&&/^[1-9]\d*$/.test(values[0])?Number(values[0]):null;
      if(!Number.isSafeInteger(id)||!est_kartochka(table,id,req))return kartochka_ili_vosstanovlenie(res,req,table,id);
    }
  }
  const nonce = crypto.randomBytes(24).toString('base64');
                                                                       
                                                                   
                                              
  const scripts = String(html).replace(/<script\b/gi, `<script nonce="${nonce}"`);
  const actor=req?avtor_zaprosa(req):null;
                                                                          
                                                                        
  let errorLogOwner=false;try{if(actor)errorLogOwner=require('./api/dostup.js').tolko_admin(baza(),actor).dostup==='polnyj';}catch{}
  const session=JSON.stringify({chelovek_id:Number.isSafeInteger(actor)&&actor>0?actor:null,error_log_owner:errorLogOwner});
  const boundary = `<script nonce="${nonce}">Object.defineProperty(window,'LocusSessija',{value:Object.freeze(${session}),writable:false,configurable:false});</script>`
    + `<script nonce="${nonce}" src="/js/vendor/purify.min.js"></script>`
    + `<script nonce="${nonce}" src="/js/bezopasnyj-html.js"></script>`
    + `<script nonce="${nonce}" src="/js/task-route-model.js"></script>`;
  res.writeHead(kod, {
    'content-type': TIPY['.html'], 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`,
  });
  res.end(scripts.replace(/<head\b[^>]*>/i, match => match + boundary));
}

function otdat_fajl(res, otnositelnyj, zapros, req) {
  const polnyj = path.join(PUBLIC, otnositelnyj);
  if (polnyj !== PUBLIC && !polnyj.startsWith(PUBLIC + path.sep)) {
    return otvet(res, 400, { oshibka: 'неверный путь' });
  }

                                                                  
                                                                        
                                                                    
                                                               
                                                                 
                                                                
  if (req && !TEST_AUTH
      && !otkryto_bez_vhoda(otnositelnyj) && sessija_zaprosa(req) === null) {
    const p = new URLSearchParams(zapros || {});
    const kuda = '/' + otnositelnyj + (p.toString() ? '?' + p : '');
    res.writeHead(302, { location: '/login?next=' + encodeURIComponent(kuda) });
    return res.end();
  }
  if (fs.existsSync(polnyj) && fs.statSync(polnyj).isFile()
      && !fs.realpathSync(polnyj).startsWith(fs.realpathSync(PUBLIC) + path.sep)) {
    return otvet(res, 404, { oshibka: 'файла нет' });
  }
  if (!fs.existsSync(polnyj) || fs.statSync(polnyj).isDirectory()) {
                                                         
    let napravlenija = new Set();
    try {
      napravlenija = new Set(baza().prepare('SELECT kod FROM napravlenija')
        .all().map((r) => r.kod));
    } catch {                                             }

    const najden = razobrat_adres(otnositelnyj, napravlenija);
    if (najden) {
      const fajl = path.join(PUBLIC, najden.fajl);
      if(najden.entity&&!est_kartochka(najden.entity.table,najden.entity.id,req))return kartochka_ili_vosstanovlenie(res,req,najden.entity.table,najden.entity.id);
      if(najden.fajl==='zadachi.html'&&najden.parametry?.nomer){
        const actual=baza().prepare('SELECT nomer,napravlenie,udaleno FROM zadachi WHERE nomer=?').get(Number(najden.parametry.nomer));
        if(!actual||actual.udaleno)return otdat_html(res,404,fs.readFileSync(path.join(PUBLIC,'404.html'),'utf8'),req);
        if(actual.napravlenie!==najden.parametry.napravlenie){
          const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
          const names=new Map(baza().prepare('SELECT kod,nazvanie FROM napravlenija').all().map(r=>[r.kod,r.nazvanie]));
          const expected=names.get(najden.parametry.napravlenie)||najden.parametry.napravlenie,target=names.get(actual.napravlenie)||actual.napravlenie;
          const html=fs.readFileSync(path.join(PUBLIC,'404.html'),'utf8').replace(/<title>[^<]*<\/title>/,'<title>Задача в другом направлении</title>').replace(/<div class="net-z">[\s\S]*?<\/div>/,'<div class="net-z">Задача '+actual.nomer+' в другом направлении</div>').replace(/<div class="net-p">[\s\S]*?<\/div>/,'<div class="net-p">Задачи '+actual.nomer+' нет в направлении «'+escape(expected)+'». Она в направлении «'+escape(target)+'»</div>').replace('<a class="kn tmn" href="/prostranstvo.html">Вернуться на главную</a>','<a class="kn tmn" href="/'+encodeURIComponent(actual.napravlenie)+'/'+actual.nomer+'">Открыть в '+escape(target)+'</a>');
          return otdat_html(res,404,html,req);
        }
        return otdat_html(res,200,fs.readFileSync(fajl,'utf8'),req);
      }
                                                                       
                                               
      if (najden.otdat_kak_est && fs.existsSync(fajl)) {
        return otdat_html(res, 200, fs.readFileSync(fajl, 'utf8'),req);
      }
      if (fs.existsSync(fajl)) {
                                                                 
                                                                    
        const p = new URLSearchParams({ ...(najden.parametry || {}),
                                        ...(zapros || {}) });
        res.writeHead(302, { location: '/' + najden.fajl
          + (p.toString() ? '?' + p : '') });
        return res.end();
      }
    }

                                                                     
                                                                   
                                                                 
      
                                                                
                          
    if (otnositelnyj && otnositelnyj !== '/' && otnositelnyj !== '/index.html') {
      const stranica = path.join(PUBLIC, '404.html');
      if (fs.existsSync(stranica)) {
        return otdat_html(res, 404, fs.readFileSync(stranica, 'utf8'),req);
      }
      res.writeHead(404, { 'content-type': TIPY['.html'] });
      return res.end('<!doctype html><title>Страницы нет</title>'
        + '<p>Такой страницы нет. <a href="/prostranstvo.html">В Пространство</a>');
    }

    const obolochka = path.join(PUBLIC, 'index.html');
    if (!fs.existsSync(obolochka)) {
      return otvet(res, 404, { oshibka: 'страницы нет' });
    }
    return otdat_html(res, 200, fs.readFileSync(obolochka, 'utf8'),req);
  }
                                                               
                                                                 
                                       
    
                                                                  
                                    
  const rasshirenie = path.extname(polnyj);
  if (rasshirenie === '.html') return otdat_html(res, 200, fs.readFileSync(polnyj, 'utf8'),req);
  const st = fs.statSync(polnyj);
  const metka = `"${st.mtimeMs.toString(36)}-${st.size.toString(36)}"`;
  if (req.headers['if-none-match'] === metka) {
    res.writeHead(304, { etag: metka });
    return res.end();
  }
                                                                 
  const kak_dolgo = rasshirenie === '.woff2'
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0, must-revalidate';
  res.writeHead(200, {
    'content-type': TIPY[rasshirenie] || 'application/octet-stream',
    'cache-control': kak_dolgo,
    etag: metka,
  });
  return res.end(fs.readFileSync(polnyj));
}

function otdat_znachok(res) {
  const itog = EKRANY.favicon({ metod: 'GET' });
  res.writeHead(200, { 'content-type': 'image/svg+xml',
                       'cache-control': 'max-age=300' });
  return res.end(itog.telo.svg);
}

async function obrabotat(req, res) {
  try{res.locusPublicOrigin=new URL((req.headers['x-forwarded-proto']==='https'||req.socket.encrypted?'https':'http')+'://'+req.headers.host).origin;}catch{}
  res.locusErrorContext={gde:req.url,method:req.method,userAgent:req.headers['user-agent']};
  try{const raw=req.headers['x-locus-context'];if(typeof raw==='string'&&raw.length<=4096){const context=JSON.parse(decodeURIComponent(raw));if(context&&typeof context==='object'&&!Array.isArray(context)){const model=require('./api/otchety-oshibok.js'),input=model.validate({tekst:'Контекст запроса',...Object.fromEntries(['screen','url','obekt','entity_num','poslednee_dejstvie','poslednee_dejstvie_ts','tekst_oshibki','kod_oshibki','gde','nazhimala','oshibka'].filter(k=>Object.hasOwn(context,k)).map(k=>[k,context[k]]))},1);res.locusErrorContext={...input.event,gde:req.url,userAgent:req.headers['user-agent']};}}}catch{                                                               }
  const adres = new URL(req.url, `http://${HOST}`);
  const chasti = adres.pathname.split('/').filter(Boolean);

  if (req.method === 'POST' && adres.pathname === '/api/vhod/parol') {
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'local');
    const teper = Date.now();
    for (const [k, v] of POPITKI_VHODA) if (v.do <= teper) POPITKI_VHODA.delete(k);
    const popitki = POPITKI_VHODA.get(ip) || { chislo: 0, do: teper + 60000 };
    if (popitki.chislo >= 20 || POPITKI_VHODA.size >= 10000) {
      res.setHeader('retry-after', String(Math.max(1, Math.ceil((popitki.do - teper) / 1000))));
      return otvet(res, 429, { oshibka: 'слишком много попыток входа, попробуй через минуту' });
    }
    popitki.chislo += 1;
    POPITKI_VHODA.set(ip, popitki);
  }

                                                                             
  if (adres.pathname === '/healthz' && req.method === 'GET') {
                                                                          
    baza().prepare('SELECT count(*) AS n FROM zadachi WHERE COALESCE(udaleno,0)=0').get();
    return otvet(res, 200, { ok: true });
  }

                                                                       
                                                                         
                                                                      
  if ((chasti[0] === 'api' || chasti[0] === 'fajly')
      && !/^\/api\/oshibki\/?$/.test(adres.pathname)
      && fs.existsSync(path.join(__dirname, 'ops/maintenance.json'))) {
    res.setHeader('retry-after', '15');
    return otvet(res, 503, { oshibka: 'Локус обновляется, попробуй через несколько секунд' });
  }

                                                                           
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    let tot_zhe = false;
    try { tot_zhe = new URL(req.headers.origin).host === req.headers.host; } catch {             }
    if (!tot_zhe) return otvet(res, 403, { oshibka: 'запрос с другого сайта запрещён' });
  }

                                                                             
                                                                             
  if(/^\/api\/oshibki\/?$/.test(adres.pathname)){
    if(!['GET','POST'].includes(req.method))return otvet(res,405,{oshibka:'Здесь GET или POST отчёта'});
    const actor=avtor_zaprosa(req);if(!Number.isSafeInteger(actor))return otvet(res,401,{oshibka:'Нужно войти в Локус'});
    if(staraja_vkladka(req,res,actor))return;
    const token=sessija_tokena(req),cached=token?SESSII_DIAGNOSTIKI.get(crypto.createHash('sha256').update(token).digest('hex')):null;
    if(cached?.dostup==='net')return otvet(res,403,{oshibka:'Доступ к Локусу закрыт'});
    if(req.method==='GET'&&adres.searchParams.has('zapros_kljuch')){
      if([...adres.searchParams.keys()].length!==1)throw new OshibkaVvoda('Нужен один ключ отчёта');
      return otvet(res,200,require('./api/otchety-oshibok.js').proof(adres.searchParams.get('zapros_kljuch'),actor));
    }
    if(req.method==='GET'){
      if([...adres.searchParams.keys()].some(k=>k!=='istochnik')||adres.searchParams.getAll('istochnik').length>1)throw new OshibkaVvoda('Неизвестный фильтр журнала');
      const owner=require('./api/dostup.js').tolko_admin(baza(),actor,'Журнал ошибок доступен владельцам');
      if(owner.dostup!=='polnyj')return otvet(res,403,{oshibka:'Для журнала ошибок нужен полный доступ'});
      return otvet(res,200,require('./api/otchety-oshibok.js').tail({source:adres.searchParams.get('istochnik')}));
    }
    if(adres.searchParams.size)throw new OshibkaVvoda('У отчёта нет параметров в адресе');
    const result=await require('./api/otchety-oshibok.js').handle(await prochitat_telo(req),actor,{metadata:{userAgent:req.headers['user-agent']}});
    return otvet(res,result.kod,result.telo);
  }

  if (!TEST_AUTH && chasti[0] === 'fajly' && sessija_zaprosa(req) === null) {
    return otvet(res, 401, { oshibka: 'нужно войти в Локус' });
  }

                                                                       
  if (adres.pathname === '/favicon.ico' && req.method === 'GET') {
    return otdat_znachok(res);
  }

                                                     
  if (chasti[0] === 'fajly' && req.method === 'GET' && chasti[1]) {
    let imja;
    try{imja=decodeURIComponent(chasti.slice(1).join('/'));}
    catch{return otvet(res,400,{oshibka:'Некорректное имя файла',pole:'fajl'});}
    const polnyj = path.normalize(path.join(FAJLY, imja));
    if (!polnyj.startsWith(FAJLY + path.sep) || !fs.existsSync(polnyj)
        || !fs.statSync(polnyj).isFile()
        || !fs.realpathSync(polnyj).startsWith(fs.realpathSync(FAJLY) + path.sep)) {
      return otvet(res, 404, { oshibka: 'файла нет' });
    }
    const r = TIPY[path.extname(polnyj).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': r,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      ...(['.html','.htm','.svg','.xml','.js'].includes(path.extname(polnyj).toLowerCase())
        ? { 'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(polnyj)) } : {}),
    });
    return res.end(fs.readFileSync(polnyj));
  }

                                                                     
                                                                 
  if (chasti[0] === 'api' && chasti[1] === 'fajly' && !chasti[2]
      && req.method === 'POST') {
    if (avtor_zaprosa(req) === null) {
      return otvet(res, 401, { oshibka: 'нужен автор запроса' });
    }
    if(staraja_vkladka(req,res,avtor_zaprosa(req)))return;
    return otvet(res,201,{telo:await require('./api/materialy-komandy.js').raw(req)});
  }

  if (chasti[0] !== 'api') {
                                                        
                                                              
                                                           
    return otdat_fajl(res, adres.pathname.slice(1),
                      Object.fromEntries(adres.searchParams), req);
  }

  const tablica = chasti[1];
  const sluzhebnyjSbor=require('./api/dostup-sbora.js').zapros(req);

  if (!TEST_AUTH && tablica !== 'vhod' && tablica !== 'favicon'
      && avtor_zaprosa(req) === null && !sluzhebnyjSbor) {
    return otvet(res, 401, { oshibka: 'нужно войти в Локус' });
  }

                                                                             
  if (!BAZOVYE.has(tablica)) {
    return otvet(res, 404, { oshibka: `ручки /api/${tablica || ''} нет` });
  }

                                                                                
  const vehaTask = chasti.length === 5 && tablica === 'okr' && chasti[2] === 'vehi'
    && /^[1-9]\d*$/.test(chasti[3]) && chasti[4] === 'zadachi';
  const uchastnikRoute=chasti.length===5&&tablica==='zadachi'&&chasti[3]==='uchastniki'&&/^[1-9]\d*$/.test(chasti[4]);
                                                                               
  const contactOrderRoute=chasti.length===5&&tablica==='ljudi'&&/^[1-9]\d*$/.test(chasti[2])&&chasti[3]==='kontakty'&&chasti[4]==='porjadok';
  if (chasti.length > 4 && !vehaTask && !uchastnikRoute && !contactOrderRoute) {
    return otvet(res, 404, { oshibka: `адрес ${adres.pathname} каноном не предусмотрен` });
  }

  const avtor = sluzhebnyjSbor?null:avtor_zaprosa(req);

                                                                  
                                                                  
  if(tablica!=='vhod'&&staraja_vkladka(req,res,avtor))return;

                                                                     
                                                                          
  if (tablica === 'sostojanie' && req.method === 'GET' && chasti.length === 2) {
    const result = OTDELNYE.sostojanie({ metod: 'GET', avtor,
      proverennyj_dostup: req.proverennyjDostupDiagnostiki });
    return otvet(res, result.kod || 200, result.telo);
  }
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && (Number.isInteger(avtor)||sluzhebnyjSbor)) {
    SESSII_DIAGNOSTIKI.clear();
  }

                                                                
                                                                  
                                                            
  if(tablica==='bazy'&&chasti.length===4&&chasti[3]==='razobrat_fajl'){if(req.method!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});if(!Number.isInteger(avtor))return otvet(res,401,{oshibka:'нужно войти в Локус'});return otvet(res,200,await require('./api/fajl-bazy.js').read(req,{id:chasti[2],query:adres.searchParams}));}
  const materials=require('./api/materialy-komandy.js');
  if(tablica==='materialy'&&chasti[2]==='vozmozhnosti'&&chasti.length===3&&req.method==='GET')return otvet(res,200,materials.capabilities(avtor));
  if(tablica==='materialy'&&chasti[2]==='proverka'&&chasti.length===3&&req.method==='GET'){
    return otvet(res,200,materials.check(adres.searchParams.get('zapros_kljuch'),avtor));
  }
  if(tablica==='fajly'&&chasti.length===4&&(chasti[3]==='skachat'||chasti[2]==='skachat')&&req.method==='GET'){
    const number=chasti[3]==='skachat'?chasti[2]:chasti[3];
    if(!/^[1-9]\d*$/.test(number))throw new OshibkaVvoda('Нужен номер материала','id');
    let file;
    try{file=materials.download(Number(number),adres.searchParams.get('obekt'));}
    catch(error){
      if(error.kod===404&&String(req.headers.accept||'').toLowerCase().includes('text/html')){
        res.writeHead(404,{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'});
        return res.end(require('./api/materialy-vid.js').unavailablePage(req.headers));
      }
      throw error;
    }
    res.writeHead(200,{'content-type':file.mime,'content-length':file.size,
      'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()),
      'cache-control':'private, no-store','x-content-type-options':'nosniff'});
    const stream=fs.createReadStream(file.file);stream.on('error',()=>res.destroy());return stream.pipe(res);
  }
  if(['materialy','dokumenty'].includes(tablica)&&chasti.length===2&&req.method==='POST'&&/^multipart\/form-data\b/i.test(req.headers['content-type']||'')){
    if(!Number.isInteger(avtor))return otvet(res,401,{oshibka:'нужно войти в Локус'});
    const saved=await materials.multipart(req,tablica,avtor);
    return otvet(res,saved.povtor_sozdanija?200:201,saved);
  }
  const telo_zaprosa = req.method === 'GET' ? {} : await prochitat_telo(req);
  if(tablica==='materialy'&&chasti.length===3&&chasti[2]==='otmena'&&req.method==='POST'){
    return otvet(res,200,materials.cancel(telo_zaprosa.zapros_kljuch,telo_zaprosa.tablica||'materialy',avtor));
  }
  if (tablica === 'vhod') telo_zaprosa.sessija = sessija_tokena(req);
  if(sluzhebnyjSbor&&req.method==='POST')telo_zaprosa.kljuch_sbora=obschij.kljuch_sborshika();
  if(tablica==='insajty'&&[...adres.searchParams.keys()].some(key=>adres.searchParams.getAll(key).length!==1))throw new OshibkaVvoda('Параметр инсайта повторён');
  const zapros = Object.fromEntries(adres.searchParams);
  for (const key of ['den','data']) {
    if (!zapros[key]) continue;
    const day = obschij.den_iz_slova(zapros[key]);
    require('./api/povtory.js').proverit_datu(day, key);
    zapros[key] = day;
  }
  const dostupnye = PODRUCHKI[tablica] || [];

                                                                
                                                 
                                                 
  let kljuch = vehaTask ? chasti[3] : chasti[2];
  let dejstvie = vehaTask ? 'vehi' : chasti[3];
  if (kljuch && !dejstvie && dostupnye.includes(kljuch)) {
    dejstvie = kljuch;
    kljuch = undefined;
  }
                                                               
                                                                    
                                                                    
                                                                        
                                                                     
                                            
  if (kljuch && dejstvie && dostupnye.includes(kljuch) && !dostupnye.includes(dejstvie)) {
    const predmet = dejstvie;
    dejstvie = kljuch;
    kljuch = predmet;
  }

  if (dejstvie && !dostupnye.includes(dejstvie)) {
    return otvet(res, 404, {
      oshibka: `у /api/${tablica} нет действия «${dejstvie}»`,
      est: dostupnye,
    });
  }

                                                               
                                                                  
                                                                  
  const bez_avtora = tablica === 'vhod';
  if (req.method !== 'GET' && avtor === null && !bez_avtora && !sluzhebnyjSbor) {
    return otvet(res, 401, { oshibka: 'нужен автор запроса' });
  }

  if(tablica==='fokus')for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр таймера должен быть один',field);
  if(tablica==='bazy')for(const name of adres.searchParams.keys())if(adres.searchParams.getAll(name).length!==1)throw new OshibkaVvoda('Параметр должен быть один',name);
  const okrCreationTable=['celi','rezultaty','zamery'].includes(tablica)&&!kljuch&&!dejstvie?tablica:tablica==='okr'&&!kljuch&&['celi','rezultaty','zamery'].includes(dejstvie)?dejstvie:null;
  const okrReceiptOperation=Boolean(okrCreationTable&&(req.method==='GET'&&Object.hasOwn(zapros,'zapros_kljuch')||req.method==='POST'&&telo_zaprosa?.otmenit_dobavlenie===true));
  const publicationReceipt=tablica==='zadachi'&&kljuch&&(dejstvie==='publikacija_istochnik_proverka'&&req.method==='GET'||dejstvie==='publikacija_istochnik_otmena_popytki'&&req.method==='POST');
  const goalEditReceipt=tablica==='celi'&&kljuch&&(dejstvie==='pravka_proverka'&&req.method==='GET'||dejstvie==='pravka_otmena_popytki'&&req.method==='POST');
  const goalPlanReceipt=tablica==='celi'&&kljuch&&(dejstvie==='plany_periodov_proverka'&&req.method==='GET'||['plany_periodov_otmena_popytki','plany_periodov','plany_periodov_otmenit'].includes(dejstvie)&&req.method==='POST');
  if(tablica==='celi'&&dejstvie?.startsWith('plany_periodov'))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр периодных планов должен быть один',field);
  if(tablica==='kontent'&&adres.searchParams.getAll('vid').includes('kalendar'))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр контент-плана должен быть один',field);
  if(tablica==='zadachi'&&dejstvie?.startsWith('publikacija_'))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр источника должен быть один',field);
  if(tablica==='zadachi'&&dejstvie?.startsWith('kontekst'))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр настроек должен быть один',field);
  if(tablica==='okr'&&!dejstvie&&['nomer','cel'].some(key=>adres.searchParams.has(key)))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр цели должен быть один',field);
  if(tablica==='zhurnal'&&adres.searchParams.has('chelovek'))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр истории человека должен быть один',field);
  if(['arhiv','grafik'].includes(tablica))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр архива должен быть один',field);
  if(tablica==='planerka'&&dejstvie?.startsWith('snimok'))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр снимка должен быть один',field);
  const context = { tablica, dejstvie, kljuch, telo: telo_zaprosa, zapros, avtor, metod: req.method, sluzhebnyj:sluzhebnyj_zapros(req) };
  if (Number.isInteger(avtor)) {
    res.locusContext = context;
    if(!okrReceiptOperation&&!publicationReceipt&&!goalEditReceipt&&!goalPlanReceipt)pravilaOtveta.proverit(baza(), context);
  }
  if(req.method==='GET'&&tablica==='zadachi'&&!dejstvie){
    const number=kljuch&&/^[1-9]\d*$/.test(kljuch)?Number(kljuch):/^[1-9]\d*$/.test(zapros.nomer||'')?Number(zapros.nomer):null;
    if(number&&zapros.napravlenie&&zapros.napravlenie!=='vse'){
      if(['nomer','napravlenie'].some(k=>adres.searchParams.getAll(k).length>1))throw new OshibkaVvoda('Проверь адрес задачи');
      const actual=baza().prepare('SELECT napravlenie FROM zadachi WHERE nomer=? AND COALESCE(udaleno,0)=0').get(number);
      if(actual&&actual.napravlenie!==zapros.napravlenie)return otvet(res,404,{oshibka:'wrong_direction',napravlenie_fakt:actual.napravlenie});
    }
  }
                                                                  
                                                                 
  const vypolnit = fn => req.method === 'GET' ? fn() : v_odnoj_tranzakcii(baza(), () => {
    const result = require('./api/versii.js').s_avtorom(baza(),avtor,fn);
    if (result?.kod >= 400) throw Object.assign(new Error(result.telo?.oshibka || 'Действие не сохранено'),
      { kod: result.kod, dannye: result.telo });
    return result;
  });

  if(okrCreationTable==='zamery'&&req.method==='GET'&&Object.hasOwn(zapros,'istoriya')){
    for(const name of adres.searchParams.keys())if(adres.searchParams.getAll(name).length!==1)throw new OshibkaVvoda('Параметр истории должен быть один',name);
    return otvet(res,200,require('./api/istorija-zamerov.js').list(zapros,avtor));
  }
  if(okrCreationTable&&(req.method==='POST'||req.method==='GET'&&Object.hasOwn(zapros,'zapros_kljuch'))){
    for(const name of adres.searchParams.keys())if(adres.searchParams.getAll(name).length!==1)throw new OshibkaVvoda('Параметр проверки должен быть один',name);
    const manager=require('./api/sozdanie-okr.js');
    const result=vypolnit(()=>({telo:req.method==='GET'?manager.check(okrCreationTable,zapros,avtor):manager.create(okrCreationTable,telo_zaprosa,avtor)})).telo;
    return otvet(res,req.method==='GET'||result.povtor_sozdanija||Object.hasOwn(result,'sostojanie')&&result.obekt===okrCreationTable?200:201,result);
  }

  if(tablica==='sotrudnichestva'&&['proverka_vyplaty','proverka_uslovij','proverka_zadach','proverka_svjazi_vyplaty','svjaz_vyplaty'].includes(dejstvie))for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр проверки должен быть один',field);
  if(tablica==='uslugi'&&dejstvie==='proverka'&&req.method==='GET')for(const name of adres.searchParams.keys())if(adres.searchParams.getAll(name).length!==1)throw new OshibkaVvoda('Параметр проверки должен быть один',name);
  if(tablica==='lenta'){for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр ленты должен быть один',field);const result=vypolnit(()=>require('./api/lenta-komandy.js').handle(context));if(result)return otvet(res,result.kod||200,result.telo);}
  if(tablica==='tezisy'){for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр стратегии должен быть один',field);const result=vypolnit(()=>require('./api/strategija-pravki.js').handle(context));if(result)return otvet(res,result.kod||200,result.telo);}
  if(tablica==='celi'&&(['redaktor','pravka_proverka','pravka_otmena_popytki','pravka_otmenit'].includes(dejstvie)||req.method==='PATCH'&&!dejstvie&&Object.hasOwn(telo_zaprosa||{},'zapros_kljuch'))){for(const field of adres.searchParams.keys())if(adres.searchParams.getAll(field).length!==1)throw new OshibkaVvoda('Параметр изменения цели должен быть один',field);const result=vypolnit(()=>require('./api/pravki-celej.js').handle(context));if(result)return otvet(res,result.kod||200,result.telo);}
  if(tablica==='uslugi'){const result=vypolnit(()=>require('./api/uslugi.js').handle(context));if(result)return otvet(res,result.kod||200,result.telo);}

  if(tablica==='akkaunty'&&['dlja_zadachi','proverka','korzina'].includes(dejstvie)&&req.method==='GET'){
    for(const key of adres.searchParams.keys())if(adres.searchParams.getAll(key).length!==1)throw new OshibkaVvoda('Параметр выбора аккаунта должен быть один',key);
  }

  if((tablica==='shablony'||tablica==='proekty'&&(!dejstvie||['platezhi','proverka_pravki','proverka_dejstvija'].includes(dejstvie)))&&req.method==='GET'&&adres.searchParams.getAll('zapros_kljuch').length>1)throw new OshibkaVvoda('Ключ добавления должен быть один','zapros_kljuch');

  if(tablica==='zadachi'&&kljuch==='proverka'&&!dejstvie&&req.method==='GET'){
    if(adres.searchParams.getAll('zapros_kljuch').length>1)throw new OshibkaVvoda('Ключ запроса должен быть один','zapros_kljuch');
    return otvet(res,200,require('./api/otmena-sozdanija-zadachi.js').proverit_sozdanie(zapros,avtor));
  }

  if(sluzhebnyjSbor&&req.method==='GET'&&tablica==='akkaunty'&&!dejstvie){
    return otvet(res,200,require('./api/sbor.js').spisok(baza(),zapros));
  }

                                       
  if (dejstvie) {
    const ruchka = contactOrderRoute?require('./api/porjadok-kontaktov.js').poCheloveku:vehaTask ? p2.okr_veha_zadacha : (PODRUCHKI_KODA[tablica] || {})[dejstvie];
    if (!ruchka) {
      return otvet(res, 501, {
        oshibka: `/api/${tablica}/${dejstvie} в каноне есть, в коде ещё нет`,
      });
    }
    const telo = telo_zaprosa;
    const itog = vypolnit(() => ruchka({ kljuch, telo, zapros, avtor, metod: req.method,sluzhebnyj:TEST_AUTH||sluzhebnyj_zapros(req),sborschik:sluzhebnyjSbor,avtomaticheskij_snimok:sluzhebnyj_zapros(req),svjazannyj_id:uchastnikRoute?chasti[4]:undefined }));
    if (tablica === 'vhod') return otvet_vhoda(req, res, itog);
    return otvet(res, itog.kod || 200, itog.telo);
  }

                                                          
                                     
  if (tablica === 'favicon' && req.method === 'GET' && !dejstvie) {
    if(adres.searchParams.has('host')){
      const icon=require('./api/materialy-vid.js').icon(adres.searchParams.get('host'));
      if(!icon)throw new OshibkaVvoda('Нужен домен ссылки','host');
      res.setHeader('etag',icon.etag);res.setHeader('cache-control','public, max-age=86400');
      if(req.headers['if-none-match']===icon.etag){res.writeHead(304);return res.end();}
      res.writeHead(200,{'content-type':'image/svg+xml','x-content-type-options':'nosniff'});return res.end(icon.buffer);
    }
    return otdat_znachok(res);
  }

                                                               
                                                 
  if (OBERTKI[tablica] && !dejstvie) {
    const itog = vypolnit(() => OBERTKI[tablica](
      { kljuch, telo: telo_zaprosa, zapros, avtor, metod: req.method }));
    if (itog) return otvet(res, itog.kod || 200, itog.telo);
  }

                                                                  
                                                               
                                                
  if(tablica==='otmena'&&req.method==='GET'&&!kljuch&&!dejstvie)return otvet(res,200,zapros.obekt==='okr'?require('./api/otmena-okr.js').list(zapros,avtor):require('./api/otmena-okr.js').check(zapros,avtor)||require('./api/istochnik-publikacii-zadachi.js').undoProof(zapros,avtor)||require('./api/otmena-sozdanija-zadachi.js').proverit(zapros,avtor));
  if (tablica === 'otmena' && req.method === 'POST' && !kljuch && !dejstvie
      && !Array.isArray(telo_zaprosa.otmena)) {
    return otvet(res, 200, vypolnit(() => require('./api/otmena-okr.js').undo(telo_zaprosa,avtor)||require('./api/istochnik-publikacii-zadachi.js').undo(telo_zaprosa,avtor)||obschij.otmenit_po_zhurnalu(telo_zaprosa, avtor)));
  }

                                                         
  if (EKRANY[tablica] && !dejstvie) {
    const telo = telo_zaprosa;
                                                                
    const itog = vypolnit(() => EKRANY[tablica]({ kljuch, telo, zapros, avtor, metod: req.method,origin:res.locusPublicOrigin }));

                                                               
                                                                  
                                                      
    if (tablica === 'vhod') return otvet_vhoda(req, res, itog);
    return otvet(res, itog.kod || 200, itog.telo);
  }

  if(tablica==='arhiv'&&Object.hasOwn(telo_zaprosa,'zapros_kljuch')){const result=vypolnit(()=>require('./api/komandy-arhiva.js').save(context));return otvet(res,result.kod||200,result.telo);}

                                                            
  if (OTDELNYE[tablica]) {
    const telo = telo_zaprosa;
    const itog = vypolnit(() => OTDELNYE[tablica]({ kljuch, telo, zapros, avtor, metod: req.method }));
    return otvet(res, itog.kod || 200, itog.telo);
  }

  const opisanie = OPISANIJA[tablica];
  if (!opisanie) {
    return otvet(res, 501, {
      oshibka: `/api/${tablica} в каноне есть, в коде ещё нет`,
      gotovy: Object.keys(OPISANIJA).map((t) => `/api/${t}`),
    });
  }

  if (req.method === 'GET') {
                                                                 
                                                                   
    if (!kljuch) {
      if(['materialy','dokumenty'].includes(tablica)){const result=obschij.spisok(tablica,opisanie,zapros,avtor);return otvet(res,200,{...result,spisok:result.spisok.map(require('./api/materialy-vid.js').present)});}
      return otvet(res, 200, obschij.spisok(tablica, opisanie, zapros, avtor));
    }
    if(['materialy','dokumenty'].includes(tablica))return otvet(res,200,require('./api/materialy-vid.js').present(obschij.odna(tablica,opisanie,kljuch,avtor)));
    return otvet(res, 200, obschij.odna(tablica, opisanie, kljuch, avtor));
  }

  if (req.method === 'POST' && !kljuch) {
    if(tablica==='anketa')return otvet(res,200,vypolnit(()=>require('./api/anketa.js').sohranit(telo_zaprosa,avtor)));
    const saved=vypolnit(()=>({telo:tablica==='zadachi'?require('./api/otmena-sozdanija-zadachi.js').sozdat(telo_zaprosa,opisanie,avtor):tablica==='akkaunty'?require('./api/sozdanie-akkaunta.js').create(telo_zaprosa,opisanie,avtor):['materialy','dokumenty'].includes(tablica)?materials.create(tablica,telo_zaprosa,avtor):obschij.sozdat(tablica, opisanie, telo_zaprosa, avtor)})).telo;
    return otvet(res,['zadachi','akkaunty','materialy','dokumenty'].includes(tablica)&&saved.povtor_sozdanija?200:201,saved);
  }

  if (req.method === 'PATCH' && kljuch) {
    return otvet(res, 200,
      vypolnit(()=>({telo:obschij.pravit(tablica, opisanie, kljuch, telo_zaprosa, avtor)})).telo);
  }

  if (req.method === 'DELETE' && kljuch) {
    if(['celi','rezultaty'].includes(tablica))return otvet(res,200,vypolnit(()=>({telo:require('./api/otmena-okr.js').remove(tablica,kljuch,telo_zaprosa,avtor)})).telo);
    if(['materialy','dokumenty'].includes(tablica))return otvet(res,200,vypolnit(()=>({telo:materials.unlink(tablica,kljuch,telo_zaprosa,avtor)})).telo);
    return otvet(res, 200, vypolnit(()=>({telo:obschij.udalit(tablica, opisanie, kljuch, avtor, telo_zaprosa)})).telo);
  }

  return otvet(res, 405, {
    oshibka: `${req.method} сюда не ходит`,
    metody: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
}

const server = http.createServer((req, res) => {
  obrabotat(req, res).catch((e) => oshibka(res, e));
});

if (require.main === module) {
  baza();                                                        
  const stopReportsWorker=require('./api/otchety-oshibok.js').startWorker();
  server.listen(PORT, HOST, () => {
    console.log(`Локус на http://${HOST}:${server.address().port}`);
    const pod = Object.values(PODRUCHKI_KODA).reduce((n, o) => n + Object.keys(o).length, 0);
    console.log(`канон: ${BAZOVYE.size} ручек, ${Object.values(PODRUCHKI).reduce((n, a) => n + a.length, 0)} подручек`);
    const bazovyh = new Set([...Object.keys(OPISANIJA), ...Object.keys(EKRANY),
                             ...Object.keys(OTDELNYE)]).size;
    console.log(`написано: ${bazovyh} ручек, ${pod} подручек`);
  });
  let zavershaetsja = false;
  const zavershit = () => {
    if (zavershaetsja) return;
    zavershaetsja = true;
    const reportsStopped=stopReportsWorker();
                                                                  
    const limit = setTimeout(() => process.exit(1), 10000);
    limit.unref();
    server.close(async () => {
      await reportsStopped;
      baza().close();
      process.exit(0);
    });
  };
  process.once('SIGTERM', zavershit);
  process.once('SIGINT', zavershit);
}

server.on('listening',()=>{try{require('./api/materialy-komandy.js').resumeGc();}catch(error){console.error('material cleanup startup: '+error.name);}});
require('./api/fokus-limit.js').attach(server);
module.exports = { server };
