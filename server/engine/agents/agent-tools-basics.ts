// @ts-nocheck
import { z } from 'zod';
import { logger } from '../../logger.js';
import { registerTool, type ToolImplementation } from './agent-tools/tool-registry.js';
import type { ToolDefinition } from './agent-tools/types.js';

export const BasicToolInputSchema = z.object({
  message: z.string().optional(),
});

export interface ExecuteBasicToolOptions {
  toolName: string;
  input: Record<string, unknown>;
}

export function executeBasicTool(options: ExecuteBasicToolOptions): unknown {
  const { toolName, input } = options;

  switch (toolName) {
    case 'noop':
      return { status: 'ok' };

    case 'echo':
      return { status: 'ok', message: input.message ?? '' };

    case 'get_time':
      return {
        status: 'ok',
        timestamp: Date.now(),
        iso: new Date().toISOString(),
      };

    case 'delay': {
      const ms = typeof input.ms === 'number' ? input.ms : 1000;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ status: 'ok', delayed: Math.min(ms, 5000) }), Math.min(ms, 5000));
      });
    }

    case 'generate_id': {
      const prefix = typeof input.prefix === 'string' ? input.prefix : 'id';
      return {
        status: 'ok',
        id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      };
    }

    default:
      throw new Error(`Unknown basic tool: ${toolName}`);
  }
}

const BASIC_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'noop',
    description: '空操作工具，用于测试',
    category: 'system',
    tags: ['test', 'utility'],
    parameters: {},
    returns: { type: 'object', description: '操作状态' },
    deprecated: false,
    version: '1.0.0',
  },
  {
    name: 'echo',
    description: '回显输入的消息',
    category: 'system',
    tags: ['utility'],
    parameters: {
      message: { name: 'message', type: 'string', description: '要回显的消息', required: false },
    },
    returns: { type: 'object', description: '回显的消息' },
    deprecated: false,
    version: '1.0.0',
  },
  {
    name: 'get_time',
    description: '获取当前时间',
    category: 'system',
    tags: ['utility', 'time'],
    parameters: {},
    returns: { type: 'object', description: '当前时间戳与 ISO 字符串' },
    deprecated: false,
    version: '1.0.0',
  },
  {
    name: 'delay',
    description: '延迟指定的毫秒数',
    category: 'system',
    tags: ['utility', 'time'],
    parameters: {
      ms: { name: 'ms', type: 'number', description: '延迟毫秒数', required: true },
    },
    returns: { type: 'object', description: '实际延迟毫秒数' },
    deprecated: false,
    version: '1.0.0',
  },
  {
    name: 'generate_id',
    description: '生成唯一标识符',
    category: 'system',
    tags: ['utility'],
    parameters: {
      prefix: { name: 'prefix', type: 'string', description: 'ID 前缀', required: false },
    },
    returns: { type: 'object', description: '生成的唯一 ID' },
    deprecated: false,
    version: '1.0.0',
  },
];

export function registerBasicTools(): void {
  for (const definition of BASIC_TOOL_DEFINITIONS) {
    const implementation: ToolImplementation = {
      definition,
      execute: async (input: Record<string, unknown>) =>
        executeBasicTool({ toolName: definition.name, input }),
    };
    registerTool(implementation);
  }

  logger.debug(`[Agents:AgentToolsBasics] Registered ${BASIC_TOOL_DEFINITIONS.length} basic tools`);
}

export function isBasicTool(toolName: string): boolean {
  return ['noop', 'echo', 'get_time', 'delay', 'generate_id'].includes(toolName);
}

logger.debug('[Agents:AgentToolsBasics] Module loaded');
