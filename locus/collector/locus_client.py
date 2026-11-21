# -*- coding: utf-8 -*-
"""New-Locus transport: narrow authentication, atomic batches and durable retries."""
from __future__ import annotations
import contextvars
import fcntl
import html
import json
import math
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone, timedelta

MSK=timezone(timedelta(hours=3))
CURRENT=contextvars.ContextVar('locus_collection',default=None)
SNAP={'subs':'podpischikov','posts':'publikacij_vsego','viewsSum':'summa_prosmotrov','reach':'ohvat','er':'vovlechennost','extra':'extra'}
POST={'url':'ssylka','date':'data_vyhoda','title':'zagolovok','views':'prosmotrov','likes':'lajkov','comments':'kommentariev','shares':'peresylok','saves':'sohranenij','reach':'ohvat','extra':'extra'}
KINDS={'post':'post','photo':'post','clip':'rils','video':'video','reel':'rils','reels':'rils','carousel':'karusel','album':'karusel','story':'storis','stories':'storis'}

def counter(value):
    if value is None or value==-1:return None
    if isinstance(value,str) and re.fullmatch(r'\d+',value):value=int(value)
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0 or int(value)!=value:
        raise RuntimeError('разметка не распознана: неверный счётчик')
    return int(value)

class RemoteError(RuntimeError):
    def __init__(self,status,message):
        super().__init__(message);self.status=status

def configuration():
    base=os.environ.get('LOCUS_BASE','http://127.0.0.1:8791').rstrip('/')
    parsed=urllib.parse.urlsplit(base)
    if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost','::1') or parsed.port==8787 or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise RuntimeError('сборщик работает только с локальным новым Локусом')
    key=os.environ.get('LOCUS_KLJUCH_SBORA','').strip()
    if len(key.encode())<32:raise RuntimeError('внутренний ключ сбора не настроен')
    return base,key

def queue_directory():
    folder=Path(os.environ.get('LOCUS_MEDIA_QUEUE',str(Path(__file__).resolve().parents[1]/'db/sbor-ochered')))
    if any((str(candidate)+'/').startswith(('/var/www/locus/','/var/lib/locus/')) for candidate in (folder.absolute(),folder.resolve())):
        raise RuntimeError('очередь старого Локуса недоступна')
    folder.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(folder,0o700)
    return folder

def safe_error(error):
    message=str(error)
    values=[os.environ.get('LOCUS_KLJUCH_SBORA','')]
    try:
        with open(os.environ.get('LOCUS_MEDIA_SECRETS','/etc/locus-novyj-media-secrets.json'),encoding='utf-8') as source:
            values.extend(v for v in json.load(source).values() if isinstance(v,str))
    except (OSError,ValueError,AttributeError):pass
    for value in values:
        if len(value)>=8:message=message.replace(value,'[скрыто]')
        if len(value)>=20:message=re.sub(re.escape(value[:16])+r'[A-Za-z0-9_.-]*','[скрыто]',message)
    message=re.sub(r'(?i)((?:access_token|token|api_key|x-api-key)[\s"\x27:=]+)[^\s&"\x27<>]+',r'\1[скрыто]',message)
    message=html.unescape(re.sub(r'<[^>]*>',' ',message))
    return re.sub(r'\s+',' ',message).strip()[:400]

def api(method,path,payload=None):
    base,key=configuration()
    if not (method=='GET' and path in ('/api/akkaunty','/api/akkaunty?pending=1') or method=='POST' and re.fullmatch(r'/api/akkaunty/[1-9]\d*/prinjat_sbor',path)):
        raise RuntimeError('сборщик не обращается к этому адресу')
    data=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode() if payload is not None else None
    request=urllib.request.Request(base+path,data=data,method=method,headers={'Content-Type':'application/json','x-locus-sborschik':key})
    last=None
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(NoRedirect)
    for attempt in range(3):
        try:
            with opener.open(request,timeout=60) as response:return json.load(response)
        except urllib.error.HTTPError as error:
            try:detail=json.loads(error.read()).get('oshibka','')
            except (ValueError,AttributeError):detail=''
            last=RemoteError(error.code,'Локус '+str(error.code)+': '+safe_error(detail))
            if error.code not in (408,429) and error.code<500:raise last
        except (urllib.error.URLError,TimeoutError,OSError) as error:last=RemoteError(0,'Локус недоступен: '+safe_error(error))
        except ValueError as error:last=RemoteError(0,'ответ Локуса не распознан')
        if attempt<2:time.sleep(attempt+1)
    raise last

