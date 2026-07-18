/**
 * MCP 模块 - Model Context Protocol
 *
 * 统一导出 MCP 类型定义、通道桥接、通道服务器、通道工具、
 * 插件工具服务、插件工具处理器、stdio 服务器、资源管理、
 * 提示模板、采样、工具执行、会话管理等全部能力。
 */

// MCP 协议类型定义
export * from './types.js';

// 通道桥接
export {
  McpChannelBridge,
  createMcpChannelBridge,
} from './channel-bridge.js';
export type {
  ChannelBridgeMessage,
  ChannelBridgeConfig,
  BufferedMessage,
} from './channel-bridge.js';

// 通道服务器
export {
  McpChannelServer,
  createMcpChannelServer,
} from './channel-server.js';

// 通道工具
export {
  ChannelToolsManager,
  channelToolsManager,
  registerChannelTool,
  callChannelTool,
  listChannelTools,
} from './channel-tools.js';
export type {
  ChannelToolConfig,
  ChannelToolResult,
} from './channel-tools.js';

// 插件工具处理器
export {
  PluginToolHandlers,
  pluginToolHandlers,
  registerToolHandler,
  executeToolHandler,
} from './plugin-tools-handlers.js';
export type {
  ToolHandlerContext,
  ToolHandlerResult,
  ToolHandler,
  ToolMiddleware,
} from './plugin-tools-handlers.js';

// 插件工具服务
export {
  PluginToolsServe,
  pluginToolsServe,
  registerPluginTools,
  callPluginTool,
  listPluginTools,
} from './plugin-tools-serve.js';
export type {
  PluginToolServeConfig,
  PluginInfo,
} from './plugin-tools-serve.js';

// stdio 服务器
export {
  McpStdioServer,
  createMcpStdioServer,
} from './tools-stdio-server.js';
export type {
  StdioServerConfig,
  StdioRequestHandler,
  StdioToolHandler,
} from './tools-stdio-server.js';

// OpenClaw 工具服务
export {
  OpenClawToolsServer,
  createOpenClawToolsServer,
} from './openclaw-tools-serve.js';
export type {
  OpenClawToolsConfig,
} from './openclaw-tools-serve.js';

// 资源管理器
export {
  ResourceManager,
  resourceManager,
  registerResource,
  getResource,
  listResources,
  subscribeResource,
} from './resource-manager.js';
export type {
  ResourceContent,
  ResourceDefinition,
} from './resource-manager.js';

// 提示模板
export {
  PromptTemplateManager,
  promptTemplateManager,
  registerTemplate,
  renderTemplate,
  listTemplates,
  getTemplate,
} from './prompt-templates.js';
export type {
  PromptTemplate,
  TemplateInfo,
} from './prompt-templates.js';

// 采样管理器
export {
  SamplingManager,
  samplingManager,
  createCompletion,
  createStreamingCompletion,
} from './sampling.js';
export type {
  SamplingRequest,
  SamplingResponse,
  SamplingStreamEvent,
  SamplingCacheEntry,
} from './sampling.js';

// 工具执行器
export {
  ToolExecutor,
  toolExecutor,
  registerTool,
  executeTool,
  validateTool,
} from './tool-executor.js';
export type {
  ToolDefinition,
  ToolResult,
  ValidationResult,
} from './tool-executor.js';

// 会话管理器
export {
  McpSessionManager,
  mcpSessionManager,
  createSession,
  getSession,
  closeSession,
} from './session-manager.js';
export type {
  McpSession,
} from './session-manager.js';
