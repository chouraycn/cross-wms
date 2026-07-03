/**
 * CLI 命令描述符系统
 * 用于命令的描述、路由和懒加载注册
 */

/** 根命令描述符 */
export type CoreCommandDescriptor = {
  name: string;
  description: string;
  hasSubcommands: boolean;
  parentDefaultHelp?: boolean;
  aliases?: readonly string[];
};

/** 命令选项描述符 */
export type CommandOption = {
  flags: string;
  description: string;
  defaultValue?: string;
};

/** 命令组描述符 */
export type CommandGroupDescriptor = {
  name: string;
  description: string;
  hasSubcommands: boolean;
  parentDefaultHelp?: boolean;
};

/** 描述符目录类型 */
export type CommandDescriptorCatalog<TDescriptor extends CoreCommandDescriptor> = {
  descriptors: readonly TDescriptor[];
  getDescriptors: () => readonly TDescriptor[];
  getNames: () => string[];
  getCommandsWithSubcommands: () => string[];
  getParentDefaultHelpCommands: () => string[];
};

/** 安全命令名模式 */
const SAFE_COMMAND_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * 规范化命令描述符名称
 */
export function normalizeCommandDescriptorName(name: string): string | null {
  const normalized = name.trim();
  return SAFE_COMMAND_NAME_PATTERN.test(normalized) ? normalized : null;
}

/**
 * 验证并返回安全的命令描述符名称
 */
function assertSafeCommandDescriptorName(name: string): string {
  const normalized = normalizeCommandDescriptorName(name);
  if (!normalized) {
    throw new Error(`无效的 CLI 命令名称: ${JSON.stringify(name.trim())}`);
  }
  return normalized;
}

/**
 * 创建描述符目录
 */
export function defineCommandDescriptorCatalog<TDescriptor extends CoreCommandDescriptor>(
  descriptors: readonly TDescriptor[],
): CommandDescriptorCatalog<TDescriptor> {
  return {
    descriptors,
    getDescriptors: () => descriptors,
    getNames: () => descriptors.map((d) => d.name),
    getCommandsWithSubcommands: () =>
      descriptors.filter((d) => d.hasSubcommands).map((d) => d.name),
    getParentDefaultHelpCommands: () =>
      descriptors.filter((d) => d.parentDefaultHelp).map((d) => d.name),
  };
}

/** 核心命令描述符目录 */
const CORE_COMMAND_DESCRIPTORS = defineCommandDescriptorCatalog([
  {
    name: "status",
    description: "显示 Gateway 状态、通道、会话数等信息",
    hasSubcommands: false,
    aliases: ["st"],
  },
  {
    name: "config",
    description: "配置管理 (get/set/list/validate)",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "health",
    description: "获取 Gateway 详细健康状态",
    hasSubcommands: false,
  },
  {
    name: "doctor",
    description: "检查并修复配置、数据库、模型、网关等问题",
    hasSubcommands: false,
  },
  {
    name: "chat",
    description: "启动交互式聊天会话",
    hasSubcommands: false,
    aliases: ["ch"],
  },
  {
    name: "memory",
    description: "记忆管理 (list/search/add/delete/sync)",
    hasSubcommands: true,
    parentDefaultHelp: true,
    aliases: ["mem"],
  },
  {
    name: "wiki",
    description: "Wiki 管理 (list/search/view/create)",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "tool",
    description: "工具管理 (list/exec/info)",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "help",
    description: "显示帮助信息",
    hasSubcommands: false,
    aliases: ["h", "?"],
  },
  {
    name: "version",
    description: "显示版本信息",
    hasSubcommands: false,
    aliases: ["v", "ver"],
  },
  {
    name: "agent",
    description: "子代理管理",
    hasSubcommands: true,
  },
  {
    name: "session",
    description: "会话管理",
    hasSubcommands: true,
    aliases: ["sess"],
  },
  {
    name: "skill",
    description: "技能管理",
    hasSubcommands: true,
  },
  {
    name: "plugin",
    description: "插件管理",
    hasSubcommands: true,
    aliases: ["pl"],
  },
  {
    name: "cron",
    description: "定时任务管理",
    hasSubcommands: true,
    aliases: ["cr"],
  },
  {
    name: "daemon",
    description: "守护进程管理 (start/stop/restart/status/install/uninstall)",
    hasSubcommands: true,
  },
  {
    name: "secrets",
    description: "密钥管理 (list/audit/apply/resolve/scrub)",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "models",
    description: "模型管理 (list/set/test/info)",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "hooks",
    description: "钩子管理 (list/enable/disable/reload/info)",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "gateway",
    description: "网关管理 (start/stop/status/probe/info)",
    hasSubcommands: true,
  },
] as const satisfies ReadonlyArray<CoreCommandDescriptor>);

