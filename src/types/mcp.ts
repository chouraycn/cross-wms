/**
 * MCP (Model Context Protocol) 类型定义
 *
 * 从 src/services/api.ts 提取的 MCP 相关类型，集中管理以便复用。
 * services/api.ts 通过 re-export 保持向后兼容。
 */

/** MCP Server 配置（对应后端 McpServerConfig） */
export interface McpServerConfig {
  id?: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  transportType: string;
  createdAt?: number;
  updatedAt?: number;
}

/** MCP 工具信息 */
export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

/** MCP Server 运行时状态 */
export interface McpServerState {
  config: McpServerConfig;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  tools: McpToolInfo[];
  error?: string;
  lastConnectedAt?: number;
}

// ===================== 语义化别名 =====================
// 任务要求提供的语义化名称，便于业务代码引用

/** MCP Server 配置别名 */
export type McpConfig = McpServerConfig;

/** MCP Server 运行时状态别名（包含配置 + 连接状态 + 工具列表） */
export type McpServer = McpServerState;

/** MCP 工具信息别名 */
export type McpTool = McpToolInfo;
