#!/usr/bin/env bash
# drift-check.sh — Detect whether openclaw/ is still a hard fork
#
# Goal: verify the migration from "embedded hard-fork" to "git submodule /
# npm dependency" is in good shape. Warns when:
#   1. openclaw/ exists as a regular directory (not a submodule)
#   2. openclaw/ contains files that share names with files at the project
#      root (suspicious overlap / accidental shadow copies)
#   3. project root files reference openclaw/ in non-allowed ways
#
# The companion scripts are:
#   - scripts/sync-openclaw.sh   drift detection (file-level)
#   - FORK_BOUNDARY.md           architecture description
#   - openclaw-vendor-pin.json   pinned commit/version
#
# Usage:
#   scripts/drift-check.sh                # human report, exit 0/1
#   scripts/drift-check.sh --json         # machine-readable JSON
#   scripts/drift-check.sh --strict       # exit 2 on any warning
#   scripts/drift-check.sh --vendor NAME  # override vendor dir name
#
# Exit codes:
#   0  clean (submodule mode, no suspicious overlap)
#   1  warnings found (submodule exists but overlap / references present)
#   2  --strict and warnings exist
#   3  hard fork detected (openclaw/ is not a submodule)

set -euo pipefail

# ===================== Defaults =====================
VENDOR_NAME="openclaw"
JSON_OUT=0
STRICT=0

# Colors
if [[ -t 1 ]]; then
  C_RED='\033[0;31m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'
  C_BLUE='\033[0;34m'; C_BOLD='\033[1m'; C_RESET='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_BOLD=''; C_RESET=''
fi

# In JSON mode, info/ok/warn/err all become no-ops — JSON is printed at the end
if [[ $JSON_OUT -eq 0 ]]; then
  info()  { printf "${C_BLUE}ℹ${C_RESET}  %s\n" "$*"; }
  ok()    { printf "${C_GREEN}✅${C_RESET} %s\n" "$*"; }
  warn()  { printf "${C_YELLOW}⚠️${C_RESET}  %s\n" "$*"; }
  err()   { printf "${C_RED}❌${C_RESET} %s\n" "$*" >&2; }
else
  info() { :; }
  ok()   { :; }
  warn() { :; }
  err()  { :; }
fi
h1() {
  if [[ $JSON_OUT -eq 0 ]]; then
    printf "\n${C_BOLD}═══ %s ═══${C_RESET}\n" "$*"
  fi
}

# ===================== Args =====================
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)        JSON_OUT=1; shift ;;
    --strict)      STRICT=1; shift ;;
    --vendor)      VENDOR_NAME="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) err "unknown arg: $1"; exit 2 ;;
  esac
done

# ===================== Paths =====================
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/$VENDOR_NAME"
GITMODULES="$ROOT_DIR/.gitmodules"
PIN_FILE="$ROOT_DIR/${VENDOR_NAME}-vendor-pin.json"

# State accumulators
HARD_FORK=0
SUSPICIOUS_OVERLAP=0
SUSPICIOUS_REFS=0
MISSING_PIN=0
IS_SUBMODULE=0
SUBMODULE_COMMIT=""
SUBMODULE_REMOTE=""

OVERLAP_FILES=()
SUSPICIOUS_REF_FILES=()

# ===================== Header =====================
if [[ $JSON_OUT -eq 0 ]]; then
  printf "${C_BOLD}╔════════════════════════════════════════════════════════════╗${C_RESET}\n"
  printf "${C_BOLD}║  openclaw/ Drift Check — submodule vs hard fork            ║${C_RESET}\n"
  printf "${C_BOLD}╚════════════════════════════════════════════════════════════╝${C_RESET}\n"
  echo ""
  echo "  project : $ROOT_DIR"
  echo "  vendor  : $VENDOR_DIR"
fi

# ===================== 1. Does openclaw/ exist? =====================
h1 "1. Vendor directory existence"

if [[ ! -d "$VENDOR_DIR" ]]; then
  if [[ $JSON_OUT -eq 0 ]]; then
    ok "vendor dir does not exist (clean: not a fork, not a submodule)"
    echo "  no ${VENDOR_NAME}/ → either removed, or never vendored"
  fi

  if [[ $JSON_OUT -eq 1 ]]; then
    cat <<JSON
{"status":"ok","hardFork":false,"submodule":false,"suspiciousOverlap":[],"suspiciousRefs":[]}
JSON
  fi
  exit 0
fi

