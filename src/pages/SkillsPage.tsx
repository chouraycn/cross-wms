import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Divider, TextField, InputAdornment, Chip, Card, CardContent, IconButton, Tooltip } from '@mui/material';
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
import ScheduleIcon from '@mui/icons-material/Schedule';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TuneIcon from '@mui/icons-material/Tune';
import DashboardIcon from '@mui/icons-material/Dashboard';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAppSettings } from '../contexts/AppSettingsContext';

interface Skill {
  name: string;
  desc: string;
  icon: React.ReactNode;
  category: 'warehouse' | 'logistics' | 'analysis' | 'system';
  path: string;
  shortcut?: string;
}

const skills: Skill[] = [
  { name: '仓库管理', desc: '仓储规划、库位优化、库存调配、容积率监控', icon: <WarehouseIcon sx={{ fontSize: 22 }} />, category: 'warehouse', path: '/warehouses' },
  { name: '在途跟踪', desc: '物流追踪、时效分析、异常预警、运单管理', icon: <LocalShippingIcon sx={{ fontSize: 22 }} />, category: 'logistics', path: '/in-transit' },
  { name: '库龄分析', desc: '库龄预警、滞销处理、周转优化、保质期管理', icon: <InventoryIcon sx={{ fontSize: 22 }} />, category: 'analysis', path: '/inventory' },
  { name: '容积率优化', desc: '容积计算、预警设置、满仓方案、件数上限', icon: <AssessmentIcon sx={{ fontSize: 22 }} />, category: 'warehouse', path: '/' },
  { name: '腾讯文档', desc: '在线文档管理、API 授权、数据同步', icon: <DescriptionIcon sx={{ fontSize: 22 }} />, category: 'logistics', path: '/tencent-docs' },
  { name: '报表生成', desc: '自定义报表、数据导出、CSV 导出', icon: <BarChartIcon sx={{ fontSize: 22 }} />, category: 'analysis', path: '/reports' },
  { name: '智能助手', desc: 'AI 对话、数据查询、操作指引', icon: <ChatIcon sx={{ fontSize: 22 }} />, category: 'system', path: '/agent' },
  { name: '数据分析', desc: '趋势预测、异常检测、决策建议', icon: <AnalyticsIcon sx={{ fontSize: 22 }} />, category: 'analysis', path: '/' },
  { name: '定时任务', desc: '自动化调度、周期执行、任务管理', icon: <ScheduleIcon sx={{ fontSize: 22 }} />, category: 'system', path: '/automation' },
  { name: 'Agent 应用', desc: '对话式 AI 助手、知识库问答', icon: <SmartToyIcon sx={{ fontSize: 22 }} />, category: 'system', path: '/agent' },
  { name: '指标控制', desc: '仪表盘参数调整、模块显隐、热力图配置', icon: <TuneIcon sx={{ fontSize: 22 }} />, category: 'system', path: '/', shortcut: '设置 > 指标控制' },
  { name: '仪表盘总览', desc: 'KPI 监控、仓库热力图、趋势分析', icon: <DashboardIcon sx={{ fontSize: 22 }} />, category: 'warehouse', path: '/' },
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

  // 过滤技能
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = searchQuery === '' ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.desc.toLowerCase().includes(searchQuery.toLowerCase());
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
    const updated = [skill, ...recentSkills.filter(s => s.name !== skill.name)].slice(0, 4);
    setRecentSkills(updated);
    try { localStorage.setItem('crosswms-recent-skills', JSON.stringify(updated)); } catch { /* ignore */ }
    navigate(skill.path);
  };

  return (
    <Box className="page-fade-in">
      {/* 页面标题 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
          技能中心
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
          选择技能快速跳转到对应功能模块
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
            {items.map((skill, index) => (
              <Card
                key={index}
                elevation={0}
                sx={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 2,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    borderColor: '#D1D5DB',
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
                  }}>
                    {skill.icon}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 600, color: '#111827', fontSize: '0.8125rem' }}>
                        {skill.name}
                      </Typography>
                      {skill.shortcut && (
                        <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', ml: 0.5 }}>
                          {skill.shortcut}
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ color: '#6B7280', fontSize: '0.7rem', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {skill.desc}
                    </Typography>
                  </Box>
                  <ArrowForwardIcon
                    className="arrow-icon"
                    sx={{ fontSize: 16, color: '#9CA3AF', opacity: 0, transform: 'translateX(-4px)', transition: 'all 0.15s ease', flexShrink: 0 }}
                  />
                </CardContent>
              </Card>
            ))}
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
    </Box>
  );
};

export default SkillsPage;