/** 核心 CLI 命令描述符 */
export const CORE_CLI_COMMAND_DESCRIPTORS = CORE_COMMAND_DESCRIPTORS.descriptors;

/** 获取所有核心命令描述符 */
export function getCoreCliCommandDescriptors(): ReadonlyArray<CoreCommandDescriptor> {
  return CORE_COMMAND_DESCRIPTORS.getDescriptors();
}

/** 获取所有核心命令名称 */
export function getCoreCliCommandNames(): string[] {
  return CORE_COMMAND_DESCRIPTORS.getNames();
}

/** 获取包含子命令的核心命令 */
export function getCoreCliCommandsWithSubcommands(): string[] {
  return CORE_COMMAND_DESCRIPTORS.getCommandsWithSubcommands();
}

/** 获取需要默认显示帮助的父命令 */
export function getCoreCliParentDefaultHelpCommands(): string[] {
  return CORE_COMMAND_DESCRIPTORS.getParentDefaultHelpCommands();
}

/** 命令描述符映射表 */
type CommandDescriptorMap = Map<string, CoreCommandDescriptor>;

function buildDescriptorIndex(descriptors: readonly CoreCommandDescriptor[]): CommandDescriptorMap {
  const index = new Map<string, CoreCommandDescriptor>();
  for (const descriptor of descriptors) {
    index.set(descriptor.name, descriptor);
    if (descriptor.aliases) {
      for (const alias of descriptor.aliases) {
        index.set(alias, descriptor);
      }
    }
  }
  return index;
}

const DESCRIPTORS_BY_NAME = buildDescriptorIndex(CORE_CLI_COMMAND_DESCRIPTORS);

/**
 * 查找命令描述符
 */
export function findCommandDescriptor(name: string): CoreCommandDescriptor | undefined {
  return DESCRIPTORS_BY_NAME.get(name);
}

export function getCommandPath(argv: string[], depth?: number): string[] {
  const path: string[] = [];
  const maxDepth = depth ?? 99;
  for (const arg of argv) {
    if (arg.startsWith("-")) {
      continue;
    }
    path.push(arg);
    if (path.length >= maxDepth) {
      break;
    }
  }
  return path;
}

/**
 * 匹配命令别名
 */
export function matchCommandAlias(name: string): CoreCommandDescriptor | undefined {
  return DESCRIPTORS_BY_NAME.get(name);
}

/**
 * 向程序添加命令描述符占位符
 */
export function addCommandDescriptorsToProgram(
  program: {
    command(name: string): {
      description(desc: string): {
        aliases(aliases: readonly string[]): unknown;
      };
    };
  },
  descriptors: readonly CoreCommandDescriptor[],
  existingCommands: Set<string> = new Set(),
): Set<string> {
  for (const descriptor of descriptors) {
    const name = assertSafeCommandDescriptorName(descriptor.name);
    if (existingCommands.has(name)) {
      continue;
    }
    const cmdWithDesc = program.command(name).description(descriptor.description);
    if (descriptor.aliases && descriptor.aliases.length > 0) {
      cmdWithDesc.aliases(descriptor.aliases);
    }
    existingCommands.add(name);
  }
  return existingCommands;
}
