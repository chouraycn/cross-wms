/**
 * Skill Registry — Skill 全局注册表
 *
 * Skill 四层架构的核心组件，管理 Skill 的完整生命周期：
 * - 发现（扫描三级目录）→ 校验 → 注册 → 启用 → 执行 → 清理
 *
 * 核心功能：
 * 1. init(scanConfig) — 初始化注册表，扫描三级目录
 * 2. scanSkillDirectories() — 扫描三级目录，按优先级覆盖
 * 3. registerSkill(definition, lifecycle) — 注册单个 Skill
 * 4. unregisterSkill(id) — 注销 Skill
 * 5. getSkill(id) — 获取注册的 Skill
 * 6. getAllSkills() — 获取所有 Skill
 * 7. getSkillsForAgent(permissionConfig) — 获取 Agent 允许的 Skill 列表
 * 8. executeSkill(id, params, ctx) — 执行 Skill（含生命周期钩子）
 * 9. getToolDefinitions(skills) — 将 Skill 定义转换为 OpenAI Tool 格式
 * 10. reloadSkill(id) — 热重载单个 Skill
 * 11. shutdown() — 关闭所有 Skill，执行 cleanup
 *
 * 三级目录扫描优先级：workspace > user > builtin（后加载覆盖同名 Skill）
 * 声明式 Skill（无 index.ts）使用内置通用适配器
 * 原生代码 Skill（有 index.ts）动态 import 加载
 */

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { parseSkillMdContent, extractPromptTemplate } from '../services/skillMdParser.js';
import { createSkillContext } from './skillContextFactory.js';
import type {
  SkillDefinition,
  SkillContext,
  SkillLifecycle,
  SkillResult,
  SkillHandler,
  RegisteredSkill,
  SkillScanConfig,
  SkillPermissionConfig,
  SkillState,
  SkillPermissionGroup,
  SkillGate,
  SandboxScope,
} from '../types/skill-runtime.js';
import type { ToolDefinition } from '../aiClient.js';

// ===================== Skill ID 校验 =====================

/** Skill ID 命名规范正则：小写字母 + 下划线 + 数字 */
const SKILL_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * 校验 Skill ID 是否符合命名规范
 */
function isValidSkillId(id: string): boolean {
  return SKILL_ID_PATTERN.test(id);
}

// ===================== 声明式 Skill 适配器 =====================

/**
 * 为声明式 Skill（零代码，仅 SKILL.md）创建通用执行处理器。
 *
 * 声明式 Skill 的执行逻辑：
 * 1. 将 SKILL.md 的 instruction blocks 作为 prompt template
 * 2. 返回 prompt 内容作为 data（由上层 Agent 框架消费）
 *
 * 如果 SKILL.md 中声明了 adapter 字段，可使用内置适配器：
 * - 'http': 将 instruction 作为 HTTP 请求模板执行
 * - 'exec': 将 instruction 作为 shell 命令执行
 */
