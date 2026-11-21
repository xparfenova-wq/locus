                                                              
  
                                                                       
                                                   
                                       
                                       
                                        
                                          
                        

const {
  baza, polja, v_api, v_bazu, LOGICHESKIE,
  OshibkaVvoda, NeNajdeno, Konflikt, v_odnoj_tranzakcii, seichas } = require('../db/db.js');

                                                               
const SERVERNYE = new Set(['id', 'sozdano', 'versija', 'kto_dobavil', 'imja_norm',
                           'znachenie_norm', 'poslednij_vhod', 'daty_izmerenij']);

                                             
const {S_VERSIEJ}=require('../db/versii.js');

                                                                    
                                                                        
                                                                              
  
                                                                   
                                                            
                                                                  
                                                                 
                                                      
  
                                                               
                                                                   
                                                                        
const DENEZHNYE = {
  proekty: ['stoimost', 'vystavleno', 'oplacheno'],
  platezhi: ['summa'],
  uslugi: ['cena'],
  sotrudnichestva: ['procent', 'procent_shkala', 'vyplacheno', 'nalog'],
};

                                                                    
                                                          
const TOLKO_DENGI = new Set(['platezhi']);

                                                                        
                                                                    
                                                                   
                                                                 
const OTKRYTA_SQL = "status NOT IN ('sdelano', 'kogda_nibud')";
                                                                     
                                                
const DNI_NEDELI = ['воскресенье', 'понедельник', 'вторник', 'среда',
  'четверг', 'пятница', 'суббота'];

