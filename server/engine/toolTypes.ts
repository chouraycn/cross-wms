/**
 * Tool Types — 工具注册表共享类型定义
 */

import type { ToolDefinition } from '../aiClient.js';

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/** v2.2.0: 平台检测 */
export const PLATFORM = process.platform; // 'darwin' | 'linux' | 'win32'
export const isMac = PLATFORM === 'darwin';
export const isLinux = PLATFORM === 'linux';
