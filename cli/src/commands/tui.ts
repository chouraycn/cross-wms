import { Command } from 'commander';
import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { color, isColorEnabled } from './colors.js';

/** CLI / TUI 版本号（与 package.json 保持一致） */
export const TUI_VERSION = '1.0.0';

/** 模拟模型列表 */
const MOCK_MODELS = [
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'qwen-max', name: '通义千问 Max' },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
];

/** 预定义 Agent 列表（5 个 agent） */
const AGENTS = [
  { id: 'coder', name: 'Coder', role: '代码生成与编辑' },
  { id: 'researcher', name: 'Researcher', role: '信息检索与调研' },
  { id: 'reviewer', name: 'Reviewer', role: '代码评审与质量检查' },
  { id: 'planner', name: 'Planner', role: '任务规划与拆解' },
  { id: 'ops', name: 'Ops', role: '运维与部署' },
];

/** 主菜单选项（编号 + emoji + 文案） */
const MAIN_MENU_ITEMS: Array<{ key: string; emoji: string; label: string }> = [
  { key: '1', emoji: '🧠', label: '模型选择' },
  { key: '2', emoji: '🧩', label: '技能选择' },
  { key: '3', emoji: '🤖', label: 'Agent 切换' },
  { key: '4', emoji: '📊', label: '状态面板' },
  { key: '5', emoji: '🚪', label: '退出' },
];

/** 历史命令最大条数 */
const HISTORY_MAX = 50;

/**
 * CommandHistory - 维护最近 N 条命令历史的简单结构。
 *  - 最多保留 50 条（默认），超出时从最旧开始丢弃。
 *  - 提供 previous()/next() 用于上下方向键模拟浏览。
 *  - 独立类，便于单元测试。
 */
export class CommandHistory {
  private entries: string[] = [];
  private cursor: number = -1;
  private maxSize: number;

  constructor(maxSize: number = HISTORY_MAX) {
    this.maxSize = Math.max(1, maxSize);
  }

  /** 添加一条历史；忽略空字符串；自动维护上限 */
  add(entry: string): void {
    if (typeof entry !== 'string') return;
    const trimmed = entry;
    if (trimmed.length === 0) return;
    // 与最近一条相同则不重复添加
    if (this.entries.length > 0 && this.entries[this.entries.length - 1] === trimmed) {
      this.resetCursor();
      return;
    }
    this.entries.push(trimmed);
    if (this.entries.length > this.maxSize) {
      this.entries.splice(0, this.entries.length - this.maxSize);
    }
    this.resetCursor();
  }

  /** 读取指定下标的历史项（0-based） */
  get(index: number): string | undefined {
    if (index < 0 || index >= this.entries.length) return undefined;
    return this.entries[index];
  }

  /** 当前历史快照（只读副本） */
  list(): string[] {
    return this.entries.slice();
  }

  /** 当前条数 */
  size(): number {
    return this.entries.length;
  }

  /** 配置上限（仅在空历史或调用方显式需要时使用） */
  getMaxSize(): number {
    return this.maxSize;
  }

  /** 浏览指针：上一条；无历史或已在最旧端时返回 null */
  previous(): string | null {
    if (this.entries.length === 0) return null;
    if (this.cursor < 0) {
      this.cursor = this.entries.length - 1;
    } else if (this.cursor > 0) {
      this.cursor -= 1;
    } else {
      // 已经在最旧端，保持不动
      return this.entries[0];
    }
    return this.entries[this.cursor];
  }

  /** 浏览指针：下一条；已在最新端时返回 null */
  next(): string | null {
    if (this.entries.length === 0) return null;
    if (this.cursor < 0) return null;
    if (this.cursor < this.entries.length - 1) {
      this.cursor += 1;
      return this.entries[this.cursor];
    }
    // 超过最新端，重置
    this.cursor = -1;
    return null;
  }

  /** 重置浏览指针（在添加新条目时调用） */
  resetCursor(): void {
    this.cursor = -1;
  }

  /** 清空所有历史 */
  clear(): void {
    this.entries = [];
    this.cursor = -1;
  }
}

/** 创建 readline 接口 */
function createRl(): readline.Interface {
  return readline.createInterface({
    input: stdin,
    output: stdout,
  });
}

