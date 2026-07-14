import React from 'react';
import { Box, Typography, Chip, Checkbox, IconButton, Tooltip } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import FlagIcon from '@mui/icons-material/Flag';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import ImageIcon from '@mui/icons-material/Image';
import CodeIcon from '@mui/icons-material/Code';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CancelIcon from '@mui/icons-material/Cancel';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import { getGrayScale } from '../../constants/theme';
import type { TodoItem as ApiTodoItem, TodoPriority, Artifact as ApiArtifact, ToolCall as ApiToolCall, TrajectoryEvent as ApiTrajectoryEvent } from '../../services/taskMonitorApi';

SyntaxHighlighter.registerLanguage('json', json);

const doneStatuses: ('pending' | 'in_progress' | 'done')[] = ['done'];

const priorityOrder: TodoPriority[] = ['low', 'normal', 'high', 'urgent'];

const getPriorityColor = (priority: TodoPriority): { bg: string; color: string; border: string } => {
  const map: Record<TodoPriority, { bg: string; color: string; border: string }> = {
    urgent: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    high: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    normal: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', border: 'rgba(107,114,128,0.3)' },
    low: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
  };
  return map[priority];
};

const getPriorityLabel = (priority: TodoPriority): string => {
  const map: Record<TodoPriority, string> = { urgent: '紧急', high: '高', normal: '普通', low: '低' };
  return map[priority];
};

const getDurationColor = (ms: number | null): string => {
  if (ms == null) return '#6b7280';
  if (ms < 1000) return '#22c55e';
  if (ms < 5000) return '#f59e0b';
  return '#ef4444';
};

const getToolTypeColor = (type: string): string => {
  const map: Record<string, string> = { skill: '#6366f1', mcp: '#f59e0b', system: '#8b5cf6', builtin: '#14b8a6' };
  return map[type] || '#6b7280';
};

const getToolTypeLabel = (type: string): string => {
  const map: Record<string, string> = { skill: '技能', mcp: 'MCP', system: '系统', builtin: '内置' };
  return map[type] || type;
};

const getEventTypeColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    llm_request: '#6366f1', tool_call: '#f59e0b', message: '#22c55e', error: '#ef4444',
    agent_start: '#8b5cf6', agent_end: '#14b8a6', step_start: '#ec4899', step_end: '#06b6d4',
    thought: '#f97316', observation: '#84cc16',
  };
  return colorMap[type] || '#6b7280';
};

const getEventSourceColor = (source: string): string => {
  const colorMap: Record<string, string> = { runtime: '#6366f1', transcript: '#22c55e', export: '#f59e0b' };
  return colorMap[source] || '#6b7280';
};

const getEventSourceLabel = (source: string): string => {
  const labelMap: Record<string, string> = { runtime: '运行时', transcript: '对话记录', export: '导出' };
  return labelMap[source] || source;
};

const getEventDescription = (evt: ApiTrajectoryEvent): string => {
  try {
    const data = evt.data as Record<string, unknown> | null;
    if (!data) return evt.type;
    if (evt.type === 'llm_request') {
      const model = (data.model as string) || evt.modelId || '未知模型';
      return `LLM 请求 - ${model}`;
    }
    if (evt.type === 'tool_call') {
      const toolName = (data.toolName as string) || (data.name as string) || '未知工具';
      return `工具调用 - ${toolName}`;
    }
    if (evt.type === 'message') {
      const role = (data.role as string) || 'message';
      return `消息 - ${role}`;
    }
    if (evt.type === 'error') {
      const msg = (data.message as string) || (data.error as string) || '错误';
      return `错误 - ${msg.slice(0, 30)}`;
    }
    return evt.type;
  } catch {
    return evt.type;
  }
};

const shortTraceId = (traceId: string): string => {
  if (traceId.length <= 12) return traceId;
  return `${traceId.slice(0, 6)}...${traceId.slice(-4)}`;
};

const formatTime = (ts: string): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatDateTime = (ts: string): string => new Date(ts).toLocaleString('zh-CN');

