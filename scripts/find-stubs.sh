#!/usr/bin/env bash
#
# find-stubs.sh — 搜索所有 stub 文件并输出报告
#
# 用途：列出项目中所有使用旧命名约定的 stub 文件，标注行数，
#       并尝试判断哪些 stub 已有真实实现可被消除 vs 需要保留。
#
# 用法：./scripts/find-stubs.sh [--json]
#
# 退出码：0 成功

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 判断 stub 是否可消除的启发式规则：
#   1. 文件中包含 "throw new Error" → 仍是占位，需保留
#   2. 文件中包含 "TODO" / "FIXME" / "not implemented" → 未完成，需保留
#   3. 文件中包含真实实现关键字且无 throw → 可能可消除

if [[ "${1:-}" == "--json" ]]; then
  echo "["
  first=1
  while IFS= read -r f; do
    lines=$(wc -l < "$f" | tr -d ' ')
    status="keep"
    if grep -qE 'throw new (Error|TypeError|NotImplementedError)' "$f" 2>/dev/null; then
      status="keep"
    elif grep -qiE '(TODO|FIXME|not implemented|not yet|placeholder)' "$f" 2>/dev/null; then
      status="keep"
    elif grep -qE '(export function|export const|export class|return )' "$f" 2>/dev/null; then
      status="maybe-eliminable"
    fi
    if [[ $first -eq 0 ]]; then echo ","; fi
    first=0
    printf '  {"file": "%s", "lines": %d, "status": "%s"}' "$f" "$lines" "$status"
  done < <(find server -type f -name '_*stub*.ts' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/dist-server/*' | sort)
  echo ""
  echo "]"
  exit 0
fi

echo "========================================"
echo " Stub File Report (P3-23)"
echo "========================================"
echo ""

TOTAL_FILES=0
TOTAL_LINES=0
ELIMINABLE=0
KEEP=0

printf "%-78s %6s  %s\n" "FILE" "LINES" "STATUS"
printf "%-78s %6s  %s\n" "------------------------------------------------------------------------------" "------" "------------------"

while IFS= read -r f; do
  lines=$(wc -l < "$f" | tr -d ' ')
  TOTAL_FILES=$((TOTAL_FILES + 1))
  TOTAL_LINES=$((TOTAL_LINES + lines))

  status="KEEP"
  reason=""
  if grep -qE 'throw new (Error|TypeError|NotImplementedError)' "$f" 2>/dev/null; then
    reason="contains throw (placeholder)"
    KEEP=$((KEEP + 1))
  elif grep -qiE '(TODO|FIXME|not implemented|not yet|placeholder)' "$f" 2>/dev/null; then
    reason="contains TODO/placeholder"
    KEEP=$((KEEP + 1))
  elif grep -qE '(export function|export const|export class|return )' "$f" 2>/dev/null; then
    status="MAYBE-ELIMINABLE"
    reason="has real implementation, check upstream"
    ELIMINABLE=$((ELIMINABLE + 1))
  else
    reason="no real implementation detected"
    KEEP=$((KEEP + 1))
  fi

  short="${f#$ROOT/}"
  printf "%-78s %6d  %s (%s)\n" "$short" "$lines" "$status" "$reason"
done < <(find server -type f -name '_*stub*.ts' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/dist-server/*' | sort)

echo ""
echo "----------------------------------------"
echo "Summary:"
echo "  Total files:      $TOTAL_FILES"
echo "  Total lines:      $TOTAL_LINES"
echo "  Maybe eliminable: $ELIMINABLE"
echo "  Keep (stub):      $KEEP"
echo ""
echo "Legend:"
echo "  MAYBE-ELIMINABLE — 文件含真实实现代码，可能已有上游替代，需人工审查"
echo "  KEEP             — 文件仍是占位/抛错/TODO，需要保留直到真实实现就绪"
echo ""
echo "Note: 此判断为启发式，需人工复核。"
echo "      参考 P3-23 优化计划统一重命名为 *.stub.ts 约定。"
