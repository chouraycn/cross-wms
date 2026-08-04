/**
 * Commands Gateway Methods — 命令枚举 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/commands.ts
 * - 精简版：commands.list 返回内置斜杠命令清单
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 内置斜杠命令清单（与前端 SLASH_COMMANDS 对齐）
const BUILTIN_COMMANDS = [
  { name: 'help', description: '显示可用命令帮助', scope: 'chat', args: [] },
  { name: 'clear', description: '清空当前对话历史', scope: 'chat', args: [] },
  { name: 'export', description: '导出当前对话为 Markdown', scope: 'chat', args: [] },
  { name: 'agent', description: '切换或查看 Agent', scope: 'chat', args: [{ name: 'agentId', required: false }] },
  { name: 'model', description: '切换或查看模型', scope: 'chat', args: [{ name: 'modelId', required: false }] },
  { name: 'skills', description: '查看可用技能', scope: 'chat', args: [] },
  { name: 'compact', description: '压缩当前会话历史', scope: 'chat', args: [] },
  { name: 'reset', description: '重置当前会话', scope: 'chat', args: [] },
];

// ========== Commands List ==========

async function commandsList(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as { scope?: string; includeArgs?: boolean };
  const scope = typeof p.scope === 'string' ? p.scope : undefined;
  const includeArgs = p.includeArgs !== false; // 默认包含参数

  let commands = BUILTIN_COMMANDS;
  if (scope) {
    commands = commands.filter((c) => c.scope === scope);
  }

  return {
    ok: true,
    commands: commands.map((c) => ({
      name: c.name,
      description: c.description,
      scope: c.scope,
      ...(includeArgs ? { args: c.args } : {}),
    })),
    count: commands.length,
  };
}

/**
 * 注册所有命令方法
 */
export function registerCommandsMethods(registry: GatewayMethodRegistry): void {
  registry.register('commands.list', commandsList);
}
