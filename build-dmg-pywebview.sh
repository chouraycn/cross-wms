#!/bin/bash
# CrossWMS — 构建 DMG 安装包（pywebview + PyInstaller + Node.js 后端）
# 方案：Python + pywebview 创建原生 macOS 窗口，Node.js 运行 AI 助手后端
# 新增：Agent Web 应用集成（前端端口 5174，后端端口 3002）
#
# 用法：
#   bash build-dmg-pywebview.sh           # 正常构建
#   bash build-dmg-pywebview.sh --bump-patch   # 构建前 bump patch 版本（1.0.0 → 1.0.1）
#   bash build-dmg-pywebview.sh --bump-minor   # 构建前 bump minor 版本（1.0.0 → 1.1.0）
#   bash build-dmg-pywebview.sh --bump-major   # 构建前 bump major 版本（1.0.0 → 2.0.0）

set -e

# 加载 ~/.zshrc 中的环境变量（如 GITHUB_TOKEN），确保非交互 shell 也能获取
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc" 2>/dev/null || true
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIST="$PROJECT_DIR/dist"
BUILD_DIR="$PROJECT_DIR/build-pywebview"
VERSION_FILE="$PROJECT_DIR/version.txt"
AGENT_WEB_DIR="$PROJECT_DIR/../cross-wms-agent-web"

# ===================== 版本管理 =====================

# 从 package.json 读取当前版本
CURRENT_VERSION=$(node -e "console.log(require('./package.json').version)")

# 处理 bump 参数
BUMP_TYPE=""
for arg in "$@"; do
  case "$arg" in
    --bump-patch|--bump-minor|--bump-major)
      BUMP_TYPE="${arg#--bump-}"
      ;;
  esac
done

# 如果指定了 bump，先更新版本号
if [ -n "$BUMP_TYPE" ]; then
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
DMG_NAME="CrossWMS-${VERSION}-mac.dmg"
DMG_VOLUME="CrossWMS v${VERSION}"

# 生成 version.txt（供 pywebview_app.py 读取）
echo "$VERSION" > "$VERSION_FILE"
echo "📝 版本文件已生成: $VERSION_FILE → $VERSION"
echo ""

# pywebview venv 路径（CI 环境自动检测）
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
  # 本地环境：使用指定的 venv
  PYWEBVIEW_VENV="/Users/chouray/.workbuddy/binaries/python/envs/crosswms-pywebview"
  PYINSTALLER="$PYWEBVIEW_VENV/bin/pyinstaller"
  PYTHON="$PYWEBVIEW_VENV/bin/python3"
fi

# Node.js 后端配置
SERVER_DIR="$PROJECT_DIR/server"
SERVER_BUILD_DIR="$BUILD_DIR/server_dist"
NODE_RUNTIME_DIR="$BUILD_DIR/node_runtime"

echo "=== CrossWMS DMG Builder (pywebview + PyInstaller + Node.js) ==="
echo "版本: $VERSION"
echo ""

# 1. 检查前置条件
if [ ! -d "$FRONTEND_DIST" ]; then
  echo "❌ 前端 dist 目录不存在，先构建前端..."
  cd "$PROJECT_DIR" && npm run build
fi

if [ ! -x "$PYINSTALLER" ]; then
  echo "❌ PyInstaller 未找到: $PYINSTALLER"
  echo "   请先运行: $PYWEBVIEW_VENV/bin/pip install pyinstaller pywebview Pillow"
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

# 在构建时注入 pywebview CSS 变量（解决 DMG 只读文件系统无法运行时写入的问题）
INJECTED_HTML="$BUILD_DIR/frontend_dist/index.html"
if [ -f "$INJECTED_HTML" ]; then
  python3 -c "
html = open('$INJECTED_HTML', 'r', encoding='utf-8').read()
html = html.replace('</head>', '<style>:root { --pw-top: 28px; }</style>\n</head>', 1)
open('$INJECTED_HTML', 'w', encoding='utf-8').write(html)
print('✅ pywebview CSS 变量已注入 index.html')
"
fi

