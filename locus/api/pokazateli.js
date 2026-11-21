                                                                      
function count(db, from, measure, where, date, period, directionColumn, direction, baseColumn, base) {
  const parts = [where || '1=1'], args = [];
  if (date && period) { parts.push(`date(${date}) BETWEEN ? AND ?`); args.push(period.nachalo, period.konec); }
  if (direction && directionColumn) { parts.push(`${directionColumn}=?`); args.push(direction); }
  if (base && baseColumn) { parts.push(`${baseColumn}=?`); args.push(base); }
  return db.prepare(`SELECT ${measure} n FROM ${from} WHERE ${parts.join(' AND ')}`).get(...args).n;
}
const mailing = (measure, where, date) => (db, period, base, direction) => count(db,
  'rassylka_ljudi rl JOIN rassylki rs ON rs.id=rl.rassylka_id', measure, where, date,
  period, 'rs.napravlenie', direction, 'rs.baza_id', base);
const people = (role, referral = false) => (db, period, base, direction) => count(db,
  'sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id', 'count(DISTINCT s.chelovek_id)',
  `s.rol='${role}' AND COALESCE(s.arhiv,0)=0 AND COALESCE(l.arhiv,0)=0 AND l.rol_v_baze IS NOT 'kontaktnoe_lico'${referral ? " AND s.istochnik='rekomendacija'" : ''}`,
  null, null, 's.napravlenie', direction);
const growth = (role, referral=false) => (db,period,base,direction,mode='tolko_novye') =>
  require('./pervaja-rol.js').pervaja_rol(db,role,period,direction,referral,mode).znachenie;
const task = (measure, where, date) => (db, period, base, direction) => count(db,
  'zadachi z', measure, `${where} AND COALESCE(z.udaleno,0)=0`, date, period, 'z.napravlenie', direction);
const stage = where => (db, period, base, direction) => count(db,
  'bazy_ljudi bl JOIN bazy_statusy s ON s.id=bl.status_id JOIN bazy b ON b.id=bl.baza_id',
  'count(*)', '('+where+') AND '+require('./sostojanie-strok-bazy.js').active('bl'), null, null, 'b.napravlenie', direction, 'bl.baza_id', base);
const POKAZATELI = {
  rassylok_otpravleno: (db,period,base,direction)=>require('./volny-rassylok.js').metric(db,'rassylok_otpravleno',period,base,direction),
  pisem_otpravleno: (db,period,base,direction)=>require('./volny-rassylok.js').metric(db,'pisem_otpravleno',period,base,direction),
  otvetili_na_rassylku: (db,period,base,direction)=>require('./volny-rassylok.js').metric(db,'otvetili_na_rassylku',period,base,direction),
  otkazalis: (db,period,base,direction)=>require('./volny-rassylok.js').metric(db,'otkazalis',period,base,direction),
  kontaktov_v_baze: (db, period, base, direction) => mailing('count(*)', "(rs.baza_id IS NULL OR rs.status='zavershena' OR EXISTS(SELECT 1 FROM bazy_ljudi bl WHERE bl.baza_id=rs.baza_id AND bl.kto=rl.chelovek_id AND "+require('./sostojanie-strok-bazy.js').active('bl')+"))", null)(db, null, base, direction),
  lidov: growth('lid'), klientov: people('klient'),
  lidov_ot_referalov: growth('lid', true), klientov_ot_referalov: people('klient', true),
  novyh_klientov: growth('klient'), novyh_klientov_ot_referalov: growth('klient',true),
  novyh_lidov: growth('lid'), klientov_po_rekomendacii: people('klient',true),
  summa_oplat: (db, period, base, direction) => count(db,
    'platezhi p JOIN proekty pr ON pr.id=p.proekt_id', 'COALESCE(sum(p.summa),0)',
    'p.oplachen_at IS NOT NULL', "date(p.oplachen_at,'+3 hours')", period, 'pr.napravlenie', direction),
  publikacij_vyshlo: (db,period,base,direction)=>require('./fakty-publikacij.js').srez(db,period,direction).vyshlo,
  ohvat_publikacij: (db,period,base,direction)=>require('./fakty-publikacij.js').srez(db,period,direction).ohvat,
  zadach_zakryto: (db,period,base,direction)=>period?.istoricheskij
    ?require('./istoricheskie-zakrytija.js').schitat(db,period,direction)
    :task('count(*)', "z.status='sdelano'", require('./zavershenie.js').data_zakrytija())(db,period,base,direction),
                                                                       
                                                               
  rassylka_otpravleno: stage("s.rol <> 'v_rabote'"),
  rassylka_otvetili: stage("s.rol IN ('otkliknulsja','soglasilsja')"),
  rassylka_soglasilis: stage("s.rol='soglasilsja'"),
  rassylka_otkazy: stage("s.rol='otkaz'"),
};
const MOMENTNYE = new Set(['klientov','klientov_ot_referalov','klientov_po_rekomendacii','kontaktov_v_baze',
  'rassylka_otpravleno','rassylka_otvetili','rassylka_soglasilis','rassylka_otkazy']);
module.exports = { POKAZATELI, MOMENTNYE };
