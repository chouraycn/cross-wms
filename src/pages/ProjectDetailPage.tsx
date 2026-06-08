import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Breadcrumbs,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Menu,
  Divider,
  Tooltip,
  MenuItem as MenuItemComp,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useToast } from '../contexts/ToastContext';
import {
  getProjectTasks,
  createTask,
  updateTask,
  deleteTask,
  getProjects,
  deleteProject,
} from '../services/api';
import type { Task, TaskStatus, TaskPriority } from '../types/task';
import type { Project } from '../types/project';

// ===================== Constants =====================

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  high:   { label: '高',  color: '#DC2626', bg: '#FEF2F2' },
  medium: { label: '中',  color: '#D97706', bg: '#FFFBEB' },
  low:    { label: '低',  color: '#059669', bg: '#F0FDF4' },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  todo:        { label: '待处理',  color: '#6B7280' },
  in_progress: { label: '进行中',  color: '#2563EB' },
  done:        { label: '已完成',  color: '#059669' },
};

const FILTER_OPTIONS: Array<{ label: string; value: TaskStatus | 'all' }> = [
  { label: '全部', value: 'all' },
  { label: '待处理', value: 'todo' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'done' },
];

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: '进行中', color: '#059669' },
  archived: { label: '已归档', color: '#9CA3AF' },
  completed: { label: '已完成', color: '#2563EB' },
};

// ===================== TaskCard =====================

interface TaskCardProps {
  task: Task;
  onToggleDone: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: TaskStatus) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onToggleDone, onEdit, onDelete, onChangeStatus }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isDone = task.status === 'done';
  const priority = PRIORITY_CONFIG[task.priority];
  const status = STATUS_CONFIG[task.status];

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        px: 2,
        py: 1.5,
        borderRadius: '8px',
        border: '1px solid',
        borderColor: isDone ? '#F3F4F6' : '#E5E7EB',
        backgroundColor: isDone ? '#FAFAFA' : '#FFFFFF',
        transition: 'box-shadow 0.15s',
        '&:hover': { boxShadow: '0 1px 6px rgba(0,0,0,0.07)' },
      }}
    >
      {/* 完成切换 */}
      <Tooltip title={isDone ? '标记未完成' : '标记完成'}>
        <IconButton
          size="small"
          onClick={() => onToggleDone(task.id)}
          sx={{ mt: 0.125, p: 0.25, color: isDone ? '#059669' : '#D1D5DB', '&:hover': { color: isDone ? '#047857' : '#6B7280' } }}
        >
          {isDone
            ? <CheckCircleOutlineIcon sx={{ fontSize: 20 }} />
            : <RadioButtonUncheckedIcon sx={{ fontSize: 20 }} />}
        </IconButton>
      </Tooltip>

      {/* 主体 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography
            sx={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: isDone ? '#9CA3AF' : '#111827',
              textDecoration: isDone ? 'line-through' : 'none',
              lineHeight: 1.4,
            }}
          >
            {task.title}
          </Typography>
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              px: 0.75,
              py: 0.125,
              borderRadius: '4px',
              backgroundColor: priority.bg,
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: priority.color,
              whiteSpace: 'nowrap',
            }}
          >
            <FlagOutlinedIcon sx={{ fontSize: 10 }} />
            {priority.label}
          </Box>
          {task.status !== 'done' && (
            <Box
              component="span"
              sx={{
                px: 0.75,
                py: 0.125,
                borderRadius: '4px',
                backgroundColor: task.status === 'in_progress' ? '#EFF6FF' : '#F3F4F6',
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: status.color,
                whiteSpace: 'nowrap',
              }}
            >
              {status.label}
            </Box>
          )}
        </Box>

        {task.description && (
          <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280', mt: 0.5, lineHeight: 1.4 }}>
            {task.description}
          </Typography>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
          {task.tags.map((tag) => (
            <Chip key={tag} label={tag} size="small"
              sx={{ height: 18, fontSize: '0.6875rem', borderRadius: '4px', bgcolor: '#F3F4F6', color: '#6B7280' }} />
          ))}
          {task.dueDate && (
            <Typography sx={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>
              截止 {task.dueDate}
            </Typography>
          )}
        </Box>
      </Box>

      {/* 操作菜单 */}
      <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0.5, color: '#9CA3AF', '&:hover': { color: '#374151' } }}>
        <MoreHorizIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}
        PaperProps={{ sx: { minWidth: 140, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', borderRadius: '8px' } }}>
        {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
          <MenuItemComp key={s} dense onClick={() => { onChangeStatus(task.id, s); setAnchorEl(null); }}
            sx={{ fontSize: '0.8125rem', color: task.status === s ? '#111827' : '#374151', fontWeight: task.status === s ? 600 : 400 }}>
            {STATUS_CONFIG[s].label}
          </MenuItemComp>
        ))}
        <Divider sx={{ my: 0.5 }} />
        <MenuItemComp dense onClick={() => { onEdit(task); setAnchorEl(null); }} sx={{ fontSize: '0.8125rem' }}>
          编辑
        </MenuItemComp>
        <MenuItemComp dense onClick={() => { onDelete(task.id); setAnchorEl(null); }}
          sx={{ fontSize: '0.8125rem', color: '#DC2626' }}>
          删除
        </MenuItemComp>
      </Menu>
    </Box>
  );
};

