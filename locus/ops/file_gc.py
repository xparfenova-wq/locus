"""Remove an unreferenced upload while holding the backup/deployment lock."""
from pathlib import Path
import fcntl,json,os,sqlite3,sys
from urllib.parse import quote

def collect(name):
    root=Path(__file__).resolve().parents[1]
    database=Path(os.environ.get('LOCUS_BAZA',str(root/'db/locus.db'))).resolve()
    store=Path(os.environ.get('LOCUS_FAJLY',str(root/'fajly'))).resolve()
    operation_root=Path(os.environ.get('LOCUS_OPERATION_ROOT',str(root if database==root/'db/locus.db' else database.parent)))
    if not name or name in ('.','..') or Path(name).name!=name or '\\' in name or any(ord(c)<32 or ord(c)==127 for c in name):
        return {'deleted':False,'reason':'invalid'}
    with (operation_root/'.locus-operation.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'deleted':False,'reason':'busy'}
        encoded='/fajly/'+quote(name,safe="~()*!.'")
        variants=(name,'/fajly/'+name,encoded)
        with sqlite3.connect(database.as_uri()+'?mode=ro',uri=True) as db:
            for table in ('materialy','dokumenty'):
                if db.execute('SELECT 1 FROM '+table+' WHERE fajl IN (?,?,?) OR ssylka IN (?,?,?) LIMIT 1',variants+variants).fetchone():
                    return {'deleted':False,'reason':'referenced'}
        target=store/name
        if not target.exists():return {'deleted':False,'reason':'missing'}
        if target.is_symlink() or not target.is_file() or target.resolve().parent!=store:
            return {'deleted':False,'reason':'invalid'}
        target.unlink()
        return {'deleted':True,'reason':'removed'}

if __name__=='__main__':
    try:result=collect(sys.argv[1])
    except Exception as error:result={'deleted':False,'reason':'error','error_kind':type(error).__name__}
    print(json.dumps(result))
