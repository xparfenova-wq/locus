                                                                   
const { NetDostupa, NeNajdeno } = require('../db/db.js');
const {denezhnyj}=require('./dengi-okr.js');
const AMOUNTS = new Set(['summa', 'stoimost', 'cena', 'vystavleno', 'oplacheno',
  'vyplacheno', 'nalog', 'procent_shkala']);
function vidimost(table, avtor, prefix = '') {
  if(table==='shablony'){const p=prefix||'shablony.';return {sql:`(${p}gotovyj=1 OR ${p}obschij=1 OR ${p}avtor=?)`,args:[avtor]};}
  if (!['celi','rezultaty','zamery'].includes(table)) return null;
  const goal = alias => `(COALESCE(${alias}sostojanie,'aktivna')<>'chernovik' OR
    (SELECT kto FROM zhurnal WHERE obekt='cel' AND obekt_id=${alias}id
      AND pole='sozdano' ORDER BY id LIMIT 1)=?)`;
  const sql = table === 'celi' ? goal(prefix || 'celi.')
    : table === 'rezultaty' ? `${prefix}cel_id IN (SELECT c.id FROM celi c WHERE ${goal('c.')})`
    : `${prefix}rezultat_id IN (SELECT r.id FROM rezultaty r JOIN celi c ON c.id=r.cel_id WHERE ${goal('c.')})`;
  return { sql, args: [avtor] };
}
function srez(db, avtor) {
  const person = db.prepare('SELECT dostup FROM ljudi WHERE id=?').get(avtor);
  const bez_deneg = person?.dostup !== 'polnyj';
  const money = new Set(), moneyGoals = new Set(), privateGoals = new Set(), privateResults = new Set();
  const historicalMoney=require('./dengi-okr.js').ids(db);
  const resultIds = new Set(), moneyMeasurements = new Set(), measurementIds = new Set(),privateMeasurements=new Set();
  for (const r of db.prepare('SELECT id,cel_id,tip,formula FROM rezultaty').all()) {
    resultIds.add(r.id);
    if (denezhnyj(r)||historicalMoney.has(r.id)) { money.add(r.id); moneyGoals.add(r.cel_id); }
  }
  for (const m of db.prepare('SELECT id,rezultat_id FROM zamery').all()) {
    measurementIds.add(m.id);
    if (money.has(m.rezultat_id)) moneyMeasurements.add(m.id);
  }
  for (const c of db.prepare(`SELECT c.id,
    (SELECT kto FROM zhurnal WHERE obekt='cel' AND obekt_id=c.id AND pole='sozdano' ORDER BY id LIMIT 1) avtor
    FROM celi c WHERE sostojanie='chernovik'`).all()) {
    if (Number(c.avtor) !== Number(avtor)) privateGoals.add(c.id);
  }
  const existingGoals=new Set(db.prepare('SELECT id FROM celi').all().map(row=>row.id)),orphanStates=new Map(),orphanAuthors=new Map(),orphanIds=new Set();
  for(const row of db.prepare("SELECT obekt_id,pole,kto,srez FROM zhurnal WHERE obekt='cel' ORDER BY id DESC").iterate()){
    const id=Number(row.obekt_id);if(existingGoals.has(id))continue;orphanIds.add(id);if(row.pole==='sozdano')orphanAuthors.set(id,Number(row.kto));
    if(!orphanStates.has(id)){let context;try{context=JSON.parse(row.srez);}catch{}if(context?.cel_sostojanie)orphanStates.set(id,{state:context.cel_sostojanie,owner:Number(context.cel_avtor)});}
  }
  for(const id of orphanIds){const saved=orphanStates.get(id),owner=saved?.owner||orphanAuthors.get(id);if((!saved||saved.state==='chernovik')&&owner!==Number(avtor))privateGoals.add(id);}
  for (const r of db.prepare('SELECT id,cel_id FROM rezultaty').all()) {
    if (privateGoals.has(r.cel_id)) privateResults.add(r.id);
  }
  for(const m of db.prepare('SELECT id,rezultat_id FROM zamery').all())if(privateResults.has(m.rezultat_id))privateMeasurements.add(m.id);
  const privateTemplates=new Set(db.prepare('SELECT * FROM shablony').all().filter(row=>!require('./shablony.js').visible(row,avtor)).map(row=>row.id));
  const templateIds=new Set(db.prepare('SELECT id FROM shablony').all().map(row=>row.id));
  for(const row of db.prepare("SELECT obekt_id,kto FROM zhurnal WHERE obekt='shablon' AND pole='sozdano'").all())if(!templateIds.has(row.obekt_id)&&Number(row.kto)!==Number(avtor))privateTemplates.add(row.obekt_id);
  const moneyTasks=require('./dengi-zadach.js').ids(db);
  return { moneyTasks,bez_deneg, money, moneyGoals, privateGoals, privateResults,privateTemplates,
    resultIds, moneyMeasurements, measurementIds,privateMeasurements };
}
function vidimaZapisZhurnala(v,scope){
  if(!v.obekt||!v.obekt_id)return true;
  let context;try{context=typeof v.srez==='string'?JSON.parse(v.srez):v.srez;}catch{}
  if(scope.bez_deneg&&(require('./dengi-okr.js').marked(context)||context?.svjaz_vyplat||context?.svjaz_vyplaty_operacija))return false;
  if(context?.cel_id&&scope.privateGoals.has(Number(context.cel_id)))return false;
  const {DENEZHNYE,TABLICA_OBEKTA}=require('./obschij.js'),tab=TABLICA_OBEKTA[v.obekt],id=Number(v.obekt_id);
  if(tab==='shablony'&&scope.privateTemplates.has(id))return false;
  if(scope.bez_deneg&&tab==='zadachi'&&(scope.moneyTasks.has(id)||require('./dengi-zadach.js').marked(context))&&require('./dengi-zadach.js').fields.includes(v.pole))return false;
  if((tab==='celi'&&scope.privateGoals.has(id))||(tab==='rezultaty'&&scope.privateResults.has(id))||(tab==='zamery'&&scope.privateMeasurements.has(id)))return false;
  return !(scope.bez_deneg&&(tab==='platezhi'||(DENEZHNYE[tab]||[]).includes(v.pole)||(tab==='rezultaty'&&(scope.money.has(id)||!scope.resultIds.has(id)))||(tab==='zamery'&&(scope.moneyMeasurements.has(id)||!scope.measurementIds.has(id)))));
}
function zhurnalDostup(db,actor,head){
  const scope=srez(db,actor),ids={cel:new Set(),rezultat:new Set(),zamer:new Set(),zadacha:new Set()};
  for(const row of db.prepare('SELECT DISTINCT obekt,obekt_id FROM zhurnal WHERE id<=?').iterate(head??Number.MAX_SAFE_INTEGER))ids[row.obekt]?.add(Number(row.obekt_id));
  for(const row of db.prepare("SELECT DISTINCT json_extract(srez,'$.cel_id') id FROM zhurnal WHERE id<=? AND srez IS NOT NULL").iterate(head??Number.MAX_SAFE_INTEGER))if(row.id)ids.cel.add(Number(row.id));
  const value={bez_deneg:scope.bez_deneg};
  if(scope.bez_deneg)value.moneyTasks=[...scope.moneyTasks].filter(id=>ids.zadacha.has(id)).sort((a,b)=>a-b);
  for(const [field,kind]of [['privateGoals','cel'],['privateResults','rezultat'],['privateMeasurements','zamer'],...(scope.bez_deneg?[['money','rezultat'],['resultIds','rezultat'],['moneyMeasurements','zamer'],['measurementIds','zamer']]:[])])value[field]=[...scope[field]].filter(id=>ids[kind].has(id)).sort((a,b)=>a-b);
  return {razresheno:row=>vidimaZapisZhurnala(row,scope),otpechatok:require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
function resurs(ctx) {
  if (ctx.tablica !== 'okr') return ctx.tablica;
  return ({ celi: 'celi', rezultat: 'rezultaty', rezultaty: 'rezultaty',
    zamery: 'zamery', vehi: 'rezultaty' })[ctx.dejstvie] || 'okr';
}
function proverit(db, ctx) {
  if(ctx.tablica==='tezisy'&&ctx.metod!=='GET')require('./prava-strategii.js').check(db,ctx.avtor);
  if(ctx.tablica==='shablony'&&ctx.kljuch){const row=require('./shablony.js').find(db,ctx.kljuch);if(row&&!require('./shablony.js').visible(row,ctx.avtor))throw new NeNajdeno();}
  if(ctx.tablica==='zadachi'&&ctx.dejstvie==='iz_shablona'){const value=ctx.telo.shablon??ctx.telo.kod;const row=require('./shablony.js').find(db,value);if(row&&!require('./shablony.js').visible(row,ctx.avtor))throw new NeNajdeno();}
  const scope = srez(db, ctx.avtor);
  if(scope.bez_deneg&&ctx.tablica==='zadachi'&&ctx.dejstvie==='fakt'&&scope.moneyTasks.has(db.prepare('SELECT id FROM zadachi WHERE nomer=?').get(ctx.kljuch)?.id))throw new NetDostupa('У тебя доступ без денег');
  if(scope.bez_deneg&&ctx.tablica==='zadachi'&&Object.hasOwn(ctx.zapros,'plan_chislo')&&scope.moneyTasks.size)throw new NetDostupa('Фильтрация по суммам денежных задач недоступна');
  if (scope.bez_deneg && ctx.tablica === 'sotrudnichestva' && ctx.dejstvie === 'vyplata' && ctx.metod !== 'GET') throw new NetDostupa('У тебя доступ без денег');
  const table = resurs(ctx), body = ctx.telo || {};
  let cel = table === 'celi' ? Number(ctx.kljuch || body.cel_id) : Number(body.cel_id || ctx.zapros.cel_id);
  let result = table === 'rezultaty' ? Number(ctx.kljuch || body.rezultat_id)
    : Number(body.rezultat_id || ctx.zapros.rezultat_id);
  const linkedResult = Number(body.rezultat_id);
  if (table === 'zamery' && ctx.kljuch) {
    result = db.prepare('SELECT rezultat_id FROM zamery WHERE id=?').get(ctx.kljuch)?.rezultat_id;
  }
  if (scope.privateGoals.has(cel) || scope.privateResults.has(result)
      || scope.privateResults.has(linkedResult)) throw new NeNajdeno();
  if (scope.bez_deneg && (scope.money.has(result) || scope.money.has(linkedResult))) throw new NetDostupa('У тебя доступ без денег');
  if (scope.bez_deneg) {
    const denied = require('./obschij.js').DENEZHNYE[table] || [];
    if (Object.keys(ctx.zapros).some(key => denied.includes(key)
        || (table === 'rezultaty' && ['plan','baza'].includes(key))
        || (table === 'zamery' && key === 'znachenie'))) {
      throw new NetDostupa('Фильтрация по закрытым денежным полям недоступна');
    }
  }
  if (ctx.metod !== 'GET' && scope.bez_deneg) {
    const previous = table === 'rezultaty' && result
      ? db.prepare('SELECT * FROM rezultaty WHERE id=?').get(result) : {};
    if ((table === 'rezultaty' && denezhnyj({ ...previous, ...body }))
        || body.formula === 'summa_oplat') throw new NetDostupa('У тебя доступ без денег');
    if (table === 'celi' && scope.moneyGoals.has(cel)) throw new NetDostupa('У цели есть денежные результаты');
  }
}
function otvet(db, ctx, value) {
  const scope = srez(db, ctx.avtor);
  const { DENEZHNYE, TABLICA_OBEKTA } = require('./obschij.js');
  const root = resurs(ctx);
  function clean(v, type) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(x => clean(x, type)).filter(x => x !== undefined);
    if(scope.bez_deneg&&v.finansovyj_insajt===true)return undefined;
    if(v.insajt_okr===true&&(scope.privateGoals.has(Number(v.cel_id))||scope.bez_deneg&&scope.moneyGoals.has(Number(v.cel_id))))return undefined;
    if(Object.hasOwn(v,'rezhim')&&Object.hasOwn(v,'nachalo')&&Object.hasOwn(v,'konec')&&Object.hasOwn(v,'zachtena')&&Number(v.chelovek_id)!==Number(ctx.avtor))return undefined;
    let kind = type;
    if(v.chto==='shablon'||Object.hasOwn(v,'gotovyj')&&Object.hasOwn(v,'schitat_fakt'))kind='shablony';
    if (v.chto === 'cel') kind = 'celi';
    if ('period_id' in v && 'sostojanie' in v) kind = 'celi';
    else if ('cel_id' in v && ('istochnik' in v || 'formula' in v)) kind = 'rezultaty';
    else if ('rezultat_id' in v && 'znachenie' in v) kind = 'zamery';
    const id = Number(v.id);
    if(kind==='shablony'&&scope.privateTemplates.has(id))return undefined;
    if ((kind === 'celi' && scope.privateGoals.has(id))
        || (kind === 'rezultaty' && scope.privateResults.has(id))
        || (kind === 'rezultaty' && v.cel_id && scope.privateGoals.has(Number(v.cel_id)))
        || (kind === 'zamery' && v.rezultat_id && scope.privateResults.has(Number(v.rezultat_id)))) return undefined;
    if (scope.bez_deneg && kind === 'rezultaty' && (scope.money.has(id) || denezhnyj(v))) {
      return { id: v.id, cel_id: v.cel_id, nazvanie: v.nazvanie, tip: v.tip,
        istochnik: v.istochnik, formula: v.formula, skryto: ['dengi'] };
    }
    if (scope.bez_deneg && v.rezultat_id && !('nomer' in v)
        && scope.money.has(Number(v.rezultat_id))) return undefined;
    if(!vidimaZapisZhurnala(v,scope))return undefined;
    const out = {};
    const taskMoney=scope.bez_deneg&&(require('./dengi-zadach.js').marked(v)||(Object.hasOwn(v,'nomer')&&scope.moneyTasks.has(Number(v.id??v.zadacha_id))));
    const tableMoneyHidden = scope.bez_deneg && (DENEZHNYE[kind] || []).some(key => Object.hasOwn(v, key));
    const goalMoney = scope.bez_deneg && kind === 'celi' && scope.moneyGoals.has(id);
    for (const [key, data] of Object.entries(v)) {
      if(['otmena_okr','otmena_sozdanija'].includes(key))continue;
      if (scope.bez_deneg && (DENEZHNYE[kind] || []).includes(key)) continue;
      if(taskMoney&&require('./dengi-zadach.js').fields.includes(key))continue;
      if (scope.bez_deneg && key === 'dengi') { out[key] = { skryto: true, znachenie: null }; continue; }
      if (scope.bez_deneg && (AMOUNTS.has(key) || key.startsWith('summa_')&&key!=='summa_skryta'
          || (key === 'prishlo' && typeof data === 'number')
          || (key === 'procent_celej' && scope.moneyGoals.size))) continue;
      if (goalMoney && /^(procent|progress|progress_pct|razryv|status_celi|dvizhenie.*)$/.test(key)) continue;
      const childType = ({ shablony:'shablony',celi: 'celi', rezultaty: 'rezultaty', zamery: 'zamery',
        ustarevshie_zamery: 'zamery' })[key] || (key === 'spisok' || key === 'tekuschee' ? kind : null);
      if ((['dannye','srez'].includes(key) || (v.obekt && ['bylo','stalo'].includes(key))) && typeof data === 'string') {
        try { out[key] = JSON.stringify(clean(JSON.parse(data), null)); continue; } catch {                     }
      }
      const cleaned = clean(data, childType);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    if (goalMoney || tableMoneyHidden || taskMoney) out.skryto = [...new Set([...(out.skryto||[]),'dengi'])];
                                                                            
                                                                               
    if(ctx.tablica==='zadachi'&&Number.isSafeInteger(v.id)&&Number.isSafeInteger(v.nomer)&&Number.isSafeInteger(v.fokus?.sessij)&&Object.hasOwn(v.fokus,'neizvestno_sessij')){
      const current=db.prepare('SELECT * FROM zadachi WHERE id=?').get(v.id);
      out.mozhno_privjazat_fokus=!!current&&current.nomer===v.nomer&&require('./fokus-zadacha.js').eligible(db,current,Number(ctx.avtor));
    }
    if(out.svodka&&Array.isArray(v.svodka?.celi)&&v.svodka.celi.some(goal=>scope.privateGoals.has(Number(goal.id)))){
      out.svodka.procent_celej=null;out.svodka.celi_skryty=true;
    }
    return out;
  }
  const result = clean(value, root);
  if(ctx.tablica==='planerka'&&result?.istochnik_otcheta)result.istochnik_otcheta.vidimost=require('node:crypto').createHash('sha256').update(JSON.stringify([scope.bez_deneg,...['privateGoals','privateResults','privateMeasurements','money','moneyTasks'].map(key=>[...scope[key]].sort((a,b)=>a-b))])).digest('hex');
  if(ctx.tablica==='insajty'&&Array.isArray(result?.insajty))result.vsego=result.insajty.length;
                                                                            
                                                                                 
  if (scope.bez_deneg && ctx.tablica === 'sotrudnichestva'
      && ['privedeno', 'predlozhennye_zadachi', 'vyplata'].includes(ctx.dejstvie)
      && result && typeof result === 'object' && !Array.isArray(result)) {
    const hidden = ['zarabotano', 'nachisleno', 'vyplacheno', 'k_vyplate',
      'procent', 'procent_shkala', 'nalog', 'stavka_naloga', 'vyplata'];
    for (const key of hidden) delete result[key];
    result.skryto = ['dengi'];
    if (ctx.dejstvie === 'predlozhennye_zadachi') {
      result.spisok = []; result.vsego = 0;
      delete result.zadachi_sozdany; delete result.podpis;
    }
  }
  return result;
}
module.exports = { denezhnyj, proverit, otvet, vidimost, zhurnalDostup };
