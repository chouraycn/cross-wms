/**
 * @cdf-know/plugin-sdk STABLE API 契约声明
 *
 * 本文件定义了 @cdf-know/plugin-sdk 包中所有 STABLE 等级公共 API 的
 * 类型契约。任何 STABLE API 的移除或签名变更均视为破坏性变更。
 *
 * 仅供契约检查脚本使用，不应被其他包直接导入。
 */

// ── 核心类型 ──

export type PluginType = string;
export type PluginStatus = string;
export type RegistrationMode = string;
export type LogLevel = string;

export interface PluginContract {
  id: string;
  name: string;
  methods: ContractMethod[];
}

export interface ContractMethod {
  name: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolHandler = (...args: unknown[]) => unknown;

export interface ToolContext {
  pluginId: string;
  metadata?: Record<string, unknown>;
}

export interface HookContext {
  pluginId: string;
  type: string;
  data: unknown;
}

export interface HookResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type HookHandler = (context: HookContext) => HookResult | Promise<HookResult>;

export type HookFailurePolicy = string;

export interface SlotSelectionResult {
  selected: Record<string, string>;
  conflicts?: string[];
}

export interface PluginDefinition {
  id: string;
  name: string;
  type: PluginType;
  version?: string;
  description?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  description?: string;
  entry?: string;
  capabilities?: unknown[];
}

export interface PluginInstance {
  id: string;
  definition: PluginDefinition;
  status: PluginStatus;
}

export interface PluginApi {
  register: (...args: unknown[]) => unknown;
  logger: PluginLogger;
}

export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ── 事件类型 ──

export interface ContractRegistryEvents {
  [key: string]: unknown;
}

export interface ToolRegistryEvents {
  [key: string]: unknown;
}

export interface HookRunnerEvents {
  [key: string]: unknown;
}

// ── 核心类 ──

export declare class ContractRegistry {
  registerContract(contract: PluginContract): void;
  unregisterContract(contractId: string): void;
  getContract(contractId: string): PluginContract | undefined;
  listContracts(): PluginContract[];
  hasContract(contractId: string): boolean;
  registerImplementation(contractId: string, implementation: unknown): void;
  callMethod(contractId: string, methodName: string, ...args: unknown[]): unknown;
  hasImplementation(contractId: string): boolean;
  listImplementations(): string[];
  clear(): void;
}

export declare class ToolRegistry {
  registerTool(tool: ToolDefinition, handler: ToolHandler, context?: ToolContext): void;
  unregisterTool(toolName: string): void;
  unregisterPluginTools(pluginId: string): void;
  getTool(toolName: string): ToolDefinition | undefined;
  listTools(): ToolDefinition[];
  listToolsByPlugin(pluginId: string): ToolDefinition[];
  hasTool(toolName: string): boolean;
  getToolOwner(toolName: string): string | undefined;
  callTool(toolName: string, ...args: unknown[]): unknown;
  getToolDescriptions(): string[];
  clear(): void;
  size(): number;
}

export declare class HookRunner {
  register(type: string, handler: HookHandler, options?: unknown): void;
  execute(type: string, context: HookContext, options?: unknown): Promise<HookResult[]>;
}

export declare class Slots {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  getAll(): Record<string, string>;
  applySelection(selection: Record<string, string>): SlotSelectionResult;
  reset(): void;
}

// ── 函数 ──

export declare function defineContract(contract: PluginContract): PluginContract;
export declare function implementsContract(contractId: string, implementation: unknown): boolean;

export declare function defineTool(definition: ToolDefinition, handler: ToolHandler): unknown;
export declare function registerTool(tool: unknown): void;
export declare function unregisterTool(name: string): void;

export declare function onHook(type: string, handler: HookHandler): void;
export declare function offHook(type: string, handler: HookHandler): void;

export declare function createPluginLogger(pluginId: string, options?: unknown): PluginLogger;
export declare function createNoopLogger(): PluginLogger;

// ── 单例 ──

export declare const contractRegistry: ContractRegistry;
export declare const toolRegistry: ToolRegistry;
export declare const hookRunner: HookRunner;
export declare const slots: Slots;
export declare const emptyPluginConfigSchema: Record<string, unknown>;