/**
 * 询问问题。
 * 如果 readline 实例支持 keypress 事件 + setRawMode，则启用上下方向键浏览历史；
 * 否则仅依赖普通文本输入 + "!n" 语法回退（n = 1-based 编号）。
 */
function ask(
  rl: readline.Interface,
  question: string,
  history?: CommandHistory,
): Promise<string> {
  return new Promise((resolve) => {
    // 尝试挂载方向键导航（keypress 支持依赖 readline.emitKeypressEvents）
    const supportsKeypress =
      typeof (readline as any).emitKeypressEvents === 'function' &&
      typeof (stdin as any).setRawMode === 'function' &&
      history !== undefined;

    if (!supportsKeypress) {
      rl.question(question, (answer) => resolve(answer));
      return;
    }

    let current = '';
    const onKeypress = (_str: string, key: { name?: string; sequence?: string }) => {
      if (!key || !key.name) return;
      if (key.name === 'up') {
        const prev = history!.previous();
        if (prev !== null) {
          // 清除当前行并写入历史项（使用 \r 回车 + 重新写提示符前缀）
          (rl as any).write?.call(rl, null, { ctrl: true, name: 'u' });
          // 简化：直接 write 历史文本
          if (typeof (rl as any).write === 'function') {
            try {
              // 清空当前输入
              (rl as any).write.call(rl, prev, { name: prev });
            } catch {
              // 忽略
            }
          }
          current = prev;
        }
      } else if (key.name === 'down') {
        const next = history!.next();
        if (next !== null) {
          current = next;
        } else {
          current = '';
        }
      }
    };

    try {
      (readline as any).emitKeypressEvents(stdin);
      if ((stdin as any).isTTY) {
        (stdin as any).setRawMode?.(true);
      }
      stdin.on('keypress', onKeypress);
    } catch {
      // 不支持则直接降级
      rl.question(question, (answer) => resolve(answer));
      return;
    }

    rl.question(question, (answer) => {
      try {
        stdin.removeListener('keypress', onKeypress);
        if ((stdin as any).isTTY) {
          (stdin as any).setRawMode?.(false);
        }
      } catch {
        // 忽略
      }
      resolve(answer);
    });
  });
}

/** 技能目录列表 */
function getSkillDirs(): string[] {
  return [
    path.join(process.cwd(), 'skills'),
    path.join(process.cwd(), 'src', 'skills'),
  ];
}

/** 扫描技能目录，返回去重后的 skill 名称列表 */
export async function scanSkillNames(): Promise<string[]> {
  const set = new Set<string>();
  for (const dir of getSkillDirs()) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        if (entry.name.startsWith('_')) continue;
        const skillMd = path.join(dir, entry.name, 'SKILL.md');
        try {
          await fs.access(skillMd);
          set.add(entry.name);
        } catch {
          // 没有 SKILL.md，跳过
        }
      }
    } catch {
      // 目录不存在，跳过
    }
  }
  return Array.from(set).sort();
}

/** 递归计算目录占用字节数 */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(p);
      } else if (entry.isFile()) {
        const stat = await fs.stat(p);
        total += stat.size;
      }
    }
  } catch {
    // 忽略
  }
  return total;
}

/** 字节数格式化 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

/** 将毫秒数格式化为可读时长 */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** 统计日志目录中的行数（按文件行数求和） */
async function countLogLines(dirs: string[]): Promise<{ total: number; perDir: Array<{ dir: string; lines: number }> }> {
  let total = 0;
  const perDir: Array<{ dir: string; lines: number }> = [];
  for (const dir of dirs) {
    let lines = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const p = path.join(dir, entry.name);
        try {
          const stat = await fs.stat(p);
          if (stat.size === 0) continue;
          // 简单估算：以换行符数 + 1 作为行数
          const fd = await fs.open(p, 'r');
          try {
            const buf = Buffer.alloc(Math.min(stat.size, 1024 * 1024));
            const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
            for (let i = 0; i < bytesRead; i++) {
              if (buf[i] === 0x0a) lines += 1;
            }
            // 如果文件超过读取窗口，仍按 size 估算追加
            if (stat.size > bytesRead) {
              const avg = bytesRead > 0 ? lines / bytesRead : 0;
              lines += Math.floor(avg * (stat.size - bytesRead));
            }
            if (stat.size > 0 && lines === 0) lines = 1;
          } finally {
            await fd.close();
          }
        } catch {
          // 单个文件读取失败不影响整体
        }
      }
    } catch {
      // 目录不存在
    }
    total += lines;
    perDir.push({ dir, lines });
  }
  return { total, perDir };
}

