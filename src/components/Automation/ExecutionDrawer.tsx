/**
 * ExecutionDrawer — 执行详情 Drawer
 *
 * 纯展示组件，接收执行详情和回调
 */

import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Drawer,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ReplayIcon from '@mui/icons-material/Replay';

import type { AutomationExecution, ExecutionStep } from '../../services/automation';
import {
  TASK_TYPE_LABELS,
  TASK_TYPE_COLORS,
  EXEC_STATUS_CONFIG,
} from './sharedConstants';

// ===================== Props =====================

export interface ExecutionDrawerProps {
  open: boolean;
  execution: AutomationExecution | null;
  onClose: () => void;
  onRetry: (executionId: string) => void;
  renderSteps: (steps: ExecutionStep[]) => React.ReactNode;
}

// ===================== Component =====================

const ExecutionDrawer: React.FC<ExecutionDrawerProps> = ({
  open,
  execution,
  onClose,
  onRetry,
  renderSteps,
}) => {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 420,
          p: 0,
          borderLeft: '1px solid #E5E7EB',
        },
      }}
    >
      {execution && (
        <Box sx={{ p: 3 }}>
          {/* 头部 */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
              执行详情
            </Typography>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {/* 基本信息 */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <Chip
                label={TASK_TYPE_LABELS[execution.taskType]}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  backgroundColor: `${TASK_TYPE_COLORS[execution.taskType]}12`,
                  color: TASK_TYPE_COLORS[execution.taskType],
                }}
              />
              <Chip
                label={EXEC_STATUS_CONFIG[execution.status]?.label || execution.status}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  backgroundColor: EXEC_STATUS_CONFIG[execution.status]?.bg || '#F3F4F6',
                  color: EXEC_STATUS_CONFIG[execution.status]?.color || '#6B7280',
                }}
              />
              {execution.isRetry && (
                <Chip label="重试执行" size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500, backgroundColor: '#DBEAFE', color: '#2563EB' }} />
              )}
            </Box>
          </Box>

          {/* 时间与耗时 */}
          <Box sx={{ mb: 2, p: 1.5, backgroundColor: '#F9FAFB', borderRadius: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>开始时间</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#374151' }}>
                {new Date(execution.startedAt).toLocaleString('zh-CN')}
              </Typography>
            </Box>
            {execution.completedAt && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>完成时间</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#374151' }}>
                  {new Date(execution.completedAt).toLocaleString('zh-CN')}
                </Typography>
              </Box>
            )}
            {execution.duration !== null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>耗时</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#374151', fontWeight: 500 }}>
                  {execution.duration < 1000 ? `${execution.duration}ms` : `${(execution.duration / 1000).toFixed(2)}s`}
                </Typography>
              </Box>
            )}
          </Box>

          {/* 执行结果 */}
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
              执行结果
            </Typography>
            <Box sx={{ p: 1.5, backgroundColor: execution.status === 'success' ? '#ECFDF5' : execution.status === 'failed' ? '#FEF2F2' : '#F9FAFB', borderRadius: 1.5, border: '1px solid', borderColor: execution.status === 'success' ? '#A7F3D0' : execution.status === 'failed' ? '#FECACA' : '#E5E7EB' }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {execution.result || '无结果'}
              </Typography>
            </Box>
          </Box>

          {/* 执行步骤 */}
          {execution.steps && execution.steps.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
                执行步骤
              </Typography>
              {renderSteps(execution.steps)}
            </Box>
          )}

          {/* 重试按钮 */}
          {execution.status === 'failed' && (
            <Button
              variant="outlined"
              startIcon={<ReplayIcon sx={{ fontSize: 16 }} />}
              onClick={() => { onRetry(execution.id); onClose(); }}
              fullWidth
              sx={{
                mt: 1,
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                borderColor: '#D97706',
                color: '#D97706',
                '&:hover': { borderColor: '#B45309', backgroundColor: '#FFFBEB' },
              }}
            >
              重试此任务
            </Button>
          )}
        </Box>
      )}
    </Drawer>
  );
};

export default ExecutionDrawer;
