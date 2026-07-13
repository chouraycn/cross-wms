import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { logger } from '../logger.js';
import { parseSkillMdContent } from '../services/skillMdParser.js';
import type { SkillDefinition, SkillLifecycle, RegisteredSkill, SkillState, SkillPermissionGroup, SkillGate, SandboxScope } from '../types/skill-runtime.js';
import { skillRegistry } from './skillRegistry.js';
import { extractFilesFromMarkerText } from './generatedFileAttachment.js';

export interface SkillLoadOptions {
  source: 'builtin' | 'workspace' | 'user';
  directory: string;
  filter?: (definition: SkillDefinition) => boolean;
  onLoad?: (skill: RegisteredSkill) => void;
}

export interface SkillLoadResult {
  total: number;
  loaded: number;
  failed: number;
  skipped: number;
  errors: Array<{ skillId: string; error: string }>;
}

// 放宽：允许连字符，以兼容 openclaw 技能命名（如 gh-issues / diagram-maker / nano-pdf）
const SKILL_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

function isValidSkillId(id: string): boolean {
  return SKILL_ID_PATTERN.test(id);
}

function mapCategoryToGroup(category?: string): SkillPermissionGroup {
  if (!category) return 'util';

  const mapping: Record<string, SkillPermissionGroup> = {
    'file': 'fs_read',
    'filesystem': 'fs_read',
    'fs': 'fs_read',
    'file-write': 'fs_write',
    'filesystem-write': 'fs_write',
    'exec': 'runtime_exec',
    'runtime': 'runtime_exec',
    'command': 'runtime_exec',
    'browser': 'browser',
    'web': 'browser',
    'network': 'network',
    'http': 'network',
    'memory': 'memory',
    'storage': 'memory',
    'wms': 'wms',
    'warehouse': 'wms',
    'inventory': 'wms',
    'system': 'system',
    'admin': 'system',
    'util': 'util',
    'utility': 'util',
    'tool': 'util',
    'custom': 'custom',
  };

  const lower = category.toLowerCase();
  return mapping[lower] || 'custom';
}

function mapGateField(fm: Record<string, unknown>): SkillGate {
  const gate = fm.gate as string | undefined;
  if (gate === 'manual' || gate === 'ask') return gate;
  return 'auto';
}

function mapSandboxField(fm: Record<string, unknown>): SandboxScope {
  const scope = fm.sandbox as string | undefined;
  if (scope === 'user' || scope === 'system' || scope === 'none') return scope;
  return 'workspace';
}

function extractInstructionBlocks(body: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:markdown|prompt|instruction)\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    const content = match[1].trim();
    if (content) {
      blocks.push(content);
    }
  }

  return blocks;
}

function buildParametersFromFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  if (fm.parameters && typeof fm.parameters === 'object') {
    return fm.parameters as Record<string, unknown>;
  }

  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

function parseSkillMdToDefinition(content: string, dirPath: string, source: 'builtin' | 'workspace' | 'user'): SkillDefinition | null {
  try {
    const parsed = parseSkillMdContent(content);
    if (parsed.hasError) {
      logger.warn(`[SkillLoader] SKILL.md 解析失败 (${dirPath}): ${parsed.errorMessage}`);
      return null;
    }

    const fm = parsed.frontmatter;
    const dirName = path.basename(dirPath);

    const skillId = dirName;
    if (!isValidSkillId(skillId)) {
      logger.warn(`[SkillLoader] Skill ID 不符合命名规范 '${skillId}' (目录: ${dirPath})`);
      return null;
    }

    const group = mapCategoryToGroup(fm.category);
    const gate = mapGateField(fm);
    const sandboxScope = mapSandboxField(fm);
    const instructionBlocks = extractInstructionBlocks(parsed.body);

    const definition: SkillDefinition = {
      id: skillId,
      name: fm.name || dirName,
      description: fm.description || '',
      group,
      parameters: buildParametersFromFrontmatter(fm),
      userInvocable: true,
      gate,
      sandboxScope,
      version: fm.version,
      author: fm.author,
      tags: fm.tags,
      source,
      sourcePath: dirPath,
      skillMdContent: content,
      instructionBlocks,
    };

    return definition;
  } catch (e) {
    logger.error(`[SkillLoader] 解析 SKILL.md 异常 (${dirPath}):`, e);
    return null;
  }
}

