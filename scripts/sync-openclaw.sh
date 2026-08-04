#!/usr/bin/env bash
# sync-openclaw.sh — openclaw 子模块版本同步与差异检测
#
# 用法：
#   ./scripts/sync-openclaw.sh check     # 检查当前版本与上次同步的差异
#   ./scripts/sync-openclaw.sh sync      # 同步指定模块到 server/engine/
#   ./scripts/sync-openclaw.sh version   # 显示当前版本信息
#
# 配置：scripts/.openclaw-sync.json 记录已同步的 commit 和模块列表

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OPENCLAW_DIR="$ROOT_DIR/openclaw"
SYNC_FILE="$ROOT_DIR/scripts/.openclaw-sync.json"
SERVER_ENGINE="$ROOT_DIR/server/engine"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 获取当前 openclaw 版本信息
get_version() {
  local commit version
  commit=$(cd "$OPENCLAW_DIR" && git rev-parse HEAD 2>/dev/null || echo "unknown")
  version=$(cd "$OPENCLAW_DIR" && grep '"version"' package.json 2>/dev/null | head -1 | sed 's/.*"version": *"//;s/".*//' || echo "unknown")
  echo "{\"commit\": \"$commit\", \"version\": \"$version\", \"syncedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
}

# 初始化同步记录文件
init_sync_file() {
  if [ ! -f "$SYNC_FILE" ]; then
    local version_info
    version_info=$(get_version)
    cat > "$SYNC_FILE" << EOF
{
  "lastSyncedCommit": "$version_info" | python3 -c "import sys,json; print(json.load(sys.stdin)['commit'])"",
  "lastSyncedVersion": "$version_info" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"",
  "lastSyncedAt": "$version_info" | python3 -c "import sys,json; print(json.load(sys.stdin)['syncedAt'])"",
  "syncedModules": []
}
EOF
    log_info "已创建同步记录文件: $SYNC_FILE"
  fi
}

# 显示版本信息
cmd_version() {
  local current last
  current=$(get_version)
  echo "=== openclaw 当前版本 ==="
  echo "$current" | python3 -m json.tool 2>/dev/null || echo "$current"

  if [ -f "$SYNC_FILE" ]; then
    echo ""
    echo "=== 上次同步记录 ==="
    cat "$SYNC_FILE" | python3 -m json.tool 2>/dev/null || cat "$SYNC_FILE"
  else
    echo ""
    log_warn "尚未进行过同步（同步记录文件不存在）"
  fi
}

# 检查差异
cmd_check() {
  init_sync_file

  local current_commit last_commit
  current_commit=$(cd "$OPENCLAW_DIR" && git rev-parse HEAD)
  last_commit=$(python3 -c "import json; print(json.load(open('$SYNC_FILE'))['lastSyncedCommit'])" 2>/dev/null || echo "")

  if [ "$current_commit" = "$last_commit" ]; then
    log_info "openclaw 无更新（commit 未变: ${current_commit:0:12}）"
    return 0
  fi

  log_info "openclaw 有更新:"
  echo "  上次同步: ${last_commit:0:12}"
  echo "  当前版本: ${current_commit:0:12}"

  if [ -n "$last_commit" ] && [ "$last_commit" != "unknown" ]; then
    echo ""
    log_info "变更文件列表（openclaw/src/）:"
    (cd "$OPENCLAW_DIR" && git diff --name-only "$last_commit" HEAD -- src/ 2>/dev/null | head -50) || true

    local changed_count
    changed_count=$(cd "$OPENCLAW_DIR" && git diff --name-only "$last_commit" HEAD -- src/ 2>/dev/null | wc -l | tr -d ' ')
    echo ""
    echo "  共 $changed_count 个文件变更"

    # 检查变更文件在 server/engine/ 中是否有对应
    echo ""
    log_info "变更文件在 server/engine/ 中的覆盖情况:"
    (cd "$OPENCLAW_DIR" && git diff --name-only "$last_commit" HEAD -- src/ 2>/dev/null) | while read -r f; do
      local basename dir_name srv_path
      basename=$(basename "$f")
      dir_name=$(dirname "$f" | sed 's|^src/||')
      srv_path="$SERVER_ENGINE/$dir_name/$basename"
      if [ -f "$srv_path" ]; then
        echo "  ✓ $f → $srv_path"
      else
        echo "  ✗ $f (无对应)"
      fi
    done | head -30
  fi
}

