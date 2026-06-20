#!/bin/bash
# CDF Know Clow — 中免CLow端系统桌面应用
# 构建 DMG 安装包（pywebview + PyInstaller + Node.js 后端）
# 方案：Python + pywebview 创建原生 macOS 窗口，Node.js 运行 AI 助手后端
#
# 用法：
#   bash build-dmg-pywebview.sh           # 默认自动 bump patch 版本（1.3.7 → 1.3.8）
#   bash build-dmg-pywebview.sh --bump-minor   # bump minor 版本（1.3.7 → 1.4.0）
#   bash build-dmg-pywebview.sh --bump-major   # bump major 版本（1.3.7 → 2.0.0）
#   bash build-dmg-pywebview.sh --no-bump      # 不 bump，保持当前版本号
#   bash build-dmg-pywebview.sh --ci --no-bump  # CI 模式：跳过前端构建和 GitHub Release（由 workflow 处理）

set -e
set -o pipefail

# 加载 ~/.zshrc 中的环境变量（如 GITHUB_TOKEN），确保非交互 shell 也能获取
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc" 2>/dev/null || true
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIST="$PROJECT_DIR/dist"
BUILD_DIR="$PROJECT_DIR/build-pywebview"
VERSION_FILE="$PROJECT_DIR/version.txt"

# ===================== 版本管理 =====================

# 从 package.json 读取当前版本
CURRENT_VERSION=$(node -e "console.log(require('./package.json').version)")

# 处理参数
BUMP_TYPE=""
CI_MODE=false
for arg in "$@"; do
  case "$arg" in
    --bump-patch|--bump-minor|--bump-major)
      BUMP_TYPE="${arg#--bump-}"
      ;;
    --no-bump)
      BUMP_TYPE="none"
      ;;
    --ci)
      CI_MODE=true
      ;;
  esac
done
# 默认自动 bump patch
if [ -z "$BUMP_TYPE" ]; then
  BUMP_TYPE="patch"
fi

# 如果是 none，跳过 bump
if [ "$BUMP_TYPE" = "none" ]; then
  echo "⏭️  跳过版本 bump（--no-bump）"
  echo ""
# 否则执行 bump
elif [ -n "$BUMP_TYPE" ]; then
  echo "=== Bump ${BUMP_TYPE} version ==="
  node -e "
    const fs = require('fs');
    const path = './package.json';
    const pkg = JSON.parse(fs.readFileSync(path, 'utf-8'));
    const parts = pkg.version.split('.').map(Number);
    if ('$BUMP_TYPE' === 'major') {
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
    } else if ('$BUMP_TYPE' === 'minor') {
      parts[1]++;
      parts[2] = 0;
    } else {
      parts[2]++;
    }
    pkg.version = parts.join('.');
    fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
    console.log('Version bumped to ' + pkg.version);
  "
  # 重新读取 bump 后的版本
  CURRENT_VERSION=$(node -e "console.log(require('./package.json').version)")
  echo "✅ 新版本: $CURRENT_VERSION"
  echo ""
fi

# 导出版本号供后续使用
export VERSION="$CURRENT_VERSION"
DMG_NAME="CDF-Know-Clow-${VERSION}-mac.dmg"
DMG_VOLUME="CDF Know Clow"

# 生成 version.txt（供 pywebview_app.py 读取）
echo "$VERSION" > "$VERSION_FILE"
echo "📝 版本文件已生成: $VERSION_FILE → $VERSION"
echo ""

# pywebview venv 路径（CI 环境自动检测）
# 检查操作系统（DMG 只能在 macOS 上构建）
if [ "$(uname -s)" != "Darwin" ]; then
  echo "❌ 错误：DMG 打包只能在 macOS 上执行"
  echo "   当前系统: $(uname -s) ($(uname -m))"
  echo "   请在 Mac 电脑上运行此脚本"
  exit 1
fi

# 检查必需的 macOS 工具
# hdiutil 和 osascript 是必需的；codesign 可选（无签名时用户需手动允许）
for tool in hdiutil osascript; do
  if ! command -v "$tool" &>/dev/null; then
    echo "❌ 错误：缺少必需的 macOS 工具 '$tool'"
    exit 1
  fi
done

if ! command -v codesign &>/dev/null; then
  echo "⚠️  警告：codesign 未安装，将跳过代码签名"
  echo "   安装 Xcode Command Line Tools: xcode-select --install"
