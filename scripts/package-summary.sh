#!/usr/bin/env bash
# package-summary.sh — Summarize all packages/* sub-packages
#
# For each package under packages/*, report:
#   - name / version
#   - dependencies (runtime + dev)
#   - test status (whether vitest is configured and passes a smoke run)
#   - build artifact status
#
# Output: Markdown report, suitable for release review / pasting into PRs.
# Optional --json for machine consumption, --out FILE to write to disk.
#
# Usage:
#   scripts/package-summary.sh
#   scripts/package-summary.sh --json
#   scripts/package-summary.sh --out packages-report.md
#   scripts/package-summary.sh --skip-tests   # faster, no test run
#
# Exit codes:
#   0  report generated (even if some tests failed)
#   1  invalid usage
#   2  no packages found

set -uo pipefail

# ===================== Defaults =====================
JSON_OUT=0
OUT_FILE=""
SKIP_TESTS=0
SKIP_BUILD=0

# Colors (only when stdout is a TTY and not JSON / not writing to file)
if [[ -t 1 && -z "$OUT_FILE" ]]; then
  C_RED='\033[0;31m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'
  C_BLUE='\033[0;34m'; C_BOLD='\033[1m'; C_RESET='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_BOLD=''; C_RESET=''
fi

info()  { printf "${C_BLUE}ℹ${C_RESET}  %s\n" "$*"; }
ok()    { printf "${C_GREEN}✅${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}⚠️${C_RESET}  %s\n" "$*"; }
err()   { printf "${C_RED}❌${C_RESET} %s\n" "$*" >&2; }

# ===================== Args =====================
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)        JSON_OUT=1; shift ;;
    --out)         OUT_FILE="$2"; shift 2 ;;
    --skip-tests)  SKIP_TESTS=1; shift ;;
    --skip-build)  SKIP_BUILD=1; shift ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      cat <<USAGE

Options:
  --json         emit machine-readable JSON
  --out FILE     write to file (Markdown or JSON based on --json)
  --skip-tests   do not run any tests (just static analysis)
  --skip-build   do not check build artifacts

Examples:
  scripts/package-summary.sh
  scripts/package-summary.sh --out reports/packages.md
  scripts/package-summary.sh --json --out reports/packages.json
USAGE
      exit 0
      ;;
    *) err "unknown arg: $1"; exit 1 ;;
  esac
done

# ===================== Resolve paths =====================
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages"

if [[ ! -d "$PKG_DIR" ]]; then
  err "packages directory not found: $PKG_DIR"
  exit 2
fi

# Collect package metadata
declare -a PKG_NAMES=()
declare -a PKG_VERSIONS=()
declare -a PKG_DESCS=()
declare -a PKG_MAINS=()
declare -a PKG_DEPS=()
declare -a PKG_DEVDEPS=()
declare -a PKG_TEST_STATUS=()
declare -a PKG_BUILD_STATUS=()
declare -a PKG_HOMEPAGES=()
declare -a PKG_REPOS=()

# Counters
TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
BUILDS_OK=0
BUILDS_MISSING=0

# ===================== Header (Markdown) =====================
if [[ $JSON_OUT -eq 0 ]]; then
  TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  REPO_VERSION="$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || echo "unknown")"
  GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
  GIT_BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"

  MD_HEADER="# Packages Report\n\n"
  MD_HEADER+="- **Project**: cdf-know-clow (cross-wms)\n"
  MD_HEADER+="- **Root version**: \`${REPO_VERSION}\`\n"
  MD_HEADER+="- **Branch / commit**: \`${GIT_BRANCH}\` @ \`${GIT_SHA}\`\n"
  MD_HEADER+="- **Generated**: ${TIMESTAMP}\n"
  MD_HEADER+="- **Tests run**: $(if [[ $SKIP_TESTS -eq 1 ]]; then echo "no (--skip-tests)"; else echo "yes"; fi)\n"
  MD_HEADER+="- **Build check**: $(if [[ $SKIP_BUILD -eq 1 ]]; then echo "no (--skip-build)"; else echo "yes"; fi)\n"
  MD_HEADER+="\n"
fi

