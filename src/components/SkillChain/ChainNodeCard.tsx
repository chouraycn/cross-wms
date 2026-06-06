import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Select,
  MenuItem,
  TextField,
  IconButton,
  FormControl,
  InputLabel,
  Box,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { SkillChainNode, DataPassMode } from '../../types/skill';

interface ChainNodeCardProps {
  node: SkillChainNode;
  index: number;
  onUpdate: (node: SkillChainNode) => void;
  onDelete: () => void;
}

const ChainNodeCard: React.FC<ChainNodeCardProps> = ({ node, index, onUpdate, onDelete }) => {
  return (
    <Card
      sx={{
        mb: 1,
        border: '1px solid #E5E7EB',
        boxShadow: 'none',
        '&:hover': { borderColor: '#2563EB' },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <DragIndicatorIcon sx={{ color: '#D1D5DB', fontSize: 20, cursor: 'grab' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            步骤 {index + 1}：{node.skillName}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" onClick={onDelete}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>数据传递</InputLabel>
            <Select
              value={node.dataPassMode}
              label="数据传递"
              onChange={(e) =>
                onUpdate({ ...node, dataPassMode: e.target.value as DataPassMode })
              }
            >
              <MenuItem value="full">完整上下文</MenuItem>
              <MenuItem value="fields">仅指定字段</MenuItem>
              <MenuItem value="custom">自定义映射</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="超时(ms)"
            type="number"
            sx={{ width: 100 }}
            value={node.timeout}
            onChange={(e) => onUpdate({ ...node, timeout: Number(e.target.value) })}
          />
          <TextField
            size="small"
            label="重试次数"
            type="number"
            sx={{ width: 100 }}
            value={node.retryCount}
            onChange={(e) => onUpdate({ ...node, retryCount: Number(e.target.value) })}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

export default ChainNodeCard;
