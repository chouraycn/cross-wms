/**
 * 条件节点组件
 * 支持 if/else/switch 条件判断
 */

import React, { memo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Chip,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import type { WorkflowNode, ConditionConfig, ConditionOperator } from '../../../../server/engine/workflow/types';

const CONDITION_OPERATORS: Array<{ operator: ConditionOperator; label: string }> = [
  { operator: 'equals', label: '等于' },
  { operator: 'not_equals', label: '不等于' },
  { operator: 'contains', label: '包含' },
  { operator: 'greater_than', label: '大于' },
  { operator: 'less_than', label: '小于' },
  { operator: 'exists', label: '存在' },
  { operator: 'not_exists', label: '不存在' },
];

interface ConditionNodeProps {
  node: WorkflowNode;
  onUpdate: (node: WorkflowNode) => void;
}

const ConditionNode: React.FC<ConditionNodeProps> = memo(({ node, onUpdate }) => {
  const config = (node.config as unknown as ConditionConfig) || { conditions: [], logic: 'and' };

  const handleAddCondition = () => {
    onUpdate({
      ...node,
      config: {
        ...config,
        conditions: [
          ...config.conditions,
          { variable: '', operator: 'equals', value: '' },
        ],
      },
    });
  };

  const handleRemoveCondition = (index: number) => {
    onUpdate({
      ...node,
      config: {
        ...config,
        conditions: config.conditions.filter((_, i) => i !== index),
      },
    });
  };

  const handleUpdateCondition = (index: number, field: string, value: unknown) => {
    const newConditions = [...config.conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };

    onUpdate({
      ...node,
      config: {
        ...config,
        conditions: newConditions,
      },
    });
  };

  const handleLogicChange = (logic: 'and' | 'or') => {
    onUpdate({
      ...node,
      config: {
        ...config,
        logic,
      },
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        条件设置
      </Typography>

      {/* 逻辑运算符选择 */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Chip
          label="全部满足 (AND)"
          onClick={() => handleLogicChange('and')}
          color={config.logic === 'and' ? 'primary' : 'default'}
        />
        <Chip
          label="任意满足 (OR)"
          onClick={() => handleLogicChange('or')}
          color={config.logic === 'or' ? 'primary' : 'default'}
        />
      </Box>

      {/* 条件列表 */}
      {config.conditions.map((condition, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            label="变量名"
            value={condition.variable}
            onChange={(e) => handleUpdateCondition(index, 'variable', e.target.value)}
            size="small"
            sx={{ width: 150 }}
          />
          <FormControl size="small" sx={{ width: 120 }}>
            <InputLabel>操作符</InputLabel>
            <Select
              value={condition.operator}
              onChange={(e) => handleUpdateCondition(index, 'operator', e.target.value)}
            >
              {CONDITION_OPERATORS.map(op => (
                <MenuItem key={op.operator} value={op.operator}>
                  {op.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="值"
            value={String(condition.value)}
            onChange={(e) => handleUpdateCondition(index, 'value', e.target.value)}
            size="small"
            sx={{ width: 150 }}
          />
          <IconButton size="small" onClick={() => handleRemoveCondition(index)}>
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}

      {/* 添加条件按钮 */}
      <IconButton size="small" onClick={handleAddCondition}>
        <AddIcon />
      </IconButton>

      {/* 分支节点选择 */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          分支节点（可选）
        </Typography>
        <TextField
          label="True 分支节点 ID"
          value={config.branches?.true || ''}
          onChange={(e) =>
            onUpdate({
              ...node,
              config: {
                ...config,
                branches: {
                  ...config.branches,
                  true: e.target.value,
                  false: config.branches?.false || '',
                },
              },
            })
          }
          size="small"
          fullWidth
          sx={{ mb: 1 }}
        />
        <TextField
          label="False 分支节点 ID"
          value={config.branches?.false || ''}
          onChange={(e) =>
            onUpdate({
              ...node,
              config: {
                ...config,
                branches: {
                  ...config.branches,
                  true: config.branches?.true || '',
                  false: e.target.value,
                },
              },
            })
          }
          size="small"
          fullWidth
        />
      </Box>
    </Box>
  );
});

ConditionNode.displayName = 'ConditionNode';

export default ConditionNode;