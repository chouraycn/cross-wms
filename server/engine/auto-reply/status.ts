/**
 * Auto-reply 状态/帮助/命令/工具清单消息构建器。
 *
 * 参考 openclaw/src/auto-reply/status.ts 的设计，但适配 cross-wms 的
 * 现有模块结构。openclaw 版本依赖 `tool-description-summary` 与
 * `tools-effective-inventory` 两个模块；这两个模块在 cross-wms 中尚未落地，
 * 因此本文件将工具清单的类型定义内联，由调用方通过 `buildStatusMessage`
 * 的 `params` 注入工具清单数据，避免对不存在模块的硬依赖。
 *
 * 提供的能力：
 * - `buildStatusMessage(params)`：构建包含命令列表、工具清单、帮助文本的状态消息
 * - `buildCommandsMessage`：仅构建命令列表段
 * - `buildHelpMessage`：仅构建帮助文本段
 * - `buildToolsMessage`：仅构建工具清单段
 */
import type { ChatCommandDefinition } from './commands-registry.js';
import { listCommands } from './commands-registry.js';

/** 工具来源类型，对应 openclaw 中 `EffectiveToolInventoryResult` 的 group source。 */
export type ToolInventorySource = 'builtin' | 'plugin' | 'channel' | 'mcp';

/** 单个工具的描述条目（对应 openclaw 的 effective tool inventory item）。 */
export type ToolInventoryEntry = {
  id: string;
  label?: string;
  description?: string;
  /** 原始（未裁剪的）工具描述，用于 verbose 模式展示。 */
  rawDescription?: string;
  source: ToolInventorySource;
  pluginId?: string;
  channelId?: string;
};

/** 工具清单分组（对应 openclaw 的 group）。 */
export type ToolInventoryGroup = {
  label: string;
  tools: ToolInventoryEntry[];
};

/** 工具清单聚合结果（对应 openclaw 的 `EffectiveToolInventoryResult`）。 */
export type ToolInventoryResult = {
  profile?: string;
  groups: ToolInventoryGroup[];
  notices?: Array<{ message: string }>;
};

/** `buildStatusMessage` 的入参。 */
export type StatusMessageParams = {
  /** 当前已注册的命令列表；若未提供则自动从命令注册表读取。 */
  commands?: ChatCommandDefinition[];
  /** 工具清单；若未提供则跳过工具段。 */
  tools?: ToolInventoryResult;
  /** 是否以详细模式展示工具描述。 */
  verbose?: boolean;
  /** 当前会话使用的模型标识，用于状态头部展示。 */
  modelUsed?: string;
  /** 当前 agent 标识，用于状态头部展示。 */
  agentId?: string;
  /** 附加的帮助文本行；若未提供则使用默认帮助文案。 */
  helpLines?: string[];
};

/** 单个工具在状态消息中的归一化表示。 */
type ToolsMessageItem = {
  id: string;
  name: string;
  description: string;
  rawDescription: string;
  source: ToolInventorySource;
  pluginId?: string;
  channelId?: string;
};

/**
 * 从原始描述中提取一段简洁的工具说明。
 * 对应 openclaw 的 `describeToolForVerbose`：优先取 rawDescription 的首段，
 * 回退到 description，最后回退到占位文本。
 */
function describeToolForVerbose(params: {
  rawDescription?: string;
  fallback?: string;
}): string {
  const raw = params.rawDescription?.trim();
  if (raw) {
    // 取首段非空行作为摘要，避免 verbose 输出过长
    const firstLine = raw.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (firstLine) return firstLine;
  }
  return params.fallback?.trim() || 'Tool';
}

/** 按工具名排序，保证输出稳定。 */
function sortToolsMessageItems(items: ToolsMessageItem[]): ToolsMessageItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

/** 紧凑模式下单个工具的展示文本。 */
function formatCompactToolEntry(tool: ToolsMessageItem): string {
  if (tool.source === 'plugin') {
    return tool.pluginId ? `${tool.id} (${tool.pluginId})` : tool.id;
  }
  if (tool.source === 'channel') {
    return tool.channelId ? `${tool.id} (${tool.channelId})` : tool.id;
  }
  if (tool.source === 'mcp') {
    return tool.pluginId ? `${tool.id} (mcp:${tool.pluginId})` : `${tool.id} (mcp)`;
  }
  return tool.id;
}

/** verbose 模式下单个工具的描述文本。 */
function formatVerboseToolDescription(tool: ToolsMessageItem): string {
  return describeToolForVerbose({
    rawDescription: tool.rawDescription,
    fallback: tool.description,
  });
}