/** 清除屏幕并将光标移动到左上角 */
function clearScreen(): void {
  if (isColorEnabled() && stdout && (stdout as any).isTTY) {
    stdout.write('\x1b[2J\x1b[H');
  } else {
    // 非 TTY 环境下输出若干空行作为近似
    for (let i = 0; i < 2; i++) console.log('');
  }
}

/** 简易文本右填充（支持 ANSI 字符串长度） */
function padRight(text: string, width: number): string {
  // 去除 ANSI 转义序列计算可见长度
  const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, width - visible.length);
  return text + ' '.repeat(pad);
}

/**
 * TuiSession - 封装 TUI 交互会话
 * 独立模块，便于测试时注入 mock readline
 */
export class TuiSession {
  private rl: readline.Interface;
  private running: boolean = true;
  private history: CommandHistory;
  private currentAgentId: string = AGENTS[0].id;
  private startTime: number = Date.now();

  constructor(rl?: readline.Interface, history?: CommandHistory) {
    // 允许测试时注入自定义 readline 接口 / 历史实例
    this.rl = rl ?? createRl();
    this.history = history ?? new CommandHistory();
  }

  /** 关闭 readline，结束主菜单循环 */
  async exit(): Promise<void> {
    this.running = false;
    this.rl.close();
  }

  /** 获取历史实例（用于测试与外部维护） */
  getHistory(): CommandHistory {
    return this.history;
  }

  /** 当前选中的 agent id */
  getCurrentAgentId(): string {
    return this.currentAgentId;
  }

  /** 设置当前 agent id（暴露给 switchAgent 与测试） */
  setCurrentAgentId(id: string): void {
    this.currentAgentId = id;
  }

  /** 启动时间（毫秒时间戳） */
  getStartTime(): number {
    return this.startTime;
  }

  /** 清除屏幕（暴露便于测试） */
  clearScreen(): void {
    clearScreen();
  }

  /** 显示主菜单并响应选择 */
  async runMainMenu(): Promise<void> {
    while (this.running) {
      this.renderMainMenu();
      const answer = await ask(this.rl, color.muted('请选择 (1-5): '), this.history);
      this.history.add(answer);
      const choice = answer.trim();
      switch (choice) {
        case '1':
          await this.selectModel();
          break;
        case '2':
          await this.selectSkill();
          break;
        case '3':
          await this.switchAgent();
          break;
        case '4':
          await this.showStatus();
          break;
        case '5':
        case 'q':
        case 'Q':
          await this.exit();
          return;
        default:
          console.log(color.error('无效的选择'));
      }
    }
  }

  /** 渲染主菜单（清屏 + 版本 + 状态 + 选项） */
  renderMainMenu(): void {
    clearScreen();
    console.log(color.title('╔══════════════════════════════════════╗'));
    console.log(color.title('║   Cross-WMS TUI 主菜单                ║'));
    console.log(color.title('╚══════════════════════════════════════╝'));
    console.log(color.muted(`版本: ${TUI_VERSION}`));
    console.log(color.muted(`节点: ${process.version} / 平台: ${process.platform} (${process.arch})`));
    const currentAgent = AGENTS.find((a) => a.id === this.currentAgentId);
    console.log(
      color.muted(
        `当前 Agent: ${currentAgent ? `${currentAgent.name} (${currentAgent.role})` : this.currentAgentId}`,
      ),
    );
    console.log('');
    for (const item of MAIN_MENU_ITEMS) {
      // 默认白色菜单项；高亮当前主菜单标题项（用 success 色装饰以提升可读性）
      const isExit = item.key === '5';
      const text = `  ${item.emoji}  ${item.key}) ${item.label}`;
      console.log(isExit ? color.warn(text) : color.item(text));
    }
    console.log('');
  }

