import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { debounce } from 'lodash-es';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
} from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import BuildIcon from '@mui/icons-material/Build';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimelineIcon from '@mui/icons-material/Timeline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SearchIcon from '@mui/icons-material/Search';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import FlagIcon from '@mui/icons-material/Flag';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';

SyntaxHighlighter.registerLanguage('json', json);
import { getGrayScale } from '../../constants/theme';
import type { Message, GeneratedFile } from '../../types/chat';
import { extractTodos } from '../../utils/extractTodos';
import {
  getTodosBySession,
  createTodo,
  createTodosBatch,
  updateTodo,
  deleteTodo,
  deleteTodosBatch,
  previewArtifact,
  getArtifactDownloadUrl,
  getToolCallsBySession,
  getTrajectoryBySession,
  getSessionTraces,
  getTrajectoryExportUrl,
  getArtifactsBySession,
  deleteArtifact,
  deleteArtifactsBatch,
  subscribeToTaskMonitor,
  type TodoItem as ApiTodoItem,
  type TodoPriority,
  type Artifact as ApiArtifact,
  type ToolCall as ApiToolCall,
  type TrajectoryEvent as ApiTrajectoryEvent,
  type PreviewResult,
} from '../../services/taskMonitorApi';
import { VirtualList } from './VirtualList';
import { LazyImage } from './LazyImage';
import {
  TodoItem,
  ArtifactItem,
  ToolCallItem,
  TrajectoryEventItem,
} from './TaskMonitorItems';

export interface TaskMonitorPanelProps {
  sessionKey: string;
  messages: Message[];
}

type TodoStatus = 'pending' | 'in_progress' | 'done';

const INITIAL_EVENT_LIMIT = 50;
const PAGE_SIZE = 30;

const priorityOrder: TodoPriority[] = ['low', 'normal', 'high', 'urgent'];
const doneStatuses: TodoStatus[] = ['done'];

