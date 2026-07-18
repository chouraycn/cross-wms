/**
 * MCP 类型定义
 *
 * 扩展 MCP 协议的核心类型定义，包括服务器、连接、工具、资源、
 * 提示模板、采样、会话等完整协议类型。
 */

// JSON-RPC 基础类型
export type JsonRpcVersion = '2.0';

export type JsonRpcRequest = {
  jsonrpc: JsonRpcVersion;
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: JsonRpcVersion;
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type JsonRpcNotification = {
  jsonrpc: JsonRpcVersion;
  method: string;
  params?: Record<string, unknown>;
};

// MCP 协议版本
export const MCP_PROTOCOL_VERSION = '2024-11-05';

// MCP 服务器信息
export type MCPServerInfo = {
  name: string;
  version: string;
};

// MCP 服务器能力
export type MCPServerCapabilities = {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, never>;
  completions?: Record<string, never>;
};

// MCP 客户端能力
export type MCPClientCapabilities = {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, never>;
  logging?: Record<string, never>;
  completions?: Record<string, never>;
};

// MCP 初始化结果
export type MCPInitializeResult = {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPServerInfo;
  instructions?: string;
};

// MCP 初始化参数
export type MCPInitializeParams = {
  protocolVersion: string;
  capabilities: MCPClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
};

// MCP 工具定义
export type MCPTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

// MCP 工具列表结果
export type MCPToolsListResult = {
  tools: MCPTool[];
  nextCursor?: string;
};

// MCP 工具调用参数
export type MCPToolCallParams = {
  name: string;
  arguments?: Record<string, unknown>;
};

// MCP 工具调用结果
export type MCPToolCallResult = {
  content: Array<MCPContent>;
  isError?: boolean;
};

// MCP 内容类型
export type MCPContent =
  | MCPTextContent
  | MCPImageContent
  | MCPResourceContent
  | MCPEmbeddedResource;

export type MCPTextContent = {
  type: 'text';
  text: string;
  annotations?: MCPContentAnnotations;
};

export type MCPImageContent = {
  type: 'image';
  data: string;
  mimeType: string;
  annotations?: MCPContentAnnotations;
};

export type MCPResourceContent = {
  type: 'resource';
  resource: MCPResourceContents;
  annotations?: MCPContentAnnotations;
};

export type MCPEmbeddedResource = {
  type: 'embedded';
  resource: MCPResourceContents;
  annotations?: MCPContentAnnotations;
};

export type MCPContentAnnotations = {
  audience?: Array<'user' | 'assistant'>;
  priority?: 'low' | 'normal' | 'high';
};

// MCP 资源定义
export type MCPResource = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
  annotations?: {
    audience?: Array<'user' | 'assistant'>;
    priority?: 'low' | 'normal' | 'high';
  };
};

// MCP 资源内容
export type MCPResourceContents = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};

// MCP 资源列表结果
export type MCPResourcesListResult = {
  resources: MCPResource[];
  nextCursor?: string;
};

// MCP 提示模板定义
export type MCPPrompt = {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
};

// MCP 提示模板列表结果
export type MCPPromptsListResult = {
  prompts: MCPPrompt[];
  nextCursor?: string;
};

// MCP 提示模板渲染参数
export type MCPPromptGetParams = {
  name: string;
  arguments?: Record<string, string>;
};

// MCP 提示模板渲染结果
export type MCPPromptGetResult = {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: MCPContent[];
  }>;
};

// MCP 采样请求
export type MCPSamplingRequest = {
  model?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | MCPContent[];
  }>;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  topK?: number;
  seed?: number;
  stream?: boolean;
};

// MCP 采样响应
export type MCPSamplingResponse = {
  content: string;
  model: string;
  provider?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    details?: {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      cacheWriteInputTokens?: number;
      reasoningTokens?: number;
    };
  };
  finishReason: 'stop' | 'length' | 'tool_use' | 'error' | 'content_filter';
  stopReason?: string;
};

// MCP 采样流式事件
export type MCPSamplingStreamEvent =
  | { type: 'start'; model: string }
  | { type: 'token'; content: string }
  | {
      type: 'finish';
      finishReason: 'stop' | 'length' | 'tool_use' | 'error' | 'content_filter';
      usage?: MCPSamplingResponse['usage'];
    }
  | { type: 'error'; error: string };

