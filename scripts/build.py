#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build.py — AI 产品经理面试备考平台 · 数据编译脚本

职责：
1. 读取 data/ 下七张从飞书多维表格导出的 ndjson
   （面试题库 / 高频100题 / 面经实战 / 大厂PM八股文 / 鹅厂三轮面经 / LLM八股文 / 专题题库）
2. 规范化为统一 schema，派生「面经 N 套」分组与章节 / 轮次 / 分部 / 专题维度
3. 将 questions.json 注入 template.html 的 __DATA_JSON__ 占位符
4. 产出单文件零依赖应用 index.html

用法：
    python3 scripts/build.py
"""
import json
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA_DIR = BASE / "data"
TEMPLATE = BASE / "template.html"
OUTPUT = BASE / "index.html"

# (导出文件, 数据源标识, 数据源全名)
TABLES = [
    ("table1_题库.ndjson", "deep", "面试题库"),
    ("table2_高频100题.ndjson", "top100", "AI PM 高频 100 题"),
    ("table3_面经实战.ndjson", "exp", "面经实战"),
    ("table4_大厂PM八股文.ndjson", "pm", "大厂 PM 八股文"),
    ("table5_鹅厂三轮面经.ndjson", "tx", "鹅厂 AI PM 三轮面经"),
    ("table6_LLM八股文.ndjson", "llm", "大模型 LLMs 八股文"),
    ("table7_专题题库.ndjson", "topic", "专题题库"),
]

# 数据源展示元信息（首页卡片、题库/练习/模考来源切换、题卡徽标）
# group: core=核心题库，plus=进阶专项
SOURCES = [
    {
        "k": "deep", "name": "面试题库", "short": "面试题库", "group": "core", "cls": "b-deep",
        "desc": "Agent 架构、RAG、记忆机制、评测指标等深度专项题，配套完整答题框架，覆盖方案设计与概念辨析。",
        "tags": ["方案设计", "概念辨析", "指标设计"],
    },
    {
        "k": "top100", "name": "AI PM 高频 100 题", "short": "高频 100", "group": "core", "cls": "b-top",
        "desc": "通用高频题库：技术通识、产品规划、数据指标、行业趋势、团队协作，一线城市 AI PM 面试出现频率最高的问题集合。",
        "tags": ["方法流程", "经历描述", "观点判断"],
    },
    {
        "k": "exp", "name": "面经实战", "short": "面经实战", "group": "core", "cls": "b-exp",
        "desc": "10 位不同背景候选人的真实面试记录：懂算法有经历 / 有应用不懂算法 / 零基础 / 校招 / 转型 / 技术转产品 / 产品实习 / Agent 方向。",
        "tags": ["真实面经", "背景画像", "问答完整"],
    },
    {
        "k": "pm", "name": "大厂 PM 八股文", "short": "大厂八股", "group": "plus", "cls": "b-pm",
        "desc": "大厂产品经理面试八股体系：个人情况、个人经历、产品素质、经典算法、深度学习、大数据模型、技术基础、工作场景、行业认知 9 大章节。",
        "tags": ["9 大章节", "大厂口径", "八股速记"],
    },
    {
        "k": "tx", "name": "鹅厂 AI PM 三轮面经", "short": "鹅厂面经", "group": "plus", "cls": "b-tx",
        "desc": "腾讯 AI 产品经理一面 / 二面 / 三面完整流程，每轮 12 题，看面试官如何在三轮里层层加码、逐步深入。",
        "tags": ["三轮全流程", "层层追问", "腾讯口径"],
    },
    {
        "k": "llm", "name": "大模型 LLMs 八股文", "short": "LLM 八股", "group": "plus", "cls": "b-llm",
        "desc": "基础面 / 进阶面 / 微调面三大分部：Transformer 结构、训练与微调、推理部署等大模型硬核考点，按面试进度分册刷。",
        "tags": ["基础面", "进阶面", "微调面"],
    },
    {
        "k": "topic", "name": "专题题库", "short": "专题题库", "group": "plus", "cls": "b-topic",
        "desc": "6 大专题横向打通：某大厂 LLM、Transformer、产品经理基础、阿里大模型、推荐系统、VibeCoding，适合查漏补缺与跨库串联。",
        "tags": ["6 大专题", "横向串联", "查漏补缺"],
    },
]

# 面经标题解析：《面经一：懂算法模型且有 AI 经历》截图 · 第 N 题（支持一~十及以上的中文数字）
EXP_PATTERN = re.compile(r"《面经([一二三四五六七八九十百]+)：([^》]*)》")

CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn_to_int(s: str) -> int:
    """中文数字转整数，支持 一~九十九。"""
    if not s:
        return 0
    if s == "十":
        return 10
    if "十" in s:
        left, _, right = s.partition("十")
        tens = CN_NUM.get(left, 1) if left else 1
        ones = CN_NUM.get(right, 0) if right else 0
        return tens * 10 + ones
    if "百" in s:
        left, _, right = s.partition("百")
        hundreds = CN_NUM.get(left, 1) if left else 1
        return hundreds * 100 + cn_to_int(right)
    return CN_NUM.get(s, 0)


# 面经套别的候选人画像与讲师提示（依据套别标题归纳，用于面经研读页）
EXP_META = {
    "面经一": {
        "title": "懂算法模型且有 AI 经历",
        "persona": "技术底子厚、有完整 AI 项目经历的候选人",
        "advice": "对标技术型选手：重点看技术追问如何被翻译成产品语言，以及项目数据如何呈现。",
    },
    "面经二": {
        "title": "有 AI 应用，不懂算法",
        "persona": "做过 AI 应用但算法基础薄弱的候选人",
        "advice": "应用型选手路径：突出场景与数据结果，算法类问题用「够用原则」应对，不硬刚。",
    },
    "面经三": {
        "title": "没有 AI 基础",
        "persona": "零 AI 基础的候选人",
        "advice": "零基础突围样本：看基础题如何不掉分、如何用产品经验弥补技术短板。",
    },
    "面经四": {
        "title": "有 AI 应用，不懂算法模型",
        "persona": "有应用经验、模型原理不熟的候选人",
        "advice": "与面经二互补：重点关注模型能力边界、选型类问题的答法。",
    },
    "面经五": {
        "title": "懂算法模型，且有 AI 经历",
        "persona": "懂算法模型且有 AI 经历的技术型候选人",
        "advice": "与面经一同类但题量少而精，适合作为冲刺阶段的自测卷。",
    },
    "面经六": {
        "title": "校招不懂算法模型，但有跑通 vibecoding 工作流",
        "persona": "校招应届生，能跑通 Vibe Coding 工作流",
        "advice": "校招路径：项目故事 + 工具实操是亮点，看算法短板如何被规避。",
    },
    "面经七": {
        "title": "无 AI 应用，产品经理转 AI 产品经理",
        "persona": "传统产品经理转型 AI 产品经理",
        "advice": "转型叙事样板：看既有产品能力如何迁移包装，AI 认知如何快速补齐。",
    },
    "面经八": {
        "title": "有技术背景，投递 AI 产品经理岗位",
        "persona": "有技术背景转投 AI 产品经理岗位",
        "advice": "技术转产品样本：警惕陷入实现细节，看如何把技术讲成产品决策。",
    },
    "面经九": {
        "title": "有产品实习经历，无 AI 基础",
        "persona": "有产品实习经历但无 AI 基础的候选人",
        "advice": "实习转正样本：产品基本功是底盘，看 AI 认知如何在短时间内补齐、实习项目如何讲出深度。",
    },
    "面经十": {
        "title": "有 AI 基础，求职 Agent 方向",
        "persona": "有 AI 基础、目标 Agent 方向岗位的候选人",
        "advice": "定向求职样本：Agent 岗位追问集中在架构与落地，重点看技术理解如何与岗位 JD 精准对齐。",
    },
}

LEVEL_ORDER = {"初级": 0, "中级": 1, "高级": 2}
PART_ORDER = {"基础面": 0, "进阶面": 1, "微调面": 2}

# 章节「一、个人情况类」按前缀中文数字排序
CHAPTER_PREFIX = re.compile(r"^\s*([一二三四五六七八九十]+)\s*[、.．]")


def load_ndjson(name: str) -> list:
    path = DATA_DIR / name
    if not path.exists():
        sys.exit(f"[build] 缺少数据文件: {path}\n请先运行 scripts/sync.sh 从飞书多维表格同步数据。")
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def as_list(value) -> list:
    """多维表格多选字段导出为 list，单选也统一为 list。"""
    if value is None:
        return []
    if isinstance(value, list):
        return [v for v in value if v]
    return [value]


def first(value, default=""):
    lst = as_list(value)
    return lst[0] if lst else default


def text(value) -> str:
    """文本字段可能是 str 或富文本片段数组。"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict):
                parts.append(item.get("text") or item.get("name") or "")
            else:
                parts.append(str(item))
        return "".join(parts).strip()
    return str(value).strip()