if [[ $JSON_OUT -eq 0 ]]; then
  info "${VENDOR_NAME}/ exists at $VENDOR_DIR"
fi

# ===================== 2. Is it a submodule? =====================
h1 "2. Submodule status"

# Method A: .gitmodules entry
if [[ -f "$GITMODULES" ]] && grep -qE "^\\[submodule \"${VENDOR_NAME}\"\\]" "$GITMODULES"; then
  IS_SUBMODULE=1
  SUBMODULE_REMOTE="$(awk -F= "/^\\[submodule \"${VENDOR_NAME}\"\\]/{f=1} f && /^[[:space:]]*url=/{gsub(/^[[:space:]]+url=/,\"\"); print; exit}" "$GITMODULES")"
  if [[ $JSON_OUT -eq 0 ]]; then
    ok ".gitmodules declares [submodule \"${VENDOR_NAME}\"]"
    echo "  remote  : $SUBMODULE_REMOTE"
  fi
else
  if [[ $JSON_OUT -eq 0 ]]; then
    warn ".gitmodules does NOT declare [submodule \"${VENDOR_NAME}\"]"
  fi
fi

# Method B: .git entry pointing to modules/<name>
GIT_MODULES_FILE="$ROOT_DIR/.git/modules/${VENDOR_NAME}"
if [[ -d "$GIT_MODULES_FILE" ]]; then
  IS_SUBMODULE=1
  # Get HEAD commit
  if [[ -f "$GIT_MODULES_FILE/HEAD" ]]; then
    HEAD_REF="$(cat "$GIT_MODULES_FILE/HEAD")"
    if [[ "$HEAD_REF" =~ ^ref:\ refs/heads/(.+)$ ]]; then
      branch="${BASH_REMATCH[1]}"
      head_file="$GIT_MODULES_FILE/refs/heads/$branch"
      if [[ -f "$head_file" ]]; then
        SUBMODULE_COMMIT="$(cat "$head_file")"
      fi
    fi
  fi
  if [[ -z "$SUBMODULE_COMMIT" && -f "$GIT_MODULES_FILE/HEAD" ]]; then
    SUBMODULE_COMMIT="$(cat "$GIT_MODULES_FILE/HEAD")"
  fi
  if [[ $JSON_OUT -eq 0 ]]; then
    ok ".git/modules/${VENDOR_NAME}/ exists (git tracks as submodule)"
    echo "  commit  : ${SUBMODULE_COMMIT:-<unknown>}"
  fi
fi

# Method C: git submodule status (definitive)
if command -v git >/dev/null 2>&1; then
  SUB_STATUS="$(cd "$ROOT_DIR" && git submodule status "$VENDOR_NAME" 2>/dev/null || true)"
  if [[ -n "$SUB_STATUS" ]]; then
    # "+SHA description" → initialized but newer commit
    # " SHA description" → initialized and matches index
    # "-SHA description" → not initialized
    # "USHA..."      → uninitialized
    case "$SUB_STATUS" in
      -*|U*)  : ;;  # not initialized
      *) IS_SUBMODULE=1
         COMMIT_FIELD="$(echo "$SUB_STATUS" | awk '{print $1}' | tr -d '+-U')"
         if [[ -n "$COMMIT_FIELD" && "$COMMIT_FIELD" != "-" ]]; then
           SUBMODULE_COMMIT="$COMMIT_FIELD"
         fi
         ;;
    esac
    if [[ $JSON_OUT -eq 0 && $IS_SUBMODULE -eq 1 ]]; then
      ok "git submodule status reports ${VENDOR_NAME} as registered"
    fi
  fi
fi

# ===================== 3. Pin file =====================
h1 "3. Vendor pin file"

if [[ -f "$PIN_FILE" ]]; then
  PIN_COMMIT="$(node -p "try { require('./${VENDOR_NAME}-vendor-pin.json').pinnedCommit || '' } catch(e) { '' }" 2>/dev/null || true)"
  PIN_VERSION="$(node -p "try { require('./${VENDOR_NAME}-vendor-pin.json').version || '' } catch(e) { '' }" 2>/dev/null || true)"
  if [[ $JSON_OUT -eq 0 ]]; then
    ok "pin file present: ${VENDOR_NAME}-vendor-pin.json"
    echo "  pinnedCommit : ${PIN_COMMIT:-<missing>}"
    echo "  version      : ${PIN_VERSION:-<missing>}"
  fi
else
  MISSING_PIN=1
  if [[ $JSON_OUT -eq 0 ]]; then
    warn "pin file missing: ${VENDOR_NAME}-vendor-pin.json"
  fi
