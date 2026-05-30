#!/bin/bash
# CrossWMS — 构建 DMG 安装包（pywebview + PyInstaller + Node.js 后端）
# 方案：Python + pywebview 创建原生 macOS 窗口，Node.js 运行 AI 助手后端
# 优势：不弹浏览器，真正的桌面窗口体验 + AI 助手能力
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

# pywebview venv 路径
PYWEBVIEW_VENV="/Users/chouray/.workbuddy/binaries/python/envs/crosswms-pywebview"
PYINSTALLER="$PYWEBVIEW_VENV/bin/pyinstaller"
PYTHON="$PYWEBVIEW_VENV/bin/python3"

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
# index.html 是 copy，BUILD_DIR 可写
INJECTED_HTML="$BUILD_DIR/frontend_dist/index.html"
if [ -f "$INJECTED_HTML" ]; then
  # 用 Python 注入 <style>:root { --pw-top: 28px; }</style>
  python3 -c "
html = open('$INJECTED_HTML', 'r', encoding='utf-8').read()
html = html.replace('</head>', '<style>:root { --pw-top: 28px; }</style>\n</head>', 1)
open('$INJECTED_HTML', 'w', encoding='utf-8').write(html)
print('✅ pywebview CSS 变量已注入 index.html')
"
fi

# 3. 编译 Node.js 后端 TypeScript → JavaScript
echo "⚙️  编译 Node.js 后端..."

