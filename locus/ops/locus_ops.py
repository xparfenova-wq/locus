
"""Private, self-contained backups and releases. No pip dependencies.

Archives contain team data. Store them privately; never add them to Git.
Restore always creates a NEW directory. It cannot overwrite a running app.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import uuid

RUNTIME_DIRS = ('api', 'public', 'ops', 'collector', 'design')
ROOT_FILES = ('server.js', 'package.json', 'storozh.sh', 'snimok.sh',
              'utro.sh', 'snimok-nedeli.sh')
DEPLOY_ROOT = Path('/var/www/locus-novyj')
DEPLOY_PORT = 8791


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    with temp.open('x') as stream:
        os.chmod(temp, 0o600)
        json.dump(value, stream, ensure_ascii=False, indent=2)
    os.replace(temp, path)


def runtime_files(root):
    files = set()
    for name in ROOT_FILES:
        if (root / name).is_file():
            files.add(name)
    for directory in RUNTIME_DIRS:
        if (root / directory).exists():
            for file in (root / directory).rglob('*'):
                if file.is_file() and '__pycache__' not in file.parts:
                    if directory=='collector' and file.suffix!='.py':
                        continue
                    if file.name not in ('maintenance.json', 'release.json', 'backup-state.json'):
                        files.add(file.relative_to(root).as_posix())
    for file in (root / 'db').rglob('*'):
        if file.is_file() and file.suffix in ('.js', '.sql') and 'bekapy' not in file.parts:
            files.add(file.relative_to(root).as_posix())
    for name in files:
        if (root / name).is_symlink():
            raise ValueError('symlink in source: ' + name)
    return sorted(files)


def copy_files(source, target, names):
    for name in names:
        path = target / name
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        shutil.copyfile(source / name, path)
        os.chmod(path, 0o600)


def db_state(file):
    with contextlib.closing(sqlite3.connect(file.as_uri() + '?mode=rw', uri=True)) as db:
        integrity = db.execute('PRAGMA integrity_check').fetchall()
        if integrity != [('ok',)]:
            raise ValueError('database integrity check failed')
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('database has broken foreign keys')
        tables = [row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        counts = {name: db.execute('SELECT count(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]
                  for name in tables}
        return {'integrity': 'ok', 'foreign_key_errors': 0, 'counts': counts}


def verify_membership_archive(before_database, after_database):
                                                                              
                                                                                
    with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as source, contextlib.closing(sqlite3.connect(after_database.as_uri()+'?mode=ro',uri=True)) as target:
        if source.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='nerazobrannye_svjazi'").fetchone()[0] and source.execute('SELECT count(*) FROM nerazobrannye_svjazi').fetchone()[0]:
            raise ValueError('membership archival would overwrite an existing audit history')
        columns='u.rowid,u.zadacha_id,u.chelovek_id,typeof(u.zadacha_id),typeof(u.chelovek_id)'
        valid=source.execute('SELECT '+columns+' FROM zadacha_uchastniki u JOIN zadachi z ON z.id=u.zadacha_id JOIN ljudi l ON l.id=u.chelovek_id ORDER BY u.rowid').fetchall()
        invalid=source.execute('SELECT '+columns+' FROM zadacha_uchastniki u LEFT JOIN zadachi z ON z.id=u.zadacha_id LEFT JOIN ljudi l ON l.id=u.chelovek_id WHERE z.id IS NULL OR l.id IS NULL ORDER BY u.rowid').fetchall()
        active=target.execute('SELECT id,zadacha_id,chelovek_id,typeof(zadacha_id),typeof(chelovek_id) FROM zadacha_uchastniki ORDER BY id').fetchall()
        archived=target.execute("SELECT staryj_rowid,zadacha_id_istochnika,chelovek_id_istochnika,typeof(zadacha_id_istochnika),typeof(chelovek_id_istochnika) FROM nerazobrannye_svjazi WHERE tablica='zadacha_uchastniki' ORDER BY staryj_rowid").fetchall()
        if valid!=active or invalid!=archived:
            raise ValueError('membership migration did not preserve both original partitions')
        if source.execute('SELECT count(*) FROM migracii WHERE nomer=107').fetchone()[0] or target.execute('SELECT count(*) FROM migracii WHERE nomer=107').fetchone()[0]!=1:
            raise ValueError('membership archival requires the single migration107 transition')


def verify_notification_links(before_database, after_database):
                                                                           
                                                                               
    with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as source, contextlib.closing(sqlite3.connect(after_database.as_uri()+'?mode=ro',uri=True)) as target:
        if source.execute('SELECT count(*) FROM migracii WHERE nomer=108').fetchone()[0] or target.execute('SELECT count(*) FROM migracii WHERE nomer=108').fetchone()[0]!=1:
            raise ValueError('notification conversion requires the single migration108 transition')
        fields=['id','chelovek_id','tip','potok','zadacha_id','tekst','prochitano','sozdano']
        select=','.join('u.'+f for f in fields)+','+','.join('typeof(u.'+f+')' for f in fields)
        original=source.execute('SELECT '+select+',z.id FROM uvedomlenija u LEFT JOIN zadachi z ON z.id=u.zadacha_id ORDER BY u.id').fetchall()
        expected=[]
        for row in original:
            values=list(row[:8]);types=list(row[8:16]);raw=None;raw_type='null'
            if values[4] is not None and row[16] is None:
                raw,raw_type=values[4],types[4];values[4]=None;types[4]='null'
            expected.append(tuple(values+types+[raw,raw_type,None,None,None]))
        actual=target.execute('SELECT '+select+',u.zadacha_id_istochnika,typeof(u.zadacha_id_istochnika),u.proekt_id,u.lenta_id,u.ssylka_udalena FROM uvedomlenija u ORDER BY u.id').fetchall()
        old_seq=source.execute("SELECT seq FROM sqlite_sequence WHERE name='uvedomlenija'").fetchone()
        new_seq=target.execute("SELECT seq FROM sqlite_sequence WHERE name='uvedomlenija'").fetchone()
        if expected!=actual or (old_seq or (0,))!=(new_seq or (0,)):
            raise ValueError('notification migration did not preserve original values, raw links and types')
        return {'original_notifications':len(original),'unresolved_task_links':sum(r[16] is None and r[4] is not None for r in original)}


def verify_payment_versions(before_database, after_database):
                                                                       
                                                                                
    def connect(path):
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def tables(db):return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns))
        return db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')' for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    with contextlib.closing(connect(before_database)) as old,contextlib.closing(connect(after_database)) as current:
        if tables(current)-tables(old)!={'zaprosy_platezhej'} or tables(old)-tables(current):
            raise ValueError('payment version migration changed unexpected tables')
        extra=[]
        for table in tables(old):
            columns=[r[1] for r in old.execute('PRAGMA table_info('+quote(table)+')')]
            after_columns=[r[1] for r in current.execute('PRAGMA table_info('+quote(table)+')')]
            if after_columns!=columns+(['versija'] if table in ('platezhi','akkaunty') else []):
                raise ValueError('payment version migration changed unexpected columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns)
            if table in ('versii_polej','migracii'):
                by_id={r[0]:r for r in after}
                if any(by_id.get(r[0])!=r for r in before):
                    raise ValueError('payment version migration changed historical rows: '+table)
                original_ids={r[0] for r in before}
                added=[r for r in after if r[0] not in original_ids]
                if table=='versii_polej':extra=added
                elif len(added)!=1 or added[0][columns.index('nomer')+1]!=118:
                    raise ValueError('payment version migration changed migration ledger')
            elif before!=after:
                raise ValueError('payment version migration changed original values: '+table)
        if current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():
            raise ValueError('payment version migration changed sequences')
        columns=[r[1] for r in old.execute('PRAGMA table_info(versii_polej)')]
        added=[dict(zip(columns,row[1:1+len(columns)])) for row in extra]
        expected={(table,row[0],field) for table in ('platezhi','akkaunty') for row in old.execute('SELECT id FROM '+table) for field in ('','*')}
        actual={(row['tablica'],row['obekt_id'],row['pole']) for row in added}
        if actual!=expected or len(added)!=len(expected) or any(row['versija']!=1 or row['kto'] is not None or not row['kogda'] for row in added):
            raise ValueError('payment version migration created unexpected tracking history')
        for table in ('platezhi','akkaunty'):
            if current.execute('SELECT count(*) FROM '+table+" WHERE typeof(versija)<>'integer' OR versija<>1").fetchone()[0]:
                raise ValueError('payment version migration did not establish version one')
        if current.execute('SELECT count(*) FROM zaprosy_platezhej').fetchone()[0]:
            raise ValueError('payment version migration invented payment receipts')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'added_metadata_rows':len(added),'added_receipt_rows':0}


def verify_direction_versions(before_database, after_database):
                                                                       
                                                                                
    def connect(path):
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def tables(db):return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns))
        return db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')' for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    with contextlib.closing(connect(before_database)) as old,contextlib.closing(connect(after_database)) as current:
        if tables(current)!=tables(old):
            raise ValueError('direction version migration changed unexpected tables')
        extra=[]
        for table in tables(old):
            columns=[r[1] for r in old.execute('PRAGMA table_info('+quote(table)+')')]
            after_columns=[r[1] for r in current.execute('PRAGMA table_info('+quote(table)+')')]
            if after_columns!=columns+(['versija'] if table=='napravlenija' else ['vozvrat_s'] if table=='ljudi' else []):
                raise ValueError('direction version migration changed unexpected columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns)
            if table in ('versii_polej','migracii'):
                by_id={r[0]:r for r in after}
                if any(by_id.get(r[0])!=r for r in before):
                    raise ValueError('direction version migration changed historical rows: '+table)
                original_ids={r[0] for r in before}
                added=[r for r in after if r[0] not in original_ids]
                if table=='versii_polej':extra=added
                elif len(added)!=1 or added[0][columns.index('nomer')+1]!=119:
                    raise ValueError('direction version migration changed migration ledger')
            elif before!=after:
                raise ValueError('direction version migration changed original values: '+table)
        if current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():
            raise ValueError('direction version migration changed sequences')
        columns=[r[1] for r in old.execute('PRAGMA table_info(versii_polej)')]
        added=[dict(zip(columns,row[1:1+len(columns)])) for row in extra]
        expected={(table,row[0],field) for table in ('napravlenija',) for row in old.execute('SELECT kod FROM '+table) for field in ('','*')}
        actual={(row['tablica'],row['obekt_id'],row['pole']) for row in added}
        if actual!=expected or len(added)!=len(expected) or any(row['versija']!=1 or row['kto'] is not None or not row['kogda'] for row in added):
            raise ValueError('direction version migration created unexpected tracking history')
        for table in ('napravlenija',):
            if current.execute('SELECT count(*) FROM '+table+" WHERE typeof(versija)<>'integer' OR versija<>1").fetchone()[0]:
                raise ValueError('direction version migration did not establish version one')
        if current.execute('SELECT count(*) FROM ljudi WHERE vozvrat_s IS NOT NULL').fetchone()[0]:
            raise ValueError('direction version migration invented old archive return dates')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'added_metadata_rows':len(added)}


def verify_template_steps(before_database, after_database, root):
    def connect(path):
        wal=Path(str(path)+'-wal')
        if wal.exists() and wal.stat().st_size:raise ValueError('template migration proof requires a closed standalone snapshot, not an active WAL')
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def tables(db):return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns))
        return db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')' for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    with contextlib.closing(connect(before_database)) as old,contextlib.closing(connect(after_database)) as current:
        if tables(current)-tables(old)!={'zaprosy_shablonov'} or tables(old)-tables(current):raise ValueError('template migration changed unexpected tables')
        extra=[];rows_retained=0
        for table in tables(old):
            columns=[r[1] for r in old.execute('PRAGMA table_info('+quote(table)+')')]
            if columns!=[r[1] for r in current.execute('PRAGMA table_info('+quote(table)+')')]:raise ValueError('template migration changed columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns);rows_retained+=len(before)
            if table in ('versii_polej','migracii'):
                by_id={r[0]:r for r in after}
                if any(by_id.get(r[0])!=r for r in before):raise ValueError('template migration changed historical rows: '+table)
                ids={r[0] for r in before};added=[r for r in after if r[0] not in ids]
                if table=='versii_polej':extra=[dict(zip(columns,r[1:1+len(columns)])) for r in added]
                elif len(added)!=1 or added[0][columns.index('nomer')+1]!=122:raise ValueError('template migration changed ledger')
            elif before!=after:raise ValueError('template migration changed original values: '+table)
        expected={(r[0],r[1]) for r in old.execute("SELECT s.id,s.versija FROM shablony s WHERE NOT EXISTS (SELECT 1 FROM versii_polej v WHERE v.tablica='shablony' AND v.obekt_id=s.id AND v.pole='podzadachi')")}
        if {(r['obekt_id'],r['versija']) for r in extra}!=expected or len(extra)!=len(expected) or any(r['tablica']!='shablony' or r['pole']!='podzadachi' or r['kto'] is not None or not r['kogda'] for r in extra):raise ValueError('template migration invented field history')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('template migration changed sequences')
        if current.execute('SELECT count(*) FROM zaprosy_shablonov').fetchone()[0]:raise ValueError('template migration invented receipts')
        filename='122-zaprosy-shablonov.sql';digest=sha(root/'db/migracii'/filename)
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=122').fetchone()!=(filename,digest):raise ValueError('template migration digest mismatch')
        migration_time=dt.datetime.fromisoformat(current.execute('SELECT nakacheno FROM migracii WHERE nomer=122').fetchone()[0].replace('Z','+00:00'))
        if migration_time.tzinfo is None:migration_time=migration_time.replace(tzinfo=dt.timezone.utc)
        for row in extra:
            recorded=dt.datetime.fromisoformat(row['kogda'].replace('Z','+00:00'))
            if recorded.tzinfo is None:recorded=recorded.replace(tzinfo=dt.timezone.utc)
            if abs((recorded-migration_time).total_seconds())>120:raise ValueError('template metadata time differs from the migration')
        schema=lambda db:{(r[0],r[1]):r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
        previous=schema(old);actual=schema(current)
        replacements={('trigger','versii_shablony_insert')};added_objects={('table','zaprosy_shablonov')}|{('trigger','versii_shablon_shagi_'+x) for x in ['insert','update','delete']}
        if set(actual)-set(previous)!=added_objects or set(previous)-set(actual):raise ValueError('template migration changed unrelated schema objects')
        if any(actual[key]!=row for key,row in previous.items() if key not in replacements):raise ValueError('template migration changed unrelated schema')
                                                                              
                                                                             
                                                                     
        with tempfile.TemporaryDirectory(prefix='locus-template-schema-') as folder:
            proof=Path(folder)/'expected.db'
            program="require('./db/migrate.js');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.LOCUS_BAZA,{readOnly:true});console.log(JSON.stringify(db.prepare(\"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'\").all()));db.close();"
            compiled=subprocess.run(['node','-e',program],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(proof)),capture_output=True,text=True,check=True,timeout=30)
            expected_schema={(r['type'],r['name']):(r['type'],r['name'],r['tbl_name'],r['sql']) for r in json.loads(compiled.stdout.splitlines()[-1])}
            if any(actual.get(key)!=expected_schema.get(key) for key in added_objects|replacements):raise ValueError('template migration declarations differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':rows_retained,'added_metadata_rows':len(extra),'added_receipt_rows':0,'exact_template_schema_verified':True}


def _verify_project_receipt_migration(before_database, after_database, root, number, table_name, filename, source_table="proekty"):
    def connect(path):
        wal=Path(str(path)+'-wal')
        if wal.exists() and wal.stat().st_size:raise ValueError('project migration proof requires a closed standalone snapshot')
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def tables(db):return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns))
        return db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')' for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    with contextlib.closing(connect(before_database)) as old,contextlib.closing(connect(after_database)) as current:
        if tables(current)-tables(old)!={table_name} or tables(old)-tables(current):raise ValueError('project migration changed unexpected tables')
        total=0
        for table in tables(old):
            columns=[r[1] for r in old.execute('PRAGMA table_info('+quote(table)+')')]
            if columns!=[r[1] for r in current.execute('PRAGMA table_info('+quote(table)+')')]:raise ValueError('project migration changed columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns);total+=len(before)
            if table=='migracii':
                prior={r[0]:r for r in before};actual={r[0]:r for r in after}
                if any(actual.get(k)!=v for k,v in prior.items()) or set(actual)-set(prior)!={number}:raise ValueError('project migration changed historical ledger')
            elif before!=after:raise ValueError('project migration changed original values: '+table)
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('project migration changed sequences')
        if current.execute('SELECT count(*) FROM '+quote(table_name)).fetchone()[0]:raise ValueError('project migration invented receipts')
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=?',(number,)).fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('project migration digest mismatch')
        schema=lambda db:{(r[0],r[1]):r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
        previous=schema(old);actual=schema(current);replacements={('trigger','versii_'+source_table+'_delete')};added={('table',table_name)}
        if set(actual)-set(previous)!=added or set(previous)-set(actual):raise ValueError('project migration changed unrelated schema objects')
        if any(actual[key]!=row for key,row in previous.items() if key not in replacements):raise ValueError('project migration changed unrelated schema')
        with tempfile.TemporaryDirectory(prefix='locus-project-schema-') as folder:
            program="require('./db/migrate.js');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.LOCUS_BAZA,{readOnly:true});console.log(JSON.stringify(db.prepare(\"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'\").all()));db.close();"
            compiled=subprocess.run(['node','-e',program],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(Path(folder)/'expected.db')),capture_output=True,text=True,check=True,timeout=30)
            expected={(r['type'],r['name']):(r['type'],r['name'],r['tbl_name'],r['sql']) for r in json.loads(compiled.stdout.splitlines()[-1])}
            if any(actual.get(key)!=expected.get(key) for key in added|replacements):raise ValueError('project migration declarations differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'added_receipt_rows':0,'exact_project_schema_verified':True}


def verify_project_receipts(before_database, after_database, root):
    return _verify_project_receipt_migration(before_database,after_database,root,123,'zaprosy_proektov','123-zaprosy-proektov.sql')


def verify_project_edit_receipts(before_database, after_database, root):
    return {**_verify_project_receipt_migration(before_database,after_database,root,124,'zaprosy_pravok_proektov','124-zaprosy-pravok-proektov.sql'),'exact_project_edit_schema_verified':True}


def verify_project_action_receipts(before_database, after_database, root):
    return {**_verify_project_receipt_migration(before_database,after_database,root,125,'zaprosy_dejstvij_proektov','125-zaprosy-dejstvij-proektov.sql'),'exact_project_action_schema_verified':True}


def verify_referral_payout_receipts(before_database, after_database, root):
    proof=_verify_project_receipt_migration(before_database,after_database,root,127,'zaprosy_vyplat_referalam','127-zaprosy-vyplat-referalam.sql',source_table='sotrudnichestva')
    proof.pop('exact_project_schema_verified',None)
    return {**proof,'exact_referral_payout_schema_verified':True}

def verify_referral_terms_receipts(before_database, after_database, root):
    proof=_verify_project_receipt_migration(before_database,after_database,root,128,'zaprosy_uslovij_referalov','128-zaprosy-uslovij-referalov.sql',source_table='sotrudnichestva')
    proof.pop('exact_project_schema_verified',None)
    return {**proof,'exact_referral_terms_schema_verified':True}


def verify_focus_state(before_database, after_database, root):
    def connect(path):
        wal=Path(str(path)+'-wal')
        if wal.exists()and wal.stat().st_size:raise ValueError('focus migration proof requires a closed standalone snapshot')
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def schema(db):return {(r[0],r[1]):r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns));return db.execute('SELECT rowid,'+','.join(names+['typeof('+name+')'for name in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    columns_added=['pauza_s','pauza_ms','versija','identifikator'];filename='131-fokus-state.sql'
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        previous=schema(old);actual=schema(current);added={('table','zaprosy_fokusa')};changed=('table','fokus_sessii')
        if set(actual)-set(previous)!=added or set(previous)-set(actual):raise ValueError('focus migration changed unrelated schema objects')
        if any(actual[key]!=row for key,row in previous.items()if key!=changed):raise ValueError('focus migration changed original schema')
        total=0
        for kind,table in previous:
            if kind!='table':continue
            columns=[r[1]for r in old.execute('PRAGMA table_info('+quote(table)+')')]
            after_columns=[r[1]for r in current.execute('PRAGMA table_info('+quote(table)+')')]
            if after_columns!=columns+(columns_added if table=='fokus_sessii'else[]):raise ValueError('focus migration changed columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns);total+=len(before)
            if table=='migracii':
                prior={r[0]:r for r in before};now={r[0]:r for r in after}
                if any(now.get(k)!=v for k,v in prior.items())or set(now)-set(prior)!={131}:raise ValueError('focus migration changed historical ledger')
            elif before!=after:raise ValueError('focus migration changed original values: '+table)
        if current.execute('SELECT count(*) FROM fokus_sessii WHERE pauza_s IS NOT NULL OR pauza_ms<>0 OR versija<>1 OR identifikator IS NOT NULL').fetchone()[0]:raise ValueError('focus migration invented past pause state or identities')
        if current.execute('SELECT count(*) FROM zaprosy_fokusa').fetchone()[0]:raise ValueError('focus migration invented receipts')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('focus migration changed sequences')
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=131').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('focus migration digest mismatch')
        migration=(root/'db/migracii'/filename).read_text();alter=migration[:migration.index('CREATE TABLE')]
                                                                                
                                                                               
        program="const{DatabaseSync}=require('node:sqlite');const p=JSON.parse(require('node:fs').readFileSync(0,'utf8'));const db=new DatabaseSync(':memory:');db.exec(p.original);db.exec(p.alter);console.log(JSON.stringify(db.prepare(\"SELECT sql FROM sqlite_master WHERE name='fokus_sessii'\").get().sql));db.close();"
        expected_sql=json.loads(subprocess.run(['node','-e',program],cwd=root,input=json.dumps({'original':previous[changed][3],'alter':alter}),capture_output=True,text=True,check=True,timeout=30).stdout)
        if actual[changed][3]!=expected_sql:raise ValueError('focus migration changed unsupported table constraints')
        with tempfile.TemporaryDirectory(prefix='locus-focus-schema-')as folder:
            file=Path(folder)/'expected.db';subprocess.run(['node','db/migrate.js'],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(file)),capture_output=True,text=True,check=True,timeout=30)
            with contextlib.closing(connect(file))as fresh:
                expected=schema(fresh)
                if actual[('table','zaprosy_fokusa')]!=expected[('table','zaprosy_fokusa')]:raise ValueError('focus receipt declaration differs from source')
                fields=lambda db:{r[1]:r[1:]for r in db.execute('PRAGMA table_info(fokus_sessii)')}
                now_fields=fields(current);fresh_fields=fields(fresh)
                if any(now_fields[name]!=fresh_fields[name]for name in columns_added):raise ValueError('focus state declarations differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'old_focus_sessions_retained':old.execute('SELECT count(*) FROM fokus_sessii').fetchone()[0],'all_original_schema_objects_preserved_except_focus_append':True,'past_pause_times_not_invented':True,'old_session_identities_unknown':True,'added_receipt_rows':0,'exact_focus_state_schema_verified':True}


def verify_focus_expiry(before_database, after_database, root):
    proof=_verify_project_receipt_migration(before_database,after_database,root,132,'zavershenija_fokusa','132-zavershenija-fokusa.sql',source_table='fokus_sessii')
    with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro&immutable=1',uri=True))as old,contextlib.closing(sqlite3.connect(after_database.as_uri()+'?mode=ro&immutable=1',uri=True))as current:
        for row in old.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"):
            if current.execute('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type=? AND name=?',row[:2]).fetchone()!=row:raise ValueError('focus expiry migration changed original schema')
    proof.pop('exact_project_schema_verified',None)
    return {**proof,'exact_focus_expiry_schema_verified':True,'imported_sessions_not_expired':True}


def verify_campaign_state(before_database, after_database, root):
    def connect(path):
        wal=Path(str(path)+'-wal')
        if wal.exists()and wal.stat().st_size:raise ValueError('campaign migration proof requires closed standalone snapshots')
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def schema(db):return {(r[0],r[1]):r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
    def values(db,table):
        names=[quote(r[1])for r in db.execute('PRAGMA table_info('+quote(table)+')')]
        return db.execute('SELECT rowid,'+','.join(names+['typeof('+name+')'for name in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    tables={'plany_kampanij','porjadki_voln','zaprosy_kampanij'};filename='135-plany-kampanij.sql'
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        previous=schema(old);actual=schema(current);added={('table',name)for name in tables}|{('trigger','zaprosy_kampanij_delete')}
        if set(actual)-set(previous)!=added or set(previous)-set(actual):raise ValueError('campaign migration changed unrelated schema objects')
        if any(actual[key]!=row for key,row in previous.items()):raise ValueError('campaign migration changed original schema')
        total=0
        for kind,table in previous:
            if kind!='table':continue
            before=values(old,table);after=values(current,table);total+=len(before)
            if table=='migracii':
                prior={r[0]:r for r in before};now={r[0]:r for r in after}
                if any(now.get(k)!=v for k,v in prior.items())or set(now)-set(prior)!={135}:raise ValueError('campaign migration changed historical ledger')
            elif before!=after:raise ValueError('campaign migration changed original values or types: '+table)
        for table in tables:
            if current.execute('SELECT count(*) FROM '+table).fetchone()[0]:raise ValueError('campaign migration invented recipients, statuses or receipts')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('campaign migration changed sequences')
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=135').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('campaign migration digest mismatch')
        with tempfile.TemporaryDirectory(prefix='locus-campaign-schema-')as folder:
            file=Path(folder)/'expected.db';subprocess.run(['node','db/migrate.js'],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(file)),capture_output=True,text=True,check=True,timeout=30)
            with contextlib.closing(connect(file))as fresh:
                expected=schema(fresh)
                if any(actual[key]!=expected[key]for key in added):raise ValueError('campaign schema declarations differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'all_original_schema_objects_preserved':True,'added_plan_rows':0,'added_order_rows':0,'added_receipt_rows':0,'historical_targets_and_order_not_invented':True,'exact_campaign_state_schema_verified':True}


def verify_broadcast_state(before_database, after_database, root):
    def connect(path):
        wal=Path(str(path)+'-wal')
        if wal.exists()and wal.stat().st_size:raise ValueError('broadcast migration proof requires closed standalone snapshots')
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def schema(db):return {(r[0],r[1]):r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
    def values(db,table):
        names=[quote(r[1])for r in db.execute('PRAGMA table_info('+quote(table)+')')]
        return db.execute('SELECT rowid,'+','.join(names+['typeof('+name+')'for name in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    tables={'sostavy_voln','uchastniki_voln','zaprosy_rassylok'};filename='134-sostavy-voln.sql'
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        previous=schema(old);actual=schema(current);added={('table',name)for name in tables}
        if set(actual)-set(previous)!=added or set(previous)-set(actual):raise ValueError('broadcast migration changed unrelated schema objects')
        if any(actual[key]!=row for key,row in previous.items()):raise ValueError('broadcast migration changed original schema')
        total=0
        for kind,table in previous:
            if kind!='table':continue
            before=values(old,table);after=values(current,table);total+=len(before)
            if table=='migracii':
                prior={r[0]:r for r in before};now={r[0]:r for r in after}
                if any(now.get(k)!=v for k,v in prior.items())or set(now)-set(prior)!={134}:raise ValueError('broadcast migration changed historical ledger')
            elif before!=after:raise ValueError('broadcast migration changed original values or types: '+table)
        for table in tables:
            if current.execute('SELECT count(*) FROM '+table).fetchone()[0]:raise ValueError('broadcast migration invented recipients, statuses or receipts')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('broadcast migration changed sequences')
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=134').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('broadcast migration digest mismatch')
        with tempfile.TemporaryDirectory(prefix='locus-broadcast-schema-')as folder:
            file=Path(folder)/'expected.db';subprocess.run(['node','db/migrate.js'],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(file)),capture_output=True,text=True,check=True,timeout=30)
            with contextlib.closing(connect(file))as fresh:
                expected=schema(fresh)
                if any(actual[key]!=expected[key]for key in added):raise ValueError('broadcast schema declarations differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'all_original_schema_objects_preserved':True,'added_snapshot_rows':0,'added_recipient_rows':0,'added_receipt_rows':0,'historical_rosters_not_invented':True,'exact_broadcast_state_schema_verified':True}


def verify_feed_state(before_database, after_database, root):
    def connect(path):
        wal=Path(str(path)+'-wal')
        if wal.exists()and wal.stat().st_size:raise ValueError('feed migration proof requires a closed standalone snapshot')
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def schema(db):return {(r[0],r[1]):r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns));return db.execute('SELECT rowid,'+','.join(names+['typeof('+name+')'for name in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    columns_added=['versija'];filename='133-zaprosy-lenty.sql'
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        previous=schema(old);actual=schema(current);added={('table','zaprosy_lenty'),('trigger','zaprosy_lenty_delete')};changed=('table','lenta')
        if set(actual)-set(previous)!=added or set(previous)-set(actual):raise ValueError('feed migration changed unrelated schema objects')
        if any(actual[key]!=row for key,row in previous.items()if key!=changed):raise ValueError('feed migration changed original schema')
        total=0
        for kind,table in previous:
            if kind!='table':continue
            columns=[r[1]for r in old.execute('PRAGMA table_info('+quote(table)+')')]
            after_columns=[r[1]for r in current.execute('PRAGMA table_info('+quote(table)+')')]
            if after_columns!=columns+(columns_added if table=='lenta'else[]):raise ValueError('feed migration changed columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns);total+=len(before)
            if table=='migracii':
                prior={r[0]:r for r in before};now={r[0]:r for r in after}
                if any(now.get(k)!=v for k,v in prior.items())or set(now)-set(prior)!={133}:raise ValueError('feed migration changed historical ledger')
            elif before!=after:raise ValueError('feed migration changed original values: '+table)
        if current.execute('SELECT count(*) FROM lenta WHERE versija<>1').fetchone()[0]:raise ValueError('feed migration invented prior message versions')
        if current.execute('SELECT count(*) FROM zaprosy_lenty').fetchone()[0]:raise ValueError('feed migration invented receipts')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('feed migration changed sequences')
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=133').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('feed migration digest mismatch')
        migration=(root/'db/migracii'/filename).read_text();alter=migration[:migration.index('CREATE TABLE')]
                                                                          
                                                                               
        program="const{DatabaseSync}=require('node:sqlite');const p=JSON.parse(require('node:fs').readFileSync(0,'utf8'));const db=new DatabaseSync(':memory:');db.exec(p.original);db.exec(p.alter);console.log(JSON.stringify(db.prepare(\"SELECT sql FROM sqlite_master WHERE name='lenta'\").get().sql));db.close();"
        expected_sql=json.loads(subprocess.run(['node','-e',program],cwd=root,input=json.dumps({'original':previous[changed][3],'alter':alter}),capture_output=True,text=True,check=True,timeout=30).stdout)
        if actual[changed][3]!=expected_sql:raise ValueError('feed migration changed unsupported table constraints')
        with tempfile.TemporaryDirectory(prefix='locus-feed-schema-')as folder:
            file=Path(folder)/'expected.db';subprocess.run(['node','db/migrate.js'],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(file)),capture_output=True,text=True,check=True,timeout=30)
            with contextlib.closing(connect(file))as fresh:
                expected=schema(fresh)
                if any(actual[key]!=expected[key]for key in added):raise ValueError('feed receipt or deletion trigger declaration differs from source')
                fields=lambda db:{r[1]:r[1:]for r in db.execute('PRAGMA table_info(lenta)')}
                now_fields=fields(current);fresh_fields=fields(fresh)
                if any(now_fields[name]!=fresh_fields[name]for name in columns_added):raise ValueError('message version declaration differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'old_messages_retained':old.execute('SELECT count(*) FROM lenta').fetchone()[0],'all_original_schema_objects_preserved_except_message_append':True,'old_message_version_boundary_is_one':True,'added_receipt_rows':0,'exact_feed_state_schema_verified':True}


def verify_referral_payout_links(before_database, after_database, root):
    proof=_verify_project_receipt_migration(before_database,after_database,root,130,'referalnye_svjazi_vyplat','130-referalnye-svjazi-vyplat.sql',source_table='zadachi')
                                                                           
    with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro&immutable=1',uri=True))as old,contextlib.closing(sqlite3.connect(after_database.as_uri()+'?mode=ro&immutable=1',uri=True))as current:
        for row in old.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"):
            if current.execute('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type=? AND name=?',row[:2]).fetchone()!=row:raise ValueError('payout link migration changed original schema')
    proof.pop('exact_project_schema_verified',None);proof.pop('added_receipt_rows',None)
    return {**proof,'added_allocation_rows':0,'all_original_schema_objects_preserved':True,'exact_referral_payout_link_schema_verified':True}


def verify_referral_tasks(before_database, after_database, root):
    def connect(path):
        wal=Path(str(path)+'-wal')
        if wal.exists() and wal.stat().st_size:raise ValueError('referral tasks proof requires a closed standalone snapshot')
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def schema(db):return {(r[0],r[1]):r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns));return db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')'for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    added_tables={'referalnye_zadachi','zaprosy_referalnyh_zadach'}
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        previous=schema(old);actual=schema(current)
        added={('table',name)for name in added_tables}
        changed={('table','napravlenija'),('trigger','versii_napravlenija_update'),('trigger','versii_zadachi_delete'),('trigger','versii_sotrudnichestva_delete')}
        if set(actual)-set(previous)!=added or set(previous)-set(actual):raise ValueError('referral tasks migration changed unrelated schema objects')
        if any(actual[key]!=row for key,row in previous.items()if key not in changed):raise ValueError('referral tasks migration changed unrelated schema')
        total=0
        for kind,table in previous:
            if kind!='table':continue
            columns=[r[1]for r in old.execute('PRAGMA table_info('+quote(table)+')')]
            new_columns=[r[1]for r in current.execute('PRAGMA table_info('+quote(table)+')')]
            if new_columns!=columns+(['veduschij_id']if table=='napravlenija'else[]):raise ValueError('referral tasks migration changed columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns);total+=len(before)
            if table=='migracii':
                prior={r[0]:r for r in before};now={r[0]:r for r in after}
                if any(now.get(k)!=v for k,v in prior.items())or set(now)-set(prior)!={129}:raise ValueError('referral tasks migration changed historical ledger')
            elif before!=after:raise ValueError('referral tasks migration changed original values: '+table)
        if current.execute('SELECT count(*) FROM napravlenija WHERE veduschij_id IS NOT NULL').fetchone()[0]:raise ValueError('referral tasks migration invented direction leads')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('referral tasks migration changed sequences')
        if any(current.execute('SELECT count(*) FROM '+quote(table)).fetchone()[0]for table in added_tables):raise ValueError('referral tasks migration invented tasks or receipts')
        filename='129-referalnye-zadachi.sql'
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=129').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('referral tasks migration digest mismatch')
        with tempfile.TemporaryDirectory(prefix='locus-referral-tasks-schema-')as folder:
            expected_file=Path(folder)/'expected.db'
            subprocess.run(['node','db/migrate.js'],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(expected_file)),capture_output=True,text=True,check=True,timeout=30)
            with contextlib.closing(connect(expected_file))as fresh:
                expected=schema(fresh)
                if any(actual.get(key)!=expected.get(key)for key in added|changed if key!=('table','napravlenija')):raise ValueError('referral tasks declarations differ from source')
                for pragma in ['table_info','foreign_key_list']:
                    actual_fields=current.execute('PRAGMA '+pragma+'(napravlenija)').fetchall();expected_fields=fresh.execute('PRAGMA '+pragma+'(napravlenija)').fetchall()
                                                                                      
                    if pragma=='table_info':actual_fields=sorted(r[1:]for r in actual_fields);expected_fields=sorted(r[1:]for r in expected_fields)
                    if actual_fields!=expected_fields:raise ValueError('direction lead declaration differs from source: '+pragma)
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'added_task_context_rows':0,'added_receipt_rows':0,'invented_direction_leads':0,'exact_referral_tasks_schema_verified':True}


def verify_service_receipts(before_database, after_database, root):
    def connect(path):
        wal=Path(str(path)+'-wal')
        if wal.exists() and wal.stat().st_size:raise ValueError('service migration proof requires a closed standalone snapshot')
        return sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def schema(db):return {(r[0],r[1]):r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns));return db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')'for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    table_name='zaprosy_dejstvij_uslug';filename='126-uslugi-i-zaprosy.sql'
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        old_schema=schema(old);actual=schema(current);old_tables={r[1]for r in old_schema.values()if r[0]=='table'};new_tables={r[1]for r in actual.values()if r[0]=='table'}
        if new_tables-old_tables!={table_name}or old_tables-new_tables:raise ValueError('service migration changed unexpected tables')
        total=0
        for table in old_tables:
            columns=[r[1]for r in old.execute('PRAGMA table_info('+quote(table)+')')];now=[r[1]for r in current.execute('PRAGMA table_info('+quote(table)+')')]
            expected=columns+['arhiv_s','vozvrat_s']if table=='uslugi'else columns
            if now!=expected:raise ValueError('service migration changed unexpected columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns);total+=len(before)
            if table=='migracii':
                prior={r[0]:r for r in before};present={r[0]:r for r in after}
                if any(present.get(k)!=v for k,v in prior.items())or set(present)-set(prior)!={126}:raise ValueError('service migration changed historical ledger')
            elif before!=after:raise ValueError('service migration changed original values or types: '+table)
        if current.execute('SELECT count(*) FROM uslugi WHERE arhiv_s IS NOT NULL OR vozvrat_s IS NOT NULL').fetchone()[0]:raise ValueError('service migration invented archive dates')
        if current.execute('SELECT count(*) FROM '+table_name).fetchone()[0]:raise ValueError('service migration invented receipts')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('service migration changed sequences')
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=126').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('service migration digest mismatch')
        replaced={('table','uslugi'),*[('trigger','versii_uslugi_'+action)for action in ['insert','update','delete']]};added={('table',table_name)}
        if set(actual)-set(old_schema)!=added or set(old_schema)-set(actual):raise ValueError('service migration changed unrelated schema objects')
        if any(actual[k]!=v for k,v in old_schema.items()if k not in replaced):raise ValueError('service migration changed unrelated schema')
        with contextlib.closing(sqlite3.connect(':memory:'))as expected:
            expected.executescript(old_schema[('table','uslugi')][3]);expected.executescript('ALTER TABLE uslugi ADD COLUMN arhiv_s TEXT;ALTER TABLE uslugi ADD COLUMN vozvrat_s TEXT;')
            if schema(expected)[('table','uslugi')]!=actual[('table','uslugi')]:raise ValueError('service columns differ from exact declared additions')
        with tempfile.TemporaryDirectory(prefix='locus-service-schema-')as folder:
            program="require('./db/migrate.js');const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.LOCUS_BAZA,{readOnly:true});console.log(JSON.stringify(db.prepare(\"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'\").all()));db.close();"
            compiled=subprocess.run(['node','-e',program],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(Path(folder)/'expected.db')),capture_output=True,text=True,check=True,timeout=30)
            expected={(r['type'],r['name']):(r['type'],r['name'],r['tbl_name'],r['sql'])for r in json.loads(compiled.stdout.splitlines()[-1])}
            if any(actual.get(k)!=expected.get(k)for k in(added|replaced)-{('table','uslugi')}):raise ValueError('service migration declarations differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'added_receipt_rows':0,'added_columns':{'uslugi':['arhiv_s','vozvrat_s']},'historical_archive_dates_remain_unknown':True,'exact_service_schema_verified':True}


def verify_strategy_state(before_database, after_database, root):
    def connect(file):
        wal=Path(str(file)+'-wal')
        if wal.exists() and wal.stat().st_size:raise ValueError('strategy proof requires a closed standalone snapshot')
        return sqlite3.connect(file.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def tables(db):return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    def values(db,table,columns):
        names=list(map(quote,columns))
        return db.execute('SELECT rowid,'+','.join(names+['typeof('+name+')'for name in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    def schema(db):return db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall()
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        if tables(current)-tables(old)!={'zaprosy_strategii'} or tables(old)-tables(current):raise ValueError('strategy migration changed unrelated tables')
        total=0;extra=[]
        for table in tables(old):
            columns=[r[1]for r in old.execute('PRAGMA table_info('+quote(table)+')')]
            actual_columns=[r[1]for r in current.execute('PRAGMA table_info('+quote(table)+')')]
            if actual_columns!=columns+(['udaleno','versija']if table=='tezisy'else []):raise ValueError('strategy migration changed columns: '+table)
            before=values(old,table,columns);after=values(current,table,columns);total+=len(before)
            if table in ('migracii','versii_polej'):
                old_ids={r[0]for r in before};added=[r for r in after if r[0]not in old_ids]
                if [r for r in after if r[0]in old_ids]!=before:raise ValueError('strategy migration changed prior metadata: '+table)
                if table=='migracii':
                    if len(added)!=1 or added[0][columns.index('nomer')+1]!=143:raise ValueError('strategy migration changed ledger')
                else:extra=[dict(zip(columns,row[1:1+len(columns)]))for row in added]
            elif before!=after:raise ValueError('strategy migration changed original values: '+table)
        expected={(r[0],field)for r in old.execute('SELECT id FROM tezisy')for field in ('','*')}
        if len(extra)!=len(expected)or {(r['obekt_id'],r['pole'])for r in extra}!=expected or any(r['tablica']!='tezisy' or r['versija']!=1 or r['kto']is not None or not r['kogda']for r in extra):raise ValueError('strategy migration invented field history')
        if current.execute('SELECT count(*) FROM tezisy WHERE udaleno<>0 OR versija<>1').fetchone()[0]:raise ValueError('strategy migration changed initial thesis state')
        if current.execute('SELECT count(*) FROM zaprosy_strategii').fetchone()[0]:raise ValueError('strategy migration invented receipts')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('strategy migration changed sequences')
        filename='143-tezisy-strategii.sql'
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=143').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('strategy migration digest differs from source')
        migration_time=dt.datetime.fromisoformat(current.execute('SELECT nakacheno FROM migracii WHERE nomer=143').fetchone()[0].replace('Z','+00:00'))
        if migration_time.tzinfo is None:migration_time=migration_time.replace(tzinfo=dt.timezone.utc)
        for row in extra:
            recorded=dt.datetime.fromisoformat(row['kogda'].replace('Z','+00:00'))
            if recorded.tzinfo is None:recorded=recorded.replace(tzinfo=dt.timezone.utc)
            if abs((recorded-migration_time).total_seconds())>120:raise ValueError('strategy metadata time differs from migration')
                                                                              
                                                                              
        with tempfile.TemporaryDirectory(prefix='locus-strategy-schema-')as folder:
            expected_file=Path(folder)/'expected.db';shutil.copyfile(before_database,expected_file);expected_file.chmod(0o600)
            subprocess.run(['node','db/migrate.js'],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(expected_file)),capture_output=True,text=True,check=True,timeout=30)
            with contextlib.closing(connect(expected_file))as compiled:
                if schema(current)!=schema(compiled):raise ValueError('strategy migration declarations differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'added_metadata_rows':len(extra),'added_receipt_rows':0,'exact_strategy_schema_verified':True}


def verify_goal_edit_state(before_database, after_database, root):
    def connect(file):
        wal=Path(str(file)+'-wal')
        if wal.exists() and wal.stat().st_size:raise ValueError('goal edit proof requires a closed standalone snapshot')
        return sqlite3.connect(file.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def tables(db):return {r[0]for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    def rows(db,table):
        columns=[r[1]for r in db.execute('PRAGMA table_info('+quote(table)+')')]
        names=list(map(quote,columns))
        return columns,db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')'for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    def schema(db):return db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall()
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        if tables(current)-tables(old)!={'zaprosy_pravok_celej'} or tables(old)-tables(current):raise ValueError('goal edit migration changed unrelated tables')
        total=0
        for table in tables(old):
            columns,before=rows(old,table);actual_columns,after=rows(current,table);total+=len(before)
            if actual_columns!=columns:raise ValueError('goal edit migration changed original columns: '+table)
            if table=='migracii':
                ids={r[0]for r in before};added=[r for r in after if r[0]not in ids]
                if [r for r in after if r[0]in ids]!=before or len(added)!=1 or added[0][columns.index('nomer')+1]!=144:raise ValueError('goal edit migration changed ledger')
            elif before!=after:raise ValueError('goal edit migration changed original values: '+table)
        if current.execute('SELECT count(*) FROM zaprosy_pravok_celej').fetchone()[0]:raise ValueError('goal edit migration invented receipts')
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('goal edit migration changed sequences')
        filename='144-pravki-celej.sql'
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=144').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('goal edit migration digest differs from source')
        with tempfile.TemporaryDirectory(prefix='locus-goal-edit-schema-')as folder:
            expected_file=Path(folder)/'expected.db';shutil.copyfile(before_database,expected_file);expected_file.chmod(0o600)
            subprocess.run(['node','db/migrate.js'],cwd=root,env=dict(os.environ,LOCUS_BAZA=str(expected_file)),capture_output=True,text=True,check=True,timeout=30)
            with contextlib.closing(connect(expected_file))as compiled:
                if schema(current)!=schema(compiled):raise ValueError('goal edit migration declarations differ from source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'added_receipt_rows':0,'exact_goal_edit_schema_verified':True}


def verify_period_plan_state(before_database, after_database, root):
    def connect(file):
        wal=Path(str(file)+'-wal')
        if wal.exists() and wal.stat().st_size:raise ValueError('period plan proof requires a standalone snapshot')
        return sqlite3.connect(file.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def tables(db):return {r[0]for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    def values(db,table):
        columns=[r[1]for r in db.execute('PRAGMA table_info('+quote(table)+')')]
        names=list(map(quote,columns))
        return columns,db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')'for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    def schema(db):return db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall()
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        added_tables={'plany_periodov_okr','zaprosy_planov_okr'}
        if tables(current)-tables(old)!=added_tables or tables(old)-tables(current):raise ValueError('period plan migration changed unrelated tables')
        total=0
        for table in tables(old):
            columns,before=values(old,table);actual_columns,after=values(current,table);total+=len(before)
            if columns!=actual_columns:raise ValueError('period plan migration changed columns: '+table)
            if table=='migracii':
                ids={r[0]for r in before};extra=[r for r in after if r[0]not in ids]
                if [r for r in after if r[0]in ids]!=before or len(extra)!=1 or extra[0][columns.index('nomer')+1]!=145:raise ValueError('period plan migration changed ledger')
            elif before!=after:raise ValueError('period plan migration changed original values: '+table)
        for table in added_tables:
            if current.execute('SELECT count(*) FROM '+quote(table)).fetchone()[0]:raise ValueError('period plan migration invented rows: '+table)
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('period plan migration changed sequences')
        filename='145-plany-periodov-okr.sql'
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=145').fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('period plan migration digest differs from source')
        with tempfile.TemporaryDirectory(prefix='locus-period-plan-schema-')as folder:
            file=Path(folder)/'expected.db';shutil.copyfile(before_database,file)
            with contextlib.closing(sqlite3.connect(file))as compiled:
                compiled.executescript((root/'db/schema.sql').read_text())
                compiled.executescript((root/'db/migracii'/filename).read_text())
                if schema(current)!=schema(compiled):raise ValueError('period plan schema differs from approved source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'added_tables':sorted(added_tables),'added_business_rows':0,'added_receipt_rows':0,'exact_period_plan_schema_verified':True,'migrations':1}



def verify_empty_receipt_state(before_database, after_database, root, number, table_name, filename, schema_flag):
    def connect(file):
        wal=Path(str(file)+'-wal')
        if wal.exists() and wal.stat().st_size:raise ValueError('weekly snapshot receipt proof requires a standalone snapshot')
        return sqlite3.connect(file.as_uri()+'?mode=ro&immutable=1',uri=True)
    def quote(name):return '"'+name.replace('"','""')+'"'
    def tables(db):return {r[0]for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    def values(db,table):
        columns=[r[1]for r in db.execute('PRAGMA table_info('+quote(table)+')')]
        names=list(map(quote,columns))
        return columns,db.execute('SELECT rowid,'+','.join(names+['typeof('+n+')'for n in names])+' FROM '+quote(table)+' ORDER BY rowid').fetchall()
    def schema(db):return db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall()
    with contextlib.closing(connect(before_database))as old,contextlib.closing(connect(after_database))as current:
        added_tables={table_name} if isinstance(table_name,str) else set(table_name)
        if tables(current)-tables(old)!=added_tables or tables(old)-tables(current):raise ValueError('weekly snapshot receipt migration changed unrelated tables')
        total=0
        for table in tables(old):
            columns,before=values(old,table);actual_columns,after=values(current,table);total+=len(before)
            if columns!=actual_columns:raise ValueError('weekly snapshot receipt migration changed columns: '+table)
            if table=='migracii':
                ids={r[0]for r in before};extra=[r for r in after if r[0]not in ids]
                if [r for r in after if r[0]in ids]!=before or len(extra)!=1 or extra[0][columns.index('nomer')+1]!=number:raise ValueError('weekly snapshot receipt migration changed ledger')
            elif before!=after:raise ValueError('weekly snapshot receipt migration changed original values: '+table)
        for table in added_tables:
            if current.execute('SELECT count(*) FROM '+quote(table)).fetchone()[0]:raise ValueError('weekly snapshot receipt migration invented rows: '+table)
        if old.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall()!=current.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name').fetchall():raise ValueError('weekly snapshot receipt migration changed sequences')
        if current.execute('SELECT imja,sha256 FROM migracii WHERE nomer=?',(number,)).fetchone()!=(filename,sha(root/'db/migracii'/filename)):raise ValueError('weekly snapshot receipt migration digest differs from source')
        with tempfile.TemporaryDirectory(prefix='locus-weekly-snapshot-receipt-schema-')as folder:
            file=Path(folder)/'expected.db';shutil.copyfile(before_database,file)
            with contextlib.closing(sqlite3.connect(file))as compiled:
                compiled.executescript((root/'db/schema.sql').read_text())
                compiled.executescript((root/'db/migracii'/filename).read_text())
                if schema(current)!=schema(compiled):raise ValueError('weekly snapshot receipt schema differs from approved source')
        return {'all_original_values_types_rowids_and_history_unchanged':True,'original_rows_retained':total,'added_tables':sorted(added_tables),'added_business_rows':0,'added_receipt_rows':0,schema_flag:True,'migrations':1}

def verify_weekly_snapshot_receipt_state(before_database, after_database, root):
    return verify_empty_receipt_state(before_database,after_database,root,146,'zaprosy_snimkov_planerki','146-kvitancii-snimkov-planerki.sql','exact_weekly_snapshot_receipt_schema_verified')


def verify_archive_receipt_state(before_database, after_database, root):
    return verify_empty_receipt_state(before_database,after_database,root,147,'zaprosy_arhiva','147-kvitancii-arhiva.sql','exact_archive_receipt_schema_verified')



def verify_schedule_receipt_state(before_database, after_database, root):
    return verify_empty_receipt_state(before_database,after_database,root,148,'zaprosy_grafika','148-zaprosy-grafika.sql','exact_schedule_receipt_schema_verified')


def verify_schedule_undo_state(before_database, after_database, root):
    return verify_empty_receipt_state(before_database,after_database,root,149,'dejstvija_grafika','149-dejstvija-grafika.sql','exact_schedule_undo_schema_verified')


def verify_insight_deferral_state(before_database, after_database, root):
    return verify_empty_receipt_state(before_database,after_database,root,150,['otlozhennye_insajty','zaprosy_insajtov'],'150-otlozhennye-insajty.sql','exact_insight_deferral_schema_verified')


def verify_shared_settings_state(before_database, after_database, root):
    return verify_empty_receipt_state(before_database,after_database,root,151,['versija_nastroek_sistemy','zaprosy_nastroek_sistemy'],'151-parametry-analitiki.sql','exact_shared_settings_schema_verified')


def check_migration_counts(before, after, root, before_database=None):
                                                                               
                                                                               
    membership_conversion=False
    payment_conversion=False
    direction_conversion=False
    template_conversion=False
    strategy_conversion=False
    if before_database is not None:
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            membership_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=107').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=107').fetchone()[0]==1
        if membership_conversion:
            verify_membership_archive(before_database,root/'db/locus.db')
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            notification_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=108').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=108').fetchone()[0]==1
        if notification_conversion:
            verify_notification_links(before_database,root/'db/locus.db')
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            payment_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=118').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=118').fetchone()[0]==1
        if payment_conversion:
            verify_payment_versions(before_database,root/'db/locus.db')
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            direction_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=119').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=119').fetchone()[0]==1
        if direction_conversion:
            verify_direction_versions(before_database,root/'db/locus.db')
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            template_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=122').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=122').fetchone()[0]==1
        if template_conversion:verify_template_steps(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            project_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=123').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=123').fetchone()[0]==1
        if project_conversion:verify_project_receipts(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            project_edit_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=124').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=124').fetchone()[0]==1
        if project_edit_conversion:verify_project_edit_receipts(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            project_action_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=125').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=125').fetchone()[0]==1
        if project_action_conversion:verify_project_action_receipts(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            service_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=126').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=126').fetchone()[0]==1
        if service_conversion:verify_service_receipts(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            referral_payout_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=127').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=127').fetchone()[0]==1
        if referral_payout_conversion:verify_referral_payout_receipts(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            referral_terms_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=128').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=128').fetchone()[0]==1
        if referral_terms_conversion:verify_referral_terms_receipts(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True)) as old, contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True)) as current:
            referral_tasks_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=129').fetchone()[0] and current.execute('SELECT count(*) FROM migracii WHERE nomer=129').fetchone()[0]==1
        if referral_tasks_conversion:verify_referral_tasks(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            referral_link_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=130').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=130').fetchone()[0]==1
        if referral_link_conversion:verify_referral_payout_links(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            focus_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=131').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=131').fetchone()[0]==1
        if focus_conversion:verify_focus_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            focus_expiry_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=132').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=132').fetchone()[0]==1
        if focus_expiry_conversion:verify_focus_expiry(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            feed_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=133').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=133').fetchone()[0]==1
        if feed_conversion:verify_feed_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            broadcast_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=134').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=134').fetchone()[0]==1
        if broadcast_conversion:verify_broadcast_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            campaign_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=135').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=135').fetchone()[0]==1
        if campaign_conversion:verify_campaign_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            strategy_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=143').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=143').fetchone()[0]==1
        if strategy_conversion:verify_strategy_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            goal_edit_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=144').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=144').fetchone()[0]==1
        if goal_edit_conversion:verify_goal_edit_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database.as_uri()+'?mode=ro',uri=True))as old,contextlib.closing(sqlite3.connect((root/'db/locus.db').as_uri()+'?mode=ro',uri=True))as current:
            period_plan_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=145').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=145').fetchone()[0]==1
        if period_plan_conversion:verify_period_plan_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database))as old,contextlib.closing(sqlite3.connect(root/'db/locus.db'))as current:
            weekly_snapshot_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=146').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=146').fetchone()[0]==1
        if weekly_snapshot_conversion:verify_weekly_snapshot_receipt_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database))as old,contextlib.closing(sqlite3.connect(root/'db/locus.db'))as current:
            archive_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=147').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=147').fetchone()[0]==1
        if archive_conversion:verify_archive_receipt_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database))as old,contextlib.closing(sqlite3.connect(root/'db/locus.db'))as current:
            schedule_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=148').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=148').fetchone()[0]==1
        if schedule_conversion:verify_schedule_receipt_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database))as old,contextlib.closing(sqlite3.connect(root/'db/locus.db'))as current:
            schedule_undo_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=149').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=149').fetchone()[0]==1
        if schedule_undo_conversion:verify_schedule_undo_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database))as old,contextlib.closing(sqlite3.connect(root/'db/locus.db'))as current:
            insight_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=150').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=150').fetchone()[0]==1
        if insight_conversion:verify_insight_deferral_state(before_database,root/'db/locus.db',root)
        with contextlib.closing(sqlite3.connect(before_database))as old,contextlib.closing(sqlite3.connect(root/'db/locus.db'))as current:
            shared_settings_conversion=not old.execute('SELECT count(*) FROM migracii WHERE nomer=151').fetchone()[0]and current.execute('SELECT count(*) FROM migracii WHERE nomer=151').fetchone()[0]==1
        if shared_settings_conversion:verify_shared_settings_state(before_database,root/'db/locus.db',root)




    for table, count in before['counts'].items():
        if table != 'migracii' and after['counts'].get(table) != count:
            if table in ('zadacha_uchastniki','nerazobrannye_svjazi') and membership_conversion:
                continue
            if table=='versii_polej' and (payment_conversion or direction_conversion or template_conversion or strategy_conversion):
                continue
            raise ValueError('migration changed record count: ' + table)
    expected = len(list((root / 'db/migracii').glob('*.sql')))
    if after['counts'].get('migracii') != expected:
        raise ValueError('migration ledger count differs from catalog')


@contextlib.contextmanager
def operation_lock(root, timeout=0):
                                                                         
    with (root / '.locus-operation.lock').open('a') as stream:
        os.chmod(stream.name, 0o600)
        deadline = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.1)
        yield


def backup(root, target, full=True):
    root, target = root.resolve(), target.resolve()
    if target.exists():
        raise ValueError('backup destination already exists')
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.backup-', dir=target.parent))
    try:
        (stage / 'db').mkdir(mode=0o700)
                                                                                   
        with contextlib.closing(sqlite3.connect((root / 'db/locus.db').as_uri() + '?mode=rw', uri=True)) as source:
            with contextlib.closing(sqlite3.connect(stage / 'db/locus.db')) as dest:
                source.backup(dest)
                                                                               
                dest.execute('PRAGMA journal_mode=DELETE')
        os.chmod(stage / 'db/locus.db', 0o600)
        state = db_state(stage / 'db/locus.db')
        if full:
            copy_files(root, stage, runtime_files(root))
                                                                              
                                                                               
            uploads = root / 'fajly'
            if uploads.exists():
                names = []
                for file in uploads.rglob('*'):
                    if file.is_symlink():
                        raise ValueError('symlink in uploads')
                    if file.is_file() and not file.name.startswith('.'):
                        names.append(file.relative_to(root).as_posix())
                copy_files(root, stage, names)
            (stage / 'fajly').mkdir(mode=0o700, exist_ok=True)
                                                                              
                                                                                
            queue = root / 'db/sbor-ochered'
            if queue.exists():
                for file in queue.rglob('*.json'):
                    if file.is_symlink():raise ValueError('symlink in collector queue')
                    try:
                        data=file.read_bytes()
                    except FileNotFoundError:
                        continue                                              
                    destination=stage/file.relative_to(root)
                    destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
                    destination.write_bytes(data);destination.chmod(0o600)
                                                                               
            operational = root / 'db/operational'
            if operational.exists():
                for file in operational.rglob('*'):
                    if file.is_symlink():raise ValueError('symlink in error reports')
                    if not file.is_file() or file.name.endswith('.tmp'):continue
                    if file.name not in ('errors.jsonl','errors.jsonl.previous') and not(file.parent.name=='reports' and file.suffix=='.json'):continue
                    copy_files(root,stage,[file.relative_to(root).as_posix()])
        names = sorted(p.relative_to(stage).as_posix() for p in stage.rglob('*') if p.is_file())
        manifest = {'format': 1, 'kind': 'full' if full else 'database', 'created': now(),
                    'state': state, 'files': {name: sha(stage / name) for name in names}}
        write_json(stage / 'backup.json', manifest)
        verify_backup(stage)
        os.replace(stage, target)
        return manifest
    except BaseException:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def verify_files(root, manifest, manifest_name):
    expected = set(manifest['files'])
    actual = set()
    for file in root.rglob('*'):
        if file.is_symlink():
            raise ValueError('symlinks are forbidden')
        if file.is_file():
            actual.add(file.relative_to(root).as_posix())
    if actual != expected | {manifest_name}:
        raise ValueError('archive file list differs from manifest')
    for name, digest in manifest['files'].items():
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or not path.parts:
            raise ValueError('invalid archive path')
        if sha(root / name) != digest:
            raise ValueError('checksum mismatch: ' + name)


def verify_backup(root):
    manifest = json.loads((root / 'backup.json').read_text())
    if manifest.get('format') != 1:
        raise ValueError('unknown backup format')
    verify_files(root, manifest, 'backup.json')
    if db_state(root / 'db/locus.db') != manifest['state']:
        raise ValueError('restored database differs from snapshot')
    return manifest


def restore(source, target, smoke=True):
    """Nothing is ever restored over the live directory, even with --force."""
    source, target = source.resolve(), target.resolve()
    manifest = verify_backup(source)
    if manifest['kind'] != 'full':
        raise ValueError('full app backup required')
    if target.exists():
        raise ValueError('restore target must be a new directory')
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.restore-', dir=target.parent))
    try:
        copy_files(source, stage, manifest['files'])
        (stage / 'fajly').mkdir(mode=0o700, exist_ok=True)
        if db_state(stage / 'db/locus.db') != manifest['state']:
            raise ValueError('database counts changed during restore')
        checks = smoke_app(stage) if smoke else None
        write_json(stage / 'restoration.json', {'restored': now(), 'snapshot': manifest['created'],
                   'state': manifest['state'], 'files_verified': len(manifest['files']), 'smoke': checks})
        os.replace(stage, target)
        return {'state': manifest['state'], 'files_verified': len(manifest['files']), 'smoke': checks}
    except BaseException:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def smoke_app(root):
    """A real isolated process, ephemeral loopback port, own restored DB/uploads."""
    env = dict(os.environ, LOCUS_BAZA=str(root / 'db/locus.db'), LOCUS_FAJLY=str(root / 'fajly'),
               LOCUS_TEST_AUTH='0', NODE_ENV='production')
                                                                      
    script = "require('./server').server.listen(0,'127.0.0.1',function(){console.log(this.address().port)})"
    with tempfile.TemporaryFile(mode='w+') as error_log:
        process = subprocess.Popen(['node', '-e', script], cwd=root, env=env,
                                   stdout=subprocess.PIPE, stderr=error_log, text=True)
        try:
            import select
            if not select.select([process.stdout], [], [], 15)[0]:
                raise ValueError('restored server startup timeout')
            line = process.stdout.readline().strip()
            if not line.isdecimal():
                raise ValueError('restored server did not start')
            checks = {}
            for url, expected in [('/healthz', 200), ('/login', 200), ('/api/zadachi', 401)]:
                try:
                    with urllib.request.urlopen('http://127.0.0.1:' + line + url, timeout=5) as res:
                        code = res.status
                except urllib.error.HTTPError as res:
                    code = res.code
                if code != expected:
                    raise ValueError('restored endpoint failed: ' + url)
                checks[url] = code
            return checks
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            process.stdout.close()


def pack(root, target, revision):
    if target.exists():
        raise ValueError('release destination already exists')
                                                                                 
    with tempfile.TemporaryDirectory(prefix='locus-release-') as tmp:
        stage = Path(tmp)
        data = subprocess.check_output(['git', 'archive', '--format=tar', revision], cwd=root)
        import io
        safe_extract(io.BytesIO(data), stage)
        names = runtime_files(stage)
        allowed = set(names)
        for file in list(stage.rglob('*')):
            if file.is_file() and file.relative_to(stage).as_posix() not in allowed:
                file.unlink()
        full_revision = subprocess.check_output(['git', 'rev-parse', revision + '^{commit}'], cwd=root, text=True).strip()
        write_json(stage / 'release-manifest.json', {
            'format': 1, 'revision': full_revision, 'created': now(),
            'files': {name: sha(stage / name) for name in names}})
        target.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(target, 'w:gz') as archive:
            for name in names + ['release-manifest.json']:
                archive.add(stage / name, arcname=name, recursive=False)
        os.chmod(target, 0o600)
        return {'revision': full_revision, 'files': len(names), 'sha256': sha(target)}


def safe_extract(source, target):
    with tarfile.open(fileobj=source if hasattr(source, 'read') else None,
                      name=None if hasattr(source, 'read') else source, mode='r:*') as archive:
        members = archive.getmembers()
        names = set()
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or member.name in names:
                raise ValueError('unsafe or duplicate archive path')
            if not (member.isfile() or member.isdir()):
                raise ValueError('links and special files forbidden in archive')
            names.add(member.name)
        for member in members:
            file = target / member.name
            if member.isdir():
                file.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with archive.extractfile(member) as src, file.open('xb') as dest:
                    shutil.copyfileobj(src, dest)
                os.chmod(file, 0o600)


def service_action(service, action):
    subprocess.run(['systemctl', action, service], check=True, capture_output=True)


def deploy(root, archive, store, service, port):
                                                                                
    if root != DEPLOY_ROOT or service != 'locus-novyj' or port != DEPLOY_PORT:
        raise ValueError('this release target is not authorised')
    release_id = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    work = store / release_id
    work.mkdir(mode=0o700, parents=True)
    stage = work / 'source'
    stage.mkdir(mode=0o700)
    safe_extract(archive, stage)
    manifest = json.loads((stage / 'release-manifest.json').read_text())
    verify_files(stage, manifest, 'release-manifest.json')
    if set(manifest['files']) != set(runtime_files(stage)):
        raise ValueError('unexpected release files')
    for name in manifest['files']:
        if name.endswith(('.js', '.cjs', '.mjs')):
            subprocess.run(['node', '--check', str(stage / name)], check=True, capture_output=True)
                                                                                
    trial_before = backup(root, work / 'trial-backup')
    trial = work / 'trial'
    restore(work / 'trial-backup', trial, smoke=False)
    copy_files(stage, trial, manifest['files'])
    env = dict(os.environ, LOCUS_BAZA=str(trial / 'db/locus.db'))
    migrated = subprocess.run(['node', 'db/migrate.js'], cwd=trial, env=env,
                              capture_output=True, text=True, timeout=60, check=True)
    (work / 'trial-migration.log').write_text(migrated.stdout + migrated.stderr)
    check_migration_counts(trial_before['state'], db_state(trial / 'db/locus.db'), trial, work/'trial-backup/db/locus.db')
    trial_checks = smoke_app(trial)
    guard = root / 'ops/maintenance.json'
    guard.parent.mkdir(mode=0o700, exist_ok=True)
    if guard.exists():
        raise ValueError('another maintenance operation is active')
    result = {'revision': manifest['revision'], 'started': now(), 'trial': trial_checks, 'deployed': False}
    write_json(guard, {'since': now(), 'release': release_id})
    stopped = False
    opened = False
    restart_safe = True
    mutation_attempted = False
    try:
        stopped = True
        service_action(service, 'stop')
        before = backup(root, work / 'before')
        mutation_attempted = True
        copy_files(stage, root, manifest['files'])
        migration = subprocess.run(['node', 'db/migrate.js'], cwd=root,
            env=dict(os.environ, LOCUS_BAZA=str(root / 'db/locus.db')),
            capture_output=True, text=True, timeout=60, check=True)
        (work / 'migration.log').write_text(migration.stdout + migration.stderr)
        after = db_state(root / 'db/locus.db')
        check_migration_counts(before['state'], after, root, work/'before/db/locus.db')
        result['before'] = before['state']
        result['after'] = after
        service_action(service, 'start')
        stopped = False
        for attempt in range(50):
            try:
                with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/healthz', timeout=1) as res:
                    if res.status == 200:
                        break
            except (OSError, urllib.error.URLError):
                time.sleep(0.1)
        else:
            raise ValueError('new service did not become healthy')
        if any(sha(root / name) != digest for name, digest in manifest['files'].items()):
            raise ValueError('installed source checksum mismatch')
                                                                                  
                                                                             
        write_json(root / 'ops/release.json', manifest)
        guard.unlink()
        opened = True
        result.update(deployed=True, completed=now(), backup=str(work / 'before'))
    except BaseException as error:
        result['error'] = type(error).__name__ + ': ' + str(error)
        if not opened:
            if mutation_attempted:
                restart_safe = False
                service_action(service, 'stop')
                stopped = True
                previous = verify_backup(work / 'before')
                                                                                
                old_code = set(runtime_files(work / 'before'))
                for name in set(manifest['files']) - old_code:
                    (root / name).unlink(missing_ok=True)
                copy_files(work / 'before', root, old_code)
                for suffix in ('-wal', '-shm'):
                    (root / ('db/locus.db' + suffix)).unlink(missing_ok=True)
                copy_files(work / 'before', root, ['db/locus.db'])
                if db_state(root / 'db/locus.db') != previous['state']:
                    raise ValueError('rollback verification failed') from error
                restart_safe = True
                result['rolled_back'] = True
            guard.unlink(missing_ok=True)
        raise
    finally:
        try:
            if stopped and restart_safe:
                service_action(service, 'start')
        finally:
            write_json(work / 'result.json', result)
    return result


def scheduled_backup(root, nightly, offsite):
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8]
    state_path = root / 'ops/backup-state.json'
    try:
        state = json.loads(state_path.read_text())
    except FileNotFoundError:
        state = {}
    if nightly:
        destination = root / 'db/bekapy/polnye' / ('locus-' + stamp)
        manifest = backup(root, destination)
        with tempfile.TemporaryDirectory(prefix='locus-drill-') as tmp:
            checked = restore(destination, Path(tmp) / 'app')
        state['nightly'] = {'created': manifest['created'], 'path': str(destination),
                            'manifest_sha256': sha(destination / 'backup.json'),
                            'restored': now(), 'state': checked['state'], 'smoke': checked['smoke'],
                            'files_verified': checked['files_verified'], 'offsite': False}
        write_json(state_path, state)
                                                                              
        if offsite:
            archive = destination.with_suffix('.tar.gz')
            try:
                with tarfile.open(archive, 'w:gz') as package:
                    package.add(destination, arcname=destination.name)
                os.chmod(archive, 0o600)
                subprocess.run(['rclone', 'copyto', str(archive),
                    'gdrive:locus-bekapy/locus-novyj/' + archive.name,
                    '--timeout', '120s', '--retries', '2'], check=True, timeout=300,
                    capture_output=True)
                                                                           
                with tempfile.TemporaryDirectory(prefix='locus-offsite-') as tmp:
                    downloaded = Path(tmp) / 'backup.tar.gz'
                    subprocess.run(['rclone', 'copyto',
                        'gdrive:locus-bekapy/locus-novyj/' + archive.name, str(downloaded),
                        '--timeout', '120s', '--retries', '2'], check=True, timeout=300,
                        capture_output=True)
                    if sha(downloaded) != sha(archive):
                        raise ValueError('remote backup checksum mismatch')
                state['nightly']['offsite'] = True
                state['nightly']['offsite_completed'] = now()
                write_json(state_path, state)
            finally:
                archive.unlink(missing_ok=True)
        completed = sorted(p for p in destination.parent.glob('locus-*')
                           if p.is_dir() and (p / 'backup.json').is_file())
        for old in completed[:-14]:
            shutil.rmtree(old)
    else:
        folder = root / 'db/bekapy/snimki' / ('locus-' + stamp)
        manifest = backup(root, folder, full=False)
        state['snapshot'] = {'created': manifest['created'], 'path': str(folder),
                             'state': manifest['state']}
        write_json(state_path, state)
        completed = sorted(p for p in folder.parent.glob('locus-*')
                           if p.is_dir() and (p / 'backup.json').is_file())
        for old in completed[:-48]:
            shutil.rmtree(old)
    return state


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('backup')
    p.add_argument('target', type=Path)
    p.add_argument('--database-only', action='store_true')
    p = commands.add_parser('verify')
    p.add_argument('source', type=Path)
    p = commands.add_parser('restore')
    p.add_argument('source', type=Path)
    p.add_argument('target', type=Path)
    p = commands.add_parser('pack')
    p.add_argument('target', type=Path)
    p.add_argument('--revision', default='HEAD')
    p = commands.add_parser('deploy')
    p.add_argument('archive', type=Path)
    p.add_argument('--store', type=Path, default=Path('/var/backups/locus-novyj/releases'))
    p.add_argument('--service', default='locus-novyj')
    p.add_argument('--port', type=int, default=8791)
    p = commands.add_parser('scheduled')
    p.add_argument('--nightly', action='store_true')
    p.add_argument('--offsite', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == 'verify':
        result = verify_backup(args.source.resolve())
    elif args.command == 'restore':
        result = restore(args.source, args.target)
    elif args.command == 'pack':
        result = pack(root, args.target.resolve(), args.revision)
    else:
        with operation_lock(root, timeout=60):
            if args.command == 'backup':
                result = backup(root, args.target, not args.database_only)
            elif args.command == 'scheduled':
                result = scheduled_backup(root, args.nightly, args.offsite)
            else:
                result = deploy(root, args.archive.resolve(), args.store.resolve(), args.service, args.port)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
