/**
 * AutomationHistory — 执行历史 Tab
 *
 * 纯展示组件，接收筛选后的日志和回调
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
  FormControl,
  Select,
  MenuItem,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterListIcon from '@mui/icons-material/FilterList';
import ReplayIcon from '@mui/icons-material/Replay';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';

import type { AutomationExecution, TaskType } from '../../services/automation';
import {
  TASK_TYPE_LABELS,
  TASK_TYPE_COLORS,
  EXEC_STATUS_CONFIG,
} from './sharedConstants';

// ===================== Props =====================

export interface AutomationHistoryProps {
  filteredLogs: AutomationExecution[];
  totalLogs: number;
  successLogs: number;
  failedLogs: number;
  historyFilter: 'all' | 'success' | 'failed';
  historyTypeFilter: TaskType | 'all';
  onFilterChange: (filter: 'all' | 'success' | 'failed') => void;
  onTypeFilterChange: (filter: TaskType | 'all') => void;
  autoNameMap: Record<string, string>;
  onRetry: (executionId: string) => void;
  onViewDetail: (exec: AutomationExecution) => void;
  onClearLogs: () => void;
}

// ===================== Component =====================

const AutomationHistory: React.FC<AutomationHistoryProps> = ({
  filteredLogs,
  totalLogs,
  successLogs,
  failedLogs,
  historyFilter,
  historyTypeFilter,
  onFilterChange,
  onTypeFilterChange,
  autoNameMap,
  onRetry,
  onViewDetail,
  onClearLogs,
}) => {
  return (
    <>
      {/* 统计 + 筛选栏 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          icon={<HistoryIcon sx={{ fontSize: 16 }} />}
          label={`共 ${totalLogs} 条`}
          size="small"
          sx={{ backgroundColor: '#F3F4F6', color: '#374151', fontWeight: 500, fontSize: '0.75rem' }}
        />
        <Chip
          icon={<CheckCircleOutlineIcon sx={{ fontSize: 14 }} />}
          label={`${successLogs} 成功`}
          size="small"
          sx={{ backgroundColor: '#ECFDF5', color: '#059669', fontWeight: 500, fontSize: '0.75rem' }}
        />
        <Chip
          icon={<ErrorOutlineIcon sx={{ fontSize: 14 }} />}
          label={`${failedLogs} 失败`}
          size="small"
          sx={{ backgroundColor: '#FEF2F2', color: '#EF4444', fontWeight: 500, fontSize: '0.75rem' }}
        />

        <Box sx={{ flex: 1 }} />

        {/* 状态筛选 */}
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <FilterListIcon sx={{ fontSize: 14, color: '#9CA3AF', mr: 0.5 }} />
          {(['all', 'success', 'failed'] as const).map((key) => (
            <Chip
              key={key}
              label={key === 'all' ? '全部' : key === 'success' ? '成功' : '失败'}
              size="small"
              onClick={() => onFilterChange(key)}
              sx={{
                fontSize: '0.7rem',
                height: 24,
                backgroundColor: historyFilter === key ? '#111827' : '#F3F4F6',
                color: historyFilter === key ? '#fff' : '#374151',
                '&:hover': { backgroundColor: historyFilter === key ? '#374151' : '#E5E7EB' },
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </Box>

        {/* 任务类型筛选 */}
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select
            value={historyTypeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value as TaskType | 'all')}
            sx={{ fontSize: '0.75rem', borderRadius: '8px', height: 28 }}
          >
            <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>全部类型</MenuItem>
            {Object.entries(TASK_TYPE_LABELS).map(([key, label]) => (
              <MenuItem key={key} value={key} sx={{ fontSize: '0.75rem' }}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 清空日志 */}
        {totalLogs > 0 && (
          <Tooltip title="清空日志">
            <IconButton
              size="small"
              onClick={onClearLogs}
              sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
            >
              <DeleteSweepIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* 执行历史列表 */}
      {filteredLogs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <HistoryIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1.5 }} />
          <Typography sx={{ fontSize: '0.9375rem', color: '#6B7280', mb: 0.5, fontWeight: 500 }}>
            暂无执行记录
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
            配置并运行自动化任务后，执行记录将在此展示
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {filteredLogs.map((log) => {
            const statusCfg = EXEC_STATUS_CONFIG[log.status] || EXEC_STATUS_CONFIG.running;
            const taskColor = TASK_TYPE_COLORS[log.taskType] || '#6B7280';
            const autoName = autoNameMap[log.automationId] || '未知任务';

            return (
              <Card
                key={log.id}
                elevation={0}
                sx={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 1.5,
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: '#9CA3AF',
                    backgroundColor: '#FAFAFA',
                  },
                }}
                onClick={() => onViewDetail(log)}
              >
                <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {/* 状态图标 */}
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: 1.5,
                        backgroundColor: statusCfg.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: statusCfg.color,
                      }}
                    >
                      <statusCfg.Icon sx={{ fontSize: 14 }} />
                    </Box>

                    {/* 内容 */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography
                          sx={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: '#111827',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {autoName}
                        </Typography>
                        <Chip
                          label={TASK_TYPE_LABELS[log.taskType] || '自定义'}
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
                          label={statusCfg.label}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            backgroundColor: statusCfg.bg,
                            color: statusCfg.color,
                          }}
                        />
                        {log.isRetry && (
                          <Chip
                            label="重试"
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.625rem',
                              fontWeight: 500,
                              backgroundColor: '#DBEAFE',
                              color: '#2563EB',
                            }}
                          />
                        )}
                      </Box>
                      <Typography sx={{ fontSize: '0.7rem', color: '#6B7280', mt: 0.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.result || '—'}
                      </Typography>
                    </Box>

                    {/* 操作 + 时间 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                      {log.status === 'failed' && (
                        <Tooltip title="重试">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); onRetry(log.id); }}
                            sx={{ color: '#D97706', '&:hover': { backgroundColor: '#FFFBEB' } }}
                          >
                            <ReplayIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                          {new Date(log.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </Typography>
                        {log.duration !== null && (
                          <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
                            {log.duration < 1000 ? `${log.duration}ms` : `${(log.duration / 1000).toFixed(1)}s`}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </>
  );
};

export default AutomationHistory;
