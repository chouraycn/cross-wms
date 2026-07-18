export type TUIMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type TUIMessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface TUIToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  errorMessage?: string;
  startTime?: number;
  endTime?: number;
}

export interface TUIMessage {
  id: string;
  role: TUIMessageRole;
  content: string;
  status: TUIMessageStatus;
  timestamp: number;
  toolCalls?: TUIToolCall[];
  thinking?: string;
}

export type TUIThemeMode = 'light' | 'dark' | 'auto';

export interface TUIPalette {
  text: string;
  dim: string;
  accent: string;
  accentSoft: string;
  border: string;
  userBg: string;
  userText: string;
  systemText: string;
  toolPendingBg: string;
  toolSuccessBg: string;
  toolErrorBg: string;
  toolTitle: string;
  toolOutput: string;
  quote: string;
  quoteBorder: string;
  code: string;
  codeBlock: string;
  codeBorder: string;
  link: string;
  error: string;
  success: string;
}

export interface TUITheme {
  palette: TUIPalette;
  mode: TUIThemeMode;
}

export type TUICommandType =
  | '/help'
  | '/clear'
  | '/theme'
  | '/sessions'
  | '/models'
  | '/exit'
  | '/status'
  | '/history'
  | string;

export interface TUICommand {
  type: TUICommandType;
  args: string[];
  raw: string;
}

export interface TUISession {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

export interface TUIState {
  messages: TUIMessage[];
  currentInput: string;
  inputHistory: string[];
  historyIndex: number;
  sessionId: string;
  sessions: TUISession[];
  themeMode: TUIThemeMode;
  isConnected: boolean;
  isProcessing: boolean;
  showTools: boolean;
  showThinking: boolean;
  scrollOffset: number;
  autoCompleteItems: string[];
  autoCompleteIndex: number;
  mode: 'chat' | 'command' | 'select';
  selectedIndex: number;
}

export type TUIEventType =
  | 'message'
  | 'command'
  | 'input'
  | 'keydown'
  | 'resize'
  | 'theme-change'
  | 'session-change';

export interface TUIEvent {
  type: TUIEventType;
  data?: unknown;
}

export interface TUIRenderOptions {
  width: number;
  height: number;
}

export interface TUIComponent {
  render(options: TUIRenderOptions): string[];
}

export interface TUISelectItem {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
}
