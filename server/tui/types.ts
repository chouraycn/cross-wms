// TUI 选项
export interface TuiOptions {
  model?: string;
  agentId?: string;
  sessionId?: string;
  verbose?: boolean;
  /** 历史命令条数 */
  historySize?: number;
  /** 自定义配置文件路径 */
  configPath?: string;
}

// TUI 结果
export interface TuiResult {
  exitCode: number;
  lastSessionId?: string;
}

// 聊天事件
export interface ChatEvent {
  type: 'user_message' | 'assistant_start' | 'assistant_chunk' | 'assistant_end' | 'tool_call' | 'tool_result' | 'error' | 'thinking';
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  error?: string;
}

// 会话信息
export interface SessionInfo {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// 后端接口
export interface TuiBackend {
  sendChat(messages: Array<{ role: string; content: string }>, signal?: AbortSignal): AsyncIterable<ChatEvent>;
  abortChat(): void;
  loadHistory(sessionId: string): Promise<Array<{ role: string; content: string }>>;
  listSessions(): Promise<SessionInfo[]>;
  createSession(title?: string): Promise<SessionInfo>;
  deleteSession(id: string): Promise<void>;
}

// 命令定义
export interface TuiCommand {
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  handler: (args: string[], ctx: TuiCommandContext) => Promise<void> | void;
}

export interface TuiCommandContext {
  backend: TuiBackend;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  print: (text: string) => void;
  printError: (text: string) => void;
  exit: () => void;
}

// 主题
export interface TuiTheme {
  name: string;
  isDark: boolean;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    error: string;
    warning: string;
    success: string;
    muted: string;
    user: string;
    assistant: string;
    tool: string;
    border: string;
  };
}
