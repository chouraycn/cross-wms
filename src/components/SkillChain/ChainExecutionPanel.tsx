import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  LinearProgress,
  Button,
  Stack,
  Chip,
} from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import LoopIcon from '@mui/icons-material/Loop';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import type { ChainExecutionStep, StepStatus } from '../../types/skill';
import { connectChainExecutionEvents } from '../../services/api';

const BASE_URL = 'http://localhost:3001';

interface ChainExecutionPanelProps {
  open: boolean;
  executionId: string | null;
  chainName: string;
  onClose: () => void;
  onAbort: (execId: string) => void;
}

const STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  pending: <HourglassEmptyIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />,
  running: (
    <LoopIcon
      sx={{
        fontSize: 18,
        color: '#2563EB',
        animation: 'spin 1s linear infinite',
      }}
    />
  ),
  success: <CheckCircleIcon sx={{ fontSize: 18, color: '#16A34A' }} />,
  failed: <ErrorIcon sx={{ fontSize: 18, color: '#DC2626' }} />,
  skipped: <SkipNextIcon sx={{ fontSize: 18, color: '#D1D5DB' }} />,
};

const STATUS_LABEL: Record<StepStatus, string> = {
  pending: '等待',
  running: '执行中',
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
};

const ChainExecutionPanel: React.FC<ChainExecutionPanelProps> = ({
  open,
  executionId,
  chainName,
  onClose,
  onAbort,
}) => {
  const [steps, setSteps] = useState<ChainExecutionStep[]>([]);
  const [completed, setCompleted] = useState(false);
  const evtRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!executionId) return;

    // 先加载当前执行状态（获取已完成的步骤）
    fetch(`${BASE_URL}/api/chain-executions/${executionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.data?.steps && Array.isArray(data.data.steps)) {
          setSteps(data.data.steps as ChainExecutionStep[]);
        }
        if (data.data?.status === 'completed' || data.data?.status === 'failed' || data.data?.status === 'aborted') {
          setCompleted(true);
        }
      })
      .catch(() => {
        // 如果获取失败，不影响 SSE 连接
      });

    // 然后连接 SSE 获取实时更新
    evtRef.current = connectChainExecutionEvents(executionId);
    const es = evtRef.current;

    const handleMessage = (e: MessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.type === 'node-started') {
        setSteps((prev) =>
          prev.map((s) =>
            s.nodeId === data.nodeId ? { ...s, status: 'running' as StepStatus } : s,
          ),
        );
      } else if (data.type === 'node-completed') {
        setSteps((prev) =>
          prev.map((s) =>
            s.nodeId === data.nodeId
              ? {
                  ...s,
                  status: 'success' as StepStatus,
                  duration: data.duration as number | undefined,
                  output: data.output,
                }
              : s,
          ),
        );
      } else if (data.type === 'node-failed') {
        setSteps((prev) =>
          prev.map((s) =>
            s.nodeId === data.nodeId
              ? {
                  ...s,
                  status: 'failed' as StepStatus,
                  error: data.error as string | undefined,
                }
              : s,
          ),
        );
      } else if (data.type === 'chain-completed' || data.type === 'chain-failed' || data.type === 'chain-aborted') {
        setCompleted(true);
      }
    };

    es.addEventListener('message', handleMessage);

    return () => {
      es.removeEventListener('message', handleMessage);
      es.close();
    };
  }, [executionId]);

  const completedCount = steps.filter(
    (s) =>
      s.status === 'success' || s.status === 'failed' || s.status === 'skipped',
  ).length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <Dialog open={open} onClose={completed ? onClose : undefined} maxWidth="sm" fullWidth>
      <DialogTitle>执行中：{chainName}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          进度：{completedCount}/{steps.length}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ mb: 2, height: 6, borderRadius: 3 }}
        />

        <Stack spacing={1}>
          {steps.map((step, i) => (
            <Box
              key={step.nodeId}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
            >
              {STATUS_ICON[step.status]}
              <Typography variant="body2" sx={{ flex: 1 }}>
                {i + 1}. {step.skillName}
              </Typography>
              <Chip
                label={STATUS_LABEL[step.status]}
                size="small"
                sx={{ fontSize: '0.65rem' }}
              />
              {step.duration != null && (
                <Typography variant="caption" color="text.secondary">
                  {step.duration}ms
                </Typography>
              )}
            </Box>
          ))}
        </Stack>

        {!completed && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<StopIcon />}
            onClick={() => executionId && onAbort(executionId)}
            sx={{ mt: 2 }}
          >
            终止执行
          </Button>
        )}
        {completed && (
          <Button variant="contained" onClick={onClose} sx={{ mt: 2 }}>
            关闭
          </Button>
        )}
      </DialogContent>
      {/* Spin animation for running icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Dialog>
  );
};

export default ChainExecutionPanel;
