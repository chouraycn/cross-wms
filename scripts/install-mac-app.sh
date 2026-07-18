#!/usr/bin/env bash
# install-mac-app.sh — Install CrossWms macOS .app bundle
#
# Two installation modes:
#   1. Symlink to ~/Applications/CrossWms.app  → points at release/CrossWms.app
#      (fast for development; updates reflect immediately on rebuild)
#   2. Copy to /Applications/CrossWms.app      → production-style install
#      (requires admin / sudo; survives rebuilds of release/)
#
# After install, runs `codesign -dv` to verify signing state and prints
# a final summary with the resolved install path and next-step hints.
#
# Usage:
#   scripts/install-mac-app.sh                 # symlink mode (default, ~/Applications)
#   scripts/install-mac-app.sh --copy          # copy to /Applications (may need sudo)
#   scripts/install-mac-app.sh --copy --sudo    # force sudo for copy
#   scripts/install-mac-app.sh --target USER    # symlink to ~/Applications (default)
#   scripts/install-mac-app.sh --target SYSTEM  # copy to /Applications
#   scripts/install-mac-app.sh --app release/CrossWms.app
#
# Env:
#   APP_NAME        override app bundle name (default: CrossWms)
#   APP_SOURCE      override source .app path (auto-detected if unset)
#   SKIP_CODESIGN=1 skip codesign verification
#
# Exit codes:
#   0  install + verify OK
#   1  source bundle missing
#   2  install operation failed (permission denied, copy failed, …)
#   3  codesign verification failed (only when --strict-verify)

set -euo pipefail

# ===================== Defaults =====================

APP_NAME="${APP_NAME:-CrossWms}"
TARGET="USER"        # USER (~/Applications) or SYSTEM (/Applications)
MODE="symlink"       # symlink | copy
USE_SUDO=0
STRICT_VERIFY=0
APP_SOURCE="${APP_SOURCE:-}"

# Colors
if [[ -t 1 ]]; then
  C_RED='\033[0;31m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'
  C_BLUE='\033[0;34m'; C_BOLD='\033[1m'; C_RESET='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_BOLD=''; C_RESET=''
fi

info()    { printf "${C_BLUE}ℹ${C_RESET}  %s\n" "$*"; }
ok()      { printf "${C_GREEN}✅${C_RESET} %s\n" "$*"; }
warn()    { printf "${C_YELLOW}⚠️${C_RESET}  %s\n" "$*"; }
err()     { printf "${C_RED}❌${C_RESET} %s\n" "$*" >&2; }
section() { printf "\n${C_BOLD}── %s ──${C_RESET}\n" "$*"; }

# ===================== Help =====================
print_help() {
  sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'USAGE'

Options:
  --copy                Copy .app to /Applications instead of symlinking to ~/Applications
  --sudo                Prepend sudo to copy operations
  --target USER|SYSTEM  Choose target dir explicitly (overrides --copy)
  --app PATH            Path to source .app bundle (auto-detected if omitted)
  --strict-verify       Treat codesign verification failure as exit 3
  -h, --help            Show this help

Examples:
  scripts/install-mac-app.sh
  scripts/install-mac-app.sh --copy --sudo
  scripts/install-mac-app.sh --app release/CrossWms.app --target SYSTEM
USAGE
}

# ===================== Args =====================
while [[ $# -gt 0 ]]; do
  case "$1" in
    --copy)         MODE="copy"; TARGET="SYSTEM"; shift ;;
    --sudo)         USE_SUDO=1; shift ;;
    --target)       TARGET="$2"; shift 2 ;;
    --app)          APP_SOURCE="$2"; shift 2 ;;
    --strict-verify) STRICT_VERIFY=1; shift ;;
    -h|--help)      print_help; exit 0 ;;
    *) err "unknown arg: $1"; print_help; exit 2 ;;
  esac
done

# ===================== Resolve source =====================
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

detect_source() {
  local candidates=(
    "$ROOT_DIR/release/${APP_NAME}.app"
    "$ROOT_DIR/dist-app/${APP_NAME}.app"
    "$ROOT_DIR/release/CDFKnowClow.app"
    "$ROOT_DIR/dist-app/CDFKnowClow.app"
    "$ROOT_DIR/${APP_NAME}.app"
  )
  for c in "${candidates[@]}"; do
    [[ -d "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}

if [[ -z "$APP_SOURCE" ]]; then
  if ! APP_SOURCE="$(detect_source)"; then
    err "could not find ${APP_NAME}.app in release/, dist-app/, or project root"
    err "build it first: bash scripts/package-mac-app.sh"
    exit 1
  fi
fi

if [[ ! -d "$APP_SOURCE" ]]; then
  err "source bundle not found: $APP_SOURCE"
  exit 1
fi

APP_SOURCE="$(cd "$APP_SOURCE" && pwd)"   # absolute

# ===================== Resolve target =====================
case "$TARGET" in
  USER)
    TARGET_DIR="$HOME/Applications"
    TARGET_PATH="$TARGET_DIR/${APP_NAME}.app"
    ;;
  SYSTEM)
    TARGET_DIR="/Applications"
    TARGET_PATH="$TARGET_DIR/${APP_NAME}.app"
    ;;
  *)
    err "invalid --target: $TARGET (use USER or SYSTEM)"
    exit 2
    ;;
