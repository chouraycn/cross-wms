/**
 * 聊天命令集成系统
 *
 * 参考 OpenClaw 的 discovery/chat-commands.ts：
 * - 通过聊天交互触发技能相关命令
 * - 支持 slash 命令（如 /skill install weather）
 * - 命令解析和路由
 */

import { getChildLogger } from "../../logging/logger.js";
import { getSkillGatingManager } from "../discovery/skill-gating.js";
import { getSkillPriorityResolver } from "../discovery/skill-priority.js";
import { getAgentAllowlistManager } from "../discovery/agent-allowlist.js";
import { getSessionSnapshotManager } from "../runtime/session-snapshot.js";
import type { SkillCommandSpec } from "./command-specs.js";
import { getAllCommandSpecs } from "./command-specs.js";
import { listAvailableCommands } from "./command-dispatch.js";

const logger = getChildLogger("chat-commands");

// ============================================================================
// 类型定义
// ============================================================================

/** 命令类型 */
export type ChatCommandType = "skill" | "agent" | "workshop" | "snapshot" | "config";

/** 命令动作 */
export type ChatCommandAction =
  | "install"
  | "uninstall"
  | "list"
  | "check"
  | "gate"
  | "allow"
  | "deny"
  | "propose"
  | "approve"
  | "reject"
  | "snapshot"
  | "restore";

/** 聊天命令 */
export interface ChatCommand {
  /** 命令类型 */
  type: ChatCommandType;
  /** 命令动作 */
  action: ChatCommandAction;
  /** 参数 */
  args: string[];
  /** 原始文本 */
  raw: string;
  /** 发送者 */
  sender?: string;
  /** 会话 ID */
  sessionId?: string;
}

/** 命令执行结果 */
export interface CommandResult {
  /** 是否成功 */
  success: boolean;
  /** 命令 */
  command: ChatCommand;
  /** 结果消息 */
  message: string;
  /** 详细数据 */
  data?: unknown;
  /** 错误信息 */
  error?: string;
}

/** 命令处理器 */
export type CommandHandler = (command: ChatCommand) => Promise<CommandResult>;

// ============================================================================
// 命令解析器
// ============================================================================

/** 聊天命令解析器 */
export class ChatCommandParser {
  /** 命令前缀 */
  private prefix: string;

  constructor(prefix: string = "/") {
    this.prefix = prefix;
  }

  /** 解析聊天消息 */
  parse(message: string): ChatCommand | null {
    if (!message.startsWith(this.prefix)) {
      return null;
    }

    const content = message.slice(this.prefix.length).trim();
    const parts = content.split(/\s+/);

    if (parts.length === 0) {
      return null;
    }

    const [typeStr, actionStr, ...args] = parts;

    const type = this.parseType(typeStr);
    const action = this.parseAction(type, actionStr);

    if (!type || !action) {
      return null;
    }

    return {
      type,
      action,
      args,
      raw: message,
    };
  }

  /** 解析命令类型 */
  private parseType(typeStr: string): ChatCommandType | null {
    const types: Record<string, ChatCommandType> = {
      skill: "skill",
      skills: "skill",
      agent: "agent",
      agents: "agent",
      workshop: "workshop",
      proposal: "workshop",
      snapshot: "snapshot",
      snap: "snapshot",
      config: "config",
      cfg: "config",
    };

    return types[typeStr.toLowerCase()] || null;
  }

  /** 解析命令动作 */
  private parseAction(
    type: ChatCommandType,
    actionStr: string
  ): ChatCommandAction | null {
    const actions: Record<ChatCommandType, Record<string, ChatCommandAction>> = {
      skill: {
        install: "install",
        uninstall: "uninstall",
        list: "list",
        check: "check",
        gate: "gate",
      },
      agent: {
        allow: "allow",
        deny: "deny",
        list: "list",
      },
      workshop: {
        propose: "propose",
        approve: "approve",
        reject: "reject",
        list: "list",
      },
      snapshot: {
        snapshot: "snapshot",
        restore: "restore",
        list: "list",
      },
      config: {
        list: "list",
      },
    };

    return actions[type]?.[actionStr.toLowerCase()] || null;
  }

  /** 是否为命令 */
  isCommand(message: string): boolean {
    return message.startsWith(this.prefix);
  }
}

// ============================================================================
// 命令路由器
// ============================================================================

/** 命令路由器 */
export class ChatCommandRouter {
  private handlers: Map<string, CommandHandler> = new Map();

  /** 注册命令处理器 */
  register(type: ChatCommandType, action: ChatCommandAction, handler: CommandHandler): void {
    const key = `${type}:${action}`;
    this.handlers.set(key, handler);
    logger.info(`[ChatCommands] Registered handler: ${key}`);
  }

  /** 取消注册命令处理器 */
  unregister(type: ChatCommandType, action: ChatCommandAction): void {
    const key = `${type}:${action}`;
    this.handlers.delete(key);
  }

