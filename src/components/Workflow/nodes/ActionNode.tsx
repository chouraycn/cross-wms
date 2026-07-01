/**
 * 动作节点组件
 * 支持 AI 调用、工具执行、通知等
 */

import React, { memo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
} from '@mui/material';
import {
  SmartToy as AIIcon,
  Build as ToolIcon,
  Notifications as NotificationIcon,
  Code as ScriptIcon,
} from '@mui/icons-material';
import type { WorkflowNode, ActionConfig, ActionType } from '../../../../server/engine/workflow/types';

const ACTION_TYPES: Array<{ type: ActionType; label: string; icon: React.ReactNode }> = [
  { type: 'ai_call', label: 'AI 调用', icon: <AIIcon /> },
  { type: 'tool_execution', label: '工具执行', icon: <ToolIcon /> },
  { type: 'notification', label: '通知', icon: <NotificationIcon /> },
  { type: 'script', label: '脚本执行', icon: <ScriptIcon /> },
];

interface ActionNodeProps {
  node: WorkflowNode;
  onUpdate: (node: WorkflowNode) => void;
}

const ActionNode: React.FC<ActionNodeProps> = memo(({ node, onUpdate }) => {
  const config = (node.config as unknown as ActionConfig) || { type: 'ai_call', params: {} };

  const handleTypeChange = (type: ActionType) => {
    onUpdate({
      ...node,
      config: {
        ...config,
        type,
        params: {},
      },
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        动作类型
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {ACTION_TYPES.map(at => (
          <Chip
            key={at.type}
            label={at.label}
            icon={at.icon as React.ReactElement}
            onClick={() => handleTypeChange(at.type)}
            color={config.type === at.type ? 'primary' : 'default'}
            variant={config.type === at.type ? 'filled' : 'outlined'}
          />
        ))}
      </Box>

      {/* AI 调用配置 */}
      {config.type === 'ai_call' && (
        <Box sx={{ mt: 2 }}>
          <TextField
            label="AI 模型"
            value={(config.params as any).model || ''}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  params: { ...config.params, model: e.target.value },
                },
              })
            }
            placeholder="例如: gpt-4, claude-3-opus"
            fullWidth
          />
          <TextField
            label="提示词"
            value={(config.params as any).prompt || ''}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  params: { ...config.params, prompt: e.target.value },
                },
              })
            }
            multiline
            rows={3}
            fullWidth
            sx={{ mt: 1 }}
          />
        </Box>
      )}

      {/* 工具执行配置 */}
      {config.type === 'tool_execution' && (
        <Box sx={{ mt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>选择工具</InputLabel>
            <Select
              value={(config.params as any).toolId || ''}
              onChange={(e) =>
                onUpdate({
                  ...node,
                  config: {
                    ...config,
                    params: { ...config.params, toolId: e.target.value },
                  },
                })
              }
            >
              <MenuItem value="inventory-query">库存查询</MenuItem>
              <MenuItem value="report-generator">报表生成</MenuItem>
              <MenuItem value="data-export">数据导出</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}

      {/* 通知配置 */}
      {config.type === 'notification' && (
        <Box sx={{ mt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>通知方式</InputLabel>
            <Select
              value={(config.params as any).channel || ''}
              onChange={(e) =>
                onUpdate({
                  ...node,
                  config: {
                    ...config,
                    params: { ...config.params, channel: e.target.value },
                  },
                })
              }
            >
              <MenuItem value="email">邮件</MenuItem>
              <MenuItem value="sms">短信</MenuItem>
              <MenuItem value="wechat">企业微信</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="通知内容"
            value={(config.params as any).message || ''}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  params: { ...config.params, message: e.target.value },
                },
              })
            }
            multiline
            rows={2}
            fullWidth
            sx={{ mt: 1 }}
          />
        </Box>
      )}

      {/* 脚本执行配置 */}
      {config.type === 'script' && (
        <Box sx={{ mt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>脚本语言</InputLabel>
            <Select
              value={(config.params as any).language || 'javascript'}
              onChange={(e) =>
                onUpdate({
                  ...node,
                  config: {
                    ...config,
                    params: { ...config.params, language: e.target.value },
                  },
                })
              }
            >
              <MenuItem value="javascript">JavaScript</MenuItem>
              <MenuItem value="python">Python</MenuItem>
              <MenuItem value="bash">Bash</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="脚本内容"
            value={(config.params as any).script || ''}
            onChange={(e) =>
              onUpdate({
                ...node,
                config: {
                  ...config,
                  params: { ...config.params, script: e.target.value },
                },
              })
            }
            multiline
            rows={5}
            fullWidth
            sx={{ mt: 1 }}
          />
        </Box>
      )}

      {/* 重试策略 */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          重试策略
        </Typography>
        <TextField
          label="最大重试次数"
          type="number"
          value={config.retryPolicy?.maxRetries || 0}
          onChange={(e) =>
            onUpdate({
              ...node,
              config: {
                ...config,
                retryPolicy: {
                  ...config.retryPolicy,
                  maxRetries: Number(e.target.value),
                },
              },
            })
          }
          size="small"
          sx={{ width: 120 }}
        />
        <TextField
          label="重试间隔（ms）"
          type="number"
          value={config.retryPolicy?.retryDelay || 1000}
          onChange={(e) =>
            onUpdate({
              ...node,
              config: {
                ...config,
                retryPolicy: {
                  ...config.retryPolicy,
                  retryDelay: Number(e.target.value),
                },
              },
            })
          }
          size="small"
          sx={{ width: 120, ml: 1 }}
        />
      </Box>
    </Box>
  );
});

ActionNode.displayName = 'ActionNode';

export default ActionNode;