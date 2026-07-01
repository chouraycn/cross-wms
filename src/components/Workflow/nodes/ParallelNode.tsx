/**
 * 并行节点组件
 * 支持多分支并行执行
 */

import React, { memo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Chip,
  IconButton,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import type { WorkflowNode, ParallelConfig } from '../../../../server/engine/workflow/types';

interface ParallelNodeProps {
  node: WorkflowNode;
  onUpdate: (node: WorkflowNode) => void;
}

const ParallelNode: React.FC<ParallelNodeProps> = memo(({ node, onUpdate }) => {
  const config = (node.config as unknown as ParallelConfig) || { branches: [], mode: 'all' };

  const handleAddBranch = () => {
    onUpdate({
      ...node,
      config: {
        ...config,
        branches: [...config.branches, ''],
      },
    });
  };

  const handleRemoveBranch = (index: number) => {
    onUpdate({
      ...node,
      config: {
        ...config,
        branches: config.branches.filter((_, i) => i !== index),
      },
    });
  };

  const handleUpdateBranch = (index: number, value: string) => {
    const newBranches = [...config.branches];
    newBranches[index] = value;

    onUpdate({
      ...node,
      config: {
        ...config,
        branches: newBranches,
      },
    });
  };

  const handleModeChange = (mode: 'all' | 'any' | 'race') => {
    onUpdate({
      ...node,
      config: {
        ...config,
        mode,
      },
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        并行执行模式
      </Typography>

      {/* 执行模式选择 */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Chip
          label="全部完成 (ALL)"
          onClick={() => handleModeChange('all')}
          color={config.mode === 'all' ? 'primary' : 'default'}
        />
        <Chip
          label="任意完成 (ANY)"
          onClick={() => handleModeChange('any')}
          color={config.mode === 'any' ? 'primary' : 'default'}
        />
        <Chip
          label="竞争模式 (RACE)"
          onClick={() => handleModeChange('race')}
          color={config.mode === 'race' ? 'primary' : 'default'}
        />
      </Box>

      {/* 分支节点列表 */}
      <Typography variant="subtitle2" gutterBottom>
        分支节点 ID
      </Typography>
      {config.branches.map((branchId, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            label={`分支 ${index + 1}`}
            value={branchId}
            onChange={(e) => handleUpdateBranch(index, e.target.value)}
            size="small"
            fullWidth
          />
          <IconButton size="small" onClick={() => handleRemoveBranch(index)}>
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}

      {/* 添加分支按钮 */}
      <IconButton size="small" onClick={handleAddBranch}>
        <AddIcon />
      </IconButton>
    </Box>
  );
});

ParallelNode.displayName = 'ParallelNode';

export default ParallelNode;