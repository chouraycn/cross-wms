/**
 * Goal Panel - 目标管理面板
 *
 * 提供完整的目标管理界面，包括创建、查看、更新目标
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Button,
  IconButton,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  CircularProgress,
  Alert,
  Tooltip,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import FlagIcon from '@mui/icons-material/Flag';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import type { GoalRecord, GoalStatus } from '../../types/goal';

interface GoalStats {
  total: number;
  byStatus: Record<string, number>;
}

const GoalPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [stats, setStats] = useState<GoalStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<GoalRecord | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newObjective, setNewObjective] = useState('');
  const [newSessionKey, setNewSessionKey] = useState('');
  const [newTokenBudget, setNewTokenBudget] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch('/api/goals/stats');
      const data = await response.json();
      if (data.data) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  const loadGoal = useCallback(async (sessionKey: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`);
      const data = await response.json();

      if (data.data && data.data.status === 'found' && data.data.goal) {
        return data.data.goal as GoalRecord;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCreateGoal = useCallback(async () => {
    if (!newSessionKey.trim()) {
      showToast('请输入会话标识', 'error');
      return;
    }

    if (!newObjective.trim()) {
      showToast('请输入目标描述', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(newSessionKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: newObjective,
          tokenBudget: newTokenBudget ? parseInt(newTokenBudget, 10) : undefined,
        }),
      });

      const data = await response.json();

      if (data.data && data.data.goal) {
        showToast('目标已创建', 'success');
        setCreateDialogOpen(false);
        setNewObjective('');
        setNewSessionKey('');
        setNewTokenBudget('');
        setGoals(prev => [...prev, data.data.goal]);
        setSelectedGoal(data.data.goal);
        loadStats();
      } else {
        showToast(data.error || '创建失败', 'error');
      }
    } catch (err) {
      showToast(`创建失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [newSessionKey, newObjective, newTokenBudget, showToast, loadStats]);

  const handleUpdateStatus = useCallback(async (status: GoalStatus, note?: string) => {
    if (!selectedGoal) return;

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(selectedGoal.sessionKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });

      const data = await response.json();

      if (data.data && data.data.goal) {
        showToast('状态已更新', 'success');
        setSelectedGoal(data.data.goal);
        setGoals(prev => prev.map(g => g.id === data.data.goal.id ? data.data.goal : g));
        loadStats();
      }
    } catch (err) {
      showToast('更新失败', 'error');
    }
  }, [selectedGoal, showToast, loadStats]);

  const handleDeleteGoal = useCallback(async () => {
    if (!selectedGoal) return;

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(selectedGoal.sessionKey)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.data && data.data.success) {
        showToast('目标已删除', 'success');
        setGoals(prev => prev.filter(g => g.id !== selectedGoal.id));
        setSelectedGoal(null);
        loadStats();
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  }, [selectedGoal, showToast, loadStats]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return '#22c55e';
      case 'blocked':
        return '#f59e0b';
      case 'in_progress':
        return '#6366f1';
      case 'cancelled':
        return '#ef4444';
      default:
        return gs.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return '待开始';
      case 'in_progress':
        return '进行中';
      case 'complete':
        return '已完成';
      case 'blocked':
        return '已阻塞';
      case 'cancelled':
        return '已取消';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircleIcon sx={{ fontSize: 16 }} />;
      case 'blocked':
        return <ErrorIcon sx={{ fontSize: 16 }} />;
      case 'in_progress':
        return <PlayCircleIcon sx={{ fontSize: 16 }} />;
      case 'cancelled':
        return <CloseIcon sx={{ fontSize: 16 }} />;
      default:
        return <PauseCircleIcon sx={{ fontSize: 16 }} />;
    }
  };

  const tokenProgress = selectedGoal?.tokenBudget
    ? Math.min(100, (selectedGoal.usedTokens / selectedGoal.tokenBudget) * 100)
    : 0;

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FlagIcon sx={{ fontSize: 24, color: gs.textPrimary }} />
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            目标管理
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="刷新">
            <IconButton onClick={loadStats} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            新建目标
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      {stats && (
        <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={`总计: ${stats.total}`} size="small" variant="outlined" />
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <Chip
              key={status}
              label={`${getStatusLabel(status)}: ${count}`}
              size="small"
              sx={{
                borderColor: getStatusColor(status),
                color: getStatusColor(status),
              }}
              variant="outlined"
            />
          ))}
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        {/* Goal List */}
        <Paper sx={{ flex: 1, overflow: 'auto', minWidth: 250 }}>
          {isLoading && goals.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress />
            </Box>
          ) : goals.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 3, gap: 1 }}>
              <FlagIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography color="text.secondary" variant="body2">
                暂无目标
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
                创建第一个目标
              </Button>
            </Box>
          ) : (
            <List dense>
              {goals.map((goal, index) => (
                <React.Fragment key={goal.id}>
                  {index > 0 && <Divider />}
                  <ListItemButton
                    selected={selectedGoal?.id === goal.id}
                    onClick={() => setSelectedGoal(goal)}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            size="small"
                            label={getStatusLabel(goal.status)}
                            icon={getStatusIcon(goal.status)}
                            sx={{
                              height: 20,
                              fontSize: '0.65rem',
                              bgcolor: 'transparent',
                              border: `1px solid ${getStatusColor(goal.status)}`,
                              color: getStatusColor(goal.status),
                              '& .MuiChip-icon': { fontSize: 12, ml: 0.5 },
                            }}
                          />
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: selectedGoal?.id === goal.id ? 600 : 400,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {goal.objective}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ color: gs.textMuted }}>
                          {goal.sessionKey}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                </React.Fragment>
              ))}
            </List>
          )}
        </Paper>

        {/* Goal Detail */}
        <Paper sx={{ flex: 2, overflow: 'auto', p: 2 }}>
          {selectedGoal ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {selectedGoal.objective}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      label={getStatusLabel(selectedGoal.status)}
                      icon={getStatusIcon(selectedGoal.status)}
                      sx={{
                        bgcolor: 'transparent',
                        border: `1px solid ${getStatusColor(selectedGoal.status)}`,
                        color: getStatusColor(selectedGoal.status),
                      }}
                    />
                    <Chip
                      size="small"
                      label={selectedGoal.sessionKey}
                      variant="outlined"
                    />
                  </Box>
                </Box>
                <IconButton
                  size="small"
                  color="error"
                  onClick={handleDeleteGoal}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>

              <Divider />

              {/* Token Budget */}
              {selectedGoal.tokenBudget && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ color: gs.textSecondary }}>
                      Token 预算
                    </Typography>
                    <Typography variant="body2" sx={{ color: gs.textPrimary, fontFamily: 'monospace' }}>
                      {selectedGoal.usedTokens.toLocaleString()} / {selectedGoal.tokenBudget.toLocaleString()}
                    </Typography>
                  </Box>
                  <Box sx={{ width: '100%' }}>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${tokenProgress}%`,
                          backgroundColor: tokenProgress > 90 ? '#ef4444' : tokenProgress > 70 ? '#f59e0b' : '#22c55e',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </Box>
                </Box>
              )}

              {/* Note */}
              {selectedGoal.note && (
                <Box>
                  <Typography variant="body2" sx={{ color: gs.textSecondary, mb: 0.5 }}>
                    备注
                  </Typography>
                  <Typography variant="body2" sx={{ color: gs.textPrimary }}>
                    {selectedGoal.note}
                  </Typography>
                </Box>
              )}

              {/* Timestamps */}
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: gs.textMuted }}>
                    创建时间
                  </Typography>
                  <Typography variant="body2">
                    {new Date(selectedGoal.createdAt).toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: gs.textMuted }}>
                    更新时间
                  </Typography>
                  <Typography variant="body2">
                    {new Date(selectedGoal.updatedAt).toLocaleString()}
                  </Typography>
                </Box>
              </Box>

              {/* Actions */}
              <Divider />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {selectedGoal.status !== 'in_progress' && selectedGoal.status !== 'complete' && selectedGoal.status !== 'cancelled' && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PlayCircleIcon />}
                    onClick={() => handleUpdateStatus('in_progress')}
                  >
                    开始
                  </Button>
                )}
                {selectedGoal.status !== 'complete' && selectedGoal.status !== 'cancelled' && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    startIcon={<CheckCircleIcon />}
                    onClick={() => handleUpdateStatus('complete')}
                  >
                    标记完成
                  </Button>
                )}
                {selectedGoal.status !== 'blocked' && selectedGoal.status !== 'complete' && selectedGoal.status !== 'cancelled' && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    startIcon={<ErrorIcon />}
                    onClick={() => handleUpdateStatus('blocked')}
                  >
                    标记阻塞
                  </Button>
                )}
                {selectedGoal.status !== 'cancelled' && selectedGoal.status !== 'complete' && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<CloseIcon />}
                    onClick={() => handleUpdateStatus('cancelled')}
                  >
                    取消
                  </Button>
                )}
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
              <EditIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography color="text.secondary" variant="body2">
                选择左侧目标查看详情
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
          创建新目标
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="会话标识 (Session Key)"
              value={newSessionKey}
              onChange={(e) => setNewSessionKey(e.target.value)}
              placeholder="例如: session-123"
              size="small"
            />
            <TextField
              fullWidth
              label="目标描述"
              multiline
              rows={4}
              value={newObjective}
              onChange={(e) => setNewObjective(e.target.value)}
              placeholder="描述你想要达成的目标..."
              size="small"
            />
            <TextField
              label="Token 预算（可选）"
              type="number"
              value={newTokenBudget}
              onChange={(e) => setNewTokenBudget(e.target.value)}
              placeholder="例如：50000"
              size="small"
              InputProps={{ inputProps: { min: 0 } }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} size="small">
            取消
          </Button>
          <Button
            onClick={handleCreateGoal}
            variant="contained"
            size="small"
            disabled={isLoading || !newObjective.trim() || !newSessionKey.trim()}
          >
            {isLoading ? <CircularProgress size={18} /> : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GoalPanel;