# 使用 esbuild 编译 server/ 目录
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
  # 回退：直接复制 .ts 文件，运行时用 tsx
  mkdir -p "$SERVER_BUILD_DIR"
  cp -r "$SERVER_DIR"/* "$SERVER_BUILD_DIR/"
fi

# 4. 安装后端生产依赖到独立目录
echo "📦 安装后端生产依赖..."
mkdir -p "$SERVER_BUILD_DIR/node_modules"
cd "$SERVER_BUILD_DIR"

# 创建最小 package.json 用于 npm install（版本号与项目同步）
cat > package.json << PKGJSON
{
  "name": "crosswms-server",
  "version": "${VERSION}",
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

npm install --production --no-optional 2>&1 | tail -5
echo "✅ 后端依赖安装完成"

cd "$PROJECT_DIR"

# 5. 复制 Node.js 运行时
echo "📦 准备 Node.js 运行时..."
mkdir -p "$NODE_RUNTIME_DIR/bin"
SYSTEM_NODE="$(which node 2>/dev/null || echo '')"

if [ -n "$SYSTEM_NODE" ] && [ -x "$SYSTEM_NODE" ]; then
  # 复制 Node.js 二进制
  cp "$SYSTEM_NODE" "$NODE_RUNTIME_DIR/bin/node"
  NODE_SIZE=$(du -sh "$NODE_RUNTIME_DIR/bin/node" | cut -f1)
  echo "✅ Node.js: $SYSTEM_NODE ($NODE_SIZE)"
else
  echo "⚠️  系统未找到 Node.js，AI 助手将不可用"
  echo "   安装 Node.js 后重新构建以启用 AI 助手"
fi

# 6. 用 PyInstaller 构建 .app
echo "🔨 用 PyInstaller 构建 CrossWMS.app..."
cd "$PROJECT_DIR"

# 临时移走 node_modules，避免 PyInstaller 把 .node 文件当 Python 扩展处理
SERVER_NODE_MODULES="$SERVER_BUILD_DIR/node_modules"
SERVER_NODE_MODULES_BAK="$BUILD_DIR/server_dist_node_modules_bak"
if [ -d "$SERVER_NODE_MODULES" ]; then
  mv "$SERVER_NODE_MODULES" "$SERVER_NODE_MODULES_BAK"
  echo "✅ 已临时移走 node_modules（避免 PyInstaller 处理 .node 文件）"
fi

# PyInstaller 的 bincache 默认路径 (~/Library/Application Support/pyinstaller) 在沙箱中不可写
# 解决：PYINSTALLER_CONFIG_DIR 环境变量让 PyInstaller 使用构建目录内的缓存
export PYINSTALLER_CONFIG_DIR="$BUILD_DIR/pyinstaller-cache"
mkdir -p "$PYINSTALLER_CONFIG_DIR"

"$PYINSTALLER" \
  --name "CrossWMS" \
  --windowed \
  --onedir \
  --noconfirm \
  --add-data "$BUILD_DIR/frontend_dist:frontend_dist" \
  --add-data "$SERVER_BUILD_DIR:server_dist" \
  --add-data "$NODE_RUNTIME_DIR:node" \
  --add-data "$VERSION_FILE:version.txt" \
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

# 7. 修复 Info.plist（使用 $VERSION 变量，不再硬编码）
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

# 8.5 构建并嵌入 Widget Extension
echo "📱 构建并嵌入 Widget Extension..."
if [ -f "$PROJECT_DIR/build-widget.sh" ]; then
    bash "$PROJECT_DIR/build-widget.sh" 2>&1
    echo "✅ Widget Extension 已嵌入到 .app"
else
    echo "⚠️  build-widget.sh 不存在，跳过 Widget 构建"
fi

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

# 10. 生成 release.json（用于自动更新检测）
echo "📝 生成 release.json..."

python3 << PYEOF
import json, os, sys

GITHUB_OWNER = "chouraycn"
GITHUB_REPO = "cross-wms"

version = "${VERSION}"
pub_date = "$(date +%Y-%m-%d)"
dmg_url = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/download/v{version}/CrossWMS-{version}-mac.dmg"
min_ver = "1.0.0"

notes_file = os.path.join("${PROJECT_DIR}", "RELEASE_NOTES.md")
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

with open(os.path.join("${PROJECT_DIR}", "release", 'release.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"✅ release.json 已生成 — dmgUrl: {dmg_url}")
PYEOF
echo ""

# 11. 上传到 GitHub Releases
echo "🚀 上传到 GitHub Releases..."

# 先用 git tag 打版本标签
if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
  echo "  标签 v${VERSION} 已存在，跳过创建"
else
  git tag "v${VERSION}" -m "CrossWMS v${VERSION}"
  git push origin "v${VERSION}"
  echo "✅ 标签 v${VERSION} 已推送"
fi

# 上传到 GitHub Releases（三步容错）
UPLOAD_OK=false

# ── 第一步：GITHUB_TOKEN API（最可靠，非交互环境首选）──
if [ -n "${GITHUB_TOKEN:-}" ] || [ -n "${GH_TOKEN:-}" ]; then
  echo "📦 使用 GitHub API 上传（GITHUB_TOKEN 可用）..."
  TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

  # 检查 release 是否已存在
  RELEASE_ID=$(curl -s -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/chouraycn/cross-wms/releases/tags/v${VERSION}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

  if [ -n "$RELEASE_ID" ]; then
    echo "  Release 已存在 (ID: $RELEASE_ID)，上传附件..."
  else
    echo "  创建 Release v${VERSION}..."
    # 用 temp file 避免 shell 引号嵌套问题（Python -c 里的 '''$NOTES''' 会被 shell 误解析）
    echo -n "$VERSION" > /tmp/crosswms_version.txt
    if [ -f "$PROJECT_DIR/RELEASE_NOTES.md" ]; then
      cat "$PROJECT_DIR/RELEASE_NOTES.md" > /tmp/crosswms_notes.txt
    else
      echo -n "CrossWMS v${VERSION} 发布" > /tmp/crosswms_notes.txt
    fi
    python3 << 'PYEOF' > /tmp/crosswms_release_data.json
import json
with open('/tmp/crosswms_version.txt') as f:
    version = f.read().strip()
with open('/tmp/crosswms_notes.txt') as f:
    notes = f.read().strip()
print(json.dumps({"tag_name": "v" + version, "name": "CrossWMS v" + version, "body": notes}))
PYEOF
    RELEASE_DATA=$(curl -s -X POST \
      -H "Authorization: token $TOKEN" \
      -H "Content-Type: application/json" \
      -d @/tmp/crosswms_release_data.json \
      "https://api.github.com/repos/chouraycn/cross-wms/releases")
    # 清理 temp file
    rm -f /tmp/crosswms_version.txt /tmp/crosswms_notes.txt /tmp/crosswms_release_data.json
    NEW_ID=$(echo "$RELEASE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
    if [ -n "$NEW_ID" ]; then
      RELEASE_ID="$NEW_ID"
      echo "  Release 已创建 (ID: $RELEASE_ID)"
    else
      echo "  ⚠️  Release 创建失败，尝试 fallback..."
    fi
  fi

  if [ -n "$RELEASE_ID" ]; then
    UPLOAD_OK=true
    # 上传 DMG
    echo "  上传 DMG ($DMG_NAME)..."
    UPLOAD_DMG=$(curl -s -w "%{http_code}" -H "Authorization: token $TOKEN" \
      -H "Content-Type: application/x-apple-diskimage" \
      --data-binary @"$PROJECT_DIR/release/$DMG_NAME" \
      "https://uploads.github.com/repos/chouraycn/cross-wms/releases/$RELEASE_ID/assets?name=$DMG_NAME")
    DMG_HTTP_CODE="${UPLOAD_DMG: -3}"
    if [ "$DMG_HTTP_CODE" != "201" ] && [ "$DMG_HTTP_CODE" != "200" ]; then
      echo "  ⚠️  DMG 上传失败 (HTTP $DMG_HTTP_CODE)"
      UPLOAD_OK=false
    fi
    # 上传 release.json
    echo "  上传 release.json..."
    UPLOAD_JSON=$(curl -s -w "%{http_code}" -H "Authorization: token $TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @"$PROJECT_DIR/release/release.json" \
      "https://uploads.github.com/repos/chouraycn/cross-wms/releases/$RELEASE_ID/assets?name=release.json")
    JSON_HTTP_CODE="${UPLOAD_JSON: -3}"
    if [ "$JSON_HTTP_CODE" != "201" ] && [ "$JSON_HTTP_CODE" != "200" ]; then
      echo "  ⚠️  release.json 上传失败 (HTTP $JSON_HTTP_CODE)"
      UPLOAD_OK=false
    fi
    if [ "$UPLOAD_OK" = true ]; then
      echo "✅ Release v${VERSION} 已发布!"
    else
      echo "⚠️  Release 上传未完全成功，请检查上述错误"
      UPLOAD_OK=false
    fi
  fi
fi

# ── 第二步：gh CLI（GITHUB_TOKEN 方式失败时兜底）──
if [ "$UPLOAD_OK" = false ] && command -v gh &>/dev/null; then
  echo "📦 尝试 gh CLI 创建 Release..."
  if gh auth status &>/dev/null 2>&1; then
    if gh release view "v${VERSION}" &>/dev/null 2>&1; then
      gh release upload "v${VERSION}" \
        "$PROJECT_DIR/release/$DMG_NAME#CrossWMS DMG" \
        "$PROJECT_DIR/release/release.json#Release Info" \
        --clobber \
        && UPLOAD_OK=true \
        && echo "✅ Release v${VERSION} 已发布!" \
        || echo "⚠️  Release 上传失败（gh release upload 返回错误）"
    else
      gh release create "v${VERSION}" \
        "$PROJECT_DIR/release/$DMG_NAME#CrossWMS DMG" \
        "$PROJECT_DIR/release/release.json#Release Info" \
        --title "CrossWMS v${VERSION}" \
        --notes "$(cat "$PROJECT_DIR/RELEASE_NOTES.md" 2>/dev/null || echo "CrossWMS v${VERSION} 发布")" \
        && UPLOAD_OK=true \
        && echo "✅ Release v${VERSION} 已发布!" \
        || echo "⚠️  Release 创建失败（gh release create 返回错误）"
    fi
  else
    echo "  ⚠️  gh CLI 未登录，跳过..."
  fi
fi

# ── 第三步：手动指引（所有自动方式都失败）──
if [ "$UPLOAD_OK" = false ]; then
  echo "⚠️  自动上传失败，手动创建 Release:"
  echo "     1. https://github.com/chouraycn/cross-wms/releases/new"
  echo "     2. Tag: v${VERSION}, 上传: release/$DMG_NAME + release/release.json"
  echo ""
  echo "   💡 后续自动上传需设置: export GITHUB_TOKEN=ghp_your_token"
fi

echo ""

# 12. 清理临时文件（保留 .app 以便调试）
echo "🧹 清理构建缓存..."
rm -rf "$BUILD_DIR/work" "$BUILD_DIR/CrossWMS.spec"

echo ""
echo "=== 完成 ==="
echo "版本: $VERSION"
echo "DMG 路径: $PROJECT_DIR/release/$DMG_NAME"
echo "Release: https://github.com/chouraycn/cross-wms/releases/tag/v${VERSION}"
echo ""
echo "📋 使用说明："
echo "   1. 将 DMG 发给对方"
echo "   2. 双击 DMG → 拖拽 CrossWMS.app 到 Applications"
echo "   3. 首次打开：右键 CrossWMS.app → 打开（绕过 Gatekeeper）"
echo "   4. 或在终端运行: xattr -cr /Applications/CrossWMS.app"
echo "   5. 启动后会打开原生 macOS 窗口 + AI 助手"
echo ""
echo "🚀 快捷命令："
echo "   bash build-dmg-pywebview.sh --bump-patch   # patch 版本 + 构建 + 上传"
echo "   bash build-dmg-pywebview.sh --bump-minor   # minor 版本 + 构建 + 上传"
echo "   bash build-dmg-pywebview.sh --bump-major   # major 版本 + 构建 + 上传"
echo ""
echo "💡 上传前提："
echo "   - 安装 gh CLI: brew install gh && gh auth login"
echo "   - 或设置环境变量: export GITHUB_TOKEN=ghp_your_token"
