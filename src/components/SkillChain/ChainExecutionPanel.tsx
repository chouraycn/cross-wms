import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { API_BASE_URL } from '../../constants/api';

const BASE_URL = API_BASE_URL;

// v1.9.5-fix: JS 驱动的旋转图标，避免 WKWebView 不兼容 CSS @keyframes
const SpinningIcon: React.FC = () => {
  const [rotation, setRotation] = useState(0);
  
  useEffect(() => {
    let frameId: number;
    let start: number;
    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      setRotation((progress * 360) / 1000); // 1秒转 360 度
      frameId = requestAnimationFrame(animate); // ⚠️ 修复：保存每帧 id 以正确取消
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId); // 取消最新一帧，阻止继续调度
  }, []);
  
  return (
    <LoopIcon
      sx={{
        fontSize: 18,
        color: '#2563EB',
        transform: `rotate(${rotation}deg)`,
        transition: 'transform 0.016s linear',
      }}
    />
  );
};

interface ChainExecutionPanelProps {
  open: boolean;
  executionId: string | null;
  chainName: string;
  onClose: () => void;
  onAbort: (execId: string) => void;
}

const STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  pending: <HourglassEmptyIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />,
  running: <SpinningIcon />,
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
  const evtRef = useRef<import('../../services/api').SSEConnection | null>(null);

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
    const sse = connectChainExecutionEvents(executionId, (rawData) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawData);
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
    });
    evtRef.current = sse;

    return () => {
      sse.close();
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
    </Dialog>
  );
};

export default ChainExecutionPanel;
