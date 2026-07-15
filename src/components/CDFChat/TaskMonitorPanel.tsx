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
  getTaskFlowsBySession,
  getTaskFlowSteps,
  startTaskFlow as apiStartTaskFlow,
  retryTaskFlow as apiRetryTaskFlow,
  cancelTaskFlow as apiCancelTaskFlow,
  subscribeToTaskMonitor,
  type TodoItem as ApiTodoItem,
  type TodoPriority,
  type Artifact as ApiArtifact,
  type ToolCall as ApiToolCall,
  type TrajectoryEvent as ApiTrajectoryEvent,
  type TaskFlow as ApiTaskFlow,
  type TaskFlowStep as ApiTaskFlowStep,
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

  const [taskFlows, setTaskFlows] = useState<ApiTaskFlow[]>([]);
  const [taskFlowsLoading, setTaskFlowsLoading] = useState(false);
  const [expandedFlowIds, setExpandedFlowIds] = useState<Set<string>>(new Set());
  const [flowStepsMap, setFlowStepsMap] = useState<Record<string, ApiTaskFlowStep[]>>({});

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

  const loadTaskFlows = useCallback(async () => {
    setTaskFlowsLoading(true);
    try {
      const res = await getTaskFlowsBySession(sessionKey);
      const flows = res.data || [];
      setTaskFlows(flows);
      const stepsMap: Record<string, ApiTaskFlowStep[]> = {};
      await Promise.all(
        flows.map(async (flow) => {
          try {
            const stepsRes = await getTaskFlowSteps(flow.id);
            stepsMap[flow.id] = stepsRes.data || [];
          } catch (e) {
            console.warn(`[TaskMonitor] 加载任务流步骤失败 ${flow.id}:`, e);
            stepsMap[flow.id] = [];
          }
        })
      );
      setFlowStepsMap(stepsMap);
    } catch (e) {
      console.warn('[TaskMonitor] 加载任务流失败:', e);
    } finally {
      setTaskFlowsLoading(false);
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
    loadTaskFlows();
    loadTrajectory();
    loadTraces();
    loadArtifacts();
  }, [loadTodos, loadToolCalls, loadTaskFlows, loadTrajectory, loadTraces, loadArtifacts]);

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
      onTaskFlowCreated: (flow) => {
        setTaskFlows(prev => {
          const exists = prev.some(f => f.id === flow.id);
          if (exists) return prev;
          return [flow, ...prev];
        });
        setExpandedFlowIds(prev => new Set([...prev, flow.id]));
      },
      onTaskFlowUpdated: (flow) => {
        setTaskFlows(prev => prev.map(f => f.id === flow.id ? flow : f));
        getTaskFlowSteps(flow.id).then(res => {
          setFlowStepsMap(prev => ({ ...prev, [flow.id]: res.data || [] }));
        }).catch(() => {});
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
      } else if (e.key === 'f' || e.key === 'F') {
        handleToggleSection('taskFlows');
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

  const handleToggleFlowExpand = useCallback((flowId: string) => {
    setExpandedFlowIds(prev => {
      const next = new Set(prev);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  }, []);

  const handleStartTaskFlow = useCallback(async (flowId: string) => {
    try {
      await apiStartTaskFlow(flowId);
      await loadTaskFlows();
    } catch (e) {
      console.warn('[TaskMonitor] 启动任务流失败:', e);
    }
  }, [loadTaskFlows]);

  const handleRetryTaskFlow = useCallback(async (flowId: string) => {
    try {
      await apiRetryTaskFlow(flowId);
      await loadTaskFlows();
    } catch (e) {
      console.warn('[TaskMonitor] 重试任务流失败:', e);
    }
  }, [loadTaskFlows]);

  const handleCancelTaskFlow = useCallback(async (flowId: string) => {
    try {
      await apiCancelTaskFlow(flowId);
      await loadTaskFlows();
    } catch (e) {
      console.warn('[TaskMonitor] 取消任务流失败:', e);
    }
  }, [loadTaskFlows]);

  const getFlowStatusColor = (status: ApiTaskFlow['status']) => {
    switch (status) {
      case 'succeeded': return '#22c55e';
      case 'failed': return '#ef4444';
      case 'running': return '#2563eb';
      case 'waiting': return '#f59e0b';
      case 'cancelled': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  const getFlowStatusLabel = (status: ApiTaskFlow['status']) => {
    switch (status) {
      case 'queued': return '排队中';
      case 'running': return '运行中';
      case 'waiting': return '等待中';
      case 'succeeded': return '成功';
      case 'failed': return '失败';
      case 'cancelled': return '已取消';
      default: return status;
    }
  };

  const getStepStatusColor = (status: ApiTaskFlowStep['status']) => {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'failed': return '#ef4444';
      case 'running': return '#2563eb';
      case 'skipped': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  return (
    <Box sx={{ 
      width: 320, 
      flexShrink: 0, 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'hidden',
      bgcolor: '#f5f5f5',
      borderLeft: '1px solid #e0e0e0',
    }}>
      <Box sx={{
        px: 2,
        py: 1.5,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #e8e8e8',
        bgcolor: '#f5f5f5',
      }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a' }}>任务监控</Typography>
      </Box>
      <Box sx={{
        flexShrink: 0,
        display: 'flex',
        borderBottom: '1px solid #e8e8e8',
        bgcolor: '#f5f5f5',
      }}>
        {[
          { key: 'todos', label: '待办' },
          { key: 'taskFlows', label: '任务流' },
          { key: 'artifacts', label: '产物' },
          { key: 'toolCalls', label: '技能与 MCP' },
        ].map((tab) => (
          <Box
            key={tab.key}
            onClick={() => handleToggleSection(tab.key)}
            sx={{
              flex: 1,
              py: 1.25,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderBottom: expandedSections.has(tab.key) ? '2px solid #2563eb' : '2px solid transparent',
              color: expandedSections.has(tab.key) ? '#2563eb' : '#666',
              fontWeight: expandedSections.has(tab.key) ? 600 : 400,
              fontSize: '0.85rem',
              transition: 'all 0.2s',
              '&:hover': {
                bgcolor: '#ebebeb',
                color: '#2563eb',
              },
            }}
          >
            {tab.label}
          </Box>
        ))}
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        {expandedSections.has('todos') && (
          <Box sx={{ px: 2, py: 2 }}>
            {todos.map((todo, index) => (
              <Box 
                key={todo.id}
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  py: 0.75,
                  cursor: 'pointer',
                }}
              >
                {todo.status === 'in_progress' ? (
                  <Box 
                    onClick={() => updateTodo(todo.id, { status: 'done' })}
                    sx={{ 
                      width: 18, 
                      height: 18, 
                      borderRadius: '50%', 
                      bgcolor: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mr: 1.5,
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <Box sx={{ 
                      width: 0, 
                      height: 0, 
                      borderLeft: '5px solid white', 
                      borderTop: '3.5px solid transparent', 
                      borderBottom: '3.5px solid transparent',
                      ml: 0.5,
                    }} />
                  </Box>
                ) : todo.status === 'done' ? (
                  <Box 
                    onClick={() => updateTodo(todo.id, { status: 'pending' })}
                    sx={{ 
                      width: 18, 
                      height: 18, 
                      borderRadius: '50%', 
                      border: '1.5px solid #999',
                      bgcolor: '#999',
                      mr: 1.5,
                      flexShrink: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }} 
                  >
                    <Box sx={{ 
                      width: 8, 
                      height: 4, 
                      borderLeft: '2px solid white', 
                      borderBottom: '2px solid white',
                      transform: 'rotate(-45deg)',
                      mb: 0.5,
                    }} />
                  </Box>
                ) : (
                  <Box 
                    onClick={() => updateTodo(todo.id, { status: 'done' })}
                    sx={{ 
                      width: 18, 
                      height: 18, 
                      borderRadius: '50%', 
                      border: '1.5px solid #999',
                      mr: 1.5,
                      flexShrink: 0,
                      cursor: 'pointer',
                    }} 
                  />
                )}
                <Typography 
                  sx={{ 
                    fontSize: '0.9rem', 
                    color: todo.status === 'done' ? '#999' : '#333',
                    textDecoration: todo.status === 'done' ? 'line-through' : 'none',
                    flex: 1,
                  }}
                >
                  {todo.text}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {expandedSections.has('taskFlows') && (
          <Box sx={{ px: 2, py: 2 }}>
            {taskFlowsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} sx={{ color: '#2563eb' }} />
              </Box>
            ) : taskFlows.length === 0 ? (
              <Typography sx={{ fontSize: '0.85rem', color: '#999', textAlign: 'center', py: 4 }}>
                暂无任务流
              </Typography>
            ) : (
              taskFlows.map((flow) => {
                const steps = flowStepsMap[flow.id] || [];
                const isExpanded = expandedFlowIds.has(flow.id);
                const progress = flow.totalSteps > 0
                  ? Math.round(((flow.completedSteps + flow.failedSteps) / flow.totalSteps) * 100)
                  : 0;
                return (
                  <Box
                    key={flow.id}
                    sx={{
                      mb: 1.5,
                      bgcolor: '#fff',
                      borderRadius: 1,
                      border: '1px solid #e0e0e0',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      onClick={() => handleToggleFlowExpand(flow.id)}
                      sx={{
                        px: 1.5,
                        py: 1,
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#f9f9f9' },
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: getFlowStatusColor(flow.status),
                          mr: 1,
                          flexShrink: 0,
                        }}
                      />
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: '#333', flex: 1 }}>
                        {flow.name}
                      </Typography>
                      <Chip
                        size="small"
                        label={getFlowStatusLabel(flow.status)}
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          bgcolor: `${getFlowStatusColor(flow.status)}15`,
                          color: getFlowStatusColor(flow.status),
                          mr: 0.5,
                        }}
                      />
                      <ExpandMoreIcon
                        sx={{
                          fontSize: 18,
                          color: '#999',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      />
                    </Box>
                    <Box sx={{ px: 1.5, pb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                        <Box sx={{ flex: 1, height: 4, bgcolor: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                          <Box
                            sx={{
                              width: `${progress}%`,
                              height: '100%',
                              bgcolor: getFlowStatusColor(flow.status),
                              borderRadius: 2,
                              transition: 'width 0.3s',
                            }}
                          />
                        </Box>
                        <Typography sx={{ fontSize: '0.65rem', color: '#666' }}>
                          {flow.completedSteps}/{flow.totalSteps}
                        </Typography>
                      </Box>
                      {flow.status === 'queued' && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleStartTaskFlow(flow.id)}
                          sx={{ fontSize: '0.7rem', py: 0.25, minHeight: 24 }}
                        >
                          启动
                        </Button>
                      )}
                      {flow.status === 'failed' && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleRetryTaskFlow(flow.id)}
                          sx={{ fontSize: '0.7rem', py: 0.25, minHeight: 24, mr: 0.5 }}
                        >
                          重试
                        </Button>
                      )}
                      {(flow.status === 'queued' || flow.status === 'running' || flow.status === 'waiting') && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => handleCancelTaskFlow(flow.id)}
                          sx={{ fontSize: '0.7rem', py: 0.25, minHeight: 24 }}
                        >
                          取消
                        </Button>
                      )}
                    </Box>
                    {isExpanded && steps.length > 0 && (
                      <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
                        {steps.map((step, idx) => (
                          <Box
                            key={step.id}
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              py: 0.5,
                              pl: idx === steps.length - 1 ? 0 : 0,
                            }}
                          >
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mr: 1, mt: 0.25 }}>
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  bgcolor: getStepStatusColor(step.status),
                                }}
                              />
                              {idx < steps.length - 1 && (
                                <Box sx={{ width: 1, flex: 1, bgcolor: '#e5e7eb', my: 0.25 }} />
                              )}
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography sx={{ fontSize: '0.8rem', color: '#333' }}>
                                {step.taskName}
                              </Typography>
                              <Typography sx={{ fontSize: '0.7rem', color: '#999' }}>
                                {step.taskDescription}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        )}

        {expandedSections.has('artifacts') && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography sx={{ fontSize: '0.85rem', color: '#666' }}>默认工作目录</Typography>
          </Box>
        )}
        
        {expandedSections.has('toolCalls') && (
          <Box sx={{ px: 2, py: 2 }}>
            {Array.from(new Set(toolCalls.map(t => t.toolName))).map((toolName, index) => (
              <Box 
                key={index}
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  py: 0.75,
                }}
              >
                <Box sx={{ 
                  width: 24, 
                  height: 24, 
                  borderRadius: 0.5, 
                  bgcolor: '#fff',
                  border: '1px solid #e0e0e0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: 1.5,
                  flexShrink: 0,
                }}>
                  <BuildIcon sx={{ fontSize: 14, color: '#2563eb' }} />
                </Box>
                <Typography sx={{ fontSize: '0.9rem', color: '#333' }}>
                  {toolName}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

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