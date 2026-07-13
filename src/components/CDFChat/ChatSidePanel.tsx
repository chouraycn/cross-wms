/**
 * ChatSidePanel — AI 对话右侧面板
 *
 * - 待办（Todos）：基于 localStorage 的真实待办列表，支持添加/勾选/删除/持久化
 * - 上下文（Context）：纯前端统计 + Context Engine API（失败时静默跳过）
 * - 工具调用（Tools）：工具调用历史记录
 * - 生成文件（Files）：AI 生成的文件列表
 * - 执行计划（Plan）：执行计划步骤追踪
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
} from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import MemoryIcon from '@mui/icons-material/Memory';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BuildIcon from '@mui/icons-material/Build';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { ThinkingIcon } from '../Common/Icons';
import LinkIcon from '@mui/icons-material/Link';
import ScheduleIcon from '@mui/icons-material/Schedule';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DescriptionIcon from '@mui/icons-material/Description';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PendingIcon from '@mui/icons-material/Pending';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CodeIcon from '@mui/icons-material/Code';
import { getGrayScale } from '../../constants/theme';
import GoalIndicator from '../Goal/GoalIndicator';
import {
  fetchContextEngineStats,
  fetchContextEngines,
  type ContextEngineStats,
  type ContextEngineInfo,
} from '../../services/api';
import type { Message, ReferencedSession, ToolCallInfo, GeneratedFile, PlanStepInfo } from '../../types/chat';

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

type TabKey = 'todos' | 'context' | 'tools' | 'files' | 'plan';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'todos', label: '待办', icon: <ListAltIcon sx={{ fontSize: 14 }} /> },
  { key: 'context', label: '上下文', icon: <MemoryIcon sx={{ fontSize: 14 }} /> },
  { key: 'tools', label: '工具', icon: <BuildIcon sx={{ fontSize: 14 }} /> },
  { key: 'files', label: '文件', icon: <InsertDriveFileIcon sx={{ fontSize: 14 }} /> },
  { key: 'plan', label: '计划', icon: <PlayCircleIcon sx={{ fontSize: 14 }} /> },
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

  // ===== 工具调用数据 =====
  const toolCallData = useMemo(() => {
    const allCalls: Array<{ call: ToolCallInfo; messageId: string; index: number }> = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        msg.toolCalls.forEach((tc, idx) => {
          allCalls.push({ call: tc, messageId: msg.id, index: idx });
        });
      }
    }
    const toolCountMap = new Map<string, number>();
    for (const { call } of allCalls) {
      toolCountMap.set(call.name, (toolCountMap.get(call.name) || 0) + 1);
    }
    const toolStats = Array.from(toolCountMap.entries()).sort((a, b) => b[1] - a[1]);
    return {
      total: allCalls.length,
      calls: allCalls.reverse(),
      toolStats,
      toolTypes: toolCountMap.size,
    };
  }, [messages]);

  // ===== 生成文件数据 =====
  const generatedFilesData = useMemo(() => {
    const allFiles: Array<{ file: GeneratedFile; messageId: string }> = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.generatedFiles?.length) {
        msg.generatedFiles.forEach(f => {
          allFiles.push({ file: f, messageId: msg.id });
        });
      }
    }
    const typeCountMap = new Map<string, number>();
    for (const { file } of allFiles) {
      const ext = file.fileName.split('.').pop()?.toLowerCase() || 'unknown';
      typeCountMap.set(ext, (typeCountMap.get(ext) || 0) + 1);
    }
    const totalSize = allFiles.reduce((sum, { file }) => sum + file.fileSize, 0);
    return {
      total: allFiles.length,
      files: allFiles.reverse(),
      typeStats: Array.from(typeCountMap.entries()).sort((a, b) => b[1] - a[1]),
      totalSize,
    };
  }, [messages]);

  // ===== 执行计划数据 =====
  const planData = useMemo(() => {
    let latestPlan: Message['executionPlan'] | null = null;
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.executionPlan) {
        latestPlan = msg.executionPlan;
      }
    }
    if (!latestPlan) {
      return { hasPlan: false, plan: null, completed: 0, total: 0, progress: 0 };
    }
    const steps = latestPlan.steps || [];
    const completed = steps.filter(s => s.status === 'completed').length;
    const total = steps.length;
    const progress = total > 0 ? (completed / total) * 100 : 0;
    return { hasPlan: true, plan: latestPlan, completed, total, progress };
  }, [messages]);

  // ===== 文件大小格式化 =====
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // ===== 工具参数格式化 =====
  const formatToolArgs = (args: string): string => {
    try {
      const parsed = JSON.parse(args);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return args;
    }
  };

  // ===== 步骤状态图标 =====
  const getStepIcon = (status: PlanStepInfo['status']) => {
    switch (status) {
      case 'completed': return <CheckCircleIcon sx={{ fontSize: 14, color: '#22c55e' }} />;
      case 'in_progress': return <PlayCircleIcon sx={{ fontSize: 14, color: '#6366f1' }} />;
      case 'failed': return <ErrorIcon sx={{ fontSize: 14, color: '#ef4444' }} />;
      case 'skipped': return <PendingIcon sx={{ fontSize: 14, color: '#9ca3af' }} />;
      default: return <PendingIcon sx={{ fontSize: 14, color: '#9ca3af' }} />;
    }
  };

  const getStepStatusLabel = (status: PlanStepInfo['status']) => {
    const map: Record<string, { label: string; color: string }> = {
      pending: { label: '等待中', color: '#9ca3af' },
      in_progress: { label: '进行中', color: '#6366f1' },
      completed: { label: '已完成', color: '#22c55e' },
      failed: { label: '失败', color: '#ef4444' },
      skipped: { label: '跳过', color: '#9ca3af' },
    };
    return map[status] || map.pending;
  };

  // ===== 获取文件图标颜色 =====
  const getFileIconColor = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const colorMap: Record<string, string> = {
      html: '#e34f26', css: '#1572b6', js: '#f7df1e', ts: '#3178c6',
      jsx: '#61dafb', tsx: '#61dafb', json: '#cbbb0e', md: '#519aba',
      py: '#3776ab', go: '#00add8', rs: '#dea584', java: '#007396',
      png: '#a6d43f', jpg: '#ff6b6b', svg: '#ffb13b', pdf: '#e11d48',
      zip: '#f59e0b', tar: '#f59e0b',
    };
    return colorMap[ext] || '#6b7280';
  };

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
          <ThinkingIcon size={12} color="#6366f1" />
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
              <ThinkingIcon size={14} color={gs.textMuted} />
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

  // ===== 工具调用 Tab =====
  const renderToolsTab = () => (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      {/* 统计信息 */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          label={`总调用 ${toolCallData.total}`}
          sx={{
            height: 20, fontSize: '0.6rem',
            bgcolor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)',
            color: '#6366f1',
          }}
        />
        <Chip
          size="small"
          label={`工具类型 ${toolCallData.toolTypes}`}
          sx={{
            height: 20, fontSize: '0.6rem',
            bgcolor: 'transparent',
            border: `1px solid ${gs.border}`,
            color: gs.textMuted,
          }}
        />
      </Box>

      {/* 工具类型统计 */}
      {toolCallData.toolStats.length > 0 && (
        <>
          <Divider />
          <Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: gs.textMuted, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              工具分布
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {toolCallData.toolStats.slice(0, 5).map(([name, count]) => (
                <Box key={name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    <CodeIcon sx={{ fontSize: 12, color: gs.textMuted, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.7rem', color: gs.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.7rem', color: gs.textPrimary, fontFamily: 'monospace', flexShrink: 0 }}>
                    {count}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      <Divider />

      {/* 工具调用列表 */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {toolCallData.calls.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 4 }}>
            <BuildIcon sx={{ fontSize: 36, opacity: 0.3, color: gs.textMuted }} />
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, textAlign: 'center' }}>
              暂无工具调用
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, textAlign: 'center' }}>
              AI 使用工具时会在这里显示
            </Typography>
          </Box>
        ) : (
          toolCallData.calls.map(({ call, messageId, index }) => (
            <Accordion
              key={`${messageId}-${index}`}
              sx={{
                bgcolor: gs.bgHover,
                border: `1px solid ${gs.border}`,
                borderRadius: 1,
                '&:before': { display: 'none' },
                '&.Mui-expanded': { margin: 0 },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ fontSize: 14, color: gs.textMuted }} />}
                sx={{
                  p: 0.75,
                  minHeight: 'auto',
                  '&.Mui-expanded': { minHeight: 'auto' },
                  '& .MuiAccordionSummary-content': { m: 0 },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                  <BuildIcon sx={{ fontSize: 14, color: '#6366f1', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {call.name}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1, pt: 0 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: gs.textMuted, mb: 0.25 }}>参数</Typography>
                    <Box
                      sx={{
                        p: 0.75,
                        bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)',
                        borderRadius: 0.5,
                        maxHeight: 150,
                        overflow: 'auto',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.65rem',
                          fontFamily: 'monospace',
                          color: gs.textSecondary,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {formatToolArgs(call.arguments)}
                      </Typography>
                    </Box>
                  </Box>
                  {call.result && (
                    <Box>
                      <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: gs.textMuted, mb: 0.25 }}>结果</Typography>
                      <Box
                        sx={{
                          p: 0.75,
                          bgcolor: isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.04)',
                          borderRadius: 0.5,
                          maxHeight: 150,
                          overflow: 'auto',
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            color: '#22c55e',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {call.result.length > 500 ? call.result.slice(0, 500) + '\n...' : call.result}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Box>
    </Box>
  );

  // ===== 生成文件 Tab =====
  const renderFilesTab = () => (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      {/* 统计信息 */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          label={`文件 ${generatedFilesData.total}`}
          sx={{
            height: 20, fontSize: '0.6rem',
            bgcolor: isDark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.06)',
            color: '#22c55e',
          }}
        />
        <Chip
          size="small"
          label={formatFileSize(generatedFilesData.totalSize)}
          sx={{
            height: 20, fontSize: '0.6rem',
            bgcolor: 'transparent',
            border: `1px solid ${gs.border}`,
            color: gs.textMuted,
          }}
        />
      </Box>

      {/* 文件类型统计 */}
      {generatedFilesData.typeStats.length > 0 && (
        <>
          <Divider />
          <Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: gs.textMuted, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              类型分布
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {generatedFilesData.typeStats.map(([ext, count]) => (
                <Chip
                  key={ext}
                  size="small"
                  label={`.${ext} ×${count}`}
                  sx={{
                    height: 18, fontSize: '0.6rem',
                    bgcolor: 'transparent',
                    border: `1px solid ${gs.border}`,
                    color: gs.textSecondary,
                  }}
                />
              ))}
            </Box>
          </Box>
        </>
      )}

      <Divider />

      {/* 文件列表 */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {generatedFilesData.files.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 4 }}>
            <InsertDriveFileIcon sx={{ fontSize: 36, opacity: 0.3, color: gs.textMuted }} />
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, textAlign: 'center' }}>
              暂无生成文件
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, textAlign: 'center' }}>
              AI 生成的文件会在这里显示
            </Typography>
          </Box>
        ) : (
          generatedFilesData.files.map(({ file }) => (
            <Box
              key={file.downloadUrl}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                p: 0.75,
                borderRadius: 1,
                bgcolor: gs.bgHover,
                border: `1px solid ${gs.border}`,
                '&:hover': {
                  borderColor: '#6366f1',
                },
                transition: 'all 0.15s',
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  bgcolor: `${getFileIconColor(file.fileName)}15`,
                }}
              >
                <DescriptionIcon sx={{ fontSize: 16, color: getFileIconColor(file.fileName) }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    color: gs.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.fileName}
                </Typography>
                <Typography sx={{ fontSize: '0.6rem', color: gs.textMuted }}>
                  {formatFileSize(file.fileSize)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.25 }}>
                {file.previewUrl && (
                  <Tooltip title="预览">
                    <IconButton size="small" sx={{ p: 0.25, color: gs.textMuted, '&:hover': { color: '#6366f1' } }}>
                      <VisibilityIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="下载">
                  <IconButton
                    size="small"
                    onClick={() => window.open(file.downloadUrl, '_blank')}
                    sx={{ p: 0.25, color: gs.textMuted, '&:hover': { color: '#22c55e' } }}
                  >
                    <DownloadIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );

  // ===== 执行计划 Tab =====
  const renderPlanTab = () => (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      {!planData.hasPlan ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 8 }}>
          <PlayCircleIcon sx={{ fontSize: 36, opacity: 0.3, color: gs.textMuted }} />
          <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, textAlign: 'center' }}>
            暂无执行计划
          </Typography>
          <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, textAlign: 'center' }}>
            AI 规划任务时会在这里显示
          </Typography>
        </Box>
      ) : (
        <>
          {/* 计划意图 */}
          {planData.plan?.intent && (
            <Box>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: gs.textMuted, mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                任务目标
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary, lineHeight: 1.4 }}>
                {planData.plan.intent}
              </Typography>
            </Box>
          )}

          {/* 进度条 */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                执行进度
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: gs.textPrimary, fontFamily: 'monospace' }}>
                {planData.completed}/{planData.total}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={planData.progress}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: gs.bgHover,
                '& .MuiLinearProgress-bar': {
                  bgcolor: '#6366f1',
                  borderRadius: 3,
                },
              }}
            />
          </Box>

          <Divider />

          {/* 步骤列表 */}
          <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {planData.plan?.steps?.map((step, idx) => {
              const statusInfo = getStepStatusLabel(step.status);
              return (
                <Box
                  key={idx}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 0.75,
                    p: 0.75,
                    borderRadius: 1,
                    bgcolor: step.status === 'in_progress' ? (isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.04)') : 'transparent',
                    border: `1px solid ${step.status === 'in_progress' ? 'rgba(99,102,241,0.3)' : gs.border}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <Box sx={{ mt: 0.25, flexShrink: 0 }}>
                    {getStepIcon(step.status)}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: gs.textMuted, fontFamily: 'monospace' }}>
                        #{step.step}
                      </Typography>
                      <Chip
                        size="small"
                        label={statusInfo.label}
                        sx={{
                          height: 14, fontSize: '0.55rem', py: 0,
                          bgcolor: 'transparent',
                          color: statusInfo.color,
                          border: `1px solid ${statusInfo.color}`,
                        }}
                      />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: '0.7rem',
                        color: step.status === 'completed' ? gs.textMuted : gs.textPrimary,
                        textDecoration: step.status === 'completed' ? 'line-through' : 'none',
                        lineHeight: 1.4,
                      }}
                    >
                      {step.description}
                    </Typography>
                    {step.toolName && (
                      <Typography sx={{ fontSize: '0.6rem', color: gs.textMuted, mt: 0.25 }}>
                        工具: {step.toolName}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
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
      {/* 会话目标 */}
      <Box sx={{ flexShrink: 0, borderBottom: `1px solid ${gs.border}` }}>
        <GoalIndicator sessionKey={sessionKey} variant="compact" />
      </Box>

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
        {activeTab === 'todos' && renderTodosTab()}
        {activeTab === 'context' && renderContextTab()}
        {activeTab === 'tools' && renderToolsTab()}
        {activeTab === 'files' && renderFilesTab()}
        {activeTab === 'plan' && renderPlanTab()}
      </Box>
    </Box>
  );
};

export default React.memo(ChatSidePanel);
