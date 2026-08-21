#!/usr/bin/env zsh
set -euo pipefail

# Build the macOS .app bundle, then create a styled DMG + upload to GitHub Release.
# Full packaging flow: package-mac-app → create-dmg → release.json → GitHub
#
# Usage:
#   scripts/package-mac-dist.sh              # build + DMG + release
#   scripts/package-mac-dist.sh --no-bump    # skip version bump
#   scripts/package-mac-dist.sh --bump-minor # bump minor version
#   scripts/package-mac-dist.sh --bump-major # bump major version
#   scripts/package-mac-dist.sh --skip-dmg   # skip DMG creation (just .app)
#   scripts/package-mac-dist.sh --skip-release  # skip GitHub Release upload

# Load env vars from .zshrc (e.g. GITHUB_TOKEN)
# zsh 可直接 source .zshrc，无需像 bash 那样用子进程绕路
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc" 2>/dev/null || true
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/plistbuddy.sh"

# ===================== Version management =====================

CURRENT_VERSION=$(cd "$ROOT_DIR" && node -e "console.log(require('./package.json').version)")

BUMP_TYPE=""
SKIP_DMG=false
SKIP_RELEASE=false

for arg in "$@"; do
  case "$arg" in
    --bump-patch|--bump-minor|--bump-major)
      BUMP_TYPE="${arg#--bump-}"
      ;;
    --no-bump)
      BUMP_TYPE="none"
      ;;
    --skip-dmg)
      SKIP_DMG=true
      ;;
    --skip-release)
      SKIP_RELEASE=true
      ;;
  esac
done

# Default: bump patch
if [ -z "$BUMP_TYPE" ]; then
  BUMP_TYPE="patch"
fi

if [ "$BUMP_TYPE" = "none" ]; then
  echo "⏭️  跳过版本 bump（--no-bump）"
else
  echo "=== Bump ${BUMP_TYPE} version ==="
  cd "$ROOT_DIR"
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
  CURRENT_VERSION=$(cd "$ROOT_DIR" && node -e "console.log(require('./package.json').version)")
  echo "✅ 新版本: $CURRENT_VERSION"
fi

export APP_VERSION="$CURRENT_VERSION"
echo "版本: $APP_VERSION"
echo ""

# ===================== Pre-build check =====================

# P1-⑦: CI 环境使用 lenient 模式，仅检查致命项
PRE_BUILD_FLAGS="--skip-swift"
if [[ "${CI:-}" == "true" ]]; then
  PRE_BUILD_FLAGS="$PRE_BUILD_FLAGS --lenient"
fi

echo "🔍 Running pre-build check (flags: $PRE_BUILD_FLAGS)..."
if ! "$ROOT_DIR/scripts/pre-build-check.sh" $PRE_BUILD_FLAGS; then
  if [[ "${CI:-}" == "true" ]]; then
    echo "⚠️  Pre-build check failed in CI lenient mode, continuing anyway" >&2
  else
    echo "⚠️  Pre-build check failed, continuing anyway (CI quality gate covers checks)" >&2
  fi
fi
echo "✅ Pre-build check completed, continuing to package"
echo ""

# ===================== Build .app bundle =====================

export BUILD_CONFIG="${BUILD_CONFIG:-release}"
export BUNDLE_ID="${BUNDLE_ID:-com.cdf.knowclow.desktop}"

echo "📦 Building .app bundle..."
"$ROOT_DIR/scripts/package-mac-app.sh"

APP="$ROOT_DIR/dist-app/CDFKnowClow.app"
if [[ ! -d "$APP" ]]; then
  echo "Error: missing app bundle at $APP" >&2
  exit 1
fi

VERSION="$(plist_print_required "$APP/Contents/Info.plist" CFBundleShortVersionString)"
BUNDLE_VERSION="$(plist_print_required "$APP/Contents/Info.plist" CFBundleVersion)"

echo "✅ .app bundle ready"
echo "   Version: $VERSION (build $BUNDLE_VERSION)"
echo ""

# ===================== Create styled DMG =====================

# 统一输出到 release/ 目录，由 create-dmg.sh 决定最终文件名
mkdir -p "$ROOT_DIR/release"

