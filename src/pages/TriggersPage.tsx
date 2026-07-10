import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
  Switch,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import ScheduleIcon from '@mui/icons-material/Schedule';
import EventIcon from '@mui/icons-material/Event';
import WebhookIcon from '@mui/icons-material/Webhook';
import SearchIcon from '@mui/icons-material/Search';

import {
  getAllTriggers,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  enableTrigger,
  disableTrigger,
  executeTrigger,
  getTriggerExecutions,
} from '../services/triggersApi';
import type { TriggerConfig, TriggerExecution } from '../services/triggersApi';
import { getGrayScale } from '../constants/theme';
import { useTheme } from '@mui/material';

export default function TriggersPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [triggers, setTriggers] = useState<TriggerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [currentTrigger, setCurrentTrigger] = useState<TriggerConfig | null>(null);
  const [executingTrigger, setExecutingTrigger] = useState<string | null>(null);
  const [executions, setExecutions] = useState<TriggerExecution[]>([]);

  const fetchTriggers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getAllTriggers();
      setTriggers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取触发器列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutions = async () => {
    try {
      const data = await getTriggerExecutions(undefined, 20);
      setExecutions(data);
    } catch (e) {
      console.error('获取执行历史失败:', e);
    }
  };

  useEffect(() => {
    fetchTriggers();
    fetchExecutions();
  }, []);

  const handleCreateTrigger = async (trigger: Omit<TriggerConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createTrigger(trigger);
      await fetchTriggers();
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建触发器失败');
    }
  };

  const handleUpdateTrigger = async (id: string, trigger: Partial<Omit<TriggerConfig, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      await updateTrigger(id, trigger);
      await fetchTriggers();
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新触发器失败');
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    try {
      await deleteTrigger(id);
      await fetchTriggers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除触发器失败');
    }
  };

  const handleEnableTrigger = async (id: string) => {
    try {
      await enableTrigger(id);
      await fetchTriggers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '启用触发器失败');
    }
  };

  const handleDisableTrigger = async (id: string) => {
    try {
      await disableTrigger(id);
      await fetchTriggers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '禁用触发器失败');
    }
  };

  const handleExecuteTrigger = async (id: string) => {
    try {
      setExecutingTrigger(id);
      await executeTrigger(id);
      await fetchExecutions();
    } catch (e) {
      setError(e instanceof Error ? e.message : '执行触发器失败');
    } finally {
      setExecutingTrigger(id);
    }
  };

  const getTriggerTypeIcon = (type: string) => {
    const icons: Record<string, React.ReactElement> = {
      cron: <ScheduleIcon fontSize="small" />,
      event: <EventIcon fontSize="small" />,
      webhook: <WebhookIcon fontSize="small" />,
      keyword: <SearchIcon fontSize="small" />,
    };
    return icons[type] || <EventIcon fontSize="small" />;
  };

  const getTriggerTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      cron: '定时',
      event: '事件',
      webhook: 'Webhook',
      keyword: '关键词',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">触发器管理</Typography>
        <Button onClick={() => { setDialogMode('create'); setCurrentTrigger(null); setDialogOpen(true); }} startIcon={<AddIcon />}>
          创建触发器
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>触发器列表</Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>名称</TableCell>
                      <TableCell>类型</TableCell>
                      <TableCell>目标</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {triggers.map(trigger => (
                      <TableRow key={trigger.id}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {getTriggerTypeIcon(trigger.type)}
                            <Typography>{trigger.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={getTriggerTypeLabel(trigger.type)} size="small" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {trigger.targetType}: {trigger.targetId}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {trigger.enabled ? (
                            <Chip icon={<ToggleOnIcon />} label="启用" color="success" size="small" />
                          ) : (
                            <Chip icon={<ToggleOffIcon />} label="禁用" color="default" size="small" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton onClick={() => trigger.enabled ? handleDisableTrigger(trigger.id) : handleEnableTrigger(trigger.id)}>
                              {trigger.enabled ? <ToggleOffIcon /> : <ToggleOnIcon />}
                            </IconButton>
                            <IconButton onClick={() => handleExecuteTrigger(trigger.id)} disabled={executingTrigger === trigger.id}>
                              <PlayArrowIcon />
                            </IconButton>
                            <IconButton onClick={() => { setDialogMode('edit'); setCurrentTrigger(trigger); setDialogOpen(true); }}>
                              <EditIcon />
                            </IconButton>
                            <IconButton onClick={() => handleDeleteTrigger(trigger.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>执行历史</Typography>
              <List>
                {executions.map(exec => (
                  <ListItem key={exec.id} sx={{ py: 1 }}>
                    <ListItemText
                      primary={exec.triggerName}
                      secondary={`状态: ${exec.status} · ${new Date(exec.startedAt).toLocaleString()}`}
                    />
                    <Chip
                      label={exec.status}
                      color={exec.status === 'completed' ? 'success' : exec.status === 'failed' ? 'error' : 'default'}
                      size="small"
                    />
                  </ListItem>
                ))}
              </List>
              {executions.length === 0 && (
                <Typography variant="body2" color="textSecondary">暂无执行记录</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md">
        <DialogTitle>{dialogMode === 'create' ? '创建触发器' : '编辑触发器'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="触发器名称"
            defaultValue={currentTrigger?.name || ''}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>类型</InputLabel>
            <Select defaultValue={currentTrigger?.type || 'cron'}>
              <MenuItem value="cron">定时触发器</MenuItem>
              <MenuItem value="event">事件触发器</MenuItem>
              <MenuItem value="webhook">Webhook 触发器</MenuItem>
              <MenuItem value="keyword">关键词触发器</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="调度规则"
            placeholder="如: 0 * * * *"
            defaultValue={currentTrigger?.schedule || ''}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>目标类型</InputLabel>
            <Select defaultValue={currentTrigger?.targetType || 'skill'}>
              <MenuItem value="skill">技能</MenuItem>
              <MenuItem value="chain">链</MenuItem>
              <MenuItem value="workflow">工作流</MenuItem>
              <MenuItem value="automation">自动化</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="目标 ID"
            defaultValue={currentTrigger?.targetId || ''}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="描述"
            multiline
            rows={2}
            defaultValue={currentTrigger?.description || ''}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button onClick={() => {}}>保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}