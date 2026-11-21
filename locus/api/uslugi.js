                                                                        
const {createHash}=require('node:crypto');
const {baza,OshibkaVvoda,Konflikt,NeNajdeno,NetDostupa,v_api}=require('../db/db.js');
const common=require('./obschij.js');
const fields=['nazvanie','opisanie','cena','ssylka','arhiv','porjadok'];
const description=()=>require('./opisanija.js').OPISANIJA.uslugi;
function positive(value,field='id'){
 if(!['number','string'].includes(typeof value)||!/^\d+$/.test(String(value)))throw new OshibkaVvoda('Нужен номер записи',field);
 const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new OshibkaVvoda('Нужен номер записи',field);return id;
}
function direction(db,kod){if(typeof kod!=='string'||!db.prepare('SELECT kod FROM napravlenija WHERE kod=?').get(kod))throw new NeNajdeno('Направление не найдено');return kod;}
function row(db,id){const value=db.prepare('SELECT * FROM uslugi WHERE id=?').get(positive(id));if(!value)throw new NeNajdeno('Услуга не найдена');return value;}
function money(db,actor,body){if(Object.hasOwn(body,'cena')&&!require('./dengi-dostup.js').vidit(db,actor))throw new NetDostupa('Цена недоступна');}
function validate(body,database=false){
 const out={};
 for(const field of fields)if(Object.hasOwn(body,field))out[field]=body[field];
 for(const [field,max]of [['nazvanie',200],['opisanie',2000],['ssylka',500]])if(Object.hasOwn(out,field)){
  if(out[field]===null&&field!=='nazvanie')continue;
  if(typeof out[field]!=='string')throw new OshibkaVvoda('Нужен текст',field);
  out[field]=out[field].trim();if(out[field].length>max)throw new OshibkaVvoda('Не длиннее '+max+' символов',field);
  if(!out[field].replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu,'')){if(field==='nazvanie')throw new OshibkaVvoda('Заполни название','nazvanie');out[field]=null;}
 }
 if(out.ssylka){let url;try{url=new URL(out.ssylka,out.ssylka.startsWith('/')?'https://locus.invalid':undefined);}catch{}if(!url||!['http:','https:'].includes(url.protocol))throw new OshibkaVvoda('Нужна ссылка http или https','ssylka');}
 if(Object.hasOwn(out,'cena')&&out.cena!==null){if(out.cena==='')out.cena=null;else try{out.cena=require('./polja-proekta.js').amount(out.cena);}catch{throw new OshibkaVvoda('Число от 0 до 999 999 999','cena');}}
 if(Object.hasOwn(out,'arhiv')){if(![true,false,0,1].includes(out.arhiv))throw new OshibkaVvoda('Выбери архив или возврат','arhiv');out.arhiv=database?Number(out.arhiv):Boolean(out.arhiv);}
 if(Object.hasOwn(out,'porjadok')&&(!Number.isSafeInteger(out.porjadok)||out.porjadok<1))throw new OshibkaVvoda('Нужна позиция от 1','porjadok');
 return out;
}
function known(body,extra=[]){for(const field of Object.keys(body))if(![...fields,'napravlenie','versija','zapros_kljuch',...extra].includes(field))throw new OshibkaVvoda('Неизвестное поле',field);}
function linked(db,id){return db.prepare('SELECT * FROM proekty WHERE usluga_id=? ORDER BY id').all(id);}
function impact(db,service){
 const projects=linked(db,service.id);return {id:service.id,nazvanie:service.nazvanie,napravlenie:service.napravlenie,versija:service.versija,arhiv:!!service.arhiv,proektov:projects.length,zakrytyh:projects.filter(p=>p.status==='zavershen').length,
  vlijanie_token:createHash('sha256').update(JSON.stringify([service.id,service.versija,projects.map(p=>[p.id,p.versija])])).digest('hex'),reshenija:['vo_vseh','tolko_v_novyh'],celi_zameny:db.prepare('SELECT id,nazvanie,cena,versija FROM uslugi WHERE napravlenie=? AND id<>? AND COALESCE(arhiv,0)=0 ORDER BY porjadok,id').all(service.napravlenie,service.id).map(v_api)};
}
function checkImpact(db,service,body){const current=impact(db,service);if(body.vlijanie_token!==undefined&&body.vlijanie_token!==current.vlijanie_token)throw new Konflikt('Связанные проекты изменились. Обнови данные и подтверди действие заново.',{...current,nuzhno_obnovit_vlijanie:true});return current;}
function projectEdit(project,body,actor){return common.pravit('proekty',require('./opisanija.js').OPISANIJA.proekty,project.id,{versija:project.versija,...body},actor);}
function createRaw(ctx,kod=ctx.telo?.napravlenie){
 const db=baza(),body=ctx.telo||{};known(body);money(db,ctx.avtor,body);if(typeof kod!=='string'||!db.prepare('SELECT kod FROM napravlenija WHERE kod=?').get(kod))throw new OshibkaVvoda('Выбери направление','napravlenie');
 if(body.napravlenie!==undefined&&body.napravlenie!==kod)throw new OshibkaVvoda('Направление не совпадает','napravlenie');
 if(Object.hasOwn(body,'versija'))throw new OshibkaVvoda('Версия считается сервером','versija');
 const data=validate(body);if(!data.nazvanie)throw new OshibkaVvoda('Заполни название','nazvanie');
 const projects=db.prepare('SELECT * FROM proekty WHERE napravlenie=? AND usluga_svoja=? ORDER BY id').all(kod,data.nazvanie);
 if(projects.some(p=>p.usluga_id!==null||p.usluga_tekst!==null))throw new Konflikt('В проектах с этим своим значением есть неоднозначная связь услуги. Проверь их перед переводом.',{proektov:projects.length});
 const service=common.sozdat('uslugi',description(),{...data,napravlenie:kod},ctx.avtor);
 for(const project of projects)projectEdit(project,{usluga_id:service.id,usluga_svoja:null},ctx.avtor);
 return {kod:201,telo:{...service,proektov_perevedeno:projects.length}};
}
function updateRaw(ctx,id=ctx.kljuch,kod){
 const db=baza(),body=ctx.telo||{};known(body,['id','reshenie','confirm','vlijanie_token']);money(db,ctx.avtor,body);const service=row(db,id);
 if(kod!==undefined&&service.napravlenie!==kod)throw new NeNajdeno('Услуги в этом направлении нет');
 if(body.napravlenie!==undefined&&body.napravlenie!==service.napravlenie)throw new OshibkaVvoda('Направление услуги не меняется','napravlenie');
 const data=validate(body),renamed=Object.hasOwn(data,'nazvanie')&&data.nazvanie!==service.nazvanie,archived=data.arhiv===true&&!service.arhiv;
 if(!Object.keys(data).length)throw new OshibkaVvoda('Менять нечего');
 require('./versii.js').proverit(db,'uslugi',service,body.versija,[...Object.keys(data),...(renamed||archived?['nazvanie','napravlenie','arhiv']:[])]);
 let projects=[];
 if(renamed||archived){const current=checkImpact(db,service,body);projects=linked(db,service.id);
  if(renamed&&!['vo_vseh','tolko_v_novyh'].includes(body.reshenie))throw new Konflikt('Выбери, что делать с прежними проектами',{...current,kod:'nuzhen_vybor'});
  if(archived&&body.confirm!==true&&body.confirm!==1)throw new Konflikt('Подтверди архив услуги',{...current,kod:'nuzhno_podtverzhdenie'});
 }
 if(renamed&&body.reshenie==='tolko_v_novyh')for(const project of projects)projectEdit(project,{usluga_id:null,usluga_svoja:service.nazvanie,usluga_tekst:null},ctx.avtor);
 return {telo:common.pravit('uslugi',description(),service.id,{...data,versija:body.versija},ctx.avtor)};
}
function replaceRaw(ctx){
 const db=baza(),body=ctx.telo||{};for(const key of Object.keys(body))if(!['na_id','novaja_usluga_id','confirm','versija','versija_zameny','vlijanie_token','zapros_kljuch'].includes(key))throw new OshibkaVvoda('Неизвестное поле',key);
 if(body.na_id!==undefined&&body.novaja_usluga_id!==undefined&&Number(body.na_id)!==Number(body.novaja_usluga_id))throw new OshibkaVvoda('Выбери одну услугу замены','na_id');
 const service=row(db,ctx.kljuch),target=row(db,positive(body.novaja_usluga_id??body.na_id,'na_id'));
 if(service.id===target.id)throw new OshibkaVvoda('Нельзя заменить услугу на себя','na_id');
 if(service.napravlenie!==target.napravlenie)throw new OshibkaVvoda('Замена только на услугу того же направления','na_id');
 if(target.arhiv)throw new OshibkaVvoda('Услуга замены в архиве','na_id');
 if(body.versija_zameny!==undefined)require('./versii.js').proverit(db,'uslugi',target,body.versija_zameny,Object.keys(target));
 if(ctx.serviceIntent||body.versija!==undefined)require('./versii.js').proverit(db,'uslugi',service,body.versija,Object.keys(service));const current=checkImpact(db,service,body);
 if(body.confirm!==true&&body.confirm!==1)throw new Konflikt('Подтверди замену услуги',{...current,na_id:target.id,na_nazvanie:target.nazvanie});
 const projects=linked(db,service.id);for(const project of projects)projectEdit(project,{usluga_id:target.id},ctx.avtor);
 common.v_zhurnal(db,'uslugi',service.id,'zamena',service.nazvanie,target.nazvanie,ctx.avtor);db.prepare('DELETE FROM uslugi WHERE id=?').run(service.id);
 return {telo:{udalena:{id:service.id,nazvanie:service.nazvanie},vstala:common.odna('uslugi',description(),target.id,ctx.avtor),proektov:projects.length}};
}
function reorderRaw(ctx,kod){
 const db=baza(),body=ctx.telo||{};for(const key of Object.keys(body))if(!['porjadok','versii','zapros_kljuch'].includes(key))throw new OshibkaVvoda('Неизвестное поле',key);
 const rows=db.prepare('SELECT * FROM uslugi WHERE napravlenie=? AND COALESCE(arhiv,0)=0 ORDER BY porjadok,id').all(kod),ids=body.porjadok;
 if(!Array.isArray(ids)||ids.length!==rows.length||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||!rows.some(r=>r.id===id)))throw new OshibkaVvoda('Нужен полный порядок действующих услуг','porjadok');
 if(!body.versii||typeof body.versii!=='object'||Array.isArray(body.versii)||Object.keys(body.versii).length!==rows.length)throw new OshibkaVvoda('Нужны прочитанные версии услуг','versii');
 for(const service of rows)require('./versii.js').proverit(db,'uslugi',service,body.versii[service.id],['porjadok','arhiv','napravlenie']);
 ids.forEach((id,index)=>{const service=rows.find(r=>r.id===id);if(service.porjadok!==index+1)common.pravit('uslugi',description(),id,{porjadok:index+1,versija:body.versii[id]},ctx.avtor);});
 return list(ctx,kod);
}
function create(ctx,kod=ctx.telo?.napravlenie){money(baza(),ctx.avtor,ctx.telo||{});return require('./zapros-uslugi.js').run(ctx,{kind:'sozdanie',id:0,direction:kod},body=>createRaw({...ctx,telo:body},kod));}
function update(ctx,value=ctx.kljuch,kod){money(baza(),ctx.avtor,ctx.telo||{});const id=positive(value);return require('./zapros-uslugi.js').run(ctx,{kind:'pravka',id,direction:kod??(()=>row(baza(),id).napravlenie)},body=>updateRaw({...ctx,telo:body},id,kod));}
function replace(ctx){const id=positive(ctx.kljuch);return require('./zapros-uslugi.js').run(ctx,{kind:'zamena',id,direction:()=>row(baza(),id).napravlenie},body=>replaceRaw({...ctx,telo:body,serviceIntent:Object.hasOwn(ctx.telo||{},'zapros_kljuch')}));}
function reorder(ctx,kod){return require('./zapros-uslugi.js').run(ctx,{kind:'porjadok',id:0,direction:kod},body=>reorderRaw({...ctx,telo:body},kod));}
function list(ctx,kod){const db=baza();direction(db,kod);return {telo:{spisok:db.prepare('SELECT id FROM uslugi WHERE napravlenie=? ORDER BY COALESCE(arhiv,0),porjadok,id').all(kod).map(r=>common.odna('uslugi',description(),r.id,ctx.avtor))}};}
function inDirection(ctx){const kod=direction(baza(),String(ctx.kljuch||''));if(ctx.metod==='GET')return list(ctx,kod);if(ctx.metod==='POST')return create(ctx,kod);if(ctx.metod==='PATCH'){if(Array.isArray(ctx.telo?.porjadok))return reorder(ctx,kod);return update(ctx,ctx.telo?.id,kod);}throw Object.assign(new Error('Нужен GET, POST или PATCH'),{kod:405});}
function handle(ctx){
 if(ctx.dejstvie==='proverka'&&!ctx.kljuch)return require('./zapros-uslugi.js').read(ctx);
 if(ctx.dejstvie==='otmena_dejstvija'&&!ctx.kljuch)return require('./zapros-uslugi.js').cancel(ctx);
 if(ctx.metod==='POST'&&!ctx.kljuch&&!ctx.dejstvie)return create(ctx);
 if(ctx.metod==='PATCH'&&ctx.kljuch&&!ctx.dejstvie)return update(ctx);
 if(ctx.dejstvie==='vlijanie'){if(ctx.metod!=='GET')throw Object.assign(new Error('Нужен GET'),{kod:405});return {telo:impact(baza(),row(baza(),ctx.kljuch))};}
 if(ctx.dejstvie==='zamena'){if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});return replace(ctx);}
 return null;
}
module.exports={handle,inDirection,validate,impact};
