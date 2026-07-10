#!/usr/bin/env zsh
# ============================================================
# API 奐约检查（STABLE API 表面完整性验证）
#
# 对比 packages/contracts/*.d.ts 中声明的 STABLE API 导出
# 与各包 src/index.ts 实际导出，确保：
#   1. 奐约中声明的 STABLE 导出在实际代码中存在（不允许移除）
#   2. additive 变更（新增导出）仅发出警告，不阻止
#
# 与 scripts/check-packages.sh 互补：
#   - check-packages.sh 检查包名、版本、入口、跨包版本一致性
#   - check-api-contracts.sh 检查 STABLE API 奐约完整性
#
# 任一 STABLE 导出缺失 → 退出码 1（门禁失败）
#
# 用法：zsh scripts/check-api-contracts.sh
# ============================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

node scripts/check-api-contracts.cjs
