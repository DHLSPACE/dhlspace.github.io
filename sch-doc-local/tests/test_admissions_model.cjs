const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../static/admissions-model.js');

assert.equal(model.routeOf('2027年接收推免生复试安排'), 'recommendation');
assert.equal(model.routeOf('2027年统考硕士复试安排'), 'examination');
assert.equal(model.routeOf('2027年硕士招生专业目录'), 'shared');
assert.equal(model.routeOf('2027年统考与推免招生计划'), 'shared');
assert.equal(model.routeOf('夏令营申请办法'), 'recommendation');
assert.equal(model.routeOf('自命题科目参考书'), 'examination');
assert.equal(model.routeOf('2027年直博生招生专业目录'), 'recommendation');
assert.equal(model.topicOf('全国大学英语四、六级考试报名通知'), '报名与确认');
assert.equal(model.topicOf('硕士研究生入学考试（初试）成绩复核结果'), '分数与成绩');

const filing = {relevant:true,school:'测试大学',year:'2027',department:'化工学院'};
const raw = {institutions:[{id:'sample',school:'测试大学',entries:[{label:'推免入口'},{label:'统考入口'},{label:'研究生院'}]}],
 sources:[{id:1,school:'测试大学',name:'测试大学研究生院'}],
 items:[{id:1,source_id:1,title:'夏令营通知',url:'https://example.edu.cn/1',filing},
        {id:2,source_id:1,title:'统考复试分数线',url:'https://example.edu.cn/2',filing},
        {id:3,source_id:1,title:'硕士招生目录',url:'https://example.edu.cn/3',filing}],
 snapshots:[{id:4,source_id:1,display_title:'夏令营通知',url:'https://example.edu.cn/1',filing,created:'2026-10-05'},
            {id:5,source_id:1,display_title:'夏令营通知',url:'https://example.edu.cn/1',filing,created:'2026-10-06'},
            {id:6,source_id:1,display_title:'统考复试分数线',url:'https://example.edu.cn/2',filing}],
 notes:[],events:[],resources:[],settings:{favorites:[]}};
const before = JSON.stringify(raw), index = model.build(raw);
const rec = index.view('recommendation'), exam = index.view('examination');
assert.deepEqual(rec.data.items.map(r=>r.id), [1,3]);
assert.deepEqual(exam.data.items.map(r=>r.id), [2,3]);
assert.deepEqual(rec.data.snapshots.map(r=>r.id), [4,5]);
assert.deepEqual(exam.data.snapshots.map(r=>r.id), [6]);
assert.equal(rec.units.get('sample').saved, 1);
assert.deepEqual(rec.units.get('sample').records.find(r=>r.title==='夏令营通知').versions.map(r=>r.id), [5,4]);
assert.equal(rec.data.institutions[0].entries.length, 2);
assert.equal(exam.data.institutions[0].entries.length, 2);
assert.equal(index.view('examination'), exam);
assert.equal(JSON.stringify(raw), before);
const unrelated=structuredClone(raw);
unrelated.items.push({id:99,source_id:1,title:'关于国庆放假期间研究生教学安排的通知',url:'https://example.edu.cn/99',filing});
assert.equal(model.build(unrelated).records.length,index.records.length);

const file = path.resolve(__dirname, '../../github-site/public/sch-doc/data.json');
if (fs.existsSync(file)) {
 const data = JSON.parse(fs.readFileSync(file, 'utf8'));
 const start = performance.now(), live = model.build(data);
 const r = live.view('recommendation'), e = live.view('examination');
 const elapsed = performance.now()-start;
 assert.equal(r.units.size,data.institutions.length);
 assert.equal(e.units.size,data.institutions.length);
 for(const row of r.records)assert.notEqual(row.route,'examination');
 for(const row of e.records)assert.notEqual(row.route,'recommendation');
 const cacheStart = performance.now();
 for(let n=0;n<10000;n++)live.view(n%2?'recommendation':'examination');
 console.log(JSON.stringify({sourceItems:data.items.length,sourceSnapshots:data.snapshots.length,recommendationRecords:r.records.length,examinationRecords:e.records.length,indexMs:+elapsed.toFixed(2),cachedSwitch10000Ms:+(performance.now()-cacheStart).toFixed(2)}));
}
console.log('Admissions model checks passed.');
