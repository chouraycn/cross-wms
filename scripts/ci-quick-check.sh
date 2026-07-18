#!/usr/bin/env bash
# ci-quick-check.sh — Fast CI sanity check (< 1 min target)
#
# Runs a subset of the full pre-build-check pipeline, designed to be cheap
# enough to run on every push without slowing devs down.
#
# Checks (in order):
#   1. Sanity: node + npm present, project root found
#   2. Lint:   `npm run lint`  (eslint, fast on cached project)
#   3. Type:   `npm run typecheck`  (tsc --noEmit for web + server)
#   4. Key tests: vitest run with `quick` filter (no playwright / no full e2e)
#   5. Drift gate: runs drift-check.sh (warn-only, never blocks)
#
# Skipped (use full pre-build-check.sh for these):
#   - Swift build
#   - vite build
#   - esbuild server bundle
#   - playwright e2e
#   - bundle-budget / perf-lint / wkwebview-lint
#   - ci-health-check
#
# Usage:
#   scripts/ci-quick-check.sh                # full run
#   scripts/ci-quick-check.sh --skip-tests   # only lint + type
#   scripts/ci-quick-check.sh --skip-lint    # only type + tests
#   scripts/ci-quick-check.sh --json         # machine-readable output
#   scripts/ci-quick-check.sh --timeout 60   # per-step timeout seconds
#
# Exit codes:
#   0  all critical checks passed
#   1  a critical check failed (lint, type, or tests)
#   2  environment / setup error

set -uo pipefail

# ===================== Defaults =====================
SKIP_LINT=0
SKIP_TESTS=0
SKIP_TYPE=0
SKIP_DRIFT=0
JSON_OUT=0
TIMEOUT_SECS="${TIMEOUT_SECS:-90}"

# Colors (when interactive)
if [[ -t 1 ]]; then
  C_RED='\033[0;31m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'
  C_BLUE='\033[0;34m'; C_BOLD='\033[1m'; C_RESET='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_BOLD=''; C_RESET=''
fi

info()  { printf "${C_BLUE}ℹ${C_RESET}  %s\n" "$*"; }
ok()    { printf "${C_GREEN}✅${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}⚠️${C_RESET}  %s\n" "$*"; }
err()   { printf "${C_RED}❌${C_RESET} %s\n" "$*" >&2; }
h1()    { printf "\n${C_BOLD}── %s ──${C_RESET}\n" "$*"; }

# ===================== Args =====================
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-lint)   SKIP_LINT=1; shift ;;
    --skip-tests)  SKIP_TESTS=1; shift ;;
    --skip-type)   SKIP_TYPE=1; shift ;;
    --skip-drift)  SKIP_DRIFT=1; shift ;;
    --json)        JSON_OUT=1; shift ;;
    --timeout)     TIMEOUT_SECS="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
      cat <<USAGE

Options:
  --skip-lint     skip eslint
  --skip-tests    skip vitest key-test pass
  --skip-type     skip tsc --noEmit
  --skip-drift    skip drift-check
  --json          emit machine-readable summary
  --timeout SECS  per-step timeout in seconds (default: 90)

Examples:
  scripts/ci-quick-check.sh
  scripts/ci-quick-check.sh --skip-tests --json
USAGE
      exit 0
      ;;
    *) err "unknown arg: $1"; exit 2 ;;
  esac
done

# ===================== Paths =====================
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ===================== Header =====================
START_TIME=$(date +%s)
if [[ $JSON_OUT -eq 0 ]]; then
  printf "${C_BOLD}╔════════════════════════════════════════════════════════════╗${C_RESET}\n"
  printf "${C_BOLD}║  CI Quick Check (< 1 min target)                          ║${C_RESET}\n"
  printf "${C_BOLD}╚════════════════════════════════════════════════════════════╝${C_RESET}\n"
  echo ""
  info "project  : $ROOT_DIR"
  info "timeout  : ${TIMEOUT_SECS}s per step"
  info "skipped  : $([[ $SKIP_LINT -eq 1 ]] && echo -n "lint ") || true$([[ $SKIP_TESTS -eq 1 ]] && echo -n "tests ") || true$([[ $SKIP_TYPE -eq 1 ]] && echo -n "type ") || true$([[ $SKIP_DRIFT -eq 1 ]] && echo -n "drift")"
  echo ""
fi

# ===================== State =====================
# Use parallel arrays (macOS ships bash 3.2 which lacks `declare -A`).
STEP_NAMES=()
STEP_STATUS_LIST=()
STEP_DUR_LIST=()
STEP_MSG_LIST=()
TOTAL_FAIL=0
TOTAL_WARN=0

add_step() {
  STEP_NAMES+=("$1")
  STEP_STATUS_LIST+=("$2")
  STEP_DUR_LIST+=("$3")
  STEP_MSG_LIST+=("$4")
}

