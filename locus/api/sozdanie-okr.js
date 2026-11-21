                                                                                
const {baza,OshibkaVvoda}=require('../db/db.js');
const receipt=require('./zapros-sozdanija.js');
const parents={celi:null,rezultaty:'cel_id',zamery:'rezultat_id'};
const fields={celi:'cel',rezultaty:'rezultat',zamery:'zamer'};
function positive(value,field){if(!['number','string'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new OshibkaVvoda('Нужен номер владельца добавления',field);return Number(value);}
function authorize(table,id,actor){require('./pravila-otveta.js').proverit(baza(),{tablica:table,kljuch:id,dejstvie:undefined,telo:{},zapros:{},avtor:actor,metod:'GET'});}
function scope(table,body,actor,readBusiness=true){
 if(!Object.hasOwn(parents,table))throw new OshibkaVvoda('Неизвестный вид добавления');
 const owner=positive(actor,'avtor'),field=parents[table],parent=field?positive(body[field],field):owner;
 if(field&&readBusiness)authorize(table==='zamery'?'rezultaty':'celi',parent,actor);
 return parent;
}
function present(table,actor){return row=>{authorize(table,row.id,actor);const description=require('./opisanija.js').OPISANIJA[table],current=require('./obschij.js').odna(table,description,row.id,actor);return {...current,...(table==='celi'||table==='rezultaty'?description.posle_zapisi?.(current,baza(),actor)||{}:{})};};}
function presentForProof(table,actor){const strict=present(table,actor);return row=>{try{return strict(row);}catch(error){if(error.kod!==403&&error.kod!==404)throw error;return {kvitancija_skryta:true,skryto:[error.kod===403?'dengi':'dostup']};}};}
function outcome(table,parent,value,actor){
 const {id,...proof}=value,record=proof[fields[table]];
 if(record?.kvitancija_skryta===true){delete proof[fields[table]];proof.dannye_skryty=true;proof.skryto=record.skryto;}
                                                                                
 return {...proof,...(id?{zapis_id:id}:{}),obekt:table,vladelec_id:parent,avtor_id:positive(actor,'avtor')};
}
function check(table,query,actor){
 for(const name of Object.keys(query))if(name!=='zapros_kljuch'&&name!==parents[table])throw new OshibkaVvoda('Неизвестный параметр проверки добавления',name);
 const parent=scope(table,query,actor,false);
 return outcome(table,parent,receipt.check(baza(),actor,table,parent,query.zapros_kljuch,presentForProof(table,actor)),actor);
}
function create(table,input,actor){
 const body={...input},key=body.zapros_kljuch;delete body.zapros_kljuch;
 if(body.otmenit_dobavlenie===true){
  for(const name of Object.keys(body))if(name!=='otmenit_dobavlenie'&&name!==parents[table])throw new OshibkaVvoda('Отмена добавления не принимает поля записи',name);
  const parent=scope(table,body,actor,false);
  return outcome(table,parent,receipt.cancel(baza(),actor,table,parent,key,presentForProof(table,actor)),actor);
 }
 const parent=scope(table,body,actor),description=require('./opisanija.js').OPISANIJA[table];
 return receipt.create(baza(),actor,table,parent,key,body,()=>require('./obschij.js').sozdat(table,description,body,actor),present(table,actor));
}
module.exports={create,check};
