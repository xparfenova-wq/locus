const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto');
const {nado,zapros,proverit}=require('../prover.js');
module.exports=async()=>{
 const db=new DatabaseSync(process.env.LOCUS_BAZA);
 const marker='Contact policy '+Date.now();
 const contact=(await nado('POST','/api/ljudi',{telo:{imja:marker+' Lena',rol_v_baze:'kontaktnoe_lico'}})).telo;
 await nado('POST','/api/kontakty',{telo:{chelovek_id:contact.id,tip:'pochta',znachenie:'lena-contact-policy@example.test'}});
 const regular=(await nado('GET','/api/ljudi?poisk='+encodeURIComponent(contact.imja))).telo;
 const filtered=(await nado('GET','/api/ljudi?rol_v_baze=kontaktnoe_lico&poisk='+encodeURIComponent(contact.imja))).telo;
 const all=(await nado('GET','/api/ljudi?vse_roli=1&poisk='+encodeURIComponent(contact.imja))).telo;
 assert.equal(regular.vsego,0);assert.ok(!regular.spisok.some(p=>p.id===contact.id));assert.ok(filtered.spisok.some(p=>p.id===contact.id));assert.ok(all.spisok.some(p=>p.id===contact.id));
 proverit('контактное лицо скрыто до LIMIT по умолчанию и доступно явному фильтру/справочнику',true);
 assert.equal((await zapros('POST','/api/sotrudnichestva',{telo:{chelovek_id:contact.id,napravlenie:'media',rol:'lid'}})).kod,400);
 assert.equal(db.prepare('SELECT count(*) n FROM sotrudnichestva WHERE chelovek_id=?').get(contact.id).n,0);
 proverit('контактное лицо не получает собственного сотрудничества и роль не меняется автоматически',true);
 const campaign=(await nado('POST','/api/rassylki',{telo:{nazvanie:marker+' campaign',napravlenie:'media',plan_chislo:50}})).telo;
 for(const [url,body] of [['/api/rassylki/'+campaign.id+'/kontakty',{chelovek_id:contact.id}],['/api/rassylka_soobshenija',{rassylka_id:campaign.id,chelovek_id:contact.id}]]){
  const rejected=await zapros('POST',url,{telo:body});assert.equal(rejected.kod,400);assert.equal(rejected.telo.oshibka,'контактные лица в рассылки не попадают');
 }
 assert.equal(db.prepare('SELECT count(*) n FROM rassylka_ljudi WHERE chelovek_id=?').get(contact.id).n,0);assert.equal(db.prepare('SELECT count(*) n FROM rassylka_kasanija WHERE chelovek_id=?').get(contact.id).n,0);
 proverit('оба пути рассылки отклоняют контактное лицо без записи участника и истории',true);
 const row={imja:marker+' New',pochta:'new-contact-policy@example.test',telegram:'@contact_policy_fixture'};
 let loaded=await nado('POST','/api/ljudi/zagruzka',{telo:{rassylka_id:campaign.id,stroki:[{imja:contact.imja,pochta:'lena-contact-policy@example.test'},row]}});
 assert.equal(loaded.telo.propuscheno_kontaktnyh,1);assert.equal(loaded.telo.dobavleno,1);assert.equal(loaded.telo.privjazano,1);
 const added=db.prepare('SELECT * FROM ljudi WHERE imja=?').get(row.imja),recipient=db.prepare('SELECT * FROM rassylka_ljudi WHERE rassylka_id=? AND chelovek_id=?').get(campaign.id,added.id);
 assert.equal(recipient.status,'ne_otpravleno');assert.equal(db.prepare('SELECT count(*) n FROM kontakty WHERE chelovek_id=?').get(added.id).n,2);
 loaded=await nado('POST','/api/ljudi/zagruzka',{telo:{rassylka_id:campaign.id,stroki:[row]}});assert.equal(loaded.telo.dobavleno,0);assert.equal(loaded.telo.privjazano,0);
 assert.equal(db.prepare('SELECT rol_v_baze FROM ljudi WHERE id=?').get(contact.id).rol_v_baze,'kontaktnoe_lico');
 proverit('пакетная загрузка не падает во вложенной транзакции, сохраняет все контакты и повтор не добавляет строк',true);
 const down=await zapros('PATCH','/api/ljudi/'+added.id,{telo:{versija:added.versija,rol_v_baze:'kontaktnoe_lico'}});assert.equal(down.kod,400);assert.notEqual(db.prepare('SELECT rol_v_baze FROM ljudi WHERE id=?').get(added.id).rol_v_baze,'kontaktnoe_lico');
 proverit('человек с участием в рассылке не становится контактным лицом с потерей истории',true);
 const tables=['ljudi','kontakty','rassylka_ljudi','zhurnal','versii_polej'];
 const counts=()=>Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT count(*) n FROM '+t).get().n]));
 const before=counts();db.exec("CREATE TRIGGER fail_contact_import BEFORE INSERT ON kontakty WHEN NEW.znachenie='fail-contact-policy@example.test' BEGIN SELECT RAISE(ABORT,'fixture contact import failure'); END");
 try{assert.equal((await zapros('POST','/api/ljudi/zagruzka',{telo:{rassylka_id:campaign.id,stroki:[{imja:marker+' Good',pochta:'good-contact-policy@example.test'},{imja:marker+' Fail',pochta:'fail-contact-policy@example.test'}]}})).kod,500);}
 finally{db.exec('DROP TRIGGER fail_contact_import');}
 assert.deepEqual(counts(),before);assert.equal(db.prepare("SELECT count(*) n FROM versii_polej WHERE tablica=''").get().n,0);
 proverit('ошибка в середине загрузки откатывает людей, контакты, участников, журнал и версии целиком',true);

 const owner=(await nado('POST','/api/ljudi',{telo:{imja:marker+' Company',sotrudnichestvo:{napravlenie:'media',rol:'lid'},kontakty:[{tip:'pochta',znachenie:'company-contact-policy@example.test'}]}})).telo;
 assert.equal(owner.rol_v_baze,'sobstvennyj');assert.equal(owner.kontakty.length,1);assert.equal(owner.sotrudnichestvo.chelovek_id,owner.id);
 const parent=owner.sotrudnichestvo;
 const funnelBefore=(await nado('GET','/api/napravlenija/media/voronka')).telo.lidy;
 const lena=(await nado('POST','/api/ljudi',{telo:{imja:marker+' Context',kontakt_dlja:{sotrudnichestvo_id:parent.id,versija:parent.versija},kontakty:[{tip:'pochta',znachenie:'context-contact-policy@example.test'}]}})).telo;
 assert.equal(lena.rol_v_baze,'kontaktnoe_lico');
 assert.equal(db.prepare('SELECT kontakt_id FROM sotrudnichestva WHERE id=?').get(parent.id).kontakt_id,lena.id);
 assert.equal(db.prepare('SELECT count(*) n FROM sotrudnichestva WHERE chelovek_id=?').get(lena.id).n,0);
 assert.equal((await nado('GET','/api/napravlenija/media/voronka')).telo.lidy,funnelBefore);
 const profile=(await nado('GET','/api/ljudi/'+lena.id+'/celikom')).telo;
 assert.equal(profile.kontakty_napravlenij[0].chelovek_id,owner.id);
 assert.ok((await nado('GET','/api/ljudi?rol_v_baze=kontaktnoe_lico&napravlenie=media')).telo.spisok.some(row=>row.id===lena.id));
 proverit('контекст создаёт контактное лицо, связывает увиденное сотрудничество и не добавляет лида',true);
 const allTables=['ljudi','kontakty','sotrudnichestva','zhurnal','versii_polej'];
 const snapshot=()=>Object.fromEntries(allTables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
 let exact=snapshot();
 const rejected=await zapros('POST','/api/ljudi',{telo:{imja:marker+' Orphan',kontakt_dlja:{sotrudnichestvo_id:parent.id,versija:parent.versija},kontakty:[{tip:'pochta',znachenie:'orphan-contact-policy@example.test'}]}});
 assert.equal(rejected.kod,409);assert.deepEqual(snapshot(),exact);
 proverit('конфликт kontakt_id откатывает новую карточку, контакты, журнал и все метаданные',true);
 for(const invalid of [
  {imja:marker+' Invalid phone',kontakty:[{tip:'telefon',znachenie:'not-a-phone'}]},
  {imja:marker+' Invalid role',sotrudnichestvo:{napravlenie:'wrong-direction',rol:'lid'}},
  {imja:marker+' Foreign contact',kontakty:[{tip:'pochta',znachenie:'x@example.test',chelovek_id:owner.id}]},
  {imja:marker+' Missing parent',kontakt_dlja:{sotrudnichestvo_id:99999999,versija:1}},
 ]){
  exact=snapshot();const response=await zapros('POST','/api/ljudi',{telo:invalid});assert.ok(response.kod>=400);assert.deepEqual(snapshot(),exact);
 }
 proverit('неверные контакты, направление, чужой владелец и отсутствующая связь не оставляют частичных записей',true);
 const promoted=(await nado('PATCH','/api/ljudi/'+lena.id,{telo:{versija:lena.versija,rol_v_baze:'sobstvennyj'}})).telo;
 assert.equal(promoted.rol_v_baze,'sobstvennyj');assert.equal(promoted.novoe_sotrudnichestvo.napravlenie,'media');
 assert.equal((await nado('GET','/api/napravlenija/media/voronka')).telo.lidy,funnelBefore+1);
 assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE obekt='chelovek' AND obekt_id=? AND pole='rol_v_baze'").get(lena.id).n,1);
 await nado('POST','/api/rassylki/'+campaign.id+'/kontakty',{telo:{chelovek_id:lena.id}});
 assert.ok((await nado('GET','/api/ljudi?poisk='+encodeURIComponent(lena.imja))).telo.spisok.some(row=>row.id===lena.id));
 proverit('ручной перевод добавляет ровно одного лида, одну запись признака и разрешает рассылку',true);
 exact=snapshot();assert.equal((await zapros('PATCH','/api/ljudi/'+lena.id,{telo:{versija:lena.versija,rol_v_baze:'sobstvennyj'}})).kod,409);assert.deepEqual(snapshot(),exact);
 exact=snapshot();assert.equal((await zapros('PATCH','/api/ljudi/'+contact.id,{telo:{versija:contact.versija,rol_v_baze:'sobstvennyj'}})).kod,400);assert.deepEqual(snapshot(),exact);
 db.exec("CREATE TRIGGER fail_contact_promotion BEFORE INSERT ON sotrudnichestva WHEN NEW.chelovek_id="+contact.id+" BEGIN SELECT RAISE(ABORT,'fixture promotion failure'); END");
 try{assert.equal((await zapros('PATCH','/api/ljudi/'+contact.id,{telo:{versija:contact.versija,rol_v_baze:'sobstvennyj',napravlenie_lida:'media'}})).kod,500);assert.deepEqual(snapshot(),exact);}
 finally{db.exec('DROP TRIGGER fail_contact_promotion');}
 proverit('повторный конфликт и сбой создания лида не меняют признак, журнал или версии',true);
 const legacy=await nado('POST','/api/zagruzka',{telo:{rassylka_id:campaign.id,stroki:[{imja:contact.imja,pochta:'lena-contact-policy@example.test'}]}});
 assert.equal(legacy.telo.propuscheno_kontaktnyh,1);assert.equal(db.prepare('SELECT count(*) n FROM rassylka_ljudi WHERE chelovek_id=?').get(contact.id).n,0);
 proverit('старый путь загрузки использует те же ограничения и безопасное сопоставление',true);

 for(const [tip,znachenie,kod] of [['telefon','+++','invalid_phone'],['telefon','+7 916 ABC-45-67','invalid_phone_chars'],['pochta','sokolov.mail.ru','invalid_email']]){
  exact=snapshot();const bad=await zapros('POST','/api/kontakty',{telo:{chelovek_id:owner.id,tip,znachenie}});assert.equal(bad.kod,422);assert.equal(bad.telo.kod,kod);assert.equal(bad.telo.pole,'znachenie');assert.deepEqual(snapshot(),exact);
 }
 const mixed=await nado('POST','/api/ljudi/zagruzka',{telo:{rassylka_id:campaign.id,stroki:[{imja:marker+' Alias conflict',pochta:'company-contact-policy@example.test'}]}});
 assert.equal(mixed.telo.dobavleno,0);assert.equal(mixed.telo.privjazano,0);assert.equal(mixed.telo.trebuet_sopostavlenija.length,1);
 proverit('невалидные контакты отклоняются, общий адрес с другим именем требует сопоставления',true);

 const selectedOwn=(await nado('POST','/api/ljudi',{telo:{imja:marker+' Exact selection'}})).telo;
 const selectedSet=(await nado('POST','/api/ljudi/nabory_filtrov',{telo:{nazvanie:marker+' Selection',filtry:{poisk:selectedOwn.imja}}})).telo;
 const reviewed=async body=>({...body,vybor_versija:(await nado('POST','/api/ljudi/predprosmotr_rassylki',{telo:body})).telo.vybor_versija,zapros_kljuch:randomUUID()});
 const made=(await nado('POST','/api/ljudi/rassylka_iz_nabora',{telo:await reviewed({nabor_filtrov_id:selectedSet.id,napravlenie:'media'})})).telo;
 assert.equal(made.ljudej,1);assert.deepEqual(db.prepare('SELECT chelovek_id FROM rassylka_ljudi WHERE rassylka_id=?').all(made.rassylka_id).map(row=>row.chelovek_id),[selectedOwn.id]);
 assert.equal(db.prepare('SELECT plan_chislo FROM zadachi WHERE nomer=?').get(made.zadacha_nomer).plan_chislo,1);
 const contactSet=(await nado('POST','/api/ljudi/nabory_filtrov',{telo:{nazvanie:'CP '+contact.id+' Contacts only',filtry:{rol_v_baze:'kontaktnoe_lico'}}})).telo;
 let campaignCounts=()=>Object.fromEntries(['sohranennye_filtry','rassylki','rassylka_ljudi','zadachi','zhurnal','versii_polej'].map(t=>[t,db.prepare('SELECT count(*) n FROM '+t).get().n]));
 let oldCounts=campaignCounts();assert.equal((await zapros('POST','/api/ljudi/predprosmotr_rassylki',{telo:{nabor_filtrov_id:contactSet.id,napravlenie:'media'}})).kod,400);assert.deepEqual(campaignCounts(),oldCounts);
 assert.equal((await zapros('POST','/api/ljudi/predprosmotr_rassylki',{avtor:61,telo:{nabor_filtrov_id:selectedSet.id,napravlenie:'media'}})).kod,404);assert.deepEqual(campaignCounts(),oldCounts);
 const unknownSet=(await nado('POST','/api/ljudi/nabory_filtrov',{telo:{nazvanie:'CP '+contact.id+' Unknown filter',filtry:{nonexistent_filter:1}}})).telo;
 oldCounts=campaignCounts();assert.equal((await zapros('POST','/api/ljudi/predprosmotr_rassylki',{telo:{nabor_filtrov_id:unknownSet.id,napravlenie:'media'}})).kod,422);assert.deepEqual(campaignCounts(),oldCounts);
 db.exec("CREATE TRIGGER fail_filter_wave BEFORE UPDATE OF shablon ON zadachi WHEN NEW.shablon='rassylka' BEGIN SELECT RAISE(ABORT,'fixture filter wave failure'); END");
 try{assert.equal((await zapros('POST','/api/ljudi/rassylka_iz_nabora',{telo:await reviewed({nabor_filtrov_id:selectedSet.id,napravlenie:'media'})})).kod,500);assert.deepEqual(campaignCounts(),oldCounts);}
 finally{db.exec('DROP TRIGGER fail_filter_wave');}
 proverit('рассылка из набора соблюдает поиск, роль и права; ошибка волны откатывает весь состав',true);

 oldCounts=campaignCounts();assert.equal((await zapros('POST','/api/ljudi/predprosmotr_rassylki',{telo:{nazvanie:'CP '+contact.id+' Failed inline',filtry:{bad_filter:1},napravlenie:'media'}})).kod,422);assert.deepEqual(campaignCounts(),oldCounts);
 const inline=(await nado('POST','/api/ljudi/rassylka_iz_nabora',{telo:await reviewed({nazvanie:marker+' Inline',filtry:{poisk:selectedOwn.imja},napravlenie:'media'})})).telo;
 assert.equal(inline.ljudej,1);assert.ok(inline.nabor.id);assert.equal(campaignCounts().sohranennye_filtry,oldCounts.sohranennye_filtry+1);
 proverit('быстрое создание сохраняет фильтр и рассылку одной операцией; отказ не оставляет набор',true);
 db.close();
};