const formatJson = (value: unknown): string => {
  try {
    if (typeof value === 'string') {
      try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const getFileIconColor = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const colorMap: Record<string, string> = {
    html: '#e34f26', css: '#1572b6', js: '#f7df1e', ts: '#3178c6',
    jsx: '#61dafb', tsx: '#61dafb', json: '#cbbb0e', md: '#519aba',
    py: '#3776ab', go: '#00add8', rs: '#dea584', java: '#007396',
    png: '#a6d43f', jpg: '#ff6b6b', svg: '#ffb13b', pdf: '#e11d48',
    zip: '#f59e0b', tar: '#f59e0b', doc: '#2563eb', docx: '#2563eb',
    xls: '#16a34a', xlsx: '#16a34a', ppt: '#ea580c', pptx: '#ea580c',
    txt: '#6b7280',
  };
  return colorMap[ext] || '#6b7280';
};

const getFileIcon = (fileName: string) => {
  const ext = '.' + (fileName.split('.').pop()?.toLowerCase() || '');
  const color = getFileIconColor(fileName);
  if (['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.xls', '.ppt', '.pptx'].includes(ext)) {
    return <DescriptionIcon sx={{ fontSize: 12, color }} />;
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'].includes(ext)) {
    return <ImageIcon sx={{ fontSize: 12, color }} />;
  }
  if (['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.html', '.css', '.json', '.yaml', '.yml', '.xml'].includes(ext)) {
    return <CodeIcon sx={{ fontSize: 12, color }} />;
  }
  return <InsertDriveFileIcon sx={{ fontSize: 12, color }} />;
};

const formatDuration = (ms: number | null): string => {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const getToolStatusIcon = (status: string) => {
  switch (status) {
    case 'success': return <CheckCircleIcon sx={{ fontSize: 14, color: '#22c55e' }} />;
    case 'error': return <ErrorIcon sx={{ fontSize: 14, color: '#ef4444' }} />;
    case 'running': return <CircularProgress size={14} sx={{ color: '#f59e0b' }} />;
    case 'cancelled': return <CancelIcon sx={{ fontSize: 14, color: '#6b7280' }} />;
    default: return <AccessTimeIcon sx={{ fontSize: 14, color: '#6b7280' }} />;
  }
};

export interface TodoItemProps {
  todo: ApiTodoItem;
  selectedTodoIds: Set<string>;
  selectMode: boolean;
  draggedTodoId: string | null;
  dragOverTodoId: string | null;
  completingTodoIds: Set<string>;
  gs: ReturnType<typeof getGrayScale>;
  onToggleSelect: (id: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onCyclePriority: (id: string, priority: TodoPriority) => void;
  onPriorityMenu: (id: string, anchor: HTMLElement) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  onDragEnd: () => void;
}

export const TodoItem: React.FC<TodoItemProps> = React.memo(({
  todo,
  selectedTodoIds,
  selectMode,
  draggedTodoId,
  dragOverTodoId,
  completingTodoIds,
  gs,
  onToggleSelect,
  onToggleTodo,
  onDeleteTodo,
  onCyclePriority,
  onPriorityMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) => {
  const priorityColor = getPriorityColor(todo.priority);
  const isDragging = draggedTodoId === todo.id;
  const isDragOver = dragOverTodoId === todo.id;
  const isCompleting = completingTodoIds.has(todo.id);
  const isSelected = selectedTodoIds.has(todo.id);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onToggleTodo(todo.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      onDeleteTodo(todo.id);
    } else if (e.key === 'p' || e.key === 'P') {
      onCyclePriority(todo.id, todo.priority);
    }
  };

  return (
    <Box
      key={todo.id}
      draggable={!selectMode}
      onDragStart={(e) => onDragStart(e, todo.id)}
      onDragOver={(e) => onDragOver(e, todo.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, todo.id)}
      onDragEnd={onDragEnd}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.5,
        p: 0.5,
        borderRadius: 0.75,
        bgcolor: isSelected ? 'rgba(99,102,241,0.1)' : gs.bgHover,
        border: isDragOver
          ? `2px dashed #6366f1`
          : isSelected ? `1px solid rgba(99,102,241,0.3)` : `1px solid transparent`,
        opacity: isDragging ? 0.5 : 1,
        transform: isCompleting ? 'scale(1.02)' : 'scale(1)',
        transition: 'all 0.15s ease',
        cursor: selectMode ? 'pointer' : 'default',
        outline: 'none',
        '&:focus-within': {
          boxShadow: '0 0 0 2px rgba(99,102,241,0.3)',
        },
        '&:hover': {
          '& .todo-delete': { opacity: 1 },
          '& .todo-drag': { opacity: 1 },
          bgcolor: isSelected ? 'rgba(99,102,241,0.15)' : gs.bgActive,
        },
      }}
      onClick={() => selectMode && onToggleSelect(todo.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {selectMode ? (
        <Checkbox
          checked={isSelected}
          size="small"
          sx={{ padding: 0.25, '& .MuiSvgIcon-root': { fontSize: 16 } }}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(todo.id)}
        />
      ) : (
        <Tooltip title="拖拽排序">
          <IconButton size="small" className="todo-drag" sx={{ p: 0.125, opacity: 0.4, color: gs.textMuted, cursor: 'grab', transition: 'opacity 0.15s', '&:hover': { opacity: 1 }, '&:active': { cursor: 'grabbing' } }} onMouseDown={(e) => e.stopPropagation()}>
            <DragIndicatorIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
      )}
      <Checkbox
        checked={doneStatuses.includes(todo.status as any)}
        onChange={(e) => { e.stopPropagation(); onToggleTodo(todo.id); }}
        size="small"
        sx={{ padding: 0.25, color: doneStatuses.includes(todo.status as any) ? '#22c55e' : gs.textMuted, '& .MuiSvgIcon-root': { fontSize: 16 }, transition: 'transform 0.2s', transform: isCompleting ? 'scale(1.2)' : 'scale(1)' }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.7rem', lineHeight: 1.4, color: doneStatuses.includes(todo.status as any) ? gs.textMuted : gs.textPrimary, textDecoration: doneStatuses.includes(todo.status as any) ? 'line-through' : 'none', wordBreak: 'break-word', mt: 0.25, transition: 'all 0.2s' }}>
          {todo.text}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.25, mt: 0.25, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={getPriorityLabel(todo.priority)}
            onClick={(e) => { e.stopPropagation(); onCyclePriority(todo.id, todo.priority); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onPriorityMenu(todo.id, e.currentTarget as HTMLElement); }}
            sx={{ height: 14, fontSize: '0.5rem', py: 0, bgcolor: priorityColor.bg, color: priorityColor.color, border: `1px solid ${priorityColor.border}`, cursor: 'pointer', '&:hover': { filter: 'brightness(1.1)' } }}
          />
          {todo.source === 'auto' && (
            <Chip size="small" label="AI" sx={{ height: 14, fontSize: '0.5rem', py: 0, bgcolor: gs.bgPanel === '#1e1e2e' ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)', color: '#6366f1' }} />
          )}
        </Box>
      </Box>
      <Tooltip title="设置优先级">
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onPriorityMenu(todo.id, e.currentTarget); }} className="todo-delete" sx={{ p: 0.125, opacity: 0, color: priorityColor.color, transition: 'opacity 0.15s', '&:hover': { bgcolor: priorityColor.bg } }}>
          <FlagIcon sx={{ fontSize: 12 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="删除">
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDeleteTodo(todo.id); }} className="todo-delete" sx={{ p: 0.125, opacity: 0, color: gs.textMuted, transition: 'opacity 0.15s', '&:hover': { color: '#ef4444' } }}>
          <DeleteIcon sx={{ fontSize: 12 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.todo.id === nextProps.todo.id &&
    prevProps.todo.text === nextProps.todo.text &&
    prevProps.todo.status === nextProps.todo.status &&
    prevProps.todo.priority === nextProps.todo.priority &&
    prevProps.selectedTodoIds.has(prevProps.todo.id) === nextProps.selectedTodoIds.has(nextProps.todo.id) &&
    prevProps.selectMode === nextProps.selectMode &&
    prevProps.draggedTodoId === nextProps.draggedTodoId &&
    prevProps.dragOverTodoId === nextProps.dragOverTodoId &&
    prevProps.completingTodoIds.has(prevProps.todo.id) === nextProps.completingTodoIds.has(nextProps.todo.id)
  );
});

export interface ArtifactItemProps {
  artifact: ApiArtifact;
  selectedArtifactIds: Set<string>;
  artifactSelectMode: boolean;
  deletingArtifactIds: Set<string>;
  gs: ReturnType<typeof getGrayScale>;
  onToggleSelect: (id: string) => void;
  onPreviewArtifact: (artifact: ApiArtifact) => void;
  onCopyPath: (path: string) => void;
  onDeleteArtifact: (id: string) => void;
  downloadUrl: string;
}

export const ArtifactItem: React.FC<ArtifactItemProps> = React.memo(({
  artifact,
  selectedArtifactIds,
  artifactSelectMode,
  deletingArtifactIds,
  gs,
  onToggleSelect,
  onPreviewArtifact,
  onCopyPath,
  onDeleteArtifact,
  downloadUrl,
}) => {
  const isSelected = selectedArtifactIds.has(artifact.id);
  const isDeleting = deletingArtifactIds.has(artifact.id);
  const fileIconColor = getFileIconColor(artifact.fileName);

  return (
    <Box
      key={artifact.id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        p: 0.5,
        borderRadius: 0.75,
        bgcolor: isSelected ? 'rgba(34,197,94,0.1)' : gs.bgHover,
        border: `1px solid ${isSelected ? 'rgba(34,197,94,0.3)' : gs.border}`,
        transition: 'all 0.15s',
        opacity: isDeleting ? 0.5 : 1,
        cursor: artifactSelectMode ? 'pointer' : 'default',
        '&:hover': { borderColor: '#22c55e', '& .artifact-actions': { opacity: 1 } },
      }}
      onClick={() => artifactSelectMode && onToggleSelect(artifact.id)}
    >
      {artifactSelectMode && (
        <Checkbox checked={isSelected} size="small" sx={{ padding: 0.25, '& .MuiSvgIcon-root': { fontSize: 16 } }} onClick={(e) => e.stopPropagation()} onChange={() => onToggleSelect(artifact.id)} />
      )}
      <Box sx={{ width: 24, height: 24, borderRadius: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, bgcolor: `${fileIconColor}15` }}>
        {getFileIcon(artifact.fileName)}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.65rem', color: gs.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artifact.fileName}</Typography>
        <Typography sx={{ fontSize: '0.6rem', color: gs.textMuted }}>{formatFileSize(artifact.fileSize)}</Typography>
      </Box>
      <Box className="artifact-actions" sx={{ display: 'flex', gap: 0.25, flexShrink: 0, opacity: artifactSelectMode ? 1 : 0, transition: 'opacity 0.15s' }}>
        <Tooltip title="预览"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onPreviewArtifact(artifact); }} sx={{ p: 0.25, color: gs.textMuted, '&:hover': { color: '#22c55e' } }}><VisibilityIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
        <Tooltip title="下载"><IconButton size="small" component="a" href={downloadUrl} download onClick={(e) => e.stopPropagation()} sx={{ p: 0.25, color: gs.textMuted, '&:hover': { color: '#22c55e' } }}><DownloadIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
        <Tooltip title="复制路径"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onCopyPath(artifact.filePath); }} sx={{ p: 0.25, color: gs.textMuted, '&:hover': { color: '#22c55e' } }}><ContentCopyIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
        <Tooltip title="删除"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDeleteArtifact(artifact.id); }} sx={{ p: 0.25, color: gs.textMuted, '&:hover': { color: '#ef4444' } }}><DeleteIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.artifact.id === nextProps.artifact.id &&
    prevProps.selectedArtifactIds.has(prevProps.artifact.id) === nextProps.selectedArtifactIds.has(nextProps.artifact.id) &&
    prevProps.artifactSelectMode === nextProps.artifactSelectMode &&
    prevProps.deletingArtifactIds.has(prevProps.artifact.id) === nextProps.deletingArtifactIds.has(nextProps.artifact.id)
  );
});

