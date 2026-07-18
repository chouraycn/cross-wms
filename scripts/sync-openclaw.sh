#!/usr/bin/env bash
# sync-openclaw.sh — OpenClaw submodule drift detector for CDFKnowClow
#
# 比对 submodule 的 OpenClaw（默认 openclaw/）与一份上游参考
# （ref，默认 ../cdfknow），报告 新增 / 缺失 / 修改 / 搬迁 文件，并把每个
# “修改”文件归类为 SAFE（纯上游源码，可直接刷新）或 REVIEW（manifest /
# config / 入口 / 脚本，可能含产品定制，需逐文件确认）。
#
# 兼容 bash 3.2+ 与 zsh。每棵树仅计算一次 md5，后续用 join/comm/awk 比对。
#
# 用法:
#   ./scripts/sync-openclaw.sh [--ref REF_DIR] [--vendor VENDOR_DIR] \
#                              [--json] [--fail-on-drift] [--check-only] \
#                              [--dry-run]
# 环境变量: OPENCLAW_REF  上游参考目录（默认 ../cdfknow）
# 退出码: 0 正常 / dry-run; 1 --fail-on-drift 且存在漂移; 2 参数/路径错误
#
set -euo pipefail

REF="${OPENCLAW_REF:-../cdfknow}"
VENDOR="openclaw"
JSON=0
FAIL_ON_DRIFT=0
CHECK_ONLY=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)           REF="$2"; shift 2;;
    --vendor)        VENDOR="$2"; shift 2;;
    --json)          JSON=1; shift;;
    --fail-on-drift) FAIL_ON_DRIFT=1; shift;;
    --check-only)    CHECK_ONLY=1; shift;;
    --dry-run)       DRY_RUN=1; shift;;
    -h|--help)       sed -n '2,17p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT/$VENDOR"
