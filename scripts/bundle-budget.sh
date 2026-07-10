#!/usr/bin/env zsh
# ============================================================
# 前端 Bundle 预算检查
#
# 在 pre-build 阶段对 dist/ 做体积预算：
#   - > 60MB (61440KB) → 失败（硬上限，拦截体积失控）
#   - > 50MB (51200KB) → 警告（预警线）
#   - 否则通过
#
# dist 不存在时仅警告跳过（需先构建）。
#
# 用法：zsh scripts/bundle-budget.sh
# ============================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

HARD_LIMIT_KB=61440   # 60MB
WARN_LIMIT_KB=51200   # 50MB

if [[ ! -d "dist" ]]; then
  echo "⚠️  dist 目录不存在，跳过 bundle 预算（请先执行前端构建）"
  exit 0
fi

BUNDLE_KB=$(du -sk dist 2>/dev/null | cut -f1 | tr -d ' ')
JS_KB=$(find dist -name '*.js' -exec du -sk {} + 2>/dev/null | awk '{s+=$1} END{print s+0}')
CSS_KB=$(find dist -name '*.css' -exec du -sk {} + 2>/dev/null | awk '{s+=$1} END{print s+0}')
BUNDLE_KB=$((BUNDLE_KB + 0))
JS_KB=$((JS_KB + 0))
CSS_KB=$((CSS_KB + 0))

echo "📦 Bundle 预算:"
echo "  总大小: ${BUNDLE_KB}KB ($((BUNDLE_KB / 1024))MB)"
echo "  JS: ${JS_KB}KB | CSS: ${CSS_KB}KB"

if [[ "$BUNDLE_KB" -gt "$HARD_LIMIT_KB" ]]; then
  echo "❌ Bundle 总大小 ${BUNDLE_KB}KB 超过硬上限 ${HARD_LIMIT_KB}KB (60MB)"
  exit 1
elif [[ "$BUNDLE_KB" -gt "$WARN_LIMIT_KB" ]]; then
  echo "⚠️  Bundle 总大小 ${BUNDLE_KB}KB 超过预警线 ${WARN_LIMIT_KB}KB (50MB)"
  exit 0
fi

echo "✅ Bundle 预算通过"
exit 0
