"""Runs only inside an ephemeral network-isolated recovery container. Safe JSON output."""
from pathlib import Path
import concurrent.futures,hashlib,http.client,importlib.util,json,os,re,secrets,shutil,socket,sqlite3,ssl,subprocess,time
os.umask(0o077)
if os.environ.get('LOCUS_ISOLATED_RESTORE')!='1' or not Path('/.dockerenv').exists() or any(name!='lo' for _,name in socket.if_nameindex()):
    raise SystemExit('Requires an explicitly enabled, network-isolated disposable Docker container')
if Path('/var/www/locus-novyj').exists() or not all(Path(p).is_dir() for p in ['/backup','/configuration','/output']):
    raise SystemExit('Requires a clean container and dedicated backup/configuration/output mounts')
root=Path('/var/www/locus-novyj'); processes=[]
report={'kind':'isolated-clean-Linux-restore','network':'none','host_services_changed':False,'physical_server_boot_tested':False}
def check(condition,label):
    if not condition:raise RuntimeError(label)
def quiet(args,**kwargs):
    result=subprocess.run(args,capture_output=True,**kwargs)
    if result.returncode and args[0] in ['nginx','systemd-analyze']:print(result.stderr.decode(errors='replace'),flush=True)
    check(result.returncode==0,'command failed: '+args[0]);return result
def start(args,**kwargs):
    process=subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,**kwargs);processes.append(process);return process
def stop(process):
    process.terminate()
    try:process.wait(timeout=10)
    except subprocess.TimeoutExpired:process.kill();process.wait()
class LocalTLS(http.client.HTTPSConnection):
    def connect(self):
        self.sock=self._context.wrap_socket(socket.create_connection(('127.0.0.1',self.port),timeout=10),server_hostname=self.host)
host='locus-novyj.187-124-165-215.nip.io'
def request(url,method='GET',body=None,cookie=None,port=14443,origin=None):
    connection=LocalTLS(host,port,context=ssl.create_default_context(),timeout=10)
    headers={'Host':host+':'+str(port)}
    if method!='GET':headers['Origin']=origin or 'https://'+host+':'+str(port)
    if cookie:headers['Cookie']=cookie
    if body is not None:headers['Content-Type']='application/json';body=json.dumps(body).encode()
    try:
        connection.request(method,url,body,headers);response=connection.getresponse();data=response.read()
        try:payload=json.loads(data)
        except ValueError:payload=None
        return response.status,payload,{k.lower():v for k,v in response.getheaders()}
    finally:connection.close()
def metadata(db):
    rows=db.execute('SELECT * FROM versii_polej ORDER BY tablica,obekt_id,pole').fetchall()
    return hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest(),len(rows)
