#!/bin/bash
# CDF Know Clow Widget Extension 构建脚本
# 构建 Widget Extension 为 .appex 并嵌入到 CDFKnowClow.app/Contents/PlugIns/
# 用法：
#   bash build-widget.sh              # 构建 + 复制到 build-pywebview 的 .app 中
#   bash build-widget.sh --only-build # 仅构建，不复制

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WIDGET_DIR="$SCRIPT_DIR/macos-widget"
BUILD_DIR="$WIDGET_DIR/.build"
APP_PLUGINS="$SCRIPT_DIR/build-pywebview/dist/CDFKnowClow.app/Contents/PlugIns"
VERSION="1.0.21"

# 解析参数
ONLY_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --only-build) ONLY_BUILD=true ;;
  esac
done

echo "=== Building CDF Know Clow Widget Extension ==="

# 1. 检查 Xcode Command Line Tools
if ! xcode-select -p &>/dev/null; then
  echo "❌ 需要 Xcode Command Line Tools，请运行: xcode-select --install"
  exit 1
fi

# 2. 清理旧构建
echo "🧹 清理旧构建产物..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 3. 构建 Widget Extension（Release）
echo "🔨 Building Widget Extension (Release)..."
cd "$WIDGET_DIR"
swift build -c release --product CDFKnowClowWidget 2>&1

# 4. 查找构建产物
echo "🔍 查找构建产物..."
# SPM 输出路径因 Swift 版本/架构而异
# 可能路径：
#   .build/release/libCrossWMSWidget.dylib + CrossWMSWidget_CrossWMSWidget.bundle (旧版)
#   .build/arm64-apple-macosx/release/libCrossWMSWidget.dylib + CrossWMSWidget_CrossWMSWidget.bundle (新版)

DYLIB_SOURCE=""
BUNDLE_SOURCE=""

# 查找 dylib（排除 .dSYM 调试符号包）
DYLIB_SOURCE=$(find "$BUILD_DIR" -name "libCDFKnowClowWidget.dylib" -type f 2>/dev/null | grep -v ".dSYM" | head -1)
if [ -z "$DYLIB_SOURCE" ]; then
  echo "❌ 无法找到 libCDFKnowClowWidget.dylib"
  find "$BUILD_DIR" -type f -name "*.dylib" 2>/dev/null || true
  exit 1
fi
echo "✅ 找到 dylib: $DYLIB_SOURCE"

# 查找 .bundle（资源）
BUNDLE_SOURCE=$(find "$BUILD_DIR" -name "CDFKnowClowWidget*.bundle" -type d 2>/dev/null | head -1)
if [ -n "$BUNDLE_SOURCE" ]; then
  echo "✅ 找到 bundle（资源）: $BUNDLE_SOURCE"
else
  echo "⚠️  未找到 .bundle（资源可能单独在 build 目录中）"
fi

# 5. 构建 .appex 目录结构
TARGET_APPEX="$BUILD_DIR/CDFKnowClowWidget.appex"
rm -rf "$TARGET_APPEX"
mkdir -p "$TARGET_APPEX/Contents/MacOS"
mkdir -p "$TARGET_APPEX/Contents/Resources"

echo "📦 组装 .appex 结构..."

# 复制可执行文件（dylib -> MacOS/CrossWMSWidget）
cp "$DYLIB_SOURCE" "$TARGET_APPEX/Contents/MacOS/CDFKnowClowWidget"
  chmod +x "$TARGET_APPEX/Contents/MacOS/CDFKnowClowWidget"
echo "  ✓ 可执行文件已复制"

