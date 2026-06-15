import type { QueryResult } from './inventory-query';

export interface ReferencedSession {
  id: string;
  title: string;
}

/** 工具调用信息（AI 通过 Tool Calling 执行的操作） */
export interface ToolCallInfo {
  /** 工具调用 ID（对应 OpenAI tool_call.id） */
  id?: string;
  /** 工具名称（如 file:readFile、shell:exec） */
  name: string;
  /** 工具参数（JSON 字符串） */
  arguments: string;
  /** 工具执行结果 */
  result: string;
}

/** v3.0: 插件自动调用结果 */
export interface PluginResultInfo {
  /** 触发的插件工具名 */
  tool: string;
  /** 插件输出内容 */
  output: string;
  /** 执行耗时(ms) */
  durationMs?: number;
}

/** 消息元数据（可扩展） */
export interface MessageMetadata {
  /** 自然语言查询结果（仅 builtin-inventory-query 技能产生） */
  queryResult?: QueryResult;
  /** 是否正在加载查询结果 */
  loading?: boolean;
  /** 查询错误信息 */
  error?: string;
  /** v1.7.0: 查询错误码（如 SQL_EXEC_FAILED 用于前端 auto-retry 判断） */
  errorCode?: string;
  /** v1.7.0: 是否已自动重试（每会话仅重试一次） */
  autoRetried?: boolean;
}

export interface Attachment {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  type: 'image' | 'file';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  /** 用户发送此消息时引用的历史会话（仅 user 消息携带） */
  referencedSessions?: ReferencedSession[];
  /** Auto 模式选型原因（如 "Claude Sonnet 4 · 检测到代码内容"） */
  autoReason?: string;
  /** Auto 选型原因类型 */
  autoReasonType?: 'code' | 'complex' | 'simple' | 'default';
  /** 消息元数据（可扩展，用于承载查询结果等附加信息） */
  metadata?: MessageMetadata;
  /** v1.8.6: AI 思考过程内容（如 DeepSeek-R1 reasoning_content / Claude thinking） */
  thinking?: string;
  /** v1.8.6: 思考耗时（毫秒） */
  thinkingDuration?: number;
  /** v1.8.7: 思考类型 — deep 深度思考（远程大模型）/ local 本地思考（本地模型/缓存/规则） */
  thinkingType?: 'deep' | 'local';
  /** v1.9.0: AI 工具调用记录（Tool Calling） */
  toolCalls?: ToolCallInfo[];
  /** 附件列表（图片、文件等） */
  attachments?: Attachment[];
  /** 推理强度（'high' 深度思考 / 'max' 极致推理） */
  reasoningEffort?: string;
  /** v2.2.0: 思考已等待时间（毫秒，心跳更新） */
  thinkingElapsed?: number;
  /** v2.2.0: 是否命中 thinking 缓存 */
  cacheHit?: boolean;
  /** v2.2.0: token 使用统计 */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    thinkingTokens?: number;
    totalTokens?: number;
  };
  /** v3.0: 插件自动调用结果（reasoning 流中触发） */
  pluginResults?: PluginResultInfo[];
  /** v1.9.3: 内联权限请求（敏感工具执行确认） */
  permissionRequest?: {
    reqId: string;
    toolName: string;
    toolArgs: string;
    approved?: boolean;
    /** v2.2.1: 风险等级 */
    riskLevel?: 'auto' | 'confirm' | 'high-risk';
  };
}

export interface Session {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  folderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}
