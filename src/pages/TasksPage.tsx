/**
 * TasksPage — 任务管理页面
 *
 * 提供任务的 CRUD 操作、过滤、搜索和统计功能。
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  useTheme,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import LowPriorityIcon from '@mui/icons-material/LowPriority';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';

import * as tasksApi from '../services/tasksApi';
import { getGrayScale } from '../constants/theme';

// 状态配置
const STATUS_CONFIG = {
  pending: { label: '待处理', color: 'default' as const, icon: <PendingIcon fontSize="small" /> },
  in_progress: { label: '进行中', color: 'primary' as const, icon: <PlayCircleIcon fontSize="small" /> },
  completed: { label: '已完成', color: 'success' as const, icon: <CheckCircleIcon fontSize="small" /> },
  cancelled: { label: '已取消', color: 'error' as const, icon: <CancelIcon fontSize="small" /> },
};

// 优先级配置
const PRIORITY_CONFIG = {
  low: { label: '低', color: 'default' as const, icon: <LowPriorityIcon fontSize="small" /> },
  medium: { label: '中', color: 'info' as const, icon: <RemoveCircleOutlineIcon fontSize="small" /> },
  high: { label: '高', color: 'warning' as const, icon: <WarningIcon fontSize="small" /> },
  urgent: { label: '紧急', color: 'error' as const, icon: <PriorityHighIcon fontSize="small" /> },
};

// 任务状态（适配 API）
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// 前端任务类型（扩展 API 类型）
interface TaskDisplay {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  tags: string[];
  dueDate: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

// 过滤器类型
interface TaskFilters {
  status: string;
  priority: string;
  search: string;
}

// 统计类型
interface TaskStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}

// 映射 API 状态到前端状态
function mapApiStatusToFrontend(status: string): TaskStatus {
  const mapping: Record<string, TaskStatus> = {
    todo: 'pending',
    in_progress: 'in_progress',
    done: 'completed',
    blocked: 'cancelled',
  };
  return mapping[status] || 'pending';
}

// 映射前端状态到 API 状态
function mapFrontendStatusToApi(status: TaskStatus): string {
  const mapping: Record<TaskStatus, string> = {
    pending: 'todo',
    in_progress: 'in_progress',
    completed: 'done',
    cancelled: 'blocked',
  };
  return mapping[status];
}

// 映射 API 优先级到前端优先级
function mapApiPriorityToFrontend(priority: string): TaskPriority {
  const mapping: Record<string, TaskPriority> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
  };
  return mapping[priority] || 'medium';
}

// 映射前端优先级到 API 优先级
function mapFrontendPriorityToApi(priority: TaskPriority): string {
  if (priority === 'urgent') return 'high';
  return priority;
}

const TasksPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 状态管理
  const [tasks, setTasks] = useState<TaskDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 过滤器
  const [filters, setFilters] = useState<TaskFilters>({
    status: '',
    priority: '',
    search: '',
  });

  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDisplay | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTask, setDeletingTask] = useState<TaskDisplay | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单状态
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<TaskStatus>('pending');
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium');

  // 加载任务列表
  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await tasksApi.getAllTasks();
      const mappedTasks: TaskDisplay[] = (response.data || []).map((task) => ({
        ...task,
        status: mapApiStatusToFrontend(task.status),
        priority: mapApiPriorityToFrontend(task.priority),
      }));
      setTasks(mappedTasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 计算统计数据
  const stats = useMemo<TaskStats>(() => {
    const result: TaskStats = {
      total: tasks.length,
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };
    tasks.forEach((task) => {
      if (task.status in result) {
        result[task.status as keyof TaskStats]++;
      }
    });
    return result;
  }, [tasks]);

  // 过滤后的任务列表
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filters.status && task.status !== filters.status) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          task.title.toLowerCase().includes(search) ||
          task.description.toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [tasks, filters]);

  // 打开创建对话框
  const handleOpenCreate = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormDescription('');
    setFormStatus('pending');
    setFormPriority('medium');
    setDialogOpen(true);
  };

  // 打开编辑对话框
  const handleOpenEdit = (task: TaskDisplay) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description);
    setFormStatus(task.status);
    setFormPriority(task.priority);
    setDialogOpen(true);
  };

  // 关闭对话框
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTask(null);
  };

  // 保存任务
  const handleSaveTask = async () => {
    if (!formTitle.trim()) {
      setError('任务标题不能为空');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingTask) {
        // 更新任务
        await tasksApi.updateTask(editingTask.id, {
          title: formTitle,
          description: formDescription,
          status: mapFrontendStatusToApi(formStatus) as 'todo' | 'in_progress' | 'done' | 'blocked',
          priority: mapFrontendPriorityToApi(formPriority) as 'low' | 'medium' | 'high',
        });
        setSuccess('任务更新成功');
      } else {
        // 创建任务
        await tasksApi.createTask({
          title: formTitle,
          description: formDescription,
          status: mapFrontendStatusToApi(formStatus) as 'todo' | 'in_progress' | 'done' | 'blocked',
          priority: mapFrontendPriorityToApi(formPriority) as 'low' | 'medium' | 'high',
          projectId: 'default',
        });
        setSuccess('任务创建成功');
      }

      handleCloseDialog();
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存任务失败');
    } finally {
      setSaving(false);
    }
  };

  // 打开删除确认对话框
  const handleOpenDeleteConfirm = (task: TaskDisplay) => {
    setDeletingTask(task);
    setDeleteDialogOpen(true);
  };

  // 关闭删除确认对话框
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeletingTask(null);
  };

  // 删除任务
  const handleDeleteTask = async () => {
    if (!deletingTask) return;

    setSaving(true);
    setError(null);

    try {
      await tasksApi.deleteTask(deletingTask.id);
      setSuccess('任务删除成功');
      handleCloseDeleteDialog();
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除任务失败');
    } finally {
      setSaving(false);
    }
  };

  // 清除消息
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            任务管理
          </Typography>
          <Typography variant="caption" color="text.secondary">
            管理项目任务，支持创建、编辑、删除和过滤
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {loading && <LinearProgress sx={{ width: 100 }} />}
          <IconButton onClick={loadTasks} disabled={loading} title="刷新">
            <RefreshIcon />
          </IconButton>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
          >
            新建任务
          </Button>
        </Box>
      </Box>

      {/* 消息提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* 统计卡片 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AssignmentIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  任务总数
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PendingIcon color="action" />
                <Typography variant="body2" color="text.secondary">
                  待处理
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.pending}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PlayCircleIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  进行中
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.in_progress}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" color="text.secondary">
                  已完成
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.completed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 过滤器 */}
      <Card sx={{ mb: 3, bgcolor: gs.bgPanel }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FilterListIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              过滤条件
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="搜索任务..."
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>状态</InputLabel>
                <Select
                  value={filters.status}
                  label="状态"
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <MenuItem value="">全部</MenuItem>
                  {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                    <MenuItem key={value} value={value}>
                      {config.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>优先级</InputLabel>
                <Select
                  value={filters.priority}
                  label="优先级"
                  onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  <MenuItem value="">全部</MenuItem>
                  {Object.entries(PRIORITY_CONFIG).map(([value, config]) => (
                    <MenuItem key={value} value={value}>
                      {config.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 任务列表 */}
      <Card sx={{ bgcolor: gs.bgPanel }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              任务列表
            </Typography>
            <Chip label={`${filteredTasks.length} 条记录`} size="small" />
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : filteredTasks.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {tasks.length === 0 ? '暂无任务，点击"新建任务"开始创建' : '没有符合条件的任务'}
              </Typography>
            </Box>
          ) : (
            <List>
              {filteredTasks.map((task, index) => (
                <React.Fragment key={task.id}>
                  {index > 0 && <Divider />}
                  <ListItem
                    sx={{
                      '&:hover': { bgcolor: gs.bgHover },
                      borderRadius: 1,
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Typography variant="body1" fontWeight={500}>
                            {task.title}
                          </Typography>
                          <Chip
                            size="small"
                            icon={STATUS_CONFIG[task.status].icon}
                            label={STATUS_CONFIG[task.status].label}
                            color={STATUS_CONFIG[task.status].color}
                          />
                          <Chip
                            size="small"
                            icon={PRIORITY_CONFIG[task.priority].icon}
                            label={PRIORITY_CONFIG[task.priority].label}
                            color={PRIORITY_CONFIG[task.priority].color}
                            variant="outlined"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            {task.description || '暂无描述'}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary">
                              创建于: {new Date(task.createdAt).toLocaleString()}
                            </Typography>
                            {task.tags.length > 0 && (
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                {task.tags.slice(0, 3).map((tag) => (
                                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                                ))}
                                {task.tags.length > 3 && (
                                  <Typography variant="caption" color="text.secondary">
                                    +{task.tags.length - 3}
                                  </Typography>
                                )}
                              </Box>
                            )}
                          </Box>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="编辑">
                        <IconButton edge="end" onClick={() => handleOpenEdit(task)} sx={{ mr: 0.5 }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton edge="end" onClick={() => handleOpenDeleteConfirm(task)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingTask ? '编辑任务' : '新建任务'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="任务标题"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              required
            />
            <TextField
              fullWidth
              label="任务描述"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              multiline
              rows={3}
            />
            <FormControl fullWidth>
              <InputLabel>状态</InputLabel>
              <Select
                value={formStatus}
                label="状态"
                onChange={(e) => setFormStatus(e.target.value as TaskStatus)}
              >
                {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                  <MenuItem key={value} value={value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {config.icon}
                      {config.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>优先级</InputLabel>
              <Select
                value={formPriority}
                label="优先级"
                onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
              >
                {Object.entries(PRIORITY_CONFIG).map(([value, config]) => (
                  <MenuItem key={value} value={value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {config.icon}
                      {config.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSaveTask}
            disabled={saving || !formTitle.trim()}
            startIcon={saving ? <CircularProgress size={16} /> : null}
          >
            {editingTask ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除任务 "{deletingTask?.title}" 吗？此操作无法撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>取消</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteTask}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : null}
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TasksPage;