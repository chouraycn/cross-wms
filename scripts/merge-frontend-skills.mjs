#!/usr/bin/env node
/**
 * 将孤儿的前端技能声明 (src/skills 下的 SKILL.md) 接入真实前端目录
 * shared/data/builtin-skills.json。
 *
 * 背景（2026-08-09 能力审计 + 后续"接入 builtin-skills.json"指令）：
 *  - src/skills 下是 22 个引擎风格的"全局/工具"技能声明（group: integration/util/
 *    media/dev/runtime_exec/fs_read/memory），schema 与前端 Skill 接口不同，且前端
 *    源码零引用 => 孤儿。
 *  - 前端真正消费的目录是 shared/data/builtin-skills.json（17 条 WMS 业务域技能），
 *    由 src/stores/skillStore.ts 懒加载渲染。
 *  - 本脚本把这 22 个技能映射为 Skill 接口条目并入目录，引擎原始字段（version/
 *    author/dependencies/permissions/parameters/正文）完整保真存入 standardFields。
 *
 * 幂等：已存在的 id 不会重复追加；如需强制刷新，先删除对应条目再运行。
 *
 * 约束：项目铁律——ESM 中 js-yaml 必须 `import * as yaml`（禁止默认导入）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const ROOT = process.cwd();
const SRC_SKILLS_DIR = path.join(ROOT, 'src/skills');
const CATALOG = path.join(ROOT, 'shared/data/builtin-skills.json');

/** id -> Material icon 名称（必须在 ICON_MAP / skill.tsx 中存在，否则渲染降级） */
const ICON_BY_ID = {
  blucli: 'Hub',
  calc: 'Calculate',
  camsnap: 'Extension',
  clawhub: 'Hub',
  exec_cmd: 'Terminal',
  fs_read: 'Description',
  gemini: 'SmartToy',
  gifgrep: 'Extension',
  github: 'Code',
  gog: 'Extension',
  imsg: 'Chat',
  memory_search: 'Memory',
  notion: 'Description',
  openhue: 'Extension',
  oracle: 'Hub',
  sag: 'Extension',
  songsee: 'Extension',
  spike: 'Build',
  tmux: 'Terminal',
  trello: 'Hub',
  weather: 'Extension',
  xurl: 'Webhook',
};

/** group -> SkillCategory（取值必须属于 skill-core.ts 的 SkillCategory 枚举） */
function categoryFor(group) {
  switch (group) {
    case 'dev':
      return 'development';
    case 'integration':
      return 'productivity';
    case 'media':
      return 'media';
    case 'memory':
      return 'ai-agent';
    case 'runtime_exec':
    case 'fs_read':
    case 'util':
    default:
      return 'tool';
  }
}

/** Skill 接口必填字段（来自 src/types/skill-core.ts） */
const REQUIRED = ['id', 'name', 'desc', 'icon', 'category', 'path', 'status', 'source'];

function parseSkillMd(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return null;
  const fm = (yaml.load(m[1]) || {});
  const body = m[2] || '';
  return { fm, body, rawFm: m[1] };
}

function buildEntry({ fm, body, rawFm }) {
  const id = fm.id;
  const group = fm.group || 'tool';
  const requires = fm.requires || {};
  const bins = Array.isArray(requires.bins) ? requires.bins : [];
  const os = Array.isArray(requires.os) ? requires.os : [];
  const depNames = [...bins, ...os.map((o) => `os:${o}`)];
  const gate = fm.gate;
  const permissions = gate
    ? [{ name: `gate:${gate}`, description: `执行网关策略: ${gate}` }]
    : undefined;
  const standardFields = {
    version: fm.version,
    author: fm.author,
    dependencies: depNames.length ? depNames : undefined,
    permissions: gate ? [gate] : undefined,
    instructionBlocks: [
      body.trim(),
      `Frontmatter:\n${rawFm.trim()}`,
    ].filter(Boolean),
  };
  const requiresNote = depNames.length ? `依赖: ${depNames.join(', ')}。` : '';
  const promptTemplate =
    `你是「${fm.name}」助手。当用户需要「${fm.description}」相关操作时，调用 ${id} ` +
    `工具/技能完成。注意：该技能的网关约束 gate=${gate || 'auto'}，沙箱范围 ` +
    `sandboxScope=${fm.sandboxScope || 'none'}；${requiresNote}请在确实匹配用户意图时使用，避免无关调用。`;

  const entry = {
    id,
    name: fm.name,
    desc: fm.description,
    icon: ICON_BY_ID[id] || 'Extension',
    category: categoryFor(group),
    path: '',
    trigger: `使用 ${fm.name}`,
    detail: fm.description,
    tags: [group],
    status: 'available',
    version: fm.version || '1.0',
    featured: false,
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate,
    standardFields,
  };
  if (permissions) entry.permissions = permissions;
  return entry;
}

function validateEntry(e, file) {
  // path 允许空字符串（工具类技能无专属导航页）；其余必填字段不允许 undefined/null。
  const missing = REQUIRED.filter((k) => e[k] === undefined || e[k] === null);
  if (missing.length) {
    throw new Error(`[${e.id}] 缺少必填字段: ${missing.join(', ')} (来源 ${file})`);
  }
  if (!['active', 'available', 'coming'].includes(e.status)) {
    throw new Error(`[${e.id}] 非法 status: ${e.status}`);
  }
  if (!['builtin', 'user'].includes(e.source)) {
    throw new Error(`[${e.id}] 非法 source: ${e.source}`);
  }
}

function main() {
  if (!fs.existsSync(SRC_SKILLS_DIR)) {
    console.error(`✗ 未找到 ${SRC_SKILLS_DIR}`);
    process.exit(1);
  }
  const skillFiles = fs
    .readdirSync(SRC_SKILLS_DIR)
    .map((d) => path.join(SRC_SKILLS_DIR, d, 'SKILL.md'))
    .filter((f) => fs.existsSync(f))
    .sort();

  if (!fs.existsSync(CATALOG)) {
    console.error(`✗ 未找到目录文件 ${CATALOG}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const existingIds = new Set(catalog.map((s) => s.id));

  const added = [];
  const skipped = [];
  for (const f of skillFiles) {
    const parsed = parseSkillMd(f);
    if (!parsed || !parsed.fm || !parsed.fm.id) {
      console.warn(`! 跳过无法解析的 ${f}`);
      continue;
    }
    const id = parsed.fm.id;
    if (existingIds.has(id)) {
      skipped.push(id);
      continue;
    }
    const entry = buildEntry(parsed);
    validateEntry(entry, f);
    catalog.push(entry);
    existingIds.add(id);
    added.push(id);
  }

  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

  console.log('=== merge-frontend-skills 完成 ===');
  console.log(`源 src/skills 技能文件: ${skillFiles.length}`);
  console.log(`新增接入: ${added.length} -> ${added.join(', ') || '(无)'}`);
  console.log(`已存在跳过: ${skipped.length} -> ${skipped.join(', ') || '(无)'}`);
  console.log(`目录总条目: ${catalog.length}（原 ${catalog.length - added.length}）`);
  console.log(added.length ? '✓ 已写入 shared/data/builtin-skills.json' : '✓ 无新增（全部已接入）');
}

main();
