import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  useTheme,
  Chip,
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
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useToast } from '../contexts/ToastContext';
import { getProjects, createProject, updateProject, deleteProject, getWarehouses } from '../services/api';
import type { Project } from '../types/project';
import type { Warehouse } from '../types';
import { getGrayScale } from '../constants/theme';
import { ExpertSelector, type ExpertOption } from '../components/CrossWmsChat/ExpertSelector';

// ===================== Styles =====================

const CARD_STYLE = {
  border: '1px solid',
  borderColor: 'transparent',
  borderRadius: '12px',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  cursor: 'pointer',
  '&:hover': {
    borderColor: '#E5E7EB',
    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
  },
};

const SECTION_TITLE_STYLE = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#111827',
  letterSpacing: '-0.01em',
};

const TEMPLATES: Array<{ name: string; description: string; icon: React.ReactNode; color: string; category: string }> = [
  { name: 'WMS 实施', description: '仓库管理系统实施项目', icon: <WarehouseOutlinedIcon />, color: '#7C3AED', category: 'fixed' },
  { name: '库存优化', description: '库存水平优化与预测', icon: <InventoryOutlinedIcon />, color: '#059669', category: 'fixed' },
  { name: '入库流程', description: '入库流程设计与优化', icon: <DescriptionOutlinedIcon />, color: '#2563EB', category: 'fixed' },
  { name: '出库流程', description: '出库流程设计与优化', icon: <AssessmentOutlinedIcon />, color: '#DC2626', category: 'fixed' },
  { name: '调拨管理', description: '仓库间调拨流程管理', icon: <AutoFixHighIcon />, color: '#D97706', category: 'fixed' },
  { name: '质检流程', description: '质量检验流程设计', icon: <SettingsOutlinedIcon />, color: '#0891B2', category: 'fixed' },
  { name: '盘点管理', description: '库存盘点流程优化', icon: <ScheduleIcon />, color: '#7C3AED', category: 'fixed' },
  { name: '数据分析', description: '仓储数据分析与报表', icon: <DashboardOutlinedIcon />, color: '#059669', category: 'fixed' },
];

// ===================== Project Form Dialog (Screenshot-matching) =====================

interface ProjectFormProps {
  open: boolean;
  initial?: Project | null;
  onClose: () => void;
  onSave: (data: Partial<Project> & { name: string; warehouseIds?: string[] }) => void;
}

const EMPTY_FORM = {
  name: '',
  description: '',
  status: 'active' as string,
  category: 'custom' as string,
  agentId: '' as string,
  warehouseIds: [] as string[],
};