# 2.5 构建 Agent Web 前端（如果存在）
AGENT_DIST="$BUILD_DIR/agent_dist"
if [ -d "$AGENT_WEB_DIR" ]; then
  echo "📦 构建 Agent Web 前端..."
  cd "$AGENT_WEB_DIR"
  if [ -f "package.json" ]; then
    echo "   安装 Agent Web 依赖..."
    npm install --legacy-peer-deps 2>&1 | tail -5
    echo "   构建 Agent Web 前端（输出到 dist/）..."
    npm run build 2>&1 | tail -10
    if [ -d "dist" ]; then
      mkdir -p "$AGENT_DIST"
      cp -r dist/* "$AGENT_DIST/"
      echo "   ✅ Agent Web 前端已构建并复制到 $AGENT_DIST"
    else
      echo "   ⚠️  Agent Web dist/ 目录不存在，跳过..."
    fi
  else
    echo "   ⚠️  Agent Web package.json 不存在，跳过前端构建"
  fi
  cd "$PROJECT_DIR"
else
  echo "⚠️  Agent Web 目录不存在 ($AGENT_WEB_DIR)，跳过前端构建"
fi
echo ""

# 3. 编译 Node.js 后端 TypeScript → JavaScript
echo "⚙️  编译 Node.js 后端..."

if command -v npx &>/dev/null; then
  npx esbuild "$SERVER_DIR/index.ts" \
    --bundle \
    --platform=node \
    --target=node18 \
    --format=cjs \
    --outfile="$SERVER_BUILD_DIR/index.cjs" \
    --external:better-sqlite3 \
    --external:@tencent-ai/agent-sdk \
    --external:express \
    --external:cors \
    --external:uuid
  echo "✅ 后端编译完成 (index.cjs)"
else
  echo "⚠️  esbuild 不可用，尝试手动复制..."
  mkdir -p "$SERVER_BUILD_DIR"
  cp -r "$SERVER_DIR"/* "$SERVER_BUILD_DIR/"
fi

# 3.5 编译 Agent Web 后端（使用 esbuild）
AGENT_SERVER_SOURCE="$AGENT_WEB_DIR/server/index.ts"
AGENT_SERVER_BUILD_DIR="$BUILD_DIR/agent_server_dist"
if [ -f "$AGENT_SERVER_SOURCE" ]; then
  echo "⚙️  编译 Agent Web 后端..."
  mkdir -p "$AGENT_SERVER_BUILD_DIR"
  if command -v npx &>/dev/null; then
    npx esbuild "$AGENT_SERVER_SOURCE" \
      --bundle \
      --platform=node \
      --target=node18 \
      --format=cjs \
      --outfile="$AGENT_SERVER_BUILD_DIR/agent_index.cjs" \
      --external:@tencent-ai/agent-sdk \
      --external:express \
      --external:cors \
      --external:uuid \
      --external:better-sqlite3
    echo "✅ Agent Web 后端编译完成 (agent_index.cjs)"
  else
    echo "⚠️  esbuild 不可用，尝试手动复制..."
    cp -r "$AGENT_WEB_DIR/server"/* "$AGENT_SERVER_BUILD_DIR/"
  fi
else
  echo "⚠️  Agent Web 后端源码不存在 ($AGENT_SERVER_SOURCE)，跳过编译"
fi
echo ""

# 4. 安装后端生产依赖到独立目录
echo "📦 安装后端生产依赖..."
mkdir -p "$SERVER_BUILD_DIR/node_modules"
cd "$SERVER_BUILD_DIR"

cat > package.json << 'PKGJSON'
{
  "name": "crosswms-server",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@tencent-ai/agent-sdk": "^0.3.43",
    "better-sqlite3": "^12.6.2",
    "cors": "^2.8.5",
    "express": "^5.2.0",
    "uuid": "^9.0.0"
  }
}
PKGJSON

# 更新版本号
sed -i '' "s/\\\"version\\\": \\\"1.0.0\\\"/\\\"version\\\": \\\"${VERSION}\\\"/" package.json

npm install --production --no-optional 2>&1 | tail -5
echo "✅ 后端依赖安装完成"

# 4.5 安装 Agent Web 后端生产依赖
if [ -d "$AGENT_SERVER_BUILD_DIR" ]; then
  echo "📦 安装 Agent Web 后端生产依赖..."
  mkdir -p "$AGENT_SERVER_BUILD_DIR/node_modules"
  cd "$AGENT_SERVER_BUILD_DIR"

  cat > package.json << 'AGENTPKGJSON'
{
  "name": "crosswms-agent-server",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@tencent-ai/agent-sdk": "^0.3.43",
    "express": "^5.2.0",
    "cors": "^2.8.5",
    "uuid": "^9.0.0",
    "better-sqlite3": "^12.6.2"
  }
}
AGENTPKGJSON

  # 更新版本号
  sed -i '' "s/\\\"version\\\": \\\"1.0.0\\\"/\\\"version\\\": \\\"${VERSION}\\\"/" package.json

  npm install --production --no-optional 2>&1 | tail -5
  echo "✅ Agent Web 后端依赖安装完成"
  cd "$PROJECT_DIR"
fi

cd "$PROJECT_DIR"

# 5. 复制 Node.js 运行时
echo "📦 准备 Node.js 运行时..."
mkdir -p "$NODE_RUNTIME_DIR/bin"
SYSTEM_NODE="$(which node 2>/dev/null || echo '')"

if [ -n "$SYSTEM_NODE" ] && [ -x "$SYSTEM_NODE" ]; then
  cp "$SYSTEM_NODE" "$NODE_RUNTIME_DIR/bin/node"
  NODE_SIZE=$(du -sh "$NODE_RUNTIME_DIR/bin/node" | cut -f1)
  echo "✅ Node.js: $SYSTEM_NODE ($NODE_SIZE)"
else
  echo "⚠️  系统未找到 Node.js，AI 助手将不可用"
fi

# 6. 用 PyInstaller 构建 .app
echo "🔨 用 PyInstaller 构建 CrossWMS.app..."
cd "$PROJECT_DIR"

# 临时移走 node_modules，避免 PyInstaller 把 .node 文件当 Python 扩展处理
SERVER_NODE_MODULES="$SERVER_BUILD_DIR/node_modules"
SERVER_NODE_MODULES_BAK="$BUILD_DIR/server_dist_node_modules_bak"
if [ -d "$SERVER_NODE_MODULES" ]; then
  mv "$SERVER_NODE_MODULES" "$SERVER_NODE_MODULES_BAK"
  echo "✅ 已临时移走 server_dist/node_modules"
fi

# 临时移走 agent_server_dist/node_modules
AGENT_SERVER_NODE_MODULES="$AGENT_SERVER_BUILD_DIR/node_modules"
AGENT_SERVER_NODE_MODULES_BAK="$BUILD_DIR/agent_server_dist_node_modules_bak"
if [ -d "$AGENT_SERVER_BUILD_DIR" ] && [ -d "$AGENT_SERVER_NODE_MODULES" ]; then
  mv "$AGENT_SERVER_NODE_MODULES" "$AGENT_SERVER_NODE_MODULES_BAK"
  echo "✅ 已临时移走 agent_server_dist/node_modules"
fi

export PYINSTALLER_CONFIG_DIR="$BUILD_DIR/pyinstaller-cache"
mkdir -p "$PYINSTALLER_CONFIG_DIR"

# 构建数据文件参数
DATA_ARGS="--add-data $BUILD_DIR/frontend_dist:frontend_dist "
DATA_ARGS="$DATA_ARGS --add-data $SERVER_BUILD_DIR:server_dist "
DATA_ARGS="$DATA_ARGS --add-data $NODE_RUNTIME_DIR:node "
DATA_ARGS="$DATA_ARGS --add-data $VERSION_FILE:version.txt "

if [ -d "$AGENT_DIST" ]; then
  DATA_ARGS="$DATA_ARGS --add-data $AGENT_DIST:agent_dist "
  echo "✅ 添加 Agent Web 前端到打包"
fi

if [ -d "$AGENT_SERVER_BUILD_DIR" ]; then
  DATA_ARGS="$DATA_ARGS --add-data $AGENT_SERVER_BUILD_DIR:agent_server_dist "
  echo "✅ 添加 Agent Web 后端到打包"
fi

"$PYINSTALLER" \
  --name "CrossWMS" \
  --windowed \
  --onedir \
  --noconfirm \
  $DATA_ARGS \
  --icon "$PROJECT_DIR/public/icon.png" \
  --distpath "$BUILD_DIR/dist" \
  --workpath "$BUILD_DIR/work" \
  --specpath "$BUILD_DIR" \
  pywebview_app.py

# 恢复 node_modules 到 .app 中
APP_SERVER_DIST="$BUILD_DIR/dist/CrossWMS.app/Contents/Resources/server_dist"
if [ -d "$SERVER_NODE_MODULES_BAK" ]; then
  mkdir -p "$APP_SERVER_DIST"
  cp -r "$SERVER_NODE_MODULES_BAK" "$APP_SERVER_DIST/node_modules"
  rm -rf "$SERVER_NODE_MODULES_BAK"
  echo "✅ node_modules 已复制到 .app/Contents/Resources/server_dist/"
fi

APP_AGENT_SERVER_DIST="$BUILD_DIR/dist/CrossWMS.app/Contents/Resources/agent_server_dist"
if [ -d "$AGENT_SERVER_NODE_MODULES_BAK" ]; then
  mkdir -p "$APP_AGENT_SERVER_DIST"
  cp -r "$AGENT_SERVER_NODE_MODULES_BAK" "$APP_AGENT_SERVER_DIST/node_modules"
  rm -rf "$AGENT_SERVER_NODE_MODULES_BAK"
  echo "✅ Agent Web node_modules 已复制到 .app/Contents/Resources/agent_server_dist/"
fi

# 7. 修复 Info.plist
APP_PATH="$BUILD_DIR/dist/CrossWMS.app"
PLIST_PATH="$APP_PATH/Contents/Info.plist"

if [ -f "$PLIST_PATH" ]; then
  echo "📝 优化 Info.plist（版本: $VERSION）..."
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.crosswms.desktop" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.crosswms.desktop" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName CrossWMS 仓库管理" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string 'CrossWMS 仓库管理'" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $VERSION" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleDevelopmentRegion zh-CN" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleDevelopmentRegion string zh-CN" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :LSMinimumSystemVersion 12.0" "$PLIST_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 12.0" "$PLIST_PATH"
fi

# 8. 签名
echo "🔏 签名应用包..."
xattr -cr "$APP_PATH" 2>/dev/null || true
codesign --force --sign - "$APP_PATH" 2>&1 || true

# 9. 创建 DMG
echo "💿 创建 DMG 安装包..."
mkdir -p "$PROJECT_DIR/release"
rm -f "$PROJECT_DIR/release/$DMG_NAME"

hdiutil create -volname "$DMG_VOLUME" \
  -srcfolder "$APP_PATH" \
  -ov -format UDZO \
  "$PROJECT_DIR/release/$DMG_NAME"

echo ""
echo "✅ DMG 构建完成！"
ls -lh "$PROJECT_DIR/release/$DMG_NAME"
echo ""

# 10. 生成 release.json
echo "📝 生成 release.json..."

python3 << 'PYEOF2'
import json, os

GITHUB_OWNER = "chouraycn"
GITHUB_REPO = "cross-wms"

version = os.environ.get("VERSION", "1.0.0")
pub_date = "$(date +%Y-%m-%d)"
dmg_url = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/download/v{version}/CrossWMS-{version}-mac.dmg"
min_ver = "1.0.0"

project_dir = os.environ.get("PROJECT_DIR", ".")
notes_file = os.path.join(project_dir, "RELEASE_NOTES.md")
if os.path.isfile(notes_file):
    with open(notes_file, 'r', encoding='utf-8') as f:
        notes = f.read().strip()
else:
    notes = f"CrossWMS v{version} 发布\n- 修复已知问题\n- 优化用户体验"

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

# 11. 上传到 GitHub Releases
echo "🚀 上传到 GitHub Releases..."

if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
  echo "  标签 v${VERSION} 已存在，跳过创建"
else
  git tag "v${VERSION}" -m "CrossWMS v${VERSION}"
  git push origin "v${VERSION}"
  echo "✅ 标签 v${VERSION} 已推送"
fi

UPLOAD_OK=false

if [ -n "${GITHUB_TOKEN:-}" ] || [ -n "${GH_TOKEN:-}" ]; then
  echo "📦 使用 GitHub API 上传..."
  TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

  RELEASE_ID=$(curl -s -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/chouraycn/cross-wms/releases/tags/v${VERSION}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

  if [ -z "$RELEASE_ID" ]; then
    python3 << 'PYEOF3' > /tmp/crosswms_release_data.json
import json, os
version = os.environ.get("VERSION", "1.0.0")
project_dir = os.environ.get("PROJECT_DIR", ".")
notes_file = os.path.join(project_dir, "RELEASE_NOTES.md")
if os.path.isfile(notes_file):
    with open(notes_file, 'r', encoding='utf-8') as f:
        notes = f.read().strip()
else:
    notes = f"CrossWMS v{version} 发布"
print(json.dumps({"tag_name": "v" + version, "name": "CrossWMS v" + version, "body": notes}))
PYEOF3
    RELEASE_DATA=$(curl -s -X POST \
      -H "Authorization: token $TOKEN" \
      -H "Content-Type: application/json" \
      -d @/tmp/crosswms_release_data.json \
      "https://api.github.com/repos/chouraycn/cross-wms/releases")
    rm -f /tmp/crosswms_release_data.json
    RELEASE_ID=$(echo "$RELEASE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  fi

  if [ -n "$RELEASE_ID" ]; then
    UPLOAD_OK=true
    echo "  上传 DMG..."
    curl -s -X POST \
      -H "Authorization: token $TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --data-binary @"$PROJECT_DIR/release/$DMG_NAME" \
      "https://uploads.github.com/repos/chouraycn/cross-wms/releases/$RELEASE_ID/assets?name=$DMG_NAME" \
      && echo "  ✅ DMG 上传成功" || { echo "  ⚠️  DMG 上传失败"; UPLOAD_OK=false; }

    echo "  上传 release.json..."
    curl -s -X POST \
      -H "Authorization: token $TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @"$PROJECT_DIR/release/release.json" \
      "https://uploads.github.com/repos/chouraycn/cross-wms/releases/$RELEASE_ID/assets?name=release.json" \
      && echo "  ✅ release.json 上传成功" || { echo "  ⚠️  release.json 上传失败"; UPLOAD_OK=false; }

    [ "$UPLOAD_OK" = true ] && echo "✅ Release v${VERSION} 已发布!"
  fi
fi

if [ "$UPLOAD_OK" = false ] && command -v gh &>/dev/null; then
  echo "📦 尝试 gh CLI..."
  if gh auth status &>/dev/null 2>&1; then
    gh release create "v${VERSION}" \
      "$PROJECT_DIR/release/$DMG_NAME#CrossWMS DMG" \
      "$PROJECT_DIR/release/release.json#Release Info" \
      --title "CrossWMS v${VERSION}" \
      --notes "$(cat "$PROJECT_DIR/RELEASE_NOTES.md" 2>/dev/null || echo "CrossWMS v${VERSION} 发布")" \
      && echo "✅ Release v${VERSION} 已发布!" || echo "⚠️  上传失败"
  fi
fi

echo ""
echo "=== 完成 ==="
echo "版本: $VERSION"
echo "DMG 路径: $PROJECT_DIR/release/$DMG_NAME"
echo "Release: https://github.com/chouraycn/cross-wms/releases/tag/v${VERSION}"
