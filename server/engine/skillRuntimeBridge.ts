/*
 * Skill Runtime Bridge — 技能数据链路（P0-A）
 *
 * 背景（本次修复的"死区"）：
 * 仓库内存在三份互不相通的"技能"表示：
 *  1) src/types/skill-core.ts 的 BUILTIN_SKILLS（CDF WMS 产品功能技能）——已接 UI + matchingService。
 *  2) src/skills 与 skills 目录下的 SKILL.md（openclaw 搬运 22 个 + 业务/通用 12 个）
 *     ——由 skillLoader/skillRegistry 解析，但启动时从未加载、Agent 从未可见（真死区）。
 *  3) toolRegistry 中的原生工具（file_read/exec_command 等）——已接执行。
 *
 * 本模块打通表示 (2)：
 *  - 启动时扫描三级目录（builtin/user/workspace）并装入 skillRegistry。
 *  - 通过唯一的 skill 元工具（list / use）以"渐进式披露"方式暴露给 Agent，
 *    而不是把 34 个技能各注册成一个函数工具（会撑爆工具列表，且这些 SKILL.md
 *    是声明式指令文档而非可执行函数——直接注册为工具会在调用时报"无 instruction blocks"）。
 *
 * 设计要点：
 *  - skill 工具 list：返回可用技能目录（id/name/description/group/来源）。
 *  - skill 工具 use：返回指定技能的 SKILL.md 全文，Agent 据此学习如何用
 *    exec_command 等原生工具完成任务（等价于渐进式披露）。
 *  - 遵循 ~/.workbuddy/skills/.skills-disabled.json 的禁用集合。
 *  - 所有目录缺失均安全跳过（打包环境下 src/skills 不存在时不报错）。
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 技能系统双入口边界（与 skillToolBridge 的分工）                            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ 本文件（skillRuntimeBridge）= 「单一 `skill` 元工具」入口（渐进式披露），  │
 * │   面向**声明式 SKILL.md 文档**技能；是当前主力/权威路径，被 toolRegistry / │
 * │   skillRouter / skillLifecycle / matchingService 接线。                    │
 * │                                                                           │
 * │ 另一入口 skillToolBridge = 「逐技能 `skill_<id>` 函数工具」，面向**带可执行 │
 * │   handler** 的技能；当前仅被 toolExecutor.ts 使用。                        │
 * │                                                                           │
 * │ 选择规则：SKILL.md 指令文档 → 本文件的 skill 元工具；                       │
 * │           有真实 handler 的可执行技能 → skillToolBridge 的 skill_<id>。     │
 * │                                                                           │
 * │ 底层：两条入口最终都落到 skillRegistry；skillRuntime.ts 是更底层的运行时    │
 * │   封装（register/invoke/context），当前非测试代码未直接 import（基础抽象）。│
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../logger.js';
import { skillRegistry } from './skillRegistry.js';
import { loadSkills } from './skillLoader.js';
import { AppPaths } from '../config/appPaths.js';
import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';
import { auditSkillSecurity } from './skillSecurity.js';

/**
 * 起始目录：
 *  - 生产（esbuild 打包为 CommonJS）下 __dirname 原生可用；
 *  - dev（tsx/ESM，package.json type:module）下 __dirname 未定义，回退到 process.cwd()。
 * typeof 保护可安全探测标识符是否存在，避免 ReferenceError。
 */
function getStartDir(): string {
  return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
}

/**
 * 解析仓库根目录：向上查找同时含 package.json 与 skills 目录的目录（与 CLI
 * resolveRepoSkillsDir 判定一致），找不到返回 null。
 */
function resolveRepoRoot(): string | null {
  let dir = getStartDir();
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'skills'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

type SkillTier = 'builtin' | 'user' | 'workspace';

/**
 * 解析三级技能目录（去重，保持 builtin→user→workspace 顺序，
 * 后加载的同名技能覆盖先加载的，workspace 优先级最高）。
 */
export function resolveSkillScanDirs(): Array<{ dir: string; source: SkillTier }> {
  const raw: Array<{ dir: string; source: SkillTier }> = [];

  const repoRoot = resolveRepoRoot();
  if (repoRoot) {
    // 仓库内置：openclaw 搬运技能 + 业务/通用技能
    raw.push({ dir: path.join(repoRoot, 'src', 'skills'), source: 'builtin' });
    raw.push({ dir: path.join(repoRoot, 'skills'), source: 'builtin' });
  }

  // 应用数据目录下的技能（生产环境安装位置）
  raw.push({ dir: AppPaths.skillsDir, source: 'user' });
  // 用户全局技能（与 CLI/skill 管理保持一致）
  raw.push({ dir: path.join(os.homedir(), '.workbuddy', 'skills'), source: 'user' });
  // 当前工作区技能
  raw.push({ dir: path.join(process.cwd(), 'skills'), source: 'workspace' });

  // 按解析后绝对路径去重
  const seen = new Set<string>();
  const result: Array<{ dir: string; source: SkillTier }> = [];
  for (const entry of raw) {
    const resolved = path.resolve(entry.dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push({ dir: entry.dir, source: entry.source });
  }
  return result;
}

/** 读取禁用集合（~/.workbuddy/skills/.skills-disabled.json） */
function loadDisabledSet(): Set<string> {
  const file = path.join(os.homedir(), '.workbuddy', 'skills', '.skills-disabled.json');
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as { disabled?: string[] };
    return new Set(parsed.disabled ?? []);
  } catch {
    return new Set();
  }
}

/** 写入禁用集合（启用/禁用持久化，供 P2 生命周期管理调用） */
export function setSkillDisabled(id: string, disabled: boolean): void {
  const dir = path.join(os.homedir(), '.workbuddy', 'skills');
  const file = path.join(dir, '.skills-disabled.json');
  let set = new Set<string>();
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as { disabled?: string[] };
    set = new Set(parsed.disabled ?? []);
  } catch {
    set = new Set();
  }
  if (disabled) set.add(id);
  else set.delete(id);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ disabled: [...set] }, null, 2), 'utf-8');
  } catch (e) {
    logger.warn(`[SkillRuntime] 写入禁用集合失败: ${(e as Error).message}`);
  }
}

