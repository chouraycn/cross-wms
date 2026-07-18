import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as readline from 'node:readline';
import { TuiSession, tuiCommand, CommandHistory, TUI_VERSION } from '../tui.js';
import {
  raw as colorRaw,
  color,
  setColorEnabled,
  isColorEnabled,
} from '../colors.js';

// 用于命令级测试的全局 mock readline
const mockAnswers: string[] = [];
const mockQuestion = vi.fn((_query: string, callback: (answer: string) => void) => {
  // 队列为空时默认返回 '1'，保证原有行为兼容
  callback(mockAnswers.shift() ?? '1');
});
const mockClose = vi.fn();

// 使用 importActual 保留所有原始导出，仅覆盖 createInterface 以注入 mock。
// 这避免了 TUI 中检查 readline.emitKeypressEvents 时触发 vitest 的严格 mock 校验。
vi.mock('node:readline', async () => {
  const actual = await vi.importActual<typeof import('node:readline')>('node:readline');
  return {
    ...actual,
    createInterface: vi.fn(() => ({
      question: mockQuestion,
      close: mockClose,
    } as unknown as readline.Interface)),
  };
});

/** 创建一个独立的 mock readline 接口（用于 TuiSession 单元测试） */
function makeMockRl() {
  const answers: string[] = [];
  const rl = {
    question: vi.fn((_q: string, cb: (a: string) => void) => {
      cb(answers.shift() ?? '');
    }),
    close: vi.fn(),
  };
  return { rl: rl as unknown as readline.Interface, answers };
}

describe('CLI tui command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockAnswers.length = 0;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('has correct command name and description', () => {
    expect(tuiCommand.name()).toBe('tui');
    expect(tuiCommand.description()).toContain('TUI');
  });

  it('shows help output including all subcommands', () => {
    const help = tuiCommand.helpInformation();
    expect(help.length).toBeGreaterThan(0);
    expect(help).toContain('model');
    expect(help).toContain('skills');
    expect(help).toContain('agents');
    expect(help).toContain('status');
    expect(help).toContain('version');
  });

  it('main action runs the main menu and exits via choice 5', async () => {
    // 1) 进入模型选择, 2) 选择第一个模型, 3) 退出
    mockAnswers.push('1', '1', '5');
    await tuiCommand.parseAsync(['node', 'test']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('Cross-WMS TUI 主菜单'))).toBe(true);
    expect(calls.some((line) => line.includes('可用模型'))).toBe(true);
    expect(calls.some((line) => line.includes('已选择模型'))).toBe(true);
    expect(mockQuestion).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('model subcommand directly enters model selection', async () => {
    mockAnswers.push('2');
    await tuiCommand.parseAsync(['node', 'test', 'model']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('可用模型'))).toBe(true);
    expect(calls.some((line) => line.includes('已选择模型'))).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });

  it('skills subcommand enters skill selection', async () => {
    mockAnswers.push('1');
    await tuiCommand.parseAsync(['node', 'test', 'skills']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    // 取决于仓库内是否存在技能，至少应打印一种分支
    const ok =
      calls.some((line) => line.includes('可用技能')) ||
      calls.some((line) => line.includes('未发现任何技能'));
    expect(ok).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });

  it('agents subcommand enters agent switcher', async () => {
    mockAnswers.push('1');
    await tuiCommand.parseAsync(['node', 'test', 'agents']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('可用 Agent'))).toBe(true);
    expect(calls.some((line) => line.includes('已切换到 Agent'))).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });

  it('status subcommand shows system status', async () => {
    await tuiCommand.parseAsync(['node', 'test', 'status']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('系统状态'))).toBe(true);
    expect(calls.some((line) => line.includes('Node.js'))).toBe(true);
    expect(calls.some((line) => line.includes('Uptime'))).toBe(true);
    expect(calls.some((line) => line.includes('Log Lines Count'))).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });

  it('version subcommand prints tui version', async () => {
    await tuiCommand.parseAsync(['node', 'test', 'version']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes(`crosswms tui v${TUI_VERSION}`))).toBe(true);
    expect(calls.some((line) => line.includes('Node.js'))).toBe(true);
    expect(calls.some((line) => line.includes('Platform'))).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });
});

