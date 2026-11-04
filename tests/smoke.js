/**
 * 冒烟测试：用 jsdom 加载构建产物 index.html，检查数据与主要交互。
 * 运行：npm test（需先 npm install）
 */
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(HTML, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
};

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://example.com/', virtualConsole: vc,
  beforeParse(win) {
    win.scrollTo = () => {};
    win.confirm = () => true;
    // 跳过登录：预置一个本地会话，专注验证应用主体
    win.localStorage.setItem('aipm_auth_v1', JSON.stringify({
      account: '1001', name: '测试学员', token: 'test', expiresAt: Date.now() + 864e5,
    }));
    // 避免同步请求打到真实服务
    win.fetch = () => Promise.reject(new Error('offline'));
  },
});
const win = dom.window, doc = win.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));
const txt = () => $('#app').textContent.replace(/\s+/g, ' ');
const tick = () => new Promise(r => setTimeout(r, 30));
const go = async h => { win.location.hash = h; await tick(); await tick(); };

(async () => {
  await new Promise(r => win.addEventListener('load', r, { once: true }));
  await tick();

  const DB = win.eval('DB');
  const QS = win.eval('QS');
  const F = DB.facets;
  const TOTAL = DB.stats.total;

  console.log('[1] 数据完整性');
  ok(TOTAL > 0 && Object.values(DB.stats.bySrc).reduce((a, b) => a + b, 0) === TOTAL, `分库合计 = ${TOTAL}`);
  ok(QS.every((q, i) => q.no === i + 1), '序号从 1 起连续无缺号');
  ok(QS.every(q => q.q && q.a), '题目与答案均非空');
  ok(QS.every(q => DB.sources.some(s => s.k === q.src)), '每道题都有合法数据源');

  console.log('[2] 首页');
  await go('#/home');
  ok(txt().includes(String(TOTAL)), `首页展示 ${TOTAL} 道真题`);
  ok($$('.src-card').length === DB.sources.length, `${DB.sources.length} 张题库卡片`, $$('.src-card').length);
  ok($$('.grid-3 .src-card').length === 3 && $$('.grid-4 .src-card').length === 4, '核心 3 + 进阶 4 分区正确');

  console.log('[3] 题库与来源切换');
  await go('#/bank');
  ok($$('[data-src]').length === DB.sources.length + 1, '来源 tab = 全部 + 各库');
  for (const [src, n] of Object.entries(DB.stats.bySrc)) {
    await go('#/bank?src=' + src);
    ok(txt().includes('共 ' + n + ' 题'), `来源 ${src} → ${n} 题`, txt().match(/共 \d+ 题/)?.[0]);
  }

  console.log('[4] 分册维度筛选');
  await go('#/bank?src=pm');
  ok($$('[data-group]').length === F.chapters.length, '大厂八股展示全部章节', $$('[data-group]').length);
  if ($('[data-group]')) { $('[data-group]').click(); await tick(); ok($$('.qcard').length > 0, '章节筛选可用'); }

  await go('#/bank?src=topic');
  const topicCount = F.topics.length;
  const shown = $$('[data-group]').length;
  ok(shown === Math.min(12, topicCount), `专题默认折叠到 ${shown} 个`, shown);
  if (topicCount > 12) {
    ok(!!$('[data-group-more]'), '提供「更多」入口');
    $('[data-group-more]').click(); await tick();
    ok($$('[data-group]').length === topicCount, `展开后显示全部 ${topicCount} 个`);
    $('[data-group-more]').click(); await tick();
  }

  await go('#/bank?src=tx');
  ok($$('[data-group]').length === 3, '鹅厂三轮筛选 3 个');
  await go('#/bank?src=llm');
  ok($$('[data-group]').length === 3, 'LLM 三分部筛选 3 个');

  console.log('[5] 练习 / 模考 / 面经 / 课程');
  await go('#/practice?src=llm');
  ok(/第 1 \/ \d+ 题/.test(txt()), '带参直接开练', txt().match(/第 \d+ \/ \d+ 题/)?.[0]);
  $('#p-reveal').click(); await tick();
  ok(!!$('#p-next') && $('.p-ans .ans').textContent.length > 20, '翻卡后显示详解');

  await go('#/mock');
  ok($$('#m-scope .opt').length === DB.sources.length + 4, '模考范围选项齐全', $$('#m-scope .opt').length);

  await go('#/exp');
  ok($$('[data-exp-card]').length === DB.stats.expGroups, `${DB.stats.expGroups} 套面经卡片`);
  ok($$('[data-round-card]').length === 3, '鹅厂 3 轮卡片');

  await go('#/course');
  ok($$('.week-card').length === 8, '课程地图 8 周');

  console.log('[6] 运行期');
  ok(errors.length === 0, '无 JS 运行错误', errors.slice(0, 2).join(' | '));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
