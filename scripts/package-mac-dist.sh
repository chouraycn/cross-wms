#!/usr/bin/env bash
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

echo "🔍 Running pre-build check..."
if ! "$ROOT_DIR/scripts/pre-build-check.sh" --skip-swift; then
  echo "❌ Pre-build check failed, aborting packaging" >&2
  exit 1
fi
echo "✅ Pre-build check passed"
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

DMG="$ROOT_DIR/release/CDF-Know-Clow-$VERSION-mac.dmg"

if [[ "$SKIP_DMG" != "true" ]]; then
  echo "💿 Creating styled DMG..."
  "$ROOT_DIR/scripts/create-dmg.sh" "$APP" "$DMG"
  echo "✅ DMG created: $DMG"
  echo ""

  # Sign the DMG if we have a proper identity
  DMG_SIGN_IDENTITY="${SIGN_IDENTITY:-}"
  if [ -z "$DMG_SIGN_IDENTITY" ]; then
    DMG_SIGN_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null | grep -o '"[^"]*"' | head -1 | tr -d '"' || true)
  fi
  if [ -n "$DMG_SIGN_IDENTITY" ]; then
    echo "🔏 Signing DMG: $DMG"
    /usr/bin/codesign --force --sign "$DMG_SIGN_IDENTITY" --timestamp "$DMG" 2>/dev/null || true
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
  "pubDate": "$(date -u +"%Y-%m-%d")",
  "dmgUrl": "https://github.com/chouraycn/CDFKnow/releases/download/v${VERSION}/CDF-Know-Clow-${VERSION}-mac.dmg",
  "minVersion": "1.0.0"
}
RELJSON

echo "✅ release.json generated"
echo ""

# ===================== GitHub Release =====================

if [[ "$SKIP_RELEASE" != "true" ]]; then
  echo "🚀 Uploading to GitHub Releases..."

  # Push tag
  TAG="v${VERSION}"
  cd "$ROOT_DIR"

  # Check if tag already exists
  if git tag -l "$TAG" | grep -q "$TAG"; then
    echo "⚠️  Tag $TAG already exists, deleting old tag..."
    git tag -d "$TAG" 2>/dev/null || true
    git push origin ":refs/tags/$TAG" 2>/dev/null || true
  fi

  git tag "$TAG"
  git push origin "$TAG"
  echo "✅ Tag $TAG pushed"

  # Create GitHub Release
  echo "📦 Creating GitHub Release..."
  gh release create "$TAG" \
    --title "CDF Know Clow v${VERSION}" \
    --notes "# CDF Know Clow v${VERSION}

## 新功能
- Swift 原生 macOS 应用（WKWebView）
- Node.js AI 助手后端（esbuild 编译）
- MCP Client 集成
- OpenClaw 核心包集成

## 下载
- **macOS (Apple Silicon)**: CDF-Know-Clow-${VERSION}-mac.dmg

---
SHA256: $(shasum -a 256 "$DMG" 2>/dev/null | awk '{print $1}' || echo 'N/A')" \
    2>/dev/null || {
      echo "⚠️  gh release create failed, trying API upload..."
    }

  # Upload DMG
  if [ -f "$DMG" ]; then
    echo "  上传 DMG..."
    gh release upload "$TAG" "$DMG" --clobber 2>/dev/null || {
      # Fallback: use GitHub API directly
      UPLOAD_URL=$(gh api repos/chouraycn/CDFKnow/releases/tags/$TAG --jq '.upload_url' 2>/dev/null || true)
      if [ -n "$UPLOAD_URL" ]; then
        UPLOAD_URL="${UPLOAD_URL%%\{*}"
        DMG_FILENAME="CDF-Know-Clow-${VERSION}-mac.dmg"
        curl -s -H "Authorization: token ${GITHUB_TOKEN}" \
          -H "Content-Type: application/octet-stream" \
          --data-binary @"$DMG" \
          "${UPLOAD_URL}?name=${DMG_FILENAME}" >/dev/null
      fi
    }
    echo "  ✅ DMG 上传成功"
  fi

  # Upload release.json
  if [ -f "$ROOT_DIR/release/release.json" ]; then
    echo "  上传 release.json..."
    gh release upload "$TAG" "$ROOT_DIR/release/release.json" --clobber 2>/dev/null || true
    echo "  ✅ release.json 上传成功"
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
