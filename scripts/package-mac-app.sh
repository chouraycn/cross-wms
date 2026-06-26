#!/usr/bin/env bash
set -euo pipefail

# Build and package CDF Know Clow into a .app bundle
# Outputs to dist-app/CDFKnowClow.app

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_ROOT="$ROOT_DIR/dist-app/CDFKnowClow.app"
CONTENTS="$APP_ROOT/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RESOURCES_DIR="$CONTENTS/Resources"
BUILD_CONFIG="${BUILD_CONFIG:-release}"
APP_VERSION="${APP_VERSION:-$(cd "$ROOT_DIR" && node -p "require('./package.json').version")}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
BUNDLE_ID="${BUNDLE_ID:-com.cdf.knowclow.desktop}"

echo "=== Building CDF Know Clow macOS app ==="
echo "Version: $APP_VERSION"
echo "Config: $BUILD_CONFIG"
echo ""

# Clean previous build
rm -rf "$APP_ROOT"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# 1. Build Swift app
echo "[1/6] Building Swift app..."
cd "$ROOT_DIR/apps/macos"
if [ "$BUILD_CONFIG" = "release" ]; then
    swift build --disable-sandbox -c release
    SWIFT_BIN="$(swift build --disable-sandbox -c release --show-bin-path)/CDFKnowClow"
else
    swift build --disable-sandbox
    SWIFT_BIN="$(swift build --disable-sandbox --show-bin-path)/CDFKnowClow"
fi
cp "$SWIFT_BIN" "$MACOS_DIR/CDFKnowClow"
echo "✅ Swift app built"

# 2. Copy app icon
echo "[2/6] Copying app icon..."
ICON_PATH="$ROOT_DIR/apps/macos/Icon.icon/AppIcon.icns"
if [ -f "$ICON_PATH" ]; then
    cp "$ICON_PATH" "$RESOURCES_DIR/AppIcon.icns"
    echo "✅ App icon copied"
else
    echo "⚠️  App icon not found: $ICON_PATH"
fi

# 3. Build frontend
echo "[3/6] Building frontend..."
cd "$ROOT_DIR"
npm run build
mkdir -p "$RESOURCES_DIR/frontend_dist"
cp -R dist/* "$RESOURCES_DIR/frontend_dist/"
echo "✅ Frontend built"

# 4. Build server bundle
echo "[4/6] Building server bundle..."
SERVER_DIST="$RESOURCES_DIR/server"
mkdir -p "$SERVER_DIST"

cp -R server/* "$SERVER_DIST/"
cp package.json "$SERVER_DIST/"
cp package-lock.json "$SERVER_DIST/" 2>/dev/null || true

cd "$SERVER_DIST"
npm install --production --omit=dev 2>/dev/null || npm install --production || true
cd "$ROOT_DIR"
echo "✅ Server bundle built"

# 5. Create Info.plist
echo "[5/6] Creating Info.plist..."
cat > "$CONTENTS/Info.plist" <<EOF
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
EOF
echo "✅ Info.plist created"

# 6. Code signing (ad-hoc if no identity)
echo "[6/6] Code signing..."
if command -v codesign >/dev/null 2>&1; then
    SIGN_IDENTITY="${SIGN_IDENTITY:-}"
    if [ -z "$SIGN_IDENTITY" ]; then
        # Try to find a signing identity
        SIGN_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null | grep -o '"[^"]*"' | head -1 | tr -d '"' || true)
    fi

    if [ -n "$SIGN_IDENTITY" ]; then
        echo "Signing with identity: $SIGN_IDENTITY"
        codesign --force --deep --sign "$SIGN_IDENTITY" "$APP_ROOT"
        echo "✅ App signed"
    else
        echo "No signing identity found, ad-hoc signing..."
        codesign --force --deep --sign - "$APP_ROOT" 2>/dev/null || true
        echo "⚠️  Ad-hoc signed (TCC permissions won't persist)"
    fi
else
    echo "⚠️  codesign not found, skipping"
fi

echo ""
echo "=== Build complete ==="
echo "App: $APP_ROOT"
echo "Size: $(du -sh "$APP_ROOT" | cut -f1)"
echo ""
echo "To run: open $APP_ROOT"
