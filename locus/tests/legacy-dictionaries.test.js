const {test}=require('node:test'),assert=require('node:assert/strict');
const {contacts,descriptors,plan,COLUMNS}=require('../ops/legacy-dictionaries.cjs');
test('legacy dictionary adapters exclude state, money, sessions and personal tables',()=>{
  assert.deepEqual(Object.keys(COLUMNS),['crm_contact','base_person','out_blog','med_acc']);
  for(const columns of Object.values(COLUMNS))assert.equal(columns.some(c=>/cost|revenue|status|password|parol|token|last_msg|request|promised/.test(c)),false);
  const p=descriptors({crm_contact:[{id:'c',name:'Contact',company:'Company',cost:999,status:'won'}],out_blog:[{id:'b',nick:'school',company:'Школа теста',dm_name:'Manager',tg_dm:'@manager_fixture',email:'school@example.test',cost:999}]});
  assert.equal(p.records.length,4);assert.equal(p.records[0].kind,'kompanija');assert.equal(p.records[1].rol_v_baze,'kontaktnoe_lico');
  assert.equal(p.records[2].kind,'shkola');assert.equal(p.records[3].company_key,p.records[2].key);assert.equal(p.records[3].rol_v_baze,'kontaktnoe_lico');
  for(const record of p.records){assert.equal(Object.hasOwn(record.raw,'cost'),false);assert.equal(Object.hasOwn(record.raw,'status'),false);}
});
test('contacts normalize Telegram URLs, phone and multiple emails while preserving unparsed text',()=>{
  const r=contacts([['telegram','https://t.me/Fixture_User/'],['telegram','@fixture_user'],['telefon','8 (999) 123-45-67'],['pochta','A@example.test; b@example.test'],['telegram','https://t.me/+invite'],['telefon','+79991234567, +79997654321'],['sajt','javascript:alert(1)'],['pochta','admin@example.test (shared mailbox)']]);
  assert.equal(r.contacts.filter(c=>c.tip==='telegram').length,1);assert.equal(r.contacts.find(c=>c.tip==='telefon').znachenie,'+79991234567');
  assert.equal(r.contacts.filter(c=>c.tip==='pochta').length,3);assert.equal(r.unparsed.length,4);
});
test('identity never matches by name alone, separates entity kinds and blocks contradictory identifiers',()=>{
  const source={base_person:[{id:'one',name:'Namesake',tg:'@first_identity'},{id:'two',name:'Namesake'},{id:'three',name:'Conflict',tg:'@first_identity',email:'second@example.test'}],out_blog:[{id:'org',company:'Namesake',nick:'org',tg_org:'@first_identity'}]};
  const target={people:[{id:1,imja:'Namesake',chto_eto:'chelovek'},{id:2,imja:'Other',chto_eto:'chelovek'}],contacts:[{chelovek_id:1,tip:'telegram',znachenie_norm:'first_identity'},{chelovek_id:2,tip:'pochta',znachenie_norm:'second@example.test'}]};
  const p=plan(source,target);assert.deepEqual(p.records.map(r=>r.action),['match_unique_contact','review_name_without_identity','review_conflicting_contacts','new']);
  assert.equal(p.records[0].shared_source_contacts.length,1);assert.equal(p.business_state_imported,false);
});
test('a project account cannot become a direction account before project selection',()=>{
  const p=plan({med_acc:[{id:'client',platform:'instagram',handle:'client',url:'https://instagram.com/client',dir:'it',proj_id:'old-project'},{id:'own',platform:'telegram',handle:'own',dir:'media'}]},{});
  assert.deepEqual(p.accounts.map(a=>a.action),['requires_confirmed_project','new']);assert.equal(p.accounts[1].direction,'media');
});
test('source grouping consolidates a shared Telegram profile and keeps namesakes and shared corporate mail for review',()=>{
  const p=plan({base_person:[{id:'one',name:'Alias',tg:'@same_profile'},{id:'two',name:'Full name',tg:'https://t.me/same_profile'},
    {id:'three',name:'First employee',email:'office@example.test'},{id:'four',name:'Second employee',email:'office@example.test'},
    {id:'five',name:'Namesake'},{id:'six',name:'Namesake'}]},{});
  assert.equal(p.groups.length,5);assert.equal(p.groups.find(g=>g.source_keys.length===2).action,'new');
  assert.equal(p.groups.filter(g=>g.action==='review_conflicting_contacts').length,2);
  assert.equal(p.groups.filter(g=>g.action==='review_repeated_source_name').length,2);
});
test('a generic mailbox or a shared phone with a different name cannot identify an existing person',()=>{
  const p=plan({base_person:[{id:'office',name:'New employee',email:'office@example.test'},{id:'phone',name:'Different person',phone:'+79991234567'}]},
    {people:[{id:1,imja:'Existing employee',chto_eto:'chelovek'}],contacts:[{chelovek_id:1,tip:'pochta',znachenie_norm:'office@example.test'},{chelovek_id:1,tip:'telefon',znachenie_norm:'79991234567'}]});
  assert.equal(p.records[0].action,'new');assert.equal(p.records[1].action,'review_conflicting_contacts');assert.equal(p.records[0].match_ids.length,0);
});
test('an email cannot join namesakes with different known Telegram profiles',()=>{
  const p=plan({base_person:[{id:'one',name:'Namesake',tg:'@first_profile',email:'same@example.test'},{id:'two',name:'Namesake',tg:'@second_profile',email:'same@example.test'}]},{});
  assert.equal(p.groups.length,2);assert.ok(p.groups.every(g=>g.action==='review_conflicting_contacts'));
  const existing=plan({base_person:[{id:'new',name:'Namesake',tg:'@second_profile',email:'same@example.test'}]},
    {people:[{id:1,imja:'Namesake',chto_eto:'chelovek'}],contacts:[{chelovek_id:1,tip:'telegram',znachenie_norm:'first_profile'},{chelovek_id:1,tip:'pochta',znachenie_norm:'same@example.test'}]});
  assert.equal(existing.records[0].action,'review_conflicting_contacts');
});
test('account owner resolves only to a unique active registered team member; collection level stays explicit',()=>{
  const source={med_acc:[{id:'one',platform:'telegram',handle:'one',dir:'media',owner:'Антон',source:'mtproto'},{id:'two',platform:'instagram',handle:'two',dir:'media',owner:'Unknown',source:'public'}]};
  const target={people:[{id:62,imja:'Антон',komanda:1,aktiven:1}],operators:[{chelovek_id:62}]};
  const p=plan(source,target);assert.equal(p.accounts[0].owner_id,62);assert.equal(p.accounts[0].level,'mtproto');assert.equal(p.accounts[0].action,'new');
  assert.equal(p.accounts[1].action,'requires_confirmed_owner');
  target.people.push({id:63,imja:'Антон',komanda:1,aktiven:1});target.operators.push({chelovek_id:63});assert.equal(plan(source,target).accounts[0].action,'requires_confirmed_owner');
});
test('missing-value markers do not create people, fake Telegram profiles or contact rows; raw source remains preserved',()=>{
  const p=descriptors({crm_contact:[{id:'real',name:'Real person',company:'не найдено',tg:'not_found',phone:'нет'}],out_blog:[{id:'org',company:'Company',nick:'org',tg_org:'не найден',dm_name:'неизвестно',tg_dm:'none'}]});
  assert.equal(p.records.length,2);assert.equal(p.records[0].rol_v_baze,'sobstvennyj');assert.equal(p.records[0].contacts.length,0);
  assert.equal(p.records[1].raw.tg_org,'не найден');assert.equal(p.records[1].contacts.length,0);
});