try:
    shutil.copytree('/backup','/tmp/backup')
    spec=importlib.util.spec_from_file_location('locus_ops','/tmp/backup/ops/locus_ops.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
    restored=ops.restore(Path('/tmp/backup'),root)
    report['backup']={'files_verified':restored['files_verified'],'state':restored['state'],'smoke':restored['smoke']}
                                                                                           
    check(Path('/configuration/etc/locus-novyj.env').is_file(),'configuration mount is unreadable')
    for folder,dirs,files in os.walk('/configuration',followlinks=False):
        for name in files:
            source=Path(folder)/name;target=Path('/')/source.relative_to('/configuration');target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            if source.is_symlink():
                if target.is_symlink() or target.exists():target.unlink()
                target.symlink_to(os.readlink(source))
            else:shutil.copyfile(source,target);target.chmod(0o600)
    config_files=list(Path('/configuration').rglob('*'));report['configuration_files']=sum(p.is_file() or p.is_symlink() for p in config_files)
    if not Path('/usr/bin/node').exists():Path('/usr/bin/node').symlink_to(shutil.which('node'))
    units=sorted(str(p) for p in Path('/etc/systemd/system').glob('locus-novyj*') if p.suffix in ['.service','.timer'])
    quiet(['systemd-analyze','verify','--man=no',*units]);report['service_definitions']={'files':len(units),'verified':True,'booted':False}
    env=dict(os.environ,NODE_ENV='production',PORT='8791',HOST='127.0.0.1',LOCUS_TEST_AUTH='0',LOCUS_BAZA=str(root/'db/locus.db'),LOCUS_FAJLY=str(root/'fajly'))
    for line in Path('/etc/locus-novyj.env').read_text().splitlines():
        if line.strip() and not line.lstrip().startswith('#'):
            key,value=line.split('=',1);check(re.fullmatch(r'LOCUS_[A-Z_]+',key) is not None,'unexpected environment key');env[key]=value.strip().strip('"').strip("'")
    check('61' in env['LOCUS_GRAFIK_ADMIN_IDS'].split(','),'schedule permission not restored')
    check(set(env.get('LOCUS_STRATEGY_EDITOR_IDS','').split(','))=={'61','63'},'strategy editor permissions not restored')
    report['environment_keys']=sorted(k for k in env if k.startswith('LOCUS_') and k not in ['LOCUS_BAZA','LOCUS_FAJLY','LOCUS_TEST_AUTH'])
                                                                                          
    configs='\n'.join(Path('/etc/nginx/sites-available/'+n).read_text() for n in ['locus-novyj','locus-novyj-zapas'])
    for old,new in [(8443,18443),(443,14443),(80,18080)]:configs=re.sub(r'listen\s+'+str(old)+r'\s*;', 'listen '+str(new)+';',configs);configs=re.sub(r'listen\s+'+str(old)+r'\s+ssl;', 'listen '+str(new)+' ssl;',configs)
    Path('/tmp/locus-nginx.conf').write_text('pid /tmp/nginx.pid;error_log /tmp/nginx-error.log;events {} http { access_log off; client_body_temp_path /tmp/nginx-body; proxy_temp_path /tmp/nginx-proxy; '+configs+' }')
    quiet(['nginx','-t','-c','/tmp/locus-nginx.conf']);report['nginx_configuration_test']=True
                                                                                    
    password=secrets.token_urlsafe(24)
    hashed=quiet(['node','-e',"const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync(process.env.FIXTURE_PASSWORD,s,64).toString('hex'))"],env=dict(env,FIXTURE_PASSWORD=password)).stdout.decode().strip()
    db=sqlite3.connect(root/'db/locus.db');user=db.execute('SELECT login FROM vhod WHERE chelovek_id=61').fetchone();check(user is not None,'restored auth record missing')
    db.execute('UPDATE vhod SET parol_hesh=?,zablokirovan=0 WHERE chelovek_id=61',(hashed,));db.commit();db.close()
    app=start(['node','server.js'],cwd=root,env=env);nginx=start(['nginx','-c','/tmp/locus-nginx.conf','-g','daemon off;'])
    for attempt in range(100):
        try:
            if request('/healthz')[0]==200:break
        except (OSError,ssl.SSLError):time.sleep(.1)
    else:raise RuntimeError('restored HTTPS startup failed')
    report['https']={}
    for port in [14443,18443]:
        check(request('/healthz',port=port)[0]==200,'HTTPS health failed')
        check(request('/api/zadachi','POST',{},port=port)[0]==401,'same-origin auth failed')
        check(request('/api/zadachi','POST',{},port=port,origin='https://foreign.invalid')[0]==403,'foreign origin accepted')
        report['https'][str(port)]={'certificate_verified':True,'health':200,'same_origin_anonymous':401,'foreign_origin':403}
    code,body,headers=request('/api/vhod/parol','POST',{'login':user[0],'parol':password});check(code==200,'restored login failed')
    cookie=headers['set-cookie'].split(';')[0];check('Secure' in headers['set-cookie'],'restored cookie insecure')
    check(request('/api/vhod',cookie=cookie)[0]==200,'restored identity failed')
    check(request('/api/poleznoe',cookie=cookie)[1]['grafik_mozhno_pravit_chuzhoj'] is True,'restored schedule access failed')
    report['authentication']={'fixture_password_in_disposable_db':True,'login':200,'identity':200,'secure_cookie':True,'schedule_permission':True}
    def create():
        code,body,_=request('/api/zadachi','POST',{'nazvanie':'Recovery fixture','opisanie':'Original','napravlenie':'synapt','otvetstvennyj':61},cookie)
        check(code==201 or code==200,'restored create failed');return body
    def patch(task,fields):return request('/api/zadachi/'+str(task['nomer']),'PATCH',dict(versija=task['versija'],**fields),cookie)
    independent=create()
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        codes=list(pool.map(lambda f:patch(independent,f)[0],[{'nazvanie':'Recovered title'},{'opisanie':'Recovered description'}]))
    check(codes==[200,200],'restored independent fields failed')
    same=create()
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        writes=list(pool.map(lambda text:patch(same,{'nazvanie':text}),['First recovery title','Second recovery title']))
    check(sorted(w[0] for w in writes)==[200,409],'restored same field conflict failed')
    conflict=next(w[1] for w in writes if w[0]==409);check(conflict.get('kto')==61 and conflict.get('kogda'),'restored conflict actor missing')
    db=sqlite3.connect(root/'db/locus.db');before=metadata(db);counts=ops.db_state(root/'db/locus.db')['counts'];db.close();stop(app)
    quiet(['node','db/migrate.js'],cwd=root,env=env)
    db=sqlite3.connect(root/'db/locus.db');after=metadata(db);db.close()
    check(before==after,'re-migration changed field history');check(ops.db_state(root/'db/locus.db')['counts']==counts,'re-migration changed row counts')
    app=start(['node','server.js'],cwd=root,env=env)
    for attempt in range(100):
        try:
            if request('/healthz')[0]==200:break
        except OSError:time.sleep(.1)
    check(patch(same,{'nazvanie':'Stale after migration'})[0]==409,'conflict lost after re-migration')
    check(request('/api/vhod',cookie=cookie)[0]==200,'session lost after restart')
    report['writes']={'independent_fields':codes,'same_field':[200,409],'actor_and_time_preserved':True,'field_metadata_rows':before[1],'metadata_sha256_before':before[0],'metadata_sha256_after':after[0],'remigration_counts_preserved':True,'restart_session_valid':True,'stale_after_restart':409}
    request('/api/vhod/vyjti','POST',{},cookie)
    report['passed']=True
    Path('/output/result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report),flush=True)
finally:
    for process in reversed(processes):
        if process.poll() is None:stop(process)