# ===================== Iterate packages =====================
# Use a while loop (avoid `mapfile` which is bash 4+; macOS ships bash 3.2)
PKG_DIRS=()
while IFS= read -r d; do
  PKG_DIRS+=("$d")
done < <(find "$PKG_DIR" -maxdepth 1 -mindepth 1 -type d ! -name "contracts" | sort)

if [[ ${#PKG_DIRS[@]} -eq 0 ]]; then
  err "no packages found in $PKG_DIR"
  exit 2
fi

for pkg_path in "${PKG_DIRS[@]}"; do
  pkg_name="$(basename "$pkg_path")"
  pkg_json="$pkg_path/package.json"
  if [[ ! -f "$pkg_json" ]]; then
    continue
  fi
  TOTAL=$((TOTAL + 1))

  # Read package.json fields via node
  read_field() {
    node -e "try { const p = require('$pkg_json'); process.stdout.write(String(p['$1'] ?? '')); } catch(e) { process.stdout.write(''); }" 2>/dev/null
  }
  read_deps() {
    node -e "try { const p = require('$pkg_json'); const d = Object.assign({}, p.dependencies||{}, p.devDependencies||{}); process.stdout.write(Object.entries(d).map(([k,v]) => k+'@'+v).join(', ')); } catch(e) { process.stdout.write(''); }" 2>/dev/null
  }
  read_runtime_deps() {
    node -e "try { const p = require('$pkg_json'); const d = p.dependencies||{}; process.stdout.write(Object.entries(d).map(([k,v]) => k+'@'+v).join(', ')); } catch(e) { process.stdout.write(''); }" 2>/dev/null
  }
  read_dev_deps() {
    node -e "try { const p = require('$pkg_json'); const d = p.devDependencies||{}; process.stdout.write(Object.entries(d).map(([k,v]) => k+'@'+v).join(', ')); } catch(e) { process.stdout.write(''); }" 2>/dev/null
  }

  name="$(read_field name)"
  version="$(read_field version)"
  desc="$(read_field description)"
  main="$(read_field main)"
  repo="$(read_field repository)"
  deps="$(read_deps)"
  runtime_deps="$(read_runtime_deps)"
  dev_deps="$(read_dev_deps)"

  PKG_NAMES+=("$name")
  PKG_VERSIONS+=("$version")
  PKG_DESCS+=("$desc")
  PKG_MAINS+=("$main")
  PKG_DEPS+=("$deps")
  PKG_REPOS+=("$repo")

  # ----- Test status -----
  if [[ $SKIP_TESTS -eq 1 ]]; then
    PKG_TEST_STATUS+=("skipped")
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
  else
    if grep -q '"test"' "$pkg_json" 2>/dev/null; then
      if [[ -d "$pkg_path/node_modules" ]] || [[ -d "$ROOT_DIR/node_modules" ]]; then
        test_start=$(date +%s)
        if (cd "$pkg_path" && timeout 60 npm test --silent -- --reporter=basic --run 2>&1) >/tmp/pkg-test.log 2>&1; then
          elapsed=$(( $(date +%s) - test_start ))
          PKG_TEST_STATUS+=("pass (${elapsed}s)")
          TESTS_PASSED=$((TESTS_PASSED + 1))
        else
          PKG_TEST_STATUS+=("FAIL")
          TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
      else
        PKG_TEST_STATUS+=("no node_modules")
        TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
      fi
    else
      PKG_TEST_STATUS+=("no test script")
      TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
    fi
  fi

  # ----- Build status -----
  if [[ $SKIP_BUILD -eq 1 ]]; then
    PKG_BUILD_STATUS+=("skipped")
  else
    # Build artifact is usually dist/ — check existence
    if [[ -d "$pkg_path/dist" ]]; then
      dist_files=$(find "$pkg_path/dist" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
      if [[ $dist_files -gt 0 ]]; then
        PKG_BUILD_STATUS+=("present (${dist_files} files)")
        BUILDS_OK=$((BUILDS_OK + 1))
      else
        PKG_BUILD_STATUS+=("dist/ empty")
        BUILDS_MISSING=$((BUILDS_MISSING + 1))
      fi
    else
      PKG_BUILD_STATUS+=("no dist/")
      BUILDS_MISSING=$((BUILDS_MISSING + 1))
    fi
  fi

  # Live status (only useful when interactive)
  if [[ $JSON_OUT -eq 0 && -t 1 && -z "$OUT_FILE" ]]; then
    case "${PKG_TEST_STATUS[-1]}" in
      pass*)     ok "$name @ $version  tests ${PKG_TEST_STATUS[-1]}" ;;
      FAIL)      err "$name @ $version  tests FAILED" ;;
      *)         info "$name @ $version  tests ${PKG_TEST_STATUS[-1]}" ;;
    esac
  fi
done

# ===================== Summary stats =====================
if [[ $JSON_OUT -eq 0 ]]; then
  if [[ -t 1 && -z "$OUT_FILE" ]]; then
    echo ""
  fi
fi

# ===================== Render Markdown =====================
render_markdown() {
  local out="$1"
  {
    # Use printf '%b' so embedded \n in MD_HEADER is expanded
    printf '%b' "$MD_HEADER"
    echo "## Summary"
    echo ""
    echo "| Metric | Count |"
    echo "|--------|------:|"
    echo "| Total packages          | $TOTAL |"
    echo "| Tests passed            | $TESTS_PASSED |"
    echo "| Tests failed            | $TESTS_FAILED |"
    echo "| Tests skipped / no tests| $TESTS_SKIPPED |"
    echo "| Builds present (dist/)  | $BUILDS_OK |"
    echo "| Builds missing          | $BUILDS_MISSING |"
    echo ""

    # ----- Internal dependency matrix -----
    echo "## Internal Dependency Matrix"
    echo ""
    # Build a list of all internal package names
    local internal_names=()
    for n in "${PKG_NAMES[@]}"; do
      [[ -n "$n" && "$n" == @* ]] && internal_names+=("$n")
    done
    if [[ ${#internal_names[@]} -eq 0 ]]; then
      echo "_No internal @cdf-know/* packages detected._"
    else
      # Header row
      printf '| package |'
      for n in "${internal_names[@]}"; do
        short="${n#@cdf-know/}"
        printf ' %s |' "$short"
      done
      echo ""
      printf '|---------|'
      # Emit one '----|' per internal package
      local _i _count="${#internal_names[@]}"
      for ((_i=0; _i<_count; _i++)); do printf '%s' '----|'; done
      echo ""
      # Each row: which internal packages it depends on
      local i
      for i in "${!PKG_NAMES[@]}"; do
        local pkg_name="${PKG_NAMES[$i]}"
        [[ -z "$pkg_name" ]] && continue
        printf '| %s |' "$pkg_name"
        local dep
        for dep in "${internal_names[@]}"; do
          if [[ "${PKG_DEPS[$i]}" == *"$dep"* ]]; then
            printf ' %s |' "✅"
          else
            printf ' %s |' ""
          fi
        done
        echo ""
      done
    fi
    echo ""

    # ----- Per-package details -----
    echo "## Packages"
    echo ""
    for i in "${!PKG_NAMES[@]}"; do
      local pkg_name="${PKG_NAMES[$i]}"
      local pkg_version="${PKG_VERSIONS[$i]}"
      local pkg_desc="${PKG_DESCS[$i]}"
      local pkg_main="${PKG_MAINS[$i]}"
      local pkg_deps="${PKG_DEPS[$i]}"
      local pkg_tests="${PKG_TEST_STATUS[$i]}"
      local pkg_build="${PKG_BUILD_STATUS[$i]}"

      [[ -z "$pkg_name" ]] && continue

      echo "### \`${pkg_name}\` v${pkg_version}"
      echo ""
      if [[ -n "$pkg_desc" ]]; then
        echo "${pkg_desc}"
        echo ""
      fi
      echo "- **main**: \`${pkg_main:-<none>}\`"
      echo "- **tests**: ${pkg_tests}"
      echo "- **build artifact**: ${pkg_build}"
      if [[ -n "$pkg_deps" ]]; then
        echo "- **dependencies** (${pkg_deps//, /, }):"
        # Render as inline code spans
        IFS=',' read -ra dep_list <<< "$pkg_deps"
        for d in "${dep_list[@]}"; do
          d="$(echo "$d" | sed 's/^ *//;s/ *$//')"
          [[ -z "$d" ]] && continue
          echo "  - \`${d}\`"
        done
      else
        echo "- **dependencies**: _none_"
      fi
      echo ""
    done

    # ----- Final verdict -----
    echo "## Verdict"
    echo ""
    if [[ $TESTS_FAILED -gt 0 ]]; then
      echo "❌ **$TESTS_FAILED** package(s) have failing tests. Resolve before release."
    elif [[ $BUILDS_MISSING -gt 0 ]]; then
      echo "⚠️ **$BUILDS_MISSING** package(s) are missing build artifacts (no \`dist/\`). Run \`npm run build --workspaces --if-present\` before publish."
    else
      echo "✅ All packages pass checks. Ready for release review."
    fi
    echo ""
    echo "---"
    echo ""
    echo "_Generated by \`scripts/package-summary.sh\`._"
  } > "$out"
}

# ===================== Render JSON =====================
render_json() {
  local out="$1"
  {
    printf '{\n'
    printf '  "summary": {\n'
    printf '    "total": %d,\n' "$TOTAL"
    printf '    "testsPassed": %d,\n' "$TESTS_PASSED"
    printf '    "testsFailed": %d,\n' "$TESTS_FAILED"
    printf '    "testsSkipped": %d,\n' "$TESTS_SKIPPED"
    printf '    "buildsPresent": %d,\n' "$BUILDS_OK"
    printf '    "buildsMissing": %d\n' "$BUILDS_MISSING"
    printf '  },\n'
    printf '  "packages": [\n'
    for i in "${!PKG_NAMES[@]}"; do
      local pkg_name="${PKG_NAMES[$i]}"
      [[ -z "$pkg_name" ]] && continue
      # JSON-escape minimal: backslash and double-quote
      esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
      printf '    {\n'
      printf '      "name": "%s",\n'    "$(esc "$pkg_name")"
      printf '      "version": "%s",\n' "$(esc "${PKG_VERSIONS[$i]}")"
      printf '      "description": "%s",\n' "$(esc "${PKG_DESCS[$i]}")"
      printf '      "main": "%s",\n'   "$(esc "${PKG_MAINS[$i]}")"
      printf '      "tests": "%s",\n'   "$(esc "${PKG_TEST_STATUS[$i]}")"
      printf '      "build": "%s",\n'   "$(esc "${PKG_BUILD_STATUS[$i]}")"
      printf '      "dependencies": "%s"\n' "$(esc "${PKG_DEPS[$i]}")"
      if [[ $i -lt $((${#PKG_NAMES[@]} - 1)) ]]; then
        printf '    },\n'
      else
        printf '    }\n'
      fi
    done
    printf '  ]\n'
    printf '}\n'
  } > "$out"
}

# ===================== Output dispatch =====================
if [[ $JSON_OUT -eq 1 ]]; then
  if [[ -n "$OUT_FILE" ]]; then
    mkdir -p "$(dirname "$OUT_FILE")"
    render_json "$OUT_FILE"
    ok "wrote JSON report → $OUT_FILE"
  else
    render_json /dev/stdout
  fi
else
  if [[ -n "$OUT_FILE" ]]; then
    mkdir -p "$(dirname "$OUT_FILE")"
    render_markdown "$OUT_FILE"
    ok "wrote Markdown report → $OUT_FILE"
  else
    TMP="$(mktemp -t pkg-summary.XXXXXX.md)"
    render_markdown "$TMP"
    cat "$TMP"
    rm -f "$TMP"
  fi
fi

# Print interactive summary
if [[ $JSON_OUT -eq 0 && -t 1 && -z "$OUT_FILE" ]]; then
  echo ""
  echo "──────────────────────────────────────────"
  echo "  Total packages : $TOTAL"
  echo "  Tests passed   : $TESTS_PASSED"
  echo "  Tests failed   : $TESTS_FAILED"
  echo "  Tests skipped  : $TESTS_SKIPPED"
  echo "  Builds present : $BUILDS_OK"
  echo "  Builds missing : $BUILDS_MISSING"
  echo "──────────────────────────────────────────"
  if [[ $TESTS_FAILED -gt 0 ]]; then
    err "release review blocked by failing package tests"
  fi
fi

exit 0
