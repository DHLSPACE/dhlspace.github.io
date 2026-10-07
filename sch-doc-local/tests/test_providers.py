import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from storage import Store
from providers import Providers, NoRedirect


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store=Store(Path(self.temp.name))

    def test_credentials_never_reach_state_or_export(self):
        for key in ['search_api_key','gemini_api_key']:
            self.store.execute('INSERT INTO settings VALUES (?,?)',(key,json.dumps('private-test-value')))
        public=self.store.public_settings()
        self.assertTrue(public['gemini_api_configured'])
        self.assertTrue(public['search_api_configured'])
        self.assertNotIn('private-test-value',json.dumps(public))
        folder=self.store.export()
        self.assertNotIn('private-test-value',(folder/'完整数据.json').read_text('utf-8'))

    def test_no_api_redirects(self):
        with self.assertRaises(ValueError):NoRedirect().redirect_request(None,None,302,'',{},'https://other.example')

    def test_summary_uses_bounded_evidence_and_rejects_empty_generation(self):
        provider=Providers(self.store)
        with patch.object(provider,'request',return_value={'candidates':[{'content':{'parts':[{'text':'AI辅助；日期待核实'}]}}]}) as request:
            result=provider.summarize('a'*30000,'https://school.edu.cn/notice',model='gemini-3.5-flash-lite')
            self.assertEqual(result['url'],'https://school.edu.cn/notice')
            self.assertLess(len(request.call_args.args[2]['contents'][0]['parts'][0]['text']),17000)
            self.assertIn('待核实',result['text'])
        with patch.object(provider,'request',return_value={}):
            with self.assertRaises(ValueError):provider.summarize('evidence','https://school.edu.cn',model='gemini-3.5-flash-lite')

    def test_model_path_not_user_controlled_url(self):
        with self.assertRaises(ValueError):Providers(self.store).summarize('text','source',model='../../other')

if __name__=='__main__':unittest.main()
