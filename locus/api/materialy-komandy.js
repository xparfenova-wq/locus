const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {baza,v_odnoj_tranzakcii,OshibkaVvoda,NeNajdeno,NetDostupa,seichas}=require('../db/db.js');
const {validate,PREDEL}=require('./materialy-validacija.js');
const TABLES=new Set(['materialy','dokumenty']);
const BINDINGS=['chelovek_id','proekt_id','napravlenie','zadacha_id'];
const STORE=path.resolve(process.env.LOCUS_FAJLY||path.join(__dirname,'../fajly'));
const grace=Number(process.env.LOCUS_UPLOAD_GRACE_MS),STAGING_TTL=Number.isSafeInteger(grace)&&grace>0&&grace<=604800000?grace:86400000;
const error=(message,field,code,status=400,extra={})=>Object.assign(new OshibkaVvoda(message,field),{kod:status,dannye:{kod:code,soobshchenie:message,...extra}});
function table(value){if(!TABLES.has(value))throw new OshibkaVvoda('Нужен материал или документ');return value;}
function owner(row,actor){
 const admins=(process.env.LOCUS_ADMIN_IDS||'61').split(',').map(Number);
 if(Number(row.kto_dobavil)!==Number(actor)&&!admins.includes(Number(actor)))throw error('Изменять материал может автор или владелец','kto_dobavil','forbidden',403);
}
function capabilities(actor){return {mozhno_vse:(process.env.LOCUS_ADMIN_IDS||'61').split(',').map(Number).includes(Number(actor))};}
function key(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(value))throw new OshibkaVvoda('Нужен ключ запроса','zapros_kljuch');return value;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
function check(request,actor){
 const receipt=baza().prepare('SELECT * FROM zaprosy_materialov WHERE avtor=? AND kljuch=?').get(actor,key(request));
 if(!receipt)return {sostojanie:'ne_najdeno'};
 if(receipt.zapis_id===0)return {sostojanie:'otmeneno',tablica:receipt.tablica};
 const row=baza().prepare('SELECT * FROM '+table(receipt.tablica)+' WHERE id=?').get(receipt.zapis_id);
 return {sostojanie:row?'sozdano':'udaleno',tablica:receipt.tablica,id:receipt.zapis_id,material:row||null};
}
function create(tab,telo,actor){
 table(tab);const body={...telo},request=body.zapros_kljuch;delete body.zapros_kljuch;
 const digest=crypto.createHash('sha256').update(JSON.stringify(stable({tab,body}))).digest('hex');
 return v_odnoj_tranzakcii(baza(),()=>require('./versii.js').s_avtorom(baza(),actor,()=>{
  if(request!==undefined){
   key(request);const old=baza().prepare('SELECT * FROM zaprosy_materialov WHERE avtor=? AND kljuch=?').get(actor,request);
   if(old){
    if(old.zapis_id===0)throw error('Добавление этого материала отменено','zapros_kljuch','zapros_otmenen',409);
    if(old.otpechatok!==digest)throw error('Под этим ключом уже сохранено другое вложение','zapros_kljuch','zapros_izmenilsja',409);
    const saved=check(request,actor);if(!saved.material)throw error('Это вложение уже было добавлено и удалено','zapros_kljuch','file_deleted',410);
    return require('./materialy-vid.js').present({...saved.material,povtor_sozdanija:true});
   }
  }
  const row=require('./obschij.js').sozdat(tab,require('./opisanija.js').OPISANIJA[tab],body,actor);
  if(request!==undefined)baza().prepare('INSERT INTO zaprosy_materialov(avtor,kljuch,tablica,otpechatok,zapis_id,sozdano) VALUES(?,?,?,?,?,?)').run(actor,request,tab,digest,row.id,seichas());
  return require('./materialy-vid.js').present(row);
 }));
}
function cancel(request,tab,actor){
 table(tab);key(request);return v_odnoj_tranzakcii(baza(),()=>{
  const old=baza().prepare('SELECT 1 FROM zaprosy_materialov WHERE avtor=? AND kljuch=?').get(actor,request);
  if(!old)baza().prepare('INSERT INTO zaprosy_materialov(avtor,kljuch,tablica,otpechatok,zapis_id,sozdano) VALUES(?,?,?,?,0,?)').run(actor,request,tab,'otmeneno',seichas());
  return check(request,actor);
 });
}
function localKey(row){
 const value=row.fajl||row.ssylka;if(typeof value!=='string')return null;
 let name=value;try{if(value.startsWith('/fajly/'))name=decodeURIComponent(value.slice(7));else if(value.includes('/'))return null;}catch{return null;}
 return name&&name!=='.'&&name!=='..'&&!/[\\/\u0000-\u001f\u007f]/.test(name)?name:null;
}
function storedPath(name){
 if(!name||path.basename(name)!==name)throw new NeNajdeno('файла нет');
 const file=path.join(STORE,name);
 if(!fs.existsSync(file)||!fs.lstatSync(file).isFile()||!fs.realpathSync(file).startsWith(fs.realpathSync(STORE)+path.sep))throw error('Файл пока недоступен в хранилище Локуса','fajl','file_missing',404);
 return file;
}
function available(row){try{const name=localKey(row);if(!name)return false;storedPath(name);return true;}catch{return false;}}
const fileVariants=name=>[name,'/fajly/'+name,'/fajly/'+encodeURIComponent(name)];
function collect(name){
 if(!name)return false;
 const result=gcResult(name);
 if(['busy','error'].includes(result.reason))laterCollect(name);
 return result.deleted;
}
const GC_FOLDER=path.join(STORE,'.gc');
const gcTimers=new Map();
const gcMarker=name=>path.join(GC_FOLDER,crypto.createHash('sha256').update(name).digest('hex')+'.json');
function gcResult(name){
 const {spawnSync}=require('node:child_process');
 const result=spawnSync('python3',[path.join(__dirname,'../ops/file_gc.py'),name],{env:process.env,encoding:'utf8',timeout:5000});
 try{return JSON.parse(result.stdout);}catch{return {deleted:false,reason:'error'};}
}
function wakeGc(name,delay){
 clearTimeout(gcTimers.get(name));
 const timer=setTimeout(()=>{
  gcTimers.delete(name);
  try{const queued=JSON.parse(fs.readFileSync(gcMarker(name),'utf8'));if(queued.due>Date.now()){wakeGc(name,queued.due-Date.now());return;}}
  catch(error){if(error.code==='ENOENT')return;console.error('material cleanup queue: '+error.name);return;}
  const result=gcResult(name);
  if(['busy','error'].includes(result.reason)){wakeGc(name,10000);return;}
  try{fs.unlinkSync(gcMarker(name));}catch(error){if(error.code!=='ENOENT')console.error('material cleanup marker: '+error.code);}
 },Math.max(0,Math.min(delay,2147483647)));timer.unref();gcTimers.set(name,timer);
}
function laterCollect(name,delay=1000){
 if(!name)return;
 fs.mkdirSync(GC_FOLDER,{recursive:true,mode:0o700});
 const marker=gcMarker(name),due=Date.now()+delay,temporary=marker+'.'+crypto.randomUUID()+'.tmp';
 try{fs.writeFileSync(temporary,JSON.stringify({name,due}),{mode:0o600,flag:'wx'});fs.renameSync(temporary,marker);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 wakeGc(name,delay);
}
let gcResumed=false;
function resumeGc(){
 if(gcResumed)return;gcResumed=true;if(!fs.existsSync(GC_FOLDER))return;
 for(const filename of fs.readdirSync(GC_FOLDER).filter(x=>x.endsWith('.json'))){
  try{const record=JSON.parse(fs.readFileSync(path.join(GC_FOLDER,filename),'utf8'));
   if(typeof record.name==='string'&&localKey({fajl:record.name})===record.name&&Number.isSafeInteger(record.due)&&gcMarker(record.name)===path.join(GC_FOLDER,filename))wakeGc(record.name,record.due-Date.now());
  }catch(error){console.error('material cleanup queue: '+error.name);}
 }
}
function download(id,kind){
 const db=baza(),tables=kind==='dokument'?['dokumenty']:kind==='material'?['materialy']:['materialy','dokumenty'];
 if(kind&&!['material','dokument'].includes(kind))throw new OshibkaVvoda('Нужен материал или документ','obekt');
 const row=tables.map(t=>db.prepare('SELECT * FROM '+t+' WHERE id=?').get(id)).find(Boolean);
 if(!row)throw error('Файла больше нет в Локусе','fajl','file_deleted',404);
 const name=localKey(row);if(!name)throw error('У записи нет загруженного файла','fajl','file_not_local',404);
 const file=storedPath(name),legacy=name.replace(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}-/i,'');
 const original=row.ishodnoe_imja||legacy;
 return {file,name:original,mime:row.tip_fajla||'application/octet-stream',size:fs.statSync(file).size};
}
function links(id,kind){
 const db=baza(),tab=kind==='dokument'?'dokumenty':'materialy',row=db.prepare('SELECT * FROM '+tab+' WHERE id=?').get(id);if(!row)throw new NeNajdeno('Материала нет');
 return linksOf(row,tab);
}
function linksOf(row,tab){
 const db=baza(),name=localKey(row),variants=name?fileVariants(name):[],rows=[];
 for(const t of TABLES){const records=name?db.prepare('SELECT * FROM '+t+' WHERE fajl IN (?,?,?) OR ssylka IN (?,?,?)').all(...variants,...variants):t===tab?[row]:[];
  for(const record of records)for(const field of BINDINGS){if(record[field]==null||record[field]==='')continue;
   const target={chelovek_id:['ljudi','id','imja','chelovek'],proekt_id:['proekty','id','nazvanie','proekt'],napravlenie:['napravlenija','kod','nazvanie','napravlenie'],zadacha_id:['zadachi','id','nazvanie','zadacha']}[field];
   const value=db.prepare('SELECT * FROM '+target[0]+' WHERE '+target[1]+'=?').get(record[field]);
   rows.push({vid:target[3],pole:field,id:field==='zadacha_id'?value?.nomer:record[field],nazvanie:value?.[target[2]]||String(record[field]),zapis_id:record.id,obekt:t==='dokumenty'?'dokument':'material'});
  }
 }
 return {privjazki:rows,vsego:rows.length,mozhno_udaljat:rows.length===0};
}
function stage(bytes,original,mime){
 if(!bytes.length)throw error('Файл пустой, 0 байт. Проверьте, что выбрали нужный файл.','file','file_empty');
 validate({fajl:original,tip_fajla:mime,razmer:bytes.length});
 const hash=crypto.createHash('sha256').update(bytes).digest('hex'),name='sha256-'+hash;
 const type=/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime)?mime:'application/octet-stream';
 fs.mkdirSync(STORE,{recursive:true,mode:0o700});const destination=path.join(STORE,name);let fresh=false;
 if(!fs.existsSync(destination)){
  const temporary=path.join(STORE,'.'+name+'-'+crypto.randomUUID()+'.tmp');
  try{fs.writeFileSync(temporary,bytes,{flag:'wx',mode:0o600});fs.renameSync(temporary,destination);fresh=true;}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 }
 else if(crypto.createHash('sha256').update(fs.readFileSync(storedPath(name))).digest('hex')!==hash)throw new Error('Не совпало содержимое файла');
 return {fresh,fields:{nazvanie:original,ishodnoe_imja:original,fajl:name,razmer:bytes.length,tip_fajla:type}};
}
async function raw(req){
 const chunks=[];let count=0,over=false;
 for await(const chunk of req){count+=chunk.length;if(count>PREDEL){over=true;chunks.length=0;}else if(!over)chunks.push(chunk);}
 if(over)throw error('файл больше 50 МБ, приложите ссылкой','file','fajl_slishkom_bolshoj',413,{predel_bajt:PREDEL,fakticheski_bajt:count});
 let original;try{original=decodeURIComponent(req.headers['x-imja-fajla']||'fajl');}catch{throw new OshibkaVvoda('Некорректное имя файла','fajl');}
 const saved=stage(Buffer.concat(chunks),original,req.headers['x-tip-fajla']||req.headers['content-type']);
 laterCollect(saved.fields.fajl,STAGING_TTL);
 return {...saved.fields,ssylka:'/fajly/'+encodeURIComponent(saved.fields.fajl)};
}
async function multipart(req,tab,actor){
 const chunks=[];let count=0;
 for await(const chunk of req){count+=chunk.length;if(count>PREDEL+65536)throw error('файл больше 50 МБ, приложите ссылкой','file','fajl_slishkom_bolshoj',413,{predel_bajt:PREDEL,fakticheski_bajt:Math.max(PREDEL+1,count-65536)});chunks.push(chunk);}
 const form=await new Response(Buffer.concat(chunks),{headers:{'content-type':req.headers['content-type']}}).formData().catch(()=>{throw new OshibkaVvoda('Не удалось прочитать файл','file');});
 const body={},files=[];
 for(const [field,value]of form){
  if(field==='file'&&typeof value!=='string'){files.push(value);continue;}
  if(typeof value!=='string'||field in body||value.length>4096)throw new OshibkaVvoda('Неверное поле вложения',field);
  body[field]=value;
 }
 if(files.length!==1)throw new OshibkaVvoda('Выберите один файл','file');
 const f=files[0];
 if(!f.size)throw error('Файл пустой, 0 байт. Проверьте, что выбрали нужный файл.','file','file_empty');
 validate({fajl:f.name,tip_fajla:f.type,razmer:f.size});
 const saved=stage(Buffer.from(await f.arrayBuffer()),f.name,f.type),name=saved.fields.fajl;
 const fields={...body,...saved.fields,nazvanie:body.nazvanie||f.name,ssylka:null};
 for(const field of BINDINGS)if(field!=='napravlenie'&&fields[field]!==undefined)fields[field]=Number(fields[field]);
 try{
  if(req.aborted)throw new Error('Загрузка отменена');
  return create(tab,fields,actor);
 }catch(e){if(saved.fresh)collect(name);throw e;}
}
function unlink(tab,id,body,actor){
 table(tab);const db=baza(),row=db.prepare('SELECT * FROM '+tab+' WHERE id=?').get(id);if(!row)throw new NeNajdeno('Материала нет');owner(row,actor);
 const bindings=BINDINGS.filter(k=>row[k]!=null&&row[k]!==''),field=body.pole;
 if(field!==undefined&&!bindings.includes(field))throw new OshibkaVvoda('Такой привязки у записи нет','pole');
 if(!field&&bindings.length>1)throw new OshibkaVvoda('Укажите место, из которого убрать материал','pole');
 const common=require('./obschij.js'),opisanie=require('./opisanija.js').OPISANIJA[tab],name=localKey(row);
 const result=v_odnoj_tranzakcii(db,()=>field&&bindings.length>1?common.pravit(tab,opisanie,id,{[field]:null,versija:body.versija},actor):common.udalit(tab,opisanie,id,actor,{versija:body.versija}));
 laterCollect(name);
 const current=db.prepare('SELECT * FROM '+tab+' WHERE id=?').get(id);
 const variants=name?fileVariants(name):[];
 const remaining=current?linksOf(current,tab).vsego:name?[...TABLES].flatMap(t=>db.prepare('SELECT * FROM '+t+' WHERE fajl IN (?,?,?) OR ssylka IN (?,?,?)').all(...variants,...variants)).reduce((n,r)=>n+BINDINGS.filter(k=>r[k]!=null&&r[k]!=='').length,0):0;
 return {...result,remaining_links:remaining};
}
module.exports={create,check,cancel,multipart,raw,download,links,localKey,available,owner,capabilities,unlink,collect,resumeGc,STORE,PREDEL,STAGING_TTL};