// ===================== TaskFormDialog =====================

interface TaskFormProps {
  open: boolean;
  initial?: Task | null;
  onClose: () => void;
  onSave: (data: { title: string; description: string; status: TaskStatus; priority: TaskPriority; assignee: string; tags: string[]; dueDate: string }) => void;
}

const EMPTY_TASK_FORM = {
  title: '',
  description: '',
  status: 'todo' as TaskStatus,
  priority: 'medium' as TaskPriority,
  assignee: '',
  tags: '',
  dueDate: '',
};

const TaskFormDialog: React.FC<TaskFormProps> = ({ open, initial, onClose, onSave }) => {
  const [form, setForm] = useState(EMPTY_TASK_FORM);
  const [titleError, setTitleError] = useState('');

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          title: initial.title,
          description: initial.description,
          status: initial.status,
          priority: initial.priority,
          assignee: initial.assignee,
          tags: initial.tags.join(', '),
          dueDate: initial.dueDate,
        });
      } else {
        setForm(EMPTY_TASK_FORM);
      }
      setTitleError('');
    }
  }, [open, initial]);

  const handleSave = () => {
    if (!form.title.trim()) { setTitleError('任务名称不能为空'); return; }
    onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      assignee: form.assignee.trim(),
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      dueDate: form.dueDate,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: '12px' } }}>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, pb: 1 }}>
        {initial ? '编辑任务' : '新建任务'}
      </DialogTitle>
      <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="任务名称" fullWidth size="small" autoFocus
          value={form.title}
          onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); setTitleError(''); }}
          error={Boolean(titleError)} helperText={titleError}
        />
        <TextField
          label="描述（可选）" fullWidth size="small" multiline rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>优先级</InputLabel>
            <Select label="优先级" value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
              <MenuItem value="high">高</MenuItem>
              <MenuItem value="medium">中</MenuItem>
              <MenuItem value="low">低</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>状态</InputLabel>
            <Select label="状态" value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))}>
              <MenuItem value="todo">待处理</MenuItem>
              <MenuItem value="in_progress">进行中</MenuItem>
              <MenuItem value="done">已完成</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <TextField
          label="负责人（可选）" size="small"
          value={form.assignee}
          onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
        />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField label="截止日期（可选）" size="small" type="date" sx={{ flex: 1 }}
            InputLabelProps={{ shrink: true }}
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
          <TextField label="标签（逗号分隔）" size="small" sx={{ flex: 1 }}
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="例：跨境, 仓库"
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: '#6B7280' }}>取消</Button>
        <Button onClick={handleSave} variant="contained"
          sx={{ bgcolor: '#111827', '&:hover': { bgcolor: '#374151' }, borderRadius: '6px' }}>
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ===================== Main Page =====================

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Project state
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskStatus | 'all'>('all');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Load project
  const loadProject = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const projects = await getProjects();
      const proj = projects.find((p) => p.id === id) || null;
      setProject(proj);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  // Load tasks for this project
  const loadTasks = useCallback(async () => {
    if (!id) return;
    try {
      setTasksLoading(true);
      const data = await getProjectTasks(id);
      setTasks(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '加载任务失败', 'error');
    } finally {
      setTasksLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project) loadTasks();
  }, [project, loadTasks]);

  // Task handlers
  const handleTaskSave = useCallback(async (data: { title: string; description: string; status: TaskStatus; priority: TaskPriority; assignee: string; tags: string[]; dueDate: string }) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, data);
        showToast('任务已更新', 'success');
      } else {
        await createTask({ ...data, projectId: id! });
        showToast('任务已创建', 'success');
      }
      setEditingTask(null);
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  }, [editingTask, id, showToast, loadTasks]);

  const handleTaskToggleDone = useCallback(async (taskId: string) => {
    try {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      await updateTask(taskId, { status: newStatus });
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  }, [tasks, showToast, loadTasks]);

  const handleTaskDelete = useCallback(async (taskId: string) => {
    if (!window.confirm('确定要删除这个任务吗？')) return;
    try {
      await deleteTask(taskId);
      showToast('任务已删除', 'success');
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }, [showToast, loadTasks]);

  const handleTaskChangeStatus = useCallback(async (taskId: string, status: TaskStatus) => {
    try {
      await updateTask(taskId, { status });
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '状态更新失败', 'error');
    }
  }, [showToast, loadTasks]);

  const handleTaskEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskDialogOpen(true);
  }, []);

  const handleDeleteProject = useCallback(async () => {
    if (!project) return;
    if (!window.confirm('确定要删除这个项目吗？')) return;
    try {
      await deleteProject(project.id);
      showToast('项目已删除', 'success');
      navigate('/projects');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }, [project, navigate, showToast]);

  // Filtered tasks
  const filteredTasks = taskFilter === 'all' ? tasks : tasks.filter((t) => t.status === taskFilter);
  const taskCounts = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

  // ===================== Render =====================

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress size={32} sx={{ color: '#6B7280' }} />
      </Box>
    );
  }

  if (!project) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', py: 8 }}>
        <Alert severity="error" sx={{ borderRadius: '8px' }}>
          项目不存在或已被删除
        </Alert>
        <Button onClick={() => navigate('/projects')} sx={{ mt: 2 }}>
          返回项目列表
        </Button>
      </Box>
    );
  }

  const projectStatus = statusLabels[project.status] || statusLabels.active;

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2, mt: 1 }}>
        <Link
          component="button"
          onClick={() => navigate('/projects')}
          sx={{ textDecoration: 'none', color: '#6B7280', fontSize: '0.8125rem', '&:hover': { textDecoration: 'underline' } }}
        >
          项目
        </Link>
        <Typography sx={{ fontSize: '0.8125rem', color: '#111827', fontWeight: 500 }}>
          {project.name}
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
              {project.name}
            </Typography>
            <Chip
              label={projectStatus.label}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6875rem',
                fontWeight: 500,
                bgcolor: project.status === 'active' ? '#ECFDF5' : project.status === 'archived' ? '#F3F4F6' : '#EFF6FF',
                color: projectStatus.color,
              }}
            />
          </Box>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
            {project.description || '暂无描述'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleDeleteProject}
            sx={{
              borderColor: '#E5E7EB',
              color: '#DC2626',
              borderRadius: '8px',
              fontSize: '0.8125rem',
              '&:hover': { borderColor: '#DC2626', bgcolor: '#FEF2F2' },
            }}
          >
            删除项目
          </Button>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Project Info Card */}
      <Box
        sx={{
          p: 3,
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E5E7EB',
          mb: 3,
        }}
      >
        <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280', lineHeight: 1.6 }}>
          项目 ID：{project.id}<br />
          分类：{project.category === 'custom' ? '自定义' : project.category === 'template' ? '模板' : '固定'}<br />
          创建时间：{new Date(project.created_at).toLocaleString('zh-CN')}<br />
          更新时间：{new Date(project.updated_at).toLocaleString('zh-CN')}
        </Typography>
      </Box>

      {/* Tasks Section */}
      <Box>
        {/* Tasks Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
            任务列表
          </Typography>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}
            sx={{
              bgcolor: '#111827',
              '&:hover': { bgcolor: '#374151' },
              borderRadius: '8px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              px: 2,
              py: 0.875,
            }}
          >
            新建任务
          </Button>
        </Box>

        {/* Task Filter Tabs */}
        <Box sx={{ display: 'flex', gap: 0.5, mb: 2.5, alignItems: 'center' }}>
          <FilterListIcon sx={{ fontSize: 16, color: '#9CA3AF', mr: 0.5 }} />
          {FILTER_OPTIONS.map((opt) => (
            <Box
              key={opt.value}
              component="button"
              onClick={() => setTaskFilter(opt.value)}
              sx={{
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                px: 1.25,
                py: 0.5,
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: taskFilter === opt.value ? 500 : 400,
                color: taskFilter === opt.value ? '#111827' : '#6B7280',
                bgcolor: taskFilter === opt.value ? '#F3F4F6' : 'transparent',
                '&:hover': { bgcolor: '#F3F4F6' },
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                transition: 'all 0.1s',
              }}
            >
              {opt.label}
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  borderRadius: '9px',
                  fontSize: '0.6875rem',
                  bgcolor: taskFilter === opt.value ? '#E5E7EB' : '#F3F4F6',
                  color: '#6B7280',
                  px: 0.5,
                }}
              >
                {taskCounts[opt.value]}
              </Box>
            </Box>
          ))}
        </Box>

        {/* Task List */}
        {tasksLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} sx={{ color: '#6B7280' }} />
          </Box>
        ) : filteredTasks.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 1 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 40, color: '#D1D5DB' }} />
            <Typography sx={{ fontSize: '0.9375rem', color: '#6B7280' }}>
              {taskFilter === 'all' ? '还没有任务' : `没有${FILTER_OPTIONS.find((o) => o.value === taskFilter)?.label}的任务`}
            </Typography>
            {taskFilter === 'all' && (
              <Button
                size="small" startIcon={<AddIcon />}
                onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}
                sx={{ mt: 0.5, color: '#6B7280', '&:hover': { bgcolor: '#F3F4F6' } }}
              >
                新建第一个任务
              </Button>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleDone={handleTaskToggleDone}
                onEdit={handleTaskEdit}
                onDelete={handleTaskDelete}
                onChangeStatus={handleTaskChangeStatus}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Task Form Dialog */}
      <TaskFormDialog
        open={taskDialogOpen}
        initial={editingTask}
        onClose={() => { setTaskDialogOpen(false); setEditingTask(null); }}
        onSave={handleTaskSave}
      />
    </Box>
  );
};

export default ProjectDetailPage;
