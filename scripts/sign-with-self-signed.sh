#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_ROOT="$ROOT_DIR/dist-app/CDFKnowClow.app"

if [ ! -d "$APP_ROOT" ]; then
    echo "ERROR: App bundle not found at $APP_ROOT"
    echo "Please run scripts/package-mac-app.sh first"
    exit 1
fi

if [ ! -f "$ROOT_DIR/certs/CDFKnowClow.p12" ]; then
    echo "ERROR: Self-signed certificate not found at $ROOT_DIR/certs/CDFKnowClow.p12"
    exit 1
fi

echo "🔏 Signing app bundle with self-signed certificate..."

TEMP_KEYCHAIN=$(mktemp -d)/cdf-sign.keychain
security create-keychain -p "" "$TEMP_KEYCHAIN"
security import "$ROOT_DIR/certs/CDFKnowClow.p12" -k "$TEMP_KEYCHAIN" -P 123456 -A 2>/dev/null || true
security import "$ROOT_DIR/certs/myCA.pem" -k "$TEMP_KEYCHAIN" -T /usr/bin/codesign 2>/dev/null || true
security unlock-keychain -p "" "$TEMP_KEYCHAIN"

SELF_SIGNED_IDENTITY="CDF Know Clow"

echo "Using self-signed certificate: $SELF_SIGNED_IDENTITY"

ENT_TMP_DIR=$(mktemp -d -t cdfknowclow-entitlements.XXXXXX)
ENT_TMP_APP="$ENT_TMP_DIR/app.plist"

cat > "$ENT_TMP_APP" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <true/>
    <key>com.apple.security.personal-information.location</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
PLIST

xattr -cr "$APP_ROOT" 2>/dev/null || true

sign_item() {
    codesign --force --options runtime --timestamp=none --entitlements "$ENT_TMP_APP" --sign "$SELF_SIGNED_IDENTITY" --keychain "$TEMP_KEYCHAIN" "$1"
}

sign_plain_item() {
    codesign --force --options runtime --timestamp=none --sign "$SELF_SIGNED_IDENTITY" --keychain "$TEMP_KEYCHAIN" "$1"
}

NODE_BIN="$APP_ROOT/Contents/Resources/node/bin/node"
if [ -f "$NODE_BIN" ]; then
    echo "Signing Node.js binary"; sign_plain_item "$NODE_BIN"
fi

if [ -d "$APP_ROOT/Contents/Resources" ]; then
    find "$APP_ROOT/Contents/Resources" -type f -print0 2>/dev/null | while IFS= read -r -d '' f; do
        if /usr/bin/file "$f" 2>/dev/null | /usr/bin/grep -q "Mach-O"; then
            echo "Signing binary: $f"; sign_plain_item "$f"
        fi
    done || true
fi

SPARKLE="$APP_ROOT/Contents/Frameworks/Sparkle.framework"
if [ -d "$SPARKLE" ]; then
    echo "Signing Sparkle framework"
    find "$SPARKLE" -type f -print0 2>/dev/null | while IFS= read -r -d '' f; do
        if /usr/bin/file "$f" 2>/dev/null | /usr/bin/grep -q "Mach-O"; then
            sign_plain_item "$f"
        fi
    done || true
    sign_plain_item "$SPARKLE/Versions/B"
    sign_plain_item "$SPARKLE"
fi

if [ -d "$APP_ROOT/Contents/Frameworks" ]; then
    find "$APP_ROOT/Contents/Frameworks" \( -name "*.framework" -o -name "*.dylib" \) ! -path "*Sparkle.framework*" -print0 2>/dev/null | while IFS= read -r -d '' f; do
        echo "Signing framework: $f"; sign_plain_item "$f"
    done || true
fi

MAIN_BIN="$APP_ROOT/Contents/MacOS/CDFKnowClow"
if [ -f "$MAIN_BIN" ]; then
    echo "Signing main binary"; sign_item "$MAIN_BIN"
fi

sign_item "$APP_ROOT"

rm -rf "$ENT_TMP_DIR"
security delete-keychain "$TEMP_KEYCHAIN"

echo ""
echo "✅ Self-signed certificate signing complete!"
echo ""
echo "⚠️  IMPORTANT: For persistent TCC permissions, you need to:"
echo "   1. Open Keychain Access"
echo "   2. Locate 'CDF Know Clow CA' certificate"
echo "   3. Double-click it and set 'When using this certificate' to 'Always Trust'"
echo "   4. Restart the app"
echo ""
echo "To verify the signature:"
echo "   codesign --verify --verbose=4 $APP_ROOT"
echo "   codesign -dv $APP_ROOT"