  /** 模型选择 */
  async selectModel(): Promise<string | null> {
    console.log('');
    console.log(color.title('可用模型:'));
    MOCK_MODELS.forEach((m, i) => {
      const idx = `${i + 1}.`.padEnd(4);
      console.log(`  ${idx}${color.item(m.name)} ${color.muted(`(${m.id})`)}`);
    });
    console.log('');
    const answer = await ask(this.rl, color.muted('请选择一个模型 (输入序号): '), this.history);
    this.history.add(answer);
    const index = Number.parseInt(answer.trim(), 10) - 1;
    if (index >= 0 && index < MOCK_MODELS.length) {
      const selected = MOCK_MODELS[index];
      console.log(color.success(`已选择模型: ${selected.name} (${selected.id})`));
      return selected.id;
    }
    console.log(color.error('无效的选择'));
    return null;
  }

  /** 技能选择：扫描 skills/ 目录，列出 skill name */
  async selectSkill(): Promise<string | null> {
    console.log('');
    const skills = await scanSkillNames();
    if (skills.length === 0) {
      console.log(color.warn('未发现任何技能'));
      return null;
    }
    console.log(color.title('可用技能:'));
    skills.forEach((s, i) => {
      const idx = `${i + 1}.`.padEnd(4);
      console.log(`  ${idx}${color.item(s)}`);
    });
    console.log('');
    const answer = await ask(this.rl, color.muted('请选择一个技能 (输入序号): '), this.history);
    this.history.add(answer);
    const index = Number.parseInt(answer.trim(), 10) - 1;
    if (index >= 0 && index < skills.length) {
      const selected = skills[index];
      console.log(color.success(`已选择技能: ${selected}`));
      return selected;
    }
    console.log(color.error('无效的选择'));
    return null;
  }

  /** Agent 切换：列出 5 个预定义 agent，让用户选择并显示其 role */
  async switchAgent(): Promise<string | null> {
    console.log('');
    console.log(color.title('可用 Agent:'));
    AGENTS.forEach((a, i) => {
      const idx = `${i + 1}.`.padEnd(4);
      const marker = a.id === this.currentAgentId ? color.success('★') : ' ';
      console.log(`  ${marker} ${idx}${color.item(a.name)} ${color.muted(`- ${a.role}`)}`);
    });
    console.log('');
    const answer = await ask(this.rl, color.muted('请选择一个 Agent (输入序号): '), this.history);
    this.history.add(answer);
    const index = Number.parseInt(answer.trim(), 10) - 1;
    if (index >= 0 && index < AGENTS.length) {
      const selected = AGENTS[index];
      this.currentAgentId = selected.id;
      console.log(color.success(`已切换到 Agent: ${selected.name} (${selected.role})`));
      return selected.id;
    }
    console.log(color.error('无效的选择'));
    return null;
  }

