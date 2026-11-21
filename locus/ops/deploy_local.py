#!/usr/bin/env python3
"""Export an immutable local commit and deploy only locus-novyj over SSH."""
import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('locus_ops', root / 'ops/locus_ops.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def public_smoke(interface):
    """Exercise browser Origin through nginx without login or business writes."""
    results = []
    for origin in ('https://locus-novyj.187-124-165-215.nip.io',
                   'https://locus-novyj.187-124-165-215.nip.io:8443'):
        public = urlsplit(origin)
        statuses = {}
        for label, method, route, request_origin, expected in (
            ('health', 'GET', '/healthz', None, 200),
            ('same_origin_unauthenticated', 'POST', '/api/zadachi', origin, 401),
            ('foreign_origin_rejected', 'POST', '/api/zadachi', 'https://example.invalid', 403),
        ):
            command = ['curl', '--silent', '--show-error', '--noproxy', '*',
                       '--ipv4', '--resolve', public.hostname + ':' + str(public.port or 443)
                       + ':187.124.165.215',
                       '--connect-timeout', '8', '--max-time', '15',
                       '--output', '/dev/null', '--write-out', '%{http_code}',
                       '--request', method]
            if interface:
                command += ['--interface', interface]
            if request_origin:
                command += ['--header', 'Origin: ' + request_origin,
                            '--header', 'Content-Type: application/json', '--data', '{}']
            response = subprocess.run(command + [origin + route], check=False,
                                      capture_output=True, text=True, timeout=20)
            if response.returncode:
                raise RuntimeError('HTTPS ' + origin + ': ' + response.stderr.strip())
            status = int(response.stdout)
            if status != expected:
                raise RuntimeError('HTTPS ' + origin + ' ' + label + ': ' + str(status)
                                   + ', expected ' + str(expected))
            statuses[label] = status
        results.append({'origin': origin, **statuses})
    print(json.dumps({'public_https_smoke': results}), flush=True)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', default='HEAD')
    parser.add_argument('--pack-only', type=Path)
    parser.add_argument('--public-smoke-only', action='store_true')
    args = parser.parse_args()
    interface = os.environ.get('LOCUS_SSH_INTERFACE', 'en0')
    if args.public_smoke_only:
        public_smoke(interface)
        return
    if args.pack_only:
        print(json.dumps(ops.pack(root, args.pack_only.resolve(), args.revision)))
        return
                                                                              
                                                                                   
    recovery = Path(os.environ.get('LOCUS_RECOVERY_DIRECTORY', str(root.parent / '.recovery-secrets')))
    recovery.mkdir(mode=0o700, parents=True, exist_ok=True)
    key = recovery / 'recovery-configuration.key'
    configuration = recovery / ('locus-configuration-' + datetime.datetime.now(datetime.timezone.utc)
                                .strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8] + '.enc')
    arguments = ['--key', str(key), '--interface', interface or 'en0']
    subprocess.run(['node', str(root / 'ops/recovery-config.cjs'), 'pack', *arguments,
                    '--output', str(configuration)], check=True)
    subprocess.run(['node', str(root / 'ops/recovery-config.cjs'), 'offsite', *arguments,
                    '--input', str(configuration)], check=True)
    with tempfile.TemporaryDirectory(prefix='locus-deploy-') as tmp:
        archive = Path(tmp) / 'release.tar.gz'
        info = ops.pack(root, archive, args.revision)
        print(json.dumps(info), flush=True)
        remote = '/var/backups/locus-novyj/staging/' + uuid.uuid4().hex
        options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=yes']
        if interface:
            options += ['-o', 'BindInterface=' + interface]
        subprocess.run(['ssh', *options, 'srv', 'mkdir -m 700 -p ' + remote], check=True)
        subprocess.run(['scp', *options, str(archive), 'srv:' + remote + '/release.tar.gz'], check=True)
                                                                                 
                                                                            
        subprocess.run(['scp', *options, str(root / 'ops/locus_ops.py'),
                        'srv:' + remote + '/locus_ops.py'], check=True)
        command = ('python3 -c "import sys; from pathlib import Path; '
                   'sys.path.insert(0,\'' + remote + '\'); import locus_ops; '
                   'p=Path(\'' + remote + '/source\'); p.mkdir(mode=0o700); '
                   'locus_ops.safe_extract(Path(\'' + remote + '/release.tar.gz\'),p)"'
                   ' && python3 ' + remote + '/source/ops/locus_ops.py --root /var/www/locus-novyj deploy '
                   + remote + '/release.tar.gz')
        subprocess.run(['ssh', *options, 'srv', command], check=True)
                                                                               
                                                                             
        public_smoke(interface)


if __name__ == '__main__':
    main()
