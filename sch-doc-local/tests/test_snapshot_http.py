"""Local API flow with synthetic records in an isolated temporary database."""
import json
import threading
import time
import urllib.error
import urllib.request
import zipfile
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
import app
from snapshot_export import SnapshotJobs
import test_snapshot_export


class SnapshotHttpTests(unittest.TestCase):
    setUp = test_snapshot_export.SnapshotTests.setUp
    sample = test_snapshot_export.SnapshotTests.sample
    def test_http_manual_auth_status_and_result(self):
        sid=self.sample()
        original_store,original_jobs=app.STORE,app.SNAPSHOTS
        app.STORE=self.store
        app.SNAPSHOTS=SnapshotJobs(self.store)
        server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        base=f'http://127.0.0.1:{server.server_port}'
        def get(path):
            with op.open(base+path,timeout=5) as response:return json.load(response)
        def post(path,body,token=app.TOKEN,origin=None):
            headers={'Content-Type':'application/json','X-App-Token':token}
            if origin:headers['Origin']=origin
            req=urllib.request.Request(base+path,json.dumps(body).encode(),headers)
            with op.open(req,timeout=5) as response:return json.load(response)
        try:
            for _ in range(3):self.assertFalse(get('/api/snapshot-status')['running'])
            self.assertFalse((self.store.root/'snapshot').exists())
            for token,origin in [('wrong',None),(app.TOKEN,'https://other.example')]:
                with self.assertRaises(urllib.error.HTTPError) as exc:post('/api/snapshot-start',{'mode':'all'},token,origin)
                self.assertEqual(exc.exception.code,403)
            with patch('app.pick_directory',return_value={'cancelled':True,'directory':str(self.store.root/'snapshot')}):
                self.assertTrue(post('/api/snapshot-pick-directory',{})['cancelled'])
            self.assertFalse((self.store.root/'snapshot').exists())
            result=post('/api/snapshot-start',{'mode':'selected','ids':[sid]})
            self.assertTrue(result['ok'])
            for _ in range(100):
                status=get('/api/snapshot-status')
                if not status['running']:break
                time.sleep(.02)
            self.assertFalse(status['running'])
            self.assertFalse(status['error'])
            self.assertEqual(status['result']['count'],1)
            with zipfile.ZipFile(status['result']['path']) as z:self.assertIsNone(z.testzip())
            before=list((self.store.root/'snapshot').iterdir())
            for _ in range(3):get('/api/snapshot-status')
            self.assertEqual(before,list((self.store.root/'snapshot').iterdir()))
            post('/api/snapshot-start',{'mode':'selected','ids':[]})
            for _ in range(100):
                status=get('/api/snapshot-status')
                if not status['running']:break
                time.sleep(.02)
            self.assertTrue(status['error'])
            self.assertEqual(before,list((self.store.root/'snapshot').iterdir()))
        finally:
            server.shutdown()
            server.server_close()
            app.STORE,app.SNAPSHOTS=original_store,original_jobs
