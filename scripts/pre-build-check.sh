#!/usr/bin/env zsh
set -euo pipefail

# ============================================================
# 打包前预检脚本 — Pre-build Check
#
# 在执行完整打包流程前，检查所有可能导致闪退的问题：
# 1. TypeScript 编译检查
# 2. 前端构建检查
# 3. 后端 esbuild 打包检查
# 4. 依赖完整性检查
# 5. 关键文件存在性检查
# 6. Swift 构建检查（可选）
#
# Usage:
#   scripts/pre-build-check.sh              # 完整检查
#   scripts/pre-build-check.sh --quick      # 快速检查（跳过 Swift）
#   scripts/pre-build-check.sh --skip-swift # 跳过 Swift 检查
# ============================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ===================== 参数解析 =====================

SKIP_SWIFT=false
QUICK_MODE=false
SKIP_E2E=false

for arg in "$@"; do
  case "$arg" in
    --skip-swift)
      SKIP_SWIFT=true
      ;;
    --quick)
      QUICK_MODE=true
      SKIP_SWIFT=true
      ;;
    --skip-e2e)
      SKIP_E2E=true
      ;;
  esac
done

# ===================== 颜色输出 =====================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0

check_pass() {
  echo -e "  ${GREEN}✅ PASS${NC}: $1"
  PASS=$((PASS + 1))
}

check_fail() {
  echo -e "  ${RED}❌ FAIL${NC}: $1"
  FAIL=$((FAIL + 1))
}

check_warn() {
  echo -e "  ${YELLOW}⚠️  WARN${NC}: $1"
  WARN=$((WARN + 1))
}

# ===================== 开始检查 =====================

echo ""
echo "=========================================="
echo "   🔍 CDF Know Clow - 打包前预检"
echo "=========================================="
echo ""

# ===================== 1. 基本环境检查 =====================

echo "📋 1. 基本环境检查"

# Node.js 版本
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
if [[ "$NODE_VERSION" == v2* ]]; then
  check_pass "Node.js 版本: $NODE_VERSION"
else
  check_fail "Node.js 版本不符合要求 (需要 v20+): $NODE_VERSION"
fi

# npm 版本
NPM_VERSION=$(npm --version 2>/dev/null || echo "not found")
if [[ -n "$NPM_VERSION" ]]; then
  check_pass "npm 版本: $NPM_VERSION"
else
  check_fail "npm 未找到"
fi

# Swift 版本（可选）
if [[ "$SKIP_SWIFT" != "true" ]]; then
  SWIFT_VERSION=$(swift --version 2>/dev/null | head -1 || echo "not found")
  if [[ -n "$SWIFT_VERSION" && "$SWIFT_VERSION" != "not found" ]]; then
    check_pass "Swift 版本: $SWIFT_VERSION"
  else
    check_warn "Swift 未找到，将跳过 macOS 应用构建"
  fi
fi

echo ""

# ===================== 2. 依赖完整性检查 =====================

echo "📦 2. 依赖完整性检查"

# node_modules 存在性
if [[ -d "node_modules" ]]; then
  check_pass "node_modules 目录存在"
else
  check_fail "node_modules 目录不存在，请运行 npm install"
fi

# 关键依赖检查
CRITICAL_DEPS=(
  "express"
  "better-sqlite3"
  "@modelcontextprotocol/sdk"
  "react"
  "react-dom"
  "@mui/material"
  "esbuild"
  "vite"
  "typescript"
)

for dep in "${CRITICAL_DEPS[@]}"; do
  if [[ -d "node_modules/$dep" ]]; then
    check_pass "依赖存在: $dep"
  else
    check_fail "依赖缺失: $dep"
  fi
done

echo ""

# ===================== 3. TypeScript 编译检查 =====================

echo "🔧 3. TypeScript 编译检查"

TSC_OUTPUT=$(npx tsc --noEmit --skipLibCheck 2>&1) || true
TS_ERROR_COUNT=$(echo "$TSC_OUTPUT" | grep -c "error TS" || true)
TS_ERROR_COUNT=$(echo "$TS_ERROR_COUNT" | tr -d '[:space:]')