fi

if [ -n "$CI" ]; then
  # CI 环境：使用系统 Python 和 pip 安装的 pyinstaller
  PYTHON="$(which python3)"
  PYINSTALLER="$(which pyinstaller)"
  if [ -z "$PYINSTALLER" ]; then
    echo "Installing PyInstaller in CI..."
    pip3 install pyinstaller pywebview Pillow
    PYINSTALLER="$(which pyinstaller)"
  fi
else
  # 本地环境：使用指定的 venv（支持通过环境变量覆盖）
  # 默认路径兼容常见 venv 位置，用户可通过 PYWEBVIEW_VENV 环境变量指定
  PYWEBVIEW_VENV="${PYWEBVIEW_VENV:-$(python3 -c "import os,sysconfig; print(os.path.dirname(sysconfig.get_path('scripts')))")}"
  if [ ! -d "$PYWEBVIEW_VENV" ]; then
    echo "❌ 错误：Python 虚拟环境未找到: $PYWEBVIEW_VENV"
    echo "   请设置环境变量 PYWEBVIEW_VENV 指向正确的虚拟环境路径"
    echo "   例如: export PYWEBVIEW_VENV=/path/to/your/venv"
    exit 1
  fi
  PYINSTALLER="$PYWEBVIEW_VENV/bin/pyinstaller"
  PYTHON="$PYWEBVIEW_VENV/bin/python3"
  PIP="$PYWEBVIEW_VENV/bin/pip"
  # 自动安装必需的 Python 依赖（首次运行或依赖丢失时）
  # 必需包: pyinstaller (打包工具), pywebview (webview 窗口), Pillow (PNG→ICNS), pyobjc-framework-Cocoa (macOS native)
  # ⚠️ pywebview 锁定 4.4.1（方案A frameless=True 在此版本行为稳定）
  REQUIRED_PACKAGES=("pyinstaller" "pywebview==4.4.1" "Pillow" "pyobjc-framework-Cocoa")
  MISSING_PACKAGES=()
  for pkg in "${REQUIRED_PACKAGES[@]}"; do
    # 将包名转换为 import 名（pyobjc-framework-Cocoa → objc）
    case "$pkg" in
      pyinstaller) import_name="PyInstaller" ;;
      pywebview) import_name="webview" ;;
      Pillow) import_name="PIL" ;;
      pyobjc-framework-Cocoa) import_name="objc" ;;
      *) import_name="$pkg" ;;
    esac
    if ! "$PYTHON" -c "import $import_name" &>/dev/null; then
      MISSING_PACKAGES+=("$pkg")
    fi
  done
  if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo "📦 自动安装缺少的 Python 依赖: ${MISSING_PACKAGES[*]}"
    "$PIP" install "${MISSING_PACKAGES[@]}" || {
      echo "❌ 依赖安装失败，请手动运行: $PIP install ${MISSING_PACKAGES[*]}"
      exit 1
    }
    echo "✅ 依赖安装完成"
  fi
fi

# Node.js 后端配置
SERVER_DIR="$PROJECT_DIR/server"
SERVER_BUILD_DIR="$BUILD_DIR/server_dist"
NODE_RUNTIME_DIR="$BUILD_DIR/node_runtime"

echo "=== CDF Know Clow DMG Builder (pywebview + PyInstaller + Node.js) ==="
echo "版本: $VERSION"
echo ""

# 1. 构建前端（CI 模式下跳过，CI 已预先构建）
if [ "$CI_MODE" = true ]; then
  echo "⏭️  跳过前端构建（--ci 模式，CI 已预构建）"
  if [ ! -d "$FRONTEND_DIST" ]; then
    echo "❌ 错误：前端产物目录 $FRONTEND_DIST 不存在"
    echo "   CI 模式要求先执行 npm run build"
    exit 1
  fi
else
  echo ">>> 构建前端 (版本: $VERSION) ..."
  cd "$PROJECT_DIR" && npm run build
  echo "✅ 前端构建完成"
fi

if [ ! -x "$PYINSTALLER" ]; then
  echo "❌ PyInstaller 未找到: $PYINSTALLER"
  echo "   本地环境会自动安装依赖，请检查 PYWEBVIEW_VENV 环境变量是否指向正确的 Python 环境"
  echo "   手动安装: pip install pyinstaller pywebview Pillow pyobjc-framework-Cocoa"
  exit 1
