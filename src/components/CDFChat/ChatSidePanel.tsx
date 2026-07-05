/**
 * ChatSidePanel — AI 对话右侧面板
 *
 * - 待办（Todos）：基于 localStorage 的真实待办列表，支持添加/勾选/删除/持久化
 * - 上下文（Context）：纯前端统计 + Context Engine API（失败时静默跳过）
 *
 * 基于 OpenClaw 架构风格 + MUI 样式
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  useTheme,
  Chip,
  TextField,
  CircularProgress,
} from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import MemoryIcon from '@mui/icons-material/Memory';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BuildIcon from '@mui/icons-material/Build';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import LinkIcon from '@mui/icons-material/Link';
import ScheduleIcon from '@mui/icons-material/Schedule';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import { getGrayScale } from '../../constants/theme';
import {
  fetchContextEngineStats,
  fetchContextEngines,
  type ContextEngineStats,
  type ContextEngineInfo,
} from '../../services/api';
import type { Message, ReferencedSession } from '../../types/chat';

// ===== 待办数据类型 =====
interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  source?: 'auto' | 'manual';
}

export interface ChatSidePanelProps {
  /** 当前会话 ID（作为 localStorage 的 key） */
  sessionKey: string;
  /** 会话标题 */
  sessionTitle?: string;
  /** 会话消息列表（用于计算统计信息） */
  messages: Message[];
  /** 会话创建时间 */
  createdAt?: string;
  /** 会话最后更新时间 */
  updatedAt?: string;
  /** 当前会话使用的模型 */
  model?: string;
  /** 压缩信息（来自 ChatThread） */
  compactionInfo?: {
    found: boolean;
    originalCount?: number;
    compressionRatio?: number;
    summary?: string;
  } | null;
}

type TabKey = 'todos' | 'context';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'todos', label: '待办', icon: <ListAltIcon sx={{ fontSize: 14 }} /> },
  { key: 'context', label: '上下文', icon: <MemoryIcon sx={{ fontSize: 14 }} /> },
];

