# AI 产品经理面试备考平台

郑州高新区新像素职业技能培训学校 · AI 产品经理训练营 · 面试求职工具

基于**飞书多维表格**构建的单文件面试备考平台：775 道面试真题、7 大专项题库、10 套真实面经 + 鹅厂三轮全流程面经，配套刷题练习、限时模拟面试与掌握度跟踪，服务 8 周训练营结业学员冲刺一线城市 AI 产品经理岗位。

## 功能模块

| 模块 | 说明 |
|---|---|
| 首页 | 备考进度仪表盘（已练习 / 掌握 / 模糊 / 重学 / 收藏）、核心题库 + 进阶专项共 7 个题库入口、通关路线建议 |
| 术语 | AI 术语概念词库（glossary/）：115 个核心词条 × 10 大分类，频次标注自题库真题，支持搜索、分类筛选、只看必背高频与随机自测，iframe 集成于顶栏 tab |
| 题库 | 775 题浏览，支持 7 库来源切换、全文搜索、难度 / 题型 / 标签 / 面经 / 章节 / 轮次 / 分部 / 专题多维筛选、排序、收藏、掌握度标记 |
| 练习 | 翻卡式刷题：先作答后对照详解，键盘快捷键（空格翻卡，1/2/3 标记），可限定题库 / 薄弱题 / 收藏，支持按章节、轮次、专题直接开练 |
| 模拟面试 | 限时作答（60–180 秒/题）→ 对照参考 → 即时自评 → 生成复盘报告（薄弱题型 / 知识点 / 待强化清单），可限定任一题库 / 难度 / 题型 / 面经套别 |
| 面经 | 10 套真实面经按候选人背景分组（懂算法有经历 / 有应用不懂算法 / 零基础 / 校招 / 转型 / 技术转产品 / 产品实习 / Agent 方向），另设鹅厂 AI PM 一面→二面→三面全流程专区，含画像说明与讲师提示 |
| 课程地图 | 8 周 40 天训练营大纲，W7 就业冲刺 / W8 面试通关高亮，题库与课程对齐建议 |

## 学员登录与进度同步

- **登录**：学员用 4 位登记账号 + 手机号后 4 位密码登录，账号在飞书多维表格「学员账号」表维护
- **进度**：逐题掌握状态与收藏存在本机（按账号隔离，localStorage key 形如 `aipm_prep_v1:1001`），聚合指标与逐题明细在练习后 5 秒自动同步到飞书「备考进度」表（按登记账号 upsert，一人一行）
- **换设备**：登录时若本机无进度，自动从飞书拉回逐题明细继续
- **离线**：网络异常时进度仍写本机，恢复后自动重试；页面隐藏时兜底再推一次

同步字段：已练习 / 已掌握 / 模糊 / 待重学 / 收藏 / 题库总量 / 掌握率 / 薄弱题型 / 薄弱知识点 / 进度明细 / 设备 / 最近同步。

### 飞书自建应用配置（一次性，约 5 分钟）

1. 打开 <https://open.feishu.cn/app> → 创建企业自建应用（名称如「AI PM 备考平台」）
2. 应用详情 → 凭证与基础信息，复制 **App ID / App Secret**
3. 权限管理 → 添加权限：`bitable:app`（多维表格读写）、`bitable:app:readonly`（如需）→ 发布版本
4. 回到多维表格 → 右上角「⋯」→ 添加文档应用 / 协作者，把该应用加为**可编辑**
5. 把 App ID / App Secret 写入 `server/.env`（参考 `server/.env.example`），然后部署：

```bash
# 本地联调
cd server && npm start              # 等价于 node index.js，默认 3000 端口

# 构建时注入服务地址（服务部署在别处时填其公网地址）
AIPM_API_BASE="https://your-api-host" python3 scripts/build.py
```

> `AIPM_API_BASE` 为空时页面以**本地演示模式**运行：仍展示登录页，但账号密码只校验 4 位数字，进度只存本机。
> 填入服务地址后即切换为真实校验 + 自动同步。

## 文件结构

```
ai-pm-interview-platform/
├── index.html            # 编译产物：单文件零依赖应用（双击即可用）
├── template.html         # 应用源码（页面结构 + 样式 + 交互逻辑）
├── glossary/
│   └── index.html        # 术语概念词库（独立单文件应用，术语 tab iframe 引用）
├── scripts/
│   ├── sync.sh           # 从飞书多维表格刷新数据并重新编译
│   └── build.py          # 数据规范化 + 将 JSON / API 地址注入模板生成 index.html
├── server/
│   ├── index.js          # 登录与进度同步服务（Node 原生 http，零依赖）
│   └── .env.example      # 飞书应用凭据模板（复制为 .env，勿提交）
├── data/                 # 多维表格导出的原始数据（ndjson）+ 构建产物 qbank.json
│   ├── table1_题库.ndjson            # 34 题 · Agent 深度专项
│   ├── table2_高频100题.ndjson       # 100 题 · 通用高频
│   ├── table3_面经实战.ndjson        # 115 题 · 10 套真实面经
│   ├── table4_大厂PM八股文.ndjson    # 72 题 · 9 大章节
│   ├── table5_鹅厂三轮面经.ndjson    # 36 题 · 一面/二面/三面
│   ├── table6_LLM八股文.ndjson       # 48 题 · 基础面/进阶面/微调面
│   └── table7_专题题库.ndjson        # 81 题 · 6 大专题
└── README.md
```

## 数据底座与更新方式

全部题目与参考答案由飞书多维表格统一维护：

