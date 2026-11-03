# AI 产品经理面试备考平台

郑州高新区新像素职业技能培训学校 · AI 产品经理训练营 · 面试求职工具

基于**飞书多维表格**构建的单文件面试备考平台：486 道面试真题、7 大专项题库、10 套真实面经 + 鹅厂三轮全流程面经，配套刷题练习、限时模拟面试与掌握度跟踪，服务 8 周训练营结业学员冲刺一线城市 AI 产品经理岗位。

## 功能模块

| 模块 | 说明 |
|---|---|
| 首页 | 备考进度仪表盘（已练习 / 掌握 / 模糊 / 重学 / 收藏）、核心题库 + 进阶专项共 7 个题库入口、通关路线建议 |
| 题库 | 486 题浏览，支持 7 库来源切换、全文搜索、难度 / 题型 / 标签 / 面经 / 章节 / 轮次 / 分部 / 专题多维筛选、排序、收藏、掌握度标记 |
| 练习 | 翻卡式刷题：先作答后对照详解，键盘快捷键（空格翻卡，1/2/3 标记），可限定题库 / 薄弱题 / 收藏，支持按章节、轮次、专题直接开练 |
| 模拟面试 | 限时作答（60–180 秒/题）→ 对照参考 → 即时自评 → 生成复盘报告（薄弱题型 / 知识点 / 待强化清单），可限定任一题库 / 难度 / 题型 / 面经套别 |
| 面经 | 10 套真实面经按候选人背景分组（懂算法有经历 / 有应用不懂算法 / 零基础 / 校招 / 转型 / 技术转产品 / 产品实习 / Agent 方向），另设鹅厂 AI PM 一面→二面→三面全流程专区，含画像说明与讲师提示 |
| 课程地图 | 8 周 40 天训练营大纲，W7 就业冲刺 / W8 面试通关高亮，题库与课程对齐建议 |

进度数据保存在浏览器 localStorage，换设备不同步。

## 文件结构

```
ai-pm-interview-platform/
├── index.html            # 编译产物：单文件零依赖应用（816 KB，双击即可用）
├── template.html         # 应用源码（页面结构 + 样式 + 交互逻辑）
├── scripts/
│   ├── sync.sh           # 从飞书多维表格刷新数据并重新编译
│   └── build.py          # 数据规范化 + 将 JSON 注入模板生成 index.html
├── data/                 # 多维表格导出的原始数据（ndjson）
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
- 七张数据表：
  - **面试题库** tblEpbl9nGvblJdU（34）
  - **AI PM 高频 100 题** tblrg4pgBXvMT84z（100）
  - **面经实战（10 套）** tbl2bnxvRa8pXzh6（115）
  - **大厂 PM 八股文** tblvlwFeOd4qm3oE（72）
  - **鹅厂 AI PM 三轮面经** tblhCV8PeR6CXOqw（36）
  - **大模型 LLMs 八股文** tblWfbxCptbttB00（48）
  - **专题题库** tblnRcNvta6NT5wu（81）

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

`index.html`（约 820 KB）为自包含单文件，任意静态托管均可，也可直接通过微信 / 飞书发送给学员离线使用。

### GitHub Pages（主发布渠道）

- 站点地址：<https://2013102249.github.io/ai-pm-interview-platform/>
- 仓库：<https://github.com/2013102249/ai-pm-interview-platform>
- 自动部署：`.github/workflows/deploy-pages.yml`，推送到 `main` 后自动发布（仅上传 `index.html`，源码与数据不对外）

更新流程：

```bash
bash scripts/sync.sh          # 拉取飞书多维表格并重新编译
git add -A && git commit -m "同步题库"
git push origin main          # 触发 Actions 自动部署
```

### WorkBuddy 云端发布（备用）

- 站点地址：<https://ai-pm-interview-486.app.workbuddy.host/?sharecode=ML5MQW3TYD>（应用 ID `wbapp_9y43duPDpjybrl0id6j6u2`）
- 历史说明：早期版本曾发布到另一账号名下的应用（`wbapp_bQ0VYY4coZ2Sfpk6Uet3SM`），该记录已备份到 `.workbuddy/backup/2026-11-02/`，与本项目当前发布链无关

> 发布应用的归属由**当前工作区**的 `.workbuddy/applications.yaml` 决定，而不是部署目录。
> 若该文件指向别的账号创建的应用，发布会报 `SITES_ACCOUNT_MISMATCH`；清空记录后再发布会新建应用

## 当前数据版本

- 题目总数：511（面试题库 34 · 高频 100 题 100 · 面经实战 115 · 大厂 PM 八股文 72 · 鹅厂三轮面经 36 · LLM 八股文 48 · 专题题库 106）
- 序号连续：1–511，无缺号无重号，题卡 #序号 与表格「序号」一一对应
- 面经分组：10 套（面经一 21 · 面经二 15 · 面经三 10 · 面经四 15 · 面经五 8 · 面经六 8 · 面经七 11 · 面经八 10 · 面经九 9 · 面经十 8）+ 鹅厂三轮各 12 题
- 分册维度：大厂八股 9 章节 · 鹅厂 3 轮 · LLM 3 分部 · 专题 8 个（某大厂 LLM 26 / 鹅厂大模型技术面 22 / Transformer 19 / 产品经理基础 13 / 阿里大模型 8 / VibeCoding 8 / 推荐系统 7 / 智能客服 3）
- 难度分布：初级 23 · 中级 251 · 高级 237
- 题型覆盖：概念解释 107 / 方法流程 99 / 观点判断 90 / 经历描述 69 / 对比分析 45 / 方案设计 38 / 场景设计 20 / 概念辨析 12 / 指标设计 6

> 构建脚本会自动识别多维表格中新增的面经套别（中文数字泛匹配）并派生分组元数据，
> 新套别的「候选人画像 / 讲师提示」可在 `scripts/build.py` 的 `EXP_META` 中补充。
