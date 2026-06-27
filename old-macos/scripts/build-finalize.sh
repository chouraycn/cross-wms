#!/bin/bash
# CDF Know Clow 构建收尾脚本（在终端手动执行）
# 用法: bash build-finalize.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -e "console.log(require('./package.json').version)")
APP_PATH="$SCRIPT_DIR/build-pywebview/dist/CDFKnowClow.app"
DMG_NAME="CDFKnowClow-${VERSION}-mac.dmg"

# ── Check prerequisites ──
if [ ! -d "$APP_PATH" ]; then
  echo "❌ .app 不存在，请先运行 build-dmg-pywebview.sh"
  exit 1
fi

echo "========================================="
echo "  CDF Know Clow v${VERSION} 构建收尾"
echo "========================================="
echo ""

# ── 1. 创建 DMG ──
echo "💿 [1/3] 创建 DMG 安装包..."
mkdir -p "$SCRIPT_DIR/release"
rm -f "$SCRIPT_DIR/release/$DMG_NAME"
hdiutil create -volname "CDFKnowClow" \
  -srcfolder "$APP_PATH" \
  -ov -format UDZO \
  "$SCRIPT_DIR/release/$DMG_NAME"
echo "✅ DMG 创建完成!"
ls -lh "$SCRIPT_DIR/release/$DMG_NAME"
echo ""

# ── 2. Git Tag ──
echo "🏷️  [2/3] Git Tag..."
if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
  echo "  标签 v${VERSION} 已存在，跳过"
else
  echo "  创建标签 v${VERSION}..."
  git tag "v${VERSION}" -m "CDF Know Clow v${VERSION}"
  git push origin "v${VERSION}"
  echo "✅ 标签已推送"
fi
echo ""

# ── 3. GitHub Release ──
echo "🚀 [3/3] GitHub Release..."
RELEASE_NOTES="$SCRIPT_DIR/RELEASE_NOTES.md"
NOTES_CONTENT="CDF Know Clow v${VERSION} 发布"
if [ -f "$RELEASE_NOTES" ]; then
  NOTES_CONTENT=$(cat "$RELEASE_NOTES")
fi

# 检查 release 是否存在
if gh release view "v${VERSION}" &>/dev/null 2>&1; then
  echo "  Release v${VERSION} 已存在，更新附件..."
  gh release upload "v${VERSION}" \
    "$SCRIPT_DIR/release/$DMG_NAME#CDF Know Clow DMG" \
    "$SCRIPT_DIR/release/release.json#Release Info" \
    --clobber
else
  echo "  创建 Release v${VERSION}..."
  gh release create "v${VERSION}" \
    --title "CDF Know Clow v${VERSION}" \
    --notes "$NOTES_CONTENT" \
    "$SCRIPT_DIR/release/$DMG_NAME#CDF Know Clow DMG" \
    "$SCRIPT_DIR/release/release.json#Release Info"
fi
echo "✅ GitHub Release 发布完成!"
echo ""
echo "========================================="
echo "  构建完成!"
echo "  DMG: release/$DMG_NAME"
echo "========================================="
