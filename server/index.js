'use strict';
/**
 * AI 产品经理面试备考平台 · 登录与进度同步服务
 *
 * 职责：
 *   1. 校验学员账号（飞书多维表格「学员账号」）
 *   2. 把备考进度写回飞书多维表格「备考进度」（按登记账号 upsert）
 *   3. 托管同目录的 index.html（单端口，静态 + API 同源，也可只当 API 用）
 *
 * 配置：同目录 .env（见 .env.example），全部通过环境变量注入。
 * 启动：PORT=3000 node server/index.js
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

/* ------------------------------ 配置 ------------------------------ */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.join(__dirname, '.env'));
// 托管环境若过滤隐藏文件（.env），用同目录 env.json 兜底，避免线上服务变成未配置状态
try {
  const fallback = JSON.parse(fs.readFileSync(path.join(__dirname, 'env.json'), 'utf8'));
  for (const [k, v] of Object.entries(fallback)) {
    if (!(k in process.env)) process.env[k] = String(v);
  }
} catch { /* 没有兜底文件时保持原逻辑 */ }

const PORT = Number(process.env.PORT || 3000);
const APP_ID = process.env.FEISHU_APP_ID || '';
const APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const BASE_TOKEN = process.env.FEISHU_BASE_TOKEN || 'UDXYbBLFqaQtrnsF8Mncn2PDndg';
const T_ACCOUNT = process.env.FEISHU_TABLE_ACCOUNT || 'tblL2xHFCj3Yzaro';
const T_PROGRESS = process.env.FEISHU_TABLE_PROGRESS || 'tblhcHe8RI1WCm1E';
const T_LEARN = process.env.FEISHU_TABLE_LEARN || 'tblgBY1Psa8z94xi';   // 学习平台「学习进度」表（独立表，不与刷题进度互相覆盖）
const T_ANIM = process.env.FEISHU_TABLE_ANIM || 'tbldEwNzVEQaxkLb';     // 2D 教学动画「动画学习进度」表（独立表）
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL = 7 * 24 * 3600 * 1000;                       // 7 天
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
const ROOT = path.resolve(__dirname, '..');
const FEISHU = process.env.FEISHU_HOST || 'https://open.feishu.cn/open-apis';   // 可用 FEISHU_HOST 指向本地 mock
const CONFIGURED = Boolean(APP_ID && APP_SECRET);

/* ---------------------------- 飞书客户端 ---------------------------- */
let tokenCache = { token: '', exp: 0 };

async function tenantToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const res = await fetch(`${FEISHU}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(`获取 tenant_access_token 失败: ${j.code} ${j.msg}`);
  tokenCache = { token: j.tenant_access_token, exp: Date.now() + Math.max(60, j.expire - 180) * 1000 };
  return tokenCache.token;
}

async function feishuApi(p, { method = 'GET', body, retry = true } = {}) {
  const token = await tenantToken();
  const res = await fetch(FEISHU + p, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json();
  // token 失效：清缓存重试一次
  if ((j.code === 99991663 || j.code === 99991661) && retry) {
    tokenCache = { token: '', exp: 0 };
    return feishuApi(p, { method, body, retry: false });
  }
  if (j.code !== 0) {
    const err = new Error(`飞书接口错误: ${j.code} ${j.msg}`);
    err.code = j.code;
    throw err;
  }
  return j.data;
}

async function listAll(tableId) {
  const out = [];
  let pageToken = '';
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ page_size: '500' });
    if (pageToken) qs.set('page_token', pageToken);
    const data = await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records?${qs}`);
    for (const it of data.items || []) out.push(it);
    if (!data.has_more) break;
    pageToken = data.page_token;
  }
  return out;
}

function fieldText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(fieldText).join('');
  if (typeof v === 'object') return (v.text || v.name || v.link || '').toString().trim();
  return '';
}

/* ---------------------------- 账号缓存 ---------------------------- */
let accountCache = { at: 0, map: new Map() };
const ACCOUNT_TTL = 60 * 1000;

