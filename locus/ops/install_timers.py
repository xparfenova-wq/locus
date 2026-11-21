#!/usr/bin/env python3
"""Install timers belonging ONLY to the new Locus. --apply is required."""
import argparse
import datetime as dt
import json
from pathlib import Path
import shutil
import subprocess
from locus_ops import operation_lock

ROOT = Path('/var/www/locus-novyj')
JOBS = {
    'storozh': ('storozh.sh', 'OnBootSec=2min\nOnUnitActiveSec=5min'),
    'snimok': ('snimok.sh', 'OnBootSec=5min\nOnUnitActiveSec=10min'),
    'bekap': ('snimok.sh --nochnoj', 'OnCalendar=*-*-* 03:00:00 Europe/Moscow\nPersistent=true'),
    'utro': ('utro.sh', 'OnCalendar=*-*-* 09:00:00 Europe/Moscow\nPersistent=true'),
    'nedelja': ('snimok-nedeli.sh', 'OnCalendar=Sun *-*-* 23:59:00 Europe/Moscow\nPersistent=true'),
}


def units():
    result = {}
    for job, (script, schedule) in JOBS.items():
        name = 'locus-novyj-' + job
        result[name + '.service'] = (
            '[Unit]\nDescription=Locus new: ' + job + '\n'
            'StartLimitIntervalSec=1800\nStartLimitBurst=3\n'
            '[Service]\nType=oneshot\nUMask=0077\n'
            'ExecStart=/bin/bash ' + str(ROOT) + '/' + script + '\n'
            'Restart=on-failure\nRestartSec=120\nTimeoutStartSec=15min\n')
        result[name + '.timer'] = (
            '[Unit]\nDescription=Locus new timer: ' + job + '\n'
            '[Timer]\n' + schedule + '\n[Install]\nWantedBy=timers.target\n')
    return result


def systemctl(*args, check=True):
    return subprocess.run(['systemctl', *args], check=check, capture_output=True, text=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    rendered = units()
    if not args.apply:
        print(json.dumps(rendered, indent=2))
        return
    if Path(__file__).resolve().parents[1] != ROOT:
        raise ValueError('install only from the new app on srv')
    with operation_lock(ROOT):
        backup = Path('/var/backups/locus-novyj/timers') / dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%f')
        backup.mkdir(mode=0o700, parents=True)
        target = Path('/etc/systemd/system')
        originals = {}
        for name in rendered:
            file = target / name
            originals[name] = file.read_bytes() if file.exists() else None
            if file.exists():
                shutil.copy2(file, backup / name)
        old = []
        for job, (script, _) in JOBS.items():
            name = 'locus-' + job
            text = systemctl('cat', name + '.service', check=False).stdout
                                                                             
                                                                     
            if 'ExecStart=/bin/bash ' + str(ROOT) + '/' + script in text.splitlines():
                old.append((name + '.timer', systemctl('is-enabled',name+'.timer',check=False).returncode == 0,
                            systemctl('is-active',name+'.timer',check=False).returncode == 0))
        (backup / 'inventory.json').write_text(json.dumps({'old': old, 'new': list(rendered)},indent=2))
        try:
            for name, text in rendered.items():
                temp = target / (name + '.tmp')
                temp.write_text(text)
                temp.chmod(0o644)
                temp.replace(target / name)
            systemctl('daemon-reload')
            for name, _, _ in old:
                old_stamp = Path('/var/lib/systemd/timers') / ('stamp-' + name)
                new_stamp = old_stamp.with_name('stamp-locus-novyj-' + name.removeprefix('locus-'))
                if old_stamp.exists() and not new_stamp.exists():
                    shutil.copy2(old_stamp, new_stamp)
            timers = [name for name in rendered if name.endswith('.timer')]
            systemctl('enable','--now',*timers)
            for name, _, _ in old:
                systemctl('disable','--now',name)
            print(json.dumps({'installed':timers,'retired':[x[0] for x in old],'backup':str(backup)}))
        except BaseException:
            for name in rendered:
                if name.endswith('.timer'):
                    systemctl('disable','--now',name,check=False)
            for name, content in originals.items():
                file = target / name
                if content is None:
                    file.unlink(missing_ok=True)
                else:
                    file.write_bytes(content)
            systemctl('daemon-reload',check=False)
            for name, enabled, active in old:
                if enabled:
                    systemctl('enable',name,check=False)
                if active:
                    systemctl('start',name,check=False)
            raise


if __name__ == '__main__':
    main()