function createDeclarativeHandler(definition: SkillDefinition): SkillLifecycle['execute'] {
  return async (params, ctx) => {
    const startTime = Date.now();

    try {
      const instructions = definition.instructionBlocks ?? [];
      if (instructions.length === 0) {
        return {
          success: false,
          error: '声明式 Skill 无 instruction blocks，无法执行',
          metadata: { durationMs: Date.now() - startTime },
        };
      }

      const adapter = (definition.parameters as Record<string, unknown>)?.['__adapter'] as string | undefined;

      if (adapter === 'exec') {
        const command = instructions[0];
        const cmdCheck = ctx.sandbox.checkCommand(command);
        if (!cmdCheck.allowed) {
          return {
            success: false,
            error: `命令被沙箱拒绝: ${cmdCheck.reason}`,
            metadata: { durationMs: Date.now() - startTime, sandboxChecks: 1 },
          };
        }

        let finalCommand = command;
        for (const [key, value] of Object.entries(params)) {
          finalCommand = finalCommand.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        }

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const { stdout, stderr } = await execAsync(finalCommand, {
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        });

        // T3: 扫描 stdout/stderr 中的 FILE:|MEDIA: 标记，暴露落地文件路径供调度层 emit file 事件
        const markers = extractFilesFromMarkerText(`${stdout}\n${stderr}`);

        return {
          success: true,
          data: { stdout: stdout.trim(), stderr: stderr.trim(), generatedFilePaths: markers },
          metadata: { durationMs: Date.now() - startTime, sandboxChecks: 1 },
        };
      }

      if (adapter === 'http') {
        const urlTemplate = instructions[0];
        let url = urlTemplate;
        for (const [key, value] of Object.entries(params)) {
          url = url.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        }

        const urlCheck = ctx.sandbox.checkNetwork(url);
        if (!urlCheck.allowed) {
          return {
            success: false,
            error: `网络请求被沙箱拒绝: ${urlCheck.reason}`,
            metadata: { durationMs: Date.now() - startTime, sandboxChecks: 1 },
          };
        }

        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP 请求失败: ${response.status} ${response.statusText}`,
            metadata: { durationMs: Date.now() - startTime, sandboxChecks: 1 },
          };
        }

        const contentType = response.headers.get('content-type') ?? '';
        let data: unknown;
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        // T3: 扫描输出中的 FILE:|MEDIA: 标记，暴露落地文件路径供调度层 emit file 事件
        const markers = extractFilesFromMarkerText(typeof data === 'string' ? data : JSON.stringify(data));
        const httpData: Record<string, unknown> =
          typeof data === 'object' && data !== null ? { ...(data as object) } : { text: data };
        httpData.generatedFilePaths = markers;

        return {
          success: true,
          data: httpData,
          metadata: { durationMs: Date.now() - startTime, sandboxChecks: 1 },
        };
      }

      return {
        success: true,
        data: {
          type: 'prompt',
          instructions,
          params,
        },
        metadata: { durationMs: Date.now() - startTime },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        metadata: { durationMs: Date.now() - startTime },
      };
    }
  };
}

async function loadSkillFromDirectory(dirPath: string, source: 'builtin' | 'workspace' | 'user'): Promise<{ definition: SkillDefinition; lifecycle: SkillLifecycle } | null> {
  const skillMdPath = path.join(dirPath, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const definition = parseSkillMdToDefinition(content, dirPath, source);

    if (!definition) {
      return null;
    }

    const hasNativeEntry = fs.existsSync(path.join(dirPath, 'index.ts')) || fs.existsSync(path.join(dirPath, 'index.js'));
    // 标记 native，供 skill 元工具桥从 skill 目录中排除（native 走 skill_<id> 独立函数工具）
    definition.native = hasNativeEntry;

    let lifecycle: SkillLifecycle;

    if (hasNativeEntry) {
      const jsEntry = path.join(dirPath, 'index.js');
      const tsEntry = path.join(dirPath, 'index.ts');
      const entryPath = fs.existsSync(jsEntry) ? jsEntry : tsEntry;

      try {
        // ESM 运行时（tsx/ESM，package.json type:module）下 require 不可用，
        // 改用动态 import() + pathToFileURL，并追加 ?v= 时间戳以破坏模块缓存实现热重载。
        const moduleUrl = `${pathToFileURL(entryPath).href}?v=${Date.now()}`;
        const moduleExports = (await import(moduleUrl)) as Record<string, unknown>;

        if (typeof moduleExports.execute !== 'function') {
          logger.warn(`[SkillLoader] Native skill '${definition.id}' missing execute function, using declarative fallback.`);
          lifecycle = { execute: createDeclarativeHandler(definition) };
        } else {
          lifecycle = {
            init: typeof moduleExports.init === 'function' ? (moduleExports.init as SkillLifecycle['init']) : undefined,
            beforeExecute: typeof moduleExports.beforeExecute === 'function' ? (moduleExports.beforeExecute as SkillLifecycle['beforeExecute']) : undefined,
            execute: moduleExports.execute as SkillLifecycle['execute'],
            afterExecute: typeof moduleExports.afterExecute === 'function' ? (moduleExports.afterExecute as SkillLifecycle['afterExecute']) : undefined,
            cleanup: typeof moduleExports.cleanup === 'function' ? (moduleExports.cleanup as SkillLifecycle['cleanup']) : undefined,
          };
        }
      } catch (e) {
        logger.error(`[SkillLoader] Failed to load native skill '${definition.id}':`, e);
        lifecycle = { execute: createDeclarativeHandler(definition) };
      }
    } else {
      lifecycle = { execute: createDeclarativeHandler(definition) };
    }

    return { definition, lifecycle };
  } catch (e) {
    logger.error(`[SkillLoader] Failed to load skill from ${dirPath}:`, e);
    return null;
  }
}

export async function loadSkills(options: SkillLoadOptions): Promise<SkillLoadResult> {
  const { source, directory, filter, onLoad } = options;

  if (!fs.existsSync(directory)) {
    logger.debug(`[SkillLoader] Directory does not exist: ${directory}`);
    return { total: 0, loaded: 0, failed: 0, skipped: 0, errors: [] };
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (e) {
    logger.error(`[SkillLoader] Failed to read directory ${directory}:`, e);
    return { total: 0, loaded: 0, failed: 0, skipped: 0, errors: [] };
  }

  const skillDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

  const result: SkillLoadResult = {
    total: skillDirs.length,
    loaded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const entry of skillDirs) {
    const skillDir = path.join(directory, entry.name);

    const loaded = await loadSkillFromDirectory(skillDir, source);
    if (!loaded) {
      result.failed++;
      continue;
    }

    if (filter && !filter(loaded.definition)) {
      result.skipped++;
      continue;
    }

    const registered: RegisteredSkill = {
      definition: loaded.definition,
      lifecycle: loaded.lifecycle,
      state: 'enabled' as SkillState,
      registeredAt: Date.now(),
      executionCount: 0,
    };

    skillRegistry.registerSkill(loaded.definition, loaded.lifecycle);
    result.loaded++;

    if (onLoad) {
      try {
        onLoad(registered);
      } catch (e) {
        logger.error(`[SkillLoader] onLoad callback failed for ${loaded.definition.id}:`, e);
      }
    }
  }

  logger.info(`[SkillLoader] Loaded ${result.loaded}/${result.total} skills from ${directory} (${source})`);
  return result;
}

export async function loadAllSkills(scanConfig: {
  builtinDir: string;
  userGlobalDir: string;
  workspaceDir: string;
}): Promise<SkillLoadResult> {
  const results = await Promise.all([
    loadSkills({ source: 'builtin', directory: scanConfig.builtinDir }),
    loadSkills({ source: 'user', directory: scanConfig.userGlobalDir }),
    loadSkills({ source: 'workspace', directory: scanConfig.workspaceDir }),
  ]);

  return {
    total: results.reduce((sum, r) => sum + r.total, 0),
    loaded: results.reduce((sum, r) => sum + r.loaded, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
    skipped: results.reduce((sum, r) => sum + r.skipped, 0),
    errors: results.flatMap(r => r.errors),
  };
}

export async function reloadSkill(skillId: string): Promise<boolean> {
  const existing = skillRegistry.getSkill(skillId);
  if (!existing) {
    logger.warn(`[SkillLoader] Cannot reload: skill '${skillId}' not registered.`);
    return false;
  }

  const sourcePath = existing.definition.sourcePath;
  if (!sourcePath) {
    logger.warn(`[SkillLoader] Cannot reload: skill '${skillId}' has no sourcePath.`);
    return false;
  }

  const loaded = await loadSkillFromDirectory(sourcePath, existing.definition.source);
  if (!loaded) {
    logger.error(`[SkillLoader] Reload failed: cannot load skill from ${sourcePath}`);
    return false;
  }

  const registered: RegisteredSkill = {
    definition: loaded.definition,
    lifecycle: loaded.lifecycle,
    state: 'enabled' as SkillState,
    registeredAt: existing.registeredAt,
    lastExecutedAt: existing.lastExecutedAt,
    executionCount: existing.executionCount,
  };

  skillRegistry.registerSkill(loaded.definition, loaded.lifecycle);
  logger.info(`[SkillLoader] Reloaded skill: '${skillId}'`);
  return true;
}

export async function unloadSkill(skillId: string): Promise<boolean> {
  return skillRegistry.unregisterSkill(skillId);
}

export function listLoadedSkills(): RegisteredSkill[] {
  return skillRegistry.getAllSkills();
}

export function getSkillById(skillId: string): RegisteredSkill | undefined {
  return skillRegistry.getSkill(skillId);
}