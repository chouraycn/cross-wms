#!/usr/bin/env node
/**
 * 校验 src/skills 的引擎风格全局技能是否已全部接入前端真实目录
 * shared/data/builtin-skills.json。
 *
 * 背景（2026-08-09 能力审计 + 后续"接入 builtin-skills.json"指令）：
 *  - src/skills 下是 22 个引擎风格的"全局/工具"技能声明（group: integration/util/
 *    media/dev/runtime_exec/fs_read/memory），前端源码零引用，曾为孤儿声明。
 *  - 2026-08-09 通过 scripts/merge-frontend-skills.mjs 把这 22 个技能映射为 Skill
 *    接口条目并入 shared/data/builtin-skills.json（前端 skillStore 真正消费的目录）。
 *  - 本脚本校验"接入"是否完整：每个 src/skills id 都必须存在于 builtin-skills.json；
 *    若存在缺失，以非零码退出，可作 CI 门禁。
 *
 * 注意：src/skills 仍是这批全局技能的权威源；builtin-skills.json 由 merge 脚本生成。
 * 二者应保持一致。如需刷新目录，运行 merge-frontend-skills.mjs（幂等）。
 *
 * 约束：项目铁律——ESM 中 js-yaml 必须 `import * as yaml`（禁止默认导入）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const ROOT = process.cwd();
const SRC_SKILLS_DIR = path.join(ROOT, 'src/skills');
const CATALOG = path.join(ROOT, 'shared/data/builtin-skills.json');

function parseId(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return null;
  const fm = yaml.load(m[1]) || {};
  return fm.id || null;
}

function main() {
  if (!fs.existsSync(SRC_SKILLS_DIR)) {
    console.error(`✗ 未找到 ${SRC_SKILLS_DIR}`);
    process.exit(1);
  }
  const srcIds = fs
    .readdirSync(SRC_SKILLS_DIR)
    .map((d) => path.join(SRC_SKILLS_DIR, d, 'SKILL.md'))
    .filter((f) => fs.existsSync(f))
    .map(parseId)
    .filter(Boolean)
    .sort();

  if (!fs.existsSync(CATALOG)) {
    console.error(`✗ 未找到目录文件 ${CATALOG}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const catalogIds = new Set(catalog.map((s) => s.id));

  const integrated = srcIds.filter((id) => catalogIds.has(id));
  const missing = srcIds.filter((id) => !catalogIds.has(id));

  // 目录内重复 id 检测
  const seen = new Set();
  const dupes = catalog
    .map((s) => s.id)
    .filter((id) => (seen.has(id) ? true : (seen.add(id), false)));

  console.log('=== check-frontend-skills（接入校验）===');
  console.log(`src/skills 技能数: ${srcIds.length}`);
  console.log(`已接入目录: ${integrated.length} -> ${integrated.join(', ') || '(无)'}`);
  console.log(`缺失未接入: ${missing.length} -> ${missing.join(', ') || '(无)'}`);
  console.log(`目录总条目: ${catalog.length}；目录内重复 id: ${dupes.length ? dupes.join(', ') : '(无)'}`);

  if (missing.length || dupes.length) {
    console.log('✗ 接入不完整或存在重复，请运行 scripts/merge-frontend-skills.mjs');
    process.exit(1);
  }
  console.log('✓ 全部 src/skills 已接入 builtin-skills.json，无重复');
}

main();
