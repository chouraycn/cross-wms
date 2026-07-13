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
  Paper,
  IconButton,
  Chip,
  Alert,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import PreviewIcon from '@mui/icons-material/Preview';
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

type BuilderMode = 'edit' | 'preview';

const ChainBuilder: React.FC<ChainBuilderProps> = ({
  chain,
  onChange,
  onSave,
  onExecute,
  onDelete,
  onDuplicate,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<BuilderMode>('edit');
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

  const moveNodeUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const nodes = [...chain.nodes];
      const temp = nodes[index];
      nodes[index] = nodes[index - 1];
      nodes[index - 1] = temp;
      onChange({ ...chain, nodes: nodes.map((n, i) => ({ ...n, order: i })) });
    },
    [chain, onChange],
  );

  const moveNodeDown = useCallback(
    (index: number) => {
      if (index >= chain.nodes.length - 1) return;
      const nodes = [...chain.nodes];
      const temp = nodes[index];
      nodes[index] = nodes[index + 1];
      nodes[index + 1] = temp;
      onChange({ ...chain, nodes: nodes.map((n, i) => ({ ...n, order: i })) });
    },
    [chain, onChange],
  );

  const getSkillById = (skillId: string): Skill | undefined => {
    return skills.find((s) => s.id === skillId);
  };

  const canMoveUp = (index: number) => index > 0;
  const canMoveDown = (index: number) => index < chain.nodes.length - 1;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">链配置</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant={mode === 'preview' ? 'contained' : 'outlined'}
            size="small"
            startIcon={<PreviewIcon />}
            onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
          >
            {mode === 'edit' ? '预览' : '编辑'}
          </Button>
        </Stack>
      </Box>

      {mode === 'edit' && (
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
              <MenuItem value="retry">重试后继续</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      )}

      <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
        步骤 ({chain.nodes.length})
      </Typography>

      {chain.nodes.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
            border: '2px dashed',
            borderColor: 'grey.300',
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            暂无步骤，请添加技能节点
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1}>
          {chain.nodes.map((node, i) => (
            <Box key={node.id}>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  position: 'relative',
                  borderLeft: `3px solid ${mode === 'preview' ? '#22C55E' : '#3B82F6'}`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  {mode === 'edit' && (
                    <Stack direction="column" spacing={0.5} sx={{ mt: 0.5 }}>
                      <Tooltip title="上移">
                        <IconButton
                          size="small"
                          onClick={() => moveNodeUp(i)}
                          disabled={!canMoveUp(i)}
                        >
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="下移">
                        <IconButton
                          size="small"
                          onClick={() => moveNodeDown(i)}
                          disabled={!canMoveDown(i)}
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          onClick={() => deleteNode(i)}
                          sx={{ color: 'error.main' }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  )}

                  <Box sx={{ flex: 1 }}>
                    {mode === 'edit' ? (
                      <ChainNodeCard
                        node={node}
                        index={i}
                        onUpdate={(n) => updateNode(i, n)}
                        onDelete={() => deleteNode(i)}
                      />
                    ) : (
                      <Box>
                        <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 1 }}>
                          <Chip
                            label={`步骤 ${i + 1}`}
                            size="small"
                            sx={{ fontSize: 10 }}
                          />
                          <Typography variant="subtitle2" fontWeight={600}>
                            {node.skillName}
                          </Typography>
                          {node.dataPassMode === 'fields' && (
                            <Chip
                              label="字段映射"
                              size="small"
                              color="warning"
                              sx={{ fontSize: 10 }}
                            />
                          )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11 }}>
                          超时: {node.timeout / 1000}秒 | 重试: {node.retryCount}次
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Paper>

              {i < chain.nodes.length - 1 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 1 }}>
                  <Box
                    sx={{
                      width: 20,
                      height: 0,
                      borderTop: '2px dashed',
                      borderColor: mode === 'preview' ? '#22C55E' : '#9CA3AF',
                    }}
                  />
                  <Box sx={{ mx: 1, fontSize: 16, color: mode === 'preview' ? '#22C55E' : '#9CA3AF' }}>
                    →
                  </Box>
                  <Box
                    sx={{
                      width: 'calc(100% - 40px)',
                      height: 0,
                      borderTop: '2px dashed',
                      borderColor: mode === 'preview' ? '#22C55E' : '#9CA3AF',
                    }}
                  />
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      )}

      {mode === 'edit' && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          fullWidth
          onClick={() => setPickerOpen(true)}
          sx={{ mt: 1, borderStyle: 'dashed' }}
        >
          添加技能节点
        </Button>
      )}

      {mode === 'preview' && chain.nodes.length > 0 && (
        <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            执行预览
          </Typography>
          <Stack direction="row" spacing={2}>
            {chain.nodes.map((node, i) => {
              const skill = getSkillById(node.skillId);
              return (
                <Box
                  key={node.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 2,
                    py: 1.5,
                    bgcolor: '#E0EBFF',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: 11 }}>
                    {i + 1}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: 12 }}>
                    {skill?.name || node.skillName}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontSize: 11 }}>
            失败策略: {chain.failStrategy === 'stop' ? '遇错停止' : chain.failStrategy === 'skip' ? '遇错跳过' : '重试后继续'}
          </Typography>
        </Box>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        {mode === 'edit' ? (
          <>
            <Button variant="contained" onClick={onSave}>
              保存
            </Button>
            <Button variant="outlined" color="success" onClick={onExecute} startIcon={<PlayArrowIcon />}>
              立即执行
            </Button>
            <Button variant="outlined" color="error" onClick={onDelete}>
              删除
            </Button>
            <Button variant="outlined" onClick={onDuplicate} startIcon={<RefreshIcon />}>
              复制
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={onExecute} startIcon={<PlayArrowIcon />}>
            执行此链
          </Button>
        )}
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
