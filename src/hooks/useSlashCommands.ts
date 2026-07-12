import { useState, useCallback, useRef, useEffect } from 'react';

export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  category: 'model' | 'session' | 'utility' | 'debug';
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'model', description: '切换模型', usage: '/model <模型ID>', category: 'model' },
  { name: 'models', description: '列出所有可用模型', category: 'model' },
  { name: 'thinking', description: '切换深度思考模式', usage: '/thinking on|off|high', category: 'model' },
  { name: 'think', description: '设置思考级别', usage: '/think low|medium|high|max', category: 'model' },
  { name: 'verbose', description: '设置详细输出模式', usage: '/verbose on|off|full', category: 'model' },
  { name: 'trace', description: '设置追踪模式', usage: '/trace on|off|raw', category: 'model' },
  { name: 'reasoning', description: '设置推理显示模式', usage: '/reasoning on|off|stream', category: 'model' },
  { name: 'silent', description: '关闭所有思考模式', category: 'model' },
  { name: 'clear', description: '清空当前对话', category: 'session' },
  { name: 'new', description: '新建对话', category: 'session' },
  { name: 'compact', description: '压缩对话上下文', category: 'session' },
  { name: 'skill', description: '打开技能选择器', category: 'utility' },
  { name: 'skill-create', description: '创建新技能（AI 自动生成）', usage: '/skill-create <技能名称>', category: 'utility' },
  { name: 'context', description: '查看上下文使用情况', category: 'utility' },
  { name: 'help', description: '显示帮助信息', category: 'utility' },
  { name: 'debug', description: '切换调试模式', category: 'debug' },
];

export interface SlashCommandState {
  isOpen: boolean;
  query: string;
  filteredCommands: SlashCommand[];
  selectedIndex: number;
}

export function useSlashCommands(
  onExecute: (command: string, args: string) => boolean | void,
) {
  const [state, setState] = useState<SlashCommandState>({
    isOpen: false,
    query: '',
    filteredCommands: SLASH_COMMANDS,
    selectedIndex: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const filterCommands = useCallback((query: string) => {
    const q = query.toLowerCase();
    return SLASH_COMMANDS.filter((cmd) =>
      cmd.name.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q),
    ).slice(0, 8);
  }, []);

  const open = useCallback(() => {
    setState({
      isOpen: true,
      query: '',
      filteredCommands: SLASH_COMMANDS.slice(0, 8),
      selectedIndex: 0,
    });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  const updateQuery = useCallback((query: string) => {
    const filtered = filterCommands(query);
    setState({
      isOpen: true,
      query,
      filteredCommands: filtered,
      selectedIndex: 0,
    });
  }, [filterCommands]);

  const moveSelection = useCallback((delta: number) => {
    setState((s) => {
      if (!s.isOpen || s.filteredCommands.length === 0) return s;
      const newIndex = (s.selectedIndex + delta + s.filteredCommands.length) % s.filteredCommands.length;
      return { ...s, selectedIndex: newIndex };
    });
  }, []);

  const executeSelected = useCallback((): string | null => {
    const s = stateRef.current;
    if (!s.isOpen || s.filteredCommands.length === 0) return null;
    const cmd = s.filteredCommands[s.selectedIndex];
    return cmd.name;
  }, []);

  const handleCommand = useCallback((input: string): { handled: boolean; message: string } => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return { handled: false, message: '' };

    const parts = trimmed.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    const result = onExecute(command, args);
    if (result === false) {
      return { handled: false, message: '' };
    }

    return { handled: true, message: '' };
  }, [onExecute]);

  return {
    ...state,
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
