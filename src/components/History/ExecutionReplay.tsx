/**
 * 执行回放 — 节点执行时间轴、输入输出查看
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Chip,
  Collapse,
  IconButton,
  Divider,
  useTheme,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  SkipNext as SkipNextIcon,
  SkipPrevious as SkipPreviousIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  RemoveCircle as SkipIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import type { ExecutionRecord, ExecutionNode } from '../../services/executionHistoryApi';

// ===================== Types =====================

interface ExecutionReplayProps {
  record: ExecutionRecord;
}

// ===================== Helper Functions =====================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatTimestamp(ts: number): string {
  return dayjs(ts).format('HH:mm:ss');
}

function getNodeStatusIcon(status: ExecutionNode['status']): React.ReactElement | undefined {
  switch (status) {
    case 'success': return <CheckCircleIcon fontSize="small" color="success" />;
    case 'failed': return <ErrorIcon fontSize="small" color="error" />;
    case 'skipped': return <SkipIcon fontSize="small" sx={{ color: 'text.disabled' }} />;
    default: return undefined;
  }
}

function getNodeStatusColor(status: ExecutionNode['status']): 'success' | 'error' | 'default' {
  switch (status) {
    case 'success': return 'success';
    case 'failed': return 'error';
    case 'skipped': return 'default';
    default: return 'default';
  }
}

// ===================== Component =====================

const ExecutionReplay: React.FC<ExecutionReplayProps> = React.memo(({ record }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // 节点列表（如果没有节点，生成一个虚拟节点）
  const nodes = useMemo(() => {
    if (record.nodes && record.nodes.length > 0) {
      return record.nodes;
    }
    // 虚拟节点：整体执行
    return [{
      nodeId: 'overall',
      nodeName: '整体执行',
      status: record.status === 'success' ? 'success' : record.status === 'failed' ? 'failed' : 'skipped',
      startTime: record.startTime,
      endTime: record.endTime ?? record.startTime,
      input: {},
      output: record.output ?? {},
    }] as ExecutionNode[];
  }, [record]);

  // 当前步骤索引
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expandedInput, setExpandedInput] = useState<Record<string, boolean>>({});
  const [expandedOutput, setExpandedOutput] = useState<Record<string, boolean>>({});

  // 计算时间轴
  const timeline = useMemo(() => {
    const startTime = record.startTime;
    const endTime = record.endTime ?? startTime;
    const totalDuration = endTime - startTime;

    return nodes.map((node, idx) => {
      const nodeStart = node.startTime;
      const nodeEnd = node.endTime;
      const nodeDuration = nodeEnd - nodeStart;
      const startOffset = nodeStart - startTime;
      const startPercent = totalDuration > 0 ? (startOffset / totalDuration) * 100 : 0;
      const widthPercent = totalDuration > 0 ? (nodeDuration / totalDuration) * 100 : 100;

      return {
        node,
        idx,
        startPercent,
        widthPercent,
        duration: nodeDuration,
        absoluteStart: nodeStart,
        absoluteEnd: nodeEnd,
      };
    });
  }, [nodes, record.startTime, record.endTime]);

  // 播放控制
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    // 自动播放逻辑：逐步前进
    let current = activeStep;
    const interval = setInterval(() => {
      if (current < nodes.length - 1) {
        current++;
        setActiveStep(current);
      } else {
        setIsPlaying(false);
        clearInterval(interval);
      }
    }, 1000);
  }, [activeStep, nodes.length]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleNext = useCallback(() => {
    if (activeStep < nodes.length - 1) {
      setActiveStep(activeStep + 1);
    }
  }, [activeStep, nodes.length]);

  const handleBack = useCallback(() => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  }, [activeStep]);

  const handleReset = useCallback(() => {
    setActiveStep(0);
    setIsPlaying(false);
  }, []);

  // 展开/折叠输入输出
  const toggleInputExpand = useCallback((nodeId: string) => {
    setExpandedInput(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  }, []);

  const toggleOutputExpand = useCallback((nodeId: string) => {
    setExpandedOutput(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 头部信息 */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
          <Chip
            size="small"
            label={record.status}
            color={record.status === 'success' ? 'success' : record.status === 'failed' ? 'error' : 'default'}
            icon={getNodeStatusIcon(record.status === 'success' ? 'success' : record.status === 'failed' ? 'failed' : 'skipped')}
          />
          <Typography variant="body2" color="text.secondary">
            类型: {record.type}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            开始: {formatTimestamp(record.startTime)}
          </Typography>
          {record.endTime && (
            <Typography variant="body2" color="text.secondary">
              结束: {formatTimestamp(record.endTime)}
            </Typography>
          )}
          {record.duration && (
            <Typography variant="body2" color="text.secondary">
              耗时: {formatDuration(record.duration)}
            </Typography>
          )}
        </Box>

        {/* 错误信息 */}
        {record.error && (
          <Paper sx={{ p: 1, bgcolor: isDark ? 'rgba(244, 67, 54, 0.1)' : 'rgba(244, 67, 54, 0.05)' }}>
            <Typography variant="body2" color="error">
              {record.error}
            </Typography>
          </Paper>
        )}
      </Paper>

      {/* 时间轴 */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          执行时间轴
        </Typography>
        <Box sx={{ position: 'relative', height: 40, bgcolor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.05)', borderRadius: 1, mb: 2 }}>
          {timeline.map((item, idx) => (
            <Box
              key={item.node.nodeId}
              sx={{
                position: 'absolute',
                left: `${item.startPercent}%`,
                width: `${Math.max(item.widthPercent, 2)}%`,
                top: 8,
                height: 24,
                bgcolor: item.node.status === 'success'
                  ? theme.palette.success.main
                  : item.node.status === 'failed'
                    ? theme.palette.error.main
                    : theme.palette.grey[400],
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                opacity: activeStep === idx ? 1 : 0.7,
                '&:hover': {
                  opacity: 1,
                  transform: 'scaleY(1.1)',
                },
              }}
              onClick={() => setActiveStep(idx)}
            >
              <Typography
                variant="caption"
                sx={{
                  color: '#fff',
                  fontSize: '0.65rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  px: 0.5,
                }}
              >
                {item.node.nodeName}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* 播放控制 */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
          <IconButton size="small" onClick={handleBack} disabled={activeStep === 0}>
            <SkipPreviousIcon />
          </IconButton>
          <IconButton size="small" onClick={isPlaying ? handlePause : handlePlay}>
            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
          <IconButton size="small" onClick={handleNext} disabled={activeStep === nodes.length - 1}>
            <SkipNextIcon />
          </IconButton>
          <Button size="small" onClick={handleReset}>
            重置
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
            步骤 {activeStep + 1} / {nodes.length}
          </Typography>
        </Box>

        {/* 当前节点详情 */}
        {timeline[activeStep] && (
          <Paper sx={{ p: 2, bgcolor: isDark ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)' }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
              {getNodeStatusIcon(timeline[activeStep].node.status)}
              <Typography variant="subtitle2">
                {timeline[activeStep].node.nodeName}
              </Typography>
              <Chip size="small" label={timeline[activeStep].node.status} color={getNodeStatusColor(timeline[activeStep].node.status)} />
              <Typography variant="body2" color="text.secondary">
                {formatDuration(timeline[activeStep].duration)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatTimestamp(timeline[activeStep].absoluteStart)} - {formatTimestamp(timeline[activeStep].absoluteEnd)}
              </Typography>
            </Box>

            {/* 输入 */}
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleInputExpand(timeline[activeStep].node.nodeId)}>
                <IconButton size="small">
                  {expandedInput[timeline[activeStep].node.nodeId] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <Typography variant="body2" color="text.secondary">
                  输入参数
                </Typography>
              </Box>
              <Collapse in={expandedInput[timeline[activeStep].node.nodeId]}>
                <Paper sx={{ p: 1, mt: 0.5, bgcolor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.03)' }}>
                  <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                    {JSON.stringify(timeline[activeStep].node.input, null, 2)}
                  </Typography>
                </Paper>
              </Collapse>
            </Box>

            {/* 输出 */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleOutputExpand(timeline[activeStep].node.nodeId)}>
                <IconButton size="small">
                  {expandedOutput[timeline[activeStep].node.nodeId] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <Typography variant="body2" color="text.secondary">
                  输出结果
                </Typography>
              </Box>
              <Collapse in={expandedOutput[timeline[activeStep].node.nodeId]}>
                <Paper sx={{ p: 1, mt: 0.5, bgcolor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.03)' }}>
                  <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                    {JSON.stringify(timeline[activeStep].node.output, null, 2)}
                  </Typography>
                </Paper>
              </Collapse>
            </Box>
          </Paper>
        )}
      </Paper>

      {/* 步骤列表 */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          节点执行步骤
        </Typography>
        <Stepper activeStep={activeStep} orientation="vertical">
          {nodes.map((node, idx) => (
            <Step key={node.nodeId}>
              <StepLabel
                StepIconComponent={() => getNodeStatusIcon(node.status)}
                onClick={() => setActiveStep(idx)}
                sx={{ cursor: 'pointer' }}
              >
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2">{node.nodeName}</Typography>
                  <Chip size="small" label={node.status} color={getNodeStatusColor(node.status)} />
                  <Typography variant="caption" color="text.secondary">
                    {formatDuration(node.endTime - node.startTime)}
                  </Typography>
                </Box>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary">
                  {formatTimestamp(node.startTime)} → {formatTimestamp(node.endTime)}
                </Typography>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Paper>
    </Box>
  );
});

ExecutionReplay.displayName = 'ExecutionReplay';

export default ExecutionReplay;