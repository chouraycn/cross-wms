/**
 * Tool Protocol — 协议载荷转换
 *
 * 参考 OpenClaw src/tools/protocol.ts 设计。
 * 将 planner 输出的 ToolPlanEntry 转换为模型可理解的最小描述符。
 */

import type { ToolPlanEntry, ToolProtocolDescriptor, ToolDescriptor } from './types.js';

/**
 * 从 ToolPlanEntry 提取协议描述符
 * 仅提取 name/description/inputSchema，schema 规范化由 model adapter 处理
 */
export function toToolProtocolDescriptor(entry: ToolPlanEntry): ToolProtocolDescriptor {
  const desc = entry.descriptor;
  return {
    name: desc.name,
    description: desc.title ? `${desc.title}: ${desc.description}` : desc.description,
    inputSchema: desc.inputSchema,
  };
}

/**
 * 批量转换 ToolPlanEntry → ToolProtocolDescriptor
 */
export function toToolProtocolDescriptors(entries: ToolPlanEntry[]): ToolProtocolDescriptor[] {
  return entries.map(toToolProtocolDescriptor);
}

/**
 * 从裸 ToolDescriptor 提取协议描述符（不经过 planner 时使用）
 */
export function descriptorToProtocolDescriptor(desc: ToolDescriptor): ToolProtocolDescriptor {
  return {
    name: desc.name,
    description: desc.title ? `${desc.title}: ${desc.description}` : desc.description,
    inputSchema: desc.inputSchema,
  };
}
