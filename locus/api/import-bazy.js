                                                                            
                                                                                
const {createHash}=require('node:crypto');
const {baza,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,Konflikt}=require('../db/db.js');
const core=()=>require('./bazy-pravki.js').importApi,hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalized=require('./opisanija.js').norma,contactNorm=require('./normalizacija-kontakta.js').norma_kontakta;
const channelType={mail:'pochta',tg:'telegram',telefon:'telefon',instagram:'instagram'};
function object(value,field){if(!value||typeof value!=='object'||Array.isArray(value))throw new OshibkaVvoda('Нужен объект',field);return value;}
function index(db){
 const people=db.prepare('SELECT id,imja,imja_norm,chto_eto,rol_v_baze,arhiv,versija FROM ljudi ORDER BY id').all(),byId=new Map(people.map(p=>[p.id,p])),names=new Map(),contacts=new Map();
 function add(map,key,id){if(!map.has(key))map.set(key,new Set());map.get(key).add(id);}
 for(const p of people)add(names,normalized(p.imja),p.id);
 for(const r of db.prepare('SELECT chelovek_id,tip,znachenie FROM kontakty ORDER BY id').all())if(byId.has(r.chelovek_id))add(contacts,r.tip+':'+contactNorm(r.znachenie,r.tip),r.chelovek_id);
 for(const r of db.prepare('SELECT kto,kanal_svjazi,adres FROM bazy_ljudi WHERE kanal_svjazi IS NOT NULL AND adres IS NOT NULL ORDER BY id').all()){const type=channelType[r.kanal_svjazi];if(type&&byId.has(r.kto))add(contacts,type+':'+contactNorm(r.adres,type),r.kto);}
 return {byId,names,contacts};
}
function validPerson(p,b){return p&&(p.chto_eto||'chelovek')===b.chto_vnutri&&p.rol_v_baze!=='kontaktnoe_lico'&&p.arhiv!==1;}
function prepare(db,ctx,t){
 const api=core(),b=api.row(db,'baza',ctx.kljuch);if(b.arhiv===1)throw new Konflikt('Сначала верни базу из архива');api.fields(t,['stroki','reshenija','vybor_versija']);
 if(!Array.isArray(t.stroki)||!t.stroki.length||t.stroki.length>5000)throw new OshibkaVvoda('Нужно от 1 до 5000 строк','stroki');
 const ix=index(db),decisions=new Map();if(t.reshenija!==undefined){if(!Array.isArray(t.reshenija)||t.reshenija.length!==t.stroki.length)throw new OshibkaVvoda('Нужно решение по каждой строке','reshenija');for(const d of t.reshenija){object(d,'reshenija');api.fields(d,['nomer','dejstvie','chelovek_id','obnovit_polja','kontakt_id','sovpadenija_versija']);if(!Number.isSafeInteger(d.nomer)||d.nomer<0||d.nomer>=t.stroki.length||decisions.has(d.nomer)||!['sozdat','svjazat','propustit','ne_vybrano'].includes(d.dejstvie))throw new OshibkaVvoda('Проверь решения по строкам','reshenija');decisions.set(d.nomer,d);}}
 const plans=t.stroki.map((raw,nomer)=>{
  const choice=decisions.get(nomer);let row=null,name='',candidates=[],selected=null,existing=null,changes={},error=null,suggestion=null,contactCandidates=[],matchVersion=null,materials=[];
  try{
   object(raw,'stroki');api.fields(raw,['imja','kto','materialy',...api.memberFields]);name=api.text(raw.imja,'imja',{required:raw.kto==null,max:2000})||'';const memberInput=Object.fromEntries(api.memberFields.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,raw[k]]));
                                                                  
   if(memberInput.kontakt!=null&&memberInput.kontakt!==''&&!/^[1-9]\d*$/.test(String(memberInput.kontakt))){contactCandidates=[...(ix.names.get(normalized(memberInput.kontakt))||[])].map(id=>ix.byId.get(id)).filter(p=>(p.chto_eto||'chelovek')==='chelovek'&&p.arhiv!==1);if(choice?.kontakt_id==null)throw new OshibkaVvoda('Выбери контактное лицо по имени из файла','kontakt');memberInput.kontakt=api.positive(choice.kontakt_id,'kontakt_id');}else if(choice?.kontakt_id!=null)memberInput.kontakt=api.positive(choice.kontakt_id,'kontakt_id');row=api.memberData(db,b,memberInput);if(Object.hasOwn(raw,'materialy'))materials=require('./import-materialy-bazy.js').prepare(db,raw.materialy,ctx.avtor);const ids=new Set(ix.names.get(normalized(name))||[]),type=channelType[row.kanal_svjazi];if(type&&row.adres)for(const id of ix.contacts.get(type+':'+contactNorm(row.adres,type))||[])ids.add(id);if(raw.kto!=null)ids.add(api.positive(raw.kto,'kto'));candidates=[...ids].sort((a,b)=>a-b).map(id=>ix.byId.get(id)).filter(Boolean);
   matchVersion=hash(candidates);const compatible=candidates.filter(p=>validPerson(p,b));
   if(raw.kto!=null){selected=ix.byId.get(Number(raw.kto));if(!selected)throw new NeNajdeno('Номер человека из файла не найден');if(!validPerson(selected,b))throw new OshibkaVvoda('Человек из файла не подходит этой базе','kto');suggestion={dejstvie:'svjazat',chelovek_id:selected.id};}
   else if(candidates.length===0)suggestion={dejstvie:'sozdat'};
   else if(candidates.length===1&&compatible.length===1&&normalized(compatible[0].imja)===normalized(name)&&type&&row.adres&&ix.contacts.get(type+':'+contactNorm(row.adres,type))?.has(compatible[0].id))suggestion={dejstvie:'svjazat',chelovek_id:compatible[0].id};
   if(choice?.dejstvie==='svjazat'){selected=ix.byId.get(api.positive(choice.chelovek_id,'chelovek_id'));if(!validPerson(selected,b))throw new OshibkaVvoda('Выбери действующую запись нужного вида','chelovek_id');}
   else if(choice?.dejstvie==='sozdat'){selected=null;if(candidates.length&&choice.sovpadenija_versija!==matchVersion)throw new OshibkaVvoda('Есть совпадения. Свяжи человека или явно подтверди создание отдельной записи после сверки','reshenija');if(raw.kto!=null)throw new OshibkaVvoda('Для нового человека убери прежний номер из файла','kto');if(!name)throw new OshibkaVvoda('Новому человеку нужно имя','imja');}
   if(selected){existing=db.prepare('SELECT * FROM bazy_ljudi WHERE baza_id=? AND kto=?').get(b.id,selected.id)||null;if(existing){if(require('./sostojanie-strok-bazy.js').archived(db,existing.id))throw new OshibkaVvoda('Строка в архиве. Сначала явно верни её со страницы базы','kto');const requested=choice?.obnovit_polja??[];if(!Array.isArray(requested)||new Set(requested).size!==requested.length||requested.some(k=>k==='materialy'?!Object.hasOwn(raw,'materialy'):!api.memberFields.includes(k)||!Object.hasOwn(row,k)))throw new OshibkaVvoda('Выбери конкретные поля для обновления','obnovit_polja');changes=Object.fromEntries(requested.filter(k=>k!=='materialy').map(k=>[k,row[k]]));api.memberData(db,b,changes,existing);}}
  }catch(e){error=e.message;}
  return {nomer,imja:name,input:row,kandidaty:candidates.map(p=>({...p,mozhno:validPerson(p,b)})),sovpadenija_versija:matchVersion,kontaktnye_lica:contactCandidates.map(p=>({id:p.id,imja:p.imja})),predlozhenie:suggestion,reshenie:choice||null,chelovek:selected||null,stroka:existing?api.present(db,'stroka',existing):null,izmenenija:changes,materialy:materials,oshibka:error};
 });
 const targets=new Map();for(const plan of plans){const decision=plan.reshenie;if(!decision||['propustit','ne_vybrano'].includes(decision.dejstvie)||plan.oshibka)continue;const identity=decision.dejstvie==='svjazat'?'id:'+plan.chelovek.id:'new:'+normalized(plan.imja)+':'+(plan.input?.kanal_svjazi||'')+':'+(plan.input?.adres||'').toLowerCase();if(targets.has(identity)){plan.oshibka='Этот же получатель уже выбран в строке '+(targets.get(identity)+1)+'. Оставь одну строку или пропусти повтор.';}else targets.set(identity,plan.nomer);}
 const token=hash({actor:ctx.avtor,baza:api.present(db,'baza',b),statusy:db.prepare('SELECT * FROM bazy_statusy WHERE baza_id=? ORDER BY porjadok,id').all(b.id).map(r=>api.present(db,'status',r)),stroki:t.stroki,reshenija:t.reshenija,plans});return {baza:b,spisok:plans,vsego:plans.length,vybor_versija:token,gotovo:decisions.size===plans.length&&plans.every(p=>p.reshenie.dejstvie==='propustit'||p.reshenie.dejstvie!=='ne_vybrano'&&!p.oshibka)};
}
function preview(ctx){if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});return v_odnoj_tranzakcii(baza(),()=>{const value=prepare(baza(),ctx,ctx.telo);return {telo:{baza_id:value.baza.id,spisok:value.spisok,vsego:value.vsego,vybor_versija:value.vybor_versija,gotovo:value.gotovo}};});}
function apply(ctx){if(ctx.metod!=='POST')throw Object.assign(new Error('Нужен POST'),{kod:405});return core().command(ctx,'zagruzit_bazu',(db,t)=>{
 if(typeof t.vybor_versija!=='string'||!/^[0-9a-f]{64}$/.test(t.vybor_versija))throw new OshibkaVvoda('Сначала выполни сверку импорта','vybor_versija');const selected=prepare(db,ctx,t);if(t.vybor_versija!==selected.vybor_versija)throw new Konflikt('Состав, контакты или поля изменились. Повтори сверку импорта',{vybor_izmenilsja:true});if(!selected.gotovo)throw new OshibkaVvoda('Сверь каждую строку перед импортом','reshenija');
 const stats={novyh_ljudej:0,novyh_strok:0,obnovleno:0,bez_izmenenij:0,propuscheno:0,svjazej_vlozhenij:0,novyh_materialov:0},people=[];
 for(const item of selected.spisok){if(item.reshenie.dejstvie==='propustit'){stats.propuscheno++;continue;}let person=item.chelovek;if(item.reshenie.dejstvie==='sozdat'){person=require('./obschij.js').sozdat('ljudi',require('./opisanija.js').OPISANIJA.ljudi,{imja:item.imja,chto_eto:selected.baza.chto_vnutri,rol_v_baze:'sobstvennyj'},ctx.avtor);stats.novyh_ljudej++;}people.push(person.id);
  let baseMember=item.stroka,changed=false;
  if(!item.stroka){baseMember=require('./bazy-pravki.js').members({...ctx,metod:'POST',telo:{kto:person.id,...item.input}}).telo;stats.novyh_strok++;}
  else if(Object.keys(item.izmenenija).some(k=>item.stroka[k]!==item.izmenenija[k])){baseMember=require('./bazy-pravki.js').members({...ctx,metod:'PATCH',telo:{stroka_id:item.stroka.id,versii:item.stroka.versii,...item.izmenenija}}).telo;changed=true;}
  if(item.materialy.length&&(!item.stroka||item.reshenie.obnovit_polja?.includes('materialy'))){const result=require('./import-materialy-bazy.js').apply(db,ctx,baseMember,item.materialy);stats.svjazej_vlozhenij+=result.dobavleno_svjazej;stats.novyh_materialov+=result.novyh_materialov;changed=changed||result.dobavleno_svjazej>0;}
  if(item.stroka){if(changed)stats.obnovleno++;else stats.bez_izmenenij++;}

 }
 const details={...stats,chelovek_ids:people};return {vid:'baza',telo:{...core().present(db,'baza',selected.baza),itogi:details},details};
 });}
module.exports={preview,apply};