if [[ "$TS_ERROR_COUNT" == "0" ]]; then
  check_pass "TypeScript 编译通过 (0 个错误)"
else
  check_fail "TypeScript 编译有 $TS_ERROR_COUNT 个错误"
  echo ""
  echo "$TSC_OUTPUT" | head -20
  echo ""
fi

echo ""

# ===================== 4. 前端构建检查 =====================

echo "🎨 4. 前端构建检查"

# 前端构建（如果是快速模式则跳过完整构建，只检查语法）
if [[ "$QUICK_MODE" == "true" ]]; then
  # 快速模式：只做语法检查
  if npx vite build --mode development --minify=false 2>&1 | tail -5 | grep -q "built in"; then
    check_pass "前端快速构建通过"
  else
    check_fail "前端快速构建失败"
  fi
else
  # 完整模式：完整构建
  BUILD_OUTPUT=$(npm run build 2>&1) || true
  if echo "$BUILD_OUTPUT" | grep -q "built in"; then
    check_pass "前端完整构建通过"
    # 检查构建产物
    if [[ -f "dist/index.html" ]]; then
      check_pass "构建产物存在: dist/index.html"
    else
      check_fail "构建产物缺失: dist/index.html"
    fi
  else
    check_fail "前端构建失败"
    echo ""
    echo "$BUILD_OUTPUT" | tail -20
    echo ""
  fi
fi

echo ""

# ===================== 5. 后端 esbuild 打包检查 =====================

echo "⚙️  5. 后端 esbuild 打包检查"

TEMP_SERVER_BUNDLE="/tmp/cdf-know-clow-server-check.cjs"

