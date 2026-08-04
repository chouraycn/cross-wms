/**
 * 工作流列表页面
 * 展示工作流卡片、创建、导入/导出和模板市场
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Chip,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Fab,
  useTheme,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Store as StoreIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import WorkflowEditor from '../components/Workflow/WorkflowEditor';
import type { Workflow, WorkflowTemplate } from '../../server/engine/workflow/types';
import { t } from '../i18n';

const STATUS_COLORS = {
  draft: 'default',
  published: 'success',
  archived: 'warning',
} as const;

/** 获取工作流状态的本地化标签 */
function getStatusLabel(status: string): string {
  switch (status) {
    case 'draft': return t('workflowPage:statusDraft');
    case 'published': return t('workflowPage:statusPublished');
    case 'archived': return t('workflowPage:statusArchived');
    default: return status;
  }
}

const WorkflowPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  // 工作流列表
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 编辑器对话框
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // 创建对话框
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');

  // 模板对话框
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);

  // 提示消息
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // 加载工作流列表
  const loadWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/workflow');
      const result = await response.json();

      if (response.ok) {
        setWorkflows(result.data);
      } else {
        setError(result.error || t('workflowPage:loadFailed'));
      }
    } catch (err) {
      setError(t('workflowPage:networkErrorRetry'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  // 创建工作流
  const handleCreate = useCallback(async () => {
    if (!newWorkflowName) {
      setSnackbar({ open: true, message: t('workflowPage:nameRequired'), severity: 'error' });
      return;
    }

    try {
      const response = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWorkflowName,
          description: newWorkflowDesc,
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              name: t('workflowPage:triggerNode'),
              config: { type: 'manual' },
              position: { x: 100, y: 100 },
              connections: [],
            },
          ],
          triggers: [],
          variables: [],
          status: 'draft',
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSnackbar({ open: true, message: t('workflowPage:createSuccess'), severity: 'success' });
        setCreateDialogOpen(false);
        setNewWorkflowName('');
        setNewWorkflowDesc('');
        loadWorkflows();
      } else {
        setSnackbar({ open: true, message: result.error || t('workflowPage:createFailed'), severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: t('workflowPage:networkError'), severity: 'error' });
    }
  }, [newWorkflowName, newWorkflowDesc, loadWorkflows]);

  // 删除工作流
  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm(t('workflowPage:deleteConfirm'))) return;

    try {
      const response = await fetch(`/api/workflow/${id}`, { method: 'DELETE' });
      const result = await response.json();

      if (response.ok) {
        setSnackbar({ open: true, message: t('workflowPage:deleteSuccess'), severity: 'success' });
        loadWorkflows();
      } else {
        setSnackbar({ open: true, message: result.error || t('workflowPage:deleteFailed'), severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: t('workflowPage:networkError'), severity: 'error' });
    }
  }, [loadWorkflows]);

  // 执行工作流
  const handleExecute = useCallback(async (workflow: Workflow) => {
    if (workflow.status !== 'published') {
      setSnackbar({ open: true, message: t('workflowPage:executeRestricted'), severity: 'error' });
      return;
    }

    try {
      setIsExecuting(true);
      const response = await fetch(`/api/workflow/${workflow.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType: 'manual' }),
      });

      const result = await response.json();

      if (response.ok) {
        setSnackbar({ open: true, message: t('workflowPage:executeStarted'), severity: 'success' });
      } else {
        setSnackbar({ open: true, message: result.error || t('workflowPage:executeFailed'), severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: t('workflowPage:networkError'), severity: 'error' });
    } finally {
      setIsExecuting(false);
    }
  }, []);

  // 保存工作流
  const handleSave = useCallback(async (workflow: Workflow) => {
    try {
      const response = await fetch(`/api/workflow/${workflow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      });

      const result = await response.json();

      if (response.ok) {
        setSnackbar({ open: true, message: t('workflowPage:saveSuccess'), severity: 'success' });
        loadWorkflows();
      } else {
        setSnackbar({ open: true, message: result.error || t('workflowPage:saveFailed'), severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: t('workflowPage:networkError'), severity: 'error' });
    }
  }, [loadWorkflows]);

  // 导出工作流
  const handleExport = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/workflow/${id}/export`);
      const data = await response.text();

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workflow-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setSnackbar({ open: true, message: t('workflowPage:exportSuccess'), severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: t('workflowPage:exportFailed'), severity: 'error' });
    }
  }, []);

  // 加载模板
  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch('/api/workflow/templates');
      const result = await response.json();

      if (response.ok) {
        setTemplates(result.data);
      }
    } catch (err) {
      console.error('加载模板失败:', err);
    }
  }, []);

  // 从模板创建
  const handleCreateFromTemplate = useCallback(async (templateId: string, name: string) => {
    try {
      const response = await fetch('/api/workflow/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, name }),
      });

      const result = await response.json();

      if (response.ok) {
        setSnackbar({ open: true, message: t('workflowPage:createSuccess'), severity: 'success' });
        setTemplateDialogOpen(false);
        loadWorkflows();
      } else {
        setSnackbar({ open: true, message: result.error || t('workflowPage:createFailed'), severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: t('workflowPage:networkError'), severity: 'error' });
    }
  }, [loadWorkflows]);

  // 打开编辑器
  const handleOpenEditor = useCallback((workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setEditorOpen(true);
  }, []);

  // 关闭编辑器
  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setSelectedWorkflow(null);
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      {/* 页面标题 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">{t('workflowPage:title')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<StoreIcon />}
            onClick={() => {
              loadTemplates();
              setTemplateDialogOpen(true);
            }}
          >
            {t('workflowPage:templateMarket')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
          >
            {t('workflowPage:import')}
          </Button>
        </Box>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* 加载状态 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* 工作流列表 */}
      {!loading && workflows.length === 0 && (
        <Box sx={{ textAlign: 'center', p: 4 }}>
          <Typography variant="h6" color="text.secondary">
            {t('workflowPage:emptyState')}
          </Typography>
        </Box>
      )}

      {!loading && workflows.length > 0 && (
        <Grid container spacing={2}>
          {workflows.map(workflow => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={workflow.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="h6">{workflow.name}</Typography>
                    <Chip
                      label={getStatusLabel(workflow.status)}
                      color={STATUS_COLORS[workflow.status as keyof typeof STATUS_COLORS]}
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {workflow.description || t('workflowPage:noDescription')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('workflowPage:nodeCount')}: {workflow.nodes.length} | {t('workflowPage:version')}: {workflow.version}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {t('workflowPage:updatedAt')}: {new Date(workflow.updatedAt).toLocaleString()}
                  </Typography>
                </CardContent>
                <CardActions>
                  <IconButton size="small" onClick={() => handleOpenEditor(workflow)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleExecute(workflow)}>
                    <PlayArrowIcon />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleExport(workflow.id)}>
                    <DownloadIcon />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(workflow.id)}>
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* 创建按钮 */}
      <Fab
        color="primary"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => setCreateDialogOpen(true)}
      >
        <AddIcon />
      </Fab>

      {/* 创建对话框 */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>{t('workflowPage:createDialogTitle')}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label={t('workflowPage:formName')}
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label={t('workflowPage:formDescription')}
              value={newWorkflowDesc}
              onChange={(e) => setNewWorkflowDesc(e.target.value)}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>{t('workflowPage:cancel')}</Button>
          <Button variant="contained" onClick={handleCreate}>{t('workflowPage:create')}</Button>
        </DialogActions>
      </Dialog>

      {/* 编辑器对话框 */}
      <Dialog
        open={editorOpen}
        onClose={handleCloseEditor}
        maxWidth="lg"
        fullWidth
        fullScreen
      >
        <DialogContent sx={{ p: 0 }}>
          <WorkflowEditor
            workflow={selectedWorkflow}
            onSave={handleSave}
            onExecute={() => handleExecute(selectedWorkflow!)}
            isExecuting={isExecuting}
          />
        </DialogContent>
      </Dialog>

      {/* 模板市场对话框 */}
      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('workflowPage:templateMarketTitle')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            {templates.map(template => (
              <Grid item xs={12} sm={6} md={4} key={template.id}>
                <Card>
                  <CardContent>
                    <Typography variant="h6">{template.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {template.description}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                      {template.tags.map(tag => (
                        <Chip key={tag} label={tag} size="small" />
                      ))}
                    </Box>
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      onClick={() => {
                        const name = prompt(t('workflowPage:nameRequired'), template.name);
                        if (name) {
                          handleCreateFromTemplate(template.id, name);
                        }
                      }}
                    >
                      {t('workflowPage:useTemplate')}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>{t('workflowPage:close')}</Button>
        </DialogActions>
      </Dialog>

      {/* 提示消息 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default WorkflowPage;