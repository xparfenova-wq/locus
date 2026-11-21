(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.LocusTaskContextModel=value;})(globalThis,function(){
 'use strict';
 const fields=Object.freeze(['napravlenie','tip','klient_id','proekt_id','sotrudnichestvo_id','cel_id','rezultat_id','plan_chislo','sprint','god_sprinta','data','srok']);
 const equal=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
 const values=(task,allowed=fields)=>Object.fromEntries(fields.filter(k=>allowed.includes(k)&&Object.hasOwn(task,k)).map(k=>[k,task[k]??null]));
 const changed=record=>Object.keys(record.values).filter(k=>!equal(record.values[k],record.base[k]));
 function create(info,actor){return {format:1,actor,id:info.zadacha.id,number:info.zadacha.nomer,context:info.kontekst,version:info.zadacha.versija,base:values(info.zadacha,info.polja),values:values(info.zadacha,info.polja),clientChoice:null};}
 function parse(raw,info,actor){
  if(!raw)return null;const r=JSON.parse(raw);
  if(r.format!==1||r.actor!==actor||r.id!==info.zadacha.id||r.number!==info.zadacha.nomer||typeof r.context!=='string'||!Number.isSafeInteger(r.version)||r.version<1||!r.base||!r.values||Array.isArray(r.base)||Array.isArray(r.values)||!Object.keys(r.values).every(k=>fields.includes(k))||!Object.keys(r.base).every(k=>fields.includes(k)))throw new Error('Черновик не читается. Сохранённые поля задачи доступны ниже');
  for(const group of [r.base,r.values])for(const value of Object.values(group))if(value!==null&&!['number','string'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw new Error('Черновик содержит неподтверждённые значения');
                                                                               
  for(const k of fields)if(!info.polja.includes(k)){delete r.base[k];delete r.values[k];}
  return r;
 }
 function compare(record,info,actor){
  const next=create(info,actor),conflicts=[];
  for(const field of Object.keys(next.values)){
   if(equal(record.values[field],record.base[field]))continue;
   const old=record.values[field],live=next.base[field];
   if(!equal(live,record.base[field])&&!equal(live,old)||info.zablokirovany.includes(field)&&!equal(old,live))conflicts.push({field,mine:old,current:live,locked:info.zablokirovany.includes(field)});
   else next.values[field]=old;
  }
  next.clientChoice=record.clientChoice;return {record:next,conflicts};
 }
 function errors(record,info){
  const v=record.values,c=info.spravochniki,out={},dirty=changed(record),same=k=>equal(v[k],record.base[k]);
  const direction=c.napravlenija.find(d=>d.kod===v.napravlenie);
  if(!direction||direction.arhiv&&!same('napravlenie'))out.napravlenie='Выбери действующее направление';
  if(!c.tipy.includes(v.tip))out.tip='Выбери тип задачи';
  if(v.tip==='klientskaja'&&!v.klient_id)out.klient_id='Не хватает клиента';
  if(v.klient_id&&!c.ljudi.some(p=>p.id===v.klient_id)&&!same('klient_id'))out.klient_id='Выбери клиента из списка';
  const project=c.proekty.find(p=>p.id===v.proekt_id);
  if(v.proekt_id&&(!project||project.napravlenie!==v.napravlenie||v.klient_id&&project.klient_id!==v.klient_id))out.proekt_id='Проект должен подходить направлению и клиенту';
  if(project&&(project.arhiv||project.status==='zavershen')&&!same('proekt_id'))out.proekt_id='Выбери действующий проект';
  const cooperation=c.sotrudnichestva.find(p=>p.id===v.sotrudnichestvo_id);
  if(v.sotrudnichestvo_id&&(!cooperation||cooperation.napravlenie!==v.napravlenie||v.klient_id&&cooperation.chelovek_id!==v.klient_id))out.sotrudnichestvo_id='Сотрудничество должно подходить направлению и человеку';
  const goal=c.celi.find(g=>g.id===v.cel_id);
  if(v.cel_id&&(!goal||goal.napravlenie!==v.napravlenie)&&(!same('cel_id')||!same('napravlenie')))out.cel_id='Выбери цель этого направления или убери связь';
  const result=c.rezultaty.find(r=>r.id===v.rezultat_id),resultGoal=result&&c.celi.find(g=>g.id===result.cel_id);
  if(v.rezultat_id&&(!resultGoal||resultGoal.napravlenie!==v.napravlenie||v.cel_id&&result.cel_id!==v.cel_id)&&(!same('rezultat_id')||!same('cel_id')||!same('napravlenie')))out.rezultat_id='Выбери результат выбранной цели или убери связь';
  if(v.tip==='biznesovaja'&&!info.zadacha.roditel_id&&!info.zadacha.publikacija&&v.plan_chislo==null&&!info.zablokirovany.includes('plan_chislo'))out.plan_chislo='Не хватает целевого числа';
  if(Object.hasOwn(v,'plan_chislo')&&v.plan_chislo!==null&&(typeof v.plan_chislo!=='number'||!Number.isFinite(v.plan_chislo)))out.plan_chislo='Впиши число';
  for(const field of ['data','srok'])if(v[field]!=null&&(typeof v[field]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v[field])||!Number.isFinite(Date.parse(v[field]+'T12:00:00Z'))||new Date(v[field]+'T12:00:00Z').toISOString().slice(0,10)!==v[field]))out[field]='Выбери существующую дату';
  if(!info.zadacha.povtorjaetsja&&Object.hasOwn(v,'sprint')){
   const calendar=typeof module==='object'&&module.exports?require('./nedeli.js'):globalThis.LOCUS_NEDELI;
   try{if(!Number.isInteger(v.sprint)||!Number.isInteger(v.god_sprinta))throw new Error('invalid week');const week=calendar.razobrat_nedelju(v.sprint,v.god_sprinta);if(v.data&&!out.data&&(v.data<week.nachalo||v.data>week.konec))out.data='Дата должна быть внутри выбранного спринта';}catch{out.sprint='Выбери существующий спринт';}
  }
  if(record.base.tip==='klientskaja'&&v.tip!=='klientskaja'&&v.klient_id===record.base.klient_id&&v.klient_id&&!record.clientChoice)out.clientChoice='Подтверди, оставить ли связь с клиентом';
  for(const k of dirty)if(info.zablokirovany.includes(k))out[k]='Поле задаётся источником задачи';
  return out;
 }
 function payload(record,key){return {versija:record.version,kontekst:record.context,zapros_kljuch:key,...Object.fromEntries(changed(record).map(k=>[k,record.values[k]]))};}
 return {fields,equal,values,changed,create,parse,compare,errors,payload};
});
