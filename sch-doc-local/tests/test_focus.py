import unittest
from focus import classify, relevant, enrich
from sources.parser import canonical, article


class FocusTests(unittest.TestCase):
    def test_ncu_home_and_target_are_distinct(self):
        source={'school':'南昌大学','name':'南昌大学化学化工学院 · 通知公告'}
        self.assertEqual(classify(source,'2027年推荐优秀应届本科毕业生免试攻读研究生工作办法')['scope'],'本校')
        self.assertEqual(classify(source,'2027年接收推荐免试硕士研究生通知')['scope'],'目标')
        self.assertEqual(classify({'school':'天津大学','name':'天津大学'},'2027年推荐免试工作')['scope'],'目标')

    def test_no_crawl_year_used_as_admission_year(self):
        source={'school':'南昌大学','name':'南昌大学研究生院'}
        row=classify(source,'2027年硕士招生简章','2026-09-18')
        self.assertEqual(row['year'],'2027')
        self.assertEqual(row['publication_year'],'2026')
        self.assertEqual(classify(source,'关于复试的通知','2026-09-18')['year'],'待核实')
        self.assertEqual(classify(source,'2026与2027年招生计划对照')['year'],'跨年')

    def test_irrelevant_departments_and_policy_notices(self):
        for title in ['2027年美术学院硕士复试通知','音乐学院招生简章','2026年普通高校招生报名','2026年博士招生简章']:
            self.assertFalse(relevant(title),title)
        for title in ['2027年化学学院复试细则','2026年硕士研究生招生考试网上报名公告','2027年接收推免硕士及直博生通知','生物化学专业复试通知']:
            self.assertTrue(relevant(title),title)

    def test_policy_and_institute_categories(self):
        self.assertEqual(classify({'school':'辽宁招生考试之窗','name':'研考公告','source_type':'监管机构'},'硕士招生')['level'],'地方政策')
        self.assertEqual(classify({'school':'中科院过程工程研究所','name':'硕士招生'},'2027年硕士招生')['level'],'研究所')

    def test_official_cas_dot_segments_and_empty_attrs(self):
        self.assertEqual(canonical('https://cib.cas.cn/../../yjsjy/'),'https://cib.cas.cn/yjsjy/')
        self.assertEqual(canonical('/../zs/','https://cib.cas.cn/'),'https://cib.cas.cn/zs/')
        self.assertEqual(canonical(None),'')
        self.assertIn('正文',article('<div class id>正文</div>','https://example.org/')[0])

if __name__=='__main__':unittest.main()