- 多维表格：<https://15997672262.feishu.cn/base/UDXYbBLFqaQtrnsF8Mncn2PDndg>
- 七张题库数据表：
  - **面试题库** tblEpbl9nGvblJdU（34）
  - **AI PM 高频 100 题** tblrg4pgBXvMT84z（100）
  - **面经实战（10 套）** tbl2bnxvRa8pXzh6（115）
  - **大厂 PM 八股文** tblvlwFeOd4qm3oE（72）
  - **鹅厂 AI PM 三轮面经** tblhCV8PeR6CXOqw（36）
  - **大模型 LLMs 八股文** tblWfbxCptbttB00（48）
  - **专题题库** tblnRcNvta6NT5wu（81）
- 学员数据表：
  - **学员账号** tblL2xHFCj3Yzaro（登记账号 / 姓名 / 密码 / 手机号 / 班级 / 状态 / 最近登录）
  - **备考进度** tblhcHe8RI1WCm1E（账号 / 姓名 / 五类计数 / 掌握率 / 薄弱项 / 进度明细 / 设备 / 最近同步）

讲师在表格中增改题目后，一条命令即可同步并重新生成平台：

```bash
bash scripts/sync.sh
```

脚本依次完成：lark-cli 拉取七张表 → `build.py` 规范化（统一 schema、派生面经分组与章节 / 轮次 / 分部 / 专题维度）→ 注入 `template.html` → 输出 `index.html`。无需服务器、无外部依赖。新增数据表时在 `sync.sh` 的 `TABLES` 与 `build.py` 的 `TABLES` / `SOURCES` 各加一行即可。

## 修改与二次开发

- **改内容 / 加题**：直接编辑飞书多维表格，然后 `bash scripts/sync.sh`
- **改样式 / 交互**：编辑 `template.html`，然后 `python3 scripts/build.py`（模板中 `__DATA_JSON__` 为数据占位符，勿删）
- **改课程地图**：`template.html` 顶部的 `COURSE` 常量（静态数据，不来自多维表格）
- **改面经画像提示**：`scripts/build.py` 中的 `EXP_META` 字典

## 部署

应用分两部分：**前端静态页**（GitHub Pages）+ **登录与同步服务**（WorkBuddy 云托管）。

| 部分 | 地址 |
|---|---|
| 学员入口（前端） | <https://2013102249.github.io/ai-pm-interview-platform/> |
| 服务地址（API） | <https://ai-pm-interview-486.app.workbuddy.host> |
| 仓库 | <https://github.com/2013102249/ai-pm-interview-platform> |

### 更新流程

```bash
bash scripts/sync.sh        # 拉飞书题库并重编译（会保留 API 配置需重新注入）
AIPM_API_BASE="https://ai-pm-interview-486.app.workbuddy.host" \
AIPM_API_SHARECODE="ML5MQW3TYD" \
python3 scripts/build.py    # 重新构建，注入服务地址与分享码
git add -A && git commit -m "同步题库"
git push origin main        # Actions 自动发布前端
```

服务端有改动时，重新部署一次该目录（Node 项目，启动命令 `node server/index.js`）。

### 两个环境细节

- WorkBuddy 托管网关要求请求带 `?sharecode=ML5MQW3TYD`，否则返回「链接不完整」；分享码已编译进页面
- 该网关会**覆盖请求的 `Authorization` 头**，因此会话令牌通过自定义头 `X-Session` 传递（服务端兼容三种：X-Session → Authorization → `?t=`）

## 加载性能

首屏拆成两段，登录页不再等题库：

| 资源 | 原始 | gzip | 作用 |
|---|---|---|---|
| `index.html` | 111 KB | **32 KB** | 页面外壳 + 统计 + 交互逻辑，决定首屏 |
| `data/qbank.json` | 1.1 MB | **358 KB** | 775 道题全文，登录页渲染后后台下载 |

- 题库加载有**版本缓存**（localStorage `aipm_qbank_v1`）：数据没变时二次打开不再下载
- 题库未就绪时显示「正在加载题库」，失败可重试；登录成功后若仍未就绪会等待加载完成
- 需要离线单文件（可双击打开、微信发送）时，用 `python3 scripts/build.py --inline`，会把题库内联回 HTML
- 部署注意：GitHub Actions 需一并发布 `data/qbank.json`（工作流已包含）

## 当前数据版本

- 题目总数：775（面试题库 34 · 高频 100 题 100 · 面经实战 115 · 大厂 PM 八股文 72 · 鹅厂三轮面经 36 · LLM 八股文 48 · 专题题库 370）
- 序号连续：1–775，无缺号无重号，题卡 #序号 与表格「序号」一一对应
- 面经分组：10 套（面经一 21 · 面经二 15 · 面经三 10 · 面经四 15 · 面经五 8 · 面经六 8 · 面经七 11 · 面经八 10 · 面经九 9 · 面经十 8）+ 鹅厂三轮各 12 题
- 分册维度：大厂八股 9 章节 · 鹅厂 3 轮 · LLM 3 分部 · 专题 26 个（强化学习面试 43 / LLMs RAG 面经 40 / 模型训练与部署 29 / Agent 电商推荐系统 29 / 某大厂 LLM 26 / 产品运营面试 24 / 鹅厂大模型技术面 22 / Transformer 19 等，筛选行默认折叠为 12 个）
- 难度分布：初级 26 · 中级 352 · 高级 397
- 题型覆盖：概念解释 / 方法流程 / 观点判断 / 经历描述 / 对比分析 / 方案设计 / 场景设计 / 概念辨析 / 指标设计（9 类）

> 构建脚本会自动识别多维表格中新增的面经套别（中文数字泛匹配）并派生分组元数据，
> 新套别的「候选人画像 / 讲师提示」可在 `scripts/build.py` 的 `EXP_META` 中补充。
