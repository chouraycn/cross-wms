/**
 * 触发器节点组件
 * 支持定时、事件、手动、Webhook 触发
 */

import React, { memo } from 'react';
import {
  Box,
  Typography,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material';
import {
  Schedule as ScheduleIcon,
  Event as EventIcon,
  TouchApp as ManualIcon,
  Link as WebhookIcon,
} from '@mui/icons-material';
import type { WorkflowNode, TriggerConfig, TriggerType } from '../../../../server/engine/workflow/types';

const TRIGGER_TYPES: Array<{ type: TriggerType; label: string; icon: React.ReactNode }> = [
  { type: 'manual', label: '手动触发', icon: <ManualIcon /> },
  { type: 'schedule', label: '定时触发', icon: <ScheduleIcon /> },
  { type: 'event', label: '事件触发', icon: <EventIcon /> },
  { type: 'webhook', label: 'Webhook 触发', icon: <WebhookIcon /> },
];

interface TriggerNodeProps {
  node: WorkflowNode;
  onUpdate: (node: WorkflowNode) => void;
}

const TriggerNode: React.FC<TriggerNodeProps> = memo(({ node, onUpdate }) => {
  const config = (node.config as unknown as TriggerConfig) || { type: 'manual' };

  const handleTypeChange = (type: TriggerType) => {
    onUpdate({
      ...node,
      config: { type },
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        触发器类型
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {TRIGGER_TYPES.map(tt => (
          <Chip
            key={tt.type}
            label={tt.label}
            icon={tt.icon as React.ReactElement}
            onClick={() => handleTypeChange(tt.type)}
            color={config.type === tt.type ? 'primary' : 'default'}
            variant={config.type === tt.type ? 'filled' : 'outlined'}
          />
        ))}
      </Box>

      {/* 定时触发配置 */}
      {config.type === 'schedule' && (
        <Box sx={{ mt: 2 }}>
          <TextField
            label="Cron 表达式"
            value={config.schedule?.cron || ''}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  schedule: { ...config.schedule, cron: e.target.value },
                },
              })
            }
            placeholder="例如: 0 9 * * 1-5"
            fullWidth
            helperText="每天 9:00，周一到周五"
          />
          <TextField
            label="时区"
            value={config.schedule?.timezone || 'Asia/Shanghai'}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  schedule: { ...config.schedule, timezone: e.target.value },
                },
              })
            }
            fullWidth
            sx={{ mt: 1 }}
          />
        </Box>
      )}

      {/* 事件触发配置 */}
      {config.type === 'event' && (
        <Box sx={{ mt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>事件名称</InputLabel>
            <Select
              value={config.event?.eventName || ''}
              onChange={(e) =>
                onUpdate({
                  ...node,
                  config: {
                    ...config,
                    event: { ...config.event, eventName: e.target.value },
                  },
                })
              }
            >
              <MenuItem value="inventory.low_stock">库存不足预警</MenuItem>
              <MenuItem value="inbound.created">入库单创建</MenuItem>
              <MenuItem value="outbound.completed">出库完成</MenuItem>
              <MenuItem value="transit.arrived">在途到达</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}

      {/* Webhook 触发配置 */}
      {config.type === 'webhook' && (
        <Box sx={{ mt: 2 }}>
          <TextField
            label="Webhook 路径"
            value={config.webhook?.path || ''}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  webhook: { ...config.webhook, path: e.target.value },
                },
              })
            }
            placeholder="/api/webhook/my-workflow"
            fullWidth
          />
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>HTTP 方法</InputLabel>
            <Select
              value={config.webhook?.method || 'POST'}
              onChange={(e) =>
                onUpdate({
                  ...node,
                  config: {
                    ...config,
                    webhook: {
                      ...config.webhook,
                      method: e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE',
                    },
                  },
                })
              }
            >
              <MenuItem value="GET">GET</MenuItem>
              <MenuItem value="POST">POST</MenuItem>
              <MenuItem value="PUT">PUT</MenuItem>
              <MenuItem value="DELETE">DELETE</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}
    </Box>
  );
});

TriggerNode.displayName = 'TriggerNode';

export default TriggerNode;