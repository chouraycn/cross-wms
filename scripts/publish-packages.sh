#!/usr/bin/env bash
# publish-packages.sh — Build and publish @cdf-know/* packages to npm registry
#
# Usage: ./scripts/publish-packages.sh [--dry-run] [--registry <url>]
#   --dry-run      Simulate publish without actually publishing
#   --registry     Target npm registry (default: https://registry.npmjs.org)
#
set -euo pipefail

DRY_RUN=""
REGISTRY="https://registry.npmjs.org"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN="--dry-run"; shift;;
    --registry) REGISTRY="$2"; shift 2;;
    -h|--help) sed -n '2,10p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

echo "=== CDFKnow Packages Publisher ==="
echo "Registry: $REGISTRY"
[[ -n "$DRY_RUN" ]] && echo "Mode: DRY RUN (no actual publish)"
echo ""

# Build all packages first
echo "Step 1: Building all packages..."
cd "$ROOT"
npm run build:packages

# Collect packages in dependency order
# (leaf packages first, then dependents)
PACKAGES=(
  "packages/gateway-protocol"
  "packages/normalization-core"
  "packages/markdown-core"
  "packages/media-understanding-common"
  "packages/net-policy"
  "packages/model-catalog-core"
  "packages/plugin-package-contract"
  "packages/media-core"
  "packages/llm-core"
  "packages/media-generation-core"
  "packages/memory-host-sdk"
  "packages/skill-core"
  "packages/plugin-sdk"
  "packages/agent-core"
  "packages/acp-core"
  "packages/gateway-client"
  "packages/llm-runtime"
  "packages/speech-core"
  "packages/terminal-core"
  "packages/tool-call-repair"
  "packages/web-content-core"
  "packages/sdk"
)

FAILED=()
PUBLISHED=()

for pkg in "${PACKAGES[@]}"; do
  pkg_dir="$ROOT/$pkg"
  pkg_name="$(jq -r '.name' "$pkg_dir/package.json")"
  pkg_version="$(jq -r '.version' "$pkg_dir/package.json")"

  echo "Publishing $pkg_name@$pkg_version..."

  if [[ ! -f "$pkg_dir/dist/index.js" ]]; then
    echo "  ⚠️  Missing dist/index.js, skipping"
    FAILED+=("$pkg_name")
    continue
  fi

  cd "$pkg_dir"
  if npm publish --access public --registry "$REGISTRY" $DRY_RUN 2>&1; then
    echo "  ✓ Published $pkg_name@$pkg_version"
    PUBLISHED+=("$pkg_name@$pkg_version")
  else
    echo "  ✗ Failed to publish $pkg_name"
    FAILED+=("$pkg_name")
  fi
done

echo ""
echo "=== Publish Summary ==="
echo "Published: ${#PUBLISHED[@]}"
for p in "${PUBLISHED[@]}"; do echo "  ✓ $p"; done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed: ${#FAILED[@]}"
  for f in "${FAILED[@]}"; do echo "  ✗ $f"; done
  exit 1
fi

echo ""
echo "All packages published successfully!"
