import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Menu,
  MenuItem as MenuItemComp,
  Divider,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';

// ===================== Types =====================

type Priority = 'high' | 'medium' | 'low';
type Status = 'todo' | 'in_progress' | 'done';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: Status;
  dueDate?: string;
  createdAt: string;
  tags?: string[];
}

// ===================== Constants =====================

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  high:   { label: '高',  color: '#DC2626', bg: '#FEF2F2' },
  medium: { label: '中',  color: '#D97706', bg: '#FFFBEB' },
  low:    { label: '低',  color: '#059669', bg: '#F0FDF4' },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  todo:        { label: '待处理',  color: '#6B7280' },
  in_progress: { label: '进行中',  color: '#2563EB' },
  done:        { label: '已完成',  color: '#059669' },
};

const STORAGE_KEY = 'crosswms-tasks';

// ===================== Helpers =====================

function loadTasks(): Task[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch { /* ignore */ }
}

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ===================== Task Card =====================

interface TaskCardProps {
  task: Task;
  onToggleDone: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: Status) => void;
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
          {/* 优先级 */}
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
          {/* 状态 */}
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
          {task.tags?.map((tag) => (
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
        {(['todo', 'in_progress', 'done'] as Status[]).map((s) => (
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

// ===================== Task Form Dialog =====================

interface TaskFormProps {
  open: boolean;
  initial?: Task | null;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'createdAt'>) => void;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'medium' as Priority,
  status: 'todo' as Status,
  dueDate: '',
  tags: '',
};

const TaskFormDialog: React.FC<TaskFormProps> = ({ open, initial, onClose, onSave }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [titleError, setTitleError] = useState('');

  React.useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          title: initial.title,
          description: initial.description || '',
          priority: initial.priority,
          status: initial.status,
          dueDate: initial.dueDate || '',
          tags: (initial.tags || []).join(', '),
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setTitleError('');
    }
  }, [open, initial]);

  const handleSave = () => {
    if (!form.title.trim()) { setTitleError('任务名称不能为空'); return; }
    onSave({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate || undefined,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
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
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}>
              <MenuItem value="high">高</MenuItem>
              <MenuItem value="medium">中</MenuItem>
              <MenuItem value="low">低</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>状态</InputLabel>
            <Select label="状态" value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))}>
              <MenuItem value="todo">待处理</MenuItem>
              <MenuItem value="in_progress">进行中</MenuItem>
              <MenuItem value="done">已完成</MenuItem>
            </Select>
          </FormControl>
        </Box>
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

const FILTER_OPTIONS: Array<{ label: string; value: Status | 'all' }> = [
  { label: '全部', value: 'all' },
  { label: '待处理', value: 'todo' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'done' },
];

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const persist = useCallback((next: Task[]) => {
    setTasks(next);
    saveTasks(next);
  }, []);

  const handleSave = useCallback((data: Omit<Task, 'id' | 'createdAt'>) => {
    if (editingTask) {
      persist(tasks.map((t) => t.id === editingTask.id ? { ...t, ...data } : t));
    } else {
      persist([{ ...data, id: generateId(), createdAt: new Date().toISOString() }, ...tasks]);
    }
    setEditingTask(null);
  }, [tasks, editingTask, persist]);

  const handleToggleDone = useCallback((id: string) => {
    persist(tasks.map((t) => t.id === id ? { ...t, status: t.status === 'done' ? 'todo' : 'done' } : t));
  }, [tasks, persist]);

  const handleDelete = useCallback((id: string) => {
    persist(tasks.filter((t) => t.id !== id));
  }, [tasks, persist]);

  const handleChangeStatus = useCallback((id: string, status: Status) => {
    persist(tasks.map((t) => t.id === id ? { ...t, status } : t));
  }, [tasks, persist]);

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  }, []);

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
  const counts = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
            任务
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF', mt: 0.25 }}>
            {counts.all} 个任务，{counts.in_progress} 个进行中
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => { setEditingTask(null); setDialogOpen(true); }}
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

      {/* Filter tabs */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2.5, alignItems: 'center' }}>
        <FilterListIcon sx={{ fontSize: 16, color: '#9CA3AF', mr: 0.5 }} />
        {FILTER_OPTIONS.map((opt) => (
          <Box
            key={opt.value}
            component="button"
            onClick={() => setFilter(opt.value)}
            sx={{
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              px: 1.25,
              py: 0.5,
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: filter === opt.value ? 500 : 400,
              color: filter === opt.value ? '#111827' : '#6B7280',
              bgcolor: filter === opt.value ? '#F3F4F6' : 'transparent',
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
                bgcolor: filter === opt.value ? '#E5E7EB' : '#F3F4F6',
                color: '#6B7280',
                px: 0.5,
              }}
            >
              {counts[opt.value]}
            </Box>
          </Box>
        ))}
      </Box>

      {/* Task list */}
      {filtered.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 8,
            color: '#9CA3AF',
            gap: 1,
          }}
        >
          <CheckCircleOutlineIcon sx={{ fontSize: 40, color: '#D1D5DB' }} />
          <Typography sx={{ fontSize: '0.9375rem', color: '#6B7280' }}>
            {filter === 'all' ? '还没有任务' : `没有${FILTER_OPTIONS.find((o) => o.value === filter)?.label}的任务`}
          </Typography>
          {filter === 'all' && (
            <Button
              size="small" startIcon={<AddIcon />}
              onClick={() => { setEditingTask(null); setDialogOpen(true); }}
              sx={{ mt: 0.5, color: '#6B7280', '&:hover': { bgcolor: '#F3F4F6' } }}
            >
              新建第一个任务
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggleDone={handleToggleDone}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onChangeStatus={handleChangeStatus}
            />
          ))}
        </Box>
      )}

      {/* Form Dialog */}
      <TaskFormDialog
        open={dialogOpen}
        initial={editingTask}
        onClose={() => { setDialogOpen(false); setEditingTask(null); }}
        onSave={handleSave}
      />
    </Box>
  );
};

export default TasksPage;
