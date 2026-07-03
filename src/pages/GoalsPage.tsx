import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, CircularProgress,
  useTheme, Alert, Stack, List, ListItem, ListItemText,
  TextField, Divider, Card, CardContent,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FlagIcon from '@mui/icons-material/Flag';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import DeleteIcon from '@mui/icons-material/Delete';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type { Goal, GoalStats } from '../services/api';
import { fetchGoalStats, fetchGoal, createGoal, updateGoalStatus, clearGoal } from '../services/api';

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ReactElement }> = {
  created: { color: '#6B7280', bg: '#F3F4F6', label: '已创建', icon: <FlagIcon sx={{ fontSize: 14 }} /> },
  in_progress: { color: '#2563EB', bg: '#EFF6FF', label: '进行中', icon: <TrackChangesIcon sx={{ fontSize: 14 }} /> },
  completed: { color: '#059669', bg: '#D1FAE5', label: '已完成', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
  failed: { color: '#DC2626', bg: '#FEE2E2', label: '失败', icon: <PendingIcon sx={{ fontSize: 14 }} /> },
  aborted: { color: '#F59E0B', bg: '#FEF3C7', label: '已中止', icon: <PendingIcon sx={{ fontSize: 14 }} /> },
};

const GoalsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [stats, setStats] = useState<GoalStats | null>(null);
  const [sessionKey, setSessionKey] = useState('demo-session');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(false);
  const [newObjective, setNewObjective] = useState('');
  const [tokenBudget, setTokenBudget] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchGoalStats();
      setStats(data);
    } catch (e) {
      // 静默处理
    }
  }, []);

  const loadGoal = useCallback(async () => {
    if (!sessionKey) return;
    setLoading(true);
    try {
      const data = await fetchGoal(sessionKey);
      setGoal(data);
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [sessionKey, showToast]);

  useEffect(() => {
    loadStats();
    loadGoal();
  }, [loadStats, loadGoal]);

  const handleCreate = async () => {
    if (!newObjective.trim() || !sessionKey) {
      showToast('请填写会话 Key 和目标描述', 'error');
      return;
    }
    try {
      await createGoal(
        sessionKey,
        newObjective.trim(),
        tokenBudget ? Number(tokenBudget) : undefined
      );
      showToast('目标已创建', 'success');
      setNewObjective('');
      loadStats();
      loadGoal();
    } catch (e) {
      showToast(`创建失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!sessionKey) return;
    try {
      await updateGoalStatus(sessionKey, status);
      showToast('状态已更新', 'success');
      loadStats();
      loadGoal();
    } catch (e) {
      showToast(`更新失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleClear = async () => {
    if (!sessionKey || !confirm('确定要清除该会话的目标吗？')) return;
    try {
      await clearGoal(sessionKey);
      showToast('目标已清除', 'success');
      setGoal(null);
      loadStats();
    } catch (e) {
      showToast(`清除失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const getStatusChip = (status: string) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.created;
    return (
      <Chip
        icon={cfg.icon}
        label={cfg.label}
        size="small"
        sx={{
          backgroundColor: cfg.bg,
          color: cfg.color,
          fontSize: '0.7rem',
          height: 22,
          '& .MuiChip-icon': { ml: 0.5 },
        }}
      />
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
          目标管理
        </Typography>
        <IconButton size="small" onClick={() => { loadStats(); loadGoal(); }} disabled={loading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {stats && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 80, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>{stats.total}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>总数</Typography>
          </Paper>
          {Object.entries(stats.byStatus).map(([status, count]) => {
            const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.created;
            return (
              <Paper key={status} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 80, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: cfg.color }}>{count}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{cfg.label}</Typography>
              </Paper>
            );
          })}
        </Box>
      )}

      <Divider />

      <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', mb: 1.5 }}>
          创建会话目标
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            label="会话 Key"
            size="small"
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
            placeholder="demo-session"
          />
          <TextField
            label="目标描述"
            size="small"
            value={newObjective}
            onChange={(e) => setNewObjective(e.target.value)}
            placeholder="完成项目需求文档编写"
            multiline
            rows={2}
          />
          <TextField
            label="Token 预算（可选）"
            size="small"
            value={tokenBudget}
            onChange={(e) => setTokenBudget(e.target.value)}
            placeholder="100000"
            type="number"
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleCreate}
              sx={{ textTransform: 'none', fontSize: '0.8rem' }}
            >
              创建目标
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
            当前会话目标
          </Typography>
          <Stack direction="row" spacing={0.5}>
            {['in_progress', 'completed', 'aborted'].map((status) => {
              const cfg = STATUS_CONFIG[status];
              return (
                <Button
                  key={status}
                  size="small"
                  variant="outlined"
                  onClick={() => handleUpdateStatus(status)}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.7rem',
                    borderColor: cfg.color,
                    color: cfg.color,
                    '&:hover': { borderColor: cfg.color, backgroundColor: cfg.bg + '44' },
                  }}
                >
                  {cfg.label}
                </Button>
              );
            })}
            <IconButton size="small" color="error" onClick={handleClear}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={20} />
          </Box>
        ) : !goal ? (
          <Alert severity="info" sx={{ borderRadius: 1 }}>
            当前会话暂无目标
          </Alert>
        ) : (
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {goal.objective}
                </Typography>
                {getStatusChip(goal.status)}
              </Box>
              {goal.tokenBudget !== undefined && (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
                  Token 预算: {goal.tokenBudget} {goal.tokensUsed !== undefined && `(已用 ${goal.tokensUsed})`}
                </Typography>
              )}
              {goal.steps && goal.steps.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 1 }}>
                    执行步骤 ({goal.steps.length})
                  </Typography>
                  <List dense disablePadding>
                    {goal.steps.map((step) => {
                      const stepCfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.created;
                      return (
                        <ListItem key={step.id} sx={{ px: 0, py: 0.5 }}>
                          <ListItemText
                            primary={
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <span style={{ color: stepCfg.color }}>
                                  {step.status === 'completed' ? '✓' : step.status === 'in_progress' ? '◐' : '○'}
                                </span>
                                <Typography sx={{ fontSize: '0.75rem' }}>{step.description}</Typography>
                              </Stack>
                            }
                            secondary={step.result && (
                              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 2 }}>
                                {step.result}
                              </Typography>
                            )}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </>
              )}
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 1.5, fontFamily: 'monospace' }}>
                创建: {new Date(goal.createdAt).toLocaleString()} | 更新: {new Date(goal.updatedAt).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        )}
      </Paper>
    </Box>
  );
};

export default GoalsPage;