#!/usr/bin/env bash
set -euo pipefail

# Build and bundle CDF Know Clow into a .app bundle.
# Architecture: Swift native macOS app (WKWebView) + Node.js backend
# Adapted from OpenClaw's package-mac-app.sh pattern.
#
# Outputs: dist-app/CDFKnowClow.app

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/plistbuddy.sh"

APP_ROOT="$ROOT_DIR/dist-app/CDFKnowClow.app"
CONTENTS="$APP_ROOT/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RESOURCES_DIR="$CONTENTS/Resources"
FRAMEWORKS_DIR="$CONTENTS/Frameworks"
BUILD_CONFIG="${BUILD_CONFIG:-release}"
APP_VERSION="${APP_VERSION:-$(cd "$ROOT_DIR" && node -p "require('./package.json').version")}"
BUILD_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT=$(cd "$ROOT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BUILD_NUMBER=$(cd "$ROOT_DIR" && git rev-list --count HEAD 2>/dev/null || echo "0")
BUILD_NUMBER="${BUILD_NUMBER:-$GIT_BUILD_NUMBER}"
BUNDLE_ID="${BUNDLE_ID:-com.cdf.knowclow.desktop}"
PRODUCT="CDFKnowClow"

echo "=== Building $PRODUCT macOS app ==="
echo "Version: $APP_VERSION"
echo "Build: $BUILD_NUMBER"
echo "Config: $BUILD_CONFIG"
echo "Commit: $GIT_COMMIT"
echo ""

# ===================== Clean previous build =====================

echo "🧹 Cleaning old app bundle"
rm -rf "$APP_ROOT"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$FRAMEWORKS_DIR"

# ===================== 1. Build Swift app =====================

echo "🔨 Building Swift app ($BUILD_CONFIG)..."
cd "$ROOT_DIR/apps/macos"

SWIFT_BUILD_PATH=".build"
if [ "$BUILD_CONFIG" = "release" ]; then
    swift build --disable-sandbox -c release --build-path "$SWIFT_BUILD_PATH"
    SWIFT_BIN="$(swift build --disable-sandbox -c release --build-path "$SWIFT_BUILD_PATH" --show-bin-path)/$PRODUCT"
else
    swift build --disable-sandbox -c debug --build-path "$SWIFT_BUILD_PATH"
    SWIFT_BIN="$(swift build --disable-sandbox --build-path "$SWIFT_BUILD_PATH" --show-bin-path)/$PRODUCT"
fi

cp "$SWIFT_BIN" "$MACOS_DIR/$PRODUCT"
chmod +x "$MACOS_DIR/$PRODUCT"
# SwiftPM outputs ad-hoc signed binaries; strip before install_name_tool
/usr/bin/codesign --remove-signature "$MACOS_DIR/$PRODUCT" 2>/dev/null || true
echo "✅ Swift app built ($SWIFT_BIN)"

cd "$ROOT_DIR"

# ===================== 2. Copy app icon =====================

echo "🖼  Copying app icon..."
ICON_PATH="$ROOT_DIR/apps/macos/Icon.icon/AppIcon.icns"
if [ -f "$ICON_PATH" ]; then
    cp "$ICON_PATH" "$RESOURCES_DIR/AppIcon.icns"
    echo "✅ App icon copied"
else
    echo "⚠️  App icon not found: $ICON_PATH"
fi

# ===================== 3. Build frontend =====================

echo "📦 Building frontend (tsc + vite build)..."
# Use npm instead of pnpm to avoid monorepo workspace install issues
cd "$ROOT_DIR"
npm run build 2>&1 || {
    # Fallback: call tsc + vite directly
    echo "npm run build failed, calling tsc + vite directly..."
    npx tsc --noEmit 2>&1 | tail -5
    npx vite build 2>&1 | tail -10
}
echo "✅ Frontend built"

echo "📦 Copying frontend dist to .app..."
rm -rf "$RESOURCES_DIR/frontend_dist"
mkdir -p "$RESOURCES_DIR/frontend_dist"
# Remove mock service worker (not needed in production)
rm -f "$ROOT_DIR/dist/mockServiceWorker.js" 2>/dev/null || true
cp -R "$ROOT_DIR/dist/"* "$RESOURCES_DIR/frontend_dist/"
echo "✅ Frontend dist copied"

# ===================== 4. Build Node.js server (esbuild) =====================

echo "⚙️  Compiling Node.js backend (esbuild)..."
SERVER_DIST_DIR="$RESOURCES_DIR/server_dist"
mkdir -p "$SERVER_DIST_DIR"

# Use esbuild to bundle the server into a single CJS file
# --alias:@src=... resolves the @src import alias used in server code
# --external marks native modules that can't be bundled (loaded at runtime from shared_node_modules)
cd "$ROOT_DIR"
"$ROOT_DIR/node_modules/.bin/esbuild" \
    server/index.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=cjs \
    --outfile="$SERVER_DIST_DIR/index.cjs" \
    --alias:@src="$ROOT_DIR/src" \
    --external:better-sqlite3 \
    --external:@cdfclaw/* \
    --external:@modelcontextprotocol/sdk \
    --external:json5 \
    --external:onnxruntime-node \
    --external:fsevents \
    --sourcemap=inline \
    2>&1

echo "✅ Server compiled ($SERVER_DIST_DIR/index.cjs)"

# ===================== 5. Prepare Node.js runtime =====================

echo "📦 Preparing Node.js runtime..."
NODE_SRC="/usr/local/bin/node"
if [ ! -f "$NODE_SRC" ]; then
    NODE_SRC="$(which node)"
fi
if [ -z "$NODE_SRC" ] || [ ! -f "$NODE_SRC" ]; then
    echo "ERROR: Node.js not found" >&2
    exit 1
fi

NODE_DEST_DIR="$RESOURCES_DIR/node/bin"
mkdir -p "$NODE_DEST_DIR"
cp "$NODE_SRC" "$NODE_DEST_DIR/node"
chmod +x "$NODE_DEST_DIR/node"

# Strip debug symbols to reduce size
NODE_SIZE_BEFORE=$(du -sm "$NODE_DEST_DIR/node" | awk '{print $1}')
strip "$NODE_DEST_DIR/node" 2>/dev/null || true
NODE_SIZE_AFTER=$(du -sm "$NODE_DEST_DIR/node" | awk '{print $1}')
echo "✅ Node.js runtime: $NODE_SRC (${NODE_SIZE_BEFORE}M → ${NODE_SIZE_AFTER}M)"

# ===================== 6. Install shared node_modules =====================

echo "📦 Installing shared node_modules..."
SHARED_NM="$RESOURCES_DIR/shared_node_modules"
mkdir -p "$SHARED_NM"

# Create a minimal package.json for npm install in a temp directory
# (npm requires the file to be named exactly "package.json" and to be in the cwd)
NM_TMP_DIR="$(mktemp -d)"
cat > "$NM_TMP_DIR/package.json" <<'PKGJSON'
{
  "name": "cdf-know-clow-runtime",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "json5": "^2.2.3"
  }
}
PKGJSON

cd "$NM_TMP_DIR"
npm install --production --omit=dev 2>&1 | tail -10
echo "✅ npm install completed"

# Copy installed node_modules into shared_node_modules
cp -R "$NM_TMP_DIR/node_modules/"* "$SHARED_NM/" 2>/dev/null || true

# Clean temp directory
rm -rf "$NM_TMP_DIR"

# Clean non-runtime files from shared_node_modules
echo "🧹 Cleaning shared_node_modules non-runtime files..."
NM_SIZE_BEFORE=$(du -sm "$SHARED_NM" 2>/dev/null | awk '{print $1}' || echo "?")

find "$SHARED_NM" -type d \( -name ".cache" -o -name "test" -o -name "tests" -o -name "__tests__" \
    -o -name "docs" -o -name "doc" -o -name ".github" -o -name "example" -o -name "examples" \
    -o -name "benchmark" -o -name "benchmarks" -o -name ".travis" -o -name "coverage" \
    -o -name ".nyc_output" -o -name "tsconfig*" \) -exec rm -rf {} + 2>/dev/null || true

find "$SHARED_NM" -type f \( -name "*.md" -o -name "*.txt" -o -name "*.map" -o -name "LICENSE*" \
    -o -name "CHANGELOG*" -o -name "*.ts" ! -name "*.d.ts" \
    -o -name "Makefile" -o -name "*.yml" -o -name "*.yaml" ! -name "package.json" \) -delete 2>/dev/null || true

# Clean better-sqlite3 source/build files (prebuild only)
BSQL_DIR="$SHARED_NM/better-sqlite3"
if [ -d "$BSQL_DIR" ]; then
    find "$BSQL_DIR" -type d \( -name "deps" -o -name "src" -o -name "build" \) -exec rm -rf {} + 2>/dev/null || true
    BSQL_SIZE=$(du -sm "$BSQL_DIR" 2>/dev/null | awk '{print $1}' || echo "?")
    echo "   ✅ better-sqlite3 cleaned (now ${BSQL_SIZE}M)"
fi

NM_SIZE_AFTER=$(du -sm "$SHARED_NM" 2>/dev/null | awk '{print $1}' || echo "?")
echo "✅ Shared node_modules ready (${NM_SIZE_BEFORE}M → ${NM_SIZE_AFTER}M)"

cd "$ROOT_DIR"

# ===================== 7. Create Info.plist =====================

echo "📄 Creating Info.plist..."
INFO_PLIST_SRC="$ROOT_DIR/apps/macos/Sources/CDFKnow/Resources/Info.plist"
if [ -f "$INFO_PLIST_SRC" ]; then
    echo "📄 Using template Info.plist from: $INFO_PLIST_SRC"
    cp "$INFO_PLIST_SRC" "$CONTENTS/Info.plist"
else
    echo "📄 Generating Info.plist (no template found)"
    cat > "$CONTENTS/Info.plist" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>zh_CN</string>
    <key>CFBundleDisplayName</key>
    <string>CDF Know Clow</string>
    <key>CFBundleExecutable</key>
    <string>CDFKnowClow</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>$BUNDLE_ID</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>CDF Know Clow</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$APP_VERSION</string>
    <key>CFBundleVersion</key>
    <string>$BUILD_NUMBER</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.business</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © 2026 CDF. All rights reserved.</string>
    <key>NSSupportsAutomaticTermination</key>
    <true/>
    <key>NSSupportsSuddenTermination</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLISTEOF
fi

# Update key fields regardless of template vs generated
plist_set_string_required "$CONTENTS/Info.plist" CFBundleIdentifier "$BUNDLE_ID"
plist_set_string_required "$CONTENTS/Info.plist" CFBundleShortVersionString "$APP_VERSION"
plist_set_string_required "$CONTENTS/Info.plist" CFBundleVersion "$BUILD_NUMBER"
plist_set_string_required "$CONTENTS/Info.plist" CFBundleExecutable "$PRODUCT"
plist_set_string_required "$CONTENTS/Info.plist" CFBundleIconFile "AppIcon"
plist_set_string_required "$CONTENTS/Info.plist" CFBundleName "CDF Know Clow"
plist_set_or_add_string "$CONTENTS/Info.plist" CFBundleDisplayName "CDF Know Clow"
plist_set_or_add_string "$CONTENTS/Info.plist" CDFKnowBuildTimestamp "$BUILD_TS"
plist_set_or_add_string "$CONTENTS/Info.plist" CDFKnowGitCommit "$GIT_COMMIT"
echo "✅ Info.plist ready (version=$APP_VERSION, build=$BUILD_NUMBER)"

# ===================== 8. Code signing =====================

echo "🔏 Signing app bundle..."
# Default to ad-hoc signing for dev builds; set SIGN_IDENTITY for proper codesign
ALLOW_ADHOC_SIGNING="${ALLOW_ADHOC_SIGNING:-1}" DISABLE_LIBRARY_VALIDATION="${DISABLE_LIBRARY_VALIDATION:-1}" \
    "$ROOT_DIR/scripts/codesign-mac-app.sh" "$APP_ROOT"

echo ""
echo "=== Build complete ==="
echo "App: $APP_ROOT"
echo "Size: $(du -sh "$APP_ROOT" | cut -f1)"
echo ""
echo "To run: open $APP_ROOT"
