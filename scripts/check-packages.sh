#!/usr/bin/env zsh
# ============================================================
# 包版本契约检查（packages/ SDK 一致性）
#
# 校验 packages/ 下每个 SDK 包：
#   1. name 必须以 @cdf-know/ 开头
#   2. 必须有 version 字段
#   3. 必须有 main 或 exports 导出入口
#   4. 内部 @cdf-know/* 依赖的版本号必须与对应包实际 version 一致
#
# 任一不满足 → 退出码 1（门禁失败）
#
# 用法：zsh scripts/check-packages.sh
# ============================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

FAIL=0

for pkg in packages/*/; do
  [[ -f "$pkg/package.json" ]] || continue

  name=$(node -p "require('./$pkg/package.json').name" 2>/dev/null)
  version=$(node -p "require('./$pkg/package.json').version" 2>/dev/null)
  hasEntry=$(node -p "(function(){var p=require('./$pkg/package.json');return !!(p.main||p.module||p.exports);})()" 2>/dev/null)

  echo "检查包: $name@$version"

  if [[ "$name" != @cdf-know/* ]]; then
    echo "  ❌ 包名必须以 @cdf-know/ 开头"; FAIL=1
  fi
  if [[ -z "$version" ]]; then
    echo "  ❌ 缺少 version 字段"; FAIL=1
  fi
  if [[ "$hasEntry" != "true" ]]; then
    echo "  ❌ 缺少 main/module/exports 导出入口"; FAIL=1
  fi

  # 内部依赖版本一致性
  node -e '
    const fs = require("fs");
    const path = require("path");
    const pkgPath = process.argv[1];
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
    const internal = Object.keys(deps).filter(d => d.startsWith("@cdf-know/"));
    let problems = [];
    for (const dep of internal) {
      const short = dep.split("/")[1];
      const depPkgPath = path.join(process.cwd(), "packages", short, "package.json");
      if (!fs.existsSync(depPkgPath)) { problems.push(`  ❌ 内部依赖 ${dep} 指向的包不存在`); continue; }
      const depPkg = JSON.parse(fs.readFileSync(depPkgPath, "utf-8"));
      if (depPkg.version !== deps[dep]) {
        problems.push(`  ❌ 内部依赖 ${dep} 声明 ${deps[dep]} 与实际 ${depPkg.version} 不一致`);
      }
    }
    if (problems.length) { console.log(problems.join("\n")); process.exit(2); }
  ' "$ROOT_DIR/$pkg/package.json"
  if [[ $? -eq 2 ]]; then FAIL=1; fi
done

if [[ "$FAIL" -gt 0 ]]; then
  echo "❌ 包版本契约检查未通过"
  exit 1
fi

echo "✅ 包版本契约检查通过"
exit 0
