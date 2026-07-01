/**
 * 循环节点组件
 * 支持数组迭代循环
 */

import React, { memo } from 'react';
import {
  Box,
  Typography,
  TextField,
} from '@mui/material';
import type { WorkflowNode, LoopConfig } from '../../../../server/engine/workflow/types';

interface LoopNodeProps {
  node: WorkflowNode;
  onUpdate: (node: WorkflowNode) => void;
}

const LoopNode: React.FC<LoopNodeProps> = memo(({ node, onUpdate }) => {
  const config = (node.config as unknown as LoopConfig) || { iteratorSource: '', iteratorVariable: 'item', bodyNodeId: '' };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        循环设置
      </Typography>

      <TextField
        label="循环数据源（变量名）"
        value={config.iteratorSource}
        onChange={(e) =>
          onUpdate({
            ...node,
            config: {
              ...config,
              iteratorSource: e.target.value,
            },
          })
        }
        placeholder="例如: items, data.list"
        fullWidth
        helperText="数据源必须是数组类型的变量"
      />

      <TextField
        label="循环变量名"
        value={config.iteratorVariable}
        onChange={(e) =>
          onUpdate({
            ...node,
            config: {
              ...config,
              iteratorVariable: e.target.value,
            },
          })
        }
        placeholder="例如: item, element"
        fullWidth
        sx={{ mt: 1 }}
        helperText="每次循环时的变量名，可在循环体中使用"
      />

      <TextField
        label="循环体节点 ID"
        value={config.bodyNodeId}
        onChange={(e) =>
          onUpdate({
            ...node,
            config: {
              ...config,
              bodyNodeId: e.target.value,
            },
          })
        }
        fullWidth
        sx={{ mt: 1 }}
        helperText="指定循环体要执行的节点"
      />

      <TextField
        label="最大循环次数"
        type="number"
        value={config.maxIterations || 100}
        onChange={(e) =>
          onUpdate({
            ...node,
            config: {
              ...config,
              maxIterations: Number(e.target.value),
            },
          })
        }
        fullWidth
        sx={{ mt: 1 }}
        helperText="防止无限循环，默认 100 次"
      />
    </Box>
  );
});

LoopNode.displayName = 'LoopNode';

export default LoopNode;