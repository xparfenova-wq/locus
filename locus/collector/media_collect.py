#!/usr/bin/env python3
"""Сбор цифр для раздела «Медиа» в Локусе.

    python3 media_collect.py --all              все активные аккаунты
    python3 media_collect.py --acc 123          один аккаунт
    python3 media_collect.py --all --deep       перечитать архив глубже

Аккаунты берутся из самого Локуса: список ведётся в интерфейсе, а не в файле,
иначе добавление канала превращалось бы в правку кода на сервере.

Три уровня данных, каждый следующий подключается поверх предыдущего:

  public   бесплатно и без доступов. Telegram отдаёт подписчиков и просмотры
           постов на странице t.me/s/<канал>, Instagram — через ScrapeCreators
           с запасным источником Apify.
  mtproto  личная статистика Telegram: охват, пересылки, реакции. Нужна
           user-сессия владельца канала, канал от 500 подписчиков.
  graph    личная статистика Instagram: охваты, сохранения, переходы.
           Нужен Professional-аккаунт, страница Facebook и токен Meta.

Уровень записан в карточке аккаунта полем «Уровень». Сборщик всегда снимает
публичные цифры, а личные добавляет сверху: если токен протух, карточка
не опустеет, просто в ней не будет охвата.
"""

from __future__ import annotations

import argparse
import html as html_mod
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
try:
    from . import locus_client as client
except ImportError:
    import locus_client as client

BASE=os.environ.get('LOCUS_BASE','http://127.0.0.1:8791')
KEY=os.environ.get('LOCUS_KLJUCH_SBORA','')
SECRETS=os.environ.get('LOCUS_MEDIA_SECRETS','/etc/locus-novyj-media-secrets.json')
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
PAGE_PAUSE = 0.8
MSK = timezone(timedelta(hours=3))


class Partial(Exception):
    """Часть данных пришла, часть нет.

    Не ошибка сбора: подписчики сняты, лента закрыта настройками канала.
    Красным такой запуск помечать нельзя, иначе человек будет искать поломку
    там, где всё работает, как задумано владельцем канала.
    """


def secret(name: str) -> str:
    try:
        with open(SECRETS, encoding="utf-8") as f:
            return json.load(f).get(name, "") or ""
    except FileNotFoundError:
        return ""

def provider_error(error,name):
                                                                             
    error.read(2048)
    reasons={400:'источник не принял запрос',401:'проверьте ключ доступа к источнику',
             402:'источник требует продления доступа',403:'источник не разрешил доступ',
             404:'профиль или публикация недоступны на площадке',429:'источник временно ограничил запросы'}
    reason=reasons.get(error.code,'источник временно недоступен' if error.code>=500 else 'источник отклонил запрос')
    return name+': '+reason+' (HTTP '+str(error.code)+')'


def today_msk() -> str:
    return datetime.now(MSK).strftime("%Y-%m-%d")


                                                                               

def api(method, path, payload=None):
    return client.api(method,path,payload)


def accounts(only=None, pending=False):
    return client.accounts(only,pending)


def views_total(posts):
    values=[client.counter(p.get('views')) for p in posts]
    known=[v for v in values if v is not None]
    return sum(known) if known else None


def push_snap(acc_id, **fields):
    return client.push_snap(acc_id,**fields)


def push_posts(acc_id, posts):
    return client.push_posts(acc_id,posts)


def push_run(acc_id, source, ok, got, note=''):
    return client.push_run(acc_id,source,ok,got,note)


                                                                              
                                                                         
                                                                           

RE_BLOCK = re.compile(r'(?=<div class="tgme_widget_message_wrap)')
RE_ID = re.compile(r'data-post="[^/"]+/(\d+)"')
RE_DATE = re.compile(r'<time datetime="([^"]+)"')
RE_VIEWS = re.compile(r'tgme_widget_message_views">([^<]+)<')
RE_VIDEO = re.compile(r"video_thumb\"[^>]*background-image:url\('([^']+)'\)")
RE_PHOTO = re.compile(r"photo_wrap[^\"]*\"[^>]*background-image:url\('([^']+)'\)")
RE_TEXT = re.compile(r'tgme_widget_message_text[^>]*>(.*?)</div>', re.S)
RE_TAG = re.compile(r'<[^>]+>')
RE_SUBS = re.compile(r'counter_value">([^<]+)</span> <span class="counter_type">subscribers')
                                                                                    
                                                                       
RE_REACT = re.compile(r'<span class="tgme_reaction[^"]*">(.*?)</span>', re.S)
RE_REACT_NUM = re.compile(r'([\d.,]+[KkMm]?)\s*$')
                                                                        
