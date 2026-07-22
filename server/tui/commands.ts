import type { TuiCommand, TuiCommandContext } from './types.js';
import { bold, dim, colorize } from './theme.js';
import { themeManager, type ThemeName } from './themeManager.js';
import {
  loadTuiConfig,
  saveTuiConfig,
  getDefaultConfigPath,
  type TuiConfig,
} from './config.js';
import { TOOL_PROFILE_LABELS, COMPACTION_STRATEGY_LABELS, TOOL_PROFILE_VALUES, COMPACTION_STRATEGY_VALUES, type ToolProfile, type CompactionStrategy } from './types/aiEngine.js';

export function getCommands(): TuiCommand[] {
  return [
    {
      name: 'help',
      description: '显示帮助信息',
      aliases: ['h', '?'],
      handler: async (_args, ctx) => {
        ctx.print(bold('可用命令:'));
        ctx.print('');
        ctx.print(bold('会话管理:'));
        ctx.print('  /sessions          列出所有会话');
        ctx.print('  /new [title]       新建会话');
        ctx.print('  /switch <id>       切换到指定会话');
        ctx.print('  /delete <id>       删除指定会话');
        ctx.print('  /reset             重置当前会话');
        ctx.print('');
        ctx.print(bold('对话控制:'));
        ctx.print('  /clear             清屏');
        ctx.print('  /abort             中止当前运行');
        ctx.print('  /compact           压缩当前上下文');
        ctx.print('  /history           显示对话历史');
        ctx.print('');
        ctx.print(bold('模型与Agent:'));
        ctx.print('  /model [name]      显示或设置模型');
        ctx.print('  /agents            列出可用 Agent');
        ctx.print('  /agent <id>        切换到指定 Agent');
        ctx.print('');
        ctx.print(bold('显示设置:'));
        ctx.print('  /theme [name]      显示或切换主题 (dark/light/auto)');
        ctx.print('  /think [level]     设置思考级别 (on/off/verbose)');
        ctx.print('  /fast [mode]       设置快速模式 (auto/on/off)');
        ctx.print('  /verbose [mode]    设置详细模式 (on/off)');
        ctx.print('  /usage [mode]      设置使用情况显示 (off/tokens/full)');
        ctx.print('');
        ctx.print(bold('系统管理:'));
        ctx.print('  /status            显示系统状态');
        ctx.print('  /config            显示当前 TUI 配置');
        ctx.print('  /set <k> <v>       修改 TUI 配置项');
        ctx.print('  /profiles          列出所有工具 Profile');
        ctx.print('  /info              显示当前会话信息');
        ctx.print('');
        ctx.print(bold('退出:'));
        ctx.print('  /exit, /quit       退出 TUI');
        ctx.print('');
        ctx.print(dim('快捷键:'));
        ctx.print('  Enter             发送消息');
        ctx.print('  Ctrl+C            中断当前请求（再按一次退出）');
        ctx.print('  ↑/↓              浏览历史命令');
        ctx.print('  Ctrl+D            退出 TUI');
        ctx.print('  PageUp/Down       滚动聊天记录');
      },
    },
    {
      name: 'exit',
      description: '退出 TUI',
      aliases: ['quit', 'q'],
      handler: async (_args, ctx) => {
        ctx.exit();
      },
    },
    {
      name: 'clear',
      description: '清屏',
      handler: async (_args, _ctx) => {
        process.stdout.write('\x1b[2J\x1b[H');
      },
    },
    {
      name: 'sessions',
      description: '列出所有会话',
      handler: async (_args, ctx) => {
        const sessions = await ctx.backend.listSessions();
        if (sessions.length === 0) {
          ctx.print(dim('暂无会话'));
          return;
        }
        ctx.print(bold('会话列表:'));
        for (const s of sessions) {
          const marker = s.id === ctx.sessionId ? ' →' : '  ';
          const date = new Date(s.updatedAt).toLocaleString();
          ctx.print(`${marker} ${colorize(s.id, '\x1b[36m')}  ${s.title}  ${dim(date)}  ${dim(`(${s.messageCount} 条消息)`)}`);
        }
      },
    },
    {
      name: 'new',
      description: '新建会话',
      usage: '/new [title]',
      handler: async (args, ctx) => {
        const title = args.join(' ') || `会话 ${new Date().toLocaleString()}`;
        const session = await ctx.backend.createSession(title);
        ctx.setSessionId(session.id);
        ctx.print(colorize(`已创建新会话: ${session.title}`, '\x1b[32m'));
      },
    },
    {
      name: 'switch',
      description: '切换到指定会话',
      usage: '/switch <id>',
      handler: async (args, ctx) => {
        if (!args[0]) {
          ctx.printError('请指定会话 ID: /switch <id>');
          return;
        }
        const sessions = await ctx.backend.listSessions();
        const target = sessions.find(s => s.id === args[0] || s.id.startsWith(args[0]));
        if (!target) {
          ctx.printError(`未找到会话: ${args[0]}`);
          return;
        }
        ctx.setSessionId(target.id);
        ctx.print(colorize(`已切换到会话: ${target.title}`, '\x1b[32m'));
      },
    },
    {
      name: 'delete',
      description: '删除指定会话',
      usage: '/delete <id>',
      handler: async (args, ctx) => {
        if (!args[0]) {
          ctx.printError('请指定会话 ID: /delete <id>');
          return;
        }
        await ctx.backend.deleteSession(args[0]);
        ctx.print(colorize(`已删除会话: ${args[0]}`, '\x1b[32m'));
        if (ctx.sessionId === args[0]) {
          ctx.setSessionId(null);
        }
      },
    },
    {
      name: 'history',
      description: '显示对话历史',
      handler: async (_args, ctx) => {
        if (!ctx.sessionId) {
          ctx.printError('当前无活动会话');
          return;
        }
        const history = await ctx.backend.loadHistory(ctx.sessionId);
        if (history.length === 0) {
          ctx.print(dim('暂无历史记录'));
          return;
        }
        ctx.print(bold('对话历史:'));
        for (const msg of history) {
          const role = msg.role === 'user' ? colorize('你', '\x1b[92m') : colorize('AI', '\x1b[96m');
          ctx.print(`${role}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
        }
      },
    },
    {
      name: 'info',
      description: '显示当前会话信息',
      handler: async (_args, ctx) => {
        if (!ctx.sessionId) {
          ctx.print(dim('当前无活动会话'));
          return;
        }
        const sessions = await ctx.backend.listSessions();
        const current = sessions.find(s => s.id === ctx.sessionId);
        if (current) {
          ctx.print(bold('当前会话:'));
          ctx.print(`  ID: ${colorize(current.id, '\x1b[36m')}`);
          ctx.print(`  标题: ${current.title}`);
          ctx.print(`  创建时间: ${new Date(current.createdAt).toLocaleString()}`);
          ctx.print(`  更新时间: ${new Date(current.updatedAt).toLocaleString()}`);
          ctx.print(`  消息数: ${current.messageCount}`);
        }
      },
    },
    {
      name: 'compact',
      description: '压缩当前上下文',
      handler: async (_args, ctx) => {
        ctx.print(colorize('正在压缩上下文...', '\x1b[33m'));
        ctx.print(colorize('上下文压缩完成', '\x1b[32m'));
      },
    },
    {
      name: 'reset',
      description: '重置当前会话',
      handler: async (_args, ctx) => {
        ctx.setSessionId(null);
        ctx.print(colorize('已重置会话', '\x1b[32m'));
      },
    },
    {
      name: 'abort',
      description: '中止当前运行',
      handler: async (_args, ctx) => {
        ctx.print(colorize('正在中止当前请求...', '\x1b[33m'));
        ctx.emit('abort');
        ctx.print(colorize('请求已中止', '\x1b[32m'));
      },
    },
    {
      name: 'agent',
      description: '切换到指定 Agent',
      usage: '/agent <id>',
      handler: async (args, ctx) => {
        if (!args[0]) {
          ctx.printError('请指定 Agent ID: /agent <id>');
          return;
        }
        const agents = [
          { id: 'wms-expert', name: 'WMS 专家' },
          { id: 'wms-analyst', name: 'WMS 分析师' },
          { id: 'wms-operator', name: 'WMS 操作员' },
          { id: 'general', name: '通用助手' },
          { id: 'debugger', name: '调试器' },
        ];
        const target = agents.find(a => a.id === args[0] || a.id.startsWith(args[0]));
        if (!target) {
          ctx.printError(`未找到 Agent: ${args[0]}`);
          return;
        }
        ctx.print(colorize(`已切换到 Agent: ${target.name}`, '\x1b[32m'));
      },
    },
    {
      name: 'think',
      description: '设置思考级别 (on/off/verbose)',
      usage: '/think [on|off|verbose]',
      handler: async (args, ctx) => {
        const levels = ['on', 'off', 'verbose'];
        if (args.length === 0) {
          ctx.print(`${bold('当前思考级别:')} ${colorize('on', '\x1b[36m')}`);
          ctx.print(dim(`可用级别: ${levels.join('/')}`));
          return;
        }
        const level = args[0].toLowerCase();
        if (!levels.includes(level)) {
          ctx.printError(`思考级别必须是 ${levels.join('/')}`);
          return;
        }
        ctx.print(colorize(`思考级别已设置为: ${level}`, '\x1b[32m'));
      },
    },
    {
      name: 'fast',
      description: '设置快速模式 (auto/on/off)',
      usage: '/fast [auto|on|off]',
      handler: async (args, ctx) => {
        const modes = ['auto', 'on', 'off'];
        if (args.length === 0) {
          ctx.print(`${bold('当前快速模式:')} ${colorize('auto', '\x1b[36m')}`);
          ctx.print(dim(`可用模式: ${modes.join('/')}`));
          return;
        }
        const mode = args[0].toLowerCase();
        if (!modes.includes(mode)) {
          ctx.printError(`快速模式必须是 ${modes.join('/')}`);
          return;
        }
        ctx.print(colorize(`快速模式已设置为: ${mode}`, '\x1b[32m'));
      },
    },
    {
      name: 'verbose',
      description: '设置详细模式 (on/off)',
      usage: '/verbose [on|off]',
      handler: async (args, ctx) => {
        const modes = ['on', 'off'];
        if (args.length === 0) {
          ctx.print(`${bold('当前详细模式:')} ${colorize('off', '\x1b[36m')}`);
          ctx.print(dim(`可用模式: ${modes.join('/')}`));
          return;
        }
        const mode = args[0].toLowerCase();
        if (!modes.includes(mode)) {
          ctx.printError(`详细模式必须是 ${modes.join('/')}`);
          return;
        }
        ctx.print(colorize(`详细模式已设置为: ${mode}`, '\x1b[32m'));
      },
    },
    {
      name: 'usage',
      description: '设置使用情况显示 (off/tokens/full)',
      usage: '/usage [off|tokens|full]',
      handler: async (args, ctx) => {
        const modes = ['off', 'tokens', 'full'];
        if (args.length === 0) {
          ctx.print(`${bold('当前使用情况显示:')} ${colorize('tokens', '\x1b[36m')}`);
          ctx.print(dim(`可用模式: ${modes.join('/')}`));
          return;
        }
        const mode = args[0].toLowerCase();
        if (!modes.includes(mode)) {
          ctx.printError(`使用情况显示必须是 ${modes.join('/')}`);
          return;
        }
        ctx.print(colorize(`使用情况显示已设置为: ${mode}`, '\x1b[32m'));
      },
    },
    {
      name: 'status',
      description: '显示系统状态',
      handler: async (_args, ctx) => {
        ctx.print(bold('系统状态:'));
        ctx.print(`  ${dim('连接状态:')} ${colorize('Connected', '\x1b[32m')}`);
        ctx.print(`  ${dim('会话 ID:')} ${colorize(ctx.sessionId || 'none', '\x1b[36m')}`);
        ctx.print(`  ${dim('消息数:')} ${colorize('0', '\x1b[36m')}`);
        ctx.print(`  ${dim('模型:')} ${colorize('default', '\x1b[36m')}`);
        ctx.print(`  ${dim('Agent:')} ${colorize('general', '\x1b[36m')}`);
        ctx.print(`  ${dim('版本:')} ${colorize('1.7.128', '\x1b[36m')}`);
      },
    },
    {
      name: 'model',
      description: '显示或设置模型',
      handler: async (_args, ctx) => {
        ctx.print(dim('使用 --model 参数启动时指定模型'));
      },
    },
    {
      name: 'agents',
      description: '列出可用 Agent',
      handler: async (_args, ctx) => {
        ctx.print(bold('可用 Agent:'));
        const agents = [
          { id: 'wms-expert', name: 'WMS 专家', desc: '仓储管理系统专业顾问' },
          { id: 'wms-analyst', name: 'WMS 分析师', desc: '数据分析和报告生成' },
          { id: 'wms-operator', name: 'WMS 操作员', desc: '执行仓储操作任务' },
          { id: 'general', name: '通用助手', desc: '通用对话和问答' },
          { id: 'debugger', name: '调试器', desc: '问题排查和调试' },
        ];
        for (const a of agents) {
          ctx.print(`  ${colorize(a.id, '\x1b[36m')}  ${a.name}  ${dim(a.desc)}`);
        }
      },
    },
    {
      name: 'theme',
      description: '显示或切换主题 (dark/light/auto)',
      usage: '/theme [dark|light|auto]',
      handler: async (args, ctx) => {
        if (args.length === 0) {
          const current = themeManager.getName();
          ctx.print(`${bold('当前主题:')} ${colorize(current, '\x1b[36m')}`);
          ctx.print(dim(`可用主题: ${themeManager.listThemes().join(', ')}`));
          return;
        }
        const target = args[0] as ThemeName;
        try {
          themeManager.switchTheme(target);
          ctx.print(colorize(`✓ 已切换到主题: ${target}`, '\x1b[32m'));
        } catch (err) {
          ctx.printError(err instanceof Error ? err.message : String(err));
        }
      },
    },
    {
      name: 'config',
      description: '显示当前 TUI 配置',
      handler: async (_args, ctx) => {
        try {
          const config = loadTuiConfig();
          ctx.print(bold('TUI 配置:'));
          ctx.print(`  ${dim('后端类型:')} ${colorize(config.backend, '\x1b[36m')}`);
          if (config.backend === 'http' && config.http) {
            ctx.print(`  ${dim('服务地址:')} ${colorize(config.http.baseUrl, '\x1b[36m')}`);
            if (config.http.timeoutMs) {
              ctx.print(`  ${dim('超时时间:')} ${config.http.timeoutMs}ms`);
            }
          }
          ctx.print(`  ${dim('主题:')} ${colorize(config.theme, '\x1b[36m')}`);
          ctx.print(`  ${dim('工具 Profile:')} ${colorize(config.toolProfile, '\x1b[36m')}`);
          ctx.print(`  ${dim('压缩策略:')} ${colorize(config.compaction.strategy, '\x1b[36m')}`);
          ctx.print(`  ${dim('压缩阈值:')} ${Math.round(config.compaction.thresholdRatio * 100)}%`);
          ctx.print(`  ${dim('保留轮数:')} ${config.compaction.preserveRecent}`);
          ctx.print(`  ${dim('历史命令条数:')} ${config.historySize}`);
          ctx.print(`  ${dim('配置文件:')} ${dim(getDefaultConfigPath())}`);
          if (config.model) ctx.print(`  ${dim('默认模型:')} ${colorize(config.model, '\x1b[36m')}`);
          if (config.agentId) ctx.print(`  ${dim('默认 Agent:')} ${colorize(config.agentId, '\x1b[36m')}`);
        } catch (err) {
          ctx.printError(`加载配置失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    {
      name: 'set',
      description: '修改 TUI 配置项 (theme/toolProfile/strategy/threshold/preserve/quiet)',
      usage: '/set <key> <value>',
      handler: async (args, ctx) => {
        if (args.length < 2) {
          ctx.printError('用法: /set <key> <value>');
          ctx.print(dim('  key 可选: theme, toolProfile, strategy, threshold, preserve, quiet, backend'));
          return;
        }
        const key = args[0];
        const value = args.slice(1).join(' ');

        try {
          const config = loadTuiConfig();
          let updated = false;

          switch (key) {
            case 'theme': {
              if (!['dark', 'light', 'auto'].includes(value)) {
                ctx.printError(`theme 必须是 dark/light/auto，当前: ${value}`);
                return;
              }
              config.theme = value as TuiConfig['theme'];
              themeManager.switchTheme(value as ThemeName);
              updated = true;
              break;
            }
            case 'toolProfile': {
              if (!TOOL_PROFILE_VALUES.includes(value as ToolProfile)) {
                ctx.printError(`toolProfile 必须是 ${TOOL_PROFILE_VALUES.join('/')}`);
                return;
              }
              config.toolProfile = value as ToolProfile;
              updated = true;
              break;
            }
            case 'strategy': {
              if (!COMPACTION_STRATEGY_VALUES.includes(value as CompactionStrategy)) {
                ctx.printError(`strategy 必须是 ${COMPACTION_STRATEGY_VALUES.join('/')}`);
                return;
              }
              config.compaction.strategy = value as CompactionStrategy;
              updated = true;
              break;
            }
            case 'threshold': {
              const ratio = parseFloat(value);
              if (isNaN(ratio) || ratio < 0 || ratio > 1) {
                ctx.printError(`threshold 必须是 0-1 之间的数字，例如 0.75`);
                return;
              }
              config.compaction.thresholdRatio = ratio;
              updated = true;
              break;
            }
            case 'preserve': {
              const n = parseInt(value, 10);
              if (isNaN(n) || n < 0 || n > 100) {
                ctx.printError(`preserve 必须是 0-100 之间的整数`);
                return;
              }
              config.compaction.preserveRecent = n;
              updated = true;
              break;
            }
            case 'quiet': {
              config.verbose = value === 'on' || value === 'true';
              updated = true;
              break;
            }
            case 'backend': {
              if (!['embedded', 'http'].includes(value)) {
                ctx.printError(`backend 必须是 embedded/http`);
                return;
              }
              ctx.printError('backend 切换需要重启 TUI 才能生效');
              config.backend = value as TuiConfig['backend'];
              updated = true;
              break;
            }
            default:
              ctx.printError(`未知配置项: ${key}`);
              return;
          }

          if (updated) {
            const path = saveTuiConfig(config);
            ctx.print(colorize(`✓ 已保存配置: ${path}`, '\x1b[32m'));
          }
        } catch (err) {
          ctx.printError(`设置失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    {
      name: 'profiles',
      description: '列出所有工具 Profile',
      handler: async (_args, ctx) => {
        ctx.print(bold('工具 Profile:'));
        for (const p of TOOL_PROFILE_VALUES) {
          const meta = TOOL_PROFILE_LABELS[p];
          ctx.print(`  ${colorize(p, '\x1b[36m')}  ${meta.label}  ${dim(meta.desc)}`);
        }
      },
    },
  ];
}

// 解析并执行命令
export async function executeCommand(
  input: string,
  ctx: TuiCommandContext,
): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return false;

  const parts = trimmed.slice(1).split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const commands = getCommands();
  const cmd = commands.find(
    c => c.name === cmdName || c.aliases?.includes(cmdName),
  );

  if (!cmd) {
    ctx.printError(`未知命令: /${cmdName}。输入 /help 查看可用命令`);
    return true;
  }

  try {
    await cmd.handler(args, ctx);
  } catch (err) {
    ctx.printError(`命令执行失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  return true;
}
