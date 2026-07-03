import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, CircularProgress,
  useTheme, Alert, Stack, List, ListItem, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Tabs, Tab, Card, CardContent, Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import RuleIcon from '@mui/icons-material/Rule';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type { AgentInfo, AgentIdentity, AgentScenario } from '../services/api';
import {
  fetchAgents, fetchAgentIdentities, fetchAgentScenarios,
  createAgentIdentity, updateAgentIdentity, deleteAgentIdentity,
} from '../services/api';

const AgentsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [tab, setTab] = useState(0);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [identities, setIdentities] = useState<AgentIdentity[]>([]);
  const [scenarios, setScenarios] = useState<AgentScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<AgentIdentity | null>(null);
  const [formData, setFormData] = useState<Partial<AgentIdentity>>({
    id: '',
    name: '',
    role: '',
    description: '',
    systemPrompt: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsData, identitiesData, scenariosData] = await Promise.all([
        fetchAgents(),
        fetchAgentIdentities(),
        fetchAgentScenarios(),
      ]);
      setAgents(agentsData);
      setIdentities(identitiesData);
      setScenarios(scenariosData);
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateDialog = () => {
    setEditingIdentity(null);
    setFormData({
      id: '',
      name: '',
      role: '',
      description: '',
      systemPrompt: '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (identity: AgentIdentity) => {
    setEditingIdentity(identity);
    setFormData(identity);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.id || !formData.name || !formData.role) {
      showToast('请填写 ID、名称和角色', 'error');
      return;
    }

    try {
      if (editingIdentity) {
        await updateAgentIdentity(editingIdentity.id, formData);
        showToast('更新成功', 'success');
      } else {
        await createAgentIdentity(formData);
        showToast('创建成功', 'success');
      }
      setDialogOpen(false);
      loadData();
    } catch (e) {
      showToast(`操作失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个 Agent 身份吗？')) return;
    try {
      await deleteAgentIdentity(id);
      showToast('删除成功', 'success');
      loadData();
    } catch (e) {
      showToast(`删除失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
          Agent 管理
        </Typography>
        <Stack direction="row" spacing={1}>
          <IconButton size="small" onClick={loadData} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      <Paper sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="可用 Agent" icon={<SmartToyIcon sx={{ fontSize: 16 }} />} iconPosition="start" sx={{ minHeight: 48 }} />
          <Tab label="身份管理" icon={<PersonIcon sx={{ fontSize: 16 }} />} iconPosition="start" sx={{ minHeight: 48 }} />
          <Tab label="场景匹配" icon={<RuleIcon sx={{ fontSize: 16 }} />} iconPosition="start" sx={{ minHeight: 48 }} />
        </Tabs>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={24} />
        </Box>
      ) : tab === 0 ? (
        <Stack spacing={1.5}>
          {agents.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              暂无可用 Agent
            </Alert>
          ) : (
            agents.map((agent) => (
              <Card key={agent.id} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        {agent.name}
                      </Typography>
                      <Chip
                        label={agent.role}
                        size="small"
                        sx={{
                          fontSize: '0.65rem',
                          height: 20,
                          backgroundColor: '#EFF6FF',
                          color: '#2563EB',
                        }}
                      />
                      <Chip
                        label={agent.status === 'active' ? '活跃' : '未激活'}
                        size="small"
                        sx={{
                          fontSize: '0.65rem',
                          height: 20,
                          backgroundColor: agent.status === 'active' ? '#D1FAE5' : '#F3F4F6',
                          color: agent.status === 'active' ? '#059669' : '#6B7280',
                        }}
                      />
                    </Stack>
                  </Box>
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 1.5 }}>
                    {agent.description}
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" spacing={1}>
                    {agent.capabilities.map((cap) => (
                      <Chip
                        key={cap.name}
                        label={cap.description}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.7rem', height: 22 }}
                      />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}
        </Stack>
      ) : tab === 1 ? (
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={openCreateDialog}
              sx={{ textTransform: 'none', fontSize: '0.8rem' }}
            >
              添加身份
            </Button>
          </Box>
          {identities.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              暂无 Agent 身份配置
            </Alert>
          ) : (
            identities.map((identity) => (
              <Paper
                key={identity.id}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {identity.name}
                    </Typography>
                    <Chip
                      label={identity.role}
                      size="small"
                      sx={{
                        fontSize: '0.65rem',
                        height: 20,
                        backgroundColor: '#EFF6FF',
                        color: '#2563EB',
                      }}
                    />
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                      {identity.id}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="编辑">
                      <IconButton size="small" onClick={() => openEditDialog(identity)}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton size="small" color="error" onClick={() => handleDelete(identity.id)}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
                {identity.description && (
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1 }}>
                    {identity.description}
                  </Typography>
                )}
                {identity.systemPrompt && (
                  <Paper
                    variant="outlined"
                    sx={{
                      mt: 1,
                      p: 1.5,
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      maxHeight: 100,
                      overflowY: 'auto',
                      backgroundColor: gs.bgHover,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {identity.systemPrompt}
                  </Paper>
                )}
              </Paper>
            ))
          )}
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          {scenarios.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              暂无场景配置
            </Alert>
          ) : (
            scenarios.map((scenario) => (
              <Paper
                key={scenario.id}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {scenario.name}
                  </Typography>
                  <Chip
                    label={scenario.agentId}
                    size="small"
                    sx={{
                      fontSize: '0.65rem',
                      height: 20,
                      backgroundColor: '#F3E8FF',
                      color: '#7C3AED',
                    }}
                  />
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
                  {scenario.description}
                </Typography>
                <Stack direction="row" flexWrap="wrap" spacing={1}>
                  {scenario.keywords.map((kw) => (
                    <Chip
                      key={kw}
                      label={kw}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  ))}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>
          {editingIdentity ? '编辑 Agent 身份' : '添加 Agent 身份'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="ID"
              size="small"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              placeholder="my-agent"
              disabled={!!editingIdentity}
            />
            <TextField
              label="名称"
              size="small"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="我的助手"
            />
            <TextField
              label="角色"
              size="small"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="assistant"
            />
            <TextField
              label="描述"
              size="small"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Agent 描述信息"
              multiline
              rows={2}
            />
            <TextField
              label="系统提示词"
              size="small"
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              placeholder="你是一个专业的助手..."
              multiline
              rows={4}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} size="small" sx={{ textTransform: 'none' }}>
            取消
          </Button>
          <Button onClick={handleSubmit} variant="contained" size="small" sx={{ textTransform: 'none' }}>
            {editingIdentity ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AgentsPage;