RE_CARD_SUBS = re.compile(r'tgme_page_extra">([^<]*?)subscribers', re.S)
RE_CARD_TITLE = re.compile(r'tgme_page_title[^>]*>\s*<span[^>]*>(.*?)</span>', re.S)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def fetch_until(url: str, marker: str, tries: int = 4, pause: float = 2.0) -> str:
    """Читает страницу, пока в ней не окажется нужный кусок разметки.

    Telegram отдаёт один и тот же адрес по-разному: то ленту постов, то голый
    лендинг приложения без единой цифры. С одной попытки живой канал регулярно
    выглядит как закрытый, поэтому пробуем несколько раз, прежде чем поверить.
    """
    html = ""
    for i in range(tries):
        html = fetch(url)
        if marker in html:
            return html
        if i + 1 < tries:
            time.sleep(pause)
    return html


def num_short(s: str | None) -> int | None:
    """«67» в 67, «1.2K» в 1200, «15.3K» в 15300, «1M» в 1000000."""
    if not s:
        return None
    s = s.strip().replace(" ", "").replace(",", ".").upper()
    mult = 1
    if s.endswith("K"):
        mult, s = 1000, s[:-1]
    elif s.endswith("M"):
        mult, s = 1000000, s[:-1]
    try:
        return int(float(s) * mult)
    except ValueError:
        return None


def clean_text(raw: str | None) -> str:
    if not raw:
        return ""
    txt = raw.replace("<br/>", "\n").replace("<br>", "\n")
    return html_mod.unescape(RE_TAG.sub("", txt)).strip()


def tg_reactions(block):
    values=[]
    for item in RE_REACT.findall(block):
        match=RE_REACT_NUM.search(clean_text(item))
        value=num_short(match.group(1)) if match else None
        if value is not None:values.append(value)
    return sum(values) if values else None


def tg_parse(html,channel):
    posts=[]
    for block in RE_BLOCK.split(html)[1:]:
        match=re.search(r'data-post="([^/"]+)/(\d+)"',block)
        if not match or match.group(1).lower()!=channel.lower():continue
        identifier=match.group(2);date_match=RE_DATE.search(block);date=None
        if date_match:date=datetime.fromisoformat(date_match.group(1).replace('Z','+00:00')).astimezone(MSK).strftime('%Y-%m-%d')
        title=RE_TEXT.search(block);views=RE_VIEWS.search(block)
        posts.append({'postId':identifier,'url':f'https://t.me/{channel}/{identifier}','date':date,
                      'kind':'clip' if RE_VIDEO.search(block) else 'photo' if RE_PHOTO.search(block) else 'post',
                      'title':clean_text(title.group(1) if title else '')[:300],
                      'views':num_short(views.group(1)) if views else None,'likes':tg_reactions(block),'shares':None,'comments':None})
    return posts


def tg_card(channel: str) -> dict:
    """Обычная страница канала: имя и подписчики.

    Нужна там, где лента t.me/s/ закрыта. Так бывает у каналов с запретом на
    копирование контента: сам канал публичный и подписчики на карточке видны,
    а превью постов Telegram не отдаёт. Лучше показать хотя бы подписчиков,
    чем оставить карточку пустой.
    """
    html = fetch_until(f"https://t.me/{channel}", "tgme_page_extra")
    subs = RE_CARD_SUBS.search(html)
    title = RE_CARD_TITLE.search(html)
    return {"subs": num_short(subs.group(1)) if subs else None,
            "title": clean_text(title.group(1)) if title else None}


