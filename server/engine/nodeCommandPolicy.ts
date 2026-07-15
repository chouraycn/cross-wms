/**
 * 节点命令策略 — 参考 OpenClaw gateway/node-command-policy.ts
 *
 * 计算每个平台的命令允许列表，来源包括：
 * - 内置命令
 * - 插件提供的命令
 * - 运行时动态注册的命令
 * - 配置文件中的命令
 *
 * 支持按平台（iOS/Android/desktop/server）分类
 */

import { logger } from '../logger.js';

export type NodePlatform = 'ios' | 'android' | 'desktop' | 'server' | 'web' | 'embedded';

export type CommandCategory = 'safe' | 'sensitive' | 'dangerous';

export interface CommandPolicyEntry {
  command: string;
  category: CommandCategory;
  requiresApproval: boolean;
  description?: string;
}

export interface NodeCommandPolicy {
  platform: NodePlatform;
  allowed: Set<string>;
  dangerous: Set<string>;
  requiresApproval: Set<string>;
  entries: Map<string, CommandPolicyEntry>;
}

const SAFE_COMMANDS = [
  'device.info',
  'device.status',
  'system.notify',
  'browser.proxy',
  'notifications.list',
  'camera.list',
  'screen.snapshot',
  'location.get',
  'contacts.search',
  'calendar.events',
  'callLog.search',
  'reminders.list',
  'photos.latest',
  'motion.activity',
  'motion.pedometer',
];

const DANGEROUS_COMMANDS = [
  'system.run',
  'system.exec',
  'system.shell',
  'camera.snap',
  'camera.clip',
  'screen.record',
  'contacts.add',
  'calendar.add',
  'reminders.add',
  'sms.send',
  'sms.search',
];

const SENSITIVE_COMMANDS = [
  'device.permissions',
  'device.health',
  'device.apps',
  'notifications.actions',
];

const TALK_PTT_COMMANDS = [
  'talk.ptt.start',
  'talk.ptt.stop',
  'talk.ptt.cancel',
  'talk.ptt.once',
];

const IOS_COMMANDS = ['system.notify', 'notifications.list'];

const ANDROID_COMMANDS = [
  ...SAFE_COMMANDS,
  'device.permissions',
  'device.health',
  'device.apps',
  'notifications.actions',
];

const DESKTOP_COMMANDS = [
  'system.run',
  'system.exec',
  'system.shell',
  'system.notify',
  'browser.proxy',
];

const SERVER_COMMANDS = [
  'system.run',
  'system.exec',
  'system.shell',
  'system.notify',
  'browser.proxy',
  'file.read',
  'file.write',
  'file.delete',
  'network.request',
  'process.start',
  'process.stop',
  'process.list',
];

const WEB_COMMANDS = [
  'browser.proxy',
  'browser.navigate',
  'browser.evaluate',
  'browser.screenshot',
];

const EMBEDDED_COMMANDS = [
  'device.info',
  'device.status',
  'system.notify',
];

const customCommandRegistry = new Map<string, CommandPolicyEntry>();

export function registerCustomCommand(entry: CommandPolicyEntry): void {
  customCommandRegistry.set(entry.command, entry);
  logger.debug(`[NodeCommandPolicy] 注册自定义命令: ${entry.command}`);
}

export function unregisterCustomCommand(command: string): boolean {
  const deleted = customCommandRegistry.delete(command);
  if (deleted) {
    logger.debug(`[NodeCommandPolicy] 注销自定义命令: ${command}`);
  }
  return deleted;
}

function getPlatformCommands(platform: NodePlatform): { safe: string[]; dangerous: string[]; sensitive: string[] } {
  switch (platform) {
    case 'ios':
      return {
        safe: [...IOS_COMMANDS, ...TALK_PTT_COMMANDS],
        dangerous: DANGEROUS_COMMANDS,
        sensitive: SENSITIVE_COMMANDS,
      };
    case 'android':
      return {
        safe: [...ANDROID_COMMANDS, ...TALK_PTT_COMMANDS],
        dangerous: DANGEROUS_COMMANDS,
        sensitive: SENSITIVE_COMMANDS,
      };
    case 'desktop':
      return {
        safe: DESKTOP_COMMANDS,
        dangerous: DANGEROUS_COMMANDS,
        sensitive: SENSITIVE_COMMANDS,
      };
    case 'server':
      return {
        safe: SERVER_COMMANDS,
        dangerous: DANGEROUS_COMMANDS,
        sensitive: SENSITIVE_COMMANDS,
      };
    case 'web':
      return {
        safe: WEB_COMMANDS,
        dangerous: DANGEROUS_COMMANDS,
        sensitive: SENSITIVE_COMMANDS,
      };
    case 'embedded':
      return {
        safe: EMBEDDED_COMMANDS,
        dangerous: DANGEROUS_COMMANDS,
        sensitive: SENSITIVE_COMMANDS,
      };
    default:
      return {
        safe: SAFE_COMMANDS,
        dangerous: DANGEROUS_COMMANDS,
        sensitive: SENSITIVE_COMMANDS,
      };
  }
}