const ProjectFormDialog: React.FC<ProjectFormProps> = ({ open, initial, onClose, onSave }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [showExpertSelector, setShowExpertSelector] = useState(false);
  const [selectedExpert, setSelectedExpert] = useState<ExpertOption | null>(null);

  // 获取仓库列表
  React.useEffect(() => {
    if (!open) return;
    const fetchWarehouses = async () => {
      try {
        const data = await getWarehouses();
        setWarehouses(data);
      } catch {
        // 静默失败
      }
    };
    fetchWarehouses();
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
          warehouseIds: (initial as any).warehouseIds || [],
        });
      } else {
        setForm(EMPTY_FORM);
        setSelectedExpert(null);
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
      agentId: selectedExpert?.id || form.agentId || undefined,
      warehouseIds: form.warehouseIds.length > 0 ? form.warehouseIds : undefined,
    });
    onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth={false}
        PaperProps={{
          sx: {
            width: 560,
            maxWidth: 'calc(100vw - 48px)',
            borderRadius: '16px',
            bgcolor: '#ffffff',
            overflow: 'hidden',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ px: 3, pt: 3, pb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>
            {initial ? '编辑项目' : '新建项目'}
          </Typography>
          <IconButton onClick={onClose} sx={{ color: '#9CA3AF', p: 0.5 }}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        <DialogContent sx={{ px: 3, py: 0, '&.MuiDialogContent-root': { pb: 0 } }}>
          {/* 项目名称 */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#111827', mb: 0.75 }}>
              项目名称
            </Typography>
            <TextField
              fullWidth
              placeholder="请输入项目名称"
              autoFocus
              value={form.name}
              onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(''); }}
              error={Boolean(nameError)}
              helperText={nameError}
              sx={{
                '& .MuiOutlinedInput-root': {
                  height: 44,
                  borderRadius: '10px',
                  bgcolor: '#ffffff',
                  '& fieldset': { borderColor: '#E5E7EB' },
                  '&:hover fieldset': { borderColor: '#D1D5DB' },
                  '&.Mui-focused fieldset': { borderColor: '#111827', borderWidth: '1px' },
                },
                '& .MuiInputBase-input': { fontSize: '14px', color: '#111827' },
                '& .MuiFormHelperText-root': { fontSize: '12px', ml: 0 },
              }}
            />
          </Box>

          {/* 指令 */}
          <Box sx={{ mb: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                指令
              </Typography>
              <Button
                size="small"
                endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
                sx={{
                  fontSize: '13px',
                  color: '#6B7280',
                  textTransform: 'none',
                  bgcolor: '#F3F4F6',
                  borderRadius: '6px',
                  px: 1.5,
                  py: 0.5,
                  '&:hover': { bgcolor: '#E5E7EB' },
                }}
              >
                选择模板
              </Button>
            </Box>
            <TextField
              fullWidth
              placeholder="提供当前项目的背景信息和规范，让 Workbuddy 的回复更精准、更符合要求。比如：项目目标、团队习惯、风格偏好、输出约束等"
              multiline
              rows={4}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  bgcolor: '#ffffff',
                  '& fieldset': { borderColor: '#E5E7EB' },
                  '&:hover fieldset': { borderColor: '#D1D5DB' },
                  '&.Mui-focused fieldset': { borderColor: '#111827', borderWidth: '1px' },
                },
                '& .MuiInputBase-input': { fontSize: '14px', color: '#111827', lineHeight: 1.6 },
              }}
            />
          </Box>

          {/* 连接器 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1.5,
              px: 2,
              borderRadius: '10px',
              border: '1px solid #E5E7EB',
              mb: 1.5,
              cursor: 'pointer',
              '&:hover': { borderColor: '#D1D5DB', bgcolor: '#F9FAFB' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                连接器
              </Typography>
              <Typography sx={{ fontSize: '13px', color: '#9CA3AF' }}>
                （可选）
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '14px', color: '#6B7280', fontWeight: 500 }}>
              + 添加
            </Typography>
          </Box>

          {/* 专家 */}
          <Box
            onClick={() => setShowExpertSelector(true)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1.5,
              px: 2,
              borderRadius: '10px',
              border: '1px solid #E5E7EB',
              mb: 1.5,
              cursor: 'pointer',
              '&:hover': { borderColor: '#D1D5DB', bgcolor: '#F9FAFB' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                专家
              </Typography>
              <Typography sx={{ fontSize: '13px', color: '#9CA3AF' }}>
                （可选）
              </Typography>
            </Box>
            {selectedExpert ? (
              <Chip
                size="small"
                label={selectedExpert.name}
                onDelete={() => setSelectedExpert(null)}
                sx={{
                  height: 28,
                  fontSize: '13px',
                  fontWeight: 500,
                  bgcolor: '#EDE9FE',
                  color: '#7C3AED',
                  '& .MuiChip-deleteIcon': { color: '#7C3AED', fontSize: 16 },
                }}
              />
            ) : (
              <Typography sx={{ fontSize: '14px', color: '#6B7280', fontWeight: 500 }}>
                + 添加
              </Typography>
            )}
          </Box>

          {/* 技能 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1.5,
              px: 2,
              borderRadius: '10px',
              border: '1px solid #E5E7EB',
              mb: 1.5,
              cursor: 'pointer',
              '&:hover': { borderColor: '#D1D5DB', bgcolor: '#F9FAFB' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                技能
              </Typography>
              <Typography sx={{ fontSize: '13px', color: '#9CA3AF' }}>
                （可选）
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '14px', color: '#6B7280', fontWeight: 500 }}>
              + 添加
            </Typography>
          </Box>
        </DialogContent>

        {/* Footer */}
        <DialogActions sx={{ px: 3, py: 2.5, gap: 1.5, justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '12px', color: '#9CA3AF' }}>
            切换模版会覆盖当前编辑内容
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              onClick={onClose}
              sx={{
                color: '#111827',
                fontSize: '14px',
                fontWeight: 500,
                textTransform: 'none',
                px: 3,
                py: 1,
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                '&:hover': { bgcolor: '#F3F4F6' },
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disableElevation
              sx={{
                bgcolor: '#111827',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 500,
                textTransform: 'none',
                px: 3,
                py: 1,
                borderRadius: '8px',
                '&:hover': { bgcolor: '#374151' },
              }}
            >
              确定
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Expert Selector Modal */}
      <ExpertSelector
        open={showExpertSelector}
        onClose={() => setShowExpertSelector(false)}
        onSelect={(expert) => {
          setSelectedExpert(expert);
          setForm((f) => ({ ...f, agentId: expert.id }));
        }}
        selectedId={selectedExpert?.id}
      />
    </>
  );
};

// ===================== Component =====================

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

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
            {/* Robot antenna */}
            <line x1="180" y1="72" x2="180" y2="64" stroke="#1a1a1a" strokeWidth="1.5"/>
            <circle cx="180" cy="62" r="2" fill="#2dd4a8"/>
            {/* Robot body */}
            <path d="M168 100 L168 120 Q168 125 173 125 L187 125 Q192 125 192 120 L192 100" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            {/* Robot arms */}
            <path d="M168 108 Q160 112 160 120" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
            <path d="M192 108 Q200 112 200 120" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>

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
            {/* Plant */}
            <rect x="332" y="120" width="8" height="20" rx="2" fill="#1a1a1a"/>
            <ellipse cx="336" cy="116" rx="6" ry="8" fill="#2dd4a8" opacity="0.3"/>
            <ellipse cx="336" cy="116" rx="4" ry="6" stroke="#1a1a1a" strokeWidth="1" fill="none"/>

            {/* Connection lines between desks */}
            <path d="M100 142 Q120 142 140 142" stroke="#1a1a1a" strokeWidth="1" strokeDasharray="4 4" fill="none" opacity="0.3"/>
            <path d="M220 142 Q240 142 260 142" stroke="#1a1a1a" strokeWidth="1" strokeDasharray="4 4" fill="none" opacity="0.3"/>

            {/* Speech bubbles */}
            <rect x="95" y="55" width="24" height="14" rx="4" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
            <circle cx="102" cy="62" r="1.5" fill="#1a1a1a"/>
            <circle cx="108" cy="62" r="1.5" fill="#1a1a1a"/>
            <circle cx="114" cy="62" r="1.5" fill="#1a1a1a"/>

            <rect x="205" y="50" width="24" height="14" rx="4" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
            <circle cx="212" cy="57" r="1.5" fill="#1a1a1a"/>
            <circle cx="218" cy="57" r="1.5" fill="#1a1a1a"/>
            <circle cx="224" cy="57" r="1.5" fill="#1a1a1a"/>

            <rect x="315" y="55" width="24" height="14" rx="4" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
            <circle cx="322" cy="62" r="1.5" fill="#1a1a1a"/>
            <circle cx="328" cy="62" r="1.5" fill="#1a1a1a"/>
            <circle cx="334" cy="62" r="1.5" fill="#1a1a1a"/>
          </svg>
        </Box>
      </Box>

      {/* ===== Search Bar ===== */}
      <Box sx={{ mb: 4 }}>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索项目..."
          sx={{ maxWidth: 400 }}
        />
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
          <Button
            variant="text"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => { setEditingProject(null); setDialogOpen(true); }}
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: gs.textPrimary,
              textTransform: 'none',
              '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            新建项目
          </Button>
        </Box>

        {filteredProjects.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 6,
              color: gs.textMuted,
            }}
          >
            <FolderOutlinedIcon sx={{ fontSize: 48, color: gs.border, mb: 2 }} />
            <Typography sx={{ fontSize: 15, fontWeight: 500, mb: 0.5 }}>
              {searchQuery ? '未找到匹配的项目' : '暂无自定义项目'}
            </Typography>
            <Typography sx={{ fontSize: 13 }}>
              {searchQuery ? '尝试其他搜索词' : '点击上方按钮创建第一个项目'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
            {filteredProjects.map((project) => (
              <Box
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                sx={{
                  ...CARD_STYLE,
                  p: 2.5,
                  bgcolor: gs.bgPanel,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        bgcolor: `${gs.bgHover}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: gs.textPrimary,
                      }}
                    >
                      <FolderOutlinedIcon sx={{ fontSize: 20 }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: gs.textPrimary,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {project.name}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: gs.textMuted }}>
                        {project.status === 'active' ? '进行中' : project.status === 'completed' ? '已完成' : '已归档'}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="编辑">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProject(project);
                          setDialogOpen(true);
                        }}
                        sx={{ color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}
                      >
                        <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(project.id);
                        }}
                        sx={{ color: gs.textMuted, '&:hover': { color: '#DC2626' } }}
                      >
                        <InventoryOutlinedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                {project.description && (
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: gs.textMuted,
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {project.description}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 'auto' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, color: gs.textMuted }}>
                    <ScheduleIcon sx={{ fontSize: 14 }} />
                    {new Date(project.created_at).toLocaleDateString('zh-CN')}
                  </Box>
                  {(project as any).warehouseIds && (project as any).warehouseIds.length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, color: gs.textMuted }}>
                      <WarehouseOutlinedIcon sx={{ fontSize: 14 }} />
                      {(project as any).warehouseIds.length} 仓库
                    </Box>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* ===== Templates Section ===== */}
      <Box sx={{ mb: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoFixHighIcon sx={{ fontSize: 20, color: gs.textMuted }} />
            <Typography sx={SECTION_TITLE_STYLE}>项目模板</Typography>
          </Box>
          <SearchInput
            value={templateSearch}
            onChange={setTemplateSearch}
            placeholder="搜索模板..."
            sx={{ maxWidth: 240 }}
          />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
          {filteredTemplates.map((template) => (
            <Box
              key={template.name}
              onClick={() => {
                setEditingProject(null);
                setDialogOpen(true);
              }}
              sx={{
                ...CARD_STYLE,
                p: 2.5,
                bgcolor: gs.bgPanel,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    bgcolor: `${template.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: template.color,
                  }}
                >
                  {React.cloneElement(template.icon as React.ReactElement, { sx: { fontSize: 20 } })}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: gs.textPrimary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {template.name}
                  </Typography>
                </Box>
              </Box>
              <Typography
                sx={{
                  fontSize: 13,
                  color: gs.textMuted,
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {template.description}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 'auto', fontSize: 12, color: gs.textMuted }}>
                <AddIcon sx={{ fontSize: 14 }} />
                使用模板
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