function createDeclarativeHandler(
  definition: SkillDefinition,
): SkillHandler {
  return async (
    params: Record<string, unknown>,
    ctx: SkillContext,
  ): Promise<SkillResult> => {
    const startTime = Date.now();

    try {
      // 获取 instruction blocks
      const instructions = definition.instructionBlocks ?? [];
      if (instructions.length === 0) {
        return {
          success: false,
          error: '声明式 Skill 无 instruction blocks，无法执行',
          metadata: { durationMs: Date.now() - startTime },
        };
      }

      // 检查是否声明了适配器类型
      const adapter = (definition.parameters as Record<string, unknown>)?.['__adapter'] as string | undefined;

      if (adapter === 'exec') {
        // exec 适配器：将第一个 instruction 作为命令执行
        const command = instructions[0];
        const cmdCheck = ctx.sandbox.checkCommand(command);
        if (!cmdCheck.allowed) {
          return {
            success: false,
            error: `命令被沙箱拒绝: ${cmdCheck.reason}`,
            metadata: { durationMs: Date.now() - startTime, sandboxChecks: 1 },
          };
        }

        // 替换参数占位符
        let finalCommand = command;
        for (const [key, value] of Object.entries(params)) {
          finalCommand = finalCommand.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        }

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const { stdout, stderr } = await execAsync(finalCommand, {
          timeout: 30_000,
          maxBuffer: 1024 * 1024, // 1MB
        });

        return {
          success: true,
          data: { stdout: stdout.trim(), stderr: stderr.trim() },
          metadata: { durationMs: Date.now() - startTime, sandboxChecks: 1 },
        };
      }

      if (adapter === 'http') {
        // http 适配器：将 instruction 作为 URL 模板执行 GET 请求
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

        return {
          success: true,
          data,
          metadata: { durationMs: Date.now() - startTime, sandboxChecks: 1 },
        };
      }

      // 默认：返回 prompt 模板内容（由上层 Agent 框架消费）
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

// ===================== SKILL.md → SkillDefinition 转换 =====================

/**
 * 从 SKILL.md 内容解析并构建 SkillDefinition
 *
 * @param content - SKILL.md 文件内容
 * @param dirPath - SKILL.md 所在目录的绝对路径
 * @param source - 来源类型
 * @returns SkillDefinition 或 null（解析失败）
 */
function parseSkillMdToDefinition(
  content: string,
  dirPath: string,
  source: 'builtin' | 'workspace' | 'user',
): SkillDefinition | null {
  try {
    const parsed = parseSkillMdContent(content);
    if (parsed.hasError) {
      logger.warn(`[SkillRegistry] SKILL.md 解析失败 (${dirPath}): ${parsed.errorMessage}`);
      return null;
    }

    const fm = parsed.frontmatter;
    const dirName = path.basename(dirPath);

    // 使用目录名作为 Skill ID（必须符合命名规范）
    const skillId = dirName;
    if (!isValidSkillId(skillId)) {
      logger.warn(`[SkillRegistry] Skill ID 不符合命名规范 '${skillId}' (目录: ${dirPath})`);
      return null;
    }

    // 解析 group 字段（映射到 SkillPermissionGroup）
    const group = mapCategoryToGroup(fm.category);

    // 解析 gate 字段
    const gate = mapGateField(fm);

    // 解析 sandbox scope
    const sandboxScope = mapSandboxField(fm);

    // 提取 instruction blocks
    const instructionBlocks = extractInstructionBlocks(parsed.body);

    // 构建 SkillDefinition
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
    logger.error(`[SkillRegistry] 解析 SKILL.md 异常 (${dirPath}):`, e);
    return null;
  }
}

/**
 * 将 SKILL.md category 字段映射到 SkillPermissionGroup
 */
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

/**
 * 解析 gate 字段
 */
function mapGateField(fm: Record<string, unknown>): SkillGate {
  const gate = fm.gate as string | undefined;
  if (gate === 'manual' || gate === 'ask') return gate;
  return 'auto';
}

/**
 * 解析 sandbox scope 字段
 */
function mapSandboxField(fm: Record<string, unknown>): SandboxScope {
  const scope = fm.sandbox as string | undefined;
  if (scope === 'user' || scope === 'system' || scope === 'none') return scope;
  return 'workspace';
}

/**
 * 从 frontmatter 构建 parameters JSON Schema
 */
function buildParametersFromFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  // 如果 frontmatter 中有 parameters 字段，直接使用
  if (fm.parameters && typeof fm.parameters === 'object') {
    return fm.parameters as Record<string, unknown>;
  }

  // 否则构建默认的空参数 schema
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

/**
 * 从 SKILL.md body 提取 instruction 代码块
 */
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

// ===================== SkillRegistry 类 =====================

/**
 * Skill 全局注册表（Module-level Singleton）
 *
 * 管理 Skill 的发现、注册、执行、重载和清理。
 * 三级目录扫描优先级：workspace > user > builtin（后加载覆盖同名 Skill）。
 */
class SkillRegistry {
  private static instance: SkillRegistry;

  /** 注册表：skillId → RegisteredSkill */
  private registry = new Map<string, RegisteredSkill>();

  /** 扫描配置 */
  private scanConfig: SkillScanConfig | null = null;

  /** 是否已初始化 */
  private initialized = false;

  /** 动态加载的模块缓存（skillId → module exports），用于热重载时清除 */
  private loadedModules = new Map<string, unknown>();

  private constructor() {}

  /** 获取单例实例 */
  static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  // ===================== 1. 初始化 =====================

  /**
   * 初始化注册表，扫描三级目录
   *
   * @param config - 扫描配置
   */
  async init(config: SkillScanConfig): Promise<void> {
    if (this.initialized) {
      logger.warn('[SkillRegistry] Already initialized, skipping.');
      return;
    }

    this.scanConfig = config;
    logger.info('[SkillRegistry] Initializing with config:', {
      workspace: config.workspaceDir,
      user: config.userGlobalDir,
      builtin: config.builtinDir,
    });

    // 扫描三级目录
    await this.scanSkillDirectories();

    this.initialized = true;
    logger.info(`[SkillRegistry] Initialized. Total skills: ${this.registry.size}`);
  }

  // ===================== 2. 目录扫描 =====================

  /**
   * 扫描三级目录，按优先级覆盖
   *
   * 加载顺序：builtin → user → workspace
   * 后加载的同名 Skill 会覆盖先加载的（workspace 优先级最高）。
   */
  async scanSkillDirectories(): Promise<void> {
    if (!this.scanConfig) {
      logger.error('[SkillRegistry] scanConfig not set, cannot scan.');
      return;
    }

    const { builtinDir, userGlobalDir, workspaceDir } = this.scanConfig;

    // 按优先级从低到高加载（后加载覆盖）
    await this.scanDirectory(builtinDir, 'builtin');
    await this.scanDirectory(userGlobalDir, 'user');
    await this.scanDirectory(workspaceDir, 'workspace');
  }

  /**
   * 扫描单个目录下的所有 Skill
   *
   * 遍历目录中的子目录，查找 SKILL.md 文件，
   * 解析后注册 Skill（同名覆盖）。
   */
  private async scanDirectory(dir: string, source: 'builtin' | 'workspace' | 'user'): Promise<void> {
    // 目录不存在则跳过
    if (!fs.existsSync(dir)) {
      logger.debug(`[SkillRegistry] Scan directory does not exist, skipping: ${dir}`);
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      logger.error(`[SkillRegistry] Failed to read directory ${dir}:`, e);
      return;
    }

    let discovered = 0;
    let failed = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // 跳过隐藏目录
      if (entry.name.startsWith('.')) continue;

      const skillDir = path.join(dir, entry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');

      // 检查 SKILL.md 是否存在
      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const definition = parseSkillMdToDefinition(content, skillDir, source);

        if (!definition) {
          failed++;
          continue;
        }

        // 检查是否有原生代码入口（index.ts / index.js）
        const hasNativeEntry = this.hasNativeEntry(skillDir);

        // 创建生命周期
        const lifecycle = hasNativeEntry
          ? await this.createNativeLifecycle(definition, skillDir)
          : this.createDeclarativeLifecycle(definition);

        // 注册（同名覆盖）
        this.registerSkill(definition, lifecycle);
        discovered++;
      } catch (e) {
        failed++;
        logger.error(`[SkillRegistry] Failed to scan skill '${entry.name}':`, e);
      }
    }

    logger.info(`[SkillRegistry] Scanned ${source} directory '${dir}': discovered=${discovered}, failed=${failed}`);
  }

  /**
   * 检查 Skill 目录是否有原生代码入口
   */
  private hasNativeEntry(skillDir: string): boolean {
    return (
      fs.existsSync(path.join(skillDir, 'index.ts')) ||
      fs.existsSync(path.join(skillDir, 'index.js'))
    );
  }

  /**
   * 为声明式 Skill（无 index.ts）创建生命周期
   */
  private createDeclarativeLifecycle(definition: SkillDefinition): SkillLifecycle {
    return {
      execute: createDeclarativeHandler(definition),
    };
  }

  /**
   * 为原生代码 Skill（有 index.ts）创建生命周期
   *
   * 动态 import 加载 Skill 模块，期望导出 SkillLifecycle 接口。
   */
  private async createNativeLifecycle(
    definition: SkillDefinition,
    skillDir: string,
  ): Promise<SkillLifecycle> {
    // 优先加载 .js，其次 .ts（开发环境）
    const jsEntry = path.join(skillDir, 'index.js');
    const tsEntry = path.join(skillDir, 'index.ts');
    const entryPath = fs.existsSync(jsEntry) ? jsEntry : tsEntry;

    try {
      // 清除模块缓存以支持热重载
      const modulePath = require.resolve(entryPath);
      delete require.cache[modulePath];

      const moduleExports = require(entryPath) as Record<string, unknown>;
      this.loadedModules.set(definition.id, moduleExports);

      // 验证导出的 lifecycle 结构
      if (typeof moduleExports.execute !== 'function') {
        logger.warn(`[SkillRegistry] Native skill '${definition.id}' missing execute function, using declarative fallback.`);
        return this.createDeclarativeLifecycle(definition);
      }

      return {
        init: typeof moduleExports.init === 'function'
          ? (moduleExports.init as SkillLifecycle['init'])
          : undefined,
        beforeExecute: typeof moduleExports.beforeExecute === 'function'
          ? (moduleExports.beforeExecute as SkillLifecycle['beforeExecute'])
          : undefined,
        execute: moduleExports.execute as SkillHandler,
        afterExecute: typeof moduleExports.afterExecute === 'function'
          ? (moduleExports.afterExecute as SkillLifecycle['afterExecute'])
          : undefined,
        cleanup: typeof moduleExports.cleanup === 'function'
          ? (moduleExports.cleanup as SkillLifecycle['cleanup'])
          : undefined,
      };
    } catch (e) {
      logger.error(`[SkillRegistry] Failed to load native skill '${definition.id}':`, e);
      // 降级为声明式
      return this.createDeclarativeLifecycle(definition);
    }
  }

  // ===================== 3. 注册/注销 =====================

  /**
   * 注册单个 Skill
   *
   * @param definition - Skill 定义
   * @param lifecycle - 生命周期钩子
   * @returns 是否注册成功
   */
  registerSkill(definition: SkillDefinition, lifecycle: SkillLifecycle): boolean {
    if (!isValidSkillId(definition.id)) {
      logger.error(`[SkillRegistry] Invalid skill ID: '${definition.id}'`);
      return false;
    }

    const existing = this.registry.get(definition.id);
    if (existing) {
      logger.info(`[SkillRegistry] Overwriting existing skill: '${definition.id}' (was source=${existing.definition.source})`);
    }

    const registered: RegisteredSkill = {
      definition,
      lifecycle,
      state: 'enabled',
      registeredAt: Date.now(),
      executionCount: 0,
    };

    this.registry.set(definition.id, registered);
    logger.debug(`[SkillRegistry] Registered skill: '${definition.id}' (${definition.source})`);
    return true;
  }

  /**
   * 注销 Skill
   *
   * @param id - Skill ID
   * @returns 是否注销成功
   */
  async unregisterSkill(id: string): Promise<boolean> {
    const skill = this.registry.get(id);
    if (!skill) {
      return false;
    }

    // 执行 cleanup 钩子
    if (skill.lifecycle.cleanup) {
      try {
        const ctx = createSkillContext({
          skillId: id,
          sessionId: uuidv4(),
          workspace: this.scanConfig?.workspaceDir || osHomedir(),
        });
        await skill.lifecycle.cleanup(ctx);
      } catch (e) {
        logger.error(`[SkillRegistry] Cleanup failed for skill '${id}':`, e);
      }
    }

    // 清除模块缓存
    this.loadedModules.delete(id);

    // 从注册表移除
    this.registry.delete(id);
    logger.info(`[SkillRegistry] Unregistered skill: '${id}'`);
    return true;
  }

  // ===================== 4. 查询 =====================

  /**
   * 获取注册的 Skill
   *
   * @param id - Skill ID
   * @returns RegisteredSkill 或 undefined
   */
  getSkill(id: string): RegisteredSkill | undefined {
    return this.registry.get(id);
  }

  /**
   * 获取所有 Skill
   *
   * @returns 所有注册的 Skill 列表
   */
  getAllSkills(): RegisteredSkill[] {
    return Array.from(this.registry.values());
  }

  /**
   * 获取 Agent 允许的 Skill 列表（权限过滤）
   *
   * @param config - 权限配置
   * @returns 过滤后的 Skill 列表
   */
  getSkillsForAgent(config: SkillPermissionConfig): RegisteredSkill[] {
    const allSkills = this.getAllSkills();

    return allSkills.filter((skill) => {
      const { definition } = skill;

      // 检查 deny 列表（deny 优先）
      if (this.matchPermission(definition, config.deny)) {
        return false;
      }

      // 检查 allow 列表（空 allow = 全部允许）
      if (config.allow.length > 0 && !this.matchPermission(definition, config.allow)) {
        return false;
      }

      // 检查状态
      if (skill.state !== 'enabled' && skill.state !== 'active' && skill.state !== 'idle') {
        return false;
      }

      // 检查 userInvocable
      if (definition.userInvocable === false) {
        return false;
      }

      return true;
    });
  }

  /**
   * 检查 Skill 是否匹配权限列表
   *
   * 支持精确匹配 skill id 和 group 匹配，以及通配符 *。
   */
  private matchPermission(definition: SkillDefinition, list: string[]): boolean {
    for (const pattern of list) {
      if (pattern === '*') return true;
      if (pattern === definition.id) return true;
      if (pattern === definition.group) return true;
      // 支持 group:* 通配符（如 wms:*）
      if (pattern.endsWith(':*') && definition.group === pattern.slice(0, -2)) {
        return true;
      }
    }
    return false;
  }

  // ===================== 5. 执行 =====================

  /**
   * 执行 Skill（含完整生命周期钩子）
   *
   * 执行顺序：beforeExecute → execute → afterExecute
   *
   * @param id - Skill ID
   * @param params - 执行参数
   * @param ctx - 执行上下文（可选，不传则自动创建）
   * @returns 执行结果
   */
  async executeSkill(
    id: string,
    params: Record<string, unknown>,
    ctx?: SkillContext,
  ): Promise<SkillResult> {
    const skill = this.registry.get(id);
    if (!skill) {
      return {
        success: false,
        error: `Skill '${id}' 未注册或不存在`,
      };
    }

    // 状态检查
    if (skill.state !== 'enabled' && skill.state !== 'active' && skill.state !== 'idle') {
      return {
        success: false,
        error: `Skill '${id}' 当前状态不可执行: ${skill.state}`,
      };
    }

    // 更新状态
    skill.state = 'running';

    // 创建上下文（如果未提供）
    const execCtx = ctx ?? createSkillContext({
      skillId: id,
      sessionId: uuidv4(),
      workspace: this.scanConfig?.workspaceDir || osHomedir(),
      sandboxScope: skill.definition.sandboxScope,
    });

    const startTime = Date.now();

    try {
      // 1. beforeExecute 钩子
      let finalParams = params;
      if (skill.lifecycle.beforeExecute) {
        const modified = await skill.lifecycle.beforeExecute(params, execCtx);
        if (modified === null) {
          // 返回 null 表示跳过执行
          skill.state = 'idle';
          return {
            success: true,
            data: null,
            metadata: { durationMs: Date.now() - startTime },
          };
        }
        finalParams = modified;
      }

      // 2. execute 核心执行
      let result = await skill.lifecycle.execute(finalParams, execCtx);

      // 3. afterExecute 钩子
      if (skill.lifecycle.afterExecute) {
        result = await skill.lifecycle.afterExecute(result, finalParams, execCtx);
      }

      // 更新统计
      skill.state = 'idle';
      skill.lastExecutedAt = Date.now();
      skill.executionCount++;

      // 附加元数据
      result.metadata = {
        ...result.metadata,
        durationMs: Date.now() - startTime,
      };

      return result;
    } catch (e) {
      skill.state = 'idle';
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        metadata: { durationMs: Date.now() - startTime },
      };
    }
  }

  // ===================== 6. Tool Definition 转换 =====================

  /**
   * 将 Skill 定义转换为 OpenAI Tool 格式
   *
   * 用于将 Skill 注册为 LLM 可调用的工具。
   *
   * @param skills - 要转换的 Skill 列表（可选，默认全部）
   * @returns OpenAI ToolDefinition 列表
   */
  getToolDefinitions(skills?: RegisteredSkill[]): ToolDefinition[] {
    const targetSkills = skills ?? this.getAllSkills();

    return targetSkills
      .filter((s) => s.state === 'enabled' || s.state === 'active' || s.state === 'idle')
      .map((s) => ({
        type: 'function' as const,
        function: {
          name: `skill_${s.definition.id}`,
          description: s.definition.description || s.definition.name,
          parameters: s.definition.parameters || {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      }));
  }

  // ===================== 7. 热重载 =====================

  /**
   * 热重载单个 Skill
   *
   * 重新扫描 Skill 目录，重新解析 SKILL.md，重新加载模块。
   *
   * @param id - Skill ID
   * @returns 是否重载成功
   */
  async reloadSkill(id: string): Promise<boolean> {
    const existing = this.registry.get(id);
    if (!existing) {
      logger.warn(`[SkillRegistry] Cannot reload: skill '${id}' not registered.`);
      return false;
    }

    const sourcePath = existing.definition.sourcePath;
    if (!sourcePath) {
      logger.warn(`[SkillRegistry] Cannot reload: skill '${id}' has no sourcePath.`);
      return false;
    }

    const skillMdPath = path.join(sourcePath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      logger.warn(`[SkillRegistry] Cannot reload: SKILL.md not found at ${skillMdPath}`);
      return false;
    }

    try {
      // 重新解析 SKILL.md
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const definition = parseSkillMdToDefinition(
        content,
        sourcePath,
        existing.definition.source,
      );

      if (!definition) {
        logger.error(`[SkillRegistry] Reload failed: SKILL.md parse error for '${id}'`);
        return false;
      }

      // 清理旧模块
      this.loadedModules.delete(id);

      // 重新创建生命周期
      const hasNativeEntry = this.hasNativeEntry(sourcePath);
      const lifecycle = hasNativeEntry
        ? await this.createNativeLifecycle(definition, sourcePath)
        : this.createDeclarativeLifecycle(definition);

      // 保留统计信息
      const registered: RegisteredSkill = {
        definition,
        lifecycle,
        state: 'enabled',
        registeredAt: existing.registeredAt,
        lastExecutedAt: existing.lastExecutedAt,
        executionCount: existing.executionCount,
      };

      this.registry.set(id, registered);
      logger.info(`[SkillRegistry] Reloaded skill: '${id}'`);
      return true;
    } catch (e) {
      logger.error(`[SkillRegistry] Reload failed for skill '${id}':`, e);
      return false;
    }
  }

  // ===================== 8. 关闭 =====================

  /**
   * 关闭所有 Skill，执行 cleanup
   *
   * 按注册顺序逆序执行 cleanup，确保依赖关系正确。
   */
  async shutdown(): Promise<void> {
    logger.info(`[SkillRegistry] Shutting down. Total skills: ${this.registry.size}`);

    const skills = Array.from(this.registry.values());
    let cleaned = 0;
    let errors = 0;

    // 逆序清理
    for (let i = skills.length - 1; i >= 0; i--) {
      const skill = skills[i];
      skill.state = 'cleaned';

      if (skill.lifecycle.cleanup) {
        try {
          const ctx = createSkillContext({
            skillId: skill.definition.id,
            sessionId: uuidv4(),
            workspace: this.scanConfig?.workspaceDir || osHomedir(),
          });
          await skill.lifecycle.cleanup(ctx);
          cleaned++;
        } catch (e) {
          errors++;
          logger.error(`[SkillRegistry] Cleanup failed for '${skill.definition.id}':`, e);
        }
      } else {
        cleaned++;
      }
    }

    // 清空注册表和模块缓存
    this.registry.clear();
    this.loadedModules.clear();
    this.initialized = false;

    logger.info(`[SkillRegistry] Shutdown complete. Cleaned: ${cleaned}, Errors: ${errors}`);
  }

  // ===================== 9. 调试信息 =====================

  /**
   * 获取注册表统计信息
   */
  getStats(): {
    total: number;
    bySource: Record<string, number>;
    byState: Record<string, number>;
    byGroup: Record<string, number>;
  } {
    const bySource: Record<string, number> = {};
    const byState: Record<string, number> = {};
    const byGroup: Record<string, number> = {};

    for (const skill of this.registry.values()) {
      bySource[skill.definition.source] = (bySource[skill.definition.source] || 0) + 1;
      byState[skill.state] = (byState[skill.state] || 0) + 1;
      byGroup[skill.definition.group] = (byGroup[skill.definition.group] || 0) + 1;
    }

    return {
      total: this.registry.size,
      bySource,
      byState,
      byGroup,
    };
  }
}

// ===================== 辅助函数 =====================

/** 获取用户主目录（避免直接使用 os.homedir 在模块顶层调用） */
function osHomedir(): string {
  return require('os').homedir();
}

// ===================== Module-level Singleton =====================

/** Skill 全局注册表单例 */
export const skillRegistry = SkillRegistry.getInstance();

// ===================== 导出 =====================

export { SkillRegistry };
export type { SkillRegistry as SkillRegistryClass };