  /** 路由命令 */
  async route(command: ChatCommand): Promise<CommandResult> {
    const key = `${command.type}:${command.action}`;
    const handler = this.handlers.get(key);

    if (!handler) {
      return {
        success: false,
        command,
        message: `No handler registered for command: ${command.type} ${command.action}`,
      };
    }

    try {
      return await handler(command);
    } catch (err) {
      return {
        success: false,
        command,
        message: "Command execution failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 获取注册的命令列表 */
  getRegisteredCommands(): Array<{ type: ChatCommandType; action: ChatCommandAction }> {
    const commands: Array<{ type: ChatCommandType; action: ChatCommandAction }> = [];

    for (const [key] of this.handlers) {
      const [type, action] = key.split(":") as [ChatCommandType, ChatCommandAction];
      commands.push({ type, action });
    }

    return commands;
  }
}

// ============================================================================
// 默认命令处理器
// ============================================================================

/** 默认命令处理器集合 */
export class DefaultCommandHandlers {
  private router: ChatCommandRouter;

  constructor(router: ChatCommandRouter) {
    this.router = router;
    this.registerDefaultHandlers();
  }

  /** 注册默认处理器 */
  private registerDefaultHandlers(): void {
    // Skill 命令
    this.router.register("skill", "list", this.handleSkillList);
    this.router.register("skill", "check", this.handleSkillCheck);
    this.router.register("skill", "gate", this.handleSkillGate);

    // Agent 命令
    this.router.register("agent", "list", this.handleAgentList);
    this.router.register("agent", "allow", this.handleAgentAllow);
    this.router.register("agent", "deny", this.handleAgentDeny);

    // Snapshot 命令
    this.router.register("snapshot", "list", this.handleSnapshotList);
  }

  /** 处理技能列表 */
  private handleSkillList: CommandHandler = async (command) => {
    const resolver = getSkillPriorityResolver();
    const skills = resolver.getSkillRoots();

    return {
      success: true,
      command,
      message: `Found ${skills.length} skill roots`,
      data: skills,
    };
  };

  /** 处理技能检查 */
  private handleSkillCheck: CommandHandler = async (command) => {
    const gatingManager = getSkillGatingManager();

    return {
      success: true,
      command,
      message: "Skill check initiated",
      data: {
        cacheStatus: gatingManager.getCacheStatus(),
      },
    };
  };

  /** 处理技能门控 */
  private handleSkillGate: CommandHandler = async (command) => {
    const [skillName] = command.args;
    if (!skillName) {
      return {
        success: false,
        command,
        message: "Skill name is required",
      };
    }

    const gatingManager = getSkillGatingManager();
    const result = await gatingManager.checkGating({});

    return {
      success: true,
      command,
      message: `Gate check for ${skillName}`,
      data: result,
    };
  };

  /** 处理 Agent 列表 */
  private handleAgentList: CommandHandler = async (command) => {
    const manager = getAgentAllowlistManager();
    const agents = manager.getAgents();

    return {
      success: true,
      command,
      message: `Found ${agents.length} agents`,
      data: agents,
    };
  };

  /** 处理 Agent 允许 */
  private handleAgentAllow: CommandHandler = async (command) => {
    const [agentId, skillName] = command.args;

    if (!agentId || !skillName) {
      return {
        success: false,
        command,
        message: "Usage: /agent allow <agent-id> <skill-name>",
      };
    }

    const manager = getAgentAllowlistManager();
    const result = manager.addSkillToAgent(agentId, skillName);

    return {
      success: result,
      command,
      message: result
        ? `Added ${skillName} to ${agentId}`
        : `Failed to add ${skillName} to ${agentId}`,
    };
  };

  /** 处理 Agent 拒绝 */
  private handleAgentDeny: CommandHandler = async (command) => {
    const [agentId, skillName] = command.args;

    if (!agentId || !skillName) {
      return {
        success: false,
        command,
        message: "Usage: /agent deny <agent-id> <skill-name>",
      };
    }

    const manager = getAgentAllowlistManager();
    const result = manager.removeSkillFromAgent(agentId, skillName);

    return {
      success: result,
      command,
      message: result
        ? `Removed ${skillName} from ${agentId}`
        : `Failed to remove ${skillName} from ${agentId}`,
    };
  };

  /** 处理快照列表 */
  private handleSnapshotList: CommandHandler = async (command) => {
    const snapshotManager = getSessionSnapshotManager();
    const snapshots = await snapshotManager.listSnapshots();

    return {
      success: true,
      command,
      message: `Found ${snapshots.length} snapshots`,
      data: snapshots,
    };
  };
}

// ============================================================================
// 全局实例
// ============================================================================

let globalCommandParser: ChatCommandParser | null = null;
let globalCommandRouter: ChatCommandRouter | null = null;

/** 获取全局命令解析器 */
export function getChatCommandParser(): ChatCommandParser {
  if (!globalCommandParser) {
    globalCommandParser = new ChatCommandParser();
  }
  return globalCommandParser;
}

/** 获取全局命令路由器 */
export function getChatCommandRouter(): ChatCommandRouter {
  if (!globalCommandRouter) {
    globalCommandRouter = new ChatCommandRouter();
    // 注册默认处理器
    new DefaultCommandHandlers(globalCommandRouter);
  }
  return globalCommandRouter;
}

/** 解析并路由命令 */
export async function parseAndRoute(message: string): Promise<CommandResult | null> {
  const parser = getChatCommandParser();
  const router = getChatCommandRouter();

  const command = parser.parse(message);
  if (!command) {
    return null;
  }

  return router.route(command);
}

/** 从技能中提取命令规格 */
export function extractCommandSpecsFromSkill(skill: { name: string; commands?: SkillCommandSpec[] }): SkillCommandSpec[] {
  return skill.commands ?? [];
}

/** 构建命令索引 */
export function buildCommandIndex(): Map<string, SkillCommandSpec> {
  const index = new Map<string, SkillCommandSpec>();
  const specs = getAllCommandSpecs();
  for (const spec of specs) {
    for (const cmd of spec.commands) {
      index.set(`${spec.skillName}:${cmd.name}`, cmd);
    }
  }
  return index;
}

/** 按名称查找命令 */
export function findCommandByName(name: string): SkillCommandSpec | undefined {
  const specs = getAllCommandSpecs();
  for (const spec of specs) {
    for (const cmd of spec.commands) {
      if (cmd.name === name) {
        return cmd;
      }
    }
  }
  return undefined;
}

/** 列出所有可用命令 */
export function listAllCommands(): string[] {
  return listAvailableCommands();
}