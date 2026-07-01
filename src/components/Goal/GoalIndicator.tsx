/**
 * Goal Indicator - 目标状态指示器
 *
 * 在聊天界面顶部显示当前会话的目标状态
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  useTheme,
  CircularProgress,
} from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CloseIcon from '@mui/icons-material/Close';
import { getGrayScale, CHAT_MAX_WIDTH } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import type { GoalRecord, GoalStatus } from '../../types/goal';

interface GoalIndicatorProps {
  sessionKey: string;
  variant?: 'compact' | 'expanded';
}

const GoalIndicator: React.FC<GoalIndicatorProps> = ({ sessionKey, variant = 'compact' }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [goal, setGoal] = useState<GoalRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newObjective, setNewObjective] = useState('');
  const [newTokenBudget, setNewTokenBudget] = useState('');

  const loadGoal = useCallback(async () => {
    if (!sessionKey) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`);
      const data = await response.json();

      if (data.data && data.data.status === 'found' && data.data.goal) {
        setGoal(data.data.goal);
      } else {
        setGoal(null);
      }
    } catch (err) {
      console.error('Failed to load goal:', err);
      setGoal(null);
    } finally {
      setIsLoading(false);
    }
  }, [sessionKey]);

  useEffect(() => {
    loadGoal();
  }, [loadGoal]);

  const handleCreateGoal = useCallback(async () => {
    if (!newObjective.trim()) {
      showToast('请输入目标描述', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`, {
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
        setGoal(data.data.goal);
        setCreateDialogOpen(false);
        setNewObjective('');
        setNewTokenBudget('');
      } else {
        showToast(data.error || '创建失败', 'error');
      }
    } catch (err) {
      showToast(`创建失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [sessionKey, newObjective, newTokenBudget, showToast]);

  const handleClearGoal = useCallback(async () => {
    if (!goal) return;

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.data && data.data.success) {
        showToast('目标已清除', 'success');
        setGoal(null);
      }
    } catch (err) {
      showToast('清除失败', 'error');
    }
  }, [goal, sessionKey, showToast]);

  const handleStatusChange = useCallback(async (status: 'complete' | 'blocked' | 'in_progress') => {
    if (!goal) return;

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (data.data && data.data.goal) {
        showToast('状态已更新', 'success');
        setGoal(data.data.goal);
      }
    } catch (err) {
      showToast('更新状态失败', 'error');
    }
  }, [goal, sessionKey, showToast]);

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

  const tokenProgress = goal?.tokenBudget
    ? Math.min(100, (goal.usedTokens / goal.tokenBudget) * 100)
    : 0;

  if (variant === 'compact') {
    return (
      <Box sx={{
        maxWidth: CHAT_MAX_WIDTH,
        mx: 'auto',
        px: 3,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        borderBottom: `1px solid ${gs.border}`,
        backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
      }}>
        <FlagIcon sx={{ fontSize: 16, color: gs.textMuted }} />

        {isLoading ? (
          <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '0.8rem' }}>
            加载中...
          </Typography>
        ) : goal ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
              <Chip
                size="small"
                label={getStatusLabel(goal.status)}
                icon={getStatusIcon(goal.status)}
                sx={{
                  bgcolor: 'transparent',
                  border: `1px solid ${getStatusColor(goal.status)}`,
                  color: getStatusColor(goal.status),
                  fontSize: '0.7rem',
                  height: 22,
                  '& .MuiChip-icon': { fontSize: 14, ml: 0.5 },
                }}
              />
              <Typography
                variant="body2"
                sx={{
                  color: gs.textPrimary,
                  fontSize: '0.8rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {goal.objective}
              </Typography>
            </Box>

            {goal.tokenBudget && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ color: gs.textMuted, fontSize: '0.7rem' }}>
                  {Math.round(goal.usedTokens / 1000)}k / {Math.round(goal.tokenBudget / 1000)}k
                </Typography>
                <Box sx={{ width: 60 }}>
                  <LinearProgress
                    variant="determinate"
                    value={tokenProgress}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: tokenProgress > 90 ? '#ef4444' : tokenProgress > 70 ? '#f59e0b' : '#22c55e',
                      },
                    }}
                  />
                </Box>
              </Box>
            )}

            <Tooltip title={isExpanded ? '收起' : '展开详情'}>
              <IconButton
                size="small"
                onClick={() => setIsExpanded(!isExpanded)}
                sx={{ color: gs.textMuted, p: 0.5 }}
              >
                {isExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <>
            <Typography
              variant="body2"
              sx={{ color: gs.textMuted, fontSize: '0.8rem', flex: 1 }}
            >
              当前会话无目标
            </Typography>
            <Tooltip title="创建目标">
              <IconButton
                size="small"
                onClick={() => setCreateDialogOpen(true)}
                sx={{ color: gs.textMuted, p: 0.5 }}
              >
                <AddIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </>
        )}

        {/* Expanded Details */}
        {isExpanded && goal && (
          <Box sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            p: 2,
            backgroundColor: gs.bgPanel,
            borderBottom: `1px solid ${gs.border}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}>
            <Typography variant="body2" sx={{ color: gs.textPrimary, mb: 1.5 }}>
              {goal.objective}
            </Typography>
            {goal.tokenBudget && (
              <Box sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: gs.textMuted }}>
                    Token 使用
                  </Typography>
                  <Typography variant="caption" sx={{ color: gs.textMuted }}>
                    {goal.usedTokens.toLocaleString()} / {goal.tokenBudget.toLocaleString()}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={tokenProgress}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: tokenProgress > 90 ? '#ef4444' : tokenProgress > 70 ? '#f59e0b' : '#22c55e',
                    },
                  }}
                />
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1 }}>
              {goal.status !== 'in_progress' && goal.status !== 'complete' && goal.status !== 'cancelled' && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PlayCircleIcon />}
                  onClick={() => handleStatusChange('in_progress')}
                >
                  开始
                </Button>
              )}
              {goal.status !== 'complete' && goal.status !== 'cancelled' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  onClick={() => handleStatusChange('complete')}
                >
                  完成
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<CloseIcon />}
                onClick={handleClearGoal}
              >
                清除
              </Button>
            </Box>
          </Box>
        )}

        {/* Create Goal Dialog */}
        <Dialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>
            创建会话目标
          </DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                fullWidth
                label="目标描述"
                multiline
                rows={3}
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                placeholder="描述你想要达成的目标..."
                size="small"
                autoFocus
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
              disabled={isLoading || !newObjective.trim()}
            >
              {isLoading ? <CircularProgress size={18} /> : '创建'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return (
    <Box sx={{
      maxWidth: CHAT_MAX_WIDTH,
      mx: 'auto',
      p: 2,
      border: `1px solid ${gs.border}`,
      borderRadius: 2,
      mb: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <FlagIcon sx={{ fontSize: 20, color: gs.textMuted }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
          会话目标
        </Typography>
        {goal && (
          <Chip
            size="small"
            label={getStatusLabel(goal.status)}
            icon={getStatusIcon(goal.status)}
            sx={{
              bgcolor: 'transparent',
              border: `1px solid ${getStatusColor(goal.status)}`,
              color: getStatusColor(goal.status),
            }}
          />
        )}
      </Box>

      {goal ? (
        <>
          <Typography variant="body2" sx={{ color: gs.textPrimary, mb: 2 }}>
            {goal.objective}
          </Typography>

          {goal.tokenBudget && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: gs.textMuted }}>
                  Token 使用
                </Typography>
                <Typography variant="caption" sx={{ color: gs.textMuted }}>
                  {goal.usedTokens.toLocaleString()} / {goal.tokenBudget.toLocaleString()}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={tokenProgress}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: tokenProgress > 90 ? '#ef4444' : tokenProgress > 70 ? '#f59e0b' : '#22c55e',
                  },
                }}
              />
            </Box>
          )}

          {goal.note && (
            <Typography variant="body2" sx={{ color: gs.textSecondary, fontSize: '0.8rem', mb: 2 }}>
              备注: {goal.note}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            {goal.status !== 'in_progress' && goal.status !== 'complete' && goal.status !== 'cancelled' && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<PlayCircleIcon />}
                onClick={() => handleStatusChange('in_progress')}
              >
                开始
              </Button>
            )}
            {goal.status !== 'complete' && goal.status !== 'cancelled' && (
              <Button
                size="small"
                variant="outlined"
                color="success"
                startIcon={<CheckCircleIcon />}
                onClick={() => handleStatusChange('complete')}
              >
                完成
              </Button>
            )}
            {goal.status !== 'blocked' && goal.status !== 'complete' && goal.status !== 'cancelled' && (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<ErrorIcon />}
                onClick={() => handleStatusChange('blocked')}
              >
                阻塞
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<CloseIcon />}
              onClick={handleClearGoal}
            >
              清除
            </Button>
          </Box>
        </>
      ) : (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="body2" sx={{ color: gs.textMuted, mb: 2 }}>
            暂无会话目标
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            创建目标
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default GoalIndicator;