async function accounts() {
  if (Date.now() - accountCache.at < ACCOUNT_TTL) return accountCache.map;
  const rows = await listAll(T_ACCOUNT);
  const map = new Map();
  for (const r of rows) {
    const f = r.fields || {};
    const account = fieldText(f['登记账号']);
    if (!account) continue;
    const status = fieldText(f['状态']) || '启用';   // 单选字段可能是字符串数组或对象数组
    map.set(account, {
      recordId: r.record_id,
      name: fieldText(f['姓名']),
      password: fieldText(f['密码']),
      status: status || '启用',
    });
  }
  accountCache = { at: Date.now(), map };
  return map;
}

/* ---------------------------- 会话签名 ---------------------------- */
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
  return `${body}.${mac}`;
}
function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!p || !p.a || !p.exp || Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

/* ---------------------------- 登录限流 ---------------------------- */
const failBuckets = new Map();   // ip -> {count, resetAt}
const MAX_FAIL = 8;
const FAIL_WINDOW = 10 * 60 * 1000;

function checkRate(ip) {
  const b = failBuckets.get(ip);
  if (!b || Date.now() > b.resetAt) return true;
  return b.count < MAX_FAIL;
}
function noteFail(ip) {
  const b = failBuckets.get(ip);
  if (!b || Date.now() > b.resetAt) failBuckets.set(ip, { count: 1, resetAt: Date.now() + FAIL_WINDOW });
  else b.count++;
}

/* ---------------------------- 进度写入 ---------------------------- */
async function findProgress(account) {
  const data = await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_PROGRESS}/records/search`, {
    method: 'POST',
    body: {
      filter: { conjunction: 'and', conditions: [{ field_name: '登记账号', operator: 'is', value: [account] }] },
      automatic_fields: false,
    },
  });
  return (data.items || [])[0] || null;
}

const progressIds = new Map();   // account -> record_id，省掉每次同步的一次检索

async function putProgress(recordId, fields) {
  await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_PROGRESS}/records/${recordId}`, {
    method: 'PUT', body: { fields },
  });
}

async function upsertProgress(account, name, stats, detail, device) {
  const now = Date.now();
  const fields = {
    登记账号: account,
    姓名: name || '',
    已练习: Number(stats.seen) || 0,
    已掌握: Number(stats.known) || 0,
    模糊: Number(stats.vague) || 0,
    待重学: Number(stats.unknown) || 0,
    收藏: Number(stats.fav) || 0,
    题库总量: Number(stats.total) || 0,
    掌握率: Number(stats.rate) || 0,
    最近同步: now,
    薄弱题型: stats.weakType || '',
    薄弱知识点: stats.weakTag || '',
    进度明细: detail || '',
    设备: device || '',
  };

  const cached = progressIds.get(account);
  if (cached) {
    try {
      await putProgress(cached, fields);
      return { updated: true, recordId: cached };
    } catch (e) {
      if (e.code !== 1254043) throw e;     // 记录被删除了，回落到重新检索
      progressIds.delete(account);
    }
  }

  const hit = await findProgress(account);
  if (hit) {
    progressIds.set(account, hit.record_id);
    await putProgress(hit.record_id, fields);
    return { updated: true, recordId: hit.record_id };
  }
  const data = await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_PROGRESS}/records`, {
    method: 'POST', body: { fields },
  });
  const recordId = (data.record || {}).record_id;
  if (recordId) progressIds.set(account, recordId);
  return { updated: false, recordId };
}

/* ------------------------ 学习平台进度（独立表，互不影响） ------------------------ */
const learnIds = new Map();   // account -> record_id

async function findLearn(account) {
  const data = await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_LEARN}/records/search`, {
    method: 'POST',
    body: {
      filter: { conjunction: 'and', conditions: [{ field_name: '登记账号', operator: 'is', value: [account] }] },
      automatic_fields: false,
    },
  });
  return (data.items || [])[0] || null;
}

