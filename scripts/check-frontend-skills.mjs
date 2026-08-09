#!/usr/bin/env node
/**
 * check-frontend-skills.mjs
 *
 * 诊断 `src/skills/*` 这套"前端声明式技能"的真实状态。
 *
 * 背景（2026-08-09 能力审计结论，已实测校正）：
 *  - src/skills 下的 SKILL.md 采用前端专属 schema（name/id/description/group/requires/
 *    userInvocable/gate/sandboxScope），与引擎 server/engine/skills/builtin 目录的 schema
 *    不同；且前端源码中既无 import 也无 import.meta.glob 消费它 => 当前是**孤儿声明**。
 *  - 前端实际使用的技能目录是 shared/data/builtin-skills.json（17 条），而非 src/skills。
 *
 * 本脚本输出三路交叉比对，供决定"接线"或"删除"：
 *   1) src/skills 中、但未出现在 shared/data/builtin-skills.json 的（孤儿）；
 *   2) src/skills 与引擎 builtin 同 id 的（概念重叠，需保持同步）；
 *   3) src/skills 中有实现文件（非仅 SKILL.md）的（潜在可执行技能）。
 *
 * 用法：node scripts/check-frontend-skills.mjs
 * 退出码：0（纯诊断，不阻断 CI）；发现结构性问题时在 stdout 中以 [WARN] 标注。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseIdFromSkillMd(mdPath) {
  const text = fs.readFileSync(mdPath, "utf-8");
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fm) return null;
  for (const line of fm[1].split("\n")) {
    const m = line.match(/^id:\s*(.+?)\s*$/);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, "");
  }
  // 回退：用目录名作为 id
  return path.basename(path.dirname(mdPath));
}

function listDirs(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

// 1) src/skills 声明
const srcSkillsDir = path.join(ROOT, "src", "skills");
const srcIds = listDirs(srcSkillsDir).map((name) => {
  const md = path.join(srcSkillsDir, name, "SKILL.md");
  return {
    dir: name,
    id: fs.existsSync(md) ? parseIdFromSkillMd(md) : name,
    hasImpl: fs
      .readdirSync(path.join(srcSkillsDir, name))
      .some((f) => f !== "SKILL.md" && f !== "skill.md"),
  };
});

// 2) 真实前端目录（shared/data/builtin-skills.json）
const uiCatalogPath = path.join(ROOT, "shared", "data", "builtin-skills.json");
let uiIds = new Set();
if (fs.existsSync(uiCatalogPath)) {
  const data = JSON.parse(fs.readFileSync(uiCatalogPath, "utf-8"));
  uiIds = new Set(data.map((s) => s.id || s.name));
}

// 3) 引擎 builtin（上游真相源，按目录名）
const engineBuiltinDir = path.join(ROOT, "server", "engine", "skills", "builtin");
const engineIds = new Set(listDirs(engineBuiltinDir));

// 交叉比对
const srcIdSet = new Set(srcIds.map((s) => s.id));
const orphanFromUi = srcIds.filter((s) => !uiIds.has(s.id));
const overlapWithEngine = srcIds.filter((s) => engineIds.has(s.id));
const withImpl = srcIds.filter((s) => s.hasImpl);

console.log("=== src/skills 孤儿 / 重叠诊断 ===");
console.log(`src/skills 声明总数        : ${srcIds.length}`);
console.log(`前端真实目录 UI 条目数     : ${uiIds.size}`);
console.log(`引擎 builtin 上游技能数    : ${engineIds.size}`);
console.log("");

console.log(`[1] 未进入前端真实目录 (${orphanFromUi.length}):`);
orphanFromUi.forEach((s) => console.log(`    - ${s.id}  (dir=${s.dir})`));

console.log(`\n[2] 与引擎 builtin 同 id（概念重叠，需同步）(${overlapWithEngine.length}):`);
overlapWithEngine.forEach((s) => console.log(`    - ${s.id}`));

console.log(`\n[3] 含实现文件（非仅 SKILL.md）(${withImpl.length}):`);
withImpl.forEach((s) => console.log(`    - ${s.id}  (dir=${s.dir})`));

console.log("\n=== 结论 ===");
if (orphanFromUi.length === srcIds.length) {
  console.log(
    "[WARN] src/skills 全部未进入前端真实技能目录 shared/data/builtin-skills.json，" +
      "且前端源码无 import/import.meta.glob 消费 => 当前为孤儿声明（legacy）。",
  );
  console.log("       建议：要么在构建期把 src/skills 接入 builtin-skills.json，要么删除该目录。");
} else {
  console.log("[OK] src/skills 部分已对接前端真实目录。");
}
if (withImpl.length === 0) {
  console.log("[WARN] src/skills 下无任何实现文件，纯元数据声明。");
}
console.log("（本脚本为诊断用途，退出码 0，不阻断构建）");
