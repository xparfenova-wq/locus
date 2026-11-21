'use strict';
                                                                                    
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const FORMAT='locus-recovery-configuration-v1',HEADER=Buffer.from('LOCUSCFG1'),AAD=Buffer.from(FORMAT),LIMIT=16*1024*1024;
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function fail(){throw new Error('Invalid or unauthenticated recovery configuration');}
function validName(name){
  return typeof name==='string' && name.length<512 && !name.includes('\\') && !name.includes('\0') &&
    !path.posix.isAbsolute(name) && name.split('/').every(p=>p && p!=='.' && p!=='..') &&
    (name.startsWith('etc/') || name==='root/.config/rclone/locus-gdrive.conf');
}
function validate(payload){
  if(!payload || payload.format!==FORMAT || !payload.files || typeof payload.files!=='object' || Array.isArray(payload.files))fail();
  const entries=Object.entries(payload.files),decoded=new Map();
  if(!entries.length || entries.length>512 || !Array.isArray(payload.enabled_units) ||
    payload.enabled_units.some(n=>typeof n!=='string' || !/^locus-novyj(?:-[a-z]+)?\.(?:service|timer)$/.test(n)))fail();
  let bytes=0;
  for(const [name,item] of entries){
    if(!validName(name) || !item || typeof item!=='object')fail();
    if(item.type==='file'){
      if(typeof item.data!=='string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data))fail();
      const data=Buffer.from(item.data,'base64');bytes+=data.length;
      if(bytes>LIMIT || data.length>2*1024*1024 || sha(data)!==item.sha256)fail();
      decoded.set(name,{type:'file',data});
    }else if(item.type==='symlink'){
      if(typeof item.target!=='string' || !item.target || item.target.length>512 || item.target.includes('\\') ||
        item.target.includes('\0') || path.posix.isAbsolute(item.target))fail();
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(name),item.target));
      if(!validName(target))fail();
      decoded.set(name,{type:'symlink',target:item.target,resolved:target});
    }else fail();
  }
  for(const [name,item] of decoded){
    const parts=name.split('/');
    for(let n=1;n<parts.length;n++)if(decoded.has(parts.slice(0,n).join('/')))fail();
    if(item.type==='symlink'){
      let current=item,seen=new Set([name]);
      while(current.type==='symlink'){
        if(seen.has(current.resolved))fail();seen.add(current.resolved);
        current=decoded.get(current.resolved);if(!current)fail();
      }
    }
  }
  return decoded;
}
function encrypt(payload,key){
  validate(payload);if(!Buffer.isBuffer(key) || key.length!==32)fail();
  const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(AAD);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return Buffer.concat([HEADER,nonce,ciphertext,cipher.getAuthTag()]);
}
function decrypt(blob,key){
  if(!Buffer.isBuffer(key) || key.length!==32 || !Buffer.isBuffer(blob) || blob.length<38 || blob.length>LIMIT*2 || !blob.subarray(0,9).equals(HEADER))fail();
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,blob.subarray(9,21));decipher.setAAD(AAD);decipher.setAuthTag(blob.subarray(-16));
    const payload=JSON.parse(Buffer.concat([decipher.update(blob.subarray(21,-16)),decipher.final()]).toString('utf8'));
    validate(payload);return payload;
  }catch{fail();}
}
function extract(payload,destination){
  const files=validate(payload);
  if(!path.isAbsolute(destination) || fs.existsSync(destination))throw new Error('Destination must be a new absolute directory');
                                                                                       
  fs.mkdirSync(destination,{mode:0o700});
  try{
    for(const [name,item] of files){
      const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
      if(item.type==='file')fs.writeFileSync(target,item.data,{flag:'wx',mode:0o600});
    }
    for(const [name,item] of files)if(item.type==='symlink')fs.symlinkSync(item.target,path.join(destination,name));
  }catch(error){fs.rmSync(destination,{recursive:true,force:true});throw error;}
  return {files:files.size,destination};
}
function readPrivate(file){
  const stat=fs.lstatSync(file);
  if(!stat.isFile() || (stat.mode&0o077)!==0 || stat.size>LIMIT*2)throw new Error('Private regular file with mode 0600 required');
  return fs.readFileSync(file);
}
function sshOptions(options){
  const host=options['--host'] || 'srv',iface=options['--interface'] || 'en0';
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._@-]*$/.test(host) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(iface))throw new Error('Invalid SSH target');
  return ['-o','BindInterface='+iface,'-o','BatchMode=yes','-o','ConnectTimeout=12','-o','StrictHostKeyChecking=yes',host,'python3 -'];
}
function offsite(blob,options){
                                                                               
  const data={data:blob.toString('base64'),sha256:sha(blob)};
  const script=`import base64,hashlib,json,os,pathlib,subprocess,tempfile\nos.umask(0o077)\nx=json.loads(${JSON.stringify(JSON.stringify(data))})\nb=base64.b64decode(x['data']);assert hashlib.sha256(b).hexdigest()==x['sha256']\nroot=pathlib.Path('/var/backups/locus-novyj/recovery-config');root.mkdir(parents=True,exist_ok=True,mode=0o700)\nname='locus-config-'+x['sha256']+'.enc';destination='gdrive:locus-bekapy/locus-novyj/recovery-config/'+name\ntry:\n with tempfile.TemporaryDirectory(prefix='transfer-',dir=root) as temporary:\n  p=pathlib.Path(temporary)/name;p.write_bytes(b);p.chmod(0o600);q=p.with_name('roundtrip.enc')\n  subprocess.run(['rclone','copyto',str(p),destination],check=True,capture_output=True,timeout=120)\n  subprocess.run(['rclone','copyto',destination,str(q)],check=True,capture_output=True,timeout=120)\n  assert hashlib.sha256(q.read_bytes()).hexdigest()==x['sha256']\n print(json.dumps({'offsite':destination,'sha256':x['sha256'],'roundtrip_verified':True,'key_uploaded':False}))\nexcept Exception:\n raise SystemExit('Encrypted offsite transfer failed')\n`;
  try{return JSON.parse(execFileSync('ssh',sshOptions(options),{input:script,maxBuffer:4096,timeout:270000,stdio:['pipe','pipe','pipe']}).toString('utf8'));}
  catch{throw new Error('Encrypted offsite transfer failed; no plaintext is logged');}
}
function main(args){
  const command=args.shift(),options={};
  while(args.length){const key=args.shift();if(!/^--(?:key|output|input|destination|host|interface)$/.test(key) || !args.length || options[key])throw new Error('Invalid arguments');options[key]=args.shift();}
  if(!options['--key'] || !['pack','verify','extract','offsite'].includes(command))throw new Error('Use pack, verify, extract or offsite with --key');
  const keyFile=path.resolve(options['--key']);
  if(command==='pack'){
    if(!options['--output'])throw new Error('--output required');
    const ssh=sshOptions(options);
    fs.mkdirSync(path.dirname(keyFile),{recursive:true,mode:0o700});
    if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(32),{flag:'wx',mode:0o600});
    const key=readPrivate(keyFile);if(key.length!==32)fail();
    let payload;
    try{
      const stdout=execFileSync('ssh',ssh,
        {input:fs.readFileSync(path.join(__dirname,'recovery_export.py')),maxBuffer:LIMIT*2,timeout:60000,stdio:['pipe','pipe','pipe']});
      payload=JSON.parse(stdout.toString('utf8'));
    }catch{throw new Error('Configuration export failed; no plaintext is logged');}
    const blob=encrypt(payload,key);decrypt(blob,key);
    const output=path.resolve(options['--output']);fs.writeFileSync(output,blob,{flag:'wx',mode:0o600});
    return {format:FORMAT,files:Object.keys(payload.files).length,output,sha256:sha(blob),roundtrip_verified:true,key_sent_to_server:false};
  }
  if(!options['--input'])throw new Error('--input required');
  const blob=readPrivate(path.resolve(options['--input'])),payload=decrypt(blob,readPrivate(keyFile));
  if(command==='offsite')return offsite(blob,options);
  if(command==='extract'){
    if(!options['--destination'])throw new Error('--destination required');
    return extract(payload,options['--destination']);
  }
  return {format:FORMAT,files:Object.keys(payload.files).length,created:payload.created,sha256:sha(blob),verified:true};
}
module.exports={FORMAT,sha,validate,encrypt,decrypt,extract,readPrivate,main};
if(require.main===module){try{console.log(JSON.stringify(main(process.argv.slice(2))));}catch(error){console.error(error.message);process.exitCode=1;}}