def tg_public(acc,deep=False):
    channel=acc['handle'];html=fetch_until(f'https://t.me/s/{channel}','tgme_widget_message_wrap')
    if 'tgme_widget_message_wrap' not in html:
        if not all(marker in html for marker in ('tgme_page_wrap','tgme_page_extra','tgme_page_action')):
            raise RuntimeError('разметка не распознана, публикации не разобраны')
        card=tg_card(channel)
        if card['subs'] is None:raise RuntimeError('канал не найден или недоступен')
        push_snap(acc['id'],subs=card['subs'],extra={'title':card['title'],'feed':'closed'})
        raise Partial('подписчики сняты, лента постов закрыта настройками канала')
    subs=RE_SUBS.search(html);title=re.search(r'<meta property="og:title" content="([^"]*)"',html)
    seen=[];before=None;pages=0;limit=12 if deep else 3
    while pages<limit:
        page=html if before is None else fetch_until(f'https://t.me/s/{channel}?before={before}','tgme_widget_message_wrap',tries=2)
        posts=tg_parse(page,channel)
        if not posts:
            known_end=pages>0 and 'tgme_channel_info' in page and 'tgme_widget_message_wrap' not in page
            if page.strip() and not known_end:raise RuntimeError('разметка не распознана, публикации не разобраны')
            break
        seen.extend(posts);next_before=min(int(p['postId']) for p in posts)
        if before is not None and next_before>=before:break
        before=next_before;pages+=1
        if before<=1:break
        time.sleep(PAGE_PAUSE)
    push_posts(acc['id'],seen)
    push_snap(acc['id'],subs=num_short(subs.group(1)) if subs else None,viewsSum=views_total(seen),
              extra={'title':html_mod.unescape(title.group(1)) if title else channel})
    return len({p['postId'] for p in seen})


                                                                               
                                                                            
                                                                         
                                       

def tg_mtproto(acc):
    try:
        from telethon.sync import TelegramClient
        from telethon.tl.functions.stats import GetBroadcastStatsRequest
    except ImportError:raise RuntimeError('личная статистика Telegram не настроена')
    api_id,api_hash=secret('tg_api_id'),secret('tg_api_hash')
    if not api_id or not api_hash:raise RuntimeError('личная статистика Telegram не подключена')
    private=Path(os.environ.get('LOCUS_MEDIA_PRIVATE_DIR','/var/lib/locus-novyj')).resolve()
    configured=secret('tg_session_path') or str(private/'media-tg.session')
    session=Path(configured if str(configured).endswith('.session') else str(configured)+'.session').resolve()
    if str(private).startswith(('/var/lib/locus/','/var/www/locus/')) or private==session or private not in session.parents:
        raise RuntimeError('сессия личной статистики должна принадлежать новому Локусу')
    if not session.is_file():raise RuntimeError('для личной статистики нужна готовая сессия владельца канала')
    telegram=TelegramClient(str(session),int(api_id),api_hash)
    try:
        telegram.connect()
        if not telegram.is_user_authorized():raise RuntimeError('сессия владельца канала не авторизована')
        stats=telegram(GetBroadcastStatsRequest(channel=telegram.get_entity(acc['handle'])))
        followers=stats.followers.current;reach=stats.views_per_post.current
        push_snap(acc['id'],subs=int(followers) if followers is not None else None,reach=int(reach) if reach is not None else None,
                  extra={'sharesPerPost':stats.shares_per_post.current,
                         'reactionsPerPost':getattr(stats,'reactions_per_post',None) and stats.reactions_per_post.current,
                         'enabledNotifications':stats.enabled_notifications.part})
    finally:telegram.disconnect()
    return 1


                                                                               
                                                                                 
                                                                         
                                                                                    

SC_BASE = "https://api.scrapecreators.com"
SC_PAGES = 3                                                                            
SC_PAGES_DEEP = 8


def sc_get(path: str, params: dict, tries: int = 3) -> dict:
    """Запрос к ScrapeCreators с повтором.

    Instagram периодически отбивает запросы поставщика, и тот отвечает пятисотой
    с текстом «IG is blocking us, try again». Это не поломка и не конец кредитов:
    со второй попытки тот же профиль может отдаться целиком.
    """
    key = secret("scrapecreators_key")
    if not key:
        raise RuntimeError("нет ключа scrapecreators_key")
    url = SC_BASE + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"x-api-key": key, "Accept": "application/json"})
    last = ""
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data=json.loads(resp.read().decode("utf-8"))
                if not isinstance(data,dict):raise ValueError('not an object')
                return data
        except urllib.error.HTTPError as e:
            last = provider_error(e,'ScrapeCreators')
            if e.code < 500:
                break
        except urllib.error.URLError as e:
            last = f"сеть: {e}"
        except ValueError:
            raise RuntimeError('разметка не распознана, ответ источника не разобран')
        if i + 1 < tries:
            time.sleep(3 * (i + 1))
    raise RuntimeError(last or "ScrapeCreators не ответил")