const ChatSidePanel: React.FC<ChatSidePanelProps> = ({
  sessionKey,
  sessionTitle,
  messages,
  createdAt,
  updatedAt,
  model,
  compactionInfo = null,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [activeTab, setActiveTab] = useState<TabKey>('todos');

  // ===== 待办列表状态（localStorage 持久化） =====
  const storageKey = `cdf-todos-${sessionKey}`;
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState('');

  // 加载待办（从 localStorage）
  const loadTodos = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as TodoItem[];
        if (Array.isArray(parsed)) {
          setTodos(parsed);
        }
      } else {
        setTodos([]);
      }
    } catch {
      setTodos([]);
    }
  }, [storageKey]);

  // 挂载时加载
  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  // 监听 AI 对话完成后的自动提取事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionKey === sessionKey) {
        loadTodos();
      }
    };
    window.addEventListener('cdf-todos-updated', handler);
    return () => window.removeEventListener('cdf-todos-updated', handler);
  }, [sessionKey, loadTodos]);

  // 持久化待办
  const persistTodos = useCallback((next: TodoItem[]) => {
    setTodos(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // 忽略写入失败
    }
  }, [storageKey]);

  // 添加待办
  const handleAddTodo = useCallback(() => {
    const text = newTodoText.trim();
    if (!text) return;
    const item: TodoItem = {
      id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      done: false,
      createdAt: Date.now(),
    };
    persistTodos([item, ...todos]);
    setNewTodoText('');
  }, [newTodoText, todos, persistTodos]);

  // 切换完成状态
  const handleToggleTodo = useCallback((id: string) => {
    persistTodos(todos.map(t => (t.id === id ? { ...t, done: !t.done } : t)));
  }, [todos, persistTodos]);

  // 删除待办
  const handleDeleteTodo = useCallback((id: string) => {
    persistTodos(todos.filter(t => t.id !== id));
  }, [todos, persistTodos]);

  // 清除已完成
  const handleClearCompleted = useCallback(() => {
    persistTodos(todos.filter(t => !t.done));
  }, [todos, persistTodos]);

  // ===== Context Engine API 状态 =====
  const [engineStats, setEngineStats] = useState<ContextEngineStats | null>(null);
  const [engines, setEngines] = useState<ContextEngineInfo[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState(false);

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    setContextError(false);
    try {
      const [stats, engineList] = await Promise.all([
        fetchContextEngineStats().catch(() => null),
        fetchContextEngines().catch(() => [] as ContextEngineInfo[]),
      ]);
      setEngineStats(stats);
      setEngines(engineList);
    } catch {
      setContextError(true);
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  // ===== 纯前端统计（基于 messages 数组） =====
  const stats = useMemo(() => {
    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');

    const allToolCalls = assistantMsgs.flatMap(m => m.toolCalls || []);
    const toolCountMap = new Map<string, number>();
    for (const tc of allToolCalls) {
      const name = tc.name || 'unknown';
      toolCountMap.set(name, (toolCountMap.get(name) || 0) + 1);
    }
    const toolStats = Array.from(toolCountMap.entries()).sort((a, b) => b[1] - a[1]);

    const allAttachments = messages.flatMap(m => m.attachments || []);
    const imageCount = allAttachments.filter(a => a.type === 'image').length;
    const fileCount = allAttachments.filter(a => a.type === 'file').length;

    const allRefs: ReferencedSession[] = [];
    const refIds = new Set<string>();
    for (const m of userMsgs) {
      for (const ref of m.referencedSessions || []) {
        if (!refIds.has(ref.id)) {
          refIds.add(ref.id);
          allRefs.push(ref);
        }
      }
    }

    const thinkDurations = assistantMsgs
      .map(m => m.thinkingDuration || 0)
      .filter(d => d > 0);
    const totalThinkingMs = thinkDurations.reduce((sum, d) => sum + d, 0);
    const avgThinkingMs = thinkDurations.length > 0
      ? Math.round(totalThinkingMs / thinkDurations.length)
      : 0;
    const deepThinkCount = assistantMsgs.filter(m => m.thinkingType === 'deep').length;
    const localThinkCount = assistantMsgs.filter(m => m.thinkingType === 'local').length;

    const tokenUsages = assistantMsgs
      .map(m => (m.metadata as any)?.tokenUsage)
      .filter(Boolean);
    const totalInputTokens = tokenUsages.reduce((sum, t) => sum + (t.input || 0), 0);
    const totalOutputTokens = tokenUsages.reduce((sum, t) => sum + (t.output || 0), 0);

    const modelCountMap = new Map<string, number>();
    for (const m of assistantMsgs) {
      if (m.model) {
        modelCountMap.set(m.model, (modelCountMap.get(m.model) || 0) + 1);
      }
    }
    const modelStats = Array.from(modelCountMap.entries()).sort((a, b) => b[1] - a[1]);

    return {
      userCount: userMsgs.length,
      assistantCount: assistantMsgs.length,
      totalCount: messages.length,
      toolCallCount: allToolCalls.length,
      toolStats,
      attachmentCount: allAttachments.length,
      imageCount,
      fileCount,
      attachments: allAttachments,
      refCount: allRefs.length,
      references: allRefs,
      totalThinkingMs,
      avgThinkingMs,
      deepThinkCount,
      localThinkCount,
      hasThinking: thinkDurations.length > 0,
      totalInputTokens,
      totalOutputTokens,
      hasTokens: tokenUsages.length > 0,
      modelStats,
    };
  }, [messages]);

  // ===== 格式化辅助 =====
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return `${min}m${sec}s`;
  };

  const formatTime = (iso?: string): string => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  // ===== 待办统计 =====
  const todoStats = useMemo(() => ({
    total: todos.length,
    completed: todos.filter(t => t.done).length,
    pending: todos.filter(t => !t.done).length,
  }), [todos]);

  // ===== 待办 Tab =====
  const renderTodosTab = () => (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      {/* 添加待办 */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="手动添加待办（AI 回复时也会自动提取）..."
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddTodo();
            }
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '0.75rem',
            },
          }}
        />
        <Tooltip title="添加">
          <IconButton
            size="small"
            onClick={handleAddTodo}
            disabled={!newTodoText.trim()}
            sx={{ color: '#6366f1', '&:disabled': { color: gs.textDisabled } }}
          >
            <AddIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 自动提取提示 */}
      {todos.some(t => (t as any).source === 'auto') && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <PsychologyIcon sx={{ fontSize: 12, color: '#6366f1' }} />
          <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
            AI 自动提取的待办事项
          </Typography>
        </Box>
      )}

      {/* 待办统计 */}
      {todos.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={`共 ${todoStats.total}`}
            sx={{
              height: 18, fontSize: '0.6rem',
              bgcolor: 'transparent',
              border: `1px solid ${gs.border}`,
              color: gs.textMuted,
            }}
          />
          <Chip
            size="small"
            label={`待办 ${todoStats.pending}`}
            sx={{
              height: 18, fontSize: '0.6rem',
              bgcolor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)',
              color: '#6366f1',
            }}
          />
          <Chip
            size="small"
            label={`完成 ${todoStats.completed}`}
            sx={{
              height: 18, fontSize: '0.6rem',
              bgcolor: isDark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.06)',
              color: '#22c55e',
            }}
          />
          {todoStats.completed > 0 && (
            <Tooltip title="清除已完成">
              <IconButton
                size="small"
                onClick={handleClearCompleted}
                sx={{ ml: 'auto', p: 0.25, color: gs.textMuted, '&:hover': { color: '#ef4444' } }}
              >
                <DeleteIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      <Divider />

      {/* 待办列表 */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {todos.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 4 }}>
            <ListAltIcon sx={{ fontSize: 36, opacity: 0.3, color: gs.textMuted }} />
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, textAlign: 'center' }}>
              暂无待办事项
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, textAlign: 'center' }}>
              在上方输入框添加你的任务
            </Typography>
          </Box>
        ) : (
          todos.map(todo => (
            <Box
              key={todo.id}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0.5,
                p: 0.75,
                borderRadius: 1,
                bgcolor: todo.done ? 'transparent' : gs.bgHover,
                border: `1px solid ${todo.done ? 'transparent' : gs.border}`,
                '&:hover': {
                  bgcolor: gs.bgHover,
                  '& .todo-delete': { opacity: 1 },
                },
                transition: 'all 0.15s',
              }}
            >
              <Box
                onClick={() => handleToggleTodo(todo.id)}
                sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', mt: 0.25 }}
              >
                {todo.done ? (
                  <CheckBoxIcon sx={{ fontSize: 16, color: '#22c55e' }} />
                ) : (
                  <CheckBoxOutlineBlankIcon sx={{ fontSize: 16, color: gs.textMuted }} />
                )}
              </Box>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  flex: 1,
                  lineHeight: 1.4,
                  color: todo.done ? gs.textMuted : gs.textPrimary,
                  textDecoration: todo.done ? 'line-through' : 'none',
                  wordBreak: 'break-word',
                }}
              >
                {todo.text}
                {todo.source === 'auto' && (
                  <Chip
                    size="small"
                    label="AI"
                    sx={{
                      height: 12, fontSize: '0.55rem', ml: 0.5, py: 0,
                      bgcolor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                      color: '#6366f1',
                    }}
                  />
                )}
              </Typography>
              <Tooltip title="删除">
                <IconButton
                  size="small"
                  onClick={() => handleDeleteTodo(todo.id)}
                  className="todo-delete"
                  sx={{
                    p: 0.25, opacity: 0, color: gs.textMuted,
                    transition: 'opacity 0.15s',
                    '&:hover': { color: '#ef4444' },
                  }}
                >
                  <DeleteIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );

  // ===== 上下文 Tab =====
  const renderContextTab = () => (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* 会话信息 */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
          <InfoOutlinedIcon sx={{ fontSize: 14, color: gs.textMuted }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            会话信息
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {sessionTitle && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>标题</Typography>
              <Tooltip title={sessionTitle}>
                <Typography sx={{
                  fontSize: '0.7rem', color: gs.textPrimary,
                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {sessionTitle}
                </Typography>
              </Tooltip>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>会话 ID</Typography>
            <Tooltip title={sessionKey}>
              <Typography sx={{
                fontSize: '0.7rem', color: gs.textMuted, fontFamily: 'monospace',
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {sessionKey}
              </Typography>
            </Tooltip>
          </Box>
          {model && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>当前模型</Typography>
              <Typography sx={{
                fontSize: '0.7rem', color: '#6366f1', fontFamily: 'monospace',
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {model}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Divider />

      {/* 消息统计 */}
      <Box>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          消息统计
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon sx={{ fontSize: 14, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>用户消息</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{stats.userCount}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SmartToyIcon sx={{ fontSize: 14, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>助手消息</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{stats.assistantCount}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BuildIcon sx={{ fontSize: 14, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>工具调用</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{stats.toolCallCount}</Typography>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* 时间信息 */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
          <ScheduleIcon sx={{ fontSize: 14, color: gs.textMuted }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            时间
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>创建</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, fontFamily: 'monospace' }}>{formatTime(createdAt)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>更新</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, fontFamily: 'monospace' }}>{formatTime(updatedAt)}</Typography>
          </Box>
        </Box>
      </Box>

      {/* 思考统计 */}
      {stats.hasThinking && (
        <>
          <Divider />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
              <PsychologyIcon sx={{ fontSize: 14, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                思考统计
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>总耗时</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#6366f1', fontFamily: 'monospace' }}>{formatDuration(stats.totalThinkingMs)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>平均耗时</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{formatDuration(stats.avgThinkingMs)}</Typography>
              </Box>
              {stats.deepThinkCount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>深度思考</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6366f1', fontFamily: 'monospace' }}>{stats.deepThinkCount}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </>
      )}

      {/* Token 用量 */}
      {stats.hasTokens && (
        <>
          <Divider />
          <Box>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Token 用量
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>输入</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{stats.totalInputTokens.toLocaleString()}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>输出</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{stats.totalOutputTokens.toLocaleString()}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>合计</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#6366f1', fontFamily: 'monospace', fontWeight: 600 }}>
                  {(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Box>
        </>
      )}

      {/* 压缩历史 */}
      <Divider />
      <Box>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          压缩历史
        </Typography>
        {compactionInfo?.found ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>压缩比例</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#22c55e', fontFamily: 'monospace' }}>
                {compactionInfo.compressionRatio ? `${(compactionInfo.compressionRatio * 100).toFixed(0)}%` : '—'}
              </Typography>
            </Box>
            {compactionInfo.originalCount && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>原始消息</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{compactionInfo.originalCount}</Typography>
              </Box>
            )}
            {compactionInfo.summary && (
              <Box sx={{ mt: 0.5 }}>
                <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mb: 0.25 }}>保留的关键信息：</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: gs.textSecondary, lineHeight: 1.4, p: 0.75, bgcolor: gs.bgHover, borderRadius: 1 }}>
                  {compactionInfo.summary}
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled, fontStyle: 'italic' }}>
            暂无压缩记录
          </Typography>
        )}
      </Box>

      {/* 引用会话列表 */}
      {stats.references.length > 0 && (
        <>
          <Divider />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
              <LinkIcon sx={{ fontSize: 14, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                引用会话 ({stats.references.length})
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {stats.references.slice(0, 6).map(ref => (
                <Box
                  key={ref.id}
                  sx={{
                    p: 0.75, borderRadius: 1,
                    border: `1px solid ${gs.border}`, bgcolor: gs.bgHover,
                  }}
                >
                  <Typography sx={{
                    fontSize: '0.7rem', color: gs.textPrimary,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ref.title || '无标题'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted, fontFamily: 'monospace' }}>
                    {ref.id}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      {/* 附件列表 */}
      {stats.attachments.length > 0 && (
        <>
          <Divider />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
              <AttachFileIcon sx={{ fontSize: 14, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                附件列表 ({stats.attachments.length})
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {stats.attachments.slice(0, 8).map(att => (
                <Box
                  key={att.id}
                  sx={{
                    p: 0.75, borderRadius: 1,
                    border: `1px solid ${gs.border}`, bgcolor: gs.bgHover,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{
                      fontSize: '0.7rem', color: gs.textPrimary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {att.fileName}
                    </Typography>
                    <Chip
                      size="small"
                      label={att.type}
                      sx={{
                        height: 16, fontSize: '0.6rem',
                        bgcolor: att.type === 'image' ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.12)',
                        color: att.type === 'image' ? '#6366f1' : '#f59e0b',
                      }}
                    />
                  </Box>
                  {att.size > 0 && (
                    <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                      {att.size < 1024 ? `${att.size}B` : att.size < 1024 * 1024 ? `${(att.size / 1024).toFixed(1)}KB` : `${(att.size / 1024 / 1024).toFixed(1)}MB`}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      {/* Context Engine API 区域（失败时静默不显示） */}
      {!contextError && (
        <>
          <Divider />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <MemoryIcon sx={{ fontSize: 14, color: gs.textMuted }} />
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  上下文引擎
                </Typography>
              </Box>
              <Tooltip title="刷新">
                <IconButton size="small" onClick={loadContext} sx={{ p: 0.25, color: gs.textMuted }}>
                  <RefreshIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            </Box>
            {contextLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                <CircularProgress size={14} />
              </Box>
            ) : engineStats ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>总引擎数</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{engineStats.totalEngines}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>活跃引擎</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#22c55e', fontFamily: 'monospace' }}>{engineStats.activeEngines}</Typography>
                </Box>
                {engineStats.quarantinedEngines > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>隔离引擎</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#ef4444', fontFamily: 'monospace' }}>{engineStats.quarantinedEngines}</Typography>
                  </Box>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>总操作数</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{engineStats.totalOperations}</Typography>
                </Box>
                {engineStats.avgLatencyMs > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>平均延迟</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{engineStats.avgLatencyMs}ms</Typography>
                  </Box>
                )}
              </Box>
            ) : null}
            {engines.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mt: 0.75 }}>
                {engines.slice(0, 5).map((engine) => (
                  <Box
                    key={engine.id}
                    sx={{
                      p: 0.5, borderRadius: 1,
                      border: `1px solid ${gs.border}`, bgcolor: gs.bgHover,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '0.65rem', color: gs.textPrimary, fontFamily: 'monospace' }}>
                        {engine.id}
                      </Typography>
                      <Chip
                        size="small"
                        label={engine.isDefault ? '默认' : engine.health?.status || 'unknown'}
                        sx={{
                          height: 14, fontSize: '0.55rem',
                          bgcolor: 'transparent',
                          border: `1px solid ${engine.health?.status === 'healthy' ? '#22c55e' : engine.health?.status === 'quarantined' ? '#ef4444' : gs.textMuted}`,
                          color: engine.health?.status === 'healthy' ? '#22c55e' : engine.health?.status === 'quarantined' ? '#ef4444' : gs.textMuted,
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: gs.bgPanel,
        borderLeft: `1px solid ${gs.border}`,
        overflow: 'hidden',
      }}
    >
      {/* Tab 切换 */}
      <Box sx={{ display: 'flex', borderBottom: `1px solid ${gs.border}`, flexShrink: 0 }}>
        {TABS.map((tab) => (
          <Box
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              py: 1,
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? gs.textPrimary : gs.textMuted,
              borderBottom: activeTab === tab.key ? `2px solid #6366f1` : '2px solid transparent',
              '&:hover': { bgcolor: gs.bgHover },
              transition: 'all 0.15s',
            }}
          >
            {tab.icon}
            {tab.label}
          </Box>
        ))}
      </Box>

      {/* Tab 内容 */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {activeTab === 'todos' ? renderTodosTab() : renderContextTab()}
      </Box>
    </Box>
  );
};

export default React.memo(ChatSidePanel);
