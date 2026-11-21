"""Sensitive stdout: invoked ONLY through the encrypted local capture runner."""
from pathlib import Path
import base64,configparser,datetime,hashlib,io,json,os,re,subprocess,urllib.parse

files={}
def add(path):
    p=Path(path)
    if not p.exists():raise RuntimeError('required recovery configuration is missing')
    name=str(p).lstrip('/')
    if name in files:return
    if p.is_symlink():
        real=p.resolve()
        if not str(real).startswith('/etc/letsencrypt/archive/'):raise RuntimeError('unexpected certificate symlink')
        add(real)
        files[name]={'type':'symlink','target':os.path.relpath(real,p.parent)}
    else:
        if not p.is_file() or p.stat().st_size>2*1024*1024:raise RuntimeError('invalid recovery file')
        data=p.read_bytes()
        files[name]={'type':'file','mode':p.stat().st_mode&0o777,'sha256':hashlib.sha256(data).hexdigest(),
            'data':base64.b64encode(data).decode('ascii')}

add('/etc/locus-novyj.env')
if Path('/etc/locus-novyj-media-secrets.json').exists():add('/etc/locus-novyj-media-secrets.json')
configs=[Path('/etc/nginx/sites-available/locus-novyj'),Path('/etc/nginx/sites-available/locus-novyj-zapas')]
certificates=[];renewals=[]
for config in configs:
    add(config)
    for dependency in re.findall(r'^\s*(?:include|ssl_dhparam)\s+([^;]+);',config.read_text(),re.M):
        p=Path(dependency.strip())
        if not p.is_absolute() or not str(p).startswith('/etc/letsencrypt/') or any(c in str(p) for c in '*?$'):
            raise RuntimeError('unsupported TLS dependency')
        add(p)
    for value in re.findall(r'^\s*ssl_certificate(?:_key)?\s+([^;]+);',config.read_text(),re.M):
        p=Path(value.strip())
        if not p.is_absolute() or '$' in str(p):raise RuntimeError('unsupported TLS location')
        add(p);certificates.append(str(p))
        if str(p).startswith('/etc/letsencrypt/live/'):
            for name in ['cert.pem','chain.pem','fullchain.pem','privkey.pem']:add(p.parent/name)
            renewal=Path('/etc/letsencrypt/renewal')/(p.parent.name+'.conf')
            if renewal not in renewals and renewal.exists():
                renewals.append(renewal);add(renewal)
                text=renewal.read_text()
                account=re.search(r'^account\s*=\s*([A-Za-z0-9_-]+)\s*$',text,re.M)
                server=re.search(r'^server\s*=\s*(https://\S+)\s*$',text,re.M)
                if account and server:
                    url=urllib.parse.urlparse(server.group(1));account_dir=Path('/etc/letsencrypt/accounts')/url.netloc/url.path.strip('/')/account.group(1)
                    if '..' in account_dir.parts:raise RuntimeError('invalid ACME location')
                    for name in ['regr.json','private_key.json','meta.json']:add(account_dir/name)
units=[Path('/etc/systemd/system/locus-novyj.service')]
units+=list(Path('/etc/systemd/system').glob('locus-novyj-*.service'))
units+=list(Path('/etc/systemd/system').glob('locus-novyj-*.timer'))
enabled=[]
for unit in sorted(set(units)):
    add(unit)
                                                                              
                                                                              
    for override in sorted(unit.with_name(unit.name+'.d').glob('*.conf')):add(override)
    result=subprocess.run(['systemctl','is-enabled',unit.name],capture_output=True,text=True)
    if result.stdout.strip()=='enabled':enabled.append(unit.name)
source=Path('/root/.config/rclone/rclone.conf')
parser=configparser.ConfigParser(interpolation=None);parser.read(source)
if 'gdrive' not in parser:raise RuntimeError('backup storage configuration is missing')
subset=configparser.ConfigParser(interpolation=None);subset['gdrive']=dict(parser['gdrive']);out=io.StringIO();subset.write(out)
data=out.getvalue().encode();files['root/.config/rclone/locus-gdrive.conf']={
    'type':'file','mode':0o600,'sha256':hashlib.sha256(data).hexdigest(),'data':base64.b64encode(data).decode()}
print(json.dumps({'format':'locus-recovery-configuration-v1','created':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope':'locus-novyj only; gdrive backup remote','enabled_units':enabled,'tls_files':sorted(set(certificates)),
    'files':files},separators=(',',':')))
