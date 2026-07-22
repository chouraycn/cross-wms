import { EventEmitter } from 'events';
import type {
  TUIMessage,
  TUIState,
  TUIThemeMode,
  TUICommand as TUIParsedCommand,
  TUISession,
  TUIRenderOptions,
} from './types.js';
import { logger } from '../logger.js';
import {
  getPalette,
  markdownTheme,
  editorTheme,
  searchableSelectListTheme,
  filterableSelectListTheme,
  type MarkdownTheme,
} from './theme/theme.js';
import { ChatLog } from './components/chat-log.js';
import { CustomEditor } from './components/custom-editor.js';
import { SearchableSelectList } from './components/searchable-select-list.js';
import { FilterableSelectList } from './components/filterable-select-list.js';
import { TuiInputHistory, parseCommand, isSlashCommand } from './tui-input-history.js';
import { TuiStreamAssembler } from './tui-stream-assembler.js';
import { theme } from './theme/theme.js';

export interface TuiOptions {
  width?: number;
  height?: number;
  themeMode?: TUIThemeMode;
  historyLimit?: number;
  initialSessionId?: string;
}

export type TuiMode = 'chat' | 'select-session' | 'select-model';

export class TUI extends EventEmitter {
  private state: TUIState;
  private chatLog: ChatLog;
  private editor: CustomEditor;
  private inputHistory: TuiInputHistory;
  private streamAssembler: TuiStreamAssembler;
  private width: number;
  private height: number;
  private running: boolean = false;
  private mode: TuiMode = 'chat';
  private selectList: SearchableSelectList | null = null;
  private currentMarkdownTheme: MarkdownTheme;

  constructor(options: TuiOptions = {}) {
    super();
    this.width = options.width ?? 80;
    this.height = options.height ?? 24;
    this.inputHistory = new TuiInputHistory(options.historyLimit ?? 100);
    this.streamAssembler = new TuiStreamAssembler();
    this.currentMarkdownTheme = markdownTheme;

    this.state = {
      messages: [],
      currentInput: '',
      inputHistory: [],
      historyIndex: -1,
      sessionId: options.initialSessionId ?? 'default',
      sessions: [],
      themeMode: options.themeMode ?? 'auto',
      isConnected: false,
      isProcessing: false,
      showTools: true,
      showThinking: false,
      scrollOffset: 0,
      autoCompleteItems: [],
      autoCompleteIndex: 0,
      mode: 'chat',
      selectedIndex: 0,
    };

    this.chatLog = new ChatLog([], this.currentMarkdownTheme);
    this.editor = new CustomEditor({
      theme: editorTheme,
      prompt: '> ',
      history: this.inputHistory,
    });

    this.setupEditorCallbacks();
  }

  private setupEditorCallbacks(): void {
    this.editor.setOnSubmit((text) => {
      this.handleSubmit(text);
    });

    this.editor.setOnChange((text) => {
      this.state.currentInput = text;
      this.emit('input-change', text);
    });

    this.editor.setOnCancel(() => {
      logger.debug('[TUI] Editor cancelled');
      this.emit('cancel');
    });
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.state.isConnected = true;
    logger.info('[TUI] TUI started');
    this.emit('start');
    this.render();
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.state.isConnected = false;
    logger.info('[TUI] TUI stopped');
    this.emit('stop');
  }

  handleKey(input: string): void {
    if (!this.running) {
      return;
    }

    if (this.mode !== 'chat' && this.selectList) {
      this.selectList.handleInput(input);
      this.render();
      return;
    }

    this.editor.handleInput(input);
    this.render();
  }

  private handleSubmit(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (isSlashCommand(trimmed)) {
      this.handleCommand(trimmed);
      return;
    }

    this.addUserMessage(trimmed);
    this.emit('submit', trimmed);
  }