# 复制 Info.plist 并修复占位符
if [ -f "$WIDGET_DIR/Info.plist" ]; then
  cp "$WIDGET_DIR/Info.plist" "$TARGET_APPEX/Contents/Info.plist"
  
  # 修复 Info.plist 占位符
  /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable CDFKnowClowWidget" "$TARGET_APPEX/Contents/Info.plist" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string CDFKnowClowWidget" "$TARGET_APPEX/Contents/Info.plist"

  /usr/libexec/PlistBuddy -c "Set :CFBundleDevelopmentRegion zh-CN" "$TARGET_APPEX/Contents/Info.plist" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleDevelopmentRegion string zh-CN" "$TARGET_APPEX/Contents/Info.plist"

  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.cdfknowclow.desktop.widget" "$TARGET_APPEX/Contents/Info.plist" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.cdfknowclow.desktop.widget" "$TARGET_APPEX/Contents/Info.plist"
  
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$TARGET_APPEX/Contents/Info.plist" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$TARGET_APPEX/Contents/Info.plist"
  
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$TARGET_APPEX/Contents/Info.plist" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $VERSION" "$TARGET_APPEX/Contents/Info.plist"
  
  /usr/libexec/PlistBuddy -c "Set :CFBundlePackageType XPC!" "$TARGET_APPEX/Contents/Info.plist" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundlePackageType string XPC!" "$TARGET_APPEX/Contents/Info.plist"
  
  echo "  ✓ Info.plist 已复制并修复"
else
  echo "⚠️  未找到 Info.plist 模板"
fi

# 复制资源（从 .bundle）
if [ -n "$BUNDLE_SOURCE" ] && [ -d "$BUNDLE_SOURCE" ]; then
  cp -R "$BUNDLE_SOURCE/"* "$TARGET_APPEX/Contents/Resources/" 2>/dev/null || true
  echo "  ✓ 资源已从 .bundle 复制"
fi

# 显示 .appex 结构
echo ""
echo "📋 .appex 结构："
find "$TARGET_APPEX" -type f 2>/dev/null || true

# 6. 签名 Widget Extension
echo ""
echo "🔏 签名 Widget Extension..."
if [ -f "$WIDGET_DIR/Widget.entitlements" ]; then
  codesign --force --sign "-" \
    --entitlements "$WIDGET_DIR/Widget.entitlements" \
    "$TARGET_APPEX" 2>&1 | tail -5
  echo "✅ Widget Extension 签名完成 (含 entitlements)"
else
  codesign --force --sign "-" "$TARGET_APPEX" 2>&1 | tail -5
  echo "⚠️  未找到 entitlements，已用 ad-hoc 签名"
fi

# 7. 嵌入到 .app（除非 --only-build）
if [ "$ONLY_BUILD" = false ]; then
  if [ ! -d "$APP_PLUGINS" ]; then
    echo "📁 创建 PlugIns 目录: $APP_PLUGINS"
    mkdir -p "$APP_PLUGINS"
  fi

  if [ ! -d "$SCRIPT_DIR/build-pywebview/dist/CDFKnowClow.app" ]; then
    echo ""
    echo "⚠️  .app 目录不存在: $SCRIPT_DIR/build-pywebview/dist/CDFKnowClow.app"
    echo "   请先运行 build-dmg-pywebview.sh 构建 .app"
    exit 1
  fi

  echo ""
  echo "📦 嵌入 Widget Extension 到 .app..."
  rm -rf "$APP_PLUGINS/CDFKnowClowWidget.appex" 2>/dev/null || true
  cp -R "$TARGET_APPEX" "$APP_PLUGINS/CDFKnowClowWidget.appex"

  # 对 .app 重新签名（包含新的 .appex）
  APP_PATH="$SCRIPT_DIR/build-pywebview/dist/CDFKnowClow.app"
  echo "🔏 重新签名 .app（包含 Widget Extension）..."
  codesign --force --sign "-" "$APP_PATH" 2>&1 | tail -5

  echo "✅ Widget Extension 已嵌入到 $APP_PATH"
  echo ""
  ls -la "$APP_PLUGINS/"
fi

# 8. 验证结果
echo ""
echo "=== 构建结果 ==="
echo "Widget .appex: $TARGET_APPEX"
find "$TARGET_APPEX" -type f 2>/dev/null || true

if [ "$ONLY_BUILD" = false ] && [ -d "$APP_PLUGINS/CrossWMSWidget.appex" ]; then
  echo ""
  echo "✅ CDFKnowClowWidget.appex 已嵌入"
  codesign -dv --verbose=2 "$APP_PLUGINS/CDFKnowClowWidget.appex" 2>&1 | grep -E "Identifier|Team|Entitlements" || true
fi

echo ""
echo "=== Widget 构建完成 ==="
