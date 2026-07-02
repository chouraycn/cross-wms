/**
 * Skill Chat Commands — Skill 聊天命令系统
 *
 * 将 Skill 注册为聊天命令（如 /skill_name），用户可直接在聊天中触发。
 * 同时支持 LLM 自动调用 Skill（通过 Tool Calling）。
 *
 * 核心功能：
 * 1. registerChatCommands(skills) — 注册 Skill 聊天命令
 * 2. parseChatCommand(message) — 解析聊天命令
 * 3. executeChatCommand(name, args, session) — 执行聊天命令
 * 4. getCommandList() — 获取可用命令列表
 * 5. formatSkillsForPrompt(agentId) — 格式化 Skill 为 Prompt 注入内容
 */

import { logger } from '../logger.js';
import { skillRegistry } from './skillRegistry.js';
import { skillDiscovery } from './skillDiscoverySingleton.js';
import type {
  SkillPermissionConfig,
  SkillContext,
} from '../types/skill-runtime.js';
import { createSkillContext } from './skillContextFactory.js';
import { v4 as uuidv4 } from 'uuid';

// ===================== 类型定义 =====================

/** 聊天命令解析结果 */
export interface ChatCommandParseResult {
  /** 是否为命令 */
  isCommand: boolean;
  /** 命令名称（不含 /） */
  commandName?: string;
  /** 命令参数（字符串数组） */
  args?: string[];
  /** 原始消息 */
  originalMessage: string;
}

/** 聊天命令执行结果 */
export interface ChatCommandResult {
  /** 是否执行成功 */
  success: boolean;
  /** 命令输出 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 执行的 Skill ID */
  skillId?: string;
  /** 是否需要 LLM 继续处理（声明式 Skill 返回 prompt） */
  needsLLM?: boolean;
  /** LLM 处理所需的 prompt 内容 */
  promptContent?: string;
}

/** 命令执行上下文 */
export interface CommandExecutionContext {
  /** 会话 ID */
  sessionId: string;
  /** Agent ID（可选） */
  agentId?: string;
  /** 工作区目录 */
  workspace: string;
  /** 权限配置 */
  permissionConfig: SkillPermissionConfig;
}

// ===================== 常量 =====================

/** 命令前缀 */
const COMMAND_PREFIX = '/';

/** 内置命令（非 Skill 命令） */
const BUILTIN_COMMANDS = new Set([
  'help',
  'skills',
  'clear',
  'new',
  'model',
  'thinking',
  'debug',
]);

// ===================== SkillChatCommands 类 =====================

/**
 * Skill 聊天命令管理器
 */
export class SkillChatCommands {
  /** 命令映射：commandName → skillId */
  private commandMap = new Map<string, string>();

  /** 是否已初始化 */
  private initialized = false;

  constructor() {}

  // ===================== 1. 初始化 =====================

  /**
   * 初始化聊天命令系统
   *
   * 从 skillRegistry 加载所有 userInvocable 的 Skill，注册为聊天命令。
   */
  init(): void {
    if (this.initialized) {
      logger.warn('[SkillChatCommands] Already initialized, skipping.');
      return;
    }

    this.registerCommandsFromRegistry();
    this.initialized = true;
    logger.info(`[SkillChatCommands] Initialized. Commands: ${this.commandMap.size}`);
  }

  /**
   * 从注册表注册命令
   */
  private registerCommandsFromRegistry(): void {
    this.commandMap.clear();

    const skills = skillRegistry.getAllSkills();
    let registered = 0;

    for (const skill of skills) {
      const { definition } = skill;

      // 仅注册 userInvocable 的 Skill
      if (definition.userInvocable === false) continue;

      // 使用 skill id 作为命令名
      this.commandMap.set(definition.id, definition.id);
      registered++;

      // 如果有 name 且与 id 不同，也注册 name 作为别名
      if (definition.name && definition.name !== definition.id) {
        const nameAlias = definition.name.toLowerCase().replace(/\s+/g, '_');
        if (nameAlias !== definition.id && !this.commandMap.has(nameAlias)) {
          this.commandMap.set(nameAlias, definition.id);
        }
      }
    }

    logger.debug(`[SkillChatCommands] Registered ${registered} skill commands`);
  }

  /**
   * 重新加载命令（Skill 注册表变更后调用）
   */
  reload(): void {
    this.registerCommandsFromRegistry();
    logger.info(`[SkillChatCommands] Reloaded. Commands: ${this.commandMap.size}`);
  }

  // ===================== 2. 命令解析 =====================

  /**
   * 解析聊天消息，判断是否为命令
   *
   * @param message - 用户消息
   * @returns 解析结果
   */
  parseChatCommand(message: string): ChatCommandParseResult {
    const trimmed = message.trim();

    // 检查是否以命令前缀开头
    if (!trimmed.startsWith(COMMAND_PREFIX)) {
      return {
        isCommand: false,
        originalMessage: message,
      };
    }

    // 提取命令名和参数
    const parts = trimmed.slice(COMMAND_PREFIX.length).split(/\s+/);
    const commandName = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1);

