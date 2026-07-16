#!/usr/bin/env bash
# 完整同步 openclaw/packages 源码到 cross-wms/packages

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT_DIR/openclaw/packages"
DST="$ROOT_DIR/packages"

PKGS=(
  "acp-core"
  "gateway-client"
  "gateway-protocol"
  "llm-runtime"
  "markdown-core"
  "media-core"
  "media-generation-core"
  "media-understanding-common"
  "model-catalog-core"
  "net-policy"
  "normalization-core"
  "plugin-package-contract"
  "sdk"
  "speech-core"
  "terminal-core"
  "tool-call-repair"
  "web-content-core"
)

for pkg in "${PKGS[@]}"; do
  src_dir="$SRC/$pkg"
  dst_dir="$DST/$pkg"
  
  if [ ! -d "$src_dir" ]; then
    echo "⚠️  openclaw/$pkg 不存在，跳过"
    continue
  fi
  
  echo "🔄 同步 $pkg..."
  
  # 确保目标目录存在
  mkdir -p "$dst_dir"
  
  # 复制 src/ 目录下所有 .ts 文件（排除测试）
  if [ -d "$src_dir/src" ]; then
    mkdir -p "$dst_dir/src"
    find "$src_dir/src" -type f -name "*.ts" | while read -r file; do
      rel_path="${file#$src_dir/src/}"
      target_file="$dst_dir/src/$rel_path"
      mkdir -p "$(dirname "$target_file")"
      cp "$file" "$target_file"
    done
  fi
  
  # 将 @openclaw/ 引用替换为 @cdf-know/
  find "$dst_dir" -type f -name "*.ts" | while read -r file; do
    if grep -q '@openclaw/' "$file" 2>/dev/null; then
      sed -i '' 's/@openclaw\//@cdf-know\//g' "$file"
    fi
  done
  
  echo "   ✓ 完成"
done

echo ""
echo "✅ 源码同步完成"