export function resolveNodeCommandPolicy(
  platform: NodePlatform,
  options?: {
    configCommands?: string[];
    pluginCommands?: string[];
    allowDangerous?: boolean;
  },
): NodeCommandPolicy {
  const { safe, dangerous, sensitive } = getPlatformCommands(platform);

  const allowed = new Set<string>([...safe]);
  const dangerousSet = new Set<string>([...dangerous]);
  const requiresApproval = new Set<string>([...sensitive, ...dangerous]);
  const entries = new Map<string, CommandPolicyEntry>();

  for (const cmd of safe) {
    entries.set(cmd, {
      command: cmd,
      category: 'safe',
      requiresApproval: false,
    });
  }

  for (const cmd of sensitive) {
    entries.set(cmd, {
      command: cmd,
      category: 'sensitive',
      requiresApproval: true,
    });
  }

  for (const cmd of dangerous) {
    entries.set(cmd, {
      command: cmd,
      category: 'dangerous',
      requiresApproval: true,
    });
  }

  if (options?.configCommands) {
    for (const cmd of options.configCommands) {
      allowed.add(cmd);
      if (!entries.has(cmd)) {
        entries.set(cmd, {
          command: cmd,
          category: 'safe',
          requiresApproval: false,
        });
      }
    }
  }

  if (options?.pluginCommands) {
    for (const cmd of options.pluginCommands) {
      allowed.add(cmd);
      if (!entries.has(cmd)) {
        entries.set(cmd, {
          command: cmd,
          category: 'safe',
          requiresApproval: false,
        });
      }
    }
  }

  for (const [cmd, entry] of customCommandRegistry) {
    allowed.add(cmd);
    entries.set(cmd, entry);
    if (entry.category === 'dangerous') {
      dangerousSet.add(cmd);
    }
    if (entry.requiresApproval) {
      requiresApproval.add(cmd);
    }
  }

  if (options?.allowDangerous) {
    for (const cmd of dangerousSet) {
      allowed.add(cmd);
    }
  } else {
    for (const cmd of dangerousSet) {
      allowed.delete(cmd);
    }
  }

  logger.debug(`[NodeCommandPolicy] 解析 ${platform} 平台策略: ${allowed.size} 允许, ${dangerousSet.size} 危险, ${requiresApproval.size} 需审批`);

  return {
    platform,
    allowed,
    dangerous: dangerousSet,
    requiresApproval,
    entries,
  };
}

export function isCommandAllowed(policy: NodeCommandPolicy, command: string): boolean {
  return policy.allowed.has(command);
}

export function isCommandDangerous(policy: NodeCommandPolicy, command: string): boolean {
  return policy.dangerous.has(command);
}

export function requiresCommandApproval(policy: NodeCommandPolicy, command: string): boolean {
  return policy.requiresApproval.has(command);
}

export function getCommandEntry(policy: NodeCommandPolicy, command: string): CommandPolicyEntry | undefined {
  return policy.entries.get(command);
}

export function listAllowedCommands(policy: NodeCommandPolicy): string[] {
  return Array.from(policy.allowed).sort();
}

export function listDangerousCommands(policy: NodeCommandPolicy): string[] {
  return Array.from(policy.dangerous).sort();
}

export function listCommandsRequiringApproval(policy: NodeCommandPolicy): string[] {
  return Array.from(policy.requiresApproval).sort();
}

export function getPolicySummary(policy: NodeCommandPolicy): {
  platform: NodePlatform;
  allowedCount: number;
  dangerousCount: number;
  requiresApprovalCount: number;
} {
  return {
    platform: policy.platform,
    allowedCount: policy.allowed.size,
    dangerousCount: policy.dangerous.size,
    requiresApprovalCount: policy.requiresApproval.size,
  };
}