def normalize() -> list:
    questions = []
    seq = 0
    for filename, src, src_name in TABLES:
        for rec in load_ndjson(filename):
            seq += 1
            origin = text(rec.get("数据来源"))
            exp_no, exp_title = None, None
            m = EXP_PATTERN.search(origin)
            if m:
                exp_no = f"面经{m.group(1)}"
                exp_title = m.group(2).strip()
            # 背景画像字段作为标题兜底（数据来源标题信息更完整，优先）
            profile = first(rec.get("背景画像"))
            if profile and not exp_title:
                exp_title = profile.split("·", 1)[-1] if "·" in profile else profile
            questions.append({
                "id": f"q{seq:03d}",
                "src": src,
                "srcName": src_name,
                "no": rec.get("序号") or seq,
                "q": text(rec.get("题目")),
                "a": text(rec.get("答案解析")),
                "level": first(rec.get("难度")),
                "type": first(rec.get("题型")),
                "tags": as_list(rec.get("分类标签")),
                "dims": as_list(rec.get("考察维度")),
                "status": first(rec.get("状态")),
                # 分册维度：不同数据表各带一个分组字段
                "chapter": first(rec.get("章节")),
                "round": first(rec.get("轮次")),
                "part": first(rec.get("分部")),
                "topic": text(rec.get("专题")),
                "expNo": exp_no,
                "expTitle": exp_title,
                "origin": origin,
            })
    questions.sort(key=lambda x: (x["no"], x["id"]))
    return questions