def handle(account):
    platform=account['ploshadka'];url=account.get('ssylka') or ''
    if not url and str(account.get('nazvanie','')).startswith('@'):
        value=account['nazvanie'][1:]
        if re.fullmatch(r'[A-Za-z0-9_.]{1,64}',value):return value
        raise RuntimeError('неверное имя аккаунта для сбора')
    parsed=urllib.parse.urlsplit(url if '://' in url else 'https://'+url)
    host=(parsed.hostname or '').lower();parts=[p for p in parsed.path.split('/') if p]
    if platform=='telegram' and host in ('t.me','www.t.me','telegram.me'):
        if parts and parts[0]=='s':parts=parts[1:]
    elif platform=='instagram' and host in ('instagram.com','www.instagram.com'):pass
    else:raise RuntimeError('нужна ссылка на аккаунт своей площадки')
    if not parts or not re.fullmatch(r'[A-Za-z0-9_.]{1,64}',parts[0]) or parts[0] in ('p','reel','reels','tv','joinchat'):
        raise RuntimeError('в карточке нет имени аккаунта для сбора')
    return parts[0]

def accounts(only=None,pending=False):
    box=api('GET','/api/akkaunty'+('?pending=1' if pending else ''))
    result=[]
    for source in box.get('spisok',[]):
        if only is not None and str(source['id'])!=str(only):continue
        item={**source,'platform':source['ploshadka'],'source':source['uroven'],'active':True}
        try:item['handle']=handle(source)
        except RuntimeError as error:item['handle']='';item['_configuration_error']=str(error)
        result.append(item)
    return result

def new_batch(account,source):
    now=datetime.now(timezone.utc)
    return {'account':account,'posts':{},'snapshot':{},'warnings':[],
            'body':{'kljuch_zapuska':uuid.uuid4().hex,'akkaunt_sha256':account['akkaunt_sha256'],
                    'data':now.astimezone(MSK).strftime('%Y-%m-%d'),'kogda':now.isoformat(),
                    'uroven':source}}

def active(account_id):
    batch=CURRENT.get()
    if batch is None or str(batch['account']['id'])!=str(account_id):raise RuntimeError('нет пакета для этого аккаунта')
    return batch

def push_snap(account_id,**fields):
    batch=active(account_id)
    for field,value in fields.items():
        if field not in SNAP:raise RuntimeError('неизвестная метрика снимка: '+field)
        if field not in ('extra','er'):value=counter(value)
        if field=='extra' and isinstance(value,dict):value={k:v for k,v in value.items() if v is not None}
        if value is not None:batch['snapshot'][SNAP[field]]=value

def push_posts(account_id,posts):
    batch=active(account_id)
    for post in posts:
        identifier=post.get('postId')
        if identifier is None:raise RuntimeError('разметка не распознана: нет id публикации')
        if batch['account']['platform']=='instagram' and batch['body']['uroven']=='graph':
            parsed=urllib.parse.urlsplit(post.get('url') or '')
            match=re.fullmatch(r'/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)/?',parsed.path)
            if parsed.hostname not in ('instagram.com','www.instagram.com') or not match:
                batch['warnings'].append('у публикации нет постоянной ссылки, связь не угадана');continue
            identifier=match.group(1)
        identifier=str(identifier);row=batch['posts'].setdefault(identifier,{'publikacija_id':identifier})
        for field,value in post.items():
            if field in POST and value is not None:
                if field in ('views','likes','comments','shares','saves','reach'):value=counter(value)
                if value is not None and POST[field] not in row:row[POST[field]]=value
        if post.get('kind') in KINDS:row['format']=KINDS[post['kind']]
        if batch['body']['uroven']=='graph':row['extra']={**row.get('extra',{}),'graph_id':str(post['postId'])}

def persist(body,account_id):
    configuration();folder=queue_directory()
    name=body['kogda'].replace(':','').replace('-','').replace('+','_')+'-'+body['kljuch_zapuska']+'.json'
    target=folder/name;temp=folder/('.'+name+'.tmp')
    envelope={'account_id':account_id,'body':body}
    with temp.open('x',encoding='utf-8') as output:
        os.chmod(temp,0o600);json.dump(envelope,output,ensure_ascii=False,separators=(',',':'));output.flush();os.fsync(output.fileno())
    os.replace(temp,target)
    descriptor=os.open(folder,os.O_RDONLY)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)
    return target