function den_iz_slova(z) {
  const s = String(z || '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(require('../db/db.js').segodnja() + 'T12:00:00Z');
  d.setUTCHours(0, 0, 0, 0);
  if (s === 'сегодня' || s === 'segodnja') return d.toISOString().slice(0, 10);
  if (s === 'завтра' || s === 'zavtra') {
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (s === 'вчера' || s === 'vchera') {
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
                                                         
  const nomer = DNI_NEDELI.indexOf(s);
  if (nomer >= 0) {
    const sdvig = (nomer - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + sdvig);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

const SCHITAEMYE = {
  zadachi: {
    prosrochennye: `((povtorjaetsja IS NOT 1 AND srok IS NOT NULL AND srok < locus_today() AND ${OTKRYTA_SQL})
      OR ${require('./povtory.js').prosrochena_sql()})`,
                                                                        
                                                                        
    arhivnye: 'udaleno = 1',
                                                             
                                                                 
                                                                      
                                                                        
                                                                      
                                         
    bez_kogda_nibud: "status <> 'kogda_nibud'",
  },
  ljudi: {
                                                                           
                                                                    
                                                                     
                                           
    vneshnie: '(komanda IS NULL OR komanda = 0)',
  },
};

                                                                   
                                              
const DATY = new Set(['srok', 'data', 'data_vyhoda', 'kogda', 'arhiv_s']);

                                                                   
                                                                       
                                                               
const NABORAMI = {
  zadachi: { tipy: 'tip', statusy: 'status' },
};

                                                                    
                                                                 
                                                                      
                                                                        
                                                                   
                                                              
const SOSTOJANIJAMI = {
  zadachi: {
    status: Object.fromEntries(['v_plane', 'v_processe', 'na_soglasovanii', 'sdelano', 'kogda_nibud', 'prosrochena']
      .map(status => [status, `${require('./povtory.js').status_sql()}='${status}'`])),
  },
  platezhi: {
    status: {
      zhdem: 'oplachen_at IS NULL',
      prishlo: 'oplachen_at IS NOT NULL',
    },
  },
                                                                    
                                                                  
                                                              
                                                               
  ljudi: {
    rol: {
      lid: "id IN (SELECT chelovek_id FROM sotrudnichestva WHERE rol = 'lid')",
      klient: "id IN (SELECT chelovek_id FROM sotrudnichestva WHERE rol = 'klient')",
      referal: "id IN (SELECT chelovek_id FROM sotrudnichestva WHERE rol = 'referal')",
    },
  },
};

                                                     
  
                                                                   
                                                                    
                                                               
                                           
  
                                                                
                                                           
                                                                  
                           
function spisok_znachenij(znachenie) {
  return String(znachenie).split(',').map((s) => s.trim()).filter(Boolean);
}

                                                               
                                                                  
                                 
function cherez_sotrudnichestva(pole, znachenie) {
  const chasti = spisok_znachenij(znachenie);
  if (!chasti.length) return null;
  return {
    uslovie: `id IN (SELECT chelovek_id FROM sotrudnichestva
                      WHERE ${pole} IN (${chasti.map(() => '?').join(', ')}))`,
    dovody: chasti,
  };
}

const FILTRY_LJUDEJ = {
                                                    
  stadija: (z) => cherez_sotrudnichestva('stadija', z),
                                    
  istochnik: (z) => cherez_sotrudnichestva('istochnik', z),
                                                            
  rekomendoval: (z) => cherez_sotrudnichestva('rekomendoval_id', z),
  rekomendoval_id: (z) => cherez_sotrudnichestva('rekomendoval_id', z),

                                                                      
                                                                    
                                                                      
                                                                
                                                                    
    
                                                                   
                                                              
                                                                   
  rassylka: (z) => {
    const chasti = spisok_znachenij(z);
    if (!chasti.length) return null;
    if (chasti.length > 1) {
      throw new OshibkaVvoda(
        'rassylka: одна рассылка за раз', 'rassylka');
    }
    const id = Number(chasti[0]);
    if (!Number.isInteger(id)) {
      throw new OshibkaVvoda(
        `rassylka: нужен числовой id рассылки, а не «${chasti[0]}»`,
        'rassylka');
    }
    return {
      uslovie: `id IN (SELECT bl.kto FROM bazy_ljudi bl JOIN rassylki rs ON rs.baza_id=bl.baza_id JOIN ljudi lp ON lp.id=bl.kto WHERE rs.id=? AND COALESCE(rs.status,'gotovitsja')<>'zavershena' AND lp.rol_v_baze IS NOT 'kontaktnoe_lico' AND ${require('./sostojanie-strok-bazy.js').active('bl')} UNION SELECT rl.chelovek_id FROM rassylka_ljudi rl JOIN rassylki rs ON rs.id=rl.rassylka_id WHERE rs.id=? AND (rs.baza_id IS NULL OR rs.status='zavershena'))`,
      dovody: [id,id],
    };
  },
  rassylka_id: (z) => FILTRY_LJUDEJ.rassylka(z),

                                                        
                                                              
                                                           
  status_rassylki: (z, _db, zapros) => {
    const chasti = spisok_znachenij(z);
    if (!chasti.length) return null;
                                                                  
                                                                   
                                                                
                                                                     
                                             
    if (zapros && zapros.rassylka === undefined
        && zapros.rassylka_id === undefined) {
      throw new OshibkaVvoda(
        'status_rassylki работает только с выбранной рассылкой: '
        + 'добавьте rassylka', 'status_rassylki');
    }
    const campaign=Number(zapros?.rassylka??zapros?.rassylka_id);
    if(!Number.isSafeInteger(campaign)||campaign<1)throw new OshibkaVvoda('Выбери одну рассылку','rassylka');
    const statuses=chasti.filter(s=>s!=='ne_otpravljali');
    const allowed=['ne_otpravleno','otpravleno','otvetil','otkaz'];
    if(statuses.some(s=>!allowed.includes(s)))throw new OshibkaVvoda('Неизвестный статус в рассылке','status_rassylki');
    const pieces=[],args=[];
    if(statuses.length){pieces.push(`id IN (SELECT chelovek_id FROM rassylka_ljudi WHERE rassylka_id=? AND status IN (${statuses.map(()=>'?').join(',')}))`);args.push(campaign,...statuses);}
                                                                            
                                                                
    if(chasti.includes('ne_otpravljali')||statuses.includes('ne_otpravleno')){pieces.push('id NOT IN (SELECT chelovek_id FROM rassylka_ljudi WHERE rassylka_id=?)');args.push(campaign);}
    if(chasti.includes('ne_otpravljali')&&!statuses.includes('ne_otpravleno')){pieces.push("id IN (SELECT chelovek_id FROM rassylka_ljudi WHERE rassylka_id=? AND status='ne_otpravleno')");args.push(campaign);}
    return {uslovie:`(${pieces.join(' OR ')})`,dovody:args};
  },

                                                               
                                                                 
                                                       
  poslednee_obshenie: (z) => {
    const candidates=require('./kontekst-dat.js').sqlKandidaty();
    const svezhee = `(SELECT locus_obschenie_den(znachenie) FROM (${candidates}) WHERE locus_obschenie_moment(znachenie) IS NOT NULL ORDER BY locus_obschenie_moment(znachenie) DESC LIMIT 1)`;
    const okna = {
      svezhee_nedeli: `${svezhee} >= date(locus_today(), '-7 day') AND ${svezhee} <= locus_today()`,
      nedelja_mesjac: `${svezhee} < date(locus_today(), '-7 day')
                       AND ${svezhee} >= date(locus_today(), '-1 month')`,
      bolshe_mesjaca: `${svezhee} < date(locus_today(), '-1 month')`,
                                                                  
                                                               
                                                
      nikogda: `NOT EXISTS(SELECT 1 FROM sotrudnichestva s WHERE s.chelovek_id=ljudi.id AND s.poslednee_obshenie IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM (${candidates}) WHERE znachenie IS NOT NULL)`,
    };
    const chasti = spisok_znachenij(z);
    const neizvestnoe = chasti.find((s) => !okna[s]);
    if (neizvestnoe) {
      throw new OshibkaVvoda(
        `poslednee_obshenie: одно из ${Object.keys(okna).join(', ')}`,
        'poslednee_obshenie');
    }
    if (!chasti.length) return null;
    return { uslovie: `(${chasti.map((s) => okna[s]).join(' OR ')})`, dovody: [] };
  },

                                                                 
                                                    
  est_otkrytye_zadachi: (z) => {
    const nado = iz_stroki(z);
    const est = `id IN (SELECT klient_id FROM zadachi
                         WHERE klient_id IS NOT NULL AND ${OTKRYTA_SQL}
                           AND (udaleno IS NULL OR udaleno = 0))`;
    return { uslovie: nado === false ? `NOT (${est})` : est, dovody: [] };
  },
};

                                                                   
                                                                  
function napravlenija_ljudej() {
  try {
    const kody = baza().prepare('SELECT kod FROM napravlenija').all().map((r) => r.kod);
    const nabor = {};
    for (const k of kody) {
      nabor[k] = 'id IN (SELECT chelovek_id FROM sotrudnichestva WHERE napravlenie = ?)';
    }
    return nabor;
  } catch { return {}; }
}

function dostup_cheloveka(id) {
  if (id === null || id === undefined) return 'bez_deneg';
  try {
    return require('./dengi-dostup.js').vidit(baza(),Number(id))?'polnyj':'bez_deneg';
  } catch { return 'bez_deneg'; }
}

function vidit_dengi(avtor) {
  return dostup_cheloveka(avtor) === 'polnyj';
}

                                                               
                                                              
                                                                 
function bez_summ(tablica, stroka, avtor) {
  const financialTask=tablica==='zadachi'&&require('./dengi-zadach.js').isMoney(baza(),stroka);
  const polja_deneg = financialTask?[...(DENEZHNYE[tablica]||[]),...require('./dengi-zadach.js').fields]:DENEZHNYE[tablica];
  if (!polja_deneg) return stroka;
  if (vidit_dengi(avtor)) return stroka;
  const itog = { ...stroka };
  const skryto = [];
  for (const p of polja_deneg) {
    if (p in itog) { delete itog[p]; skryto.push(p); }
  }
  if (skryto.length) { itog.skryto = ['dengi']; itog.skryty_polja = skryto; }
  return itog;
}

                                                                    
                                                                     
function proverit_zapis_deneg(tablica, telo, avtor, bylo) {
  const financialTask=tablica==='zadachi'&&(require('./dengi-zadach.js').isMoney(baza(),bylo)||require('./dengi-zadach.js').marked(telo));
  const polja_deneg = financialTask?[...(DENEZHNYE[tablica]||[]),...require('./dengi-zadach.js').fields]:DENEZHNYE[tablica];
  if (!polja_deneg || vidit_dengi(avtor)) return;
  const pytalsja = polja_deneg.filter((p) => p in (telo || {}));
  if (!pytalsja.length) return;
  const e = new Error(`у тебя доступ без денег: ${pytalsja.join(', ')} не записывается`);
  e.kod = 403;
  e.pole = pytalsja[0];
  throw e;
}

                            
function proverit_tablicu_deneg(tablica, avtor) {
  if (!TOLKO_DENGI.has(tablica) || vidit_dengi(avtor)) return;
  const e = new Error('у тебя доступ без денег, этот раздел закрыт');
  e.kod = 403;
  throw e;
}

                                              
  
                                                                      
                                                                    
                                                                
                         
  
                                                                    
                                                                 
                                                                    
                                                            
                                                              
                           
const SBORSHIK_PISHET = new Set(['zamery_akkauntov', 'publikacii', 'zapuski_sbora']);

                                                               
                                                                
                                                                 
                                                 
function kljuch_sborshika() {
  return require('./dostup-sbora.js').kljuch();
}

                                                                 
                                                                  
                                                                    
                                                                
                                                               
                                               
  
                                                             
                                                                    
                       
function pishet_sborshik(telo) {
  const dan = telo && typeof telo === 'object' ? telo.kljuch_sbora : null;
  return require('./dostup-sbora.js').proverit(dan);
}

function proverit_zapis_cifr(tablica, telo) {
  if(tablica==='zadachi'&&telo&&Object.hasOwn(telo,'ohvat')){
    if(!pishet_sborshik(telo))throw new OshibkaVvoda('ohvat подтягивается замером','ohvat');
    if(telo.ohvat!==null&&(typeof telo.ohvat!=='number'||!Number.isSafeInteger(telo.ohvat)||telo.ohvat<0))throw new OshibkaVvoda('ohvat — целое число от нуля или неизвестное измерение','ohvat');
  }
  if (!SBORSHIK_PISHET.has(tablica)) return;
  if (pishet_sborshik(telo)) return;
  const e = new Error('цифры пишет сборщик');
  e.kod = 403;
  throw e;
}

                                                         
function iz_stroki(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim().toLowerCase();
  if (t === 'true' || t === '1' || t === 'da') return true;
  if (t === 'false' || t === '0' || t === 'net') return false;
  return v;
}

                                                             
                                                                  
                                                          
function pometit_neprochitannye(db, tablica, avtor, spisok, stroki) {
  if (tablica !== 'zadachi' || !avtor || !spisok.length) return spisok;
  try {
    const ids = stroki.map((r) => r.id);
    const mest = ids.map(() => '?').join(',');
    const vidennye = new Set(db.prepare(
      `SELECT zadacha_id FROM prosmotry
        WHERE chelovek_id = ? AND zadacha_id IN (${mest})`)
      .all(avtor, ...ids).map((x) => x.zadacha_id));
    return spisok.map((z, i) => ({
      ...z, neprochitano: !vidennye.has(stroki[i].id),
    }));
  } catch { return spisok; }
}

                                                               
                                                             
const SLUZHEBNYE_PARAMETRY = new Set([
  'stranica', 'na_stranice', 'sortirovka', 's_chislami',
  'nabor_filtrov_id', 'q_podsvetka',
                                                                   
                                              
  'for', 'dlja', 'vid_otveta', 'format',
]);

                                                                      
                                                                        
function vsego_bez_filtrov(db, tablica, opisanie) {
  try {
    const arhivnoe = opisanie && opisanie.bez_arhiva_po_umolchaniju
      ? ' WHERE arhiv = 0' : '';
    return db.prepare(`SELECT COUNT(1) n FROM ${tablica}${arhivnoe}`).get().n;
  } catch { return null; }
}

function filtry_spiska(tablica, opisanie, zapros, avtor) {
  proverit_tablicu_deneg(tablica, avtor);
  const db = baza();
  const nabor = polja(tablica);
  const uslovija = [];
  const znachenija = [];

  if (['grafik', 'lenta'].includes(tablica)) {
    const field = tablica === 'grafik' ? 'nedelja' : 'sprint';
    const year = tablica === 'grafik' ? 'god' : 'god_sprinta';
    if (zapros[field] != null && zapros[field] !== '') {
      const week = require('./kalendar.js').nedelja_iz_zaprosa({
        nedelja: zapros[field], ...(zapros[year] != null ? {god:zapros[year]} : {}),
      }, require('../db/db.js').segodnja());
      zapros = {...zapros, [field]:week.nomer, [year]:week.god};
    }
  }

  const vidimost = require('./pravila-otveta.js').vidimost(tablica, avtor);
  if (vidimost) { uslovija.push(vidimost.sql); znachenija.push(...vidimost.args); }
  if(tablica==='ljudi'){
    const roleScope=require('./kontaktnye-lica.js').uslovie_spiska(zapros);
    if(roleScope)uslovija.push(roleScope);
  }

                                                             
    
                                                                     
                                                                     
                                                                    
                                                               
                                                              
                                                                    
                              
  const prosjat_udalennye = iz_stroki(zapros.arhivnye) === true;
  if (nabor.has('udaleno') && !prosjat_udalennye) {
    uslovija.push("(udaleno IS NULL OR udaleno = 0)");
  }
  if (nabor.has('udalen')) uslovija.push("(udalen IS NULL OR udalen = 0)");
                                                                       
                                                                        
                                                                  
                                            
  if (nabor.has('arhiv') && iz_stroki(zapros.arhiv) !== true) {
    uslovija.push('(arhiv IS NULL OR arhiv = 0)');
    if(tablica==='sotrudnichestva')uslovija.push('chelovek_id IN (SELECT id FROM ljudi WHERE COALESCE(arhiv,0)=0)');
  }

                                                                   
                                                                 
                                                                     
  const iskat = String(zapros.q || zapros.poisk || '').trim();
  const POLJA_POISKA = ['imja', 'nazvanie', 'nomer', 'opisanie', 'zametka', 'istochnik_tekst',
                        'tekst', 'segment', 'offer'];
  if (['zadachi','ljudi'].includes(tablica) && iskat) {
    const fields = POLJA_POISKA.filter(f => nabor.has(f));
    uslovija.push('(' + fields.map(f => `locus_contains(${f}, ?)=1`).join(' OR ') + ')');
    znachenija.push(...fields.map(() => iskat));
  }

  const roleFilter=tablica==='ljudi'?require('./filtry-sotrudnichestv.js').prepare(zapros):null;
  if(roleFilter?.sql){uslovija.push(roleFilter.sql);znachenija.push(...roleFilter.params);}

  for (const [kljuch, znachenie] of Object.entries(zapros)) {
    if(roleFilter?.keys.has(kljuch))continue;
    if(tablica==='proekty'&&kljuch==='status'&&znachenie==='aktivnye'){uslovija.push("status IN ('idet','pauza')");continue;}
    if(tablica==='ljudi'&&kljuch==='vse_roli')continue;
                                                             
                                                                     
                                                              
                                                             
    if (['stranica', 'na_stranice', 'arhiv', 'sortirovka',
         'q', 'poisk', 's_chislami'].includes(kljuch)) continue;

                                                                       
                                                                      
                                                                     
                                                                    
                                                            
                                                          
                                                                       
    if (tablica === 'zadachi' && kljuch === 'den_konteksta') {
      require('./povtory.js').proverit_datu(den_iz_slova(String(znachenie)));
      continue;
    }
    if (SLUZHEBNYE_PARAMETRY.has(kljuch)) continue;
    if(tablica==='kommentarii'&&['sverit_ot_id','ids'].includes(kljuch)){
      const mode=require('./kommentarii.js').rezhim_chtenija(zapros);
      if(kljuch==='ids'){uslovija.push('id IN ('+mode.ids.map(()=>'?').join(',')+')');znachenija.push(...mode.ids);}
      continue;
    }
    if(tablica==='kommentarii'&&kljuch==='do_id'){
      const id=Number(znachenie);
      if(typeof znachenie==='boolean'||!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('do_id: номер существующей границы обсуждения','do_id');
      uslovija.push('id < ?');znachenija.push(id);continue;
    }
    if (tablica === 'zadachi' && ['prosrochennye','prosrocheno'].includes(kljuch)) {
      if (iz_stroki(znachenie) === true) {
        const den = den_iz_slova(zapros.den_konteksta || zapros.data || zapros.den) || require('../db/db.js').segodnja();
        require('./povtory.js').proverit_datu(den);
        uslovija.push(`((povtorjaetsja IS NOT 1 AND srok IS NOT NULL AND srok<'${den}' AND ${OTKRYTA_SQL})
          OR ${require('./povtory.js').prosrochena_sql('zadachi', `'${den}'`)})`);
      }
      continue;
    }
    if (tablica === 'zadachi' && ['sprint','nedelja'].includes(kljuch)) {
      const calendar = require('./kalendar.js');
      const day = den_iz_slova(zapros.den_konteksta || zapros.den || zapros.data) || require('../db/db.js').segodnja();
      const query = { [kljuch]: znachenie };
      if (zapros.god_sprinta !== undefined) query.god = zapros.god_sprinta;
      const week = calendar.nedelja_iz_zaprosa(query, day);
      uslovija.push(require('./kampanii.js').weeklyPredicate('zadachi',week));
      continue;
    }
    if (tablica === 'zadachi' && kljuch === 'god_sprinta' && (zapros.sprint!==undefined || zapros.nedelja!==undefined)) {
      continue;
    }
    const schitaemyj = SCHITAEMYE[tablica] && SCHITAEMYE[tablica][kljuch];
    if (schitaemyj) {
      if (iz_stroki(znachenie) === true) uslovija.push(schitaemyj);
      continue;
    }

                                                                       
                                                                         
                                                     
                                                             
                                                               
    if (tablica === 'ljudi' && kljuch === 'privodit') {
      if (iz_stroki(znachenie) === true) {
        uslovija.push(
          'id IN (SELECT chelovek_id FROM sotrudnichestva WHERE privodit_klientov = 1)');
      }
      continue;
    }

                                                              
                                                                
                                                       
    if (tablica === 'zadachi' && (kljuch === 'data' || kljuch === 'den')) {
      const den = den_iz_slova(String(znachenie));
      if (!den) continue;                                               
      require('./povtory.js').proverit_datu(den);
      const nomer_dnja = new Date(den + 'T00:00:00Z').getUTCDay() || 7;
      uslovija.push(`(
        (povtorjaetsja IS NOT 1 AND srok = ?)
        OR (povtorjaetsja = 1 AND (povtor_s IS NULL OR povtor_s <= ?) AND (
             chastota = 'kazhdyj_den'
             OR (chastota = 'budnie' AND ? BETWEEN 1 AND 5)
             OR (chastota = 'raz_v_nedelju' AND den_nedeli = ?)
             OR (chastota = 'vybrannye_dni' AND EXISTS (
               SELECT 1 FROM json_each(CASE WHEN json_valid(dni) THEN dni ELSE '[]' END)
               WHERE value = ?))))
      )`);
      znachenija.push(den, den, nomer_dnja, nomer_dnja, nomer_dnja);
      continue;
    }

                                                         

                                                           
    if (tablica === 'ljudi' && kljuch === 'napravlenie') {
      const own='id IN (SELECT chelovek_id FROM sotrudnichestva WHERE napravlenie = ?)';
      const contact='id IN (SELECT kontakt_id FROM sotrudnichestva WHERE napravlenie = ? AND kontakt_id IS NOT NULL)';
      const all=['1','true','da'].includes(String(zapros.vse_roli));
      uslovija.push(zapros.rol_v_baze==='kontaktnoe_lico'?contact:all?'('+own+' OR '+contact+')':own);
      znachenija.push(String(znachenie));
      if(all&&zapros.rol_v_baze!=='kontaktnoe_lico')znachenija.push(String(znachenie));
      continue;
    }

                                                                     
                                                                     
                                                                 
                                                                       
                                                          
      
                                                                     
                                                               
                                                                 
                                                            
                                                           
    if (tablica === 'ljudi' && FILTRY_LJUDEJ[kljuch]) {
      const sobrat = FILTRY_LJUDEJ[kljuch];
                                                                
                                                                
      const sobrano = sobrat(znachenie, db, zapros);
      if (sobrano) {
        uslovija.push(sobrano.uslovie);
        znachenija.push(...(sobrano.dovody || []));
      }
      continue;
    }

    const sostojanija = SOSTOJANIJAMI[tablica] && SOSTOJANIJAMI[tablica][kljuch];
    if (sostojanija) {
      const uslovie = sostojanija[String(znachenie)];
      if (!uslovie) {
        throw new OshibkaVvoda(
          `${kljuch}: одно из ${Object.keys(sostojanija).join(', ')}`, kljuch);
      }
      if (tablica === 'zadachi' && kljuch === 'status') {
        const den = den_iz_slova(require('./povtory.js').den_konteksta(zapros)) || require('../db/db.js').segodnja();
        require('./povtory.js').proverit_datu(den);
        uslovija.push(`${require('./povtory.js').status_sql('zadachi', `'${den}'`)}=?`);
        znachenija.push(String(znachenie));
      } else uslovija.push(uslovie);
      continue;
    }

                                                                   
                                                                       
                                              
    const nabor_pole = NABORAMI[tablica] && NABORAMI[tablica][kljuch];
    if (nabor_pole) {
      const chasti = String(znachenie).split(',').map((s) => s.trim()).filter(Boolean);
      if (chasti.length) {
        uslovija.push(`${nabor_pole} IN (${chasti.map(() => '?').join(', ')})`);
        znachenija.push(...chasti);
      }
      continue;
    }

                                                                   
                                                                      
                                                                  
                                                                     
                                                                          
    if (nabor.has(kljuch) && DATY.has(kljuch) && !/^\d{4}-\d{2}-\d{2}$/.test(String(znachenie))) {
      throw new OshibkaVvoda(
        `${kljuch}: нужна дата видом 2026-10-25, а не «${znachenie}»`, kljuch);
    }

    if (!nabor.has(kljuch)) {
                                                                     
                                                                    
                                                           
                                                         
      throw Object.assign(
        new OshibkaVvoda(`неизвестное поле в фильтре: ${kljuch}`, kljuch),
        { kod: 422 });
    }
                                                                      
                                                                     
                                                                     
                                                                   
                                                                      
                                                         
    if(tablica==='zadachi'&&kljuch==='cel_id'){
      const links=require('./okr-svjazi.js');uslovija.push(links.goalKey()+' = ?');znachenija.push(links.id(znachenie,'cel_id'));continue;
    }
    uslovija.push(`${kljuch} = ?`);
    znachenija.push(LOGICHESKIE.has(kljuch)
      ? v_bazu(iz_stroki(znachenie), kljuch)
      : znachenie);
  }

  const gde = uslovija.length ? `WHERE ${uslovija.join(' AND ')}` : '';
  return { db, nabor, gde, znachenija, iskat, POLJA_POISKA };
}

function spisok(tablica, opisanie, zapros, avtor) {
  const mode=tablica==='kommentarii'?require('./kommentarii.js').rezhim_chtenija(zapros):null;
                                                                   
                                                                  
  return mode||tablica==='kontakty'||tablica==='ljudi'?v_odnoj_tranzakcii(baza(),()=>spisok_vnutri(tablica,opisanie,zapros,avtor,mode))
    :spisok_vnutri(tablica,opisanie,zapros,avtor,null);
}
function spisok_vnutri(tablica, opisanie, zapros, avtor, commentMode) {
  const { db, nabor, gde, znachenija, iskat, POLJA_POISKA } = filtry_spiska(tablica, opisanie, zapros, avtor);

                                                              
                                                             
  if (iskat && !['zadachi','ljudi'].includes(tablica)) {
    const norma = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
    const chto = norma(iskat);
    const polja_est = POLJA_POISKA.filter((f) => nabor.has(f));
    const vse = db.prepare(`SELECT * FROM ${tablica} ${gde}`).all(...znachenija);
    const najdeno = vse.filter((s) =>
      polja_est.some((f) => norma(s[f]).includes(chto)));

    const na_stranice_p = Math.min(parseInt(zapros.na_stranice, 10) || 50, 500);
    const stranica_p = Math.max(parseInt(zapros.stranica, 10) || 1, 1);
    const srez = najdeno.slice((stranica_p - 1) * na_stranice_p,
                               stranica_p * na_stranice_p);
    const pageRows=srez.map(r=>bez_summ(tablica,v_api(r),avtor)),peopleRows=tablica==='ljudi'?require('./filtry-sotrudnichestv.js').decorate(db,pageRows,zapros,r=>bez_summ('sotrudnichestva',v_api(r),avtor)):null;
    return {
      spisok: pometit_neprochitannye(db, tablica, avtor,
        srez.map((r,i) => {
          const row=peopleRows?.[i]||pageRows[i];
          return tablica==='ljudi'&&opisanie.dopolnit?{...row,...opisanie.dopolnit(db,row)}:row;
        }), srez),
      vsego: najdeno.length,
      stranica: stranica_p,
      stranic: Math.max(1, Math.ceil(najdeno.length / na_stranice_p)),
      otfiltrovano: vse.length - najdeno.length,
      poisk: iskat,
    };
  }

  const vsego = db.prepare(`SELECT count(*) k FROM ${tablica} ${gde}`)
    .get(...znachenija).k;

  const na_stranice = Math.min(parseInt(zapros.na_stranice, 10) || 50, 200);
  const stranica = Math.max(parseInt(zapros.stranica, 10) || 1, 1);
  const otstup = (stranica - 1) * na_stranice;

  let porjadok = opisanie.porjadok || (nabor.has('porjadok') ? 'porjadok' : 'id');
  if(tablica==='zadachi'&&zapros.roditel_id&&db.prepare('SELECT shablon FROM zadachi WHERE id=?').get(Number(zapros.roditel_id))?.shablon)porjadok='id';
  if(tablica==='kommentarii'&&zapros.sortirovka!==undefined){
    if(!['id_asc','id_desc'].includes(zapros.sortirovka))throw new OshibkaVvoda('sortirovka: id_asc или id_desc','sortirovka');
    porjadok=zapros.sortirovka==='id_desc'?'id DESC':'id ASC';
  }
  const stroki = db.prepare(
    `SELECT * FROM ${tablica} ${gde} ORDER BY ${porjadok} LIMIT ? OFFSET ?`
  ).all(...znachenija, na_stranice, otstup);

                                                                   
                                                                
                                                                  
                                                                     
                                                              
                        
  let spisok = stroki.map((r) => bez_summ(tablica, v_api(r), avtor));
                                                               
                                                                    
                                                          
                                                                     
                                                               
  if (typeof opisanie.dopolnit_spisok === 'function') {
    spisok = opisanie.dopolnit_spisok(db, spisok);
  } else if (typeof opisanie.dopolnit === 'function') {
    spisok = spisok.map((r) => {
      try { return { ...r, ...(opisanie.dopolnit(db, r, { den: den_iz_slova(zapros.den_konteksta || zapros.data || zapros.den) || undefined }) || {}) }; }
      catch { return r; }
    });
  }
  if(tablica==='ljudi')spisok=require('./filtry-sotrudnichestv.js').decorate(db,spisok,zapros,r=>bez_summ('sotrudnichestva',v_api(r),avtor));
  if (opisanie.chisla_spiska && zapros.s_chislami !== undefined) {
    spisok = opisanie.chisla_spiska(spisok, db);
  }
  spisok = pometit_neprochitannye(db, tablica, avtor, spisok, stroki);

                                                                    
                                                                 
                                                                    
  const primenennye_filtry = {};
  for (const [k, v] of Object.entries(zapros)) {
    if (tablica === 'zadachi' && k === 'den_konteksta') continue;
    if(tablica==='kommentarii'&&k==='sverit_ot_id')continue;
    if (SLUZHEBNYE_PARAMETRY.has(k) || v === undefined || v === '') continue;
    primenennye_filtry[k] = v;
  }

                                                                 
                                                                      
                                                                  
  const dejstvija = opisanie.dejstvija_spiska
    ? opisanie.dejstvija_spiska(primenennye_filtry) : [];

                                                                 
                                                                
                                                                 
  let active_filter_set = null;
  let izmenen = false;
  let zablokirovannye_filtry = [];
  if (zapros.nabor_filtrov_id) {
    try {
      const n = db.prepare('SELECT * FROM sohranennye_filtry WHERE id = ?')
        .get(Number(zapros.nabor_filtrov_id));
      if (n) {
        const sohraneno = JSON.parse(n.filtry || '{}');
        const seichas_bez = { ...primenennye_filtry };
        delete seichas_bez.nabor_filtrov_id;
        izmenen = JSON.stringify(sohraneno) !== JSON.stringify(seichas_bez);
        active_filter_set = {
          id: n.id,
          nazvanie: n.nazvanie,
          izmenen,
          filters_labels: Object.entries(sohraneno)
            .map(([k, v]) => `${k}: ${v}`),
        };
                                                                
                                                              
        const dostup = dostup_cheloveka(avtor);
        if (sohraneno.napravlenie && dostup === 'bez_deneg') {
          zablokirovannye_filtry = [
            { kod: 'napravlenie', znachenie: sohraneno.napravlenie },
          ];
        }
      }
    } catch {                                              }
  }

  let peopleFacets;
  if(tablica==='ljudi'){
    const facetQuery={...zapros};delete facetQuery.napravlenie;
    peopleFacets=require('./filtry-sotrudnichestv.js').directionCounts(db,facetQuery,filtry_spiska(tablica,opisanie,facetQuery,avtor));
  }
  return {
    spisok,
    vsego,
    ...(peopleFacets?{napravlenija_counts:peopleFacets}:{}),
    ...(commentMode?.floor?{sverka:require('./kommentarii.js').sverka(db,commentMode)}:{}),
    ...(iskat ? { poisk: iskat } : {}),
    vsego_bez_filtrov: vsego_bez_filtrov(db, tablica, opisanie),
    primenennye_filtry,
                                                                  
                                                                  
    s_arhivom: iz_stroki(zapros.arhiv) === true || zapros.s_arhivom === '1',
    active_filter_set,
    izmenen,
    zablokirovannye_filtry,
    ...(zablokirovannye_filtry.length
      ? { prichina_pustoty: 'net_dostupa_k_napravleniju' } : {}),
    dejstvija,
    stranica,
    stranic: Math.max(Math.ceil(vsego / na_stranice), 1),
    otfiltrovano: Object.keys(primenennye_filtry).length > 0,
  };
}

                                                                          
                                                                         
                                                                            
function kljuchi(opisanie) {
  const k = opisanie.kljuch || 'id';
  return Array.isArray(k) ? k : [k];
}

function odna(tablica, opisanie, kljuch, avtor) {
  return ['kontakty','zadachi'].includes(tablica)?v_odnoj_tranzakcii(baza(),()=>odna_stroka(tablica,opisanie,kljuch,avtor))
    :odna_stroka(tablica,opisanie,kljuch,avtor);
}
function odna_stroka(tablica, opisanie, kljuch, avtor) {
  if (avtor !== undefined) proverit_tablicu_deneg(tablica, avtor);
  const db = baza();
  const polja_kljucha = kljuchi(opisanie);
                                                                     
                                                    
  const znachenija = Array.isArray(kljuch)
    ? kljuch
    : String(kljuch).split(':', polja_kljucha.length);
  if (znachenija.length !== polja_kljucha.length) {
    throw new NeNajdeno(
      `${tablica}: ключ это ${polja_kljucha.join(' и ')}, через двоеточие`
    );
  }
  const gde = polja_kljucha.map((p) => `${p} = ?`).join(' AND ');
  const stroka = db.prepare(`SELECT * FROM ${tablica} WHERE ${gde}`).get(...znachenija);
  if (!stroka) throw new NeNajdeno(`${tablica}: записи ${kljuch} нет`);
                                                                     
                                                              
  let itog = v_api(stroka);
                                                               
                                                                   
  if (typeof opisanie.dopolnit === 'function') {
    itog = { ...itog, ...(opisanie.dopolnit(db, stroka) || {}) };
  }
                                                           
                                                                 
                                                            
                              
  if(tablica==='zadachi'){const focus=require('./fokus-zadacha.js');itog.fokus=focus.stats(db,stroka.id);if(Number.isSafeInteger(avtor))itog.mozhno_privjazat_fokus=focus.eligible(db,stroka,avtor);}
  if (avtor !== undefined) itog = bez_summ(tablica, itog, avtor);
  return itog;
}

function proverit_telo(tablica, opisanie, telo, sozdanie, bylo) {
  if(tablica==='akkaunty'&&sozdanie&&(telo.uroven==null||telo.uroven===''))telo={...telo,uroven:'public'};
  const nabor = polja(tablica);
  const chistoe = {};

  for (const [kljuch, znachenie] of Object.entries(telo)) {
    if(!sozdanie&&['arhiv_s','vozvrat_s'].includes(kljuch))throw new OshibkaVvoda('Дата архива меняется вместе с архивом',kljuch);
                                                                
                                                                     
                                                         
    if (kljuch === 'kljuch_sbora') continue;
    if (tablica === 'zadachi' && !sozdanie && kljuch === 'podtverzhdeno_podzadach') continue;
    if(tablica==='akkaunty'&&kljuch==='zagolovok')throw new OshibkaVvoda('Поле считается само','zagolovok');
    if (SERVERNYE.has(kljuch)) {
      if (kljuch === 'versija' && !sozdanie) continue;                            
      throw new OshibkaVvoda(`${kljuch} считается само`, kljuch);
    }
    if (!nabor.has(kljuch)) {
      throw new OshibkaVvoda(`неизвестное поле: ${kljuch}`, kljuch);
    }
                                                                       
                                                                        
                                                                       
                                                                
    const istochnik = (opisanie.spravochniki || {})[kljuch];
    const spravochnik = typeof istochnik === 'function' ? istochnik(baza()) : istochnik;
    if (spravochnik && znachenie !== null && !spravochnik.includes(znachenie)) {
      if(tablica==='kontakty'&&kljuch==='tip')require('./vidy-kontaktov.js').proverit(znachenie);
      throw new OshibkaVvoda(
        `${kljuch}: одно из ${spravochnik.join(', ')}`, kljuch
      );
    }
    if(tablica==='platezhi'&&kljuch==='summa')require('./platezhi.js').summa(znachenie);
    chistoe[kljuch] = v_bazu(znachenie, kljuch);
  }

  if (sozdanie || bylo) {
    for (const pole of opisanie.objazatelno || []) {
      if (!sozdanie && !(pole in chistoe)) continue;
      const v = chistoe[pole];
      if (v === undefined || v === null || v === '') {
        if(tablica==='kontakty'&&pole==='znachenie')require('./opisanija.js').proverit_znachenie_kontakta(chistoe.tip||bylo?.tip,v);
        throw new OshibkaVvoda(`${pole} обязательно`, pole);
      }
    }
  }
                                                                    
                                                                  
                                                                     
                                                  
  if (typeof opisanie.proverka === 'function') {
    const beda = opisanie.proverka(chistoe, bylo, telo);
    if (beda) throw new OshibkaVvoda(beda.tekst, beda.pole);
  }
  return chistoe;
}

                                                                        
function sozdat(tablica, opisanie, telo, avtor) {
  return v_odnoj_tranzakcii(baza(), () => sozdat_stroku(tablica, opisanie, telo, avtor));
}

function sozdat_stroku(tablica, opisanie, telo, avtor) {
  const db = baza();
  if(tablica==='zadachi')telo=require('./platezh-zadachi.js').input(db,telo,avtor);
  proverit_tablicu_deneg(tablica, avtor);
  proverit_zapis_deneg(tablica, telo, avtor);
  proverit_zapis_cifr(tablica, telo);
  const nabor = polja(tablica);
                                                                
                                                                    
                                                                    
                                                                   
                                                                 
  const svjazannye = {};
  for (const imja of opisanie.svjazannye_polja || []) {
    if (telo[imja] !== undefined) {
      svjazannye[imja] = telo[imja];
      telo = { ...telo };
      delete telo[imja];
    }
  }
  const dannye = proverit_telo(tablica, opisanie, telo, true);

  if (nabor.has('sozdano')) dannye.sozdano = seichas();
  if (nabor.has('versija')) dannye.versija = 1;
  if (nabor.has('kto_dobavil')) dannye.kto_dobavil = avtor;
                                                                
                                                               
                                                     
  if (opisanie.avtor_v_pole && nabor.has(opisanie.avtor_v_pole)) {
    dannye[opisanie.avtor_v_pole] = avtor;
  }
                                                                      
                                                                       
  if (opisanie.pered_zapisju) opisanie.pered_zapisju(dannye, db, avtor, svjazannye);
  require('./svjazi.js').proverit(db, tablica, dannye);

                                                                      
                                                                    
  if(opisanie.povtornaja_zapis?.(dannye,db,avtor)){
    return odna(tablica,opisanie,kljuchi(opisanie).map(key=>dannye[key]),avtor);
  }

  const imena = Object.keys(dannye);
  if (!imena.length) throw new OshibkaVvoda('пустое тело');

  const r = db.prepare(
    `INSERT INTO ${tablica} (${imena.join(', ')})
     VALUES (${imena.map(() => '?').join(', ')})`
  ).run(...imena.map((k) => dannye[k]));

  const polja_kljucha = kljuchi(opisanie);
                                                                         
                                                                   
                                                                   
                                                                   
                                                                 
                                                                 
  const zadan = polja_kljucha.every(
    (p) => dannye[p] !== undefined && dannye[p] !== null
  );
  const id = zadan ? polja_kljucha.map((p) => dannye[p]) : [Number(r.lastInsertRowid)];
                                                                    
                                                       
  v_zhurnal(db, tablica, tablica === 'zadachi' ? Number(r.lastInsertRowid) : id.join(':'),
    'sozdano', null, 'да', avtor);

                                                                             
                                                                           
                                                   
  const itog = odna(tablica, opisanie, id);
  if(S_VERSIEJ.has(tablica))require('./versii.js').zapomnit(db,tablica,itog.id ?? itog[require('../db/versii.js').TABLICY[tablica]],0,avtor);
  if (opisanie.posle_zapisi) {
    const dop = opisanie.posle_zapisi(itog, db, avtor, v_zhurnal);
    if (dop) Object.assign(itog, dop);
  }
                                                               
                                                               
                                                                 
                                      
  if (Object.keys(svjazannye).length && opisanie.razlozhit_svjazannye) {
    const dop = opisanie.razlozhit_svjazannye(itog, svjazannye, db, avtor);
    if (dop) Object.assign(itog, dop);
    Object.assign(itog, odna(tablica, opisanie, id));
  }
  return itog;
}

function pravit(tablica, opisanie, kljuch, telo, avtor) {
  return v_odnoj_tranzakcii(baza(), () => pravit_stroku(tablica, opisanie, kljuch, telo, avtor));
}

function pravit_stroku(tablica, opisanie, kljuch, telo, avtor) {
  proverit_tablicu_deneg(tablica, avtor);
  proverit_zapis_deneg(tablica, telo, avtor);
                                                                 
                                                                    
                                             
  proverit_zapis_cifr(tablica, telo);
  const db = baza();
  const nabor = polja(tablica);
                                                                   
                                                                      
                                               
  if (Array.isArray(opisanie.kljuch)) {
    throw new OshibkaVvoda(`${tablica} не правится: строки только добавляются`);
  }
  const pole_kljucha = opisanie.kljuch || 'id';
  const bylo = db.prepare(
    `SELECT * FROM ${tablica} WHERE ${pole_kljucha} = ?`
  ).get(kljuch);
  if (!bylo) throw new NeNajdeno(`${tablica}: записи ${kljuch} нет`);

  proverit_zapis_deneg(tablica, telo, avtor, bylo);

  if(tablica==='grafik')require('./prava-grafika.js').proverit(bylo.chelovek_id,avtor);
  if(tablica==='zadachi')require('./referral-tasks.js').validatePatch(db,bylo,telo,avtor);

  const patchBody = { ...telo };
  if (tablica === 'ljudi') delete patchBody.napravlenie_lida;
  if (tablica === 'kontakty') {delete patchBody.force;delete patchBody.osnovnoj_kontekst;delete patchBody.strana;delete patchBody.bez_maski;}
  const dannye = proverit_telo(tablica, opisanie, patchBody, false, bylo);
  if(tablica==='zadachi'&&dannye.ohvat===null&&pishet_sborshik(telo)){
    if(bylo.publikacija!==1)throw new OshibkaVvoda('ohvat измеряется у публикации','ohvat');
    delete dannye.ohvat;
    if(!Object.keys(dannye).length){require('./versii.js').proverit(db,tablica,bylo,telo.versija,['ohvat']);return odna(tablica,opisanie,kljuch,avtor);}
  }
  if (!Object.keys(dannye).length) throw new OshibkaVvoda('нечего менять');
  require('./arhiv.js').podgotovit(tablica,dannye,bylo,telo);
  if (tablica === 'zadachi' && dannye.status === 'sdelano' && bylo.status !== 'sdelano') {
    require('./sostojanie-zadachi.js').proverit_podtverzhdenie(db, bylo, telo);
  }
  if(tablica==='zadachi'&&dannye.status!==undefined&&dannye.status!==bylo.status)require('./versii.js').proverit(db,tablica,bylo,telo.versija,require('./sostojanie-zadachi.js').POLJA_STATUSA);
                                                                      
                                                                          
  if (tablica === 'kontakty' && telo.versija !== undefined) {
    const zavisimosti=['chelovek_id','tip'];
    if(dannye.osnovnoj!==undefined)zavisimosti.push('znachenie');
    require('./versii.js').proverit(db, tablica, bylo, telo.versija, zavisimosti);
  }
                                                              
                                                
  const pered=opisanie.pered_pravkoj?.(dannye, bylo, db, avtor, telo);
  require('./svjazi.js').proverit(db, tablica, { ...bylo, ...dannye });

  require('./versii.js').proverit(db,tablica,bylo,telo.versija,Object.keys(dannye));

  if (nabor.has('versija')) dannye.versija = Number(bylo.versija || 0) + 1;

  const nabory = Object.keys(dannye).map((k) => `${k} = ?`);
  db.prepare(
    `UPDATE ${tablica} SET ${nabory.join(', ')} WHERE ${pole_kljucha} = ?`
  ).run(...Object.keys(dannye).map((k) => dannye[k]), kljuch);

                                                                  
                                                                      
                                                                        
                             
  const pishem = new Set([...ZHURNALNYE, ...(opisanie.v_zhurnal || [])]);
  for (const [k, v] of Object.entries(dannye)) {
    if (k === 'versija') continue;
    if (!pishem.has(k)) continue;
                                                                
                                                               
                                                
    const id_zapisi = bylo.id ?? kljuch;
    v_zhurnal(db, tablica, id_zapisi, k, String(bylo[k] ?? ''), String(v ?? ''), avtor, bylo);
  }

  require('./versii.js').zapomnit(db,tablica,bylo.id ?? kljuch,bylo.versija,avtor);
  const itog = odna(tablica, opisanie, kljuch);
                                                                 
                                                                     
                                                                        
                                                                  
  if (opisanie.posle_pravki) {
    const dop = opisanie.posle_pravki(itog, bylo, db, avtor, telo, pered);
    if (dop) Object.assign(itog, dop);
  }
  return itog;
}

function udalit(tablica, opisanie, kljuch, avtor, options = {}) {
  return v_odnoj_tranzakcii(baza(), () => udalit_stroku(tablica, opisanie, kljuch, avtor, options));
}

function udalit_stroku(tablica, opisanie, kljuch, avtor, options) {
  proverit_tablicu_deneg(tablica, avtor);
                                                            
                                                                  
                                                  
  proverit_zapis_cifr(tablica, null);
  const db = baza();
  const nabor = polja(tablica);
                                                                    
                                                                  
  if (Array.isArray(opisanie.kljuch)) {
    throw new OshibkaVvoda(`${tablica} не удаляется: строки только добавляются`);
  }
  const pole_kljucha = opisanie.kljuch || 'id';
  if(tablica==='kontakty'){const state=require('./otmena-kontakta.js').proveritUdalenie(db,kljuch,avtor,options);if(state)return state;}
  const bylo = db.prepare(
    `SELECT * FROM ${tablica} WHERE ${pole_kljucha} = ?`
  ).get(kljuch);
  if (!bylo){const error=new NeNajdeno(`${tablica}: записи ${kljuch} нет`);if(tablica==='kontakty')error.dannye={kod:'kontakt_ne_najden'};throw error;}

                                                                         
  if (opisanie.pered_udaleniem) opisanie.pered_udaleniem(bylo, db, avtor, options);
  if(options.versija!==undefined||opisanie.versija_pri_udalenii)require('./versii.js').proverit(db,tablica,bylo,options.versija,Object.keys(bylo));
                                                                        
                                                                      
                                                                      

  if (opisanie.udalenie === 'net') {
    const e = new OshibkaVvoda(opisanie.pochemu_ne_udaljaetsja
      || `${tablica} не удаляется`);
    e.kod = 405;                                                           
    throw e;
  }

  if (opisanie.udalenie === 'nasovsem') {
                                                                    
                                                                    
                                                                     
                                                              
    const vmeste = opisanie.vmeste_s_nim || [];
    const snesti = () => {
      for (const v of vmeste) {
        if (v.cherez) {
                                                                     
                                                                      
                         
          const deti = db.prepare(v.cherez).all(kljuch).map((r) => r.id);
          if (deti.length) {
            db.prepare(`DELETE FROM ${v.tablica} WHERE ${v.pole} IN (`
              + deti.map(() => '?').join(', ') + ')').run(...deti);
          }
        } else {
          db.prepare(`DELETE FROM ${v.tablica} WHERE ${v.pole} = ?`).run(kljuch);
        }
      }
      db.prepare(`DELETE FROM ${tablica} WHERE ${pole_kljucha} = ?`).run(kljuch);
    };
    if (vmeste.length) v_odnoj_tranzakcii(db, snesti);
    else snesti();
                                                           
                                                              
    if (opisanie.posle_udalenija) opisanie.posle_udalenija(bylo, db, avtor);
    v_zhurnal(db, tablica, bylo.id ?? kljuch,
              'udaleno', 'нет', 'да', avtor, bylo);
    if(tablica==='kontakty')return {udaleno:true,deleted:true,[pole_kljucha]:kljuch,novyj_osnovnoj:db.prepare('SELECT id FROM kontakty WHERE chelovek_id=? AND tip=? ORDER BY osnovnoj DESC,porjadok,id LIMIT 1').get(bylo.chelovek_id,bylo.tip)?.id??null,token_otmeny:require('./otmena-kontakta.js').zapomnit(db,bylo,avtor,options),osnovnaja_gruppa:require('./osnovnoj-kontakt.js').sostojanie(db,bylo.chelovek_id,bylo.tip)};
    return { udaleno: true, [pole_kljucha]: kljuch };
  }

                                     
  const pole = nabor.has('udaleno') ? 'udaleno' : (nabor.has('udalen') ? 'udalen' : null);
  if (!pole) throw new OshibkaVvoda(`${tablica} не удаляется, есть архив`);

  db.prepare(`UPDATE ${tablica} SET ${pole} = 1 WHERE ${pole_kljucha} = ?`).run(kljuch);
  v_zhurnal(db, tablica, bylo.id ?? kljuch, pole, '0', '1', avtor, bylo);
  return { udaleno: true, [pole_kljucha]: kljuch,...(tablica==='zadachi'?{versija:db.prepare('SELECT versija FROM zadachi WHERE id=?').get(bylo.id).versija}:{}) };
}

                                                                       
  
                                                                           
                                                                        
                                                      
  
                                                                     
                                                                   
                                                                     
const OBEKT_ZHURNALA = {
  ljudi: 'chelovek', sotrudnichestva: 'sotrudnichestvo', proekty: 'proekt',
  zadachi: 'zadacha', celi: 'cel', rezultaty: 'rezultat', rassylki: 'rassylka',
  uslugi: 'usluga', platezhi: 'platezh', akkaunty: 'akkaunt',
  materialy: 'material', dokumenty: 'dokument', shablony: 'shablon',
  kontakty: 'kontakt', napravlenija: 'napravlenie', publikacii: 'publikacija',
  zamery: 'zamer', svjazi: 'svjaz', anketa: 'anketa', grafik: 'grafik',
  lenta: 'zapis', tezisy: 'tezis', kommentarii: 'kommentarij',
                                                                    
                                                                         
                                                                    
                                                    
  zamery_akkauntov: 'zamer_akkaunta', zapuski_sbora: 'zapusk_sbora',
                                                             
  bazy: 'baza', bazy_statusy: 'status_bazy', bazy_ljudi: 'chelovek_v_baze',
  nastrojki: 'nastrojki', nastrojki_sistemy: 'nastrojki_sistemy',
  snimki_planerki: 'snimok_planerki', anomalii: 'anomalija',
                                                               
                                                    
  oshibki: 'oshibka',
                                                                     
                                                                    
                                  
  periody: 'period',
};

                                                                          
                            
const TABLICA_OBEKTA = Object.fromEntries(
  Object.entries(OBEKT_ZHURNALA).map(([t, o]) => [o, t])
);

                                                          
const PODPIS_OBEKTA = {
  chelovek: 'человек', sotrudnichestvo: 'сотрудничество', proekt: 'проект',
  zadacha: 'задача', cel: 'цель', rezultat: 'результат', rassylka: 'рассылка',
  usluga: 'услуга', platezh: 'платёж', akkaunt: 'аккаунт',
  material: 'материал', dokument: 'документ', shablon: 'шаблон',
  kontakt: 'контакт', napravlenie: 'направление', publikacija: 'публикация',
  zamer: 'замер', svjaz: 'связь', anketa: 'анкета', grafik: 'график',
  zapis: 'запись', tezis: 'тезис',
  zamer_akkaunta: 'замер аккаунта', zapusk_sbora: 'запуск сбора',
  nastrojki: 'настройки', nastrojki_sistemy: 'настройки системы',
  snimok_planerki: 'снимок планёрки', anomalija: 'аномалия',
  baza: 'база', status_bazy: 'статус базы', chelovek_v_baze: 'строка базы',
                                                             
                                                           
                                                   
  period: 'период',
  oshibka: 'ошибка',
                                                                     
                                                                  
                                                   
  kommentarij: 'комментарий',
};

                                                                       
                                                     
const ZHURNALNYE = new Set([
  'status', 'stadija', 'rol', 'otvetstvennyj', 'srok', 'sprint', 'god_sprinta',
  'summa', 'prishlo', 'cel_id', 'arhiv', 'udaleno', 'udalen',
  'sozdano', 'otmetka', 'uchastnik', 'kasanie', 'procent', 'procent_shkala', 'nalog', 'dogovor_nomer', 'dogovor_id', 'vyplacheno',
                                                                       
  'porog_peregruza', 'nedel_v_okne', 'dnej_bez_obschenija_porog',
  'chasovoj_pojas', 'dostup', 'rol_v_baze', 'zablokirovan', 'pereschitan',
]);

function v_zhurnal(db, tablica, obekt_id, pole, bylo, stalo, kto, before) {
  const obekt = OBEKT_ZHURNALA[tablica];
                                                                 
                                                                             
  if (!obekt) {
    throw new Error(`журнал не знает таблицу ${tablica}, добавь её в OBEKT_ZHURNALA`);
  }
                                                              
                                                               
                                                                    
                                                      
  if (String(bylo ?? '') === String(stalo ?? '')) return;
  db.prepare(
    `INSERT INTO zhurnal (obekt, obekt_id, pole, bylo, stalo, kto, kogda, srez)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(obekt, obekt_id, pole, bylo, stalo, kto, seichas(),JSON.stringify(require('./kontekst-sobytija.js').snimok(db,tablica,obekt_id,pole,bylo,stalo,before,kto)));
  require('./versii.js').po_zhurnalu(db,tablica,obekt_id,pole,kto);
}

                                                                    
                                   
  
                                                                   
                                                                    
                                                                
                                                               
                                                                  
                                                                
                                         
  
                                                                   
                                                               
                                                     
function otmenit_po_zhurnalu(telo, avtor) {
  return v_odnoj_tranzakcii(baza(),()=>otmenit_stroki_zhurnala(telo,avtor));
}
function otmenit_stroki_zhurnala(telo, avtor) {
  const db = baza();
  for(const key of Object.keys(telo))if(!['zhurnal','dejstvie_id'].includes(key))throw new OshibkaVvoda('Неизвестный параметр отмены',key);
  const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
  if(telo.zhurnal!==undefined&&telo.dejstvie_id!==undefined)throw new OshibkaVvoda('Выбери действие или записи журнала, не оба сразу');
  if(telo.dejstvie_id!==undefined&&!uuid(telo.dejstvie_id))throw new OshibkaVvoda('Нужен ключ действия','dejstvie_id');

                                                              
                                      
  let stroki;
  if (telo.zhurnal!==undefined) {
    if(!Array.isArray(telo.zhurnal)||!telo.zhurnal.length||telo.zhurnal.length>500||telo.zhurnal.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(telo.zhurnal).size!==telo.zhurnal.length)throw new OshibkaVvoda('Нужен список разных номеров записей журнала','zhurnal');
    const mest = telo.zhurnal.map(() => '?').join(',');
    stroki = db.prepare(
      `SELECT * FROM zhurnal WHERE id IN (${mest}) AND kto = ? ORDER BY id`
    ).all(...telo.zhurnal.map(Number), Number(avtor));
    if(stroki.length!==telo.zhurnal.length)throw new NeNajdeno('Эти записи журнала не твои или их нет');
  } else {
                                                                       
    const poslednjaja = telo.dejstvie_id?null:db.prepare(
      'SELECT * FROM zhurnal WHERE kto = ? ORDER BY id DESC LIMIT 1'
    ).get(Number(avtor));
    if (!poslednjaja&&!telo.dejstvie_id) {
      const e = new Error('отменять нечего: в журнале нет твоих действий');
      e.kod = 404;
      throw e;
    }
                                                                          
                                                                               
    let action=telo.dejstvie_id;try{action||=JSON.parse(poslednjaja?.srez)?.dejstvie_id;}catch{}
    if(!uuid(action))throw new Konflikt('У старой записи нет целостного ключа отмены. Проверь карточку.',{istorija_nepolnaja:true});
    stroki = db.prepare(
      `SELECT * FROM zhurnal WHERE kto = ? AND srez IS NOT NULL AND json_extract(srez,'$.dejstvie_id')=?
       ORDER BY id LIMIT 501`
    ).all(Number(avtor),action);
  }

  if (!stroki.length) {
    const e = new Error('эти записи журнала не твои или их нет');
    e.kod = 404;
    throw e;
  }
  if(stroki.some(row=>{let command;try{command=JSON.parse(row.srez)?.dejstvie_id;}catch{}return row.obekt==='grafik'&&require('./otmena-grafika.js').protectedCommand(db,Number(avtor),command);}))throw new Konflikt('Это действие графика возвращается целиком. Используй отмену в графике');
  if(stroki.some(row=>row.pole==='plan_perioda'))throw new Konflikt('Периодные планы возвращаются целиком из формы планирования цели. Используй сохранённую команду возврата');
  if(stroki.some(row=>row.obekt==='snimok_planerki'))throw new Konflikt('Снимок недели возвращается целиком из планёрки. Используй сохранённое действие пересчёта');
  const publicationSource=require('./istochnik-publikacii-zadachi.js');
  if(stroki.some(r=>{let action;try{action=JSON.parse(r.srez)?.dejstvie_id;}catch{}return r.pole==='publikacija_istochnik'||publicationSource.undoRecord(db,Number(avtor),action);})){
    if(telo.zhurnal!==undefined)throw new Konflikt('Смена источника отменяется целиком. Используй ключ действия.');
    const sourceUndo=require('./istochnik-publikacii-zadachi.js').undo({dejstvie_id:telo.dejstvie_id||JSON.parse(stroki[0].srez).dejstvie_id},Number(avtor));if(sourceUndo)return sourceUndo;
    throw new Konflikt('Нет целостной операции смены источника. Связь не изменена.');
  }
  if(stroki.some(r=>r.obekt==='chelovek_v_baze'&&r.pole==='arhiv'))throw new Konflikt('Изменение состава базы отменяется со страницы базы: открой архив строк или используй кнопку возврата.');
  require('./referral-terms-history.js').assertComplete(db,stroki);
  require('./referral-task-history.js').assertComplete(db,stroki);
  require('./referral-payout-link.js').assertComplete(db,stroki,avtor);
  if(vidit_dengi(avtor))require('./referral-payout-link.js').assertPayoutUnlinked(db,stroki);
  const creationUndo=require('./otmena-sozdanija-zadachi.js'),checkedCreationCommands=new Set();
  for(const row of stroki){
    let command;try{command=JSON.parse(row.srez)?.dejstvie_id;}catch{}
    if(!command||checkedCreationCommands.has(command))continue;checkedCreationCommands.add(command);const creation=creationUndo.najti(db,Number(avtor),command);if(!creation)continue;
    if(telo.zhurnal!==undefined)throw new Konflikt('Создание задачи отменяется целиком. Используй ключ действия.');
    if(creation.snapshot.zadachi.some(z=>db.prepare('SELECT 1 FROM referalnye_zadachi WHERE zadacha_id=?').get(z.id)))require('./vyplata-referalu.js').prava(db,avtor);
    return creationUndo.otmenit(creation,Number(avtor));
  }
  for(const row of stroki){
    let command;try{command=JSON.parse(row.srez)?.dejstvie_id;}catch{}
    if(command&&db.prepare("SELECT 1 FROM zaprosy_platezhej WHERE json_extract(obratno,'$.server_command')=? LIMIT 1").get(command))throw new Konflikt('Это составное платёжное действие. Используй отмену в платеже.');
  }
  if(stroki.length>500)throw new OshibkaVvoda('Отмена больше 500 записей требует отдельного разбора','zhurnal');

                                                                              
                                                                          
                                                                    
  const vernuto = [];
  const ne_vyshlo = [];
  const plany=new Map(),tipy=new Map();
  const celi_otmeny=new Set();
  for(const z of stroki){const target=[z.obekt,z.obekt_id,z.pole].join(':');if(celi_otmeny.has(target))throw new OshibkaVvoda('Выбери одну последнюю правку каждого поля','zhurnal');celi_otmeny.add(target);}
  for (const z of [...stroki].reverse()) {
    const tablica = TABLICA_OBEKTA[z.obekt];
    if (!tablica) { ne_vyshlo.push({ zhurnal: z.id, pochemu: 'неизвестный объект' }); continue; }
                                                                  
    if (z.pole === 'sozdano' || (z.obekt==='sotrudnichestvo'&&z.pole==='rol'&&z.bylo===null)) {
      ne_vyshlo.push({ zhurnal: z.id, pochemu: 'создание отменяется удалением' });
      continue;
    }
                                                                     
                                                 
    if ((DENEZHNYE[tablica] || []).includes(z.pole) && !vidit_dengi(avtor)) {
      ne_vyshlo.push({ zhurnal: z.id, pochemu: 'у тебя доступ без денег',kod:403 });
      continue;
    }
    if (!vidit_dengi(avtor) && ['rezultaty','zamery'].includes(tablica)) {
      const result = tablica === 'rezultaty'
        ? db.prepare('SELECT * FROM rezultaty WHERE id=?').get(z.obekt_id)
        : db.prepare('SELECT r.* FROM rezultaty r JOIN zamery m ON m.rezultat_id=r.id WHERE m.id=?').get(z.obekt_id);
      if (!result || require('./dengi-okr.js').isMoney(db,result)) {
        ne_vyshlo.push({ zhurnal: z.id, pochemu: 'у тебя доступ без денег',kod:403 });
        continue;
      }
    }
    if(tablica==='rassylki'&&z.pole==='plan_chislo'){ne_vyshlo.push({zhurnal:z.id,pochemu:'Общий план меняется в карточке кампании. Введи прежнее число отдельной правкой: сохранённые волны и история останутся прежними.',kod:409});continue;}
    const nabor = polja(tablica);
    if (!nabor.has(z.pole)) {
      ne_vyshlo.push({ zhurnal: z.id, pochemu: `поля ${z.pole} в ${tablica} нет` });
      continue;
    }
                                                                   
                                                                          
                                                                           
    const OPIS = require('./opisanija.js').OPISANIJA[tablica] || {};
    let pole_kljucha = tablica==='zadachi'?'id':Array.isArray(OPIS.kljuch)
      ? null : (OPIS.kljuch || 'id');
    if (pole_kljucha && !nabor.has(pole_kljucha)) pole_kljucha = 'id';
    if (!pole_kljucha) {
      ne_vyshlo.push({ zhurnal: z.id, pochemu: 'составной ключ не откатывается' });
      continue;
    }
    try {
      let bylo=require('./otmena-versii.js').znachenie(z.pole,z.bylo);
      const before=db.prepare(`SELECT * FROM ${tablica} WHERE ${pole_kljucha}=?`).get(z.obekt_id);
      if(!before)throw new NeNajdeno('Записи больше нет');
      if(tablica==='grafik')require('./prava-grafika.js').proverit(before.chelovek_id,avtor);
      require('./otmena-versii.js').proverit(db,tablica,before,z);
      if(!tipy.has(tablica))tipy.set(tablica,new Map(db.prepare(`PRAGMA table_info(${tablica})`).all().map(c=>[c.name,c.type])));
      if(bylo!==null&&LOGICHESKIE.has(z.pole))bylo=bylo===1;
                                                                                     
      else if(bylo!==null&&!(tablica==='sotrudnichestva'&&['procent_shkala','nalog'].includes(z.pole))&&/INT|REAL|NUM|DEC|FLOAT|DOUBLE/i.test(tipy.get(tablica).get(z.pole)||'')){
        const parsed=Number(bylo);if(!Number.isFinite(parsed))throw new OshibkaVvoda('В журнале не подтверждено числовое значение',z.pole);bylo=parsed;
      }
      const planKey=JSON.stringify([tablica,z.obekt_id]);
      if(!plany.has(planKey))plany.set(planKey,{tablica,opisanie:OPIS,kljuch:before[OPIS.kljuch||'id'],telo:{versija:before.versija},zapisi:[]});
      const plan=plany.get(planKey);plan.telo[z.pole]=bylo;plan.zapisi.push(z);
      if(z.pole==='arhiv'){
        const archive=JSON.parse(z.srez)?.arhiv_do;
        if(!archive||!Object.hasOwn(archive,'arhiv'))throw new Konflikt('В старой записи не подтверждены даты архива. Проверь карточку.',{istorija_nepolnaja:true});
        plan.telo[require('./arhiv.js').VOSSTANOVIT_DATY]=archive;
      }
    } catch (e) {
      ne_vyshlo.push({ zhurnal: z.id, pochemu: e.kod?e.message:'Не удалось сохранить отмену',kod:e.kod||500 });
    }
  }

  const referralUndoHead=db.prepare('SELECT COALESCE(max(id),0) id FROM zhurnal').get().id;
  if(!ne_vyshlo.length)for(const plan of plany.values())try{
    const undoHead=db.prepare('SELECT COALESCE(max(id),0) id FROM zhurnal').get().id;
    require('./referral-tasks.js').duringUndo(db,plan,()=>pravit(plan.tablica,plan.opisanie,plan.kljuch,plan.telo,avtor));
    require('./referral-payout-history.js').markUndo(db,plan,undoHead);
    require('./referral-terms-history.js').markUndo(db,plan,undoHead);
    for(const z of plan.zapisi)vernuto.push({tablica:plan.tablica,id:z.obekt_id,pole:z.pole,stalo:z.bylo});
  }catch(e){ne_vyshlo.push({zhurnal:plan.zapisi[0].id,pochemu:e.kod?e.message:'Не удалось сохранить отмену',kod:e.kod||500});break;}
  if(ne_vyshlo.length){const code=ne_vyshlo.some(r=>r.kod>=500)?500:ne_vyshlo.some(r=>r.kod===403)?403:ne_vyshlo.some(r=>r.kod===409)?409:ne_vyshlo.some(r=>r.kod===404)?404:400;throw Object.assign(new Error('Отмена не применена. Проверь изменения в карточке.'),{kod:code,dannye:{vernuto:0,ne_vyshlo}});}
  require('./referral-task-history.js').afterUndo(db,stroki,referralUndoHead);
  require('./referral-payout-link.js').afterUndo(db,stroki,referralUndoHead);
  return { vernuto: vernuto.length, chto: vernuto,
           ne_vyshlo: ne_vyshlo.length ? ne_vyshlo : undefined };
}

module.exports = { spisok, filtry_spiska, odna, sozdat, pravit, udalit, v_zhurnal,
                   den_iz_slova,
                   OBEKT_ZHURNALA, TABLICA_OBEKTA, PODPIS_OBEKTA, ZHURNALNYE,
                   vidit_dengi, bez_summ, dostup_cheloveka, DENEZHNYE, TOLKO_DENGI,
                   otmenit_po_zhurnalu,
                   SBORSHIK_PISHET, pishet_sborshik, proverit_zapis_cifr,
                   kljuch_sborshika };