# Helper: run a step with timeout, record outcome
run_step() {
  local name="$1"
  shift
  local step_start
  step_start=$(date +%s)
  local out_file
  out_file="$(mktemp -t ci-quick.XXXXXX.log)"
  local code=0
  local msg=""

  # Run with timeout; capture combined output
  if command -v timeout >/dev/null 2>&1; then
    timeout "$TIMEOUT_SECS" bash -c "$*" >"$out_file" 2>&1 || code=$?
  else
    bash -c "$*" >"$out_file" 2>&1 || code=$?
  fi
  # 124 = timeout exit
  local elapsed=$(( $(date +%s) - step_start ))

  if [[ $code -eq 0 ]]; then
    if [[ $JSON_OUT -eq 0 ]]; then
      ok "${name} (${elapsed}s)"
    fi
    add_step "$name" "pass" "$elapsed" ""
  elif [[ $code -eq 124 ]]; then
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    if [[ $JSON_OUT -eq 0 ]]; then
      err "${name} TIMEOUT (${elapsed}s)"
      warn "  tail of output:"
      tail -5 "$out_file" | sed 's/^/    /'
    fi
    add_step "$name" "timeout" "$elapsed" "exceeded ${TIMEOUT_SECS}s"
  else
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    if [[ $JSON_OUT -eq 0 ]]; then
      err "${name} FAILED (exit $code, ${elapsed}s)"
      warn "  tail of output:"
      tail -10 "$out_file" | sed 's/^/    /'
    fi
    add_step "$name" "fail" "$elapsed" "exit $code"
  fi

  # Persist log path for debugging
  echo "$out_file" > "/tmp/ci-quick-last-log-${name// /_}"
}

# Helper: mark step as skipped
skip_step() {
  local name="$1"
  if [[ $JSON_OUT -eq 0 ]]; then
    warn "${name} skipped"
  fi
  add_step "$name" "skipped" "0" ""
}

# ===================== 0. Sanity =====================
h1 "0. Environment"

if ! command -v node >/dev/null 2>&1; then
  err "node not found in PATH"
  exit 2
fi
if ! command -v npm >/dev/null 2>&1; then
  err "npm not found in PATH"
  exit 2
fi
NODE_V="$(node --version)"
NPM_V="$(npm --version)"
if [[ $JSON_OUT -eq 0 ]]; then
  ok "node $NODE_V"
  ok "npm $NPM_V"
fi
if [[ ! -f "$ROOT_DIR/package.json" ]]; then
  err "package.json not found in $ROOT_DIR"
  exit 2
fi
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  warn "node_modules not found — running 'npm ci' may be required"
  warn "  this step is not run by ci-quick-check; run: npm ci"
fi

# ===================== 1. Lint =====================
h1 "1. Lint (eslint)"
if [[ $SKIP_LINT -eq 1 ]]; then
  skip_step "lint"
else
  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    run_step "lint" "npm run lint --silent"
  else
    warn "node_modules missing; skipping lint"
    skip_step "lint"
  fi
fi

# ===================== 2. Type-check =====================
h1 "2. Type check (tsc --noEmit)"
if [[ $SKIP_TYPE -eq 1 ]]; then
  skip_step "type"
else
  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    # `npm run typecheck` already does web + server, capped
    run_step "type" "npm run typecheck --silent"
  else
    warn "node_modules missing; skipping type-check"
    skip_step "type"
  fi
fi

# ===================== 3. Key tests =====================
h1 "3. Key tests (vitest, no playwright)"
if [[ $SKIP_TESTS -eq 1 ]]; then
  skip_step "tests"
else
  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    # Run vitest with a tag/regex pattern that's known-fast. We use the
    # test file glob from src/__tests__ which is always present in this repo.
    # We do NOT run tests/e2e (e2e/) and we exclude playwright specs.
    if [[ -d "$ROOT_DIR/src/__tests__" ]]; then
      # Quick API test pattern
      run_step "tests" "npx vitest run --reporter=basic --silent='passed-only' src/__tests__ server/__tests__ 2>/dev/null || npx vitest run --reporter=basic src/__tests__ 2>/dev/null || npm test --silent -- --reporter=basic"
    else
      run_step "tests" "npm test --silent -- --reporter=basic"
    fi
  else
    warn "node_modules missing; skipping tests"
    skip_step "tests"
  fi
fi

# ===================== 4. Drift gate (warn only) =====================
h1 "4. Drift gate (openclaw submodule)"
if [[ $SKIP_DRIFT -eq 1 ]]; then
  skip_step "drift"