describe('TuiSession (独立单元测试)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('exit() 关闭底层 readline', async () => {
    const { rl } = makeMockRl();
    const session = new TuiSession(rl);
    await session.exit();
    expect(rl.close).toHaveBeenCalledTimes(1);
  });

  it('selectModel 返回所选模型的 id', async () => {
    const { rl, answers } = makeMockRl();
    answers.push('3');
    const session = new TuiSession(rl);
    const id = await session.selectModel();
    expect(id).toBe('kimi-k2.7-code');
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('已选择模型'))).toBe(true);
  });

  it('selectModel 在无效选择时返回 null', async () => {
    const { rl, answers } = makeMockRl();
    answers.push('99');
    const session = new TuiSession(rl);
    const id = await session.selectModel();
    expect(id).toBeNull();
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('无效的选择'))).toBe(true);
  });

  it('selectSkill 扫描 skills 目录并打印列表或提示为空', async () => {
    const { rl, answers } = makeMockRl();
    answers.push('1');
    const session = new TuiSession(rl);
    const name = await session.selectSkill();
    if (name !== null) {
      expect(typeof name).toBe('string');
    }
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    const ok =
      calls.some((line) => line.includes('可用技能')) ||
      calls.some((line) => line.includes('未发现任何技能'));
    expect(ok).toBe(true);
  });

  it('switchAgent 返回所选 agent 的 id', async () => {
    const { rl, answers } = makeMockRl();
    answers.push('2');
    const session = new TuiSession(rl);
    const id = await session.switchAgent();
    expect(id).toBe('researcher');
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('已切换到 Agent'))).toBe(true);
  });

  it('switchAgent 在无效选择时返回 null', async () => {
    const { rl, answers } = makeMockRl();
    answers.push('0');
    const session = new TuiSession(rl);
    const id = await session.switchAgent();
    expect(id).toBeNull();
  });

  it('showStatus 打印系统信息', async () => {
    const { rl } = makeMockRl();
    const session = new TuiSession(rl);
    await session.showStatus();
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('系统状态'))).toBe(true);
    expect(calls.some((line) => line.includes('Node.js'))).toBe(true);
    expect(calls.some((line) => line.includes('当前目录') || line.includes('CWD'))).toBe(true);
    expect(calls.some((line) => line.includes('Uptime'))).toBe(true);
    expect(calls.some((line) => line.includes('Log Lines Count'))).toBe(true);
    expect(calls.some((line) => line.includes('模型数') || line.includes('Models'))).toBe(true);
    expect(calls.some((line) => line.includes('Agent') || line.includes('Agents'))).toBe(true);
  });

  it('runMainMenu 支持跨子功能导航并通过 5 退出', async () => {
    const { rl, answers } = makeMockRl();
    // 1) 进入模型选择, 2) 选第一个模型, 3) 退出
    answers.push('1', '1', '5');
    const session = new TuiSession(rl);
    await session.runMainMenu();
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('主菜单'))).toBe(true);
    expect(calls.some((line) => line.includes('可用模型'))).toBe(true);
    expect(calls.some((line) => line.includes('已选择模型'))).toBe(true);
    expect(rl.close).toHaveBeenCalled();
  });

  it('runMainMenu 通过无效选择提示并继续循环', async () => {
    const { rl, answers } = makeMockRl();
    // 1) 无效选择, 2) 退出
    answers.push('x', '5');
    const session = new TuiSession(rl);
    await session.runMainMenu();
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('无效的选择'))).toBe(true);
    expect(rl.close).toHaveBeenCalled();
  });

  it('mainMenu 渲染包含版本号与当前 agent', () => {
    const { rl } = makeMockRl();
    const session = new TuiSession(rl);
    session.setCurrentAgentId('reviewer');
    session.renderMainMenu();
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('Cross-WMS TUI'))).toBe(true);
    expect(calls.some((line) => line.includes(TUI_VERSION))).toBe(true);
    expect(calls.some((line) => line.includes(process.version))).toBe(true);
    expect(calls.some((line) => line.includes('当前 Agent'))).toBe(true);
    expect(calls.some((line) => line.includes('Reviewer'))).toBe(true);
  });
});