  private handleCommand(input: string): void {
    const parsed = parseCommand(input);
    if (!parsed) {
      return;
    }

    const command: TUIParsedCommand = {
      type: parsed.command,
      args: parsed.args,
      raw: input,
    };

    logger.debug('[TUI] Command:', command.type, command.args);

    switch (command.type) {
      case '/help':
        this.showHelp();
        break;
      case '/clear':
        this.clearMessages();
        break;
      case '/theme':
        if (command.args.length > 0) {
          this.setTheme(command.args[0]);
        } else {
          this.toggleTheme();
        }
        break;
      case '/sessions':
        this.showSessionList();
        break;
      case '/new':
        this.createNewSession(command.args.join(' '));
        break;
      case '/switch':
        if (command.args.length > 0) {
          this.switchSession(command.args[0]);
        } else {
          this.showSessionList();
        }
        break;
      case '/delete':
        if (command.args.length > 0) {
          this.deleteSession(command.args[0]);
        } else {
          this.addSystemMessage('Usage: /delete <session-id>');
        }
        break;
      case '/reset':
        this.resetSession();
        break;
      case '/abort':
        this.abortCurrentRun();
        break;
      case '/compact':
        this.compactContext();
        break;
      case '/history':
        this.showHistory();
        break;
      case '/model':
        if (command.args.length > 0) {
          this.setModel(command.args.join(' '));
        } else {
          this.showCurrentModel();
        }
        break;
      case '/models':
        this.showModelList();
        break;
      case '/agent':
        if (command.args.length > 0) {
          this.setAgent(command.args[0]);
        } else {
          this.showAgentList();
        }
        break;
      case '/agents':
        this.showAgentList();
        break;
      case '/think':
      case '/thinking':
        if (command.args.length > 0) {
          this.setThinkingLevel(command.args[0]);
        } else {
          this.toggleThinking();
        }
        break;
      case '/fast':
        if (command.args.length > 0) {
          this.setFastMode(command.args[0]);
        } else {
          this.showFastMode();
        }
        break;
      case '/verbose':
        if (command.args.length > 0) {
          this.setVerboseMode(command.args[0]);
        } else {
          this.toggleVerbose();
        }
        break;
      case '/usage':
        if (command.args.length > 0) {
          this.setUsageMode(command.args[0]);
        } else {
          this.showUsageMode();
        }
        break;
      case '/status':
        this.showStatus();
        break;
      case '/info':
        this.showSessionInfo();
        break;
      case '/tools':
        this.toggleTools();
        break;
      case '/exit':
      case '/quit':
        this.stop();
        break;
      default:
        this.addSystemMessage(`Unknown command: ${command.type}. Type /help for available commands.`);
    }

    this.emit('command', command);
  }

  addUserMessage(content: string): TUIMessage {
    const message: TUIMessage = {
      id: this.generateId(),
      role: 'user',
      content,
      status: 'complete',
      timestamp: Date.now(),
    };
    this.state.messages.push(message);
    this.chatLog.addMessage(message);
    this.scrollToBottom();
    this.render();
    return message;
  }

  addAssistantMessage(content: string, options?: {
    status?: TUIMessage['status'];
    toolCalls?: TUIMessage['toolCalls'];
    thinking?: string;
  }): TUIMessage {
    const message: TUIMessage = {
      id: this.generateId(),
      role: 'assistant',
      content,
      status: options?.status ?? 'complete',
      timestamp: Date.now(),
      toolCalls: options?.toolCalls,
      thinking: options?.thinking,
    };
    this.state.messages.push(message);
    this.chatLog.addMessage(message);
    this.scrollToBottom();
    this.render();
    return message;
  }

  addSystemMessage(content: string): TUIMessage {
    const message: TUIMessage = {
      id: this.generateId(),
      role: 'system',
      content,
      status: 'complete',
      timestamp: Date.now(),
    };
    this.state.messages.push(message);
    this.chatLog.addMessage(message);
    this.scrollToBottom();
    this.render();
    return message;
  }

  updateAssistantMessage(messageId: string, updates: Partial<TUIMessage>): void {
    const index = this.state.messages.findIndex((m) => m.id === messageId);
    if (index === -1) {
      return;
    }
    this.state.messages[index] = { ...this.state.messages[index], ...updates };
    this.chatLog.setMessages([...this.state.messages]);
    this.render();
  }

  appendAssistantDelta(messageId: string, delta: string): void {
    const index = this.state.messages.findIndex((m) => m.id === messageId);
    if (index === -1) {
      return;
    }
    const msg = this.state.messages[index];
    msg.content += delta;
    msg.status = 'streaming';
    this.chatLog.setMessages([...this.state.messages]);
    this.scrollToBottom();
    this.render();
  }

