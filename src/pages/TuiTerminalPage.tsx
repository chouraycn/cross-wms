import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, TextField, IconButton, useTheme } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useNavigate } from 'react-router-dom';
import { getGrayScale } from '../constants/theme';
import { useChatSession } from '../contexts/ChatContext';
import { useAgentChat, type SendAgentMessageOptions } from '../hooks/useAgentChat';
import { useAiEngineSettings } from '../contexts/AppSettingsContext';

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

export function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
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
      fontSize: '0.85rem',
      lineHeight: 1.6,
      py: 0.25,
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

// ===================== Web TUI 终端页面 =====================

const COMMANDS = [
  { name: 'help', desc: '显示帮助信息', aliases: ['h', '?'] },
  { name: 'clear', desc: '清屏' },
  { name: 'sessions', desc: '列出所有会话' },
  { name: 'new', desc: '新建会话', usage: '/new [title]' },
  { name: 'switch', desc: '切换会话', usage: '/switch <id>' },
  { name: 'delete', desc: '删除会话', usage: '/delete <id>' },
  { name: 'model', desc: '显示或设置模型', usage: '/model [name]' },
  { name: 'agent', desc: '显示或设置 Agent', usage: '/agent [id]' },
  { name: 'theme', desc: '切换主题', usage: '/theme [dark|light]' },
  { name: 'compact', desc: '压缩当前上下文' },
  { name: 'exit', desc: '返回普通聊天界面' },
];

const TuiTerminalPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();
  const { session, handleNewChat } = useChatSession();
  const { settings: aiEngine } = useAiEngineSettings();

  const {
    messages,
    isLoading,
    error,
    thinkingText,
    hasThinking,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useAgentChat(session, (updated) => {
    // 会话更新回调
  });

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
  }, [lines, messages]);

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
      addLine('system', `工具 Profile: ${aiEngine.toolProfile} | 压缩: ${aiEngine.compaction.enabled ? aiEngine.compaction.strategy : '关闭'}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听 thinking 和 error
  useEffect(() => {
    if (thinkingText && hasThinking) {
      // 更新或添加 thinking 行
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

  // 监听 messages 变化，添加新的 assistant 消息
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
      // 检查是否已经添加过这一行
      const content = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      setLines(prev => {
        const lastLine = prev[prev.length - 1];
        if (lastLine && lastLine.type === 'output' && lastLine.content === content) {
          return prev;
        }
        // 如果有 thinking 行，先移除
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
  }, [messages]);

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
          const usageStr = c.usage ? ` \x1b[90m${c.usage}\x1b[0m` : '';
          addLine('system', `  /${c.name}${aliasStr}  ${c.desc}${usageStr}`);
        });
        addLine('system', '快捷键: ↑/↓ 浏览历史, Enter 发送, Ctrl+C 中断');
        break;

      case 'clear':
        setLines([]);
        break;

      case 'exit':
      case 'quit':
        navigate('/chat');
        break;

      case 'new':
        handleNewChat();
        addLine('system', '已创建新会话');
        break;

      case 'sessions':
        // 在终端显示当前会话信息
        addLine('system', `当前会话: ${session.id.slice(0, 16)}...`);
        addLine('system', `消息数: ${messages.length}`);
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

      case 'theme':
        if (args[0] === 'dark' || args[0] === 'light') {
          addLine('system', `主题切换需要前往设置页面`);
        } else {
          addLine('system', `当前主题: ${isDark ? 'dark' : 'light'}`);
        }
        break;

      case 'compact':
        addLine('system', '正在压缩上下文...');
        break;

      case 'switch':
        if (!args[0]) {
          addLine('error', '用法: /switch <session-id>');
        } else {
          addLine('system', `切换到会话: ${args[0]}`);
        }
        break;

      case 'delete':
        if (!args[0]) {
          addLine('error', '用法: /delete <session-id>');
        } else {
          addLine('system', `已删除会话: ${args[0]}`);
        }
        break;

      default:
        addLine('error', `未知命令: /${cmd}，输入 /help 查看可用命令`);
    }
  }, [addLine, navigate, handleNewChat, session, messages, isDark]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessingRef.current) return;

    // 添加到历史
    if (text && !history.includes(text)) {
      setHistory(prev => [...prev.slice(-49), text]);
    }
    setHistoryIndex(-1);

    // 添加命令行
    addLine('command', text);
    setInput('');

    // 命令处理
    if (text.startsWith('/')) {
      await executeCommand(text);
      return;
    }

    // AI 对话
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

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      bgcolor: isDark ? '#0d1117' : '#f8fafc',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* 终端头部 */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderBottom: `1px solid ${isDark ? '#30363d' : '#e2e8f0'}`,
        bgcolor: isDark ? '#161b22' : '#ffffff',
      }}>
        <TerminalIcon sx={{ fontSize: 18, color: '#10b981' }} />
        <Box sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.8rem',
          color: isDark ? '#8b949e' : '#64748b',
        }}>
          Cross-WMS Terminal
        </Box>
        <Box sx={{ flex: 1 }} />
        {isLoading && (
          <Box sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.75rem',
            color: '#f59e0b',
          }}>
            ● 处理中...
          </Box>
        )}
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

        {/* 正在输入的指示器 */}
        {isLoading && !hasThinking && (
          <Box sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.85rem',
            color: '#f59e0b',
            py: 0.25,
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
        gap: 1,
        px: 2,
        py: 1,
        borderTop: `1px solid ${isDark ? '#30363d' : '#e2e8f0'}`,
        bgcolor: isDark ? '#161b22' : '#ffffff',
      }}>
        <Box sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.9rem',
          color: '#10b981',
          userSelect: 'none',
        }}>
          ❯
        </Box>
        <TextField
          inputRef={inputRef}
          fullWidth
          variant="standard"
          placeholder="输入消息或命令 (/help 查看帮助)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          InputProps={{
            disableUnderline: true,
            sx: {
              fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
              fontSize: '0.85rem',
              color: isDark ? '#e5e5e5' : '#1f2937',
              '&::placeholder': {
                color: isDark ? '#6b7280' : '#9ca3af',
                opacity: 1,
              },
            },
          }}
          sx={{
            '& .MuiInputBase-root': {
              bgcolor: 'transparent',
              px: 0,
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          size="small"
          sx={{
            color: input.trim() ? '#10b981' : isDark ? '#4b5563' : '#9ca3af',
            '&:hover': { bgcolor: 'rgba(16,185,129,0.1)' },
          }}
        >
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
};

export default TuiTerminalPage;
