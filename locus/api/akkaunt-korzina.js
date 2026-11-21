const {baza,OshibkaVvoda,v_api}=require('../db/db.js');
function integer(value,fallback,max,field){
 if(value===undefined)return fallback;
 if(!['string','number'].includes(typeof value)||!/^\d+$/.test(String(value)))throw new OshibkaVvoda('Нужно целое число от 1',field);
 const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>max)throw new OshibkaVvoda('Число вне допустимых границ',field);return n;
}
function list(query={}){
 for(const key of Object.keys(query))if(!['tip','napravlenie','klient_id','stranica','na_stranice'].includes(key))throw new OshibkaVvoda('Неизвестный параметр корзины аккаунтов',key);
 const db=baza(),type=query.tip??'vse',where=['COALESCE(a.udalen,0)=1'],values=[];let context={tip:type},name='Все аккаунты';
 if(!['vse','napravlenie','klient'].includes(type))throw new OshibkaVvoda('Выбери направление, клиента или все аккаунты','tip');
 if(type==='napravlenie'){
  if(query.klient_id!==undefined||typeof query.napravlenie!=='string'||!query.napravlenie)throw new OshibkaVvoda('Нужно одно направление','napravlenie');
  const row=db.prepare('SELECT nazvanie FROM napravlenija WHERE kod=?').get(query.napravlenie);if(!row)throw new OshibkaVvoda('Направление не найдено','napravlenie');
  where.push('a.napravlenie=? AND a.proekt_id IS NULL');values.push(query.napravlenie);context.napravlenie=query.napravlenie;name=row.nazvanie;
 }else if(type==='klient'){
  if(query.napravlenie!==undefined)throw new OshibkaVvoda('Нужен один клиент','klient_id');const id=integer(query.klient_id,null,Number.MAX_SAFE_INTEGER,'klient_id');
  const row=id&&db.prepare('SELECT imja FROM ljudi WHERE id=?').get(id);if(!row)throw new OshibkaVvoda('Клиент не найден','klient_id');
  where.push('p.klient_id=?');values.push(id);context.klient_id=id;name=row.imja;
 }else if(query.napravlenie!==undefined||query.klient_id!==undefined)throw new OshibkaVvoda('Для фильтра выбери тип привязки','tip');
 const page=integer(query.stranica,1,1000000,'stranica'),size=integer(query.na_stranice,100,200,'na_stranice');
 const from=' FROM akkaunty a LEFT JOIN proekty p ON p.id=a.proekt_id LEFT JOIN ljudi l ON l.id=p.klient_id LEFT JOIN napravlenija n ON n.kod=a.napravlenie WHERE '+where.join(' AND '),total=db.prepare('SELECT count(*) n'+from).get(...values).n;
 const rows=db.prepare('SELECT a.*,p.nazvanie proekt_nazvanie,p.klient_id klient_id,l.imja klient_imja,n.nazvanie napravlenie_nazvanie'+from+' ORDER BY a.porjadok,a.id LIMIT ? OFFSET ?').all(...values,size,(page-1)*size);
 return {spisok:rows.map(v_api),vsego:total,stranica:page,na_stranice:size,stranic:Math.ceil(total/size),kontekst:context,nazvanie:name};
}
module.exports={list};
