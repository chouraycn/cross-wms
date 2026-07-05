/**
 * TerminalPanel — AI 对话右侧终端面板
 *
 * 参考 OpenClaw 终端样式：
 * - 左侧对话内容，右侧终端
 * - 顶部标题栏：终端 zsh + 操作按钮
 * - 可关闭
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { getGrayScale } from '../../constants/theme';
import { useChatSession } from '../../contexts/ChatContext';
import type { SendAgentMessageOptions } from '../../hooks/useAgentChat';
import { useAiEngineSettings } from '../../contexts/AppSettingsContext';

// ===================== ANSI 颜色解析器 =====================

interface AnsiSegment {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const ANSI_COLORS: Record<string, string> = {
  '30': '#4a4a4a', '31': '#ef4444', '32': '#22c55e', '33': '#eab308',
  '34': '#3b82f6', '35': '#a855f7', '36': '#06b6d4', '37': '#e5e5e5',
  '90': '#737373', '91': '#f87171', '92': '#4ade80', '93': '#facc15',
  '94': '#60a5fa', '95': '#c084fc', '96': '#22d3ee', '97': '#ffffff',
};

const ANSI_BG_COLORS: Record<string, string> = {
  '40': '#4a4a4a', '41': '#ef4444', '42': '#22c55e', '43': '#eab308',
  '44': '#3b82f6', '45': '#a855f7', '46': '#06b6d4', '47': '#e5e5e5',
};

function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const ESCAPE = String.fromCharCode(27);
  const regex = new RegExp(ESCAPE + '\\[([0-9;]*)m', 'g');
  let lastIndex = 0;
  let current: AnsiSegment = { text: '' };

  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    if (before) {
      current.text = before;
      segments.push({ ...current });
    }

    const codes = m[1].split(';').map(Number);
    if (codes.length === 1 && codes[0] === 0) {
      current = { text: '' };
    } else {
      for (const code of codes) {
        if (code === 1) current.bold = true;
        else if (code === 3) current.italic = true;
        else if (code === 4) current.underline = true;
        else if (ANSI_COLORS[String(code)]) current.fg = ANSI_COLORS[String(code)];
        else if (ANSI_BG_COLORS[String(code)]) current.bg = ANSI_BG_COLORS[String(code)];
      }
    }
    lastIndex = regex.lastIndex;
  }

  const remaining = text.slice(lastIndex);
  if (remaining) {
    current.text = remaining;
    segments.push({ ...current });
  }

  return segments.length === 0 ? [{ text }] : segments;
}

// ===================== 终端行组件 =====================

interface TerminalLine {
  id: string;
  type: 'command' | 'output' | 'error' | 'system' | 'thinking' | 'tool';
  content: string;
  timestamp: number;
}

const TerminalLineView: React.FC<{ line: TerminalLine }> = ({ line }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const segments = parseAnsi(line.content);

  const getLinePrefix = () => {
    switch (line.type) {
      case 'command': return { text: '❯ ', color: '#10b981' };
      case 'error': return { text: '✗ ', color: '#ef4444' };
      case 'system': return { text: 'ℹ ', color: '#60a5fa' };
      case 'thinking': return { text: '💭 ', color: '#a855f7' };
      case 'tool': return { text: '🔧 ', color: '#f59e0b' };
      default: return { text: '  ', color: 'transparent' };
    }
  };

  const prefix = getLinePrefix();

  return (
    <Box sx={{
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", "Cascadia Code", Consolas, monospace',
      fontSize: '0.8rem',
      lineHeight: 1.6,
      py: 0.2,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      color: isDark ? '#e5e5e5' : '#1f2937',
    }}>
      <span style={{ color: prefix.color, userSelect: 'none' }}>{prefix.text}</span>
      {segments.map((seg, i) => (
        <span
          key={i}
          style={{
            color: seg.fg,
            backgroundColor: seg.bg,
            fontWeight: seg.bold ? 700 : 400,
            fontStyle: seg.italic ? 'italic' : 'normal',
            textDecoration: seg.underline ? 'underline' : 'none',
          }}
        >
          {seg.text}
        </span>
      ))}
    </Box>
  );
};

// ===================== 终端面板组件 =====================

export interface TerminalPanelProps {
  /** 关闭终端面板 */
  onClose: () => void;
  /** 从父组件注入的 useAgentChat 返回值，避免重复实例化 */
  isLoading: boolean;
  error: string | null;
  thinkingText: string;
  hasThinking: boolean;
  sendMessage: (content: string, options?: SendAgentMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
}