describe('CommandHistory', () => {
  it('add/get/list 行为正确', () => {
    const h = new CommandHistory(5);
    h.add('cmd1');
    h.add('cmd2');
    h.add('cmd3');
    expect(h.size()).toBe(3);
    expect(h.get(0)).toBe('cmd1');
    expect(h.get(2)).toBe('cmd3');
    expect(h.list()).toEqual(['cmd1', 'cmd2', 'cmd3']);
  });

  it('默认上限 50 条；超出后丢弃最旧', () => {
    const h = new CommandHistory();
    expect(h.getMaxSize()).toBe(50);
    for (let i = 0; i < 60; i++) h.add(`cmd${i}`);
    expect(h.size()).toBe(50);
    expect(h.get(0)).toBe('cmd10');
    expect(h.get(49)).toBe('cmd59');
  });

  it('忽略空字符串与重复项', () => {
    const h = new CommandHistory();
    h.add('');
    h.add('foo');
    h.add('foo'); // 重复
    expect(h.size()).toBe(1);
    expect(h.list()).toEqual(['foo']);
  });

  it('previous() 从最新向最旧遍历', () => {
    const h = new CommandHistory();
    h.add('a');
    h.add('b');
    h.add('c');
    expect(h.previous()).toBe('c');
    expect(h.previous()).toBe('b');
    expect(h.previous()).toBe('a');
    // 已经在最旧端，保持
    expect(h.previous()).toBe('a');
  });

  it('next() 从最旧回到最新之后返回 null', () => {
    const h = new CommandHistory();
    h.add('a');
    h.add('b');
    h.previous(); // cursor: -1 -> 1, returns 'b'
    h.previous(); // cursor: 1 -> 0, returns 'a'
    expect(h.next()).toBe('b'); // cursor: 0 -> 1, returns 'b'
    // 已经到达最新端，再次 next 应返回 null 并重置指针
    expect(h.next()).toBeNull();
  });

  it('空历史 previous()/next() 返回 null', () => {
    const h = new CommandHistory();
    expect(h.previous()).toBeNull();
    expect(h.next()).toBeNull();
  });

  it('add 后重置浏览指针', () => {
    const h = new CommandHistory();
    h.add('a');
    h.add('b');
    h.previous(); // 指向 b
    h.add('c');
    // 添加新条目后应重置；再次 previous 应指向最新条目 c
    expect(h.previous()).toBe('c');
  });

  it('clear() 清空所有历史', () => {
    const h = new CommandHistory();
    h.add('a');
    h.add('b');
    h.clear();
    expect(h.size()).toBe(0);
    expect(h.previous()).toBeNull();
  });
});

