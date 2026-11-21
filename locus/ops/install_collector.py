#!/usr/bin/env python3
"""Install only NEW Locus collection units; enable separately after release QA."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile

ROOT=Path('/var/www/locus-novyj')
UNITS=['locus-novyj-'+name+'.'+kind for name in ('telegram','instagram','sobrat') for kind in ('service','timer')]

def private_write(path,data):
    descriptor,name=tempfile.mkstemp(prefix='.'+path.name+'-',dir=path.parent)
    try:
        with os.fdopen(descriptor,'w') as output:
            os.fchmod(output.fileno(),0o600);output.write(data);output.flush();os.fsync(output.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)

def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--enable',action='store_true');args=parser.parse_args()
    if Path(__file__).resolve().parents[1]!=ROOT or os.geteuid()!=0:
        raise RuntimeError('installer is restricted to the new Locus server')
    env=Path('/etc/locus-novyj.env');text=env.read_text()
    match=re.search(r'^LOCUS_KLJUCH_SBORA=(.+)$',text,re.M)
    if match and not re.fullmatch(r'[A-Za-z0-9_-]{32,256}',match.group(1)):
        raise RuntimeError('collector key must be a private unquoted value of at least 32 characters')
    provider=Path('/etc/locus-novyj-media-secrets.json')
    if provider.exists():data=json.loads(provider.read_text())
    else:
                                                                               
        source=json.loads(Path('/var/www/locus/collector/secrets.json').read_text())
        data={key:source[key] for key in ('scrapecreators_key','apify_token') if source.get(key)}
    if not data.get('scrapecreators_key') and not data.get('apify_token'):
        raise RuntimeError('Instagram provider access is not configured')
    for unit in UNITS:
        source=ROOT/'ops/systemd'/unit
        if not source.is_file():raise RuntimeError('collector unit is missing')
    if not match:
        private_write(env,text.rstrip()+'\nLOCUS_KLJUCH_SBORA='+secrets.token_hex(32)+'\n')
    else:env.chmod(0o600)
    private_write(provider,json.dumps(data,separators=(',',':'))+'\n')
    for folder in (ROOT/'db/sbor-ochered',Path('/var/lib/locus-novyj')):
        if folder.is_symlink():raise RuntimeError('collector state must be a private directory')
        folder.mkdir(mode=0o700,parents=True,exist_ok=True);folder.chmod(0o700)
    for unit in UNITS:private_write(Path('/etc/systemd/system')/unit,(ROOT/'ops/systemd'/unit).read_text())
    subprocess.run(['systemd-analyze','verify',*[str(Path('/etc/systemd/system')/unit) for unit in UNITS]],check=True,capture_output=True)
    subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True)
    if args.enable:
                                                                                      
        import sys
        sys.path.insert(0,str(ROOT))
        from collector import locus_client
        for line in env.read_text().splitlines():
            if line.startswith('LOCUS_KLJUCH_SBORA='):os.environ['LOCUS_KLJUCH_SBORA']=line.split('=',1)[1]
        response=locus_client.api('GET','/api/akkaunty')
        if not isinstance(response.get('spisok'),list):raise RuntimeError('collector API is not ready')
        subprocess.run(['systemctl','enable','--now',*[unit for unit in UNITS if unit.endswith('.timer')]],check=True,capture_output=True)
    print(json.dumps({'new_system_only':True,'units':UNITS,'enabled':args.enable,
        'provider_configured':{key:bool(data.get(key)) for key in ('scrapecreators_key','apify_token')},'secrets_printed':False}))

if __name__=='__main__':main()