async function putLearn(recordId, fields) {
  await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_LEARN}/records/${recordId}`, {
    method: 'PUT', body: { fields },
  });
}

async function upsertLearn(account, name, stats, detail, device) {
  const now = Date.now();
  const fields = {
    登记账号: account,
    姓名: name || '',
    完成天数: Number(stats.days) || 0,
    习题掌握: Number(stats.quiz) || 0,
    面试真题: Number(stats.qbank) || 0,
    里程碑: Number(stats.milestones) || 0,
    交付物归档: Number(stats.deliverables) || 0,
    综合进度: Number(stats.rate) || 0,
    学习明细: detail || '',
    设备: device || '',
    最近同步: now,
  };
  const cached = learnIds.get(account);
  if (cached) {
    try {
      await putLearn(cached, fields);
      return { updated: true, recordId: cached };
    } catch (e) {
      if (e.code !== 1254043) throw e;
      learnIds.delete(account);
    }
  }
  const hit = await findLearn(account);
  if (hit) {
    learnIds.set(account, hit.record_id);
    await putLearn(hit.record_id, fields);
    return { updated: true, recordId: hit.record_id };
  }
  const data = await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_LEARN}/records`, {
    method: 'POST', body: { fields },
  });
  const recordId = (data.record || {}).record_id;
  if (recordId) learnIds.set(account, recordId);
  return { updated: false, recordId };
}

/* ------------------------ 动画学习进度（独立表，互不影响） ------------------------ */
const animIds = new Map();   // account -> record_id

async function findAnim(account) {
  const data = await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_ANIM}/records/search`, {
    method: 'POST',
    body: {
      filter: { conjunction: 'and', conditions: [{ field_name: '登记账号', operator: 'is', value: [account] }] },
      automatic_fields: false,
    },
  });
  return (data.items || [])[0] || null;
}

async function putAnim(recordId, fields) {
  await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_ANIM}/records/${recordId}`, {
    method: 'PUT', body: { fields },
  });
}

