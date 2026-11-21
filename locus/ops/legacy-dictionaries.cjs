'use strict';
                                                                                
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {norma,norma_kontakta}=require('../api/opisanija.js');
const DIRECTIONS=Object.freeze({it:'synapt',ai:'automy',aijr:'automy_junior',media:'media',mentor:'nastavnichestvo',brand:'anton',assist:'assist',platform:'platforma'});
const COLUMNS=Object.freeze({
  crm_contact:['id','name','company','tg','phone'],
  base_person:['id','name','tg','email','phone','niche','grp','gone'],
  out_blog:['id','platform','link','nick','company','city','site','email','tg_org','tg_dm','dm_name','dm_role','phone','deleted'],
  med_acc:['id','platform','handle','url','title','dir','proj_id','owner','note','source','active','deleted','pos'],
});
const NAMESPACE='locus-legacy-srv';
const text=value=>String(value??'').trim();
const placeholder=value=>!text(value)||/^(?:[-–—._\s]+|none|null|undefined|not[_ ]?found|n\/a|unknown|нет|не найден[оа]?|неизвестно|нет информации|не удалось найти)$/i.test(text(value));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function telegram(value){
  let s=text(value).replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i,'').replace(/^@/,'').replace(/\/$/,'');
  if(placeholder(s))return null;
  return /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(s)?'@'+s:null;
}
function website(value){
  let s=text(value);if(!s)return null;
  if(!/^[a-z]+:\/\//i.test(s))s='https://'+s;
  try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&u.hostname.includes('.')&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
function contacts(fields){
  const result=[],unparsed=[];
  function add(tip,value){
    if(!value || value.length>200)return false;
    if(!result.some(c=>c.tip===tip&&c.znachenie_norm===norma_kontakta(value,tip)))result.push({tip,znachenie:value,znachenie_norm:norma_kontakta(value,tip)});
    return true;
  }
  for(const [kind,raw] of fields){
    const s=text(raw);if(placeholder(s))continue;let accepted=false;
    if(kind==='telegram'){const v=telegram(s);if(v)accepted=add(kind,v);}
    else if(kind==='pochta'){
      const matches=s.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+/g)||[];
                                                                           
      let remainder=s;for(const v of matches){add(kind,v.toLowerCase());remainder=remainder.replace(v,'');}
      accepted=matches.length>0&&!remainder.replace(/[\s,;<>]/g,'');
    }else if(kind==='telefon'){
      if(/^[+\d\s().-]+$/.test(s)){
        let digits=s.replace(/\D/g,'');if(digits.length===10)digits='7'+digits;if(digits.length===11&&digits.startsWith('8'))digits='7'+digits.slice(1);
        if(digits.length>=10&&digits.length<=15)accepted=add(kind,'+'+digits);
      }
    }else if(kind==='sajt'){const v=website(s);if(v)accepted=add(kind,v);}
    else if(kind==='instagram'){
      const v=s.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i,'').replace(/^@/,'').replace(/\/$/,'');
      if(/^[a-zA-Z0-9_.]{1,30}$/.test(v))accepted=add(kind,'https://www.instagram.com/'+v+'/');
    }
    if(!accepted)unparsed.push({tip:kind,value:s});
  }
  return {contacts:result,unparsed};
}
function descriptors(source){
  const records=[],issues=[];
  function person(table,row,part,name,kind,fields,extra={}){
    name=text(name);if(placeholder(name)){issues.push({source:table+'/'+row.id+'/'+part,reason:'missing_name'});return null;}
    if(name.length>200){issues.push({source:table+'/'+row.id+'/'+part,reason:'name_too_long'});return null;}
    const parsed=contacts(fields),key=table+'/'+row.id+'/'+part;
    const raw=Object.fromEntries(COLUMNS[table].filter(column=>row[column]!==undefined).map(column=>[column,row[column]]));
    const record={key,table,source_id:String(row.id),part,kind,name,imja_norm:norma(name),contacts:parsed.contacts,unparsed:parsed.unparsed,raw,rol_v_baze:'sobstvennyj',...extra};
    record.input_sha256=hash({name,kind,fields,extra,raw});records.push(record);return key;
  }
  for(const r of source.crm_contact||[]){
    const company=!placeholder(r.company)?person('crm_contact',r,'company',r.company,'kompanija',[]):null;
    person('crm_contact',r,'person',r.name,'chelovek',[['telegram',r.tg],['telefon',r.phone]],{company_key:company,rol_v_baze:company?'kontaktnoe_lico':'sobstvennyj'});
  }
  for(const r of source.base_person||[]){
    const name=(!placeholder(r.name)?text(r.name):'')||telegram(r.tg)||(!placeholder(r.email)?text(r.email):'')||(!placeholder(r.phone)?text(r.phone):'');
    person('base_person',r,'person',name,'chelovek',[['telegram',r.tg],['pochta',r.email],['telefon',r.phone]],{nisha:text(r.niche)||null,arhiv:Number(r.gone)===1?1:0,rol_v_baze:'sobstvennyj'});
  }
  for(const r of source.out_blog||[]){
    const company=placeholder(r.company)?'':text(r.company),kind=company?(/школ|лицей|гимнази|образовательн.{0,8}центр/i.test(company)?'shkola':'kompanija'):'kanal';
    const platform=norma(r.platform),fields=[['sajt',r.site],['pochta',r.email],['telefon',r.phone],['telegram',r.tg_org]];
    if(/telegram|телеграм/.test(platform))fields.push(['telegram',r.link||r.nick]);
    if(/instagram/.test(platform))fields.push(['instagram',r.link||r.nick]);
    const main=person('out_blog',r,'main',company||r.nick,kind,fields,{gorod:text(r.city)||null,arhiv:Number(r.deleted)===1?1:0,rol_v_baze:'sobstvennyj'});
    if(!placeholder(r.dm_name)||!placeholder(r.tg_dm))person('out_blog',r,'contact',(!placeholder(r.dm_name)?r.dm_name:'')||telegram(r.tg_dm),'chelovek',[['telegram',r.tg_dm]],
      {company_key:main,rol_v_baze:'kontaktnoe_lico',role_note:text(r.dm_role)||null});
  }
  const accounts=[];
  for(const r of source.med_acc||[]){
    const key='med_acc/'+r.id+'/account',platform=norma(r.platform),name=text(r.handle).replace(/^@/,'');
    const level=text(r.source)||'public';
    const record={key,source_id:String(r.id),platform,name,url:website(r.url),title:text(r.title),direction:DIRECTIONS[r.dir]||null,legacy_project:text(r.proj_id)||null,owner_label:text(r.owner),level:['public','mtproto','graph'].includes(level)?level:null,active:Number(r.active)===1?1:0,deleted:Number(r.deleted)===1?1:0,note:text(r.note)||null,order:Number(r.pos)||0};
    record.input_sha256=hash(record);accounts.push(record);
  }
  return {records,accounts,issues};
}
function readSource(file){
  const db=new DatabaseSync(file,{readOnly:true}),result={};
  try{for(const [table,columns] of Object.entries(COLUMNS))result[table]=db.prepare('SELECT '+columns.join(',')+' FROM '+table+' ORDER BY id').all();}
  finally{db.close();}return result;
}
function contactKey(c){return c.tip+':'+c.znachenie_norm;}
function identityContact(c,kind){
  if(!['telegram','telefon','pochta'].includes(c.tip))return false;
  return kind!=='chelovek'||c.tip!=='pochta'||!/^(?:info|office|admin|hello|sales|support|contact|marketing|manager|reception|mail|post|team|hr|school)(?:[._+-]|@)/i.test(c.znachenie_norm);
}
function groupRecords(records){
  const parent=new Map(records.map(r=>[r.key,r.key])),byContact=new Map(),conflicting=new Set();
  const find=k=>{let p=parent.get(k);if(p!==k){p=find(p);parent.set(k,p);}return p;};
  const union=(a,b)=>{const x=find(a),y=find(b);if(x!==y)parent.set(y,x);};
  for(const r of records)for(const c of r.contacts.filter(c=>['telegram','telefon','pochta'].includes(c.tip))){
    const key=r.kind+':'+contactKey(c);if(!byContact.has(key))byContact.set(key,[]);byContact.get(key).push({record:r,contact:c});
  }
  for(const entries of byContact.values())for(let a=0;a<entries.length;a++)for(let b=a+1;b<entries.length;b++){
    const x=entries[a],y=entries[b],sameName=x.record.imja_norm===y.record.imja_norm;
    const uniqueProfile=x.contact.tip==='telegram'&&['chelovek','kanal'].includes(x.record.kind);
    const xtg=x.record.contacts.filter(c=>c.tip==='telegram').map(contactKey),ytg=y.record.contacts.filter(c=>c.tip==='telegram').map(contactKey);
    const differentProfiles=x.contact.tip!=='telegram'&&xtg.length&&ytg.length&&!xtg.some(k=>ytg.includes(k));
    if(!differentProfiles&&(sameName||uniqueProfile)&&identityContact(x.contact,x.record.kind))union(x.record.key,y.record.key);
    else{conflicting.add(x.record.key);conflicting.add(y.record.key);}
  }
  const grouped=new Map();for(const r of records){const key=find(r.key);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);}
  const groups=[...grouped.values()].map(members=>{
    const keys=members.map(r=>r.key).sort(),ids=[...new Set(members.flatMap(r=>r.match_ids||[]))];
    let action=ids.length===1?'match_unique_contact':'new';
    if(ids.length>1||members.some(r=>r.action==='review_conflicting_contacts')||members.some(r=>conflicting.has(r.key)))action='review_conflicting_contacts';
    else if(members.some(r=>['review_source_changed','review_missing_target'].includes(r.action)))action='review_source_changed';
    else if(members.every(r=>r.action==='already_imported'))action='already_imported';
    else if(!ids.length&&members.some(r=>r.action==='review_name_without_identity'))action='review_name_without_identity';
    return {key:hash(keys),source_keys:keys,kind:members[0].kind,name:members[0].name,match_ids:ids,action};
  });
  const names=new Map();for(const group of groups)for(const r of grouped.get(find(group.source_keys[0]))){
    const key=r.kind+':'+r.imja_norm;if(!names.has(key))names.set(key,new Set());names.get(key).add(group.key);
  }
  const repeated=new Set([...names.values()].filter(s=>s.size>1).flatMap(s=>[...s]));
  for(const group of groups)if(group.action==='new'&&repeated.has(group.key))group.action='review_repeated_source_name';
  return groups;
}
function plan(source,target){
  const data=descriptors(source),people=target.people||[],existingContacts=target.contacts||[];
  const byContact=new Map(),byName=new Map(),sourceContact=new Map();
  const kind=p=>p.chto_eto||'chelovek';
  for(const p of people){const k=kind(p)+':'+norma(p.imja);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(p.id);}
  for(const c of existingContacts){const p=people.find(p=>p.id===c.chelovek_id);if(!p)continue;const k=kind(p)+':'+contactKey(c);if(!byContact.has(k))byContact.set(k,new Set());byContact.get(k).add(p.id);}
                                                                              
                                                                         
  const strong=c=>['telegram','telefon','pochta'].includes(c.tip);
  for(const r of data.records)for(const c of r.contacts.filter(strong)){
    const k=r.kind+':'+contactKey(c);if(!sourceContact.has(k))sourceContact.set(k,new Set());sourceContact.get(k).add(r.key);
  }
  for(const r of data.records){
    const mapped=(target.mappings||[]).find(m=>m.istochnik===NAMESPACE&&m.tablica===r.table&&m.staryj_id===r.source_id&&m.chast===r.part);
    if(mapped){
      r.match_ids=mapped.chelovek_id?[mapped.chelovek_id]:[];r.same_name_ids=[];r.shared_source_contacts=[];
      r.action=!people.some(p=>p.id===mapped.chelovek_id)?'review_missing_target':mapped.sha256===r.input_sha256?'already_imported':'review_source_changed';continue;
    }
    const candidates=new Set(),ambiguous=[];
    for(const c of r.contacts.filter(c=>identityContact(c,r.kind))){
      const k=r.kind+':'+contactKey(c),ids=byContact.get(k)||new Set();
      if(ids.size>1)ambiguous.push(k);else for(const id of ids){
        const existing=people.find(p=>p.id===id);
        const newProfiles=r.contacts.filter(c=>c.tip==='telegram').map(contactKey),oldProfiles=existingContacts.filter(c=>c.chelovek_id===id&&c.tip==='telegram').map(contactKey);
        const differentProfiles=c.tip!=='telegram'&&newProfiles.length&&oldProfiles.length&&!newProfiles.some(k=>oldProfiles.includes(k));
        if(differentProfiles||!(c.tip==='telegram'&&['chelovek','kanal'].includes(r.kind))&&r.imja_norm!==norma(existing.imja))ambiguous.push(k);
        else candidates.add(id);
      }
    }
    r.match_ids=[...candidates].sort((a,b)=>a-b);
    r.same_name_ids=byName.get(r.kind+':'+r.imja_norm)||[];
    r.shared_source_contacts=r.contacts.filter(strong).filter(c=>(sourceContact.get(r.kind+':'+contactKey(c))?.size||0)>1).map(contactKey);
    if(candidates.size>1||ambiguous.length)r.action='review_conflicting_contacts';
    else if(candidates.size===1)r.action='match_unique_contact';
    else if(r.same_name_ids.length)r.action='review_name_without_identity';
    else r.action='new';
  }
  for(const a of data.accounts){
    const mapped=(target.mappings||[]).find(m=>m.istochnik===NAMESPACE&&m.tablica==='med_acc'&&m.staryj_id===a.source_id&&m.chast==='account');
    if(mapped){a.match_ids=mapped.akkaunt_id?[mapped.akkaunt_id]:[];a.action=!(target.accounts||[]).some(t=>t.id===mapped.akkaunt_id)?'review_missing_target':mapped.sha256===a.input_sha256?'already_imported':'review_source_changed';continue;}
    const candidates=(target.accounts||[]).filter(t=>t.ploshadka===a.platform&&
      (norma(t.nazvanie).replace(/^@/,'')===norma(a.name)||a.url&&website(t.ssylka)===a.url));
    const owners=text(a.owner_label)?people.filter(p=>Number(p.komanda)===1&&p.aktiven!==0&&!p.arhiv&&norma(p.imja)===norma(a.owner_label)&&
      (target.operators||[]).some(o=>o.chelovek_id===p.id)):[];
    a.owner_id=owners.length===1?owners[0].id:null;
    a.match_ids=candidates.map(t=>t.id);
    a.action=a.legacy_project?'requires_confirmed_project':text(a.owner_label)&&!a.owner_id?'requires_confirmed_owner':!a.level?'requires_collection_source':candidates.length>1?'review_conflicting_accounts':
      candidates.length===1?(candidates[0].proekt_id||candidates[0].napravlenie!==a.direction?'review_account_scope':'match_existing'):!a.direction?'requires_direction':'new';
  }
  const groups=groupRecords(data.records),count=list=>Object.fromEntries([...new Set(list.map(r=>r.action))].map(k=>[k,list.filter(r=>r.action===k).length]));
  const result={format:'locus-legacy-dictionary-plan-v1',namespace:NAMESPACE,target_sha256:hash(target),source_tables:Object.fromEntries(Object.entries(source).map(([k,v])=>[k,v.length])),...data,groups,
    summary:{records:data.records.length,groups:groups.length,people_actions:count(data.records),group_actions:count(groups),accounts_actions:count(data.accounts),unparsed_fields:data.records.reduce((s,r)=>s+r.unparsed.length,0),missing_records:data.issues.length},
    business_state_imported:false};
  result.plan_sha256=hash(result);return result;
}
function getTarget(db){
  const mappings=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='import_svjazi'").get()?db.prepare('SELECT * FROM import_svjazi ORDER BY istochnik,tablica,staryj_id,chast').all():[];
  return {people:db.prepare('SELECT * FROM ljudi ORDER BY id').all(),contacts:db.prepare('SELECT * FROM kontakty ORDER BY id').all(),accounts:db.prepare('SELECT * FROM akkaunty ORDER BY id').all(),operators:db.prepare('SELECT chelovek_id FROM vhod ORDER BY chelovek_id').all(),mappings};
}
function apply(source,db,expected,actor){
  const {s_avtorom}=require('../api/versii.js'),{v_zhurnal}=require('../api/obschij.js');
  if(!Number.isSafeInteger(actor)||actor<1||!db.prepare('SELECT id FROM ljudi WHERE id=?').get(actor))throw new Error('Existing import actor required');
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='import_svjazi'").get())throw new Error('Run current migrations before import');
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  try{
    const preview=plan(source,getTarget(db));if(preview.plan_sha256!==expected)throw new Error('Import plan is stale; create a new preview');
    const result={created_people:0,created_contacts:0,created_accounts:0,mappings_added:0,unchanged:0,review_groups:0,review_accounts:0,business_state_imported:false};
    s_avtorom(db,actor,()=>{
      const now=new Date().toISOString().slice(0,19).replace('T',' ');
      function mapping(record,person,account){
        db.prepare('INSERT INTO import_svjazi(istochnik,tablica,staryj_id,chast,chelovek_id,akkaunt_id,sha256,ishodnye_dannye,sozdano) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(NAMESPACE,record.table,record.source_id,record.part,person,account,record.input_sha256,JSON.stringify(record.raw),now);result.mappings_added++;
      }
      for(const group of preview.groups){
        const members=preview.records.filter(r=>group.source_keys.includes(r.key));
        if(group.action==='already_imported'){result.unchanged+=members.length;continue;}
        if(!['new','match_unique_contact'].includes(group.action)){result.review_groups++;continue;}
        let id=group.match_ids[0];
        if(!id){
          const role=members.some(r=>r.rol_v_baze==='sobstvennyj')?'sobstvennyj':'kontaktnoe_lico';
          const labels={telegram:'Telegram',telefon:'телефон',pochta:'почту',sajt:'сайт',instagram:'Instagram'};
          const notes=[...new Set([...members.map(r=>r.role_note).filter(Boolean),
            ...members.flatMap(r=>r.unparsed.map(c=>'Уточнить '+(labels[c.tip]||'контакт')+': '+c.value)),
            ...members.map(r=>r.name).filter(name=>name!==group.name).map(name=>'Другой вариант имени: '+name)])].join('\n');
          const inserted=db.prepare('INSERT INTO ljudi(imja,imja_norm,jurlico,komanda,dostup,rol_v_baze,chto_eto,arhiv,aktiven,gorod,nisha,zametka,sozdano,versija) VALUES(?,?,?,0,?,?,?,?,1,?,?,?,?,1)')
            .run(group.name,norma(group.name),['kompanija','shkola'].includes(group.kind)?1:0,'bez_deneg',role,group.kind,members.every(r=>r.arhiv===1)?1:0,
              members.map(r=>r.gorod).find(Boolean)||null,members.map(r=>r.nisha).find(Boolean)||null,notes.slice(0,2000)||null,now);
          id=Number(inserted.lastInsertRowid);result.created_people++;v_zhurnal(db,'ljudi',id,'sozdano',null,now,actor);
        }
        for(const record of members){
          if(record.action==='already_imported'){result.unchanged++;continue;}
          const all=record.contacts;
          for(const c of all){
            if(db.prepare('SELECT 1 FROM kontakty WHERE chelovek_id=? AND tip=? AND znachenie_norm=?').get(id,c.tip,c.znachenie_norm))continue;
            const primary=db.prepare('SELECT count(*) n FROM kontakty WHERE chelovek_id=? AND tip=?').get(id,c.tip).n?0:1;
            const order=(db.prepare('SELECT max(porjadok) n FROM kontakty WHERE chelovek_id=?').get(id).n||0)+1;
            const inserted=db.prepare('INSERT INTO kontakty(chelovek_id,tip,znachenie,znachenie_norm,osnovnoj,porjadok,versija) VALUES(?,?,?,?,?,?,1)').run(id,c.tip,c.znachenie,c.znachenie_norm,primary,order);
            result.created_contacts++;v_zhurnal(db,'kontakty',Number(inserted.lastInsertRowid),'sozdano',null,now,actor);
          }
          mapping(record,id,null);
        }
      }
      for(const account of preview.accounts){
        if(account.action==='already_imported'){result.unchanged++;continue;}
        if(!['new','match_existing'].includes(account.action)){result.review_accounts++;continue;}
        let id=account.match_ids[0];
        if(!id){
          if(!['telegram','instagram','vk','youtube','dzen','tiktok'].includes(account.platform)||!account.name||!db.prepare('SELECT 1 FROM napravlenija WHERE kod=?').get(account.direction))throw new Error('Invalid dictionary account');
          const inserted=db.prepare('INSERT INTO akkaunty(ploshadka,nazvanie,ssylka,zagolovok,napravlenie,uroven,zametka,aktiven,udalen,porjadok,vladelec) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            .run(account.platform,account.name,account.url,account.title||null,account.direction,account.level,account.note,account.active,account.deleted,account.order,account.owner_id);
          id=Number(inserted.lastInsertRowid);result.created_accounts++;v_zhurnal(db,'akkaunty',id,'sozdano',null,now,actor);
        }
        const raw=Object.fromEntries(COLUMNS.med_acc.map(k=>[k,(source.med_acc||[]).find(r=>String(r.id)===account.source_id)?.[k]??null]));
        mapping({...account,table:'med_acc',part:'account',raw},null,id);
      }
    });
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Import would break references');
    db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
module.exports={COLUMNS,DIRECTIONS,telegram,website,contacts,descriptors,readSource,plan,groupRecords,getTarget,apply,hash};
if(require.main===module){
  try{
    const [command,legacy,target,output,actor]=process.argv.slice(2);if(!['plan','apply'].includes(command)||!legacy||!target||!output)throw new Error('Use: plan LEGACY_DB TARGET_DB PRIVATE_OUTPUT_JSON; apply LEGACY_DB TARGET_DB PLAN_JSON ACTOR_ID');
    if(command==='apply'&&fs.realpathSync(target)==='/var/www/locus-novyj/db/locus.db'&&process.env.LOCUS_DICTIONARY_IMPORT!=='1')throw new Error('Production import requires a controlled maintenance runner');
    const db=new DatabaseSync(target,{readOnly:command==='plan'});
    try{
      if(command==='plan'){
        const result=plan(readSource(legacy),getTarget(db));fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({...result.summary,plan_sha256:result.plan_sha256}));
      }else{
        const expected=JSON.parse(fs.readFileSync(output,'utf8')).plan_sha256;
        console.log(JSON.stringify(apply(readSource(legacy),db,expected,Number(actor))));
      }
    }finally{db.close();}
  }catch(error){console.error(error.message);process.exitCode=1;}
}
