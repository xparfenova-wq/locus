const {createHash}=require('node:crypto');
const {OshibkaVvoda,Konflikt,v_api,v_odnoj_tranzakcii}=require('../db/db.js');
const {OBEKT_ZHURNALA,TABLICA_OBEKTA,PODPIS_OBEKTA}=require('./obschij.js');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function positive(value,field){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw new OshibkaVvoda('Нужно положительное целое число',field);return n;}
function personScope(query){
 if(!Object.hasOwn(query,'chelovek'))return query;
 const id=value=>{if(typeof value==='boolean'||!['number','string'].includes(typeof value)||typeof value==='string'&&!/^[1-9]\d*$/.test(value))throw new OshibkaVvoda('Нужен номер человека','chelovek');return positive(value,'chelovek');},person=id(query.chelovek);
 if(query.obekt!==undefined&&(OBEKT_ZHURNALA[query.obekt]||query.obekt)!=='chelovek')throw new OshibkaVvoda('Фильтр человека не относится к другому объекту','chelovek');
 for(const key of['id','obekt_id'])if(query[key]!==undefined&&id(query[key])!==person)throw new OshibkaVvoda('Укажите одного человека истории','chelovek');
 const normalized={...query,obekt:'chelovek',obekt_id:person};delete normalized.chelovek;delete normalized.id;return normalized;
}
function cursor(value){
 if(typeof value!=='string'||value.length>1600||!/^[A-Za-z0-9_-]+$/.test(value))throw new OshibkaVvoda('Некорректная страница истории','prodolzhit');
 let data;try{data=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));}catch{}
 if(!data||data.v!==1||!Number.isSafeInteger(data.head)||data.head<0||!Number.isSafeInteger(data.last)||data.last<=0||data.last>data.head||!Number.isSafeInteger(data.actor)||data.actor<0||typeof data.filters!=='string'||!/^[a-f0-9]{64}$/.test(data.filters)||typeof data.access!=='string'||!/^[a-f0-9]{64}$/.test(data.access))throw new OshibkaVvoda('Некорректная страница истории','prodolzhit');
 return data;
}
function chitat(db,query={},actor=null,{defaultSince=null}={}){return v_odnoj_tranzakcii(db,()=>{
 query=personScope(query);
 const page=query.prodolzhit===undefined?null:cursor(query.prodolzhit);
 const currentHead=db.prepare('SELECT COALESCE(MAX(id),0) n FROM zhurnal').get().n,head=page?.head??currentHead;
 if(defaultSince){if(page&&!(typeof page.defaultSince==='string'&&page.defaultSince.length<=100&&Number.isFinite(Date.parse(page.defaultSince))))throw new OshibkaVvoda('Некорректный период истории','prodolzhit');query={...query,s_daty:page?.defaultSince||defaultSince};}
 const conditions=[],args=[],filters={};
 const object=query.obekt?(OBEKT_ZHURNALA[query.obekt]||query.obekt):null;
 const related=String(query.svjazannye||'')==='1';if(related&&!['proekt','cel','zadacha'].includes(object))throw new OshibkaVvoda('У этой истории нет связанных событий','svjazannye');
 if(object){if(!PODPIS_OBEKTA[object])throw new OshibkaVvoda('Неизвестный объект истории','obekt');if(!related){conditions.push('z.obekt=?');args.push(object);}filters.obekt=object;}
 if(query.id!==undefined&&query.obekt_id!==undefined&&String(query.id)!==String(query.obekt_id))throw new OshibkaVvoda('Укажите одну запись истории','obekt_id');
 const sourceId=query.obekt_id??query.id;
 if(sourceId!==undefined){const id=object==='napravlenie'?String(sourceId):positive(sourceId,'obekt_id');if(!related){conditions.push('z.obekt_id=?');args.push(id);}filters.obekt_id=id;}
 if(related&&!filters.obekt_id)throw new OshibkaVvoda('Нужна запись истории','obekt_id');
 const relation=related?require('./svjazannaja-istorija.js').sozdat(db,object,filters.obekt_id,head):null;if(related){filters.svjazannye=true;filters.svjazi=relation.otpechatok;}
 if(query.kto!==undefined){const actorId=positive(query.kto,'kto');conditions.push('z.kto=?');args.push(actorId);filters.kto=actorId;}
 if(query.pole){conditions.push('z.pole=?');args.push(String(query.pole));filters.pole=String(query.pole);}
 for(const [field,operator]of [['s_daty','>='],['po_datu','<=']])if(query[field]){const date=String(query[field]);if(date.length>100||!Number.isFinite(Date.parse(date)))throw new OshibkaVvoda('Нужна действительная дата',field);conditions.push('julianday(z.kogda)'+operator+'julianday(?)');args.push(date);filters[field]=date;}
 const rawLimit=query.skolko??query.na_stranice??100,number=positive(rawLimit,'skolko'),limit=Math.min(number,500);
 const policy=actor===null?{razresheno:()=>true,otpechatok:hash('test-without-actor')}:require('./pravila-otveta.js').zhurnalDostup(db,actor,head);
 const filterHash=hash(filters),actorId=actor??0;
 if(page&&(page.actor!==actorId||page.filters!==filterHash||page.access!==policy.otpechatok||page.head>currentHead))throw new Konflikt('История изменилась. Обнови её.',{istorija_obnovit:true});
 const where=['z.id<=?',...conditions].join(' AND '),rows=db.prepare('SELECT z.*,l.imja kto_imja FROM zhurnal z LEFT JOIN ljudi l ON l.id=z.kto WHERE '+where+' ORDER BY julianday(z.kogda) DESC,z.id DESC').iterate(head,...args);
 const selected=[];let total=0,found=!page,more=false;
 const allowedRoot=!related||policy.razresheno({obekt:object,obekt_id:filters.obekt_id,pole:'status'});
 for(const row of rows){
  if(!allowedRoot||!policy.razresheno(row))continue;const context=relation?.match(row);if(related&&!context)continue;total++;
  if(!found){if(row.id===page.last)found=true;continue;}
  if(selected.length<limit)selected.push(context?{...row,...context}:row);else more=true;
 }
 if(!found)throw new Konflikt('История изменилась. Обнови её.',{istorija_obnovit:true});
 const next=more&&selected.length?Buffer.from(JSON.stringify({v:1,head,last:selected.at(-1).id,actor:actorId,filters:filterHash,access:policy.otpechatok,defaultSince:defaultSince?query.s_daty:null})).toString('base64url'):null;
 return {spisok:selected.map(row=>({...v_api(row),chto:PODPIS_OBEKTA[row.obekt]||row.obekt,tablica:TABLICA_OBEKTA[row.obekt]||null})),vsego:total,prodolzhit:next};
});}
module.exports={chitat};
