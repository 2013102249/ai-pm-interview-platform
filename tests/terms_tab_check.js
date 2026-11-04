/**
 * 术语 tab 专项验证：jsdom 加载 index.html，导航到 #/terms 检查视图与 iframe。
 * 运行：node tests/terms_tab_check.js
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
  url: 'https://example.com/ai-pm-interview-platform/', virtualConsole: vc,
  resources: undefined,
  beforeParse(win) {
    win.scrollTo = () => {};
    win.confirm = () => true;
    win.localStorage.setItem('aipm_auth_v1', JSON.stringify({
      account: '1001', name: '测试学员', token: 'test', expiresAt: Date.now() + 864e5,
    }));
    win.fetch = () => Promise.reject(new Error('offline'));
  },
});
const win = dom.window, doc = win.document;
const $ = s => doc.querySelector(s);
const tick = () => new Promise(r => setTimeout(r, 30));
const go = async h => { win.location.hash = h; await tick(); await tick(); };

(async () => {
  await new Promise(r => win.addEventListener('load', r, { once: true }));
  await tick();

  console.log('[1] 顶部 tab');
  const navLinks = Array.from(doc.querySelectorAll('#nav a')).map(a => a.textContent);
  ok(navLinks.includes('术语'), '导航包含「术语」');
  ok(navLinks.indexOf('术语') === navLinks.indexOf('首页') + 1, '术语紧跟在首页之后');
  console.log('   tab 顺序:', navLinks.join(' → '));

  console.log('[2] 术语视图');
  await go('#/terms');
  ok($('.terms-shell') !== null, '渲染出术语容器 .terms-shell');
  const frame = $('.terms-shell iframe');
  ok(frame !== null, '容器内含 iframe');
  ok(frame && frame.getAttribute('src') === 'glossary/index.html', 'iframe src 指向 glossary/index.html', frame && frame.getAttribute('src'));
  ok($('#app').textContent.includes('新窗口打开'), '提供「新窗口打开」入口');
  ok($('#nav a.on') && $('#nav a.on').textContent === '术语', '术语 tab 高亮');

  console.log('[3] 视图切换往返');
  await go('#/home');
  ok($('.terms-shell') === null, '离开术语视图后容器移除');
  await go('#/terms');
  ok($('.terms-shell iframe') !== null, '返回术语视图正常重建');
  ok(win.eval('typeof termsFrame') !== 'undefined' && win.eval('termsFrame') !== null, 'iframe 实例被缓存（复用不重建）');

  console.log('[4] 词库文件就位');
  const gpath = path.resolve(__dirname, '..', 'glossary', 'index.html');
  ok(fs.existsSync(gpath), 'glossary/index.html 存在');
  if (fs.existsSync(gpath)) {
    const g = fs.readFileSync(gpath, 'utf8');
    ok(g.includes('const TERMS'), '词库文件包含词条数据');
    ok(g.includes('embedded'), '词库文件含嵌入模式适配');
  }

  console.log('[5] 运行期');
  ok(errors.length === 0, '无 JS 运行错误', errors[0]);

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