# 同步模块
cmd_sync() {
  if [ $# -eq 0 ]; then
    log_error "请指定要同步的模块名（如 cron, secrets, llm）"
    echo "用法: ./scripts/sync-openclaw.sh sync <module1> [module2 ...]"
    return 1
  fi

  local modules=("$@")
  local synced_list=()

  for module in "${modules[@]}"; do
    local src_dir="$OPENCLAW_DIR/src/$module"
    local dst_dir="$SERVER_ENGINE/$module"

    if [ ! -d "$src_dir" ]; then
      log_error "openclaw/src/$module 不存在，跳过"
      continue
    fi

    if [ ! -d "$dst_dir" ]; then
      log_warn "server/engine/$module 不存在，将创建"
      mkdir -p "$dst_dir"
    fi

    log_info "同步模块: $module"

    # 复制 .ts 文件（不含测试）
    local count=0
    while IFS= read -r -d '' f; do
      local rel_path dst_file
      rel_path="${f#$src_dir/}"
      dst_file="$dst_dir/$rel_path"
      mkdir -p "$(dirname "$dst_file")"
      cp "$f" "$dst_file"

      # 调整 import 路径：../../../src/ → ../../../engine/
      if grep -q 'from.*["\x27].*/src/' "$dst_file" 2>/dev/null; then
        sed -i '' 's|/src/|/engine/|g' "$dst_file" 2>/dev/null || \
          sed -i 's|/src/|/engine/|g' "$dst_file"
      fi

      count=$((count + 1))
    done < <(find "$src_dir" -name "*.ts" -not -name "*.test.ts" -print0)

    log_info "  已复制 $count 个文件"
    synced_list+=("\"$module\"")
  done

  # 更新同步记录
  local current_commit current_version
  current_commit=$(cd "$OPENCLAW_DIR" && git rev-parse HEAD)
  current_version=$(cd "$OPENCLAW_DIR" && grep '"version"' package.json | head -1 | sed 's/.*"version": *"//;s/".*//')

  # 读取已有的同步模块列表
  local existing_modules
  existing_modules=$(python3 -c "
import json
try:
    data = json.load(open('$SYNC_FILE'))
    print(json.dumps(data.get('syncedModules', [])))
except:
    print('[]')
" 2>/dev/null || echo "[]")

  # 合并模块列表
  local merged_modules
  merged_modules=$(python3 -c "
import json
existing = set(json.loads('$existing_modules'))
new = set(${synced_list[@]})
merged = sorted(existing | new)
print(json.dumps(merged))
" 2>/dev/null || echo "[]")

  cat > "$SYNC_FILE" << EOF
{
  "lastSyncedCommit": "$current_commit",
  "lastSyncedVersion": "$current_version",
  "lastSyncedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "syncedModules": $merged_modules
}
EOF

  log_info "同步完成。记录已更新: $SYNC_FILE"
  log_warn "请运行编译检查: NODE_OPTIONS='--max-old-space-size=8192' npx tsc --noEmit -p server/tsconfig.json"
}

# 主入口
case "${1:-help}" in
  check)
    cmd_check
    ;;
  sync)
    shift
    cmd_sync "$@"
    ;;
  version)
    cmd_version
    ;;
  *)
    echo "用法: $0 {check|sync|version}"
    echo ""
    echo "命令:"
    echo "  check     检查 openclaw 更新与 server/engine 的差异"
    echo "  sync      同步指定模块（如: sync cron secrets llm）"
    echo "  version   显示版本信息"
    ;;
esac