def ig_scrape(acc,deep=False):
    handle=acc['handle'];profile=sc_get('/v1/instagram/profile',{'handle':handle})
    user=(profile.get('data') or {}).get('user') or profile.get('user') or {}
    if user.get('username') and user['username'].lower()!=handle.lower():raise RuntimeError('источник вернул другой аккаунт')
    subs=client.counter((user.get('edge_followed_by') or {}).get('count'))
    total=client.counter((user.get('edge_owner_to_timeline_media') or {}).get('count'))
    if subs is None and total is None:raise RuntimeError('профиль не найден или недоступен')
    if user.get('is_private'):
        push_snap(acc['id'],subs=subs,posts=total,extra={'title':user.get('full_name')});raise Partial('подписчики сняты, публикации закрыты настройками профиля')
    if total==0:
        push_snap(acc['id'],subs=subs,posts=0,extra={'title':user.get('full_name')});raise Partial('профиль пуст, публикаций нет')
    posts=[];next_id=None;pages=0;limit=SC_PAGES_DEEP if deep else SC_PAGES
    while pages<limit:
        params={'handle':handle}
        if next_id:params['next_max_id']=next_id
        page=sc_get('/v2/instagram/user/posts',params);items=page.get('items')
        if not isinstance(items,list):raise RuntimeError('разметка не распознана, публикации не разобраны')
        if not items:break
        for item in items:
            if not isinstance(item,dict) or not item.get('code'):raise RuntimeError('разметка не распознана, нет id публикации')
            code=item['code'];product=(item.get('product_type') or '').lower();media_type=item.get('media_type')
            date=datetime.fromtimestamp(int(item['taken_at']),tz=MSK).strftime('%Y-%m-%d') if item.get('taken_at') is not None else None
            views=item.get('play_count') if item.get('play_count') is not None else item.get('ig_play_count')
            kind='clip' if product=='clips' else 'video' if media_type==2 else 'carousel' if media_type==8 else 'photo' if media_type==1 else None
            posts.append({'postId':code,'url':item.get('url') or f'https://www.instagram.com/p/{code}/','date':date,'kind':kind,
                          'title':((item.get('caption') or {}).get('text') or '')[:300],
                          'views':client.counter(views),'likes':client.counter(item.get('like_count')),'comments':client.counter(item.get('comment_count'))})
        next_id=page.get('next_max_id');pages+=1
        if not next_id:break
        time.sleep(0.6)
    if not posts:raise RuntimeError('разметка не распознана, публикации не разобраны')
    push_posts(acc['id'],posts);push_snap(acc['id'],subs=subs,posts=total,viewsSum=views_total(posts),extra={'title':user.get('full_name')})
    return len({p['postId'] for p in posts})


                                                                               
                                                        

APIFY_ACTOR = "apify~instagram-scraper"
APIFY_URL = "https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items"
IG_LIMIT = 24


def ig_apify(acc,deep=False):
    token=secret('apify_token')
    if not token:raise RuntimeError('запасной источник Instagram не подключён')
    payload={'directUrls':[f"https://www.instagram.com/{acc['handle']}/"],'resultsType':'posts','resultsLimit':60 if deep else IG_LIMIT,'addParentData':True}
    url=APIFY_URL.format(actor=APIFY_ACTOR)+'?'+urllib.parse.urlencode({'token':token})
    request=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=300) as response:items=json.load(response)
    except urllib.error.HTTPError as error:raise RuntimeError(provider_error(error,'Apify')) from error
    except ValueError as error:raise RuntimeError('разметка не распознана, ответ источника не разобран') from error
    if not isinstance(items,list) or not items:raise RuntimeError('разметка не распознана, публикации не разобраны')
    posts=[];subs=None
    for item in items:
        if not isinstance(item,dict):raise RuntimeError('разметка не распознана, публикации не разобраны')
        if subs is None:
            value=item.get('followersCount') if item.get('followersCount') is not None else (item.get('owner') or {}).get('followersCount')
            subs=client.counter(value)
        code=item.get('shortCode') or item.get('shortcode')
        if not code:
            if item.get('postsCount')==0 and subs is not None:
                push_snap(acc['id'],subs=subs,posts=0);raise Partial('профиль пуст, публикаций нет')
            raise RuntimeError('разметка не распознана, нет id публикации')
        date=None
        if item.get('timestamp'):
            date=datetime.fromisoformat(str(item['timestamp']).replace('Z','+00:00')).astimezone(MSK).strftime('%Y-%m-%d')
        kind='clip' if item.get('productType')=='clips' else 'video' if item.get('type')=='Video' else 'carousel' if item.get('type') in ('Sidecar','Carousel') else 'photo' if item.get('type')=='Image' else None
        views=item.get('videoPlayCount') if item.get('videoPlayCount') is not None else item.get('videoViewCount')
        posts.append({'postId':code,'url':f'https://www.instagram.com/p/{code}/','date':date,'kind':kind,'title':(item.get('caption') or '')[:300],
                      'views':client.counter(views),'likes':client.counter(item.get('likesCount')),'comments':client.counter(item.get('commentsCount'))})
    push_posts(acc['id'],posts);push_snap(acc['id'],subs=subs,viewsSum=views_total(posts))
    return len({p['postId'] for p in posts})


                                                                               
                                                                       
                                                          