export interface ToolCallItemProps {
  toolCall: ApiToolCall;
  maxDuration: number;
  gs: ReturnType<typeof getGrayScale>;
  onClick: () => void;
}

export const ToolCallItem: React.FC<ToolCallItemProps> = React.memo(({ toolCall, maxDuration, gs, onClick }) => {
  const durationPercent = maxDuration > 0 && toolCall.durationMs != null
    ? Math.min((toolCall.durationMs / maxDuration) * 100, 100) : 0;
  const durationColor = getDurationColor(toolCall.durationMs);
  const typeColor = getToolTypeColor(toolCall.toolType);

  return (
    <Box key={toolCall.id} onClick={onClick} sx={{ display: 'flex', flexDirection: 'column', gap: 0.375, p: 0.625, borderRadius: 0.75, bgcolor: gs.bgHover, border: `1px solid ${gs.border}`, cursor: 'pointer', transition: 'all 0.15s ease', '&:hover': { borderColor: typeColor, bgcolor: gs.bgActive } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ width: 20, height: 20, borderRadius: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, bgcolor: `${typeColor}20` }}>
          <CodeIcon sx={{ fontSize: 11, color: typeColor }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 500, color: gs.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toolCall.toolName}</Typography>
        </Box>
        {getToolStatusIcon(toolCall.status)}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Chip size="small" label={getToolTypeLabel(toolCall.toolType)} sx={{ height: 14, fontSize: '0.5rem', py: 0, bgcolor: `${typeColor}15`, color: typeColor, border: `1px solid ${typeColor}30` }} />
        <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: gs.bgPanel, overflow: 'hidden', position: 'relative' }}>
          <Box sx={{ height: '100%', width: `${durationPercent}%`, bgcolor: durationColor, transition: 'width 0.3s ease' }} />
        </Box>
        <Typography sx={{ fontSize: '0.55rem', color: durationColor, fontWeight: 500, flexShrink: 0, minWidth: 36, textAlign: 'right' }}>{formatDuration(toolCall.durationMs)}</Typography>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.toolCall.id === nextProps.toolCall.id &&
    prevProps.toolCall.status === nextProps.toolCall.status &&
    prevProps.toolCall.durationMs === nextProps.toolCall.durationMs &&
    prevProps.maxDuration === nextProps.maxDuration
  );
});

