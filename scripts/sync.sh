#!/bin/bash
# ============================================================
# sync.sh — AI 产品经理面试备考平台 · 数据同步脚本
#
# 作用：从飞书多维表格拉取最新数据 → 重新编译单文件应用
# 数据底座：https://15997672262.feishu.cn/base/UDXYbBLFqaQtrnsF8Mncn2PDndg
#
# 前置条件：
#   1. 已安装 lark-cli（npm i -g @larksuite/cli 或按技能指引安装）
#   2. 已授权读取权限：base:record:read base:table:read base:field:read
#      （首次使用：lark-cli auth login --scope "base:record:read base:table:read base:field:read" --no-wait --json）
#
# 用法：
#   bash scripts/sync.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_TOKEN="UDXYbBLFqaQtrnsF8Mncn2PDndg"

# 数据表 ID : 导出文件名（与 build.py 中 TABLES 的顺序对应）
TABLES=(
  "tblEpbl9nGvblJdU:table1_题库"
  "tblrg4pgBXvMT84z:table2_高频100题"
  "tbl2bnxvRa8pXzh6:table3_面经实战"
  "tblvlwFeOd4qm3oE:table4_大厂PM八股文"
  "tblhCV8PeR6CXOqw:table5_鹅厂三轮面经"
  "tblWfbxCptbttB00:table6_LLM八股文"
  "tblnRcNvta6NT5wu:table7_专题题库"
)

echo "[sync] 开始从飞书多维表格拉取数据 …"
for entry in "${TABLES[@]}"; do
  tbl="${entry%%:*}"
  name="${entry##*:}"
  echo "[sync]   → $name ($tbl)"
  lark-cli base +record-list \
    --base-token "$BASE_TOKEN" \
    --table-id "$tbl" \
    --as user \
    --format ndjson \
    --output "data/$name.ndjson" \
    --overwrite
done

echo "[sync] 数据拉取完成，开始编译 index.html …"
python3 scripts/build.py

echo "[sync] 全部完成 ✅  可直接部署 index.html"
