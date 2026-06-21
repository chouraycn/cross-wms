import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import SearchInput from '../components/Common/SearchInput';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useToast } from '../contexts/ToastContext';
import { getProjects, createProject, updateProject, deleteProject } from '../services/api';
import type { Project } from '../types/project';
import { getGrayScale } from '../constants/theme';

// ===================== Styles =====================

const CARD_STYLE = {
  border: '1px solid',
  borderColor: 'transparent',
  borderRadius: '12px',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  cursor: 'pointer',
  '&:hover': {
    borderColor: 'divider',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
};

const SECTION_TITLE_STYLE = { fontSize: 18, fontWeight: 700, color: 'text.primary' };

// ===================== Fixed Repos =====================

interface FixedRepo {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  meta?: string;
}

const FIXED_REPOS: FixedRepo[] = [
  {
    key: 'warehouse',
    name: '仓库管理',
    description: '跨境仓库数据管理，包含仓库、在途、库存、报表',
    icon: <WarehouseOutlinedIcon sx={{ fontSize: 22 }} />,
    path: '/warehouses',
    meta: '仪表盘 · 仓库列表 · 在途跟踪 · 库存查询',
  },
];

// ===================== Templates (全部功能) =====================

interface TemplateCard {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path?: string;
}

const TEMPLATES: TemplateCard[] = [
  { key: 'dashboard', name: '仪表盘', description: '仓库总览、容积率、在途统计', icon: <DashboardOutlinedIcon sx={{ fontSize: 22 }} />, path: '/dashboard' },
  { key: 'inventory', name: '库存管理', description: '库存查询、出入库记录、库存流水', icon: <InventoryOutlinedIcon sx={{ fontSize: 22 }} />, path: '/inventory' },
  { key: 'skills', name: '技能系统', description: 'AI 技能管理、导入导出、安全审查', icon: <AutoFixHighIcon sx={{ fontSize: 22 }} />, path: '/skills' },
  { key: 'automation', name: '自动化引擎', description: '定时任务、Webhook 触发、事件驱动', icon: <ScheduleIcon sx={{ fontSize: 22 }} />, path: '/automation' },
  { key: 'agent', name: 'Agent 应用', description: '智能体管理与配置', icon: <SmartToyOutlinedIcon sx={{ fontSize: 22 }} />, path: '/agent' },
  { key: 'docs', name: '腾讯文档', description: '在线文档授权与管理', icon: <DescriptionOutlinedIcon sx={{ fontSize: 22 }} />, path: '/tencent-docs' },
  { key: 'reports', name: '统计报表', description: '数据报表与导出', icon: <AssessmentOutlinedIcon sx={{ fontSize: 22 }} />, path: '/reports' },
  { key: 'chat', name: 'AI 对话', description: '智能助手、历史对话、上下文引用', icon: <ChatBubbleOutlineIcon sx={{ fontSize: 22 }} />, path: '/chat' },
  { key: 'settings', name: '系统设置', description: '外观主题、模型配置、仪表盘参数', icon: <SettingsOutlinedIcon sx={{ fontSize: 22 }} />, path: '/settings' },
];

// ===================== Project Form Dialog =====================

interface ProjectFormProps {
  open: boolean;
  initial?: Project | null;
  onClose: () => void;
  onSave: (data: Partial<Project> & { name: string }) => void;
}

const EMPTY_FORM = {
  name: '',
  description: '',
  status: 'active' as string,
  category: 'custom' as string,
  agentId: '' as string,
};

const ProjectFormDialog: React.FC<ProjectFormProps> = ({ open, initial, onClose, onSave }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState('');
  const [agentOptions, setAgentOptions] = useState<Array<{ id: string; name: string; description: string }>>([]);

  // 获取可用 Agent 列表
  React.useEffect(() => {
    if (!open) return;
    const fetchAgents = async () => {
      try {
        const resp = await fetch('/api/agents');
        if (resp.ok) {
          const json = await resp.json();
          if (json.data && Array.isArray(json.data)) {
            setAgentOptions(json.data.map((a: { id: string; name: string; description: string }) => ({
              id: a.id,
              name: a.name,
              description: a.description,
            })));
          }
        }
      } catch {
        // 静默失败
      }
    };
    fetchAgents();
  }, [open]);

  React.useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          name: initial.name,
          description: initial.description,
          status: initial.status,
          category: initial.category,
          agentId: (initial as any).agentId || '',
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setNameError('');
    }
  }, [open, initial]);

  const handleSave = () => {
    if (!form.name.trim()) { setNameError('项目名称不能为空'); return; }
    onSave({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      status: form.status as 'active' | 'archived' | 'completed',
      category: form.category as 'custom' | 'template' | 'fixed',
      agentId: form.agentId || undefined,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: '12px' } }}>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, pb: 1 }}>
        {initial ? '编辑项目' : '新建项目'}
      </DialogTitle>
      <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="项目名称" fullWidth size="small" autoFocus
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(''); }}
          error={Boolean(nameError)} helperText={nameError}
        />
        <TextField
          label="描述（可选）" fullWidth size="small" multiline rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>状态</InputLabel>
            <Select label="状态" value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <MenuItem value="active">活跃</MenuItem>
              <MenuItem value="archived">已归档</MenuItem>
              <MenuItem value="completed">已完成</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>分类</InputLabel>
            <Select label="分类" value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              <MenuItem value="custom">自定义</MenuItem>
              <MenuItem value="template">模板</MenuItem>
              <MenuItem value="fixed">固定</MenuItem>
            </Select>
          </FormControl>
        </Box>
        {/* Agent 选择 */}
        {agentOptions.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>专业 Agent</InputLabel>
              <Select
                label="专业 Agent"
                value={form.agentId}
                onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
              >
                <MenuItem value="">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>无（使用默认 AI）</Typography>
                  </Box>
                </MenuItem>
                {agentOptions.map((agent) => (
                  <MenuItem key={agent.id} value={agent.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>{agent.name}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {form.agentId && (
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, pl: 0.5 }}>
                {agentOptions.find(a => a.id === form.agentId)?.description || ''}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: gs.textMuted }}>取消</Button>
        <Button onClick={handleSave} variant="contained"
          sx={{ bgcolor: gs.textPrimary, '&:hover': { bgcolor: gs.textSecondary }, borderRadius: '6px' }}>
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ===================== Component =====================

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const { showToast } = useToast();

  // Theme helpers - use unified gray scale
  const textMuted = gs.textMuted;
  const borderColor = gs.border;
  const cardBg = gs.bgPanel;
  const repoSectionBg = gs.bgHover;

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载项目失败';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleSave = useCallback(async (data: Partial<Project> & { name: string }) => {
    try {
      if (editingProject) {
        await updateProject(editingProject.id, data);
        showToast('项目已更新', 'success');
      } else {
        await createProject(data);
        showToast('项目已创建', 'success');
      }
      await loadProjects();
      setEditingProject(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      showToast(message, 'error');
    }
  }, [editingProject, showToast, loadProjects]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteProject(id);
      showToast('项目已删除', 'success');
      await loadProjects();
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      showToast(message, 'error');
    }
  }, [showToast, loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter((p) =>
      p.name.toLowerCase().includes(query) ||
      (p.description || '').toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return TEMPLATES;
    const query = templateSearch.toLowerCase();
    return TEMPLATES.filter((t) =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query)
    );
  }, [templateSearch]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress size={32} sx={{ color: '#6B7280' }} />
      </Box>
    );
  }

  return (
    <Box className="page-fade-in" sx={{ maxWidth: 1100, mx: 'auto' }}>
      {/* ===== Hero Section ===== */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pt: 1.5,
          pb: 5,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 32, fontWeight: 700, color: 'text.primary', mb: 0.5, letterSpacing: '-0.02em' }}>
            项目
          </Typography>
          <Typography sx={{ fontSize: 13, color: gs.textMuted, mb: 3 }}>
            多人协同，打造超级团队
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={() => { setEditingProject(null); setDialogOpen(true); }}
            disableElevation
            sx={{
              px: 3,
              py: 1.2,
              backgroundColor: gs.textPrimary,
              color: gs.bgPanel,
              borderRadius: '8px',
              fontSize: 13,
              fontWeight: 500,
              textTransform: 'none',
              '&:hover': { backgroundColor: gs.textSecondary },
            }}
          >
            新建项目
          </Button>
        </Box>

        {/* Hero Illustration */}
        <Box sx={{ width: 360, height: 240, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
          <svg viewBox="0 0 360 240" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            {/* Desk 1 (left) */}
            <rect x="20" y="140" width="80" height="4" rx="2" fill="#1a1a1a"/>
            <rect x="28" y="144" width="4" height="40" rx="1" fill="#1a1a1a"/>
            <rect x="88" y="144" width="4" height="40" rx="1" fill="#1a1a1a"/>
            {/* Laptop 1 */}
            <rect x="35" y="120" width="50" height="20" rx="2" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            <rect x="40" y="124" width="40" height="12" rx="1" fill="#f0f0f0"/>
            {/* Person 1 */}
            <circle cx="60" cy="90" r="16" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            <path d="M40 130 Q40 110 60 110 Q80 110 80 130" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            {/* Coffee cup */}
            <rect x="78" y="128" width="10" height="12" rx="2" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
            <path d="M88 132 Q94 132 94 137 Q94 142 88 142" stroke="#1a1a1a" strokeWidth="1" fill="none"/>

            {/* Desk 2 (center) */}
            <rect x="140" y="140" width="80" height="4" rx="2" fill="#1a1a1a"/>
            <rect x="148" y="144" width="4" height="40" rx="1" fill="#1a1a1a"/>
            <rect x="208" y="144" width="4" height="40" rx="1" fill="#1a1a1a"/>
            {/* Laptop 2 */}
            <rect x="155" y="120" width="50" height="20" rx="2" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            <rect x="160" y="124" width="40" height="12" rx="1" fill="#f0f0f0"/>
            {/* Robot/AI character */}
            <rect x="168" y="72" width="24" height="28" rx="6" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            {/* Robot eyes (teal glow) */}
            <circle cx="175" cy="84" r="3" fill="#2dd4a8"/>
            <circle cx="185" cy="84" r="3" fill="#2dd4a8"/>
            {/* Headphones */}
            <path d="M166 78 Q168 66 180 66 Q192 66 194 78" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            <rect x="164" y="76" width="4" height="8" rx="2" fill="#1a1a1a"/>
            <rect x="192" y="76" width="4" height="8" rx="2" fill="#1a1a1a"/>
            {/* Robot body */}
            <path d="M160 130 Q160 108 180 108 Q200 108 200 130" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            {/* Antenna */}
            <line x1="180" y1="72" x2="180" y2="64" stroke="#1a1a1a" strokeWidth="1.5"/>
            <circle cx="180" cy="62" r="3" fill="#2dd4a8"/>

            {/* Desk 3 (right) */}
            <rect x="260" y="140" width="80" height="4" rx="2" fill="#1a1a1a"/>
            <rect x="268" y="144" width="4" height="40" rx="1" fill="#1a1a1a"/>
            <rect x="328" y="144" width="4" height="40" rx="1" fill="#1a1a1a"/>
            {/* Laptop 3 */}
            <rect x="275" y="120" width="50" height="20" rx="2" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            <rect x="280" y="124" width="40" height="12" rx="1" fill="#f0f0f0"/>
            {/* Person 3 */}
            <circle cx="300" cy="90" r="16" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            <path d="M280 130 Q280 110 300 110 Q320 110 320 130" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>

            {/* Floating elements */}
            {/* Checkmark bubble */}
            <rect x="100" y="50" width="30" height="24" rx="6" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
            <path d="M110 62 L114 66 L120 58" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            {/* Document bubble */}
            <rect x="230" y="40" width="26" height="30" rx="4" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
            <line x1="236" y1="50" x2="250" y2="50" stroke="#1a1a1a" strokeWidth="1"/>
            <line x1="236" y1="55" x2="248" y2="55" stroke="#1a1a1a" strokeWidth="1"/>
            <line x1="236" y1="60" x2="245" y2="60" stroke="#1a1a1a" strokeWidth="1"/>
            {/* Folder bubble */}
            <rect x="130" y="30" width="28" height="22" rx="4" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
            <path d="M134 34 L134 48 L154 48 L154 37 L146 37 L144 34 Z" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
            {/* Image bubble */}
            <rect x="200" y="55" width="24" height="20" rx="3" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
            <circle cx="208" cy="63" r="3" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
            <path d="M200 72 L208 66 L216 72" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
            {/* Person 4 (small, back) */}
            <circle cx="130" cy="82" r="10" stroke="#e0e0e0" strokeWidth="1" fill="none"/>
            <path d="M118 108 Q118 96 130 96 Q142 96 142 108" stroke="#e0e0e0" strokeWidth="1" fill="none"/>
          </svg>
        </Box>
      </Box>

      {/* ===== Fixed Repos Section ===== */}
      <Box
        sx={{
          mb: 5,
          p: 3,
          backgroundColor: repoSectionBg,
          borderRadius: '14px',
          border: `1px solid ${borderColor}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FolderOutlinedIcon sx={{ fontSize: 20, color: gs.textMuted }} />
            <Typography sx={SECTION_TITLE_STYLE}>固定项目仓库</Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => navigate('/warehouses')}
            sx={{
              borderColor: gs.borderDarker,
              color: gs.textSecondary,
              fontSize: 12,
              textTransform: 'none',
              borderRadius: '8px',
              '&:hover': {
                borderColor: gs.textMuted,
                backgroundColor: gs.bgHover,
              },
            }}
          >
            关联仓库
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {FIXED_REPOS.map((repo) => (
            <Box
              key={repo.key}
              onClick={() => navigate(repo.path)}
              sx={{
                ...CARD_STYLE,
                backgroundColor: cardBg,
                borderColor,
                p: 2.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    backgroundColor: gs.bgHover,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: gs.textMuted,
                  }}
                >
                  {repo.icon}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                    {repo.name}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    {repo.description}
                  </Typography>
                </Box>
              </Box>
              {repo.meta && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    pt: 1.5,
                    borderTop: `1px solid ${gs.border}`,
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: textMuted }}>{repo.meta}</Typography>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ===== Custom Projects Section ===== */}
      <Box sx={{ mb: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FolderOutlinedIcon sx={{ fontSize: 20, color: gs.textMuted }} />
            <Typography sx={SECTION_TITLE_STYLE}>自定义项目</Typography>
          </Box>
        </Box>

        {/* Search */}
        <Box sx={{ mb: 2, maxWidth: 400 }}>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜索项目"
            width={400}
          />
        </Box>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 6,
              color: gs.textMuted,
              gap: 1,
            }}
          >
            <FolderOutlinedIcon sx={{ fontSize: 40, color: gs.borderDarker }} />
            <Typography sx={{ fontSize: '0.9375rem', color: gs.textMuted }}>
              {searchQuery ? '没有匹配的项目' : '还没有自定义项目'}
            </Typography>
            {!searchQuery && (
              <Button
                size="small" startIcon={<AddIcon />}
                onClick={() => { setEditingProject(null); setDialogOpen(true); }}
                sx={{ mt: 0.5, color: gs.textMuted, '&:hover': { bgcolor: gs.bgHover } }}
              >
                创建第一个项目
              </Button>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {filteredProjects.map((project) => (
              <Box
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                sx={{
                  ...CARD_STYLE,
                  backgroundColor: cardBg,
                  borderColor,
                  p: 2.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '10px',
                      backgroundColor: gs.bgHover,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: gs.textMuted,
                    }}
                  >
                    <FolderOutlinedIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                      {project.name}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                      {project.description || '暂无描述'}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingProject(project);
                      setDialogOpen(true);
                    }}
                    sx={{ p: 0.5, color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}
                  >
                    <Tooltip title="编辑">
                      <span>✏️</span>
                    </Tooltip>
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('确定要删除这个项目吗？')) {
                        handleDelete(project.id);
                      }
                    }}
                    sx={{ p: 0.5, color: gs.textMuted, '&:hover': { color: '#DC2626' } }}
                  >
                    <Tooltip title="删除">
                      <span>🗑️</span>
                    </Tooltip>
                  </IconButton>
                </Box>
                <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      pt: 1.5,
                      borderTop: `1px solid ${gs.border}`,
                    }}
                  >
                  <Typography sx={{ fontSize: 11, color: textMuted }}>
                    状态: {project.status === 'active' ? '活跃' : project.status === 'archived' ? '已归档' : '已完成'}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: textMuted }}>
                    分类: {project.category === 'custom' ? '自定义' : project.category === 'template' ? '模板' : '固定'}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* ===== Template Gallery Section (全部功能) ===== */}
      <Box sx={{ mb: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography sx={SECTION_TITLE_STYLE}>全部功能</Typography>
          <Box sx={{ position: 'relative', width: 240 }}>
            <SearchIcon
              sx={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 16,
                color: textMuted,
              }}
            />
            <Box
              component="input"
              placeholder="搜索功能"
              value={templateSearch}
              onChange={(e) => setTemplateSearch((e.target as HTMLInputElement).value)}
              sx={{
                width: '100%',
                height: 38,
                pl: 4.5,
                pr: 1.5,
                border: `1px solid ${gs.borderDarker}`,
                borderRadius: '8px',
                fontSize: 13,
                color: 'text.primary',
                bgcolor: gs.bgInput,
                outline: 'none',
                '&::placeholder': { color: textMuted },
                '&:focus': { borderColor: gs.textMuted },
              }}
            />
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
          {filteredTemplates.map((tpl) => (
            <Box
              key={tpl.key}
              onClick={() => tpl.path && navigate(tpl.path)}
              sx={{
                ...CARD_STYLE,
                backgroundColor: cardBg,
                borderColor,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.75,
                p: 2.5,
              }}
            >
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '10px',
                  backgroundColor: gs.bgHover,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: gs.textMuted,
                }}
              >
                {tpl.icon}
              </Box>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                  {tpl.name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                  {tpl.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Form Dialog */}
      <ProjectFormDialog
        open={dialogOpen}
        initial={editingProject}
        onClose={() => { setDialogOpen(false); setEditingProject(null); }}
        onSave={handleSave}
      />
    </Box>
  );
};

export default ProjectsPage;
