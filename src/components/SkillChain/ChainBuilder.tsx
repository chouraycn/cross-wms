import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { SkillChain, SkillChainNode, FailStrategy } from '../../types/skill';
import type { Skill } from '../../types/skill';
import ChainNodeCard from './ChainNodeCard';
import SkillPickerDialog from './SkillPickerDialog';
import { getAllSkills } from '../../stores/skillStore';

interface ChainBuilderProps {
  chain: SkillChain;
  onChange: (chain: SkillChain) => void;
  onSave: () => void;
  onExecute: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const ChainBuilder: React.FC<ChainBuilderProps> = ({
  chain,
  onChange,
  onSave,
  onExecute,
  onDelete,
  onDuplicate,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const skills = getAllSkills();

  const addNode = useCallback(
    (skill: Skill) => {
      const newNode: SkillChainNode = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString() + Math.random(),
        skillId: skill.id,
        skillName: skill.name,
        skillIcon: skill.icon || 'Extension',
        dataPassMode: 'full',
        timeout: 30000,
        retryCount: 0,
        order: chain.nodes.length,
      };
      onChange({ ...chain, nodes: [...chain.nodes, newNode] });
    },
    [chain, onChange],
  );

  const updateNode = useCallback(
    (index: number, node: SkillChainNode) => {
      const nodes = [...chain.nodes];
      nodes[index] = node;
      onChange({ ...chain, nodes });
    },
    [chain, onChange],
  );

  const deleteNode = useCallback(
    (index: number) => {
      const nodes = chain.nodes
        .filter((_n, i) => i !== index)
        .map((n, i) => ({ ...n, order: i }));
      onChange({ ...chain, nodes });
    },
    [chain, onChange],
  );

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        链配置
      </Typography>

      <Stack spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="链名称"
          value={chain.name}
          onChange={(e) => onChange({ ...chain, name: e.target.value })}
          fullWidth
          size="small"
        />
        <TextField
          label="描述"
          value={chain.description}
          onChange={(e) => onChange({ ...chain, description: e.target.value })}
          fullWidth
          size="small"
          multiline
          rows={2}
        />
        <FormControl size="small" sx={{ width: 180 }}>
          <InputLabel>失败策略</InputLabel>
          <Select
            value={chain.failStrategy}
            label="失败策略"
            onChange={(e) =>
              onChange({ ...chain, failStrategy: e.target.value as FailStrategy })
            }
          >
            <MenuItem value="stop">遇错停止</MenuItem>
            <MenuItem value="skip">遇错跳过</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
        步骤 ({chain.nodes.length})
      </Typography>

      {chain.nodes.map((node, i) => (
        <ChainNodeCard
          key={node.id}
          node={node}
          index={i}
          onUpdate={(n) => updateNode(i, n)}
          onDelete={() => deleteNode(i)}
        />
      ))}

      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        fullWidth
        onClick={() => setPickerOpen(true)}
        sx={{ mt: 1, borderStyle: 'dashed' }}
      >
        添加技能节点
      </Button>

      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        <Button variant="contained" onClick={onSave}>
          保存
        </Button>
        <Button variant="outlined" color="success" onClick={onExecute}>
          立即执行
        </Button>
        <Button variant="outlined" color="error" onClick={onDelete}>
          删除
        </Button>
        <Button variant="outlined" onClick={onDuplicate}>
          复制
        </Button>
      </Stack>

      <SkillPickerDialog
        open={pickerOpen}
        skills={skills}
        onSelect={addNode}
        onClose={() => setPickerOpen(false)}
      />
    </Box>
  );
};

export default ChainBuilder;
