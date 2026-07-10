#!/usr/bin/env zsh
# ============================================================
# WKWebView 兼容静态检查
#
# 目标：防止在 src 中引入 WKWebView 不兼容写法：
#   - requestAnimationFrame / cancelAnimationFrame（macOS 桌面端应统一用 setTimeout 16ms）
#   - @keyframes CSS 动画（应改用 inline transition）
#   - new EventSource（WKWebView 不稳定，应改用 fetch + ReadableStream）
#   - CSS position:fixed 在特定 WKWebView 版本的抖动（仅警告）
#
# 策略：以「基线 + 回归拦截」方式运行。
#   - 首次运行自动生成基线 scripts/.wkwebview-baseline
#   - 之后若 requestAnimationFrame / EventSource 数量增加 → 失败（硬阻断）
#   - @keyframes 数量增加 → 仅警告（不阻断，可逐步收敛）
#
# 用法：zsh scripts/wkwebview-lint.sh
# ============================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASELINE_FILE="$ROOT_DIR/scripts/.wkwebview-baseline"

# 统计 src 中 requestAnimationFrame / cancelAnimationFrame 的「实际调用」行数（.ts/.tsx）。
# 只匹配后跟 '(' 的调用，避免把注释/文档里的词也计入（度量真违规，而非文字提及）。
RAF_COUNT=$(find src \( -name '*.ts' -o -name '*.tsx' \) \
  -exec grep -HE "(requestAnimationFrame|cancelAnimationFrame)[[:space:]]*\(" {} + 2>/dev/null | wc -l | tr -d ' ')
RAF_COUNT=$((RAF_COUNT + 0))

# 统计 src 中「真正的 @keyframes 定义」行数（.ts/.tsx/.css）。
# 只匹配 `@keyframes name {` 形式，避免注释里提到 "@keyframes" 被误计。
KEYFRAMES_COUNT=$(find src \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
  -exec grep -HE "@keyframes[[:space:]]+[A-Za-z_][A-Za-z0-9_-]*[[:space:]]*\{" {} + 2>/dev/null | wc -l | tr -d ' ')
KEYFRAMES_COUNT=$((KEYFRAMES_COUNT + 0))

# 统计 src 中 `new EventSource` 的使用行数（.ts/.tsx）。
# WKWebView 中 EventSource 连接不稳定（尤其是 POST + headers 场景），
# 项目约定统一用 fetch + ReadableStream 解析 SSE 流。
EVENTSOURCE_COUNT=$(find src \( -name '*.ts' -o -name '*.tsx' \) \
  -exec grep -HE "new[[:space:]]+EventSource[[:space:]]*\(" {} + 2>/dev/null | wc -l | tr -d ' ')
EVENTSOURCE_COUNT=$((EVENTSOURCE_COUNT + 0))

echo "🍎 WKWebView 兼容检查:"
echo "  requestAnimationFrame/cancelAnimationFrame 出现: $RAF_COUNT 行"
echo "  @keyframes 出现: $KEYFRAMES_COUNT 行"
echo "  new EventSource 出现: $EVENTSOURCE_COUNT 行"

# 基线处理：不存在则创建
if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "{ \"raf\": $RAF_COUNT, \"keyframes\": $KEYFRAMES_COUNT, \"eventsource\": $EVENTSOURCE_COUNT }" > "$BASELINE_FILE"
  echo "  (已创建基线文件: $BASELINE_FILE)"
fi

BASE_RAF=$(grep -o '"raf"[[:space:]]*:[[:space:]]*[0-9]*' "$BASELINE_FILE" 2>/dev/null | grep -o '[0-9]*$')
BASE_KEYFRAMES=$(grep -o '"keyframes"[[:space:]]*:[[:space:]]*[0-9]*' "$BASELINE_FILE" 2>/dev/null | grep -o '[0-9]*$')
BASE_EVENTSOURCE=$(grep -o '"eventsource"[[:space:]]*:[[:space:]]*[0-9]*' "$BASELINE_FILE" 2>/dev/null | grep -o '[0-9]*$')
BASE_RAF=$(( ${BASE_RAF:-0} + 0 ))
BASE_KEYFRAMES=$(( ${BASE_KEYFRAMES:-0} + 0 ))
BASE_EVENTSOURCE=$(( ${BASE_EVENTSOURCE:-0} + 0 ))

FAIL=0

if [[ "$RAF_COUNT" -gt "$BASE_RAF" ]]; then
  echo "  ❌ requestAnimationFrame 数量增加 ($BASE_RAF -> $RAF_COUNT)，WKWebView 不兼容，请用 setTimeout(fn, 16) 替代"
  FAIL=1
fi

if [[ "$KEYFRAMES_COUNT" -gt "$BASE_KEYFRAMES" ]]; then
  echo "  ⚠️  @keyframes 数量增加 ($BASE_KEYFRAMES -> $KEYFRAMES_COUNT)，建议改用 inline transition（不阻断）"
fi

# EventSource 检查：WKWebView 中不稳定，硬阻断新增
if [[ "$EVENTSOURCE_COUNT" -gt "$BASE_EVENTSOURCE" ]]; then
  echo "  ❌ new EventSource 数量增加 ($BASE_EVENTSOURCE -> $EVENTSOURCE_COUNT)，WKWebView 中不稳定，请改用 fetch + ReadableStream"
  FAIL=1
fi

# EventSource 存量警告
if [[ "$EVENTSOURCE_COUNT" -gt 0 ]]; then
  echo "  ⚠️  仍有 $EVENTSOURCE_COUNT 处 new EventSource 使用（存量），建议迁移到 fetch + ReadableStream"
fi

if [[ "$FAIL" -gt 0 ]]; then
  echo "WKWebView 兼容检查未通过"
  exit 1
fi

# 收紧基线：存量被收敛（当前少于基线）时把基线降到当前值，
# 确保后续「新增」rAF / @keyframes 能被正确拦截，而非永远卡在历史峰值。
NEED_TIGHTEN=0
if [[ "$RAF_COUNT" -lt "$BASE_RAF" ]]; then
  NEED_TIGHTEN=1
fi
if [[ "$KEYFRAMES_COUNT" -lt "$BASE_KEYFRAMES" ]]; then
  NEED_TIGHTEN=1
fi
if [[ "$EVENTSOURCE_COUNT" -lt "$BASE_EVENTSOURCE" ]]; then
  NEED_TIGHTEN=1
fi
if [[ "$NEED_TIGHTEN" -eq 1 ]]; then
  echo "{ \"raf\": $RAF_COUNT, \"keyframes\": $KEYFRAMES_COUNT, \"eventsource\": $EVENTSOURCE_COUNT }" > "$BASELINE_FILE"
  echo "  (已收紧基线: raf=$RAF_COUNT, keyframes=$KEYFRAMES_COUNT, eventsource=$EVENTSOURCE_COUNT)"
fi

echo "✅ WKWebView 兼容检查通过（rAF/EventSource 未新增）"
exit 0