export interface TrajectoryEventItemProps {
  event: ApiTrajectoryEvent;
  isExpanded: boolean;
  gs: ReturnType<typeof getGrayScale>;
  isDark: boolean;
  onToggleExpand: (eventId: string) => void;
  onCopy: (text: string, field: string) => void;
  copiedField: string | null;
}

export const TrajectoryEventItem: React.FC<TrajectoryEventItemProps> = React.memo(({
  event,
  isExpanded,
  gs,
  isDark,
  onToggleExpand,
  onCopy,
  copiedField,
}) => {
  const typeColor = getEventTypeColor(event.type);
  const sourceColor = getEventSourceColor(event.source);
  const syntaxHighlighterStyle = isDark ? oneDark : oneLight;

  return (
    <Box key={event.id} sx={{ display: 'flex', gap: 0.75 }}>
      <Box sx={{ width: 52, flexShrink: 0, pt: 0.25, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.125 }}>
        <Typography sx={{ fontSize: '0.55rem', color: gs.textMuted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatTime(event.ts)}</Typography>
        <Typography sx={{ fontSize: '0.45rem', color: gs.textDisabled, fontFamily: 'monospace' }}>#{event.seq}</Typography>
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1, pt: 0.375 }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: gs.bgPanel, border: `2px solid ${typeColor}`, flexShrink: 0 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box onClick={() => onToggleExpand(event.id)} sx={{ p: 0.5, bgcolor: isExpanded ? `${typeColor}10` : gs.bgHover, border: `1px solid ${isExpanded ? `${typeColor}30` : gs.border}`, borderRadius: 0.5, cursor: 'pointer', transition: 'all 0.15s ease', '&:hover': { bgcolor: isExpanded ? `${typeColor}15` : gs.bgActive, borderColor: `${typeColor}40` } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: typeColor, flexShrink: 0 }}>{event.type}</Typography>
            <Chip size="small" label={getEventSourceLabel(event.source)} sx={{ height: 14, fontSize: '0.45rem', py: 0, bgcolor: `${sourceColor}15`, color: sourceColor, border: `1px solid ${sourceColor}30` }} />
            <ExpandMoreIcon sx={{ fontSize: 12, color: gs.textMuted, ml: 'auto', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </Box>
          <Typography sx={{ fontSize: '0.6rem', color: gs.textPrimary, mt: 0.25, lineHeight: 1.3 }}>{getEventDescription(event)}</Typography>
        </Box>
        {isExpanded && (
          <Box sx={{ mt: 0.25, p: 0.75, bgcolor: gs.bgPanel, border: `1px solid ${gs.border}`, borderRadius: 0.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ minWidth: 80 }}>
                  <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted, mb: 0.125 }}>事件 ID</Typography>
                  <Typography sx={{ fontSize: '0.55rem', color: gs.textPrimary, fontFamily: 'monospace', wordBreak: 'break-all' }}>{shortTraceId(event.id)}</Typography>
                </Box>
                <Box sx={{ minWidth: 80 }}>
                  <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted, mb: 0.125 }}>Trace ID</Typography>
                  <Typography sx={{ fontSize: '0.55rem', color: gs.textPrimary, fontFamily: 'monospace', wordBreak: 'break-all' }}>{shortTraceId(event.traceId)}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ minWidth: 60 }}>
                  <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted, mb: 0.125 }}>类型</Typography>
                  <Chip size="small" label={event.type} sx={{ height: 16, fontSize: '0.5rem', bgcolor: `${typeColor}15`, color: typeColor, border: `1px solid ${typeColor}30` }} />
                </Box>
                <Box sx={{ minWidth: 60 }}>
                  <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted, mb: 0.125 }}>来源</Typography>
                  <Chip size="small" label={getEventSourceLabel(event.source)} sx={{ height: 16, fontSize: '0.5rem', bgcolor: `${sourceColor}15`, color: sourceColor, border: `1px solid ${sourceColor}30` }} />
                </Box>
                <Box sx={{ minWidth: 60 }}>
                  <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted, mb: 0.125 }}>序列号</Typography>
                  <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: gs.textPrimary }}>#{event.seq}</Typography>
                </Box>
              </Box>
              {(event.provider || event.modelId) && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {event.provider && (<Box sx={{ minWidth: 60 }}><Typography sx={{ fontSize: '0.5rem', color: gs.textMuted, mb: 0.125 }}>Provider</Typography><Typography sx={{ fontSize: '0.6rem', color: gs.textPrimary }}>{event.provider}</Typography></Box>)}
                  {event.modelId && (<Box sx={{ minWidth: 60 }}><Typography sx={{ fontSize: '0.5rem', color: gs.textMuted, mb: 0.125 }}>Model</Typography><Typography sx={{ fontSize: '0.6rem', color: gs.textPrimary }}>{event.modelId}</Typography></Box>)}
                </Box>
              )}
              <Box>
                <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted, mb: 0.125 }}>时间戳</Typography>
                <Typography sx={{ fontSize: '0.6rem', color: gs.textPrimary, fontFamily: 'monospace' }}>{formatDateTime(event.ts)}</Typography>
              </Box>
              {event.data && (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: gs.textPrimary, flex: 1 }}>数据 (data)</Typography>
                    <Tooltip title={copiedField === `data-${event.id}` ? '已复制' : '复制数据'}>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); onCopy(formatJson(event.data), `data-${event.id}`); }} sx={{ p: 0.125, color: gs.textMuted, '&:hover': { color: '#8b5cf6' } }}>
                        <ContentCopyIcon sx={{ fontSize: 11 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box sx={{ borderRadius: 0.5, overflow: 'auto', border: `1px solid ${gs.border}`, maxHeight: 200, '& pre': { margin: 0, padding: '8px 10px !important', fontSize: '0.6rem !important', lineHeight: 1.4, background: 'transparent !important' } }}>
                    <SyntaxHighlighter language="json" style={syntaxHighlighterStyle} customStyle={{ margin: 0, padding: '8px 10px', fontSize: '0.6rem' }}>{formatJson(event.data)}</SyntaxHighlighter>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.event.id === nextProps.event.id &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.copiedField === nextProps.copiedField
  );
});