// MCP 连接状态
export type MCPConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'initializing'
  | 'initialized'
  | 'error';

// MCP 连接配置
export type MCPConnectionConfig = {
  serverName: string;
  transport: 'stdio' | 'channel' | 'websocket';
  capabilities?: MCPClientCapabilities;
  timeoutMs?: number;
};

// MCP 连接信息
export type MCPConnection = {
  id: string;
  serverInfo: MCPServerInfo;
  state: MCPConnectionState;
  capabilities: MCPServerCapabilities;
  connectedAt: number;
  lastActivityAt: number;
  config: MCPConnectionConfig;
};

// MCP 服务器配置
export type MCPServerConfig = {
  name: string;
  version: string;
  capabilities?: MCPServerCapabilities;
  instructions?: string;
};

// MCP 会话状态
export type MCPSessionState = 'active' | 'inactive' | 'expired' | 'closed';

// MCP 会话
export type MCPSession = {
  id: string;
  clientId: string;
  state: MCPSessionState;
  createdAt: number;
  lastActivityAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  capabilities?: MCPClientCapabilities;
};

// MCP 日志级别
export type MCPLogLevel =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency';

// MCP 日志消息
export type MCPLogMessage = {
  level: MCPLogLevel;
  logger?: string;
  text: string;
  data?: unknown;
};

// MCP 根目录
export type MCPRoot = {
  uri: string;
  name?: string;
};

// MCP 根目录列表结果
export type MCPRootsListResult = {
  roots: MCPRoot[];
};

// MCP 自动补全参数
export type MCPCompletionParams = {
  ref:
    | {
        type: 'prompt/message_argument';
        name: string;
        argument: string;
        value: string;
      }
    | {
        type: 'resource';
        uri: string;
      }
    | {
        type: 'resource/query_value';
        query: string;
      }
    | {
        type: 'tool/arguments';
        name: string;
        arguments: Record<string, unknown>;
        argument: string;
        value: string;
      };
};

// MCP 自动补全结果
export type MCPCompletionResult = {
  completion: {
    values: string[];
    hasMore?: boolean;
    total?: number;
  };
};

// MCP 错误代码
export const MCPErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR_START: -32099,
  SERVER_ERROR_END: -32000,
} as const;

// MCP 方法名称
export const MCPMethod = {
  INITIALIZE: 'initialize',
  INITIALIZED: 'notifications/initialized',
  PING: 'ping',
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
  TOOLS_LIST_CHANGED: 'notifications/tools/list_changed',
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',
  RESOURCES_SUBSCRIBE: 'resources/subscribe',
  RESOURCES_UNSUBSCRIBE: 'resources/unsubscribe',
  RESOURCES_LIST_CHANGED: 'notifications/resources/list_changed',
  RESOURCES_UPDATED: 'notifications/resources/updated',
  PROMPTS_LIST: 'prompts/list',
  PROMPTS_GET: 'prompts/get',
  PROMPTS_LIST_CHANGED: 'notifications/prompts/list_changed',
  SAMPLING_CREATE: 'sampling/createMessage',
  LOGGING_SET_LEVEL: 'logging/setLevel',
  LOGGING_MESSAGE: 'notifications/message',
  ROOTS_LIST: 'roots/list',
  ROOTS_LIST_CHANGED: 'notifications/roots/list_changed',
  COMPLETIONS: 'completions/complete',
  CANCEL: '$/cancelRequest',
  PROGRESS: '$/progress',
} as const;

// 工具执行状态
export type ToolExecutionState = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

// 工具执行上下文
export type ToolExecutionContext = {
  toolName: string;
  arguments: Record<string, unknown>;
  sessionId?: string;
  requestId?: string | number;
  startTime: number;
  state: ToolExecutionState;
  abortController?: AbortController;
};

// 资源订阅配置
export type ResourceSubscriptionConfig = {
  uri: string;
  mode: 'poll' | 'push';
  pollIntervalMs?: number;
};

// 通道桥接模式
export type ChannelBridgeMode = 'transparent' | 'adaptive' | 'buffered';

// 通道消息类型
export type ChannelMessageType = 'request' | 'response' | 'notification' | 'event';

// 通道桥接统计
export type ChannelBridgeStats = {
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  errors: number;
  lastActivityAt: number;
};
