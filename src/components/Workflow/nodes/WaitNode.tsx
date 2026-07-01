/**
 * 等待节点组件
 * 支持时间等待、事件等待、条件等待
 */

import React, { memo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Chip,
} from '@mui/material';
import {
  Timer as TimerIcon,
  Event as EventIcon,
  CheckCircle as ConditionIcon,
} from '@mui/icons-material';
import type { WorkflowNode, WaitConfig } from '../../../../server/engine/workflow/types';

const WAIT_TYPES: Array<{ type: 'duration' | 'event' | 'condition'; label: string; icon: React.ReactNode }> = [
  { type: 'duration', label: '时间等待', icon: <TimerIcon /> },
  { type: 'event', label: '事件等待', icon: <EventIcon /> },
  { type: 'condition', label: '条件等待', icon: <ConditionIcon /> },
];

interface WaitNodeProps {
  node: WorkflowNode;
  onUpdate: (node: WorkflowNode) => void;
}

const WaitNode: React.FC<WaitNodeProps> = memo(({ node, onUpdate }) => {
  const config = (node.config as unknown as WaitConfig) || { type: 'duration' };

  const handleTypeChange = (type: 'duration' | 'event' | 'condition') => {
    onUpdate({
      ...node,
      config: { type },
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        等待类型
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {WAIT_TYPES.map(wt => (
          <Chip
            key={wt.type}
            label={wt.label}
            icon={wt.icon as React.ReactElement}
            onClick={() => handleTypeChange(wt.type)}
            color={config.type === wt.type ? 'primary' : 'default'}
            variant={config.type === wt.type ? 'filled' : 'outlined'}
          />
        ))}
      </Box>

      {/* 时间等待配置 */}
      {config.type === 'duration' && (
        <Box sx={{ mt: 2 }}>
          <TextField
            label="等待时间（毫秒）"
            type="number"
            value={config.duration || 1000}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  duration: Number(e.target.value),
                },
              })
            }
            fullWidth
            helperText="例如: 60000 = 1分钟"
          />
        </Box>
      )}

      {/* 事件等待配置 */}
      {config.type === 'event' && (
        <Box sx={{ mt: 2 }}>
          <TextField
            label="等待事件名称"
            value={config.event || ''}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  event: e.target.value,
                },
              })
            }
            placeholder="例如: approval.approved"
            fullWidth
            helperText="等待指定事件触发后继续执行"
          />
        </Box>
      )}

      {/* 条件等待配置 */}
      {config.type === 'condition' && (
        <Box sx={{ mt: 2 }}>
          <TextField
            label="等待条件表达式"
            value={config.condition || ''}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  condition: e.target.value,
                },
              })
            }
            placeholder="例如: status === 'completed'"
            fullWidth
            helperText="条件为 true 时继续执行"
          />
        </Box>
      )}
    </Box>
  );
});

WaitNode.displayName = 'WaitNode';

export default WaitNode;