def chapter_key(name: str) -> tuple:
    m = CHAPTER_PREFIX.match(name)
    return (cn_to_int(m.group(1)) if m else 99, name)


def round_key(name: str) -> tuple:
    return (cn_to_int(name[0]) if name else 99, name)


def build_facets(questions: list) -> dict:
    levels, types, tags, dims = set(), set(), set(), set()
    exp_counts = {}
    chapter_counts, round_counts, part_counts, topic_counts = {}, {}, {}, {}
    for q in questions:
        if q["level"]:
            levels.add(q["level"])
        if q["type"]:
            types.add(q["type"])
        tags.update(q["tags"])
        dims.update(q["dims"])
        if q["expNo"]:
            exp_counts[q["expNo"]] = exp_counts.get(q["expNo"], 0) + 1
        if q["chapter"]:
            chapter_counts[q["chapter"]] = chapter_counts.get(q["chapter"], 0) + 1
        if q["round"]:
            round_counts[q["round"]] = round_counts.get(q["round"], 0) + 1
        if q["part"]:
            part_counts[q["part"]] = part_counts.get(q["part"], 0) + 1
        if q["topic"]:
            topic_counts[q["topic"]] = topic_counts.get(q["topic"], 0) + 1

    # 面经分组元数据：从数据中实际出现的分组派生（按中文数字排序），
    # 标题以「数据来源」解析结果为准，缺失时回退静态表；新增套别自动出现
    def exp_sort_key(no):
        return cn_to_int(no.replace("面经", ""))

    exp_meta = {}
    for no in sorted(exp_counts, key=exp_sort_key):
        count = exp_counts[no]
        title = next((q["expTitle"] for q in questions if q["expNo"] == no and q["expTitle"]), "")
        static = EXP_META.get(no, {})
        exp_meta[no] = {
            "title": title or static.get("title", ""),
            "count": count,
            "persona": static.get("persona", "候选人背景见面经标题"),
            "advice": static.get("advice", "通读全套问答，关注提问逻辑与高分答法，再限时自测。"),
        }

    return {
        "levels": sorted(levels, key=lambda x: LEVEL_ORDER.get(x, 9)),
        "types": sorted(types),
        "tags": sorted(tags),
        "dims": sorted(dims),
        "chapters": sorted(chapter_counts, key=chapter_key),
        "rounds": sorted(round_counts, key=round_key),
        "parts": sorted(part_counts, key=lambda x: (PART_ORDER.get(x, 9), x)),
        "topics": sorted(topic_counts, key=lambda x: (-topic_counts[x], x)),
        "counts": {
            "chapters": chapter_counts,
            "rounds": round_counts,
            "parts": part_counts,
            "topics": topic_counts,
        },
        "expMeta": exp_meta,
    }


def main():
    questions = normalize()
    facets = build_facets(questions)

    by_src = {src: sum(1 for q in questions if q["src"] == src) for _, src, _ in TABLES}
    by_level = {lv: sum(1 for q in questions if q["level"] == lv) for lv in LEVEL_ORDER}

    sources = []
    for meta in SOURCES:
        item = dict(meta)
        item["count"] = by_src.get(meta["k"], 0)
        sources.append(item)

    payload = {
        "generatedAt": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M"),
        "stats": {
            "total": len(questions),
            "bySrc": by_src,
            "byLevel": by_level,
            "srcCount": len(sources),
            "coreCount": sum(1 for s in sources if s["group"] == "core"),
            "expGroups": sum(1 for v in facets["expMeta"].values() if v["count"] > 0),
            "expTotal": by_src.get("exp", 0),
            "txRounds": sum(1 for v in facets["counts"]["rounds"].values() if v > 0),
        },
        "sources": sources,
        "facets": facets,
        "questions": questions,
    }

    # 防 </script> 提前闭合：< 统一转义为 \u003c（JSON 合法转义）
    data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")

    if not TEMPLATE.exists():
        sys.exit(f"[build] 缺少模板文件: {TEMPLATE}")
    html = TEMPLATE.read_text(encoding="utf-8")
    if "__DATA_JSON__" not in html:
        sys.exit("[build] 模板中未找到 __DATA_JSON__ 占位符")
    html = html.replace("__DATA_JSON__", data_json)

    OUTPUT.write_text(html, encoding="utf-8")
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"[build] 题目总数: {payload['stats']['total']}")
    print(f"[build] 分库: {by_src}")
    print(f"[build] 难度: {by_level}")
    print(f"[build] 面经分组: {payload['stats']['expGroups']} 套 / 鹅厂 {payload['stats']['txRounds']} 轮")
    print(f"[build] 专题: {facets['counts']['topics']}")
    print(f"[build] 输出: {OUTPUT} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