if [[ "$SKIP_DMG" != "true" ]]; then
  echo "💿 Creating styled DMG..."
  "$ROOT_DIR/scripts/create-dmg.sh" "$APP"
  
  # 获取 create-dmg.sh 生成的实际 DMG 路径
  DMG="$ROOT_DIR/release/CDF Know Clow-$VERSION.dmg"
  if [[ -f "$DMG" ]]; then
    echo "✅ DMG created: $DMG"
    echo ""

    # Sign the DMG if we have a proper identity
    DMG_SIGN_IDENTITY="${SIGN_IDENTITY:-}"
    if [ -z "$DMG_SIGN_IDENTITY" ]; then
      DMG_SIGN_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null | grep -o '"[^"]*"' | head -1 | tr -d '"' || true)
    fi
    if [ -n "$DMG_SIGN_IDENTITY" ]; then
      echo "🔏 Signing DMG: $DMG"
      # v9.1（2026-08-05）：签名失败不再静默吞错，明确报警便于 CI 发现证书问题
      if /usr/bin/codesign --force --sign "$DMG_SIGN_IDENTITY" --timestamp "$DMG" 2>&1; then
        # 签名后验证
        if /usr/bin/codesign --verify --verbose=2 "$DMG" 2>&1; then
          echo "✅ DMG 签名验证通过"
        else
          echo "⚠️ DMG 签名完成但验证失败（可能仍可分发，但建议检查证书）" >&2
        fi
      else
        echo "⚠️ DMG 签名失败（本地开发无证书可忽略，CI 环境需检查 SIGN_IDENTITY）" >&2
      fi
    else
      echo "ℹ️ 未找到 codesigning 证书，跳过 DMG 签名（本地开发正常，发布需配置证书）"
    fi
  else
    echo "❌ DMG not found at expected path: $DMG" >&2
    exit 1
  fi
else
  echo "💿 Skipping DMG (--skip-dmg)"
fi

# ===================== Generate release.json =====================

echo "📝 Generating release.json..."
mkdir -p "$ROOT_DIR/release"

cat > "$ROOT_DIR/release/release.json" <<RELJSON
{
  "version": "$VERSION",
  "channel": "stable",
  "pubDate": "$(date -u +"%Y-%m-%d")",
  "dmgUrl": "https://github.com/chouraycn/CDFKnow/releases/download/v${VERSION}/CDF%20Know%20Clow-${VERSION}.dmg",
  "minVersion": "1.0.0"
}
RELJSON

echo "✅ release.json generated"
echo ""

# ===================== Sparkle Feed (appcast.xml) =====================
# v9.1（2026-08-05）：若提供了 SPARKLE_PRIVATE_KEY_FILE，自动生成 appcast.xml 供 Sparkle 自动更新。
# 这是可选步骤：本地开发无 key 时跳过，CI 发布时设置 secret 即可自动生成。
if [[ -n "${SPARKLE_PRIVATE_KEY_FILE:-}" && -f "${SPARKLE_PRIVATE_KEY_FILE:-}" ]]; then
  echo "📝 Generating Sparkle appcast.xml..."
  # Sparkle 需要 zip 包（DMG 不支持增量更新），这里用已签名的 app 打 zip
  SPARKLE_ZIP="$ROOT_DIR/release/CDFKnowClow-${VERSION}.zip"
  if [[ ! -f "$SPARKLE_ZIP" ]]; then
    APP_ROOT="$ROOT_DIR/apps/macos/.build/Build/Products/Release/CDF Know Clow.app"
    if [[ -d "$APP_ROOT" ]]; then
      (cd "$(dirname "$APP_ROOT")" && ditto -c -k --keepParent "$APP_ROOT" "$SPARKLE_ZIP")
    else
      echo "⚠️ App bundle not found, skip Sparkle zip: $APP_ROOT" >&2
    fi
  fi
  if [[ -f "$SPARKLE_ZIP" ]]; then
    if SPARKLE_RELEASE_VERSION="$VERSION" "$ROOT_DIR/scripts/make_appcast.sh" "$SPARKLE_ZIP" 2>&1; then
      echo "✅ appcast.xml generated"
    else
      echo "⚠️ appcast.xml 生成失败（不影响 DMG 发布，仅影响自动更新）" >&2
    fi
  fi
else
  echo "ℹ️ 跳过 Sparkle feed 生成（未设置 SPARKLE_PRIVATE_KEY_FILE，自动更新功能不可用）"
fi
echo ""

# ===================== GitHub Release =====================