/** 将工具清单结果转换为状态消息使用的条目列表。 */
function collectToolsMessageItems(
  result: ToolInventoryResult,
): Array<{ label: string; tools: ToolsMessageItem[] }> {
  const groups: Array<{ label: string; tools: ToolsMessageItem[] }> = [];
  for (const group of result.groups) {
    const tools: ToolsMessageItem[] = [];
    for (const tool of group.tools) {
      tools.push({
        id: tool.id,
        name: tool.label?.trim() || tool.id,
        description: tool.description || 'Tool',
        rawDescription: tool.rawDescription || tool.description || 'Tool',
        source: tool.source,
        pluginId: tool.pluginId,
        channelId: tool.channelId,
      });
    }
    if (tools.length > 0) {
      groups.push({ label: group.label, tools: sortToolsMessageItems(tools) });
    }
  }
  return groups;
}

/** 构建命令列表段。 */
export function buildCommandsMessage(
  commands?: ChatCommandDefinition[],
): string {
  const list = commands ?? listCommands();
  if (list.length === 0) {
    return ['Available commands', '', '  (no commands registered)'].join('\n');
  }

  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
  const lines = ['Available commands', ''];
  for (const cmd of sorted) {
    const aliases = cmd.aliases?.length ? ` [${cmd.aliases.join(', ')}]` : '';
    lines.push(`  /${cmd.name}${aliases} — ${cmd.description}`);
  }
  lines.push('', 'Use /help for general guidance.');
  return lines.join('\n');
}

/** 构建帮助文本段。 */
export function buildHelpMessage(helpLines?: string[]): string {
  const lines = ['Help', ''];
  if (helpLines && helpLines.length > 0) {
    for (const line of helpLines) {
      lines.push(`  ${line}`);
    }
  } else {
    lines.push(
      '  /status              — show agent status and tool inventory',
      '  /commands            — list available commands',
      '  /tools [verbose]     — list effective tools',
      '  /model:<name>        — switch model',
      '  /thinking:<level>    — set thinking level (off|low|medium|high|xhigh|max)',
      '  /verbose:<on|off>    — toggle verbose mode',
    );
  }
  return lines.join('\n');
}

/** 构建工具清单段（对应 openclaw 的 `buildToolsMessage`）。 */
export function buildToolsMessage(
  result: ToolInventoryResult,
  options?: { verbose?: boolean },
): string {
  const groups = collectToolsMessageItems(result);

  if (groups.length === 0) {
    const lines = [
      'No tools are available for this agent right now.',
      '',
      `Profile: ${result.profile ?? 'default'}`,
    ];
    return lines.join('\n');
  }

  const verbose = options?.verbose === true;
  const lines = verbose
    ? ['Available tools', '', `Profile: ${result.profile ?? 'default'}`, 'What this agent can use right now:']
    : ['Available tools', '', `Profile: ${result.profile ?? 'default'}`];

  for (const group of groups) {
    lines.push('', group.label);
    if (verbose) {
      for (const tool of group.tools) {
        lines.push(`  ${tool.name} - ${formatVerboseToolDescription(tool)}`);
      }
      continue;
    }
    const compactTools: string[] = [];
    for (const tool of group.tools) {
      compactTools.push(formatCompactToolEntry(tool));
    }
    lines.push(`  ${compactTools.join(', ')}`);
  }

  if (verbose) {
    lines.push('', "Tool availability depends on this agent's configuration.");
  } else {
    lines.push('', 'Use /tools verbose for descriptions.');
  }
  if (result.notices?.length) {
    lines.push('', 'Notes');
    for (const notice of result.notices) {
      lines.push(`  ${notice.message}`);
    }
  }
  return lines.join('\n');
}

/**
 * 构建完整的状态消息，包含头部、命令列表、工具清单与帮助文本。
 *
 * 这是本模块的主入口，对应任务描述中的 `buildStatusMessage(params)`。
 */
export function buildStatusMessage(params: StatusMessageParams = {}): string {
  const sections: string[] = [];

  // 头部：agent / 模型信息
  const headerLines = ['Status', ''];
  if (params.agentId) headerLines.push(`  Agent: ${params.agentId}`);
  if (params.modelUsed) headerLines.push(`  Model: ${params.modelUsed}`);
  if (headerLines.length > 2) {
    sections.push(headerLines.join('\n'));
  }

  // 命令段
  sections.push(buildCommandsMessage(params.commands));

  // 工具清单段
  if (params.tools) {
    sections.push(buildToolsMessage(params.tools, { verbose: params.verbose }));
  }

  // 帮助段
  sections.push(buildHelpMessage(params.helpLines));

  return sections.join('\n\n');
}