[[ "$REF" = /* ]] && REF_DIR="$REF" || REF_DIR="$ROOT/$REF"

[[ -d "$VENDOR_DIR" ]] || { echo "vendor dir not found: $VENDOR_DIR" >&2; exit 2; }
[[ -d "$REF_DIR" ]]    || { echo "ref dir not found: $REF_DIR" >&2;    exit 2; }

SELF_EXCLUDES="openclaw-vendor-pin.json|scripts/sync-openclaw.sh|FORK_BOUNDARY.md"

md5of() {
  if command -v md5sum >/dev/null 2>&1; then md5sum "$1" | awk '{print $1}'
  else md5 -q "$1"; fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
VMD5="$TMP/v.md5"; RMD5="$TMP/r.md5"
VPATHS="$TMP/v.paths"; RPATHS="$TMP/r.paths"
COMMON="$TMP/common"; ONLYV="$TMP/onlyv"; ONLYR="$TMP/onlyr"
MODF="$TMP/modified"; JOINED="$TMP/joined"; RBIDX="$TMP/rbidx"
RELF="$TMP/relocated"

build_map() {
  local root="$1" out="$2"
  ( cd "$root" && find . -type f \
      -not -path '*/node_modules/*' -not -path '*/.git/*' \
      -not -path '*/dist/*' -not -path '*/dist-runtime/*' \
      -not -path '*/coverage/*' -not -path '*/.turbo/*' \
      -not -path '*/.next/*' -not -path '*/build/*' \
      -not -path '*/.cache/*' -not -path '*/.tmp/*' ) \
    | sed 's#^\./##' | grep -vE "^($SELF_EXCLUDES)$" \
    | while IFS= read -r f; do printf '%s\t%s\n' "$(md5of "$root/$f")" "$f"; done \
    | sort -t$'\t' -k2 > "$out"
}
build_map "$VENDOR_DIR" "$VMD5"
build_map "$REF_DIR"    "$RMD5"

cut -f2- "$VMD5" > "$VPATHS"
cut -f2- "$RMD5" > "$RPATHS"

comm -12 "$VPATHS" "$RPATHS" > "$COMMON"
comm -23 "$VPATHS" "$RPATHS" > "$ONLYV"
comm -13 "$VPATHS" "$RPATHS" > "$ONLYR"

join -t$'\t' -1 2 -2 2 -o 1.1,0,2.1 "$VMD5" "$RMD5" 2>/dev/null \
  | awk -F$'\t' '$1!=$3 {print $2}' > "$MODF"

awk -F$'\t' '{
  md5=$1; path=$2; n=split(path,p,"/"); b=p[n];
  print b"\t"md5"\t"path
}' "$RMD5" > "$RBIDX"

while IFS= read -r f; do
  vmd5="$(awk -F$'\t' -v p="$f" '$2==p{print $1; exit}' "$VMD5")"
  b="${f##*/}"
  match="$(awk -F$'\t' -v b="$b" -v m="$vmd5" '$1==b && $2==m{print $3; exit}' "$RBIDX")"
  [[ -n "$match" ]] && echo "$f -> $match" >> "$RELF"
done < "$ONLYV"

is_review() {
  local f="$1" base; base="$(basename "$f")"
  [[ "$base" == "package.json" ]] && return 0
  [[ "$base" == tsconfig*.json ]] && return 0
  [[ "$base" == *.config.* ]] && return 0
  [[ "$base" == vitest.*.mjs ]] && return 0
  [[ "$f" == scripts/lib/*.mjs ]] && return 0
  [[ "$f" == scripts/*.mjs ]] && return 0
  return 1
}

NV=$(wc -l < "$VPATHS" | tr -d ' ')
NR=$(wc -l < "$RPATHS" | tr -d ' ')
NM=$(wc -l < "$MODF"  | tr -d ' ')
NAV=$(wc -l < "$ONLYV" | tr -d ' ')
NAR=$(wc -l < "$ONLYR" | tr -d ' ')
NREL=$(wc -l < "$RELF" | tr -d ' ')

if [[ "$JSON" -eq 1 ]]; then
  json_arr() {
    local first=1
    printf '['
    local n=0
    while IFS= read -r line; do
      [[ -n "$2" && $n -ge "$2" ]] && break
      esc="${line//\"/\\\"}"
      [[ $first -eq 1 ]] && first=0 || printf ','
      printf '"%s"' "$esc"
      n=$((n+1))
    done < "$1"
    printf ']'
  }
  echo "{"
  echo "  \"dryRun\": $DRY_RUN,"
  echo "  \"vendor\": \"$VENDOR_DIR\","
  echo "  \"ref\": \"$REF_DIR\","
  echo "  \"counts\": {\"vendorFiles\": $NV, \"refFiles\": $NR, \"modified\": $NM, \"addedInRef\": $NAR, \"addedInVendor\": $NAV, \"relocated\": $NREL},"
  echo -n "  \"modified\": ["
  first=1
  while IFS= read -r f; do
    cls="SAFE"; is_review "$f" && cls="REVIEW"
    [[ $first -eq 1 ]] && first=0 || printf ','
    printf '{"path":"%s","class":"%s"}' "$f" "$cls"
  done < "$MODF"
  echo "],"
  echo -n "  \"addedInRef\": "; json_arr "$ONLYR" 200; echo ","
  echo -n "  \"addedInVendor\": "; json_arr "$ONLYV" 200; echo ","
  echo -n "  \"relocated\": ["
  first=1
  while IFS=' -> ' read -r a b; do
    [[ $first -eq 1 ]] && first=0 || printf ','
    printf '{"from":"%s","to":"%s"}' "$a" "$b"
  done < "$RELF"
  echo "]"
  echo "}"
else
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "=================================================================="
    echo " OpenClaw Submodule Drift Report  [DRY-RUN — no failure will occur]"
    echo " vendor : $VENDOR_DIR"
    echo " ref    : $REF_DIR"
    echo "------------------------------------------------------------------"
  else
    echo "=================================================================="
    echo " OpenClaw Submodule Drift Report"
    echo " vendor : $VENDOR_DIR"
    echo " ref    : $REF_DIR"
    echo "------------------------------------------------------------------"
  fi
  echo " vendor files : $NV"
  echo " ref files    : $NR"
  echo " modified     : $NM"
  echo " added(ref)   : $NAR"
  echo " added(vendor): $NAV"
  echo " relocated    : $NREL"
  echo "=================================================================="
  if [[ $NM -gt 0 ]]; then
    echo ""; echo "## MODIFIED (common path, different content)"
    while IFS= read -r f; do
      if is_review "$f"; then echo "  [REVIEW] $f"; else echo "  [SAFE]   $f"; fi
    done < "$MODF"
  fi
  if [[ $NAR -gt 0 ]]; then
    echo ""; echo "## ONLY IN REF (ref has, vendor lacks) — $NAR"
    while IFS= read -r f; do echo "  $f"; done < "$ONLYR"
  fi
  if [[ $NAV -gt 0 ]]; then
    echo ""; echo "## ONLY IN VENDOR (vendor has, ref lacks) — $NAV"
    while IFS= read -r f; do echo "  $f"; done < "$ONLYV"
  fi
  if [[ $NREL -gt 0 ]]; then
    echo ""; echo "## RELOCATED (same content, different path)"
    while IFS= read -r line; do echo "  $line"; done < "$RELF"
  fi
  echo ""
  echo "Legend: [SAFE] 纯上游源码可刷新; [REVIEW] manifest/config/入口/脚本，需逐文件确认是否含产品定制。"
  echo ""

  # Sync summary
  echo "------------------------------------------------------------------"
  echo " Sync Summary"
  echo "------------------------------------------------------------------"
  echo "  vendor (submodule)  : $VENDOR_DIR"
  echo "  upstream reference  : $REF_DIR"
  echo "  drift status        : $(if [[ $NM -gt 0 || $NAR -gt 0 || $NAV -gt 0 ]]; then echo "DRIFT DETECTED"; else echo "clean"; fi)"
  echo "  safe-to-refresh     : $(grep -cv '^$' "$MODF" 2>/dev/null | awk -v total="$NM" 'END{print total}') files (modified)"
  if [[ $NAR -gt 0 ]]; then
    echo "  new-in-upstream     : $NAR files (review for port)"
  fi
  if [[ $NAV -gt 0 ]]; then
    echo "  new-in-vendor       : $NAV files (likely product customizations)"
  fi
  echo ""

  echo "Submodule Workflow:"
  echo "  1. 更新上游: cd openclaw && git pull origin main && cd .."
  echo "  2. 运行本脚本检测 drift"
  echo "  3. 将 SAFE 类文件同步进 @cdf-know/* 对应面"
  echo "  4. 更新 openclaw-vendor-pin.json 的 pinnedCommit"
  echo "  5. git add openclaw .gitmodules openclaw-vendor-pin.json"
fi

# Dry-run never fails — useful for safe previews / CI status checks
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY-RUN: drift detected but not failing the build." >&2
  exit 0
fi

if [[ "$FAIL_ON_DRIFT" -eq 1 ]]; then
  if [[ $NM -gt 0 || $NAR -gt 0 || $NAV -gt 0 ]]; then
    echo "FAIL_ON_DRIFT: drift detected." >&2; exit 1
  fi
fi
exit 0