fi

# ===================== 4. Hard fork verdict =====================
h1 "4. Verdict: hard fork vs submodule"

if [[ $IS_SUBMODULE -eq 1 ]]; then
  if [[ $JSON_OUT -eq 0 ]]; then
    ok "${VENDOR_NAME}/ is a git submodule — NOT a hard fork"
  fi
else
  HARD_FORK=1
  err "${VENDOR_NAME}/ is NOT a submodule — looks like a hard fork!"
  err "        (no .gitmodules entry AND no .git/modules/${VENDOR_NAME}/)"
  if [[ $JSON_OUT -eq 0 ]]; then
    echo ""
    echo "  Recommended fix:"
    echo "    1. Add [submodule \"${VENDOR_NAME}\"] to .gitmodules"
    echo "    2. Run: git submodule add <remote> ${VENDOR_NAME}"
    echo "    3. Or remove the directory and use an npm dependency instead"
  fi
fi

# ===================== 5. Suspicious overlap =====================
h1 "5. Suspicious file overlap"

# Find files at project root (not in vendor) whose basename also appears
# directly under vendor/. This is a heuristic for "accidental shadow copies"
# or files duplicated by mistake.
if [[ -d "$VENDOR_DIR" ]]; then
  # Top-level files in project root
  while IFS= read -r f; do
    base="$(basename "$f")"
    # Skip obvious non-source artifacts
    case "$base" in
      .git*|.gitignore|.gitmodules|.gitattributes|.editorconfig|.eslint*|\
      .prettier*|.npmrc|.nvmrc|.DS_Store|.cdf-know-clow*|\
      LICENSE|README*|CHANGELOG*|package*.json|tsconfig*.json)
        continue ;;
    esac
    # Look for any file with the same basename anywhere in vendor/ (top 2 levels)
    if find "$VENDOR_DIR" -maxdepth 2 -type f -name "$base" 2>/dev/null | grep -q .; then
      OVERLAP_FILES+=("$base")
    fi
  done < <(find "$ROOT_DIR" -maxdepth 1 -type f 2>/dev/null)
fi

