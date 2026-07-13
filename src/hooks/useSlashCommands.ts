import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  category: 'model' | 'session' | 'utility' | 'debug' | 'system' | 'help';
  /** When true, the command is a built-in system command. Hidden in some UI surfaces. */
  reserved?: boolean;
  /** Multilingual descriptions keyed by locale (e.g. "en", "zh", "ja"). */
  descriptionLocalizations?: Record<string, string>;
  /** Optional material icon name used by the command palette. */
  icon?: string;
}

/**
 * Returns the locale-appropriate description, falling back to the default
 * description when no localization matches the current locale.
 */
export function resolveSlashCommandDescription(
  command: SlashCommand,
  locale: string,
): string {
  if (command.descriptionLocalizations) {
    const direct = command.descriptionLocalizations[locale];
    if (direct) {
      return direct;
    }
    const base = locale.split(/[-_]/)[0];
    if (base) {
      const baseLocalized = command.descriptionLocalizations[base];
      if (baseLocalized) {
        return baseLocalized;
      }
    }
  }
  return command.description;
}

const RECENT_STORAGE_KEY = 'cdf-recent-slash-commands';
const RECENT_DEFAULT_LIMIT = 6;

/** Reads the most-recently-used slash commands (most-recent first). */
export function getRecentSlashCommands(limit: number = RECENT_DEFAULT_LIMIT): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === 'string').slice(0, limit);
  } catch {
    return [];
  }
}

/** Records a slash command as recently used. Most-recent first, dedup, capped at `limit`. */
export function recordRecentSlashCommand(name: string, limit: number = 12): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const recent = getRecentSlashCommands(limit * 2);
    const updated = [name, ...recent.filter((c) => c !== name)].slice(0, limit);
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

/** Returns a fuzzy match score for a query against a name (higher = better, 0 = no match). */
export function fuzzySlashCommandScore(query: string, name: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80 - (n.length - q.length);
  if (n.includes(q)) return 50 - (n.indexOf(q) === 0 ? 0 : 10);
  // Subsequence fuzzy match (e.g. "mdl" matches "model").
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i += 1) {
    if (n[i] === q[qi]) qi += 1;
  }
  return qi === q.length ? 25 - n.length : 0;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'model',
    description: '切换模型',
    usage: '/model <模型ID>',
    category: 'model',
    reserved: true,
    descriptionLocalizations: { en: 'Switch the active model', zh: '切换模型' },
  },
  {
    name: 'models',
    description: '列出所有可用模型',
    category: 'model',
    reserved: true,
    descriptionLocalizations: { en: 'List all available models', zh: '列出所有可用模型' },
  },
  {
    name: 'thinking',
    description: '切换深度思考模式',
    usage: '/thinking on|off|high',
    category: 'model',
    reserved: true,
    descriptionLocalizations: { en: 'Toggle extended thinking mode', zh: '切换深度思考模式' },
  },
  {
    name: 'think',
    description: '设置思考级别',
    usage: '/think low|medium|high|max',
    category: 'model',
    reserved: true,
    descriptionLocalizations: { en: 'Set the thinking level', zh: '设置思考级别' },
  },
  {
    name: 'verbose',
    description: '设置详细输出模式',
    usage: '/verbose on|off|full',
    category: 'model',
    reserved: true,
    descriptionLocalizations: { en: 'Set the verbose output mode', zh: '设置详细输出模式' },
  },
  {
    name: 'trace',
    description: '设置追踪模式',
    usage: '/trace on|off|raw',
    category: 'model',
    reserved: true,
    descriptionLocalizations: { en: 'Set the trace mode', zh: '设置追踪模式' },
  },
  {
    name: 'reasoning',
    description: '设置推理显示模式',
    usage: '/reasoning on|off|stream',
    category: 'model',
    reserved: true,
    descriptionLocalizations: { en: 'Set the reasoning display mode', zh: '设置推理显示模式' },
  },
  {
    name: 'silent',
    description: '关闭所有思考模式',
    category: 'model',
    reserved: true,
    descriptionLocalizations: { en: 'Disable all thinking modes', zh: '关闭所有思考模式' },
  },
  {
    name: 'clear',
    description: '清空当前对话',
    category: 'session',
    reserved: true,
    descriptionLocalizations: { en: 'Clear the current conversation', zh: '清空当前对话' },
  },
  {
    name: 'new',
    description: '新建对话',
    category: 'session',
    reserved: true,
    descriptionLocalizations: { en: 'Start a new conversation', zh: '新建对话' },
  },
  {
    name: 'compact',
    description: '压缩对话上下文',
    category: 'session',
    reserved: true,
    descriptionLocalizations: { en: 'Compact the conversation context', zh: '压缩对话上下文' },
  },
  {
    name: 'skill',
    description: '打开技能选择器',
    category: 'utility',
    descriptionLocalizations: { en: 'Open the skill selector', zh: '打开技能选择器' },
  },
  {
    name: 'skill-create',
    description: '创建新技能（AI 自动生成）',
    usage: '/skill-create <技能名称>',
    category: 'utility',
    descriptionLocalizations: {
      en: 'Create a new skill (AI-generated)',
      zh: '创建新技能（AI 自动生成）',
    },
  },
  {
    name: 'context',
    description: '查看上下文使用情况',
    category: 'utility',
    descriptionLocalizations: { en: 'Inspect context usage', zh: '查看上下文使用情况' },
  },
  {
    name: 'help',
    description: '显示帮助信息',
    category: 'help',
    reserved: true,
    descriptionLocalizations: { en: 'Show the help information', zh: '显示帮助信息' },
  },
  {
    name: 'debug',
    description: '切换调试模式',
    category: 'debug',
    reserved: true,
    descriptionLocalizations: { en: 'Toggle debug mode', zh: '切换调试模式' },
  },
];