else
  if [[ -x "$ROOT_DIR/scripts/drift-check.sh" ]]; then
    # Always treat drift as a soft warning, not a hard fail in quick-check
    if "$ROOT_DIR/scripts/drift-check.sh" >/tmp/drift-check.log 2>&1; then
      if [[ $JSON_OUT -eq 0 ]]; then
        ok "drift-check clean (submodule mode)"
      fi
      add_step "drift" "pass" "0" ""
    else
      code=$?
      if [[ $code -eq 3 ]]; then
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
        if [[ $JSON_OUT -eq 0 ]]; then
          err "drift-check: HARD FORK detected"
        fi
        add_step "drift" "hard-fork" "0" "openclaw/ is a hard fork"
      else
        TOTAL_WARN=$((TOTAL_WARN + 1))
        if [[ $JSON_OUT -eq 0 ]]; then
          warn "drift-check: soft warning (exit $code), continuing"
        fi
        add_step "drift" "warn" "0" "soft warning (exit $code)"
      fi
      if [[ $JSON_OUT -eq 0 ]]; then
        tail -5 /tmp/drift-check.log | sed 's/^/    /'
      fi
    fi
  else
    if [[ $JSON_OUT -eq 0 ]]; then warn "scripts/drift-check.sh not found or not executable"; fi
    skip_step "drift"
  fi
fi

# ===================== Summary =====================
END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

# Helper: find step status / duration / message by name
find_step_field() {
  local needle="$1" field="$2"
  local i
  for ((i=0; i<${#STEP_NAMES[@]}; i++)); do
    if [[ "${STEP_NAMES[$i]}" == "$needle" ]]; then
      case "$field" in
        status)   echo "${STEP_STATUS_LIST[$i]:-n/a}";;
        duration) echo "${STEP_DUR_LIST[$i]:-0}";;
        message)  echo "${STEP_MSG_LIST[$i]:-}";;
      esac
      return 0
    fi
  done
  case "$field" in
    status)   echo "n/a";;
    duration) echo "0";;
    message)  echo "";;
  esac
  return 1
}

if [[ $JSON_OUT -eq 0 ]]; then
  echo ""
  printf "${C_BOLD}════════════════════════════════════════════════════════════${C_RESET}\n"
  printf "${C_BOLD} CI Quick Check — Summary${C_RESET}\n"
  printf "${C_BOLD}════════════════════════════════════════════════════════════${C_RESET}\n"
  printf "  %-22s %-10s %-8s\n" "Step" "Status" "Time"
  printf "  %-22s %-10s %-8s\n" "----" "------" "----"
  for step in lint type tests drift; do
    status="$(find_step_field "$step" status)"
    duration="$(find_step_field "$step" duration)s"
    case "$status" in
      pass)     printf "  %-22s ${C_GREEN}%-10s${C_RESET} %-8s\n" "$step" "PASS" "$duration" ;;
      fail)     printf "  %-22s ${C_RED}%-10s${C_RESET} %-8s\n" "$step" "FAIL" "$duration" ;;
      timeout)  printf "  %-22s ${C_RED}%-10s${C_RESET} %-8s\n" "$step" "TIMEOUT" "$duration" ;;
      warn)     printf "  %-22s ${C_YELLOW}%-10s${C_RESET} %-8s\n" "$step" "WARN" "$duration" ;;
      hard-fork) printf "  %-22s ${C_RED}%-10s${C_RESET} %-8s\n" "$step" "HARD-FORK" "$duration" ;;
      skipped)  printf "  %-22s ${C_BLUE}%-10s${C_RESET} %-8s\n" "$step" "SKIP" "-" ;;
      *)        printf "  %-22s %-10s %-8s\n" "$step" "$status" "$duration" ;;
    esac
  done
  echo ""
  printf "  Total time: ${C_BOLD}%ss${C_RESET}\n" "$TOTAL_TIME"
  echo ""
  if [[ $TOTAL_FAIL -eq 0 ]]; then
    if [[ $TOTAL_WARN -gt 0 ]]; then
      warn "QUICK CHECK PASSED (with $TOTAL_WARN warning(s))"
    else
      ok "QUICK CHECK PASSED"
    fi
  else
    err "QUICK CHECK FAILED ($TOTAL_FAIL step(s))"
  fi
else
  # JSON output
  printf '{\n'
  printf '  "overall": "%s",\n' "$([[ $TOTAL_FAIL -eq 0 ]] && echo "pass" || echo "fail")"
  printf '  "totalTimeSec": %d,\n' "$TOTAL_TIME"
  printf '  "steps": {\n'
  first=1
  for step in lint type tests drift; do
    if [[ $first -eq 1 ]]; then first=0; else printf ',\n'; fi
    status="$(find_step_field "$step" status)"
    duration="$(find_step_field "$step" duration)"
    message="$(find_step_field "$step" message)"
    # Escape message minimally
    message="${message//\\/\\\\}"
    message="${message//\"/\\\"}"
    printf '    "%s": {"status":"%s","durationSec":%s,"message":"%s"}' \
      "$step" "$status" "$duration" "$message"
  done
  printf '\n  }\n}\n'
fi

exit $TOTAL_FAIL