if [[ ${#OVERLAP_FILES[@]} -eq 0 ]]; then
  if [[ $JSON_OUT -eq 0 ]]; then
    ok "no basename overlap between project root and ${VENDOR_NAME}/"
  fi
else
  SUSPICIOUS_OVERLAP=1
  if [[ $JSON_OUT -eq 0 ]]; then
    warn "found ${#OVERLAP_FILES[@]} basename(s) shared between root and ${VENDOR_NAME}/:"
    for f in "${OVERLAP_FILES[@]}"; do
      echo "    $f"
    done
  fi
fi

# ===================== 6. OpenClaw references in root =====================
h1 "6. openclaw references in project files"

# Find non-doc references to "openclaw" outside of the vendor dir.
# We allow: docs/, FORK_BOUNDARY.md, openclaw-vendor-pin.json, .gitmodules
ALLOW_REGEX='(openclaw-vendor-pin\.json|FORK_BOUNDARY\.md|\.gitmodules|^|/docs/|README\.md|CHANGELOG\.md|\.md:|\.markdown$)'

# Grep root-level config files and src/ for bare references
ROOT_REFS=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  # Skip the vendor dir itself
  case "$f" in
    "$VENDOR_DIR"/*|"$VENDOR_DIR") continue ;;
  esac
  # Skip obvious allow-list
  base="$(basename "$f")"
  case "$base" in
    openclaw-vendor-pin.json|FORK_BOUNDARY.md|*.md) continue ;;
  esac
  # Use ripgrep if available, else fall back
  if command -v rg >/dev/null 2>&1; then
    if rg -l --no-messages '\bopenclaw\b' "$f" >/dev/null 2>&1; then
      # Skip if mention is in a comment-like line about the submodule (best-effort)
      if ! rg -q 'openclaw\s*submodule' "$f" 2>/dev/null; then
        ROOT_REFS+=("$f")
      fi
    fi
  else
    if grep -lE '\bopenclaw\b' "$f" >/dev/null 2>&1; then
      if ! grep -qE 'openclaw[[:space:]]*submodule' "$f" 2>/dev/null; then
        ROOT_REFS+=("$f")
      fi
    fi
  fi
done < <(find "$ROOT_DIR" -maxdepth 2 -type f \
            ! -path "$VENDOR_DIR/*" \
            ! -path "$ROOT_DIR/node_modules/*" \
            ! -path "$ROOT_DIR/dist/*" \
            ! -path "$ROOT_DIR/dist-app/*" \
            ! -path "$ROOT_DIR/release/*" \
            ! -path "$ROOT_DIR/.git/*" \
            ! -path "$ROOT_DIR/coverage/*" 2>/dev/null | head -200)

if [[ ${#ROOT_REFS[@]} -eq 0 ]]; then
  if [[ $JSON_OUT -eq 0 ]]; then
    ok "no bare 'openclaw' references in root-level files"
  fi
else
  SUSPICIOUS_REFS=1
  if [[ $JSON_OUT -eq 0 ]]; then
    warn "found ${#ROOT_REFS[@]} root file(s) referencing 'openclaw' (review needed):"
    for f in "${ROOT_REFS[@]}"; do
      rel="${f#$ROOT_DIR/}"
      echo "    $rel"
    done
  fi
fi

# ===================== 7. Recommendations =====================
h1 "7. Recommendations"

RECS=()
if [[ $HARD_FORK -eq 1 ]]; then
  RECS+=("Convert ${VENDOR_NAME}/ to a git submodule (.gitmodules + git submodule add)")
  RECS+=("Or replace with an npm dependency: npm i <upstream-package>")
fi
if [[ $MISSING_PIN -eq 1 ]]; then
  RECS+=("Add ${VENDOR_NAME}-vendor-pin.json with pinnedCommit and version")
fi
if [[ $SUSPICIOUS_OVERLAP -eq 1 ]]; then
  RECS+=("Resolve overlapping basenames between root and ${VENDOR_NAME}/")
fi
if [[ $SUSPICIOUS_REFS -eq 1 ]]; then
  RECS+=("Replace direct 'openclaw' imports with @cdf-know/* workspace packages")
fi
if [[ ${#RECS[@]} -eq 0 ]]; then
  if [[ $JSON_OUT -eq 0 ]]; then
    ok "no action required — fork boundary is clean"
  fi
else
  if [[ $JSON_OUT -eq 0 ]]; then
    echo "  Suggested next steps:"
    for r in "${RECS[@]}"; do
      echo "    • $r"
    done
    echo ""
    echo "  Helper commands:"
    echo "    bash scripts/sync-openclaw.sh --ref ../cdfknow"
    echo "    bash scripts/sync-openclaw.sh --fail-on-drift   # CI gate"
  fi
fi

# ===================== JSON output =====================
if [[ $JSON_OUT -eq 1 ]]; then
  STATUS="ok"
  if [[ $HARD_FORK -eq 1 ]]; then STATUS="hard-fork"
  elif [[ $SUSPICIOUS_OVERLAP -eq 1 || $SUSPICIOUS_REFS -eq 1 || $MISSING_PIN -eq 1 ]]; then
    STATUS="warnings"
  fi

  printf '{\n'
  printf '  "status": "%s",\n' "$STATUS"
  printf '  "vendor": "%s",\n' "$VENDOR_DIR"
  printf '  "submodule": %s,\n' "$IS_SUBMODULE"
  printf '  "hardFork": %s,\n' "$HARD_FORK"
  printf '  "missingPin": %s,\n' "$MISSING_PIN"
  printf '  "suspiciousOverlap": %s,\n' "$SUSPICIOUS_OVERLAP"
  printf '  "suspiciousRefs": %s,\n' "$SUSPICIOUS_REFS"
  printf '  "submoduleCommit": "%s",\n' "$SUBMODULE_COMMIT"
  printf '  "submoduleRemote": "%s",\n' "$SUBMODULE_REMOTE"
  printf '  "overlapFiles": ['
  first=1
  for f in "${OVERLAP_FILES[@]}"; do
    if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
    printf '"%s"' "$f"
  done
  printf '],\n  "referenceFiles": ['
  first=1
  for f in "${ROOT_REFS[@]}"; do
    if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
    rel="${f#$ROOT_DIR/}"
    printf '"%s"' "$rel"
  done
  printf ']\n}\n'
fi

# ===================== Exit code =====================
if [[ $HARD_FORK -eq 1 ]]; then
  exit 3
fi
if [[ $SUSPICIOUS_OVERLAP -eq 1 || $SUSPICIOUS_REFS -eq 1 || $MISSING_PIN -eq 1 ]]; then
  if [[ $STRICT -eq 1 ]]; then
    exit 2
  fi
  exit 1
fi
exit 0
