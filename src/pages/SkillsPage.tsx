import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Divider, TextField, InputAdornment, Chip,
  Card, CardContent, IconButton, Tooltip, CircularProgress,
  Snackbar, Alert, Drawer, Button, Paper, Fade, Collapse,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import BarChartIcon from '@mui/icons-material/BarChart';
import ChatIcon from '@mui/icons-material/Chat';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BoltIcon from '@mui/icons-material/Bolt';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TuneIcon from '@mui/icons-material/Tune';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardCommandKeyIcon from '@mui/icons-material/KeyboardCommandKey';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { loadAutomations, automationEngine } from '../services/automationEngine';
import type { TaskType, AutomationExecution, EngineStateEvent } from '../services/automationEngine';

// ===================== 类型定义 =====================

interface Skill {
  name: string;
  desc: string;
  /** 一句话说明触发/使用方式 */
  trigger?: string;
  /** 详细描述，用于详情面板 */
  detail?: string;
  icon: React.ReactNode;
  category: 'core' | 'data' | 'auto' | 'tool';
  path: string;
  shortcut?: string;
  /** 关联的自动化任务类型 */
  automationTaskType?: TaskType;
  /** 技能标签 */
  tags?: string[];
  /** 技能状态 */
  status?: 'active' | 'available' | 'coming';
  /** 是否为推荐技能 */
  featured?: boolean;
  /** 技能版本 */
  version?: string;
}

// ===================== 技能数据 =====================