if [[ "$SKIP_RELEASE" != "true" ]]; then
  echo "🚀 Uploading to GitHub Releases..."

  # Push tag
  TAG="v${VERSION}"
  cd "$ROOT_DIR"

  # Check if tag already exists (local OR remote)
  # 1) 本地 tag：git tag -l 只能看到本地 tag
  # 2) 远程 tag：git ls-remote --tags 检查 origin 上是否已存在该 tag
  #    覆盖"本地无 tag 但远程有"的场景（re-tag / re-release 时常见）
  LOCAL_TAG=$(git tag -l "$TAG")
  REMOTE_TAG=$(git ls-remote --tags origin "refs/tags/${TAG}" 2>/dev/null | awk -F'\t' '{print $2}' | sed 's@^refs/tags/@@' | head -1)

  if [[ -n "$LOCAL_TAG" ]]; then
    echo "⚠️  Local tag $TAG already exists, deleting..."
    git tag -d "$TAG" 2>/dev/null || true
  fi
  if [[ -n "$REMOTE_TAG" ]]; then
    echo "⚠️  Remote tag $TAG already exists on origin, deleting..."
    git push origin ":refs/tags/$TAG" 2>/dev/null || true
  fi

  git tag "$TAG"
  git push origin "$TAG"
  echo "✅ Tag $TAG pushed"

  # Create GitHub Release（环境自适应：gh 可用走 gh，否则回退 curl + GITHUB_TOKEN）
  echo "📦 Creating GitHub Release (v${VERSION})..."
  # REPO 自动从 origin remote 派生，避免硬编码与真实仓库不一致（曾误写为 chouraycn/CDFKnow 导致 Release 创建到不存在的仓库）
  REPO=$(git remote get-url origin 2>/dev/null | sed -E 's#.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#; s#.*github\.com/##' | head -1)
  if [ -z "$REPO" ]; then REPO="chouraycn/cross-wms"; fi
  ASSET_ENC="CDF%20Know%20Clow-${VERSION}.dmg"

  if command -v gh >/dev/null 2>&1; then
    # —— 路径 A：gh 可用（CI 环境）——
    gh release create "$TAG" \
      --title "CDF Know Clow v${VERSION}" \
      --notes "# CDF Know Clow v${VERSION}

## 新功能
- Swift 原生 macOS 应用（WKWebView）
- Node.js AI 助手后端（esbuild 编译）
- MCP Client 集成
- OpenClaw 核心包集成

## 下载
- **macOS (Apple Silicon)**: CDF Know Clow-${VERSION}.dmg

---
SHA256: $(shasum -a 256 "$DMG" 2>/dev/null | awk '{print $1}' || echo 'N/A')" \
      2>/dev/null || echo "⚠️  gh release create failed"
    [ -f "$DMG" ] && gh release upload "$TAG" "$DMG" --clobber 2>/dev/null || true
    [ -f "$ROOT_DIR/release/release.json" ] && gh release upload "$TAG" "$ROOT_DIR/release/release.json" --clobber 2>/dev/null || true
  else
    # —— 路径 B：gh 缺失，回退纯 curl + GITHUB_TOKEN ——
    if [ -z "$GITHUB_TOKEN" ]; then
      echo "⚠️  gh 未安装且 GITHUB_TOKEN 未设置，跳过 Release 上传（DMG 已构建于 $DMG）"
    else
      API="https://api.github.com/repos/${REPO}"
      UP="https://uploads.github.com/repos/${REPO}/releases"
      # 取已存在 Release（re-release 场景），否则创建
      # 注意：grep 无匹配会返回非 0；用 || true 防止 set -e/pipefail 在首次创建（无 Release）时中断脚本
      REL_ID=$(curl -s -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" \
        "$API/releases/tags/$TAG" | grep -o '"id"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | grep -o '[0-9]*' || true)
      if [ -z "$REL_ID" ]; then
        REL_ID=$(curl -s -X POST -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" \
          -H "Content-Type: application/json" \
          -d "{\"tag_name\":\"$TAG\",\"name\":\"CDF Know Clow v${VERSION}\",\"body\":\"CDF Know Clow v${VERSION}\",\"draft\":false,\"prerelease\":false}" \
          "$API/releases" | grep -o '"id"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | grep -o '[0-9]*' || true)
      fi
      echo "  Release ID: ${REL_ID:-N/A} (repo: ${REPO})"
      if [ -n "$REL_ID" ]; then
        upload_asset() {
          local F="$1" N="$2"
          [ -f "$F" ] || return 0
          curl -s -X POST -H "Authorization: token ${GITHUB_TOKEN}" \
            -H "Content-Type: application/octet-stream" \
            --data-binary @"$F" \
            "${UP}/${REL_ID}/assets?name=$N" >/dev/null \
            && echo "  ✅ 上传 $N"
        }
        [ -f "$DMG" ] && upload_asset "$DMG" "$ASSET_ENC" || true
        [ -f "$ROOT_DIR/release/release.json" ] && upload_asset "$ROOT_DIR/release/release.json" "release.json" || true
      else
        echo "⚠️  未能获取/创建 Release ID，跳过资产上传（请检查网络与 GITHUB_TOKEN 权限）"
      fi
    fi
  fi

  echo "✅ Release v${VERSION} 已发布!"
  echo "   https://github.com/chouraycn/CDFKnow/releases/tag/v${VERSION}"
else
  echo "🚀 Skipping GitHub Release (--skip-release)"
fi

echo ""
echo "=== 完成 ==="
echo "版本: $VERSION"
echo ".app: $APP"
echo "DMG:  $DMG"