let initialized = false;

/**
 * 初始化技能运行时：扫描三级目录并装入 skillRegistry。
 * 幂等：重复调用直接返回。
 */
export async function initSkillRuntime(): Promise<{ loaded: number; dirs: number }> {
  if (initialized) {
    return { loaded: skillRegistry.getAllSkills().length, dirs: 0 };
  }

  const tiers = resolveSkillScanDirs();
  let totalLoaded = 0;
  let scannedDirs = 0;

  for (const { dir, source } of tiers) {
    if (!fs.existsSync(dir)) continue;
    scannedDirs++;
    const res = await loadSkills({ source, directory: dir });
    totalLoaded += res.loaded;
  }

  initialized = true;
  const stats = skillRegistry.getStats();
  logger.info(
    `[SkillRuntime] 技能数据链路已打通：装入 ${stats.total} 个技能（扫描 ${scannedDirs} 个目录）`,
    { bySource: stats.bySource, byGroup: stats.byGroup },
  );
  return { loaded: totalLoaded, dirs: scannedDirs };
}

/** 重置技能运行时（清空注册表 + 解除幂等锁），供 P2 生命周期热刷新调用 */
export async function resetSkillRuntime(): Promise<void> {
  try {
    await skillRegistry.shutdown();
  } catch (e) {
    logger.warn(`[SkillRuntime] 关闭注册表失败: ${(e as Error).message}`);
  }
  initialized = false;
}

/** 可用技能摘要（供 `skill list` 使用） */
interface SkillSummary {
  id: string;
  name: string;
  description: string;
  group: string;
  source: string;
  disabled: boolean;
}