esac

# ===================== Run =====================
echo ""
printf "${C_BOLD}╔════════════════════════════════════════════════════════════╗${C_RESET}\n"
printf "${C_BOLD}║  CrossWms macOS .app installer                              ║${C_RESET}\n"
printf "${C_BOLD}╚════════════════════════════════════════════════════════════╝${C_RESET}\n"
echo ""

section "Source"
echo "  path : $APP_SOURCE"
echo "  size : $(du -sh "$APP_SOURCE" | cut -f1)"

section "Target"
echo "  mode : $MODE"
echo "  dir  : $TARGET_DIR"
echo "  path : $TARGET_PATH"

# Make sure target dir exists
if [[ ! -d "$TARGET_DIR" ]]; then
  info "creating target dir: $TARGET_DIR"
  if [[ "$TARGET" == "SYSTEM" && $USE_SUDO -eq 0 ]]; then
    warn "/Applications is system-owned; you may need --sudo to create subdirs"
  fi
  if $USE_SUDO; then
    sudo mkdir -p "$TARGET_DIR"
  else
    mkdir -p "$TARGET_DIR" || {
      err "failed to create $TARGET_DIR (try --sudo for SYSTEM target)"
      exit 2
    }
  fi
fi

# Remove stale target (symlink, dir, or file)
if [[ -e "$TARGET_PATH" || -L "$TARGET_PATH" ]]; then
  info "removing existing target: $TARGET_PATH"
  if [[ "$TARGET" == "SYSTEM" && ! -w "$TARGET_DIR" ]]; then
    sudo rm -rf "$TARGET_PATH"
  else
    rm -rf "$TARGET_PATH"
  fi
fi

# Perform install
section "Install"
if [[ "$MODE" == "symlink" ]]; then
  if ln -s "$APP_SOURCE" "$TARGET_PATH"; then
    ok "symlink created: $TARGET_PATH -> $APP_SOURCE"
  else
    err "symlink failed"
    exit 2
  fi
else
  if $USE_SUDO; then
    if sudo cp -R "$APP_SOURCE" "$TARGET_PATH"; then
      ok "copied to $TARGET_PATH (with sudo)"
    else
      err "copy failed (sudo)"
      exit 2
    fi
  else
    if cp -R "$APP_SOURCE" "$TARGET_PATH" 2>/dev/null; then
      ok "copied to $TARGET_PATH"
    else
      warn "copy failed (permission denied); re-run with --sudo"
      exit 2
    fi
  fi
fi

# ===================== Codesign verification =====================
if [[ "${SKIP_CODESIGN:-0}" == "1" ]]; then
  section "Codesign verify"
  warn "SKIP_CODESIGN=1, skipping verification"
else
  section "Codesign verify"
  if ! command -v codesign >/dev/null 2>&1; then
    warn "codesign not found (not on macOS?) — skipping"
  else
    if codesign -dv "$TARGET_PATH" >/tmp/codesign-verify.log 2>&1; then
      IDENTITY="$(codesign -dv "$TARGET_PATH" 2>&1 | awk -F= '/^Identifier=/ {print $2}' | head -1)"
      TEAM="$(codesign -dv "$TARGET_PATH" 2>&1 | awk -F= '/^TeamIdentifier=/ {print $2}' | head -1)"
      SIGN_TYPE="$(codesign -dv "$TARGET_PATH" 2>&1 | awk -F= '/^Signature=/ {print $2}' | head -1)"
      ok "codesign verification OK"
      echo "  identifier : ${IDENTITY:-<unknown>}"
      echo "  team       : ${TEAM:-<none / ad-hoc>}"
      echo "  signature  : ${SIGN_TYPE:-<unknown>}"
    else
      warn "codesign verification reported issues:"
      sed 's/^/    /' /tmp/codesign-verify.log
      if [[ $STRICT_VERIFY -eq 1 ]]; then
        err "--strict-verify set, failing"
        exit 3
      fi
    fi
    rm -f /tmp/codesign-verify.log
  fi
fi

# ===================== Summary =====================
section "Summary"
printf "  ${C_BOLD}Install path${C_RESET} : %s\n" "$TARGET_PATH"
printf "  ${C_BOLD}Source${C_RESET}       : %s\n" "$APP_SOURCE"
if [[ "$MODE" == "symlink" ]]; then
  printf "  ${C_BOLD}Mode${C_RESET}         : symlink (rebuilds reflect immediately)\n"
else
  printf "  ${C_BOLD}Mode${C_RESET}         : copy (re-run after each build)\n"
fi
echo ""

printf "${C_BOLD}Next steps:${C_RESET}\n"
echo "  • Launch:    open \"$TARGET_PATH\""
echo "  • Reveal:    open -R \"$TARGET_PATH\""
echo "  • Uninstall: rm -rf \"$TARGET_PATH\""
echo ""
ok "install complete"
exit 0