const skills: Skill[] = [
  // ---- 核心功能 (core) ----
  {
    name: '仪表盘总览',
    desc: 'KPI 监控、仓库热力图、趋势分析与全局概览',
    trigger: '打开仪表盘 / 查看概览',
    detail: '实时展示所有仓库的核心指标，包括入库/出库/在途数量、容积率热力图、趋势曲线。支持仓库筛选与多维度切换。',
    icon: <DashboardIcon sx={{ fontSize: 22 }} />,
    category: 'core',
    path: '/',
    tags: ['概览', 'KPI'],
    status: 'active',
    featured: true,
    version: '1.0',
  },
  {
    name: '仓库管理',
    desc: '仓储规划、库位优化、库存调配与多仓切换',
    trigger: '管理仓库 / 添加仓库',
    detail: '支持多仓库切换、库位规划与优化、库存调拨与调配。提供仓库基础信息管理、库位热力图与容积率监控。',
    icon: <WarehouseIcon sx={{ fontSize: 22 }} />,
    category: 'core',
    path: '/warehouses',
    tags: ['核心', '仓库'],
    status: 'active',
    featured: true,
    version: '1.0',
  },
  {
    name: '在途跟踪',
    desc: '物流追踪、时效分析、异常预警与交期预测',
    trigger: '追踪物流 / 在途查询',
    detail: '实时追踪在途物流，提供时效分析、异常预警与交期预测。支持按仓库/运输方式/状态筛选，快速定位异常运单。',
    icon: <LocalShippingIcon sx={{ fontSize: 22 }} />,
    category: 'core',
    path: '/in-transit',
    tags: ['物流', '追踪'],
    status: 'active',
    featured: true,
    version: '1.0',
  },
  {
    name: '库存管理',
    desc: '库龄预警、滞销处理、周转优化与保质期管理',
    trigger: '查看库存 / 库龄分析',
    detail: '库龄预警与滞销品处理，周转率优化建议，保质期临期提醒。支持按仓库/品类/库龄段筛选分析。',
    icon: <InventoryIcon sx={{ fontSize: 22 }} />,
    category: 'core',
    path: '/inventory',
    tags: ['库存', '预警'],
    status: 'active',
    version: '1.0',
  },
  // ---- 数据管理 (data) ----
  {
    name: '腾讯文档',
    desc: '在线文档管理、API 授权、数据同步与自动更新',
    trigger: '同步文档 / 文档设置',
    detail: '对接腾讯文档 API，实现在线文档管理、数据双向同步与自动更新。支持配置文档映射、定时同步与手动触发。',
    icon: <DescriptionIcon sx={{ fontSize: 22 }} />,
    category: 'data',
    path: '/tencent-docs',
    tags: ['文档', '同步'],
    automationTaskType: 'data-sync',
    status: 'active',
    featured: true,
    version: '1.0',
  },
  {
    name: '统计报表',
    desc: '自定义报表、数据导出、CSV 导出与定期生成',
    trigger: '生成报表 / 导出数据',
    detail: '支持自定义报表模板，数据按需导出为 CSV 格式。可配置定期自动生成，关联自动化调度任务。',
    icon: <BarChartIcon sx={{ fontSize: 22 }} />,
    category: 'data',
    path: '/reports',
    tags: ['报表', '导出'],
    automationTaskType: 'report-gen',
    status: 'active',
    version: '1.0',
  },
  {
    name: '容积率优化',
    desc: '容积计算、预警设置、满仓方案与件数上限分析',
    trigger: '容积率 / 预警设置',
    detail: '实时监控仓库容积率，超过阈值自动生成预警。支持满仓方案推荐与件数上限分析，关联自动化预警任务。',
    icon: <AssessmentIcon sx={{ fontSize: 22 }} />,
    category: 'data',
    path: '/',
    tags: ['仓库', '优化'],
    automationTaskType: 'volume-alert',
    status: 'active',
    version: '1.0',
  },
  {
    name: '数据分析',
    desc: '趋势预测、异常检测、决策建议与智能洞察',
    trigger: '数据分析 / 趋势预测',
    detail: '基于历史数据的趋势预测与异常检测，提供库存/物流/仓储维度的智能洞察与决策建议。',
    icon: <AnalyticsIcon sx={{ fontSize: 22 }} />,
    category: 'data',
    path: '/',
    tags: ['分析', '智能'],
    status: 'available',
    version: '0.9',
  },
  // ---- 自动化 (auto) ----
  {
    name: '自动化调度',
    desc: '周期执行、一次性任务、有效期管理与执行历史',
    trigger: '创建自动化 / 调度任务',
    detail: '管理自动化调度任务，支持周期执行（每小时/每天/每周/每月）、一次性执行、动作链组合与有效期控制。查看执行历史、重试失败任务。',
    icon: <BoltIcon sx={{ fontSize: 22 }} />,
    category: 'auto',
    path: '/automation',
    tags: ['自动化', '调度'],
    status: 'active',
    featured: true,
    version: '1.0',
  },
  {
    name: '库存快照',
    desc: '定时采集库存快照，追踪库存变化与趋势',
    trigger: '库存快照 / 拍照',
    detail: '按计划定时采集各仓库库存快照，记录SKU数量与库位变化。支持快照对比与历史趋势分析。',
    icon: <AutoModeIcon sx={{ fontSize: 22 }} />,
    category: 'auto',
    path: '/automation',
    tags: ['快照', '自动化'],
    automationTaskType: 'inventory-snapshot',
    status: 'active',
    version: '1.0',
  },
  // ---- 工具 (tool) ----
  {
    name: '智能助手',
    desc: 'AI 对话、数据查询、操作指引与自然语言交互',
    trigger: '提问 / AI 助手',
    detail: '通过底部 AI 对话框进行自然语言交互，支持数据查询、操作指引、报表解读等场景。在任何页面均可唤起。',
    icon: <ChatIcon sx={{ fontSize: 22 }} />,
    category: 'tool',
    path: '/agent',
    tags: ['AI', '对话'],
    status: 'active',
    version: '1.0',
  },
  {
    name: '指标控制',
    desc: '仪表盘参数调整、模块显隐、热力图与数据源配置',
    trigger: '设置 > 指标控制',
    detail: '调整仪表盘显示参数，控制模块显隐，配置热力图参数与数据源模式（Mock/API/腾讯文档）。',
    icon: <TuneIcon sx={{ fontSize: 22 }} />,
    category: 'tool',
    path: '/',
    shortcut: '设置 > 指标控制',
    tags: ['设置', '仪表盘'],
    status: 'active',
    version: '1.0',
  },
  {
    name: '快捷指令',
    desc: '快速执行常用操作、导航跳转与批量处理',
    trigger: '输入 / 触发指令',
    detail: '通过 "/" 前缀快速触发预定义指令，如 /sync 触发同步、/report 生成报表、/alert 查看预警。可在 AI 对话框中直接使用。',
    icon: <KeyboardCommandKeyIcon sx={{ fontSize: 22 }} />,
    category: 'tool',
    path: '/agent',
    tags: ['快捷', '指令'],
    status: 'available',
    version: '0.9',
  },
];

// ===================== 常量 =====================

