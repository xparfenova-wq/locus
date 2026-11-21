# -*- coding: utf-8 -*-
"""Offline contracts for provider parsing and durable delivery; no real credentials."""
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector import locus_client as client,media_collect as media

ACCOUNT={'id':123,'platform':'instagram','ploshadka':'instagram','handle':'fixture',
         'akkaunt_sha256':'a'*64,'source':'public'}
KEY='fixture-collector-key-000000000001'

class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'LOCUS_KLJUCH_SBORA':KEY,'LOCUS_BASE':'http://127.0.0.1:8791',
            'LOCUS_MEDIA_QUEUE':self.temp.name+'/queue','LOCUS_MEDIA_SECRETS':self.temp.name+'/secrets.json'},clear=False)
        self.env.start()
        self.batch=client.new_batch(ACCOUNT,'public');self.token=client.CURRENT.set(self.batch)
    def tearDown(self):
        client.CURRENT.reset(self.token);self.env.stop();self.temp.cleanup()
    def account(self,platform='instagram'):
        account={**ACCOUNT,'platform':platform,'ploshadka':platform}
        self.batch['account']=account
        return account
    def ack(self,method,path,body):return {'id':7,'kljuch_zapuska':body['kljuch_zapuska']}
    def telegram_html(self,views='0',reaction='',channel='fixture'):
        return ('<div class="tgme_widget_message_wrap"><div data-post="'+channel+'/1">'
            '<time datetime="2026-01-01T22:30:00Z"></time>'
            '<span class="tgme_widget_message_views">'+views+'</span>'+reaction+'</div></div>')

    def test_known_zero_is_not_unknown(self):
        client.push_snap(123,subs=0,posts=None,viewsSum=-1,extra={'title':'fixture','missing':None})
        client.push_posts(123,[{'postId':'9007199254740993','views':0,'likes':None,'comments':-1}])
        self.assertEqual(self.batch['snapshot'],{'podpischikov':0,'extra':{'title':'fixture'}})
        self.assertEqual(self.batch['posts']['9007199254740993'],{'publikacija_id':'9007199254740993','prosmotrov':0})
        self.assertIsNone(media.views_total([{'views':None},{'views':-1}]))
        self.assertEqual(media.views_total([{'views':0}]),0)

    def test_telegram_channel_identity_and_unknown_reactions(self):
        posts=media.tg_parse(self.telegram_html(),'fixture')
        self.assertEqual(posts[0]['views'],0);self.assertIsNone(posts[0]['likes'])
        self.assertEqual(posts[0]['date'],'2026-01-02')
        self.assertEqual(media.tg_parse(self.telegram_html(channel='forwarded'),'fixture'),[])
        self.assertEqual(media.tg_reactions('<span class="tgme_reaction">👍 0</span>'),0)
        self.assertIsNone(media.tg_reactions('<span class="tgme_reaction">👍</span>'))

    def test_telegram_nonempty_changed_markup_fails_without_writing(self):
        account=self.account('telegram')
        for content in ('<html>new markup</html>','<div class="tgme_widget_message_wrap">changed</div>'):
            with self.subTest(content=content),patch.object(media,'fetch_until',return_value=content):
                with self.assertRaisesRegex(RuntimeError,'разметка'):media.tg_public(account)
        self.assertEqual(self.batch['snapshot'],{});self.assertEqual(self.batch['posts'],{})

    def test_explicit_closed_telegram_feed_keeps_only_known_statistics(self):
        account=self.account('telegram')
        content='<div class="tgme_page_wrap tgme_page_extra tgme_page_action"></div>'
        with patch.object(media,'fetch_until',return_value=content),patch.object(media,'tg_card',return_value={'subs':0,'title':None}):
            with self.assertRaises(media.Partial):media.tg_public(account)
        self.assertEqual(self.batch['snapshot']['podpischikov'],0)
        self.assertNotIn('title',self.batch['snapshot']['extra']);self.assertEqual(self.batch['posts'],{})

    def profile(self,total=1):return {'data':{'user':{'username':'fixture','edge_followed_by':{'count':0},'edge_owner_to_timeline_media':{'count':total}}}}

    def test_scrape_zero_play_count_does_not_fall_back_to_other_value(self):
        page={'items':[{'code':'ExactCode','play_count':0,'ig_play_count':99,'like_count':0,'comment_count':-1,'media_type':2}]}
        with patch.object(media,'sc_get',side_effect=[self.profile(),page]):self.assertEqual(media.ig_scrape(ACCOUNT),1)
        post=self.batch['posts']['ExactCode'];self.assertEqual(post['prosmotrov'],0)
        self.assertEqual(post['lajkov'],0);self.assertNotIn('kommentariev',post)
        self.assertEqual(self.batch['snapshot']['podpischikov'],0)

    def test_scrape_empty_feed_with_existing_posts_is_error(self):
        with patch.object(media,'sc_get',side_effect=[self.profile(),{'items':[]}]):
            with self.assertRaisesRegex(RuntimeError,'разметка'):media.ig_scrape(ACCOUNT)
        self.assertEqual(self.batch['snapshot'],{})
        with patch.object(media,'sc_get',return_value=self.profile(0)):
            with self.assertRaises(media.Partial):media.ig_scrape(ACCOUNT)
        self.assertEqual(self.batch['snapshot']['publikacij_vsego'],0)

    def test_scrape_retries_three_provider_failures(self):
        error=lambda:urllib.error.HTTPError('https://fixture.invalid',500,'fixture',{},io.BytesIO(b'fixture error'))
        with patch.object(media,'secret',return_value='fixture-provider-secret'),patch.object(media.urllib.request,'urlopen',side_effect=[error(),error(),io.BytesIO(b'{"ok":true}')]) as request,patch.object(media.time,'sleep'):
            self.assertTrue(media.sc_get('/fixture',{})['ok']);self.assertEqual(request.call_count,3)

    def test_provider_errors_are_readable_without_raw_credit_or_secret_fields(self):
        error=urllib.error.HTTPError('https://fixture.invalid',404,'fixture',{},io.BytesIO(b'{"credits_remaining":5552,"token":"fixture-secret"}'))
        message=media.provider_error(error,'Fixture provider')
        self.assertIn('HTTP 404',message);self.assertNotIn('credits',message);self.assertNotIn('5552',message);self.assertNotIn('fixture-secret',message)
        with patch.object(media,'secret',return_value='fixture-provider-secret'),patch.object(media.urllib.request,'urlopen',return_value=io.BytesIO(b'<html>changed provider response</html>')):
            with self.assertRaisesRegex(RuntimeError,'разметка'):media.sc_get('/fixture',{})

    def test_apify_zero_followers_and_views_preserved(self):
        items=[{'shortCode':'ExactCode','followersCount':0,'videoPlayCount':0,'videoViewCount':99,'likesCount':-1}]
        with patch.object(media,'secret',return_value='fixture-provider-secret'),patch.object(media.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(items).encode())):
            self.assertEqual(media.ig_apify(ACCOUNT),1)
        self.assertEqual(self.batch['snapshot']['podpischikov'],0)
        self.assertEqual(self.batch['posts']['ExactCode']['prosmotrov'],0)
        self.assertNotIn('lajkov',self.batch['posts']['ExactCode'])

    def test_graph_joins_by_exact_permalink_and_keeps_upstream_id(self):
        self.batch['body']['uroven']='graph'
        client.push_posts(123,[{'postId':'9007199254740993','url':'https://www.instagram.com/reel/Exact_Code/','views':0},
                               {'postId':'9007199254740995','url':None,'views':99}])
        self.assertEqual(list(self.batch['posts']),['Exact_Code'])
        self.assertEqual(self.batch['posts']['Exact_Code']['extra']['graph_id'],'9007199254740993')
        self.assertEqual(len(self.batch['warnings']),1)

    def test_transport_failure_does_not_rerun_paid_provider(self):
        calls=[]
        def provider(account,deep):calls.append('primary');client.push_snap(123,subs=12);return 0
        def fallback(account,deep):calls.append('fallback');return 0
        with patch.object(client,'api',side_effect=client.RemoteError(503,'fixture offline')):
            with self.assertRaises(client.RemoteError):client.run_source(ACCOUNT,'public',provider,False,media.Partial,fallback)
        self.assertEqual(calls,['primary']);files=list(client.queue_directory().glob('*.json'));self.assertEqual(len(files),1)
        packet=json.loads(files[0].read_text());self.assertEqual(packet['body']['snimok']['podpischikov'],12)
        self.assertNotIn(KEY,files[0].read_text())
        self.assertEqual(files[0].stat().st_mode&0o777,0o600)

    def test_failure_before_fallback_does_not_leak_partial_primary_data(self):
        delivered=[]
        def primary(account,deep):client.push_snap(123,subs=99);raise RuntimeError('fixture provider error')
        def fallback(account,deep):client.push_snap(123,posts=0);raise media.Partial('empty fixture profile')
        def api(method,path,body):delivered.append(body);return self.ack(method,path,body)
        with patch.object(client,'api',side_effect=api):
            self.assertTrue(client.run_source(ACCOUNT,'public',primary,False,media.Partial,fallback))
        self.assertEqual(delivered[0]['snimok'],{'publikacij_vsego':0});self.assertIn('частичный',delivered[0]['primechanie'])

    def test_queue_retry_reuses_key_and_requires_matching_ack(self):
        body={**self.batch['body'],'uspeh':True,'snimok':{'podpischikov':12}}
        file=client.persist(body,123);received=[]
        def lost(method,path,payload):received.append(payload);raise client.RemoteError(0,'lost response after commit')
        with patch.object(client,'api',side_effect=lost):self.assertFalse(client.drain())
        self.assertTrue(file.exists())
        with patch.object(client,'api',return_value={'id':7,'kljuch_zapuska':'different'}):self.assertFalse(client.drain())
        def accepted(method,path,payload):received.append(payload);return self.ack(method,path,payload)
        with patch.object(client,'api',side_effect=accepted):self.assertTrue(client.drain())
        self.assertEqual(received,[body,body]);self.assertFalse(file.exists())

    def test_invalid_provider_packet_is_quarantined_and_failure_ack_checked(self):
        body={**self.batch['body'],'uspeh':True,'snimok':{'podpischikov':12}}
        file=client.persist(body,123);calls=[]
        def reject_then_bad_ack(method,path,payload):
            calls.append(payload)
            if len(calls)==1:raise client.RemoteError(422,'fixture invalid provider data')
            return {'id':7,'kljuch_zapuska':'wrong'}
        with patch.object(client,'api',side_effect=reject_then_bad_ack):self.assertFalse(client.drain())
        self.assertTrue((client.queue_directory()/'otklonennye'/file.name).exists())
        remaining=list(client.queue_directory().glob('*.json'));self.assertEqual(len(remaining),1)
        self.assertFalse(json.loads(remaining[0].read_text())['body']['uspeh'])
        with patch.object(client,'api',side_effect=self.ack):self.assertTrue(client.drain())

    def test_rejected_success_packet_is_reported_as_failure(self):
        client.push_snap(123,subs=12);calls=[]
        def reject_then_ack(method,path,payload):
            calls.append(payload)
            if payload.get('uspeh'):raise client.RemoteError(422,'fixture rejection')
            return self.ack(method,path,payload)
        with patch.object(client,'api',side_effect=reject_then_ack):
            self.assertFalse(client.push_run(123,'public',True,0))
        self.assertEqual(len(calls),2);self.assertFalse(calls[1]['uspeh'])

    def test_auth_failure_retains_queue_and_does_not_contact_providers(self):
        body={**self.batch['body'],'uspeh':False,'poluchen':0};file=client.persist(body,123)
        with patch.object(client,'api',side_effect=client.RemoteError(401,'fixture denied')):
            with patch.object(media,'run_one') as provider:
                self.assertEqual(client.locked_run(lambda:provider(ACCOUNT)),1);provider.assert_not_called()
        self.assertTrue(file.exists())

    def test_busy_worker_requests_retry_instead_of_losing_scheduled_run(self):
        import fcntl
        with (client.queue_directory()/'.worker.lock').open('a') as first:
            fcntl.flock(first,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch.object(client,'api') as request:
                self.assertEqual(client.locked_run(lambda:self.fail('a second provider worker started')),75)
                request.assert_not_called()

    def test_safe_configuration_and_redaction(self):
        for url in ('http://127.0.0.1:8787','https://external.invalid','http://key:password@127.0.0.1:8791','http://127.0.0.1:8791/api'):
            with patch.dict(os.environ,{'LOCUS_BASE':url}):
                with self.assertRaises(RuntimeError):client.configuration()
        for folder in ('/var/www/locus/db/queue','/var/lib/locus/queue'):
            with patch.dict(os.environ,{'LOCUS_MEDIA_QUEUE':folder}):
                with self.assertRaises(RuntimeError):client.queue_directory()
        message=client.safe_error('<h1>Error</h1>\n token=fixture-secret '+KEY)
        self.assertNotIn(KEY,message);self.assertNotIn('fixture-secret',message);self.assertNotIn('<h1>',message)
        with self.assertRaises(RuntimeError):client.api('GET','/api/ljudi')

    def test_http_api_retry_keeps_packet_and_blocks_redirects(self):
        body={**self.batch['body'],'uspeh':False};requests=[]
        class Opener:
            def open(inner,request,timeout):
                requests.append(request)
                if len(requests)==1:raise urllib.error.URLError('lost response')
                return io.BytesIO(json.dumps(self.ack('POST','',body)).encode())
        with patch.object(client.urllib.request,'build_opener',return_value=Opener()) as factory,patch.object(client.time,'sleep'):
            self.assertEqual(client.api('POST','/api/akkaunty/123/prinjat_sbor',body)['id'],7)
        self.assertEqual(requests[0].data,requests[1].data)
        self.assertEqual(requests[0].get_header('X-locus-sborschik'),KEY)
        handler=factory.call_args[0][0]()
        self.assertIsNone(handler.redirect_request(None,None,302,'fixture',{},'https://external.invalid'))

    def test_existing_authorized_telegram_session_without_interactive_login(self):
        private=Path(self.temp.name)/'private';private.mkdir();session=private/'media-tg.session';session.write_bytes(b'fixture')
        calls=[]
        class Telegram:
            def __init__(inner,*args):calls.append(('init',args[0]))
            def connect(inner):calls.append('connect')
            def is_user_authorized(inner):return False
            def disconnect(inner):calls.append('disconnect')
        modules={'telethon':types.ModuleType('telethon'),'telethon.sync':types.ModuleType('telethon.sync'),
            'telethon.tl':types.ModuleType('telethon.tl'),'telethon.tl.functions':types.ModuleType('telethon.tl.functions'),
            'telethon.tl.functions.stats':types.ModuleType('telethon.tl.functions.stats')}
        modules['telethon.sync'].TelegramClient=Telegram
        modules['telethon.tl.functions.stats'].GetBroadcastStatsRequest=lambda **kwargs:kwargs
        secrets={'tg_api_id':'123','tg_api_hash':'fixture-hash','tg_session_path':str(session)}
        with patch.dict(sys.modules,modules),patch.dict(os.environ,{'LOCUS_MEDIA_PRIVATE_DIR':str(private)}),patch.object(media,'secret',side_effect=lambda key:secrets.get(key,'')):
            with self.assertRaisesRegex(RuntimeError,'не авторизована'):media.tg_mtproto(self.account('telegram'))
        self.assertEqual(calls,[('init',str(session.resolve())),'connect','disconnect'])

if __name__=='__main__':unittest.main()
