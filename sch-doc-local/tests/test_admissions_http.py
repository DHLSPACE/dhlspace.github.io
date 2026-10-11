"""Revision polling observes changes without loading or modifying source records."""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import app
from storage import Store


class AdmissionsHttpTests(unittest.TestCase):
    def test_local_listener_cannot_be_duplicated(self):
        server=app.LocalHTTPServer(('127.0.0.1',0),app.Handler)
        try:
            with self.assertRaises(OSError):
                app.LocalHTTPServer(('127.0.0.1',server.server_port),app.Handler)
        finally:
            server.server_close()

    def test_startup_replaces_only_idle_old_instance(self):
        root = Path('isolated-startup-fixture')
        for label, health, busy, expected in [
            ('old-idle', {'app':'graduate-archive','root':str(root)}, False, 'replace'),
            ('current', {'app':'graduate-archive','root':str(root),'ui_version':app.UI_VERSION}, False, 'reuse'),
            ('old-busy', {'app':'graduate-archive','root':str(root)}, True, 'reject'),
            ('other-root', {'app':'graduate-archive','root':'another-directory'}, False, 'reject'),
        ]:
            with self.subTest(label=label):
                requests=[]
                class RunningInstance(BaseHTTPRequestHandler):
                    def log_message(self, *args):
                        pass
                    def do_GET(self):
                        requests.append(self.path)
                        body=json.dumps(health if self.path=='/api/health' else {
                            'token':'fixture-only-token','job':{'running':busy}}).encode()
                        self.send_response(200)
                        self.end_headers()
                        self.wfile.write(body)
                    def do_POST(self):
                        requests.append(self.path)
                        self.assert_token=self.headers.get('X-App-Token')=='fixture-only-token'
                        self.server.authenticated=self.assert_token
                        self.send_response(200 if self.assert_token else 403)
                        self.end_headers()
                        self.wfile.write(b'{"ok":true}')
                        def stop():
                            self.server.shutdown()
                            self.server.server_close()
                        threading.Thread(target=stop,daemon=True).start()
                old=ThreadingHTTPServer(('127.0.0.1',0),RunningInstance)
                thread=threading.Thread(target=old.serve_forever,daemon=True)
                thread.start()
                replacement=None
                try:
                    if expected=='reject':
                        with self.assertRaises(RuntimeError):
                            app.open_local_server(root,old.server_port)
                    else:
                        replacement=app.open_local_server(root,old.server_port)
                        if expected=='reuse':
                            self.assertIsNone(replacement)
                        else:
                            self.assertIsInstance(replacement,ThreadingHTTPServer)
                            self.assertTrue(old.authenticated)
                    self.assertEqual('/api/stop' in requests,expected=='replace')
                finally:
                    if replacement is not None:
                        replacement.server_close()
                    old.shutdown()
                    old.server_close()
                    thread.join(timeout=3)

    def test_revision_and_static_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Store(Path(folder))
            original = app.STORE
            app.STORE = store
            server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            base = f'http://127.0.0.1:{server.server_port}'

            def revision():
                with opener.open(base + '/api/revision', timeout=5) as response:
                    return json.load(response)['revision']

            try:
                with opener.open(base + '/api/health', timeout=5) as response:
                    self.assertEqual(json.load(response)['ui_version'],app.UI_VERSION)
                first = revision()
                self.assertEqual(first, revision())
                # No archive, collection or exports are started by polling.
                self.assertEqual(store.query('SELECT * FROM snapshots'), [])
                self.assertFalse((store.root / 'snapshot').exists())
                store.execute("INSERT OR REPLACE INTO settings VALUES ('target_year','2029')")
                second = revision()
                self.assertNotEqual(first, second)
                self.assertEqual(second, revision())
                old_message = app.STATE['message']
                try:
                    app.STATE['message'] = 'revision-test'
                    self.assertNotEqual(second, revision())
                finally:
                    app.STATE['message'] = old_message
                for path, content_type in [('/admissions.js', 'text/javascript'),
                                           ('/admissions-model.js', 'text/javascript'),
                                           ('/admissions.css', 'text/css')]:
                    with opener.open(base + path, timeout=5) as response:
                        self.assertEqual(response.status, 200)
                        self.assertIn(content_type, response.headers['Content-Type'])
                        self.assertGreater(len(response.read()), 100)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)
                app.STORE = original


if __name__ == '__main__':
    unittest.main()