GRAPH = "https://graph.facebook.com/v21.0"


def graph_get(path: str, params: dict) -> dict:
    url = f"{GRAPH}/{path}?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(provider_error(e,'Graph')) from e
    except ValueError as error:raise RuntimeError('разметка не распознана, ответ источника не разобран') from error


def ig_graph(acc):
    token=secret('ig_graph_token');identifier=secret('ig_user_id_'+acc['handle']) or secret('ig_user_id')
    if not token or not identifier:raise RuntimeError('личная статистика Instagram не подключена')
    profile=graph_get(identifier,{'fields':'followers_count,media_count','access_token':token})
    insights=graph_get(f'{identifier}/insights',{'metric':'reach,profile_views,accounts_engaged','period':'day','metric_type':'total_value','access_token':token})
    values={row['name']:(row.get('total_value') or {}).get('value') for row in insights.get('data',[])}
    push_snap(acc['id'],subs=profile.get('followers_count'),posts=profile.get('media_count'),reach=values.get('reach'),extra={'profileViews':values.get('profile_views'),'engaged':values.get('accounts_engaged')})
    if profile.get('media_count')==0:raise Partial('личная статистика снята, публикаций нет')
    media=graph_get(f'{identifier}/media',{'fields':'id,permalink,timestamp,caption,media_product_type,like_count,comments_count,insights.metric(views,reach,saved,shares)','limit':25,'access_token':token})
    if not isinstance(media.get('data'),list) or not media['data']:raise RuntimeError('разметка не распознана, публикации не разобраны')
    posts=[]
    for item in media['data']:
        if not item.get('id'):raise RuntimeError('разметка не распознана, нет id публикации')
        metrics={row['name']:(row.get('values') or [{}])[0].get('value') for row in (item.get('insights') or {}).get('data',[])}
        date=datetime.fromisoformat(item['timestamp'].replace('+0000','+00:00')).astimezone(MSK).strftime('%Y-%m-%d') if item.get('timestamp') else None
        posts.append({'postId':str(item['id']),'url':item.get('permalink'),'date':date,'kind':'clip' if item.get('media_product_type')=='REELS' else None,
                      'title':(item.get('caption') or '')[:300],'views':metrics.get('views'),'reach':metrics.get('reach'),'saves':metrics.get('saved'),
                      'shares':metrics.get('shares'),'likes':item.get('like_count'),'comments':item.get('comments_count')})
    push_posts(acc['id'],posts)
    return len(posts)


                                                                               

PUBLIC = {"telegram": tg_public, "instagram": ig_scrape}
                                                                         
                                                   
FALLBACK = {"instagram": ig_apify}
PRIVATE = {"mtproto": tg_mtproto, "graph": ig_graph}


def run_one(acc, deep=False):
    fn=PUBLIC.get(acc['platform'])
    if fn is None:
        def fn(account,deep):
            raise RuntimeError('platform is not supported by this collector')
    ok=client.run_source(acc,'public',fn,deep,Partial,FALLBACK.get(acc['platform']))
    extra=acc.get('source')
    if extra in PRIVATE and not acc.get('_configuration_error'):
        private=client.run_source(acc,extra,lambda account,unused:PRIVATE[extra](account),False,Partial)
        ok=private and ok
    return ok


def main():
    parser=argparse.ArgumentParser(description='New Locus media collector')
    parser.add_argument('--all',action='store_true')
    parser.add_argument('--acc')
    parser.add_argument('--deep',action='store_true')
    parser.add_argument('--only',choices=['telegram','instagram'])
    parser.add_argument('--pending',action='store_true')
    args=parser.parse_args()
    if not args.all and not args.acc and not args.pending:
        parser.print_help();return 1
    def execute():
        selected=accounts(args.acc,args.pending)
        if args.only:selected=[a for a in selected if a['platform']==args.only]
        ok=True
        for account in selected:ok=run_one(account,args.deep) and ok
        return 0 if ok else 1
    return client.locked_run(execute)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(client.safe_error(error),file=sys.stderr)
        sys.exit(1)
