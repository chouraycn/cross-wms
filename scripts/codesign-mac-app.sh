#!/usr/bin/env bash
set -euo pipefail

# Code-sign the CDF Know Clow .app bundle with entitlements.
# Adapted from OpenClaw's codesign-mac-app.sh.
#
# Usage:
#   scripts/codesign-mac-app.sh [app-bundle]
#
# Env:
#   SIGN_IDENTITY="Apple Development: Your Name (TEAMID)"
#   ALLOW_ADHOC_SIGNING=1
#   CODESIGN_TIMESTAMP=auto|on|off
#   DISABLE_LIBRARY_VALIDATION=1      # dev-only workaround

APP_BUNDLE="${1:-dist-app/CDFKnowClow.app}"
IDENTITY="${SIGN_IDENTITY:-}"
TIMESTAMP_MODE="${CODESIGN_TIMESTAMP:-auto}"
DISABLE_LIBRARY_VALIDATION="${DISABLE_LIBRARY_VALIDATION:-0}"
ENT_TMP_DIR=""

cleanup() {
  if [[ -n "$ENT_TMP_DIR" ]]; then
    rm -rf "$ENT_TMP_DIR"
  fi
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'HELP'
Usage: scripts/codesign-mac-app.sh [app-bundle]

Env:
  SIGN_IDENTITY="Apple Development: Your Name (TEAMID)"
  ALLOW_ADHOC_SIGNING=1
  CODESIGN_TIMESTAMP=auto|on|off
  DISABLE_LIBRARY_VALIDATION=1
HELP
  exit 0
fi

if [[ "${1:-}" == "--" ]]; then
  shift
fi
if [[ "$#" -gt 0 ]]; then
  case "$1" in
    -*) echo "ERROR: Unknown codesign option: $1" >&2; exit 1 ;;
    *) APP_BUNDLE="$1"; shift ;;
  esac
fi
if [[ "$#" -gt 0 ]]; then
  echo "ERROR: Unexpected codesign argument: $1" >&2
  exit 1
fi

if [ ! -d "$APP_BUNDLE" ]; then
  echo "App bundle not found: $APP_BUNDLE" >&2
  exit 1
fi

select_identity() {
  local preferred available first

  # Prefer a Developer ID Application cert.
  preferred="$(security find-identity -p codesigning -v 2>/dev/null \
    | awk -F'\"' '/Developer ID Application/ { print $2; exit }')"

  if [ -n "$preferred" ]; then
    echo "$preferred"
    return
  fi

  # Next, try Apple Distribution.
  preferred="$(security find-identity -p codesigning -v 2>/dev/null \
    | awk -F'\"' '/Apple Distribution/ { print $2; exit }')"
  if [ -n "$preferred" ]; then
    echo "$preferred"
    return
  fi

  # Then, try Apple Development.
  preferred="$(security find-identity -p codesigning -v 2>/dev/null \
    | awk -F'\"' '/Apple Development/ { print $2; exit }')"
  if [ -n "$preferred" ]; then
    echo "$preferred"
    return
  fi

  # Fallback to the first valid signing identity.
  available="$(security find-identity -p codesigning -v 2>/dev/null \
    | sed -n 's/.*\"\\(.*\\)\"/\\1/p')"

  if [ -n "$available" ]; then
    first="$(printf '%s\n' "$available" | head -n1)"
    echo "$first"
    return
  fi

  return 1
}

if [ -z "$IDENTITY" ]; then
  if ! IDENTITY="$(select_identity)"; then
    if [[ "${ALLOW_ADHOC_SIGNING:-}" == "1" ]]; then
      echo "WARN: No signing identity found. Falling back to ad-hoc signing (-)." >&2
      echo "      !!! Ad-hoc signed apps do NOT persist TCC permissions !!!" >&2
      IDENTITY="-"
    else
      echo "ERROR: No signing identity found. Set SIGN_IDENTITY or ALLOW_ADHOC_SIGNING=1." >&2
      exit 1
    fi
  fi