/**
 * Returns the current UI locale, falling back to "en" when no locale is set.
 * Reads from `document.documentElement.lang` first, then `navigator.language`.
 */
export function detectSlashCommandLocale(): string {
  if (typeof document !== 'undefined' && document.documentElement.lang) {
    return document.documentElement.lang;
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en';
}

export interface SlashCommandState {
  isOpen: boolean;
  query: string;
  filteredCommands: SlashCommand[];
  selectedIndex: number;
}

export function useSlashCommands(
  onExecute: (command: string, args: string) => boolean | void,
  options: { commands?: SlashCommand[]; limit?: number } = {},
) {
  const commands = options.commands ?? SLASH_COMMANDS;
  const limit = options.limit ?? 8;
  const locale = useMemo(() => detectSlashCommandLocale(), []);
  const recentNames = useMemo(() => getRecentSlashCommands(RECENT_DEFAULT_LIMIT), []);

  const [state, setState] = useState<SlashCommandState>({
    isOpen: false,
    query: '',
    filteredCommands: commands.slice(0, limit),
    selectedIndex: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const filterCommands = useCallback(
    (query: string) => {
      if (!query) {
        // No query: surface recent commands first, then the rest.
        const recent = recentNames
          .map((name) => commands.find((c) => c.name === name))
          .filter((c): c is SlashCommand => Boolean(c));
        const rest = commands.filter((c) => !recentNames.includes(c.name));
        return [...recent, ...rest].slice(0, limit);
      }
      const q = query.toLowerCase();
      const scored = commands
        .map((cmd) => {
          const nameScore = fuzzySlashCommandScore(q, cmd.name);
          const descScore = fuzzySlashCommandScore(q, cmd.description) / 2;
          return { cmd, score: Math.max(nameScore, descScore) };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.cmd);
      return scored.slice(0, limit);
    },
    [commands, limit, recentNames],
  );

  const open = useCallback(() => {
    setState({
      isOpen: true,
      query: '',
      filteredCommands: filterCommands(''),
      selectedIndex: 0,
    });
  }, [filterCommands]);

  const close = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  const updateQuery = useCallback(
    (query: string) => {
      const filtered = filterCommands(query);
      setState({
        isOpen: true,
        query,
        filteredCommands: filtered,
        selectedIndex: 0,
      });
    },
    [filterCommands],
  );

  const moveSelection = useCallback((delta: number) => {
    setState((s) => {
      if (!s.isOpen || s.filteredCommands.length === 0) return s;
      const newIndex =
        (s.selectedIndex + delta + s.filteredCommands.length) % s.filteredCommands.length;
      return { ...s, selectedIndex: newIndex };
    });
  }, []);

  const executeSelected = useCallback((): string | null => {
    const s = stateRef.current;
    if (!s.isOpen || s.filteredCommands.length === 0) return null;
    const cmd = s.filteredCommands[s.selectedIndex];
    return cmd.name;
  }, []);

  const handleCommand = useCallback(
    (input: string): { handled: boolean; message: string } => {
      const trimmed = input.trim();
      if (!trimmed.startsWith('/')) return { handled: false, message: '' };

      const parts = trimmed.slice(1).split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      // Record as recently used when handled.
      const known = commands.some((c) => c.name.toLowerCase() === command);
      if (known) {
        recordRecentSlashCommand(command);
      }

      const result = onExecute(command, args);
      if (result === false) {
        return { handled: false, message: '' };
      }

      return { handled: true, message: '' };
    },
    [onExecute, commands],
  );

  return {
    ...state,
    locale,
    open,
    close,
    updateQuery,
    moveSelection,
    executeSelected,
    handleCommand,
  };
}

export function formatHelpText(): string {
  const categories: Record<string, SlashCommand[]> = {};
  for (const cmd of SLASH_COMMANDS) {
    if (!categories[cmd.category]) categories[cmd.category] = [];
    categories[cmd.category].push(cmd);
  }

  const categoryLabels: Record<string, string> = {
    model: '模型',
    session: '会话',
    utility: '工具',
    skill: '技能',
    debug: '调试',
  };

  let text = '**可用命令：**\n\n';
  for (const [cat, cmds] of Object.entries(categories)) {
    text += `**${categoryLabels[cat] || cat}**\n`;
    for (const cmd of cmds) {
      const usage = cmd.usage ? ` ${cmd.usage.slice(cmd.name.length + 1)}` : '';
      text += `- \`/${cmd.name}${usage}\` — ${cmd.description}\n`;
    }
    text += '\n';
  }

  return text;
}