export const TaskMonitorPanel: React.FC<TaskMonitorPanelProps> = ({
  sessionKey,
  messages,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [todos, setTodos] = useState<ApiTodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [todosLoading, setTodosLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['todos']));
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'done' | 'high_priority'>('all');
  const [filterPriority, setFilterPriority] = useState<TodoPriority | 'all'>('all');
  const [filterTimeRange, setFilterTimeRange] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<string>>(new Set());
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
  const [priorityMenuTodoId, setPriorityMenuTodoId] = useState<string | null>(null);
  const [priorityMenuAnchor, setPriorityMenuAnchor] = useState<HTMLElement | null>(null);
  const [batchPriorityMenuAnchor, setBatchPriorityMenuAnchor] = useState<HTMLElement | null>(null);
  const [completingTodoIds, setCompletingTodoIds] = useState<Set<string>>(new Set());

  const [previewDialog, setPreviewDialog] = useState<{
    open: boolean;
    artifactId: string | null;
    loading: boolean;
    result: PreviewResult | null;
    error: string | null;
  }>({ open: false, artifactId: null, loading: false, result: null, error: null });
  const [toolCallDetail, setToolCallDetail] = useState<ApiToolCall | null>(null);
  const [toolCallsLoading, setToolCallsLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<ApiToolCall[]>([]);
  const [toolSearchQuery, setToolSearchQuery] = useState('');
  const [debouncedToolSearchQuery, setDebouncedToolSearchQuery] = useState('');
  const [toolFilterStatus, setToolFilterStatus] = useState<'all' | 'success' | 'error' | 'running' | 'cancelled' | 'skill' | 'mcp' | 'system' | 'builtin'>('all');
  const [toolViewMode, setToolViewMode] = useState<'list' | 'grouped'>('list');
  const [toolPage, setToolPage] = useState(1);
  const [hasMoreToolCalls, setHasMoreToolCalls] = useState(true);
  const [loadingMoreToolCalls, setLoadingMoreToolCalls] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [trajectoryLoading, setTrajectoryLoading] = useState(false);
  const [trajectoryEvents, setTrajectoryEvents] = useState<ApiTrajectoryEvent[]>([]);
  const [displayedEventCount, setDisplayedEventCount] = useState(INITIAL_EVENT_LIMIT);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);

  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<ApiArtifact[]>([]);
  const [artifactSearchQuery, setArtifactSearchQuery] = useState('');
  const [debouncedArtifactSearchQuery, setDebouncedArtifactSearchQuery] = useState('');
  const [artifactFilterType, setArtifactFilterType] = useState<'all' | 'document' | 'image' | 'code' | 'other'>('all');
  const [artifactViewMode, setArtifactViewMode] = useState<'list' | 'grouped'>('list');
  const [artifactSelectMode, setArtifactSelectMode] = useState(false);
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(new Set());
  const [deletingArtifactIds, setDeletingArtifactIds] = useState<Set<string>>(new Set());
  const [previewImageZoom, setPreviewImageZoom] = useState(1);
  const [previewImageRotation, setPreviewImageRotation] = useState(0);
  const [previewArtifactData, setPreviewArtifactData] = useState<ApiArtifact | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);

  const [traces, setTraces] = useState<Array<{ traceId: string; eventCount: number; firstTs: string; lastTs: string }>>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [traceSelectorAnchor, setTraceSelectorAnchor] = useState<HTMLElement | null>(null);
  const [trajectorySearchQuery, setTrajectorySearchQuery] = useState('');
  const [debouncedTrajectorySearchQuery, setDebouncedTrajectorySearchQuery] = useState('');
  const [trajectoryFilterSource, setTrajectoryFilterSource] = useState<'all' | 'runtime' | 'transcript' | 'export'>('all');
  const [trajectoryFilterType, setTrajectoryFilterType] = useState<string>('all');
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [trajectoryCopiedField, setTrajectoryCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const debounceFn = debounce((value: string) => {
      setDebouncedSearchQuery(value);
    }, 300);
    debounceFn(searchQuery);
    return () => debounceFn.cancel();
  }, [searchQuery]);

  useEffect(() => {
    const debounceFn = debounce((value: string) => {
      setDebouncedToolSearchQuery(value);
    }, 300);
    debounceFn(toolSearchQuery);
    return () => debounceFn.cancel();
  }, [toolSearchQuery]);

  useEffect(() => {
    const debounceFn = debounce((value: string) => {
      setDebouncedArtifactSearchQuery(value);
    }, 300);
    debounceFn(artifactSearchQuery);
    return () => debounceFn.cancel();
  }, [artifactSearchQuery]);

  useEffect(() => {
    const debounceFn = debounce((value: string) => {
      setDebouncedTrajectorySearchQuery(value);
    }, 300);
    debounceFn(trajectorySearchQuery);
    return () => debounceFn.cancel();
  }, [trajectorySearchQuery]);

  const loadTodos = useCallback(async () => {
    setTodosLoading(true);
    try {
      const res = await getTodosBySession(sessionKey);
      setTodos(res.data || []);
    } catch (e) {
      console.warn('[TaskMonitor] 加载待办失败:', e);
    } finally {
      setTodosLoading(false);
    }
  }, [sessionKey]);

  const loadToolCalls = useCallback(async (page = 1, append = false) => {
    if (page > 1) setLoadingMoreToolCalls(true);
    else setToolCallsLoading(true);
    try {
      const res = await getToolCallsBySession(sessionKey);
      const allData = res.data || [];
      if (append) {
        setToolCalls(prev => [...prev, ...allData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)]);
      } else {
        setToolCalls(allData.slice(0, PAGE_SIZE));
      }
      setHasMoreToolCalls(allData.length > page * PAGE_SIZE);
      setToolPage(page);
    } catch (e) {
      console.warn('[TaskMonitor] 加载工具调用失败:', e);
    } finally {
      setToolCallsLoading(false);
      setLoadingMoreToolCalls(false);
    }
  }, [sessionKey]);

  const loadTrajectory = useCallback(async () => {
    setTrajectoryLoading(true);
    try {
      const res = await getTrajectoryBySession(sessionKey);
      const allEvents = res.data || [];
      setTrajectoryEvents(allEvents);
      setDisplayedEventCount(Math.min(INITIAL_EVENT_LIMIT, allEvents.length));
      if (allEvents.length > 0 && !selectedTraceId) {
        setSelectedTraceId(allEvents[0].traceId);
      }
    } catch (e) {
      console.warn('[TaskMonitor] 加载轨迹失败:', e);
    } finally {
      setTrajectoryLoading(false);
    }
  }, [sessionKey, selectedTraceId]);

  const handleLoadMoreEvents = useCallback(() => {
    setDisplayedEventCount(prev => prev + INITIAL_EVENT_LIMIT);
  }, []);

  const loadTraces = useCallback(async () => {
    setTracesLoading(true);
    try {
      const res = await getSessionTraces(sessionKey);
      setTraces(res.data || []);
      if (res.data && res.data.length > 0 && !selectedTraceId) {
        setSelectedTraceId(res.data[0].traceId);
      }
    } catch (e) {
      console.warn('[TaskMonitor] 加载 traces 失败:', e);
    } finally {
      setTracesLoading(false);
    }
  }, [sessionKey, selectedTraceId]);

  const loadArtifacts = useCallback(async () => {
    setArtifactsLoading(true);
    try {
      const res = await getArtifactsBySession(sessionKey);
      setArtifacts(res.data || []);
    } catch (e) {
      console.warn('[TaskMonitor] 加载产物失败:', e);
    } finally {
      setArtifactsLoading(false);
    }
  }, [sessionKey]);

  useEffect(() => {
    loadTodos();
    loadToolCalls(1, false);
    loadTrajectory();
    loadTraces();
    loadArtifacts();
  }, [loadTodos, loadToolCalls, loadTrajectory, loadTraces, loadArtifacts]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && !lastMsg.isStreaming && lastMsg.content) {
      const extracted = extractTodos(lastMsg.content);
      if (extracted.length > 0) {
        (async () => {
          try {
            const existingTexts = new Set(todos.map(t => t.text.trim()));
            const newTodos = extracted.filter(t => !existingTexts.has(t.text.trim()));
            if (newTodos.length > 0) {
              const res = await createTodosBatch(
                sessionKey,
                newTodos.map(t => ({
                  text: t.text,
                  source: 'auto',
                  priority: 'normal',
                }))
              );
              if (res.data?.length) {
                setTodos(prev => [...res.data, ...prev]);
              }
            }
          } catch (e) {
            console.warn('[TaskMonitor] 自动提取待办失败:', e);
          }
        })();
      }
    }
  }, [messages, sessionKey, todos]);

  useEffect(() => {
    const unsubscribe = subscribeToTaskMonitor(sessionKey, {
      onTodoCreated: (todo) => {
        setTodos(prev => {
          const exists = prev.some(t => t.id === todo.id);
          if (exists) return prev;
          return [todo, ...prev];
        });
      },
      onTodoUpdated: (todo) => {
        setTodos(prev => prev.map(t => t.id === todo.id ? todo : t));
      },
      onTodoDeleted: (id) => {
        setTodos(prev => prev.filter(t => t.id !== id));
        setSelectedTodoIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
      onArtifactCreated: (artifact) => {
        setArtifacts(prev => {
          const exists = prev.some(a => a.id === artifact.id);
          if (exists) return prev;
          return [artifact, ...prev];
        });
      },
      onArtifactDeleted: (id) => {
        setArtifacts(prev => prev.filter(a => a.id !== id));
        setSelectedArtifactIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
      onToolCallCreated: (toolCall) => {
        setToolCalls(prev => {
          const exists = prev.some(t => t.id === toolCall.id);
          if (exists) return prev;
          return [toolCall, ...prev];
        });
      },
      onToolCallUpdated: (toolCall) => {
        setToolCalls(prev => prev.map(t => t.id === toolCall.id ? toolCall : t));
      },
      onTrajectoryEventCreated: (event) => {
        setTrajectoryEvents(prev => {
          const exists = prev.some(e => e.id === event.id);
          if (exists) return prev;
          return [...prev, event];
        });
        if (!selectedTraceId && event.traceId) {
          setSelectedTraceId(event.traceId);
        }
      },
    });

    return () => {
      unsubscribe();
    };
  }, [sessionKey, selectedTraceId]);

  const handleAddTodo = useCallback(async () => {
    const text = newTodoText.trim();
    if (!text) return;
    try {
      const res = await createTodo({
        sessionId: sessionKey,
        text,
        source: 'manual',
        status: 'pending',
        priority: 'normal',
      });
      if (res.data) {
        setTodos(prev => [res.data, ...prev]);
        setNewTodoText('');
      }
    } catch (e) {
      console.warn('[TaskMonitor] 添加待办失败:', e);
    }
  }, [newTodoText, sessionKey]);

  const handleDeleteTodo = useCallback(async (id: string) => {
    try {
      await deleteTodo(id);
      setTodos(prev => prev.filter(t => t.id !== id));
      setSelectedTodoIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.warn('[TaskMonitor] 删除待办失败:', e);
    }
  }, []);

  const handlePriorityChange = useCallback(async (id: string, priority: TodoPriority) => {
    try {
      const res = await updateTodo(id, { priority });
      if (res.data) {
        setTodos(prev => prev.map(t => (t.id === id ? res.data : t)));
      }
    } catch (e) {
      console.warn('[TaskMonitor] 更新优先级失败:', e);
    }
  }, []);

  const handleCyclePriority = useCallback((id: string, currentPriority: TodoPriority) => {
    const currentIndex = priorityOrder.indexOf(currentPriority);
    const nextIndex = (currentIndex + 1) % priorityOrder.length;
    const nextPriority = priorityOrder[nextIndex];
    handlePriorityChange(id, nextPriority);
  }, [handlePriorityChange]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedTodoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
  }, []);

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedTodoIds);
    if (ids.length === 0) return;
    try {
      await deleteTodosBatch(ids);
      setTodos(prev => prev.filter(t => !selectedTodoIds.has(t.id)));
      setSelectedTodoIds(new Set());
    } catch (e) {
      console.warn('[TaskMonitor] 批量删除失败:', e);
    }
  }, [selectedTodoIds]);

  const handleBatchToggleStatus = useCallback(async () => {
    const ids = Array.from(selectedTodoIds);
    if (ids.length === 0) return;
    try {
      const updatedTodos = await Promise.all(
        ids.map(async (id) => {
          const todo = todos.find(t => t.id === id);
          if (!todo) return null;
          const newStatus: TodoStatus = doneStatuses.includes(todo.status) ? 'pending' : 'done';
          const res = await updateTodo(id, { status: newStatus });
          return res.data;
        })
      );
      setTodos(prev => prev.map(t => {
        const updated = updatedTodos.find(u => u?.id === t.id);
        return updated || t;
      }));
    } catch (e) {
      console.warn('[TaskMonitor] 批量更新状态失败:', e);
    }
  }, [selectedTodoIds, todos]);

  const handleBatchSetPriority = useCallback(async (priority: TodoPriority) => {
    const ids = Array.from(selectedTodoIds);
    if (ids.length === 0) return;
    try {
      const updatedTodos = await Promise.all(
        ids.map(async (id) => {
          const res = await updateTodo(id, { priority });
          return res.data;
        })
      );
      setTodos(prev => prev.map(t => {
        const updated = updatedTodos.find(u => u?.id === t.id);
        return updated || t;
      }));
    } catch (e) {
      console.warn('[TaskMonitor] 批量设置优先级失败:', e);
    }
    setBatchPriorityMenuAnchor(null);
  }, [selectedTodoIds]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedTodoId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTodoId !== id) {
      setDragOverTodoId(id);
    }
  }, [dragOverTodoId]);

  const handleDragLeave = useCallback(() => {
    setDragOverTodoId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = draggedTodoId;
    setDraggedTodoId(null);
    setDragOverTodoId(null);
    if (!draggedId || draggedId === targetId) return;

    const sortedTodos = [...todos].sort((a, b) => a.orderIndex - b.orderIndex);
    const draggedIndex = sortedTodos.findIndex(t => t.id === draggedId);
    const targetIndex = sortedTodos.findIndex(t => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTodos = [...sortedTodos];
    const [removed] = newTodos.splice(draggedIndex, 1);
    newTodos.splice(targetIndex, 0, removed);

    const updatedTodos = newTodos.map((todo, index) => ({
      ...todo,
      orderIndex: index,
    }));

    setTodos(updatedTodos);

    try {
      await updateTodo(draggedId, { orderIndex: targetIndex });
    } catch (e) {
      console.warn('[TaskMonitor] 更新排序失败:', e);
      setTodos(sortedTodos);
    }
  }, [draggedTodoId, todos]);

  const handleDragEnd = useCallback(() => {
    setDraggedTodoId(null);
    setDragOverTodoId(null);
  }, []);

  const handleBatchDeleteTodos = useCallback(async () => {
    if (selectedTodoIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedTodoIds).map(id => deleteTodo(id))
      );
      setTodos(prev => prev.filter(t => !selectedTodoIds.has(t.id)));
      setSelectedTodoIds(new Set());
      setSelectMode(false);
    } catch (e) {
      console.warn('[TaskMonitor] 批量删除失败:', e);
    }
  }, [selectedTodoIds]);

  const handleBatchUpdatePriority = useCallback(async (priority: TodoPriority) => {
    if (selectedTodoIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedTodoIds).map(id => updateTodo(id, { priority }))
      );
      setTodos(prev => prev.map(t => selectedTodoIds.has(t.id) ? { ...t, priority } : t));
      setSelectedTodoIds(new Set());
      setSelectMode(false);
    } catch (e) {
      console.warn('[TaskMonitor] 批量更新优先级失败:', e);
    }
  }, [selectedTodoIds]);

  const handleBatchMarkDone = useCallback(async () => {
    if (selectedTodoIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedTodoIds).map(id => updateTodo(id, { status: 'done' }))
      );
      setTodos(prev => prev.map(t => selectedTodoIds.has(t.id) ? { ...t, status: 'done' } : t));
      setSelectedTodoIds(new Set());
      setSelectMode(false);
    } catch (e) {
      console.warn('[TaskMonitor] 批量完成失败:', e);
    }
  }, [selectedTodoIds]);

  const handlePreviewArtifact = useCallback(async (artifact: ApiArtifact) => {
    setPreviewArtifactData(artifact);
    setPreviewImageZoom(1);
    setPreviewImageRotation(0);
    setPreviewDialog({ open: true, artifactId: artifact.id, loading: true, result: null, error: null });
    try {
      const res = await previewArtifact(artifact.id);
      if (res.data) {
        setPreviewDialog(prev => ({ ...prev, loading: false, result: res.data }));
      } else {
        setPreviewDialog(prev => ({ ...prev, loading: false, error: '无法预览该文件' }));
      }
    } catch (e: any) {
      setPreviewDialog(prev => ({ ...prev, loading: false, error: e.message || '预览失败' }));
    }
  }, []);

  const handleToggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const filteredTodos = useMemo(() => {
    let result = [...todos];
    
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(t => t.text.toLowerCase().includes(query));
    }

    switch (filterStatus) {
      case 'pending':
        result = result.filter(t => t.status === 'pending');
        break;
      case 'in_progress':
        result = result.filter(t => t.status === 'in_progress');
        break;
      case 'done':
        result = result.filter(t => doneStatuses.includes(t.status));
        break;
      case 'high_priority':
        result = result.filter(t => t.priority === 'high' || t.priority === 'urgent');
        break;
    }

    if (filterPriority !== 'all') {
      result = result.filter(t => t.priority === filterPriority);
    }

    if (filterTimeRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      switch (filterTimeRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0);
      }
      result = result.filter(t => {
        const createdAt = new Date(t.createdAt || 0);
        return createdAt >= startDate;
      });
    }

    result.sort((a, b) => a.orderIndex - b.orderIndex);
    return result;
  }, [todos, debouncedSearchQuery, filterStatus, filterPriority, filterTimeRange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        handleToggleSection('todos');
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        if (expandedSections.has('todos')) {
          setSelectedTodoIds(new Set(filteredTodos.map(t => t.id)));
          setSelectMode(true);
        }
      } else if (e.key === 'a' || e.key === 'A') {
        handleToggleSection('artifacts');
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleSection('toolCalls');
      } else if (e.key === 'r' || e.key === 'R') {
        handleToggleSection('trajectory');
      } else if (e.key === 'Escape') {
        setSelectMode(false);
        setSelectedTodoIds(new Set());
        setArtifactSelectMode(false);
        setSelectedArtifactIds(new Set());
        setToolCallDetail(null);
        setPreviewDialog(prev => ({ ...prev, open: false }));
      } else if (e.key === 's' || e.key === 'S') {
        setSelectMode(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredTodos, expandedSections]);

  const filteredArtifacts = useMemo(() => {
    let result = [...artifacts];
    
    if (debouncedArtifactSearchQuery) {
      const query = debouncedArtifactSearchQuery.toLowerCase();
      result = result.filter(a => 
        a.fileName.toLowerCase().includes(query) || 
        a.filePath.toLowerCase().includes(query)
      );
    }

    if (artifactFilterType !== 'all') {
      const documentExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.xls', '.ppt', '.pptx'];
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
      const codeExtensions = ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.html', '.css', '.json', '.yaml', '.yml', '.xml'];
      
      result = result.filter(a => {
        const fileExt = '.' + (a.fileName.split('.').pop()?.toLowerCase() || '');
        switch (artifactFilterType) {
          case 'document':
            return documentExtensions.includes(fileExt);
          case 'image':
            return imageExtensions.includes(fileExt);
          case 'code':
            return codeExtensions.includes(fileExt);
          default:
            return !documentExtensions.includes(fileExt) && !imageExtensions.includes(fileExt) && !codeExtensions.includes(fileExt);
        }
      });
    }

    return result;
  }, [artifacts, debouncedArtifactSearchQuery, artifactFilterType]);

  const filteredToolCalls = useMemo(() => {
    let result = [...toolCalls];
    
    if (debouncedToolSearchQuery) {
      const query = debouncedToolSearchQuery.toLowerCase();
      result = result.filter(t => t.toolName.toLowerCase().includes(query));
    }

    if (toolFilterStatus !== 'all') {
      result = result.filter(t => t.status === toolFilterStatus || t.toolType === toolFilterStatus);
    }

    return result;
  }, [toolCalls, debouncedToolSearchQuery, toolFilterStatus]);

  const filteredTrajectoryEvents = useMemo(() => {
    let result = [...trajectoryEvents];
    
    if (selectedTraceId) {
      result = result.filter(e => e.traceId === selectedTraceId);
    }

    if (debouncedTrajectorySearchQuery) {
      const query = debouncedTrajectorySearchQuery.toLowerCase();
      result = result.filter(e => 
        e.type.toLowerCase().includes(query) ||
        JSON.stringify(e.data).toLowerCase().includes(query)
      );
    }

    if (trajectoryFilterSource !== 'all') {
      result = result.filter(e => e.source === trajectoryFilterSource);
    }

    if (trajectoryFilterType !== 'all') {
      result = result.filter(e => e.type === trajectoryFilterType);
    }

    result.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    
    return result.slice(0, displayedEventCount);
  }, [trajectoryEvents, selectedTraceId, debouncedTrajectorySearchQuery, trajectoryFilterSource, trajectoryFilterType, displayedEventCount]);

  const toolCallMaxDuration = useMemo(() => {
    return Math.max(...toolCalls.map(t => t.durationMs || 0), 1);
  }, [toolCalls]);

  const groupedToolCalls = useMemo(() => {
    const groups = new Map<string, ApiToolCall[]>();
    for (const call of filteredToolCalls) {
      const key = call.toolType;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(call);
    }
    return Array.from(groups.entries());
  }, [filteredToolCalls]);

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

  const todoStats = useMemo(() => {
    const pending = todos.filter(t => t.status === 'pending').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const done = todos.filter(t => doneStatuses.includes(t.status)).length;
    const highPriority = todos.filter(t => t.priority === 'high' || t.priority === 'urgent').length;
    const completionRate = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;
    return { pending, inProgress, done, highPriority, completionRate };
  }, [todos]);

  const artifactStats = useMemo(() => {
    const totalSize = artifacts.reduce((sum, a) => sum + (a.fileSize || 0), 0);
    const documents = artifacts.filter(a => {
      const ext = '.' + (a.fileName.split('.').pop()?.toLowerCase() || '');
      return ['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.xls', '.ppt', '.pptx'].includes(ext);
    }).length;
    const images = artifacts.filter(a => {
      const ext = '.' + (a.fileName.split('.').pop()?.toLowerCase() || '');
      return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'].includes(ext);
    }).length;
    const code = artifacts.filter(a => {
      const ext = '.' + (a.fileName.split('.').pop()?.toLowerCase() || '');
      return ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.html', '.css', '.json', '.yaml', '.yml', '.xml'].includes(ext);
    }).length;
    return { totalSize, documents, images, code, other: artifacts.length - documents - images - code };
  }, [artifacts]);

  const toolCallStats = useMemo(() => {
    const success = toolCalls.filter(t => t.status === 'success').length;
    const error = toolCalls.filter(t => t.status === 'error').length;
    const running = toolCalls.filter(t => t.status === 'running').length;
    const cancelled = toolCalls.filter(t => t.status === 'cancelled').length;
    const avgDuration = toolCalls.filter(t => t.durationMs != null).length > 0
      ? Math.round(toolCalls.filter(t => t.durationMs != null).reduce((sum, t) => sum + (t.durationMs || 0), 0) / toolCalls.filter(t => t.durationMs != null).length)
      : 0;
    return { success, error, running, cancelled, avgDuration };
  }, [toolCalls]);

  const handleMarkAllDone = useCallback(async () => {
    const pendingTodos = todos.filter(t => t.status === 'pending' || t.status === 'in_progress');
    if (pendingTodos.length === 0) return;
    try {
      const updatedTodos = await Promise.all(
        pendingTodos.map(async (t) => {
          const res = await updateTodo(t.id, { status: 'done' });
          return res.data;
        })
      );
      setTodos(prev => prev.map(t => {
        const updated = updatedTodos.find(u => u?.id === t.id);
        return updated || t;
      }));
    } catch (e) {
      console.warn('[TaskMonitor] 一键完成失败:', e);
    }
  }, [todos]);

  const handleExportTodos = useCallback(async () => {
    try {
      const response = await fetch(`/api/task-monitor/todos/session/${sessionKey}/export`);
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todos-${sessionKey.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[TaskMonitor] 导出待办失败:', e);
    }
  }, [sessionKey]);

  const handleExportArtifacts = useCallback(async () => {
    try {
      const response = await fetch(`/api/task-monitor/artifacts/session/${sessionKey}/export`);
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `artifacts-${sessionKey.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[TaskMonitor] 导出产物失败:', e);
    }
  }, [sessionKey]);

  const handleExportToolCalls = useCallback(async () => {
    try {
      const response = await fetch(`/api/task-monitor/tool-calls/session/${sessionKey}/export`);
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tool-calls-${sessionKey.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[TaskMonitor] 导出工具调用失败:', e);
    }
  }, [sessionKey]);

  const handleExportTrajectory = useCallback(async () => {
    try {
      const response = await fetch(`/api/task-monitor/trajectory/session/${sessionKey}/export`);
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trajectory-${sessionKey.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[TaskMonitor] 导出轨迹失败:', e);
    }
  }, [sessionKey]);

  return (
    <Box sx={{ width: 280, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 2, borderBottom: `1px solid ${gs.border}`, flexShrink: 0 }}>
        <Typography variant="h6" sx={{ fontSize: '0.875rem', color: gs.textPrimary }}>Task Monitor</Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75, mb: 1.5 }}>
          <Box sx={{ p: 1, borderRadius: 0.75, bgcolor: 'rgba(99,102,241,0.08)', border: `1px solid rgba(99,102,241,0.15)` }}>
            <Typography sx={{ fontSize: '0.55rem', color: '#6366f1', mb: 0.25 }}>待办</Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#6366f1' }}>{todoStats.pending}</Typography>
          </Box>
          <Box sx={{ p: 1, borderRadius: 0.75, bgcolor: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.15)` }}>
            <Typography sx={{ fontSize: '0.55rem', color: '#22c55e', mb: 0.25 }}>完成率</Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#22c55e' }}>{todoStats.completionRate}%</Typography>
          </Box>
          <Box sx={{ p: 1, borderRadius: 0.75, bgcolor: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.15)` }}>
            <Typography sx={{ fontSize: '0.55rem', color: '#f59e0b', mb: 0.25 }}>工具调用</Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>{toolCalls.length}</Typography>
          </Box>
          <Box sx={{ p: 1, borderRadius: 0.75, bgcolor: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.15)` }}>
            <Typography sx={{ fontSize: '0.55rem', color: '#22c55e', mb: 0.25 }}>产物</Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#22c55e' }}>{artifacts.length}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
          <Tooltip title="导出待办">
            <IconButton size="small" onClick={handleExportTodos} sx={{ p: 0.5, color: '#6366f1' }}>
              <DownloadIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="导出产物">
            <IconButton size="small" onClick={handleExportArtifacts} sx={{ p: 0.5, color: '#22c55e' }}>
              <DownloadIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="导出工具调用">
            <IconButton size="small" onClick={handleExportToolCalls} sx={{ p: 0.5, color: '#f59e0b' }}>
              <DownloadIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="导出轨迹">
            <IconButton size="small" onClick={handleExportTrajectory} sx={{ p: 0.5, color: '#8b5cf6' }}>
              <DownloadIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="一键完成">
            <IconButton size="small" onClick={handleMarkAllDone} sx={{ p: 0.5, color: '#22c55e', ml: 'auto' }}>
              <CheckCircleIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Accordion
          expanded={expandedSections.has('todos')}
          onChange={() => handleToggleSection('todos')}
          sx={{
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            borderRadius: 1,
            mb: 1.5,
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary sx={{ p: 1 }}>
            <ListAltIcon sx={{ fontSize: 16, mr: 1, color: '#6366f1' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>待办</Typography>
            <Chip
              size="small"
              label={todos.length}
              sx={{ ml: 'auto', height: 18, fontSize: '0.5rem', bgcolor: 'rgba(99,102,241,0.1)', color: '#6366f1' }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0, mt: -1 }}>
            <Box sx={{ mb: 1, p: 1, bgcolor: 'rgba(99,102,241,0.05)', borderRadius: 0.5, border: `1px solid rgba(99,102,241,0.1)` }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.6rem', color: gs.textMuted }}>完成进度</Typography>
                <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: '#6366f1' }}>{todoStats.completionRate}%</Typography>
              </Box>
              <Box sx={{ width: '100%', height: 4, bgcolor: gs.bgHover, borderRadius: 2, overflow: 'hidden' }}>
                <Box
                  sx={{
                    height: '100%',
                    width: `${todoStats.completionRate}%`,
                    bgcolor: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography sx={{ fontSize: '0.55rem', color: '#6b7280' }}>
                  {todoStats.done}/{todos.length} 已完成
                </Typography>
                <Typography sx={{ fontSize: '0.55rem', color: '#6b7280' }}>
                  {todoStats.highPriority} 高优先级
                </Typography>
              </Box>
            </Box>
            <Box sx={{ p: 1, borderRadius: 0.5, bgcolor: 'rgba(245,158,11,0.05)', border: `1px solid rgba(245,158,11,0.1)` }}>
              <Typography sx={{ fontSize: '0.6rem', color: '#f59e0b', mb: 0.5 }}>工具调用成功率</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 80, height: 8, bgcolor: gs.bgHover, borderRadius: 4, overflow: 'hidden' }}>
                  <Box
                    sx={{
                      height: '100%',
                      width: toolCalls.length > 0 ? `${(toolCallStats.success / toolCalls.length) * 100}%` : '0%',
                      borderRadius: 4,
                      transition: 'width 0.3s ease',
                      background: toolCalls.length > 0 && toolCallStats.success === toolCalls.length
                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                        : toolCalls.length > 0 && toolCallStats.success / toolCalls.length > 0.5
                          ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                          : 'linear-gradient(90deg, #ef4444, #dc2626)',
                    }}
                  />
                </Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textPrimary }}>
                  {toolCalls.length > 0 ? `${Math.round((toolCallStats.success / toolCalls.length) * 100)}%` : '-'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#22c55e' }} />
                  <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted }}>{toolCallStats.success}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#ef4444' }} />
                  <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted }}>{toolCallStats.error}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                  <Typography sx={{ fontSize: '0.5rem', color: gs.textMuted }}>{toolCallStats.running}</Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ p: 1, borderRadius: 0.5, bgcolor: 'rgba(139,92,246,0.05)', border: `1px solid rgba(139,92,246,0.1)` }}>
              <Typography sx={{ fontSize: '0.6rem', color: '#8b5cf6', mb: 0.5 }}>轨迹事件分布</Typography>
              <Box sx={{ display: 'flex', gap: 0.25, height: 20, alignItems: 'flex-end' }}>
                {trajectoryEvents.length > 0 ? trajectoryEvents.slice(-20).map((event, index) => {
                  const eventTypeColors: Record<string, string> = {
                    'agent_message': '#6366f1',
                    'tool_call': '#f59e0b',
                    'tool_result': '#22c55e',
                    'thought': '#8b5cf6',
                    'plan': '#3b82f6',
                    'summary': '#ec4899',
                  };
                  const height = Math.min(100, ((index + 1) / trajectoryEvents.length) * 100);
                  return (
                    <Box
                      key={event.id}
                      sx={{
                        flex: 1,
                        height: `${height}%`,
                        bgcolor: eventTypeColors[event.type] || '#6b7280',
                        borderRadius: 1,
                        transition: 'height 0.3s ease',
                      }}
                      title={`${event.type}: ${new Date(event.ts).toLocaleTimeString()}`}
                    />
                  );
                }) : (
                  <Typography sx={{ fontSize: '0.55rem', color: gs.textMuted, flex: 1, textAlign: 'center' }}>暂无数据</Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#6366f1' }} />
                  <Typography sx={{ fontSize: '0.45rem', color: gs.textMuted }}>消息</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                  <Typography sx={{ fontSize: '0.45rem', color: gs.textMuted }}>调用</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#22c55e' }} />
                  <Typography sx={{ fontSize: '0.45rem', color: gs.textMuted }}>结果</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#8b5cf6' }} />
                  <Typography sx={{ fontSize: '0.45rem', color: gs.textMuted }}>思考</Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <TextField
                placeholder="搜索待办..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="small"
                sx={{
                  flex: 1,
                  '& .MuiInputBase-root': {
                    fontSize: '0.65rem',
                    borderRadius: 0.5,
                    bgcolor: gs.bgHover,
                  },
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ fontSize: 12, mr: 0.5, color: gs.textMuted }} />,
                }}
              />
            </Box>
            {selectMode && selectedTodoIds.size > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1, p: 1, bgcolor: 'rgba(99,102,241,0.1)', borderRadius: 0.5, border: `1px solid rgba(99,102,241,0.2)` }}>
                <Typography sx={{ fontSize: '0.6rem', color: '#6366f1', flex: 1, alignSelf: 'center' }}>
                  已选择 {selectedTodoIds.size} 项
                </Typography>
                <Tooltip title="批量完成">
                  <IconButton size="small" onClick={handleBatchMarkDone} sx={{ p: 0.25, color: '#22c55e' }}>
                    <CheckCircleIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="批量删除">
                  <IconButton size="small" onClick={handleBatchDeleteTodos} sx={{ p: 0.25, color: '#ef4444' }}>
                    <DeleteIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="批量设置优先级">
                  <IconButton size="small" onClick={() => setBatchPriorityMenuAnchor(document.activeElement as HTMLElement)} sx={{ p: 0.25, color: '#f59e0b' }}>
                    <FlagIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="取消选择">
                  <IconButton size="small" onClick={() => { setSelectedTodoIds(new Set()); setSelectMode(false); }} sx={{ p: 0.25, color: gs.textMuted }}>
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
            <ToggleButtonGroup
              size="small"
              value={filterStatus}
              onChange={(_, newVal) => newVal && setFilterStatus(newVal)}
              sx={{ mb: 1, gap: 0.25 }}
            >
              <ToggleButton value="all" sx={{ fontSize: '0.55rem', px: 1.5 }}>全部</ToggleButton>
              <ToggleButton value="pending" sx={{ fontSize: '0.55rem', px: 1.5 }}>待办</ToggleButton>
              <ToggleButton value="in_progress" sx={{ fontSize: '0.55rem', px: 1.5 }}>进行中</ToggleButton>
              <ToggleButton value="done" sx={{ fontSize: '0.55rem', px: 1.5 }}>已完成</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              size="small"
              value={filterPriority}
              onChange={(_, newVal) => newVal && setFilterPriority(newVal)}
              sx={{ mb: 1, gap: 0.25 }}
            >
              <ToggleButton value="all" sx={{ fontSize: '0.55rem', px: 1 }}>优先级</ToggleButton>
              <ToggleButton value="low" sx={{ fontSize: '0.55rem', px: 1 }}>低</ToggleButton>
              <ToggleButton value="normal" sx={{ fontSize: '0.55rem', px: 1 }}>普通</ToggleButton>
              <ToggleButton value="high" sx={{ fontSize: '0.55rem', px: 1 }}>高</ToggleButton>
              <ToggleButton value="urgent" sx={{ fontSize: '0.55rem', px: 1 }}>紧急</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              size="small"
              value={filterTimeRange}
              onChange={(_, newVal) => newVal && setFilterTimeRange(newVal)}
              sx={{ mb: 1, gap: 0.25 }}
            >
              <ToggleButton value="all" sx={{ fontSize: '0.55rem', px: 1 }}>时间</ToggleButton>
              <ToggleButton value="today" sx={{ fontSize: '0.55rem', px: 1 }}>今天</ToggleButton>
              <ToggleButton value="week" sx={{ fontSize: '0.55rem', px: 1 }}>本周</ToggleButton>
              <ToggleButton value="month" sx={{ fontSize: '0.55rem', px: 1 }}>本月</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <TextField
                placeholder="添加待办..."
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                size="small"
                sx={{
                  flex: 1,
                  '& .MuiInputBase-root': {
                    fontSize: '0.65rem',
                    borderRadius: 0.5,
                    bgcolor: gs.bgHover,
                  },
                }}
              />
              <IconButton size="small" onClick={handleAddTodo} sx={{ p: 0.5, color: '#6366f1' }}>
                <AddIcon sx={{ fontSize: 16 }} />
              </IconButton>
              {selectMode && (
                <IconButton size="small" onClick={() => { setSelectMode(false); setSelectedTodoIds(new Set()); }} sx={{ p: 0.5, color: gs.textMuted }}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
            </Box>
            {selectMode && selectedTodoIds.size > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1, p: 0.5, bgcolor: 'rgba(99,102,241,0.1)', borderRadius: 0.5 }}>
                <Typography sx={{ fontSize: '0.6rem', color: '#6366f1', mt: 0.25 }}>已选择 {selectedTodoIds.size} 项</Typography>
                <IconButton size="small" onClick={handleBatchDelete} sx={{ p: 0.25, color: '#ef4444' }}>
                  <DeleteIcon sx={{ fontSize: 12 }} />
                </IconButton>
                <IconButton size="small" onClick={handleBatchToggleStatus} sx={{ p: 0.25, color: '#22c55e' }}>
                  <CheckCircleIcon sx={{ fontSize: 12 }} />
                </IconButton>
                <Menu anchorEl={batchPriorityMenuAnchor} open={!!batchPriorityMenuAnchor} onClose={() => setBatchPriorityMenuAnchor(null)}>
                  {priorityOrder.map(p => (
                    <MenuItem key={p} onClick={() => handleBatchSetPriority(p)}>
                      <Typography sx={{ fontSize: '0.7rem' }}>{p === 'low' ? '低' : p === 'normal' ? '普通' : p === 'high' ? '高' : '紧急'}</Typography>
                    </MenuItem>
                  ))}
                </Menu>
                <IconButton size="small" onClick={(e) => setBatchPriorityMenuAnchor(e.currentTarget)} sx={{ p: 0.25, color: '#f59e0b' }}>
                  <FlagIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Box>
            )}
            {!selectMode && (
              <IconButton size="small" onClick={() => setSelectMode(true)} sx={{ mb: 1, p: 0.25, color: gs.textMuted, '&:hover': { color: '#6366f1' } }}>
                <SelectAllIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
            <VirtualList
              items={filteredTodos}
              itemContent={(todo, index) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  selectedTodoIds={selectedTodoIds}
                  selectMode={selectMode}
                  draggedTodoId={draggedTodoId}
                  dragOverTodoId={dragOverTodoId}
                  completingTodoIds={completingTodoIds}
                  gs={gs}
                  onToggleSelect={handleToggleSelect}
                  onToggleTodo={handleDeleteTodo}
                  onDeleteTodo={handleDeleteTodo}
                  onCyclePriority={handleCyclePriority}
                  onPriorityMenu={(id, anchor) => { setPriorityMenuTodoId(id); setPriorityMenuAnchor(anchor); }}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              )}
              itemSize={56}
              overscan={5}
              maxHeight={250}
            />
            {!todosLoading && filteredTodos.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <ListAltIcon sx={{ fontSize: 32, color: gs.textMuted, opacity: 0.3, mb: 0.5 }} />
                <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                  {debouncedSearchQuery ? '没有匹配的待办' : '暂无待办事项'}
                </Typography>
              </Box>
            )}
            {todosLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} sx={{ color: '#6366f1' }} />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion
          expanded={expandedSections.has('artifacts')}
          onChange={() => handleToggleSection('artifacts')}
          sx={{
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            borderRadius: 1,
            mb: 1.5,
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary sx={{ p: 1 }}>
            <FolderOutlinedIcon sx={{ fontSize: 16, mr: 1, color: '#22c55e' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>产物</Typography>
            <Chip
              size="small"
              label={artifacts.length}
              sx={{ ml: 'auto', height: 18, fontSize: '0.5rem', bgcolor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0, mt: -1 }}>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <TextField
                placeholder="搜索产物..."
                value={artifactSearchQuery}
                onChange={(e) => setArtifactSearchQuery(e.target.value)}
                size="small"
                sx={{
                  flex: 1,
                  '& .MuiInputBase-root': {
                    fontSize: '0.65rem',
                    borderRadius: 0.5,
                    bgcolor: gs.bgHover,
                  },
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ fontSize: 12, mr: 0.5, color: gs.textMuted }} />,
                }}
              />
            </Box>
            <ToggleButtonGroup
              size="small"
              value={artifactFilterType}
              onChange={(_, newVal) => newVal && setArtifactFilterType(newVal)}
              sx={{ mb: 1, gap: 0.25 }}
            >
              <ToggleButton value="all" sx={{ fontSize: '0.55rem', px: 1 }}>全部</ToggleButton>
              <ToggleButton value="document" sx={{ fontSize: '0.55rem', px: 1 }}>文档</ToggleButton>
              <ToggleButton value="image" sx={{ fontSize: '0.55rem', px: 1 }}>图片</ToggleButton>
              <ToggleButton value="code" sx={{ fontSize: '0.55rem', px: 1 }}>代码</ToggleButton>
              <ToggleButton value="other" sx={{ fontSize: '0.55rem', px: 1 }}>其他</ToggleButton>
            </ToggleButtonGroup>
            <VirtualList
              items={filteredArtifacts}
              itemContent={(artifact, index) => (
                <ArtifactItem
                  key={artifact.id}
                  artifact={artifact}
                  selectedArtifactIds={selectedArtifactIds}
                  artifactSelectMode={artifactSelectMode}
                  deletingArtifactIds={deletingArtifactIds}
                  gs={gs}
                  onToggleSelect={handleToggleSelect}
                  onPreviewArtifact={handlePreviewArtifact}
                  onCopyPath={handleCopyPath}
                  onDeleteArtifact={deleteArtifact}
                  downloadUrl={getArtifactDownloadUrl(artifact.id)}
                />
              )}
              itemSize={44}
              overscan={5}
              maxHeight={200}
            />
            {artifactsLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} sx={{ color: '#22c55e' }} />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion
          expanded={expandedSections.has('toolCalls')}
          onChange={() => handleToggleSection('toolCalls')}
          sx={{
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            borderRadius: 1,
            mb: 1.5,
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary sx={{ p: 1 }}>
            <BuildIcon sx={{ fontSize: 16, mr: 1, color: '#f59e0b' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>技能与MCP</Typography>
            <Chip
              size="small"
              label={toolCalls.length}
              sx={{ ml: 'auto', height: 18, fontSize: '0.5rem', bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0, mt: -1 }}>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <TextField
                placeholder="搜索工具..."
                value={toolSearchQuery}
                onChange={(e) => setToolSearchQuery(e.target.value)}
                size="small"
                sx={{
                  flex: 1,
                  '& .MuiInputBase-root': {
                    fontSize: '0.65rem',
                    borderRadius: 0.5,
                    bgcolor: gs.bgHover,
                  },
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ fontSize: 12, mr: 0.5, color: gs.textMuted }} />,
                }}
              />
            </Box>
            <ToggleButtonGroup
              size="small"
              value={toolFilterStatus}
              onChange={(_, newVal) => newVal && setToolFilterStatus(newVal)}
              sx={{ mb: 1, gap: 0.25 }}
            >
              <ToggleButton value="all" sx={{ fontSize: '0.55rem', px: 1 }}>全部</ToggleButton>
              <ToggleButton value="success" sx={{ fontSize: '0.55rem', px: 1 }}>成功</ToggleButton>
              <ToggleButton value="error" sx={{ fontSize: '0.55rem', px: 1 }}>失败</ToggleButton>
              <ToggleButton value="running" sx={{ fontSize: '0.55rem', px: 1 }}>运行中</ToggleButton>
            </ToggleButtonGroup>
            <VirtualList
              items={filteredToolCalls}
              itemContent={(toolCall, index) => (
                <ToolCallItem
                  key={toolCall.id}
                  toolCall={toolCall}
                  maxDuration={toolCallMaxDuration}
                  gs={gs}
                  onClick={() => setToolCallDetail(toolCall)}
                />
              )}
              itemSize={56}
              overscan={5}
              maxHeight={250}
            />
            {toolCallsLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} sx={{ color: '#f59e0b' }} />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion
          expanded={expandedSections.has('trajectory')}
          onChange={() => handleToggleSection('trajectory')}
          sx={{
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            borderRadius: 1,
            mb: 1.5,
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary sx={{ p: 1 }}>
            <TimelineIcon sx={{ fontSize: 16, mr: 1, color: '#8b5cf6' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>轨迹追踪</Typography>
            <Chip
              size="small"
              label={trajectoryEvents.length}
              sx={{ ml: 'auto', height: 18, fontSize: '0.5rem', bgcolor: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0, mt: -1 }}>
            <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
              {trajectoryEvents.slice(0, displayedEventCount).map((event) => (
                <TrajectoryEventItem
                  key={event.id}
                  event={event}
                  isExpanded={expandedEventIds.has(event.id)}
                  gs={gs}
                  isDark={false}
                  onToggleExpand={() => setExpandedEventIds(prev => {
                    const next = new Set(prev);
                    if (next.has(event.id)) next.delete(event.id);
                    else next.add(event.id);
                    return next;
                  })}
                  onCopy={(text, field) => {
                    navigator.clipboard.writeText(text);
                    setTrajectoryCopiedField(field);
                    setTimeout(() => setTrajectoryCopiedField(null), 2000);
                  }}
                  copiedField={trajectoryCopiedField}
                />
              ))}
            </Box>
            {trajectoryEvents.length > displayedEventCount && (
              <Button size="small" onClick={handleLoadMoreEvents} sx={{ mt: 1, fontSize: '0.65rem' }}>
                {loadingMoreEvents ? '加载中...' : '加载更多'}
              </Button>
            )}
            {trajectoryLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} sx={{ color: '#8b5cf6' }} />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      </Box>

      <Dialog open={!!toolCallDetail} onClose={() => setToolCallDetail(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BuildIcon sx={{ fontSize: 20, color: '#f59e0b' }} />
            <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>
              {toolCallDetail?.toolName}
            </Typography>
            <Chip
              size="small"
              label={toolCallDetail?.status === 'success' ? '成功' : toolCallDetail?.status === 'error' ? '失败' : toolCallDetail?.status === 'running' ? '运行中' : '已取消'}
              sx={{
                ml: 'auto',
                height: 20,
                fontSize: '0.65rem',
                bgcolor: toolCallDetail?.status === 'success' ? 'rgba(34,197,94,0.1)' : toolCallDetail?.status === 'error' ? 'rgba(239,68,68,0.1)' : toolCallDetail?.status === 'running' ? 'rgba(245,158,11,0.1)' : 'rgba(107,114,128,0.1)',
                color: toolCallDetail?.status === 'success' ? '#22c55e' : toolCallDetail?.status === 'error' ? '#ef4444' : toolCallDetail?.status === 'running' ? '#f59e0b' : '#6b7280',
              }}
            />
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 2 }}>
            <Box>
              <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mb: 0.5 }}>工具类型</Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: gs.textPrimary }}>
                {toolCallDetail?.toolType === 'skill' ? '技能' : toolCallDetail?.toolType === 'mcp' ? 'MCP' : toolCallDetail?.toolType === 'system' ? '系统' : '内置'}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mb: 0.5 }}>耗时</Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: gs.textPrimary }}>
                {toolCallDetail?.durationMs != null ? (toolCallDetail.durationMs < 1000 ? `${toolCallDetail.durationMs}ms` : `${(toolCallDetail.durationMs / 1000).toFixed(2)}s`) : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mb: 0.5 }}>开始时间</Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: gs.textPrimary }}>
                {toolCallDetail?.startedAt ? new Date(toolCallDetail.startedAt).toLocaleString('zh-CN') : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mb: 0.5 }}>完成时间</Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: gs.textPrimary }}>
                {toolCallDetail?.completedAt ? new Date(toolCallDetail.completedAt).toLocaleString('zh-CN') : '-'}
              </Typography>
            </Box>
          </Box>
          {toolCallDetail?.arguments && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary, mb: 0.5 }}>参数</Typography>
              <Box sx={{ maxHeight: 200, overflow: 'auto', borderRadius: 0.5, border: `1px solid ${gs.border}` }}>
                <SyntaxHighlighter language="json" style={isDark ? oneDark : oneLight} customStyle={{ margin: 0, fontSize: '0.7rem', borderRadius: 0 }}>
                  {JSON.stringify(toolCallDetail.arguments, null, 2)}
                </SyntaxHighlighter>
              </Box>
            </Box>
          )}
          {toolCallDetail?.result != null && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary, mb: 0.5 }}>结果</Typography>
              <Box sx={{ maxHeight: 250, overflow: 'auto', borderRadius: 0.5, border: `1px solid ${gs.border}` }}>
                <SyntaxHighlighter language="json" style={isDark ? oneDark : oneLight} customStyle={{ margin: 0, fontSize: '0.7rem', borderRadius: 0 }}>
                  {typeof toolCallDetail.result === 'string' ? toolCallDetail.result : JSON.stringify(toolCallDetail.result, null, 2)}
                </SyntaxHighlighter>
              </Box>
            </Box>
          )}
          {toolCallDetail?.errorMessage && (
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444', mb: 0.5 }}>错误信息</Typography>
              <Box sx={{ p: 1.5, bgcolor: 'rgba(239,68,68,0.05)', borderRadius: 0.5, border: '1px solid rgba(239,68,68,0.2)' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#ef4444', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {toolCallDetail.errorMessage}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 1.5 }}>
          <Button size="small" onClick={() => setToolCallDetail(null)}>关闭</Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              if (toolCallDetail) {
                navigator.clipboard.writeText(JSON.stringify(toolCallDetail, null, 2));
              }
            }}
          >
            复制全部
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={previewDialog.open} onClose={() => setPreviewDialog({ ...previewDialog, open: false })} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VisibilityIcon sx={{ fontSize: 20, color: '#22c55e' }} />
            <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>
              {previewArtifactData?.fileName || '预览'}
            </Typography>
            <IconButton size="small" onClick={() => setPreviewDialog({ ...previewDialog, open: false })} sx={{ ml: 'auto' }}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {previewDialog.loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} sx={{ color: '#22c55e' }} />
            </Box>
          )}
          {previewDialog.error && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography sx={{ fontSize: '0.8rem', color: '#ef4444' }}>{previewDialog.error}</Typography>
            </Box>
          )}
          {previewDialog.result?.type === 'image' && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <img
                src={previewDialog.result.content}
                alt={previewArtifactData?.fileName || 'preview'}
                style={{
                  maxWidth: '100%',
                  maxHeight: '60vh',
                  transform: `rotate(${previewImageRotation}deg) scale(${previewImageZoom})`,
                  transition: 'transform 0.2s ease',
                }}
              />
            </Box>
          )}
          {previewDialog.result?.type === 'text' && (
            <Box sx={{ maxHeight: '60vh', overflow: 'auto' }}>
              <SyntaxHighlighter language="json" style={isDark ? oneDark : oneLight} customStyle={{ margin: 0, fontSize: '0.75rem' }}>
                {previewDialog.result.content}
              </SyntaxHighlighter>
            </Box>
          )}
        </DialogContent>
        {previewDialog.result?.type === 'image' && (
          <DialogActions sx={{ p: 1.5, justifyContent: 'center' }}>
            <Tooltip title="放大">
              <IconButton size="small" onClick={() => setPreviewImageZoom(z => Math.min(z + 0.25, 3))}>
                <ZoomInIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="缩小">
              <IconButton size="small" onClick={() => setPreviewImageZoom(z => Math.max(z - 0.25, 0.5))}>
                <ZoomOutIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="向左旋转">
              <IconButton size="small" onClick={() => setPreviewImageRotation(r => r - 90)}>
                <RotateLeftIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="向右旋转">
              <IconButton size="small" onClick={() => setPreviewImageRotation(r => r + 90)}>
                <RotateRightIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="下载">
              <IconButton size="small" onClick={() => {
                if (previewArtifactData) {
                  const url = getArtifactDownloadUrl(previewArtifactData.id);
                  window.open(url, '_blank');
                }
              }}>
                <DownloadIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
}