const categoryLabels: Record<string, string> = {
  core: '核心功能',
  data: '数据管理',
  auto: '自动化',
  tool: '工具',
};

const categoryOrder = ['core', 'data', 'auto', 'tool'];

const categoryColors: Record<string, { bg: string; color: string }> = {
  core: { bg: '#EFF6FF', color: '#2563EB' },
  data: { bg: '#FAF5FF', color: '#7C3AED' },
  auto: { bg: '#ECFDF5', color: '#059669' },
  tool: { bg: '#FFF7ED', color: '#EA580C' },
};

// ===================== 组件 =====================

const SkillsPage: React.FC = () => {
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [recentSkills, setRecentSkills] = useState<Skill[]>(() => {
    try {
      const saved = localStorage.getItem('crosswms-recent-skills');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // 技能详情 Drawer
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);

  // ---- 响应式自动化状态 ----
  const [automationVersion, setAutomationVersion] = useState(0);
  const [runningTaskTypes, setRunningTaskTypes] = useState<Set<TaskType>>(new Set());
  const [latestExecByType, setLatestExecByType] = useState<Record<string, AutomationExecution | null>>({});
  const [triggeringTypes, setTriggeringTypes] = useState<Set<TaskType>>(new Set());
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' | 'info' }>({ open: false, msg: '', severity: 'info' });

  // 构建 automationMap（响应式，随 automationVersion 刷新）
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

  // 刷新每个 taskType 的最近执行记录
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
    const autoInfo = automationMap[skill.automationTaskType!];
    if (!autoInfo) return;

    setTriggeringTypes((prev) => new Set(prev).add(skill.automationTaskType!));
    try {
      const result = await automationEngine.triggerNow(autoInfo.id);
      setToast({ open: true, msg: `${skill.name} 执行${result.status === 'success' ? '成功' : '失败'}`, severity: result.status === 'success' ? 'success' : 'error' });
    } catch (err) {
      setToast({ open: true, msg: `${skill.name} 执行出错: ${err}`, severity: 'error' });
    } finally {
      setTriggeringTypes((prev) => {
        const next = new Set(prev);
        next.delete(skill.automationTaskType!);
        return next;
      });
    }
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
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  // 推荐技能
  const featuredSkills = useMemo(() => skills.filter(s => s.featured), []);

  // 按类别分组（保持 categoryOrder 顺序）
  const grouped = useMemo(() => {
    const result: [string, Skill[]][] = [];
    for (const cat of categoryOrder) {
      const items = filteredSkills.filter(s => s.category === cat);
      if (items.length > 0) result.push([cat, items]);
    }
    return result;
  }, [filteredSkills]);

  // 执行技能 — 导航到对应页面
  const handleExecute = (skill: Skill) => {
    const updated = [skill, ...recentSkills.filter(s => s.name !== skill.name)].slice(0, 6);
    setRecentSkills(updated);
    try { localStorage.setItem('crosswms-recent-skills', JSON.stringify(updated)); } catch { /* ignore */ }
    navigate(skill.path);
  };

  // 统计数据
  const stats = useMemo(() => {
    const active = skills.filter(s => s.status === 'active').length;
    const automated = skills.filter(s => s.automationTaskType && automationMap[s.automationTaskType]).length;
    const running = runningTaskTypes.size;
    return { active, automated, running };
  }, [automationMap, runningTaskTypes]);

  // 渲染技能状态标识
  const renderStatusBadge = (skill: Skill) => {
    if (skill.automationTaskType && automationMap[skill.automationTaskType]) {
      return (
        <Chip
          icon={<PlayArrowIcon sx={{ fontSize: 10 }} />}
          label="自动化"
          size="small"
          sx={{
            height: 16,
            fontSize: '0.55rem',
            fontWeight: 500,
            backgroundColor: '#ECFDF5',
            color: '#059669',
            ml: 0.5,
            '& .MuiChip-icon': { color: '#059669' },
          }}
        />
      );
    }
    if (skill.status === 'coming') {
      return (
        <Chip
          label="即将上线"
          size="small"
          sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#FEF3C7', color: '#D97706', ml: 0.5 }}
        />
      );
    }
    if (skill.status === 'available') {
      return (
        <Chip
          label="可用"
          size="small"
          sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#EFF6FF', color: '#2563EB', ml: 0.5 }}
        />
      );
    }
    return null;
  };

  // 渲染最近执行状态
  const renderLatestExec = (skill: Skill) => {
    if (!skill.automationTaskType) return null;
    const exec = latestExecByType[skill.automationTaskType];
    if (!exec) {
      return (
        <Typography sx={{ fontSize: '0.6rem', color: '#9CA3AF', mt: 0.25 }}>
          暂无执行记录
        </Typography>
      );
    }
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
        {statusIcon}
        <Typography sx={{ fontSize: '0.6rem', color: '#6B7280' }}>
          {statusText}{timeStr ? ` · ${timeStr}` : ''}
        </Typography>
      </Box>
    );
  };

  // ===================== 渲染 =====================

  return (
    <Box className="page-fade-in">
      {/* 页面标题 + 统计 */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
            技能中心
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
            选择技能快速跳转到对应功能模块，已配置自动化的技能可直接查看执行状态
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
              {stats.active}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>可用</Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>
              {stats.automated}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>自动化</Typography>
          </Box>
          {stats.running > 0 && (
            <>
              <Divider orientation="vertical" flexItem />
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563EB' }}>
                  {stats.running}
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>运行中</Typography>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* 推荐技能 — 快捷入口 */}
      {searchQuery === '' && selectedCategory === 'all' && featuredSkills.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <TrendingUpIcon sx={{ fontSize: 16, color: '#F59E0B' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              推荐技能
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {featuredSkills.map((skill) => (
              <Paper
                key={skill.name}
                elevation={0}
                onClick={() => handleExecute(skill)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: '1px solid #E5E7EB',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    borderColor: categoryColors[skill.category].color,
                    backgroundColor: '#FAFAFA',
                    '& .featured-arrow': { opacity: 1, transform: 'translateX(0)' },
                  },
                }}
              >
                <Box sx={{
                  width: 28, height: 28, borderRadius: 1,
                  backgroundColor: categoryColors[skill.category].bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: categoryColors[skill.category].color, flexShrink: 0,
                }}>
                  {skill.icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
                    {skill.name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.6rem', color: '#9CA3AF', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                    {skill.desc}
                  </Typography>
                </Box>
                <ArrowForwardIcon
                  className="featured-arrow"
                  sx={{ fontSize: 14, color: '#9CA3AF', opacity: 0, transform: 'translateX(-4px)', transition: 'all 0.15s ease', flexShrink: 0 }}
                />
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {/* 最近使用 */}
      {recentSkills.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
            最近使用
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {recentSkills.map((skill, i) => (
              <Chip
                key={i}
                icon={<Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5, color: categoryColors[skill.category]?.color || '#6B7280' }}>{skill.icon}</Box>}
                label={skill.name}
                onClick={() => handleExecute(skill)}
                sx={{
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  height: 32,
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  '&:hover': { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* 搜索和筛选栏 */}
      <Box sx={{
        display: 'flex',
        gap: 2,
        mb: 3,
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
      }}>
        <TextField
          size="small"
          placeholder="搜索技能、触发词或标签..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: '#F9FAFB',
              '& fieldset': { borderColor: '#E5E7EB' },
              '&:hover fieldset': { borderColor: '#D1D5DB' },
              '&.Mui-focused fieldset': { borderColor: '#111827' },
            },
            '& .MuiInputBase-input': { fontSize: '0.875rem' },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label="全部"
            onClick={() => setSelectedCategory('all')}
            sx={{
              borderRadius: '6px', fontSize: '0.75rem', height: 32,
              backgroundColor: selectedCategory === 'all' ? '#111827' : '#F3F4F6',
              color: selectedCategory === 'all' ? '#fff' : '#374151',
              '&:hover': { backgroundColor: selectedCategory === 'all' ? '#111827' : '#E5E7EB' },
              transition: 'all 0.15s ease',
            }}
          />
          {categoryOrder.map((key) => (
            <Chip
              key={key}
              label={categoryLabels[key]}
              onClick={() => setSelectedCategory(key)}
              sx={{
                borderRadius: '6px', fontSize: '0.75rem', height: 32,
                backgroundColor: selectedCategory === key ? categoryColors[key].bg : '#F3F4F6',
                color: selectedCategory === key ? categoryColors[key].color : '#374151',
                '&:hover': { backgroundColor: selectedCategory === key ? categoryColors[key].bg : '#E5E7EB' },
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </Box>
      </Box>

      {/* 技能卡片网格 */}
      {grouped.map(([category, items]) => (
        <Box key={category} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{
              width: 4, height: 16, borderRadius: 1,
              backgroundColor: categoryColors[category].color,
            }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {categoryLabels[category]}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#D1D5DB', ml: 0.5 }}>
              {items.length}
            </Typography>
          </Box>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(auto-fill, minmax(280px, 1fr))',
              md: 'repeat(auto-fill, minmax(300px, 1fr))',
            },
            gap: 1.5,
          }}>
            {items.map((skill, index) => {
              const autoInfo = skill.automationTaskType ? automationMap[skill.automationTaskType] : undefined;
              const hasAutomation = !!autoInfo;
              const isRunning = skill.automationTaskType ? runningTaskTypes.has(skill.automationTaskType) : false;
              const isTriggering = skill.automationTaskType ? triggeringTypes.has(skill.automationTaskType) : false;

              return (
                <Card
                  key={index}
                  elevation={0}
                  sx={{
                    border: '1px solid #E5E7EB',
                    borderRadius: 2,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                    ...(isRunning ? {
                      borderColor: '#2563EB60',
                      boxShadow: '0 0 0 1px #2563EB20',
                    } : hasAutomation ? {
                      borderColor: '#05966940',
                    } : {}),
                    '&:hover': {
                      borderColor: hasAutomation ? '#059669' : '#D1D5DB',
                      backgroundColor: '#FAFAFA',
                      '& .arrow-icon': { opacity: 1, transform: 'translateX(0)' },
                    },
                  }}
                  onClick={() => setDetailSkill(skill)}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1.5,
                      backgroundColor: categoryColors[skill.category].bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: categoryColors[skill.category].color,
                      position: 'relative',
                    }}>
                      {skill.icon}
                      {hasAutomation && (
                        <Box sx={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: isRunning ? '#2563EB' : '#059669',
                          border: '2px solid #fff',
                          ...(isRunning ? { animation: 'pulse-dot 1.2s ease-in-out infinite' } : {}),
                        }} />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 600, color: '#111827', fontSize: '0.8125rem' }}>
                          {skill.name}
                        </Typography>
                        {skill.shortcut && (
                          <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', ml: 0.5 }}>
                            {skill.shortcut}
                          </Typography>
                        )}
                        {renderStatusBadge(skill)}
                      </Box>
                      <Typography sx={{ color: '#6B7280', fontSize: '0.7rem', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {skill.desc}
                      </Typography>
                      {/* 触发词 */}
                      {skill.trigger && (
                        <Typography sx={{ fontSize: '0.6rem', color: '#B0B0B0', mt: 0.25, fontStyle: 'italic' }}>
                          {skill.trigger}
                        </Typography>
                      )}
                      {/* 最近执行状态 */}
                      {renderLatestExec(skill)}
                    </Box>
                    {/* 一键触发 or 导航箭头 */}
                    {hasAutomation ? (
                      <Tooltip title={isRunning ? '执行中...' : '立即执行'}>
                        <IconButton
                          size="small"
                          onClick={(e) => handleTriggerAutomation(skill, e)}
                          disabled={isRunning || isTriggering}
                          sx={{
                            flexShrink: 0,
                            width: 28,
                            height: 28,
                            color: isRunning ? '#2563EB' : '#059669',
                            '&:hover': { backgroundColor: '#ECFDF5' },
                          }}
                        >
                          {isRunning || isTriggering ? (
                            <CircularProgress size={14} sx={{ color: '#2563EB' }} />
                          ) : (
                            <PlayArrowIcon sx={{ fontSize: 16 }} />
                          )}
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <ArrowForwardIcon
                        className="arrow-icon"
                        sx={{ fontSize: 16, color: '#9CA3AF', opacity: 0, transform: 'translateX(-4px)', transition: 'all 0.15s ease', flexShrink: 0 }}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </Box>
          <Divider sx={{ mt: 2.5 }} />
        </Box>
      ))}

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

      {/* 技能详情 Drawer */}
      <Drawer
        anchor="right"
        open={!!detailSkill}
        onClose={() => setDetailSkill(null)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 400 }, p: 0 },
        }}
      >
        {detailSkill && (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 头部 */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{
                  width: 44, height: 44, borderRadius: 2,
                  backgroundColor: categoryColors[detailSkill.category].bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: categoryColors[detailSkill.category].color,
                }}>
                  {detailSkill.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                    {detailSkill.name}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Chip
                      label={categoryLabels[detailSkill.category]}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        fontWeight: 500,
                        backgroundColor: categoryColors[detailSkill.category].bg,
                        color: categoryColors[detailSkill.category].color,
                      }}
                    />
                    {detailSkill.version && (
                      <Typography sx={{ fontSize: '0.6rem', color: '#9CA3AF' }}>
                        v{detailSkill.version}
                      </Typography>
                    )}
                    {detailSkill.status === 'active' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <CheckCircleIcon sx={{ fontSize: 10, color: '#059669' }} />
                        <Typography sx={{ fontSize: '0.6rem', color: '#059669' }}>运行中</Typography>
                      </Box>
                    )}
                    {detailSkill.status === 'available' && (
                      <Typography sx={{ fontSize: '0.6rem', color: '#2563EB' }}>可用</Typography>
                    )}
                  </Box>
                </Box>
              </Box>
              <IconButton size="small" onClick={() => setDetailSkill(null)} sx={{ color: '#9CA3AF' }}>
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* 详细描述 */}
            <Typography sx={{ fontSize: '0.8125rem', color: '#374151', lineHeight: 1.7, mb: 2 }}>
              {detailSkill.detail || detailSkill.desc}
            </Typography>

            {/* 触发词 */}
            {detailSkill.trigger && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                  触发方式
                </Typography>
                <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: 1, backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#374151', fontFamily: 'monospace' }}>
                    {detailSkill.trigger}
                  </Typography>
                </Paper>
              </Box>
            )}

            {/* 关联自动化 */}
            {detailSkill.automationTaskType && (() => {
              const autoInfo = automationMap[detailSkill.automationTaskType];
              const exec = latestExecByType[detailSkill.automationTaskType];
              return (
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                    关联自动化
                  </Typography>
                  <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: 1, backgroundColor: autoInfo ? '#ECFDF5' : '#F9FAFB', border: `1px solid ${autoInfo ? '#05966930' : '#E5E7EB'}` }}>
                    {autoInfo ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#059669' }}>
                            {autoInfo.name}
                          </Typography>
                          <Typography sx={{ fontSize: '0.65rem', color: '#6B7280' }}>
                            状态: {autoInfo.active ? '运行中' : '已暂停'}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<BoltIcon sx={{ fontSize: 14 }} />}
                          onClick={(e) => { e.stopPropagation(); handleTriggerAutomation(detailSkill, e as any); }}
                          disabled={runningTaskTypes.has(detailSkill.automationTaskType!) || triggeringTypes.has(detailSkill.automationTaskType!)}
                          sx={{
                            fontSize: '0.7rem',
                            textTransform: 'none',
                            borderColor: '#059669',
                            color: '#059669',
                            '&:hover': { borderColor: '#047857', backgroundColor: '#ECFDF5' },
                          }}
                        >
                          {runningTaskTypes.has(detailSkill.automationTaskType!) ? '执行中...' : '立即执行'}
                        </Button>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                        未配置自动化任务
                      </Typography>
                    )}
                    {exec && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        {exec.status === 'success' ? <CheckCircleIcon sx={{ fontSize: 12, color: '#059669' }} /> : <ErrorOutlineIcon sx={{ fontSize: 12, color: '#DC2626' }} />}
                        <Typography sx={{ fontSize: '0.65rem', color: '#6B7280' }}>
                          最近: {exec.status === 'success' ? '成功' : '失败'}
                          {exec.completedAt ? ` · ${new Date(exec.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                </Box>
              );
            })()}

            {/* 标签 */}
            {detailSkill.tags && detailSkill.tags.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                  标签
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {detailSkill.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      sx={{ height: 22, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* 底部操作 */}
            <Box sx={{ mt: 'auto', pt: 2 }}>
              <Divider sx={{ mb: 2 }} />
              <Button
                fullWidth
                variant="contained"
                startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                onClick={() => { handleExecute(detailSkill); setDetailSkill(null); }}
                sx={{
                  backgroundColor: '#111827',
                  '&:hover': { backgroundColor: '#374151' },
                  textTransform: 'none',
                  borderRadius: 2,
                  py: 1,
                  fontSize: '0.8125rem',
                }}
              >
                打开 {detailSkill.name}
              </Button>
            </Box>
          </Box>
        )}
      </Drawer>

      {/* 执行结果 Toast */}
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

export default SkillsPage;
