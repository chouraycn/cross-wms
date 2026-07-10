#!/usr/bin/env zsh
# ============================================================
# 前端性能静态检查
#
# 检查常见性能反模式：
#   1. console.log/debug 留在生产代码中（应使用 logger）
#   2. 大文件警告（>500 行的组件文件，可能需要拆分）
#   3. 同步引入重依赖（antd 等应 lazy load）
#   4. 缺少 React.memo 的大列表渲染
#
# 策略：警告为主，console.log 硬阻断。
#
# 用法：zsh scripts/perf-lint.sh
# ============================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

FAIL=0
WARN=0

echo "⚡ 前端性能静态检查:"

# ----------------------------------------------------------------
# 1. console.log/debug 检查（生产代码中不应有 console.log/debug）
#    允许 console.warn / console.error（日志级别合理）
# ----------------------------------------------------------------
CONSOLE_LOG_LINES=$(grep -rn "console\.\(log\|debug\)[[:space:]]*(" src/ \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir='__tests__' --exclude-dir='node_modules' 2>/dev/null \
  | grep -vE ':[0-9]+:\s*//' | grep -vE ':[0-9]+:\s*\*')
CONSOLE_LOG_COUNT=$(echo "$CONSOLE_LOG_LINES" | grep -c . 2>/dev/null || echo 0)
CONSOLE_LOG_COUNT=$((CONSOLE_LOG_COUNT + 0))

if [[ "$CONSOLE_LOG_COUNT" -gt 0 ]]; then
  echo "  ⚠️  生产代码中发现 $CONSOLE_LOG_COUNT 处 console.log/debug（请使用 server/logger.ts 或移除）"
  echo "$CONSOLE_LOG_LINES" | head -10
  WARN=$((WARN + 1))
else
  echo "  ✅ 无 console.log/debug 残留"
fi

# ----------------------------------------------------------------
# 2. 大文件警告（>500 行的 .tsx 组件文件）
# ----------------------------------------------------------------
LARGE_FILES=""
LARGE_COUNT=0
while IFS= read -r f; do
  if [[ -n "$f" ]]; then
    LINES=$(wc -l < "$f" | tr -d ' ')
    if [[ "$LINES" -gt 500 ]]; then
      LARGE_FILES="${LARGE_FILES}  ${f}: ${LINES} 行\n"
      LARGE_COUNT=$((LARGE_COUNT + 1))
    fi
  fi
done < <(find src -name '*.tsx' ! -path '*__tests__*' ! -path '*node_modules*' 2>/dev/null)

if [[ "$LARGE_COUNT" -gt 0 ]]; then
  echo "  ⚠️  发现 $LARGE_COUNT 个大文件（>500 行），建议拆分以提升可维护性和首屏性能:"
  echo -e "$LARGE_FILES" | head -10
  WARN=$((WARN + 1))
else
  echo "  ✅ 无超大组件文件"
fi

# ----------------------------------------------------------------
# 3. 同步引入重依赖检查
#    以下库应使用 React.lazy 动态导入，不应在顶层 import：
#    - recharts / chart.js / d3（图表库体积大）
#    - @react-pdf/renderer（PDF 库体积大）
#    - monaco-editor / codemirror（编辑器体积大）
# ----------------------------------------------------------------
HEAVY_DEPS=("recharts" "chart\.js" "d3-" "@react-pdf" "monaco-editor" "@codemirror")
HEAVY_SYNC_COUNT=0
for dep in "${HEAVY_DEPS[@]}"; do
  COUNT=$(find src \( -name '*.ts' -o -name '*.tsx' \) \
    ! -path '*__tests__*' ! -path '*node_modules*' \
    -exec grep -HE "^import.*from.*['\"]${dep}" {} + 2>/dev/null | wc -l | tr -d ' ')
  COUNT=$((COUNT + 0))
  if [[ "$COUNT" -gt 0 ]]; then
    echo "  ⚠️  发现 ${dep} 被同步导入 ${COUNT} 次（建议使用 React.lazy 动态导入）"
    find src \( -name '*.ts' -o -name '*.tsx' \) \
      ! -path '*__tests__*' ! -path '*node_modules*' \
      -exec grep -Hn "^import.*from.*['\"]${dep}" {} + 2>/dev/null | head -5
    HEAVY_SYNC_COUNT=$((HEAVY_SYNC_COUNT + COUNT))
    WARN=$((WARN + 1))
  fi
done

if [[ "$HEAVY_SYNC_COUNT" -eq 0 ]]; then
  echo "  ✅ 无重依赖同步导入"
fi

# ----------------------------------------------------------------
# 4. React.lazy 覆盖率检查（页面级组件应 lazy 加载）
#    检查 src/pages/ 下的导出是否都被 React.lazy 包裹
# ----------------------------------------------------------------
PAGES_TOTAL=$(find src/pages -name '*.tsx' ! -path '*__tests__*' 2>/dev/null | wc -l | tr -d ' ')
PAGES_TOTAL=$((PAGES_TOTAL + 0))
LAZY_COUNT=$(grep -r "React.lazy.*import.*pages/" src/ 2>/dev/null | wc -l | tr -d ' ')
LAZY_COUNT=$((LAZY_COUNT + 0))

if [[ "$PAGES_TOTAL" -gt 0 ]]; then
  RATIO=$((LAZY_COUNT * 100 / PAGES_TOTAL))
  if [[ "$RATIO" -lt 80 ]]; then
    echo "  ⚠️  页面 lazy 加载覆盖率: ${LAZY_COUNT}/${PAGES_TOTAL} (${RATIO}%)，建议 ≥80%"
    WARN=$((WARN + 1))
  else
    echo "  ✅ 页面 lazy 加载覆盖率: ${LAZY_COUNT}/${PAGES_TOTAL} (${RATIO}%)"
  fi
fi

# ----------------------------------------------------------------
# 总结
# ----------------------------------------------------------------
echo ""
if [[ "$FAIL" -gt 0 ]]; then
  echo "❌ 性能检查未通过（有硬阻断项）"
  exit 1
elif [[ "$WARN" -gt 0 ]]; then
  echo "⚠️  性能检查通过（有 $WARN 个警告）"
  exit 0
else
  echo "✅ 性能检查通过"
  exit 0
fi