describe('colors 工具模块', () => {
  const savedEnabled = isColorEnabled();

  afterEach(() => {
    setColorEnabled(savedEnabled);
  });

  it('导出所有 ANSI 常量', () => {
    expect(colorRaw.RESET).toBe('\x1b[0m');
    expect(colorRaw.BOLD_CYAN).toBe('\x1b[1;36m');
    expect(colorRaw.WHITE).toBe('\x1b[37m');
    expect(colorRaw.HIGHLIGHT_YELLOW).toBe('\x1b[33;7m');
    expect(colorRaw.SUCCESS_GREEN).toBe('\x1b[32m');
    expect(colorRaw.WARN_YELLOW).toBe('\x1b[33m');
    expect(colorRaw.ERROR_RED).toBe('\x1b[31m');
    expect(colorRaw.MUTED_GRAY).toBe('\x1b[90m');
  });

  it('colorize 启用时包裹 ANSI 前后缀', () => {
    setColorEnabled(true);
    const out = color.title('Hello');
    expect(out.startsWith(colorRaw.BOLD_CYAN)).toBe(true);
    expect(out.endsWith(colorRaw.RESET)).toBe(true);
    expect(out).toContain('Hello');
  });

  it('colorize 禁用时返回原文本', () => {
    setColorEnabled(false);
    expect(color.title('Hello')).toBe('Hello');
    expect(color.item('Item')).toBe('Item');
    expect(color.highlight('Hi')).toBe('Hi');
    expect(color.success('OK')).toBe('OK');
    expect(color.warn('WARN')).toBe('WARN');
    expect(color.error('ERR')).toBe('ERR');
    expect(color.muted('muted')).toBe('muted');
  });

  it('setColorEnabled 切换后即时生效', () => {
    setColorEnabled(false);
    expect(color.success('x')).toBe('x');
    setColorEnabled(true);
    const out = color.success('x');
    expect(out).toContain(colorRaw.SUCCESS_GREEN);
    expect(out).toContain(colorRaw.RESET);
  });

  it('isColorEnabled 与 setColorEnabled 同步', () => {
    setColorEnabled(true);
    expect(isColorEnabled()).toBe(true);
    setColorEnabled(false);
    expect(isColorEnabled()).toBe(false);
  });
});

describe('TUI 颜色输出 (启用 ANSI)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const savedEnabled = isColorEnabled();

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setColorEnabled(true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    setColorEnabled(savedEnabled);
    vi.clearAllMocks();
  });

  it('selectModel 输出包含青色标题与绿色成功行', async () => {
    const { rl, answers } = makeMockRl();
    answers.push('1');
    const session = new TuiSession(rl);
    const id = await session.selectModel();
    expect(id).toBe('deepseek-v4-pro');
    const all = consoleSpy.mock.calls.map((c) => c.map((a) => String(a)).join(' ')).join('\n');
    expect(all).toContain(colorRaw.BOLD_CYAN); // 标题
    expect(all).toContain(colorRaw.WHITE); // 菜单项白色
    expect(all).toContain(colorRaw.SUCCESS_GREEN); // 成功行
  });

  it('selectSkill 输出包含青色标题（包含或不含技能均应通过）', async () => {
    const { rl, answers } = makeMockRl();
    answers.push('1');
    const session = new TuiSession(rl);
    const name = await session.selectSkill();
    const all = consoleSpy.mock.calls.map((c) => c.map((a) => String(a)).join(' ')).join('\n');
    // 标题是青色，无论是否有技能都应出现
    expect(all).toContain(colorRaw.BOLD_CYAN);
    // 若有技能，应有绿色成功行
    if (name !== null) {
      expect(all).toContain(colorRaw.SUCCESS_GREEN);
    } else {
      // 无技能时应有黄色警告
      expect(all).toContain(colorRaw.WARN_YELLOW);
    }
  });

  it('showStatus 输出包含绿色与表格对齐行', async () => {
    const { rl } = makeMockRl();
    const session = new TuiSession(rl);
    await session.showStatus();
    const all = consoleSpy.mock.calls.map((c) => c.map((a) => String(a)).join(' ')).join('\n');
    expect(all).toContain(colorRaw.BOLD_CYAN);
    expect(all).toContain(colorRaw.SUCCESS_GREEN);
    // 含 Uptime 与 Log Lines Count 标签
    expect(all).toContain('Uptime');
    expect(all).toContain('Log Lines Count');
  });

  it('renderMainMenu 输出包含版本与当前 agent 信息', () => {
    const { rl } = makeMockRl();
    const session = new TuiSession(rl);
    session.renderMainMenu();
    const all = consoleSpy.mock.calls.map((c) => c.map((a) => String(a)).join(' ')).join('\n');
    expect(all).toContain(colorRaw.BOLD_CYAN);
    expect(all).toContain(colorRaw.WHITE);
    expect(all).toContain(TUI_VERSION);
    expect(all).toContain('当前 Agent');
  });
});