async function upsertAnim(account, name, klass, stats, detail, device, lastStudy) {
  const now = Date.now();
  const fields = {
    登记账号: account,
    姓名: name || '',
    已完成动画数: Number(stats.done) || 0,
    完成率: Number(stats.rate) || 0,
    流程动画完成: Number(stats.flow) || 0,
    步骤动画完成: Number(stats.steps) || 0,
    对比动画完成: Number(stats.compare) || 0,
    动画明细: detail || '',
    最近学习: Number(lastStudy) || now,
    设备: device || '',
    最近同步: now,
  };
  if (klass) fields.班级 = klass;   // 不传时保留表中已有班级，避免被空值覆盖
  const cached = animIds.get(account);
  if (cached) {
    try {
      await putAnim(cached, fields);
      return { updated: true, recordId: cached };
    } catch (e) {
      if (e.code !== 1254043) throw e;
      animIds.delete(account);
    }
  }
  const hit = await findAnim(account);
  if (hit) {
    animIds.set(account, hit.record_id);
    await putAnim(hit.record_id, fields);
    return { updated: true, recordId: hit.record_id };
  }
  const data = await feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_ANIM}/records`, {
    method: 'POST', body: { fields },
  });
  const recordId = (data.record || {}).record_id;
  if (recordId) animIds.set(account, recordId);
  return { updated: false, recordId };
}

/* ---------------------------- HTTP 工具 ---------------------------- */
function cors(req, res) {
  const origin = req.headers.origin || '';
  let allow = '';
  if (ALLOW_ORIGINS.includes('*')) allow = '*';
  else if (ALLOW_ORIGINS.includes(origin)) allow = origin;
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}
// 网关可能吞掉 Authorization，统一按 X-Session → Authorization → query 依次取
function sessionOf(req, url) {
  const custom = String(req.headers['x-session'] || '');
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const query = String(url.searchParams.get('t') || '');
  // 托管网关会注入自己的 Authorization，故优先使用透传的 X-Session
  return verify(custom || bearer || query);
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

/* ---------------------------- 静态文件 ---------------------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// 静态资源 gzip（带 mtime 缓存，避免重复压缩 1MB 题库）
const gzipCache = new Map();
function gzipFor(file, buf) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const key = file + ':' + st.mtimeMs + ':' + buf.length;
  const hit = gzipCache.get(key);
  if (hit) return hit;
  const gz = zlib.gzipSync(buf, { level: 6 });
  if (gzipCache.size > 20) gzipCache.clear();
  gzipCache.set(key, gz);
  return gz;
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // 前端是哈希路由，未知路径回落到首页
      fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(html);
      });
      return;
    }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' };
    if (buf.length > 1024 && /text|json|javascript|css|svg/.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      const gz = gzipFor(file, buf);
      if (gz) { headers['Content-Encoding'] = 'gzip'; headers['Content-Length'] = gz.length; res.writeHead(200, headers); return res.end(gz); }
    }
    headers['Content-Length'] = buf.length;
    res.writeHead(200, headers);
    res.end(buf);
  });
}

/* ---------------------------- 路由 ---------------------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (req.method === 'OPTIONS') { cors(req, res); res.writeHead(204); return res.end(); }
  if (!p.startsWith('/api/')) return serveStatic(req, res, p);
  cors(req, res);

  try {
    if (p === '/api/health') {
      return json(res, 200, { ok: true, configured: CONFIGURED, base: BASE_TOKEN, time: Date.now() });
    }

    if (p === '/api/login' && req.method === 'POST') {
      if (!CONFIGURED) return json(res, 503, { error: '登录服务未配置（缺少 FEISHU_APP_ID / FEISHU_APP_SECRET）' });
      const ip = clientIp(req);
      if (!checkRate(ip)) return json(res, 429, { error: '尝试次数过多，请 10 分钟后再试' });

      const { account, password } = await readBody(req);
      const acc = String(account || '').trim();
      const pwd = String(password || '').trim();
      if (!/^\d{4}$/.test(acc) || !/^\d{4}$/.test(pwd)) {
        noteFail(ip);
        return json(res, 400, { error: '账号与密码均为 4 位数字' });
      }

      const map = await accounts();
      const user = map.get(acc);
      if (!user || user.password !== pwd) {
        noteFail(ip);
        return json(res, 401, { error: '账号或密码不正确' });
      }
      if (user.status === '停用') return json(res, 403, { error: '该账号已停用，请联系班主任' });

      failBuckets.delete(ip);
      const now = Date.now();
      const payload = { a: acc, n: user.name || '', exp: now + SESSION_TTL };
      // 异步更新「最近登录」，不阻塞登录
      feishuApi(`/bitable/v1/apps/${BASE_TOKEN}/tables/${T_ACCOUNT}/records/${user.recordId}`, {
        method: 'PUT', body: { fields: { 最近登录: now } },
      }).catch(e => console.error('[login] 更新最近登录失败:', e.message));

      return json(res, 200, { token: sign(payload), account: acc, name: user.name || '', expiresAt: payload.exp });
    }

    if (p === '/api/whoami') {
      return json(res, 200, {
        authorization: !!req.headers.authorization,
        xSession: !!req.headers['x-session'],
        queryToken: !!url.searchParams.get('t'),
        secretStable: SESSION_SECRET.length,
      });
    }

    if (p === '/api/progress' && req.method === 'POST') {
      if (!CONFIGURED) return json(res, 503, { error: '同步服务未配置' });
      const session = sessionOf(req, url);
      if (!session) return json(res, 401, { error: '登录已过期，请重新登录' });

      const body = await readBody(req);
      const stats = body.stats || {};
      const detail = typeof body.detail === 'string' ? body.detail.slice(0, 120000) : '';
      const device = typeof body.device === 'string' ? body.device.slice(0, 40) : '';
      const r = await upsertProgress(session.a, session.n, stats, detail, device);
      return json(res, 200, { ok: true, ...r, syncedAt: Date.now() });
    }

    if (p === '/api/progress' && req.method === 'GET') {
      if (!CONFIGURED) return json(res, 503, { error: '同步服务未配置' });
      const session = sessionOf(req, url);
      if (!session) return json(res, 401, { error: '登录已过期，请重新登录' });
      const hit = await findProgress(session.a);
      if (!hit) return json(res, 200, { found: false });
      const f = hit.fields || {};
      return json(res, 200, {
        found: true,
        detail: fieldText(f['进度明细']),
        stats: {
          seen: f['已练习'] || 0, known: f['已掌握'] || 0, vague: f['模糊'] || 0,
          unknown: f['待重学'] || 0, fav: f['收藏'] || 0, total: f['题库总量'] || 0,
        },
        syncedAt: f['最近同步'] || 0,
      });
    }

    // 学习平台：共用同一套学员会话，进度写独立的「学习进度」表
    if (p === '/api/learn-progress' && req.method === 'POST') {
      if (!CONFIGURED) return json(res, 503, { error: '同步服务未配置' });
      const session = sessionOf(req, url);
      if (!session) return json(res, 401, { error: '登录已过期，请重新登录' });
      const body = await readBody(req);
      const stats = body.stats || {};
      const detail = typeof body.detail === 'string' ? body.detail.slice(0, 120000) : '';
      const device = typeof body.device === 'string' ? body.device.slice(0, 40) : '';
      const r = await upsertLearn(session.a, session.n, stats, detail, device);
      return json(res, 200, { ok: true, ...r, syncedAt: Date.now() });
    }

    if (p === '/api/learn-progress' && req.method === 'GET') {
      if (!CONFIGURED) return json(res, 503, { error: '同步服务未配置' });
      const session = sessionOf(req, url);
      if (!session) return json(res, 401, { error: '登录已过期，请重新登录' });
      const hit = await findLearn(session.a);
      if (!hit) return json(res, 200, { found: false });
      const f = hit.fields || {};
      return json(res, 200, {
        found: true,
        detail: fieldText(f['学习明细']),
        stats: {
          days: f['完成天数'] || 0, quiz: f['习题掌握'] || 0, qbank: f['面试真题'] || 0,
          milestones: f['里程碑'] || 0, deliverables: f['交付物归档'] || 0, rate: f['综合进度'] || 0,
        },
        syncedAt: f['最近同步'] || 0,
      });
    }

    // 2D 教学动画学习页：共用同一套学员会话，进度写独立的「动画学习进度」表
    if (p === '/api/animation-progress' && req.method === 'POST') {
      if (!CONFIGURED) return json(res, 503, { error: '同步服务未配置' });
      const session = sessionOf(req, url);
      if (!session) return json(res, 401, { error: '登录已过期，请重新登录' });
      const body = await readBody(req);
      const stats = body.stats || {};
      const detail = typeof body.detail === 'string' ? body.detail.slice(0, 120000) : '';
      const device = typeof body.device === 'string' ? body.device.slice(0, 40) : '';
      const klass = typeof body.klass === 'string' ? body.klass.slice(0, 40) : '';
      const lastStudy = Number(body.lastStudy) || Date.now();
      const r = await upsertAnim(session.a, session.n, klass, stats, detail, device, lastStudy);
      return json(res, 200, { ok: true, ...r, syncedAt: Date.now() });
    }

    if (p === '/api/animation-progress' && req.method === 'GET') {
      if (!CONFIGURED) return json(res, 503, { error: '同步服务未配置' });
      const session = sessionOf(req, url);
      if (!session) return json(res, 401, { error: '登录已过期，请重新登录' });
      const hit = await findAnim(session.a);
      if (!hit) return json(res, 200, { found: false });
      const f = hit.fields || {};
      return json(res, 200, {
        found: true,
        detail: fieldText(f['动画明细']),
        stats: {
          done: f['已完成动画数'] || 0, rate: f['完成率'] || 0,
          flow: f['流程动画完成'] || 0, steps: f['步骤动画完成'] || 0, compare: f['对比动画完成'] || 0,
        },
        klass: fieldText(f['班级']),
        lastStudy: f['最近学习'] || 0,
        syncedAt: f['最近同步'] || 0,
      });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('[api]', p, e.message);
    return json(res, 500, { error: '服务异常，请稍后重试' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on :${PORT} · feishu ${CONFIGURED ? 'configured' : 'NOT configured'}`);
});
