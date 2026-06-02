import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment, Chip,
  IconButton, Tooltip, CircularProgress,
  Snackbar, Alert, Button, Paper, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ExtensionIcon from '@mui/icons-material/Extension';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { loadAutomations, automationEngine } from '../services/automationEngine';
import type { TaskType, AutomationExecution, EngineStateEvent } from '../services/automationEngine';
import { getAllSkills, addSkill, onSkillsChange, setSkillStatus } from '../stores/skillStore';
import { ICON_MAP } from '../types/skill';
import type { Skill } from '../types/skill';

import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_COLORS, ICON_GRADIENTS } from '../constants/skillCategories';

// ===================== 组件 =====================

const SkillsPage: React.FC = () => {
  useAppSettings();
  const navigate = useNavigate();

  // 技能列表（响应式，随 skillStore 变更刷新）
  const [skillVersion, setSkillVersion] = useState(0);
  const skills = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = skillVersion;
    return getAllSkills();
  }, [skillVersion]);

  // 监听 skillStore 变更
  useEffect(() => {
    const unsubscribe = onSkillsChange(() => {
      setSkillVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'market' | 'installed'>('market');

  // 添加技能 Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ---- 响应式自动化状态 ----
  const [automationVersion, setAutomationVersion] = useState(0);
  const [runningTaskTypes, setRunningTaskTypes] = useState<Set<TaskType>>(new Set());
  const [latestExecByType, setLatestExecByType] = useState<Record<string, AutomationExecution | null>>({});
  const [triggeringTypes, setTriggeringTypes] = useState<Set<TaskType>>(new Set());
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' | 'info' }>({ open: false, msg: '', severity: 'info' });

  // 构建 automationMap
  const automationMap = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = automationVersion;
    const autos = loadAutomations();
    const map: Record<string, { active: boolean; id: string; name: string }> = {};
    for (const auto of autos) {
      map[auto.taskType] = {
        active: auto.status === 'ACTIVE',
        id: auto.id,
        name: auto.name,
      };
    }
    return map;
  }, [automationVersion]);

  // 初始化 + 监听引擎状态变更
  useEffect(() => {
    refreshLatestExec();

    const unsubscribe = automationEngine.onStateChange((event: EngineStateEvent) => {
      setAutomationVersion((v) => v + 1);

      if (event.type === 'execution-start') {
        const auto = loadAutomations().find((a) => a.id === event.automationId);
        if (auto) {
          setRunningTaskTypes((prev) => new Set(prev).add(auto.taskType));
        }
      } else {
        const auto = loadAutomations().find((a) => a.id === event.automationId);
        if (auto) {
          setRunningTaskTypes((prev) => {
            const next = new Set(prev);
            next.delete(auto.taskType);
            return next;
          });
          setTriggeringTypes((prev) => {
            const next = new Set(prev);
            next.delete(auto.taskType);
            return next;
          });
        }
        refreshLatestExec();
      }
    });

    return unsubscribe;
  }, []);

  const refreshLatestExec = useCallback(() => {
    const autos = loadAutomations();
    const map: Record<string, AutomationExecution | null> = {};
    for (const auto of autos) {
      const logs = automationEngine.getExecutionLog(auto.id);
      map[auto.taskType] = logs.length > 0 ? logs[0] : null;
    }
    setLatestExecByType(map);
  }, []);

  // 一键触发自动化
  const handleTriggerAutomation = async (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!skill.automationTaskType) return;
    const autoInfo = automationMap[skill.automationTaskType];
    if (!autoInfo) return;

    setTriggeringTypes((prev) => new Set(prev).add(skill.automationTaskType as TaskType));
    try {
      const result = await automationEngine.triggerNow(autoInfo.id);
      setToast({ open: true, msg: `${skill.name} 执行${result.status === 'success' ? '成功' : '失败'}`, severity: result.status === 'success' ? 'success' : 'error' });
    } catch (err) {
      setToast({ open: true, msg: `${skill.name} 执行出错: ${err}`, severity: 'error' });
    } finally {
      setTriggeringTypes((prev) => {
        const next = new Set(prev);
        next.delete(skill.automationTaskType as TaskType);
        return next;
      });
    }
  };

  // 启用技能
  const handleActivateSkill = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSkillStatus(id, 'active');
    setSkillVersion((v) => v + 1);
    setToast({ open: true, msg: '技能已启用', severity: 'success' });
  };

  // 过滤技能
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = searchQuery === '' ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (skill.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (skill.trigger || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
      const matchesTab = activeTab === 'market' || skill.source === 'user';
      return matchesSearch && matchesCategory && matchesTab;
    });
  }, [searchQuery, selectedCategory, skills, activeTab]);

  // 推荐技能
  const featuredSkills = useMemo(() => {
    return skills.filter(s => s.featured && s.status === 'active');
  }, [skills]);

  // 按 category 分组（全部 Tab 下）
  const grouped = useMemo(() => {
    const result: [string, Skill[]][] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = filteredSkills.filter(s => s.category === cat);
      if (items.length > 0) result.push([cat, items]);
    }
    return result;
  }, [filteredSkills]);

  // 统计数据
  const stats = useMemo(() => {
    const active = skills.filter(s => s.status === 'active').length;
    const installed = skills.filter(s => s.source === 'user').length;
    const automated = skills.filter(s => s.automationTaskType && automationMap[s.automationTaskType]).length;
    const running = runningTaskTypes.size;
    return { active, installed, automated, running };
  }, [skills, automationMap, runningTaskTypes]);

  // 渲染最近执行状态
  const renderLatestExec = (skill: Skill) => {
    if (!skill.automationTaskType) return null;
    const exec = latestExecByType[skill.automationTaskType];
    if (!exec) return null;
    const statusIcon = exec.status === 'success'
      ? <CheckCircleIcon sx={{ fontSize: 10, color: '#059669' }} />
      : exec.status === 'failed'
        ? <ErrorOutlineIcon sx={{ fontSize: 10, color: '#DC2626' }} />
        : <ScheduleIcon sx={{ fontSize: 10, color: '#D97706' }} />;
    const statusText = exec.status === 'success' ? '成功' : exec.status === 'failed' ? '失败' : '运行中';
    const timeStr = exec.completedAt
      ? new Date(exec.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        {statusIcon}
        <Typography sx={{ fontSize: '0.6rem', color: '#999' }}>
          {statusText}{timeStr ? ` · ${timeStr}` : ''}
        </Typography>
      </Box>
    );
  };

  // 获取技能图标的第一个字符（用于卡片图标区）
  // 渲染技能卡片
  const renderSkillCard = (skill: Skill) => {
    const autoInfo = skill.automationTaskType ? automationMap[skill.automationTaskType] : undefined;
    const hasAutomation = !!autoInfo;
    const isRunning = skill.automationTaskType ? runningTaskTypes.has(skill.automationTaskType as TaskType) : false;
    const isTriggering = skill.automationTaskType ? triggeringTypes.has(skill.automationTaskType as TaskType) : false;

    return (
      <Paper
        key={skill.id}
        elevation={0}
        onClick={() => navigate(`/skills/${skill.id}`)}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          p: 2,
          borderRadius: '12px',
          border: '1px solid #F0F0F0',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(0,0,0,0.04)',
            borderColor: '#E0E0E0',
          },
        }}
      >
        {/* 图标区 */}
        <Box sx={{
          width: 44,
          height: 44,
          borderRadius: '10px',
          background: ICON_GRADIENTS[skill.category],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mr: 1.5,
          flexShrink: 0,
          position: 'relative',
          color: '#fff',
          fontSize: '1.1rem',
          fontWeight: 600,
        }}>
          {/* 渲染 MUI 图标（白色） */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 22, color: '#fff' } }}>
            {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 22 }} />}
          </Box>
          {/* 自动化运行指示点 */}
          {hasAutomation && (
            <Box sx={{
              position: 'absolute',
              top: -3,
              right: -3,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isRunning ? '#3B82F6' : '#10B981',
              border: '2px solid #fff',
              ...(isRunning ? { animation: 'pulse-dot 1.2s ease-in-out infinite' } : {}),
            }} />
          )}
        </Box>

        {/* 信息区 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
            <Typography sx={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#1A1A1A',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {skill.name}
            </Typography>
            {skill.status === 'available' && (
              <Chip
                label="可用"
                size="small"
                sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#EFF6FF', color: '#2563EB' }}
              />
            )}
            {skill.status === 'coming' && (
              <Chip
                label="即将上线"
                size="small"
                sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#FEF3C7', color: '#D97706' }}
              />
            )}
            {skill.source === 'user' && (
              <Chip
                label="自定义"
                size="small"
                sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#FAF5FF', color: '#7C3AED' }}
              />
            )}
          </Box>
          <Typography sx={{
            fontSize: '0.75rem',
            color: '#999',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {skill.desc}
          </Typography>
          {/* 最近执行状态 */}
          {renderLatestExec(skill)}
        </Box>

        {/* 操作按钮 */}
        {skill.status === 'available' ? (
          <Tooltip title="启用技能">
            <IconButton
              size="small"
              onClick={(e) => handleActivateSkill(skill.id, e)}
              sx={{
                flexShrink: 0,
                width: 28,
                height: 28,
                border: '1px solid #E0E0E0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                ml: 1,
                color: '#2563EB',
                '&:hover': { backgroundColor: '#F5F5F5', borderColor: '#D0D0D0' },
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        ) : hasAutomation ? (
          <Tooltip title={isRunning ? '执行中...' : '立即执行'}>
            <IconButton
              size="small"
              onClick={(e) => handleTriggerAutomation(skill, e)}
              disabled={isRunning || isTriggering}
              sx={{
                flexShrink: 0,
                width: 28,
                height: 28,
                border: '1px solid #E0E0E0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                ml: 1,
                color: isRunning ? '#2563EB' : '#059669',
                '&:hover': { backgroundColor: '#F5F5F5', borderColor: '#D0D0D0' },
              }}
            >
              {isRunning || isTriggering ? (
                <CircularProgress size={14} sx={{ color: '#2563EB' }} />
              ) : (
                <PlayArrowIcon sx={{ fontSize: 14 }} />
              )}
            </IconButton>
          </Tooltip>
        ) : (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); navigate(`/skills/${skill.id}`); }}
            sx={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: '1px solid #E0E0E0',
              borderRadius: '6px',
              backgroundColor: '#fff',
              ml: 1,
              color: '#666',
              '&:hover': { backgroundColor: '#F5F5F5', borderColor: '#D0D0D0' },
            }}
          >
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Paper>
    );
  };

  // ===================== 渲染 =====================

  return (
    <Box className="page-fade-in" sx={{ px: 1 }}>
      {/* Header: 标题 + 搜索 + 添加按钮 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: '#1A1A1A', mb: 0.25 }}>
            技能
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#999' }}>
            赋予 CrossWMS 更强大的能力
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="搜索技能"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{
              width: 200,
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                backgroundColor: '#F0F0F0',
                fontSize: '0.8125rem',
                '& fieldset': { border: 'none' },
                '&:hover': { backgroundColor: '#E8E8E8' },
                '&.Mui-focused': { backgroundColor: '#fff', '& fieldset': { border: '1px solid #1A1A1A' } },
              },
              '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem', color: '#666' },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: '#999' }} />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="outlined"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => setAddDialogOpen(true)}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              fontSize: '0.8125rem',
              py: 0.75,
              px: 2,
              borderColor: '#E0E0E0',
              color: '#333',
              '&:hover': { borderColor: '#D0D0D0', backgroundColor: '#F9F9F9' },
            }}
          >
            添加技能
          </Button>
        </Box>
      </Box>

      {/* Main Tabs: 全部技能 / 已安装 */}
      <Box sx={{ display: 'flex', gap: 3, borderBottom: '1px solid #E8E8E8', mb: 3 }}>
        <Box
          onClick={() => setActiveTab('market')}
          sx={{
            py: 1.5,
            fontSize: '0.875rem',
            color: activeTab === 'market' ? '#1A1A1A' : '#666',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'market' ? 500 : 400,
            transition: 'color 0.2s',
            '&:hover': { color: '#333' },
            '&::after': activeTab === 'market' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#1A1A1A',
            } : {},
          }}
        >
          全部技能
        </Box>
        <Box
          onClick={() => setActiveTab('installed')}
          sx={{
            py: 1.5,
            fontSize: '0.875rem',
            color: activeTab === 'installed' ? '#1A1A1A' : '#666',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'installed' ? 500 : 400,
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            '&:hover': { color: '#333' },
            '&::after': activeTab === 'installed' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#1A1A1A',
            } : {},
          }}
        >
          已安装
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            px: 0.625,
            backgroundColor: '#F0F0F0',
            borderRadius: '9px',
            fontSize: '0.6875rem',
            color: '#666',
          }}>
            {stats.installed}
          </Box>
        </Box>
      </Box>

      {/* 推荐区（仅在"全部技能"Tab下，且无搜索/分类过滤时显示） */}
      {activeTab === 'market' && searchQuery === '' && selectedCategory === 'all' && featuredSkills.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: '#1A1A1A' }}>
              为你推荐
            </Typography>
            <Button
              size="small"
              startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
              sx={{ textTransform: 'none', fontSize: '0.8125rem', color: '#666', '&:hover': { color: '#333' } }}
            >
              换一换
            </Button>
          </Box>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
          }}>
            {featuredSkills.slice(0, 6).map(renderSkillCard)}
          </Box>
        </Box>
      )}

      {/* 分类标签行 */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {['all', ...CATEGORY_ORDER].map((key) => {
          const isActive = selectedCategory === key;
          const label = key === 'all' ? '全部' : CATEGORY_LABELS[key];
          return (
            <Box
              key={key}
              onClick={() => setSelectedCategory(key)}
              sx={{
                px: 1.75,
                py: 0.75,
                fontSize: '0.8125rem',
                color: isActive ? '#1A1A1A' : '#666',
                backgroundColor: isActive ? '#F0F0F0' : 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: isActive ? 500 : 400,
                transition: 'all 0.2s',
                '&:hover': { backgroundColor: isActive ? '#F0F0F0' : '#F0F0F0' },
              }}
            >
              {label}
            </Box>
          );
        })}
      </Box>

      {/* 技能卡片网格 */}
      {activeTab === 'market' && selectedCategory === 'all' ? (
        // 全部 + 无分类筛选：按分类分区展示
        grouped.map(([category, items]) => (
          <Box key={category} sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Box sx={{
                width: 3,
                height: 14,
                borderRadius: 0.5,
                backgroundColor: CATEGORY_COLORS[category].color,
              }} />
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: '#1A1A1A' }}>
                {CATEGORY_LABELS[category]}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#D1D5DB' }}>
                {items.length}
              </Typography>
            </Box>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 2,
            }}>
              {items.map(renderSkillCard)}
            </Box>
          </Box>
        ))
      ) : (
        // 已安装Tab / 选了分类：直接展示扁平网格
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 2,
        }}>
          {filteredSkills.map(renderSkillCard)}
        </Box>
      )}

      {/* 无结果提示 */}
      {filteredSkills.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AutoFixHighIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 2 }} />
          <Typography sx={{ fontSize: '0.95rem', color: '#6B7280', mb: 0.5 }}>
            未找到匹配的技能
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
            尝试调整搜索关键词或筛选条件
          </Typography>
        </Box>
      )}

      {/* 添加技能对话框 */}
      <AddSkillDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={(name) => {
          setToast({ open: true, msg: `技能已添加: ${name}`, severity: 'success' });
          setSkillVersion((v) => v + 1);
        }}
      />

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.severity}
          sx={{ fontSize: '0.8rem', borderRadius: 2 }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>

      {/* 脉冲动画 */}
      <style>{`
        @keyframes pulse-dot {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </Box>
  );
};

// ===================== 添加技能对话框（ZIP上传） =====================

interface AddSkillDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: (name: string) => void;
}

const AddSkillDialog: React.FC<AddSkillDialogProps> = ({ open, onClose, onAdded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.zip')) {
      setError('请上传 .zip 格式的技能包');
      return;
    }
    setFile(f);
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleInstall = async () => {
    if (!file) { setError('请选择技能包文件'); return; }
    setLoading(true);
    setError('');

    try {
      // 读取 zip 内容，解析 skill.json
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // 简单读取文件名（不依赖 jszip，纯文本匹配提取 skill.json）
      // 尝试从 zip 中提取 skill.json 的 JSON 内容
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
      // 寻找 skill.json 的内容块（ZIP local file header后的内容）
      const jsonMatch = text.match(/\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"desc"\s*:\s*"([^"]+)"[\s\S]*?\}/);

      if (jsonMatch) {
        // 找到了 JSON 内容，尝试解析
        let skillData: Record<string, unknown> = {};
        try {
          // 尝试解析更完整的 JSON
          const fullJsonMatch = text.match(/\{[^{}]*"name"[^{}]*"desc"[^{}]*\}/);
          if (fullJsonMatch) skillData = JSON.parse(fullJsonMatch[0]);
        } catch {
          skillData = { name: jsonMatch[1], desc: jsonMatch[2] };
        }
        const name = (skillData['name'] as string) || file.name.replace('.zip', '');
        const desc = (skillData['desc'] as string) || '从技能包导入';
        const icon = (skillData['icon'] as string) || 'Extension';
        const category = (skillData['category'] as 'core' | 'data' | 'auto' | 'tool') || 'tool';
        const trigger = skillData['trigger'] as string | undefined;
        const tags = skillData['tags'] as string[] | undefined;
        const path = (skillData['path'] as string) || '/';

        const newSkill = await addSkill({ name, desc, icon, category, path, trigger, tags, status: 'active', version: '1.0' });
        onAdded(newSkill.name);
        reset();
        onClose();
      } else {
        // 没有找到 skill.json，用文件名作为名称安装
        const name = file.name.replace('.zip', '');
        const newSkill = await addSkill({ name, desc: `从 ${file.name} 导入的技能包`, icon: 'Extension', category: 'tool', path: '/', status: 'active', version: '1.0' });
        onAdded(newSkill.name);
        reset();
        onClose();
      }
    } catch (err) {
      setError(`安装失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, color: '#111827', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ExtensionIcon sx={{ fontSize: 22, color: '#6B7280' }} />
        安装技能包
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mb: 2 }}>
          上传 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>.zip</code> 格式的技能包文件。技能包应包含 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>skill.json</code> 描述文件。
        </Typography>

        {/* 拖拽上传区 */}
        <Box
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: `2px dashed ${dragging ? '#111827' : file ? '#10B981' : '#E5E7EB'}`,
            borderRadius: '12px',
            backgroundColor: dragging ? '#F9FAFB' : file ? '#F0FDF4' : '#FAFAFA',
            py: 4,
            px: 3,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {file ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircleIcon sx={{ fontSize: 28, color: '#10B981' }} />
              </Box>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>{file.name}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                {(file.size / 1024).toFixed(1)} KB · 点击重新选择
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AddIcon sx={{ fontSize: 28, color: '#9CA3AF' }} />
              </Box>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>
                拖拽技能包到此处
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                或点击选择 .zip 文件
              </Typography>
            </Box>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2, fontSize: '0.8rem' }}>
            {error}
          </Alert>
        )}

        {/* 技能包格式说明 */}
        <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#F9FAFB', borderRadius: 2, border: '1px solid #E5E7EB' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>技能包格式（skill.json）</Typography>
          <Box
            component="pre"
            sx={{ fontSize: '0.7rem', color: '#374151', backgroundColor: 'transparent', m: 0, fontFamily: 'monospace', lineHeight: 1.6 }}
          >{`{
  "name": "技能名称",
  "desc": "技能描述",
  "icon": "Extension",
  "category": "tool",
  "trigger": "触发词（可选）",
  "tags": ["标签1", "标签2"]
}`}</Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} sx={{ textTransform: 'none', color: '#6B7280' }}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleInstall}
          disabled={!file || loading}
          sx={{
            backgroundColor: '#111827',
            '&:hover': { backgroundColor: '#374151' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          {loading ? <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} /> : null}
          {loading ? '安装中...' : '安装技能'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SkillsPage;