def push_run(account_id,source,ok,got,note=''):
    batch=active(account_id);body=dict(batch['body']);body['uspeh']=bool(ok)
    warnings=list(dict.fromkeys(batch['warnings']))
    if warnings and 'частичный' not in note:note='частичный сбор'+(': '+note if note else '')
    parts=[note,*warnings]
    body['primechanie']=safe_error('; '.join(part for part in parts if part))
    if ok:
        if batch['snapshot']:body['snimok']=batch['snapshot']
        if batch['posts']:body['publikacii']=list(batch['posts'].values())
        body['poluchen']=len(batch['posts']) if batch['posts'] else min(int(got or 0),1)
        if not batch['snapshot'] and not batch['posts']:
            body['uspeh']=False;body['poluchen']=0;body['primechanie']=safe_error(body['primechanie'] or 'измерений не получено')
    else:body['poluchen']=0
    pending=persist(body,account_id)
    if not drain():raise RemoteError(0,'пакет сохранён в очереди, Локус пока недоступен')
    if (pending.parent/'otklonennye'/pending.name).exists():return False
    return body['uspeh']

def run_source(account,source,fn,deep,partial_type,fallback=None):
    batch=new_batch(account,source);token=CURRENT.set(batch);note='';got=0;ok=True
    try:
        try:
            if account.get('_configuration_error'):raise RuntimeError(account['_configuration_error'])
            got=fn(account,deep)
        except partial_type as error:
            note='частичный сбор: '+safe_error(error)
        except Exception as error:
            first=safe_error(error)
            batch['posts'].clear();batch['snapshot'].clear()
            if fallback is None or account.get('_configuration_error'):ok=False;note=first
            else:
                CURRENT.reset(token);batch=new_batch(account,source);token=CURRENT.set(batch)
                try:got=fallback(account,deep);note='снято запасным источником'
                except partial_type as error:note='частичный сбор, запасной источник: '+safe_error(error)
                except Exception as second:
                    ok=False;note=first+'; запасной источник: '+safe_error(second);batch['posts'].clear();batch['snapshot'].clear()
                                                                           
                                                                             
        saved=push_run(account['id'],source,ok,got,note)
        print(account['platform']+' @'+account.get('handle','')+': '+('прошло' if saved else 'ошибка')+((': '+safe_error(note)) if note else ''))
        return saved
    finally:CURRENT.reset(token)

def drain():
    folder=queue_directory()
    for source in sorted(folder.glob('*.json')):
        with source.open(encoding='utf-8') as stream:envelope=json.load(stream)
        try:
            accepted=api('POST','/api/akkaunty/'+str(envelope['account_id'])+'/prinjat_sbor',envelope['body'])
            if not acknowledged(accepted,envelope['body']):
                raise RemoteError(0,'сервер не подтвердил пакет сбора')
        except RemoteError as error:
            if error.status in (400,404,409,413,422):
                rejected=folder/'otklonennye';rejected.mkdir(mode=0o700,exist_ok=True)
                os.replace(source,rejected/source.name)
                print('Пакет отклонён и сохранён для разбора: '+safe_error(error),file=__import__('sys').stderr)
                                                                                  
                                                                               
                if error.status in (400,413,422) and envelope['body'].get('uspeh') is True:
                    now=datetime.now(timezone.utc);failure={k:v for k,v in envelope['body'].items() if k in ('akkaunt_sha256','uroven')}
                    failure.update(kljuch_zapuska=uuid.uuid4().hex,data=now.astimezone(MSK).strftime('%Y-%m-%d'),kogda=now.isoformat(),uspeh=False,poluchen=0,primechanie=safe_error('пакет данных отклонён: '+str(error)))
                    pending=persist(failure,envelope['account_id'])
                    try:
                        accepted=api('POST','/api/akkaunty/'+str(envelope['account_id'])+'/prinjat_sbor',failure)
                        if not acknowledged(accepted,failure):return False
                    except RemoteError:return False
                    pending.unlink()
                continue
            return False
        source.unlink()
    return True

def acknowledged(response,body):
    return (isinstance(response,dict) and response.get('kljuch_zapuska')==body['kljuch_zapuska']
            and type(response.get('id')) is int and response['id']>0)

def locked_run(fn):
    configuration();folder=queue_directory()
    with (folder/'.worker.lock').open('a') as lock:
        os.chmod(folder/'.worker.lock',0o600)
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return 75                                                           
        try:
            if not drain():return 1
            return fn()
        finally:fcntl.flock(lock,fcntl.LOCK_UN)
