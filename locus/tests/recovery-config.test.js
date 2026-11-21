const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {FORMAT,sha,encrypt,decrypt,extract,validate,readPrivate}=require('../ops/recovery-config.cjs');
const entry=text=>({type:'file',sha256:sha(Buffer.from(text)),data:Buffer.from(text).toString('base64')});
const fixture=()=>({format:FORMAT,created:'2026-11-14',enabled_units:['locus-novyj.service'],files:{
  'etc/locus-novyj.env':entry('TEST_FIXTURE=example'),
  'etc/letsencrypt/archive/example/cert1.pem':entry('certificate fixture'),
  'etc/letsencrypt/live/example/cert.pem':{type:'symlink',target:'../../archive/example/cert1.pem'}
}});
test('encrypted recovery config authenticates every byte and extracts private files including LE symlinks',()=>{
  const key=crypto.randomBytes(32),payload=fixture(),blob=encrypt(payload,key),root=fs.mkdtempSync(path.join(os.tmpdir(),'locus-config-'));
  try{
    assert.deepEqual(decrypt(blob,key),payload);assert.equal(blob.includes(Buffer.from('TEST_FIXTURE')),false);
    assert.throws(()=>decrypt(blob,crypto.randomBytes(32)));assert.throws(()=>decrypt(blob.subarray(0,-1),key));
    for(const index of [0,10,30,blob.length-1]){const bad=Buffer.from(blob);bad[index]^=1;assert.throws(()=>decrypt(bad,key));}
    const dest=path.join(root,'restored');assert.equal(extract(payload,dest).files,3);
    assert.equal(fs.statSync(dest).mode&0o777,0o700);assert.equal(fs.statSync(path.join(dest,'etc/locus-novyj.env')).mode&0o777,0o600);
    assert.equal(fs.readFileSync(path.join(dest,'etc/letsencrypt/live/example/cert.pem'),'utf8'),'certificate fixture');
    assert.equal(readPrivate(path.join(dest,'etc/locus-novyj.env')).toString(),'TEST_FIXTURE=example');
    fs.chmodSync(path.join(dest,'etc/locus-novyj.env'),0o644);assert.throws(()=>readPrivate(path.join(dest,'etc/locus-novyj.env')));
    assert.throws(()=>extract(payload,dest),/new absolute/);assert.equal(fs.readFileSync(path.join(dest,'etc/locus-novyj.env'),'utf8'),'TEST_FIXTURE=example');
    fs.symlinkSync('absent',path.join(root,'dangling'));assert.throws(()=>extract(payload,path.join(root,'dangling')));assert.equal(fs.lstatSync(path.join(root,'dangling')).isSymbolicLink(),true);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('recovery config rejects malformed contents, traversal, collisions and unsafe symlinks before writing',()=>{
  for(const name of ['/etc/passwd','../outside','etc/../outside','etc//bad','etc/./bad','etc/a\\b','etc/a\0b','root/.ssh/key']){
    const p=fixture();p.files[name]=entry('bad');assert.throws(()=>validate(p));
  }
  for(const target of ['/etc/passwd','../../../../outside','missing.pem','cert.pem']){
    const p=fixture();p.files['etc/letsencrypt/live/example/cert.pem'].target=target;assert.throws(()=>validate(p));
  }
  const cycle=fixture();cycle.files['etc/letsencrypt/live/example/other.pem']={type:'symlink',target:'cert.pem'};
  cycle.files['etc/letsencrypt/live/example/cert.pem'].target='other.pem';assert.throws(()=>validate(cycle));
  for(const ancestor of [entry('not a directory'),{type:'symlink',target:'locus-novyj.env'}]){
    const p=fixture();p.files['etc/letsencrypt']=ancestor;assert.throws(()=>validate(p));
  }
  const mismatch=fixture();mismatch.files['etc/locus-novyj.env'].data=Buffer.from('tampered').toString('base64');assert.throws(()=>validate(mismatch));
  const format=fixture();format.files['etc/locus-novyj.env'].data='!!!!';assert.throws(()=>validate(format));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'locus-config-bad-')),dest=path.join(root,'new');
  try{assert.throws(()=>extract(mismatch,dest));assert.equal(fs.existsSync(dest),false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
