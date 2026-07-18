/**
 * Agent 工具契约定义
 *
 * 定义带元数据的工具类型、参数读取器、JSON 结果、
 * 进度块与媒体消毒器等共享契约，供 tools/ 下的具体工具实现复用。
 *
 * 参考自 openclaw/src/agents/tools/common.ts。
 */
import type { ToolDefinition } from '../agent-tools/types.js';

/**
 * 工具执行上下文，传递给预处理/执行函数的环境信息。
 */
export interface AgentToolExecutionContext {
  toolCallId: string;
  signal?: AbortSignal;
  hookContext?: unknown;
}

/**
 * 工具执行过程中的更新回调，用于向调用方推送进度等中间状态。
 */
export type AgentToolUpdateCallback = (result: AgentToolResult<unknown>) => void;

/**
 * 工具结果内容块：文本或图片。
 */
export type AgentToolContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/**
 * 工具进度块，用于在执行过程中向频道推送可见的进度文本。
 */
export interface ProgressBlock {
  /** 进度文本 */
  text: string;
  /** 进度标识，便于去重或更新 */
  id?: string;
  /** 可见性：channel 表示推送到频道，private 表示仅内部可见 */
  visibility?: 'channel' | 'private';
  /** 隐私级别：public 表示可公开展示，private 表示仅调用方可见 */
  privacy?: 'public' | 'private';
}

/**
 * 工具执行结果。
 */
export interface AgentToolResult<TResult> {
  content: AgentToolContentBlock[];
  details?: TResult;
  progress?: ProgressBlock;
}

/**
 * 工具执行函数签名。
 */
export type AgentToolExecute<TResult> = (
  this: void,
  toolCallId: string,
  params: unknown,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback,
) => Promise<AgentToolResult<TResult>>;

/**
 * 带元数据的工具定义。
 *
 * 在 ToolDefinition 基础上扩展执行函数与展示元信息，
 * 供 tools/ 下的具体工具实现统一描述自身。
 */
export type AgentToolWithMeta<TResult = unknown> = ToolDefinition & {
  /** 工具的简短展示摘要 */
  displaySummary?: string;
  /** 执行函数 */
  execute: AgentToolExecute<TResult>;
  /** 在工具调用前对参数进行预处理（如注入默认值） */
  prepareBeforeToolCallParams?: (
    params: unknown,
    ctx: AgentToolExecutionContext,
  ) => unknown;
  /** 在工具调用完成后对参数进行收尾处理 */
  finalizeBeforeToolCallParams?: (params: unknown, preparedParams: unknown) => unknown;
};

/**
 * 擦除泛型的工具执行类型。
 *
 * 用于在异构工具集合中统一存放执行函数，调用方需自行处理返回的 unknown 结果。
 */
export type ErasedAgentToolExecute = {
  execute(
    this: void,
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback,
  ): Promise<AgentToolResult<unknown>>;
};

/**
 * 参数读取器：从参数记录中按 key 读取并转换为指定类型。
 */
export type ParamReader<T = unknown> = (
  params: Record<string, unknown>,
  key: string,
) => T | undefined;

/**
 * JSON 工具结果：将 payload 序列化为文本内容块。
 */
export type JsonResult = AgentToolResult<unknown> & {
  content: Array<{ type: 'text'; text: string }>;
};

/**
 * 媒体消毒器：对工具结果中的图片等媒体进行安全处理（如尺寸限制、格式校验）。
 */
export type MediaSanitizer = (media: {
  mimeType: string;
  data: string;
}) => Promise<{ mimeType: string; data: string }> | { mimeType: string; data: string };
