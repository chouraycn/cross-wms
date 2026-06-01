import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Divider, TextField, InputAdornment, Chip, Card, CardContent, IconButton, Tooltip, Badge, CircularProgress, Snackbar, Alert } from '@mui/material';
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
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { loadAutomations, automationEngine } from '../services/automationEngine';
import type { TaskType, AutomationExecution, EngineStateEvent } from '../services/automationEngine';

interface Skill {
  name: string;
  desc: string;
  icon: React.ReactNode;
  category: 'warehouse' | 'logistics' | 'analysis' | 'system';
  path: string;
  shortcut?: string;
  /** 关联的自动化任务类型，用于显示"已配置"状态 */
  automationTaskType?: TaskType;
  /** 技能标签 */
  tags?: string[];
  /** 技能状态: configured=已配置可用, available=可用未配置, coming=即将上线 */
  status?: 'configured' | 'available' | 'coming';
}

const skills: Skill[] = [
  {
    name: '仓库管理',
    desc: '仓储规划、库位优化、库存调配、多仓切换与容积率监控',
    icon: <WarehouseIcon sx={{ fontSize: 22 }} />,
    category: 'warehouse',
    path: '/warehouses',
    tags: ['核心功能', '仓库'],
    status: 'configured',
  },
  {
    name: '在途跟踪',
    desc: '物流追踪、时效分析、异常预警、运单管理与交期预测',
    icon: <LocalShippingIcon sx={{ fontSize: 22 }} />,
    category: 'logistics',
    path: '/in-transit',
    tags: ['物流', '追踪'],
    status: 'configured',
  },
  {
    name: '库龄分析',
    desc: '库龄预警、滞销处理、周转优化与保质期管理',
    icon: <InventoryIcon sx={{ fontSize: 22 }} />,
    category: 'analysis',
    path: '/inventory',
    tags: ['库存', '预警'],
    status: 'configured',
  },
  {
    name: '容积率优化',
    desc: '容积计算、预警设置、满仓方案与件数上限分析',
    icon: <AssessmentIcon sx={{ fontSize: 22 }} />,
    category: 'warehouse',
    path: '/',
    tags: ['仓库', '优化'],
    automationTaskType: 'volume-alert',
    status: 'configured',
  },
  {
    name: '腾讯文档',
    desc: '在线文档管理、API 授权、数据同步与自动更新',
    icon: <DescriptionIcon sx={{ fontSize: 22 }} />,
    category: 'logistics',
    path: '/tencent-docs',
    tags: ['文档', '同步'],
    automationTaskType: 'data-sync',
    status: 'configured',
  },
  {
    name: '报表生成',
    desc: '自定义报表、数据导出、CSV 导出与定期生成',
    icon: <BarChartIcon sx={{ fontSize: 22 }} />,
    category: 'analysis',
    path: '/reports',
    tags: ['报表', '导出'],
    automationTaskType: 'report-gen',
    status: 'configured',
  },
  {
    name: '智能助手',
    desc: 'AI 对话、数据查询、操作指引与自然语言交互',
    icon: <ChatIcon sx={{ fontSize: 22 }} />,
    category: 'system',
    path: '/agent',
    tags: ['AI', '对话'],
    status: 'configured',
  },
  {
    name: '数据分析',
    desc: '趋势预测、异常检测、决策建议与智能洞察',
    icon: <AnalyticsIcon sx={{ fontSize: 22 }} />,
    category: 'analysis',
    path: '/',
    tags: ['分析', '智能'],
    status: 'available',
  },
  {
    name: '自动化调度',
    desc: '周期执行、一次性任务、有效期管理与执行历史',
    icon: <BoltIcon sx={{ fontSize: 22 }} />,
    category: 'system',
    path: '/automation',
    tags: ['自动化', '调度'],
    status: 'configured',
  },
  {
    name: 'Agent 应用',
    desc: '对话式 AI 助手、知识库问答与智能工作流',
    icon: <SmartToyIcon sx={{ fontSize: 22 }} />,
    category: 'system',
    path: '/agent',
    tags: ['AI', 'Agent'],
    status: 'configured',
  },
  {
    name: '指标控制',
    desc: '仪表盘参数调整、模块显隐、热力图与数据源配置',
    icon: <TuneIcon sx={{ fontSize: 22 }} />,
    category: 'system',
    path: '/',
    shortcut: '设置 > 指标控制',
    tags: ['设置', '仪表盘'],
    status: 'configured',
  },
  {
    name: '仪表盘总览',
    desc: 'KPI 监控、仓库热力图、趋势分析与全局概览',
    icon: <DashboardIcon sx={{ fontSize: 22 }} />,
    category: 'warehouse',
    path: '/',
    tags: ['仪表盘', '概览'],
    status: 'configured',
  },
];

