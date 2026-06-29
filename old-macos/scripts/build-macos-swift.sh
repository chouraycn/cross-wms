#!/usr/bin/env bash
#
# 构建 CrossWMS macOS 原生应用（Swift + WKWebView + Sparkle）
#
# 用法:
#   bash scripts/build-macos-swift.sh [--version 1.6.1] [--sign] [--notarize]
#
# 输出:
#   apps/macos/.build/release/CrossWMS.app
#   release/CDF-Know-Clow-{version}-mac.dmg
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MACOS_DIR="$PROJECT_ROOT/apps/macos"
BUILD_DIR="$MACOS_DIR/.build"
RELEASE_DIR="$PROJECT_ROOT/release"

VERSION=""
SIGN=false
NOTARIZE=false
DMG_NAME=""

# 解析参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --sign)
      SIGN=true
      shift
      ;;
    --notarize)
      NOTARIZE=true
      SIGN=true
      shift
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

# 如果没有指定版本，从 package.json 读取
if [[ -z "$VERSION" ]]; then
  VERSION=$(grep '"version"' "$PROJECT_ROOT/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
fi

echo "=========================================="
echo "  构建 CrossWMS macOS 应用"
echo "  版本: $VERSION"
echo "  签名: $SIGN"
echo "  公证: $NOTARIZE"
echo "=========================================="

# 1. 构建前端
echo ""
echo "=== 步骤 1: 构建前端 ==="
cd "$PROJECT_ROOT"
npm run build

# 2. 构建后端
echo ""
echo "=== 步骤 2: 构建 Node.js 后端 ==="
cd "$PROJECT_ROOT"
if [[ -f "server_dist/index.cjs" ]]; then
  echo "后端已存在，跳过"
else
  echo "警告: server_dist/index.cjs 不存在，请先运行后端构建"
fi

# 3. 构建 Swift 应用
echo ""
echo "=== 步骤 3: 构建 Swift 应用 ==="
cd "$MACOS_DIR"

# 检查 Swift 是否可用
if ! command -v swift &> /dev/null; then
  echo "错误: Swift 未安装，请安装 Xcode 或 Swift Toolchain"
  exit 1
fi

swift build --configuration release

APP_PATH="$BUILD_DIR/release/CrossWMS.app"

if [[ ! -d "$APP_PATH" ]]; then
  echo "错误: 构建失败，$APP_PATH 不存在"
  exit 1
fi

echo "Swift 应用构建成功: $APP_PATH"

# 4. 复制资源文件到 app bundle
echo ""
echo "=== 步骤 4: 复制资源文件 ==="

APP_CONTENTS="$APP_PATH/Contents"
APP_RESOURCES="$APP_CONTENTS/Resources"
mkdir -p "$APP_RESOURCES"

# 复制前端 dist
if [[ -d "$PROJECT_ROOT/dist" ]]; then
  cp -R "$PROJECT_ROOT/dist" "$APP_RESOURCES/frontend_dist"
  echo "✓ 前端 dist 已复制"
fi

# 复制后端 server_dist
if [[ -d "$PROJECT_ROOT/server_dist" ]]; then
  cp -R "$PROJECT_ROOT/server_dist" "$APP_RESOURCES/server_dist"
  echo "✓ 后端 server_dist 已复制"
fi

# 复制 Node.js 二进制（可选，需要预先准备）
# if [[ -f "$PROJECT_ROOT/node/bin/node" ]]; then
#   mkdir -p "$APP_RESOURCES/node/bin"
#   cp "$PROJECT_ROOT/node/bin/node" "$APP_RESOURCES/node/bin/"
#   echo "✓ Node.js 已复制"
# fi

# 更新 Info.plist 中的版本号
PLIST_PATH="$APP_CONTENTS/Info.plist"
if [[ -f "$PLIST_PATH" ]]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$PLIST_PATH" 2>/dev/null || true
  echo "✓ Info.plist 版本已更新"
fi

# 5. 代码签名（可选）
if [[ "$SIGN" == "true" ]]; then
  echo ""
  echo "=== 步骤 5: 代码签名 ==="
  if [[ -z "${DEVELOPER_ID:-}" ]]; then
    echo "警告: DEVELOPER_ID 环境变量未设置，跳过签名"
  else
    codesign --deep --force --options runtime --sign "$DEVELOPER_ID" "$APP_PATH"
    echo "✓ 代码签名完成"
  fi
fi

# 6. 创建 DMG
echo ""
echo "=== 步骤 6: 创建 DMG ==="

mkdir -p "$RELEASE_DIR"

DMG_NAME="CDF-Know-Clow-${VERSION}-mac.dmg"
DMG_PATH="$RELEASE_DIR/$DMG_NAME"

# 清理旧 DMG
rm -f "$DMG_PATH"

# 使用 hdiutil 创建 DMG
TMP_DMG="$RELEASE_DIR/tmp.dmg"
VOLUME_NAME="CDF Know Clow $VERSION"

hdiutil create -volname "$VOLUME_NAME" \
  -srcfolder "$APP_PATH" \
  -ov -format UDZO \
  "$TMP_DMG"

mv "$TMP_DMG" "$DMG_PATH"

echo "✓ DMG 已创建: $DMG_PATH"

# 7. 公证（可选）
if [[ "$NOTARIZE" == "true" ]]; then
  echo ""
  echo "=== 步骤 7: 公证 ==="
  if [[ -z "${APPLE_ID:-}" ]] || [[ -z "${APP_PASSWORD:-}" ]]; then
    echo "警告: APPLE_ID 或 APP_PASSWORD 环境变量未设置，跳过公证"
  else
    echo "提交公证中..."
    xcrun notarytool submit "$DMG_PATH" \
      --apple-id "$APPLE_ID" \
      --password "$APP_PASSWORD" \
      --team-id "${TEAM_ID:-}" \
      --wait
    echo "✓ 公证完成"

    # 打公证戳
    xcrun stapler staple "$DMG_PATH"
    echo "✓ 公证戳已打"
  fi
fi

# 8. 生成 Sparkle appcast 的 edSignature（如果 generate_appcast 可用）
echo ""
echo "=== 步骤 8: 更新 appcast.xml ==="

if command -v generate_appcast &> /dev/null; then
  generate_appcast "$RELEASE_DIR"
  echo "✓ appcast.xml 已更新"
else
  echo "提示: 安装 Sparkle 的 generate_appcast 工具可自动生成签名"
  echo "  brew install sparkle"
fi

echo ""
echo "=========================================="
echo "  ✅ 构建完成!"
echo "  应用: $APP_PATH"
echo "  DMG:  $DMG_PATH"
echo "=========================================="
