"""Controlled, append-only dictionary import into the NEW Locus only."""
import argparse,contextlib,datetime,hashlib,importlib.util,json,os,sqlite3,subprocess,time,urllib.error,urllib.request,uuid
from pathlib import Path

spec=importlib.util.spec_from_file_location('locus_ops',Path(__file__).with_name('locus_ops.py'))
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
ALLOWED={'ljudi','kontakty','akkaunty','import_svjazi','zhurnal','versii_polej'}

def rows(db,table):
    return db.execute('SELECT rowid,* FROM "'+table.replace('"','""')+'" ORDER BY rowid').fetchall()

def verify_append_only(before,after,result):
    """Every old row, not merely its count, must survive exactly."""
    with contextlib.closing(sqlite3.connect(before)) as old,contextlib.closing(sqlite3.connect(after)) as new:
        tables=[r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        other=[r[0] for r in new.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        if tables!=other:raise ValueError('import changed schema')
        expected={'ljudi':result['created_people'],'kontakty':result['created_contacts'],'akkaunty':result['created_accounts'],'import_svjazi':result['mappings_added'],
                  'zhurnal':result['created_people']+result['created_contacts']+result['created_accounts'],
                  'versii_polej':2*(result['created_people']+result['created_contacts'])}
        for table in tables:
            previous,current=rows(old,table),rows(new,table)
            if table not in ALLOWED:
                if previous!=current:raise ValueError('import changed protected table: '+table)
            else:
                indexed={r[0]:r for r in current}
                if any(indexed.get(r[0])!=r for r in previous):raise ValueError('import overwrote an original row: '+table)
                if len(current)-len(previous)!=expected[table]:raise ValueError('unexpected import count: '+table)
        if new.execute('PRAGMA integrity_check').fetchall()!=[('ok',)] or new.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('invalid imported database')
        if new.execute("SELECT count(*) FROM versii_polej WHERE tablica=''").fetchone()[0]:raise ValueError('request context remained after import')
    return {'all_original_rows_preserved':True,'all_other_tables_unchanged':True,'integrity':'ok','foreign_key_errors':0}

def node(root,source,target,plan,actor=None):
    command=['node','ops/legacy-dictionaries.cjs','apply' if actor is not None else 'plan',str(source),str(target),str(plan)]
    if actor is not None:command.append(str(actor))
    result=subprocess.run(command,cwd=root,env=dict(os.environ,LOCUS_DICTIONARY_IMPORT='1'),capture_output=True,text=True,timeout=120)
    if result.returncode:raise ValueError('dictionary command failed: '+result.stderr.strip()[:500])
    return json.loads(result.stdout)

def health(port):
    for attempt in range(50):
        try:
            with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/healthz',timeout=1) as response:
                if response.status==200:return
        except (OSError,urllib.error.URLError):time.sleep(.1)
    raise ValueError('service did not become healthy')

def run(root,source,store,actor,service='locus-novyj',port=8791):
    root,source,store=root.resolve(),source.resolve(),store.resolve()
    if root!=ops.DEPLOY_ROOT.resolve() or service!='locus-novyj' or port!=ops.DEPLOY_PORT:raise ValueError('this import target is not authorised')
    if not source.is_file() or root in source.parents or root in store.parents or source.stat().st_mode&0o077:raise ValueError('private external source and storage required')
    guard=root/'ops/maintenance.json'
    if guard.exists():raise ValueError('another maintenance operation is active')
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
    work=store/stamp;work.mkdir(mode=0o700,parents=True)
    source_sha=ops.sha(source)
    result={'started':ops.now(),'source_sha256':source_sha,'opened':False,'production_state_imported':False}
    with ops.operation_lock(root,timeout=30):
        if guard.exists():raise ValueError('another maintenance operation is active')
        ops.write_json(work/'result.json',result)
                                                                                 
                                                                             
        ops.backup(root,work/'trial-before');ops.restore(work/'trial-before',work/'trial',smoke=False)
        trial_plan=work/'trial-plan.json';node(work/'trial',source,work/'trial/db/locus.db',trial_plan)
        trial=node(work/'trial',source,work/'trial/db/locus.db',trial_plan,actor)
        verify_append_only(work/'trial-before/db/locus.db',work/'trial/db/locus.db',trial)
        trial_sha=json.loads(trial_plan.read_text())['plan_sha256']
        stopped=False;opened=False;restart_safe=True;write_attempted=False
        ops.write_json(guard,{'since':ops.now(),'dictionary_import':stamp})
        try:
            stopped=True;ops.service_action(service,'stop')
            before=ops.backup(root,work/'before')
            actual_plan=work/'plan.json';node(root,source,root/'db/locus.db',actual_plan)
            if json.loads(actual_plan.read_text())['plan_sha256']!=trial_sha:raise ValueError('target changed since trial; preview required again')
            write_attempted=True;imported=node(root,source,root/'db/locus.db',actual_plan,actor)
            checked=verify_append_only(work/'before/db/locus.db',root/'db/locus.db',imported)
            if ops.sha(source)!=source_sha:raise ValueError('source changed during import')
            ops.service_action(service,'start');stopped=False;health(port)
            guard.unlink();opened=True
            result.update(opened=True,completed=ops.now(),imported=imported,verification=checked,backup=str(work/'before'),plan=str(actual_plan))
        except BaseException as error:
            result['error']=type(error).__name__+': '+str(error)
            if not opened:
                if write_attempted:
                    restart_safe=False;ops.service_action(service,'stop');stopped=True
                    previous=ops.verify_backup(work/'before')
                    for suffix in ['-wal','-shm']:(root/('db/locus.db'+suffix)).unlink(missing_ok=True)
                    ops.copy_files(work/'before',root,['db/locus.db'])
                    if ops.db_state(root/'db/locus.db')!=previous['state']:raise ValueError('import rollback verification failed') from error
                                                                      
                    zero={'created_people':0,'created_contacts':0,'created_accounts':0,'mappings_added':0}
                    verify_append_only(work/'before/db/locus.db',root/'db/locus.db',zero)
                    restart_safe=True;result['rolled_back']=True
                guard.unlink(missing_ok=True)
            raise
        finally:
            try:
                if stopped and restart_safe:ops.service_action(service,'start')
            finally:ops.write_json(work/'result.json',result)
    return result

if __name__=='__main__':
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=ops.DEPLOY_ROOT);parser.add_argument('--source',required=True,type=Path)
    parser.add_argument('--store',type=Path,default=Path('/var/backups/locus-novyj/imports'));parser.add_argument('--actor',type=int,required=True)
    args=parser.parse_args();print(json.dumps(run(args.root,args.source,args.store,args.actor)))
