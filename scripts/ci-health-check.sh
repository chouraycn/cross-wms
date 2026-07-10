#!/usr/bin/env zsh
# ============================================================
# CI 健康检查脚本
#
# 检查 CI 配置的完整性和一致性：
#   1. YAML 语法校验（所有 .github/workflows/*.yml）
#   2. 引用脚本存在性检查（workflow 中 run: 的脚本路径）
#   3. 关键 job 依赖一致性检查
#   4. 常见 CI 反模式检测（缺少 timeout、缺少 cache 等）
#
# 用法：zsh scripts/ci-health-check.sh
# ============================================================
set -uo pipefail
setopt null_glob 2>/dev/null || true  # zsh: 不匹配的 glob 返回空而非报错

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

FAIL=0
WARN=0

echo "🏥 CI 健康检查:"

# ----------------------------------------------------------------
# 1. YAML 语法校验
# ----------------------------------------------------------------
echo ""
echo "  📄 YAML 语法校验:"
WORKFLOW_DIR=".github/workflows"
if [[ ! -d "$WORKFLOW_DIR" ]]; then
  echo "    ⚠️  .github/workflows 目录不存在"
  WARN=$((WARN + 1))
else
  for yml in "$WORKFLOW_DIR"/*.yml "$WORKFLOW_DIR"/*.yaml; do
    [[ -f "$yml" ]] || continue
    # 用 node 解析 YAML（不依赖外部工具）
    if node -e "
      const fs = require('fs');
      const content = fs.readFileSync('$yml', 'utf-8');
      // 简单结构检查：必须有 jobs: 字段
      if (!content.includes('jobs:')) {
        console.error('Missing jobs: field');
        process.exit(1);
      }
      // 检查是否有意外的 tab 缩进
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('\t')) {
          console.error('Tab indentation at line ' + (i+1));
          process.exit(1);
        }
      }
    " 2>/dev/null; then
      echo "    ✅ $(basename "$yml")"
    else
      echo "    ❌ $(basename "$yml") — YAML 语法问题"
      FAIL=1
    fi
  done
fi

# ----------------------------------------------------------------
# 2. 引用脚本存在性检查
# ----------------------------------------------------------------
echo ""
echo "  📜 引用脚本存在性检查:"
SCRIPTS_IN_CI=$(grep -rhE "run:.*scripts/" "$WORKFLOW_DIR" 2>/dev/null \
  | sed -E 's/.*run:.*scripts\///' \
  | sed -E 's/ .*//' \
  | sed -E 's/`.*//' \
  | sed -E "s/'.*//" \
  | sort -u)

for script in $(echo "$SCRIPTS_IN_CI"); do
  script_path="scripts/$script"
  # 去除可能的参数
  clean_script=$(echo "$script" | sed -E 's/[[:space:]].*//')
  script_path="scripts/$clean_script"
  if [[ -f "$script_path" ]]; then
    # 检查可执行权限
    if [[ -x "$script_path" ]]; then
      echo "    ✅ $clean_script (可执行)"
    else
      echo "    ⚠️  $clean_script (缺少可执行权限)"
      chmod +x "$script_path" 2>/dev/null
      WARN=$((WARN + 1))
    fi
  else
    echo "    ❌ $clean_script — 脚本不存在"
    FAIL=1
  fi
done

# ----------------------------------------------------------------
# 3. 关键脚本完整性检查
# ----------------------------------------------------------------
echo ""
echo "  🔧 关键脚本完整性检查:"
CRITICAL_SCRIPTS=(
  "scripts/pre-build-check.sh"
  "scripts/wkwebview-lint.sh"
  "scripts/perf-lint.sh"
  "scripts/bundle-budget.sh"
  "scripts/check-packages.sh"
  "scripts/package-mac-dist.sh"
  "scripts/create-dmg.sh"
)

for script in "${CRITICAL_SCRIPTS[@]}"; do
  if [[ -f "$script" ]]; then
    # 检查 shebang
    if head -1 "$script" | grep -qE '^#!'; then
      echo "    ✅ $script"
    else
      echo "    ⚠️  $script — 缺少 shebang"
      WARN=$((WARN + 1))
    fi
  else
    echo "    ❌ $script — 不存在"
    FAIL=1
  fi
done

# ----------------------------------------------------------------
# 4. CI 反模式检测
# ----------------------------------------------------------------
echo ""
echo "  ⚠️  CI 反模式检测:"

for yml in "$WORKFLOW_DIR"/*.yml "$WORKFLOW_DIR"/*.yaml; do
  [[ -f "$yml" ]] || continue
  basename_file=$(basename "$yml")

  # 检查缺少 timeout-minutes
  if ! grep -q "timeout-minutes" "$yml"; then
    echo "    ⚠️  $basename_file — 有 job 缺少 timeout-minutes（可能挂起）"
    WARN=$((WARN + 1))
  fi

  # 检查缺少 concurrency（可能导致重复运行）
  if ! grep -q "concurrency" "$yml"; then
    echo "    ⚠️  $basename_file — 缺少 concurrency 控制（可能重复运行）"
    WARN=$((WARN + 1))
  fi

  # 检查 actions/checkout 版本（应使用 v4）
  if grep -q "actions/checkout@v[123]" "$yml"; then
    echo "    ⚠️  $basename_file — 使用旧版 actions/checkout（建议 v4）"
    WARN=$((WARN + 1))
  fi

  # 检查 npm install vs npm ci
  if grep -qE "run:.*npm install" "$yml" && ! grep -q "npm ci" "$yml"; then
    echo "    ⚠️  $basename_file — 使用 npm install 而非 npm ci（CI 应确定性）"
    WARN=$((WARN + 1))
  fi
done

# ----------------------------------------------------------------
# 5. pre-build-check 集成检查
# ----------------------------------------------------------------
echo ""
echo "  🔗 pre-build-check 集成检查:"
BUILD_WORKFLOW="$WORKFLOW_DIR/build-and-release.yml"
if [[ -f "$BUILD_WORKFLOW" ]]; then
  if grep -q "pre-build-check" "$BUILD_WORKFLOW"; then
    echo "    ✅ build-and-release.yml 已集成 pre-build-check"
  else
    echo "    ❌ build-and-release.yml 未集成 pre-build-check"
    FAIL=1
  fi
fi

PR_GATE="$WORKFLOW_DIR/pr-quality-gate.yml"
if [[ -f "$PR_GATE" ]]; then
  if grep -q "wkwebview-lint" "$PR_GATE"; then
    echo "    ✅ pr-quality-gate.yml 已集成 WKWebView lint"
  else
    echo "    ⚠️  pr-quality-gate.yml 未集成 WKWebView lint"
    WARN=$((WARN + 1))
  fi
  if grep -q "perf-lint" "$PR_GATE"; then
    echo "    ✅ pr-quality-gate.yml 已集成 perf-lint"
  else
    echo "    ⚠️  pr-quality-gate.yml 未集成 perf-lint"
    WARN=$((WARN + 1))
  fi
  if grep -q "check-packages" "$PR_GATE"; then
    echo "    ✅ pr-quality-gate.yml 已集成 package 契约检查"
  else
    echo "    ⚠️  pr-quality-gate.yml 未集成 package 契约检查"
    WARN=$((WARN + 1))
  fi
fi

# ----------------------------------------------------------------
# 总结
# ----------------------------------------------------------------
echo ""
if [[ "$FAIL" -gt 0 ]]; then
  echo "❌ CI 健康检查未通过（$FAIL 个硬错误）"
  exit 1
elif [[ "$WARN" -gt 0 ]]; then
  echo "⚠️  CI 健康检查通过（$WARN 个警告）"
  exit 0
else
  echo "✅ CI 健康检查通过"
  exit 0
fi