fi

echo "✅ PyInstaller: $PYINSTALLER"
echo "✅ 前端产物: $FRONTEND_DIST"
echo ""

# 2. 准备打包用的前端文件（复制到临时目录，避免和 PyInstaller 输出目录冲突）
echo "📦 准备前端文件..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/frontend_dist"
cp -r "$FRONTEND_DIST"/* "$BUILD_DIR/frontend_dist/"

# 2.1 删除 mockServiceWorker.js（MSW 开发工具，生产环境不需要）
MSW_FILE=$(find "$BUILD_DIR/frontend_dist" -name "mockServiceWorker.js" 2>/dev/null | head -1)
if [ -n "$MSW_FILE" ]; then
  rm -f "$MSW_FILE"
  echo "   ✅ 已删除 mockServiceWorker.js"
fi

# frameless=True：无系统标题栏，前端通过 JS 检测 pywebview 后注入 --pw-top: 28px 避让红黄绿按钮

echo ""

# 3. 编译 Node.js 后端 TypeScript → JavaScript
echo "⚙️  编译 Node.js 后端..."

if command -v npx &>/dev/null; then
  # 注意：@src 别名在 server/tsconfig.json 中映射到 ../src/*
  # 即相对于 server 目录的父目录（项目根目录）的 src 目录
  # 因此 esbuild 的别名应该指向项目根目录下的 src
  npx esbuild "$SERVER_DIR/index.ts" \
    --bundle \
    --platform=node \
    --target=node18 \
    --format=cjs \
    --outfile="$SERVER_BUILD_DIR/index.cjs" \
    --alias:@src="$PROJECT_DIR/src" \
    --external:better-sqlite3 \
    --external:chokidar \
    --external:cors \
    --external:express \
    --external:fsevents \
    --external:mammoth \
    --external:pdf-parse \
    --external:uuid \
    --external:@e965/xlsx \
    --external:onnxruntime-node \
    --external:sqlite-vec \
    --external:ajv \
    --external:cheerio \
    --external:zod \
    --external:jszip \
    --external:iconv-lite \
    --external:playwright \
    --external:fflate \
    --external:jsonpath-plus \
    --external:js-yaml \
    --external:katex
  echo "✅ 后端编译完成 (index.cjs)"
else
  echo "⚠️  esbuild 不可用，尝试手动复制..."
  mkdir -p "$SERVER_BUILD_DIR"
  cp -r "$SERVER_DIR"/* "$SERVER_BUILD_DIR/"
fi

echo ""

# P0: 预下载 ONNX 模型文件，避免运行时首次下载阻塞
MODEL_DIR="$HOME/.cdf-know-clow/models/all-MiniLM-L6-v2"
mkdir -p "$MODEL_DIR"
if [ ! -f "$MODEL_DIR/model.onnx" ]; then
  echo "📥 预下载 ONNX 模型文件..."
  curl --connect-timeout 10 --max-time 60 -L -o "$MODEL_DIR/model.onnx" "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx" || true
  curl --connect-timeout 10 --max-time 60 -L -o "$MODEL_DIR/tokenizer.json" "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json" || true
  curl --connect-timeout 10 --max-time 60 -L -o "$MODEL_DIR/vocab.txt" "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/vocab.txt" || true
  curl --connect-timeout 10 --max-time 60 -L -o "$MODEL_DIR/config.json" "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/config.json" || true
  echo "✅ ONNX 模型文件预下载完成"
fi

echo ""

# 4. 安装共享 node_modules（两个 server 共用，节省 ~154MB）
echo "📦 安装共享 node_modules..."
SHARED_NODE_MODULES="$BUILD_DIR/shared_node_modules"
mkdir -p "$SHARED_NODE_MODULES"
cd "$SHARED_NODE_MODULES"

cat > package.json << 'PKGJSON'
{
  "name": "cdf-know-clow-shared-deps",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "better-sqlite3": "^12.6.2",
    "chokidar": "^3.6.0",
    "cors": "^2.8.5",
    "express": "^5.2.0",
    "mammoth": "^1.11.0",
    "onnxruntime-node": "^1.26.0",
    "pdf-parse": "^1.1.1",
    "sqlite-vec": "^0.1.9",
    "uuid": "^11.1.1",
    "@e965/xlsx": "^0.20.3"
  }
}
PKGJSON

# 更新版本号
sed -i '' "s/\\\"version\\\": \\\"1.0.0\\\"/\\\"version\\\": \\\"${VERSION}\\\"/" package.json

# 确保 npm 子进程能找到 sh（sandbox 环境下 PATH 可能不含 /bin）
export PATH="/bin:/usr/bin:/usr/local/bin:$PATH"
npm install --production --no-optional 2>&1 | tail -5
echo "✅ 共享 node_modules 安装完成"

# 4.1 清理 node_modules 中非运行时必需文件（节省空间）
echo "🧹 清理 node_modules 非运行时文件..."
cd "$SHARED_NODE_MODULES/node_modules"

# 删除文档、示例、测试、类型定义源文件等
find . -type f \( \
  -name "*.md" -o \
  -name "*.d.ts" -o \
  -name "*.d.ts.map" -o \
  -name "*.d.mts" -o \
  -name "*.js.map" -o \
  -name "LICENSE" -o \
  -name "CHANGELOG*" -o \
  -name "HISTORY*" -o \
  -name "README*" -o \
  -name ".eslintrc*" -o \
  -name ".prettierrc*" -o \
  -name "tsconfig*" -o \
  -name ".npmignore" -o \
  -name ".travis.yml" -o \
  -name "Makefile" -o \
  -name "Gulpfile*" -o \
  -name "Gruntfile*" \
\) -delete 2>/dev/null || true

# 删除整个 docs/examples/tests/test/__tests__/coverage 目录
find . -type d \( \
  -name "docs" -o \
  -name "examples" -o \
  -name "example" -o \
  -name "tests" -o \
  -name "test" -o \
  -name "__tests__" -o \
  -name "__test__" -o \
  -name "coverage" -o \
  -name ".github" -o \
  -name "benchmark" -o \
  -name "benchmarks" \
\) -exec rm -rf {} + 2>/dev/null || true

# 清理已移除依赖的残留目录（如果存在）
for d in @tencent-ai/agent-sdk; do
  if [ -d "$d" ]; then
    rm -rf "$d" 2>/dev/null || true
    echo "   ✅ 已清理残留目录 $d"
  fi
done

SHARED_NM_SIZE=$(du -sh "$SHARED_NODE_MODULES/node_modules" | cut -f1)
echo "✅ node_modules 清理完成 (大小: $SHARED_NM_SIZE)"

# 4.2 清理 better-sqlite3 源码（仅保留编译产物 .node，删除 deps/ 和 src/ 节省 ~10MB）
BS3_DIR="$SHARED_NODE_MODULES/node_modules/better-sqlite3"
if [ -d "$BS3_DIR" ]; then
  BS3_BEFORE=$(du -sm "$BS3_DIR" | cut -f1)
  rm -rf "$BS3_DIR/deps" "$BS3_DIR/src" 2>/dev/null || true
  BS3_AFTER=$(du -sm "$BS3_DIR" | cut -f1)
  echo "   ✅ better-sqlite3 源码已清理 (${BS3_BEFORE}M → ${BS3_AFTER}M)"
fi

cd "$PROJECT_DIR"

# 5. 复制 Node.js 运行时
echo "📦 准备 Node.js 运行时..."
mkdir -p "$NODE_RUNTIME_DIR/bin"
SYSTEM_NODE="$(which node 2>/dev/null || echo '')"

if [ -n "$SYSTEM_NODE" ] && [ -x "$SYSTEM_NODE" ]; then
  cp "$SYSTEM_NODE" "$NODE_RUNTIME_DIR/bin/node"
  # 去除本地符号（安全瘦身，不影响运行），108M → ~87M
  NODE_BEFORE=$(du -sm "$NODE_RUNTIME_DIR/bin/node" | cut -f1)
  strip -x "$NODE_RUNTIME_DIR/bin/node" 2>/dev/null || true
  NODE_AFTER=$(du -sm "$NODE_RUNTIME_DIR/bin/node" | cut -f1)
  NODE_SIZE=$(du -sh "$NODE_RUNTIME_DIR/bin/node" | cut -f1)
  echo "✅ Node.js: $SYSTEM_NODE ($NODE_SIZE, strip: ${NODE_BEFORE}M → ${NODE_AFTER}M)"
else
  echo "⚠️  系统未找到 Node.js，AI 助手将不可用"
fi

# 6. 用 PyInstaller 构建 .app
echo "🔨 用 PyInstaller 构建 CDF Know Clow.app..."
cd "$PROJECT_DIR"

# 临时移走 shared_node_modules（如果 PyInstaller 误扫描到）
# 注意：shared_node_modules 不在 server_dist 内，PyInstaller 不会自动扫描
# 但需要确保 server_dist 内没有 node_modules 目录

# 清理 server_dist 中可能残留的 node_modules（避免 PyInstaller 误打包）
if [ -d "$SERVER_BUILD_DIR/node_modules" ]; then
  echo "🧹 清理 server_dist/node_modules..."
  rm -rf "$SERVER_BUILD_DIR/node_modules"
fi

export PYINSTALLER_CONFIG_DIR="$BUILD_DIR/pyinstaller-cache"
mkdir -p "$PYINSTALLER_CONFIG_DIR"

# 设置内存优化环境变量
export PYTHONDONTWRITEBYTECODE=1
export PYTHONOPTIMIZE=1
export PYTHONMALLOC=malloc

# 确保 Python 可执行文件有 ad-hoc 签名（macOS AMFI 会拒绝未签名的二进制）
echo "🔧 确保 Python 可执行文件已签名..."
if ! codesign -v "$PYTHON" 2>/dev/null; then
  codesign --sign - "$PYTHON" 2>/dev/null && echo "✅ 已签名 $PYTHON" || echo "⚠️  签名失败（继续执行）"
else
  echo "✅ $PYTHON 已有签名"
fi
if ! codesign -v "$PYINSTALLER" 2>/dev/null; then
  codesign --sign - "$PYINSTALLER" 2>/dev/null || true
fi

# 构建数据文件参数
# 注意：--add-data 格式为 "源路径:目标路径"
# 目标路径为 . 时，文件放到 sys._MEIPASS 根目录
# 目标路径为目录名时，文件放到 sys._MEIPASS/目录名/ 下
DATA_ARGS="--add-data $BUILD_DIR/frontend_dist:frontend_dist "
DATA_ARGS="$DATA_ARGS --add-data $SERVER_BUILD_DIR:server_dist "
DATA_ARGS="$DATA_ARGS --add-data $NODE_RUNTIME_DIR:node "
# version.txt 放到 version_txt/ 目录下（避免与可能存在的 version.txt 文件冲突）
DATA_ARGS="$DATA_ARGS --add-data $VERSION_FILE:version_txt "


"$PYINSTALLER" \
  --name "CDF Know Clow" \
  --windowed \
  --onedir \
  --noconfirm \
  --noupx \
  --collect-all Cocoa \
  --collect-all objc \
  --collect-all PyObjCTools \
  --hidden-import objc \
  --hidden-import Cocoa \
  --exclude-module matplotlib \
  --exclude-module numpy \
  --exclude-module pandas \
  --exclude-module scipy \
  --exclude-module tkinter \
  --exclude-module PyQt5 \
  --exclude-module PyQt6 \
  --exclude-module PySide2 \
  --exclude-module PySide6 \
  --exclude-module tkinter \
  --exclude-module pytest \
  --exclude-module jupyter \
  --exclude-module ipython \
  --exclude-module PIL \
  --exclude-module Pillow \
  $DATA_ARGS \
  --icon "$PROJECT_DIR/public/icon.png" \
  --distpath "$BUILD_DIR/dist" \
  --workpath "$BUILD_DIR/work" \
  --specpath "$BUILD_DIR" \
  "$SCRIPT_DIR/pywebview_app.py"

# 复制共享 node_modules 到 .app 中（两个 server 共用一份）
APP_RESOURCES="$BUILD_DIR/dist/CDF Know Clow.app/Contents/Resources"
if [ -d "$SHARED_NODE_MODULES/node_modules" ]; then
  cp -r "$SHARED_NODE_MODULES/node_modules" "$APP_RESOURCES/shared_node_modules"
  SHARED_APP_SIZE=$(du -sh "$APP_RESOURCES/shared_node_modules" | cut -f1)
  echo "✅ 共享 node_modules 已复制到 .app/Contents/Resources/shared_node_modules/ ($SHARED_APP_SIZE)"
  rm -rf "$SHARED_NODE_MODULES"
fi

# 7. 修复 Info.plist
APP_PATH="$BUILD_DIR/dist/CDF Know Clow.app"
PLIST_PATH="$APP_PATH/Contents/Info.plist"

if [ -f "$PLIST_PATH" ]; then
  echo ">>> 优化 Info.plist (版本: $VERSION) ..."
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.cdf.knowclow.desktop" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.cdf.knowclow.desktop" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'CDF Know Clow 中免CLow端'" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string 'CDF Know Clow 中免CLow端'" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $VERSION" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleDevelopmentRegion zh-CN" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleDevelopmentRegion string zh-CN" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :LSMinimumSystemVersion 12.0" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 12.0" "$PLIST_PATH"
fi

# 8. 签名（可选：如果缺少 codesign 则跳过）
if command -v codesign &>/dev/null; then
  echo "🔏 签名应用包..."
  xattr -cr "$APP_PATH" 2>/dev/null || true
  codesign --force --sign - "$APP_PATH" 2>&1 || true
else
  echo "⚠️  跳过签名（codesign 未安装）"
  echo "   安装 Xcode Command Line Tools: xcode-select --install"
  echo "   未签名的应用首次启动需在 系统设置 > 隐私与安全性 中手动允许"
fi

# 9. 创建 DMG 安装包（含拖拽到 Applications 引导）
echo "💿 创建 DMG 安装包..."

DMG_STAGING="$BUILD_DIR/dmg-staging"
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"

# 9.1 复制 .app 到暂存目录
cp -r "$APP_PATH" "$DMG_STAGING/"

# 9.2 创建 Applications 快捷方式（标准 macOS DMG 做法）
ln -sf /Applications "$DMG_STAGING/Applications"

# 9.3 生成 DMG 背景图（浅灰底 + 箭头提示）
DMG_BG_DIR="$BUILD_DIR/dmg-bg"
mkdir -p "$DMG_BG_DIR/.background"
BG_PATH="$DMG_BG_DIR/.background/install-bg.png"
python3 << 'PYEOF_BG'
import os, sys
bg_dir = os.environ.get("DMG_BG_DIR", "")
if not bg_dir:
    sys.exit(0)
bg_path = os.path.join(bg_dir, ".background", "install-bg.png")
os.makedirs(os.path.dirname(bg_path), exist_ok=True)
try:
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (540, 380), (242, 242, 247, 255))
    draw = ImageDraw.Draw(img)
    arrow = [(155,190),(350,175),(350,165),(400,190),(350,215),(350,205),(155,190)]
    draw.polygon(arrow, fill=(120,120,120,200))
    img.save(bg_path, "PNG")
    print("✅ DMG 背景图已生成")
except Exception:
    pass
PYEOF_BG

# 将背景图复制到暂存目录
if [ -f "$DMG_BG_DIR/.background/install-bg.png" ]; then
  mkdir -p "$DMG_STAGING/.background"
  cp "$DMG_BG_DIR/.background/install-bg.png" "$DMG_STAGING/.background/"
fi

# 9.4 创建可写临时 DMG 并配置窗口布局
TEMP_DMG="$BUILD_DIR/temp.dmg"
rm -f "$TEMP_DMG"
hdiutil create -volname "$DMG_VOLUME" \
  -srcfolder "$DMG_STAGING" \
  -ov -format UDRW \
  "$TEMP_DMG"

# 挂载临时 DMG
DMG_DEVICE=$(hdiutil attach -readwrite -noverify -noautoopen "$TEMP_DMG" 2>/dev/null | grep -E '^/dev/' | head -1 | awk '{print $1}')

if [ -n "$DMG_DEVICE" ]; then
  sleep 2
  DMG_MOUNT="/Volumes/$DMG_VOLUME"

  # 设置背景图
  if [ -f "$DMG_STAGING/.background/install-bg.png" ]; then
    cp "$DMG_STAGING/.background/install-bg.png" "$DMG_MOUNT/.background/" 2>/dev/null || true
  fi

  # 用 AppleScript 设置窗口属性
  AS_TMP=$(mktemp /tmp/dmg_layout.XXXXXX.scpt)
  cat > "$AS_TMP" << 'EOSCPT'
tell application "Finder"
  set dmgName to system attribute "DMG_VOLUME_NAME"
  tell disk dmgName
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {400, 200, 940, 580}
    set theView to the icon view settings of container window
    set icon size of theView to 100
    set text size of theView to 12
    set position of item "CDF Know Clow.app" of container window to {140, 190}
    set position of item "Applications" of container window to {400, 190}
    close
    open
    update without registering applications
    delay 2
  end tell
end tell
EOSCPT
  DMG_VOLUME_NAME="$DMG_VOLUME" osascript "$AS_TMP" 2>/dev/null || true
  rm -f "$AS_TMP"

  # 卸载临时 DMG
  hdiutil detach "$DMG_DEVICE" 2>/dev/null || hdiutil detach "$DMG_DEVICE" -force 2>/dev/null || true
  sleep 2
fi

# 9.5 压缩为最终 DMG
mkdir -p "$PROJECT_DIR/release"
rm -f "$PROJECT_DIR/release/$DMG_NAME"
hdiutil convert "$TEMP_DMG" -format UDZO -o "$PROJECT_DIR/release/$DMG_NAME" -ov
rm -f "$TEMP_DMG"
rm -rf "$DMG_STAGING" "$DMG_BG_DIR"

echo ""
echo "✅ DMG 构建完成（含 Applications 拖拽引导）！"
ls -lh "$PROJECT_DIR/release/$DMG_NAME"
echo ""

# 10. 生成 release.json
echo "📝 生成 release.json..."

python3 << 'PYEOF2'
import json, os
from datetime import datetime

GITHUB_OWNER = "chouraycn"
GITHUB_REPO = "cross-wms"

version = os.environ.get("VERSION", "1.0.0")
pub_date = datetime.now().strftime("%Y-%m-%d")
dmg_url = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/download/v{version}/CDF-Know-Clow-{version}-mac.dmg"
min_ver = "1.0.0"

project_dir = os.environ.get("PROJECT_DIR", ".")
notes_file = os.path.join(project_dir, "RELEASE_NOTES.md")
if os.path.isfile(notes_file):
    with open(notes_file, 'r', encoding='utf-8') as f:
        notes = f.read().strip()
else:
    notes = f"CDF Know Clow v{version} 发布\n- 修复已知问题\n- 优化用户体验"

data = {
    'version': version,
    'pubDate': pub_date,
    'notes': notes,
    'dmgUrl': dmg_url,
    'minVersion': min_ver,
}

release_path = os.path.join(project_dir, "release", 'release.json')
with open(release_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"✅ release.json 已生成 — dmgUrl: {dmg_url}")
PYEOF2

echo ""

# 11. 上传到 GitHub Releases（CI 模式下跳过，由 CI workflow 处理）
if [ "$CI_MODE" = true ]; then
  echo "⏭️  跳过 GitHub Release 上传（--ci 模式，CI workflow 处理）"
else
  echo "🚀 上传到 GitHub Releases..."

# 如果 tag 已存在，先删除远程 tag 再重建（确保 Release 可重新创建）
if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
  echo "  ⚠️  标签 v${VERSION} 已存在，删除远程 tag 后重建..."
  git push origin ":refs/tags/v${VERSION}" 2>/dev/null || true
  git tag -d "v${VERSION}" 2>/dev/null || true
fi

git tag "v${VERSION}" -m "CDF Know Clow v${VERSION}"
git push origin "v${VERSION}"
echo "✅ 标签 v${VERSION} 已推送"

UPLOAD_OK=false

if [ -n "${GITHUB_TOKEN:-}" ] || [ -n "${GH_TOKEN:-}" ]; then
  echo "📦 使用 GitHub API 上传..."
  TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

  # 先删除已有 Release（如果存在）
  OLD_RELEASE_ID=$(curl -s -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/chouraycn/cross-wms/releases/tags/v${VERSION}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")
  
  if [ -n "$OLD_RELEASE_ID" ]; then
    echo "  ⚠️  删除已有 Release (ID: $OLD_RELEASE_ID)..."
    curl -s -X DELETE -H "Authorization: token $TOKEN" \
      "https://api.github.com/repos/chouraycn/cross-wms/releases/$OLD_RELEASE_ID" 2>/dev/null || true
    sleep 2  # 等待 GitHub API 同步
  fi

  # 创建新 Release
  python3 << 'PYEOF3' > /tmp/cdf_release_data.json
import json, os
version = os.environ.get("VERSION", "1.0.0")
project_dir = os.environ.get("PROJECT_DIR", ".")
notes_file = os.path.join(project_dir, "RELEASE_NOTES.md")
if os.path.isfile(notes_file):
    with open(notes_file, 'r', encoding='utf-8') as f:
        notes = f.read().strip()
else:
    notes = f"CDF Know Clow v{version} 发布"
print(json.dumps({"tag_name": "v" + version, "name": "CDF Know Clow v" + version, "body": notes, "draft": False, "prerelease": False}))
PYEOF3

  RELEASE_DATA=$(curl -s -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Content-Type: application/json" \
    -d @/tmp/cdf_release_data.json \
    "https://api.github.com/repos/chouraycn/cross-wms/releases")
  rm -f /tmp/cdf_release_data.json
  RELEASE_ID=$(echo "$RELEASE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -z "$RELEASE_ID" ]; then
    python3 << 'PYEOF3' > /tmp/cdf_know_clow_release_data.json
import json, os
version = os.environ.get("VERSION", "1.0.0")
project_dir = os.environ.get("PROJECT_DIR", ".")
notes_file = os.path.join(project_dir, "RELEASE_NOTES.md")
if os.path.isfile(notes_file):
    with open(notes_file, 'r', encoding='utf-8') as f:
        notes = f.read().strip()
else:
    notes = f"CDF Know Clow v{version} 发布"
print(json.dumps({"tag_name": "v" + version, "name": "CDF Know Clow v" + version, "body": notes}))
PYEOF3
    RELEASE_DATA=$(curl -s -X POST \
      -H "Authorization: token $TOKEN" \
      -H "Content-Type: application/json" \
      -d @/tmp/cdf_know_clow_release_data.json \
      "https://api.github.com/repos/chouraycn/cross-wms/releases")
    rm -f /tmp/cdf_know_clow_release_data.json
    RELEASE_ID=$(echo "$RELEASE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  fi

  if [ -n "$RELEASE_ID" ]; then
    UPLOAD_OK=true
    echo "  上传 DMG..."
    # 带超时和重试的上传（大文件最多尝试3次）
    for i in 1 2 3; do
      curl -s -f --max-time 600 --connect-timeout 30 -X POST \
        -H "Authorization: token $TOKEN" \
        -H "Content-Type: application/octet-stream" \
        --data-binary @"$PROJECT_DIR/release/$DMG_NAME" \
        "https://uploads.github.com/repos/chouraycn/cross-wms/releases/$RELEASE_ID/assets?name=$DMG_NAME" \
        > /dev/null 2>&1 && { echo "  ✅ DMG 上传成功"; break; } || {
        if [ "$i" -lt 3 ]; then
          echo "  ⚠️  DMG 上传重试 $i/3..."
          sleep $((i * 5))
        else
          echo "  ❌ DMG 上传失败（已重试3次）"
          UPLOAD_OK=false
        fi
      }
    done

    if [ "$UPLOAD_OK" = true ]; then
      echo "  上传 release.json..."
      curl -s -f --max-time 30 --connect-timeout 10 -X POST \
        -H "Authorization: token $TOKEN" \
        -H "Content-Type: application/json" \
        --data-binary @"$PROJECT_DIR/release/release.json" \
        "https://uploads.github.com/repos/chouraycn/cross-wms/releases/$RELEASE_ID/assets?name=release.json" \
        > /dev/null 2>&1 \
        && echo "  ✅ release.json 上传成功" || { echo "  ⚠️  release.json 上传失败"; UPLOAD_OK=false; }
    fi

    [ "$UPLOAD_OK" = true ] && echo "✅ Release v${VERSION} 已发布!"
  fi
fi

if [ "$UPLOAD_OK" = false ] && command -v gh &>/dev/null; then
  echo "📦 尝试 gh CLI..."
  if gh auth status &>/dev/null 2>&1; then
    gh release create "v${VERSION}" \
      "$PROJECT_DIR/release/$DMG_NAME#CDF Know Clow DMG" \
      "$PROJECT_DIR/release/release.json#Release Info" \
      --title "CDF Know Clow v${VERSION}" \
      --notes "$(cat "$PROJECT_DIR/RELEASE_NOTES.md" 2>/dev/null || echo "CDF Know Clow v${VERSION} 发布")" \
      && echo "✅ Release v${VERSION} 已发布!" || echo "⚠️  上传失败"
  fi
fi
fi # end of CI_MODE else block

echo ""
echo "=== 完成 ==="
echo "版本: $VERSION"
echo "DMG 路径: $PROJECT_DIR/release/$DMG_NAME"
echo "Release: https://github.com/chouraycn/cross-wms/releases/tag/v${VERSION}"