/** 列出所有已加载技能（默认排除禁用项） */
export function listAvailableSkills(includeDisabled = false): SkillSummary[] {
  const disabled = loadDisabledSet();
  return skillRegistry
    .getAllSkills()
    .map((s) => ({
      id: s.definition.id,
      name: s.definition.name,
      description: s.definition.description,
      group: s.definition.group,
      source: s.definition.source,
      disabled: disabled.has(s.definition.id),
    }))
    .filter((s) => includeDisabled || !s.disabled)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 返回供 matchingService 匹配的 folder-skill 列表（P2-1a 智能技能路由·聚合层）。
 *
 * 吸收 openclaw discovery 方法论：把 P0-A 打通的声明式 folder-skill 聚合进
 * 统一匹配引擎——此前 matchingService.collectAllSkills 只收集 BUILTIN_SKILLS
 * 与用户自建技能，对 folder-skill（含 P1 搬入的 notion/trello/gh-issues 等）完全失明。
 *
 * 返回结构与 collectAllSkills 内联类型兼容；关键约定：
 *  - status 统一置为 'active'，以通过 match() 的 activeSkills 过滤（matchingService.ts:416
 *    仅放行 status==='active'），否则 folder-skill 仍会被 keyword/hybrid 排除。
 *  - category 取 definition.group；desc 取 definition.description；detail 取 SKILL.md 前 800 字
 *    （丰富 keyword 匹配语料；folder-skill 无 trigger 字段则留空）。
 *
 * @param excludeIds 调用方传入已收集的 BUILTIN/用户技能 ID，避免重复聚合。
 */
export function getFolderSkillsForMatching(
  excludeIds?: Set<string>,
): Array<{
  id: string;
  name: string;
  desc: string;
  trigger?: string;
  tags?: string[];
  detail?: string;
  category: string;
  status: string;
}> {
  const disabled = loadDisabledSet();
  const out: Array<{
    id: string;
    name: string;
    desc: string;
    trigger?: string;
    tags?: string[];
    detail?: string;
    category: string;
    status: string;
  }> = [];

  for (const s of skillRegistry.getAllSkills()) {
    const id = s.definition.id;
    if (disabled.has(id)) continue;
    if (excludeIds && excludeIds.has(id)) continue;
    const def = s.definition;
    const md = def.skillMdContent;
    out.push({
      id,
      name: def.name || id,
      desc: def.description || '',
      tags: Array.isArray(def.tags) ? def.tags : undefined,
      detail: md ? md.slice(0, 800) : def.description,
      category: def.group || 'util',
      status: 'active',
    });
  }
  return out;
}

/** 读取单个技能的 SKILL.md 全文（供 `skill use` 使用） */
export function getSkillInstructions(id: string): { found: boolean; content?: string; name?: string } {
  const skill = skillRegistry.getSkill(id);
  if (!skill) return { found: false };
  const content =
    skill.definition.skillMdContent ??
    (skill.definition.sourcePath
      ? readSkillMd(skill.definition.sourcePath)
      : undefined);
  return { found: true, content, name: skill.definition.name };
}

function readSkillMd(dir: string): string | undefined {
  try {
    return fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * 构建 `skill` 元工具定义。
 * description 动态嵌入当前可用技能目录，让模型无需先调用 list 即可感知可用技能。
 */
export function buildSkillToolDefinition(): ToolDefinition {
  const skills = listAvailableSkills();
  const catalog =
    skills.length > 0
      ? skills.map((s) => `- ${s.id}: ${s.description || s.name}`).join('\n')
      : '（当前无已加载技能）';

  return {
    type: 'function',
    function: {
      name: 'skill',
      description:
        '访问已安装的技能（Skill）。技能是"渐进式披露"的能力指令文档：先用 action="list" ' +
        '查看目录，再用 action="use" 读取某个技能的完整说明，然后按说明用其它工具（如 ' +
        'exec_command）完成任务。\n\n可用技能目录：\n' +
        catalog,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'use', 'doctor', 'security', 'reload'],
            description:
              'list=列出可用技能；use=读取指定技能完整指令；doctor=技能健康巡检；security=技能安全审计（需 id）；reload=热刷新技能目录',
          },
          id: {
            type: 'string',
            description: 'action=use 时必填，技能 ID（见目录，如 notion / trello / gog）',
          },
        },
        required: ['action'],
      },
    },
  };
}

/** `skill` 元工具处理器 */
export const skillToolHandler: ToolHandler = async (args) => {
  const action = String(args.action ?? '').trim();

  if (action === 'list') {
    const skills = listAvailableSkills();
    return JSON.stringify({
      success: true,
      count: skills.length,
      skills: skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        group: s.group,
        source: s.source,
      })),
    });
  }

  if (action === 'use') {
    const id = String(args.id ?? '').trim();
    if (!id) {
      return JSON.stringify({ success: false, error: 'action=use 需要提供 id' });
    }
    const detail = getSkillInstructions(id);
    if (!detail.found) {
      const available = listAvailableSkills().map((s) => s.id);
      return JSON.stringify({
        success: false,
        error: `技能 '${id}' 未找到`,
        available,
      });
    }
    if (!detail.content) {
      return JSON.stringify({
        success: false,
        error: `技能 '${id}' 无 SKILL.md 内容`,
      });
    }
    // P2 security：读取技能指令时同步做安全审计，让 Agent 在执行前了解风险
    const security = auditSkillSecurity(id);
    return JSON.stringify({
      success: true,
      id,
      name: detail.name,
      instructions: detail.content,
      security: {
        riskLevel: security.riskLevel,
        sandboxScope: security.sandboxScope,
        recommendedGate: security.recommendedGate,
        findings: security.findings,
      },
    });
  }

  if (action === 'security') {
    const id = String(args.id ?? '').trim();
    if (!id) {
      return JSON.stringify({ success: false, error: 'action=security 需要提供 id' });
    }
    const security = auditSkillSecurity(id);
    if (!security.found) {
      return JSON.stringify({ success: false, error: `技能 '${id}' 未找到` });
    }
    return JSON.stringify({ success: true, ...security });
  }

  if (action === 'doctor') {
    // 动态导入避免与 skillLifecycle 的循环依赖
    const { getSkillLifecycleStatus } = await import('./skillLifecycle.js');
    const status = getSkillLifecycleStatus();
    return JSON.stringify({
      success: true,
      total: status.total,
      enabled: status.enabled,
      disabled: status.disabled,
      healthy: status.healthy,
      unhealthy: status.unhealthy,
      skills: status.skills,
    });
  }

  if (action === 'reload') {
    const { reloadSkills } = await import('./skillLifecycle.js');
    const res = await reloadSkills();
    return JSON.stringify({ success: true, loaded: res.loaded, dirs: res.dirs });
  }

  return JSON.stringify({
    success: false,
    error: `未知 action '${action}'，支持 list / use / doctor / security / reload`,
  });
};