  setSessions(sessions: TUISession[]): void {
    this.state.sessions = sessions;
  }

  setCurrentSession(sessionId: string): void {
    this.state.sessionId = sessionId;
    this.emit('session-change', sessionId);
  }

  clearMessages(): void {
    this.state.messages = [];
    this.chatLog.setMessages([]);
    this.scrollToBottom();
    this.render();
    logger.debug('[TUI] Messages cleared');
  }

  toggleTheme(): void {
    const modes: TUIThemeMode[] = ['auto', 'light', 'dark'];
    const currentIndex = modes.indexOf(this.state.themeMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.state.themeMode = modes[nextIndex] ?? 'auto';
    const palette = getPalette(this.state.themeMode);
    this.currentMarkdownTheme = {
      ...markdownTheme,
      heading: (text) => text,
      link: (text) => text,
      linkUrl: (text) => text,
      code: (text) => text,
      codeBlock: (text) => text,
      codeBlockBorder: (text) => text,
      quote: (text) => text,
      quoteBorder: (text) => text,
      hr: (text) => text,
      listBullet: (text) => text,
      bold: (text) => text,
      italic: (text) => text,
      strikethrough: (text) => text,
      underline: (text) => text,
      highlightCode: (code: string) => code.split('\n'),
    };
    this.chatLog = new ChatLog(this.state.messages, this.currentMarkdownTheme);
    this.addSystemMessage(`Theme: ${this.state.themeMode}`);
    this.emit('theme-change', this.state.themeMode);
  }

  toggleTools(): void {
    this.state.showTools = !this.state.showTools;
    this.chatLog.setShowTools(this.state.showTools);
    this.addSystemMessage(`Tools: ${this.state.showTools ? 'shown' : 'hidden'}`);
    this.render();
  }

  toggleThinking(): void {
    this.state.showThinking = !this.state.showThinking;
    this.chatLog.setShowThinking(this.state.showThinking);
    this.addSystemMessage(`Thinking: ${this.state.showThinking ? 'shown' : 'hidden'}`);
    this.render();
  }

  setTheme(mode: string): void {
    const validModes: TUIThemeMode[] = ['auto', 'light', 'dark'];
    const normalized = mode.toLowerCase() as TUIThemeMode;
    if (!validModes.includes(normalized)) {
      this.addSystemMessage(`Invalid theme mode: ${mode}. Valid options: auto, light, dark`);
      return;
    }
    this.state.themeMode = normalized;
    const palette = getPalette(this.state.themeMode);
    this.currentMarkdownTheme = {
      ...markdownTheme,
      heading: (text) => text,
      link: (text) => text,
      linkUrl: (text) => text,
      code: (text) => text,
      codeBlock: (text) => text,
      codeBlockBorder: (text) => text,
      quote: (text) => text,
      quoteBorder: (text) => text,
      hr: (text) => text,
      listBullet: (text) => text,
      bold: (text) => text,
      italic: (text) => text,
      strikethrough: (text) => text,
      underline: (text) => text,
      highlightCode: (code: string) => code.split('\n'),
    };
    this.chatLog = new ChatLog(this.state.messages, this.currentMarkdownTheme);
    this.addSystemMessage(`Theme: ${this.state.themeMode}`);
    this.emit('theme-change', this.state.themeMode);
    this.render();
  }

  createNewSession(title?: string): void {
    const newId = this.generateId();
    const newTitle = title || `Session ${new Date().toLocaleTimeString()}`;
    const newSession: TUISession = {
      id: newId,
      title: newTitle,
      updatedAt: Date.now(),
      messageCount: 0,
    };
    this.state.sessions.push(newSession);
    this.state.sessionId = newId;
    this.clearMessages();
    this.addSystemMessage(`Created new session: ${newTitle}`);
    this.emit('session-change', newId);
    this.render();
  }

  switchSession(sessionId: string): void {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      this.addSystemMessage(`Session not found: ${sessionId}`);
      return;
    }
    this.state.sessionId = sessionId;
    this.addSystemMessage(`Switched to session: ${session.title}`);
    this.emit('session-change', sessionId);
    this.render();
  }