    if (!commandName) {
      return {
        isCommand: false,
        originalMessage: message,
      };
    }

    return {
      isCommand: true,
      commandName,
      args,
      originalMessage: message,
    };
  }

  // ===================== 3. 命令执行 =====================

  /**
   * 执行聊天命令
   *
   * @param commandName - 命令名称
   * @param args - 命令参数
   * @param context - 执行上下文
   * @returns 执行结果
   */
  async executeChatCommand(
    commandName: string,
    args: string[],
    context: CommandExecutionContext,
  ): Promise<ChatCommandResult> {
    const { sessionId, agentId, workspace, permissionConfig } = context;

    // 内置命令处理
    if (BUILTIN_COMMANDS.has(commandName)) {
      return this.executeBuiltinCommand(commandName, args, context);
    }

    // 查找对应的 Skill
    const skillId = this.commandMap.get(commandName);
    if (!skillId) {
      return {
        success: false,
        error: `未知命令: /${commandName}。使用 /skills 查看可用命令。`,
      };
    }

    // 检查 Skill 是否存在且可用
    const skill = skillRegistry.getSkill(skillId);
    if (!skill) {
      return {
        success: false,
        error: `Skill '${skillId}' 未注册或不存在`,
      };
    }

    if (skill.state !== 'enabled' && skill.state !== 'active' && skill.state !== 'idle') {
      return {
        success: false,
        error: `Skill '${skillId}' 当前状态不可用: ${skill.state}`,
      };
    }

    // 权限检查
    const permissionCheck = this.checkPermission(skill.definition, permissionConfig);
    if (!permissionCheck.allowed) {
      return {
        success: false,
        error: `Skill '${skillId}' 执行被拒绝: ${permissionCheck.reason}`,
      };
    }

    // 将 args 转换为 params 对象
    const params = this.argsToParams(args, skill.definition.parameters);

    // 创建执行上下文
    const ctx = createSkillContext({
      skillId,
      sessionId,
      agentId,
      workspace,
      sandboxScope: skill.definition.sandboxScope,
    });

    try {
      // 执行 Skill
      const result = await skillRegistry.executeSkill(skillId, params, ctx);

      if (result.success) {
        // 检查是否为声明式 Skill（返回 prompt 类型）
        const data = result.data as Record<string, unknown> | undefined;
        if (data?.type === 'prompt' && Array.isArray((data as any).instructions)) {
          return {
            success: true,
            skillId,
            needsLLM: true,
            promptContent: (data as any).instructions.join('\n\n'),
            output: `已加载 Skill: ${skill.definition.name}`,
          };
        }

        return {
          success: true,
          skillId,
          output: this.formatSkillOutput(result.data),
        };
      } else {
        return {
          success: false,
          skillId,
          error: result.error || 'Skill 执行失败',
        };
      }
    } catch (e) {
      return {
        success: false,
        skillId,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * 检查权限
   */
  private checkPermission(
    definition: { id: string; group: string },
    config: SkillPermissionConfig,
  ): { allowed: boolean; reason?: string } {
    // deny 优先
    for (const pattern of config.deny) {
      if (this.matchPattern(pattern, definition.id, definition.group)) {
        return {
          allowed: false,
          reason: `被 deny 规则 '${pattern}' 拒绝`,
        };
      }
    }

    // allow 列表
    if (config.allow.length > 0) {
      const allowed = config.allow.some((pattern) =>
        this.matchPattern(pattern, definition.id, definition.group),
      );
      if (!allowed) {
        return {
          allowed: false,
          reason: '不在 allow 列表中',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 匹配权限模式
   */
  private matchPattern(pattern: string, skillId: string, group: string): boolean {
    if (pattern === '*') return true;
    if (pattern === skillId) return true;
    if (pattern === group) return true;
    if (pattern.endsWith(':*') && group === pattern.slice(0, -2)) {
      return true;
    }
    return false;
  }

  /**
   * 将命令行参数转换为参数对象
   */
  private argsToParams(
    args: string[],
    schema?: Record<string, unknown>,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (!schema || !schema.properties) {
      // 无 schema 时，将所有参数作为 query 字段
      params.query = args.join(' ');
      return params;
    }

    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const required = (schema.required as string[]) || [];
    const propNames = Object.keys(properties);

    if (propNames.length === 0) {
      params.query = args.join(' ');
      return params;
    }

    // 简单策略：第一个必填字段接收所有参数
    const firstRequired = required[0] || propNames[0];
    if (firstRequired) {
      params[firstRequired] = args.join(' ');
    }

    // 支持 --key value 格式
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--') && arg.length > 2) {
        const key = arg.slice(2);
        const value = args[i + 1];
        if (value && !value.startsWith('--')) {
          params[key] = value;
          i++;
        } else {
          params[key] = true;
        }
      }
    }

    return params;
  }

  /**
   * 格式化 Skill 输出
   */
  private formatSkillOutput(data: unknown): string {
    if (data === undefined || data === null) {
      return '执行成功（无返回数据）';
    }

    if (typeof data === 'string') {
      return data;
    }

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  // ===================== 4. 内置命令 =====================

  /**
   * 执行内置命令
   */
  private async executeBuiltinCommand(
    commandName: string,
    args: string[],
    context: CommandExecutionContext,
  ): Promise<ChatCommandResult> {
    switch (commandName) {
      case 'help':
        return this.cmdHelp(args, context);

      case 'skills':
        return this.cmdSkills(args, context);

      default:
        return {
          success: false,
          error: `内置命令 '${commandName}' 暂未实现`,
        };
    }
  }

  /**
   * /help — 显示帮助信息
   */
  private cmdHelp(
    _args: string[],
    _context: CommandExecutionContext,
  ): ChatCommandResult {
    const helpText = [
      '📖 可用命令：',
      '',
      '  /help          - 显示此帮助信息',
      '  /skills        - 列出所有可用的 Skill 命令',
      '  /<skill_name>  - 执行指定的 Skill',
      '',
      '示例：',
      '  /calc 1+1',
      '  /wms_query 库存查询',
    ].join('\n');

    return {
      success: true,
      output: helpText,
    };
  }

  /**
   * /skills — 列出所有可用 Skill
   */
  private cmdSkills(
    args: string[],
    context: CommandExecutionContext,
  ): ChatCommandResult {
    const { agentId } = context;

    // 获取可见的 Skill
    const visibleSkills = skillDiscovery.getVisibleSkills({
      visibility: 'userInvocable',
      agentId,
      search: args[0],
    });

    if (visibleSkills.length === 0) {
      return {
        success: true,
        output: '暂无可用的 Skill。',
      };
    }

    const lines: string[] = [];
    lines.push(`📦 可用 Skill (${visibleSkills.length} 个)：`);
    lines.push('');

    // 按 group 分组
    const byGroup: Record<string, typeof visibleSkills> = {};
    for (const skill of visibleSkills) {
      if (!byGroup[skill.group]) {
        byGroup[skill.group] = [];
      }
      byGroup[skill.group].push(skill);
    }

    for (const [group, skills] of Object.entries(byGroup)) {
      lines.push(`【${group}】`);
      for (const skill of skills) {
        const name = skill.displayName || skill.skillId;
        const desc = skill.description || '暂无描述';
        lines.push(`  /${skill.skillId}  -  ${name}: ${desc}`);
      }
      lines.push('');
    }

    return {
      success: true,
      output: lines.join('\n'),
    };
  }

  // ===================== 5. 查询接口 =====================

  /**
   * 获取所有命令列表
   *
   * @returns 命令名称数组
   */
  getCommandList(): string[] {
    return Array.from(this.commandMap.keys()).sort();
  }

  /**
   * 检查命令是否存在
   *
   * @param commandName - 命令名称
   * @returns 是否存在
   */
  hasCommand(commandName: string): boolean {
    return this.commandMap.has(commandName) || BUILTIN_COMMANDS.has(commandName);
  }

  /**
   * 格式化 Skill 列表为 Prompt 注入内容
   *
   * 将可用的 Skill 格式化为 XML 块注入到系统提示中，
   * 使 LLM 能够了解可用的 Skill 并选择合适的 Skill 调用。
   *
   * @param agentId - Agent ID（可选，用于 Agent 级别过滤）
   * @param maxSkills - 最大显示数量（默认 20）
   * @returns 格式化的 Prompt 内容
   */
  formatSkillsForPrompt(agentId?: string, maxSkills = 20): string {
    const skills = skillDiscovery.getSkillsForPrompt(agentId);

    if (skills.length === 0) {
      return '';
    }

    const displaySkills = skills.slice(0, maxSkills);
    const lines: string[] = [];

    lines.push('<available_skills>');
    lines.push('以下是当前可用的 Skills（技能），你可以根据用户需求选择合适的 Skill 使用：');
    lines.push('');

    for (const skill of displaySkills) {
      lines.push(`<skill name="${skill.skillId}">`);
      lines.push(`  <name>${skill.displayName}</name>`);
      lines.push(`  <description>${skill.description}</description>`);
      lines.push(`  <group>${skill.group}</group>`);
      if (skill.tags.length > 0) {
        lines.push(`  <tags>${skill.tags.join(', ')}</tags>`);
      }
      lines.push(`  <usage>调用工具 skill_${skill.skillId} 来使用此技能</usage>`);
      lines.push('</skill>');
      lines.push('');
    }

    lines.push('使用方法：当用户问题涉及以上 Skill 的能力范围时，直接调用对应的 skill_<name> 工具。');
    lines.push('</available_skills>');

    return lines.join('\n');
  }
}

// ===================== Module-level Singleton =====================

/** Skill 聊天命令单例 */
export const skillChatCommands = new SkillChatCommands();