  /** 状态面板：磁盘/Node/当前目录/log 目录大小等 */
  async showStatus(): Promise<void> {
    console.log('');
    console.log(color.title('=== 系统状态 ==='));
    console.log('');

    const mem = process.memoryUsage();
    // 阈值：RSS > 512MB 视为警告
    const memWarn = mem.rss > 512 * 1024 * 1024;
    const uptime = formatDuration(Date.now() - this.startTime);

    const rows: Array<{ label: string; value: string; warn?: boolean }> = [
      { label: 'Version', value: TUI_VERSION },
      { label: 'Node.js', value: process.version },
      { label: 'Platform', value: `${process.platform} (${process.arch})` },
      { label: 'CWD', value: process.cwd() },
      { label: 'Home', value: os.homedir() },
      { label: 'Tmp', value: os.tmpdir() },
      { label: 'PID', value: String(process.pid) },
      { label: 'Uptime', value: uptime },
      {
        label: 'Memory',
        value: `${formatBytes(mem.heapUsed)} heap / ${formatBytes(mem.rss)} rss`,
        warn: memWarn,
      },
    ];

    const labelWidth = Math.max(...rows.map((r) => r.label.length));
    for (const row of rows) {
      const label = padRight(row.label + ':', labelWidth + 2);
      const colored = row.warn ? color.warn(row.value) : color.success(row.value);
      console.log(`  ${color.muted(label)} ${colored}`);
    }

    console.log('');
    console.log(color.title('日志目录:'));
    const logDirs = [
      path.join(process.cwd(), 'logs'),
      path.join(process.cwd(), 'cli', 'logs'),
      path.join(process.cwd(), 'server', 'logs'),
    ];
    let printedLog = false;
    for (const dir of logDirs) {
      try {
        await fs.access(dir);
        const size = await dirSize(dir);
        // > 100MB 视为警告
        const warn = size > 100 * 1024 * 1024;
        const value = `${dir} (${formatBytes(size)})`;
        const colored = warn ? color.warn(value) : color.success(value);
        console.log(`  ${color.muted('Dir'.padEnd(labelWidth + 2))} ${colored}`);
        printedLog = true;
      } catch {
        // 不存在则跳过
      }
    }
    if (!printedLog) {
      console.log(`  ${color.muted('(未发现任何日志目录)')}`);
    }

    console.log('');
    const logLineResult = await countLogLines(logDirs);
    const logLineWarn = logLineResult.total > 10000;
    const logLineValue = `${logLineResult.total} 行${logLineResult.total > 0 ? '' : ' (无)'}`;
    const logLineColored = logLineWarn ? color.warn(logLineValue) : color.success(logLineValue);
    console.log(`  ${color.muted('Log Lines Count'.padEnd(labelWidth + 2))} ${logLineColored}`);

    const skills = await scanSkillNames();
    const skillsValue = `${skills.length} 个${skills.length === 0 ? ' (无)' : ''}`;
    const skillsColored = skills.length === 0 ? color.warn(skillsValue) : color.success(skillsValue);
    console.log(`  ${color.muted('Skills'.padEnd(labelWidth + 2))} ${skillsColored}`);

    const modelsValue = `${MOCK_MODELS.length} 个`;
    console.log(`  ${color.muted('Models'.padEnd(labelWidth + 2))} ${color.success(modelsValue)}`);

    const agentsValue = `${AGENTS.length} 个 (当前: ${this.currentAgentId})`;
    console.log(`  ${color.muted('Agents'.padEnd(labelWidth + 2))} ${color.success(agentsValue)}`);
  }
}

/** 工厂：创建一个新的 TUI 会话（默认使用 stdin/stdout） */
export function createTuiSession(rl?: readline.Interface): TuiSession {
  return new TuiSession(rl);
}

/** Commander tui 子命令 */
export const tuiCommand = new Command('tui')
  .description('启动交互式 TUI')
  .version(TUI_VERSION);

/** 默认动作：无参数时进入主菜单 */
tuiCommand.action(async () => {
  const session = createTuiSession();
  try {
    await session.runMainMenu();
  } finally {
    await session.exit();
  }
});

/** model 子命令：直接进入模型选择 */
tuiCommand
  .command('model')
  .description('直接进入模型选择')
  .action(async () => {
    const session = createTuiSession();
    try {
      await session.selectModel();
    } finally {
      await session.exit();
    }
  });

/** skills 子命令：直接进入技能选择 */
tuiCommand
  .command('skills')
  .description('直接进入技能选择')
  .action(async () => {
    const session = createTuiSession();
    try {
      await session.selectSkill();
    } finally {
      await session.exit();
    }
  });

/** agents 子命令：直接进入 Agent 切换 */
tuiCommand
  .command('agents')
  .description('直接进入 Agent 切换')
  .action(async () => {
    const session = createTuiSession();
    try {
      await session.switchAgent();
    } finally {
      await session.exit();
    }
  });

/** status 子命令：直接显示状态面板 */
tuiCommand
  .command('status')
  .description('直接显示状态面板')
  .action(async () => {
    const session = createTuiSession();
    try {
      await session.showStatus();
    } finally {
      await session.exit();
    }
  });

/** version 子命令：显示 TUI 版本信息 */
tuiCommand
  .command('version')
  .description('显示 TUI 版本号')
  .action(async () => {
    const lines = [
      color.title(`crosswms tui v${TUI_VERSION}`),
      '',
      color.muted(`Node.js:    ${process.version}`),
      color.muted(`Platform:   ${process.platform} (${process.arch})`),
      color.muted(`CLI Path:   ${path.resolve(__filename)}`),
    ];
    for (const l of lines) console.log(l);
    // 保持与其它子命令一致：创建 session 并退出
    const session = createTuiSession();
    await session.exit();
  });