  deleteSession(sessionId: string): void {
    const index = this.state.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) {
      this.addSystemMessage(`Session not found: ${sessionId}`);
      return;
    }
    const deletedSession = this.state.sessions[index];
    this.state.sessions.splice(index, 1);
    if (this.state.sessionId === sessionId) {
      this.state.sessionId = this.state.sessions.length > 0 ? this.state.sessions[0].id : 'default';
      this.clearMessages();
    }
    this.addSystemMessage(`Deleted session: ${deletedSession.title}`);
    this.render();
  }

  resetSession(): void {
    this.state.sessionId = 'default';
    this.clearMessages();
    this.addSystemMessage('Session reset to default');
    this.emit('session-change', 'default');
    this.render();
  }

  abortCurrentRun(): void {
    this.addSystemMessage('Aborting current run...');
    this.emit('abort');
    this.state.isProcessing = false;
    this.render();
  }

  compactContext(): void {
    this.addSystemMessage('Compacting context...');
    this.emit('compact');
    this.render();
  }

  showHistory(): void {
    const messages = this.getMessages();
    if (messages.length === 0) {
      this.addSystemMessage('No history available');
      return;
    }
    const historyText = messages
      .map((m) => {
        const role = m.role === 'user' ? '[User]' : m.role === 'assistant' ? '[Assistant]' : '[System]';
        return `${role} ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`;
      })
      .join('\n');
    this.addSystemMessage(`\n${historyText}`);
    this.render();
  }

  showCurrentModel(): void {
    this.addSystemMessage('Current model: default');
    this.render();
  }

  setModel(modelName: string): void {
    this.addSystemMessage(`Model set to: ${modelName}`);
    this.emit('model-change', modelName);
    this.render();
  }

  showModelList(): void {
    const models = [
      'gpt-4o-mini',
      'gpt-4o',
      'claude-3-sonnet',
      'deepseek-chat',
      'qwen-2.5-7b',
      'moonshot-v1-8k',
    ];
    this.addSystemMessage(`Available models:\n${models.map((m) => `  - ${m}`).join('\n')}`);
    this.render();
  }

  showAgentList(): void {
    const agents = [
      { id: 'wms-expert', name: 'WMS Expert', desc: 'Warehouse management specialist' },
      { id: 'wms-analyst', name: 'WMS Analyst', desc: 'Data analysis and reporting' },
      { id: 'wms-operator', name: 'WMS Operator', desc: 'Execute warehouse operations' },
      { id: 'general', name: 'General', desc: 'General purpose assistant' },
      { id: 'debugger', name: 'Debugger', desc: 'Issue troubleshooting' },
    ];
    const agentText = agents
      .map((a) => `  ${a.id} - ${a.name}: ${a.desc}`)
      .join('\n');
    this.addSystemMessage(`Available agents:\n${agentText}`);
    this.render();
  }

  setAgent(agentId: string): void {
    const agents = ['wms-expert', 'wms-analyst', 'wms-operator', 'general', 'debugger'];
    if (!agents.includes(agentId)) {
      this.addSystemMessage(`Unknown agent: ${agentId}`);
      return;
    }
    this.addSystemMessage(`Agent set to: ${agentId}`);
    this.emit('agent-change', agentId);
    this.render();
  }

  setThinkingLevel(level: string): void {
    const validLevels = ['on', 'off', 'verbose'];
    const normalized = level.toLowerCase();
    if (!validLevels.includes(normalized)) {
      this.addSystemMessage(`Invalid thinking level: ${level}. Valid options: ${validLevels.join(', ')}`);
      return;
    }
    this.state.showThinking = normalized !== 'off';
    this.chatLog.setShowThinking(this.state.showThinking);
    this.addSystemMessage(`Thinking level: ${normalized}`);
    this.render();
  }

  setFastMode(mode: string): void {
    const validModes = ['auto', 'on', 'off'];
    const normalized = mode.toLowerCase();
    if (!validModes.includes(normalized)) {
      this.addSystemMessage(`Invalid fast mode: ${mode}. Valid options: ${validModes.join(', ')}`);
      return;
    }
    this.addSystemMessage(`Fast mode: ${normalized}`);
    this.render();
  }

  showFastMode(): void {
    this.addSystemMessage('Fast mode: auto');
    this.render();
  }

  setVerboseMode(mode: string): void {
    const validModes = ['on', 'off'];
    const normalized = mode.toLowerCase();
    if (!validModes.includes(normalized)) {
      this.addSystemMessage(`Invalid verbose mode: ${mode}. Valid options: ${validModes.join(', ')}`);
      return;
    }
    this.addSystemMessage(`Verbose mode: ${normalized}`);
    this.render();
  }

  toggleVerbose(): void {
    this.addSystemMessage('Verbose mode: off (toggling is not supported, use /verbose on|off)');
    this.render();
  }

  setUsageMode(mode: string): void {
    const validModes = ['off', 'tokens', 'full'];
    const normalized = mode.toLowerCase();
    if (!validModes.includes(normalized)) {
      this.addSystemMessage(`Invalid usage mode: ${mode}. Valid options: ${validModes.join(', ')}`);
      return;
    }
    this.addSystemMessage(`Usage mode: ${normalized}`);
    this.render();
  }

  showUsageMode(): void {
    this.addSystemMessage('Usage mode: tokens');
    this.render();
  }

  showStatus(): void {
    const statusText = `
System Status:
  - Connection: ${this.state.isConnected ? 'Connected' : 'Disconnected'}
  - Session: ${this.state.sessionId}
  - Messages: ${this.state.messages.length}
  - Theme: ${this.state.themeMode}
  - Tools: ${this.state.showTools ? 'Visible' : 'Hidden'}
  - Thinking: ${this.state.showThinking ? 'Visible' : 'Hidden'}
    `.trim();
    this.addSystemMessage(statusText);
    this.render();
  }

  showSessionInfo(): void {
    const session = this.state.sessions.find((s) => s.id === this.state.sessionId);
    if (session) {
      this.addSystemMessage(`
Session Info:
  - ID: ${session.id}
  - Title: ${session.title}
  - Updated: ${new Date(session.updatedAt).toLocaleString()}
  - Messages: ${session.messageCount}
        `.trim());
    } else {
      this.addSystemMessage(`Session: ${this.state.sessionId}`);
    }
    this.render();
  }

  private showHelp(): void {
    const helpText = `
Available commands:
  /help      - Show this help message
  /clear     - Clear the chat history
  /theme     - Toggle theme (auto/light/dark)
  /sessions  - List available sessions
  /tools     - Toggle tool call display
  /thinking  - Toggle thinking display
  /exit      - Exit the TUI

Navigation:
  Up/Down    - Navigate input history
  PageUp/Dn  - Scroll chat log
  Ctrl+C     - Cancel / Exit
`.trim();
    this.addSystemMessage(helpText);
  }

  private showSessionList(): void {
    if (this.state.sessions.length === 0) {
      this.addSystemMessage('No sessions available.');
      return;
    }

    const items = this.state.sessions.map((s) => ({
      value: s.id,
      label: s.title,
      description: `${s.messageCount} messages`,
    }));

    this.selectList = new SearchableSelectList({
      items,
      theme: searchableSelectListTheme,
      maxVisible: 10,
      searchPrompt: 'Search sessions: ',
    });

    this.selectList.setOnSelect((item) => {
      this.setCurrentSession(item.value);
      this.mode = 'chat';
      this.selectList = null;
      this.addSystemMessage(`Switched to session: ${item.label}`);
      this.render();
    });

    this.selectList.setOnCancel(() => {
      this.mode = 'chat';
      this.selectList = null;
      this.render();
    });

    this.mode = 'select-session';
    this.render();
  }

  scrollToBottom(): void {
    this.chatLog.scrollToBottom();
  }

  scrollToTop(): void {
    this.chatLog.scrollToTop();
  }

  scrollUp(lines: number = 1): void {
    this.chatLog.scrollUp(lines);
    this.render();
  }

  scrollDown(lines: number = 1): void {
    this.chatLog.scrollDown(lines);
    this.render();
  }

  render(): string[] {
    const lines: string[] = [];

    const header = this.renderHeader();
    lines.push(...header);

    const chatHeight = Math.max(1, this.height - header.length - this.renderFooter().length - 1);
    const chatLines = this.chatLog.render(this.width, chatHeight);
    lines.push(...chatLines);

    lines.push(theme.border('─'.repeat(this.width)));

    if (this.mode !== 'chat' && this.selectList) {
      const selectLines = this.selectList.render(this.width);
      lines.push(...selectLines);
    } else {
      const inputLines = this.editor.render(this.width);
      lines.push(...inputLines);
    }

    return lines;
  }

  private renderHeader(): string[] {
    const lines: string[] = [];
    const status = this.state.isConnected ? '● Connected' : '○ Disconnected';
    const session = `Session: ${this.state.sessionId}`;
    const theme_ = `Theme: ${this.state.themeMode}`;
    const header = `${theme.bold(status)}  ${theme.dim(session)}  ${theme.dim(theme_)}`;
    lines.push(header);
    lines.push(theme.border('─'.repeat(this.width)));
    return lines;
  }

  private renderFooter(): string[] {
    const lines: string[] = [];
    const msgCount = `Messages: ${this.state.messages.length}`;
    const hint = theme.dim('Type /help for commands');
    lines.push(theme.dim(`${msgCount}  ${hint}`));
    return lines;
  }

  getState(): TUIState {
    return { ...this.state };
  }

  getMessages(): TUIMessage[] {
    return [...this.state.messages];
  }

  getCurrentInput(): string {
    return this.editor.getText();
  }

  getMode(): TuiMode {
    return this.mode;
  }

  getStreamAssembler(): TuiStreamAssembler {
    return this.streamAssembler;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.render();
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  isRunning(): boolean {
    return this.running;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

export interface TUICommand {
  name: string;
  description: string;
  usage?: string;
  handler: (args: string[]) => void | Promise<void>;
}

const builtinCommands: TUICommand[] = [
  { name: 'help', description: '显示帮助信息', handler: () => {} },
  { name: 'clear', description: '清空聊天记录', handler: () => {} },
  { name: 'theme', description: '切换主题 (auto/light/dark)', usage: '/theme [auto|light|dark]', handler: () => {} },
  { name: 'sessions', description: '列出会话', handler: () => {} },
  { name: 'new', description: '新建会话', handler: () => {} },
  { name: 'models', description: '选择模型', handler: () => {} },
  { name: 'tools', description: '查看可用工具', handler: () => {} },
  { name: 'thinking', description: '切换思考模式', handler: () => {} },
  { name: 'quit', description: '退出 TUI', handler: () => {} },
  { name: 'exit', description: '退出 TUI', handler: () => {} },
];

const customCommands: TUICommand[] = [];

export function getCommands(): TUICommand[] {
  return [...builtinCommands, ...customCommands];
}

export function registerCommand(cmd: TUICommand): void {
  customCommands.push(cmd);
}

export async function executeCommand(tui: TUI, commandName: string, args: string[]): Promise<boolean> {
  const allCommands = getCommands();
  const cmd = allCommands.find((c) => c.name === commandName);
  if (!cmd) {
    return false;
  }
  await cmd.handler(args);
  return true;
}

export class EmbeddedBackend {
  private tui: TUI | null = null;
  private connected = false;

  constructor() {}

  connect(tui: TUI): void {
    this.tui = tui;
    this.connected = true;
  }

  disconnect(): void {
    this.tui = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendUserMessage(content: string): Promise<void> {
    if (!this.tui) return;
    this.tui.addUserMessage(content);
  }

  async listSessions(): Promise<Array<{ id: string; title: string; updatedAt: number; messageCount: number }>> {
    return [];
  }

  async loadHistory(_sessionId: string): Promise<TUIMessage[]> {
    return [];
  }
}

let activeTui: TUI | null = null;

export async function runTui(options: TuiOptions = {}): Promise<TUI> {
  const tui = new TUI(options);
  activeTui = tui;
  return tui;
}

export function getActiveTui(): TUI | null {
  return activeTui;
}

export function getTheme(): { mode: TUIThemeMode; palette: typeof import('./theme/theme.js').palette } {
  const { palette, getPalette } = require('./theme/theme.js');
  return { mode: 'auto', palette };
}

export function detectTheme(): 'light' | 'dark' {
  try {
    const { lightMode } = require('./theme/theme.js');
    return lightMode ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