fi

echo "Using signing identity: $IDENTITY"

timestamp_arg="--timestamp=none"
case "$TIMESTAMP_MODE" in
  1|on|yes|true)
    timestamp_arg="--timestamp"
    ;;
  0|off|no|false)
    timestamp_arg="--timestamp=none"
    ;;
  auto)
    if [[ "$IDENTITY" == *"Developer ID Application"* ]]; then
      timestamp_arg="--timestamp"
    fi
    ;;
  *)
    echo "ERROR: Unknown CODESIGN_TIMESTAMP: $TIMESTAMP_MODE (use auto|on|off)" >&2
    exit 1
    ;;
esac
if [[ "$IDENTITY" == "-" ]]; then
  timestamp_arg="--timestamp=none"
fi

ENT_TMP_DIR=$(mktemp -d -t cdfknowclow-entitlements.XXXXXX)
trap cleanup EXIT
ENT_TMP_APP="$ENT_TMP_DIR/app.plist"

options_args=()
if [[ "$IDENTITY" != "-" ]]; then
  options_args=("--options" "runtime")
fi
timestamp_args=("$timestamp_arg")

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
</dict>
</plist>
PLIST

if [[ "$DISABLE_LIBRARY_VALIDATION" == "1" ]]; then
  /usr/libexec/PlistBuddy -c "Add :com.apple.security.cs.disable-library-validation bool true" "$ENT_TMP_APP" >/dev/null 2>&1 || \
    /usr/libexec/PlistBuddy -c "Set :com.apple.security.cs.disable-library-validation true" "$ENT_TMP_APP"
  echo "Note: disable-library-validation entitlement enabled (DISABLE_LIBRARY_VALIDATION=1)."
fi

APP_ENTITLEMENTS="$ENT_TMP_APP"

# Clear extended attributes to avoid stale signatures
xattr -cr "$APP_BUNDLE" 2>/dev/null || true

sign_item() {
  local target="$1"
  local entitlements="$2"
  codesign --force ${options_args+"${options_args[@]}"} "${timestamp_args[@]}" --entitlements "$entitlements" --sign "$IDENTITY" "$target"
}

sign_plain_item() {
  local target="$1"
  codesign --force ${options_args+"${options_args[@]}"} "${timestamp_args[@]}" --sign "$IDENTITY" "$target"
}

# Sign bundled Node.js binary before signing the app bundle
NODE_BIN="$APP_BUNDLE/Contents/Resources/node/bin/node"
if [ -f "$NODE_BIN" ]; then
  echo "Signing Node.js binary"; sign_plain_item "$NODE_BIN"
fi

# Sign any other embedded binaries in Resources
if [ -d "$APP_BUNDLE/Contents/Resources" ]; then
  find "$APP_BUNDLE/Contents/Resources" -type f -print0 | while IFS= read -r -d '' f; do
    if /usr/bin/file "$f" | /usr/bin/grep -q "Mach-O"; then
      echo "Signing binary: $f"; sign_plain_item "$f"
    fi
  done
fi

# Sign embedded frameworks
if [ -d "$APP_BUNDLE/Contents/Frameworks" ]; then
  find "$APP_BUNDLE/Contents/Frameworks" -type d -name "*.framework" | while read -r fw; do
    echo "Signing framework: $(basename "$fw")"
    sign_plain_item "$fw"
  done
fi

# Sign main Swift binary
MAIN_BIN="$APP_BUNDLE/Contents/MacOS/CDFKnowClow"
if [ -f "$MAIN_BIN" ]; then
  echo "Signing main binary"; sign_item "$MAIN_BIN" "$APP_ENTITLEMENTS"
fi

# Finally sign the bundle
sign_item "$APP_BUNDLE" "$APP_ENTITLEMENTS"

echo "Codesign complete for $APP_BUNDLE"
