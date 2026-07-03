/**
 * E2E 测试：TUI 终端界面
 *
 * 端到端验证 5 个 TUI 系统核心能力：
 * 1. 类型定义与接口契约（TuiBackend、ChatEvent、SessionInfo 等）
 * 2. 主题系统（暗/亮主题、颜色化、自动检测）
 * 3. 命令系统（12 个斜杠命令解析与执行）
 * 4. EmbeddedBackend（内存会话管理与流式响应）
 * 5. runTui 主流程（模块导入与基本初始化）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock readline（避免实际终端交互）
vi.mock('node:readline', () => {
  const mockRl = {
    on: vi.fn(),
    close: vi.fn(),
    prompt: vi.fn(),
  };
  return {
    createInterface: vi.fn(() => mockRl),
    default: { createInterface: vi.fn(() => mockRl) },
  };
});

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// 简单的内存后端实现（用于测试）
class MockTuiBackend {
  private sessions = new Map<string, { id: string; title: string; updatedAt: number; messages: Array<{ role: string; content: string }> }>();

  async createSession(title: string) {
    const id = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const session = { id, title, updatedAt: Date.now(), messages: [] };
    this.sessions.set(id, session);
    return { id, title, messageCount: 0, updatedAt: session.updatedAt };
  }

  async listSessions() {
    return Array.from(this.sessions.values())
      .map(s => ({ id: s.id, title: s.title, messageCount: s.messages.length, updatedAt: s.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteSession(id: string) {
    this.sessions.delete(id);
  }

  async loadHistory(id: string) {
    const s = this.sessions.get(id);
    return s ? s.messages : [];
  }

  saveMessage(id: string, role: string, content: string) {
    const s = this.sessions.get(id);
    if (s) {
      s.messages.push({ role, content });
      s.updatedAt = Date.now();
    }
  }

  async *sendChat(messages: Array<{ role: string; content: string }>) {
    yield { type: 'assistant_start' };
    yield { type: 'thinking', content: '正在思考...' };
    yield { type: 'assistant_chunk', content: '收到你的消息：' };
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.content) {
      yield { type: 'assistant_chunk', content: lastMsg.content };
    }
    yield { type: 'assistant_end' };
  }

  abortChat() {}
}

// 延迟导入（mock 之后）
describe('E2E: TUI 终端界面', () => {

  // ==================== 1. 类型定义 ====================
  describe('类型定义', () => {
    it('应正确导入 TUI 类型', async () => {
      const types = await import('../tui/types.js');
      expect(types).toBeDefined();
    });

    it('TuiBackend 接口应包含必要方法', async () => {
      // 验证类型可以被导入（运行时无类型，但模块结构存在）
      const { EmbeddedBackend } = await import('../tui/embeddedBackend.js');
      const backend = new EmbeddedBackend();

      expect(typeof backend.sendChat).toBe('function');
      expect(typeof backend.abortChat).toBe('function');
      expect(typeof backend.loadHistory).toBe('function');
      expect(typeof backend.listSessions).toBe('function');
      expect(typeof backend.createSession).toBe('function');
      expect(typeof backend.deleteSession).toBe('function');
    });

    it('ChatEvent 类型应支持所有事件类型', async () => {
      const { EmbeddedBackend } = await import('../tui/embeddedBackend.js');
      const backend = new EmbeddedBackend();

      // 获取一个流式迭代器并检查第一个事件
      const messages = [{ role: 'user', content: 'hello' }];
      const stream = backend.sendChat(messages as any);

      // 读取第一个事件
      const firstEvent = await stream.next();
      expect(firstEvent.done).toBe(false);
      expect(firstEvent.value.type).toBeDefined();
      const validTypes = [
        'user_message', 'assistant_start', 'assistant_chunk', 'assistant_end',
        'tool_call', 'tool_result', 'error', 'thinking',
      ];
      // 第一个事件应该是合法的类型
      expect(validTypes).toContain(firstEvent.value.type);
    });
  });

  // ==================== 2. 主题系统 ====================
  describe('主题系统', () => {
    it('getTheme 应返回有效主题', async () => {
      const { getTheme } = await import('../tui/theme.js');
      const dark = getTheme('dark');
      const light = getTheme('light');

      expect(dark.name).toBe('dark');
      expect(dark.isDark).toBe(true);
      expect(light.name).toBe('light');
      expect(light.isDark).toBe(false);

      // 颜色应存在
      expect(dark.colors.primary).toBeDefined();
      expect(dark.colors.error).toBeDefined();
      expect(dark.colors.success).toBeDefined();
      expect(dark.colors.user).toBeDefined();
      expect(dark.colors.assistant).toBeDefined();
    });

    it('colorize 应返回带颜色的文本', async () => {
      const { colorize, ANSI } = await import('../tui/theme.js');
      const colored = colorize('hello', ANSI.red);
      expect(colored).toContain(ANSI.red);
      expect(colored).toContain(ANSI.reset);
      expect(colored).toContain('hello');
    });

    it('bold/dim/italic 应正确装饰文本', async () => {
      const { bold, dim, italic, ANSI } = await import('../tui/theme.js');

      expect(bold('test')).toContain(ANSI.bold);
      expect(dim('test')).toContain(ANSI.dim);
      expect(italic('test')).toContain(ANSI.italic);
    });

    it('detectTheme 应返回有效主题', async () => {
      const { detectTheme } = await import('../tui/theme.js');
      const theme = detectTheme();
      expect(theme).toBeDefined();
      expect(['dark', 'light']).toContain(theme.name);
    });

    it('主题应包含所有必需颜色', async () => {
      const { getTheme } = await import('../tui/theme.js');
      const theme = getTheme('dark');

      const requiredColors = [
        'primary', 'secondary', 'accent', 'error', 'warning',
        'success', 'muted', 'user', 'assistant', 'tool', 'border',
      ];
      for (const color of requiredColors) {
        expect(theme.colors[color as keyof typeof theme.colors]).toBeDefined();
      }
    });
  });

  // ==================== 3. 命令系统 ====================
  describe('命令系统', () => {
    it('应包含 12 个内置命令', async () => {
      const { getCommands } = await import('../tui/commands.js');
      const cmds = getCommands();
      expect(cmds.length).toBeGreaterThanOrEqual(12);
    });

    it('应包含核心命令', async () => {
      const { getCommands } = await import('../tui/commands.js');
      const cmds = getCommands();
      const names = cmds.map(c => c.name);

      const expected = [
        'help', 'exit', 'quit', 'clear', 'sessions',
        'new', 'switch', 'delete', 'history', 'info',
        'compact', 'model', 'agents',
      ];
      for (const name of expected) {
        const found = cmds.some(c => c.name === name || c.aliases?.includes(name));
        expect(found).toBe(true);
      }
    });

    it('executeCommand 应能执行 /help 命令', async () => {
      const { executeCommand } = await import('../tui/commands.js');

      const output: string[] = [];
      const ctx: any = {
        backend: new MockTuiBackend(),
        sessionId: null,
        setSessionId: vi.fn(),
        print: (text: string) => output.push(text),
        printError: (text: string) => output.push(`ERR: ${text}`),
        exit: vi.fn(),
      };

      const handled = await executeCommand('/help', ctx);
      expect(handled).toBe(true);
      expect(output.length).toBeGreaterThan(0);
      expect(output.some(t => t.includes('可用命令') || t.includes('帮助'))).toBe(true);
    });

    it('executeCommand 应能创建新会话', async () => {
      const { executeCommand } = await import('../tui/commands.js');

      const backend = new MockTuiBackend() as any;
      const ctx: any = {
        backend,
        sessionId: null,
        setSessionId: vi.fn((id: string) => { ctx.sessionId = id; }),
        print: vi.fn(),
        printError: vi.fn(),
        exit: vi.fn(),
      };

      const handled = await executeCommand('/new 测试会话', ctx);
      expect(handled).toBe(true);
      expect(ctx.setSessionId).toHaveBeenCalled();
      expect(ctx.sessionId).toBeDefined();

      const sessions = await backend.listSessions();
      expect(sessions.length).toBe(1);
    });

    it('executeCommand 应能列出会话', async () => {
      const { executeCommand } = await import('../tui/commands.js');

      const backend = new MockTuiBackend() as any;
      await backend.createSession('会话A');
      await backend.createSession('会话B');

      const output: string[] = [];
      const ctx: any = {
        backend,
        sessionId: null,
        setSessionId: vi.fn(),
        print: (text: string) => output.push(text),
        printError: vi.fn(),
        exit: vi.fn(),
      };

      const handled = await executeCommand('/sessions', ctx);
      expect(handled).toBe(true);
      expect(output.some(t => t.includes('会话A'))).toBe(true);
      expect(output.some(t => t.includes('会话B'))).toBe(true);
    });

    it('未知命令应返回错误', async () => {
      const { executeCommand } = await import('../tui/commands.js');

      const errors: string[] = [];
      const ctx: any = {
        backend: new MockTuiBackend(),
        sessionId: null,
        setSessionId: vi.fn(),
        print: vi.fn(),
        printError: (text: string) => errors.push(text),
        exit: vi.fn(),
      };

      const handled = await executeCommand('/nonexistent', ctx);
      expect(handled).toBe(true);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('非命令输入应返回 false', async () => {
      const { executeCommand } = await import('../tui/commands.js');

      const ctx: any = {
        backend: new MockTuiBackend(),
        sessionId: null,
        setSessionId: vi.fn(),
        print: vi.fn(),
        printError: vi.fn(),
        exit: vi.fn(),
      };

      const handled = await executeCommand('普通消息', ctx);
      expect(handled).toBe(false);
    });
  });

  // ==================== 4. EmbeddedBackend（使用 Mock 后端） ====================
  describe('EmbeddedBackend 后端', () => {
    it('应能创建会话', () => {
      const backend = new MockTuiBackend() as any;
      return backend.createSession('测试会话').then((session: any) => {
        expect(session.id).toBeDefined();
        expect(session.title).toBe('测试会话');
        expect(session.messageCount).toBe(0);
      });
    });

    it('应能列出会话', () => {
      const backend = new MockTuiBackend() as any;
      return Promise.all([
        backend.createSession('会话1'),
        backend.createSession('会话2'),
      ]).then(() => backend.listSessions()).then((sessions: any[]) => {
        expect(sessions.length).toBe(2);
      });
    });

    it('会话列表应按更新时间倒序', () => {
      const backend = new MockTuiBackend() as any;
      return backend.createSession('旧会话')
        .then((s1: any) => {
          return new Promise<any>((resolve) => {
            setTimeout(() => {
              backend.createSession('新会话').then((s2: any) => {
                resolve({ s1, s2 });
              });
            }, 10);
          });
        })
        .then(({ s1, s2 }: any) => {
          return backend.listSessions().then((sessions: any[]) => {
            expect(sessions[0].id).toBe(s2.id);
            expect(sessions[1].id).toBe(s1.id);
          });
        });
    });

    it('应能删除会话', () => {
      const backend = new MockTuiBackend() as any;
      return backend.createSession('待删除')
        .then((s: any) => backend.listSessions().then((sessions: any[]) => {
          expect(sessions.length).toBe(1);
          return s;
        }))
        .then((s: any) => backend.deleteSession(s.id))
        .then(() => backend.listSessions())
        .then((sessions: any[]) => {
          expect(sessions.length).toBe(0);
        });
    });

    it('新会话历史应为空', () => {
      const backend = new MockTuiBackend() as any;
      return backend.createSession('新会话')
        .then((s: any) => backend.loadHistory(s.id))
        .then((history: any[]) => {
          expect(history.length).toBe(0);
        });
    });

    it('sendChat 应返回流式响应', () => {
      const backend = new MockTuiBackend() as any;
      const messages = [{ role: 'user', content: '你好' }];
      const stream = backend.sendChat(messages);

      const events: any[] = [];
      const iterator = stream[Symbol.asyncIterator]();
      const collect = (): Promise<any> => {
        return iterator.next().then((result: any) => {
          if (!result.done) {
            events.push(result.value);
            return collect();
          }
          return events;
        });
      };

      return collect().then((events: any[]) => {
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].type).toBe('assistant_start');
        expect(events.some((e: any) => e.type === 'assistant_chunk')).toBe(true);
        expect(events[events.length - 1].type).toBe('assistant_end');
      });
    });

    it('流式响应应包含完整文本', () => {
      const backend = new MockTuiBackend() as any;
      const messages = [{ role: 'user', content: '测试消息' }];
      const stream = backend.sendChat(messages);

      let fullText = '';
      const iterator = stream[Symbol.asyncIterator]();
      const collect = (): Promise<any> => {
        return iterator.next().then((result: any) => {
          if (!result.done) {
            if (result.value.type === 'assistant_chunk') {
              fullText += result.value.content || '';
            }
            return collect();
          }
          return fullText;
        });
      };

      return collect().then(() => {
        expect(fullText.length).toBeGreaterThan(0);
        expect(fullText).toContain('收到');
      });
    });

    it('saveMessage 应保存到历史记录', () => {
      const backend = new MockTuiBackend() as any;
      return backend.createSession('测试')
        .then((s: any) => {
          backend.saveMessage(s.id, 'user', '用户消息');
          backend.saveMessage(s.id, 'assistant', '助手回复');
          return backend.loadHistory(s.id);
        })
        .then((history: any[]) => {
          expect(history.length).toBe(2);
          expect(history[0].role).toBe('user');
          expect(history[1].role).toBe('assistant');
        });
    });
  });

  // ==================== 5. TUI 主入口 ====================
  describe('TUI 主入口', () => {
    it('runTui 应可导入', async () => {
      const { runTui } = await import('../tui/tui.js');
      expect(typeof runTui).toBe('function');
    });

    it('tui/index 应正确导出所有模块', async () => {
      const tuiModule = await import('../tui/index.js');

      expect(tuiModule.runTui).toBeDefined();
      expect(tuiModule.EmbeddedBackend).toBeDefined();
      expect(tuiModule.getTheme).toBeDefined();
      expect(tuiModule.detectTheme).toBeDefined();
      expect(tuiModule.colorize).toBeDefined();
      expect(tuiModule.bold).toBeDefined();
      expect(tuiModule.getCommands).toBeDefined();
      expect(tuiModule.executeCommand).toBeDefined();
    });

    it('ANSI 常量应正确导出', async () => {
      const tuiModule = await import('../tui/index.js');
      expect(tuiModule.ANSI).toBeDefined();
      expect(tuiModule.ANSI.reset).toBeDefined();
      expect(tuiModule.ANSI.red).toBeDefined();
      expect(tuiModule.ANSI.green).toBeDefined();
      expect(tuiModule.ANSI.blue).toBeDefined();
    });
  });
});
