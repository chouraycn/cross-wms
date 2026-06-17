/**
 * MCP Settings 前端类型定义
 */

/** MCP 连接状态 */
export type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/** MCP 工具信息 */
export interface McpToolInfo {
  /** 工具名 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 JSON Schema */
  inputSchema: Record<string, unknown>;
}

/** MCP Server 配置（前端视图） */
export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  transportType: 'stdio' | 'sse';
  createdAt: number;
  updatedAt: number;
}

/** MCP Server 运行状态（前端视图） */
export interface McpServerState {
  config: McpServerConfig;
  connectionState: McpConnectionState;
  tools: McpToolInfo[];
  error?: string;
  lastConnectedAt?: number;
}

/** 添加 Server 请求体 */
export interface AddServerRequest {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  transportType?: 'stdio' | 'sse';
}

/** 更新 Server 请求体 */
export interface UpdateServerRequest {
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  transportType?: 'stdio' | 'sse';
}

/** API 响应类型 */
export interface McpServersResponse {
  servers: McpServerState[];
}

export interface McpServerActionResponse {
  success: boolean;
  error?: string;
  server?: McpServerState;
}
