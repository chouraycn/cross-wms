/**
 * AutomationList — 已配置 Tab 的列表渲染
 *
 * 纯展示组件，接收数据和回调，不含业务逻辑
 */

import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Chip,
  Switch,
  Button,
  LinearProgress,
  Collapse,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SyncIcon from '@mui/icons-material/Sync';
import SearchInput from '../Common/SearchInput';
import CodeIcon from '@mui/icons-material/Code';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import BoltIcon from '@mui/icons-material/Bolt';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

import type { Automation, AutomationExecution } from '../../services/automation';
import { SpinningIcon } from '../../components/shared/SpinningIcon';
import {
  TASK_TYPE_LABELS,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
} from './sharedConstants';

// ===================== Props =====================

export interface AutomationListProps {
  automations: Automation[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeCount: number;
  pausedCount: number;
  onCreateClick: () => void;
  onEdit: (auto: Automation) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onTriggerNow: (id: string) => void;
  onToggleExpand: (id: string) => void;
  expandedIds: Set<string>;
  triggeringIds: Set<string>;
  runningIds: Set<string>;
  executionLogs: Record<string, AutomationExecution[]>;
  onViewDetail: (exec: AutomationExecution) => void;
  onSwitchToTemplates: () => void;
}

// ===================== Helpers =====================

/** 渲染单条执行日志条目 */
const renderExecLog = (exec: AutomationExecution, onViewDetail: (exec: AutomationExecution) => void, gs: ReturnType<typeof getGrayScale>) => {
  const isSuccess = exec.status === 'success';
  const isFailed = exec.status === 'failed';
  const statusColor = isSuccess ? '#059669' : isFailed ? '#EF4444' : '#D97706';
  const StatusIcon = isSuccess ? CheckCircleOutlineIcon : isFailed ? ErrorOutlineIcon : HourglassEmptyIcon;

  return (
    <Box
      key={exec.id}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 0.75,
        px: 1,
        borderRadius: 1,
        cursor: 'pointer',
        '&:hover': { backgroundColor: gs.bgHover },
      }}
      onClick={() => onViewDetail(exec)}
    >
      <StatusIcon sx={{ fontSize: 14, color: statusColor, mt: 0.25, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.7rem', color: gs.textPrimary, fontWeight: 500, lineHeight: 1.3 }}>
          {exec.result || (exec.status === 'running' ? '执行中...' : '无结果')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, mt: 0.25 }}>
          <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled }}>
            {exec.completedAt ? new Date(exec.completedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
          </Typography>
          {exec.duration !== null && (
            <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled }}>
              {exec.duration < 1000 ? `${exec.duration}ms` : `${(exec.duration / 1000).toFixed(1)}s`}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};

// ===================== Component =====================

const AutomationList: React.FC<AutomationListProps> = ({
  automations,
  searchQuery,
  onSearchChange,
  activeCount,
  pausedCount,
  onCreateClick,
  onEdit,
  onDelete,
  onToggleStatus,
  onTriggerNow,
  onToggleExpand,
  expandedIds,
  triggeringIds,
  runningIds,
  executionLogs,
  onViewDetail,
  onSwitchToTemplates,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  // ---- Filter ----
  const filtered = automations.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.prompt.toLowerCase().includes(q);
  });

  return (
    <>
      {/* 统计 + 操作栏 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          icon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
          label={`${activeCount} 运行中`}
          size="small"
          sx={{ backgroundColor: '#ECFDF5', color: '#059669', fontWeight: 500, fontSize: '0.75rem' }}
        />
        <Chip
          icon={<PauseIcon sx={{ fontSize: 16 }} />}
          label={`${pausedCount} 已暂停`}
          size="small"
          sx={{ backgroundColor: '#FEF3C7', color: '#D97706', fontWeight: 500, fontSize: '0.75rem' }}
        />
        <Box sx={{ flex: 1 }} />
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="搜索..."
          width={180}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateClick}
          sx={{
            backgroundColor: gs.textPrimary,
            '&:hover': { backgroundColor: gs.textSecondary },
            textTransform: 'none',
            borderRadius: '8px',
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}
        >
          新建自动化
        </Button>
      </Box>

      {/* 任务列表 */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <BoltIcon sx={{ fontSize: 48, color: gs.borderDarker, mb: 1.5 }} />
          <Typography sx={{ fontSize: '0.9375rem', color: gs.textMuted, mb: 0.5, fontWeight: 500 }}>
            {automations.length === 0 ? '暂无自动化任务' : '未找到匹配的任务'}
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled, mb: 2 }}>
            {automations.length === 0 ? '切换到「任务模板」Tab 快速创建' : '尝试调整搜索关键词'}
          </Typography>
          {automations.length === 0 && (
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
              onClick={onSwitchToTemplates}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                borderColor: gs.border,
                color: gs.textSecondary,
                '&:hover': { borderColor: gs.textPrimary, backgroundColor: gs.bgHover },
              }}
            >
              浏览模板
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((auto) => {
            const isExpanded = expandedIds.has(auto.id);
            const isTriggering = triggeringIds.has(auto.id);
            const isRunning = runningIds.has(auto.id);
            const logs = executionLogs[auto.id] || [];
            const taskColor = TASK_TYPE_COLORS[auto.taskType] || gs.textMuted;
            const isExpired = auto.validUntil && new Date(auto.validUntil) < new Date();

            return (
              <Card
                key={auto.id}
                elevation={0}
                sx={{
                  border: `1px solid ${gs.border}`,
                  borderRadius: 2,
                  transition: 'all 0.15s ease',
                  opacity: auto.status === 'PAUSED' ? 0.65 : isExpired ? 0.5 : 1,
                  ...(isRunning ? {
                    borderColor: taskColor,
                    boxShadow: `0 0 0 1px ${taskColor}20`,
                  } : {}),
                  '&:hover': {
                    borderColor: gs.textDisabled,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                  },
                }}
              >
                <CardContent sx={{ py: 1.25, px: 2, '&:last-child': { pb: 1.25 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {/* 图标 */}
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: 1.5,
                        backgroundColor: isRunning ? `${taskColor}20` : auto.status === 'ACTIVE' ? `${taskColor}12` : gs.bgHover,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: isRunning ? taskColor : auto.status === 'ACTIVE' ? taskColor : gs.textDisabled,
                        position: 'relative',
                      }}
                    >
                      {isRunning ? (
                        <SpinningIcon spinning={true}>
                          <SyncIcon sx={{ fontSize: 16 }} />
                        </SpinningIcon>
                      ) : (
                        TASK_TYPE_ICONS[auto.taskType] || <CodeIcon sx={{ fontSize: 16 }} />
                      )}
                      {/* 运行中脉冲 */}
                      {isRunning && (
                        <Box sx={{
                          position: 'absolute',
                          inset: -2,
                          borderRadius: 2,
                          border: `2px solid ${taskColor}`,
                          opacity: 0.5,
                        }} />
                      )}
                    </Box>

                    {/* 内容 */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography
                          sx={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: gs.textPrimary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {auto.name}
                        </Typography>
                        <Chip
                          label={TASK_TYPE_LABELS[auto.taskType] || '自定义'}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            backgroundColor: `${taskColor}12`,
                            color: taskColor,
                          }}
                        />
                        <Chip
                          label={isRunning ? '执行中' : auto.status === 'ACTIVE' ? '运行中' : '已暂停'}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            backgroundColor: isRunning ? '#DBEAFE' : auto.status === 'ACTIVE' ? '#ECFDF5' : '#FEF3C7',
                            color: isRunning ? '#2563EB' : auto.status === 'ACTIVE' ? '#059669' : '#D97706',
                          }}
                        />
                        {isExpired && (
                          <Chip label="已过期" size="small" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 500, backgroundColor: '#FEF2F2', color: '#EF4444' }} />
                        )}
                      </Box>
                      <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mt: 0.15 }}>
                        {auto.scheduleLabel}
                        {auto.validFrom && ` · 自 ${auto.validFrom.slice(0, 10)}`}
                        {auto.validUntil && ` · 至 ${auto.validUntil.slice(0, 10)}`}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mt: 0.25 }}>
                        {auto.nextRunAt && !isRunning && (
                          <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AccessTimeIcon sx={{ fontSize: 11 }} />
                            下次: {new Date(auto.nextRunAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        )}
                        {isRunning && (
                          <Typography sx={{ fontSize: '0.65rem', color: taskColor, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 500 }}>
                            <FiberManualRecordIcon sx={{ fontSize: 8 }} />
                            正在执行...
                          </Typography>
                        )}
                        {auto.runCount > 0 && (
                          <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled }}>
                            已执行 {auto.runCount} 次
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {/* 操作 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      <Tooltip title="立即执行">
                        <IconButton
                          size="small"
                          onClick={() => onTriggerNow(auto.id)}
                          disabled={isTriggering || isRunning}
                          sx={{
                            color: taskColor,
                            '&:hover': { backgroundColor: `${taskColor}10` },
                            '&.Mui-disabled': { color: gs.borderDarker },
                          }}
                        >
                          <PlayArrowIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={isExpanded ? '收起日志' : '查看日志'}>
                        <IconButton
                          size="small"
                          onClick={() => onToggleExpand(auto.id)}
                          sx={{ color: gs.textDisabled }}
                        >
                          {isExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={auto.status === 'ACTIVE' ? '暂停' : '启用'}>
                        <Switch
                          checked={auto.status === 'ACTIVE'}
                          onChange={() => onToggleStatus(auto.id)}
                          size="small"
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#059669' },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#059669' },
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="编辑">
                        <IconButton size="small" onClick={() => onEdit(auto)} sx={{ color: gs.textDisabled }}>
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          onClick={() => onDelete(auto.id)}
                          sx={{ color: gs.textDisabled, '&:hover': { color: '#EF4444' } }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  {/* 执行中进度条 */}
                  {isRunning && (
                    <Box sx={{ mt: 1 }}>
                      <LinearProgress sx={{ height: 2, borderRadius: 1, backgroundColor: gs.bgHover, '& .MuiLinearProgress-bar': { backgroundColor: taskColor } }} />
                    </Box>
                  )}

                  {/* 执行日志 */}
                  <Collapse in={isExpanded} timeout="auto">
                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${gs.bgHover}` }}>
                      <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, fontWeight: 500, mb: 0.5 }}>
                        最近执行记录
                      </Typography>
                      {logs.length === 0 ? (
                        <Typography sx={{ fontSize: '0.65rem', color: gs.borderDarker, py: 1, textAlign: 'center' }}>
                          暂无执行记录
                        </Typography>
                      ) : (
                        logs.map((exec) => renderExecLog(exec, onViewDetail, gs))
                      )}
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </>
  );
};

export default AutomationList;