ESBUILD_OUTPUT=$(./node_modules/.bin/esbuild \
  server/index.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$TEMP_SERVER_BUNDLE" \
  --alias:@src="$ROOT_DIR/src" \
  --external:better-sqlite3 \
  '--external:@cdfclaw/*' \
  --external:@modelcontextprotocol/sdk \
  --external:json5 \
  --external:onnxruntime-node \
  --external:fsevents \
  --external:@mozilla/readability \
  --external:turndown \
  --external:jsdom \
  --external:@mixmark-io/domino \
  --external:cheerio \
  --external:tr46 \
  --external:whatwg-url \
  --external:sqlite-vec \
  --sourcemap=inline \
  2>&1) || true

if [[ -f "$TEMP_SERVER_BUNDLE" ]]; then
  check_pass "后端 esbuild 打包通过"
  
  # 检查文件大小
  BUNDLE_SIZE=$(stat -f%z "$TEMP_SERVER_BUNDLE")
  BUNDLE_SIZE_MB=$((BUNDLE_SIZE / 1024 / 1024))
  check_pass "后端包大小: ${BUNDLE_SIZE_MB}MB"
  
  # 检查关键模块
  if grep -q "express" "$TEMP_SERVER_BUNDLE"; then
    check_pass "包含关键模块: express"
  else
    check_warn "可能缺少 express 模块"
  fi
  
  # 检查是否有明显的语法错误
  if node -c "$TEMP_SERVER_BUNDLE" 2>&1; then
    check_pass "后端包语法检查通过"
  else
    check_fail "后端包语法检查失败"
  fi
  
  rm -f "$TEMP_SERVER_BUNDLE"
  
else
  check_fail "后端 esbuild 打包失败"
  echo "$ESBUILD_OUTPUT"
fi

echo ""

# ===================== 6. 关键文件存在性检查 =====================

echo "📁 6. 关键文件存在性检查"

CRITICAL_FILES=(
  "package.json"
  "server/index.ts"
  "vite.config.ts"
  "tsconfig.json"
  "apps/macos/Package.swift"
  "scripts/package-mac-app.sh"
  "scripts/create-dmg.sh"
  "scripts/package-mac-dist.sh"
)

for file in "${CRITICAL_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    check_pass "文件存在: $file"
  else
    check_warn "文件缺失: $file"
  fi
done

echo ""

# ===================== 7. Swift 构建检查（可选） =====================

if [[ "$SKIP_SWIFT" != "true" ]]; then
  echo "🍎 7. Swift 构建检查"
  
  if [[ -d "apps/macos" ]]; then
    cd "$ROOT_DIR/apps/macos"
    
    if swift build --disable-sandbox -c release 2>&1 | tail -5 | grep -q "Build complete"; then
      check_pass "Swift 构建通过"
    else
      check_warn "Swift 构建可能有问题（详细输出请查看构建日志）"
    fi
    
    cd "$ROOT_DIR"
  else
    check_warn "macOS 应用目录不存在"
  fi
  
  echo ""
fi

# ===================== 8. E2E API 回归测试 =====================

if [[ "$SKIP_E2E" == "true" ]]; then
  echo "🧪 8. E2E API 回归测试"
  check_warn "已通过 --skip-e2e 跳过 E2E API 测试"
else
  echo "🧪 8. E2E API 回归测试 (vitest e2e)"
  if npm run test:e2e:api > /tmp/cdf-e2e-api.log 2>&1; then
    check_pass "E2E API 测试通过"
  else
    check_fail "E2E API 测试失败（详见 /tmp/cdf-e2e-api.log）"
    tail -40 /tmp/cdf-e2e-api.log
  fi
fi

echo ""

# ===================== 9. 包版本契约检查 =====================

echo "📦 9. 包版本契约检查"
if zsh scripts/check-packages.sh > /tmp/cdf-pkg.log 2>&1; then
  check_pass "包版本契约一致"
else
  check_fail "包版本契约检查未通过"
  cat /tmp/cdf-pkg.log
fi

echo ""

# ===================== 10. WKWebView 兼容静态检查 =====================

echo "🍎 10. WKWebView 兼容静态检查"
if zsh scripts/wkwebview-lint.sh > /tmp/cdf-wk.log 2>&1; then
  check_pass "WKWebView 兼容检查通过"
else
  check_fail "WKWebView 兼容检查未通过"
  cat /tmp/cdf-wk.log
fi

echo ""

# ===================== 11. 前端 Bundle 预算 =====================

echo "📦 11. 前端 Bundle 预算"
if zsh scripts/bundle-budget.sh > /tmp/cdf-bundle.log 2>&1; then
  check_pass "前端 Bundle 预算通过"
else
  # bundle-budget 仅在超过硬上限时失败
  check_fail "前端 Bundle 超出预算"
  cat /tmp/cdf-bundle.log
fi

echo ""

# ===================== 12. 前端性能静态检查 =====================

echo "⚡ 12. 前端性能静态检查"
if zsh scripts/perf-lint.sh > /tmp/cdf-perf.log 2>&1; then
  check_pass "前端性能检查通过"
else
  # perf-lint 仅在 console.log 硬阻断时失败
  check_fail "前端性能检查未通过"
  cat /tmp/cdf-perf.log
fi

echo ""

# ===================== 13. CI 健康检查 =====================

echo "🏥 13. CI 健康检查"
if zsh scripts/ci-health-check.sh > /tmp/cdf-ci-health.log 2>&1; then
  check_pass "CI 健康检查通过"
else
  check_fail "CI 健康检查未通过"
  cat /tmp/cdf-ci-health.log
fi

echo ""

# ===================== 总结 =====================

echo "=========================================="
echo "   📊 检查总结"
echo "=========================================="
echo ""
echo -e "  ${GREEN}✅ 通过: $PASS${NC}"
echo -e "  ${YELLOW}⚠️  警告: $WARN${NC}"
echo -e "  ${RED}❌ 失败: $FAIL${NC}"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "  ${RED}❌ 检查不通过，请修复以上问题后再打包${NC}"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}✅ 所有关键检查通过，可以安全打包${NC}"
  if [[ "$WARN" -gt 0 ]]; then
    echo -e "  ${YELLOW}⚠️  注意: 有 $WARN 个警告，建议查看${NC}"
  fi
  echo ""
  exit 0
fi
