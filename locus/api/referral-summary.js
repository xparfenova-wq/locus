const money=require('./referral-money.js');
function summary(db,s,today) {
                                                                            
                                                                 
  const all=db.prepare(`SELECT s.id sotrudnichestvo_id,s.chelovek_id,s.napravlenie,s.rol,
    s.stadija,s.istochnik,l.imja,l.foto,l.inicialy
    FROM sotrudnichestva s JOIN ljudi l ON l.id=s.chelovek_id
    WHERE s.istochnik='rekomendacija' AND s.rekomendoval_id=? AND s.napravlenie=?
    ORDER BY l.imja,CASE s.rol WHEN 'klient' THEN 0 WHEN 'lid' THEN 1 ELSE 2 END,s.id`).all(s.chelovek_id,s.napravlenie);
  const people=new Map();
  for(const row of all)if(!people.has(row.chelovek_id))people.set(row.chelovek_id,row);
  const invoices=db.prepare(`SELECT pl.summa,pl.oplachen_at FROM platezhi pl
    JOIN proekty p ON p.id=pl.proekt_id WHERE p.napravlenie=?
    AND pl.oplachen_at IS NOT NULL AND pl.oplachen_at<>'' AND EXISTS(
      SELECT 1 FROM sotrudnichestva c WHERE c.chelovek_id=p.klient_id
      AND c.napravlenie=p.napravlenie AND c.istochnik='rekomendacija' AND c.rekomendoval_id=?)`).all(s.napravlenie,s.chelovek_id);
  let income=0n;const issues=[];
  for(const row of invoices){
    let value=money.cents(row.summa);
    try{require('./platezhi.js').data(row.oplachen_at,'oplachen_at');}catch{value=null;}
    if(value===null){issues.push('neproverennaja_oplata');income=null;}else if(income!==null)income+=value;
  }
  const paid=money.cents(s.vyplacheno),percent=money.rate(s.procent);
  if(paid===null)issues.push('vyplacheno_ne_ukazano');
  if(!percent)issues.push(s.procent_shkala||s.procent!=null?'ruchnaja_shkala':'procent_ne_ukazan');
  const taxRow=db.prepare('SELECT stavka_naloga FROM nastrojki_sistemy LIMIT 1').get();
  const tax=taxRow?.stavka_naloga??6,validTax=money.rate(tax);
  if(!validTax)issues.push('stavka_naloga_neverna');
  const taxMode=['do_vycheta','posle_vycheta'].includes(s.nalog);
  if(!taxMode)issues.push('nalog_ne_ukazan');
  const accrued=percent&&taxMode&&(s.nalog==='do_vycheta'||validTax)
    ?money.accrual(income,s.procent,s.nalog==='posle_vycheta'?tax:0):null;
  const owed=accrued===null||paid===null?null:accrued-paid;
  const values={zarabotano:income,nachisleno:accrued,vyplacheno:paid,k_vyplate:owed};
  const numeric=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,money.number(value)]));
  const exact=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,money.text(value)]));
  return {sotrudnichestvo_id:s.id,versija:s.versija,rol:s.rol,napravlenie:s.napravlenie,
    privodit_klientov:!!s.privodit_klientov,arhiv:!!s.arhiv,segodnja:today,chelovek_id:s.chelovek_id,
    spisok:[...people.values()],privedeno:people.size,...numeric,
    procent:s.procent??null,procent_shkala:s.procent_shkala||null,nalog:s.nalog||null,
    stavka_naloga:validTax?Number(tax):null,
    dengi:{...exact,prichiny:[...new Set(issues)],rezhim:percent?'chislo':s.procent_shkala||s.procent!=null?'shkala':'ne_soglasovan'},
    poslednjaja_vyplata:require('./referral-payout-history.js').last(db,s)};
}
module.exports={summary};