const categoryLabels: Record<string, string> = {
  warehouse: '仓库管理',
  logistics: '物流追踪',
  analysis: '数据分析',
  system: '系统工具',
};

const categoryColors: Record<string, { bg: string; color: string }> = {
  warehouse: { bg: '#EFF6FF', color: '#2563EB' },
  logistics: { bg: '#F0FDF4', color: '#16A34A' },
  analysis: { bg: '#FAF5FF', color: '#7C3AED' },
  system: { bg: '#FFF7ED', color: '#EA580C' },
};

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

  // ---- 响应式自动化状态 ----
  const [automationVersion, setAutomationVersion] = useState(0);
  const [runningTaskTypes, setRunningTaskTypes] = useState<Set<TaskType>>(new Set());
  const [latestExecByType, setLatestExecByType] = useState<Record<string, AutomationExecution | null>>({});
  const [triggeringTypes, setTriggeringTypes] = useState<Set<TaskType>>(new Set());
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' | 'info' }>({ open: false, msg: '', severity: 'info' });

  // 构建 automationMap（响应式，随 automationVersion 刷新）
  const automationMap = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = automationVersion; // 依赖此 state 驱动重算
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
    // 初始加载最新执行记录
    refreshLatestExec();

    const unsubscribe = automationEngine.onStateChange((event: EngineStateEvent) => {
      // 任何状态变更都刷新 automationMap
      setAutomationVersion((v) => v + 1);

      if (event.type === 'execution-start') {
        // 找到对应 taskType 标记为 running
        const auto = loadAutomations().find((a) => a.id === event.automationId);
        if (auto) {
          setRunningTaskTypes((prev) => new Set(prev).add(auto.taskType));
        }
      } else {
        // execution-complete / execution-failed / state-refresh
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
        // 刷新最新执行记录
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
    e.stopPropagation(); // 阻止卡片点击导航
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
        (skill.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  // 按类别分组
  const grouped = filteredSkills.reduce<Record<string, Skill[]>>((acc, skill) => {
    if (!acc[skill.category]) acc[skill.category] = [];
    acc[skill.category].push(skill);
    return acc;
  }, {});

  // 执行技能 — 导航到对应页面
  const handleExecute = (skill: Skill) => {
    // 记录最近使用
    const updated = [skill, ...recentSkills.filter(s => s.name !== skill.name)].slice(0, 6);
    setRecentSkills(updated);
    try { localStorage.setItem('crosswms-recent-skills', JSON.stringify(updated)); } catch { /* ignore */ }
    navigate(skill.path);
  };

  // 渲染技能状态标识
  const renderStatusBadge = (skill: Skill) => {
    if (skill.automationTaskType && automationMap[skill.automationTaskType]) {
      return (
        <Chip
          icon={<PlayArrowIcon sx={{ fontSize: 12 }} />}
          label="自动化"
          size="small"
          sx={{
            height: 18,
            fontSize: '0.6rem',
            fontWeight: 500,
            backgroundColor: '#ECFDF5',
            color: '#059669',
            ml: 0.5,
          }}
        />
      );
    }
    if (skill.status === 'coming') {
      return (
        <Chip
          label="即将上线"
          size="small"
          sx={{
            height: 18,
            fontSize: '0.6rem',
            fontWeight: 500,
            backgroundColor: '#FEF3C7',
            color: '#D97706',
            ml: 0.5,
          }}
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

  return (
    <Box className="page-fade-in">
      {/* 页面标题 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
          技能中心
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
          选择技能快速跳转到对应功能模块，已配置自动化的技能可直接查看执行状态
        </Typography>
      </Box>

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
                icon={<Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5, color: categoryColors[skill.category].color }}>{skill.icon}</Box>}
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
          placeholder="搜索技能..."
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
          {Object.entries(categoryLabels).map(([key, label]) => (
            <Chip
              key={key}
              label={label}
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
      {Object.entries(grouped).map(([category, items]) => (
        <Box key={category} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
            {categoryLabels[category]}
          </Typography>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(auto-fill, minmax(260px, 1fr))',
              md: 'repeat(auto-fill, minmax(280px, 1fr))',
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
                  onClick={() => handleExecute(skill)}
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
                      {/* 最近执行状态 */}
                      {renderLatestExec(skill)}
                      {/* 标签行 */}
                      {skill.tags && skill.tags.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                          {skill.tags.slice(0, 3).map((tag) => (
                            <Typography
                              key={tag}
                              sx={{
                                fontSize: '0.6rem',
                                color: '#9CA3AF',
                                backgroundColor: '#F9FAFB',
                                px: 0.5,
                                py: 0,
                                borderRadius: 0.5,
                                lineHeight: 1.4,
                              }}
                            >
                              {tag}
                            </Typography>
                          ))}
                        </Box>
                      )}
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
