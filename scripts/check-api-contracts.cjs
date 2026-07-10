/**
 * API 奐约检查（STABLE API 表面完整性验证）
 *
 * 对比 packages/contracts/*.d.ts 中声明的 STABLE API 导出
 * 与各包 src/index.ts 实际导出，确保：
 *   1. 奐约中声明的 STABLE 导出在实际代码中存在（不允许移除）
 *   2. additive 变更（新增导出）仅发出警告，不阻止
 *
 * 任一 STABLE 导出缺失 → 退出码 1（门禁失败）
 */

const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const contractsDir = path.join(rootDir, "packages", "contracts");
const packagesDir = path.join(rootDir, "packages");

let fail = 0;
let warn = 0;

console.log("=== API 奐约检查 ===");
console.log("");

// ── 从 .d.ts 奐约文件提取声明的 STABLE 导出名称 ──
function extractContractExports(contractFile) {
  const content = fs.readFileSync(contractFile, "utf-8");
  const names = [];
  const re = /export\s+(?:declare\s+)?(?:type|interface|class|const|function)\s+([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    names.push(m[1]);
  }
  return names.sort();
}

// ── 从 TypeScript 源码递归提取所有实际导出名称 ──
function extractActualExports(pkgDir) {
  const names = new Set();
  const visited = new Set();

  function extractFromFile(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    if (!fs.existsSync(filePath)) return;
    // 如果是目录，尝试目录下的 index.ts
    if (fs.statSync(filePath).isDirectory()) {
      const indexPath = path.join(filePath, "index.ts");
      if (fs.existsSync(indexPath)) {
        extractFromFile(indexPath);
      }
      return;
    }

    const content = fs.readFileSync(filePath, "utf-8");

    // export type X / export interface X / export class X / export const X / export function X / export enum X
    const directRe = /export\s+(?:type\s+)?(?:class|interface|const|function|enum|type)\s+([A-Za-z_]\w*)/g;
    let m;
    while ((m = directRe.exec(content)) !== null) {
      names.add(m[1]);
    }

    // export { X, Y as Z, ... } and export type { X, Y as Z, ... }
    const namedRe = /export\s+(?:type\s+)?\{([^}]+)\}/g;
    while ((m = namedRe.exec(content)) !== null) {
      const items = m[1].split(",");
      for (const item of items) {
        const trimmed = item.trim();
        const asMatch = trimmed.match(/\s+as\s+([A-Za-z_]\w*)/);
        if (asMatch) {
          names.add(asMatch[1]);
        } else if (trimmed && /^[A-Za-z_]\w*$/.test(trimmed)) {
          names.add(trimmed);
        }
      }
    }

    // export * from "./xxx" — 递归解析（支持目录级和文件级导入）
    const reExportRe = /export\s+\*\s+from\s+["']\.\/([^"']+)["']/g;
    while ((m = reExportRe.exec(content)) !== null) {
      let modulePath = m[1];
      if (modulePath.endsWith(".js")) {
        modulePath = modulePath.replace(/\.js$/, ".ts");
      }
      // 尝试多种解析路径：直接文件、目录/index.ts
      const candidates = [modulePath];
      if (!modulePath.endsWith(".ts")) {
        candidates.push(modulePath + ".ts");
        candidates.push(modulePath + "/index.ts");
      }
      for (const candidate of candidates) {
        const fullPath = path.join(path.dirname(filePath), candidate);
        if (fs.existsSync(fullPath)) {
          extractFromFile(fullPath);
          break;
        }
      }
    }
  }

  const indexFile = path.join(pkgDir, "src", "index.ts");
  extractFromFile(indexFile);
  return Array.from(names).sort();
}

// ── 获取所有契约文件 ──
const contractFiles = fs.readdirSync(contractsDir)
  .filter(f => f.endsWith(".d.ts"))
  .map(f => path.join(contractsDir, f));

// ── 获取所有包目录（有 src 子目录的） ──
const packageNames = fs.readdirSync(packagesDir)
  .filter(d => {
    const full = path.join(packagesDir, d);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "src"));
  });

// ── 检查每个契约文件对应的包 ──
for (const contractFile of contractFiles) {
  const pkgName = path.basename(contractFile, ".d.ts");
  const pkgDir = path.join(packagesDir, pkgName);
  const indexFile = path.join(pkgDir, "src", "index.ts");

  console.log("检查包: @cdf-know/" + pkgName);
  console.log("  奐约文件: " + contractFile);
  console.log("  入口文件: " + indexFile);

  if (!fs.existsSync(indexFile)) {
    console.log("  ❌ 入口文件不存在: " + indexFile);
    fail++;
    console.log("");
    continue;
  }

  const contractExports = extractContractExports(contractFile);
  const actualExports = extractActualExports(pkgDir);

  // 检查 1: 奐约声明的导出必须在实际代码中存在
  console.log("  STABLE 奐约导出检查:");
  let contractCount = 0;
  let missingCount = 0;

  for (const declared of contractExports) {
    contractCount++;
    if (actualExports.includes(declared)) {
      console.log("    ✅ " + declared + " — 存在");
    } else {
      console.log("    ❌ " + declared + " — 缺失（STABLE API 移除为破坏性变更）");
      missingCount++;
      fail++;
    }
  }

  if (missingCount > 0) {
    console.log("  ❌ " + missingCount + "/" + contractCount + " 个 STABLE 奐约导出缺失");
  } else if (contractCount > 0) {
    console.log("  ✅ " + contractCount + " 个 STABLE 奐约导出全部存在");
  }

  // 检查 2: 实际导出中不在契约里的导出（additive 变更警告）
  console.log("  新增导出检查（不在契约中的导出）:");
  let additiveCount = 0;

  for (const actual of actualExports) {
    if (!contractExports.includes(actual)) {
      console.log("    ⚠️  " + actual + " — 未在契约中声明（可能是 EXPERIMENTAL/INTERNAL）");
      additiveCount++;
      warn++;
    }
  }

  if (additiveCount > 0) {
    console.log("  ⚠️  " + additiveCount + " 个导出未在契约声明中");
  }

  console.log("");
}

// ── 检查 contracts 目录与 packages 目录对应 ──
console.log("契约文件完整性检查:");
for (const pkgName of packageNames) {
  const contractFile = path.join(contractsDir, pkgName + ".d.ts");
  if (!fs.existsSync(contractFile)) {
    console.log("  ⚠️  @cdf-know/" + pkgName + " — 缺少契约文件 " + contractFile);
    warn++;
  } else {
    console.log("  ✅ @cdf-know/" + pkgName + " — 契约文件存在");
  }
}
console.log("");

// ── 结果 ──
if (fail > 0) {
  console.log("❌ API 奐约检查未通过（存在 STABLE API 缺失）");
  process.exit(1);
}

if (warn > 0) {
  console.log("⚠️  API 奐约检查通过，但有新增导出未声明（建议在契约中补充或在 API_CONTRACTS.md 中标记）");
  process.exit(0);
}

console.log("✅ API 奐约检查全部通过");
process.exit(0);
