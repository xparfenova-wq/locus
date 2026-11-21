const {createHash}=require('node:crypto'),{OshibkaVvoda,Konflikt,segodnja,seichas,v_api,v_odnoj_tranzakcii}=require('../db/db.js'),dates=require('./vremja-obschenija.js');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function params(query){
 const allowed=['vid','mesjac','napravlenie','klient_id','chje','format','ploshadka','rubrika','akkaunt_id','otvetstvennyj','skolko','prodolzhit'];for(const k of Object.keys(query))if(!allowed.includes(k))throw new OshibkaVvoda('Неизвестный отбор контент-плана',k);
 const month=query.mesjac??segodnja().slice(0,7);if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new OshibkaVvoda('Месяц в виде ГГГГ-ММ','mesjac');require('./kalendar.js').data(month+'-01','mesjac');
 const end=new Date(month+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
 const list=(name,max=100)=>{if(query[name]===undefined||query[name]==='')return [];if(typeof query[name]!=='string'||query[name].length>2000)throw new OshibkaVvoda('Нужен список отбора',name);const values=query[name].split(',');if(values.length>max||values.some(v=>!v||v.length>100)||new Set(values).size!==values.length)throw new OshibkaVvoda('Нужен список разных значений отбора',name);return values.sort();};
 const ids=(name,many=false)=>{const values=list(name,many?100:1);if(values.some(v=>!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<1))throw new OshibkaVvoda('Нужен положительный номер',name);return values.map(Number);};
 const direction=list('napravlenie',3);if(direction.some(v=>!/^[a-z][a-z0-9_-]*$/.test(v)))throw new OshibkaVvoda('Нужен код направления','napravlenie');
 const scope={mesjac:month,nachalo:month+'-01',konec:end.toISOString().slice(0,10),napravlenie:direction,klient_id:ids('klient_id',true),chje:query.chje??'vse',format:list('format'),ploshadka:list('ploshadka',1),rubrika:query.rubrika===undefined||query.rubrika===''?[]:[query.rubrika],akkaunt_id:ids('akkaunt_id'),otvetstvennyj:ids('otvetstvennyj')};if(!['vse','nashi','klientskie'].includes(scope.chje))throw new OshibkaVvoda('Выбери наши или клиентские публикации','chje');
 if(scope.rubrika.some(v=>typeof v!=='string'||v.length>100))throw new OshibkaVvoda('Рубрика до 100 знаков','rubrika');
 const limit=query.skolko===undefined?100:Number(query.skolko);if(typeof query.skolko==='boolean'||!Number.isSafeInteger(limit)||limit<1||limit>200)throw new OshibkaVvoda('От 1 до 200 публикаций за чтение','skolko');return {scope,limit};
}
function privateReach(db,post,account){
 if(!account)return {znachenie:null,data:null};
 const source=require('./istochnik-publikacii-zadachi.js'),config=require('./kontekst-akkaunta.js').kontekst(db,account);
 return source.measurement(db,{publikacija_id:post.id,akkaunt_id:account.id,akkaunt_kontekst:config,sobytie_akkaunta:source.epoch(db,'akkaunt',account.id)},segodnja());
}
                                                                             
                                                 
function readBinding(db,task,link,accounts,source){
 if(!link||task.udaleno===1||task.publikacija!==1||task.akkaunt_id!==link.akkaunt_id||source.epoch(db,'zadacha',task.id)!==link.sobytie_zadachi||source.epoch(db,'akkaunt',link.akkaunt_id)!==link.sobytie_akkaunta)return false;
 const account=accounts.get(link.akkaunt_id);
 if(account&&(account.ploshadka!==task.ploshadka||require('./kontekst-akkaunta.js').kontekst(db,account)!==link.akkaunt_kontekst||account.udalen!==1&&!source.valid(db,task,link)))return false;
 const post=db.prepare('SELECT daty_izmerenij FROM publikacii WHERE id=? AND akkaunt_id=?').get(link.publikacija_id,link.akkaunt_id),identity=require('./snimki-akkaunta.js').daty(post)._akkaunt?.data_vyhoda;
 return !identity||identity===link.akkaunt_kontekst;
}
function safeURL(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function summary(rows){
 const out={zaplanirovano:0,vyshlo:0,otmeneno:0,ohvat:null,ohvat_po:0,ohvat_iz:0,ohvat_polnyj:false,nezavershennyh_zadach:0};let sum=0;
 for(const row of rows){if(row.sostojanie==='plan')out.zaplanirovano++;else if(row.sostojanie==='otmena')out.otmeneno++;else{out.vyshlo++;out.nezavershennyh_zadach+=row.zadachi.filter(t=>t.status!=='sdelano').length;if(typeof row.ohvat==='number'&&Number.isSafeInteger(row.ohvat)&&row.ohvat>=0){sum+=row.ohvat;out.ohvat_po++;}}}
 out.ohvat_iz=out.vyshlo;out.ohvat=Number.isSafeInteger(sum)&&(out.ohvat_po>0||out.vyshlo===0)?sum:null;out.ohvat_polnyj=out.ohvat_po===out.vyshlo&&out.ohvat!==null;return out;
}
function collect(db,scope,actor){
 const accounts=new Map(db.prepare('SELECT * FROM akkaunty').all().map(a=>[a.id,a])),projects=new Map(db.prepare('SELECT id,klient_id FROM proekty').all().map(p=>[p.id,p.klient_id])),source=require('./istochnik-publikacii-zadachi.js');
 const links=new Map(db.prepare('SELECT * FROM istochniki_publikacij_zadach').all().map(l=>[l.zadacha_id,l])),posts=new Map(db.prepare("SELECT * FROM publikacii WHERE date(data_vyhoda,'+3 hours') BETWEEN ? AND ?").all(scope.nachalo,scope.konec).filter(p=>dates.den(p.data_vyhoda)<=segodnja()).map(p=>[p.id,p]));
 const taskRows=db.prepare("SELECT z.* FROM zadachi z LEFT JOIN istochniki_publikacij_zadach l ON l.zadacha_id=z.id LEFT JOIN publikacii p ON p.id=l.publikacija_id AND p.akkaunt_id=l.akkaunt_id WHERE z.publikacija=1 AND (date(coalesce(z.data_vyhoda,z.srok),'+3 hours') BETWEEN ? AND ? OR date(p.data_vyhoda,'+3 hours') BETWEEN ? AND ?) ORDER BY z.id").all(scope.nachalo,scope.konec,scope.nachalo,scope.konec);
 const rows=[],groups=new Map();
 for(const task of taskRows){
  const safe=require('./obschij.js').bez_summ('zadachi',v_api(task),actor),link=links.get(task.id),linked=readBinding(db,task,link,accounts,source),post=linked?posts.get(link.publikacija_id):null;
                                                                          
  if(linked&&!post){const raw=db.prepare('SELECT data_vyhoda FROM publikacii WHERE id=? AND akkaunt_id=?').get(link.publikacija_id,link.akkaunt_id),actual=dates.den(raw?.data_vyhoda);if(actual&&(actual<scope.nachalo||actual>scope.konec))continue;}
  const date=post?dates.den(post.data_vyhoda):dates.den(task.data_vyhoda??task.srok);if(!date||date<scope.nachalo||date>scope.konec)continue;
  const detail={id:task.id,nomer:task.nomer,nazvanie:safe.nazvanie,napravlenie:task.napravlenie,status:task.status,udaleno:task.udaleno===1,otvetstvennyj:task.otvetstvennyj,data_vyhoda:dates.den(task.data_vyhoda??task.srok)},key=linked?'p:'+link.publikacija_id:'z:'+task.id;
  if(linked&&groups.has(key)){groups.get(key).zadachi.push(detail);continue;}
  const value=source.observedReach(db,task,link,segodnja()),published=linked&&date<=segodnja()||task.status==='sdelano'&&date<=segodnja(),row={kljuch:key,nazvanie:safe.nazvanie,data:date,napravlenie:task.napravlenie,ploshadka:task.ploshadka,format:task.format,rubrika:task.rubrika,nomer:task.nomer,klient_id:task.klient_id??projects.get(task.proekt_id)??null,proekt_id:task.proekt_id??null,akkaunt_id:task.akkaunt_id??null,otvetstvennyj:task.otvetstvennyj,ssylka:safeURL(post?.ssylka),publikacija_id:linked?link.publikacija_id:null,ohvat:value.znachenie,ohvat_data:value.data,sostojanie:task.udaleno===1?'otmena':published?'vyshlo':'plan',istochnik_nedostupen:!!linked&&!post,zadachi:[detail]};
  rows.push(row);if(linked)groups.set(key,row);
 }
 for(const post of posts.values()){
  if(groups.has('p:'+post.id))continue;
  const account=accounts.get(post.akkaunt_id),value=privateReach(db,post,account);
  rows.push({kljuch:'p:'+post.id,nazvanie:typeof post.zagolovok==='string'&&post.zagolovok?post.zagolovok:'публикация',data:dates.den(post.data_vyhoda),napravlenie:account?.napravlenie??null,ploshadka:account?.ploshadka??null,format:post.format??null,rubrika:null,nomer:null,klient_id:projects.get(account?.proekt_id)??null,proekt_id:account?.proekt_id??null,akkaunt_id:post.akkaunt_id,otvetstvennyj:account?.vladelec??null,ssylka:safeURL(post.ssylka),publikacija_id:post.id,ohvat:value.znachenie,ohvat_data:value.data,sostojanie:'vyshlo',istochnik_nedostupen:false,zadachi:[]});
 }
 const clientIds=[...new Set(rows.map(r=>r.klient_id).filter(v=>v!=null))].sort((a,b)=>a-b),clients=clientIds.map(id=>({id,imja:db.prepare('SELECT imja FROM ljudi WHERE id=?').get(id)?.imja??'клиент'}));
 const facets={napravlenija:[...new Set(rows.map(r=>r.napravlenie).filter(Boolean))].sort(),formaty:[...new Set(rows.map(r=>r.format).filter(Boolean))].sort(),klienty:clients};
 const filtered=rows.filter(r=>(!scope.napravlenie.length||scope.napravlenie.includes(r.napravlenie))&&(!scope.klient_id.length||scope.klient_id.includes(r.klient_id))&&(scope.chje==='vse'||(scope.chje==='nashi'?r.klient_id==null:r.klient_id!=null))&&(!scope.format.length||scope.format.includes(r.format))&&(!scope.ploshadka.length||scope.ploshadka.includes(r.ploshadka))&&(!scope.rubrika.length||scope.rubrika.includes(r.rubrika))&&(!scope.akkaunt_id.length||scope.akkaunt_id.includes(r.akkaunt_id))&&(!scope.otvetstvennyj.length||r.zadachi.some(t=>scope.otvetstvennyj.includes(t.otvetstvennyj))||scope.otvetstvennyj.includes(r.otvetstvennyj))).sort((a,b)=>a.data.localeCompare(b.data)||(a.kljuch<b.kljuch?-1:a.kljuch>b.kljuch?1:0));
 return {rows:filtered,facets};
}
function readSnapshot({db,zapros,avtor}){
 const {scope,limit}=params(zapros),all=collect(db,scope,avtor),aggregate=summary(all.rows),signature=hash({actor:avtor,scope,rows:all.rows,summary:aggregate,facets:all.facets});let start=0;
 if(zapros.prodolzhit!==undefined){try{if(typeof zapros.prodolzhit!=='string'||zapros.prodolzhit.length>2000||!/^[A-Za-z0-9_-]+$/.test(zapros.prodolzhit))throw new Error();const cursor=JSON.parse(Buffer.from(zapros.prodolzhit,'base64url'));if(cursor.signature!==signature||typeof cursor.last!=='string')throw new Error();const index=all.rows.findIndex(r=>r.kljuch===cursor.last);if(index<0)throw new Error();start=index+1;}catch{throw new Konflikt('Контент-план изменился. Обнови список перед продолжением.',{spisok_izmenilsja:true});}}
 const selected=all.rows.slice(start,start+limit),more=start+selected.length<all.rows.length;
 return {telo:{mesjac:scope.mesjac,nachalo:scope.nachalo,konec:scope.konec,na_datu:segodnja(),sobrano_at:seichas(),spisok:selected,vsego:all.rows.length,prodolzhit:more?Buffer.from(JSON.stringify({signature,last:selected.at(-1).kljuch})).toString('base64url'):null,svodka:aggregate,facets:all.facets}};
}
function handle(ctx){return v_odnoj_tranzakcii(ctx.db,()=>readSnapshot(ctx));}
module.exports={params,privateReach,summary,readBinding,collect,handle};
