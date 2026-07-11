/**
 * MCP 共享类型定义
 *
 * 定义 MCP Server 配置、连接状态、工具信息等核心类型。
 * 前后端共享。
 */

/** MCP Server 传输类型：stdio（子进程）/ sse（SSE 远端）/ http（Streamable HTTP 远端） */
export type McpTransportType = 'stdio' | 'sse' | 'http';

/** MCP Server 配置 */
export interface McpServerConfig {
  /** UUID */
  id: string;
  /** 人类可读名称，如 "filesystem" */
  name: string;
  /** 启动命令，如 "npx"（仅 stdio 使用） */
  command: string;
  /** 参数，如 ["-y", "@anthropic/mcp-server-filesystem", "/path"]（仅 stdio 使用） */
  args: string[];
  /** 环境变量（仅 stdio 使用） */
  env: Record<string, string>;
  /** 是否启用 */
  enabled: boolean;
  /** 传输类型 */
  transportType: McpTransportType;
  /** 远端 URL（sse / http 使用） */
  url?: string;
  /** 自定义请求头（sse / http 使用） */
  headers?: Record<string, string>;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
  /** 更新时间（毫秒时间戳） */
  updatedAt: number;
}

/** MCP 连接状态 */
export type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/** MCP 工具信息（从 MCP Server 发现） */
export interface McpToolInfo {
  /** 工具名（Server 侧原始名称） */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 JSON Schema */
  inputSchema: Record<string, unknown>;
}

/** MCP Server 运行状态 */
export interface McpServerState {
  /** 对应的配置 */
  config: McpServerConfig;
  /** 连接状态 */
  connectionState: McpConnectionState;
  /** 已发现的工具 */
  tools: McpToolInfo[];
  /** 错误信息 */
  error?: string;
  /** 最后连接时间 */
  lastConnectedAt?: number;
}

/**
 * 将 serverName 转换为安全的工具前缀标识符。
 * 规则：小写 + 非字母数字替换为下划线 + 去除首尾下划线。
 *
 * @param name - 原始 server 名称
 * @returns sanitized 前缀名
 */
export function sanitizeServerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

/**
 * 生成 MCP 工具的内部全名。
 * 格式：mcp__{sanitizedServerName}__{toolName}
 *
 * @param serverName - Server 名称
 * @param toolName - 工具原始名称
 * @returns 带前缀的完整工具名
 */
export function makeMcpToolName(serverName: string, toolName: string): string {
  const prefix = sanitizeServerName(serverName);
  return `mcp__${prefix}__${toolName}`;
}

/**
 * 从 MCP 全名解析出 serverName 和原始 toolName。
 *
 * @param fullToolName - 完整工具名（如 mcp__filesystem__read_file）
 * @returns { serverPrefix, toolName } 或 null（格式不匹配时）
 */
export function parseMcpToolName(fullToolName: string): { serverPrefix: string; toolName: string } | null {
  if (!fullToolName.startsWith('mcp__')) return null;
  const rest = fullToolName.slice(5); // 去掉 "mcp__"
  const sepIdx = rest.indexOf('__');
  if (sepIdx === -1) return null;
  const serverPrefix = rest.slice(0, sepIdx);
  const toolName = rest.slice(sepIdx + 2);
  if (!serverPrefix || !toolName) return null;
  return { serverPrefix, toolName };
}

/**
 * 从 MCP 全名提取 server 前缀。
 *
 * @param fullToolName - 完整工具名
 * @returns server 前缀或 null
 */
export function getMcpServerPrefix(fullToolName: string): string | null {
  const parsed = parseMcpToolName(fullToolName);
  return parsed ? parsed.serverPrefix : null;
}

/**
 * 判断工具名是否为 MCP 工具。
 * MCP 工具名以 "mcp__" 开头。
 */
export function isMcpToolName(toolName: string): boolean {
  return toolName.startsWith('mcp__');
}