const COMMANDS = [
  { name: 'help', desc: '显示帮助信息', aliases: ['h', '?'] },
  { name: 'clear', desc: '清屏' },
  { name: 'sessions', desc: '列出所有会话' },
  { name: 'new', desc: '新建会话' },
  { name: 'model', desc: '显示或设置模型' },
  { name: 'agent', desc: '显示或设置 Agent' },
  { name: 'compact', desc: '压缩当前上下文' },
  { name: 'exit', desc: '关闭终端' },
];

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  onClose,
  isLoading,
  error,
  thinkingText,
  hasThinking,
  sendMessage,
  stopGeneration,
  clearMessages,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const { session, handleNewChat, handleSessionUpdate } = useChatSession();
  const { settings: aiEngine } = useAiEngineSettings();

  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(false);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // 添加输出行
  const addLine = useCallback((type: TerminalLine['type'], content: string) => {
    setLines(prev => [...prev, {
      id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      content,
      timestamp: Date.now(),
    }]);
  }, []);

  // 欢迎消息
  useEffect(() => {
    if (lines.length === 0) {
      addLine('system', 'Cross-WMS Terminal');
      addLine('system', '输入消息开始对话，或输入 /help 查看命令');
      addLine('system', `Profile: ${aiEngine.toolProfile}`);
    }
  }, []);

  // 监听 thinking
  useEffect(() => {
    if (thinkingText && hasThinking) {
      setLines(prev => {
        const last = prev[prev.length - 1];
        if (last && last.type === 'thinking') {
          return [...prev.slice(0, -1), { ...last, content: thinkingText }];
        }
        return [...prev, {
          id: `thinking_${Date.now()}`,
          type: 'thinking',
          content: thinkingText,
          timestamp: Date.now(),
        }];
      });
    }
  }, [thinkingText, hasThinking]);

  useEffect(() => {
    if (error) {
      addLine('error', error);
    }
  }, [error, addLine]);

  // 监听 session.messages 变化，添加新的 assistant 消息
  useEffect(() => {
    const lastMessage = session.messages[session.messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
      if (lastMessage.isStreaming) return;
      const content = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      setLines(prev => {
        const lastLine = prev[prev.length - 1];
        if (lastLine && lastLine.type === 'output' && lastLine.content === content) {
          return prev;
        }
        const withoutThinking = lastLine?.type === 'thinking'
          ? prev.slice(0, -1)
          : prev;
        return [...withoutThinking, {
          id: `msg_${lastMessage.id || Date.now()}`,
          type: 'output',
          content,
          timestamp: Date.now(),
        }];
      });
    }
  }, [session.messages]);

  // 执行命令
  const executeCommand = useCallback(async (cmdLine: string) => {
    const parts = cmdLine.slice(1).trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
      case 'h':
      case '?':
        addLine('system', '可用命令:');
        COMMANDS.forEach(c => {
          const aliasStr = c.aliases ? ` (${c.aliases.join(', ')})` : '';
          addLine('system', `  /${c.name}${aliasStr}  ${c.desc}`);
        });
        addLine('system', '快捷键: ↑/↓ 历史, Enter 发送, Ctrl+C 中断');
        break;

      case 'clear':
        setLines([]);
        break;

      case 'exit':
      case 'quit':
        onClose();
        break;

      case 'new':
        handleNewChat();
        addLine('system', '已创建新会话');
        break;

      case 'sessions':
        addLine('system', `当前会话: ${session.id.slice(0, 16)}...`);
        addLine('system', `消息数: ${session.messages.length}`);
        addLine('system', `模型: ${session.model || 'auto'}`);
        break;

      case 'model':
        if (args.length === 0) {
          addLine('system', `当前模型: ${session.model || 'auto'}`);
        } else {
          addLine('system', `已设置模型: ${args[0]}`);
        }
        break;

      case 'agent':
        if (args.length === 0) {
          addLine('system', '可用 Agent: wms-expert, wms-analyst, wms-operator, general, debugger');
        } else {
          addLine('system', `已设置 Agent: ${args[0]}`);
        }
        break;

      case 'compact':
        addLine('system', '正在压缩上下文...');
        break;

      default:
        addLine('error', `未知命令: /${cmd}，输入 /help 查看可用命令`);
    }
  }, [addLine, onClose, handleNewChat, session]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessingRef.current) return;

    if (text && !history.includes(text)) {
      setHistory(prev => [...prev.slice(-49), text]);
    }
    setHistoryIndex(-1);

    addLine('command', text);
    setInput('');

    if (text.startsWith('/')) {
      await executeCommand(text);
      return;
    }

    isProcessingRef.current = true;
    try {
      const options: SendAgentMessageOptions = {
        model: session.model || 'auto',
        agentId: 'general',
        executionMode: aiEngine.defaultExecutionMode as any,
      };
      await sendMessage(text, options);
    } catch (err) {
      addLine('error', `发送失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isProcessingRef.current = false;
    }
  }, [input, history, addLine, executeCommand, sendMessage, session, aiEngine]);

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex] || '');
        }
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      if (isLoading) {
        stopGeneration();
        addLine('system', '已中断');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  }, [handleSend, history, historyIndex, isLoading, stopGeneration, addLine]);

  // 聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const iconBtnSx = {
    color: gs.textMuted,
    p: 0.5,
    bgcolor: 'transparent',
    '&:hover': { bgcolor: 'transparent', color: gs.textPrimary },
  };

  return (
    <Box sx={{
      width: 380,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderLeft: `1px solid ${gs.border}`,
      bgcolor: '#ffffff',
      height: '100%',
    }}>
      {/* 顶部标题栏 */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        px: 2,
        py: 1,
        borderBottom: `1px solid ${gs.border}`,
        minHeight: 36,
      }}>
        <Box sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.8rem',
          fontWeight: 500,
          color: gs.textPrimary,
        }}>
          终端&nbsp;<span style={{ color: gs.textMuted }}>zsh</span>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="新建标签" arrow>
          <IconButton size="small" sx={iconBtnSx}>
            <AddIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="通知" arrow>
          <IconButton size="small" sx={iconBtnSx}>
            <NotificationsNoneIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="全屏" arrow>
          <IconButton size="small" sx={iconBtnSx}>
            <OpenInFullIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="关闭" arrow>
          <IconButton size="small" onClick={onClose} sx={iconBtnSx}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 终端输出区域 */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 1.5,
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
            borderRadius: '3px',
          },
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map(line => (
          <TerminalLineView key={line.id} line={line} />
        ))}

        {isLoading && !hasThinking && (
          <Box sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.8rem',
            color: '#f59e0b',
            py: 0.2,
          }}>
            <span style={{ color: '#f59e0b' }}>● </span>
            <span style={{ animation: 'pulse 1.5s infinite' }}>处理中...</span>
          </Box>
        )}
      </Box>

      {/* 输入区域 */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 2,
        py: 1,
        borderTop: `1px solid ${gs.border}`,
      }}>
        <Box sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.85rem',
          color: '#10b981',
          userSelect: 'none',
        }}>
          ❯
        </Box>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="输入命令..."
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
            fontSize: '0.8rem',
            color: isDark ? '#e5e5e5' : '#1f2937',
          }}
        />
      </Box>
    </Box>
  );
};

export default TerminalPanel;
